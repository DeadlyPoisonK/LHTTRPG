import { rollSkill, skillRollable } from "./skill-rolls.mjs";
import { targetEntries } from "./combat-cards.mjs";
import { canonicalTag } from "./tag-catalog.mjs";
import { registerHandler, request } from "../piles/pile-socket.mjs";

/**
 * Usable items (potions, food, scrolls, whistles, poisons…): item type "usable".
 *
 * Using one posts a use card (templates/chat/use-card.hbs) with its Check / Damage buttons, copies its
 * Active Effects to the target, and destroys it when it has the [Consumable] tag. The card keeps a copy
 * of the item (flags.lhtrpg.use.item) so its buttons still work once the item is gone.
 *
 * Effects copied to a target are Combat Statuses: they last until the end of the scene, so they are
 * flagged (flags.lhtrpg.itemUse) and removed when the combat ends.
 *
 * Timing: outside combat anything goes. In a combat the actor takes part in, a player can only use
 * the item when its Timing fits the phase (Major / Minor / Move on their own Main Process, Setup in
 * the Setup Process…); the GM is only warned.
 */

const USE_CARD = "systems/lhtrpg/templates/chat/use-card.hbs";
/** Checks the target resists: the item's effects wait for the hit (Apply effects button). */
const OPPOSED = ["evasion", "resistance"];

/** Timing (lower case) -> when it can be used in combat. */
const TIMING_RULES = {
  "major": "turn", "minor": "turn", "move": "turn", "main process": "turn", "action": "turn",
  "setup": "setup",
  "initiative": "main",
  "cleanup": "cleanup",
  "briefing": "briefing",
  "rest time": "outside", "interlude": "outside", "pre-play": "outside"
};

export function registerItemUse() {
  registerHandler("applyItemEffects", _onApplyEffectsRequest);
  Hooks.on("renderChatMessageHTML", _onRenderChatMessage);
  Hooks.on("deleteCombat", _onDeleteCombat);
  game.settings.register("lhtrpg", "usableMigrationVersion", {
    scope: "world", config: false, type: Number, default: 0
  });
  Hooks.once("ready", migrateUsableItems);
}

/**
 * Whether a tag is on the item (catalog spelling: "[consumable]" = "Consumable").
 * @param {Item|object} item
 * @param {string} tag
 */
function hasTag(item, tag) {
  return (item.system?.tags ?? []).some(t => canonicalTag(t) === tag);
}

/**
 * Whether the current user can use this item: a usable item carried by an actor they own.
 * @param {Item} item
 * @returns {boolean}
 */
export function canUseItem(item) {
  return (item?.type === "usable") && !!item.actor && (item.actor.type !== "pile") && item.isOwner;
}

/**
 * Why the item can't be used right now in the actor's combat, or null when it can.
 * @param {Item} item
 * @param {Actor} actor
 * @returns {string|null}   Localized reason
 */
function timingProblem(item, actor) {
  // The viewed combat first, else any other the actor takes part in.
  const combat = [game.combat, ...game.combats].find(c => c?.getCombatantsByActor(actor).length);
  if (!combat) return null;
  const combatants = combat.getCombatantsByActor(actor);

  const phase = combat.phase;
  const timing = String(item.system.timing ?? "").trim().toLowerCase();
  const rule = TIMING_RULES[timing];
  // [Preparation]: may also be used in the Briefing.
  if ((phase === "briefing") && ((rule === "briefing") || hasTag(item, "Preparation") || (timing === "instant"))) return null;
  const phaseReason = () => game.i18n.format("LHTRPG.Item.Use.Reason.Phase", {
    phase: game.i18n.localize(`LHTRPG.Combat.Phase.${phase}`)
  });
  switch (rule) {
    case "turn": {
      const ownTurn = (phase === "main") && combatants.some(c => c.id === combat.combatant?.id);
      return ownTurn ? null : game.i18n.localize("LHTRPG.Item.Use.Reason.NotTurn");
    }
    case "setup":
    case "main":
    case "cleanup":
      return (phase === rule) ? null : phaseReason();
    case "briefing":
      return game.i18n.localize("LHTRPG.Item.Use.Reason.Briefing");
    case "outside":
      return game.i18n.localize("LHTRPG.Item.Use.Reason.OutOfCombat");
    default:
      // Instant, reactions (Before Check, Damage Roll…), Refer…: any time.
      return null;
  }
}

/** Whether the item only affects its user (Target: Self). */
function isSelfTarget(item) {
  return /^\s*self\b/i.test(item.system.target ?? "");
}

/** The token the actor acts from: a controlled one, else its first one on the scene. */
function actorTokens(actor) {
  const token = canvas.tokens?.controlled.find(t => t.actor === actor) ?? actor.getActiveTokens()[0];
  return token ? [token] : [];
}

/**
 * Use an item: timing check, use card, effects, and the item is lost if [Consumable].
 * @param {Item} item
 * @returns {Promise<ChatMessage|null>}
 */
export async function useItem(item) {
  const actor = item.actor;
  if (!canUseItem(item)) {
    ui.notifications.warn(game.i18n.localize("LHTRPG.Item.Use.NoActor"));
    return null;
  }

  let note = "";
  const problem = timingProblem(item, actor);
  if (problem) {
    const timing = item.system.timing || "-";
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.format("LHTRPG.Item.Use.Blocked", { name: item.name, timing, reason: problem }));
      return null;
    }
    note = game.i18n.format("LHTRPG.Item.Use.GMOverride", { timing, reason: problem });
  }

  // Effects go to the target right away, unless the target may resist them (opposed Check).
  const self = isSelfTarget(item);
  const hasEffects = item.effects.size > 0;
  const opposed = OPPOSED.includes(item.system.check?.vs);
  let applied = [];
  if (hasEffects && !opposed) {
    const recipients = self ? [actor] : [...game.user.targets].map(t => t.actor).filter(Boolean);
    applied = await applyItemEffects(item, recipients);
  }

  const consumed = hasTag(item, "Consumable");
  const itemData = item.toObject();
  const cardData = {
    ...itemData,
    system: item.system,
    typeLabel: game.i18n.localize("TYPES.Item.usable"),
    consumed,
    note,
    rollable: skillRollable(item),
    // Apply effects later: on a hit, or to targets chosen after using it
    canApplyEffects: hasEffects && (opposed || (!self && !applied.length)),
    appliedNames: applied.join(", "),
    enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description ?? "", { relativeTo: item })
  };
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await foundry.applications.handlebars.renderTemplate(USE_CARD, cardData),
    flags: { lhtrpg: { use: { item: itemData, actorUuid: actor.uuid, self } } }
  };
  ChatMessage.applyRollMode(messageData, game.settings.get("core", "rollMode"));
  const message = await ChatMessage.create(messageData);

  if (consumed) await item.delete();
  return message;
}

/**
 * The item a use card was made from: the actor's own if it still exists, else a copy of it.
 * @param {ChatMessage} message
 * @returns {Item|null}
 */
function cardItem(message) {
  const use = message.getFlag("lhtrpg", "use");
  const actor = use && fromUuidSync(use.actorUuid);
  if (!actor) return null;
  return actor.items.get(use.item._id) ?? new Item.implementation(use.item, { parent: actor });
}

/**
 * Copy an item's Active Effects to these actors, as Combat Statuses (removed when the combat ends).
 * Actors the user doesn't own are handled by the GM.
 * @param {Item} item
 * @param {Actor[]} actors
 * @returns {Promise<string[]>}   Names of the actors that received them
 */
export async function applyItemEffects(item, actors) {
  const effects = item.effects.map(effect => {
    const data = effect.toObject();
    delete data._id;
    data.origin = item.uuid;
    data.transfer = false;
    data.disabled = false;
    data.img ||= item.img;
    foundry.utils.setProperty(data, "flags.lhtrpg.itemUse", true);
    return data;
  });
  if (!effects.length) return [];

  const names = [];
  for (const actor of new Set(actors)) {
    if (actor.isOwner) await actor.createEmbeddedDocuments("ActiveEffect", effects);
    else {
      const result = await request("applyItemEffects", { actorUuid: actor.uuid, effects });
      if (!result.ok) {
        ui.notifications.warn(game.i18n.localize(result.error ?? "LHTRPG.Piles.Error.Generic"));
        continue;
      }
    }
    names.push(actor.name);
  }
  return names;
}

/** GM side of applyItemEffects, for actors the user doesn't own. */
async function _onApplyEffectsRequest({ actorUuid, effects }) {
  const actor = await fromUuid(actorUuid);
  if (!(actor instanceof Actor) || !Array.isArray(effects)) return { ok: false };
  const data = effects.filter(e => e?.flags?.lhtrpg?.itemUse);
  await actor.createEmbeddedDocuments("ActiveEffect", data);
  return { ok: true };
}

/** A combat ended: the item Combat Statuses of its combatants end with the scene. */
async function _onDeleteCombat(combat) {
  if (!game.users.activeGM?.isSelf) return;
  const actors = new Set(combat.combatants.map(c => c.actor).filter(Boolean));
  for (const actor of actors) {
    const ids = actor.effects.filter(e => e.getFlag("lhtrpg", "itemUse")).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}

/** Use card buttons: Check / Damage (the user or the GM), Apply effects (anyone, to their targets). */
function _onRenderChatMessage(message, html) {
  if (!message.getFlag("lhtrpg", "use")) return;
  const canRoll = message.isAuthor || game.user.isGM;

  html.querySelectorAll(".item-use-roll").forEach(button => {
    if (!canRoll) return button.remove();
    button.addEventListener("click", event => {
      event.preventDefault();
      const item = cardItem(message);
      if (!item) return ui.notifications.warn(game.i18n.localize("LHTRPG.Skill.Notif.Missing"));
      const self = message.getFlag("lhtrpg", "use").self;
      rollSkill(item, button.dataset.roll, { targets: self ? targetEntries(actorTokens(item.actor)) : undefined });
    });
  });

  html.querySelectorAll(".item-use-effects").forEach(button => button.addEventListener("click", async event => {
    event.preventDefault();
    const item = cardItem(message);
    if (!item) return ui.notifications.warn(game.i18n.localize("LHTRPG.Skill.Notif.Missing"));
    const actors = [...game.user.targets].map(t => t.actor).filter(Boolean);
    if (!actors.length) return ui.notifications.warn(game.i18n.localize("LHTRPG.Item.Use.NoTargets"));
    const names = await applyItemEffects(item, actors);
    if (names.length) ui.notifications.info(game.i18n.format("LHTRPG.Item.Use.EffectsApplied", { names: names.join(", ") }));
  }));
}

/* -------------------------------------------- */
/*  Gear -> Usable                              */
/* -------------------------------------------- */

const MIGRATION_VERSION = 1;
const GEAR_ICON = "systems/lhtrpg/assets/ui/items_icons/gear.svg";
const USABLE_ICON = "systems/lhtrpg/assets/ui/items_icons/usable.svg";

/**
 * Whether Gear source data is really a usable item: it has a Timing to be used with, or the
 * [Consumable] tag. The rest (Mysterious Items, Magnifying Glass, Torch…) stays Gear ("Other").
 * @param {object} system    Item system source data
 * @returns {boolean}
 */
export function isUsableGear(system) {
  const timing = String(system?.timing ?? "").trim();
  return !["", "-", "Constant"].includes(timing) || (system?.tags ?? []).some(t => canonicalTag(t) === "Consumable");
}

/**
 * Damage / Recovery read from an item's rules text: "Deal [2D + 50] physical damage",
 * "Recovers 25 points of target's [HP]". Empty when there is none.
 * @param {string} html
 * @returns {object}
 */
export function damageFromText(html) {
  const text = String(html ?? "").replace(/<[^>]+>/g, " ");
  const damage = text.match(/\[?(\d+)D\s*\+\s*(\d+)\]?\s*(physical|magic(?:al)?)\s+damage/i);
  if (damage) return { dice: Number(damage[1]), mod: Number(damage[2]), type: /^phys/i.test(damage[3]) ? "physical" : "magical", recovery: false };
  const heal = text.match(/recovers?\s+(?:\[?(\d+)D\s*\+\s*)?(\d+)\]?\s*(?:points of\s+)?(?:the\s+)?(?:target's\s+)?\[?HP/i);
  if (heal) return { dice: Number(heal[1] ?? 0), mod: Number(heal[2]), type: "", recovery: true };
  return {};
}

/**
 * Source data of a Gear item turned into a usable item. The Check stays as legacy text (checkType),
 * read by prepareSkillRolls until it is edited on the sheet.
 * @param {object} system    Gear system source data
 * @returns {object}          Usable system source data
 */
export function usableSystem(system) {
  const { check, ...rest } = foundry.utils.deepClone(system ?? {});
  const legacy = String(rest.checkType || ((typeof check === "string") ? check : "") || "").trim();
  return {
    ...rest,
    checkType: legacy,
    check: { dice: 0, mod: 0, vs: "" },
    damage: { dice: 0, mod: 0, type: "", recovery: false, ...damageFromText(rest.description) }
  };
}

async function _migrateItems(items, failed) {
  const names = [];
  for (const item of items) {
    if ((item.type !== "gear") || !isUsableGear(item._source.system)) continue;
    try {
      const update = { type: "usable", "==system": usableSystem(item._source.system) };
      if (item._source.img === GEAR_ICON) update.img = USABLE_ICON;
      await item.update(update, { render: false });
      names.push(item.name);
    } catch (err) {
      console.error(`Log Horizon TRPG | Could not turn ${item.uuid} into a usable item`, err);
      failed.push(item.uuid);
    }
  }
  return names;
}

/**
 * One-time world migration (active GM): Gear that is really usable becomes the "usable" type, in
 * world items, actors, unlinked tokens and the world's unlocked compendiums.
 */
export async function migrateUsableItems() {
  if (!game.user.isActiveGM) return;
  if (game.settings.get("lhtrpg", "usableMigrationVersion") >= MIGRATION_VERSION) return;
  // The world must be relaunched after a system update that adds the type (template.json).
  if (!game.documentTypes.Item.includes("usable")) return;
  const failed = [];

  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.push(token.actor);
  }
  const names = await _migrateItems(game.items, failed);
  for (const actor of actors) names.push(...await _migrateItems(actor.items, failed));
  for (const pack of game.packs) {
    if ((pack.metadata.packageType !== "world") || pack.locked) continue;
    if (!["Item", "Actor"].includes(pack.documentName)) continue;
    for (const doc of await pack.getDocuments()) {
      names.push(...await _migrateItems(pack.documentName === "Actor" ? doc.items : [doc], failed));
    }
  }

  // Try again on the next load if some item could not be converted.
  if (!failed.length) await game.settings.set("lhtrpg", "usableMigrationVersion", MIGRATION_VERSION);
  console.log(`Log Horizon TRPG | Gear -> Usable: ${names.length} items`, names);
  if (names.length) ui.notifications.info(game.i18n.format("LHTRPG.Item.Use.Migrated", { count: names.length }));
}
