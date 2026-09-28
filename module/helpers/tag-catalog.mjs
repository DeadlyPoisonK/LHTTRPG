/**
 * Catalog of the known Log Horizon TRPG tags: the canonical spelling stored in `system.tags`, the
 * misspellings / variants it replaces, a group for the suggestion list and a short rules summary
 * shown as tooltip. Modules can add entries to `CONFIG.LHTRPG.tags` during `init` / `setup`.
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
  { label: "Blade", group: G.equip, desc: "Swords and knives. Classes that can equip [Blade] can use it; an attack with this tag requires an equipped [Blade]." },
  { label: "Katana", group: G.equip, desc: "Katanas. Classes that can equip [Katana] can use it; an attack with this tag requires an equipped [Katana]." },
  { label: "Spear", group: G.equip, desc: "Spears and polearms. Classes that can equip [Spear] can use it; an attack with this tag requires an equipped [Spear]." },
  { label: "Hafted", group: G.equip, desc: "Axes, maces and hammers. Classes that can equip [Hafted] can use it." },
  { label: "Staff", group: G.equip, desc: "Staves and wands. Classes that can equip [Staff] can use it. Its Magic Power can't be combined with a [Magic Stone]." },
  { label: "Bow", group: G.equip, desc: "Bows. Classes that can equip [Bow] can use it; an attack with this tag requires an equipped [Bow]." },
  { label: "Crossbow", group: G.equip, aliases: ["CrossBow"], desc: "Crossbows. Classes that can equip [Crossbow] can use it." },
  { label: "Throwing", group: G.equip, desc: "Thrown weapons. Classes that can equip [Throwing] can use it." },
  { label: "Whip", group: G.equip, desc: "Whips. Classes that can equip [Whip] can use it." },
  { label: "Martial Arts", group: G.equip, desc: "Fist weapons and unarmed techniques. Classes that can equip [Martial Arts] can use it." },
  { label: "Instrument", group: G.equip, desc: "Musical instruments, used by Bards." },
  { label: "Magic Stone", group: G.equip, desc: "Catalyst stones. Its Magic Power can't be combined with a [Staff]." },
  { label: "Light", group: G.equip, desc: "Light weapons. Classes that can equip [Light] can use it (e.g. Sorcerers can use Short Swords, but not other [Blade] items)." },
  { label: "Light Armor", group: G.equip, desc: "Light armor. Classes that can equip [Light Armor] can use it." },
  { label: "Medium Armor", group: G.equip, aliases: ["Med. Armor"], desc: "Medium armor. Classes that can equip [Medium Armor] can use it." },
  { label: "Heavy Armor", group: G.equip, desc: "Heavy armor. Classes that can equip [Heavy Armor] can use it." },
  { label: "Shield", group: G.equip, desc: "Shields. Classes that can equip [Shield] can use it." },
  { label: "Helm", group: G.equip, desc: "Headgear." },
  { label: "Gloves", group: G.equip, desc: "Gloves and gauntlets." },
  { label: "Boots", group: G.equip, desc: "Footwear." },
  { label: "Cloak", group: G.equip, desc: "Cloaks and mantles." },
  { label: "Bag", group: G.equip, desc: "Adds Inventory Slots. A Bag with [One-Handed] or [Accessory] can also be equipped in those slots." },
  { label: "One-Handed", group: G.equip, aliases: ["One Hand", "One Handed"], desc: "Occupies one hand slot." },
  { label: "Two-Handed", group: G.equip, aliases: ["Two Handed"], desc: "Occupies both hand slots." },
  { label: "Accessory", group: G.equip, aliases: ["Accesory"], desc: "Equipped in an accessory slot." },
  { label: "Head", group: G.equip, desc: "Worn on the head." },
  { label: "Arms", group: G.equip, desc: "Worn on the arms." },
  { label: "Legs", group: G.equip, desc: "Worn on the legs." },
  { label: "Dual Wield", group: G.equip, desc: "Requires a weapon in each hand." },

  // Item properties.
  { label: "Consumable", group: G.item, desc: "The item is lost when used. Unlike other actions, several Consumable items may be used in the same Process or during the Briefing." },
  { label: "Preparation", group: G.skill, desc: "Can also be used with [Timing: Briefing] before combat without consuming the Briefing action (still only once)." },
  { label: "Not For Sale", group: G.item, aliases: ["Unmarketable"], desc: "Can't be bought or sold in shops." },
  { label: "Untradeable", group: G.item, desc: "Can't be traded to other characters." },
  { label: "Rare", group: G.item, desc: "Rare item, usually a prize or crafted." },
  { label: "Potion", group: G.item, desc: "Drinkable potion." },
  { label: "Scroll", group: G.item, desc: "Magic scroll." },
  { label: "Toxin", group: G.item, desc: "Poison or toxin item." },
  { label: "Food", group: G.item, desc: "Food item." },
  { label: "Gem", group: G.item, desc: "Gem or valuable stone." },
  { label: "Charm", group: G.item, desc: "Charm or talisman." },
  { label: "Medicine", group: G.item, desc: "Medicine item." },
  { label: "Magic Tool", group: G.item, desc: "Magic tool." },
  { label: "Magic Ring", group: G.item, desc: "Magic ring." },
  { label: "Embroidery", group: G.item, desc: "Embroidery item." },
  { label: "Summoning Whistle", group: G.item, desc: "Whistle that calls a mount or companion." },
  { label: "Flag", group: G.item, desc: "Flag or banner." },
  { label: "Tame", group: G.item, desc: "Item related to taming creatures." },
  ...[1, 2, 3, 4, 5, 6].map(n => ({ label: `M${n}`, group: G.item, desc: `Magic Grade ${n} item.` })),

  // Skill keywords.
  { label: "Training", group: G.skill, desc: "Conditioning or training. Max 2 Training skills at CR1, 3 at CR11 and 4 at CR21 (Skill Rank doesn't count)." },
  { label: "Style", group: G.skill, desc: "Fighting style. Only one [Style] skill benefits the character at a time; change it as the Setup Process action." },
  { label: "Stance", group: G.skill, desc: "Only one [Stance] benefits the character at a time; using another ends the previous one." },
  { label: "Harmony", group: G.skill, desc: "Bard songs. Last until the end of the Scene; by default only one Harmony active at a time, and each target only gains one of the same type." },
  { label: "Servant Summon", group: G.skill, desc: "Druid/Summoner servants. Last until the end of the Scene; by default only one active at a time." },
  { label: "Enchantment", group: G.skill, desc: "Enchanter skills. Last until the end of the Scene; by default only TWO active at a time." },
  { label: "Swift", group: G.skill, desc: "Grants extra actions. At most one [Swift] action during the Briefing and during each Process." },
  { label: "Scout", group: G.skill, desc: "Gathers information about the next Scene when used during the Briefing (only its starting state)." },
  { label: "Summon", group: G.skill, desc: "Summons a creature." },
  { label: "Combat", group: G.skill, desc: "Combat skill." },
  { label: "General", group: G.skill, desc: "General skill." },
  { label: "Movement", group: G.skill, aliases: ["Move"], desc: "Action that moves the character." },
  { label: "Auto", group: G.skill, desc: "Automatic effect, no check needed." },
  { label: "Constant", group: G.skill, desc: "Always active." },
  { label: "Support", group: G.skill, desc: "Support action." },
  { label: "Standby", group: G.skill, desc: "Related to declaring Standby." },
  { label: "EX Power", group: G.skill, desc: "GM EX Power." },
  { label: "GM", group: G.skill, desc: "Used by the GM." },

  // Attack kinds: weapon attacks add the equipped weapon's tags to the damage.
  { label: "Weapon Attack", group: G.attack, desc: "Attack made with the equipped weapon (its tags apply to the damage)." },
  { label: "Melee Attack", group: G.attack, aliases: ["Mele Attack", "Melee Attact"], desc: "Requires a melee weapon; its tags apply to the damage." },
  { label: "Ranged Attack", group: G.attack, aliases: ["Shooting Attack"], desc: "Requires a ranged weapon; its tags apply to the damage." },
  { label: "Magic Attack", group: G.attack, desc: "Magical attack." },
  { label: "Physical Attack", group: G.attack, desc: "Physical attack." },
  { label: "Special Attack", group: G.attack, desc: "Special attack." },
  { label: "Sword Attack", group: G.attack, desc: "Attack with a sword." },

  // Damage elements: interact with [Weakness] and [Cancel].
  { label: "Flame", group: G.element, aliases: ["Fire"], desc: "Fire element. Interacts with Weakness/Cancel (Flame)." },
  { label: "Cold", group: G.element, desc: "Cold element. Interacts with Weakness/Cancel (Cold)." },
  { label: "Shock", group: G.element, aliases: ["Electric"], desc: "Lightning element. Interacts with Weakness/Cancel (Shock)." },
  { label: "Radiance", group: G.element, desc: "Light element. Interacts with Weakness/Cancel (Radiance)." },
  { label: "Blight", group: G.element, desc: "Darkness/corruption element. Interacts with Weakness/Cancel (Blight)." },
  { label: "Holy", group: G.element, desc: "Holy element. Interacts with Weakness/Cancel (Holy)." },
  { label: "Poison", group: G.element, desc: "Poison. Interacts with Weakness/Cancel (Poison)." },
  { label: "Psychic", group: G.element, desc: "Psychic effect." },
  { label: "Mental", group: G.element, desc: "Mental effect." },

  // Creature types and ranks.
  { label: "Human", group: G.creature, desc: "Any of the Eight Good Races." },
  { label: "Humanoid", group: G.creature, desc: "Humanoid creature." },
  { label: "Adventurer", group: G.creature, desc: "An Adventurer (player race)." },
  { label: "Lander", group: G.creature, desc: "A native of the world." },
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
  { label: "Gimmick", group: G.creature, desc: "Prop or gimmick enemy." },
  { label: "Mob", group: G.creature, desc: "Mob enemy." },
  { label: "Boss", group: G.creature, desc: "Boss enemy." },
  { label: "Night Vision", group: G.creature, aliases: ["Night-Vision"], desc: "Not hindered by darkness." }
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

/** Tooltip text of a tag (localized description if `LHTRPG.TagDesc.<Label>` exists). */
export function tagDescription(tag) {
  const entry = findTag(tag);
  if (!entry) return "";
  const key = `LHTRPG.TagDesc.${entry.label.replace(/[^A-Za-z0-9]/g, "")}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : (entry.desc ?? "");
}
