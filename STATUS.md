# Mowl — current status

Snapshot for picking the project up on another machine. Pair with
[ARCHITECTURE.md](ARCHITECTURE.md) (file map + how‑to) and
[README.md](README.md) (build/run).

Version: **0.1.0** · Last built: Windows x64 (NSIS installer + portable exe).

## Done

- WYSIWYG editor (Milkdown Crepe), light/dark/system theme, minimalist window.
- **Tabs** with session restore (`open_files` / `active_tab` in `settings.toml`).
- **Source view** toggle — `<>` button / `Ctrl/Cmd+Shift+C`. Shows Crepe‑normalised
  Markdown; RTL/LTR buttons disabled here (source is always LTR).
- **Block menu** on the `⠿` handle (Crepe's `+` hidden, drag disabled): turn into
  Text / H1‑3 / bullet / numbered / quote / code / **table**, insert
  table / **image** / divider / line above/below, duplicate, delete. The current
  block's type is highlighted. Raw ProseMirror commands (`src/block-menu.ts`).
- **Images render in the editor** — `proxyDomURL` hook (`src/editor.ts`) sends
  local / relative image paths to the `read_image_data_url` Rust command, which
  resolves them against the current document's folder and returns a `data:` URL.
  Remote / `data:` URLs pass through untouched.
- **Link from clipboard**: select text + paste a URL, or `Ctrl/Cmd+K`
  (`src/link-clipboard.ts`).
- **Source/preview scroll sync**: `toggleSource()` carries the reading position
  across the switch as a 0..1 fraction (proportional, once per toggle).
- **About panel**: M↓ mark left of the doc title → `#about` modal (version,
  author, MIT, github.com/naderi link, active `settings.toml` path).
- **Tables**: drag rows/columns (needs `dragDropEnabled:false`), auto‑aligned in
  the saved Markdown (`src-tauri/src/mdfmt.rs`).
- **RTL / LTR** toggle (`direction`), code blocks forced back to LTR. Carried into
  the HTML export (`<html dir>`).
- **Export**: self‑contained HTML (comrak + inlined KaTeX/highlight.js), or PDF
  via a hidden print iframe.
- **One settings file** — `settings.toml` next to the exe. Top = hand‑editable
  prefs (theme, direction, spellcheck, `quit_on_escape`, fonts, sizes, accent),
  bottom = app state. 1 Hz watcher applies external edits live
  (`settings-changed` event), skipping the app's own writes.
- **Portable**: falls back to OS config dir if the program folder is read‑only;
  WebView2 cache redirected into `./data/webview2` on Windows.
- **Window geometry** saved/restored (outerPosition, minimized‑position bug
  handled, flushed on quit).
- **`quit_on_escape`** setting (default off).
- **File associations / "Open with"**: `tauri-plugin-single-instance` +
  `file_arg(argv)` + `bundle.fileAssociations` for `.md` / `.markdown`. First
  launch → `SettingsPayload.open_with`; later launches → `open-file` event into
  the running window.
- **App icon** from `icon/Mowl-icon.png` (`pnpm tauri icon` → `src-tauri/icons/`).
- CI workflow `.github/workflows/release.yml` (5 targets) — **written, never run**.
- Rust unit tests (7) green; `tsc --noEmit` green.

## Not done / next candidates

- **macOS file open** — needs `RunEvent::Opened`, not argv (Windows/Linux only
  so far).
- **CI** — never pushed; needs a `v*` tag. Bump `version` in `package.json` **and**
  `src-tauri/tauri.conf.json` together.
- **Code signing** — none. SmartScreen/Gatekeeper warnings on first launch.
- **No settings UI** — everything is `settings.toml` by hand.
- **macOS app menu** — relies on Tauri's default.
- CodeMirror language bundle is ~1.5 MB; trim via Crepe `featureConfigs` if it
  matters.
- Other‑Crepe‑popup vs `quit_on_escape` interaction is unguarded (only the block
  menu stops Esc).

## Gotchas (also in ARCHITECTURE.md §6)

- `dragDropEnabled: false` — required for table drag; loses drag‑a‑file‑to‑open.
- Don't call Milkdown's `callCommand` from our modules — use `@milkdown/kit/prose/*`.
- Repo is under a pCloud sync path — keep `target/` and `node_modules/` out of sync.
- `pnpm` build scripts gated: `pnpm-workspace.yaml` has the `allowBuilds` entries.
