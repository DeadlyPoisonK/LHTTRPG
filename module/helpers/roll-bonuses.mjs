/**
 * Roll bonuses: effects that add to the Check or Damage roll of some skills only
 * ("+[SRx3] to the HP recovered when using «Reactive Heal»", "+[(SR)D] to [Weapon Attack] damage rolls
 * with a [Blade] weapon").
 *
 * They are effect changes on virtual keys (nothing is written to the actor's data):
 *   lhtrpg.roll.check.mod | lhtrpg.roll.check.dice | lhtrpg.roll.damage.mod | lhtrpg.roll.damage.dice
 * with a value (number or formula, see effect-formulas.mjs) and the effect's `flags.lhtrpg.rollFilter`:
 *   skills        [{uuid, name}]  the skill rolled is one of these (compendium source, else its name)
 *   skillTags     ["Weapon Attack"]  the skill has one of these tags
 *   weaponTags    ["Blade"]       the main weapon has one of these tags
 *   targetTags    ["Construct"]   a target has one of these tags
 *   selfStatuses  ["hidden"]      the roller has one of these statuses
 *   damageTypes   ["physical"]    the skill's damage is of one of these types ("recovery": a healing skill)
 *   exclusive     "Weapon Mastery"  only the highest bonus of the group applies to a roll
 * Fields left empty don't filter; filled ones must all match.
 *
 * LHTrpgActiveEffect#apply collects them in `actor.rollBonuses` (active, unsuppressed effects only) and
 * rollSkill (skill-rolls.mjs) adds those that match to the roll, listing them in the flavor.
 *
 * Skill modifiers use the same filter to change other skills (see skillModifiers):
 *   lhtrpg.skill.hateCost   Hate cost: Add (-1, "-@sr") or Override (0); never below 0 ("Hate N" costs only)
 *   lhtrpg.skill.range      +N Sq (ranges in Sq, Close, or the weapon's)
 *   lhtrpg.skill.note       text shown with the skill ("Ignores [Cancel: Cold]")
 * They are shown on the skill sheet and chat card, and the range is used by the attack card.
 */
import { evaluateFormula, formulaData, isFormula } from "./effect-formulas.mjs";
import { canonicalTags, tagKey } from "./tag-catalog.mjs";
import { mainWeapon, parseRange } from "./hands.mjs";

export const ROLL_KEY_PREFIX = "lhtrpg.roll.";
export const SKILL_KEY_PREFIX = "lhtrpg.skill.";

/** Statuses a roll bonus may require on the roller. */
export const ROLL_FILTER_STATUSES = ["hidden", "hateTop", "hateUnder"];

/** Damage types a roll bonus may require ("recovery": the skill heals). */
export const ROLL_FILTER_DAMAGE_TYPES = ["physical", "magical", "penetrating", "direct", "recovery"];

/** Exclusive groups of the rules ("Each attack cannot receive the effect of more than one…"). */
export const EXCLUSIVE_GROUPS = ["Weapon Mastery", "Energy Mastery"];

/** Whether an effect change key is a roll bonus or a skill modifier (virtual keys with a skill filter). */
export function isSkillFilterKey(key) {
  const k = String(key ?? "");
  return k.startsWith(ROLL_KEY_PREFIX) || k.startsWith(SKILL_KEY_PREFIX);
}

/** "lhtrpg.roll.damage.dice" -> { roll: "damage", part: "dice" } */
function parseRollKey(key) {
  const [roll, part] = String(key).slice(ROLL_KEY_PREFIX.length).split(".");
  return { roll, part };
}

/** Collect a roll bonus / skill modifier change (from LHTrpgActiveEffect#apply). */
export function collectRollBonus(actor, effect, change) {
  (actor.rollBonuses ??= []).push({ effect, key: change.key, value: change.value, mode: Number(change.mode ?? 2) });
}

/** The value of a collected change: a number or a formula (with the SR of the effect's skill). */
function bonusValue(actor, bonus) {
  return isFormula(bonus.value)
    ? (evaluateFormula(bonus.value, formulaData(actor, bonus.effect.sourceItem)) ?? 0)
    : Math.trunc(Number(bonus.value) || 0);
}

const toList = value => Array.isArray(value) ? [...value] : (value ? Object.values(value) : []);

/**
 * The roll filter of an effect, normalized.
 * @param {ActiveEffect|object} effect
 * @returns {{skills: object[], skillTags: string[], weaponTags: string[], targetTags: string[], selfStatuses: string[], damageTypes: string[], exclusive: string}}
 */
export function rollFilter(effect) {
  const raw = effect?.flags?.lhtrpg?.rollFilter ?? effect?._source?.flags?.lhtrpg?.rollFilter ?? {};
  return {
    skills: toList(raw.skills).filter(s => s?.name || s?.uuid),
    skillTags: toList(raw.skillTags),
    weaponTags: toList(raw.weaponTags),
    targetTags: toList(raw.targetTags),
    selfStatuses: toList(raw.selfStatuses),
    damageTypes: toList(raw.damageTypes),
    exclusive: String(raw.exclusive ?? "").trim()
  };
}

/** Whether a filter has anything set (exclusive groups alone don't filter). */
export function hasRollFilter(filter) {
  return !!(filter.skills.length || filter.skillTags.length || filter.weaponTags.length
    || filter.targetTags.length || filter.selfStatuses.length || filter.damageTypes.length || filter.exclusive);
}

const skillName = name => String(name ?? "").replace(/[«»"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Whether a filter entry designates this skill: its compendium source (or uuid), else its name. */
export function matchesSkill(entry, item) {
  const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  if (entry.uuid && ((entry.uuid === source) || (entry.uuid === item.uuid))) return true;
  return !!entry.name && (skillName(entry.name) === skillName(item.name));
}

const hasAnyTag = (tags, wanted) => {
  const keys = new Set((tags ?? []).map(tagKey));
  return wanted.some(t => keys.has(tagKey(t)));
};

function filterMatches(filter, { actor, item, targets }) {
  if (filter.skills.length && !filter.skills.some(entry => matchesSkill(entry, item))) return false;
  if (filter.skillTags.length && !hasAnyTag(item.system.tags, filter.skillTags)) return false;
  if (filter.weaponTags.length && !hasAnyTag(mainWeapon(actor)?.system.tags, filter.weaponTags)) return false;
  if (filter.targetTags.length && !targets.some(t => hasAnyTag(t?.system?.tags, filter.targetTags))) return false;
  if (filter.selfStatuses.length && !filter.selfStatuses.some(s => actor.statuses?.has(s))) return false;
  if (filter.damageTypes.length) {
    const damage = item.system.damage ?? {};
    if (!filter.damageTypes.some(t => (t === "recovery") ? damage.recovery : ((damage.type === t) && !damage.recovery))) return false;
  }
  return true;
}

/**
 * The roll bonuses of an actor that apply to a skill's Check or Damage.
 * @param {Actor|null} actor     The roller
 * @param {Item} item            The skill (or usable item) rolled
 * @param {"check"|"damage"} which
 * @param {object} [options]
 * @param {Actor[]} [options.targets]   Targets of the roll (target tags)
 * @returns {{label: string, dice: number, mod: number}[]}
 */
export function rollBonuses(actor, item, which, { targets = [] } = {}) {
  if (!actor?.rollBonuses?.length) return [];
  // One entry per effect (an effect may add dice and a modifier).
  const byEffect = new Map();
  for (const bonus of actor.rollBonuses) {
    if (!bonus.key.startsWith(ROLL_KEY_PREFIX)) continue;
    const { roll, part } = parseRollKey(bonus.key);
    if ((roll !== which) || !["dice", "mod"].includes(part)) continue;
    const filter = rollFilter(bonus.effect);
    if (!filterMatches(filter, { actor, item, targets })) continue;
    const value = bonusValue(actor, bonus);
    if (!value) continue;
    const entry = byEffect.get(bonus.effect) ?? {
      label: bonus.effect.sourceItem?.name ?? bonus.effect.name, dice: 0, mod: 0, exclusive: filter.exclusive
    };
    entry[part] += value;
    byEffect.set(bonus.effect, entry);
  }

  // Exclusive groups: only the highest bonus of each one (a die counts as its average, 3.5).
  const weight = e => (e.dice * 3.5) + e.mod;
  const best = new Map();
  const result = [];
  for (const entry of byEffect.values()) {
    if (!entry.exclusive) {
      result.push(entry);
      continue;
    }
    const group = entry.exclusive.toLowerCase();
    if (!best.has(group) || (weight(entry) > weight(best.get(group)))) best.set(group, entry);
  }
  return [...result, ...best.values()];
}

/**
 * How the actor's effects change a skill: Hate cost, range, notes (see the module comment).
 * @param {Actor|null} actor
 * @param {Item} item
 * @returns {{cost: object|null, range: object|null, notes: {label: string, text: string}[]}}
 *   cost / range: {base, value, label (new value), text ("Hate 3 → Hate 2"), sources (names), sourceText}
 */
export function skillModifiers(actor, item) {
  const result = { cost: null, range: null, notes: [] };
  if (!actor?.rollBonuses?.length || !item) return result;
  const hate = String(item.system.cost ?? "").match(/^\s*hate\s+(\d+)(.*)$/i);
  let costAdd = 0, costSet = null, rangeAdd = 0;
  const costSources = [], rangeSources = [];
  for (const bonus of actor.rollBonuses) {
    if (!bonus.key.startsWith(SKILL_KEY_PREFIX)) continue;
    // Skills are changed outside any roll: target tags can't be checked.
    const filter = { ...rollFilter(bonus.effect), targetTags: [] };
    if (!filterMatches(filter, { actor, item, targets: [] })) continue;
    const label = bonus.effect.sourceItem?.name ?? bonus.effect.name;
    const field = bonus.key.slice(SKILL_KEY_PREFIX.length);
    if (field === "note") {
      const text = String(bonus.value ?? "").trim();
      if (text) result.notes.push({ label, text });
    }
    else if ((field === "hateCost") && hate) {
      const value = bonusValue(actor, bonus);
      if (bonus.mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE) costSet = (costSet === null) ? value : Math.min(costSet, value);
      else costAdd += value;
      costSources.push(label);
    }
    else if (field === "range") {
      rangeAdd += bonusValue(actor, bonus);
      rangeSources.push(label);
    }
  }
  if (costSources.length) {
    const value = Math.max(0, (costSet ?? Number(hate[1])) + costAdd);
    const label = `Hate ${value}${hate[2]}`;
    result.cost = { base: Number(hate[1]), value, label, text: `${item.system.cost} → ${label}`, sources: costSources, sourceText: costSources.join(", ") };
  }
  const baseRange = rangeSources.length ? parseRange(item.system.range, actor) : null;
  if ((baseRange !== null) && rangeAdd) {
    const value = Math.max(0, baseRange + rangeAdd);
    const label = `${value}Sq`;
    result.range = { base: baseRange, value, label, text: `${item.system.range} → ${label}`, sources: rangeSources, sourceText: rangeSources.join(", ") };
  }
  return result;
}

/** "White Robe Style +6, Reactive Mastery +2D" */
export function rollBonusesLabel(bonuses) {
  const signed = n => (n >= 0 ? `+${n}` : `${n}`);
  return bonuses.map(b => {
    const parts = [b.dice ? `${signed(b.dice)}D` : "", b.mod ? signed(b.mod) : ""].filter(Boolean).join(" ");
    return `${b.label} ${parts}`;
  }).join(", ");
}

/**
 * Readable roll filter for the effect summary: "«Reactive Heal», [Weapon Attack], weapon [Blade]".
 * @param {object} filter   See rollFilter
 * @returns {string}
 */
export function rollFilterLabel(filter) {
  const i18n = globalThis.game?.i18n;
  const format = (key, data) => i18n ? i18n.format(key, data) : Object.values(data).join(" ");
  const tags = list => list.map(t => `[${t}]`).join("");
  const parts = [];
  if (filter.skills.length) parts.push(filter.skills.map(s => `«${s.name}»`).join(" "));
  if (filter.skillTags.length) parts.push(tags(filter.skillTags));
  if (filter.weaponTags.length) parts.push(format("LHTRPG.RollFilter.Summary.Weapon", { tags: tags(filter.weaponTags) }));
  if (filter.targetTags.length) parts.push(format("LHTRPG.RollFilter.Summary.Target", { tags: tags(filter.targetTags) }));
  if (filter.selfStatuses.length) {
    const statuses = filter.selfStatuses.map(s => `[${i18n ? i18n.localize(`LHTRPG.StatusEffect.${s}`) : s}]`).join("");
    parts.push(format("LHTRPG.RollFilter.Summary.Status", { statuses }));
  }
  if (filter.damageTypes.length) {
    parts.push(filter.damageTypes.map(t => i18n ? i18n.localize(`LHTRPG.Combat.Type.${t}`) : t).join("/"));
  }
  if (filter.exclusive) parts.push(format("LHTRPG.RollFilter.Summary.Exclusive", { group: filter.exclusive }));
  return parts.join(", ");
}

/**
 * Turn the form data of the roll filter editor back into flag data.
 * Tags come as comma-separated text, statuses as {id: true}.
 * @param {object} data
 * @param {object[]} skills   The skills (not in the form: added by drop / name, see effect-config.mjs)
 * @returns {object}
 */
export function rollFilterFromForm(data, skills) {
  const tagList = text => canonicalTags(String(text ?? "").split(","));
  return {
    skills: toList(skills),
    skillTags: tagList(data?.skillTags),
    weaponTags: tagList(data?.weaponTags),
    targetTags: tagList(data?.targetTags),
    selfStatuses: Object.entries(data?.selfStatuses ?? {}).filter(([, on]) => on).map(([id]) => id),
    damageTypes: Object.entries(data?.damageTypes ?? {}).filter(([, on]) => on).map(([id]) => id),
    exclusive: String(data?.exclusive ?? "").trim()
  };
}

/** Context of the roll filter editor (templates/effects/effect-roll-filter.hbs). */
export function rollFilterContext(effectSource, editable) {
  const filter = rollFilter({ flags: effectSource?.flags });
  return {
    editable,
    skills: filter.skills.map((s, index) => ({ ...s, index })),
    skillTags: filter.skillTags.join(", "),
    weaponTags: filter.weaponTags.join(", "),
    targetTags: filter.targetTags.join(", "),
    exclusive: filter.exclusive,
    exclusiveGroups: EXCLUSIVE_GROUPS,
    statuses: ROLL_FILTER_STATUSES.map(id => ({ id, label: `LHTRPG.StatusEffect.${id}`, checked: filter.selfStatuses.includes(id) })),
    damageTypes: ROLL_FILTER_DAMAGE_TYPES.map(id => ({ id, label: `LHTRPG.Combat.Type.${id}`, checked: filter.damageTypes.includes(id) }))
  };
}

