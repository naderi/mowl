import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Editor } from "./editor";
import { TabBar, baseName, type Tab } from "./tabs";
import { applyTheme, nextTheme, onSystemThemeChange, type ThemePref } from "./theme";
import { FindBar, type FindStatus, type FindTarget } from "./find-bar";
import { isListMarker, type ListMarker } from "./markdown-serializer";

interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

interface Settings {
  theme: ThemePref;
  direction: "ltr" | "rtl";
  spellcheck: boolean;
  quit_on_escape: boolean;
  /** Bullet-list marker written on save: "*", "-" or "+". */
  list_marker: ListMarker;
  /** Show the full file path (not just the name) in the editor header. */
  show_path: boolean;
  /** Reopen the previous session's tabs on startup. */
  open_last_session: boolean;
  editor_font: string;
  editor_font_size: number;
  source_font: string;
  source_font_size: number;
  accent: string;
  open_files: string[];
  active_tab: number;
  window: WindowState;
}

interface SettingsPayload {
  settings: Settings;
  portable: boolean;
  location: string;
  open_with: string | null;
  version: string;
}

const win = getCurrentWindow();
const editorHost = document.getElementById("editor") as HTMLElement;
const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
const titleEl = document.getElementById("doc-title") as HTMLElement;
const editor = new Editor(editorHost);
const tabBar = new TabBar(document.getElementById("tabs") as HTMLElement);
const findBar = new FindBar(editorHost);

let settings: Settings;
let switching = false;
let sourceMode = false;
let persistTimer: number | undefined;

/** Current document text, from whichever view is active. */
function readView(): string {
  return sourceMode ? sourceEl.value : editor.getMarkdown();
}

/** Load `md` into the active view (and restore a scroll offset). */
function writeView(md: string, scrollTop = 0): void {
  if (sourceMode) {
    sourceEl.value = md;
    sourceEl.scrollTop = scrollTop;
    return;
  }
  switching = true;
  editor.setContent(md);
  requestAnimationFrame(() => {
    editorHost.scrollTop = scrollTop;
    switching = false;
  });
}

function viewScrollTop(): number {
  return (sourceMode ? sourceEl : editorHost).scrollTop;
}

/** How far the visible view is scrolled, as a 0..1 fraction of its range.
 *  Used to carry the reading position across a source/preview toggle. */
function viewScrollFraction(): number {
  const el = sourceMode ? sourceEl : editorHost;
  const range = el.scrollHeight - el.clientHeight;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, el.scrollTop / range));
}

/** Scroll the visible view to `frac` (0..1) of its range. The editor's height
 *  only settles after layout, so defer a frame there; the textarea is ready
 *  synchronously but must be set after `.focus()` (which scrolls its caret). */
function applyScrollFraction(frac: number): void {
  const el = sourceMode ? sourceEl : editorHost;
  const run = () => {
    const range = el.scrollHeight - el.clientHeight;
    el.scrollTop = range > 0 ? Math.round(frac * range) : 0;
  };
  if (sourceMode) run();
  else requestAnimationFrame(run);
}

/** Push the appearance-related settings into CSS custom properties. */
function applyAppearance(): void {
  const s = document.documentElement.style;
  const setOrClear = (name: string, value: string) => {
    const v = (value ?? "").trim();
    if (v) s.setProperty(name, v);
    else s.removeProperty(name);
  };
  s.setProperty("--editor-font-size", `${settings.editor_font_size || 16}px`);
  s.setProperty("--source-font-size", `${settings.source_font_size || 15}px`);
  setOrClear("--editor-font", settings.editor_font);
  setOrClear("--source-font", settings.source_font);
  setOrClear("--accent", settings.accent);
}

function applyDirection(dir: "ltr" | "rtl"): void {
  editor.setDirection(dir);
  editorHost.dir = dir;
  sourceEl.dir = "ltr"; // source is always left-to-right
  document.getElementById("btn-ltr")?.classList.toggle("active", dir === "ltr");
  document.getElementById("btn-rtl")?.classList.toggle("active", dir === "rtl");
}

/** RTL/LTR make no sense for raw Markdown — disable them in source view. */
function updateDirButtons(): void {
  for (const id of ["btn-ltr", "btn-rtl"]) {
    const b = document.getElementById(id) as HTMLButtonElement | null;
    if (b) b.disabled = sourceMode;
  }
}

function setDirection(dir: "ltr" | "rtl"): void {
  if (sourceMode || settings.direction === dir) return;
  settings.direction = dir;
  applyDirection(dir);
  persistSoon();
}

function stem(path: string | null): string {
  return baseName(path).replace(/\.[^.]+$/, "") || "document";
}

function updateTitle(): void {
  const tab = tabBar.active;
  const mark = tab?.dirty ? "• " : "";
  const name = baseName(tab?.path ?? null);
  const shown = settings?.show_path && tab?.path ? tab.path : name;
  titleEl.textContent = mark + shown;
  titleEl.title = tab?.path ?? "";
  void win.setTitle(`${mark}${name} — Mowl`);
}

function persistSoon(): void {
  settings.open_files = tabBar.tabs.filter((t) => t.path).map((t) => t.path as string);
  const activePath = tabBar.active?.path ?? null;
  const idx = activePath ? settings.open_files.indexOf(activePath) : -1;
  settings.active_tab = idx < 0 ? 0 : idx;

  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void invoke("save_settings", { settings });
  }, 800);
}

/** Crepe may reformat Markdown on load; adopt that as the tab's baseline so a
 *  freshly loaded document does not show up as dirty. */
function adoptNormalized(tab: Tab): void {
  if (sourceMode) return; // textarea keeps the text verbatim, nothing to adopt
  const md = editor.getMarkdown();
  tab.content = md;
  if (!tab.dirty) tab.saved = md;
}

function markDirtyFromView(): void {
  const tab = tabBar.active;
  if (!tab) return;
  tab.content = readView();
  tab.dirty = tab.content !== tab.saved;
  tabBar.refreshDirty();
  updateTitle();
  // No persist here: editing text changes nothing in settings.toml.
}

async function fileReadable(path: string): Promise<boolean> {
  try {
    await invoke<string>("read_document", { path });
    return true;
  } catch {
    return false;
  }
}

// --- tab wiring -------------------------------------------------------------

tabBar.onStructureChange = () => persistSoon();

tabBar.onActivate = (next: Tab, prev: Tab | null) => {
  if (prev) {
    prev.content = readView();
    prev.scrollTop = viewScrollTop();
  }
  editor.setDocPath(next.path);
  writeView(next.content, next.scrollTop);
  adoptNormalized(next);
  editor.setSpellcheck(settings.spellcheck);
  editor.setDirection(settings.direction);
  updateTitle();
  (sourceMode ? sourceEl : editor).focus();
  persistSoon();
};

tabBar.onCloseRequest = async (tab: Tab) => {
  if (tab.dirty) {
    const discard = await ask(
      `Discard unsaved changes to ${baseName(tab.path)}?`,
      { title: "Mowl", kind: "warning" },
    );
    if (!discard) return;
  }
  tabBar.remove(tab.id);
  persistSoon();
};

editor.onChange = () => {
  if (switching || sourceMode) return;
  markDirtyFromView();
};

sourceEl.addEventListener("input", () => {
  if (sourceMode) markDirtyFromView();
});

/** Edit the textarea via `execCommand` so it stays on the native undo stack
 *  (`setRangeText` / `value =` wipe undo history). Falls back if unsupported. */
function sourceEdit(text: string, from: number, to: number): void {
  sourceEl.focus();
  sourceEl.setSelectionRange(from, to);
  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    sourceEl.setRangeText(text, from, to, "end");
    markDirtyFromView();
  }
}

// Tab / Shift+Tab indent in the raw Markdown view (textarea has no default).
sourceEl.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  const unit = "\t";
  const { selectionStart: a, selectionEnd: b, value } = sourceEl;
  if (a === b && !e.shiftKey) {
    sourceEdit(unit, a, b);
  } else {
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const block = value.slice(lineStart, b);
    const changed = e.shiftKey
      ? block.replace(/^(\t| {1,2})/gm, "")
      : block.replace(/^/gm, unit);
    sourceEdit(changed, lineStart, b);
    sourceEl.setSelectionRange(lineStart, lineStart + changed.length);
  }
});

// --- file operations -------------------------------------------------------

function newTab(): void {
  tabBar.add(null, "");
}

async function openPath(path: string): Promise<void> {
  const existing = tabBar.findByPath(path);
  if (existing) {
    tabBar.activate(existing.id);
    return;
  }

  let text: string;
  try {
    text = await invoke<string>("read_document", { path });
  } catch (e) {
    await message(String(e), { title: "Mowl", kind: "error" });
    return;
  }

  const cur = tabBar.active;
  if (cur && !cur.path && !cur.dirty && cur.content === "") {
    cur.path = path;
    cur.saved = text;
    cur.content = text;
    cur.dirty = false;
    editor.setDocPath(path);
    writeView(text);
    adoptNormalized(cur);
    tabBar.render();
    editor.setSpellcheck(settings.spellcheck);
    editor.setDirection(settings.direction);
    (sourceMode ? sourceEl : editor).focus();
    updateTitle();
  } else {
    tabBar.add(path, text); // triggers onActivate -> editor.setContent
  }

  persistSoon();
}

async function openDialog(): Promise<void> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] }],
  });
  if (typeof picked === "string") await openPath(picked);
}

async function saveDoc(): Promise<boolean> {
  const tab = tabBar.active;
  if (!tab) return false;
  if (!tab.path) return saveAs();

  const md = readView();
  let written: string;
  try {
    // The backend beautifies GFM tables and returns the text it wrote.
    written = await invoke<string>("write_document", {
      path: tab.path,
      contents: md,
    });
  } catch (e) {
    await message(String(e), { title: "Mowl", kind: "error" });
    return false;
  }
  if (written !== md) writeView(written, viewScrollTop());
  tab.saved = written;
  tab.content = written;
  tab.dirty = false;
  tabBar.refreshDirty();
  updateTitle();
  persistSoon();
  return true;
}

async function saveAs(): Promise<boolean> {
  const tab = tabBar.active;
  if (!tab) return false;

  const dest = await save({
    defaultPath: tab.path ?? `${stem(tab.path)}.md`,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });
  if (!dest) return false;

  tab.path = dest;
  editor.setDocPath(dest);
  const ok = await saveDoc();
  if (ok) {
    tabBar.render();
    updateTitle();
    persistSoon();
  }
  return ok;
}

async function closeActiveTab(): Promise<void> {
  const tab = tabBar.active;
  if (tab) await tabBar.onCloseRequest(tab);
}

// --- export ---------------------------------------------------------------

async function exportHtml(): Promise<void> {
  const tab = tabBar.active;
  const dest = await save({
    defaultPath: `${stem(tab?.path ?? null)}.html`,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!dest) return;
  try {
    const html = await invoke<string>("render_html", {
      markdown: readView(),
      title: stem(tab?.path ?? null),
      dir: settings.direction,
    });
    await invoke("write_document", { path: dest, contents: html });
    await message("HTML exported.", { title: "Mowl" });
  } catch (e) {
    await message(String(e), { title: "Mowl", kind: "error" });
  }
}

async function exportPdf(): Promise<void> {
  const tab = tabBar.active;
  const html = await invoke<string>("render_html", {
    markdown: readView(),
    title: stem(tab?.path ?? null),
    dir: settings.direction,
  });
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  frame.srcdoc = html;
  frame.onload = () => {
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1500);
    }, 350);
  };
  document.body.appendChild(frame);
}

async function chooseExport(): Promise<void> {
  const asHtml = await ask("Export as HTML file?  (No = print / save as PDF)", {
    title: "Export",
  });
  if (asHtml) await exportHtml();
  else await exportPdf();
}

// --- source view --------------------------------------------------------

const ICON_TO_SOURCE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>';
const ICON_TO_WYSIWYG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';

function updateSourceButton(): void {
  const btn = document.getElementById("btn-source");
  if (!btn) return;
  btn.innerHTML = sourceMode ? ICON_TO_WYSIWYG : ICON_TO_SOURCE;
  btn.setAttribute(
    "title",
    sourceMode ? "Back to formatted view" : "Edit Markdown source",
  );
}

// --- theme button -----------------------------------------------------

const SVG_OPEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">';
const THEME_ICON: Record<ThemePref, string> = {
  // "auto": half-lit circle
  system: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>`,
  // sun
  light: `${SVG_OPEN}<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  // moon
  dark: `${SVG_OPEN}<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>`,
};
const THEME_LABEL: Record<ThemePref, string> = {
  system: "Theme: system — click for light",
  light: "Theme: light — click for dark",
  dark: "Theme: dark — click for system",
};

function updateThemeButton(): void {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  const pref = settings?.theme ?? "system";
  btn.innerHTML = THEME_ICON[pref];
  btn.setAttribute("title", THEME_LABEL[pref]);
}

function toggleSource(): void {
  const tab = tabBar.active;
  if (!tab) return;

  findBar.close();
  const md = readView();
  tab.content = md;
  const frac = viewScrollFraction(); // reading position in the outgoing view

  sourceMode = !sourceMode;
  editorHost.hidden = sourceMode;
  sourceEl.hidden = !sourceMode;

  writeView(md);
  adoptNormalized(tab);
  tab.dirty = tab.content !== tab.saved;
  tabBar.refreshDirty();
  updateSourceButton();
  updateDirButtons();
  updateTitle();
  (sourceMode ? sourceEl : editor).focus();
  // Last: focusing the textarea scrolls its caret (end of the freshly set
  // value) into view, so the reading position must be restored after it.
  applyScrollFraction(frac);
}

// --- find / replace -----------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const editorFindTarget: FindTarget = {
  selectionText: () => editor.selectionText(),
  setQuery: (q, cs) => editor.findSet(q, cs),
  step: (dir) => editor.findStep(dir),
  replace: (r) => editor.findReplace(r),
  replaceAll: (r) => editor.findReplaceAll(r),
  clear: () => editor.findClear(),
  focusView: () => editor.focus(),
};

function makeSourceFindTarget(): FindTarget {
  let query = "";
  let caseSensitive = false;
  let positions: number[] = [];
  let active = 0;

  const recompute = () => {
    positions = [];
    if (!query) return;
    const hay = caseSensitive ? sourceEl.value : sourceEl.value.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const stride = Math.max(1, needle.length);
    let i = hay.indexOf(needle);
    while (i !== -1) {
      positions.push(i);
      i = hay.indexOf(needle, i + stride);
    }
    if (active >= positions.length) active = 0;
  };

  const selectActive = () => {
    if (!positions.length) return;
    if (active >= positions.length) active = 0;
    const start = positions[active];
    sourceEl.focus();
    sourceEl.setSelectionRange(start, start + query.length);
    const lines = sourceEl.value.split("\n");
    const row = sourceEl.value.slice(0, start).split("\n").length - 1;
    const lineHeight = sourceEl.scrollHeight / Math.max(1, lines.length);
    sourceEl.scrollTop = Math.max(
      0,
      row * lineHeight - sourceEl.clientHeight / 2,
    );
  };

  const status = (): FindStatus => ({
    count: positions.length,
    index: positions.length ? active + 1 : 0,
  });

  return {
    selectionText: () =>
      sourceEl.value.slice(sourceEl.selectionStart, sourceEl.selectionEnd),
    setQuery(q, cs) {
      query = q;
      caseSensitive = cs;
      active = 0;
      recompute();
      selectActive();
      return status();
    },
    step(dir) {
      if (!positions.length) return status();
      active = (active + dir + positions.length) % positions.length;
      selectActive();
      return status();
    },
    replace(replacement) {
      if (!positions.length || !query) return status();
      if (active >= positions.length) active = 0;
      const start = positions[active];
      const current = sourceEl.value.slice(start, start + query.length);
      const hit = caseSensitive
        ? current === query
        : current.toLowerCase() === query.toLowerCase();
      if (hit) sourceEdit(replacement, start, start + query.length);
      recompute();
      selectActive();
      return status();
    },
    replaceAll(replacement) {
      if (!query) return status();
      const re = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
      const next = sourceEl.value.replace(re, () => replacement);
      if (next !== sourceEl.value) sourceEdit(next, 0, sourceEl.value.length);
      active = 0;
      recompute();
      return status();
    },
    clear() {
      query = "";
      positions = [];
    },
    focusView: () => sourceEl.focus(),
  };
}

const sourceFindTarget = makeSourceFindTarget();

function openFind(withReplace: boolean): void {
  findBar.bind(() => (sourceMode ? sourceFindTarget : editorFindTarget));
  findBar.open(withReplace);
}

// --- about panel --------------------------------------------------------

const aboutEl = document.getElementById("about") as HTMLElement;

function openAbout(): void {
  findBar.close();
  aboutEl.hidden = false;
}

function closeAbout(): void {
  aboutEl.hidden = true;
}

function wireAbout(): void {
  document.getElementById("btn-about")?.addEventListener("click", openAbout);
  aboutEl.querySelector(".about-close")?.addEventListener("click", closeAbout);
  aboutEl.addEventListener("click", (e) => {
    if (e.target === aboutEl) closeAbout(); // click on the backdrop
  });
  document.getElementById("about-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    void openUrl("https://github.com/naderi");
  });
}

// --- wiring --------------------------------------------------------------

function wireShortcuts(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      // Esc-to-quit (opt-in). Runs after the block menu's own Esc handler,
      // which stops propagation while it is open.
      if (
        e.key === "Escape" &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      ) {
        if (!aboutEl.hidden) {
          e.preventDefault();
          closeAbout();
          return;
        }
        if (findBar.isOpen) {
          e.preventDefault();
          findBar.close();
          return;
        }
        if (settings.quit_on_escape) {
          e.preventDefault();
          void quitApp();
          return;
        }
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s" && !e.shiftKey) {
        e.preventDefault();
        void saveDoc();
      } else if (k === "s" && e.shiftKey) {
        e.preventDefault();
        void saveAs();
      } else if (k === "o") {
        e.preventDefault();
        void openDialog();
      } else if (k === "n") {
        e.preventDefault();
        newTab();
      } else if (k === "w") {
        e.preventDefault();
        void closeActiveTab();
      } else if (k === "e") {
        e.preventDefault();
        void chooseExport();
      } else if (e.shiftKey && k === "c") {
        e.preventDefault();
        toggleSource();
      } else if (k === "f" && !e.shiftKey) {
        e.preventDefault();
        openFind(false);
      } else if (k === "h" && !e.shiftKey) {
        e.preventDefault();
        openFind(true);
      }
    },
    { capture: true },
  );
}

function wireButtons(): void {
  document.getElementById("btn-open")?.addEventListener("click", () => void openDialog());
  document.getElementById("btn-save")?.addEventListener("click", () => void saveDoc());
  document.getElementById("btn-export")?.addEventListener("click", () => void chooseExport());
  document.getElementById("btn-source")?.addEventListener("click", () => toggleSource());
  document.getElementById("btn-ltr")?.addEventListener("click", () => setDirection("ltr"));
  document.getElementById("btn-rtl")?.addEventListener("click", () => setDirection("rtl"));
  document.getElementById("btn-theme")?.addEventListener("click", () => {
    settings.theme = nextTheme(settings.theme);
    applyTheme(settings.theme);
    updateThemeButton();
    persistSoon();
  });
}

/** Immediately write settings, cancelling any pending debounced write. */
async function flushSettings(): Promise<void> {
  window.clearTimeout(persistTimer);
  try {
    await invoke("save_settings", { settings });
  } catch {
    /* nothing we can do on the way out */
  }
}

let scale = 1;

/** Snapshot the current geometry into `settings.window`. Uses outerPosition so
 *  it round-trips exactly with setPosition (which positions the outer frame). */
async function captureGeometry(): Promise<void> {
  let minimized = false;
  try {
    minimized = await win.isMinimized();
  } catch {
    /* permission absent -> assume not minimized */
  }
  if (minimized) return;

  const maximized = await win.isMaximized();
  settings.window.maximized = maximized;
  if (maximized) return; // keep the last un-maximized size/pos to restore to

  const pos = await win.outerPosition();
  const size = await win.innerSize();
  const x = Math.round(pos.x / scale);
  const y = Math.round(pos.y / scale);
  if (onScreenish(x, y)) {
    settings.window.x = x;
    settings.window.y = y;
  }
  settings.window.width = Math.round(size.width / scale);
  settings.window.height = Math.round(size.height / scale);
}

let closing = false;

/** Save geometry + settings and close, asking about unsaved changes first. */
async function quitApp(): Promise<void> {
  if (closing) return;
  closing = true;
  if (tabBar.tabs.some((t) => t.dirty)) {
    const quit = await ask("You have unsaved changes. Quit without saving?", {
      title: "Mowl",
      kind: "warning",
    });
    if (!quit) {
      closing = false;
      return;
    }
  }
  await captureGeometry();
  await flushSettings();
  await win.destroy();
}

async function wireWindowState(): Promise<void> {
  scale = await win.scaleFactor();

  await win.onResized(async () => {
    await captureGeometry();
    persistSoon();
  });
  await win.onMoved(async () => {
    await captureGeometry();
    persistSoon();
  });

  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    await quitApp();
  });
}

/** Reject positions that are clearly off every reasonable monitor layout
 *  (covers the ~-32000 sentinel Windows reports for a minimized window). */
function onScreenish(x: number, y: number): boolean {
  return x > -16000 && x < 16000 && y > -16000 && y < 16000;
}

async function restoreWindow(): Promise<void> {
  const w = settings.window;
  if (w.width > 200 && w.height > 150) {
    await win.setSize(new LogicalSize(w.width, w.height));
  }
  if (w.x !== null && w.y !== null && onScreenish(w.x, w.y)) {
    await win.setPosition(new LogicalPosition(w.x, w.y));
  }
  if (w.maximized) await win.maximize();
  await win.show();
  try {
    await win.setFocus();
  } catch {
    /* permission may be absent; not critical */
  }
}

async function restoreTabs(): Promise<void> {
  if (settings.open_last_session === false) {
    tabBar.add(null, "");
    return;
  }

  const wanted = (settings.open_files ?? []).filter(Boolean);
  const readable: string[] = [];
  for (const f of wanted) {
    if (await fileReadable(f)) readable.push(f);
  }

  if (readable.length === 0) {
    tabBar.add(null, "");
    return;
  }

  for (const f of readable) {
    const text = await invoke<string>("read_document", { path: f });
    tabBar.add(f, text, false);
  }
  const idx = Math.min(Math.max(settings.active_tab ?? 0, 0), readable.length - 1);
  tabBar.activate(tabBar.tabs[idx].id);
}

async function bootstrap(): Promise<void> {
  const payload = await invoke<SettingsPayload>("get_settings");
  settings = payload.settings;
  if (!isListMarker(settings.list_marker)) settings.list_marker = "*";

  applyAppearance();
  applyTheme(settings.theme);
  editor.setListMarker(settings.list_marker);
  onSystemThemeChange(() => {});

  // React to hand edits of settings.toml (the file watcher emits this).
  void listen<Settings>("settings-changed", (e) => {
    const ext = e.payload;
    settings.theme = ext.theme;
    settings.direction = ext.direction;
    settings.spellcheck = ext.spellcheck;
    settings.quit_on_escape = ext.quit_on_escape;
    settings.show_path = ext.show_path;
    settings.open_last_session = ext.open_last_session;
    settings.editor_font = ext.editor_font;
    settings.editor_font_size = ext.editor_font_size;
    settings.source_font = ext.source_font;
    settings.source_font_size = ext.source_font_size;
    settings.accent = ext.accent;
    applyAppearance();
    applyTheme(settings.theme);
    updateThemeButton();
    if (!sourceMode) applyDirection(settings.direction === "rtl" ? "rtl" : "ltr");
    editor.setSpellcheck(settings.spellcheck);
    updateTitle();

    if (isListMarker(ext.list_marker) && ext.list_marker !== settings.list_marker) {
      settings.list_marker = ext.list_marker;
      editor.setListMarker(ext.list_marker);
      if (!sourceMode) {
        switching = true;
        void editor.reload().then(() => {
          applyDirection(settings.direction === "rtl" ? "rtl" : "ltr");
          editor.setSpellcheck(settings.spellcheck);
          switching = false;
          markDirtyFromView();
        });
      }
    }
  });

  const aboutVersion = document.getElementById("about-version");
  if (aboutVersion) aboutVersion.textContent = `v${payload.version}`;
  const aboutPath = document.getElementById("about-settings-path");
  if (aboutPath) aboutPath.textContent = payload.location;

  if (!payload.portable) {
    const hint = document.getElementById("settings-hint") as HTMLElement;
    hint.textContent = `Program folder is read-only — settings saved to ${payload.location}`;
    hint.hidden = false;
  }

  await editor.init("");
  applyDirection(settings.direction === "rtl" ? "rtl" : "ltr");

  // Show the window early so a slow or failing later step can never leave it
  // stuck hidden in the taskbar.
  await restoreWindow();

  await restoreTabs();

  // A file passed on the command line (double-click / "Open with").
  if (payload.open_with) await openPath(payload.open_with);

  // Further "open with" launches are routed here by the single-instance plugin.
  void listen<string>("open-file", async (e) => {
    await openPath(e.payload);
    try {
      await win.unminimize();
      await win.setFocus();
    } catch {
      /* not critical */
    }
  });

  wireButtons();
  wireAbout();
  updateSourceButton();
  updateThemeButton();
  updateDirButtons();
  wireShortcuts();
  await wireWindowState();
}

bootstrap().catch(async (e) => {
  try {
    await win.show();
    await win.setFocus();
  } catch {
    /* ignore */
  }
  await message(`Startup failed: ${String(e)}`, { title: "Mowl", kind: "error" });
});
