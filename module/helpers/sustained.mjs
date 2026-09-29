import { canonicalTag } from "./tag-catalog.mjs";
import { registerHandler, request } from "../piles/pile-socket.mjs";
import { whisperRemovedEffects } from "./effect-durations.mjs";
import { applyItemEffects, isSelfTarget, OPPOSED } from "./item-use.mjs";

/**
 * Sustained skills and tags (Harmony, Servant Summon, Enchantment).
 *
 * Rules (v0.3):
 * - Harmony / Servant Summon / Enchantment last until the end of the Scene (expires: "endOfScene").
 * - Active limit per caster: Harmony 1, Servant Summon 1, Enchantment 2.
 * - When exceeded, the caster chooses which active use to terminate.
 * - Servant Summon is always applied to the caster.
 * - Multiple of the same type on the same target replace previous copies (no stacking).
 */

export const SUSTAINED_TAGS = {
  "Harmony": { id: "harmony", limit: 1 },
  "Servant Summon": { id: "servantSummon", limit: 1 },
  "Enchantment": { id: "enchantment", limit: 2 }
};

/**
 * Register sustained configuration and socket handler.
 * Call during the `init` hook.
 */
export function registerSustained() {
  CONFIG.LHTRPG.sustainedTags = { ...SUSTAINED_TAGS };
  registerHandler("endSustainedUse", _onEndSustainedUseRequest);
}

/**
 * Get active limit for a sustained tag on an actor.
 * @param {Actor} actor
 * @param {string} tagIdOrLabel
 * @returns {number}
 */
export function sustainedLimit(actor, tagIdOrLabel) {
  const tags = CONFIG.LHTRPG?.sustainedTags ?? SUSTAINED_TAGS;
  const entry = Object.entries(tags).find(([k, v]) => v.id === tagIdOrLabel || k === tagIdOrLabel)?.[1];
  const baseLimit = entry?.limit ?? 1;
  const resolvedId = entry?.id ?? tagIdOrLabel;
  const actorFlag = actor?.getFlag?.("lhtrpg", `sustainedLimit.${resolvedId}`);
  return (typeof actorFlag === "number") ? actorFlag : baseLimit;
}

/**
 * Find the sustained tag definition of an item, if any.
 * @param {Item|object} item
 * @returns {{tag: string, id: string, limit: number}|null}
 */
export function getSustainedTag(item) {
  const tags = CONFIG.LHTRPG?.sustainedTags ?? SUSTAINED_TAGS;
  const itemTags = item?.system?.tags ?? [];
  for (const rawTag of itemTags) {
    const canonical = canonicalTag(rawTag);
    if (canonical in tags) {
      return { tag: canonical, ...tags[canonical] };
    }
  }
  return null;
}

/**
 * All actors in the world and synthetic token actors across all scenes (de-duplicated).
 * @returns {Actor[]}
 */
export function getAllActors() {
  const actors = new Set(game.actors);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) {
        actors.add(token.actor);
      }
    }
  }
  return [...actors];
}

/**
 * Find active sustained uses of a specific sustained tag by a caster actor.
 * Grouped by useId.
 * @param {Actor} casterActor
 * @param {string} tagId
 * @returns {Array<{useId: string, itemName: string, casterUuid: string, sustained: string, targetNames: Set<string>, effects: Array<{actor: Actor, effect: ActiveEffect}>}>}
 */
export function getActiveSustainedUses(casterActor, tagId) {
  const allActors = getAllActors();
  const usesMap = new Map();

  for (const actor of allActors) {
    for (const effect of actor.effects) {
      const source = effect.getFlag?.("lhtrpg", "source")
        ?? effect.flags?.lhtrpg?.source
        ?? effect._source?.flags?.lhtrpg?.source;
      if (!source) continue;
      if (source.casterUuid !== casterActor.uuid) continue;
      if (source.sustained !== tagId) continue;
      if (!source.useId) continue;

      let entry = usesMap.get(source.useId);
      if (!entry) {
        entry = {
          useId: source.useId,
          itemName: source.itemName || effect.name,
          casterUuid: source.casterUuid,
          sustained: source.sustained,
          targets: new Set(),
          targetNames: new Set(),
          effects: []
        };
        usesMap.set(source.useId, entry);
      }
      entry.targets.add(actor);
      entry.targetNames.add(actor.name);
      entry.effects.push({ actor, effect });
    }
  }

  return [...usesMap.values()];
}

/**
 * Prompt DialogV2 for the user to choose which active sustained use to terminate.
 * AppV2 compliant: single root element, DialogV2.wait, rejectClose: false.
 * @param {object} params
 * @param {Actor} params.actor
 * @param {Item} params.item
 * @param {{tag: string, id: string, limit: number}} params.sustainedTag
 * @param {Array<object>} params.activeUses
 * @param {number} params.limit
 * @returns {Promise<string|null>}   Selected useId or null if cancelled
 */
export async function promptSustainedLimitDialog({ actor, item, sustainedTag, activeUses, limit }) {
  const esc = foundry.utils.escapeHTML ?? (s => s);
  const tagLabel = sustainedTag.tag ?? item.name;
  const title = game.i18n.localize("LHTRPG.Sustained.Dialog.Title");
  const hint = game.i18n.format("LHTRPG.Sustained.Dialog.Hint", { tag: tagLabel, limit });

  const rows = activeUses.map((use, index) => {
    const targets = [...use.targetNames].join(", ") || "—";
    const label = `${use.itemName} → ${targets}`;
    const checked = index === 0 ? "checked" : "";
    return `<label class="radio-label">
      <input type="radio" name="sustainedUse" value="${esc(use.useId)}" ${checked}>
      <span>${esc(label)}</span>
    </label>`;
  }).join("");

  const content = `<form class="lhtrpg sustained-dialog-form">
    <p class="dialog-hint">${esc(hint)}</p>
    <div class="form-group sustained-radios">
      ${rows}
    </div>
  </form>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("LHTRPG.Sustained.Dialog.EndSelected"),
        icon: "fas fa-times-circle",
        default: true,
        callback: (event, button, dialog) => {
          const checked = dialog.element.querySelector('input[name="sustainedUse"]:checked');
          return checked?.value ?? null;
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("LHTRPG.ButtonLabel.Cancel"),
        icon: "fas fa-ban",
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  return result ?? null;
}

/**
 * End an active sustained use across all actors.
 * If GM is present and user is not GM, routes through pile socket.
 * @param {Actor} casterActor
 * @param {string} useId
 * @param {string} [tagLabel]
 * @returns {Promise<object>}
 */
export async function endSustainedUse(casterActor, useId, tagLabel) {
  if (game.users.activeGM && !game.user.isGM) {
    return request("endSustainedUse", {
      casterUuid: casterActor.uuid,
      useId,
      tagLabel
    });
  }
  return _onEndSustainedUseRequest({
    casterUuid: casterActor.uuid,
    useId,
    tagLabel
  }, game.user);
}

/**
 * GM side socket handler: deletes all copies of a sustained use and whispers to the GM.
 * Validates requesting user is owner of the caster.
 * @param {object} payload
 * @param {string} payload.casterUuid
 * @param {string} payload.useId
 * @param {string} [payload.tagLabel]
 * @param {User} user
 * @returns {Promise<object>}
 */
export async function _onEndSustainedUseRequest({ casterUuid, useId, tagLabel }, user) {
  const caster = await fromUuid(casterUuid);
  if (!(caster instanceof Actor)) return { ok: false };
  if (user && !user.isGM && !caster.testUserPermission(user, "OWNER")) {
    return { ok: false, error: "LHTRPG.Piles.Error.Generic" };
  }

  const allActors = getAllActors();
  const entries = [];

  for (const actor of allActors) {
    const toDeleteIds = [];
    for (const effect of actor.effects) {
      const source = effect.getFlag?.("lhtrpg", "source")
        ?? effect.flags?.lhtrpg?.source
        ?? effect._source?.flags?.lhtrpg?.source;
      if (!source) continue;
      if (source.casterUuid === casterUuid && source.useId === useId) {
        toDeleteIds.push(effect.id);
        entries.push({
          actorName: actor.name,
          effect,
          reason: tagLabel
            ? game.i18n.format("LHTRPG.EffectExpiry.Reason.SustainedLimit", { tag: tagLabel })
            : game.i18n.localize("LHTRPG.EffectExpiry.Reason.SustainedLimitGeneric")
        });
      }
    }
    if (toDeleteIds.length) {
      try {
        await actor.deleteEmbeddedDocuments("ActiveEffect", toDeleteIds);
      } catch (err) {
        console.warn(`Log Horizon TRPG | Could not delete sustained effect on ${actor.name}`, err);
      }
    }
  }

  if (entries.length) {
    await whisperRemovedEffects(entries);
  }

  return { ok: true };
}

/**
 * Prepare and execute skill effects application upon using a skill.
 * Called from LHTrpgItem.ItemThrow().
 * @param {Item} item
 * @returns {Promise<{appliedNames: string, canApplyEffects: boolean, skillUse: object|null}>}
 */
export async function useSkillEffects(item) {
  const nonTransferEffects = item.effects.filter(e => e.transfer === false);
  if (!nonTransferEffects.length) {
    return { appliedNames: "", canApplyEffects: false, skillUse: null };
  }

  const useId = foundry.utils.randomID();
  const sustainedTag = getSustainedTag(item);
  const sustained = sustainedTag?.id ?? null;
  const isServantSummon = (sustained === "servantSummon");
  const isSelf = isServantSummon || isSelfTarget(item);

  const recipients = isSelf
    ? (item.actor ? [item.actor] : [])
    : [...game.user.targets].map(t => t.actor).filter(Boolean);

  const opposed = OPPOSED.includes(item.system?.check?.vs);
  let applied = [];

  if (!opposed && recipients.length > 0) {
    let proceed = true;
    if (sustained && item.actor) {
      const limit = sustainedLimit(item.actor, sustained);
      const activeUses = getActiveSustainedUses(item.actor, sustained).filter(u => u.useId !== useId);
      if (activeUses.length >= limit) {
        const chosenUseId = await promptSustainedLimitDialog({
          actor: item.actor,
          item,
          sustainedTag,
          activeUses,
          limit
        });
        if (chosenUseId) {
          await endSustainedUse(item.actor, chosenUseId, sustainedTag.tag);
        } else {
          proceed = false;
        }
      }
    }

    if (proceed) {
      applied = await applyItemEffects(item, recipients, { useId, sustained });
    }
  }

  const canApplyEffects = opposed || !isSelf || !applied.length;

  return {
    appliedNames: applied.join(", "),
    canApplyEffects,
    skillUse: {
      itemUuid: item.uuid,
      actorUuid: item.actor?.uuid ?? "",
      useId,
      sustained
    }
  };
}

/**
 * Handle "Apply effects" button click on a skill chat card.
 * @param {ChatMessage} message
 * @param {HTMLElement} button
 */
export async function onApplySkillEffects(message, button) {
  const skillUse = message.getFlag("lhtrpg", "skillUse");
  const uuid = skillUse?.itemUuid ?? button.closest("[data-item-uuid]")?.dataset?.itemUuid;
  if (!uuid) return ui.notifications.warn(game.i18n.localize("LHTRPG.Skill.Notif.Missing"));
  const item = await fromUuid(uuid).catch(() => null);
  if (!item) return ui.notifications.warn(game.i18n.localize("LHTRPG.Skill.Notif.Missing"));

  const sustained = skillUse?.sustained ?? getSustainedTag(item)?.id ?? null;
  const useId = skillUse?.useId ?? foundry.utils.randomID();
  const isServantSummon = (sustained === "servantSummon");
  const isSelf = isServantSummon || isSelfTarget(item);

  const recipients = isSelf
    ? (item.actor ? [item.actor] : [])
    : [...game.user.targets].map(t => t.actor).filter(Boolean);

  if (!recipients.length) {
    return ui.notifications.warn(game.i18n.localize("LHTRPG.Item.Use.NoTargets"));
  }

  // Check sustained limit if sustained
  if (sustained && item.actor) {
    const limit = sustainedLimit(item.actor, sustained);
    // Exclude current useId: adding targets to an existing use does not count as a new use
    const activeUses = getActiveSustainedUses(item.actor, sustained).filter(u => u.useId !== useId);
    if (activeUses.length >= limit) {
      const sustainedTag = getSustainedTag(item) ?? { id: sustained, tag: sustained };
      const chosenUseId = await promptSustainedLimitDialog({
        actor: item.actor,
        item,
        sustainedTag,
        activeUses,
        limit
      });
      if (chosenUseId) {
        await endSustainedUse(item.actor, chosenUseId, sustainedTag.tag);
      } else {
        return; // cancelled
      }
    }
  }

  const names = await applyItemEffects(item, recipients, { useId, sustained });
  if (names.length) {
    ui.notifications.info(game.i18n.format("LHTRPG.Item.Use.EffectsApplied", { names: names.join(", ") }));

    // Update message content if user can modify it
    if (message.canUserModify(game.user, "update")) {
      const card = document.createElement("div");
      card.innerHTML = message.content;
      const appliedText = game.i18n.format("LHTRPG.Item.Use.EffectsApplied", { names: names.join(", ") });
      const existing = card.querySelector(".item-use-applied, .skill-card-applied");
      if (existing) {
        existing.innerHTML = `<i class="fas fa-bolt"></i> ${appliedText}`;
      } else {
        const newEl = document.createElement("div");
        newEl.className = "item-use-applied skill-card-applied";
        newEl.innerHTML = `<i class="fas fa-bolt"></i> ${appliedText}`;
        const rolls = card.querySelector(".chat-card-rolls");
        if (rolls) rolls.before(newEl);
        else card.firstElementChild?.append(newEl);
      }
      await message.update({ content: card.innerHTML });
    }
  }
}

/* -------------------------------------------- */
/*  Migration                                   */
/* -------------------------------------------- */

/**
 * Compendium skills whose effects moved from passive (transfer) to "on use" (E3c), by source id,
 * with their LH duration.
 */
const ON_USE_SKILLS = {
  EhqdBAC40BKu6kkF: "endOfScene",   // Servant Summon: Undine
  XeRGlQPhVm4XPJ2c: "endOfScene",   // Servant Summon: Alraune
  d9E5ZdyG8ARBjo7j: "endOfProcess", // Faultless Hit
  ZIvlv66p3fmgXRXi: "endOfProcess", // Scripture
  N6QU0FcWoPJDFwJX: "endOfProcess"  // Robust Battery
};

/** Duration of an item copied from one of those skills (compendium source or same id), else undefined. */
function _onUseExpiry(item) {
  if (item.type !== "skill") return undefined;
  const sourceId = String(item._stats?.compendiumSource ?? "").split(".").pop();
  return ON_USE_SKILLS[sourceId] ?? ON_USE_SKILLS[item.id];
}

async function _migrateOnUseSkills(items, failed) {
  let count = 0;
  for (const item of items) {
    const expires = _onUseExpiry(item);
    if (!expires) continue;
    const updates = item.effects.filter(e => e.transfer)
      .map(e => ({ _id: e.id, transfer: false, "flags.lhtrpg.expires": expires }));
    if (!updates.length) continue;
    try {
      await item.updateEmbeddedDocuments("ActiveEffect", updates, { render: false });
      count++;
    } catch (err) {
      console.error(`Log Horizon TRPG | Could not migrate the effects of ${item.uuid}`, err);
      failed.push(item.uuid);
    }
  }
  return count;
}

/** Skills already copied in the world (actors, unlinked tokens, items, unlocked world compendiums). */
async function migrateOnUseSkills() {
  const failed = [];
  let count = await _migrateOnUseSkills(game.items, failed);
  for (const actor of getAllActors()) count += await _migrateOnUseSkills(actor.items, failed);
  for (const pack of game.packs) {
    if ((pack.metadata.packageType !== "world") || pack.locked) continue;
    if (!["Item", "Actor"].includes(pack.documentName)) continue;
    for (const doc of await pack.getDocuments()) {
      count += await _migrateOnUseSkills(pack.documentName === "Actor" ? doc.items : [doc], failed);
    }
  }
  console.log(`Log Horizon TRPG | On-use skill effects: ${count} skills migrated`);
  return !failed.length;
}

/** World migration (see helpers/migrations.mjs). */
export const ON_USE_SKILLS_MIGRATION = {
  id: "onUseSkills", setting: "onUseSkillsMigrationVersion", version: 1, run: migrateOnUseSkills
};
