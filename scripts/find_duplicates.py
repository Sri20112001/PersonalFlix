#!/usr/bin/env python3
"""Find duplicate files by content hash.

Two/three-stage strategy so large video libraries stay fast:
  1. Group by file size (cheap stat only).
  2. For same-size groups, hash the first ``--partial-bytes`` of each file.
  3. For surviving candidates, hash the full file contents.

Only files with identical full hashes are reported as duplicates.

Usage (PowerShell):
  python scripts/find_duplicates.py "P:\\Personal\\Porn" --extensions .mp4 .mkv .webm
  python scripts/find_duplicates.py . --output duplicates.json
  python scripts/find_duplicates.py "P:\\Personal\\Porn" --quick   # size + partial hash only

Exit code: 0 = no duplicates, 1 = duplicates found, 2 = error.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

DEFAULT_EXCLUDES = {"netflix-app", "node_modules", "target", "dist", ".git", ".vite"}
DEFAULT_VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".m2ts")

CHUNK_SIZE = 1024 * 1024  # 1 MiB streaming chunks for full hashes


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Find duplicate files by hash value (size -> partial hash -> full hash)."
    )
    p.add_argument("path", nargs="?", default=".",
                   help="Root directory to scan (default: current directory).")
    p.add_argument("-e", "--extensions", nargs="*", default=None,
                   help="Only include these extensions, e.g. --extensions .mp4 .mkv. "
                        "Default: all files. Use --video for common video extensions.")
    p.add_argument("--video", action="store_true",
                   help="Shortcut for common video extensions.")
    p.add_argument("--min-size", default="1",
                   help="Minimum file size to consider, e.g. 1, 1KB, 10MB (default: 1 byte; "
                        "0-byte files are skipped unless --include-empty).")
    p.add_argument("--include-empty", action="store_true",
                   help="Include 0-byte files (skipped by default).")
    p.add_argument("-a", "--algorithm", default="sha256",
                   choices=["md5", "sha1", "sha256", "blake2b"],
                   help="Hash algorithm (default: sha256; md5 is faster and fine for dup detection).")
    p.add_argument("--partial-bytes", default="4MB",
                   help="Bytes read from file head for stage-2 hashing, e.g. 1MB, 4MB (default: 4MB).")
    p.add_argument("--quick", action="store_true",
                   help="Stop after stage 2 (size + partial hash). Fast but can false-positive "
                        "on files sharing a prefix (e.g. same intro).")
    p.add_argument("--exclude-dirs", nargs="*", default=sorted(DEFAULT_EXCLUDES),
                   help="Directory names to skip (default: %(default)s). Use --no-exclude to scan everything.")
    p.add_argument("--no-exclude", action="store_true",
                   help="Do not exclude any directories.")
    p.add_argument("-j", "--jobs", type=int, default=min(8, (os.cpu_count() or 4)),
                   help="Hashing threads (default: %(default)s).")
    p.add_argument("--follow-symlinks", action="store_true",
                   help="Follow symlinked directories (off by default).")
    p.add_argument("-o", "--output",
                   help="Write JSON report to this path, e.g. --output duplicates.json.")
    p.add_argument("--show-all", action="store_true",
                   help="Show every file in each cluster (default truncates to 10 per cluster).")
    p.add_argument("--delete-keep-first", action="store_true",
                   help="DANGEROUS: delete duplicates keeping the first file (sorted) per cluster. "
                        "Requires --yes. Dry-run shown without --yes.")
    p.add_argument("--yes", action="store_true",
                   help="Confirm destructive --delete-keep-first (no prompt).")
    return p.parse_args(argv)


def parse_size(s: str) -> int:
    s = str(s).strip().upper().replace(" ", "")
    mult = {"B": 1, "KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3, "TB": 1024 ** 4,
            "K": 1024, "M": 1024 ** 2, "G": 1024 ** 3, "T": 1024 ** 4}
    for suffix in ("TB", "GB", "MB", "KB", "T", "G", "M", "K", "B"):
        if s.endswith(suffix):
            return int(float(s[: -len(suffix)] or 0) * mult[suffix])
    return int(float(s))


def fmt_bytes(n: int) -> str:
    v, units = float(n or 0), ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while v >= 1024 and i < len(units) - 1:
        v /= 1024
        i += 1
    return f"{v:.1f} {units[i]}"


def new_hasher(algorithm: str):
    return hashlib.new(algorithm)


def iter_files(root: str, extensions, exclude_dirs: set[str], follow_symlinks: bool):
    """Yield file paths under root, skipping excluded dir names."""
    exts = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in extensions} if extensions else None
    for dirpath, dirnames, filenames in os.walk(root, followlinks=follow_symlinks):
        # Prune excluded / hidden dirs in-place so walk doesn't descend.
        # (Hidden dirs are skipped; symlink dirs are skipped unless --follow-symlinks,
        # which os.walk already handles via followlinks.)
        dirnames[:] = sorted(
            d for d in dirnames
            if d not in exclude_dirs and not d.startswith(".")
        )
        for fn in filenames:
            if exts and os.path.splitext(fn)[1].lower() not in exts:
                continue
            fp = os.path.join(dirpath, fn)
            if not follow_symlinks and os.path.islink(fp):
                continue
            yield fp


def collect_by_size(root: str, extensions, exclude_dirs: set[str], follow_symlinks: bool,
                    min_size: int, include_empty: bool):
    """Walk and group candidate files by size. Returns (by_size, scanned, skipped, errors)."""
    by_size: dict[int, list[str]] = defaultdict(list)
    scanned, skipped, errors = 0, 0, []
    for fp in iter_files(root, extensions, exclude_dirs, follow_symlinks):
        try:
            size = os.path.getsize(fp)
        except OSError as exc:
            errors.append(f"{fp}: {exc}")
            continue
        scanned += 1
        if size == 0 and not include_empty:
            skipped += 1
            continue
        if size < min_size:
            skipped += 1
            continue
        by_size[size].append(fp)
    return by_size, scanned, skipped, errors


def hash_partial(path: str, algorithm: str, num_bytes: int) -> str:
    h = new_hasher(algorithm)
    with open(path, "rb") as f:
        remaining = num_bytes
        while remaining > 0:
            chunk = f.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            h.update(chunk)
            remaining -= len(chunk)
    return h.hexdigest()


def hash_full(path: str, algorithm: str) -> str:
    h = new_hasher(algorithm)
    with open(path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def hash_many(paths: list[str], func, jobs: int):
    """Hash paths concurrently. Returns (results dict, errors list)."""
    results, errors = {}, []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, jobs)) as ex:
        fut_to_path = {ex.submit(func, p): p for p in paths}
        for fut in concurrent.futures.as_completed(fut_to_path):
            p = fut_to_path[fut]
            try:
                results[p] = fut.result()
            except OSError as exc:
                errors.append(f"{p}: {exc}")
    return results, errors


def find_duplicates(root: str, *, extensions, exclude_dirs: set[str], follow_symlinks: bool,
                    min_size: int, include_empty: bool, algorithm: str,
                    partial_bytes: int, quick: bool, jobs: int, verbose: bool = True):
    log = print if verbose else (lambda *a, **k: None)
    log(f"[*] Scanning: {os.path.abspath(root)}")
    by_size, scanned, skipped, errors = collect_by_size(
        root, extensions, exclude_dirs, follow_symlinks, min_size, include_empty)
    same_size_groups = {s: v for s, v in by_size.items() if len(v) > 1}
    log(f"[*] Files scanned: {scanned}  (skipped by size/empty: {skipped}, "
        f"unique sizes: {len(by_size) - len(same_size_groups)}, same-size groups: {len(same_size_groups)})")

    clusters: list[dict] = []
    stage = "partial" if quick else "full"

    if not same_size_groups:
        return {"clusters": [], "scanned": scanned, "skipped": skipped,
                "errors": errors, "mode": stage, "algorithm": algorithm}

    # Stage 2: partial hash within each same-size group.
    candidates: list[str] = []
    for size in sorted(same_size_groups):
        paths = same_size_groups[size]
        if len(paths) == 2 and partial_bytes <= 0:
            candidates.extend(paths)
            continue
        partials, errs = hash_many(
            paths, lambda p, a=algorithm, n=partial_bytes: hash_partial(p, a, n), jobs)
        errors.extend(errs)
        by_partial: dict[tuple, list[str]] = defaultdict(list)
        for p, digest in partials.items():
            by_partial[(size, digest)].append(p)
        for (size_key, _digest), group in by_partial.items():
            if len(group) > 1:
                if quick:
                    group_sorted = sorted(group)
                    clusters.append({"hash": f"partial:{_digest}", "size": size_key,
                                     "files": group_sorted, "partial_only": True})
                else:
                    candidates.extend(group)
            # singletons are unique -> dropped

    log(f"[*] After partial-hash: "
        f"{len(clusters) if quick else len(candidates)} "
        f"{'candidate clusters' if quick else 'candidate files'} need full hashing."
        if same_size_groups else "[*] No same-size candidates.")

    # Stage 3: full hash of survivors.
    if not quick and candidates:
        log(f"[*] Full-hashing {len(candidates)} candidate files ({algorithm}, {jobs} threads)...")
        fulls, errs = hash_many(
            candidates, lambda p, a=algorithm: hash_full(p, a), jobs)
        errors.extend(errs)
        by_full: dict[tuple, list[str]] = defaultdict(list)
        # Re-attach sizes (re-stat is cheap and guards against races).
        for p, digest in fulls.items():
            try:
                size = os.path.getsize(p)
            except OSError as exc:
                errors.append(f"{p}: {exc}")
                continue
            by_full[(size, digest)].append(p)
        for (size, digest), group in sorted(by_full.items()):
            if len(group) > 1:
                clusters.append({"hash": digest, "size": size,
                                 "files": sorted(group), "partial_only": False})

    clusters.sort(key=lambda c: (len(c["files"]) - 1) * c["size"], reverse=True)
    return {"clusters": clusters, "scanned": scanned, "skipped": skipped,
            "errors": errors, "mode": stage, "algorithm": algorithm}


def main(argv=None) -> int:
    args = parse_args(argv)
    root = args.path
    if not os.path.isdir(root):
        print(f"Error: not a directory: {root}", file=sys.stderr)
        return 2

    extensions = list(args.extensions) if args.extensions else None
    if args.video:
        extensions = sorted(set((extensions or []) + list(DEFAULT_VIDEO_EXTS)))

    exclude_dirs = set() if args.no_exclude else set(args.exclude_dirs or [])
    try:
        min_size = parse_size(args.min_size)
        partial_bytes = parse_size(args.partial_bytes)
    except ValueError as exc:
        print(f"Error: bad size value: {exc}", file=sys.stderr)
        return 2

    result = find_duplicates(
        root, extensions=extensions, exclude_dirs=exclude_dirs,
        follow_symlinks=args.follow_symlinks, min_size=min_size,
        include_empty=args.include_empty, algorithm=args.algorithm,
        partial_bytes=partial_bytes, quick=args.quick, jobs=args.jobs)

    clusters = result["clusters"]
    dup_files = sum(len(c["files"]) - 1 for c in clusters)
    wasted = sum((len(c["files"]) - 1) * c["size"] for c in clusters)

    print("-" * 72)
    if not clusters:
        print("No duplicate files found.")
    else:
        print(f"Found {len(clusters)} duplicate group(s), "
              f"{dup_files} redundant file(s), reclaimable ~{fmt_bytes(wasted)}"
              + ("  [QUICK MODE: partial hashes only]" if args.quick else ""))
        for i, c in enumerate(clusters, 1):
            files = c["files"] if args.show_all else c["files"][:10]
            print(f"\n[{i}] {len(c['files'])}x {fmt_bytes(c['size'])}  hash={c['hash'][:16]}...")
            for f in files:
                print(f"      {f}")
            if not args.show_all and len(c["files"]) > 10:
                print(f"      ... +{len(c['files']) - 10} more")
    if result["errors"]:
        print(f"\n[!] {len(result['errors'])} error(s), e.g.:")
        for e in result["errors"][:5]:
            print(f"      {e}")

    if args.output:
        report = {"generated_at": datetime.now(timezone.utc).isoformat(),
                  "root": os.path.abspath(root), "mode": result["mode"],
                  "algorithm": result["algorithm"], "scanned": result["scanned"],
                  "duplicate_groups": len(clusters), "redundant_files": dup_files,
                  "reclaimable_bytes": wasted, "clusters": clusters,
                  "errors": result["errors"]}
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"\n[*] JSON report written to {args.output}")

    if args.delete_keep_first and clusters:
        victims = []
        for c in clusters:
            if c.get("partial_only"):
                print("[!] Refusing to delete on --quick (partial-hash) results. Re-run without --quick.",
                      file=sys.stderr)
                return 2
            victims.extend(c["files"][1:])
        print(f"\n[!] --delete-keep-first would remove {len(victims)} file(s), "
              f"freeing ~{fmt_bytes(sum(c['size'] * (len(c['files']) - 1) for c in clusters))}.")
        if not args.yes:
            print("    Dry run only (no files deleted). Re-run with --yes to actually delete.")
            return 1
        for v in victims:
            try:
                os.remove(v)
                print(f"    deleted {v}")
            except OSError as exc:
                print(f"    FAILED {v}: {exc}", file=sys.stderr)
        return 1

    return 1 if clusters else 0


if __name__ == "__main__":
    raise SystemExit(main())
