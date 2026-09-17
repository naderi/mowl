// ProseMirror's default Left/Right arrow handling (`selectHorizontally` in
// prosemirror-view) probes `view.endOfTextblock()` on every keypress with a
// collapsed cursor, to decide whether the move would leave the text block.
// That probe calls the native `Selection.modify()` purely to check the
// outcome, then tries to restore the selection to where it was — a restore
// that only works correctly on Firefox, via the Firefox-only
// `caretBidiLevel` API. On Chromium (WebView2/Edge, what Tauri uses on
// Windows), there's no equivalent hook, so the probe corrupts the browser's
// internal bidi caret state on every arrow press. In right-to-left text this
// surfaces as the cursor getting stuck oscillating near the start/end of a
// line. See https://github.com/ProseMirror/prosemirror/issues/960.
//
// Work around it for the common case — moving through plain text, nothing
// special adjacent — by performing the real native move once ourselves and
// syncing ProseMirror's selection to match, instead of probing then
// discarding. Anything with an atom/leaf neighbour (images, hard breaks,
// list/node boundaries) is left to ProseMirror's own handling untouched.
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";

function hasAdjacentLeaf(view: EditorView, dir: -1 | 1): boolean {
  const { $head } = view.state.selection;
  if ($head.textOffset) return false; // mid-text-node: nothing adjacent
  const node = dir < 0 ? $head.nodeBefore : $head.nodeAfter;
  return !!node && !node.isText;
}

export const rtlArrowKeys = $prose(
  () =>
    new Plugin({
      key: new PluginKey("mowl-rtl-arrow-keys"),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
          if (view.dom.getAttribute("dir") !== "rtl") return false;
          // Code blocks run their own CodeMirror instance and are kept LTR.
          if ((event.target as HTMLElement | null)?.closest?.(".cm-editor")) return false;

          const { selection } = view.state;
          if (!(selection instanceof TextSelection) || !selection.empty) return false;

          const dir: -1 | 1 = event.key === "ArrowLeft" ? -1 : 1;
          if (hasAdjacentLeaf(view, dir)) return false;

          const domSel = document.getSelection();
          if (!domSel || typeof domSel.modify !== "function") return false;

          const { anchorNode, anchorOffset, focusNode: prevNode, focusOffset: prevOffset } = domSel;
          domSel.modify("move", dir < 0 ? "left" : "right", "character");
          const { focusNode, focusOffset } = domSel;

          if (!focusNode || !view.dom.contains(focusNode)) {
            // Ran off the start/end of the whole document — put it back and
            // let the normal handling chain deal with it.
            try {
              domSel.collapse(anchorNode, anchorOffset ?? 0);
              if (prevNode && (prevNode !== anchorNode || prevOffset !== anchorOffset))
                domSel.extend(prevNode, prevOffset ?? 0);
            } catch {
              /* nothing sane to restore to */
            }
            return false;
          }

          let pos: number;
          try {
            pos = view.posAtDOM(focusNode, focusOffset);
          } catch {
            return false;
          }

          event.preventDefault();
          const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)));
          view.dispatch(tr.scrollIntoView());
          return true;
        },
      },
    }),
);
