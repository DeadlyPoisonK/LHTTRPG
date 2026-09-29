import { TAG_CATALOG, canonicalTag, canonicalTags, findTag, splitTags, tagDescription, tagKey } from "./tag-catalog.mjs";
import { SuggestInput } from "./suggest-input.mjs";

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
  const root = html instanceof HTMLElement ? html : (html?.[0] ?? html);
  for (const box of root?.querySelectorAll?.(".lh-tag-input") ?? []) {
    new TagInput(box, owner, sheet);
  }
}

class TagInput {
  constructor(box, owner, sheet) {
    this.box = box;
    this.owner = owner;
    this.sheet = sheet;
    this.input = box.querySelector(".tag-entry-input");

    for (const a of box.querySelectorAll(".tag-remove")) {
      a.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this.remove(Number(a.dataset.index));
      });
    }
    if (!this.input) return;

    // Not a form field: keep it out of the sheet's submit-on-change.
    this.input.addEventListener("change", ev => ev.stopPropagation());
    box.addEventListener("click", ev => {
      if (ev.target === box || ev.target.classList.contains("tag-list")) this.input.focus();
    });

    this.suggest = new SuggestInput(this.input, {
      getOptions: query => {
        const entries = this.suggestions(query);
        const options = entries.map(e => ({
          value: e.label,
          label: e.label,
          group: game.i18n.localize(e.group),
          desc: tagDescription(e.label)
        }));
        // Free text: any tag can be added, even if it isn't in the catalog.
        const exact = query && findTag(query);
        if (query && !exact && !this.tags.some(t => tagKey(canonicalTag(t)) === tagKey(query))) {
          options.push({ value: canonicalTag(query), label: canonicalTag(query), custom: true });
        }
        return options;
      },
      onPick: option => {
        this.add(option.value ?? option.label);
      },
      onKeyDown: ev => {
        switch (ev.key) {
          case "Enter":
          case "Tab":
            if (this.input.value.trim()) {
              ev.preventDefault();
              this.add(this.input.value);
            }
            break;
          case ",":
            ev.preventDefault();
            if (this.input.value.trim()) this.add(this.input.value);
            break;
          case "Backspace":
            if (!this.input.value && this.tags.length) this.remove(this.tags.length - 1);
            break;
        }
      }
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

  async add(tag) {
    const label = canonicalTag(tag);
    this.input.value = "";
    this.suggest?.close();
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
