import { PILE_TYPE, PHYSICAL_TYPES, SPACE_TYPES, STOCK_FLAG } from "./pile-config.mjs";

/* -------------------------------------------- */
/*  Actors & gold                               */
/* -------------------------------------------- */

export function isPile(actor) {
  return actor?.type === PILE_TYPE;
}

export function isMerchant(actor) {
  return isPile(actor) && actor.system.mode === "merchant";
}

export function isPhysical(item) {
  return PHYSICAL_TYPES.includes(item?.type);
}

/** Path of the gold field for an actor type. */
export function goldPath(actor) {
  return isPile(actor) ? "system.gold" : "system.inventory.gold";
}

export function getGold(actor) {
  return Math.max(0, Math.floor(Number(foundry.utils.getProperty(actor, goldPath(actor))) || 0));
}

/** Resolve an Actor from a uuid (world actor, synthetic token actor or token). */
export async function resolveActor(uuid) {
  if (!uuid) return null;
  const doc = await fromUuid(uuid);
  if (doc instanceof Actor) return doc;
  if (doc?.documentName === "Token") return doc.actor;
  return null;
}

/** Quantity of an item (tickets stack, everything else is a single unit). */
export function itemQuantity(item) {
  if (item.type !== "ticket") return 1;
  return Math.max(0, Number(item.system.quantity) || 0);
}

export function getStock(item) {
  const stock = item.getFlag("lhtrpg", STOCK_FLAG);
  return (stock === undefined || stock === null || stock === "") ? -1 : Number(stock);
}

/* -------------------------------------------- */
/*  Inventory space                             */
/* -------------------------------------------- */

/**
 * Can this actor receive the item without going over its inventory space?
 * Only characters have a carrying limit. Tickets use their own slots.
 * @param {Actor} actor
 * @param {Item|object} item   Item or item data
 */
export function hasRoomFor(actor, item) {
  if (actor?.type !== "character") return true;
  if (!SPACE_TYPES.includes(item.type)) return true;
  return usedSpace(actor) < (actor.system.inventory?.maxSpace ?? 0);
}

export function usedSpace(actor) {
  return actor.items.filter(i => SPACE_TYPES.includes(i.type) && i.system.equipped !== true).length;
}

/* -------------------------------------------- */
/*  Merchants                                   */
/* -------------------------------------------- */

export function buyPrice(merchant, item) {
  const mult = Number(merchant.system.merchant?.buyMultiplier ?? 1);
  return Math.max(0, Math.ceil((Number(item.system.price) || 0) * mult));
}

export function sellPrice(merchant, item) {
  const mult = Number(merchant.system.merchant?.sellMultiplier ?? 0.5);
  return Math.max(0, Math.floor((Number(item.system.price) || 0) * mult));
}

/* -------------------------------------------- */
/*  Tokens & reach                              */
/* -------------------------------------------- */

/** Every TokenDocument representing this actor, across all scenes. */
export function actorTokens(actor) {
  if (!actor) return [];
  if (actor.isToken) return actor.token ? [actor.token] : [];
  const tokens = [];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink && (token.actorId === actor.id)) tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Distance in grid spaces between two tokens of the same scene, counting from
 * their edges: adjacent tokens are at distance 1.
 */
export function tokenDistance(a, b) {
  const size = a.parent.grid.size;
  const ax = a.x / size, ay = a.y / size, bx = b.x / size, by = b.y / size;
  const gapX = Math.max(0, bx - (ax + a.width), ax - (bx + b.width));
  const gapY = Math.max(0, by - (ay + a.height), ay - (by + b.height));
  return Math.round(Math.max(gapX, gapY)) + 1;
}

/**
 * Is any token of `actor` close enough to any token of the pile?
 * @param {Actor} pile
 * @param {Actor} actor
 */
export function isWithinReach(pile, actor) {
  const maxDistance = Number(pile.system.distance ?? 1);
  if (maxDistance < 0) return true;
  const pileTokens = actorTokens(pile);
  const tokens = actorTokens(actor);
  return pileTokens.some(p => tokens.some(t => (t.parent === p.parent) && (tokenDistance(p, t) <= maxDistance)));
}

/**
 * The character the current user is interacting with: their controlled token
 * first, their assigned character otherwise.
 * @returns {Actor|null}
 */
export function getInteractingActor() {
  const controlled = canvas.ready ? canvas.tokens.controlled : [];
  const fromToken = controlled.map(t => t.actor).find(a => a && !isPile(a) && a.isOwner);
  if (fromToken) return fromToken;
  const character = game.user.character;
  return (character && !isPile(character)) ? character : null;
}
