/**
 * Helpers for the "XD6 + N" values set directly on sheets (monster checks, skill damage).
 */

/**
 * Options for a dice-count select: { 0: "0D6", 1: "1D6", ... }.
 * @param {number} max   The highest number of dice
 * @returns {Object<number, string>}
 */
export function diceOptions(max) {
  return Object.fromEntries(Array.from({ length: max + 1 }, (_, i) => [i, `${i}D6`]));
}

/**
 * Roll formula for a dice count plus a flat modifier: "2d6 + 3", "2d6 - 1", "8".
 * @param {{dice: number, mod: number}} value
 * @returns {string}
 */
export function diceFormula({ dice, mod }) {
  dice = Math.max(Math.trunc(Number(dice) || 0), 0);
  mod = Math.trunc(Number(mod) || 0);
  const terms = [];
  if (dice > 0) terms.push(`${dice}d6`);
  if (mod || !terms.length) terms.push(String(mod));
  return terms.join(" + ").replace("+ -", "- ");
}
