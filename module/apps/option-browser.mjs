import { ARCHETYPES, CORE_PACK, getOption, optionDataFrom } from "../helpers/character-options.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* -------------------------------------------- */
/*  Index                                       */
/* -------------------------------------------- */

/** Extra index fields read from the compendiums (the full documents are never loaded). */
const INDEX_FIELDS = ["system.identifier", "system.archetype"];

/** Option type -> Promise of its entries, built on first use. */
const cache = new Map();

/** Forget the index (an option item was created, edited or deleted somewhere). */
export function clearOptionIndex() {
  cache.clear();
}

/**
 * Every Race / Class / Subclass the user can see: the Item compendiums first (the system one on top),
 * then the world items.
 * @param {string} type  "race", "class" or "subclass"
 * @returns {Promise<{uuid, name, img, identifier, archetype, source}[]>}
 */
export function getOptionIndex(type) {
  if (!cache.has(type)) cache.set(type, buildIndex(type));
  return cache.get(type);
}

async function buildIndex(type) {
  const entries = [];
  const entry = (e, uuid, source, order) => ({
    uuid,
    name: e.name,
    img: e.img,
    identifier: e.system?.identifier ?? "",
    archetype: e.system?.archetype ?? "",
    source,
    order
  });

  for (const pack of game.packs) {
    if ((pack.documentName !== "Item") || !pack.visible) continue;
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    const order = pack.collection === CORE_PACK ? 0 : 1;
    for (const e of index) {
      if (e.type === type) entries.push(entry(e, e.uuid ?? pack.getUuid(e._id), pack.title, order));
    }
  }
  const world = game.i18n.localize("LHTRPG.CharacterOptions.World");
  for (const item of game.items) {
    if ((item.type === type) && item.visible) entries.push(entry(item, item.uuid, world, 2));
  }

  return entries.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, game.i18n.lang));
}

/** Rebuild the index whenever an option item changes in a compendium or in the world. */
function watchOptionItems(item) {
  if (["race", "class", "subclass"].includes(item.type) && (item.pack || !item.parent)) clearOptionIndex();
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/**
 * Give an option (Race, Class or Subclass) to a character, replacing the one it had.
 * @param {Actor} actor
 * @param {string} uuid  The option item
 */
export async function setCharacterOption(actor, uuid) {
  const item = await fromUuid(uuid);
  if (!item) return;
  const previous = actor.items.filter(i => i.type === item.type).map(i => i.id);
  if (previous.length) await actor.deleteEmbeddedDocuments("Item", previous);
  await actor.createEmbeddedDocuments("Item", [optionDataFrom(item)]);
}

/* -------------------------------------------- */
/*  Selection window                            */
/* -------------------------------------------- */

/**
 * List of the available Races / Classes / Subclasses, next to the character sheet: search, see the
 * item sheet of an option or pick it directly.
 */
export class OptionBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Actor} actor
   * @param {string} type  "race", "class" or "subclass"
   */
  constructor(actor, type, options = {}) {
    super({ ...options, id: OptionBrowser.idFor(actor) });
    this.actor = actor;
    this.type = type;
    this.query = "";
  }

  static idFor(actor) {
    return `lhtrpg-option-browser-${actor.id}`;
  }

  /** Open the window for an actor (one per actor: opening it again switches the type). */
  static open(actor, type) {
    const existing = foundry.applications.instances.get(OptionBrowser.idFor(actor));
    if (existing) {
      if (existing.type !== type) existing.query = "";
      existing.type = type;
      return existing.render({ force: true });
    }
    return new OptionBrowser(actor, type).render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg", "option-browser"],
    tag: "div",
    window: { icon: "fa-solid fa-book-atlas", resizable: true },
    position: { width: 340, height: 600 },
    actions: {
      select: OptionBrowser.#onSelect,
      view: OptionBrowser.#onView
    }
  };

  static PARTS = {
    main: { template: "systems/lhtrpg/templates/apps/option-browser.hbs", scrollable: [".option-list"] }
  };

  /** @override */
  get title() {
    return game.i18n.localize(`LHTRPG.CharacterOptions.Select.${this.type}`);
  }

  /** @override */
  async _prepareContext(options) {
    const current = getOption(this.actor, this.type);
    const currentSource = current?._stats?.compendiumSource;
    const entries = (await getOptionIndex(this.type)).map(e => ({
      ...e,
      subtitle: [ARCHETYPES[e.archetype] ? game.i18n.localize(ARCHETYPES[e.archetype]) : null, e.source]
        .filter(Boolean).join(" · "),
      selected: !!current && ((e.uuid === currentSource)
        || (!!e.identifier && (e.identifier === current.system.identifier)))
    }));
    return {
      entries,
      query: this.query,
      placeholder: game.i18n.localize(`LHTRPG.CharacterOptions.Search.${this.type}`),
      editable: this.actor.isOwner
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Next to the character sheet, on its right when there is room (else over its right edge).
    const sheet = this.actor.sheet;
    if (!sheet?.rendered) return;
    const { left, top, width } = sheet.position;
    const own = this.position.width;
    const x = (left + width + own + 10 < window.innerWidth) ? left + width + 5 : left + width - own - 10;
    this.setPosition({ left: Math.max(0, x), top: Math.max(0, top) });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector("input[name=search]");
    input.addEventListener("input", ev => {
      this.query = ev.currentTarget.value;
      this.#applySearch();
    });
    this.#applySearch();
    input.focus();
  }

  /** Live search, without rendering again. */
  #applySearch() {
    const query = this.query.trim().toLowerCase();
    let shown = 0;
    for (const row of this.element.querySelectorAll(".option-row")) {
      const match = !query || row.dataset.search.includes(query);
      row.hidden = !match;
      if (match) shown += 1;
    }
    this.element.querySelector(".option-empty-search").hidden = (shown > 0) || !query;
  }

  static async #onSelect(event, target) {
    const uuid = target.closest(".option-row").dataset.uuid;
    await setCharacterOption(this.actor, uuid);
    this.close();
  }

  static async #onView(event, target) {
    const item = await fromUuid(target.closest(".option-row").dataset.uuid);
    item?.sheet.render(true);
  }
}

/* -------------------------------------------- */

export function registerOptionBrowser() {
  Hooks.on("createItem", watchOptionItems);
  Hooks.on("updateItem", watchOptionItems);
  Hooks.on("deleteItem", watchOptionItems);
  Hooks.on("createCompendium", clearOptionIndex);
  Hooks.on("deleteCompendium", clearOptionIndex);
  Hooks.on("updateCompendium", clearOptionIndex);
}
