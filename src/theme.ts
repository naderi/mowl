// Theme handling: resolves "system" against the OS preference and swaps the
// compiled Crepe theme stylesheet at runtime.
import frameLight from "@milkdown/crepe/theme/frame.css?inline";
import frameDark from "@milkdown/crepe/theme/frame-dark.css?inline";

export type ThemePref = "system" | "light" | "dark";

const mql = window.matchMedia("(prefers-color-scheme: dark)");
let currentPref: ThemePref = "system";
let onResolvedChange: (mode: "light" | "dark") => void = () => {};

function themeStyleEl(): HTMLStyleElement {
  let el = document.getElementById("crepe-theme") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "crepe-theme";
    document.head.appendChild(el);
  }
  return el;
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") return mql.matches ? "dark" : "light";
  return pref;
}

export function applyTheme(pref: ThemePref): "light" | "dark" {
  currentPref = pref;
  const mode = resolveTheme(pref);
  document.documentElement.dataset.theme = mode;
  themeStyleEl().textContent = mode === "dark" ? frameDark : frameLight;
  onResolvedChange(mode);
  return mode;
}

export function nextTheme(pref: ThemePref): ThemePref {
  return pref === "system" ? "light" : pref === "light" ? "dark" : "system";
}

export function onSystemThemeChange(cb: (mode: "light" | "dark") => void) {
  onResolvedChange = cb;
  mql.addEventListener("change", () => {
    if (currentPref === "system") applyTheme("system");
  });
}
