// Mermaid diagrams (flowcharts and the other diagram types) in ```mermaid code blocks. The library is large, so it
// is only loaded when a document contains such a block.
import type { Mermaid } from "mermaid";

let loading: Promise<Mermaid> | null = null;
let configuredTheme = "";
let counter = 0;

export function isMermaidLanguage(language: string): boolean {
  return language.toLowerCase() === "mermaid";
}

function errorBox(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "mermaid-error";
  box.textContent = message;
  return box;
}

/** Draw `source` and hand the SVG (or an error message) to `apply`. */
export function renderMermaid(source: string, apply: (value: string | HTMLElement | null) => void): void {
  void (async () => {
    const id = `mowl-mermaid-${++counter}`;
    try {
      loading ??= import("mermaid").then((m) => m.default);
      const mermaid = await loading;
      const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "default";
      if (theme !== configuredTheme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
          htmlLabels: false,
          flowchart: { htmlLabels: false },
        });
        configuredTheme = theme;
      }
      const { svg } = await mermaid.render(id, source);
      apply(svg);
    } catch (e) {
      document.getElementById(`d${id}`)?.remove(); // mermaid leaves its error picture in the page
      apply(errorBox(e instanceof Error ? e.message.split("\n")[0] : String(e)));
    }
  })();
}
