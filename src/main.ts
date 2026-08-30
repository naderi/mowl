import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";

import { Editor } from "./editor";
import { TabBar, baseName, type Tab } from "./tabs";
import { applyTheme, nextTheme, onSystemThemeChange, type ThemePref } from "./theme";

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
  editor_font: string;
  editor_font_size: number;
  source_font: string;
  source_font_size: number;
  accent: string;
  open_files: string[];
  active_tab: number;
  recent_files: string[];
  window: WindowState;
}

interface SettingsPayload {
  settings: Settings;
  portable: boolean;
  location: string;
  open_with: string | null;
}

const win = getCurrentWindow();
const editorHost = document.getElementById("editor") as HTMLElement;
const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
const titleEl = document.getElementById("doc-title") as HTMLElement;
const editor = new Editor(editorHost);
const tabBar = new TabBar(document.getElementById("tabs") as HTMLElement);

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
  titleEl.textContent = mark + name;
  void win.setTitle(`${mark}${name} — MDee`);
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

function pushRecent(path: string): void {
  settings.recent_files = [
    path,
    ...settings.recent_files.filter((p) => p !== path),
  ].slice(0, 12);
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
      { title: "MDee", kind: "warning" },
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
    await message(String(e), { title: "MDee", kind: "error" });
    return;
  }

  const cur = tabBar.active;
  if (cur && !cur.path && !cur.dirty && cur.content === "") {
    cur.path = path;
    cur.saved = text;
    cur.content = text;
    cur.dirty = false;
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

  pushRecent(path);
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
    await message(String(e), { title: "MDee", kind: "error" });
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
  const ok = await saveDoc();
  if (ok) {
    pushRecent(dest);
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
    await message("HTML exported.", { title: "MDee" });
  } catch (e) {
    await message(String(e), { title: "MDee", kind: "error" });
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

function toggleSource(): void {
  const tab = tabBar.active;
  if (!tab) return;

  const md = readView();
  tab.content = md;
  const scroll = viewScrollTop();

  sourceMode = !sourceMode;
  editorHost.hidden = sourceMode;
  sourceEl.hidden = !sourceMode;

  writeView(md, sourceMode ? 0 : scroll);
  adoptNormalized(tab);
  tab.dirty = tab.content !== tab.saved;
  tabBar.refreshDirty();
  updateSourceButton();
  updateDirButtons();
  updateTitle();
  (sourceMode ? sourceEl : editor).focus();
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
        settings.quit_on_escape &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      ) {
        e.preventDefault();
        void quitApp();
        return;
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
      title: "MDee",
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

  applyAppearance();
  applyTheme(settings.theme);
  onSystemThemeChange(() => {});

  // React to hand edits of settings.toml (the file watcher emits this).
  void listen<Settings>("settings-changed", (e) => {
    const ext = e.payload;
    settings.theme = ext.theme;
    settings.direction = ext.direction;
    settings.spellcheck = ext.spellcheck;
    settings.quit_on_escape = ext.quit_on_escape;
    settings.editor_font = ext.editor_font;
    settings.editor_font_size = ext.editor_font_size;
    settings.source_font = ext.source_font;
    settings.source_font_size = ext.source_font_size;
    settings.accent = ext.accent;
    applyAppearance();
    applyTheme(settings.theme);
    if (!sourceMode) applyDirection(settings.direction === "rtl" ? "rtl" : "ltr");
    editor.setSpellcheck(settings.spellcheck);
  });

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
  updateSourceButton();
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
  await message(`Startup failed: ${String(e)}`, { title: "MDee", kind: "error" });
});
