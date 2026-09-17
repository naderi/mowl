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

const log = (...args: unknown[]) => console.log("[rtl-arrow]", ...args);

export const rtlArrowKeys = $prose(() => {
  log("plugin constructed");
  return new Plugin({
    key: new PluginKey("mowl-rtl-arrow-keys"),
    view() {
      log("plugin view attached");
      return {};
    },
    props: {
      handleKeyDown(view, event) {
          log("keydown", event.key, "dir attr:", view.dom.getAttribute("dir"));
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
            log("bail: modifier held");
            return false;
          }
          if (view.dom.getAttribute("dir") !== "rtl") {
            log("bail: view.dom dir is", view.dom.getAttribute("dir"));
            return false;
          }
          // Code blocks run their own CodeMirror instance and are kept LTR.
          if ((event.target as HTMLElement | null)?.closest?.(".cm-editor")) {
            log("bail: inside code block");
            return false;
          }

          const { selection } = view.state;
          if (!(selection instanceof TextSelection) || !selection.empty) {
            log("bail: not a collapsed TextSelection", selection);
            return false;
          }

          const dir: -1 | 1 = event.key === "ArrowLeft" ? -1 : 1;
          if (hasAdjacentLeaf(view, dir)) {
            log("bail: adjacent leaf/atom node");
            return false;
          }

          const domSel = document.getSelection();
          if (!domSel || typeof domSel.modify !== "function") {
            log("bail: no Selection.modify support", domSel);
            return false;
          }

          const { anchorNode, anchorOffset, focusNode: prevNode, focusOffset: prevOffset } = domSel;
          domSel.modify("move", dir < 0 ? "left" : "right", "character");
          const { focusNode, focusOffset } = domSel;
          log("modify result", { prevNode, prevOffset, focusNode, focusOffset });

          if (!focusNode || !view.dom.contains(focusNode)) {
            log("bail: landed outside editor, restoring", focusNode);
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
          } catch (e) {
            log("bail: posAtDOM threw", e);
            return false;
          }

          event.preventDefault();
          const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)));
          view.dispatch(tr.scrollIntoView());
          log("handled: moved to pos", pos);
          return true;
        },
      },
  });
});
