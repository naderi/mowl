// The settings GUI: a full-screen overlay that flips in over the editor
// (Ctrl/Cmd+, or the gear button). One control per hand-editable settings.toml
// key. The panel is "dumb" — it renders controls and reports every change via
// `onChange`; main.ts owns the settings object, the apply-functions and the
// debounced save. App-managed keys (window geometry, open files) are not shown.

import { t, type I18nKey } from "./i18n";

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
  | { key: SettingKey; kind: "color"; label: I18nKey };

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
];

export class SettingsPanel {
  #el: HTMLElement;
  #open = false;
  #get: () => PanelSettings;
  #path = "";

  /** Reports every user change. main.ts applies + persists. */
  onChange: (key: SettingKey, value: string | number | boolean) => void =
    () => {};
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
  }

  /** Re-label everything after a language change. */
  retranslate(): void {
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

    const foot = document.createElement("p");
    foot.className = "settings-foot";
    foot.textContent = `${t("settings.savedNote")}  ${t("settings.fileAt", {
      path: this.#path,
    })}`;
    card.appendChild(foot);

    this.#el.appendChild(card);
  }

  #control(f: Field): HTMLElement {
    const row = document.createElement("label");
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
