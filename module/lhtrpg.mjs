// Import document classes.
import { LHTrpgActor } from "./documents/actor.mjs";
import { LHTrpgItem } from "./documents/item.mjs";
import { LHTrpgCombat, registerCombatPhases } from "./documents/lhtrpgCombat.mjs";
import { LHTrpgActiveEffect } from "./documents/lhtrpgActiveEffect.mjs"
// Import sheet classes.
import { LHTrpgActorSheet } from "./sheets/actor-sheet.mjs";
import { LHTrpgActorMonsterSheet } from "./sheets/actor-monster-sheet.mjs";
import { LHTrpgItemSheet } from "./sheets/item-sheet.mjs";
import { LHTrpgActiveEffectConfig } from "./apps/effect-config.mjs";
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { LHTRPG } from "./helpers/config.mjs";
import { registerStatuses } from "./helpers/statuses.mjs";
import { registerTags } from "./helpers/tags.mjs";
import { LHTrpgToken } from "./canvas/lhtrpgToken.mjs";
import { registerPiles } from "./piles/piles.mjs";
import { registerCharacterOptions } from "./helpers/character-options.mjs";
import { OptionBrowser, registerOptionBrowser } from "./apps/option-browser.mjs";
import { registerSkillBrowser } from "./apps/skill-browser.mjs";
import { rollSkill } from "./helpers/skill-rolls.mjs";
import { registerCombatCards } from "./helpers/combat-cards.mjs";
import { registerItemUse, useItem } from "./helpers/item-use.mjs";
import { registerEffectTargets } from "./helpers/effect-targets.mjs";
import { registerEffectDurations } from "./helpers/effect-durations.mjs";
import { registerMigrations, runMigrations } from "./helpers/migrations.mjs";
import { registerSustained, onApplySkillEffects } from "./helpers/sustained.mjs";
import { registerClients } from "./helpers/clients.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', async function () {

  console.log(`Log Horizon TRPG | Initializing Half-Gaia Project...\n${LHTRPG.ASCII}`);

  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.lhtrpg = {
    LHTrpgActor,
    LHTrpgItem,
    rollItemMacro,
    LHTrpgCombat,
    LHTrpgActiveEffect,
    OptionBrowser
  };

  // Add custom constants for configuration.
  CONFIG.LHTRPG = LHTRPG;

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "0d6",
    decimals: 0
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = LHTrpgActor;
  CONFIG.Item.documentClass = LHTrpgItem;
  CONFIG.Combat.documentClass = LHTrpgCombat;
  CONFIG.ActiveEffect.documentClass = LHTrpgActiveEffect;
  CONFIG.Token.objectClass = LHTrpgToken;

  // Log Horizon statuses (Token HUD, token icons, sheet sync, [Hidden])
  registerStatuses();
  // Tag catalog, tag editor helper and tag normalization
  registerTags();
  // Effect targets catalog and summary helper
  registerEffectTargets();
  // Log Horizon effect durations and expiry engine
  registerEffectDurations();
  // Browser windows of the same user (a GM logged in twice acts once)
  registerClients();
  // World data migrations: run in order on the active GM when the world is ready
  registerMigrations();
  // By default, track hate and skip defeated combatants
  CONFIG.combatTrackerConfig = {resource: 'infos.hate', skipDefeated: true};
  // Time passing per round
  CONFIG.time.roundTime = 6;

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("lhtrpg", LHTrpgActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "LHTRPG.PlayerSheet"
  });
  foundry.documents.collections.Actors.registerSheet("lhtrpg", LHTrpgActorMonsterSheet, {
    types: ["monster"],
    makeDefault: true,
    label: "LHTRPG.MonsterSheet"
  });
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("lhtrpg", LHTrpgItemSheet, { makeDefault: true });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(ActiveEffect, "lhtrpg", LHTrpgActiveEffectConfig, {
    makeDefault: true,
    label: "LHTRPG.EffectConfig.Title"
  });

  // Loot, chests, merchants and item/gold transfers between players
  registerPiles();

  // Race / Class / Subclass items: single copy per character, core compendium, legacy migration
  registerCharacterOptions();
  registerOptionBrowser();
  registerSkillBrowser();

  // Attack / damage chat cards: opposed Hit vs Dodge Checks and damage application
  registerCombatCards();

  // Usable items (potions, scrolls…): Use button, use card, effects, [Consumable]
  registerItemUse();

  // Sustained skills (Harmony, Servant Summon, Enchantment): limits, replacement, expiry
  registerSustained();

  // Round Progression: Briefing / Setup / Main / Cleanup phases in the tracker
  registerCombatPhases();

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

Handlebars.registerHelper('toUpperCase', function (str) {
  return str.toUpperCase();
});

// Used by templates/apps/option-browser.hbs (search index)
Handlebars.registerHelper('toLowerCase', function (str) {
  return String(str ?? "").toLowerCase();
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  // Core only skips its own "Display <item>" macro if the hook returns false synchronously.
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type !== "Item") return;
    createItemMacro(data, slot);
    return false;
  });
  runMigrations();
});

/* -------------------------------------------- */
/*  Skill chat cards: Check / Damage / Effects  */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  html.querySelectorAll(".skill-card-roll").forEach(button => button.addEventListener("click", async event => {
    event.preventDefault();
    const uuid = button.closest("[data-item-uuid]")?.dataset.itemUuid;
    const item = uuid ? await fromUuid(uuid).catch(() => null) : null;
    if (!item) return ui.notifications.warn(game.i18n.localize("LHTRPG.Skill.Notif.Missing"));
    rollSkill(item, button.dataset.roll);
  }));

  html.querySelectorAll(".skill-card-effects").forEach(button => button.addEventListener("click", async event => {
    event.preventDefault();
    await onApplySkillEffects(message, button);
  }));
});


/* -------------------------------------------- */
/*  Ticket Stacking                             */
/* -------------------------------------------- */

// Tickets stack by subtype: receiving one (loot, trade, drag & drop, etc.)
// while the actor already carries one of that subtype adds to its quantity
// instead of creating a duplicate item. Treasure Tickets also stack by rank
// (a CR 2 ticket and a CR 3 ticket are different tickets).
Hooks.on("preCreateItem", (item, data, options, userId) => {
  if (item.type !== "ticket") return;
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  // Merchants track their own stock per entry.
  if ((actor.type === "pile") && (actor.system.mode === "merchant")) return;

  const subtype = item.system.subtype;
  const ranked = subtype === "Treasure";
  const rank = Number(item.system.rank) || 0;
  const existing = actor.items.find(i => i.type === "ticket" && i.system.subtype === subtype
    && (!ranked || (Number(i.system.rank) || 0) === rank));
  if (!existing) return;

  const addedQuantity = Number(item.system.quantity) || 1;
  existing.update({ "system.quantity": (Number(existing.system.quantity) || 0) + addedQuantity });
  return false;
});

/* -------------------------------------------- */
/*  Linked Skills                               */
/* -------------------------------------------- */

// Equipment sheets show their linked skill's name and icon, read at render time.
// Re-render any open sheet linked to a skill when that skill's name or icon changes.
Hooks.on("updateItem", (item, changes) => {
  if (item.type !== "skill" || !(("name" in changes) || ("img" in changes))) return;
  const apps = foundry.applications?.instances?.values() ?? [];
  for (const app of apps) {
    if (app.item?.system?.linkedSkillUuid === item.uuid) app.render(false);
  }
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  const item = data.uuid ? await fromUuid(data.uuid) : null;
  if (!item?.parent) {
    ui.notifications.warn(game.i18n.localize("LHTRPG.Macro.Notif.OwnedOnly"));
    return;
  }

  // Create the macro command
  const command = `game.lhtrpg.rollItemMacro(${JSON.stringify(item.name)});`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "lhtrpg.itemMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
}

/**
 * Hotbar macro: use the named item of the speaker's actor. Usable items are used (Use card,
 * effects, [Consumable]); anything else is sent to chat (skills with their Check / Damage buttons).
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName) {
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const item = actor ? actor.items.find(i => i.name === itemName) : null;
  if (!item) return ui.notifications.warn(game.i18n.format("LHTRPG.Macro.Notif.NoItem", { item: itemName }));

  return (item.type === "usable") ? useItem(item) : item.ItemThrow();
}
