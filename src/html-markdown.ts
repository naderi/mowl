// Render a small, safe subset of raw HTML in Markdown as real editor content.
//
// Milkdown shows raw HTML as literal text (`<img src=…>` as characters). This
// module changes how the `html` node is *displayed* for the constructs that show
// up in real-world Markdown, and leaves everything else literal:
//
//   * <img …>, or one <img> wrapped in <div>/<p>/<a>/<center>  → a real image
//   * <kbd>…</kbd>                                             → a key-cap
//   * <a href="…">…</a> (inline)                               → a link look
//   * <details> + <summary> … </details>                       → collapsible
//   * <div align="…"> … </div>                                 → aligned blocks
//   * <!--more-->                                              → hidden
//
// The document itself is never changed: every node keeps its exact `value`, so
// the Markdown round-trips byte for byte. Block-level effects are ProseMirror
// *decorations*, which ProseMirror maintains itself — classes added to its DOM
// by hand get wiped again as soon as it re-syncs a node.

import { schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MORE_COMMENT = /^<!--\s*more\s*-->$/i;
const DETAILS_OPEN = /^<details(\s[^>]*)?>$/i;
const DETAILS_CLOSE = /^<\/details\s*>$/i;
const DIV_OPEN = /^<div\b[^>]*>$/i;
const DIV_CLOSE = /^<\/div\s*>$/i;
const KBD_OPEN = /^<kbd\s*>$/i;
const KBD_CLOSE = /^<\/kbd\s*>$/i;
const A_OPEN = /^<a\s[^>]*>$/i;
const A_CLOSE = /^<\/a\s*>$/i;
const NEEDS_PARSE = /^<(details|summary)\b/i;
const LENGTH = /^\d+(?:\.\d+)?(?:px|%)?$/;
const IMG_WRAPPERS = new Set(["DIV", "P", "A", "CENTER"]);

export type Align = "left" | "center" | "right";

/** What a raw-HTML node means to us, when it is one of the supported tags. */
type Structural =
  | { kind: "details-open" }
  | { kind: "details-close" }
  | { kind: "div-open"; align: Align }
  | { kind: "div-close" }
  | { kind: "kbd-open" }
  | { kind: "kbd-close" }
  | { kind: "a-open"; href: string }
  | { kind: "a-close" }
  /** `opens`: the node is `<details><summary>…</summary>` in one piece. */
  | { kind: "summary"; text: string; opens: boolean };

const isAlign = (v: string | null | undefined): v is Align =>
  v === "left" || v === "center" || v === "right";

/** Parse `html` as a fragment without loading anything (a <template> is inert). */
function meaningfulNodes(html: string): ChildNode[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.childNodes].filter(
    (n) => n.nodeType !== Node.TEXT_NODE || Boolean(n.textContent?.trim()),
  );
}

function singleElement(html: string): HTMLElement | null {
  const nodes = meaningfulNodes(html.trim());
  return nodes.length === 1 && nodes[0] instanceof HTMLElement ? nodes[0] : null;
}

function parseStructural(value: string): Structural | null {
  const v = value.trim();
  if (DETAILS_CLOSE.test(v)) return { kind: "details-close" };
  if (DIV_CLOSE.test(v)) return { kind: "div-close" };
  if (KBD_OPEN.test(v)) return { kind: "kbd-open" };
  if (KBD_CLOSE.test(v)) return { kind: "kbd-close" };
  if (A_CLOSE.test(v)) return { kind: "a-close" };
  if (A_OPEN.test(v)) {
    const href = singleElement(v)?.getAttribute("href")?.trim();
    return href ? { kind: "a-open", href } : null;
  }
  if (DETAILS_OPEN.test(v)) return { kind: "details-open" };

  if (DIV_OPEN.test(v)) {
    const align = singleElement(v)?.getAttribute("align")?.trim().toLowerCase();
    return isAlign(align) ? { kind: "div-open", align } : null;
  }

  if (NEEDS_PARSE.test(v)) {
    const el = singleElement(v);
    if (el?.tagName === "SUMMARY") {
      return { kind: "summary", text: el.textContent ?? "", opens: false };
    }
    // `<details>` directly followed by `<summary>…</summary>` (no blank line)
    // is a single HTML block, so it arrives as one node.
    if (el?.tagName === "DETAILS") {
      const inner = [...el.childNodes].filter(
        (n) => n.nodeType !== Node.TEXT_NODE || Boolean(n.textContent?.trim()),
      );
      if (inner.length === 1 && inner[0] instanceof HTMLElement && inner[0].tagName === "SUMMARY") {
        return { kind: "summary", text: inner[0].textContent ?? "", opens: true };
      }
    }
  }
  return null;
}

// --- decorations: <kbd>, div/details blocks -----------------------------------

interface PluginState {
  /** Collapsed sections, keyed by summary text + occurrence (stable across
   *  edits and tab switches; position-based keys would not be). */
  collapsed: Set<string>;
  decos: DecorationSet;
  /** Position of each summary's html node → its collapse key. */
  summaries: Map<number, string>;
}

const pluginKey = new PluginKey<PluginState>("mowl-raw-html");

interface Block {
  pos: number;
  size: number;
  s: Structural | null;
}

function buildState(doc: ProseNode, collapsed: Set<string>): PluginState {
  const decos: Decoration[] = [];
  const summaries = new Map<number, string>();
  const blocks: Block[] = [];

  // Inline <kbd> and <a href> pairs, matched within one parent.
  const kbdOpen = new Map<ProseNode, number[]>();
  const aOpen = new Map<ProseNode, Array<{ from: number; href: string }>>();
  const stackOf = <T>(m: Map<ProseNode, T[]>, parent: ProseNode): T[] => {
    let s = m.get(parent);
    if (!s) m.set(parent, (s = []));
    return s;
  };
  doc.descendants((node, pos, parent) => {
    if (node.type.name !== "html" || !parent) return;
    const value = String(node.attrs?.value ?? "").trim();
    if (KBD_OPEN.test(value)) {
      stackOf(kbdOpen, parent).push(pos + node.nodeSize);
    } else if (KBD_CLOSE.test(value)) {
      const from = kbdOpen.get(parent)?.pop();
      if (from !== undefined && from < pos) {
        decos.push(Decoration.inline(from, pos, { class: "mowl-kbd" }));
      }
    } else if (A_OPEN.test(value)) {
      const s = parseStructural(value);
      if (s?.kind === "a-open") {
        stackOf(aOpen, parent).push({ from: pos + node.nodeSize, href: s.href });
      }
    } else if (A_CLOSE.test(value)) {
      const open = aOpen.get(parent)?.pop();
      if (open && open.from < pos) {
        decos.push(
          Decoration.inline(open.from, pos, { class: "mowl-html-link", title: open.href }),
        );
      }
    }
  });

  // Top-level paragraphs that consist of exactly one supported tag.
  doc.forEach((child, offset) => {
    const only = child.type.name === "paragraph" && child.childCount === 1 ? child.firstChild : null;
    const s =
      only?.type.name === "html" ? parseStructural(String(only.attrs?.value ?? "")) : null;
    blocks.push({ pos: offset, size: child.nodeSize, s });
  });

  const add = (b: Block, cls: string) =>
    decos.push(Decoration.node(b.pos, b.pos + b.size, { class: cls }));
  const hide = (b: Block) => add(b, "mowl-html-hidden");

  // <div align="…"> … </div>: only matched pairs are touched.
  const divs: number[] = [];
  blocks.forEach((b, i) => {
    if (b.s?.kind === "div-open") divs.push(i);
    else if (b.s?.kind === "div-close" && divs.length) {
      const o = divs.pop()!;
      const open = blocks[o].s;
      if (open?.kind !== "div-open") return;
      hide(blocks[o]);
      hide(b);
      for (let j = o + 1; j < i; j++) add(blocks[j], `mowl-html-align-${open.align}`);
    }
  });

  // <details> … <summary> … </details>
  const seen = new Map<string, number>();
  let open = -1;
  let summary = -1;
  blocks.forEach((b, i) => {
    const s = b.s;
    if (s?.kind === "details-open") {
      open = i;
      summary = -1;
    } else if (s?.kind === "summary") {
      if (s.opens) {
        open = i;
        summary = i;
      } else if (open >= 0 && summary < 0) {
        summary = i;
      }
    } else if (s?.kind === "details-close" && open >= 0) {
      const sum = summary >= 0 ? blocks[summary].s : null;
      if (sum?.kind === "summary") {
        const n = seen.get(sum.text) ?? 0;
        seen.set(sum.text, n + 1);
        const key = `${sum.text}\u0000${n}`;
        const isCollapsed = collapsed.has(key);
        if (open !== summary) hide(blocks[open]);
        hide(b);
        add(
          blocks[summary],
          isCollapsed ? "mowl-details-summary mowl-details-collapsed-summary" : "mowl-details-summary",
        );
        summaries.set(blocks[summary].pos + 1, key);
        if (isCollapsed) {
          for (let j = summary + 1; j < i; j++) add(blocks[j], "mowl-details-collapsed");
        }
      }
      open = -1;
      summary = -1;
    }
  });

  return { collapsed, decos: DecorationSet.create(doc, decos), summaries };
}

/** Key-caps, aligned blocks and collapsible sections, as decorations. */
export const rawHtmlPresentationPlugin = $prose(
  () =>
    new Plugin<PluginState>({
      key: pluginKey,
      state: {
        init: (_, state) => buildState(state.doc, new Set()),
        apply(tr, prev, _old, next) {
          const meta = tr.getMeta(pluginKey) as { toggle: string } | undefined;
          if (!meta && !tr.docChanged) return prev;
          const collapsed = new Set(prev.collapsed);
          if (meta && !collapsed.delete(meta.toggle)) collapsed.add(meta.toggle);
          return buildState(next.doc, collapsed);
        },
      },
      props: {
        decorations: (state) => pluginKey.getState(state)?.decos ?? DecorationSet.empty,
        handleClickOn(view, _pos, node, nodePos) {
          if (node.type.name !== "html") return false;
          const key = pluginKey.getState(view.state)?.summaries.get(nodePos);
          if (key === undefined) return false;
          view.dispatch(view.state.tr.setMeta(pluginKey, { toggle: key }));
          return true;
        },
      },
    }),
);

// --- html node → DOM ------------------------------------------------------------

type DomSpec = [string, Record<string, string>] | [string, Record<string, string>, string];

function cssLength(v: string): string {
  return /^\d+(?:\.\d+)?$/.test(v) ? `${v}px` : v;
}

/** The single <img> an html node consists of — bare, or inside <div>/<p>/<a>/
 *  <center> wrappers with no other content — plus the alignment it asks for. */
function imageOf(value: string): { img: HTMLImageElement; align: string } | null {
  const root = singleElement(value);
  if (!root) return null;
  const own = (el: Element) =>
    (el.getAttribute("align") ?? el.getAttribute("data-align") ?? "").trim().toLowerCase();
  if (root instanceof HTMLImageElement) return { img: root, align: own(root) };

  if (!IMG_WRAPPERS.has(root.tagName)) return null;
  const imgs = root.querySelectorAll("img");
  if (imgs.length !== 1 || root.textContent?.trim()) return null;
  const img = imgs[0];
  for (let n = img.parentElement; n; n = n.parentElement) {
    if (!IMG_WRAPPERS.has(n.tagName)) return null;
    if (n === root) break;
  }
  const align = root.tagName === "CENTER" ? "center" : own(root) || own(img);
  return { img, align };
}

function rawImageDom(value: string): DomSpec | null {
  const found = imageOf(value);
  if (!found) return null;
  const { img, align } = found;
  const src = (img.getAttribute("src") ?? "").trim();
  if (!src) return null;

  const attrs: Record<string, string> = {
    src,
    "data-type": "html",
    "data-value": value,
    "data-mowl-html-img": "true",
    "data-mowl-src": src,
  };
  const alt = img.getAttribute("alt");
  const title = img.getAttribute("title");
  if (alt) attrs.alt = alt;
  if (title) attrs.title = title;

  const width = (img.getAttribute("width") ?? "").trim();
  const height = (img.getAttribute("height") ?? "").trim();
  const style = ["max-width:100%"];
  if (LENGTH.test(width)) style.push(`width:${cssLength(width)}`);
  // without an explicit height the browser keeps the aspect ratio
  style.push(LENGTH.test(height) ? `height:${cssLength(height)}` : "height:auto");
  if (align === "center") style.push("display:block", "margin-inline:auto");
  else if (align === "left") style.push("display:block", "margin-inline-end:auto");
  else if (align === "right") style.push("display:block", "margin-inline-start:auto");
  attrs.style = style.join(";");
  return ["img", attrs];
}

function structuralDom(value: string): DomSpec | null {
  const s = parseStructural(value);
  if (!s) return null;
  const attrs = { "data-type": "html", "data-value": value, "data-mowl-html": s.kind };
  return ["span", attrs, s.kind === "summary" ? s.text : ""];
}

/** Patch Milkdown's `html` node so the constructs above render as real content.
 *  Call once, after `crepe.create()` and before content is loaded. */
export function patchHtmlMarkdown(crepe: Crepe): void {
  crepe.editor.action((ctx) => {
    const spec = (ctx.get(schemaCtx) as any).nodes?.html?.spec;
    if (!spec?.toDOM) return;

    const fallback = spec.toDOM.bind(spec);
    spec.toDOM = (node: any) => {
      const value = String(node.attrs?.value ?? "");
      if (MORE_COMMENT.test(value.trim())) {
        return ["span", { "data-type": "html", "data-value": value, "data-mowl-html": "more" }];
      }
      return rawImageDom(value) ?? structuralDom(value) ?? fallback(node);
    };

    // Re-reading rendered DOM (drag & drop) must map these back to the same node.
    const parseDOM = Array.isArray(spec.parseDOM) ? spec.parseDOM : [];
    spec.parseDOM = [
      {
        tag: "img[data-mowl-html-img]",
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "" }),
      },
      {
        tag: "span[data-mowl-html]",
        getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "" }),
      },
      ...parseDOM,
    ];
  });
}

// --- editing a bare <img> (used by the image toolbar) --------------------------

const BARE_IMG_ATTRS = new Set(["src", "alt", "width", "align"]);

export interface BareImage {
  src: string;
  alt: string;
  /** Explicit width in px, or null (none, or not a plain pixel value). */
  width: number | null;
  align: Align | null;
  /** True when the tag carries anything besides src / alt / width / align. */
  hasExtras: boolean;
}

/** Read a node that is exactly one `<img>` (no wrapper). */
export function parseBareImage(value: string): BareImage | null {
  const el = singleElement(value);
  if (!(el instanceof HTMLImageElement)) return null;
  const src = (el.getAttribute("src") ?? "").trim();
  if (!src) return null;
  const width = /^\d+(?:\.\d+)?(?:px)?$/.test((el.getAttribute("width") ?? "").trim())
    ? Math.round(parseFloat(el.getAttribute("width")!))
    : null;
  const align = (el.getAttribute("align") ?? "").trim().toLowerCase();
  return {
    src,
    alt: el.getAttribute("alt") ?? "",
    width,
    align: isAlign(align) ? align : null,
    hasExtras: el.getAttributeNames().some((n) => !BARE_IMG_ATTRS.has(n)),
  };
}

/** `<img>` markup for an image that has no HTML source yet. */
export function createBareImage(img: {
  src: string;
  alt: string;
  width: number | null;
  align: Align;
}): string {
  const el = document.createElement("img");
  el.setAttribute("src", img.src);
  if (img.alt) el.setAttribute("alt", img.alt);
  if (img.width) el.setAttribute("width", String(img.width));
  el.setAttribute("align", img.align);
  return el.outerHTML;
}

/** Change width / alignment of an existing `<img>`, keeping its other attributes. */
export function patchBareImage(
  value: string,
  patch: { width?: number | null; align?: Align },
): string | null {
  const el = singleElement(value);
  if (!(el instanceof HTMLImageElement)) return null;
  if (patch.width !== undefined) {
    if (patch.width) el.setAttribute("width", String(patch.width));
    else el.removeAttribute("width");
  }
  if (patch.align) {
    el.removeAttribute("data-align");
    el.setAttribute("align", patch.align);
  }
  return el.outerHTML;
}

// --- local image paths -----------------------------------------------------------

/** Route `<img>` sources through the same resolver as Markdown images, so
 *  relative and absolute local paths load. Remote / data / blob URLs pass
 *  through. Only touches images that have not been resolved yet. */
export function resolveRawHtmlImages(
  host: HTMLElement,
  resolver: (src: string) => string | Promise<string>,
): void {
  requestAnimationFrame(() => {
    host
      .querySelectorAll<HTMLImageElement>("img[data-mowl-html-img]:not([data-mowl-resolved])")
      .forEach((img) => {
        const raw = img.dataset.mowlSrc ?? "";
        if (!raw) return;
        img.dataset.mowlResolved = "1";
        Promise.resolve(resolver(raw))
          .then((resolved) => {
            if (img.isConnected && resolved && resolved !== raw) img.src = resolved;
          })
          .catch(() => undefined);
      });
  });
}
