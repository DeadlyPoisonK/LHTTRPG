/**
 * Monster Evasion / Resistance checks.
 *
 * Monsters store these checks directly as `{ dice, mod }` (e.g. "1+2D" = { dice: 2, mod: 1 }),
 * unlike characters, whose checks are derived from their attributes.
 * Older monsters stored them as free text; that text is parsed at runtime and migrated once.
 */

export const MONSTER_CHECKS = ["evasion", "resistance"];
export const MONSTER_CHECK_MAX_DICE = 5;
const DEFAULT_DICE = 2;
const MIGRATION_VERSION = 1;

/**
 * Normalize a monster check value, parsing the legacy free-text format ("1+2D", "2D6 + 1", "5 + 2 D").
 * @param {object|string|null} value
 * @returns {{dice: number, mod: number}}
 */
export function parseMonsterCheck(value) {
  if (value && (typeof value === "object")) {
    return {
      dice: Math.clamp(Math.trunc(Number(value.dice) || 0), 0, MONSTER_CHECK_MAX_DICE),
      mod: Math.trunc(Number(value.mod) || 0)
    };
  }
  // "8 (Fixed)" is a fixed value: drop the words so their letters are not read as dice.
  const text = String(value ?? "").replace(/fixed/gi, "").replace(/\s+/g, "").toUpperCase();
  if (!text) return { dice: DEFAULT_DICE, mod: 0 };
  const diceMatch = text.match(/(\d*)D6?/);
  const dice = diceMatch ? (Number(diceMatch[1]) || 1) : 0;
  const rest = diceMatch ? text.replace(diceMatch[0], "") : text;
  const mod = (rest.match(/[+-]?\d+/g) ?? []).reduce((sum, n) => sum + Number(n), 0);
  return { dice: Math.clamp(dice, 0, MONSTER_CHECK_MAX_DICE), mod };
}

/**
 * Normalize the checks of a monster's prepared data in place.
 * @param {object} system   The monster's system data
 */
export function prepareMonsterChecks(system) {
  system.checks ??= {};
  for (const check of MONSTER_CHECKS) system.checks[check] = parseMonsterCheck(system.checks[check]);
}

/**
 * Register the one-time migration of legacy text checks. Call during the `init` hook.
 */
export function registerMonsterChecks() {
  game.settings.register("lhtrpg", "monsterChecksMigrationVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  Hooks.once("ready", _migrateMonsterChecks);
}

/**
 * Updates that turn legacy text checks into `{ dice, mod }`, or null if already migrated.
 * @param {object} sourceChecks   The `system.checks` of a monster's source data
 * @returns {object|null}
 */
export function legacyChecksUpdate(sourceChecks) {
  const update = {};
  for (const check of MONSTER_CHECKS) {
    const value = sourceChecks?.[check];
    if ((value === undefined) || ((typeof value === "object") && (value !== null))) continue;
    update[`system.checks.${check}`] = parseMonsterCheck(value);
  }
  return foundry.utils.isEmpty(update) ? null : update;
}

/**
 * Complete a partial check change ({ dice } or { mod } alone) made over a legacy text value,
 * so the other half is kept instead of being lost.
 * @param {object} sourceChecks    The `system.checks` of the monster's source data
 * @param {object} changedChecks   The `system.checks` of the pending update, modified in place
 */
export function completeChecksChange(sourceChecks, changedChecks) {
  for (const check of MONSTER_CHECKS) {
    const change = changedChecks[check];
    const source = sourceChecks?.[check];
    if (!change || (typeof change !== "object") || (source && (typeof source === "object"))) continue;
    changedChecks[check] = { ...parseMonsterCheck(source), ...change };
  }
}

async function _migrateMonsterChecks() {
  if (!game.user.isActiveGM) return;
  if (game.settings.get("lhtrpg", "monsterChecksMigrationVersion") >= MIGRATION_VERSION) return;

  // World monsters, then the unlinked tokens that override their checks.
  const actors = game.actors.filter(a => a.type === "monster");
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor || (token.actor.type !== "monster")) continue;
      if (token.delta?._source?.system?.checks) actors.push(token.actor);
    }
  }

  let migrated = 0;
  for (const actor of actors) {
    const source = actor.isToken ? actor.token.delta._source : actor._source;
    const update = legacyChecksUpdate(source.system?.checks);
    if (!update) continue;
    try {
      await actor.update(update, { render: false, diff: false });
      migrated++;
    } catch (err) {
      console.error(`Log Horizon TRPG | Could not migrate the checks of ${actor.uuid}`, err);
    }
  }
  await game.settings.set("lhtrpg", "monsterChecksMigrationVersion", MIGRATION_VERSION);
  console.log(`Log Horizon TRPG | Migrated Evasion/Resistance of ${migrated} monsters`);
}
