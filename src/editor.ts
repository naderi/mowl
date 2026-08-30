// Thin wrapper around Milkdown Crepe: one editor instance, documents are
// swapped in place (tabbed editing keeps a single instance — see tabs.ts).
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { replaceAll } from "@milkdown/kit/utils";

import { linkFromClipboard } from "./link-clipboard";
import { installBlockMenu } from "./block-menu";

export class Editor {
  private crepe: Crepe | null = null;
  private disposeBlockMenu: (() => void) | null = null;
  private readonly host: HTMLElement;

  /** Fires on every content change. */
  onChange: () => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /** Create the underlying Crepe instance once. */
  async init(markdown: string): Promise<void> {
    await this.destroy();
    const crepe = new Crepe({ root: this.host, defaultValue: markdown });
    crepe.editor.use(linkFromClipboard);
    crepe.on((listener) => {
      listener.markdownUpdated(() => this.onChange());
    });
    await crepe.create();
    this.crepe = crepe;
    this.disposeBlockMenu = installBlockMenu(crepe);
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
