// Thin wrapper around Milkdown Crepe: one editor instance, documents are
// swapped in place (tabbed editing keeps a single instance — see tabs.ts).
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { replaceAll } from "@milkdown/kit/utils";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";

import { linkFromClipboard } from "./link-clipboard";
import { installBlockMenu } from "./block-menu";
import {
  configureMarkdownSerializer,
  type ListMarker,
} from "./markdown-serializer";
import {
  findKey,
  findPlugin,
  statusOf,
  activeMatch,
  allMatches,
  type FindStatus,
} from "./find";

export class Editor {
  private crepe: Crepe | null = null;
  private disposeBlockMenu: (() => void) | null = null;
  private readonly host: HTMLElement;
  private listMarker: ListMarker = "*";

  /** Fires on every content change. */
  onChange: () => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /** Bullet-list marker written on save. Applied on the next `init()`. */
  setListMarker(marker: ListMarker): void {
    this.listMarker = marker;
  }

  /** Create the underlying Crepe instance once. */
  async init(markdown: string): Promise<void> {
    await this.destroy();
    const crepe = new Crepe({ root: this.host, defaultValue: markdown });
    const marker = this.listMarker;
    crepe.editor
      .config((ctx) => configureMarkdownSerializer(ctx, marker))
      .use(linkFromClipboard)
      .use(findPlugin);
    crepe.on((listener) => {
      listener.markdownUpdated(() => this.onChange());
    });
    await crepe.create();
    this.crepe = crepe;
    this.disposeBlockMenu = installBlockMenu(crepe);
  }

  /** Rebuild the instance in place, keeping the current content. */
  async reload(): Promise<void> {
    if (!this.crepe) return;
    await this.init(this.getMarkdown());
  }

  /** Replace the whole document without tearing the instance down. */
  setContent(markdown: string): void {
    this.crepe?.editor.action(replaceAll(markdown, true));
  }

  getMarkdown(): string {
    return this.crepe?.getMarkdown() ?? "";
  }

  setSpellcheck(on: boolean): void {
    this.host
      .querySelector(".ProseMirror")
      ?.setAttribute("spellcheck", String(on));
  }

  setDirection(dir: "ltr" | "rtl"): void {
    this.host.querySelector(".ProseMirror")?.setAttribute("dir", dir);
    (this.host.querySelector(".milkdown") as HTMLElement | null)?.setAttribute(
      "dir",
      dir,
    );
  }

  focus(): void {
    (this.host.querySelector(".ProseMirror") as HTMLElement | null)?.focus();
  }

  // --- find / replace ----------------------------------------------------

  private view(): EditorView | null {
    return this.crepe?.editor.action((ctx) => ctx.get(editorViewCtx)) ?? null;
  }

  private status(): FindStatus {
    const view = this.view();
    return statusOf(view ? findKey.getState(view.state) : null);
  }

  private scrollToActive(): void {
    const view = this.view();
    if (!view) return;
    const m = activeMatch(findKey.getState(view.state));
    if (!m) return;
    const at = view.domAtPos(m.from);
    const el =
      at.node.nodeType === 1
        ? (at.node as HTMLElement)
        : at.node.parentElement;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
  }

  /** Selected text, for pre-filling the find box. */
  selectionText(): string {
    const view = this.view();
    if (!view) return "";
    const { from, to } = view.state.selection;
    return from === to ? "" : view.state.doc.textBetween(from, to, " ");
  }

  findSet(query: string, caseSensitive: boolean): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    view.dispatch(
      view.state.tr.setMeta(findKey, { query, caseSensitive, active: 0 }),
    );
    this.scrollToActive();
    return this.status();
  }

  findStep(dir: 1 | -1): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    view.dispatch(view.state.tr.setMeta(findKey, { step: dir }));
    this.scrollToActive();
    return this.status();
  }

  findClear(): void {
    const view = this.view();
    view?.dispatch(view.state.tr.setMeta(findKey, { query: "" }));
  }

  findReplace(replacement: string): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    const m = activeMatch(findKey.getState(view.state));
    if (!m) return this.status();
    const tr = view.state.tr;
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
    // Keep the same ordinal so the selection lands on the following match.
    tr.setMeta(findKey, { active: findKey.getState(view.state)?.active ?? 0 });
    view.dispatch(tr);
    this.scrollToActive();
    return this.status();
  }

  findReplaceAll(replacement: string): FindStatus {
    const view = this.view();
    if (!view) return { count: 0, index: 0 };
    const matches = allMatches(findKey.getState(view.state));
    if (!matches.length) return { count: 0, index: 0 };
    const tr = view.state.tr;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (replacement) tr.insertText(replacement, m.from, m.to);
      else tr.delete(m.from, m.to);
    }
    tr.setMeta(findKey, { active: 0 });
    view.dispatch(tr);
    return this.status();
  }

  async destroy(): Promise<void> {
    this.disposeBlockMenu?.();
    this.disposeBlockMenu = null;
    if (this.crepe) {
      await this.crepe.destroy();
      this.crepe = null;
    }
    this.host.replaceChildren();
  }
}
