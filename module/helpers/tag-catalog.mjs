/**
 * Catalog of the known Log Horizon TRPG tags: the canonical spelling stored in `system.tags`, the
 * misspellings / variants it replaces and a group for the suggestion list. The rules summary shown
 * as tooltip lives in the lang files (`LHTRPG.TagDesc.<Label>`, see tagDescription). Modules can add
 * entries to `CONFIG.LHTRPG.tags` during `init` / `setup`, with their own `desc`.
 *
 * Tags are stored WITHOUT brackets, in Title Case ("Two-Handed", not "[two handed]").
 */

const G = {
  equip: "LHTRPG.TagGroup.Equipment",
  item: "LHTRPG.TagGroup.Item",
  skill: "LHTRPG.TagGroup.Skill",
  attack: "LHTRPG.TagGroup.Attack",
  element: "LHTRPG.TagGroup.Element",
  creature: "LHTRPG.TagGroup.Creature",
  other: "LHTRPG.TagGroup.Other"
};

/** @type {{label: string, group: string, desc?: string, aliases?: string[]}[]} */
export const TAG_CATALOG = [
  // Equipment categories: which classes can equip the item / which weapon an attack requires.
  { label: "Blade", group: G.equip },
  { label: "Katana", group: G.equip },
  { label: "Spear", group: G.equip },
  { label: "Hafted", group: G.equip },
  { label: "Staff", group: G.equip },
  { label: "Bow", group: G.equip },
  { label: "Crossbow", group: G.equip, aliases: ["CrossBow"] },
  { label: "Throwing", group: G.equip },
  { label: "Whip", group: G.equip },
  { label: "Martial Arts", group: G.equip },
  { label: "Instrument", group: G.equip },
  { label: "Magic Stone", group: G.equip },
  { label: "Light", group: G.equip },
  { label: "Light Armor", group: G.equip },
  { label: "Medium Armor", group: G.equip, aliases: ["Med. Armor"] },
  { label: "Heavy Armor", group: G.equip },
  { label: "Shield", group: G.equip },
  { label: "Helm", group: G.equip },
  { label: "Gloves", group: G.equip },
  { label: "Boots", group: G.equip },
  { label: "Cloak", group: G.equip },
  { label: "Bag", group: G.equip },
  { label: "One-Handed", group: G.equip, aliases: ["One Hand", "One Handed"] },
  { label: "Two-Handed", group: G.equip, aliases: ["Two Handed"] },
  { label: "Accessory", group: G.equip, aliases: ["Accesory"] },
  { label: "Head", group: G.equip },
  { label: "Arms", group: G.equip },
  { label: "Legs", group: G.equip },
  { label: "Dual Wield", group: G.equip },

  // Item properties.
  { label: "Consumable", group: G.item },
  { label: "Preparation", group: G.skill },
  { label: "Not For Sale", group: G.item, aliases: ["Unmarketable"] },
  { label: "Untradeable", group: G.item },
  { label: "Rare", group: G.item },
  { label: "Potion", group: G.item },
  { label: "Scroll", group: G.item },
  { label: "Toxin", group: G.item },
  { label: "Food", group: G.item },
  { label: "Gem", group: G.item },
  { label: "Charm", group: G.item },
  { label: "Medicine", group: G.item },
  { label: "Magic Tool", group: G.item },
  { label: "Magic Ring", group: G.item },
  { label: "Embroidery", group: G.item },
  { label: "Summoning Whistle", group: G.item },
  { label: "Flag", group: G.item },
  { label: "Tame", group: G.item },
  ...[1, 2, 3, 4, 5, 6].map(n => ({ label: `M${n}`, group: G.item })),

  // Skill keywords.
  { label: "Training", group: G.skill },
  { label: "Style", group: G.skill },
  { label: "Stance", group: G.skill },
  { label: "Harmony", group: G.skill },
  { label: "Servant Summon", group: G.skill },
  { label: "Enchantment", group: G.skill },
  { label: "Swift", group: G.skill },
  { label: "Scout", group: G.skill },
  { label: "Summon", group: G.skill },
  { label: "Combat", group: G.skill },
  { label: "General", group: G.skill },
  { label: "Movement", group: G.skill, aliases: ["Move"] },
  { label: "Auto", group: G.skill },
  { label: "Constant", group: G.skill },
  { label: "Support", group: G.skill },
  { label: "Standby", group: G.skill },
  { label: "EX Power", group: G.skill },
  { label: "GM", group: G.skill },

  // Attack kinds: weapon attacks add the equipped weapon's tags to the damage.
  { label: "Weapon Attack", group: G.attack },
  { label: "Melee Attack", group: G.attack, aliases: ["Mele Attack", "Melee Attact"] },
  { label: "Ranged Attack", group: G.attack, aliases: ["Shooting Attack"] },
  { label: "Magic Attack", group: G.attack },
  { label: "Physical Attack", group: G.attack },
  { label: "Special Attack", group: G.attack },
  { label: "Sword Attack", group: G.attack },

  // Damage elements: interact with [Weakness] and [Cancel].
  { label: "Flame", group: G.element, aliases: ["Fire"] },
  { label: "Cold", group: G.element },
  { label: "Shock", group: G.element, aliases: ["Electric"] },
  { label: "Radiance", group: G.element },
  { label: "Blight", group: G.element },
  { label: "Holy", group: G.element },
  { label: "Poison", group: G.element },
  { label: "Psychic", group: G.element },
  { label: "Mental", group: G.element },

  // Creature types and ranks.
  { label: "Human", group: G.creature },
  { label: "Humanoid", group: G.creature },
  { label: "Adventurer", group: G.creature },
  { label: "Lander", group: G.creature },
  { label: "Goblin", group: G.creature },
  { label: "Kobold", group: G.creature },
  { label: "Ratman", group: G.creature },
  { label: "Neirity", group: G.creature },
  { label: "Undead", group: G.creature },
  { label: "Spirit", group: G.creature },
  { label: "Fairy", group: G.creature },
  { label: "Dragon", group: G.creature },
  { label: "Cryptid", group: G.creature },
  { label: "Mythic", group: G.creature },
  { label: "Nature", group: G.creature },
  { label: "Natural", group: G.creature },
  { label: "Plant", group: G.creature },
  { label: "Aquatic", group: G.creature },
  { label: "Construct", group: G.creature },
  { label: "Artificial", group: G.creature },
  { label: "Inorganic", group: G.creature },
  { label: "Inanimate", group: G.creature },
  { label: "Mechanical", group: G.creature },
  { label: "Clockwork", group: G.creature },
  { label: "Magical", group: G.creature },
  { label: "Genius", group: G.creature },
  { label: "Gimmick", group: G.creature },
  { label: "Mob", group: G.creature },
  { label: "Boss", group: G.creature },
  { label: "Night Vision", group: G.creature, aliases: ["Night-Vision"] }
];

/** "[Two handed] " -> "two handed" (also turns "-" into " " so "Two-Handed" == "Two Handed"). */
export const tagKey = tag => String(tag ?? "").replace(/[\[\]]/g, "").replace(/[\s-]+/g, " ").trim().toLowerCase();

let _index = null;
let _indexSource = null;

/** Map of tagKey(label or alias) -> catalog entry. Rebuilt if CONFIG.LHTRPG.tags is replaced. */
function index() {
  const catalog = globalThis.CONFIG?.LHTRPG?.tags ?? TAG_CATALOG;
  if (_index && (_indexSource === catalog) && (_index.size >= catalog.length)) return _index;
  _index = new Map();
  _indexSource = catalog;
  for (const entry of catalog) {
    _index.set(tagKey(entry.label), entry);
    for (const alias of entry.aliases ?? []) _index.set(tagKey(alias), entry);
  }
  return _index;
}

/** The catalog entry of a tag (by label or alias, ignoring brackets/case/hyphens), or null. */
export function findTag(tag) {
  return index().get(tagKey(tag)) ?? null;
}

/**
 * The canonical spelling of a tag: the catalog label if known; otherwise the text without brackets
 * or extra spaces, with each word capitalized ("magic catalyst 3" -> "Magic Catalyst 3").
 */
export function canonicalTag(tag) {
  const known = findTag(tag);
  if (known) return known.label;
  return String(tag ?? "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim()
    .replace(/(^|[\s(\/-])(\p{Ll})/gu, (m, sep, c) => sep + c.toUpperCase());
}

/** Split strings that hold several bracketed tags ("[Fairy][Cold]" -> ["Fairy", "Cold"]). */
export function splitTags(tags) {
  return (tags ?? []).flatMap(t => {
    const groups = String(t ?? "").match(/\[[^\]]*\]/g);
    return (groups?.length > 1) && !String(t).replace(/\[[^\]]*\]/g, "").trim() ? groups : [t];
  });
}

/** Canonical, de-duplicated list of tags (empty ones dropped). */
export function canonicalTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of splitTags(tags)) {
    const label = canonicalTag(t);
    const key = tagKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Tooltip text of a tag: `LHTRPG.TagDesc.<Label>` (lang files), else the entry's `desc` (module-added tags). */
export function tagDescription(tag) {
  const entry = findTag(tag);
  if (!entry) return "";
  const key = `LHTRPG.TagDesc.${entry.label.replace(/[^A-Za-z0-9]/g, "")}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : (entry.desc ?? "");
}
