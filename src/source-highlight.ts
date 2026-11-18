// Markdown syntax colours for the source view: the textarea keeps the real text
// (transparent) and a <pre> of identical metrics behind it paints the coloured
// copy. Only colours change, never widths, so both layers stay aligned.

/** Above this size the coloured copy is skipped (it is rebuilt on every keystroke). */
const MAX_CHARS = 300_000;

const INLINE =
  /(`+)[^`\n]*?\1|!?\[[^\]\n]*\]\([^)\n]*\)|<\/?[A-Za-z][^>\n]*>|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|(?<![A-Za-z0-9])_[^_\s][^_\n]*_(?![A-Za-z0-9])/g;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls: string, text: string): string {
  return text ? `<span class="sh-${cls}">${esc(text)}</span>` : "";
}

function inline(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const s = m[0];
    const i = m.index ?? 0;
    out += esc(text.slice(last, i));
    const c = s[0];
    const cls =
      c === "`" ? "code"
      : c === "<" ? "tag"
      : c === "[" || c === "!" ? "link"
      : s.startsWith("**") || s.startsWith("__") ? "strong"
      : "emphasis";
    out += span(cls, s);
    last = i + s.length;
  }
  return out + esc(text.slice(last));
}

/** Coloured HTML for `md`, line by line (fenced code blocks keep their state across lines). */
export function highlightMarkdown(md: string): string {
  let fence: string | null = null;
  return md
    .split("\n")
    .map((line) => {
      const f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
        return span(f && fence === null ? "fence" : "block", line);
      }
      if (f) {
        fence = f[1];
        return span("fence", line);
      }
      let m = /^(\s{0,3}#{1,6}(?:\s|$))(.*)$/.exec(line);
      if (m) return span("marker", m[1]) + span("heading", m[2]);
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return span("marker", line);
      m = /^(\s*(?:>\s?)+)(.*)$/.exec(line);
      if (m) return span("marker", m[1]) + span("quote", m[2]);
      m = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?)(.*)$/.exec(line);
      if (m) return span("marker", m[1]) + inline(m[2]);
      return inline(line);
    })
    .join("\n");
}

export interface SourceHighlight {
  /** Repaint after the textarea's value was set from code (typing is picked up on its own). */
  refresh(): void;
  setEnabled(on: boolean): void;
}

export function attachSourceHighlight(ta: HTMLTextAreaElement, pre: HTMLElement): SourceHighlight {
  let enabled = true;

  const paint = () => {
    const on = enabled && ta.value.length <= MAX_CHARS;
    ta.classList.toggle("hl", on);
    pre.hidden = !on;
    if (!on) return;
    // trailing newline: keep the last empty line as tall as the textarea's
    pre.innerHTML = highlightMarkdown(ta.value) + "\n";
    sync();
  };
  const sync = () => {
    // a visible scrollbar narrows the textarea's text area; the copy has to wrap the same way
    pre.style.setProperty("--sb-w", `${ta.offsetWidth - ta.clientWidth}px`);
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };

  ta.addEventListener("input", paint);
  ta.addEventListener("scroll", sync);
  new ResizeObserver(() => {
    if (!ta.offsetParent) return;
    sync();
  }).observe(ta);

  return {
    refresh: paint,
    setEnabled(on) {
      enabled = on;
      paint();
    },
  };
}
