// The find / replace bar shown above the editor. It is backend-agnostic: the
// host (main.ts) hands it a `FindTarget` for whichever view is active (the
// WYSIWYG editor or the raw source textarea).

export interface FindStatus {
  count: number;
  /** 1-based active match, 0 when none. */
  index: number;
}

export interface FindTarget {
  /** Text currently selected in the view, to pre-fill the query. */
  selectionText(): string;
  setQuery(query: string, caseSensitive: boolean): FindStatus;
  step(dir: 1 | -1): FindStatus;
  replace(replacement: string): FindStatus;
  replaceAll(replacement: string): FindStatus;
  clear(): void;
  /** Return focus to the underlying view. */
  focusView(): void;
}

const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export class FindBar {
  #el: HTMLElement;
  #findInput: HTMLInputElement;
  #replaceInput: HTMLInputElement;
  #caseBtn: HTMLButtonElement;
  #countEl: HTMLElement;
  #target: (() => FindTarget) | null = null;
  #open = false;

  constructor(anchor: HTMLElement) {
    this.#el = document.createElement("div");
    this.#el.id = "find-bar";
    this.#el.hidden = true;
    this.#el.innerHTML = `
      <div class="find-row">
        <input type="text" class="find-field" placeholder="Find" aria-label="Find" spellcheck="false" />
        <span class="find-count" aria-live="polite"></span>
        <button class="find-btn" data-act="prev" title="Previous match (Shift+Enter)" aria-label="Previous match">&#8593;</button>
        <button class="find-btn" data-act="next" title="Next match (Enter)" aria-label="Next match">&#8595;</button>
        <button class="find-btn find-toggle" data-act="case" title="Match case" aria-label="Match case">Aa</button>
        <button class="find-btn" data-act="close" title="Close (Esc)" aria-label="Close">${ICON_CLOSE}</button>
      </div>
      <div class="find-row">
        <input type="text" class="find-field" data-role="replace" placeholder="Replace" aria-label="Replace with" spellcheck="false" />
        <button class="find-btn find-text" data-act="replace">Replace</button>
        <button class="find-btn find-text" data-act="replaceAll">All</button>
      </div>`;
    anchor.insertAdjacentElement("beforebegin", this.#el);

    this.#findInput = this.#el.querySelector<HTMLInputElement>(".find-field")!;
    this.#replaceInput = this.#el.querySelector<HTMLInputElement>(
      '[data-role="replace"]',
    )!;
    this.#caseBtn = this.#el.querySelector<HTMLButtonElement>(
      '[data-act="case"]',
    )!;
    this.#countEl = this.#el.querySelector<HTMLElement>(".find-count")!;

    this.#el.addEventListener("click", this.#onClick);
    this.#findInput.addEventListener("input", () => this.#runQuery(0));
    this.#findInput.addEventListener("keydown", this.#onFieldKey);
    this.#replaceInput.addEventListener("keydown", this.#onFieldKey);
  }

  get isOpen(): boolean {
    return this.#open;
  }

  /** Point the bar at a view. Call whenever the active view changes. */
  bind(getTarget: () => FindTarget): void {
    this.#target = getTarget;
    if (this.#open) this.#runQuery(0);
  }

  open(withReplace: boolean): void {
    if (!this.#target) return;
    const seed = this.#target().selectionText();
    if (seed && !seed.includes("\n")) this.#findInput.value = seed;
    this.#el.hidden = false;
    this.#el.classList.toggle("replace-mode", withReplace);
    this.#open = true;
    this.#findInput.focus();
    this.#findInput.select();
    this.#runQuery(0);
  }

  close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#el.hidden = true;
    this.#target?.().clear();
    this.#target?.().focusView();
  }

  #caseSensitive(): boolean {
    return this.#caseBtn.classList.contains("active");
  }

  #render(status: FindStatus): void {
    this.#countEl.textContent = status.count
      ? `${status.index}/${status.count}`
      : this.#findInput.value
        ? "0/0"
        : "";
    this.#findInput.classList.toggle(
      "no-match",
      Boolean(this.#findInput.value) && status.count === 0,
    );
  }

  #runQuery(step: 0 | 1 | -1): void {
    if (!this.#target) return;
    const t = this.#target();
    const status = t.setQuery(this.#findInput.value, this.#caseSensitive());
    if (step !== 0 && status.count > 0) {
      this.#render(t.step(step));
    } else {
      this.#render(status);
    }
  }

  #onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!btn || !this.#target) return;
    const t = this.#target();
    switch (btn.dataset.act) {
      case "prev":
        this.#render(t.step(-1));
        break;
      case "next":
        this.#render(t.step(1));
        break;
      case "case":
        this.#caseBtn.classList.toggle("active");
        this.#runQuery(0);
        break;
      case "replace":
        this.#render(t.replace(this.#replaceInput.value));
        break;
      case "replaceAll":
        this.#render(t.replaceAll(this.#replaceInput.value));
        break;
      case "close":
        this.close();
        break;
    }
  };

  #onFieldKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!this.#target) return;
      if ((e.target as HTMLElement).dataset.role === "replace") {
        this.#render(this.#target().replace(this.#replaceInput.value));
      } else {
        this.#render(this.#target().step(e.shiftKey ? -1 : 1));
      }
    }
  };
}
