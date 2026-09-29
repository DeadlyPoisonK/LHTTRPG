import { PHASES } from "../documents/lhtrpgCombat.mjs";
import { formatStatusPreview } from "../apps/effect-config.mjs";

/**
 * Log Horizon TRPG effect expiry engine and durations helper.
 *
 * Rules (v0.3):
 * - Round Progression: Setup -> Main -> Cleanup -> next round Setup.
 *   Cleanup: sustained effects, then effects not lasting multiple rounds end here.
 * - Combat Statuses (Regen, Cancel, Barrier) last until end of scene unless specified otherwise.
 * - LH Durations (flags.lhtrpg.expires):
 *   - "endOfProcess": expires when the current process ends (a later phase, or the Main Process it
 *     was applied in is over).
 *   - "endOfRound": expires when the next round starts (survives through Cleanup).
 *   - "endOfScene": expires when combat (the scene) ends.
 *   - "" or undefined: manual / core duration (no automatic LH expiry).
 */

export const EFFECT_EXPIRIES = ["endOfProcess", "endOfRound", "endOfScene"];

export const EFFECT_EXPIRY_LABELS = {
  endOfProcess: "LHTRPG.EffectDuration.EndOfProcess",
  endOfRound: "LHTRPG.EffectDuration.EndOfRound",
  endOfScene: "LHTRPG.EffectDuration.EndOfScene"
};

export const EFFECT_EXPIRY_SHORT_LABELS = {
  endOfProcess: "LHTRPG.EffectDuration.Short.EndOfProcess",
  endOfRound: "LHTRPG.EffectDuration.Short.EndOfRound",
  endOfScene: "LHTRPG.EffectDuration.Short.EndOfScene"
};

export const EFFECT_EXPIRY_REASONS = {
  endOfProcess: "LHTRPG.EffectExpiry.Reason.EndOfProcess",
  endOfRound: "LHTRPG.EffectExpiry.Reason.EndOfRound",
  endOfScene: "LHTRPG.EffectExpiry.Reason.EndOfScene"
};

/**
 * Handlebars helper: produces the short LH duration label or core duration label.
 * @param {ActiveEffect|object} effect
 * @returns {string}
 */
export function lhEffectDuration(effect) {
  const expires = effect?.flags?.lhtrpg?.expires
    ?? (typeof effect?.getFlag === "function" ? effect.getFlag("lhtrpg", "expires") : null)
    ?? effect?._source?.flags?.lhtrpg?.expires;

  if (expires && (expires in EFFECT_EXPIRY_SHORT_LABELS)) {
    const key = EFFECT_EXPIRY_SHORT_LABELS[expires];
    return globalThis.game?.i18n?.localize ? game.i18n.localize(key) : expires;
  }
  return effect?.duration?.label ?? "";
}

/**
 * Format effect name with its status preview if present (e.g. "Pursuit [Pursuit: 10]").
 * @param {ActiveEffect|object} effect
 * @returns {string}
 */
export function formatEffectLabelWithStatus(effect) {
  if (!effect) return "—";
  if (typeof effect === "string") return effect;
  const name = effect.name ?? "—";
  const statusData = (typeof effect.getFlag === "function" ? effect.getFlag("lhtrpg", "statusData") : null)
    ?? effect.flags?.lhtrpg?.statusData
    ?? effect._source?.flags?.lhtrpg?.statusData;

  if (statusData?.statusId) {
    const preview = formatStatusPreview(statusData.statusId, statusData.value, statusData.tag);
    if (preview && preview !== "—" && !name.includes(preview)) {
      return `${name} ${preview}`;
    }
  }
  return name;
}

/**
 * Post a GM whisper listing removed or expired effects.
 * @param {Array<{actor?: Actor|string, actorName?: string, effect?: ActiveEffect|string, effectLabel?: string, reason?: string}>} entries
 * @param {string} [defaultReasonKey]
 * @returns {Promise<ChatMessage|null>}
 */
export async function whisperRemovedEffects(entries, defaultReasonKey) {
  if (!entries || !entries.length) return null;

  const esc = globalThis.foundry?.utils?.escapeHTML ?? (s => s);
  const formatted = entries.map(entry => {
    let actorName = entry.actorName;
    if (!actorName) {
      if (entry.actor instanceof Actor) actorName = entry.actor.name;
      else if (typeof entry.actor === "string") actorName = entry.actor;
      else actorName = "—";
    }

    let effectLabel = entry.effectLabel;
    if (!effectLabel) {
      effectLabel = formatEffectLabelWithStatus(entry.effect);
    }

    const reason = entry.reason ?? defaultReasonKey;
    let reasonText = "";
    if (reason && (reason in EFFECT_EXPIRY_REASONS)) {
      reasonText = globalThis.game?.i18n?.localize ? game.i18n.localize(EFFECT_EXPIRY_REASONS[reason]) : reason;
    } else if (reason && globalThis.game?.i18n?.has && game.i18n.has(reason)) {
      reasonText = game.i18n.localize(reason);
    } else {
      reasonText = String(reason ?? "");
    }

    return { actorName, effectLabel, reasonText };
  });

  const listItems = formatted.map(e => `
    <li>
      <strong class="actor-name">${esc(e.actorName)}</strong>:
      <span class="effect-label">${esc(e.effectLabel)}</span>
      <span class="expiry-reason">(${esc(e.reasonText)})</span>
    </li>
  `).join("");

  const title = globalThis.game?.i18n?.localize ? game.i18n.localize("LHTRPG.EffectExpiry.Title") : "Expired Effects";
  const content = `<div class="lhtrpg chat-card lh-expiry-card">
    <header class="chat-card-header"><div class="chat-card-title">
      <h3>${esc(title)}</h3>
    </div></header>
    <ul class="lh-expiry-list">
      ${listItems}
    </ul>
  </div>`;

  return ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM"),
    speaker: { alias: title },
    content
  });
}

/** Serialized promise queue for expiry processing. */
let _expiryQueue = Promise.resolve();

/**
 * Queue an expiry task to prevent race conditions during rapid state transitions.
 * @param {() => Promise<void>} fn
 * @returns {Promise<void>}
 */
export function queueExpiryTask(fn) {
  _expiryQueue = _expiryQueue
    .then(async () => {
      try {
        await fn();
      } catch (err) {
        console.error("Log Horizon TRPG | Error in effect expiry task", err);
      }
    });
  return _expiryQueue;
}

/**
 * Check whether a phase transition advances forward in time.
 * @param {{round: number, phase: string}} after
 * @param {{round: number, phase: string}} before
 * @returns {boolean}
 */
function _isCombatPhaseForward(after, before) {
  if (!before) return false;
  if (after.round > before.round) return true;
  if (after.round < before.round) return false;
  const beforeIdx = PHASES.indexOf(before.phase);
  const afterIdx = PHASES.indexOf(after.phase);
  if (beforeIdx === -1 || afterIdx === -1) return false;
  return afterIdx > beforeIdx;
}

/**
 * Check whether current position (after) is strictly posterior to when the effect was applied.
 * @param {{round: number, phase: string}} after
 * @param {{round: number, phase: string}} appliedAt
 * @returns {boolean}
 */
function _isProcessPosterior(after, appliedAt) {
  if (after.round > appliedAt.round) return true;
  if (after.round < appliedAt.round) return false;
  const afterIdx = PHASES.indexOf(after.phase);
  const appliedIdx = PHASES.indexOf(appliedAt.phase);
  return afterIdx > appliedIdx;
}

/**
 * Hook handler for preCreateActiveEffect: sets flags.lhtrpg.appliedAt if created during an active combat.
 */
function _onPreCreateActiveEffect(effect, data, options, userId) {
  if (userId && (userId !== game.user?.id)) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  const expires = effect.getFlag?.("lhtrpg", "expires")
    ?? effect.flags?.lhtrpg?.expires
    ?? effect._source?.flags?.lhtrpg?.expires;
  if (!expires) return;

  const combat = [game.combat, ...game.combats].find(c => c?.started && c.getCombatantsByActor(actor).length > 0);
  if (!combat) return;

  // In the Main phase, the process is the active combatant's Main Process.
  const appliedAt = {
    combat: combat.id,
    round: combat.round,
    phase: combat.phase,
    active: (combat.phase === "main") ? (combat.progress?.active ?? null) : null
  };
  effect.updateSource({ "flags.lhtrpg.appliedAt": appliedAt });
}

/**
 * Process expiry on combat phase transitions (Setup, Main, Cleanup).
 * @param {Combat} combat
 * @param {{round: number, phase: string}} after
 */
async function _processCombatPhaseExpiry(combat, after = { round: combat.round, phase: combat.phase }) {
  const acted = combat.progress?.acted ?? [];
  const actors = [];
  const seen = new Set();
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    actors.push(actor);
  }

  const entries = [];
  for (const actor of actors) {
    const toDeleteIds = [];
    for (const effect of actor.effects) {
      const expires = effect.getFlag?.("lhtrpg", "expires");
      if (!expires) continue;
      const appliedAt = effect.getFlag?.("lhtrpg", "appliedAt");
      if (!appliedAt || (appliedAt.combat !== combat.id)) continue;

      let expired = false;
      let reason = null;

      if (expires === "endOfProcess") {
        // A later phase/round, or the Main Process it was applied in is over (Post-Action).
        const mainProcessOver = (appliedAt.phase === "main") && appliedAt.active
          && (after.round === appliedAt.round) && acted.includes(appliedAt.active);
        if (_isProcessPosterior(after, appliedAt) || mainProcessOver) {
          expired = true;
          reason = "endOfProcess";
        }
      } else if (expires === "endOfRound") {
        if (after.round > appliedAt.round) {
          expired = true;
          reason = "endOfRound";
        }
      }

      if (expired) {
        toDeleteIds.push(effect.id);
        entries.push({
          actorName: actor.name,
          effect,
          reason
        });
      }
    }

    if (toDeleteIds.length) {
      try {
        const validIds = toDeleteIds.filter(id => actor.effects.has(id));
        if (validIds.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", validIds);
        }
      } catch (err) {
        console.warn(`Log Horizon TRPG | Could not delete expired effects on ${actor.name}`, err);
      }
    }
  }

  if (entries.length) {
    await whisperRemovedEffects(entries);
  }
}

/**
 * Process expiry when combat ends (scene ends).
 * @param {Combat} combat
 */
async function _processDeleteCombatExpiry(combat) {
  const actors = [];
  const seen = new Set();
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    actors.push(actor);
  }

  const entries = [];
  for (const actor of actors) {
    const toDeleteIds = [];
    for (const effect of actor.effects) {
      const expires = effect.getFlag?.("lhtrpg", "expires");
      if (expires === "endOfScene" || expires === "endOfRound" || expires === "endOfProcess") {
        toDeleteIds.push(effect.id);
        entries.push({
          actorName: actor.name,
          effect,
          reason: "endOfScene"
        });
      }
    }

    if (toDeleteIds.length) {
      try {
        const validIds = toDeleteIds.filter(id => actor.effects.has(id));
        if (validIds.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", validIds);
        }
      } catch (err) {
        console.warn(`Log Horizon TRPG | Could not delete expired effects on ${actor.name} upon combat end`, err);
      }
    }
  }

  if (entries.length) {
    await whisperRemovedEffects(entries, "endOfScene");
  }
}

/**
 * Register the effect durations engine and Handlebars helper.
 * Call during the `init` hook.
 */
export function registerEffectDurations() {
  // LH durations: id -> label (flags.lhtrpg.expires)
  CONFIG.LHTRPG.effectExpiries = { ...EFFECT_EXPIRY_LABELS };

  Handlebars.registerHelper("lhEffectDuration", lhEffectDuration);

  Hooks.on("preCreateActiveEffect", _onPreCreateActiveEffect);

  Hooks.on("lhtrpg.combatPhase", (combat, after, before) => {
    if (!game.users?.activeGM?.isSelf) return;
    if (!before) return;
    if (!_isCombatPhaseForward(after, before)) return;
    queueExpiryTask(() => _processCombatPhaseExpiry(combat, after));
  });

  // A Main Process ended (the combatant became Post-Action) without a phase change.
  Hooks.on("updateCombat", (combat, changed) => {
    if (!game.users?.activeGM?.isSelf) return;
    if (!foundry.utils.hasProperty(changed, "flags.lhtrpg.acted") || (combat.phase !== "main")) return;
    queueExpiryTask(() => _processCombatPhaseExpiry(combat));
  });

  Hooks.on("deleteCombat", combat => {
    if (!game.users?.activeGM?.isSelf) return;
    queueExpiryTask(() => _processDeleteCombatExpiry(combat));
  });
}
