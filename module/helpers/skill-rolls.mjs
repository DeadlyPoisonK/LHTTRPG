import { diceFormula } from "./dice.mjs";

/**
 * Skill Check and Damage, set directly on the skill sheet:
 *   system.check  = { dice, mod, vs }    vs: "evasion" | "resistance" | "auto" | ""
 *   system.damage = { dice, mod, type }  type: "physical" | "magical" | ""
 * Skills made before this stored the Check as free text (system.checkType); until they are edited,
 * that text is still shown and their dice/modifier/vs are read from it.
 */

export const SKILL_MAX_DICE = 10;
export const CHECK_VS = ["evasion", "resistance", "auto"];
export const DAMAGE_TYPES = ["physical", "magical"];

const VS_LABELS = { evasion: "LHTRPG.Check.Evasion", resistance: "LHTRPG.Check.Resistance", auto: "LHTRPG.Skill.Label.CheckAuto" };
const TYPE_LABELS = { physical: "LHTRPG.Skill.Label.DamagePhysical", magical: "LHTRPG.Skill.Label.DamageMagical" };

/**
 * Read dice and modifier from text like "Opposed (5+2D vs Evasion)", "2D + 4", "13 Fixed".
 * @param {string} text
 * @returns {{dice: number, mod: number}}
 */
export function parseDiceText(text) {
  const t = String(text ?? "");
  const diceMatch = t.match(/(\d+)\s*D(?:6)?(?![a-z])/i);
  const rest = diceMatch ? t.replace(diceMatch[0], " ") : t;
  const mod = (rest.match(/[+-]?\s*\d+/g) ?? []).reduce((sum, n) => sum + Number(n.replace(/\s/g, "")), 0);
  return { dice: diceMatch ? Number(diceMatch[1]) : 0, mod };
}

/**
 * Read the target's check (Evasion / Resistance / Auto) from legacy Check text.
 * @param {string} text
 * @returns {string}
 */
function parseVsText(text) {
  const t = String(text ?? "");
  if (/auto|自動|자동/i.test(t)) return "auto";
  if (/resist|抵抗|저항/i.test(t)) return "resistance";
  if (/eva|dodge|回避|회피/i.test(t)) return "evasion";
  return "";
}

const toInt = value => Math.trunc(Number(value) || 0);

/**
 * Normalize a skill's check and damage in place, and add their display labels
 * (`checkLabel`, `damageLabel`) for sheets and chat cards.
 * @param {object} system          The skill's prepared system data
 * @param {object} sourceSystem    The skill's source system data
 */
export function prepareSkillRolls(system, sourceSystem) {
  const legacyText = String(system.checkType ?? "").trim();
  const isLegacy = !sourceSystem?.check && !!legacyText;

  const check = isLegacy ? { ...parseDiceText(legacyText), vs: parseVsText(legacyText) } : (system.check ?? {});
  system.check = {
    dice: Math.clamp(toInt(check.dice), 0, SKILL_MAX_DICE),
    mod: toInt(check.mod),
    vs: CHECK_VS.includes(check.vs) ? check.vs : ""
  };
  const damage = system.damage ?? {};
  system.damage = {
    dice: Math.clamp(toInt(damage.dice), 0, SKILL_MAX_DICE),
    mod: toInt(damage.mod),
    type: DAMAGE_TYPES.includes(damage.type) ? damage.type : ""
  };

  system.checkLabel = isLegacy ? legacyText : checkLabel(system.check);
  system.damageLabel = damageLabel(system.damage);
}

/** "4+2D vs Evasion", "13 vs Resistance", "Auto", or "" when nothing is set. */
function checkLabel({ dice, mod, vs }) {
  if (vs === "auto") return game.i18n.localize(VS_LABELS.auto);
  const value = (dice && mod) ? `${mod}+${dice}D` : dice ? `${dice}D` : mod ? String(mod) : "";
  const against = vs ? `vs ${game.i18n.localize(VS_LABELS[vs])}` : "";
  return [value, against].filter(Boolean).join(" ");
}

/** "2D+12 Physical", or "" when nothing is set. */
function damageLabel({ dice, mod, type }) {
  if (!dice && !mod) return "";
  const value = (dice && mod) ? `${dice}D${mod > 0 ? "+" : ""}${mod}` : dice ? `${dice}D` : String(mod);
  return type ? `${value} ${game.i18n.localize(TYPE_LABELS[type])}` : value;
}

/**
 * Roll a skill's Check or Damage straight to chat.
 * @param {Item} item                   The skill
 * @param {"check"|"damage"} which
 */
export async function rollSkill(item, which) {
  const system = item.system;
  const title = `${item.name} - ${game.i18n.localize(`LHTRPG.Skill.Label.${which === "check" ? "Check" : "Damage"}`)}`;
  const values = system[which];
  let flavor = title;
  if (which === "check" && values.vs) flavor += ` vs ${game.i18n.localize(VS_LABELS[values.vs])}`;
  if (which === "damage" && values.type) flavor += ` (${game.i18n.localize(TYPE_LABELS[values.type])})`;

  const speaker = ChatMessage.getSpeaker({ actor: item.actor });
  const rollMode = game.settings.get("core", "rollMode");
  // Automatic success: nothing to roll, just announce it.
  if ((which === "check") && (values.vs === "auto")) {
    const data = { speaker, flavor: title, content: game.i18n.localize(VS_LABELS.auto) };
    ChatMessage.applyRollMode(data, rollMode);
    return ChatMessage.create(data);
  }
  return new Roll(diceFormula(values)).toMessage({ speaker, flavor, rollMode });
}
