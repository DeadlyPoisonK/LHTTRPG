/**
 * Generic floating suggestion dropdown attached to a text input.
 * Extracted from TagInput (module/helpers/tags.mjs) for reuse across the system.
 */
export class SuggestInput {
  /**
   * @param {HTMLInputElement} input
   * @param {object} options
   * @param {(query: string) => Array<{value: any, label: string, group?: string, desc?: string, custom?: boolean, badge?: string, badgeType?: string}>} options.getOptions
   * @param {(option: object) => void} options.onPick
   * @param {(ev: KeyboardEvent, suggest: SuggestInput) => boolean|void} [options.onKeyDown]
   * @param {string} [options.menuClass="lhtrpg lh-tag-menu"]
   */
  constructor(input, options = {}) {
    this.input = input;
    this.options = [];
    this.active = 0;
    this.menu = null;
    this.getOptions = options.getOptions ?? (() => []);
    this.onPick = options.onPick ?? (() => {});
    this.onKeyDown = options.onKeyDown ?? null;
    this.menuClass = options.menuClass ?? "lhtrpg lh-tag-menu";
    this._blurTimeout = null;

    this._onInput = () => this.open();
    this._onFocus = () => this.open();
    this._onBlur = () => {
      this._blurTimeout = setTimeout(() => this.close(), 150);
    };
    this._onKey = ev => this.onKey(ev);
    this._onClick = () => {
      if (!this.isOpen) this.open();
    };

    this.input.addEventListener("input", this._onInput);
    this.input.addEventListener("focus", this._onFocus);
    this.input.addEventListener("blur", this._onBlur);
    this.input.addEventListener("keydown", this._onKey);
    this.input.addEventListener("click", this._onClick);
  }

  get isOpen() {
    return !!this.menu;
  }

  open() {
    const query = this.input.value.trim();
    this.options = this.getOptions(query) ?? [];
    this.active = 0;
    this.renderMenu();
  }

  renderMenu() {
    if (!this.options.length) return this.close();
    if (!this.menu) {
      this.menu = document.createElement("ol");
      this.menu.className = this.menuClass;
      // mousedown instead of click: runs before the field's blur closes the menu.
      this.menu.addEventListener("mousedown", ev => {
        const li = ev.target.closest("li[data-index]");
        if (!li) return;
        ev.preventDefault();
        this.pick(Number(li.dataset.index));
      });
      document.body.append(this.menu);
    }
    const esc = globalThis.foundry?.utils?.escapeHTML ?? (s => s);
    this.menu.innerHTML = this.options.map((o, i) => {
      const badgeHtml = o.badge
        ? ` <span class="lh-target-chip${o.badgeType ? ` ${esc(o.badgeType)}` : ""}">[${esc(o.badge)}]</span>`
        : "";
      return `
      <li data-index="${i}" class="${i === this.active ? "active" : ""}${o.custom ? " custom" : ""}">
        <div class="lh-tag-menu-row">
          <span class="lh-tag-menu-label">${o.custom ? `<i class="fas fa-plus"></i> ` : ""}${esc(o.label ?? String(o.value ?? ""))}${badgeHtml}</span>
          ${o.group ? `<span class="lh-tag-menu-group">${esc(o.group)}</span>` : ""}
        </div>
        ${o.desc ? `<div class="lh-tag-menu-desc">${esc(o.desc)}</div>` : ""}
      </li>`;
    }).join("");
    this.position();
  }

  position() {
    if (!this.menu) return;
    const r = this.input.getBoundingClientRect();
    const width = Math.max(r.width, 260);
    const left = Math.max(4, Math.min(r.left, window.innerWidth - width - 4));
    const below = window.innerHeight - r.bottom;
    Object.assign(this.menu.style, { left: `${left}px`, width: `${width}px` });
    if ((below < 200) && (r.top > below)) {
      Object.assign(this.menu.style, { top: "", bottom: `${window.innerHeight - r.top + 2}px`, maxHeight: `${Math.min(300, r.top - 8)}px` });
    } else {
      Object.assign(this.menu.style, { bottom: "", top: `${r.bottom + 2}px`, maxHeight: `${Math.min(300, below - 8)}px` });
    }
  }

  highlight(i) {
    if (!this.menu || !this.options.length) return;
    this.active = (i + this.options.length) % this.options.length;
    this.menu.querySelectorAll("li").forEach((li, n) => li.classList.toggle("active", n === this.active));
    this.menu.children[this.active]?.scrollIntoView({ block: "nearest" });
  }

  close() {
    if (this._blurTimeout) {
      clearTimeout(this._blurTimeout);
      this._blurTimeout = null;
    }
    this.menu?.remove();
    this.menu = null;
  }

  pick(i) {
    const option = this.options[i];
    if (option) {
      this.close();
      this.onPick(option);
    }
  }

  onKey(ev) {
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        if (!this.menu) this.open(); else this.highlight(this.active + 1);
        return;
      case "ArrowUp":
        ev.preventDefault();
        if (!this.menu) this.open(); else this.highlight(this.active - 1);
        return;
      case "Enter":
      case "Tab":
        if (!this.input.value.trim() && (ev.key === "Tab")) return;
        if (this.menu && this.options.length) {
          ev.preventDefault();
          this.pick(this.active);
          return;
        }
        break;
      case "Escape":
        if (this.menu) {
          ev.preventDefault();
          ev.stopPropagation();
          this.close();
          return;
        }
        break;
    }

    if (this.onKeyDown) {
      this.onKeyDown(ev, this);
    }
  }

  destroy() {
    this.close();
    this.input.removeEventListener("input", this._onInput);
    this.input.removeEventListener("focus", this._onFocus);
    this.input.removeEventListener("blur", this._onBlur);
    this.input.removeEventListener("keydown", this._onKey);
    this.input.removeEventListener("click", this._onClick);
  }
}
