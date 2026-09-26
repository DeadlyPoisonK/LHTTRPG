/**
 * Constants shared by the Piles feature (loot, chests and merchants).
 */

export const PILE_TYPE = "pile";

export const PILE_MODES = {
  loot: "LHTRPG.Piles.Mode.Loot",
  chest: "LHTRPG.Piles.Mode.Chest",
  merchant: "LHTRPG.Piles.Mode.Merchant"
};

// Item types that physically exist and can be carried, dropped, traded or sold.
export const PHYSICAL_TYPES = ["weapon", "armor", "shield", "accessory", "bag", "gear", "ticket"];

// Item types that take a slot in the character's general inventory grid when
// unequipped (mirrors the carriedItems list of the character sheet). Tickets
// live in their own slots and never use inventory space.
export const SPACE_TYPES = ["weapon", "armor", "shield", "accessory", "bag", "gear"];

export const DEFAULT_IMAGES = {
  loot: "icons/containers/bags/pack-leather-brown.webp",
  chest: "icons/containers/chest/chest-reinforced-steel-brown.webp",
  merchant: "icons/environment/settlement/market-stall.webp"
};

export const SOUNDS = {
  chest: "sounds/lock.wav",
  coins: "sounds/notify.wav"
};

// Flag (on the default loot actor) that marks the base actor used for piles
// created by dropping items on the canvas.
export const DEFAULT_LOOT_FLAG = "defaultLoot";

// Flag (on items inside a merchant) holding the remaining stock. -1 = infinite.
export const STOCK_FLAG = "stock";

export const SETTINGS = {
  chatLog: "pilesChatLog",
  view: "pilesView"
};

// Ways to order a pile's contents (each user picks their own).
export const SORT_MODES = {
  manual: "LHTRPG.Piles.Sort.Manual",
  name: "LHTRPG.Piles.Sort.Name",
  type: "LHTRPG.Piles.Sort.Type",
  priceAsc: "LHTRPG.Piles.Sort.PriceAsc",
  priceDesc: "LHTRPG.Piles.Sort.PriceDesc"
};

// Icon of each physical item type, for the type filter.
export const TYPE_ICONS = {
  weapon: "systems/lhtrpg/assets/ui/items_icons/weapon.svg",
  armor: "systems/lhtrpg/assets/ui/items_icons/armor.svg",
  shield: "systems/lhtrpg/assets/ui/items_icons/shield.svg",
  accessory: "systems/lhtrpg/assets/ui/items_icons/accessory.svg",
  bag: "systems/lhtrpg/assets/ui/items_icons/bag.svg",
  gear: "systems/lhtrpg/assets/ui/items_icons/gear.svg",
  ticket: "icons/sundries/flags/banner-pink.webp"
};
