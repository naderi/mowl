// Left/Right arrow-key navigation is broken for right-to-left text in this
// app's WebView2 runtime, confirmed by direct instrumentation across
// several layers:
//
// 1. The native `Selection.modify("move", "left"/"right", "character")`
//    primitive — the one both the browser's default key handling and
//    ProseMirror's own `endOfTextblock` probe rely on — gets stuck at
//    certain positions in RTL text instead of advancing.
// 2. Setting the DOM selection directly (bypassing `modify()`) sticks at
//    first — the very next `selectionchange` confirms the correct offset —
//    but roughly 250-300ms later, a *second*, unprompted `selectionchange`
//    fires (no corresponding keydown) reverting the caret to the previous
//    position. That delay and the lack of a second key event point to
//    Windows' Text Services Framework doing its own asynchronous bidi
//    caret "correction" underneath WebView2, independently of the DOM
//    event model — `preventDefault()` can't stop it because it isn't a
//    default action of the keydown event at all.
//
// So: compute the new cursor position purely from the ProseMirror document
// model (move by one Unicode grapheme cluster via Intl.Segmenter, so
// combining marks and surrogate pairs move as a unit), apply it, and then
// keep reasserting that position for a short window if anything (that
// delayed TSF correction) tries to change it back — instead of trusting
// the first successful-looking result.
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
 *  native `selectionchange` rather than syncing the model to it. It only
 *  covers a 50ms window though, far short of the ~300ms TSF delay below. */
function suppressNextSelectionChange(view: EditorView): void {
  (view as unknown as { domObserver?: { suppressSelectionUpdates(): void } }).domObserver?.suppressSelectionUpdates();
}

const GUARD_MS = 1000;
const MAX_REASSERTS = 8;

export const rtlArrowKeys = $prose(() => {
  // Shared by handleKeyDown and the selectionchange listener below: the
  // position we last explicitly set (and the one we moved away from), plus
  // how long/how many times we're willing to fight a delayed correction
  // back to it. Only fights a revert to exactly the *previous* position —
  // the signature of the delayed TSF correction — so an unrelated selection
  // change (e.g. the user clicking elsewhere) isn't clobbered.
  let expected: { pos: number; revertsTo: number; until: number; tries: number } | null = null;

  return new Plugin({
    key: new PluginKey("mowl-rtl-arrow-keys"),
    view(view) {
      const onSelectionChange = () => {
        if (!expected) return;
        if (Date.now() > expected.until || expected.tries >= MAX_REASSERTS) {
          expected = null;
          return;
        }
        const pos = view.state.selection.$head.pos;
        if (pos === expected.revertsTo) {
          expected.tries++;
          console.log("[rtl-arrow] reasserting", expected.pos, "after revert to", pos, "(try", expected.tries, ")");
          suppressNextSelectionChange(view);
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, expected.pos)));
        } else if (pos !== expected.pos) {
          expected = null; // something else changed the selection; don't fight it
        }
      };
      document.addEventListener("selectionchange", onSelectionChange);
      return {
        destroy: () => document.removeEventListener("selectionchange", onSelectionChange),
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
        if (at === -1) return false; // offset doesn't line up (e.g. an atom elsewhere in the block)

        const step = at + logicalDir;
        if (step < 0 || step >= bounds.length) return false; // would leave the block

        const newPos = $head.start() + bounds[step];
        event.preventDefault();
        expected = { pos: newPos, revertsTo: $head.pos, until: Date.now() + GUARD_MS, tries: 0 };
        suppressNextSelectionChange(view);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, newPos)).scrollIntoView(),
        );
        return true;
      },
    },
  });
});
