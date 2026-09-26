/**
 * Piles: loot on the floor, chests and merchants, plus item/gold transfers
 * between players. Inspired by the Item Piles module, built into the system.
 */
import { PILE_TYPE, SETTINGS } from "./pile-config.mjs";
import { initSocket } from "./pile-socket.mjs";
import { registerOperations } from "./pile-operations.mjs";
import { PilesAPI, onDropCanvasData } from "./pile-api.mjs";
import { actorTokens, isPile } from "./pile-utils.mjs";
import { LHTrpgPileSheet } from "./pile-sheet.mjs";

/** Called from the system's init hook. */
export function registerPiles() {
  game.lhtrpg.piles = PilesAPI;

  CONFIG.Actor.typeLabels ??= {};
  CONFIG.Actor.typeLabels[PILE_TYPE] = "TYPES.ACTOR.TypePile";

  foundry.documents.collections.Actors.registerSheet("lhtrpg", LHTrpgPileSheet, {
    types: [PILE_TYPE],
    makeDefault: true,
    label: "LHTRPG.Piles.SheetLabel"
  });

  game.settings.register("lhtrpg", SETTINGS.chatLog, {
    name: "LHTRPG.Piles.Settings.ChatLog.Name",
    hint: "LHTRPG.Piles.Settings.ChatLog.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // How each user sorts/filters pile contents (personal preference).
  game.settings.register("lhtrpg", SETTINGS.view, {
    scope: "client",
    config: false,
    type: Object,
    default: { sort: "manual", type: "all" }
  });

  // Piles can't hold active effects of their own (statuses from the token HUD,
  // effects dropped on the sheet...). Effects on their items are left untouched.
  Hooks.on("preCreateActiveEffect", effect => {
    if (isPile(effect.parent)) return false;
  });

  registerOperations();
  Hooks.on("dropCanvasData", onDropCanvasData);

  // Pile windows show the interacting character's gold and items: keep them fresh.
  const refresh = doc => {
    const actor = (doc instanceof Actor) ? doc : doc.parent;
    if (!(actor instanceof Actor) || isPile(actor)) return;
    refreshPileSheets();
  };
  Hooks.on("updateActor", refresh);
  Hooks.on("createItem", refresh);
  Hooks.on("updateItem", refresh);
  Hooks.on("deleteItem", refresh);
  Hooks.on("controlToken", () => refreshPileSheets());

  Hooks.once("ready", () => {
    initSocket();
    if (game.user.isGM && game.modules.get("item-piles")?.active) {
      ui.notifications.info(game.i18n.localize("LHTRPG.Piles.ItemPilesActive"));
    }
  });
}

let refreshTimeout = null;
function refreshPileSheets() {
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => {
    for (const app of foundry.applications.instances.values()) {
      if ((app instanceof LHTrpgPileSheet) && app.rendered) app.render();
    }
  }, 50);
}

/**
 * Update the image of a chest's tokens to match its open/closed state.
 * @param {Actor} pile
 * @param {object} [changes]  Pending system.chest changes. Synthetic (token)
 *                            actors call _onUpdate before refreshing their data.
 */
export async function syncChestImage(pile, changes = {}) {
  if (!isPile(pile) || (pile.system.mode !== "chest")) return;
  const chest = foundry.utils.mergeObject(pile.system.chest ?? {}, changes, { inplace: false });
  const src = chest.closed ? chest.imgClosed : (chest.imgOpen || pile.img);
  if (!src) return;
  for (const token of actorTokens(pile)) {
    if (token.texture.src !== src) await token.update({ "texture.src": src });
  }
}
