// Tiny in-app i18n. Covers Mowl's own chrome (toolbar, settings panel, About,
// dialogs, tab bar, find/replace, the block menu, the emoji picker) plus the
// editor placeholder. Milkdown/Crepe's own micro-UI (slash menu, link/table
// tooltips, image upload, LaTeX, code language picker) stays English.
//
// No app imports — this is a leaf module.

export type LangPref = "system" | "en" | "de";
export type Lang = "en" | "de";

const EN = {
  "toolbar.about.title": "About Mowl",
  "toolbar.open.title": "New / Open (Ctrl/Cmd+N, Ctrl/Cmd+O)",
  "toolbar.open.aria": "New or open file",
  "toolbar.save.title": "Save (Ctrl/Cmd+S)",
  "toolbar.save.aria": "Save",
  "toolbar.export.title": "Export HTML / PDF",
  "toolbar.export.aria": "Export",
  "toolbar.source.title": "Edit Markdown source",
  "toolbar.sourceBack.title": "Back to formatted view",
  "toolbar.source.aria": "Toggle source view",
  "toolbar.ltr.title": "Left-to-right",
  "toolbar.ltr.aria": "Left-to-right text",
  "toolbar.rtl.title": "Right-to-left",
  "toolbar.rtl.aria": "Right-to-left text",
  "toolbar.theme.aria": "Toggle theme",
  "toolbar.settings.title": "Settings (Ctrl/Cmd+,)",
  "toolbar.settings.aria": "Settings",

  "menu.new": "New",
  "menu.open": "Open…",

  "about.tagline": "Portable WYSIWYG Markdown editor",
  "about.credit": "by Ali Naderi · MIT License",
  "about.close": "Close",

  "doc.untitled": "Untitled",

  "tab.close": "Close tab",
  "tab.new": "New tab",

  "block.text": "Text",
  "block.h1": "Heading 1",
  "block.h2": "Heading 2",
  "block.h3": "Heading 3",
  "block.bulletList": "Bullet list",
  "block.numberedList": "Numbered list",
  "block.quote": "Quote",
  "block.codeBlock": "Code block",
  "block.table": "Table",
  "block.image": "Image",
  "block.divider": "Divider",
  "block.insertAbove": "Insert line above",
  "block.insertBelow": "Insert line below",
  "block.duplicate": "Duplicate",
  "block.delete": "Delete",

  "find.find": "Find",
  "find.replace": "Replace",
  "find.replaceWith": "Replace with",
  "find.prev": "Previous match",
  "find.next": "Next match",
  "find.prev.title": "Previous match (Shift+Enter)",
  "find.next.title": "Next match (Enter)",
  "find.matchCase": "Match case",
  "find.close": "Close (Esc)",
  "find.replaceBtn": "Replace",
  "find.all": "All",

  "emoji.search": "Search emoji…",
  "emoji.noMatches": "No matches",

  "theme.label.system": "Theme: system — click for light",
  "theme.label.light": "Theme: light — click for dark",
  "theme.label.dark": "Theme: dark — click for system",

  "dialog.discardChanges": "Discard unsaved changes to {name}?",
  "dialog.unsavedQuit": "You have unsaved changes. Quit without saving?",
  "dialog.htmlExported": "HTML exported.",
  "dialog.chooseExport": "Export as HTML file?  (No = print / save as PDF)",
  "dialog.exportTitle": "Export",
  "dialog.startupFailed": "Startup failed: {err}",
  "dialog.readonlyHint": "Program folder is read-only — settings saved to {path}",

  "editor.placeholder": "Write here — “/” for blocks, the ⠿ button to change the current one",

  "settings.title": "Settings",
  "settings.savedNote": "Changes are saved immediately.",
  "settings.fileAt": "settings.toml: {path}",
  "settings.section.appearance": "Language & appearance",
  "settings.section.editor": "Editor",
  "settings.section.behavior": "Behaviour",
  "settings.section.fonts": "Fonts",

  "settings.language": "Language",
  "settings.language.system": "System",
  "settings.language.en": "English",
  "settings.language.de": "Deutsch",
  "settings.theme": "Theme",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.direction": "Writing direction",
  "settings.direction.hint": "default for new files (each file keeps its own)",
  "settings.direction.ltr": "Left-to-right",
  "settings.direction.rtl": "Right-to-left",
  "settings.spellcheck": "Spell-check squiggles in the editor",
  "settings.quitOnEscape": "Press Esc to quit the app",
  "settings.alwaysShowTabbar": "Always show the tab bar (even with one file)",
  "settings.openLastSession": "Reopen the previous session's tabs on startup",
  "settings.showPath": "Show the full file path in the header",
  "settings.listMarker": "Bullet-list marker (on save)",
  "settings.editorFont": "Editor font",
  "settings.editorFont.placeholder": "system default",
  "settings.editorFontSize": "Editor font size (px)",
  "settings.sourceFont": "Source-view font",
  "settings.sourceFont.placeholder": "system monospace",
  "settings.sourceFontSize": "Source font size (px)",
  "settings.accent": "Accent colour",
  "settings.accent.clear": "Reset",
};

export type I18nKey = keyof typeof EN;

const DE: Partial<Record<I18nKey, string>> = {
  "toolbar.about.title": "Über Mowl",
  "toolbar.open.title": "Neu / Öffnen (Strg/Cmd+N, Strg/Cmd+O)",
  "toolbar.open.aria": "Neue Datei / Datei öffnen",
  "toolbar.save.title": "Speichern (Strg/Cmd+S)",
  "toolbar.save.aria": "Speichern",
  "toolbar.export.title": "Als HTML / PDF exportieren",
  "toolbar.export.aria": "Exportieren",
  "toolbar.source.title": "Markdown-Quelltext bearbeiten",
  "toolbar.sourceBack.title": "Zurück zur formatierten Ansicht",
  "toolbar.source.aria": "Quelltextansicht umschalten",
  "toolbar.ltr.title": "Links nach rechts",
  "toolbar.ltr.aria": "Text links nach rechts",
  "toolbar.rtl.title": "Rechts nach links",
  "toolbar.rtl.aria": "Text rechts nach links",
  "toolbar.theme.aria": "Erscheinungsbild umschalten",
  "toolbar.settings.title": "Einstellungen (Strg/Cmd+,)",
  "toolbar.settings.aria": "Einstellungen",

  "menu.new": "Neu",
  "menu.open": "Öffnen…",

  "about.tagline": "Portabler WYSIWYG-Markdown-Editor",
  "about.credit": "von Ali Naderi · MIT-Lizenz",
  "about.close": "Schließen",

  "doc.untitled": "Ohne Titel",

  "tab.close": "Tab schließen",
  "tab.new": "Neuer Tab",

  "block.text": "Text",
  "block.h1": "Überschrift 1",
  "block.h2": "Überschrift 2",
  "block.h3": "Überschrift 3",
  "block.bulletList": "Stichpunktliste",
  "block.numberedList": "Nummerierte Liste",
  "block.quote": "Zitat",
  "block.codeBlock": "Codeblock",
  "block.table": "Tabelle",
  "block.image": "Bild",
  "block.divider": "Trennlinie",
  "block.insertAbove": "Zeile darüber einfügen",
  "block.insertBelow": "Zeile darunter einfügen",
  "block.duplicate": "Duplizieren",
  "block.delete": "Löschen",

  "find.find": "Suchen",
  "find.replace": "Ersetzen",
  "find.replaceWith": "Ersetzen durch",
  "find.prev": "Vorheriger Treffer",
  "find.next": "Nächster Treffer",
  "find.prev.title": "Vorheriger Treffer (Umschalt+Enter)",
  "find.next.title": "Nächster Treffer (Enter)",
  "find.matchCase": "Groß-/Kleinschreibung beachten",
  "find.close": "Schließen (Esc)",
  "find.replaceBtn": "Ersetzen",
  "find.all": "Alle",

  "emoji.search": "Emoji suchen…",
  "emoji.noMatches": "Keine Treffer",

  "theme.label.system": "Erscheinungsbild: System — klicken für Hell",
  "theme.label.light": "Erscheinungsbild: Hell — klicken für Dunkel",
  "theme.label.dark": "Erscheinungsbild: Dunkel — klicken für System",

  "dialog.discardChanges": "Ungespeicherte Änderungen an {name} verwerfen?",
  "dialog.unsavedQuit": "Es gibt ungespeicherte Änderungen. Ohne Speichern beenden?",
  "dialog.htmlExported": "HTML exportiert.",
  "dialog.chooseExport": "Als HTML-Datei exportieren?  (Nein = drucken / als PDF speichern)",
  "dialog.exportTitle": "Exportieren",
  "dialog.startupFailed": "Start fehlgeschlagen: {err}",
  "dialog.readonlyHint": "Programmordner ist schreibgeschützt — Einstellungen gespeichert unter {path}",

  "editor.placeholder": "Hier schreiben — „/“ für Blöcke, den ⠿-Knopf für den aktuellen Block",

  "settings.title": "Einstellungen",
  "settings.savedNote": "Änderungen werden sofort gespeichert.",
  "settings.fileAt": "settings.toml: {path}",
  "settings.section.appearance": "Sprache & Darstellung",
  "settings.section.editor": "Editor",
  "settings.section.behavior": "Verhalten",
  "settings.section.fonts": "Schriften",

  "settings.language": "Sprache",
  "settings.language.system": "System",
  "settings.language.en": "English",
  "settings.language.de": "Deutsch",
  "settings.theme": "Erscheinungsbild",
  "settings.theme.system": "System",
  "settings.theme.light": "Hell",
  "settings.theme.dark": "Dunkel",
  "settings.direction": "Schreibrichtung",
  "settings.direction.hint": "Standard für neue Dateien (jede Datei behält ihre eigene)",
  "settings.direction.ltr": "Links nach rechts",
  "settings.direction.rtl": "Rechts nach links",
  "settings.spellcheck": "Rechtschreib-Wellenlinien im Editor",
  "settings.quitOnEscape": "Mit Esc die App beenden",
  "settings.alwaysShowTabbar": "Tab-Leiste immer zeigen (auch bei einer Datei)",
  "settings.openLastSession": "Tabs der letzten Sitzung beim Start wieder öffnen",
  "settings.showPath": "Vollständigen Dateipfad in der Kopfzeile zeigen",
  "settings.listMarker": "Listenzeichen (beim Speichern)",
  "settings.editorFont": "Editor-Schrift",
  "settings.editorFont.placeholder": "System-Standard",
  "settings.editorFontSize": "Editor-Schriftgröße (px)",
  "settings.sourceFont": "Quelltext-Schrift",
  "settings.sourceFont.placeholder": "System-Monospace",
  "settings.sourceFontSize": "Quelltext-Schriftgröße (px)",
  "settings.accent": "Akzentfarbe",
  "settings.accent.clear": "Zurücksetzen",
};

const DICT: Record<Lang, Partial<Record<I18nKey, string>>> = { en: EN, de: DE };

let current: Lang = "en";
const listeners = new Set<() => void>();

export function resolveLang(pref: LangPref): Lang {
  if (pref === "system") {
    return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
  }
  return pref;
}

export function getLang(): Lang {
  return current;
}

/** Set the active language and notify listeners (no-op if unchanged). */
export function setLang(pref: LangPref): void {
  const next = resolveLang(pref);
  if (next === current) return;
  current = next;
  document.documentElement.lang = current;
  for (const cb of listeners) cb();
}

export function onLangChange(cb: () => void): void {
  listeners.add(cb);
}

export function t(
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  const s = DICT[current][key] ?? EN[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/** Apply `data-i18n` / `data-i18n-title` / `data-i18n-aria` attributes. */
export function applyStaticI18n(root: ParentNode = document): void {
  document.documentElement.lang = current;
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle as I18nKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria as I18nKey));
  });
}
