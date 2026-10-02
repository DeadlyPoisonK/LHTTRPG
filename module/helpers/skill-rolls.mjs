import { diceFormula } from "./dice.mjs";
import { createAttackCard, createDamageCard, findAttackMessage, isAttack } from "./combat-cards.mjs";
import { evaluateFormula, formulaData, formulaLabel, isFormula } from "./effect-formulas.mjs";
import { rollBonuses, rollBonusesLabel } from "./roll-bonuses.mjs";

/**
 * Skill Check and Damage, set directly on the skill sheet:
 *   system.check  = { stat, dice, mod, vs }            vs: "evasion" | "resistance" | "auto" | ""
 *   system.damage = { dice, mod, type, recovery, noPower }   type: "physical" | "magical" | "penetrating" | "direct" | ""
 * Monster skills (subtype "Monster", or any skill owned by a monster) and usable items roll their
 * dice + modifier as is.
 * Character skills (Basic / General / Combat) roll the character's check `stat` (its dice + total)
 * plus the extra dice/modifier, and their damage adds Attack Power (physical) or Magic Power (magical),
 * plus Recovery Power when `recovery` is set (healing: "3D + [Magic Power] + [Recovery]"), unless `noPower`
 * is set: then only its dice and modifier count (a formula may add "@magic", "@recovery"…).
 * Skills made before this stored the Check as free text (system.checkType); until they are edited,
 * that text is still shown and their stat/dice/modifier/vs are read from it.
 * The modifier may be a formula ("@sr*5", see effect-formulas.mjs): it is kept in `formula` (`mod` is
 * then 0) and evaluated when rolling. So may the dice ("@sr+3" → [(SR+3)D]): kept in `diceFormula`. Roll bonuses of the roller's effects are added then too
 * (see roll-bonuses.mjs).
 */

export const SKILL_MAX_DICE = 10;
export const CHECK_VS = ["evasion", "resistance", "auto"];
export const DAMAGE_TYPES = ["physical", "magical", "penetrating", "direct"];
export const CHECK_STATS = [
  "accuracy", "athletics", "endurance", "disable", "operation",
  "perception", "negotiation", "knowledge", "analysis", "evasion", "resistance"
];

/** Battle status added to a character skill's damage, by damage type. */
const DAMAGE_POWER = { physical: "attack", magical: "magic" };
const POWER_LABELS = { attack: "LHTRPG.Tooltip.AttackPower", magic: "LHTRPG.Tooltip.MagicPower", restoration: "LHTRPG.Tooltip.RestorationPower" };
const VS_LABELS = { evasion: "LHTRPG.Check.Evasion", resistance: "LHTRPG.Check.Resistance", auto: "LHTRPG.Skill.Label.CheckAuto" };
const TYPE_LABELS = {
  physical: "LHTRPG.Skill.Label.DamagePhysical", magical: "LHTRPG.Skill.Label.DamageMagical",
  penetrating: "LHTRPG.Combat.Type.penetrating", direct: "LHTRPG.Combat.Type.direct"
};
const RECOVERY_LABEL = "LHTRPG.Skill.Label.DamageRecovery";

const toInt = value => Math.trunc(Number(value) || 0);
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const statLabel = stat => game.i18n.localize(`LHTRPG.Check.${capitalize(stat)}`);

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

/**
 * Read the user's check stat from legacy Check text: the first check named before "vs"
 * ("Opposed (Accuracy vs Evasion)" -> "accuracy").
 * @param {string} text
 * @returns {string}
 */
function parseStatText(text) {
  const own = String(text ?? "").split(/\bvs\b/i)[0].toLowerCase();
  return CHECK_STATS.find(stat => own.includes(stat)) ?? "";
}

/**
 * Whether a skill rolls as a monster skill (fixed dice + modifier). Usable items (potions,
 * poisons…) also roll their own fixed values: "Opposed (8+2D vs Resistance)", "2D + 50".
 * @param {Item} item
 * @returns {boolean}
 */
export function isMonsterSkill(item) {
  return (item.type === "usable") || (item.system.subtype === "Monster") || (item.actor?.type === "monster");
}

/**
 * Normalize a skill's check and damage in place, and add their display labels
 * (`checkLabel`, `damageLabel`) for sheets and chat cards.
 * @param {Item} item    The skill, with its system data being prepared
 */
export function prepareSkillRolls(item) {
  const system = item.system;
  const monster = isMonsterSkill(item);
  const legacyText = String(system.checkType ?? "").trim();
  // The item template fills in an empty check, so an empty one also counts as "not set yet".
  const source = item._source.system?.check;
  const isLegacy = !!legacyText && !(source?.stat || source?.dice || source?.mod || source?.vs);

  const check = isLegacy
    ? { ...parseDiceText(legacyText), vs: parseVsText(legacyText), stat: parseStatText(legacyText) }
    : (system.check ?? {});
  system.check = {
    stat: CHECK_STATS.includes(check.stat) ? check.stat : "",
    ...diceOrFormula(check.dice),
    ...modOrFormula(check.mod),
    vs: CHECK_VS.includes(check.vs) ? check.vs : ""
  };
  const damage = system.damage ?? {};
  system.damage = {
    ...diceOrFormula(damage.dice),
    ...modOrFormula(damage.mod),
    type: DAMAGE_TYPES.includes(damage.type) ? damage.type : "",
    recovery: !!damage.recovery,
    noPower: !!damage.noPower
  };

  system.checkLabel = isLegacy ? legacyText : checkLabel(system.check, monster);
  system.damageLabel = damageLabel(system.damage, monster);
}

/** A stored modifier: a number, or a formula ("@sr*5") kept apart. */
function modOrFormula(value) {
  return isFormula(value) ? { mod: 0, formula: value.trim() } : { mod: toInt(value), formula: "" };
}

/** A stored dice count: a number, or a formula ("@sr+3") kept apart. */
function diceOrFormula(value) {
  return isFormula(value) ? { dice: 0, diceFormula: value.trim() }
    : { dice: Math.clamp(toInt(value), 0, SKILL_MAX_DICE), diceFormula: "" };
}

/** Parts of a roll value: ["[SR+3]D", "3", "[SR×5]"] */
function rollParts({ dice, diceFormula, mod, formula }) {
  return [
    diceFormula ? `[${formulaLabel(diceFormula)}]D` : (dice ? `${dice}D` : ""),
    mod ? String(mod) : "",
    formula ? `[${formulaLabel(formula)}]` : ""
  ].filter(Boolean);
}

/** "2D + 3", "[SR+3]D + [SR×5]", "2D - 1" */
const joinParts = parts => parts.join(" + ").replace(/\+ -/g, "- ");

/** " + 2D + 3", " - 1", " + [SR×5]", "" */
function extraText(values) {
  const parts = rollParts(values);
  return parts.length ? ` + ${joinParts(parts)}`.replace(/\+ -/g, "- ") : "";
}

/** "4+2D vs Evasion", "Accuracy + 1 vs Evasion", "Auto", or "" when nothing is set. */
function checkLabel(check, monster) {
  const { stat, dice, mod, formula, diceFormula, vs } = check;
  if (vs === "auto") return game.i18n.localize(VS_LABELS.auto);
  let value;
  if (!monster && stat) value = statLabel(stat) + extraText(check);
  else if (formula || diceFormula) value = joinParts(rollParts(check));
  else value = (dice && mod) ? `${mod}+${dice}D` : dice ? `${dice}D` : mod ? String(mod) : "";
  const against = vs ? `vs ${game.i18n.localize(VS_LABELS[vs])}` : "";
  return [value, against].filter(Boolean).join(" ");
}

/**
 * Battle statuses a character skill's damage adds: Attack / Magic Power by type, plus Recovery Power.
 * @param {object} damage
 * @returns {string[]}   Keys of `battle-status.power`
 */
function damagePowers({ type, recovery, noPower }) {
  if (noPower) return [];
  return [DAMAGE_POWER[type], recovery ? "restoration" : null].filter(Boolean);
}

/**
 * "2D+12 Physical", "[Attack Power] + 1D Physical", "[Magic Power] + [Recovery Power] + 3D",
 * or "" when nothing is set.
 */
function damageLabel(damage, monster) {
  const { dice, mod, formula, diceFormula, type, recovery } = damage;
  // Healing is not physical/magical damage: "Recovery" replaces the type.
  const suffix = game.i18n.localize(recovery ? RECOVERY_LABEL : (TYPE_LABELS[type] ?? ""));
  const powers = monster ? [] : damagePowers(damage);
  if (powers.length) {
    const value = powers.map(p => `[${game.i18n.localize(POWER_LABELS[p])}]`).join(" + ") + extraText(damage);
    return recovery ? value : `${value} ${suffix}`.trim();
  }
  if (!dice && !mod && !formula && !diceFormula) return "";
  const value = (formula || diceFormula) ? joinParts(rollParts(damage))
    : (dice && mod) ? `${dice}D${mod > 0 ? "+" : ""}${mod}` : dice ? `${dice}D` : String(mod);
  return suffix ? `${value} ${suffix}` : value;
}

/**
 * Whether a skill has something to roll for its Check and its Damage (roll buttons of the chat card).
 * @param {Item} item
 * @returns {{check: boolean, damage: boolean}}
 */
export function skillRollable(item) {
  const { check, damage } = item.system;
  const monster = isMonsterSkill(item);
  return {
    check: (check.vs !== "auto") && !!(check.dice || check.mod || check.formula || check.diceFormula || (!monster && check.stat)),
    damage: !!(damage.dice || damage.mod || damage.formula || damage.diceFormula || (!monster && damagePowers(damage).length))
  };
}

/**
 * The character a character skill rolls for: its owner, else the selected token's or the user's character.
 * @param {Item} item
 * @returns {Actor|null}
 */
function skillRoller(item) {
  const actor = item.actor ?? canvas?.tokens?.controlled[0]?.actor ?? game.user.character ?? null;
  return actor?.type === "character" ? actor : null;
}

/**
 * Actors a roll is made against (roll bonuses with target tags): those the attack hit, else the user's
 * targets (or the default targets of the damage card).
 * @param {ChatMessage|null} attackMessage
 * @param {object[]} [defaultTargets]
 * @returns {Actor[]}
 */
function rollTargets(attackMessage, defaultTargets) {
  const attack = attackMessage?.getFlag("lhtrpg", "attack");
  const uuids = attack ? attack.targets.filter(t => t.hit !== false).map(t => t.actorUuid)
    : game.user.targets.size ? [...game.user.targets].map(t => t.actor?.uuid)
      : (defaultTargets ?? []).map(t => t.actorUuid);
  return uuids.filter(Boolean).map(uuid => fromUuidSync(uuid)).filter(a => a instanceof Actor);
}

/**
 * Roll a skill's Check or Damage to chat.
 * A Check against Evasion / Resistance (or Automatic) with targeted tokens becomes an attack card,
 * and every Damage roll becomes a damage card (see combat-cards.mjs).
 * @param {Item} item                   The skill (or usable item)
 * @param {"check"|"damage"} which
 * @param {object} [options]
 * @param {object[]} [options.targets]  Damage card targets when the user targets nothing
 *                                       (see targetEntries in combat-cards.mjs)
 */
export async function rollSkill(item, which, { targets } = {}) {
  const system = item.system;
  const title = `${item.name} - ${game.i18n.localize(`LHTRPG.Skill.Label.${which === "check" ? "Check" : "Damage"}`)}`;
  const values = system[which];
  const monster = isMonsterSkill(item);
  // Character skill: the check stat, or the powers added to its damage.
  const stat = (!monster && which === "check") ? values.stat : "";
  const powers = (!monster && which === "damage") ? damagePowers(values) : [];

  let flavor = title;
  if (which === "check" && stat) flavor += ` (${statLabel(stat)})`;
  if (which === "check" && values.vs) flavor += ` vs ${game.i18n.localize(VS_LABELS[values.vs])}`;
  if (which === "damage") {
    const type = values.recovery ? RECOVERY_LABEL : TYPE_LABELS[values.type];
    if (type) flavor += ` (${game.i18n.localize(type)})`;
  }

  const rollMode = game.settings.get("core", "rollMode");
  const attack = (which === "check") && isAttack(item);
  // Automatic success: nothing to roll, just announce it (or hit every target).
  if ((which === "check") && (values.vs === "auto")) {
    if (attack) return createAttackCard(item, item.actor, null, flavor);
    const data = { speaker: ChatMessage.getSpeaker({ actor: item.actor }), flavor: title, content: game.i18n.localize(VS_LABELS.auto) };
    ChatMessage.applyRollMode(data, rollMode);
    return ChatMessage.create(data);
  }

  let actor = item.actor;
  let { dice, mod } = values;
  if (stat || powers.length) {
    actor = skillRoller(item);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("LHTRPG.Skill.Notif.NoCharacter"));
      return null;
    }
    if (which === "check") {
      const check = actor.system.checks?.[stat] ?? {};
      dice += toInt(check.dice);
      mod += toInt(check.total);
    }
    else for (const power of powers) mod += toInt(actor.system["battle-status"]?.power?.[power]?.total);
  }
  // Dice / modifier formulas of the skill ("@sr+3", "@sr*5"): the skill's rank, the roller's values.
  const data = (values.formula || values.diceFormula) ? formulaData(actor ?? item.actor, item) : null;
  if (values.diceFormula) dice += Math.max(0, evaluateFormula(values.diceFormula, data) ?? 0);
  if (values.formula) mod += evaluateFormula(values.formula, data) ?? 0;
  // Bonuses of the roller's effects to this skill's rolls (White Robe Style -> «Reactive Heal»…)
  const attackMessage = (which === "damage") ? findAttackMessage(item) : null;
  const bonuses = rollBonuses(actor, item, which, { targets: rollTargets(attackMessage, targets) });
  for (const bonus of bonuses) {
    dice += bonus.dice;
    mod += bonus.mod;
  }
  const bonusText = rollBonusesLabel(bonuses);
  const formula = diceFormula({ dice, mod });

  if (attack) return createAttackCard(item, actor, formula, flavor, { bonuses: bonusText });
  if (which === "damage") {
    const defaultTargets = (targets?.length && !game.user.targets.size) ? targets : undefined;
    return createDamageCard(item, actor, formula, flavor, attackMessage, defaultTargets, { bonuses: bonusText });
  }
  if (bonusText) flavor += ` (${bonusText})`;
  return new Roll(formula).toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor, rollMode });
}
