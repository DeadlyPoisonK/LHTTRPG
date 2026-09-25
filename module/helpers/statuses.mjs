/**
 * Log Horizon TRPG statuses (Rules v0.3, VI.a. STATUSES).
 *
 * Every status is registered as a Foundry status effect, so it can be toggled from the Token HUD
 * and is drawn on the token like any other status. Statuses backed by an actor data field (the
 * `system.bad-status.*` checkboxes/ratings, `system.infos.fatigue`) are kept in sync both ways:
 * editing the field in the sheet adds/removes the effect, and toggling the effect from the HUD
 * updates the field. Statuses without a field are stored only as the effect.
 */

const EFFECTS_PATH = "systems/lhtrpg/assets/ui/effects";

/**
 * @typedef {object} LHStatus
 * @property {string} id         Status id (also the ActiveEffect status).
 * @property {string} group      life | bad | combat | other
 * @property {string} img
 * @property {string} [path]     Actor field (relative to `system`) mirroring this status.
 * @property {boolean} [rated]   The field holds a Rating (number) instead of a boolean.
 * @property {string[]} [types]  Actor types that show this status in their sheet (default: all).
 */

/** @type {LHStatus[]} */
export const LH_STATUSES = [
  // Life Statuses
  { id: "fatigue", group: "life", img: "icons/svg/downgrade.svg", path: "infos.fatigue", rated: true, types: ["character"] },
  { id: "weakness", group: "life", img: `${EFFECTS_PATH}/weakness.png`, path: "bad-status.weakness", rated: true },
  { id: "incapacitated", group: "life", img: "icons/svg/unconscious.svg" },
  { id: "dead", group: "life", img: "icons/svg/skull.svg" },
  // Bad Statuses
  { id: "staggered", group: "bad", img: `${EFFECTS_PATH}/staggered.png`, path: "bad-status.staggered" },
  { id: "dazed", group: "bad", img: `${EFFECTS_PATH}/dazed.png`, path: "bad-status.dazed" },
  { id: "rigor", group: "bad", img: `${EFFECTS_PATH}/rigor.png`, path: "bad-status.rigor" },
  { id: "confused", group: "bad", img: `${EFFECTS_PATH}/confused.png`, path: "bad-status.confused" },
  { id: "decay", group: "bad", img: `${EFFECTS_PATH}/decay.png`, path: "bad-status.decay", rated: true },
  { id: "pursuit", group: "bad", img: `${EFFECTS_PATH}/pursuit.png`, path: "bad-status.pursuit", rated: true },
  { id: "afflicted", group: "bad", img: `${EFFECTS_PATH}/afflicted.png`, path: "bad-status.afflicted" },
  { id: "overconfident", group: "bad", img: `${EFFECTS_PATH}/overconfident.png`, path: "bad-status.overconfident" },
  // Combat Statuses
  { id: "regen", group: "combat", img: `${EFFECTS_PATH}/regen.png`, path: "bad-status.regen", rated: true },
  { id: "cancel", group: "combat", img: `${EFFECTS_PATH}/cancel.png`, path: "bad-status.cancel", rated: true },
  { id: "barrier", group: "combat", img: `${EFFECTS_PATH}/barrier.png`, path: "bad-status.barrier", rated: true },
  // Other Statuses
  { id: "hidden", group: "other", img: "icons/svg/invisible.svg" },
  { id: "swimming", group: "other", img: "icons/svg/waterfall.svg" },
  { id: "flying", group: "other", img: "icons/svg/wing.svg" },
  { id: "identified", group: "other", img: "icons/svg/eye.svg", types: ["monster"] },
  { id: "standby", group: "other", img: "icons/svg/clockwork.svg" },
  { id: "hateTop", group: "other", img: "icons/svg/target.svg" },
  { id: "hateUnder", group: "other", img: "icons/svg/down.svg" },
  { id: "absent", group: "other", img: "icons/svg/door-exit.svg" }
];

/** Status that hides the token from everyone but its owners and the GM. */
export const HIDDEN_STATUS = "hidden";

/** Status groups, in the order they are shown in the sheets. */
export const LH_STATUS_GROUPS = ["bad", "life", "combat", "other"];

const STATUS_BY_ID = new Map(LH_STATUSES.map(s => [s.id, s]));
const MIGRATION_VERSION = 2;

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

/**
 * Replace the core status effects with the Log Horizon ones and register the sync hooks.
 * Call during the `init` hook.
 */
export function registerStatuses() {
  game.settings.register("lhtrpg", "statusMigrationVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  // Per-world icon overrides ({statusId: img}), e.g. imported from Combat Utility Belt.
  game.settings.register("lhtrpg", "statusIcons", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: _configureStatusEffects
  });

  _configureStatusEffects();
  CONFIG.specialStatusEffects.DEFEATED = "dead";

  Hooks.on("updateActor", _onUpdateActor);
  Hooks.on("createActiveEffect", (effect, options, userId) => _onStatusEffectChange(effect, true, userId));
  Hooks.on("deleteActiveEffect", (effect, options, userId) => _onStatusEffectChange(effect, false, userId));
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, _refreshHiddenTokens);
  }
  // Combat tracker "hide" <-> [Hidden]
  Hooks.on("updateCombatant", _onUpdateCombatant);
  Hooks.on("preCreateCombatant", _onPreCreateCombatant);
  Hooks.on("createActiveEffect", (effect, options, userId) => _syncCombatantsHidden(effect, userId));
  Hooks.on("deleteActiveEffect", (effect, options, userId) => _syncCombatantsHidden(effect, userId));
  Hooks.once("ready", _migrateStatuses);
}

function _configureStatusEffects() {
  CONFIG.statusEffects = LH_STATUSES.map(s => ({
    id: s.id,
    // Static id: a status can only exist once per actor, even with concurrent toggles.
    _id: `lh${s.id}`.padEnd(16, "0"),
    name: `LHTRPG.StatusEffect.${s.id}`,
    img: getStatusIcon(s.id)
  }));
}

/**
 * The icon of a status, honoring the world's overrides.
 * @param {string} statusId
 * @returns {string}
 */
export function getStatusIcon(statusId) {
  const overrides = game.settings.get("lhtrpg", "statusIcons") ?? {};
  return overrides[statusId] || STATUS_BY_ID.get(statusId)?.img;
}

/* -------------------------------------------- */
/*  Sheet helpers                               */
/* -------------------------------------------- */

/**
 * Statuses shown in the actor sheet status panel, by group.
 * Fatigue is left out: the character sheet already shows it next to Hate.
 * @param {Actor} actor
 * @returns {{id: string, label: string, statuses: object[]}[]}
 */
export function getStatusPanel(actor) {
  const source = actor._source.system;
  return LH_STATUS_GROUPS.map(group => ({
    id: group,
    label: game.i18n.localize(`LHTRPG.StatusGroup.${group}`),
    statuses: LH_STATUSES
      .filter(s => (s.group === group) && (s.id !== "fatigue"))
      .filter(s => !s.types || s.types.includes(actor.type))
      .map(s => {
        const value = s.path ? foundry.utils.getProperty(source, s.path) : undefined;
        return {
          id: s.id,
          label: game.i18n.localize(`LHTRPG.StatusEffect.${s.id}`),
          img: getStatusIcon(s.id),
          field: s.path ? `system.${s.path}` : null,
          rated: !!s.rated,
          value: s.rated ? (Number(value) || 0) : value,
          active: actor.statuses.has(s.id)
        };
      })
  }));
}

/* -------------------------------------------- */
/*  Field <-> effect sync                       */
/* -------------------------------------------- */

function _fieldValue(actor, status) {
  return foundry.utils.getProperty(actor._source.system, status.path);
}

function _isFieldActive(status, value) {
  return status.rated ? (Number(value) || 0) > 0 : !!value;
}

function _effectName(status, value) {
  const label = game.i18n.localize(`LHTRPG.StatusEffect.${status.id}`);
  return status.rated ? `${label}: ${Number(value) || 0}` : label;
}

function _findStatusEffects(actor, statusId) {
  return actor.effects.filter(e => (e.statuses.size === 1) && e.statuses.has(statusId));
}

/**
 * Make the status effect of `status` match the actor's field.
 */
async function _syncEffectFromField(actor, status) {
  const value = _fieldValue(actor, status);
  if (value === undefined) return;
  const active = _isFieldActive(status, value);
  const existing = _findStatusEffects(actor, status.id);

  if (!active) {
    if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
    return;
  }

  const name = _effectName(status, value);
  if (existing.length) {
    if (existing[0].name !== name) await existing[0].update({ name });
    return;
  }
  const effect = await ActiveEffect.implementation.fromStatusEffect(status.id);
  effect.updateSource({ name });
  await ActiveEffect.implementation.create(effect, { parent: actor, keepId: true });
}

function _onUpdateActor(actor, changes, options, userId) {
  if ((userId !== game.user.id) || options.lhStatusMigration) return;
  for (const status of LH_STATUSES) {
    if (!status.path) continue;
    if (!foundry.utils.hasProperty(changes, `system.${status.path}`)) continue;
    _syncEffectFromField(actor, status);
  }
}

/**
 * A status effect was added/removed (Token HUD, sheet, macro...): update the mirrored field.
 */
function _onStatusEffectChange(effect, created, userId) {
  // Only the user who triggered the change acts, to avoid duplicated updates.
  if (userId !== game.user.id) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  const updates = {};
  for (const statusId of effect.statuses) {
    const status = STATUS_BY_ID.get(statusId);
    if (!status?.path) continue;
    const value = _fieldValue(actor, status);
    if (value === undefined) continue;

    if (created && !_isFieldActive(status, value)) {
      updates[`system.${status.path}`] = status.rated ? 1 : true;
    } else if (!created && _isFieldActive(status, value) && !actor.statuses.has(statusId)) {
      updates[`system.${status.path}`] = status.rated ? 0 : false;
    }
  }
  if (!foundry.utils.isEmpty(updates)) actor.update(updates);
}

/**
 * Redraw the actor's tokens when [Hidden] is added/removed, on every client.
 */
function _refreshHiddenTokens(effect) {
  if (!effect.statuses.has(HIDDEN_STATUS)) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  for (const token of actor.getActiveTokens()) {
    token.renderFlags.set({ refreshVisibility: true, refreshState: true });
  }
}

/* -------------------------------------------- */
/*  Combat tracker                              */
/* -------------------------------------------- */

/**
 * Hiding/revealing a combatant from the combat tracker toggles [Hidden] on its token.
 */
function _onUpdateCombatant(combatant, changes, options, userId) {
  if ((userId !== game.user.id) || !("hidden" in changes)) return;
  const actor = combatant.actor;
  if (!actor || (actor.statuses.has(HIDDEN_STATUS) === changes.hidden)) return;
  actor.toggleStatusEffect(HIDDEN_STATUS, { active: changes.hidden });
}

/**
 * A token already under [Hidden] enters combat hidden in the tracker too.
 */
function _onPreCreateCombatant(combatant) {
  if (combatant.actor?.statuses.has(HIDDEN_STATUS) && !combatant.hidden) {
    combatant.updateSource({ hidden: true });
  }
}

/**
 * [Hidden] added/removed: hide/reveal the actor's combatants in every combat.
 */
function _syncCombatantsHidden(effect, userId) {
  if ((userId !== game.user.id) || !effect.statuses.has(HIDDEN_STATUS)) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const hidden = actor.statuses.has(HIDDEN_STATUS);
  for (const combat of game.combats) {
    const updates = combat.combatants
      .filter(c => (c.actor?.uuid === actor.uuid) && (c.hidden !== hidden) && c.canUserModify(game.user, "update"))
      .map(c => ({ _id: c.id, hidden }));
    if (updates.length) combat.updateEmbeddedDocuments("Combatant", updates);
  }
}

/* -------------------------------------------- */
/*  Migration                                   */
/* -------------------------------------------- */

/**
 * Replace the effects created by the old sheet toggles (flags.core.statusId, no `statuses`)
 * with proper status effects, and create the effects of fields that are already set.
 */
async function _migrateStatuses() {
  if (!game.user.isActiveGM) return;
  if (game.settings.get("lhtrpg", "statusMigrationVersion") >= MIGRATION_VERSION) return;

  await _importCUBIcons();

  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) actors.push(token.actor);
    }
  }

  for (const actor of actors) {
    const legacy = actor.effects.filter(e => {
      const statusId = e.getFlag("core", "statusId");
      return statusId && STATUS_BY_ID.has(statusId) && !e.statuses.size;
    });
    const cub = actor.effects.filter(e => e.getFlag("combat-utility-belt", "conditionId"));
    const toDelete = [...legacy, ...cub].map(e => e.id);
    if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);

    // Combat Utility Belt conditions become the matching LH status (by name).
    const fieldUpdates = {};
    for (const effect of cub) {
      const status = _statusFromCUBName(effect.name);
      if (!status) continue;
      if (status.path) {
        const value = _fieldValue(actor, status);
        if (value !== undefined && !_isFieldActive(status, value)) fieldUpdates[`system.${status.path}`] = status.rated ? 1 : true;
      }
      else await actor.toggleStatusEffect(status.id, { active: true });
    }
    if (!foundry.utils.isEmpty(fieldUpdates)) await actor.update(fieldUpdates, { render: false, lhStatusMigration: true });

    for (const status of LH_STATUSES) {
      if (status.path) await _syncEffectFromField(actor, status);
    }

    // Status effects created before an icon change keep their old icon.
    const iconUpdates = [];
    for (const effect of actor.effects) {
      if (effect.statuses.size !== 1) continue;
      const img = getStatusIcon([...effect.statuses][0]);
      if (img && (effect.img !== img) && STATUS_BY_ID.has([...effect.statuses][0])) iconUpdates.push({ _id: effect.id, img });
    }
    if (iconUpdates.length) await actor.updateEmbeddedDocuments("ActiveEffect", iconUpdates);
  }

  await game.settings.set("lhtrpg", "statusMigrationVersion", MIGRATION_VERSION);
  console.log(`Log Horizon TRPG | Migrated statuses of ${actors.length} actors`);
}

/**
 * Use the icons of the world's Combat Utility Belt condition map, if the world had one.
 */
async function _importCUBIcons() {
  const current = game.settings.get("lhtrpg", "statusIcons") ?? {};
  if (!foundry.utils.isEmpty(current)) return;
  const setting = game.settings.storage.get("world").find(s => s.key === "combat-utility-belt.activeConditionMap");
  let conditions = setting?.value;
  if (typeof conditions === "string") {
    try { conditions = JSON.parse(conditions); } catch (err) { return; }
  }
  if (!Array.isArray(conditions)) return;

  const icons = {};
  for (const condition of conditions) {
    const status = _statusFromCUBName(condition.name);
    if (status && condition.icon && !icons[status.id]) icons[status.id] = condition.icon;
  }
  if (!foundry.utils.isEmpty(icons)) await game.settings.set("lhtrpg", "statusIcons", icons);
}

/**
 * Match a CUB condition name ("Pursuit 2", "Hate TOP"...) to a LH status.
 */
function _statusFromCUBName(name) {
  const key = (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return LH_STATUSES.find(s => s.id.toLowerCase() === key);
}
