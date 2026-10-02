# SceneInfoPanel — Redesign Brief for Google Stitch

> Paste this whole file into Stitch as context, then describe the redesign
> direction you want (e.g. "make it a tabbed inspector", "card-based chapters",
> "denser pro-editor layout"). Everything below is current behavior that the
> redesign must preserve unless you explicitly say otherwise.

## 1. What this component is

`SceneInfoPanel` (`frontend/src/components/SceneInfoPanel.jsx`, ~1640 lines)
is the **right-side inspector panel on the video playback page** of
PersonalFlix — a local-first, dark-only desktop video-library app
(Tauri + React 18 + Tailwind CSS 3.4, no backend dependency for layout).

- **Placement:** fixed right rail next to the video player. `420px` wide
  (`max-w-45%`, `min-w-360px`), full viewport height. Collapsible via the
  `I` key or ✕ button; player expands when it closes.
- **Scrolling:** the panel body scrolls internally (`overflow-y-auto`);
  the page itself never scrolls vertically (viewport-fitted app shell).
- **Density:** information-dense pro tool, not marketing UI. Mostly 11–13px
  text, mono timecodes, icon buttons. Must stay usable at 360px width.

## 2. Current sections (top to bottom — keep ALL functionality)

### (a) Sticky header (h-11, `BACK | DETAILS ✕`)
- BACK → library (also `Esc`); DETAILS → opens full scene page in a new app tab;
  ✕ → hide panel (also `I`). Keep all three + shortcuts.

### (b) Scene identity
- Title (bold white, wraps), original filename (dim mono, truncated w/ tooltip).
- Meta row: studio pill (amber accent, navigates to studio page),
  resolution badge (uppercase), release date.
- Performer pills (wrap; hover fills amber; each navigates to performer page).

### (c) Action dock (3 icon buttons, equal width)
Favorite-heart toggle (fills amber when active) · Playlist menu (dropdown with
checkbox list, inline "new playlist + Add") · Edit-metadata (opens editor overlay).

### (d) Watch-status segmented control (4 icons, single-select toggle)
Want (bookmark) · Watching (eye) · Watched (check) · Skip (prohibited sign).
Active = amber fill. Clicking active clears it.

### (e) Chapters & Key Moments (the visual centerpiece — give this the most love)
- Collapsible header: pulsing amber dot, "CHAPTERS & KEY MOMENTS", count badge,
  chevron; collapse state persists in localStorage. Right side: "Clip" button
  (opens clip-export modal prefilled `now-5s → now+15s`) and amber "+ Marker"
  button (shortcut `C`).
- **Mini timeline track:** color-coded chapter segments (width ∝ duration),
  played-progress shade + white playhead; click segment seeks.
- **Add-chapter form:** title input, Start/End time fields (each with `Now`
  snap + `−5 −1 +1 +5` nudge steppers, `m:ss`/`h:mm:ss`/raw-seconds parsing),
  amber overlap warning with "Snap end" fix, category pills (8 total, below),
  performer tag picker, Cancel / Save Marker.
- **Chapter rows** (chronological): number badge in category color, title
  (+ amber `NOW` badge on the live chapter), category · duration, per-row
  range bar showing position/length on the full timeline, timecode jump button
  (`start–end`), hover actions: duplicate, export-clip, edit, delete (confirm).
- **Row interactions:** click seeks; active row auto-scrolls into view and gets
  amber glow + left border; full inline edit form (same controls as add-form).
- Empty state: dashed box, "press C while playing", "+ Add marker at 0:00".

### (f) Transcript panel (child component)
Collapsible; search filter box; count badge; auto-follows playhead (active row
highlighted + auto-scrolled); click row seeks; hover pencil edits cue text
(Ctrl+Enter saves, Esc cancels). Empty states for loading / none.

### (g) Notes (personal comments)
Collapsible with count; input + Post (Enter), performer @-tag picker;
rows show date, performer chips, @mention highlighting, hover delete.

## 3. Data shapes (props in, nothing fetched inside)

```js
scene:       { _id, title, file_name, original_name, resolution, date, duration }
performers:  [{ _id, name }]            // navigates to /performer/:id
studio:      { _id, name }              // navigates to /studio/:id
timestamps:  [{ _id, seconds, end_seconds?, label, category, note?,
                performer_ids[], performers[] }]   // chapters, unsorted ok
comments:    [{ _id, text, created_at, performers[], performer_ids[] }]
status:      "" | "want-to-watch" | "watching" | "watched" | "skip"
favorite:    object | null
playlists:   [{ _id, name, scene_ids[] }]
currentTime: number (seconds, live from player)
```
Callbacks: `onSeek(seconds)`, `onBack`, `onClosePanel`, `onToggleFavorite`,
`onStatusChange`, `onTogglePlaylist`, `onCreatePlaylist(name)`, `onEditScene`,
`onAddTimestamp / onUpdateTimestamp(id, body) / onDeleteTimestamp(id)`,
`onAddComment(text, performerIds) / onDeleteComment(id)`.
Listens: `pfx-capture-chapter` (prefill add-form), `pfx-export-clip` (open clip
modal). Emits: `pfx-open-tab` (details in new tab).

## 4. Design system (exact tokens — match these)

- **Colors:** background `#0A0A0B`, surface `#141415`, borders `white/5–10`,
  text `#FFFFFF` / `#A1A1AA` / `#52525B`, **accent amber `#F5B301`**
  (hover `#FFC52F`), danger rose `#F43F5E`/`rose-400`, success emerald,
  info sky.
- **Chapter category colors (fixed mapping, do not reassign):**
  intro `#0EA5E9`, main `#E50914`, orgasm `#8B5CF6`, solo `#14B8A6`,
  anal `#F59E0B`, oral `#22C55E`, ending `#6366F1`, extra `#F43F5E`.
- **Type:** display `Anton` (uppercase headings only), body `Inter`;
  timecodes/labels/timestamps in monospace.
- **Shape:** border radius `0.25rem` base (cards may use `rounded-xl/2xl`);
  dark mode only; subtle borders + `backdrop-blur` overlays; amber glow for
  active states; `kbd`-style shortcut hints.
- No sidebar anywhere in the app; shortcuts surfaced bottom-right of screens.

## 5. Redesign constraints for Stitch

1. Output **one self-contained React component** (Tailwind classes only, no
   new deps) with the **same props + callback names** from §3.
2. Preserve every control and shortcut in §2 (`Esc, I, C`, Enter-to-save,
   hover reveals). Don't merge or drop features — rearrange freely.
3. Keep the amber-accent dark aesthetic and the category-color mapping.
4. Must work at 360–420px width with internal scroll; touch-friendly hit
   targets (≥24px) for transport-adjacent buttons.
5. No emojis in UI. No vertical page scroll assumptions.
