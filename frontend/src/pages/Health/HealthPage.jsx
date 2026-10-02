import React, { useEffect, useState } from "react";
import { api } from "../../api/apiClient";
import { fmtBytes, findDuplicates } from "./healthUtils";
import FetchUrlSection from "./FetchUrlSection";
import BackfillSection from "./BackfillSection";
import DuplicatesTab from "./DuplicatesTab";
import AuditTab from "./AuditTab";

export default function Health() {
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState(null);
  const [recon, setRecon] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [reconBusy, setReconBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealing, setRevealing] = useState(null);
  const [pruning, setPruning] = useState(false);

  // Fetch-from-URL state
  const [fetchUrl, setFetchUrl] = useState("");
  const [fetchRes, setFetchRes] = useState("480m");
  const [fetchJob, setFetchJob] = useState(null);

  // Performer backfill state
  const [backfill, setBackfill] = useState(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillPhotos, setBackfillPhotos] = useState(true);
  const [backfillFilenames, setBackfillFilenames] = useState(true);

  // Duplicate Video Detector state
  const [activeTab, setActiveTab] = useState("integrity");
  const [dupClusters, setDupClusters] = useState([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupScanned, setDupScanned] = useState(false);
  const [dupMsg, setDupMsg] = useState(null);

  const startFetch = async () => {
    const url = fetchUrl.trim();
    if (!url) return;
    setError("");
    setFetchJob({ state: "queued", bytes: 0, total: null, url });
    try {
      const res = await api.libraryFetch(url, fetchRes);
      if (res.error) throw new Error(res.error);
      pollFetch(res.job_id);
    } catch (e) {
      setFetchJob({ state: "error", message: String(e.message || e) });
    }
  };

  const pollFetch = async (jobId) => {
    try {
      const st = await api.libraryFetchStatus(jobId);
      if (st.error) throw new Error(st.error);
      setFetchJob(st);
      if (st.state === "queued" || st.state === "downloading") {
        setTimeout(() => pollFetch(jobId), 2000);
      } else if (st.state === "done") {
        load();
      }
    } catch (e) {
      setFetchJob((prev) => ({ ...(prev || {}), state: "error", message: String(e.message || e) }));
    }
  };

  const previewBackfill = async () => {
    setBackfillBusy(true);
    setError("");
    try {
      setBackfill(await api.libraryBackfillPreview(backfillPhotos, backfillFilenames));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBackfillBusy(false);
    }
  };

  const applyBackfill = async () => {
    const plan = backfill?.plan || [];
    const n = plan.filter((p) => p.verified).length;
    const fn = (backfill?.filename_plan || []).length;
    if (!window.confirm(`Link ${n} verified performer(s)${fn ? ` across ${fn} filename-parsed scenes` : ""}?\n\nNew performer rows are created (name + page link, no photo), and scene performer links are set. Unverifiable names are skipped, never guessed.`))
      return;
    setBackfillBusy(true);
    setError("");
    try {
      const res = await api.libraryBackfillApply(backfillPhotos, backfillFilenames);
      if (res.error) throw new Error(res.error);
      const poll = async () => {
        try {
          const st = await api.libraryFetchStatus(res.job_id);
          setBackfill(st);
          if (st.state === "queued" || st.state === "downloading") {
            setTimeout(poll, 2500);
          } else if (st.state === "done") {
            load();
          }
        } catch (e) {
          setError(String(e.message || e));
        }
      };
      setBackfill({ state: "queued", message: "backfill runningâ€¦" });
      poll();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBackfillBusy(false);
    }
  };

  const runDuplicateScan = async () => {
    setDupLoading(true);
    setDupMsg("Cataloging scenes for deep duration & signature matching...");
    try {
      const res = await api.scenes({ limit: 500 });
      const allScenes = res.scenes || [];
      setDupMsg(`Analyzing ${allScenes.length} videos across duration, byte size & titles...`);
      const clusters = findDuplicates(allScenes);
      setDupClusters(clusters);
      setDupScanned(true);
      setDupMsg(null);
    } catch (e) {
      console.error("Duplicate scan error:", e);
      setDupMsg("Scan failed: " + (e.message || e));
    } finally {
      setDupLoading(false);
    }
  };

  const handleDeleteDuplicate = async (sceneId, clusterId) => {
    if (!window.confirm("Delete this duplicate scene record from library?\nThis removes the database entry.")) return;
    try {
      await api.deleteScene(sceneId);
      setDupClusters((prev) =>
        prev
          .map((cl) => {
            if (cl.id !== clusterId) return cl;
            const filtered = cl.items.filter((item) => item._id !== sceneId);
            return {
              ...cl,
              items: filtered,
              potentialSavingsBytes:
                filtered.length > 1
                  ? filtered.reduce((s, x) => s + (x.size_bytes || 0), 0) - (filtered[0].size_bytes || 0)
                  : 0,
            };
          })
          .filter((cl) => cl.items.length > 1)
      );
    } catch (e) {
      console.error("Delete duplicate error:", e);
      alert("Could not delete scene: " + (e.message || e));
    }
  };

  const load = () => {
    api
      .libraryStats()
      .then(setStats)
      .catch((e) => setError(String(e.message || e)));
    api
      .libraryAudit()
      .then(setAudit)
      .catch(() => setAudit(null));
  };

  useEffect(() => {
    load();
  }, []);

  const scan = () => {
    setScanning(true);
    setError("");
    api
      .libraryScan()
      .then((res) => {
        setStats((prev) => ({ ...(prev || {}), ...res }));
        return load();
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setScanning(false));
  };

  const previewRepair = () => {
    setReconBusy(true);
    setError("");
    api
      .libraryReconcile(true)
      .then(setRecon)
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setReconBusy(false));
  };

  const applyRepair = () => {
    const r = recon;
    const n =
      (r?.would_relink || 0) +
      (r?.would_adopt || 0) +
      (r?.would_normalize || 0) +
      (r?.would_update_studio || 0) +
      (r?.would_update_performers || 0) +
      (r?.would_create || 0);
    if (
      !window.confirm(
        `Apply data repair?\n\n${n} change(s): relink ${r?.would_relink || 0}, adopt ${
          r?.would_adopt || 0
        }, normalize ${r?.would_normalize || 0}, studio cache ${
          r?.would_update_studio || 0
        }, performer cache ${r?.would_update_performers || 0}, create ${
          r?.would_create || 0
        }.\n\nRuns in one transaction (rolls back on failure). Files on disk are never modified.`
      )
    )
      return;
    setReconBusy(true);
    setError("");
    api
      .libraryReconcile(false)
      .then((res) => {
        setRecon(res);
        return load();
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setReconBusy(false));
  };

  const reveal = async (body, key) => {
    setRevealing(key);
    try {
      await api.libraryReveal(body);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setRevealing(null);
    }
  };

  const prune = async (ids) => {
    const what = ids ? `scene ${ids[0]}` : `all ${stats?.missing || 0} missing scenes`;
    if (
      !window.confirm(
        `Remove ${what} from the library?\n\nThis deletes their tracking, chapters, comments, playlist entries and favorites. The files are already gone from disk â€” only database rows are removed.`
      )
    )
      return;
    setPruning(true);
    setError("");
    try {
      const res = await api.libraryPrune(ids);
      setError("");
      await load();
      return res;
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setPruning(false);
    }
  };

  const cards = [
    ["Scenes", stats ? stats.scenes : "â€¦", !stats || (stats.scenes || 0) > 0],
    ["Files on disk", stats ? stats.filesOnDisk : "â€¦", true],
    ["Missing files", stats ? stats.missing : "â€¦", !stats || stats.missing === 0],
    ["Size drift", stats ? stats.sizeDriftCount ?? "â€¦" : "â€¦", !stats || (stats.sizeDriftCount || 0) === 0],
    ["mtime drift", stats ? stats.mtimeDriftCount ?? "â€¦" : "â€¦", !stats || (stats.mtimeDriftCount || 0) === 0],
    ["Thumbs missing", stats ? stats.thumbnailsMissing ?? "â€¦" : "â€¦", !stats || (stats.thumbnailsMissing || 0) === 0],
  ];

  return (
    <div className="h-full bg-[#070708] pt-6 px-10 overflow-y-auto select-none custom-scrollbar">
      <div className="max-w-5xl pb-16 mx-auto">
        {/* Header Ribbon */}
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <h1 className="font-display uppercase tracking-[0.2em] text-2xl font-black text-white">
                Library Health
              </h1>
            </div>
            <p className="text-xs text-zinc-500 font-mono truncate max-w-xl">
              {stats ? stats.libraryRoot : "Inspecting root..."}
            </p>
            {stats && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono mt-1.5">
                <span className="text-zinc-200 font-bold">{fmtBytes(stats.totalBytes)}</span>
                <span className="text-zinc-600">Â·</span>
                <span>last scan {stats.lastScan || "never"}</span>
                {stats.duration_ms && (
                  <>
                    <span className="text-zinc-600">Â·</span>
                    <span>{stats.duration_ms} ms</span>
                  </>
                )}
                {scanning && <span className="text-accent animate-pulse">Â· scanning disk...</span>}
              </div>
            )}
          </div>

          {/* Action Header Buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => reveal({}, "root")}
              disabled={revealing === "root"}
              className="bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl border border-white/10 font-bold uppercase tracking-wider text-xs backdrop-blur-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {revealing === "root" ? "Openingâ€¦" : "Open Folder"}
            </button>
            <button
              onClick={scan}
              disabled={scanning}
              className="relative inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent hover:brightness-110 text-white font-bold text-xs uppercase tracking-widest shadow-[0_0_20px_var(--color-accent)] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {scanning ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Scanningâ€¦</span>
                </>
              ) : (
                <span>Scan Library</span>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-4 py-3 shadow-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="font-mono">{error}</span>
          </div>
        )}

        {/* Fetch from URL */}
        <FetchUrlSection
          fetchUrl={fetchUrl}
          setFetchUrl={setFetchUrl}
          fetchRes={fetchRes}
          setFetchRes={setFetchRes}
          fetchJob={fetchJob}
          onStartFetch={startFetch}
        />

        {/* Performer backfill */}
        <BackfillSection
          backfill={backfill}
          backfillBusy={backfillBusy}
          backfillPhotos={backfillPhotos}
          setBackfillPhotos={setBackfillPhotos}
          backfillFilenames={backfillFilenames}
          setBackfillFilenames={setBackfillFilenames}
          onPreviewBackfill={previewBackfill}
          onApplyBackfill={applyBackfill}
        />

        {/* Primary Health Tabs */}
        <div className="flex items-center gap-2 mb-8 p-1.5 rounded-2xl bg-zinc-950/80 border border-white/10 w-fit backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActiveTab("integrity")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "integrity"
                ? "bg-accent text-zinc-950 shadow-md shadow-accent/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span>Library Integrity</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("duplicates");
              if (!dupScanned && !dupLoading) runDuplicateScan();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "duplicates"
                ? "bg-accent text-zinc-950 shadow-md shadow-accent/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Duplicate & Clones Detector</span>
            {dupClusters.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-mono font-bold">
                {dupClusters.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === "integrity" ? (
          <AuditTab
            stats={stats}
            cards={cards}
            audit={audit}
            recon={recon}
            reconBusy={reconBusy}
            onPreviewRepair={previewRepair}
            onApplyRepair={applyRepair}
            pruning={pruning}
            onPrune={prune}
            revealing={revealing}
            onReveal={reveal}
          />
        ) : (
          <DuplicatesTab
            dupClusters={dupClusters}
            dupLoading={dupLoading}
            dupScanned={dupScanned}
            dupMsg={dupMsg}
            onRunScan={runDuplicateScan}
            onDeleteDuplicate={handleDeleteDuplicate}
            onReveal={reveal}
            revealing={revealing}
          />
        )}
      </div>
    </div>
  );
}
