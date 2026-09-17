// Left/Right arrow-key navigation is broken for right-to-left text in this
// app's WebView2 runtime, in two compounding ways (both confirmed by direct
// instrumentation):
//
// 1. The native `Selection.modify("move", "left"/"right", "character")`
//    primitive — the one both the browser's default key handling and
//    ProseMirror's own `endOfTextblock` probe rely on — gets stuck at
//    certain positions in RTL text instead of advancing.
// 2. Even setting the DOM selection directly (bypassing `modify()`) doesn't
//    stick: shortly after, the browser fires a native `selectionchange`
//    event reporting a *different* (wrong) caret position for the same
//    bidi-boundary spot, and ProseMirror's own `domObserver` — which
//    listens for `selectionchange` to pick up selection changes it didn't
//    cause itself (e.g. mouse clicks) — dutifully syncs the document model
//    back to that wrong position, undoing the fix a tick later.
//
// So: compute the new cursor position purely from the ProseMirror document
// model (move by one Unicode grapheme cluster via Intl.Segmenter, so
// combining marks and surrogate pairs move as a unit — see
// graphemeBoundaries), and tell the view's DOM observer to ignore the
// bogus follow-up `selectionchange` instead of trusting it.
//
// This only handles a single run of plain text within the current
// paragraph/heading — anything with an adjacent atom/leaf node (images,
// hard breaks), an offset that doesn't line up with a grapheme boundary, or
// a move that would leave the block is left to ProseMirror's existing
// (unreliable, but no worse than before) handling.
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";

function hasAdjacentLeaf(view: EditorView, dir: -1 | 1): boolean {
  const { $head } = view.state.selection;
  if ($head.textOffset) return false; // mid-text-node: nothing adjacent
  const node = dir < 0 ? $head.nodeBefore : $head.nodeAfter;
  return !!node && !node.isText;
}

/** Offsets of every grapheme-cluster boundary in `text`, from 0 to text.length. */
function graphemeBoundaries(text: string): number[] {
  const bounds = [0];
  const SegmenterCtor = (
    Intl as {
      Segmenter?: new (
        locale: undefined,
        opts: { granularity: string },
      ) => { segment(s: string): Iterable<{ index: number; segment: string }> };
    }
  ).Segmenter;
  if (SegmenterCtor) {
    for (const { index, segment } of new SegmenterCtor(undefined, { granularity: "grapheme" }).segment(text))
      bounds.push(index + segment.length);
  } else {
    for (let i = 0; i < text.length; i++) bounds.push(i + 1);
  }
  return bounds;
}

/** ProseMirror's DOMObserver isn't part of the public API surface, but
 *  `suppressSelectionUpdates` is the documented escape hatch (also used
 *  internally by prosemirror-view itself) for telling it to ignore the next
 *  native `selectionchange` rather than syncing the model to it. */
function suppressNextSelectionChange(view: EditorView): void {
  const observer = (view as unknown as { domObserver?: { suppressSelectionUpdates(): void } }).domObserver;
  console.log("[rtl-arrow] domObserver found:", !!observer);
  observer?.suppressSelectionUpdates();
}

export const rtlArrowKeys = $prose(() =>
  new Plugin({
    key: new PluginKey("mowl-rtl-arrow-keys"),
    view() {
      let last = -1;
      const onRawSelectionChange = () => {
        const sel = document.getSelection();
        console.log(
          "[rtl-arrow]",
          performance.now().toFixed(1),
          "RAW selectionchange: focusOffset",
          sel?.focusOffset,
          "anchorOffset",
          sel?.anchorOffset,
          "text",
          sel?.focusNode?.textContent?.slice(0, 20),
        );
      };
      document.addEventListener("selectionchange", onRawSelectionChange);
      return {
        update(view) {
          const pos = view.state.selection.$head.pos;
          if (pos !== last) {
            console.log(
              "[rtl-arrow]",
              performance.now().toFixed(1),
              "selection now at",
              pos,
              "(was",
              last,
              ")",
            );
            last = pos;
          }
        },
        destroy() {
          document.removeEventListener("selectionchange", onRawSelectionChange);
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight")
          console.log(
            "[rtl-arrow]",
            performance.now().toFixed(1),
            "keydown",
            event.key,
            "repeat:",
            event.repeat,
            "defaultPrevented:",
            event.defaultPrevented,
          );
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
        if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
        if (view.dom.getAttribute("dir") !== "rtl") return false;
        // Code blocks run their own CodeMirror instance and are kept LTR.
        if ((event.target as HTMLElement | null)?.closest?.(".cm-editor")) return false;

        const { selection } = view.state;
        if (!(selection instanceof TextSelection) || !selection.empty) return false;

        // Physical Right = visually right = logically backward in RTL text.
        const logicalDir: -1 | 1 = event.key === "ArrowRight" ? -1 : 1;
        if (hasAdjacentLeaf(view, logicalDir)) return false;

        const { $head } = selection;
        const bounds = graphemeBoundaries($head.parent.textContent);
        const at = bounds.indexOf($head.parentOffset);
        if (at === -1) return false; // offset doesn't line up (e.g. an atom elsewhere in the block)

        const target = at + logicalDir;
        if (target < 0 || target >= bounds.length) return false; // would leave the block

        const newPos = $head.start() + bounds[target];
        event.preventDefault();
        suppressNextSelectionChange(view);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, newPos)).scrollIntoView(),
        );
        return true;
      },
    },
  }),
);
