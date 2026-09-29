/**
 * Catalog of ActiveEffect targets, broken key migrations, and readable summary helper for Log Horizon TRPG.
 *
 * In character actors, prepareDerivedData recomputes values such as fate.max, health.max,
 * attributes.<attr>.mod, checks.*.total/base, battle-status.*.total/base, inventory.maxSpace/space.
 * Effects targeting those recalculations are lost; valid character targets use the accumulator fields
 * (attributes.<attr>.effect, health.effect, fate.effect, inventory.mod, checks.*.mod/dice, etc.).
 *
 * In monster actors, values are direct fields (attributes.<attr>.mod, checks.{evasion,resistance}.{dice,mod},
 * health.max, fate.max, etc.).
 *
 * This module is pure (no global game/CONFIG/foundry calls at import time) so it can be run in Node.
 */

/**
 * Known effect target destinations in Log Horizon TRPG.
 * @type {{ key: string, label: string, group: "attributes"|"resources"|"checks"|"checkDice"|"battle"|"other", actorTypes: string[], kind: "number"|"dice"|"tags" }[]}
 */
export const EFFECT_TARGETS = [
  // --- Attributes ---
  // Character accumulator fields
  { key: "system.attributes.str.effect", label: "LHTRPG.Str", group: "attributes", actorTypes: ["character"], kind: "number" },
  { key: "system.attributes.dex.effect", label: "LHTRPG.Dex", group: "attributes", actorTypes: ["character"], kind: "number" },
  { key: "system.attributes.pow.effect", label: "LHTRPG.Pow", group: "attributes", actorTypes: ["character"], kind: "number" },
  { key: "system.attributes.int.effect", label: "LHTRPG.Int", group: "attributes", actorTypes: ["character"], kind: "number" },
  // Monster direct attribute modifier fields
  { key: "system.attributes.str.mod", label: "LHTRPG.Str", group: "attributes", actorTypes: ["monster"], kind: "number" },
  { key: "system.attributes.dex.mod", label: "LHTRPG.Dex", group: "attributes", actorTypes: ["monster"], kind: "number" },
  { key: "system.attributes.pow.mod", label: "LHTRPG.Pow", group: "attributes", actorTypes: ["monster"], kind: "number" },
  { key: "system.attributes.int.mod", label: "LHTRPG.Int", group: "attributes", actorTypes: ["monster"], kind: "number" },

  // --- Resources ---
  // Character accumulator fields
  { key: "system.health.effect", label: "LHTRPG.EffectTarget.MaxHP", group: "resources", actorTypes: ["character"], kind: "number" },
  { key: "system.fate.effect", label: "LHTRPG.EffectTarget.MaxFate", group: "resources", actorTypes: ["character"], kind: "number" },
  { key: "system.inventory.mod", label: "LHTRPG.Item.Label.BagSpace", group: "resources", actorTypes: ["character"], kind: "number" },
  // Monster direct resource fields
  { key: "system.health.max", label: "LHTRPG.EffectTarget.MaxHP", group: "resources", actorTypes: ["monster"], kind: "number" },
  { key: "system.fate.max", label: "LHTRPG.EffectTarget.MaxFate", group: "resources", actorTypes: ["monster"], kind: "number" },

  // --- Checks (modifier) ---
  { key: "system.checks.athletics.mod", label: "LHTRPG.Check.Athletics", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.endurance.mod", label: "LHTRPG.Check.Endurance", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.disable.mod", label: "LHTRPG.Check.Disable", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.operation.mod", label: "LHTRPG.Check.Operation", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.perception.mod", label: "LHTRPG.Check.Perception", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.negotiation.mod", label: "LHTRPG.Check.Negotiation", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.knowledge.mod", label: "LHTRPG.Check.Knowledge", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.analysis.mod", label: "LHTRPG.Check.Analysis", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.accuracy.mod", label: "LHTRPG.Check.Accuracy", group: "checks", actorTypes: ["character"], kind: "number" },
  { key: "system.checks.evasion.mod", label: "LHTRPG.Check.Evasion", group: "checks", actorTypes: ["character", "monster"], kind: "number" },
  { key: "system.checks.resistance.mod", label: "LHTRPG.Check.Resistance", group: "checks", actorTypes: ["character", "monster"], kind: "number" },

  // --- Check Dice ---
  { key: "system.checks.athletics.dice", label: "LHTRPG.Check.Athletics", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.endurance.dice", label: "LHTRPG.Check.Endurance", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.disable.dice", label: "LHTRPG.Check.Disable", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.operation.dice", label: "LHTRPG.Check.Operation", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.perception.dice", label: "LHTRPG.Check.Perception", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.negotiation.dice", label: "LHTRPG.Check.Negotiation", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.knowledge.dice", label: "LHTRPG.Check.Knowledge", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.analysis.dice", label: "LHTRPG.Check.Analysis", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.accuracy.dice", label: "LHTRPG.Check.Accuracy", group: "checkDice", actorTypes: ["character"], kind: "dice" },
  { key: "system.checks.evasion.dice", label: "LHTRPG.Check.Evasion", group: "checkDice", actorTypes: ["character", "monster"], kind: "dice" },
  { key: "system.checks.resistance.dice", label: "LHTRPG.Check.Resistance", group: "checkDice", actorTypes: ["character", "monster"], kind: "dice" },

  // --- Battle Status ---
  // Character battle status modifiers
  { key: "system.battle-status.power.attack.mod", label: "LHTRPG.Tooltip.AttackPower", group: "battle", actorTypes: ["character"], kind: "number" },
  { key: "system.battle-status.power.magic.mod", label: "LHTRPG.Tooltip.MagicPower", group: "battle", actorTypes: ["character"], kind: "number" },
  { key: "system.battle-status.power.restoration.mod", label: "LHTRPG.Tooltip.RestorationPower", group: "battle", actorTypes: ["character"], kind: "number" },
  { key: "system.battle-status.defense.phys.mod", label: "LHTRPG.Monster.PDef", group: "battle", actorTypes: ["character"], kind: "number" },
  { key: "system.battle-status.defense.magic.mod", label: "LHTRPG.Monster.MDef", group: "battle", actorTypes: ["character"], kind: "number" },
  { key: "system.battle-status.speed.mod", label: "LHTRPG.Monster.Speed", group: "battle", actorTypes: ["character"], kind: "number" },
  { key: "system.battle-status.initiative.mod", label: "LHTRPG.Monster.Initiative", group: "battle", actorTypes: ["character"], kind: "number" },
  // Monster direct battle status fields
  { key: "system.battle-status.defense.phys", label: "LHTRPG.Monster.PDef", group: "battle", actorTypes: ["monster"], kind: "number" },
  { key: "system.battle-status.defense.magic", label: "LHTRPG.Monster.MDef", group: "battle", actorTypes: ["monster"], kind: "number" },
  { key: "system.battle-status.speed", label: "LHTRPG.Monster.Speed", group: "battle", actorTypes: ["monster"], kind: "number" },
  { key: "system.battle-status.initiative", label: "LHTRPG.Monster.Initiative", group: "battle", actorTypes: ["monster"], kind: "number" },

  // --- Other ---
  { key: "system.infos.hate", label: "LHTRPG.Label.Hate", group: "other", actorTypes: ["character"], kind: "number" },
  { key: "system.infos.fatigue", label: "LHTRPG.Label.Fatigue", group: "other", actorTypes: ["character"], kind: "number" },
  { key: "system.rank", label: "LHTRPG.Monster.Rank", group: "other", actorTypes: ["monster"], kind: "number" },
  { key: "system.tags", label: "LHTRPG.Label.Tags", group: "other", actorTypes: ["character", "monster"], kind: "tags" }
];

/**
 * Key migrations applicable regardless of actor type (typos and legacy stat value targets).
 */
export const EFFECT_KEY_MIGRATIONS = {
  "system.healt.effect": "system.health.effect",
  "system.attack.mod": "system.battle-status.power.attack.mod",
  "system.attributes.str.value": "system.attributes.str.effect",
  "system.attributes.dex.value": "system.attributes.dex.effect",
  "system.attributes.pow.value": "system.attributes.pow.effect",
  "system.attributes.int.value": "system.attributes.int.effect",
  "system.inventory.maxSpace": "system.inventory.mod",
  "system.magic.mod": "system.battle-status.power.magic.mod"
};

/**
 * Key migrations applicable only to characters (in monsters, health.max and fate.max are valid direct fields).
 */
export const CHARACTER_ONLY_EFFECT_KEY_MIGRATIONS = {
  "system.fate.max": "system.fate.effect",
  "system.health.max": "system.health.effect"
};

/**
 * Find the catalog entry for a target key.
 * Uses CONFIG.LHTRPG.effectTargets when available at runtime for module extensibility.
 * @param {string} key
 * @returns {object|null}
 */
export function findEffectTarget(key) {
  const catalog = globalThis.CONFIG?.LHTRPG?.effectTargets ?? EFFECT_TARGETS;
  return catalog.find(t => t.key === key) ?? null;
}

/**
 * Test whether an effect change key targets a derived/recomputed field on an actor.
 * In characters, prepareDerivedData recomputes health.max, fate.max, attributes.<attr>.mod/total,
 * checks.<c>.total/base, battle-status.**.total/base, inventory.maxSpace/space; effects on these are lost.
 * In monsters, health.max, fate.max, and attributes.<attr>.mod are direct source fields, not derived.
 *
 * @param {string} key
 * @param {string|string[]} [actorType="character"]
 * @returns {boolean}
 */
export function isDerivedEffectKey(key, actorType = "character") {
  if (!key || typeof key !== "string") return false;
  const cleanKey = key.trim().replace(/\.\[["']([^"'\]]+)["']\]/g, ".$1");
  const types = Array.isArray(actorType) ? actorType : [actorType];

  const appliesToCharacter = types.includes("character") || types.length === 0;
  if (!appliesToCharacter) return false;

  const isMonsterToo = types.includes("monster");
  if (!isMonsterToo) {
    if (cleanKey === "system.health.max" || cleanKey === "system.fate.max") return true;
    if (/^system\.attributes\.[^.]+\.mod$/.test(cleanKey)) return true;
  }
  if (/^system\.attributes\.[^.]+\.total$/.test(cleanKey)) return true;
  if (/^system\.checks\.[^.]+\.(total|base)$/.test(cleanKey)) return true;
  if (/^system\.battle-status\..+\.(total|base)$/.test(cleanKey)) return true;
  if (cleanKey === "system.inventory.maxSpace" || cleanKey === "system.inventory.space") return true;

  return false;
}

/**
 * Determine the applicable actor types (destination) for an ActiveEffect.
 * - On an Actor -> [actor.type]
 * - On an Item with transfer: true -> owner's type if item is on an actor;
 *   if loose: in compendium bestiary -> ["monster"], else -> ["character"]
 * - On an Item with transfer: false -> ["character", "monster"]
 * @param {ActiveEffect} effect
 * @returns {string[]}
 */
export function getEffectTargetActorTypes(effect) {
  const BOTH = ["character", "monster"];
  const actorTypes = type => (BOTH.includes(type) ? [type] : null);
  const parent = effect?.parent;
  if (!parent) return BOTH;

  if (parent.documentName === "Actor") return actorTypes(parent.type) ?? BOTH;
  if (parent.documentName !== "Item") return BOTH;

  // Usable items never affect their holder: their effects are copied onto the target when used (item-use.mjs).
  const isTransfer = effect.transfer ?? effect._source?.transfer ?? true;
  if (!isTransfer || (parent.type === "usable")) return BOTH;

  // Transferred to the owner. Items in a loot pile or a chest end up with a character.
  const owner = parent.parent;
  if (owner?.documentName === "Actor") return actorTypes(owner.type) ?? ["character"];
  const pack = parent.pack ?? "";
  return pack.endsWith(".bestiary") ? ["monster"] : ["character"];
}

/**
 * Retrieve UI metadata for a given effect change key, including translated label,
 * exclusive type chip, or warning state (derived field or out-of-catalog).
 * @param {string} key
 * @param {string|string[]} [targetActorTypes=["character", "monster"]]
 * @returns {object|null}
 */
export function getEffectKeyInfo(key, targetActorTypes = ["character", "monster"]) {
  if (!key || typeof key !== "string" || !key.trim()) return null;
  const cleanKey = key.trim().replace(/\.\[["']([^"'\]]+)["']\]/g, ".$1");
  const types = Array.isArray(targetActorTypes) ? targetActorTypes : [targetActorTypes];

  const localize = str => (globalThis.game?.i18n ? globalThis.game.i18n.localize(str) : str);
  const format = (str, data) => (globalThis.game?.i18n?.format ? globalThis.game.i18n.format(str, data) : str);

  // Check if derived field
  if (isDerivedEffectKey(cleanKey, types)) {
    return {
      status: "derived",
      warning: true,
      message: localize("LHTRPG.EffectTarget.Warning.Derived")
    };
  }

  const target = findEffectTarget(cleanKey);
  const applies = target && target.actorTypes.some(t => types.includes(t));
  if (!target || !applies) {
    return {
      status: "unknown",
      warning: true,
      message: localize("LHTRPG.EffectTarget.Warning.Unknown")
    };
  }

  let label;
  if (target.group === "checkDice") {
    const checkName = localize(target.label);
    label = format("LHTRPG.EffectTarget.Dice", { check: checkName });
  } else {
    label = localize(target.label);
  }

  let chip = null;
  if (types.length > 1 && target.actorTypes.length === 1) {
    const type = target.actorTypes[0];
    chip = {
      type,
      label: localize(type === "monster" ? "LHTRPG.EffectTarget.Chip.Monster" : "LHTRPG.EffectTarget.Chip.Character")
    };
  }

  return {
    status: "valid",
    warning: false,
    label,
    group: target.group,
    chip
  };
}

/**
 * Migrate an array of ActiveEffect change objects.
 * Removes empty keys, rewrites broken/legacy keys to canonical targets according to actor type,
 * and leaves unknown/valid keys intact.
 * @param {object[]} changes
 * @param {string} [actorType="character"]
 * @returns {{ changes: object[], changed: boolean }}
 */
export function migrateEffectChanges(changes, actorType = "character") {
  if (!Array.isArray(changes)) return { changes: [], changed: false };
  let changed = false;
  const migrated = [];

  for (const change of changes) {
    // Bracket notation (system.["battle-status"].x) is not a valid effect key path.
    const key = change?.key ? String(change.key).trim().replace(/\.\[["']([^"'\]]+)["']\]/g, ".$1") : "";
    if (!key) {
      changed = true;
      continue;
    }

    let targetKey = null;
    if (actorType !== "monster" && key in CHARACTER_ONLY_EFFECT_KEY_MIGRATIONS) {
      targetKey = CHARACTER_ONLY_EFFECT_KEY_MIGRATIONS[key];
    } else if (key in EFFECT_KEY_MIGRATIONS) {
      targetKey = EFFECT_KEY_MIGRATIONS[key];
    }

    if (targetKey && targetKey !== key) {
      changed = true;
      migrated.push({ ...change, key: targetKey });
    } else if (key !== change.key) {
      changed = true;
      migrated.push({ ...change, key });
    } else {
      migrated.push({ ...change });
    }
  }

  return { changes: migrated, changed };
}

/**
 * Format a single change object into a readable string (e.g. "Accuracy +2", "Phys. Def. +3", "Evasion +1D").
 * @param {object} change
 * @returns {string|null}
 */
function formatChangeSummary(change) {
  if (!change?.key) return null;
  const key = String(change.key).trim();
  if (!key) return null;

  const target = findEffectTarget(key);
  const escape = globalThis.foundry?.utils?.escapeHTML ?? (s => s);
  const localize = str => (globalThis.game?.i18n ? globalThis.game.i18n.localize(str) : str);

  let label;
  if (target) {
    label = escape(localize(target.label));
  } else {
    const stripped = key.replace(/^system\./, "");
    label = `<em>${escape(stripped)}</em>`;
  }

  const rawVal = String(change.value ?? "").trim();
  if (!rawVal) return label;

  const mode = Number(change.mode ?? 2); // Default to ADD (2)

  // Tags: +[Tag]
  if (target?.kind === "tags" || key === "system.tags") {
    const cleanTag = rawVal.replace(/[\[\]]/g, "").trim();
    if (!cleanTag) return label;
    return `${label} +[${escape(cleanTag)}]`;
  }

  // Check Dice: +1D, -1D, = 2D, etc.
  if (target?.kind === "dice") {
    const match = rawVal.match(/^([+-]?\d+)\s*d?$/i);
    const num = match ? Number(match[1]) : Number(rawVal);
    let valPart;
    if (Number.isFinite(num)) {
      switch (mode) {
        case 1: valPart = `×${num}D`; break;
        case 3: valPart = `≤ ${num}D`; break;
        case 4: valPart = `≥ ${num}D`; break;
        case 5: valPart = `= ${num}D`; break;
        case 2:
        default:
          valPart = num >= 0 ? `+${num}D` : `${num}D`;
          break;
      }
    } else {
      valPart = rawVal.startsWith("+") || rawVal.startsWith("-") ? rawVal : `+${rawVal}`;
    }
    return `${label} ${valPart}`.trim();
  }

  // Numeric fields and fallback for unknown keys
  const num = Number(rawVal);
  let valPart;
  if (Number.isFinite(num)) {
    switch (mode) {
      case 1: valPart = `×${num}`; break;
      case 3: valPart = `≤ ${num}`; break;
      case 4: valPart = `≥ ${num}`; break;
      case 5: valPart = `= ${num}`; break;
      case 2:
      default:
        valPart = num >= 0 ? `+${num}` : `${num}`;
        break;
    }
  } else {
    switch (mode) {
      case 1: valPart = `×${escape(rawVal)}`; break;
      case 3: valPart = `≤ ${escape(rawVal)}`; break;
      case 4: valPart = `≥ ${escape(rawVal)}`; break;
      case 5: valPart = `= ${escape(rawVal)}`; break;
      case 2:
      default:
        valPart = rawVal.startsWith("+") || rawVal.startsWith("-") ? escape(rawVal) : `+${escape(rawVal)}`;
        break;
    }
  }

  return `${label} ${valPart}`.trim();
}

/**
 * Handlebars helper: produces a readable summary of an ActiveEffect's changes.
 * e.g. "Accuracy +2, Phys. Def. +3, Evasion +1D"
 * @param {object|object[]} changesOrEffect   ActiveEffect document, raw effect data, or changes array
 * @param {object} [options]                   Handlebars options: `plain=true` returns text (for attributes)
 * @returns {Handlebars.SafeString|string}
 */
export function lhEffectSummary(changesOrEffect, options) {
  const changes = Array.isArray(changesOrEffect?.changes)
    ? changesOrEffect.changes
    : Array.isArray(changesOrEffect)
      ? changesOrEffect
      : [];

  if (!changes.length) return "";

  const parts = [];
  for (const change of changes) {
    const s = formatChangeSummary(change);
    if (s) parts.push(s);
  }

  if (!parts.length) return "";
  const joined = parts.join(", ");
  if (options?.hash?.plain) return joined.replace(/<[^>]*>/g, "");
  return globalThis.Handlebars?.SafeString ? new Handlebars.SafeString(joined) : joined;
}

/* -------------------------------------------- */
/*  Registration & Migration                    */
/* -------------------------------------------- */

const MIGRATION_VERSION = 2;

/**
 * Register the effect targets catalog and the `lhEffectSummary` Handlebars helper.
 * Call during the `init` hook.
 */
export function registerEffectTargets() {
  CONFIG.LHTRPG.effectTargets ??= EFFECT_TARGETS;
  Handlebars.registerHelper("lhEffectSummary", lhEffectSummary);
}

/**
 * Update active effects on a document (and its embedded items if an actor).
 * @param {Actor|Item} doc
 * @param {string} actorType
 * @returns {Promise<{count: number, failed: number}>}
 */
async function _migrateDocEffects(doc, actorType) {
  let count = 0;
  let failed = 0;

  // Effects directly on the document
  const updates = [];
  for (const effect of doc.effects ?? []) {
    const sourceChanges = effect._source?.changes;
    if (!Array.isArray(sourceChanges)) continue;
    const { changes, changed } = migrateEffectChanges(sourceChanges, actorType);
    if (changed) updates.push({ _id: effect.id, changes });
  }
  if (updates.length) {
    try {
      await doc.updateEmbeddedDocuments("ActiveEffect", updates, { render: false });
      count += updates.length;
    } catch (err) {
      failed++;
      console.error(`Log Horizon TRPG | Could not migrate ActiveEffects on ${doc.uuid}`, err);
    }
  }

  // Embedded items on an actor
  if (doc.items) {
    for (const item of doc.items) {
      const itemUpdates = [];
      for (const effect of item.effects ?? []) {
        const sourceChanges = effect._source?.changes;
        if (!Array.isArray(sourceChanges)) continue;
        const { changes, changed } = migrateEffectChanges(sourceChanges, actorType);
        if (changed) itemUpdates.push({ _id: effect.id, changes });
      }
      if (itemUpdates.length) {
        try {
          await item.updateEmbeddedDocuments("ActiveEffect", itemUpdates, { render: false });
          count += itemUpdates.length;
        } catch (err) {
          failed++;
          console.error(`Log Horizon TRPG | Could not migrate ActiveEffects on item ${item.uuid}`, err);
        }
      }
    }
  }

  return { count, failed };
}

/** Comparable form of a list of changes (keys already migrated for the actor type). */
function _changesSignature(changes, actorType) {
  return JSON.stringify(migrateEffectChanges(changes, actorType).changes
    .map(c => [c.key, Number(c.mode), String(c.value ?? "").trim()]));
}

/**
 * Delete the legacy copies of transferred item effects on an actor. Old Foundry versions copied an item's
 * transfer effects onto the actor (and users re-added some by hand when the item's key was broken); current
 * versions apply them from the item, so each copy counted twice. Only exact copies go: an item of the actor
 * has a transfer effect with the same name and the same changes.
 * @param {Actor} actor
 * @returns {Promise<{count: number, failed: number}>}
 */
async function _deleteLegacyEffectCopies(actor) {
  const transferred = new Set(actor.items.contents.flatMap(item => item.effects.contents
    .filter(e => e.transfer).map(e => `${e.name}|${_changesSignature(e._source.changes, actor.type)}`)));
  const ids = actor.effects
    .filter(e => transferred.has(`${e.name}|${_changesSignature(e._source.changes, actor.type)}`))
    .map(e => e.id);
  if (!ids.length) return { count: 0, failed: 0 };
  try {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
    console.log(`Log Horizon TRPG | Deleted ${ids.length} legacy effect copies on ${actor.name}`);
    return { count: ids.length, failed: 0 };
  } catch (err) {
    console.error(`Log Horizon TRPG | Could not delete the legacy effect copies of ${actor.uuid}`, err);
    return { count: 0, failed: 1 };
  }
}

/**
 * World migration: migrate effect changes of world actors, embedded items, world items,
 * unlinked tokens, and unlocked world compendiums.
 * @returns {Promise<boolean>}
 */
async function migrateEffects() {
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) actors.push(token.actor);
    }
  }

  // World actors before the unlinked tokens: a token's synthetic effects come from its (already fixed) actor.
  let count = 0;
  let failed = 0;
  const migrate = async (doc, actorType) => {
    const result = await _migrateDocEffects(doc, actorType);
    count += result.count;
    failed += result.failed;
  };
  for (const actor of game.actors) {
    const result = await _deleteLegacyEffectCopies(actor);
    count += result.count;
    failed += result.failed;
  }
  for (const item of game.items) await migrate(item, "character");
  for (const actor of actors) await migrate(actor, actor.type);

  // Unlocked world compendiums
  for (const pack of game.packs) {
    if ((pack.metadata.packageType !== "world") || pack.locked) continue;
    if (!["Item", "Actor"].includes(pack.documentName)) continue;
    for (const doc of await pack.getDocuments()) {
      await migrate(doc, pack.documentName === "Actor" ? doc.type : "character");
    }
  }

  console.log(`Log Horizon TRPG | Migrated ${count} active effect(s)`);
  if (count) ui.notifications.info(game.i18n.format("LHTRPG.Effect.Migrated", { count }));
  // Anything that failed is retried on the next load.
  return failed === 0;
}

/** World migration descriptor (see helpers/migrations.mjs). */
export const EFFECTS_MIGRATION = {
  id: "effects",
  setting: "effectMigrationVersion",
  version: MIGRATION_VERSION,
  run: migrateEffects
};
