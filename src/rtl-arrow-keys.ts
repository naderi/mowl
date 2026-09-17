// Left/Right arrow-key navigation is broken for right-to-left text in this
// app's WebView2 runtime: the native `Selection.modify("move", "left"/
// "right", "character")` primitive — the same one both the browser's default
// key handling and ProseMirror's own `endOfTextblock` probe rely on — simply
// gets stuck at certain positions within RTL text instead of advancing.
// Confirmed by instrumenting it directly: repeated ArrowRight/ArrowLeft
// presses kept resolving to the exact same document position instead of
// moving further each time.
//
// Since the native primitive itself is unreliable here, don't use it at all.
// Compute the new cursor position purely from the ProseMirror document
// model: physical ArrowRight moves the caret visually right, which for RTL
// text means logically *backward* (toward the start of the string);
// physical ArrowLeft means logically forward. Move by one Unicode grapheme
// cluster (via Intl.Segmenter) so combining marks (e.g. Hebrew niqqud,
// Arabic tashkeel) and surrogate pairs move as a unit.
//
// This only handles a single run of plain text within the current
// paragraph/heading — anything with an adjacent atom/leaf node (images,
// hard breaks), an offset that doesn't line up with a grapheme boundary
// (e.g. an inline atom elsewhere in the block throwing off the count), or a
// move that would leave the block is left to ProseMirror's existing
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
  const SegmenterCtor = (Intl as { Segmenter?: new (locale: undefined, opts: { granularity: string }) => { segment(s: string): Iterable<{ index: number; segment: string }> } }).Segmenter;
  if (SegmenterCtor) {
    for (const { index, segment } of new SegmenterCtor(undefined, { granularity: "grapheme" }).segment(text))
      bounds.push(index + segment.length);
  } else {
    for (let i = 0; i < text.length; i++) bounds.push(i + 1);
  }
  return bounds;
}

export const rtlArrowKeys = $prose(() =>
  new Plugin({
    key: new PluginKey("mowl-rtl-arrow-keys"),
    view() {
      let last = -1;
      return {
        update(view) {
          const pos = view.state.selection.$head.pos;
          if (pos !== last) {
            console.log("[rtl-arrow] selection now at", pos, "(was", last, ")", new Error().stack?.split("\n").slice(1, 5).join(" | "));
            last = pos;
          }
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
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
        if (at === -1) {
          console.log("[rtl-arrow] bail: offset", $head.parentOffset, "not in bounds", bounds);
          return false;
        }

        const target = at + logicalDir;
        if (target < 0 || target >= bounds.length) {
          console.log("[rtl-arrow] bail: would leave block, at", at, "of", bounds.length);
          return false;
        }

        const newPos = $head.start() + bounds[target];
        event.preventDefault();
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, newPos)).scrollIntoView(),
        );
        console.log(
          "[rtl-arrow] moved",
          $head.pos,
          "->",
          newPos,
          "actual post-dispatch pos:",
          view.state.selection.$head.pos,
        );
        return true;
      },
    },
  }),
);
