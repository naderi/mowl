# MDee

A minimalist, portable **WYSIWYG Markdown editor**. Type Markdown, see it
formatted inline (Typora‑style). Light and dark themes, single‑file editing,
runs on Windows, macOS and Linux (x64 and arm64).

- **WYSIWYG editing** via [Milkdown Crepe](https://milkdown.dev) (ProseMirror)
- **Tabs** with session restore
- **Source view** toggle (`Ctrl/Cmd+Shift+C`) — raw Markdown in a plain editor
- **Block menu** on the `⠿` handle: turn into heading / list / quote / code /
  table, insert line, duplicate, delete
- **GFM** + tables (drag rows/columns, auto‑aligned on save), task lists, footnotes
- **Code blocks** with syntax highlighting
- **Math** with KaTeX (`$…$`, `$$…$$`)
- **RTL / LTR** toggle for Persian / Arabic / Hebrew (code stays LTR)
- **Link from clipboard**: select text, paste a URL (or `Ctrl/Cmd+K`)
- **Export** to self‑contained HTML, or PDF via the system print dialog
- **File associations** — set MDee as the default app for `.md` (installer only)
- **Portable**: one `settings.toml` next to the executable, hand‑editable, live‑reloaded

Extending MDee? Read **[ARCHITECTURE.md](ARCHITECTURE.md)** first — it maps every
file and shows how to add buttons, menu items, settings and commands.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | [Tauri v2](https://tauri.app) (Rust, system WebView) |
| Editor | `@milkdown/crepe` |
| Markdown → HTML (export) | `comrak` (Rust) |

## Development

Prerequisites:

- Rust (stable, MSVC toolchain on Windows) — <https://rustup.rs>
- Node 20+ and `pnpm`
- Platform WebView deps — see <https://tauri.app/start/prerequisites/>
  (Windows: MSVC C++ Build Tools + Windows SDK; WebView2 ships with Win10/11)

```bash
pnpm install
pnpm tauri dev                       # run (HMR + Rust auto-rebuild)
pnpm tauri build                     # release bundles for the host OS
pnpm tauri build --bundles nsis      # Windows: installer only (+ portable exe)
pnpm exec tsc --noEmit               # frontend typecheck
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

**Cutting a release:** bump `version` in **both** `package.json` and
`src-tauri/tauri.conf.json`, push a `v*` tag → `.github/workflows/release.yml`
builds Windows/macOS/Linux (x64 + arm64) and opens a draft GitHub release with
SHA‑256 checksums.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the file map and extension recipes.

## Configuration

One `settings.toml` sits next to the executable (portable) or in the OS config
dir. The top section is meant for hand editing; the app edits it live while
running and picks up your changes within ~1 second (no restart).

```toml
theme = "system"            # system | light | dark
direction = "ltr"           # ltr | rtl
spellcheck = true
quit_on_escape = false      # press Esc to quit
editor_font = ""            # WYSIWYG font family (blank = default)
editor_font_size = 16       # headings scale from this
source_font = ""            # Markdown source font (monospace)
source_font_size = 15
accent = ""                 # accent colour, e.g. "#0969da"

# below: managed by the app — window geometry, open tabs, recent files
```

## Portable install

On first run MDee writes `settings.toml` into the folder that contains the
executable (on macOS: next to the `.app` bundle). If that folder is read‑only
it falls back to the OS config directory and shows a hint in the window.
The WebView2 cache on Windows is kept under `./data/webview2` in portable mode.

## Releases are unsigned

Builds are **not** code‑signed or notarized.

- **Windows** – SmartScreen may warn on first launch: *More info → Run anyway*.
- **macOS** – Gatekeeper blocks unsigned apps: right‑click the app → *Open*, or
  run `xattr -dr com.apple.quarantine /path/to/MDee.app`.
- **Linux** – the AppImage needs no signing; `chmod +x` and run.

SHA‑256 checksums are published with every release.

## Licence

MIT
