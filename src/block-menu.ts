// One handle per line: Crepe's "+" add-button is hidden (see styles.css) and the
// remaining drag-dots icon becomes a click target that opens this menu, acting
// on the block next to the handle — turn into / insert / duplicate / delete.
//
// Uses raw ProseMirror commands on the live view (not Milkdown's command
// registry) so it does not depend on cross-package command identity.
import type { Crepe } from "@milkdown/crepe";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx } from "@milkdown/kit/core";
import { setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import { wrapInList, liftListItem } from "@milkdown/kit/prose/schema-list";
import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";

const LIST_NAMES = ["bullet_list", "ordered_list"];

function listAncestor(state: EditorState):
  | { node: ProseNode; depth: number; pos: number }
  | null {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (LIST_NAMES.includes(n.type.name)) {
      return { node: n, depth: d, pos: $from.before(d) };
    }
  }
  return null;
}

interface Target {
  /** A position inside the hovered block, for selection-based commands. */
  textPos: number;
  /** Top-level block boundaries, for structural edits. */
  from: number;
  to: number;
  node: ProseNode;
}

type Runner = (ctx: Ctx, target: Target) => void;
interface Item {
  label: string;
  run: Runner;
  /** True when `node` (the top-level block by the handle) is already this type. */
  active?: (node: ProseNode) => boolean;
}

const isType = (name: string) => (n: ProseNode) => n.type.name === name;
const isHeading = (level: number) => (n: ProseNode) =>
  n.type.name === "heading" && n.attrs.level === level;

const node = (view: EditorView, name: string): NodeType => view.state.schema.nodes[name];

function placeCursor(view: EditorView, target: Target): void {
  const pos = Math.min(Math.max(target.textPos, target.from + 1), target.to - 1);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))),
  );
}

/** Turn the block into a non-list block: first lift it fully out of any list. */
const turnInto =
  (make: (view: EditorView) => Command | null): Runner =>
  (ctx, target) => {
    const view = ctx.get(editorViewCtx);
    placeCursor(view, target);

    const li = node(view, "list_item");
    let guard = 0;
    while (listAncestor(view.state) && guard++ < 8) {
      const before = view.state;
      liftListItem(li)(view.state, view.dispatch, view);
      if (view.state === before) break;
    }

    const cmd = make(view);
    if (cmd) cmd(view.state, view.dispatch, view);
  };

/** Bullet <-> numbered: retype the surrounding list, or wrap if there is none. */
const toList =
  (name: string): Runner =>
  (ctx, target) => {
    const view = ctx.get(editorViewCtx);
    placeCursor(view, target);
    const listType = node(view, name);
    const found = listAncestor(view.state);
    if (found) {
      if (found.node.type === listType) return;
      view.dispatch(view.state.tr.setNodeMarkup(found.pos, listType, null));
    } else {
      wrapInList(listType)(view.state, view.dispatch, view);
    }
  };

const structural =
  (fn: (view: EditorView, target: Target) => void): Runner =>
  (ctx, target) =>
    fn(ctx.get(editorViewCtx), target);

const emptyParagraph = (view: EditorView) => node(view, "paragraph").createAndFill()!;

function buildTable(view: EditorView, rows = 3, cols = 3): ProseNode | null {
  const s = view.state.schema.nodes;
  if (!s.table || !s.table_row || !s.table_header_row || !s.table_cell || !s.table_header) {
    return null;
  }
  const headerCells = Array.from({ length: cols }, () => s.table_header.createAndFill()!);
  const bodyCells = Array.from({ length: cols }, () => s.table_cell.createAndFill()!);
  const rowNodes: ProseNode[] = [s.table_header_row.create(null, headerCells)];
  for (let i = 1; i < rows; i++) rowNodes.push(s.table_row.create(null, bodyCells));
  return s.table.create(null, rowNodes);
}

const GROUPS: Item[][] = [
  [
    { label: "Text", run: turnInto((v) => setBlockType(node(v, "paragraph"))), active: isType("paragraph") },
    { label: "Heading 1", run: turnInto((v) => setBlockType(node(v, "heading"), { level: 1 })), active: isHeading(1) },
    { label: "Heading 2", run: turnInto((v) => setBlockType(node(v, "heading"), { level: 2 })), active: isHeading(2) },
    { label: "Heading 3", run: turnInto((v) => setBlockType(node(v, "heading"), { level: 3 })), active: isHeading(3) },
  ],
  [
    { label: "Bullet list", run: toList("bullet_list"), active: isType("bullet_list") },
    { label: "Numbered list", run: toList("ordered_list"), active: isType("ordered_list") },
    { label: "Quote", run: turnInto((v) => wrapIn(node(v, "blockquote"))), active: isType("blockquote") },
    { label: "Code block", run: turnInto((v) => setBlockType(node(v, "code_block"))), active: isType("code_block") },
    {
      label: "Table",
      run: structural((view, t) => {
        const table = buildTable(view, 3, 3);
        if (!table) return;
        const empty =
          t.node.type.name === "paragraph" && t.node.content.size === 0;
        let tr = view.state.tr;
        if (empty) {
          tr = tr.replaceWith(t.from, t.to, table);
        } else {
          tr = tr.insert(t.to, table);
        }
        const at = empty ? t.from : t.to;
        const sel = TextSelection.near(tr.doc.resolve(at + 1));
        view.dispatch(tr.setSelection(sel).scrollIntoView());
      }),
    },
    {
      label: "Image",
      active: isType("image-block"),
      run: structural((view, t) => {
        const type = view.state.schema.nodes["image-block"];
        if (!type) return;
        const img = type.create({ src: "" });
        const empty =
          t.node.type.name === "paragraph" && t.node.content.size === 0;
        const at = empty ? t.from : t.to;
        let tr = empty
          ? view.state.tr.replaceWith(t.from, t.to, img)
          : view.state.tr.insert(t.to, img);
        try {
          tr = tr.setSelection(NodeSelection.create(tr.doc, at));
        } catch {
          /* selecting the new node is best-effort */
        }
        view.dispatch(tr.scrollIntoView());
      }),
    },
    {
      label: "Divider",
      active: isType("hr"),
      run: structural((view, t) => {
        const hr = node(view, "hr").create();
        view.dispatch(view.state.tr.insert(t.to, hr).scrollIntoView());
      }),
    },
  ],
  [
    {
      label: "Insert line above",
      run: structural((view, t) => {
        let tr = view.state.tr.insert(t.from, emptyParagraph(view));
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(t.from + 1)));
        view.dispatch(tr.scrollIntoView());
      }),
    },
    {
      label: "Insert line below",
      run: structural((view, t) => {
        let tr = view.state.tr.insert(t.to, emptyParagraph(view));
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(t.to + 1)));
        view.dispatch(tr.scrollIntoView());
      }),
    },
    {
      label: "Duplicate",
      run: structural((view, t) => {
        view.dispatch(
          view.state.tr.insert(t.to, t.node.copy(t.node.content)).scrollIntoView(),
        );
      }),
    },
    {
      label: "Delete",
      run: structural((view, t) => {
        view.dispatch(view.state.tr.delete(t.from, t.to).scrollIntoView());
      }),
    },
  ],
];

function resolveTarget(view: EditorView, handleRect: DOMRect): Target | null {
  const probe = view.posAtCoords({
    left: handleRect.right + 24,
    top: handleRect.top + handleRect.height / 2,
  });
  if (!probe) return null;
  try {
    const $pos = view.state.doc.resolve(probe.pos);
    if ($pos.depth >= 1) {
      const from = $pos.before(1);
      const node = $pos.node(1);
      const to = from + node.nodeSize;
      return { textPos: Math.min(Math.max(probe.pos, from + 1), to - 1), from, to, node };
    }
    // Atom top-level blocks (images) have no text to probe "inside" of, so
    // posAtCoords only ever lands on the boundary next to them (depth 0).
    // Take whichever neighbouring top-level node the probe point sits by.
    const node = $pos.nodeAfter ?? $pos.nodeBefore;
    if (!node) return null;
    const from = $pos.nodeAfter ? $pos.pos : $pos.pos - node.nodeSize;
    const to = from + node.nodeSize;
    return { textPos: from, from, to, node };
  } catch {
    return null;
  }
}

class BlockMenu {
  #el: HTMLElement;
  #crepe: Crepe;
  #target: Target | null = null;
  #open = false;

  constructor(crepe: Crepe) {
    this.#crepe = crepe;
    this.#el = document.createElement("div");
    this.#el.className = "mowl-block-menu";
    this.#el.hidden = true;
    document.body.appendChild(this.#el);
    this.#build();

    document.addEventListener("pointerdown", this.#onPointerDown, true);
    window.addEventListener("keydown", this.#onKey, true);
    window.addEventListener("resize", this.hide);
    this.#el.addEventListener("click", this.#onItemClick);
  }

  toggle(handleEl: HTMLElement): void {
    if (this.#open) {
      this.hide();
      return;
    }
    const rect = handleEl.getBoundingClientRect();
    this.#crepe.editor.action((ctx) => {
      this.#target = resolveTarget(ctx.get(editorViewCtx), rect);
    });
    if (!this.#target) return;

    this.#syncActive();
    this.#el.hidden = false;
    this.#open = true;

    const w = this.#el.offsetWidth || 210;
    const h = this.#el.offsetHeight || 320;
    let left = rect.right + 6;
    if (left + w > window.innerWidth) left = rect.left - w - 6;
    let top = rect.top;
    if (top + h > window.innerHeight) top = window.innerHeight - h - 8;
    this.#el.style.left = `${Math.max(8, left)}px`;
    this.#el.style.top = `${Math.max(8, top)}px`;
  }

  hide = (): void => {
    if (!this.#open) return;
    this.#open = false;
    this.#el.hidden = true;
    this.#target = null;
  };

  destroy(): void {
    document.removeEventListener("pointerdown", this.#onPointerDown, true);
    window.removeEventListener("keydown", this.#onKey, true);
    window.removeEventListener("resize", this.hide);
    this.#el.remove();
  }

  #build(): void {
    GROUPS.forEach((group, gi) => {
      const wrap = document.createElement("div");
      wrap.className = "group";
      group.forEach((item, ii) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.label;
        btn.dataset.g = String(gi);
        btn.dataset.i = String(ii);
        wrap.appendChild(btn);
      });
      this.#el.appendChild(wrap);
    });
  }

  /** Mark the button whose type matches the hovered block. */
  #syncActive(): void {
    const node = this.#target?.node;
    this.#el.querySelectorAll<HTMLButtonElement>("button[data-g]").forEach((btn) => {
      const item = GROUPS[Number(btn.dataset.g)]?.[Number(btn.dataset.i)];
      const on = !!(node && item?.active?.(node));
      btn.classList.toggle("is-active", on);
      btn.toggleAttribute("aria-current", on);
    });
  }

  #onItemClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-g]");
    if (!btn || !this.#target) return;
    const item = GROUPS[Number(btn.dataset.g)]?.[Number(btn.dataset.i)];
    const target = this.#target;
    this.hide();
    if (!item) return;
    this.#crepe.editor.action((ctx) => {
      try {
        item.run(ctx, target);
      } catch (err) {
        console.error("[mowl] block action failed", err);
      }
      ctx.get(editorViewCtx).focus();
    });
  };

  #onPointerDown = (e: Event): void => {
    const t = e.target as HTMLElement;
    if (this.#el.contains(t)) return;
    if (t.closest(".milkdown-block-handle")) return; // let the click toggle
    this.hide();
  };

  #onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.#open) {
      e.preventDefault();
      e.stopImmediatePropagation(); // don't let this Esc trigger quit-on-escape
      this.hide();
    }
  };
}

export function installBlockMenu(crepe: Crepe): () => void {
  const menu = new BlockMenu(crepe);
  const onClick = (e: MouseEvent) => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>(
      ".milkdown-block-handle",
    );
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    menu.toggle(handle);
  };
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    menu.destroy();
  };
}
