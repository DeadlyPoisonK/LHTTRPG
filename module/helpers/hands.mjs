/**
 * Hand slots of a character (Rules: "Dual Wielding").
 *
 * There is no hand field in the data: the hands are deduced from what is equipped.
 *  - Main hand: the equipped weapon with `system.main` (else the first equipped weapon). A
 *    [Two-Handed] weapon there also takes the off hand.
 *  - Off hand: the other equipped weapon ([One-Handed] only), or the equipped shield.
 * With a weapon in each hand the character attacks with the main one (its Attack / Magic Power and
 * Range) and adds the Accuracy and Initiative of both (see actor.mjs).
 */
import { findTag } from "./tag-catalog.mjs";
import { EQUIP_TYPES } from "../piles/pile-config.mjs";

/** Whether an item has the [Two-Handed] tag (any spelling). Items without a hand tag use one hand. */
export function isTwoHanded(item) {
  return (item?.system?.tags ?? []).some(t => findTag(t)?.label === "Two-Handed");
}

/**
 * What each hand holds.
 * @param {Actor} actor
 * @returns {{main: Item|null, off: Item|null, locked: boolean}}  locked: the main weapon is Two-Handed
 */
export function getHands(actor) {
  const weapons = actor?.items.filter(i => (i.type === "weapon") && i.system.equipped) ?? [];
  const main = weapons.find(w => w.system.main) ?? weapons[0] ?? null;
  const off = weapons.find(w => w !== main)
    ?? actor?.items.find(i => (i.type === "shield") && i.system.equipped) ?? null;
  return { main, off, locked: isTwoHanded(main) };
}

/** The weapon a character attacks with (main hand), or null. */
export function mainWeapon(actor) {
  return getHands(actor).main;
}

const L = (key, data) => data ? game.i18n.format(`LHTRPG.Hands.${key}`, data) : game.i18n.localize(`LHTRPG.Hands.${key}`);

/**
 * Updates that put `item` in a hand, or null (with a warning) when it can't go there.
 * @param {Actor} actor
 * @param {Item} item               A weapon or shield owned by the actor
 * @param {"main"|"off"} [hand]     Omitted: main hand if free, then off hand, else replace the main one
 * @returns {{updates: object[], notes: string[]}|null}
 */
export function planEquip(actor, item, hand) {
  const { main, off, locked } = getHands(actor);
  const twoHanded = isTwoHanded(item);

  if (!hand) {
    if (item.type === "shield") hand = "off";
    else if (!main || (main === item)) hand = "main";
    else if (!twoHanded && !locked && (!off || (off === item))) hand = "off";
    else hand = "main";
  }

  const changes = new Map();
  const set = (doc, data) => changes.set(doc.id, { ...(changes.get(doc.id) ?? {}), ...data });
  const unequip = doc => set(doc, { "system.equipped": false, ...(doc.type === "weapon" ? { "system.main": false } : {}) });
  const notes = [];

  if (hand === "main") {
    if (item.type !== "weapon") {
      ui.notifications.warn(L("Notif.ShieldOffHand", { item: item.name }));
      return null;
    }
    set(item, { "system.equipped": true, "system.main": true });
    // The previous main weapon moves to the off hand if it fits there (swap), else leaves.
    const otherOff = (off && (off !== item)) ? off : null;
    if (main && (main !== item)) {
      if ((off === item) && !twoHanded && !isTwoHanded(main)) set(main, { "system.main": false });
      else {
        unequip(main);
        notes.push(main.name);
      }
    }
    if (twoHanded && otherOff) {
      unequip(otherOff);
      notes.push(otherOff.name);
    }
  }
  else {
    if (twoHanded) {
      ui.notifications.warn(L("Notif.TwoHandedOffHand", { item: item.name }));
      return null;
    }
    if (locked && (main !== item)) {
      ui.notifications.warn(L("Notif.OffHandLocked", { item: item.name, weapon: main.name }));
      return null;
    }
    set(item, { "system.equipped": true, ...(item.type === "weapon" ? { "system.main": false } : {}) });
    if (off && (off !== item)) {
      // Moving the main weapon to the off hand: the off-hand weapon takes its place.
      if ((main === item) && (off.type === "weapon")) set(off, { "system.main": true });
      else {
        unequip(off);
        notes.push(off.name);
      }
    }
  }

  // Only one weapon is flagged as main.
  const newMain = [...changes].find(([, d]) => d["system.main"] === true)?.[0];
  if (newMain) {
    for (const w of actor.items) {
      if ((w.type === "weapon") && w.system.main && (w.id !== newMain)) {
        set(w, { "system.main": false });
      }
    }
  }

  const updates = [...changes].map(([_id, data]) => ({ _id, ...data }))
    .filter(u => Object.entries(u).some(([k, v]) => (k !== "_id") && (foundry.utils.getProperty(actor.items.get(u._id), k) !== v)));
  return { updates, notes };
}

/** Equip `item` in a hand (see planEquip) and warn about what went back to the inventory. */
export async function equipInHand(actor, item, hand) {
  const plan = planEquip(actor, item, hand);
  if (!plan) return false;
  if (plan.updates.length) await actor.updateEmbeddedDocuments("Item", plan.updates);
  if (plan.notes.length) ui.notifications.info(L("Notif.Unequipped", { items: plan.notes.join(", "), item: item.name }));
  return true;
}

/** Unequip a hand item; if it was the main weapon, the off-hand weapon becomes the main one. */
export async function unequipHand(actor, item) {
  const { main, off } = getHands(actor);
  const updates = [{ _id: item.id, "system.equipped": false, ...(item.type === "weapon" ? { "system.main": false } : {}) }];
  if ((item === main) && (off?.type === "weapon")) updates.push({ _id: off.id, "system.main": true });
  return actor.updateEmbeddedDocuments("Item", updates);
}

/** Swap the two equipped weapons between hands. */
export async function swapHands(actor) {
  const { main, off } = getHands(actor);
  if (!main || (off?.type !== "weapon")) return;
  return actor.updateEmbeddedDocuments("Item", [
    { _id: main.id, "system.main": false },
    { _id: off.id, "system.main": true }
  ]);
}

/**
 * One-time equipment fixes (setting `handsMigrationVersion`), on the active GM, over world
 * characters only (monsters and unlinked tokens are left alone):
 *  1. A [Two-Handed] main weapon with something in the off hand (the old sheet allowed a weapon
 *     and a shield at once): the off-hand item is unequipped.
 *  2. Items that aren't equipment (gear, potions…) marked as equipped, which the sheet hid: they
 *     go back to the inventory.
 */
export async function migrateHands() {
  const SETTING = "handsMigrationVersion";
  const VERSION = 2;
  const done = game.settings.get("lhtrpg", SETTING);
  if (!game.user.isActiveGM || (done >= VERSION)) return;
  const hands = [];
  const carried = [];
  for (const actor of game.actors.filter(a => a.type === "character")) {
    const updates = [];
    if (done < 1) {
      const { off, locked } = getHands(actor);
      if (locked && off) {
        updates.push({ _id: off.id, "system.equipped": false });
        hands.push(`${actor.name} (${off.name})`);
      }
    }
    const hidden = actor.items.filter(i => (i.system.equipped === true) && !EQUIP_TYPES.includes(i.type)
      && ("equipped" in (i._source.system ?? {})));
    for (const item of hidden) updates.push({ _id: item.id, "system.equipped": false });
    if (hidden.length) carried.push(`${actor.name} (${hidden.map(i => i.name).join(", ")})`);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
  await game.settings.set("lhtrpg", SETTING, VERSION);
  const messages = [];
  if (hands.length) messages.push(L("Notif.Migrated", { list: hands.join(", ") }));
  if (carried.length) messages.push(L("Notif.MigratedCarried", { list: carried.join("; ") }));
  for (const msg of messages) {
    ui.notifications.warn(msg, { permanent: true });
    console.warn(`lhtrpg | ${msg}`);
  }
}

export function registerHandsSettings() {
  game.settings.register("lhtrpg", "handsMigrationVersion", {
    scope: "world", config: false, type: Number, default: 0
  });
}
