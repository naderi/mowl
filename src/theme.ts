// Theme handling: resolves "system" against the OS preference, swaps the
// compiled Crepe theme stylesheet at runtime and applies colour themes (VS Code
// theme format, bundled or from the Themes folder) on top of it.
import frameLight from "@milkdown/crepe/theme/frame.css?inline";
import frameDark from "@milkdown/crepe/theme/frame-dark.css?inline";
import { invoke } from "@tauri-apps/api/core";

/** "system" | "light" | "dark", or the id (file name) of a colour theme. */
export type ThemePref = string;

export interface TokenRule {
  scopes: string[];
  foreground: string | null;
  font_style: string | null;
}

export interface ColourTheme {
  id: string;
  name: string;
  dark: boolean;
  colors: Record<string, string>;
  tokens: TokenRule[];
}

const mql = window.matchMedia("(prefers-color-scheme: dark)");
let currentPref: ThemePref = "system";
let onResolvedChange: (mode: "light" | "dark") => void = () => {};
let colourThemes: ColourTheme[] = [];

/** TextMate scope each highlighted token kind is looked up under (see code-theme.ts). */
export const TOKEN_SCOPES: Record<string, string> = {
  comment: "comment",
  string: "string",
  escape: "constant.character.escape",
  number: "constant.numeric",
  literal: "constant.language",
  keyword: "keyword",
  control: "keyword.control.flow",
  operator: "keyword.operator",
  storage: "storage.type",
  type: "entity.name.type",
  func: "entity.name.function",
  variable: "variable",
  property: "support.type.property-name",
  attribute: "entity.other.attribute-name",
  tag: "entity.name.tag",
  punctuation: "punctuation",
  meta: "meta.preprocessor",
  annotation: "meta.annotation",
  heading: "markup.heading",
  strong: "markup.bold",
  emphasis: "markup.italic",
  link: "markup.underline.link",
  inserted: "markup.inserted",
  deleted: "markup.deleted",
  changed: "markup.changed",
  invalid: "invalid",
};

function themeStyleEl(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

/** (Re)load the list of colour themes; call again to pick up files added to the Themes folder. */
export async function loadColourThemes(): Promise<ColourTheme[]> {
  try {
    colourThemes = await invoke<ColourTheme[]>("list_themes");
  } catch {
    colourThemes = [];
  }
  return colourThemes;
}

function colourThemeFor(pref: ThemePref): ColourTheme | undefined {
  if (pref === "system" || pref === "light" || pref === "dark") return undefined;
  return colourThemes.find((t) => t.id === pref.toLowerCase());
}

/** Whether `pref` names a colour theme that is available (its code colours are active). */
export function isColourTheme(pref: ThemePref): boolean {
  return colourThemeFor(pref) !== undefined;
}

/** Foreground and font style of the most specific rule for `scope` ("keyword.control" falls back to "keyword"). */
function tokenStyle(theme: ColourTheme, scope: string): { fg?: string; style?: string } {
  let best = -1;
  let found: TokenRule | undefined;
  for (const rule of theme.tokens) {
    for (const s of rule.scopes) {
      if ((scope === s || scope.startsWith(s + ".")) && s.length > best) {
        best = s.length;
        found = rule;
      }
    }
  }
  return { fg: found?.foreground ?? undefined, style: found?.font_style ?? undefined };
}

function themeCss(theme: ColourTheme): string {
  const c = theme.colors;
  const bg = c["editor.background"] ?? (theme.dark ? "#1e1e1e" : "#ffffff");
  const fg = c["editor.foreground"] ?? c["foreground"] ?? (theme.dark ? "#d4d4d4" : "#333333");
  const mix = (pct: number) => `color-mix(in srgb, ${fg} ${pct}%, ${bg})`;
  const barBg = c["editorGroupHeader.tabsBackground"] ?? c["titleBar.activeBackground"] ?? mix(4);
  const barFg = c["tab.inactiveForeground"] ?? c["statusBar.foreground"] ?? mix(65);
  const border = c["tab.border"] ?? c["menu.separatorBackground"] ?? c["editorWidget.border"] ?? mix(18);
  const hover = c["tab.hoverBackground"] ?? mix(10);
  const accent = c["textLink.foreground"] ?? c["focusBorder"] ?? c["tab.activeBorderTop"] ?? "#4a7dff";
  const danger = tokenStyle(theme, "markup.deleted").fg ?? tokenStyle(theme, "invalid").fg ?? "#ba1a1a";
  const inlineCode = tokenStyle(theme, "markup.inline.raw").fg ?? tokenStyle(theme, "string").fg ?? accent;

  const root = [
    `--bg:${bg}`,
    `--fg:${fg}`,
    `--bar-bg:${barBg}`,
    `--bar-fg:${barFg}`,
    `--border:${border}`,
    `--hover:${hover}`,
    `--accent:${accent}`,
  ];
  for (const [name, scope] of Object.entries(TOKEN_SCOPES)) {
    const { fg: tokFg, style } = tokenStyle(theme, scope);
    root.push(`--tok-${name}:${tokFg ?? (name === "link" ? accent : fg)}`);
    root.push(`--tok-${name}-italic:${style?.includes("italic") ? "italic" : "normal"}`);
    root.push(`--tok-${name}-bold:${style?.includes("bold") ? "bold" : "normal"}`);
  }
  const crepe = [
    `--crepe-color-background:${bg}`,
    `--crepe-color-on-background:${fg}`,
    `--crepe-color-surface:${c["menu.background"] ?? mix(4)}`,
    `--crepe-color-surface-low:${mix(8)}`,
    `--crepe-color-on-surface:${fg}`,
    `--crepe-color-on-surface-variant:${barFg}`,
    `--crepe-color-outline:${mix(35)}`,
    `--crepe-color-primary:var(--accent)`,
    `--crepe-color-secondary:${mix(15)}`,
    `--crepe-color-on-secondary:${fg}`,
    `--crepe-color-inverse:${fg}`,
    `--crepe-color-on-inverse:${bg}`,
    `--crepe-color-inline-code:${inlineCode}`,
    `--crepe-color-error:${danger}`,
    `--crepe-color-hover:${mix(8)}`,
    `--crepe-color-selected:${mix(14)}`,
    `--crepe-color-inline-area:${mix(10)}`,
  ];
  const sel = c["editor.selectionBackground"];
  return [
    `:root[data-theme][data-colour-theme]{${root.join(";")};color-scheme:${theme.dark ? "dark" : "light"}}`,
    `#editor .milkdown{${crepe.join(";")}}`,
    sel ? `#editor ::selection,#source::selection{background:${sel}}` : "",
    // CodeMirror's built-in light colours for the current line and selection would clash on dark themes
    `#editor .cm-activeLine{background:${mix(6)}}`,
    `#editor .cm-activeLineGutter{background:${mix(6)};color:${fg}}`,
    sel
      ? `#editor .cm-editor .cm-selectionBackground,#editor .cm-editor.cm-focused>.cm-scroller>.cm-selectionLayer .cm-selectionBackground{background:${sel}}`
      : "",
    c["editorCursor.foreground"]
      ? `#editor .ProseMirror{caret-color:${c["editorCursor.foreground"]}}#editor .cm-cursor{border-left-color:${c["editorCursor.foreground"]}}`
      : "",
  ].join("\n");
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  const ct = colourThemeFor(pref);
  if (ct) return ct.dark ? "dark" : "light";
  if (pref === "light" || pref === "dark") return pref;
  return mql.matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref): "light" | "dark" {
  currentPref = pref;
  const ct = colourThemeFor(pref);
  const mode = resolveTheme(pref);
  document.documentElement.dataset.theme = mode;
  themeStyleEl("crepe-theme").textContent = mode === "dark" ? frameDark : frameLight;
  if (ct) document.documentElement.dataset.colourTheme = ct.id;
  else delete document.documentElement.dataset.colourTheme;
  themeStyleEl("colour-theme").textContent = ct ? themeCss(ct) : "";
  // native title bar and its buttons in the theme's colours (system default without a colour theme)
  const bar = ct?.colors["titleBar.activeBackground"] ?? ct?.colors["editor.background"] ?? null;
  const barText = ct?.colors["titleBar.activeForeground"] ?? ct?.colors["editor.foreground"] ?? null;
  void invoke("set_title_bar", { caption: bar, text: barText, dark: mode === "dark" }).catch(() => {});
  onResolvedChange(mode);
  return mode;
}

/** The title bar button cycles System, Light, Dark; any colour theme goes back to System. */
export function nextTheme(pref: ThemePref): ThemePref {
  return pref === "system" ? "light" : pref === "light" ? "dark" : "system";
}

/** Which of the three button icons a preference shows: a colour theme shows its light / dark mode. */
export function themeIconKey(pref: ThemePref): "system" | "light" | "dark" {
  if (pref === "system" || pref === "light" || pref === "dark") return pref;
  return colourThemeFor(pref) ? resolveTheme(pref) : "system";
}

export function onSystemThemeChange(cb: (mode: "light" | "dark") => void) {
  onResolvedChange = cb;
  mql.addEventListener("change", () => {
    if (currentPref === "system") applyTheme("system");
  });
}
