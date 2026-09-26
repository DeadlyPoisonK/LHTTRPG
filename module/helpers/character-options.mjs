/**
 * Race, Class and Subclass of a character: each one is an Item embedded in the actor (one of each
 * at most). The numbers of the core races/classes live here (the same ones as the system compendium
 * built from src/packs): they migrate the old hardcoded selects and keep not-yet-migrated characters working.
 */

import { getOptionIndex } from "../apps/option-browser.mjs";
import { offerGrants } from "../apps/option-grants.mjs";

/** Item types a character holds a single copy of. */
export const OPTION_TYPES = ["race", "class", "subclass"];

/** System compendium holding the core races and classes (numbers only, no rules text). */
export const CORE_PACK = "lhtrpg.races-classes";

/** Default icons of each option type (the core classes use their own logo). */
export const OPTION_ICONS = {
  race: "icons/environment/people/group.webp",
  class: "icons/environment/people/infantry.webp",
  subclass: "icons/skills/trades/academics-study-reading-book.webp"
};

/** Class archetypes: key -> localization key. */
export const ARCHETYPES = {
  warrior: "LHTRPG.Archetype.Warrior",
  weaponAttacker: "LHTRPG.Archetype.WeaponAttacker",
  healer: "LHTRPG.Archetype.Healer",
  mage: "LHTRPG.Archetype.Mage"
};

export const CORE_RACES = {
  human: { name: "Human", str: 0, dex: 0, pow: 0, int: 0, hp: 8, fate: 1 },
  elf: { name: "Elf", str: 0, dex: 1, pow: 1, int: 0, hp: 8, fate: 1 },
  dwarf: { name: "Dwarf", str: 1, dex: 0, pow: 1, int: 0, hp: 16, fate: 0 },
  halfalv: { name: "Half Alv", str: 0, dex: 1, pow: 0, int: 1, hp: 8, fate: 1 },
  werecat: { name: "Werecat", str: 1, dex: 1, pow: 0, int: 0, hp: 8, fate: 1 },
  wolffang: { name: "Wolf Fang", str: 2, dex: 0, pow: 0, int: 0, hp: 16, fate: 0 },
  foxtail: { name: "Foxtail", str: 0, dex: 0, pow: 1, int: 1, hp: 8, fate: 1 },
  raceofritual: { name: "Race of Ritual", str: 0, dex: 0, pow: 0, int: 2, hp: 0, fate: 2 }
};

export const CORE_CLASSES = {
  guardian: { name: "Guardian", archetype: "warrior", str: 4, dex: 2, pow: 1, int: 3, hp: 50, hpPerRank: 8 },
  samurai: { name: "Samurai", archetype: "warrior", str: 4, dex: 2, pow: 2, int: 2, hp: 50, hpPerRank: 8 },
  monk: { name: "Monk", archetype: "warrior", str: 4, dex: 4, pow: 2, int: 0, hp: 55, hpPerRank: 9 },
  cleric: { name: "Cleric", archetype: "healer", str: 3, dex: 0, pow: 4, int: 3, hp: 40, hpPerRank: 6 },
  druid: { name: "Druid", archetype: "healer", str: 2, dex: 1, pow: 4, int: 3, hp: 35, hpPerRank: 5 },
  kannagi: { name: "Kannagi", archetype: "healer", str: 1, dex: 3, pow: 4, int: 2, hp: 40, hpPerRank: 5 },
  assassin: { name: "Assassin", archetype: "weaponAttacker", str: 1, dex: 4, pow: 3, int: 1, hp: 40, hpPerRank: 5 },
  swashbuckler: { name: "Swashbuckler", archetype: "weaponAttacker", str: 3, dex: 4, pow: 2, int: 1, hp: 40, hpPerRank: 6 },
  bard: { name: "Bard", archetype: "weaponAttacker", str: 2, dex: 4, pow: 2, int: 2, hp: 40, hpPerRank: 5 },
  sorcerer: { name: "Sorcerer", archetype: "mage", str: 0, dex: 3, pow: 3, int: 4, hp: 35, hpPerRank: 4 },
  summoner: { name: "Summoner", archetype: "mage", str: 1, dex: 3, pow: 3, int: 4, hp: 35, hpPerRank: 5 },
  enchanter: { name: "Enchanter", archetype: "mage", str: 2, dex: 2, pow: 2, int: 4, hp: 35, hpPerRank: 4 }
};

/** Logo of a core class ("guardian" -> ".../Guardian_Logo.png"). */
export function classLogo(identifier) {
  return `systems/lhtrpg/assets/ui/classes/${identifier.capitalize()}_Logo.png`;
}

/** Item data of a core race, from its identifier ("dwarf"). */
export function coreRaceData(identifier) {
  const race = CORE_RACES[identifier];
  if (!race) return null;
  return {
    name: race.name,
    type: "race",
    img: OPTION_ICONS.race,
    system: {
      identifier,
      attributes: { str: race.str, dex: race.dex, pow: race.pow, int: race.int },
      hp: race.hp,
      fate: race.fate
    }
  };
}

/** Item data of a core class, from its identifier ("guardian"). */
export function coreClassData(identifier) {
  const job = CORE_CLASSES[identifier];
  if (!job) return null;
  return {
    name: job.name,
    type: "class",
    img: classLogo(identifier),
    system: {
      identifier,
      archetype: job.archetype,
      attributes: { str: job.str, dex: job.dex, pow: job.pow, int: job.int },
      hp: job.hp,
      hpPerRank: job.hpPerRank
    }
  };
}

/** The Race / Class / Subclass item of a character, if any. */
export function getOption(actor, type) {
  return actor.items.find(i => i.type === type) ?? null;
}

/** Numeric fields of an option item (form inputs may store them as text). */
function numbers(data, keys) {
  return Object.fromEntries(keys.map(k => [k, Number(data[k]) || 0]));
}

/**
 * Numbers of the character's race: its Race item, or the legacy `system.race` text of a character
 * not migrated yet.
 */
export function raceStats(actor) {
  const item = getOption(actor, "race");
  if (item) return numbers({ ...item.system.attributes, hp: item.system.hp, fate: item.system.fate },
    ["str", "dex", "pow", "int", "hp", "fate"]);
  const legacy = CORE_RACES[actor.system.race?.toLowerCase?.()];
  return legacy ? { ...legacy } : null;
}

/** Numbers of the character's class (Class item, or legacy `system.class.name`). */
export function classStats(actor) {
  const item = getOption(actor, "class");
  if (item) return numbers({ ...item.system.attributes, hp: item.system.hp, hpPerRank: item.system.hpPerRank },
    ["str", "dex", "pow", "int", "hp", "hpPerRank"]);
  const legacy = CORE_CLASSES[actor.system.class?.name?.toLowerCase?.()];
  return legacy ? { ...legacy } : null;
}

/* -------------------------------------------- */
/*  Legacy fields -> items                      */
/* -------------------------------------------- */

/**
 * Find an option in the compendiums by identifier (or by name), so migrated characters get the full
 * item (description included) when a table has one.
 */
async function findIndexedOption(type, { identifier, name }) {
  const entries = await getOptionIndex(type);
  const lowerName = name?.toLowerCase();
  const entry = (identifier && entries.find(e => e.identifier === identifier))
    ?? (lowerName && entries.find(e => e.name.toLowerCase() === lowerName));
  if (!entry) return null;
  const doc = await fromUuid(entry.uuid);
  return doc ? optionDataFrom(doc) : null;
}

/** Plain data of an option item, ready to embed in an actor. */
export function optionDataFrom(item) {
  const data = item.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  foundry.utils.setProperty(data, "_stats.compendiumSource", item.uuid);
  return data;
}

/**
 * Items replacing the legacy Race / Class / Subclass fields of a character's source data, plus the
 * update clearing those fields. Null when there is nothing to convert.
 * @param {object} source  Actor source data (system + items)
 * @param {boolean} lookup  Search the compendiums for a matching item before using the core data
 */
export async function legacyOptionItems(source, { lookup = true } = {}) {
  const system = source.system ?? {};
  const has = type => (source.items ?? []).some(i => i.type === type);
  const items = [];
  const race = system.race?.trim().toLowerCase();
  const job = system.class?.name?.trim().toLowerCase();
  const subclass = system.class?.subclass?.trim();

  if (race && !has("race")) {
    const data = (lookup && await findIndexedOption("race", { identifier: race })) ?? coreRaceData(race);
    if (data) items.push(data);
  }
  if (job && !has("class")) {
    const data = (lookup && await findIndexedOption("class", { identifier: job })) ?? coreClassData(job);
    if (data) {
      // Keep a logo the player picked by hand.
      const img = system.class?.img;
      if (img && (img !== classLogo(job)) && !img.endsWith("Enchanter_Logo.png")) data.img = img;
      items.push(data);
    }
  }
  if (subclass && !has("subclass")) {
    const data = (lookup && await findIndexedOption("subclass", { name: subclass }))
      ?? { name: subclass, type: "subclass", img: OPTION_ICONS.subclass, system: { identifier: subclass.slugify() } };
    items.push(data);
  }

  const touched = race || job || subclass;
  if (!touched) return null;
  return {
    items,
    update: { "system.race": "", "system.class.name": "", "system.class.subclass": "" }
  };
}

/** Migration version of the Race/Class/Subclass items. */
const MIGRATION_VERSION = 1;

/** Convert the legacy Race / Class / Subclass fields of every world character into items (GM, once). */
export async function migrateCharacterOptions() {
  if (!game.user.isGM || (game.users.activeGM?.id !== game.user.id)) return;
  if (game.settings.get("lhtrpg", "characterOptionsMigrationVersion") >= MIGRATION_VERSION) return;

  let migrated = 0;
  for (const actor of game.actors.filter(a => a.type === "character")) {
    try {
      const result = await legacyOptionItems(actor._source);
      if (!result) continue;
      if (result.items.length) await actor.createEmbeddedDocuments("Item", result.items, { lhtrpgMigration: true });
      await actor.update(result.update, { lhtrpgMigration: true });
      migrated += 1;
    } catch (err) {
      console.error(`Log Horizon TRPG | Race/Class migration failed for ${actor.name}`, err);
    }
  }
  await game.settings.set("lhtrpg", "characterOptionsMigrationVersion", MIGRATION_VERSION);
  if (migrated) ui.notifications.info(game.i18n.format("LHTRPG.CharacterOptions.Migrated", { count: migrated }));
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerCharacterOptions() {
  game.settings.register("lhtrpg", "characterOptionsMigrationVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // A character holds a single Race, Class and Subclass: adding one replaces the previous one.
  Hooks.on("createItem", (item, options, userId) => {
    if ((userId !== game.user.id) || !OPTION_TYPES.includes(item.type)) return;
    const actor = item.parent;
    if (!(actor instanceof Actor) || (actor.type !== "character")) return;
    const previous = actor.items.filter(i => (i.type === item.type) && (i.id !== item.id)).map(i => i.id);
    if (previous.length) actor.deleteEmbeddedDocuments("Item", previous);
    // Starting skills of the new Race / Class / Subclass (not for migrated characters: they have theirs)
    if (!options.lhtrpgMigration) offerGrants(actor, item);
  });

  Hooks.once("ready", migrateCharacterOptions);
}
