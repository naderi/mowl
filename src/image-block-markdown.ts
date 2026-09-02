// Crepe's block-image component (a picture sitting alone in its own paragraph)
// round-trips through Markdown in a lossy, non-standard way: it writes the
// image's *aspect ratio* into the alt-text slot (`![1.00](pic.png)`) and the
// caption into the title slot. Opening and re-saving any ordinary
// `![Alt text](pic.png)` therefore discards the alt text and replaces it with
// a number.
//
// This module rewrites the image-block node's Markdown parse/serialize runners
// so a block image is just `![alt](src)` again:
//
//   * parse    — the Markdown alt text becomes the node's caption; the ratio is
//                not read from Markdown (defaults to 1). A file previously
//                mangled by Crepe (`![1.00](pic.png "My caption")`) is detected
//                by the exact `N.NN` shape and migrated: the title becomes the
//                caption, the number is dropped.
//   * serialize — `![caption](src)`, nothing else. The in-editor resize ratio
//                is intentionally not persisted: standard Markdown has nowhere
//                to put it, and keeping it there is what caused the bug.
//
// Applied by mutating the live schema spec after `crepe.create()` — the
// transformer reads `spec.parseMarkdown` / `spec.toMarkdown` fresh on every
// run, and the spec object is created anew for each editor instance.

import { schemaCtx } from "@milkdown/kit/core";
import type { Crepe } from "@milkdown/crepe";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Exactly what `Number.parseFloat(r).toFixed(2)` produces, e.g. "1.00". */
const CREPE_RATIO = /^\d+\.\d{2}$/;

function parseRunner(state: any, node: any, type: any): void {
  const src = typeof node.url === "string" ? node.url : "";
  const alt = typeof node.alt === "string" ? node.alt : "";
  const title = typeof node.title === "string" ? node.title : "";

  // A file Crepe saved earlier: ratio in `alt`, caption in `title`.
  const migrating = CREPE_RATIO.test(alt);
  const caption = migrating ? title : alt;

  state.addNode(type, { src, caption, ratio: 1 });
}

function toMarkdownRunner(state: any, node: any): void {
  const { src, caption } = node.attrs;
  state.openNode("paragraph");
  state.addNode("image", undefined, undefined, {
    url: src,
    alt: typeof caption === "string" ? caption : "",
  });
  state.closeNode();
}

/** Swap in the standard-Markdown runners. Call once, after `crepe.create()`. */
export function patchImageBlockMarkdown(crepe: Crepe): void {
  crepe.editor.action((ctx) => {
    const spec = (ctx.get(schemaCtx) as any).nodes?.["image-block"]?.spec;
    if (!spec?.parseMarkdown || !spec?.toMarkdown) return;
    spec.parseMarkdown.runner = parseRunner;
    spec.toMarkdown.runner = toMarkdownRunner;
  });
}
