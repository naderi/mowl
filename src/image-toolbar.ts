// A small floating toolbar for the selected image: alignment, scale, delete.
//
// How the choice is saved: an untouched image stays plain Markdown
// (`![alt](pic.png)`). As soon as it is scaled or aligned it becomes an HTML
// `<img src alt width align>` — the one form GitHub and most renderers honour —
// and when both are set back to the defaults it turns into `![alt](pic.png)`
// again. Scale is relative to the image's original size and stored as pixels,
// so "100 %" never stretches a small picture to the column width.

import { $prose } from "@milkdown/kit/utils";
import { NodeSelection, Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  createBareImage,
  parseBareImage,
  patchBareImage,
  type Align,
} from "./html-markdown";
import { t } from "./i18n";

const SCALES = [25, 50, 75, 100];

const SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
const ICONS = {
  left: `${SVG}<path d="M4 5h16M4 9h10M4 13h16M4 17h10"/></svg>`,
  center: `${SVG}<path d="M4 5h16M7 9h10M4 13h16M7 17h10"/></svg>`,
  right: `${SVG}<path d="M4 5h16M10 9h10M4 13h16M10 17h10"/></svg>`,
  trash: `${SVG}<path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5"/></svg>`,
};

interface Target {
  kind: "block" | "html";
  pos: number;
  img: HTMLImageElement;
  align: Align;
  /** Explicit pixel width, or null for the original size. */
  width: number | null;
}

class ImageToolbarView {
  private view: EditorView;
  private readonly bar: HTMLDivElement;
  private readonly alignBtns = new Map<Align, HTMLButtonElement>();
  private readonly scaleBtns = new Map<number, HTMLButtonElement>();
  private readonly deleteBtn: HTMLButtonElement;
  private readonly scrollHost: HTMLElement | null;
  private target: Target | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.bar = document.createElement("div");
    this.bar.className = "mowl-image-toolbar";
    this.bar.hidden = true;
    this.bar.setAttribute("role", "toolbar");
    // Keep the editor's focus and selection while a button is pressed.
    this.bar.addEventListener("mousedown", (e) => e.preventDefault());

    for (const align of ["left", "center", "right"] as const) {
      const b = this.button("mowl-image-btn", ICONS[align], () => this.apply({ align }));
      this.alignBtns.set(align, b);
      this.bar.appendChild(b);
    }
    this.bar.appendChild(this.divider());
    for (const scale of SCALES) {
      const b = this.button("mowl-image-btn mowl-image-scale", `${scale}%`, () =>
        this.apply({ scale }),
      );
      this.scaleBtns.set(scale, b);
      this.bar.appendChild(b);
    }
    this.bar.appendChild(this.divider());
    this.deleteBtn = this.button("mowl-image-btn", ICONS.trash, () => this.remove());
    this.bar.appendChild(this.deleteBtn);

    document.body.appendChild(this.bar);
    this.scrollHost = view.dom.closest<HTMLElement>("#editor");
    this.scrollHost?.addEventListener("scroll", this.position, { passive: true });
    window.addEventListener("resize", this.position, { passive: true });
    this.update(view);
  }

  private button(cls: string, html: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.innerHTML = html;
    b.addEventListener("click", onClick);
    return b;
  }

  private divider(): HTMLSpanElement {
    const d = document.createElement("span");
    d.className = "mowl-image-divider";
    return d;
  }

  /** What the current selection is, if it is an image this toolbar can edit. */
  private describe(view: EditorView): Target | null {
    const sel = view.state.selection;
    if (!(sel instanceof NodeSelection)) return null;
    const dom = view.nodeDOM(sel.from);
    if (!(dom instanceof HTMLElement)) return null;
    const img = dom instanceof HTMLImageElement ? dom : dom.querySelector("img");
    if (!img) return null;

    if (sel.node.type.name === "image-block") {
      return { kind: "block", pos: sel.from, img, align: "center", width: null };
    }
    if (sel.node.type.name === "html") {
      const bare = parseBareImage(String(sel.node.attrs?.value ?? ""));
      if (!bare) return null;
      return { kind: "html", pos: sel.from, img, align: bare.align ?? "left", width: bare.width };
    }
    return null;
  }

  update = (view: EditorView): void => {
    this.view = view;
    this.target = this.describe(view);
    const tg = this.target;
    if (!tg) {
      this.bar.hidden = true;
      return;
    }
    this.bar.hidden = false;
    this.label();
    for (const [align, b] of this.alignBtns) b.classList.toggle("active", align === tg.align);
    const natural = tg.img.naturalWidth;
    const current = tg.width && natural ? (tg.width / natural) * 100 : tg.width ? -1 : 100;
    for (const [scale, b] of this.scaleBtns) {
      b.classList.toggle("active", Math.abs(current - scale) < 1.5);
    }
    // the image may still be loading; its size decides where the bar goes
    if (!tg.img.complete) tg.img.addEventListener("load", this.position, { once: true });
    requestAnimationFrame(this.position);
  };

  /** Tooltips are set on each show so a language change is picked up. */
  private label(): void {
    const names: Record<Align, string> = {
      left: t("image.alignLeft"),
      center: t("image.alignCenter"),
      right: t("image.alignRight"),
    };
    for (const [align, b] of this.alignBtns) {
      b.title = names[align];
      b.setAttribute("aria-label", names[align]);
    }
    for (const b of this.scaleBtns.values()) b.title = t("image.scale");
    this.deleteBtn.title = t("image.delete");
    this.deleteBtn.setAttribute("aria-label", t("image.delete"));
  }

  private position = (): void => {
    const tg = this.target;
    if (!tg || this.bar.hidden) return;
    const r = tg.img.getBoundingClientRect();
    const host = this.scrollHost?.getBoundingClientRect();
    if (host && (r.bottom < host.top || r.top > host.bottom)) {
      this.bar.style.visibility = "hidden"; // scrolled out of view
      return;
    }
    this.bar.style.visibility = "";
    const w = this.bar.offsetWidth;
    const h = this.bar.offsetHeight;
    const floor = (host?.top ?? 0) + 4;
    let top = r.top - h - 8;
    if (top < floor) top = r.bottom + 8; // no room above: go below
    top = Math.min(top, window.innerHeight - h - 4);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    this.bar.style.top = `${Math.round(top)}px`;
    this.bar.style.left = `${Math.round(left)}px`;
  };

  private apply(patch: { align?: Align; scale?: number }): void {
    const tg = this.target;
    if (!tg) return;
    const { state } = this.view;
    const node = state.doc.nodeAt(tg.pos);
    if (!node) return;

    const align = patch.align ?? tg.align;
    let width = tg.width;
    if (patch.scale !== undefined) {
      if (patch.scale >= 100) width = null;
      else if (tg.img.naturalWidth > 0) width = Math.round((tg.img.naturalWidth * patch.scale) / 100);
      else return; // original size not known yet
    }

    const { html, paragraph } = state.schema.nodes;
    const imageBlock = state.schema.nodes["image-block"];

    if (tg.kind === "block") {
      if (align === "center" && width === null) return; // still plain Markdown
      if (!html || !paragraph) return;
      const value = createBareImage({
        src: String(node.attrs.src ?? ""),
        alt: typeof node.attrs.caption === "string" ? node.attrs.caption : "",
        width,
        align,
      });
      const tr = state.tr.replaceWith(
        tg.pos,
        tg.pos + node.nodeSize,
        paragraph.create(null, html.create({ value })),
      );
      // the html node sits one step inside the new paragraph
      tr.setSelection(NodeSelection.create(tr.doc, tg.pos + 1));
      this.view.dispatch(tr);
      return;
    }

    const value = String(node.attrs.value ?? "");
    const bare = parseBareImage(value);
    if (!bare) return;
    const $pos = state.doc.resolve(tg.pos);
    const alone = $pos.parent.type.name === "paragraph" && $pos.parent.childCount === 1;
    if (align === "center" && width === null && !bare.hasExtras && alone && imageBlock) {
      // back to the defaults: plain Markdown again
      const block = imageBlock.create({ src: bare.src, caption: bare.alt, ratio: 1 });
      const tr = state.tr.replaceWith($pos.before(), $pos.after(), block);
      tr.setSelection(NodeSelection.create(tr.doc, $pos.before()));
      this.view.dispatch(tr);
      return;
    }
    // only touch what the user changed: a plain <img> keeps having no align attribute
    const next = patchBareImage(value, { width, align: patch.align });
    if (!next) return;
    const tr = state.tr.setNodeMarkup(tg.pos, undefined, { ...node.attrs, value: next });
    tr.setSelection(NodeSelection.create(tr.doc, tg.pos));
    this.view.dispatch(tr);
  }

  private remove(): void {
    this.view.dispatch(this.view.state.tr.deleteSelection().scrollIntoView());
    this.view.focus();
  }

  destroy(): void {
    this.scrollHost?.removeEventListener("scroll", this.position);
    window.removeEventListener("resize", this.position);
    this.bar.remove();
  }
}

export const imageToolbarPlugin = $prose(
  () => new Plugin({ view: (view) => new ImageToolbarView(view) }),
);
