# PersonalFlix — What Can Be Done Next

Status-quo (verified working): local whisper transcription per scene + batch
queue, `.en.vtt` + `.en.srt` sidecars, SRT download for VLC, clickable/editable
transcript in the Info panel, Library Health + scan, search field filters,
Command Center, editable chapters, resume playback. Whisper model is selectable
(`whisper_model` setting, "auto" = largest English model on disk, default
small.en; recall-tuned decode `-nth 0.5` + pinned beam search); re-transcribe
via the player CC↻ button or Shift+click on the Library 🎙 Captions bulk action.

Ideas below are roughly ordered by value/effort. Pick one and build it.

## Captions & transcript (newest stack, most momentum)

- [ ] **Cue timing edits** — nudge cue start/end in `TranscriptPanel.jsx`
  (reuse `ChapterTimeField` + `parseTimeToSeconds`); backend already preserves
  timings on rewrite, so this is a small `PATCH` extension (`start`/`end` fields).
- [ ] **Transcript search across the library** — "find the scene where they
  say…". Index sidecar text (SQLite FTS table or a `transcripts` table updated
  after each job), expose `GET /api/search/transcripts?q=`, add a Command
  Center source that seeks to the matching cue.
- [ ] **Keyword highlighting in playback** — serve `?highlight=w1,w2` wrapping
  matches in `<c.kw>`, style with `::cue(c.kw)`; optional saved keyword list in
  settings.
- [ ] **Auto-transcribe on import** — hook fetch-from-URL + scanner so new
  scenes queue a transcription job automatically (opt-in setting).
- [ ] **Batch retry from Health page** — list failed/error caption jobs, one
  click re-queues them; surface per-scene error messages.
- [ ] **Caption coverage stats** — Health page "x/828 captioned" (the
  `captioned` field in `/api/transcribe/status` is still stubbed to 0).

## Library & discovery

- [ ] **Scene-level favorites** — favorites currently target performers/studios
  only; the command-center "toggle favorite" no-ops on scenes. Add
  `type=scene` end-to-end.
- [ ] **Add-to-playlist from the scene page** — the Playlist page has search+add,
  but the scene Info panel only toggles existing playlists; add inline create.
- [ ] **Watched-history calendar** — heatmap of watch events (data already in
  `watch_events`).
- [ ] **Scene analytics** — top studios/performers by playtime, completion rates.
- [ ] **Per-studio breakdown on Health page** — files, missing, bytes by studio;
  file-size drift detection; "open file location"; re-scan progress feedback.
- [ ] **Playlist drag-reorder** — persist custom scene order.
- [ ] **Import/export playlists + chapter data** — JSON round-trip for backup/sharing.

## Playback & player

- [ ] **Hardware-accelerated thumbnails** for placeholder scenes.
- [ ] **Transcript auto-follow toggle** — pause autoscroll on manual scroll
  (currently always follows the active cue).
- [ ] **Cue-click seeks while paused then resumes** — today it seeks; decide
  whether playback state should be preserved/restored.

## Metadata & ingest

- [ ] **Performer backfill apply review** — dry-run exists; add UI to approve
  individual name links before applying.
- [ ] **Duplicate detection resolution actions** — DuplicatesTab lists, but bulk
  merge/delete actions are missing.
- [ ] **Review queue shortcuts** — keyboard-first flow for `needs_performers` /
  missing-thumbnail buckets.

## Tech health

- [ ] **Clock-skew guard** — system clock jumps confuse cargo fingerprints
  (stale "Finished in 1s" builds) and `updated_at` ordering; document or add a
  build sanity check.
- [ ] **Dev-lock hygiene** — smoke-test binaries hold the exe lock and break
  `cargo run`; always stop standalone instances before handing back to dev.
- [ ] **Frontend chunk size** — `index-*.js` is ~660 kB; code-split routes with
  `React.lazy` when it starts hurting load time.
- [ ] **Captioned-count query** — replace the `captioned: 0` stub with a real
  sidecar census (cached in `meta`, refreshed on scan/transcribe).
