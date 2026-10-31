// Tab on a multi-item list selection that starts at the list's first item.
// Milkdown binds Tab to ProseMirror's `sinkListItem`, which refuses the whole
// range when it contains the first item (that one has no previous sibling to
// nest under) — Tab then falls through and moves focus out of the editor.
// Here the first item stays put and the remaining selected items are indented.
import { listItemSchema } from "@milkdown/kit/preset/commonmark";
import { $prose } from "@milkdown/kit/utils";
import { keymap } from "@milkdown/kit/prose/keymap";
import { liftListItem, sinkListItem } from "@milkdown/kit/prose/schema-list";
import { TextSelection, type Command } from "@milkdown/kit/prose/state";

export const listIndentKeymap = $prose((ctx) => {
  const itemType = listItemSchema.type(ctx);
  const sink = sinkListItem(itemType);

  const indentFromFirst: Command = (state, dispatch) => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange(
      $to,
      (n) => n.childCount > 0 && n.firstChild!.type === itemType,
    );
    // Not in a list, or the regular sink case (handled by Milkdown's keymap).
    if (!range || range.startIndex !== 0) return false;
    // Only the first item selected: nothing to indent, but keep focus here.
    if (range.endIndex - range.startIndex < 2) return true;

    // Run `sinkListItem` as if the selection started in the second item, then
    // replay its steps on the real state so the user's selection is kept.
    const secondItem = range.start + range.parent.child(0).nodeSize;
    const $start = TextSelection.near(state.doc.resolve(secondItem + 1)).$from;
    const shifted = state.apply(
      state.tr.setSelection(TextSelection.between($start, $to)),
    );
    return sink(
      shifted,
      dispatch &&
        ((inner) => {
          const tr = state.tr;
          inner.steps.forEach((step) => tr.step(step));
          dispatch(tr.scrollIntoView());
        }),
    );
  };

  // Selection that starts inside a list but runs past its end (e.g. the last
  // items selected down into the empty paragraph after the list): there is no
  // common list range then, so Tab/Shift-Tab did nothing. Clip the selection to
  // the end of the list and run the command on that.
  const clipToList = (cmd: Command): Command => (state, dispatch) => {
    const { $from, $to } = state.selection;
    if ($from.sameParent($to)) return false;
    for (let d = $from.depth; d > 0; d--) {
      const list = $from.node(d);
      if (list.childCount === 0 || list.firstChild!.type !== itemType) continue;
      if ($to.pos <= $from.end(d)) return false; // still inside: normal handling
      const clipped = TextSelection.between($from, state.doc.resolve($from.end(d)));
      const shifted = state.apply(state.tr.setSelection(clipped));
      return cmd(
        shifted,
        dispatch &&
          ((inner) => {
            const tr = state.tr;
            inner.steps.forEach((step) => tr.step(step));
            dispatch(tr.scrollIntoView());
          }),
      );
    }
    return false;
  };

  return keymap({
    Tab: (state, dispatch, view) =>
      indentFromFirst(state, dispatch, view) || clipToList(sink)(state, dispatch, view),
    "Shift-Tab": clipToList(liftListItem(itemType)),
  });
});
