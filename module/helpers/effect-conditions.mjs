/**
 * Conditions under which effects apply ("This skill only produces an effect when…", "(SR2): …").
 *
 * A condition is `{ type, value }` (value: a number or a tag, depending on the type). They live in:
 *   - `system.conditions` of a skill: every effect of the skill (the Styles' equipment requirements);
 *   - `flags.lhtrpg.conditions` of an effect: that effect only (Skill Rank / Character Rank tiers).
 * All of them must be met. LHTrpgActiveEffect#determineSuppression checks them on the actor; when one
 * fails the effect is suppressed and lists under "Condition not met" with the reason.
 * Effects copied to a target when a skill is used are checked against the caster at that moment
 * (item-use.mjs) and lose their conditions.
 *
 * State conditions (statuses, Hate Top / Under, combat) change without the actor's own data changing:
 * registerEffectConditions re-prepares the actors that use them when a combat or a party member changes.
 */
import { EQUIP_TYPES } from "../piles/pile-config.mjs";
import { getHands, isTwoHanded } from "./hands.mjs";
import { tagKey, TAG_CATALOG } from "./tag-catalog.mjs";
import { formulaData } from "./effect-formulas.mjs";

/**
 * Condition types. `param`: what `value` holds ("number" | "tag" | "status"); `optional`: the tag may be
 * empty; `state`: depends on statuses / combat (see refreshStateConditions).
 */
export const CONDITION_TYPES = [
  { id: "srAtLeast", param: "number" },
  { id: "srAtMost", param: "number" },
  { id: "crAtLeast", param: "number" },
  { id: "crAtMost", param: "number" },
  { id: "equipped", param: "tag" },
  { id: "notEquipped", param: "tag" },
  { id: "handsEmpty" },
  { id: "handFree" },
  { id: "oneWeapon", param: "tag", optional: true },
  { id: "twoWeapons", param: "tag", optional: true },
  { id: "armorEmpty" },
  { id: "status", param: "status", state: true },
  { id: "notStatus", param: "status", state: true },
  { id: "hateTop", state: true },
  { id: "hateUnder", state: true },
  { id: "inCombat", state: true },
  { id: "firstRound", state: true },
  { id: "preAction", state: true },
  { id: "standby", state: true }
];

const STATE_TYPES = new Set(CONDITION_TYPES.filter(t => t.state).map(t => t.id));

/**
 * "top" / "under" for a character: its [Hate Top] / [Hate Under] status, or else the Hate of the characters
 * fighting in the current combat (out of it: those Incapacitated / Dead). null for monsters or outside combat.
 * @param {Actor} actor
 * @param {Set<string>} [statuses]   The actor's statuses (while it is being prepared, see actor.mjs)
 * @returns {"top"|"under"|null}
 */
export function hateRank(actor, statuses = actor?.statuses) {
  if (actor?.type !== "character") return null;
  if (statuses?.has("hateTop")) return "top";
  if (statuses?.has("hateUnder")) return "under";
  const out = a => {
    const set = (a.uuid === actor.uuid) ? (statuses ?? new Set()) : a.statuses;
    return set.has("incapacitated") || set.has("dead");
  };
  const party = (game.combat?.combatants ?? [])
    .map(c => c.actor)
    .filter(a => (a?.type === "character") && !out(a));
  if (!party.some(a => a.uuid === actor.uuid)) return null;
  const hate = a => Math.trunc(Number(a.system.infos?.hate) || 0);
  const top = Math.max(...party.map(hate));
  return hate(actor) >= top ? "top" : "under";
}

/** The started combat the actor fights in, and its combatant. */
function combatOf(actor) {
  if (!actor || !globalThis.game?.combats) return {};
  for (const combat of game.combats) {
    if (!combat.started) continue;
    const combatant = combat.getCombatantsByActor(actor)[0];
    if (combatant) return { combat, combatant };
  }
  return {};
}

const ONE_HANDED = tagKey("One-Handed");

/** Whether an item has a tag. Weapons without a hand tag count as [One-Handed] (see hands.mjs). */
function hasTag(item, tag) {
  const key = tagKey(tag);
  if (!key) return true;
  if ((key === ONE_HANDED) && (item.type === "weapon")) return !isTwoHanded(item);
  return (item.system.tags ?? []).some(t => tagKey(t) === key);
}

const number = value => Number(value) || 0;
const weaponsInHands = ({ main, off }) => [main, off].filter(i => i?.type === "weapon");

const TESTS = {
  srAtLeast: (c, ctx) => ctx.sr >= number(c.value),
  srAtMost: (c, ctx) => ctx.sr <= number(c.value),
  crAtLeast: (c, ctx) => ctx.cr >= number(c.value),
  crAtMost: (c, ctx) => ctx.cr <= number(c.value),
  equipped: (c, ctx) => ctx.equipped().some(i => hasTag(i, c.value)),
  notEquipped: (c, ctx) => !ctx.equipped().some(i => hasTag(i, c.value)),
  handsEmpty: (c, ctx) => !ctx.hands().main && !ctx.hands().off,
  handFree: (c, ctx) => {
    const { main, off, locked } = ctx.hands();
    return !locked && !(main && off);
  },
  oneWeapon: (c, ctx) => {
    const weapons = weaponsInHands(ctx.hands());
    return (weapons.length === 1) && hasTag(weapons[0], c.value);
  },
  twoWeapons: (c, ctx) => {
    const weapons = weaponsInHands(ctx.hands());
    return (weapons.length === 2) && weapons.every(w => hasTag(w, c.value));
  },
  armorEmpty: (c, ctx) => !ctx.equipped().some(i => i.type === "armor"),
  status: (c, ctx) => ctx.statuses().has(c.value),
  notStatus: (c, ctx) => !ctx.statuses().has(c.value),
  hateTop: (c, ctx) => ctx.hate() === "top",
  hateUnder: (c, ctx) => ctx.hate() === "under",
  inCombat: (c, ctx) => !!ctx.combat().combatant,
  firstRound: (c, ctx) => ctx.combat().combat?.round === 1,
  // Hasn't taken its Main Process yet this round
  preAction: (c, ctx) => {
    const { combat, combatant } = ctx.combat();
    return !!combatant && !combat.isPostAction?.(combatant) && (combat.progress?.active !== combatant.id);
  },
  // Declared Standby this round
  standby: (c, ctx) => {
    const { combat, combatant } = ctx.combat();
    return ctx.statuses().has("standby") || (!!combatant && !!combat.progress?.standby.includes(combatant.id));
  }
};

/**
 * The first condition that is not met, or null when all are (or there are none).
 * @param {object[]} conditions
 * @param {Actor|null} actor
 * @param {Item|null} item       The item giving the effect (its Skill Rank)
 * @returns {object|null}
 */
export function unmetCondition(conditions, actor, item) {
  if (!conditions?.length) return null;
  const { sr, cr } = formulaData(actor, item);
  let equipped, hands, fight;
  // While the actor is prepared, its statuses are those gathered before (see actor.mjs applyActiveEffects).
  const statuses = () => actor?._lhStatuses ?? actor?.statuses ?? new Set();
  const ctx = {
    sr, cr, statuses,
    equipped: () => equipped ??= (actor?.items.filter(i => EQUIP_TYPES.includes(i.type) && (i.system.equipped === true)) ?? []),
    hands: () => hands ??= getHands(actor),
    hate: () => hateRank(actor, statuses()),
    combat: () => fight ??= combatOf(actor)
  };
  return conditions.find(c => TESTS[c?.type] && !TESTS[c.type](c, ctx)) ?? null;
}

/** Conditions of an effect, plus those of the skill giving it. */
export function effectConditions(effect, item) {
  const own = effect.flags?.lhtrpg?.conditions ?? [];
  const fromItem = item?.system?.conditions ?? [];
  return [...(Array.isArray(fromItem) ? fromItem : Object.values(fromItem)), ...(Array.isArray(own) ? own : Object.values(own))];
}

/** Whether any of the conditions depends on statuses or combat. */
export function hasStateCondition(conditions) {
  return conditions.some(c => STATE_TYPES.has(c?.type));
}

/** Readable condition: "SR ≥ 2", "Not equipped with [Shield]", "While [Hidden]". */
export function conditionLabel(condition) {
  const type = CONDITION_TYPES.find(t => t.id === condition?.type);
  if (!type) return "";
  let value;
  if (type.param === "tag") value = String(condition.value ?? "").replace(/[\[\]]/g, "").trim();
  else if (type.param === "status") value = condition.value ? game.i18n.localize(`LHTRPG.StatusEffect.${condition.value}`) : "?";
  else value = number(condition.value);
  const key = (type.optional && !value) ? `LHTRPG.Condition.Summary.${type.id}Any` : `LHTRPG.Condition.Summary.${type.id}`;
  return game.i18n.format(key, { value });
}

/** Options of the condition type dropdown. */
export function conditionTypeOptions() {
  return Object.fromEntries(CONDITION_TYPES.map(t => [t.id, game.i18n.localize(`LHTRPG.Condition.Type.${t.id}`)]));
}

/**
 * Conditions for the editor partial (templates/effects/lh-conditions.hbs).
 * @param {object[]} conditions
 * @returns {object[]}
 */
export function prepareConditionRows(conditions) {
  const list = Array.isArray(conditions) ? conditions : Object.values(conditions ?? {});
  return list.map((c, index) => {
    const type = CONDITION_TYPES.find(t => t.id === c?.type) ?? CONDITION_TYPES[0];
    return {
      index, type: type.id, value: c?.value ?? "", param: type.param ?? "",
      number: type.param === "number", tag: type.param === "tag", status: type.param === "status"
    };
  });
}

/**
 * Context of the conditions editor (templates/effects/effect-conditions.hbs).
 * @param {object[]} conditions
 * @param {object} options
 * @param {string} options.prefix     Form name of the list ("system.conditions", "flags.lhtrpg.conditions")
 * @param {string} options.hint       Localization key of the hint
 * @param {boolean} options.editable
 * @returns {object}
 */
export function conditionsContext(conditions, { prefix, hint, editable }) {
  const catalog = globalThis.CONFIG?.LHTRPG?.tags ?? TAG_CATALOG;
  return {
    rows: prepareConditionRows(conditions),
    prefix,
    hint: game.i18n.localize(hint),
    editable,
    types: conditionTypeOptions(),
    // The system's statuses (statuses.mjs registers them as CONFIG.statusEffects; not imported here so
    // that this module, used by effect-targets.mjs, still loads in Node)
    statuses: Object.fromEntries(CONFIG.statusEffects.map(s => [s.id, game.i18n.localize(`LHTRPG.StatusEffect.${s.id}`)])),
    tags: catalog.filter(t => t.group === "LHTRPG.TagGroup.Equipment").map(t => t.label)
  };
}

/**
 * Turn form data `{0: {...}, 1: {...}}` back into an array of conditions.
 * @param {object|object[]} data
 * @returns {object[]}
 */
export function conditionsFromForm(data) {
  const list = Array.isArray(data) ? data : Object.keys(data ?? {}).sort((a, b) => a - b).map(k => data[k]);
  return list.filter(c => c?.type).map(c => {
    const type = CONDITION_TYPES.find(t => t.id === c.type);
    if (!type?.param) return { type: c.type };
    return { type: c.type, value: type.param === "number" ? number(c.value) : String(c.value ?? "").trim() };
  });
}

/**
 * Re-prepare the actors whose effects have state conditions (and re-render their sheets): the combat
 * moved on, or a party member's Hate / statuses changed.
 * @param {Actor[]} actors
 */
function refreshStateConditions(actors) {
  for (const actor of new Set(actors)) {
    if (!actor || ![...actor.allApplicableEffects()].some(e => hasStateCondition(effectConditions(e, e.sourceItem)))) continue;
    actor.reset();
    for (const app of foundry.applications.instances.values()) {
      if (app.rendered && ((app.document === actor) || (app.document?.parent === actor))) app.render();
    }
  }
}

const combatActors = combat => (combat?.combatants ?? []).map(c => c.actor);

/** Handlebars helpers and state-condition refreshes. Call during the `init` hook. */
export function registerEffectConditions() {
  Handlebars.registerHelper("lhConditionLabel", conditionLabel);

  // Combat moved on (round, phase, turn, Standby…), started or ended
  Hooks.on("updateCombat", combat => refreshStateConditions(combatActors(combat)));
  Hooks.on("deleteCombat", combat => refreshStateConditions(combatActors(combat)));
  Hooks.on("createCombatant", combatant => refreshStateConditions(combatActors(combatant.parent)));
  Hooks.on("deleteCombatant", combatant => refreshStateConditions([combatant.actor, ...combatActors(combatant.parent)]));

  // Hate Top / Under compare the Hate of the characters in combat (and leave out the Incapacitated)
  const partyOf = actor => game.combats.filter(c => c.started && c.getCombatantsByActor(actor).length).flatMap(combatActors)
    .filter(a => a !== actor);
  Hooks.on("updateActor", (actor, changed) => {
    if (foundry.utils.hasProperty(changed, "system.infos.hate")) refreshStateConditions(partyOf(actor));
  });
  const onStatus = effect => {
    if ((effect.parent instanceof Actor) && effect.statuses?.size) refreshStateConditions(partyOf(effect.parent));
  };
  Hooks.on("createActiveEffect", onStatus);
  Hooks.on("deleteActiveEffect", onStatus);
}

/**
 * Another condition type may take another kind of value: changing the type clears the row's value
 * (before the form submits it).
 * @param {HTMLElement} root
 * @param {Function} [onChange]   Called after (the effect editor submits; the item sheet already does)
 */
export function activateConditionInputs(root, onChange) {
  for (const select of root.querySelectorAll(".lh-condition-type")) {
    select.addEventListener("change", () => {
      const value = select.closest(".lh-condition-row")?.querySelector("[name$='.value']");
      if (value) value.value = "";
      onChange?.();
    });
  }
}
