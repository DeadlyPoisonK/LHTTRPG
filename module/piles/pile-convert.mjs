/**
 * Convert an existing actor (e.g. a character or monster set up as an Item
 * Piles pile, merchant, container or vault) into a system pile, keeping its
 * id, items, gold, image, tokens and permissions. Stats are dropped.
 *
 * Usage (macro): game.lhtrpg.piles.convertDialog()
 */
import { PILE_MODES, PILE_TYPE, PHYSICAL_TYPES, STOCK_FLAG } from "./pile-config.mjs";
import { itemQuantity } from "./pile-utils.mjs";

const { DialogV2 } = foundry.applications.api;

// Item Piles pile type -> system pile mode.
const ITEM_PILES_MODES = { pile: "loot", merchant: "merchant", container: "chest", vault: "chest" };

function itemPilesData(doc) {
  return doc?.flags?.["item-piles"]?.data ?? {};
}

/** Suggested mode for an actor, from its Item Piles configuration. */
export function suggestedMode(actor) {
  return ITEM_PILES_MODES[itemPilesData(actor).type] ?? "loot";
}

function itemPilesDeleteWhenEmpty(ip) {
  if (typeof ip.deleteWhenEmpty === "boolean") return ip.deleteWhenEmpty;
  try { return !!game.settings.get("item-piles", "deleteEmptyPiles"); }
  catch { return false; }
}

/**
 * The pile system data for a mode, taking what it can from Item Piles.
 * @param {string} mode
 * @param {object} ip       Item Piles data (actor, merged with token data)
 * @param {object} extra    gold / description
 */
function buildSystem(mode, ip, { gold = 0, description = "" } = {}) {
  const system = {
    mode,
    gold: Math.max(0, Math.floor(Number(gold) || 0)),
    description: ip.description || description || "",
    distance: Number.isFinite(ip.distance) ? ip.distance : 1,
    deleteWhenEmpty: (mode === "loot") ? itemPilesDeleteWhenEmpty(ip) : false,
    chest: {
      closed: !!ip.closed,
      locked: !!ip.locked,
      imgClosed: ip.closedImage || "icons/containers/chest/chest-reinforced-steel-brown.webp",
      imgOpen: ip.openedImage || ""
    },
    merchant: {
      open: ip.openTimes?.enabled ? !!ip.openTimes?.status : true,
      acceptsSales: ip.purchaseOnly !== true,
      resellSold: false,
      infiniteGold: ip.infiniteCurrencies ?? true,
      buyMultiplier: Number.isFinite(ip.buyPriceModifier) ? ip.buyPriceModifier : 1,
      sellMultiplier: Number.isFinite(ip.sellPriceModifier) ? ip.sellPriceModifier : 0.5
    }
  };
  return system;
}

/** Item changes for a pile: drop non-physical items, unequip, merchant stock. */
function itemChanges(items, mode, ip, dropNonPhysical) {
  const deletions = [];
  const updates = [];
  const infinite = ip.infiniteQuantity !== false;
  for (const item of items) {
    if (!PHYSICAL_TYPES.includes(item.type)) {
      if (dropNonPhysical) deletions.push(item.id);
      continue;
    }
    const update = { _id: item.id, "system.equipped": false };
    if (item.flags?.["item-piles"]) update["flags.-=item-piles"] = null;
    if (mode === "merchant") update[`flags.lhtrpg.${STOCK_FLAG}`] = infinite ? -1 : itemQuantity(item);
    updates.push(update);
  }
  return { deletions, updates };
}

/**
 * Convert a world actor into a pile.
 * @param {Actor} actor
 * @param {object} options
 * @param {string} options.mode              loot | chest | merchant
 * @param {boolean} [options.dropNonPhysical=true]  Delete skills, connections, unions...
 * @returns {Promise<{items: number, dropped: number, tokens: number}>}
 */
export async function convertActorToPile(actor, { mode, dropNonPhysical = true } = {}) {
  if (!game.user.isGM) throw new Error("Only the GM can convert actors.");
  if (!(mode in PILE_MODES)) throw new Error(`Invalid pile mode "${mode}".`);
  const ip = itemPilesData(actor);
  const source = actor.toObject();

  // 1. The actor itself: new type and system data, keeping everything else.
  const system = buildSystem(mode, ip, {
    gold: source.system?.inventory?.gold ?? source.system?.gold ?? 0,
    description: source.system?.biography ?? source.system?.description ?? ""
  });
  const LIMITED = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
  await actor.update({
    type: PILE_TYPE,
    "==system": system,
    "ownership.default": Math.max(actor.ownership.default ?? 0, LIMITED),
    "flags.lhtrpg.preConversion": { type: source.type, system: source.system, itemPiles: source.flags?.["item-piles"] ?? null }
  });
  if (actor.flags?.["item-piles"]) await actor.update({ "flags.-=item-piles": null });

  // Piles can't hold effects of their own (old statuses, buffs...).
  if (actor.effects.size) await actor.deleteEmbeddedDocuments("ActiveEffect", actor.effects.map(e => e.id));

  const { deletions, updates } = itemChanges(actor.items, mode, ip, dropNonPhysical);
  if (deletions.length) await actor.deleteEmbeddedDocuments("Item", deletions);
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

  // 2. Unlinked tokens keep their own contents: migrate each delta.
  let tokens = 0;
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if ((token.actorId !== actor.id) || token.actorLink || !token.actor) continue;
      await convertTokenDelta(token, mode, ip, dropNonPhysical);
      tokens++;
    }
  }

  return { items: updates.length, dropped: deletions.length, tokens };
}

/** Migrate the delta of an unlinked token whose base actor became a pile. */
async function convertTokenDelta(token, mode, baseIp, dropNonPhysical) {
  const delta = token.delta;
  const deltaSource = delta.toObject();
  const tokenIp = deltaSource.flags?.["item-piles"]?.data ?? {};
  const ip = { ...baseIp, ...tokenIp };
  const tokenMode = tokenIp.type ? (ITEM_PILES_MODES[tokenIp.type] ?? mode) : mode;
  const gold = deltaSource.system?.inventory?.gold;

  // Clean the old per-token data (character/monster fields, Item Piles flags).
  const cleanup = {};
  for (const key of Object.keys(deltaSource.system ?? {})) cleanup[`system.-=${key}`] = null;
  if (deltaSource.flags?.["item-piles"]) cleanup["flags.-=item-piles"] = null;
  if (!foundry.utils.isEmpty(cleanup)) await delta.update(cleanup);

  // Per-token pile settings, only where they differ from the base actor.
  const changes = {};
  if (gold !== undefined) changes["system.gold"] = Math.max(0, Math.floor(Number(gold) || 0));
  if (tokenMode !== mode) changes["system.mode"] = tokenMode;
  if (tokenIp.type) {
    const system = buildSystem(tokenMode, ip);
    changes["system.deleteWhenEmpty"] = system.deleteWhenEmpty;
    if (tokenMode === "chest") changes["system.chest"] = system.chest;
  }
  if (!foundry.utils.isEmpty(changes)) await token.actor.update(changes);

  const ownEffects = token.actor.effects.filter(e => delta.effects.has(e.id)).map(e => e.id);
  if (ownEffects.length) await token.actor.deleteEmbeddedDocuments("ActiveEffect", ownEffects);

  // Only the token's own items: the base actor's were already migrated.
  const ownItems = token.actor.items.filter(i => delta.items.has(i.id));
  const { deletions, updates } = itemChanges(ownItems, tokenMode, ip, dropNonPhysical);
  if (deletions.length) await token.actor.deleteEmbeddedDocuments("Item", deletions);
  if (updates.length) await token.actor.updateEmbeddedDocuments("Item", updates);
}

/* -------------------------------------------- */
/*  Dialog                                      */
/* -------------------------------------------- */

/** Actors that can be converted: not piles, not characters assigned to a user. */
function convertibleActors() {
  const assigned = new Set(game.users.map(u => u.character?.id).filter(Boolean));
  return game.actors.filter(a => (a.type !== PILE_TYPE) && !assigned.has(a.id))
    .sort((a, b) => (!!b.flags?.["item-piles"] - !!a.flags?.["item-piles"]) || a.name.localeCompare(b.name));
}

/** Show the conversion dialog (GM only). */
export async function convertDialog() {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("LHTRPG.Piles.Error.NoPermission"));
  const actors = convertibleActors();
  if (!actors.length) return ui.notifications.info(game.i18n.localize("LHTRPG.Piles.Convert.NoActors"));

  const esc = foundry.utils.escapeHTML;
  const selected = canvas.ready ? canvas.tokens.controlled.map(t => t.actor).find(a => a && actors.includes(a.isToken ? game.actors.get(a.id) : a)) : null;
  const initial = selected ? (game.actors.get(selected.id) ?? actors[0]) : actors[0];
  const typeLabel = a => game.i18n.localize(`TYPES.ACTOR.Type${a.type.capitalize()}`);
  const actorOptions = actors.map(a => {
    const ip = itemPilesData(a).type;
    let tag = ip ? ` — Item Piles: ${ip}` : "";
    if (a.hasPlayerOwner) tag += ` — ⚠ ${game.i18n.localize("LHTRPG.Piles.Convert.PlayerOwned")}`;
    return `<option value="${a.id}" data-mode="${suggestedMode(a)}" ${a === initial ? "selected" : ""}>${esc(a.name)} (${esc(typeLabel(a))}${esc(tag)})</option>`;
  }).join("");
  const modeOptions = Object.entries(PILE_MODES).map(([value, label]) =>
    `<option value="${value}" ${value === suggestedMode(initial) ? "selected" : ""}>${game.i18n.localize(label)}</option>`).join("");

  const content = `
    <p>${game.i18n.localize("LHTRPG.Piles.Convert.Hint")}</p>
    <div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.Convert.Actor")}</label>
      <select name="actorId">${actorOptions}</select></div>
    <div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.Convert.Mode")}</label>
      <select name="mode">${modeOptions}</select></div>
    <div class="form-group"><label>${game.i18n.localize("LHTRPG.Piles.Convert.DropNonPhysical")}</label>
      <input type="checkbox" name="dropNonPhysical" checked></div>
    <p class="notes lhtrpg-convert-summary"></p>`;

  const describe = form => {
    const actor = game.actors.get(form.elements.actorId.value);
    const physical = actor.items.filter(i => PHYSICAL_TYPES.includes(i.type)).length;
    const other = actor.items.size - physical;
    const tokens = game.scenes.contents.reduce((n, s) => n + s.tokens.filter(t => t.actorId === actor.id).length, 0);
    form.querySelector(".lhtrpg-convert-summary").textContent = game.i18n.format("LHTRPG.Piles.Convert.Summary", {
      physical, other, tokens, gold: Math.floor(Number(actor.system?.inventory?.gold ?? 0) || 0)
    });
  };

  const data = await DialogV2.input({
    window: { title: game.i18n.localize("LHTRPG.Piles.Convert.Title"), icon: "fas fa-box-open" },
    position: { width: 520 },
    content,
    ok: { label: game.i18n.localize("LHTRPG.Piles.Convert.Confirm"), icon: "fas fa-right-left" },
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      const actorSelect = form.elements.actorId;
      actorSelect.addEventListener("change", () => {
        form.elements.mode.value = actorSelect.selectedOptions[0].dataset.mode;
        describe(form);
      });
      describe(form);
    }
  });
  if (!data?.actorId) return;

  const actor = game.actors.get(data.actorId);
  const modeLabel = game.i18n.localize(PILE_MODES[data.mode]);
  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.localize("LHTRPG.Piles.Convert.Title") },
    content: `<p>${game.i18n.format("LHTRPG.Piles.Convert.AreYouSure", { actor: esc(actor.name), mode: modeLabel })}</p>`
  });
  if (!confirmed) return;

  const result = await convertActorToPile(actor, { mode: data.mode, dropNonPhysical: !!data.dropNonPhysical });
  ui.notifications.info(game.i18n.format("LHTRPG.Piles.Convert.Done", { actor: actor.name, mode: modeLabel, ...result }));
  return actor;
}
