/**
 * Client-side pile API. Every call goes through the GM (see pile-socket.mjs)
 * and reports its outcome to the user with notifications.
 * Exposed as `game.lhtrpg.piles`.
 */
import { request } from "./pile-socket.mjs";
import { convertDialog, convertActorToPile } from "./pile-convert.mjs";
import { SOUNDS } from "./pile-config.mjs";
import {
  isPile, isMerchant, isPhysical, getGold, itemQuantity, getInteractingActor, isWithinReach,
  buyPrice, sellPrice
} from "./pile-utils.mjs";

const { DialogV2 } = foundry.applications.api;

/* -------------------------------------------- */
/*  Feedback                                    */
/* -------------------------------------------- */

function notify(result) {
  if (!result) return false;
  if (!result.ok) ui.notifications.warn(game.i18n.format(result.error ?? "LHTRPG.Piles.Error.Generic", result.errorData ?? {}));
  for (const w of result.warnings ?? []) ui.notifications.warn(game.i18n.format(w.key, w.data ?? {}));
  return !!result.ok;
}

function playSound(src) {
  foundry.audio.AudioHelper.play({ src, volume: 0.6, autoplay: true, loop: false }, false);
}

/** The character acting on a pile, or a warning when there's none. */
export function requireInteractingActor() {
  const actor = getInteractingActor();
  if (!actor) ui.notifications.warn(game.i18n.localize("LHTRPG.Piles.Error.NoActor"));
  return actor;
}

/* -------------------------------------------- */
/*  Dialogs                                     */
/* -------------------------------------------- */

/**
 * Ask for a quantity between 1 and max. Resolves immediately to 1 when max is 1.
 * @returns {Promise<number|null>}
 */
export async function promptQuantity(title, max, { label, initial } = {}) {
  if (max <= 1) return 1;
  const value = initial ?? max;
  const data = await DialogV2.input({
    window: { title },
    content: `<div class="form-group"><label>${label ?? game.i18n.localize("LHTRPG.Piles.Quantity")}</label>
      <input type="number" name="quantity" min="1" max="${max}" step="1" value="${value}" autofocus></div>`,
    ok: { label: game.i18n.localize("LHTRPG.Piles.Confirm") }
  });
  if (!data) return null;
  const qty = Math.floor(Number(data.quantity) || 0);
  return (qty >= 1) ? Math.min(qty, max) : null;
}

/** Ask for an amount of gold between 1 and max. */
export async function promptGold(title, max) {
  if (max <= 0) {
    ui.notifications.warn(game.i18n.localize("LHTRPG.Piles.Error.NoGold"));
    return null;
  }
  const data = await DialogV2.input({
    window: { title },
    content: `<div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.GoldLabel")} (${game.i18n.format("LHTRPG.Piles.Max", { max })})</label>
      <input type="number" name="amount" min="1" max="${max}" step="1" value="${max}" autofocus></div>`,
    ok: { label: game.i18n.localize("LHTRPG.Piles.Confirm") }
  });
  if (!data) return null;
  const amount = Math.floor(Number(data.amount) || 0);
  return (amount >= 1) ? Math.min(amount, max) : null;
}

/** Characters that can receive a gift from `giver`: the other player characters. */
function giftTargets(giver) {
  return game.actors.filter(a => (a.type === "character") && (a.id !== giver.id) && a.hasPlayerOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function promptTarget(title, giver, { gold = false, item = null } = {}) {
  const targets = giftTargets(giver);
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("LHTRPG.Piles.Error.NoTargets"));
    return null;
  }
  const options = targets.map(a => `<option value="${a.uuid}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
  const max = gold ? getGold(giver) : (item ? itemQuantity(item) : 1);
  let extra = "";
  if (gold) extra = `<div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.GoldLabel")} (${game.i18n.format("LHTRPG.Piles.Max", { max })})</label>
      <input type="number" name="amount" min="1" max="${max}" step="1" value="${max}"></div>`;
  else if (max > 1) extra = `<div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.Quantity")}</label>
      <input type="number" name="amount" min="1" max="${max}" step="1" value="${max}"></div>`;
  const data = await DialogV2.input({
    window: { title },
    content: `<div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.GiveTo")}</label>
      <select name="target">${options}</select></div>${extra}`,
    ok: { label: game.i18n.localize("LHTRPG.Piles.Give") }
  });
  if (!data?.target) return null;
  const amount = Math.floor(Number(data.amount ?? 1) || 0);
  if (amount < 1) return null;
  return { targetUuid: data.target, amount: Math.min(amount, Math.max(max, 1)) };
}

/* -------------------------------------------- */
/*  Items & gold                                */
/* -------------------------------------------- */

/**
 * Move an item to another actor (take from a pile, deposit into one, give to
 * another player...). Tickets ask how many units to move.
 * @returns {Promise<object|null>} The GM result, or null if cancelled/failed.
 */
export async function transferItem(item, target, { quantity, ask = true } = {}) {
  const source = item.parent;
  if (!source || !target) return null;
  if (!isPhysical(item)) {
    ui.notifications.warn(game.i18n.format("LHTRPG.Piles.Error.NotPhysical", { item: item.name }));
    return null;
  }
  let qty = quantity;
  if ((qty === undefined) && ask) {
    qty = await promptQuantity(item.name, itemQuantity(item));
    if (qty === null) return null;
  }
  const result = await request("transferItem", { sourceUuid: source.uuid, itemId: item.id, targetUuid: target.uuid, quantity: qty });
  return notify(result) ? result : null;
}

export async function takeAll(pile, actor = requireInteractingActor()) {
  if (!actor) return false;
  return notify(await request("takeAll", { pileUuid: pile.uuid, targetUuid: actor.uuid }));
}

export async function transferGold(source, target, amount, { title } = {}) {
  if (amount === undefined) {
    amount = await promptGold(title ?? game.i18n.localize("LHTRPG.Piles.GoldLabel"), getGold(source));
    if (!amount) return false;
  }
  return notify(await request("transferGold", { sourceUuid: source.uuid, targetUuid: target.uuid, amount }));
}

export async function splitGold(pile, actor = getInteractingActor()) {
  return notify(await request("splitGold", { pileUuid: pile.uuid, actorUuid: actor?.uuid }));
}

/** "Give to…" button on a character sheet item. */
export async function giveItem(item) {
  const giver = item.parent;
  const choice = await promptTarget(game.i18n.format("LHTRPG.Piles.GiveItemTitle", { item: item.name }), giver, { item });
  if (!choice) return false;
  const target = await fromUuid(choice.targetUuid);
  return !!(await transferItem(item, target, { quantity: choice.amount }));
}

/** "Give gold" button on a character sheet. */
export async function giveGold(giver) {
  if (getGold(giver) <= 0) {
    ui.notifications.warn(game.i18n.localize("LHTRPG.Piles.Error.NoGold"));
    return false;
  }
  const choice = await promptTarget(game.i18n.localize("LHTRPG.Piles.GiveGoldTitle"), giver, { gold: true });
  if (!choice) return false;
  const target = await fromUuid(choice.targetUuid);
  return transferGold(giver, target, choice.amount);
}

/* -------------------------------------------- */
/*  Chests                                      */
/* -------------------------------------------- */

export async function setChestState(pile, closed) {
  const actor = game.user.isGM ? null : requireInteractingActor();
  if (!game.user.isGM && !actor) return false;
  const ok = notify(await request("setChestState", { pileUuid: pile.uuid, actorUuid: actor?.uuid, closed }));
  if (ok) playSound(SOUNDS.chest);
  return ok;
}

/* -------------------------------------------- */
/*  Merchants                                   */
/* -------------------------------------------- */

export async function buyItem(merchant, item, buyer = requireInteractingActor()) {
  if (!buyer) return false;
  const unit = buyPrice(merchant, item);
  let qty = 1;
  if (item.type === "ticket") {
    const stock = item.getFlag("lhtrpg", "stock");
    const byGold = unit > 0 ? Math.floor(getGold(buyer) / unit) : 99;
    const max = Math.max(1, Math.min(byGold, (stock === undefined || stock === -1) ? 99 : stock));
    qty = await promptQuantity(item.name, max, { initial: 1 });
    if (!qty) return false;
  }
  const ok = notify(await request("buyItem", { merchantUuid: merchant.uuid, itemId: item.id, buyerUuid: buyer.uuid, quantity: qty }));
  if (ok) playSound(SOUNDS.coins);
  return ok;
}

export async function sellItem(merchant, item) {
  const seller = item.parent;
  const qty = await promptQuantity(item.name, itemQuantity(item));
  if (!qty) return false;
  const earned = sellPrice(merchant, item) * qty;
  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.localize("LHTRPG.Piles.Sell") },
    content: `<p>${game.i18n.format("LHTRPG.Piles.SellConfirm", { item: item.name, quantity: qty, gold: earned })}</p>`
  });
  if (!confirmed) return false;
  const ok = notify(await request("sellItem", { merchantUuid: merchant.uuid, sellerUuid: seller.uuid, itemId: item.id, quantity: qty }));
  if (ok) playSound(SOUNDS.coins);
  return ok;
}

/* -------------------------------------------- */
/*  Opening piles                               */
/* -------------------------------------------- */

/**
 * Open a pile for the current user, checking the interaction distance first.
 * The GM always opens the full sheet.
 * @param {Actor} pile
 */
export function openPile(pile) {
  if (!game.user.isGM) {
    const actor = requireInteractingActor();
    if (!actor) return;
    if (!isWithinReach(pile, actor)) {
      ui.notifications.warn(game.i18n.format("LHTRPG.Piles.Error.TooFar", { pile: pile.token?.name ?? pile.name }));
      return;
    }
  }
  const sheet = pile.sheet;
  if (sheet.rendered) sheet.bringToFront();
  else sheet.render(true);
}

/* -------------------------------------------- */
/*  Canvas drops                                */
/* -------------------------------------------- */

/**
 * Items dropped onto the canvas become (or join) a loot pile.
 * @returns {boolean|void} false when the drop was handled here.
 */
export function onDropCanvasData(canvasBoard, data) {
  if (data.type !== "Item" || !data.uuid) return;
  const item = fromUuidSync(data.uuid);
  const parent = item?.parent ?? null;
  // Only physical items, and players only from actors they own.
  if (item && !isPhysical(item)) return;
  if (!game.user.isGM && (!(parent instanceof Actor) || !parent.isOwner || isPile(parent))) return;

  _dropItem(data, item, parent);
  return false;
}

async function _dropItem(data, item, parent) {
  let quantity = 1;
  if (item && parent) {
    quantity = await promptQuantity(item.name, itemQuantity(item));
    if (!quantity) return;
  }
  const payload = { sceneId: canvas.scene.id, x: data.x, y: data.y, quantity };
  if (parent instanceof Actor) Object.assign(payload, { sourceUuid: parent.uuid, itemId: item.id });
  else payload.itemUuid = data.uuid;
  notify(await request("dropItem", payload));
}

export const PilesAPI = {
  convertDialog, convertActorToPile,
  transferItem, takeAll, transferGold, splitGold, giveItem, giveGold,
  setChestState, buyItem, sellItem, openPile, getInteractingActor, isPile, isMerchant
};
