import { TAG_CATALOG, canonicalTag, canonicalTags, findTag, splitTags, tagDescription, tagKey } from "./tag-catalog.mjs";

/**
 * Tag view data for the `tag-input.html` partial: canonical label, tooltip and the index in the
 * stored tags. Tags added by Active Effects (not in the source data) have no index: not removable.
 * @param {string[]} tags          The prepared tags (`system.tags`)
 * @param {string[]} [source]      The stored tags (`_source.system.tags`)
 */
export function tagChips(tags, source) {
  source = Array.isArray(source) ? source : tags ?? [];
  const stored = source.map(t => tagKey(canonicalTag(t)));
  const seen = new Set();
  const chips = [];
  for (const t of splitTags(tags)) {
    const label = canonicalTag(t);
    const key = tagKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const index = stored.indexOf(key);
    chips.push({ index: index < 0 ? null : index, derived: index < 0, label, desc: tagDescription(t), known: !!findTag(t) });
  }
  return chips;
}

/**
 * Wire the tag editor of a sheet (chips + text field with suggestions from the tag catalog).
 * @param {jQuery|HTMLElement} html     The sheet's rendered HTML
 * @param {Actor|Item} owner            The document whose `system.tags` are edited
 * @param {Application} [sheet]         The sheet, to keep the focus on the field across re-renders
 */
export function activateTagInput(html, owner, sheet) {
  const root = html instanceof HTMLElement ? html : html[0];
  for (const box of root?.querySelectorAll(".lh-tag-input") ?? []) {
    new TagInput(box, owner, sheet);
  }
}

class TagInput {
  constructor(box, owner, sheet) {
    this.box = box;
    this.owner = owner;
    this.sheet = sheet;
    this.input = box.querySelector(".tag-entry-input");
    this.menu = null;
    this.options = [];
    this.active = 0;

    for (const a of box.querySelectorAll(".tag-remove")) {
      a.addEventListener("click", ev => {
        ev.preventDefault();
        this.remove(Number(a.dataset.index));
      });
    }
    if (!this.input) return;

    // Not a form field: keep it out of the sheet's submit-on-change.
    this.input.addEventListener("change", ev => ev.stopPropagation());
    this.input.addEventListener("input", () => this.open());
    this.input.addEventListener("focus", () => this.open());
    this.input.addEventListener("blur", () => setTimeout(() => this.close(), 150));
    this.input.addEventListener("keydown", ev => this.onKey(ev));
    box.addEventListener("click", ev => {
      if (ev.target === box || ev.target.classList.contains("tag-list")) this.input.focus();
    });

    if (sheet?._lhTagRefocus) {
      sheet._lhTagRefocus = false;
      this.input.focus();
    }
  }

  /** The stored tags (without those added by Active Effects). */
  get tags() {
    return [...(this.owner._source.system?.tags ?? [])];
  }

  /** Catalog entries matching the typed text, best matches first, without the tags already set. */
  suggestions(query) {
    const q = tagKey(query);
    const taken = new Set(splitTags([...this.tags, ...(this.owner.system.tags ?? [])]).map(t => tagKey(canonicalTag(t))));
    const catalog = CONFIG.LHTRPG?.tags ?? TAG_CATALOG;
    const scored = [];
    for (const entry of catalog) {
      if (taken.has(tagKey(entry.label))) continue;
      const names = [entry.label, ...(entry.aliases ?? [])].map(tagKey);
      let score = 3;
      if (q) {
        if (names.some(n => n.startsWith(q))) score = 0;
        else if (names.some(n => n.split(" ").some(w => w.startsWith(q)))) score = 1;
        else if (names.some(n => n.includes(q))) score = 2;
        else continue;
      }
      scored.push({ entry, score });
    }
    scored.sort((a, b) => (a.score - b.score) || a.entry.label.localeCompare(b.entry.label));
    // Matches in the middle of a word ("bl" in "Goblin") only when nothing starts with the text.
    const best = scored[0]?.score ?? 3;
    return scored.filter(s => (best > 1) || (s.score < 2)).map(s => s.entry);
  }

  open() {
    const query = this.input.value.trim();
    const entries = this.suggestions(query);
    this.options = entries.map(e => ({ label: e.label, group: game.i18n.localize(e.group), desc: tagDescription(e.label) }));
    // Free text: any tag can be added, even if it isn't in the catalog.
    const exact = query && findTag(query);
    if (query && !exact && !this.tags.some(t => tagKey(canonicalTag(t)) === tagKey(query))) {
      this.options.push({ label: canonicalTag(query), custom: true });
    }
    this.active = 0;
    this.renderMenu();
  }

  renderMenu() {
    if (!this.options.length) return this.close();
    if (!this.menu) {
      this.menu = document.createElement("ol");
      this.menu.className = "lhtrpg lh-tag-menu";
      // mousedown instead of click: runs before the field's blur closes the menu.
      this.menu.addEventListener("mousedown", ev => {
        const li = ev.target.closest("li[data-index]");
        if (!li) return;
        ev.preventDefault();
        this.pick(Number(li.dataset.index));
      });
      document.body.append(this.menu);
    }
    const esc = foundry.utils.escapeHTML ?? (s => s);
    this.menu.innerHTML = this.options.map((o, i) => `
      <li data-index="${i}" class="${i === this.active ? "active" : ""}${o.custom ? " custom" : ""}">
        <div class="lh-tag-menu-row">
          <span class="lh-tag-menu-label">${o.custom ? `<i class="fas fa-plus"></i> ` : ""}${esc(o.label)}</span>
          ${o.group ? `<span class="lh-tag-menu-group">${esc(o.group)}</span>` : ""}
        </div>
        ${o.desc ? `<div class="lh-tag-menu-desc">${esc(o.desc)}</div>` : ""}
      </li>`).join("");
    this.position();
  }

  position() {
    const r = this.input.getBoundingClientRect();
    const width = Math.max(r.width, 260);
    const left = Math.min(r.left, window.innerWidth - width - 4);
    const below = window.innerHeight - r.bottom;
    Object.assign(this.menu.style, { left: `${left}px`, width: `${width}px` });
    if ((below < 200) && (r.top > below)) {
      Object.assign(this.menu.style, { top: "", bottom: `${window.innerHeight - r.top + 2}px`, maxHeight: `${Math.min(300, r.top - 8)}px` });
    } else {
      Object.assign(this.menu.style, { bottom: "", top: `${r.bottom + 2}px`, maxHeight: `${Math.min(300, below - 8)}px` });
    }
  }

  highlight(i) {
    if (!this.menu) return;
    this.active = (i + this.options.length) % this.options.length;
    this.menu.querySelectorAll("li").forEach((li, n) => li.classList.toggle("active", n === this.active));
    this.menu.children[this.active]?.scrollIntoView({ block: "nearest" });
  }

  close() {
    this.menu?.remove();
    this.menu = null;
  }

  onKey(ev) {
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        if (!this.menu) this.open(); else this.highlight(this.active + 1);
        break;
      case "ArrowUp":
        ev.preventDefault();
        this.highlight(this.active - 1);
        break;
      case "Enter":
      case "Tab":
        if (!this.input.value.trim() && (ev.key === "Tab")) return;
        ev.preventDefault();
        if (this.menu && this.options.length) this.pick(this.active);
        else if (this.input.value.trim()) this.add(this.input.value);
        break;
      case ",":
        ev.preventDefault();
        if (this.input.value.trim()) this.add(this.input.value);
        break;
      case "Escape":
        if (this.menu) {
          ev.preventDefault();
          ev.stopPropagation();
          this.close();
        }
        break;
      case "Backspace":
        if (!this.input.value && this.tags.length) this.remove(this.tags.length - 1);
        break;
    }
  }

  pick(i) {
    const option = this.options[i];
    if (option) this.add(option.label);
  }

  async add(tag) {
    const label = canonicalTag(tag);
    this.input.value = "";
    this.close();
    if (!label) return;
    const tags = canonicalTags([...this.tags, label]);
    if (tags.length === canonicalTags(this.tags).length) return;
    if (this.sheet) this.sheet._lhTagRefocus = true;
    await this.owner.update({ "system.tags": tags });
  }

  async remove(index) {
    const tags = this.tags;
    if (!(index in tags)) return;
    tags.splice(index, 1);
    if (this.sheet && (document.activeElement === this.input)) this.sheet._lhTagRefocus = true;
    await this.owner.update({ "system.tags": canonicalTags(tags) });
  }
}

/* -------------------------------------------- */
/*  Registration & migration                    */
/* -------------------------------------------- */

const MIGRATION_VERSION = 1;

/**
 * Register the tag catalog, the `lhTagChips` helper and the normalization of new/updated tags.
 * Call during the `init` hook.
 */
export function registerTags() {
  CONFIG.LHTRPG.tags ??= TAG_CATALOG;
  Handlebars.registerHelper("lhTagChips", (tags, source) => tagChips(tags, source));

  // Whatever the source (sheet, import, macro, drop from an old compendium), store canonical tags.
  const clean = tags => {
    if (!Array.isArray(tags)) return null;
    const out = canonicalTags(tags);
    return foundry.utils.objectsEqual(out, tags) ? null : out;
  };
  for (const type of ["Item", "Actor"]) {
    Hooks.on(`preCreate${type}`, doc => {
      const update = {};
      const tags = clean(doc._source.system?.tags);
      if (tags) update["system.tags"] = tags;
      // Also the embedded items of a created actor.
      const items = doc._source.items;
      if (items?.some(i => clean(i.system?.tags))) {
        update.items = items.map(i => {
          const t = clean(i.system?.tags);
          return t ? foundry.utils.mergeObject(i, { "system.tags": t }, { inplace: false }) : i;
        });
      }
      if (!foundry.utils.isEmpty(update)) doc.updateSource(update);
    });
    Hooks.on(`preUpdate${type}`, (doc, changes) => {
      const tags = clean(foundry.utils.getProperty(changes, "system.tags"));
      if (!tags) return;
      if ("system.tags" in changes) changes["system.tags"] = tags;
      else foundry.utils.setProperty(changes, "system.tags", tags);
    });
  }
}

/** Update that normalizes a document's tags, or null if they're already canonical. */
function tagsUpdate(doc) {
  const tags = doc._source?.system?.tags;
  if (!Array.isArray(tags)) return null;
  const clean = canonicalTags(tags);
  return foundry.utils.objectsEqual(clean, tags) ? null : { "system.tags": clean };
}

async function _migrateDocs(docs) {
  let count = 0;
  for (const doc of docs) {
    const update = tagsUpdate(doc);
    if (!update) continue;
    try {
      await doc.update(update, { render: false });
      count++;
    } catch (err) {
      console.error(`Log Horizon TRPG | Could not normalize the tags of ${doc.uuid}`, err);
    }
  }
  return count;
}

/** Normalize the tags of world items, actors (+ unlinked tokens) and unlocked world compendiums. */
async function migrateTags() {
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.push(token.actor);
  }
  let count = await _migrateDocs(game.items);
  for (const actor of actors) count += await _migrateDocs([actor, ...actor.items]);

  // The world's own unlocked compendiums (the system's are built already normalized).
  for (const pack of game.packs) {
    if ((pack.metadata.packageType !== "world") || pack.locked) continue;
    if (!["Item", "Actor"].includes(pack.documentName)) continue;
    for (const doc of await pack.getDocuments()) {
      count += await _migrateDocs(pack.documentName === "Actor" ? [doc, ...doc.items] : [doc]);
    }
  }

  console.log(`Log Horizon TRPG | Normalized the tags of ${count} documents`);
  if (count) ui.notifications.info(game.i18n.format("LHTRPG.Tag.Migrated", { count }));
  return true;
}

/** World migration (see helpers/migrations.mjs). */
export const TAGS_MIGRATION = {
  id: "tags", setting: "tagMigrationVersion", version: MIGRATION_VERSION, run: migrateTags
};
