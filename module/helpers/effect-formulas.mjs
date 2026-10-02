/**
 * Formulas in Active Effect change values: "@sr*3", "@cr+2", "@dex.mod*2", "floor(@sr/2)".
 *
 * Variables (see formulaData):
 *   @sr, @srMax          Skill Rank of the item that gives the effect (0 without a skill)
 *   @cr                  Character Rank (monsters: their Rank)
 *   @str.mod, @str.base  Attribute modifier / score (same for dex, pow, int); "@str" alone = modifier
 *   @attack, @magic, @recovery  Attack / Magic / Recovery Power (characters). Only for skill rolls and roll
 *                        bonuses (evaluated when rolling): while effects apply they aren't computed yet.
 *   @weapon.attack, @weapon.magic    Attack / Magic Power of the main-hand weapon (see hands.mjs), 0 without one
 *   @offhand.attack, @offhand.magic  Same for the weapon in the other hand (a shield there counts as none).
 *                        Usable anywhere: the items are prepared before the actor's effects apply. The Attack
 *                        Power base already is the main weapon's, so "Attack Power becomes [Weapon's x2]" is
 *                        "+@weapon.attack" on Attack Power, and "[both weapons' combined]" is "+@offhand.attack".
 *
 * On a character the attribute modifiers are computed after the effects are applied (prepareDerivedData),
 * so changes that read them are deferred: LHTrpgActiveEffect#apply keeps them aside and the actor applies
 * them right after computing the modifiers, before checks and battle statuses (see actor.mjs).
 * Effects copied to a target when a skill is used get their formulas resolved at that moment (item-use.mjs).
 */

import { getHands } from "./hands.mjs";

const ATTRIBUTES = ["str", "dex", "pow", "int"];
const ATTRIBUTE_REF = /@(str|dex|pow|int)\b/i;

/** Whether a change value is a formula (holds a @variable). */
export function isFormula(value) {
  return (typeof value === "string") && value.includes("@");
}

/** Whether a formula reads attribute values, which a character only has after its derived data. */
export function readsAttributes(value) {
  return isFormula(value) && ATTRIBUTE_REF.test(value);
}

/**
 * Values a formula can read.
 * @param {Actor|null} actor
 * @param {Item|null} item     The item giving the effect
 * @returns {object}
 */
export function formulaData(actor, item) {
  const rank = item?.system?.skillRank ?? {};
  const data = { sr: Number(rank.value) || 0, srMax: Number(rank.max) || 0, cr: 0 };
  const system = actor?.system;
  if (!system) return data;
  data.cr = Number(actor.type === "monster" ? system.rank : system.infos?.crank) || 0;
  for (const key of ATTRIBUTES) {
    const attribute = system.attributes?.[key] ?? {};
    data[key] = { mod: Number(attribute.mod) || 0, base: Number(attribute.total ?? attribute.value) || 0 };
  }
  const power = system["battle-status"]?.power ?? {};
  data.attack = Number(power.attack?.total) || 0;
  data.magic = Number(power.magic?.total) || 0;
  data.recovery = Number(power.restoration?.total) || 0;
  const { main, off } = getHands(actor);
  data.weapon = weaponPowers(main);
  data.offhand = weaponPowers((off?.type === "weapon") ? off : null);
  return data;
}

/** Attack / Magic Power of a weapon (0 without one). */
function weaponPowers(weapon) {
  return { attack: Number(weapon?.system.attack) || 0, magic: Number(weapon?.system.magic) || 0 };
}

/**
 * Evaluate a formula, rounding down (Log Horizon rounds fractions down).
 * @param {string} value
 * @param {object} data      See formulaData
 * @returns {number|null}    null when the formula can't be evaluated
 */
export function evaluateFormula(value, data) {
  try {
    // A bare "@dex" means its modifier.
    const formula = String(value).replace(/@(str|dex|pow|int)\b(?!\.)/gi, (m, attr) => `@${attr.toLowerCase()}.mod`);
    const expression = Roll.replaceFormulaData(formula, data, { missing: "0" });
    const result = Roll.safeEval(expression);
    return Number.isFinite(result) ? Math.floor(result) : null;
  }
  catch (err) {
    return null;
  }
}

/**
 * Readable form of a formula: "@sr*3" -> "SR×3", "@dex.mod*2" -> "DEX mod×2".
 * @param {string} value
 * @returns {string}
 */
export function formulaLabel(value) {
  return String(value)
    .replace(/@weapon\.attack\b/g, "Weapon Attack Power")
    .replace(/@weapon\.magic\b/g, "Weapon Magic Power")
    .replace(/@offhand\.attack\b/g, "Off-hand Attack Power")
    .replace(/@offhand\.magic\b/g, "Off-hand Magic Power")
    .replace(/@srMax\b/g, "SR max")
    .replace(/@sr\b/g, "SR")
    .replace(/@cr\b/g, "CR")
    .replace(/@attack\b/g, "Attack Power")
    .replace(/@magic\b/g, "Magic Power")
    .replace(/@recovery\b/g, "Recovery")
    .replace(/@(str|dex|pow|int)\.(mod|base)\b/gi, (m, attr, part) => `${attr.toUpperCase()} ${part}`)
    .replace(/@(str|dex|pow|int)\b/gi, (m, attr) => `${attr.toUpperCase()} mod`)
    .replace(/\s*\*\s*/g, "×")
    .replace(/\s*\/\s*/g, "/");
}

/**
 * A copy of the changes with their formulas replaced by numbers (effects copied when a skill is used:
 * they no longer depend on the skill, and the target may be another actor).
 * @param {object[]} changes
 * @param {object} data      See formulaData
 * @returns {object[]}
 */
export function resolveChanges(changes, data) {
  return (changes ?? []).map(change => {
    if (!isFormula(change.value)) return change;
    const result = evaluateFormula(change.value, data);
    return { ...change, value: String(result ?? 0) };
  });
}
