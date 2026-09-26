/**
 * GM-side pile operations. Every handler receives the requesting user and
 * validates that they're allowed to perform the action before touching any
 * document. Handlers return {ok, error?, errorData?, warnings?}.
 */
import { registerHandler } from "./pile-socket.mjs";
import { DEFAULT_IMAGES, DEFAULT_LOOT_FLAG, SETTINGS, STOCK_FLAG } from "./pile-config.mjs";
import {
  isPile, isMerchant, isPhysical, getGold, goldPath, resolveActor, itemQuantity, getStock,
  hasRoomFor, buyPrice, sellPrice, isWithinReach, actorTokens
} from "./pile-utils.mjs";

export function registerOperations() {
  registerHandler("transferItem", transferItem);
  registerHandler("takeAll", takeAll);
  registerHandler("transferGold", transferGold);
  registerHandler("dropItem", dropItem);
  registerHandler("setChestState", setChestState);
  registerHandler("buyItem", buyItem);
  registerHandler("sellItem", sellItem);
  registerHandler("splitGold", splitGold);
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const fail = (error, errorData = {}) => ({ ok: false, error, errorData });

function owns(user, actor) {
  return user.isGM || actor.testUserPermission(user, "OWNER");
}

function pileName(pile) {
  return pile.token?.name ?? pile.name;
}

/**
 * Can `actor` (controlled by `user`) interact with the pile right now?
 * @returns {object|null}   A failure result, or null when access is granted.
 */
function checkAccess(user, pile, actor) {
  if (user.isGM) return null;
  const system = pile.system;
  if ((system.mode === "chest") && system.chest?.closed) return fail("LHTRPG.Piles.Error.Closed", { pile: pileName(pile) });
  if ((system.mode === "merchant") && !system.merchant?.open) return fail("LHTRPG.Piles.Error.MerchantClosed", { pile: pileName(pile) });
  if (!isWithinReach(pile, actor)) return fail("LHTRPG.Piles.Error.TooFar", { pile: pileName(pile) });
  return null;
}

async function log(key, data, icon = "fa-sack") {
  if (!game.settings.get("lhtrpg", SETTINGS.chatLog)) return;
  const text = game.i18n.format(key, data);
  await ChatMessage.create({
    content: `<div class="lhtrpg-pile-log"><i class="fas ${icon}"></i> ${text}</div>`,
    speaker: { alias: game.i18n.localize("LHTRPG.Piles.ChatAlias") }
  });
}

/** Item data ready to be created on another actor. */
function prepareItemData(item, quantity, { keepStock = false } = {}) {
  const data = item.toObject();
  delete data._id;
  if ("equipped" in data.system) data.system.equipped = false;
  if (item.type === "ticket") data.system.quantity = quantity;
  if (!keepStock && data.flags?.lhtrpg) delete data.flags.lhtrpg[STOCK_FLAG];
  return data;
}

function clampQuantity(item, quantity) {
  const available = itemQuantity(item);
  if (item.type !== "ticket") return 1;
  return Math.clamp(Math.floor(Number(quantity) || available), 1, Math.max(available, 1));
}

/** Remove `quantity` units of an item from its actor. */
async function removeQuantity(item, quantity) {
  const available = itemQuantity(item);
  if ((item.type === "ticket") && (quantity < available)) {
    await item.update({ "system.quantity": available - quantity });
  }
  else await item.delete();
}

/**
 * Move an item (or part of a ticket stack) from its actor to another one,
 * respecting the target's inventory space.
 */
async function moveItem(item, target, quantity) {
  const qty = clampQuantity(item, quantity);
  if (!hasRoomFor(target, item)) return fail("LHTRPG.Piles.Error.InventoryFull", { actor: target.name, item: item.name });
  const [created] = await target.createEmbeddedDocuments("Item", [prepareItemData(item, qty, { keepStock: isMerchant(target) })]);
  await removeQuantity(item, qty);
  return { ok: true, createdItemId: created?.id ?? null, quantity: qty };
}

/** Delete the tokens of a pile flagged to disappear once it's empty. */
async function cleanupPile(pile) {
  if (!isPile(pile) || isMerchant(pile) || !pile.system.deleteWhenEmpty) return;
  if (pile.items.size || getGold(pile)) return;
  for (const token of actorTokens(pile)) await token.delete();
}

function itemLabel(item, quantity) {
  return (item.type === "ticket") ? `${item.name} ×${quantity}` : item.name;
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

async function transferItem({ sourceUuid, itemId, targetUuid, quantity }, user) {
  const source = await resolveActor(sourceUuid);
  const target = await resolveActor(targetUuid);
  const item = source?.items.get(itemId);
  if (!source || !target || !item || (source.uuid === target.uuid)) return fail("LHTRPG.Piles.Error.Generic");
  if (!isPhysical(item)) return fail("LHTRPG.Piles.Error.NotPhysical", { item: item.name });

  if (!user.isGM) {
    if (isMerchant(source) || isMerchant(target)) return fail("LHTRPG.Piles.Error.NoPermission");
    if (isPile(source)) {
      if (!owns(user, target)) return fail("LHTRPG.Piles.Error.NoPermission");
      const denied = checkAccess(user, source, target);
      if (denied) return denied;
    }
    else {
      if (!owns(user, source)) return fail("LHTRPG.Piles.Error.NoPermission");
      if (isPile(target)) {
        const denied = checkAccess(user, target, source);
        if (denied) return denied;
      }
    }
  }

  const name = item.name;
  const type = item.type;
  const result = await moveItem(item, target, quantity);
  if (!result.ok) return result;

  const label = itemLabel({ name, type }, result.quantity);
  if (isPile(source)) await log("LHTRPG.Piles.Log.Take", { actor: target.name, item: label, pile: pileName(source) });
  else if (isPile(target)) await log("LHTRPG.Piles.Log.Deposit", { actor: source.name, item: label, pile: pileName(target) });
  else await log("LHTRPG.Piles.Log.Give", { actor: source.name, item: label, target: target.name }, "fa-hand-holding");

  await cleanupPile(source);
  return result;
}

async function takeAll({ pileUuid, targetUuid }, user) {
  const pile = await resolveActor(pileUuid);
  const target = await resolveActor(targetUuid);
  if (!isPile(pile) || !target || isPile(target)) return fail("LHTRPG.Piles.Error.Generic");
  if (!user.isGM && (isMerchant(pile) || !owns(user, target))) return fail("LHTRPG.Piles.Error.NoPermission");
  const denied = checkAccess(user, pile, target);
  if (denied) return denied;

  const taken = [];
  const left = [];
  for (const item of pile.items.contents.filter(isPhysical)) {
    const name = item.name;
    const type = item.type;
    const result = await moveItem(item, target, itemQuantity(item));
    if (result.ok) taken.push(itemLabel({ name, type }, result.quantity));
    else left.push(name);
  }

  const gold = getGold(pile);
  if (gold) {
    await pile.update({ [goldPath(pile)]: 0 });
    await target.update({ [goldPath(target)]: getGold(target) + gold });
    taken.push(`${gold} ${game.i18n.localize("LHTRPG.Piles.Gold")}`);
  }

  if (taken.length) await log("LHTRPG.Piles.Log.Take", { actor: target.name, item: taken.join(", "), pile: pileName(pile) });
  const warnings = left.length ? [{ key: "LHTRPG.Piles.Warn.InventoryFullLeft", data: { actor: target.name, items: left.join(", ") } }] : [];
  await cleanupPile(pile);
  return { ok: true, warnings };
}

/* -------------------------------------------- */
/*  Gold                                        */
/* -------------------------------------------- */

async function transferGold({ sourceUuid, targetUuid, amount }, user) {
  const source = await resolveActor(sourceUuid);
  const target = await resolveActor(targetUuid);
  if (!source || !target || (source.uuid === target.uuid)) return fail("LHTRPG.Piles.Error.Generic");

  if (!user.isGM) {
    if (isMerchant(source) || isMerchant(target)) return fail("LHTRPG.Piles.Error.NoPermission");
    if (isPile(source)) {
      if (!owns(user, target)) return fail("LHTRPG.Piles.Error.NoPermission");
      const denied = checkAccess(user, source, target);
      if (denied) return denied;
    }
    else {
      if (!owns(user, source)) return fail("LHTRPG.Piles.Error.NoPermission");
      if (isPile(target)) {
        const denied = checkAccess(user, target, source);
        if (denied) return denied;
      }
    }
  }

  const value = Math.floor(Number(amount) || 0);
  if (value <= 0) return fail("LHTRPG.Piles.Error.InvalidAmount");
  if (value > getGold(source)) return fail("LHTRPG.Piles.Error.NotEnoughGold", { actor: source.name });

  await source.update({ [goldPath(source)]: getGold(source) - value });
  await target.update({ [goldPath(target)]: getGold(target) + value });

  const item = `${value} ${game.i18n.localize("LHTRPG.Piles.Gold")}`;
  if (isPile(source)) await log("LHTRPG.Piles.Log.Take", { actor: target.name, item, pile: pileName(source) });
  else if (isPile(target)) await log("LHTRPG.Piles.Log.Deposit", { actor: source.name, item, pile: pileName(target) });
  else await log("LHTRPG.Piles.Log.Give", { actor: source.name, item, target: target.name }, "fa-coins");

  await cleanupPile(source);
  return { ok: true };
}

async function splitGold({ pileUuid, actorUuid }, user) {
  const pile = await resolveActor(pileUuid);
  const actor = await resolveActor(actorUuid);
  if (!isPile(pile) || isMerchant(pile)) return fail("LHTRPG.Piles.Error.Generic");
  if (!user.isGM) {
    if (!actor || !owns(user, actor)) return fail("LHTRPG.Piles.Error.NoPermission");
    const denied = checkAccess(user, pile, actor);
    if (denied) return denied;
  }

  // The party: characters assigned to the players currently connected.
  const party = [...new Set(game.users.filter(u => u.active && !u.isGM && u.character).map(u => u.character))]
    .filter(a => a.type === "character");
  if (!party.length) return fail("LHTRPG.Piles.Error.NoParty");

  const gold = getGold(pile);
  const share = Math.floor(gold / party.length);
  if (share <= 0) return fail("LHTRPG.Piles.Error.NotEnoughGold", { actor: pileName(pile) });

  for (const member of party) await member.update({ [goldPath(member)]: getGold(member) + share });
  await pile.update({ [goldPath(pile)]: gold - (share * party.length) });

  await log("LHTRPG.Piles.Log.Split", { gold: share, actors: party.map(a => a.name).join(", "), pile: pileName(pile) }, "fa-coins");
  await cleanupPile(pile);
  return { ok: true };
}

/* -------------------------------------------- */
/*  Canvas drops                                */
/* -------------------------------------------- */

/** The world actor used as base for the loot piles created by dropping items. */
async function getDefaultLootActor() {
  const existing = game.actors.find(a => a.getFlag("lhtrpg", DEFAULT_LOOT_FLAG));
  if (existing) return existing;
  const name = game.i18n.localize("LHTRPG.Piles.DefaultLootName");
  return Actor.implementation.create({
    name,
    type: "pile",
    img: DEFAULT_IMAGES.loot,
    system: { mode: "loot", deleteWhenEmpty: true },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED },
    prototypeToken: { name, actorLink: false, texture: { src: DEFAULT_IMAGES.loot } },
    flags: { lhtrpg: { [DEFAULT_LOOT_FLAG]: true } }
  });
}

function tokenContains(token, x, y) {
  const size = token.parent.grid.size;
  return (x >= token.x) && (x < token.x + (token.width * size)) && (y >= token.y) && (y < token.y + (token.height * size));
}

async function dropItem({ sourceUuid, itemId, itemUuid, quantity, sceneId, x, y }, user) {
  const scene = game.scenes.get(sceneId);
  if (!scene) return fail("LHTRPG.Piles.Error.Generic");

  let source = null;
  let item;
  if (sourceUuid) {
    source = await resolveActor(sourceUuid);
    item = source?.items.get(itemId);
    if (!source || !item) return fail("LHTRPG.Piles.Error.Generic");
    if (!user.isGM && (!owns(user, source) || isPile(source))) return fail("LHTRPG.Piles.Error.NoPermission");
  }
  else {
    // Items from the sidebar or a compendium: only the GM can conjure them.
    if (!user.isGM) return fail("LHTRPG.Piles.Error.NoPermission");
    item = await fromUuid(itemUuid);
  }
  if (!item) return fail("LHTRPG.Piles.Error.Generic");
  if (!isPhysical(item)) return fail("LHTRPG.Piles.Error.NotPhysical", { item: item.name });

  const qty = source ? clampQuantity(item, quantity) : itemQuantity(item) || 1;
  const label = itemLabel(item, qty);
  const who = source?.name ?? user.name;

  // Dropped over an existing pile: put it inside.
  const existing = scene.tokens.find(t => isPile(t.actor) && !isMerchant(t.actor) && tokenContains(t, x, y));
  if (existing) {
    const pile = existing.actor;
    if (source) {
      const denied = checkAccess(user, pile, source);
      if (denied) return denied;
      const result = await moveItem(item, pile, qty);
      if (result.ok) await log("LHTRPG.Piles.Log.Deposit", { actor: who, item: label, pile: pileName(pile) });
      return result;
    }
    await pile.createEmbeddedDocuments("Item", [prepareItemData(item, qty)]);
    return { ok: true };
  }

  // Otherwise, a new loot pile on the floor.
  const base = await getDefaultLootActor();
  const point = scene.grid.getTopLeftPoint({ x, y });
  const tokenData = (await base.getTokenDocument({ x: point.x, y: point.y, actorLink: false })).toObject();
  const itemData = prepareItemData(item, qty);
  itemData._id = foundry.utils.randomID();
  tokenData.delta = { system: { mode: "loot", deleteWhenEmpty: true }, items: [itemData] };
  await scene.createEmbeddedDocuments("Token", [tokenData]);

  if (source) await removeQuantity(item, qty);
  await log("LHTRPG.Piles.Log.Drop", { actor: who, item: label });
  return { ok: true };
}

/* -------------------------------------------- */
/*  Chests                                      */
/* -------------------------------------------- */

async function setChestState({ pileUuid, actorUuid, closed }, user) {
  const pile = await resolveActor(pileUuid);
  if (!isPile(pile) || (pile.system.mode !== "chest")) return fail("LHTRPG.Piles.Error.Generic");
  if (!user.isGM) {
    const actor = await resolveActor(actorUuid);
    if (!actor || !owns(user, actor)) return fail("LHTRPG.Piles.Error.NoPermission");
    if (pile.system.chest?.locked) return fail("LHTRPG.Piles.Error.Locked", { pile: pileName(pile) });
    if (!isWithinReach(pile, actor)) return fail("LHTRPG.Piles.Error.TooFar", { pile: pileName(pile) });
  }
  await pile.update({ "system.chest.closed": !!closed });
  return { ok: true };
}

/* -------------------------------------------- */
/*  Merchants                                   */
/* -------------------------------------------- */

async function buyItem({ merchantUuid, itemId, buyerUuid, quantity }, user) {
  const merchant = await resolveActor(merchantUuid);
  const buyer = await resolveActor(buyerUuid);
  const item = merchant?.items.get(itemId);
  if (!isMerchant(merchant) || !buyer || !item || isPile(buyer)) return fail("LHTRPG.Piles.Error.Generic");
  if (!owns(user, buyer)) return fail("LHTRPG.Piles.Error.NoPermission");
  const denied = checkAccess(user, merchant, buyer);
  if (denied) return denied;

  const stock = getStock(item);
  const wanted = (item.type === "ticket") ? Math.max(1, Math.floor(Number(quantity) || 1)) : 1;
  if ((stock !== -1) && (stock < wanted)) return fail("LHTRPG.Piles.Error.OutOfStock", { item: item.name });
  if (!hasRoomFor(buyer, item)) return fail("LHTRPG.Piles.Error.InventoryFull", { actor: buyer.name, item: item.name });

  const cost = buyPrice(merchant, item) * wanted;
  if (cost > getGold(buyer)) return fail("LHTRPG.Piles.Error.NotEnoughGold", { actor: buyer.name });

  await buyer.createEmbeddedDocuments("Item", [prepareItemData(item, wanted)]);
  await buyer.update({ [goldPath(buyer)]: getGold(buyer) - cost });
  if (!merchant.system.merchant?.infiniteGold) await merchant.update({ [goldPath(merchant)]: getGold(merchant) + cost });
  if (stock !== -1) await item.setFlag("lhtrpg", STOCK_FLAG, stock - wanted);

  await log("LHTRPG.Piles.Log.Buy", { actor: buyer.name, item: itemLabel(item, wanted), gold: cost, pile: pileName(merchant) }, "fa-coins");
  return { ok: true };
}

async function sellItem({ merchantUuid, sellerUuid, itemId, quantity }, user) {
  const merchant = await resolveActor(merchantUuid);
  const seller = await resolveActor(sellerUuid);
  const item = seller?.items.get(itemId);
  if (!isMerchant(merchant) || !seller || !item || isPile(seller)) return fail("LHTRPG.Piles.Error.Generic");
  if (!owns(user, seller)) return fail("LHTRPG.Piles.Error.NoPermission");
  if (!isPhysical(item)) return fail("LHTRPG.Piles.Error.NotPhysical", { item: item.name });
  if (!merchant.system.merchant?.acceptsSales && !user.isGM) return fail("LHTRPG.Piles.Error.NoSales", { pile: pileName(merchant) });
  const denied = checkAccess(user, merchant, seller);
  if (denied) return denied;

  const qty = clampQuantity(item, quantity);
  const earned = sellPrice(merchant, item) * qty;
  const infiniteGold = !!merchant.system.merchant?.infiniteGold;
  if (!infiniteGold && (earned > getGold(merchant))) return fail("LHTRPG.Piles.Error.MerchantNoGold", { pile: pileName(merchant) });

  // Only merchants set to resell what they buy put the item up for sale, and
  // always with a limited stock (the units sold), never an infinite one.
  // Otherwise the item is simply gone once paid for.
  if (merchant.system.merchant?.resellSold) {
    const entry = merchant.items.find(i => (i.name === item.name) && (i.type === item.type));
    if (entry) {
      const stock = getStock(entry);
      if (stock !== -1) await entry.setFlag("lhtrpg", STOCK_FLAG, stock + qty);
    }
    else {
      const data = prepareItemData(item, 1);
      foundry.utils.setProperty(data, `flags.lhtrpg.${STOCK_FLAG}`, qty);
      await merchant.createEmbeddedDocuments("Item", [data]);
    }
  }

  const label = itemLabel(item, qty);
  await removeQuantity(item, qty);
  await seller.update({ [goldPath(seller)]: getGold(seller) + earned });
  if (!infiniteGold) await merchant.update({ [goldPath(merchant)]: getGold(merchant) - earned });

  await log("LHTRPG.Piles.Log.Sell", { actor: seller.name, item: label, gold: earned, pile: pileName(merchant) }, "fa-coins");
  return { ok: true };
}
