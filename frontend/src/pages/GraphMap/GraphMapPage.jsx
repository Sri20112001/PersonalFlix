import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/apiClient";
import { thumbUrl } from "../../utilities/media";
import Spinner from "../../components/Spinner";
import YtMapBar from "./GraphToolbar";
import GraphInspector from "./GraphInspector";
import "./graph-uiverse.css";

// ---------------------------------------------------------------------------
// ytmap.space-style scene map: every scene is a thumbnail tile clustered by
// studio into organic "islands" on an infinite black canvas. Tiles are tiny
// color dots from far away and resolve into real thumbnails as you zoom in.
// Bottom glass pill = home / search / random. Top-right card = counts +
// hovered/selected preview. Click a tile for the full inspector.
// ---------------------------------------------------------------------------

const TILE = 12; // world-unit tile edge
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Thumbnail image cache (one Image per scene, lazy).
const imageCache = new Map();
function getCachedImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const img = new Image();
  img.src = url;
  imageCache.set(url, img);
  return img;
}

// Deterministic 0..1 hash for stable organic jitter.
function hash01(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Studio-clustered island layout: studios sorted big-first, centers on a
// golden-angle spiral, scenes packed sunflower-style inside each island.
function layoutTiles(scenes) {
  const groups = new Map();

  for (const s of scenes) {
    const key =
      s.studio_id ||
      s.studio ||
      "__unknown__";

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(s);
  }

  const ordered = [...groups.values()]
    .sort((a, b) => b.length - a.length);

  const tiles = [];

  ordered.forEach((members, gi) => {
    const baseRadius = 145;

    const angle =
      gi * GOLDEN_ANGLE +
      hash01(`studio:${gi}`) * 0.45;

    const distance =
      baseRadius *
      Math.sqrt(gi + 0.7);

    const cx =
      Math.cos(angle) *
      distance;

    const cy =
      Math.sin(angle) *
      distance *
      0.78;

    const islandR =
      12 * Math.sqrt(members.length) +
      22;

    members.forEach((s, i) => {
      const angleOffset =
        hash01(`${s.id}:angle`) * 0.7;

      const a =
        i * GOLDEN_ANGLE +
        angleOffset;

      const radialNoise =
        0.82 +
        hash01(`${s.id}:radius`) * 0.36;

      const rr =
        Math.min(
          10.5 * Math.sqrt(i + 0.5) * radialNoise,
          islandR
        );

      const jitter =
        4 +
        Math.min(
          10,
          Math.sqrt(members.length)
        );

      const jx =
        (hash01(`${s.id}:x`) - 0.5) *
        jitter;

      const jy =
        (hash01(`${s.id}:y`) - 0.5) *
        jitter;

      const hue = Math.floor(
        hash01(
          s.studio_id ||
          s.studio ||
          s.id
        ) * 360
      );

      tiles.push({
        ...s,

        x:
          cx +
          Math.cos(a) * rr +
          jx,

        y:
          cy +
          Math.sin(a) * rr +
          jy,

        hue,

        thumb: thumbUrl(s.raw_id),
      });
    });
  });

  return tiles;
}

export default function GraphMap() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalScenes, setTotalScenes] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const transformRef = useRef({ x: 0, y: 0, k: 0.8 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const tilesRef = useRef([]);
  const hoverRef = useRef(null);
  const selectedRef = useRef(null);
  const matchRef = useRef(new Set());
  const didFitRef = useRef(false);

  // -- data ---------------------------------------------------------------
  useEffect(() => {
    setLoading(true);
    api
      .graph()
      .then((data) => {
        const scenes = (data.nodes || []).filter((n) => n.type === "scene");
        setTotalScenes(scenes.length);
        const laid = layoutTiles(scenes);
        tilesRef.current = laid;
        setTiles(laid);
      })
      .catch((err) => console.error("Failed to load graph data", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    hoverRef.current = hovered;
  }, [hovered]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // -- search ---------------------------------------------------------------
  const query = searchQuery.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return tilesRef.current
      .filter((t) => (t.name || "").toLowerCase().includes(query))
      .slice(0, 8);
  }, [query, tiles]);

  useEffect(() => {
    matchRef.current =
      query.length === 0
        ? new Set()
        : new Set(
            tilesRef.current
              .filter((t) => (t.name || "").toLowerCase().includes(query))
              .map((t) => t.id)
          );
  }, [query, tiles]);

  // -- camera ---------------------------------------------------------------
  const fitView = useCallback(() => {
    const list = tilesRef.current;
    if (list.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const t of list) {
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    const gw = maxX - minX + 120;
    const gh = maxY - minY + 120;
    const k = Math.min(1.6, Math.max(0.12, Math.min(width / gw, height / gh)));
    transformRef.current = {
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
      k,
    };
  }, []);

  useEffect(() => {
    if (!didFitRef.current && tiles.length > 0) {
      didFitRef.current = true;
      // Wait a tick so the canvas has real dimensions.
      requestAnimationFrame(fitView);
    }
  }, [tiles, fitView]);

  const zoomToTile = useCallback((tile, targetK = 3) => {
    const canvas = canvasRef.current;
    if (!canvas || !tile) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    transformRef.current = {
      x: width / 2 - tile.x * targetK,
      y: height / 2 - tile.y * targetK,
      k: targetK,
    };
    setSelected(tile);
  }, []);

  const goRandom = useCallback(() => {
    const list = tilesRef.current;
    if (list.length === 0) return;
    const tile = list[Math.floor(Math.random() * list.length)];
    zoomToTile(tile, 2.6);
  }, [zoomToTile]);

  const submitSearch = useCallback(() => {
    if (matches.length > 0) zoomToTile(matches[0], 2.6);
  }, [matches, zoomToTile]);

  // -- canvas render loop ----------------------------------------------------
const draw = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const dpr = window.devicePixelRatio || 1;

  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);

  const { x, y, k } = transformRef.current;

  // -------------------------------------------------------------------------
  // Background
  // -------------------------------------------------------------------------

  const background = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0,
    width * 0.5,
    height * 0.42,
    Math.max(width, height) * 0.75
  );

  background.addColorStop(0, "#0b0b0d");
  background.addColorStop(0.5, "#050506");
  background.addColorStop(1, "#000000");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // -------------------------------------------------------------------------
  // World bounds
  // -------------------------------------------------------------------------

  const m = TILE * 4;

  const wx0 = (-x) / k - m;
  const wy0 = (-y) / k - m;
  const wx1 = (width - x) / k + m;
  const wy1 = (height - y) / k + m;

  // -------------------------------------------------------------------------
  // Subtle infinite grid
  // -------------------------------------------------------------------------

  const gridSize = 80;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);

  const startX = Math.floor(wx0 / gridSize) * gridSize;
  const startY = Math.floor(wy0 / gridSize) * gridSize;

  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = "rgba(255,255,255,0.025)";

  for (let gx = startX; gx <= wx1; gx += gridSize) {
    ctx.beginPath();
    ctx.moveTo(gx, wy0);
    ctx.lineTo(gx, wy1);
    ctx.stroke();
  }

  for (let gy = startY; gy <= wy1; gy += gridSize) {
    ctx.beginPath();
    ctx.moveTo(wx0, gy);
    ctx.lineTo(wx1, gy);
    ctx.stroke();
  }

  // -------------------------------------------------------------------------
  // Major grid markers
  // -------------------------------------------------------------------------

  ctx.strokeStyle = "rgba(255,255,255,0.045)";

  const majorGrid = gridSize * 5;

  const majorX = Math.floor(wx0 / majorGrid) * majorGrid;
  const majorY = Math.floor(wy0 / majorGrid) * majorGrid;

  for (let gx = majorX; gx <= wx1; gx += majorGrid) {
    ctx.beginPath();
    ctx.moveTo(gx, wy0);
    ctx.lineTo(gx, wy1);
    ctx.stroke();
  }

  for (let gy = majorY; gy <= wy1; gy += majorGrid) {
    ctx.beginPath();
    ctx.moveTo(wx0, gy);
    ctx.lineTo(wx1, gy);
    ctx.stroke();
  }

  // -------------------------------------------------------------------------
  // Studio islands
  // -------------------------------------------------------------------------

  const studioGroups = new Map();

  for (const tile of tilesRef.current) {
    const key =
      tile.studio_id ||
      tile.studio ||
      "__unknown__";

    if (!studioGroups.has(key)) {
      studioGroups.set(key, []);
    }

    studioGroups.get(key).push(tile);
  }

  const showIslandGlow = k < 1.1;

  if (showIslandGlow) {
    for (const members of studioGroups.values()) {
      if (!members.length) continue;

      let cx = 0;
      let cy = 0;

      for (const tile of members) {
        cx += tile.x;
        cy += tile.y;
      }

      cx /= members.length;
      cy /= members.length;

      let radius = 30;

      for (const tile of members) {
        radius = Math.max(
          radius,
          Math.hypot(tile.x - cx, tile.y - cy) + 28
        );
      }

      const gradient = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        radius
      );

      gradient.addColorStop(
        0,
        "rgba(245,179,1,0.055)"
      );

      gradient.addColorStop(
        0.55,
        "rgba(245,179,1,0.025)"
      );

      gradient.addColorStop(
        1,
        "rgba(245,179,1,0)"
      );

      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Island boundary

      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 1 / k;

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // -------------------------------------------------------------------------
  // Tile rendering
  // -------------------------------------------------------------------------

  const screenTile = TILE * k;

  const showImages = screenTile >= 16;
  // const showLabels = screenTile >= 32;

  const searching = matchRef.current.size > 0;

  const hoveredTile = hoverRef.current;
  const selectedTile = selectedRef.current;

  for (const tile of tilesRef.current) {
    if (
      tile.x < wx0 ||
      tile.x > wx1 ||
      tile.y < wy0 ||
      tile.y > wy1
    ) {
      continue;
    }

    const isHover =
      hoveredTile &&
      hoveredTile.id === tile.id;

    const isSelected =
      selectedTile &&
      selectedTile.id === tile.id;

    const isMatch =
      searching &&
      matchRef.current.has(tile.id);

    const dimmed =
      searching &&
      !isMatch;

    const alpha = dimmed
      ? 0.08
      : isSelected
      ? 1
      : isHover
      ? 1
      : 0.92;

    ctx.globalAlpha = alpha;

    const half = TILE / 2;

    const px = tile.x - half;
    const py = tile.y - half;

    // -----------------------------------------------------------------------
    // Tiny particle mode
    // -----------------------------------------------------------------------

    if (screenTile < 7 && !isHover && !isSelected) {
      const particleSize = Math.max(
        1.4,
        TILE * 0.34
      );

      ctx.fillStyle = `hsl(${tile.hue} 65% 58%)`;

      ctx.beginPath();
      ctx.arc(
        tile.x,
        tile.y,
        particleSize / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();

      continue;
    }

    // -----------------------------------------------------------------------
    // Tile shadow / glow
    // -----------------------------------------------------------------------

    if (isHover || isSelected || isMatch) {
      ctx.save();

      ctx.shadowColor =
        isSelected || isHover
          ? "rgba(255,255,255,0.35)"
          : "rgba(245,179,1,0.35)";

      ctx.shadowBlur =
        isSelected || isHover
          ? 18 / k
          : 10 / k;

      ctx.fillStyle =
        isSelected || isHover
          ? "rgba(255,255,255,0.08)"
          : "rgba(245,179,1,0.06)";

      ctx.fillRect(
        px - 1 / k,
        py - 1 / k,
        TILE + 2 / k,
        TILE + 2 / k
      );

      ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Thumbnail
    // -----------------------------------------------------------------------

    const img =
      showImages ||
      isHover ||
      isSelected
        ? getCachedImage(tile.thumb)
        : null;

    if (
      img &&
      img.complete &&
      img.naturalWidth > 0
    ) {
      ctx.save();

      // Rounded thumbnail

      const radius = Math.min(
        2.5,
        TILE * 0.18
      );

      ctx.beginPath();
      ctx.roundRect(
        px,
        py,
        TILE,
        TILE,
        radius
      );

      ctx.clip();

      ctx.drawImage(
        img,
        px,
        py,
        TILE,
        TILE
      );

      ctx.restore();
    } else {
      // Fallback colored tile

      const gradient = ctx.createLinearGradient(
        px,
        py,
        px + TILE,
        py + TILE
      );

      gradient.addColorStop(
        0,
        `hsl(${tile.hue} 65% 58%)`
      );

      gradient.addColorStop(
        1,
        `hsl(${tile.hue} 55% 34%)`
      );

      ctx.fillStyle = gradient;

      ctx.beginPath();

      ctx.roundRect(
        px,
        py,
        TILE,
        TILE,
        Math.min(2.5, TILE * 0.18)
      );

      ctx.fill();
    }

    // -----------------------------------------------------------------------
    // Match / hover / selection border
    // -----------------------------------------------------------------------

    if (
      isMatch ||
      isHover ||
      isSelected
    ) {
      ctx.strokeStyle =
        isSelected
          ? "#ffffff"
          : isHover
          ? "rgba(255,255,255,0.9)"
          : "#f5b301";

      ctx.lineWidth =
        (isSelected ? 2 : 1.2) / k;

      ctx.beginPath();

      ctx.roundRect(
        px,
        py,
        TILE,
        TILE,
        Math.min(2.5, TILE * 0.18)
      );

      ctx.stroke();
    }

    // -----------------------------------------------------------------------
    // Hover / selected enlarged tile
    // -----------------------------------------------------------------------

    if (isHover || isSelected) {
      const zoom =
        TILE *
        (isSelected ? 2.8 : 2.35);

      const zx =
        tile.x - zoom / 2;

      const zy =
        tile.y - zoom / 2;

      ctx.save();

      ctx.shadowColor =
        isSelected
          ? "rgba(245,179,1,0.42)"
          : "rgba(255,255,255,0.35)";

      ctx.shadowBlur =
        (isSelected ? 26 : 18) / k;

      ctx.fillStyle = "#111";

      ctx.beginPath();

      ctx.roundRect(
        zx,
        zy,
        zoom,
        zoom,
        4
      );

      ctx.fill();

      ctx.clip();

      const big =
        getCachedImage(tile.thumb);

      if (
        big &&
        big.complete &&
        big.naturalWidth > 0
      ) {
        ctx.drawImage(
          big,
          zx,
          zy,
          zoom,
          zoom
        );
      } else {
        ctx.fillStyle =
          `hsl(${tile.hue} 65% 50%)`;

        ctx.fillRect(
          zx,
          zy,
          zoom,
          zoom
        );
      }

      ctx.restore();

      ctx.strokeStyle =
        isSelected
          ? "#f5b301"
          : "#ffffff";

      ctx.lineWidth =
        (isSelected ? 2 : 1.5) / k;

      ctx.beginPath();

      ctx.roundRect(
        zx,
        zy,
        zoom,
        zoom,
        4
      );

      ctx.stroke();
    }

    // -----------------------------------------------------------------------
    // Studio / scene label
    // -----------------------------------------------------------------------

    // if (
    //   showLabels &&
    //   !searching &&
    //   !isHover &&
    //   !isSelected
    // ) {
    //   const label =
    //     tile.name ||
    //     tile.studio ||
    //     "";

    //   if (label) {
    //     ctx.font =
    //       `${Math.max(8, 9 / k)}px ui-monospace, monospace`;

    //     ctx.fillStyle =
    //       "rgba(255,255,255,0.45)";

    //     ctx.textAlign = "center";

    //     ctx.fillText(
    //       label.length > 24
    //         ? `${label.slice(0, 24)}…`
    //         : label,
    //       tile.x,
    //       tile.y + TILE * 0.9
    //     );
    //   }
    // }
  }

  ctx.restore();

  // -------------------------------------------------------------------------
  // Screen-space vignette
  // -------------------------------------------------------------------------

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.28,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75
  );

  vignette.addColorStop(
    0,
    "rgba(0,0,0,0)"
  );

  vignette.addColorStop(
    0.72,
    "rgba(0,0,0,0.08)"
  );

  vignette.addColorStop(
    1,
    "rgba(0,0,0,0.62)"
  );

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
  ctx.globalAlpha = 1;
}, []);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(id);
    };
  }, [draw]);

  // -- picking ---------------------------------------------------------------
  const tileAt = (screenX, screenY) => {
    const { x, y, k } = transformRef.current;
    const wx = (screenX - x) / k;
    const wy = (screenY - y) / k;
    const list = tilesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      const r = TILE / 2 + 5 / k;
      if (Math.abs(t.x - wx) <= r && Math.abs(t.y - wy) <= r) return t;
    }
    return null;
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    movedRef.current = false;
    const rect = canvasRef.current.getBoundingClientRect();
    const t = tileAt(e.clientX - rect.left, e.clientY - rect.top);
    if (t) {
      // Let click select; don't start a pan.
      dragStartRef.current = { x: e.clientX, y: e.clientY, tile: t };
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) movedRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      return;
    }
    if (dragStartRef.current.tile) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        // Turned into a drag: start panning with the grabbed tile.
        isDraggingRef.current = true;
        movedRef.current = true;
      }
      return;
    }
    const hov = tileAt(mx, my);
    setHovered((prev) => (prev?.id === hov?.id ? prev : hov));
    if (canvasRef.current) canvasRef.current.style.cursor = hov ? "pointer" : "grab";
  };

  const endDrag = () => {
    isDraggingRef.current = false;
    dragStartRef.current = {};
  };

  const handleClick = (e) => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const t = tileAt(e.clientX - rect.left, e.clientY - rect.top);
    setSelected(t);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const { x, y, k } = transformRef.current;
    const nk = Math.max(0.12, Math.min(6, k * factor));
    const wx = (mx - x) / k;
    const wy = (my - y) / k;
    transformRef.current = { x: mx - wx * nk, y: my - wy * nk, k: nk };
  };

  // Esc clears selection / search.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSelected(null);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const preview = hovered || selected;

  return (
    <div className="graph-map h-full w-full flex flex-col relative overflow-hidden select-none">
      {/* Main infinite canvas */}
      {loading ? (
        <div className="h-full flex items-center justify-center bg-black">
          <Spinner />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={() => {
            endDrag();
            setHovered(null);
          }}
          onClick={handleClick}
          onWheel={handleWheel}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />
      )}

      {/* Top-right info card, ytmap-style */}
      {!loading && (
        <div className="ytmap-info">
          <button className="ytmap-info-close" onClick={() => setSelected(null)} aria-label="Clear selection">
            ✕
          </button>
          <div className="ytmap-info-media">
            {preview ? (
              <img
                key={preview.id}
                src={preview.thumb}
                alt=""
                draggable={false}
                onError={(e) => (e.target.style.display = "none")}
              />
            ) : (
              <div className="ytmap-info-count">
                <b>{totalScenes}</b>
                <span>SCENES<br />IN 1 SCREEN</span>
              </div>
            )}
          </div>
          <div className="ytmap-info-text">
            {preview ? (
              <>
                <h3>{preview.name}</h3>
                <p>
                  {[preview.studio, preview.resolution].filter(Boolean).join(" · ") ||
                    "Click to open scene"}
                </p>
              </>
            ) : (
              <>
                <h3>Every scene on one screen</h3>
                <p>Hover any tile to preview · scroll to zoom · drag to pan</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom floating pill: home / search / random */}
      <YtMapBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        matches={matches}
        totalMatches={query ? matchRef.current.size : 0}
        onSubmitSearch={submitSearch}
        onPickMatch={zoomToTile}
        onHome={fitView}
        onRandom={goRandom}
      />

      {/* Scene inspector drawer */}
      <GraphInspector
        selectedNode={selected}
        onClose={() => setSelected(null)}
        navigate={navigate}
      />
    </div>
  );
}
