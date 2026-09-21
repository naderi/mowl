// User-configurable application shortcuts.
//
// A binding is stored in settings.toml as a plain string such as "Mod+Shift+S":
// zero or more of Mod / Alt / Shift, then one key. `Mod` is Ctrl *or* Cmd (either
// works on every platform, as it always has in Mowl). Fixed shortcuts — Ctrl+0..7
// block types, Ctrl+K link, clipboard/undo — are not configurable, and the
// capture UI refuses to bind over them.

import { getLang } from "./i18n";

export type ShortcutAction =
  | "new_tab"
  | "open"
  | "save"
  | "save_as"
  | "close_tab"
  | "export"
  | "toggle_source"
  | "find"
  | "replace"
  | "emoji"
  | "settings";

export type ShortcutSettings = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  new_tab: "Mod+N",
  open: "Mod+O",
  save: "Mod+S",
  save_as: "Mod+Shift+S",
  close_tab: "Mod+W",
  export: "Mod+E",
  toggle_source: "Mod+Shift+C",
  find: "Mod+F",
  replace: "Mod+H",
  emoji: "Mod+.",
  settings: "Mod+,",
};

interface Parsed {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const NON_KEYS = new Set([
  "Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock",
  "ScrollLock", "Dead", "Process", "Unidentified",
]);

/** Canonical key name; the same function normalises both sides of a match. */
function keyName(key: string): string | null {
  if (!key || NON_KEYS.has(key)) return null;
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

function parse(binding: string): Parsed | null {
  let rest = binding.trim();
  const p: Parsed = { mod: false, alt: false, shift: false, key: "" };
  // Peel off modifier prefixes one by one, so a bare "+" key ("Mod++") survives.
  for (;;) {
    const m = /^(mod|ctrl|cmd|meta|alt|shift)\+(?=.)/i.exec(rest);
    if (!m) break;
    const name = m[1].toLowerCase();
    if (name === "alt") p.alt = true;
    else if (name === "shift") p.shift = true;
    else p.mod = true;
    rest = rest.slice(m[0].length);
  }
  const key = keyName(rest);
  if (!key) return null;
  p.key = key;
  return p;
}

function canonical(p: Parsed): string {
  const parts: string[] = [];
  if (p.mod) parts.push("Mod");
  if (p.alt) parts.push("Alt");
  if (p.shift) parts.push("Shift");
  parts.push(p.key);
  return parts.join("+");
}

function isMac(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

const F_KEY = /^F\d{1,2}$/;

/** Turn one key press into a canonical binding, or null for a bare modifier. */
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  // AltGr (reported as Ctrl+Alt on Windows) is for typing characters.
  if (e.getModifierState?.("AltGraph")) return null;
  const key = keyName(e.key);
  if (!key) return null;
  return canonical({
    mod: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
    key,
  });
}

/** Keys that keep their built-in meaning and can't be reassigned. */
const RESERVED = new Set([
  "Mod+A", "Mod+C", "Mod+V", "Mod+X", "Mod+Z", "Mod+Y", "Mod+Shift+Z",
  "Mod+B", "Mod+I", "Mod+K",
  ...["0", "1", "2", "3", "4", "5", "6", "7"].map((d) => `Mod+${d}`),
]);

/** Whether a binding may be assigned: it needs Ctrl/Cmd or Alt (or be an F-key,
 *  so plain typing stays untouched) and must not shadow a fixed shortcut. */
export function isAssignable(binding: string): boolean {
  const p = parse(binding);
  if (!p || p.key === "Escape") return false;
  if (!p.mod && !p.alt && !F_KEY.test(p.key)) return false;
  return !RESERVED.has(canonical(p));
}

/** The action whose binding matches a KeyboardEvent, if any. */
export function findShortcutAction(
  e: KeyboardEvent,
  shortcuts: ShortcutSettings,
): ShortcutAction | null {
  if (!(e.ctrlKey || e.metaKey || e.altKey) && !F_KEY.test(e.key)) return null;
  const key = keyName(e.key);
  if (!key) return null;
  const mod = e.ctrlKey || e.metaKey;
  for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
    const p = parse(shortcuts[action]);
    if (
      p && p.key === key && p.mod === mod && p.alt === e.altKey &&
      p.shift === e.shiftKey
    ) {
      return action;
    }
  }
  return null;
}

/** Human-readable form for the settings UI and tooltips ("Ctrl+Shift+S"). */
export function formatShortcut(binding: string | undefined): string {
  const p = binding ? parse(binding) : null;
  if (!p) return "—";
  const parts: string[] = [];
  if (p.mod) parts.push(isMac() ? "Cmd" : getLang() === "de" ? "Strg" : "Ctrl");
  if (p.alt) parts.push("Alt");
  if (p.shift) parts.push("Shift");
  parts.push(p.key);
  return parts.join("+");
}

/** Fill gaps and drop unusable entries from a hand-edited settings.toml. */
export function withDefaultShortcuts(
  value: Partial<ShortcutSettings> | null | undefined,
): ShortcutSettings {
  const out = { ...DEFAULT_SHORTCUTS };
  for (const action of Object.keys(out) as ShortcutAction[]) {
    const v = value?.[action];
    if (typeof v === "string" && isAssignable(v)) out[action] = v;
  }
  return out;
}
