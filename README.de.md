<div align="center">

<img src="docs/logo.png" alt="Mowl">

[English](README.md) · **Deutsch** · [فارسی](README.fa.md) · [العربية](README.ar.md) · [עברית](README.he.md)

</div>

> ℹ️ Diese Übersetzung wurde maschinell erstellt. Maßgeblich ist das englische
> [README](README.md).

# Mowl

**Ein minimalistischer, portabler WYSIWYG‑Markdown‑Editor.**

Markdown tippen, sofort formatiert sehen — im Typora‑Stil. Mächtig genug für
echtes Schreiben (Tabellen, Formeln, Code, Fußnoten, RTL), und trotzdem eine
einzige \~7‑MB‑Anwendung, die sofort startet und nicht im Weg steht.

[Funktionen](#funktionen) · [Screenshots](#screenshots) · [Download](#download) · [Konfiguration](#konfiguration) · [Selbst bauen](#selbst-bauen)

***

## Warum Mowl

- **Überraschend mächtig.** Inline‑WYSIWYG‑Bearbeitung, Dokumente in Tabs, ein
  Blockmenü, GFM‑Tabellen mit Ziehen zum Umsortieren, KaTeX‑Formeln,
  syntaxhervorgehobener Code, Suchen & Ersetzen, Rechts‑nach‑links‑Unterstützung
  und in sich geschlossener HTML‑/PDF‑Export.
- **Extrem schlank.** Kein Electron. Mowl baut auf [Tauri](https://tauri.app) und
  der WebView deines Betriebssystems auf, sodass die ganze App eine **einzige
  portable Anwendung von rund 7 MB** ist — kein Installer nötig, nichts zu
  entpacken, keine Hintergrunddienste.
- **Wirklich schnell.** Der Kern ist Rust, das Fenster nativ, und der Kaltstart
  praktisch sofort. Es fühlt sich wie ein Texteditor an, nicht wie eine Web‑App.
- **Portabel von Grund auf.** Eine einzige, von Hand editierbare `settings.toml`
  liegt neben der Anwendung. Zieh `Mowl.exe` auf einen USB‑Stick und deine
  Einstellungen reisen mit.

## Funktionen

### ✍️ Inline‑WYSIWYG‑Bearbeitung

Angetrieben von [Milkdown Crepe](https://milkdown.dev) (ProseMirror).
Überschriften, Fettdruck, Listen, Zitate und der Rest werden beim Tippen
formatiert — das Dokument auf der Festplatte bleibt aber immer schlichtes,
portables Markdown.

### 🔗 Links ohne Syntax‑Gefummel

Text markieren, dann **eine URL mit `Strg/Cmd+V` einfügen** — die Markierung wird
zum Linktext, die eingefügte URL zum Ziel. Kein `[]()`‑Tippen, kein Dialog.
Lieber die Tastatur? Text markieren und **`Strg/Cmd+K`** drücken, um daraus einen
Link mit der URL aus der Zwischenablage zu machen (oder einen leeren Link zum
Ausfüllen).

### 🖼️ Bilder, die einfach da sind

`![alt](bild.png)` wird im Editor inline dargestellt, auch bei **relativen
Pfaden**, die gegen den Ordner des Dokuments aufgelöst werden
(`./assets/diagramm.png`, `../shared/logo.svg`), und bei absoluten lokalen Pfaden
— nicht nur bei `http(s)`‑URLs. Über das `⠿`‑Blockmenü hinzufügen („Image"), dann
einen Link einfügen oder eine Datei auswählen.

### ↔️ Rechts‑nach‑links‑Unterstützung

Die Schreibrichtung ist **pro Datei**: Ein Klick schaltet das aktive Dokument
zwischen **LTR und RTL** um — für Persisch, Arabisch oder Hebräisch. Beim Öffnen
wird die Richtung aus dem Inhalt erkannt (erstes richtungsgebundenes Zeichen).
Codeblöcke bleiben immer von links nach rechts — auch in einem RTL‑Dokument — und
die Richtung wird in den HTML‑Export übernommen (`<html dir="rtl">`).

### 🧱 Blockmenü

Über einen Block fahren und auf den `⠿`‑Knopf klicken für ein Schnellmenü, das auf
diesen Block wirkt:

- **Umwandeln in** — Text, Überschrift 1–3, Stichpunktliste, nummerierte Liste, Zitat,
  Codeblock oder **Tabelle**
- **Einfügen** einer Tabelle, eines Bildes, einer Trennlinie oder einer leeren
  Zeile darüber/darunter
- Block **duplizieren** oder **löschen**

Der aktuelle Blocktyp ist hervorgehoben, damit du immer weißt, was du bearbeitest.
Die „Umwandeln in"-Typen haben auch Tastenkürzel — `Strg/Cmd+0`–`7` (Text, Ü1, Ü2,
Ü3, Stichpunktliste, nummerierte Liste, Zitat, Codeblock) — angewendet auf die Auswahl,
genau wie im Menü.

### 😀 Emoji

`Strg/Cmd+.` öffnet eine durchsuchbare Emoji-Auswahl, oder tippe einfach einen
`:shortcode:` (z. B. `:tada:` → 🎉, `:+1:` → 👍) — er wird beim schließenden
Doppelpunkt zum Emoji. Natives Unicode, keine Bilder, nichts wird geladen.

### 📑 Tabs mit Sitzungswiederherstellung

Mehrere Dokumente als Tabs öffnen. Mowl schließen, wieder öffnen, und deine Tabs —
samt Scrollpositionen — sind zurück. (In der Konfiguration abschaltbar.)

### 👁️ Quelltextansicht

Mit `Strg/Cmd+Shift+C` zwischen dem formatierten Editor und dem **rohen Markdown**
in einem einfachen Textfeld umschalten. `Tab` / `Shift+Tab` rücken markierte
Zeilen ein und aus, und das native Rückgängig funktioniert weiter. Die
Leseposition wird beim Umschalten übernommen.

### 🔍 Suchen & Ersetzen

`Strg/Cmd+F` zum Suchen, `Strg/Cmd+H` zum Ersetzen — funktioniert sowohl im
WYSIWYG‑Editor als auch in der Quelltextansicht.

### 📊 Tabellen, die sich benehmen

Vollständige GitHub‑Flavored‑Markdown‑Tabellen. **Zeilen und Spalten ziehen**, um
sie umzusortieren, eine Tabelle direkt aus dem Blockmenü einfügen, und von Hand
getippte Tabellen werden in der gespeicherten `.md`‑Datei automatisch
**ausgerichtet und aufgefüllt**, damit das rohe Markdown lesbar bleibt.

### 🧮 Formeln & 💻 Code

- **KaTeX**‑Formeln, inline (`$…$`) und abgesetzt (`$$…$$`)
- Syntaxhervorgehobene **Codeblöcke** mit Spracherkennung

Dazu der Rest von GFM: Aufgabenlisten, Fußnoten, Durchstreichen, Autolinks.

### 📤 Export

- **In sich geschlossenes HTML** — eine einzige Datei mit eingebetteten KaTeX‑ und
  Hervorhebungs‑Styles, nichts zu hosten. Lokale Bilder werden als Data‑URLs
  eingebettet.
- **PDF** über den System‑Druckdialog

### 🎨 Themes & Erscheinungsbild

Helles und dunkles Theme, folgt standardmäßig dem Betriebssystem, mit manuellem
Umschalter. Editor‑Schrift, Schriftgröße, Quelltext‑Schrift und Akzentfarbe sind
konfigurierbar.

### 🧩 Rohes HTML, dargestellt

Markdown‑Dateien von GitHub sind voller kleiner HTML‑Schnipsel. Mowl zeigt die
gängigen als das, was sie sind, statt als Text‑Tags: `<img>` (auch mit lokalen
Pfaden, `width`/`align` und in `<div align="center">`, `<p>` oder `<a>`
eingepackt), `<kbd>`, als `<a href>` geschriebene Links, einklappbare
`<details>`‑/`<summary>`‑Abschnitte (Zusammenfassung anklicken), `<div
align="…">`‑Blöcke und `<!--more-->`‑Marker. Das ist nur die Anzeige — dein
Markdown wird exakt so gespeichert, wie du es geschrieben hast, und alles
andere bleibt Text.

Ein Klick auf ein Bild zeigt eine kleine Toolbar: links, zentriert oder rechts
ausrichten, auf 25 / 50 / 75 / 100 % der Originalgröße skalieren oder entfernen.
Ein unverändertes Bild bleibt normales Markdown (`![alt](pic.png)`); sobald du es
skalierst oder ausrichtest, wird es als `<img src alt width align>` gespeichert,
was GitHub und die meisten anderen Renderer verstehen — und auf Standard
zurückgesetzt wird es wieder zu normalem Markdown.

### 🗂️ Dateizuordnungen

Mowl als Standard‑App für `.md`‑/`.markdown`‑Dateien festlegen (über den
Installer). Ein Doppelklick auf eine Markdown‑Datei öffnet sie in einem neuen Tab
des laufenden Fensters.
Du kannst auch eine oder mehrere `.md`‑/`.markdown`‑/`.mdx`‑/`.txt`‑Dateien auf das
Fenster ziehen, um sie zu öffnen.

Die portable `Mowl.exe` unter Windows? Die Einstellungsseite hat einen Abschnitt
**System** mit einem Knopf *Registrieren*, der Mowl im Menü „Öffnen mit" für
Markdown‑Dateien anbietet — pro Benutzer, ohne Adminrechte und jederzeit wieder
entfernbar. (Windows erlaubt es Programmen nicht, sich selbst zum Standard zu
machen; einmal im „Öffnen mit"‑Dialog *Immer* wählen.) Wird die Exe verschoben,
repariert Mowl die Registrierung beim nächsten Start.

### ⚙️ Einstellungen, per GUI oder Datei

Jede Einstellung lässt sich in der App ändern — der Einstellungen-Knopf in der
Toolbar (oder `Strg/Cmd+,`) klappt die Einstellungsseite über den Editor herein,
mit einem Bedienelement pro Option; Änderungen werden sofort angewendet und
gespeichert. Oder die einzige, kommentierte `settings.toml` neben der Anwendung
in einem beliebigen Texteditor bearbeiten — Mowl **übernimmt die Änderung
innerhalb einer Sekunde, ohne Neustart**. Ist der Programmordner schreibgeschützt,
weicht Mowl auf das Konfigurationsverzeichnis des Betriebssystems aus und weist im
Fenster darauf hin. Jede Veröffentlichung bringt außerdem eine vollständig
kommentierte `settings.example.toml` mit.

### 🔄 Updates

Unter Windows kann Mowl sich selbst aktualisieren. **Über → Nach Updates suchen**
prüft das neueste GitHub‑Release; gibt es ein neueres, lässt es sich herunterladen,
und Mowl prüft die Signatur gegen einen in die App eingebauten Schlüssel, bevor
irgendetwas installiert wird. Die portable `Mowl.exe` wird an Ort und Stelle
ersetzt und neu gestartet (die vorige Version bleibt bis zum nächsten Start als
`Mowl.exe.old` daneben liegen), Installer‑Builds starten den neuen Installer, und
Scoop‑Installationen bekommen den Hinweis `scoop update mowl`. Einmal täglich prüft
Mowl beim Start still im Hintergrund und setzt einen Punkt auf den Über‑Knopf, wenn
es etwas Neues gibt. Das ist der einzige Moment, in dem Mowl von sich aus ins
Internet geht — abschaltbar unter **Einstellungen → System → Automatisch nach
Updates suchen** oder mit `auto_check_updates = false`. Unter **Einstellungen → System** gibt es
außerdem den Knopf *Jetzt prüfen*.

### 🌍 English und Deutsch

Die Oberfläche gibt es auf **Englisch und Deutsch** und folgt standardmäßig der
Systemsprache (`language = "system" | "en" | "de"`, umschaltbar in den
Einstellungen).

## Screenshots

| Hell                                                               | Dunkel                                           |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| ![Mowl beim Bearbeiten eines Dokuments](docs/screenshot-light.png) | ![Mowl im Dunkelmodus](docs/screenshot-dark.png) |

| Rechts‑nach‑links (pro Datei)                              |                        Blockmenü                        |
| ---------------------------------------------------------- | :-----------------------------------------------------: |
| ![Dokument von rechts nach links](docs/screenshot-rtl.png) | ![Blockmenü am ⠿-Knopf](docs/screenshot-block-menu.png) |

## Tastenkürzel

| Aktion                           | Kürzel             |
| -------------------------------- | ------------------ |
| Neuer Tab                        | `Strg/Cmd+N`       |
| Öffnen                           | `Strg/Cmd+O`       |
| Speichern                        | `Strg/Cmd+S`       |
| Speichern unter                  | `Strg/Cmd+Shift+S` |
| Tab schließen                    | `Strg/Cmd+W`       |
| Export (HTML / PDF)              | `Strg/Cmd+E`       |
| Quelltextansicht umschalten      | `Strg/Cmd+Shift+C` |
| Suchen                           | `Strg/Cmd+F`       |
| Ersetzen                         | `Strg/Cmd+H`       |
| Link aus Zwischenablage          | `Strg/Cmd+K`       |
| URL auf markierten Text einfügen | `Strg/Cmd+V`       |
| Block: Text / Ü1–Ü3 / Listen / Zitat / Code | `Strg/Cmd+0`–`7` |
| Emoji einfügen                   | `Strg/Cmd+.`       |
| Einstellungen                    | `Strg/Cmd+,`       |

Das sind die Standardwerte. Die Anwendungs‑Kürzel (alles außer Zwischenablage,
Link und Block‑Typen) lassen sich auf der Einstellungsseite ändern — Feld
anklicken und die neue Kombination drücken — oder unter `[shortcuts]` in der
`settings.toml`.

## Download

Den aktuellen Build gibt es auf der Seite [Releases](../../releases).

- **Windows (x64)** — jetzt verfügbar: portable `Mowl.exe` (\~7 MB, ohne
  Installation) oder der NSIS‑Installer
- **macOS** (x64 + arm64) und **Linux** (x64 + arm64 AppImage) — *demnächst.*
  Die plattformübergreifende Release‑Pipeline steht bereits
  ([`.github/workflows/release.yml`](.github/workflows/release.yml)); diese Builds
  kommen mit einer künftigen getaggten Veröffentlichung. Bis dahin auf dem
  Zielsystem aus dem Quellcode bauen (siehe [Selbst bauen](#selbst-bauen)) — Mowl
  ist eine Tauri‑App und läuft auf allen dreien.

Die Builds sind **nicht** signiert oder notarisiert, das Betriebssystem kann beim
ersten Start also warnen:

- **Windows** — SmartScreen: *Weitere Informationen → Trotzdem ausführen*
- **macOS** — Rechtsklick auf die App → *Öffnen*, oder
  `xattr -dr com.apple.quarantine /pfad/zu/Mowl.app`
- **Linux** — `chmod +x Mowl*.AppImage` und ausführen

Zu jeder Veröffentlichung werden SHA‑256‑Prüfsummen bereitgestellt.

## Konfiguration

`settings.toml` liegt neben der Anwendung (unter macOS: neben dem `.app`‑Bundle)
oder ersatzweise im Konfigurationsverzeichnis des Betriebssystems. Der obere
Abschnitt ist für die Bearbeitung von Hand gedacht und wird live neu geladen
(die `#`‑Kommentare bleiben auf Englisch, wie in der Datei):

```toml
language = "system"         # system (follow the OS) | en | de
theme = "system"            # system | light | dark
direction = "ltr"           # ltr | rtl  (default for new tabs; direction is per file)
spellcheck = true
quit_on_escape = false      # press Esc to quit
list_marker = "*"           # bullet-list marker on save: * | - | +
show_path = false           # show the full file path in the header, not just the name
open_last_session = true    # reopen the previous session's tabs on startup
always_show_tabbar = false  # keep the tab bar visible even with only one file open
editor_font = ""            # WYSIWYG font family (blank = default)
editor_font_size = 16       # headings scale from this
source_font = ""            # Markdown source font (monospace)
source_font_size = 15
accent = ""                 # accent colour, e.g. "#0969da"

# below this line: managed by the app — window geometry, open tabs, per-file direction
```

## Selbst bauen

Voraussetzungen:

- Rust (stable; MSVC‑Toolchain unter Windows) — <https://rustup.rs>
- Node 20+ und `pnpm`
- Plattform‑WebView‑Abhängigkeiten — siehe <https://tauri.app/start/prerequisites/>

```bash
pnpm install
pnpm tauri dev                       # mit Hot-Reload starten
pnpm tauri build                     # Release-Bundles für das Host-OS
pnpm tauri build --bundles nsis      # Windows: Installer + portable exe
pnpm exec tsc --noEmit               # Frontend-Typecheck
cargo test --manifest-path src-tauri/Cargo.toml   # Rust-Unit-Tests
```

**Eine Veröffentlichung schneiden:** `version` in **beiden** Dateien
`package.json` und `src-tauri/tauri.conf.json` erhöhen, dann einen `v*`‑Tag
pushen — `.github/workflows/release.yml` baut Windows / macOS / Linux
(x64 + arm64) und öffnet einen GitHub‑Release‑Entwurf mit Prüfsummen.

Mowl erweitern? Lies **[ARCHITECTURE.md](ARCHITECTURE.md)** — dort ist jede Datei
verzeichnet und es wird gezeigt, wie man Toolbar‑Knöpfe, Blockmenü‑Einträge,
Einstellungen und Kommandos hinzufügt.

## Technik‑Stack

| Ebene                  | Wahl                                                    |
| ---------------------- | ------------------------------------------------------- |
| Hülle                  | [Tauri v2](https://tauri.app) (Rust, System‑WebView)    |
| Editor                 | [`@milkdown/crepe`](https://milkdown.dev) (ProseMirror) |
| Markdown → HTML‑Export | [`comrak`](https://github.com/kivikakk/comrak) (Rust)   |
| Formeln                | [KaTeX](https://katex.org)                              |

## Unterstützung

Wenn Mowl dir Zeit spart, kannst du die Entwicklung auf Ko‑fi unterstützen. ☕

<a href='https://ko-fi.com/N7N123QIX0' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
