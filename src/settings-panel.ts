// The settings GUI: a full-screen overlay that flips in over the editor
// (Ctrl/Cmd+, or the gear button). One control per hand-editable settings.toml
// key. The panel is "dumb" — it renders controls and reports every change via
// `onChange`; main.ts owns the settings object, the apply-functions and the
// debounced save. App-managed keys (window geometry, open files) are not shown.

import { t, type I18nKey } from "./i18n";
import {
  formatShortcut,
  isAssignable,
  shortcutFromEvent,
  type ShortcutAction,
  type ShortcutSettings,
} from "./shortcuts";

/** The subset of `Settings` (main.ts) the panel reads/writes. */
export interface PanelSettings {
  language: string;
  theme: string;
  direction: string;
  spellcheck: boolean;
  quit_on_escape: boolean;
  always_show_tabbar: boolean;
  open_last_session: boolean;
  show_path: boolean;
  list_marker: string;
  editor_font: string;
  editor_font_size: number;
  source_font: string;
  source_font_size: number;
  accent: string;
  auto_check_updates: boolean;
  shortcuts: ShortcutSettings;
}

export type SettingKey = keyof PanelSettings;

type Field =
  | { key: SettingKey; kind: "checkbox"; label: I18nKey }
  | {
      key: SettingKey;
      kind: "select";
      label: I18nKey;
      hint?: I18nKey;
      options: { value: string; label: I18nKey }[];
    }
  | { key: SettingKey; kind: "text"; label: I18nKey; placeholder?: I18nKey }
  | { key: SettingKey; kind: "number"; label: I18nKey; min: number; max: number }
  | { key: SettingKey; kind: "color"; label: I18nKey }
  | { action: ShortcutAction; kind: "shortcut"; label: I18nKey };

interface Section {
  title: I18nKey;
  fields: Field[];
}

const SECTIONS: Section[] = [
  {
    title: "settings.section.appearance",
    fields: [
      {
        key: "language",
        kind: "select",
        label: "settings.language",
        options: [
          { value: "system", label: "settings.language.system" },
          { value: "en", label: "settings.language.en" },
          { value: "de", label: "settings.language.de" },
        ],
      },
      {
        key: "theme",
        kind: "select",
        label: "settings.theme",
        options: [
          { value: "system", label: "settings.theme.system" },
          { value: "light", label: "settings.theme.light" },
          { value: "dark", label: "settings.theme.dark" },
        ],
      },
      {
        key: "direction",
        kind: "select",
        label: "settings.direction",
        hint: "settings.direction.hint",
        options: [
          { value: "ltr", label: "settings.direction.ltr" },
          { value: "rtl", label: "settings.direction.rtl" },
        ],
      },
      { key: "accent", kind: "color", label: "settings.accent" },
    ],
  },
  {
    title: "settings.section.editor",
    fields: [
      { key: "spellcheck", kind: "checkbox", label: "settings.spellcheck" },
      {
        key: "list_marker",
        kind: "select",
        label: "settings.listMarker",
        options: [
          { value: "*", label: "settings.language.system" }, // label overridden below
          { value: "-", label: "settings.language.system" },
          { value: "+", label: "settings.language.system" },
        ],
      },
      { key: "show_path", kind: "checkbox", label: "settings.showPath" },
    ],
  },
  {
    title: "settings.section.behavior",
    fields: [
      { key: "quit_on_escape", kind: "checkbox", label: "settings.quitOnEscape" },
      {
        key: "always_show_tabbar",
        kind: "checkbox",
        label: "settings.alwaysShowTabbar",
      },
      {
        key: "open_last_session",
        kind: "checkbox",
        label: "settings.openLastSession",
      },
    ],
  },
  {
    title: "settings.section.fonts",
    fields: [
      {
        key: "editor_font",
        kind: "text",
        label: "settings.editorFont",
        placeholder: "settings.editorFont.placeholder",
      },
      {
        key: "editor_font_size",
        kind: "number",
        label: "settings.editorFontSize",
        min: 8,
        max: 40,
      },
      {
        key: "source_font",
        kind: "text",
        label: "settings.sourceFont",
        placeholder: "settings.sourceFont.placeholder",
      },
      {
        key: "source_font_size",
        kind: "number",
        label: "settings.sourceFontSize",
        min: 8,
        max: 40,
      },
    ],
  },
  {
    title: "settings.section.shortcuts",
    fields: [
      { action: "new_tab", kind: "shortcut", label: "settings.shortcut.newTab" },
      { action: "open", kind: "shortcut", label: "settings.shortcut.open" },
      { action: "save", kind: "shortcut", label: "settings.shortcut.save" },
      { action: "save_as", kind: "shortcut", label: "settings.shortcut.saveAs" },
      { action: "close_tab", kind: "shortcut", label: "settings.shortcut.closeTab" },
      { action: "export", kind: "shortcut", label: "settings.shortcut.export" },
      {
        action: "toggle_source",
        kind: "shortcut",
        label: "settings.shortcut.toggleSource",
      },
      { action: "find", kind: "shortcut", label: "settings.shortcut.find" },
      { action: "replace", kind: "shortcut", label: "settings.shortcut.replace" },
      { action: "emoji", kind: "shortcut", label: "settings.shortcut.emoji" },
      { action: "settings", kind: "shortcut", label: "settings.shortcut.settings" },
    ],
  },
];

export class SettingsPanel {
  #el: HTMLElement;
  #open = false;
  #get: () => PanelSettings;
  #path = "";
  #capturingShortcut: ShortcutAction | null = null;
  #openWithAvailable = false;
  #updatesSupported = false;
  #openWithRegistered = false;
  #openWithBusy = false;
  #openWithBtn: HTMLButtonElement | null = null;

  /** Reports every user change. main.ts applies + persists. */
  onChange: (key: SettingKey, value: string | number | boolean) => void =
    () => {};
  onShortcutChange: (action: ShortcutAction, value: string) => void = () => {};
  /** Register / unregister Mowl as an "Open with" app (Windows). */
  onOpenWithToggle: () => void | Promise<void> = async () => {};
  /** Run an update check; resolves to a one-line result to show next to the button. */
  onCheckUpdates: () => Promise<string> = async () => "";
  /** Return focus to the editor after closing. */
  onClose: () => void = () => {};

  constructor(getSettings: () => PanelSettings) {
    this.#get = getSettings;
    this.#el = document.createElement("div");
    this.#el.id = "settings-panel";
    this.#el.hidden = true;
    document.body.appendChild(this.#el);
    this.#build();
  }

  /** The settings.toml path shown in the footer (known after get_settings). */
  setPath(path: string): void {
    this.#path = path;
    const foot = this.#el.querySelector(".settings-foot");
    if (foot) {
      foot.textContent = `${t("settings.savedNote")}  ${t("settings.fileAt", {
        path,
      })}`;
    }
  }

  get isOpen(): boolean {
    return this.#open;
  }

  /** Backend reported the system "Open with" state; the section only exists
   *  where the feature is available. */
  setOpenWith(available: boolean, registered: boolean): void {
    const rebuild = available !== this.#openWithAvailable;
    this.#openWithAvailable = available;
    this.#openWithRegistered = registered;
    if (rebuild) {
      this.#build();
      this.refresh();
    } else {
      this.#syncOpenWith();
    }
  }

  /** Only builds that can update themselves show the update setting. */
  setUpdatesSupported(supported: boolean): void {
    if (supported === this.#updatesSupported) return;
    this.#updatesSupported = supported;
    this.#build();
    this.refresh();
  }

  #syncOpenWith(): void {
    const btn = this.#openWithBtn;
    if (!btn) return;
    btn.textContent = t(
      this.#openWithRegistered ? "settings.openWith.remove" : "settings.openWith.register",
    );
    btn.disabled = this.#openWithBusy;
  }

  /** True while a shortcut field waits for a key press — app shortcuts must
   *  stand down so the press is captured instead of executed. */
  get isCapturingShortcut(): boolean {
    return this.#capturingShortcut !== null;
  }

  open(): void {
    this.#el.hidden = false;
    this.refresh();
    // next frame so the transition runs from the hidden state
    requestAnimationFrame(() => {
      document.getElementById("app")?.classList.add("settings-open");
      this.#el.classList.add("open");
      this.#open = true;
      this.#el.querySelector<HTMLElement>("select, input, button")?.focus();
    });
  }

  close(): void {
    if (!this.#open) return;
    this.#capturingShortcut = null;
    this.#open = false;
    this.#el.classList.remove("open");
    document.getElementById("app")?.classList.remove("settings-open");
    const done = () => {
      if (!this.#open) this.#el.hidden = true;
      this.#el.removeEventListener("transitionend", done);
    };
    this.#el.addEventListener("transitionend", done);
    window.setTimeout(done, 500); // fallback if transitionend is missed
    this.onClose();
  }

  /** Rewrite every control from the current settings. */
  refresh(): void {
    const s = this.#get();
    for (const section of SECTIONS) {
      for (const f of section.fields) {
        if (f.kind === "shortcut") {
          const btn = this.#el.querySelector<HTMLButtonElement>(
            `[data-shortcut="${f.action}"]`,
          );
          if (btn && this.#capturingShortcut !== f.action) {
            btn.textContent = formatShortcut(s.shortcuts[f.action]);
          }
          continue;
        }
        const ctl = this.#el.querySelector<HTMLElement>(`[data-key="${f.key}"]`);
        if (!ctl) continue;
        const raw = s[f.key];
        if (f.kind === "checkbox") {
          (ctl as HTMLInputElement).checked = Boolean(raw);
        } else if (f.kind === "color") {
          const [color, text] = ctl.querySelectorAll("input");
          const hex = typeof raw === "string" && raw ? raw : "";
          (color as HTMLInputElement).value = hex || "#4a7dff";
          (text as HTMLInputElement).value = hex;
        } else {
          (ctl as HTMLInputElement | HTMLSelectElement).value = String(raw ?? "");
        }
      }
    }
    const auto = this.#el.querySelector<HTMLInputElement>('[data-key="auto_check_updates"]');
    if (auto) auto.checked = Boolean(s.auto_check_updates);
  }

  /** Re-label everything after a language change. */
  retranslate(): void {
    this.#capturingShortcut = null;
    this.#build();
    this.refresh();
  }

  #emit(key: SettingKey, value: string | number | boolean): void {
    this.onChange(key, value);
  }

  #build(): void {
    this.#el.replaceChildren();

    const card = document.createElement("div");
    card.className = "settings-card";

    const head = document.createElement("div");
    head.className = "settings-head";
    const h = document.createElement("h2");
    h.textContent = t("settings.title");
    const x = document.createElement("button");
    x.className = "settings-close";
    x.setAttribute("aria-label", t("about.close"));
    x.textContent = "×";
    x.addEventListener("click", () => this.close());
    head.append(h, x);
    card.appendChild(head);

    for (const section of SECTIONS) {
      const fs = document.createElement("fieldset");
      const lg = document.createElement("legend");
      lg.textContent = t(section.title);
      fs.appendChild(lg);
      for (const f of section.fields) fs.appendChild(this.#control(f));
      card.appendChild(fs);
    }

    this.#openWithBtn = null;
    if (this.#openWithAvailable || this.#updatesSupported) {
      card.appendChild(this.#systemSection());
    }

    const foot = document.createElement("p");
    foot.className = "settings-foot";
    foot.textContent = `${t("settings.savedNote")}  ${t("settings.fileAt", {
      path: this.#path,
    })}`;
    card.appendChild(foot);

    this.#el.appendChild(card);
  }

  /** "Check for updates automatically" with a "Check now" button on the right. */
  #updateRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row settings-row--update";

    const label = document.createElement("label");
    label.className = "settings-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = "auto_check_updates";
    cb.addEventListener("change", () => this.#emit("auto_check_updates", cb.checked));
    const text = document.createElement("span");
    text.className = "settings-label";
    text.textContent = t("settings.autoUpdate");
    label.append(cb, text);

    const status = document.createElement("span");
    status.className = "settings-hint-text settings-update-status";
    status.setAttribute("aria-live", "polite");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-action";
    btn.textContent = t("settings.checkNow");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = t("update.checking");
      status.textContent = "";
      try {
        status.textContent = await this.onCheckUpdates();
      } finally {
        btn.disabled = false;
        btn.textContent = t("settings.checkNow");
      }
    });

    row.append(label, status, btn);
    return row;
  }

  #systemSection(): HTMLElement {
    const fs = document.createElement("fieldset");
    const lg = document.createElement("legend");
    lg.textContent = t("settings.section.system");
    fs.appendChild(lg);

    if (this.#updatesSupported) fs.appendChild(this.#updateRow());
    if (!this.#openWithAvailable) return fs;

    const row = document.createElement("div");
    row.className = "settings-row settings-row--action";
    const label = document.createElement("span");
    label.className = "settings-label";
    label.textContent = t("settings.openWith");
    label.title = t("settings.openWith.hint");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-action";
    btn.addEventListener("click", async () => {
      if (this.#openWithBusy) return;
      this.#openWithBusy = true;
      this.#syncOpenWith();
      try {
        await this.onOpenWithToggle();
      } finally {
        this.#openWithBusy = false;
        this.#syncOpenWith();
      }
    });
    this.#openWithBtn = btn;
    this.#syncOpenWith();

    row.append(label, btn);
    fs.appendChild(row);
    return fs;
  }

  /** A button that, once clicked, records the next key combination. */
  #shortcutButton(action: ShortcutAction): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-shortcut";
    btn.dataset.shortcut = action;
    // filled with the real binding by refresh()
    btn.textContent = "—";

    const idle = () => {
      this.#capturingShortcut = null;
      btn.classList.remove("listening", "conflict");
      btn.textContent = formatShortcut(this.#get().shortcuts[action]);
      btn.title = "";
    };
    const reject = (msg: I18nKey) => {
      btn.classList.add("conflict");
      btn.textContent = t(msg);
      window.setTimeout(() => {
        if (this.#capturingShortcut !== action) return;
        btn.classList.remove("conflict");
        btn.textContent = t("settings.shortcut.capture");
      }, 1200);
    };

    btn.addEventListener("click", () => {
      if (this.#capturingShortcut === action) return;
      // only one field listens at a time
      this.#el
        .querySelectorAll<HTMLButtonElement>(".settings-shortcut.listening")
        .forEach((other) => other.blur());
      this.#capturingShortcut = action;
      btn.classList.add("listening");
      btn.classList.remove("conflict");
      btn.textContent = t("settings.shortcut.capture");
      btn.title = t("settings.shortcut.cancelHint");
    });
    btn.addEventListener("blur", () => {
      if (this.#capturingShortcut === action) idle();
    });
    btn.addEventListener("keydown", (e) => {
      if (this.#capturingShortcut !== action) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        idle();
        return;
      }
      const binding = shortcutFromEvent(e);
      if (!binding) return; // a modifier on its own — keep waiting
      if (!isAssignable(binding)) return reject("settings.shortcut.invalid");
      const shortcuts = this.#get().shortcuts;
      const taken = (Object.keys(shortcuts) as ShortcutAction[]).some(
        (a) => a !== action && shortcuts[a] === binding,
      );
      if (taken) return reject("settings.shortcut.conflict");
      this.#capturingShortcut = null;
      btn.classList.remove("listening", "conflict");
      btn.textContent = formatShortcut(binding);
      btn.title = "";
      this.onShortcutChange(action, binding);
    });
    return btn;
  }

  #control(f: Field): HTMLElement {
    const row = document.createElement(f.kind === "shortcut" ? "div" : "label");
    row.className = "settings-row settings-row--" + f.kind;

    const labelText = document.createElement("span");
    labelText.className = "settings-label";
    labelText.textContent = t(f.label);
    if (f.kind === "select" && f.hint) {
      const hint = document.createElement("span");
      hint.className = "settings-hint-text";
      hint.textContent = " — " + t(f.hint);
      labelText.appendChild(hint);
    }

    let control: HTMLElement;
    if (f.kind === "checkbox") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.key = f.key;
      cb.addEventListener("change", () => this.#emit(f.key, cb.checked));
      control = cb;
      row.prepend(cb);
      row.append(labelText);
      return row;
    }

    row.append(labelText);

    if (f.kind === "shortcut") {
      row.append(this.#shortcutButton(f.action));
      return row;
    }

    if (f.kind === "select") {
      const sel = document.createElement("select");
      sel.dataset.key = f.key;
      for (const o of f.options) {
        const opt = document.createElement("option");
        opt.value = o.value;
        // list_marker options show the literal marker, not a translated label
        opt.textContent = f.key === "list_marker" ? o.value : t(o.label);
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => this.#emit(f.key, sel.value));
      control = sel;
    } else if (f.kind === "number") {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = String(f.min);
      inp.max = String(f.max);
      inp.dataset.key = f.key;
      inp.addEventListener("change", () => {
        const n = Math.max(f.min, Math.min(f.max, Number(inp.value) || f.min));
        inp.value = String(n);
        this.#emit(f.key, n);
      });
      control = inp;
    } else if (f.kind === "color") {
      const wrap = document.createElement("span");
      wrap.className = "settings-color";
      wrap.dataset.key = f.key;
      const color = document.createElement("input");
      color.type = "color";
      const text = document.createElement("input");
      text.type = "text";
      text.placeholder = "#4a7dff";
      text.spellcheck = false;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "settings-color-clear";
      clear.textContent = t("settings.accent.clear");
      const commit = (hex: string) => {
        text.value = hex;
        if (hex) color.value = hex;
        this.#emit(f.key, hex);
      };
      color.addEventListener("input", () => commit(color.value));
      text.addEventListener("change", () => {
        const v = text.value.trim();
        commit(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : "");
      });
      clear.addEventListener("click", () => commit(""));
      wrap.append(color, text, clear);
      control = wrap;
    } else {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.spellcheck = false;
      if (f.placeholder) inp.placeholder = t(f.placeholder);
      inp.dataset.key = f.key;
      inp.addEventListener("change", () => this.#emit(f.key, inp.value.trim()));
      control = inp;
    }

    row.append(control);
    return row;
  }
}
