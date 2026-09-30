/**
 * Log Horizon TRPG statuses (Rules v0.3, VI.a. STATUSES).
 *
 * Every status is registered as a Foundry status effect, so it can be toggled from the Token HUD
 * and is drawn on the token like any other status. Statuses backed by an actor data field (the
 * `system.bad-status.*` checkboxes/ratings, `system.infos.fatigue`) are kept in sync both ways:
 * editing the field in the sheet adds/removes the effect, and toggling the effect from the HUD
 * updates the field. Statuses without a field are stored only as the effect.
 */

import { canonicalTag } from "./tag-catalog.mjs";
import { isLocalChange } from "./clients.mjs";

const ICONS_PATH = "systems/lhtrpg/assets/ui/status";

/**
 * @typedef {object} LHStatus
 * @property {string} id         Status id (also the ActiveEffect status).
 * @property {string} group      life | bad | combat | other
 * @property {string} img
 * @property {string} [path]     Actor field (relative to `system`) mirroring this status.
 * @property {boolean} [rated]   The field holds a Rating (number) instead of a boolean.
 * @property {boolean} [list]    The field holds a list of Ratings: the status can be applied
 *                               several times, from different sources (e.g. Pursuit).
 * @property {boolean} [tagged]  List entries are `{ value, tag }`: the status only applies to damage
 *                               with that tag ([Weakness (Flame): 5]); no tag = any damage.
 * @property {string[]} [types]  Actor types that show this status in their sheet (default: all).
 */

/** @type {LHStatus[]} */
export const LH_STATUSES = [
  // Life Statuses
  { id: "fatigue", group: "life", img: `${ICONS_PATH}/fatigue.svg`, path: "infos.fatigue", rated: true, types: ["character"] },
  { id: "weakness", group: "life", img: `${ICONS_PATH}/weakness.svg`, path: "bad-status.weaknesses", list: true, tagged: true },
  { id: "incapacitated", group: "life", img: `${ICONS_PATH}/incapacitated.svg` },
  { id: "dead", group: "life", img: `${ICONS_PATH}/dead.svg` },
  // Bad Statuses
  { id: "staggered", group: "bad", img: `${ICONS_PATH}/staggered.svg`, path: "bad-status.staggered" },
  { id: "dazed", group: "bad", img: `${ICONS_PATH}/dazed.svg`, path: "bad-status.dazed" },
  { id: "rigor", group: "bad", img: `${ICONS_PATH}/rigor.svg`, path: "bad-status.rigor" },
  { id: "confused", group: "bad", img: `${ICONS_PATH}/confused.svg`, path: "bad-status.confused" },
  { id: "decay", group: "bad", img: `${ICONS_PATH}/decay.svg`, path: "bad-status.decay", rated: true },
  { id: "pursuit", group: "bad", img: `${ICONS_PATH}/pursuit.svg`, path: "bad-status.pursuits", list: true },
  { id: "afflicted", group: "bad", img: `${ICONS_PATH}/afflicted.svg`, path: "bad-status.afflicted" },
  { id: "overconfident", group: "bad", img: `${ICONS_PATH}/overconfident.svg`, path: "bad-status.overconfident" },
  // Combat Statuses
  { id: "regen", group: "combat", img: `${ICONS_PATH}/regen.svg`, path: "bad-status.regen", rated: true },
  { id: "cancel", group: "combat", img: `${ICONS_PATH}/cancel.svg`, path: "bad-status.cancels", list: true, tagged: true },
  { id: "barrier", group: "combat", img: `${ICONS_PATH}/barrier.svg`, path: "bad-status.barrier", rated: true },
  // Other Statuses
  { id: "hidden", group: "other", img: `${ICONS_PATH}/hidden.svg` },
  { id: "swimming", group: "other", img: `${ICONS_PATH}/swimming.svg` },
  { id: "flying", group: "other", img: `${ICONS_PATH}/flying.svg` },
  { id: "identified", group: "other", img: `${ICONS_PATH}/identified.svg`, types: ["monster"] },
  { id: "standby", group: "other", img: `${ICONS_PATH}/standby.svg` },
  { id: "hateTop", group: "other", img: `${ICONS_PATH}/hateTop.svg` },
  { id: "hateUnder", group: "other", img: `${ICONS_PATH}/hateUnder.svg` },
  { id: "absent", group: "other", img: `${ICONS_PATH}/absent.svg` }
];

/** Status that hides the token from everyone but its owners and the GM. */
export const HIDDEN_STATUS = "hidden";

/** Status groups, in the order they are shown in the sheets. */
export const LH_STATUS_GROUPS = ["bad", "life", "combat", "other"];

const STATUS_BY_ID = new Map(LH_STATUSES.map(s => [s.id, s]));
const MIGRATION_VERSION = 5;

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

/**
 * Replace the core status effects with the Log Horizon ones and register the sync hooks.
 * Call during the `init` hook.
 */
export function registerStatuses() {
  CONFIG.statusEffects = LH_STATUSES.map(s => ({
    id: s.id,
    // Static id: a status can only exist once per actor, even with concurrent toggles.
    _id: `lh${s.id}`.padEnd(16, "0"),
    name: `LHTRPG.StatusEffect.${s.id}`,
    img: s.img
  }));
  CONFIG.specialStatusEffects.DEFEATED = "dead";

  Hooks.on("updateActor", _onUpdateActor);
  Hooks.on("createActiveEffect", (effect, options, userId) => _onStatusEffectChange(effect, true, options, userId));
  Hooks.on("deleteActiveEffect", (effect, options, userId) => _onStatusEffectChange(effect, false, options, userId));
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, _refreshHiddenTokens);
  }
  // Combat tracker "hide" <-> [Hidden]
  Hooks.on("updateCombatant", _onUpdateCombatant);
  Hooks.on("preCreateCombatant", _onPreCreateCombatant);
  Hooks.on("createActiveEffect", (effect, options, userId) => _syncCombatantsHidden(effect, options, userId));
  Hooks.on("deleteActiveEffect", (effect, options, userId) => _syncCombatantsHidden(effect, options, userId));
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
          img: s.img,
          field: s.path ? `system.${s.path}` : null,
          rated: !!s.rated,
          list: !!s.list,
          tagged: !!s.tagged,
          value: s.list ? _listValue(value, s.tagged) : s.rated ? (Number(value) || 0) : value,
          active: actor.statuses.has(s.id)
        };
      })
  }));
}

/**
 * Listeners of the status panel's list statuses (Pursuit, Weakness, Cancel): add the Rating (and
 * Tag) typed next to the status as a new entry, edit an entry, or remove it.
 * @param {jQuery|HTMLElement} html
 * @param {Actor} actor
 */
export function activateStatusPanelListeners(html, actor) {
  const root = html instanceof HTMLElement ? html : (html?.[0] ?? html);
  if (!root?.querySelectorAll) return;

  const update = (statusId, fn) => {
    const status = STATUS_BY_ID.get(statusId);
    if (!status?.list) return;
    const values = [..._listValue(_fieldValue(actor, status), status.tagged)];
    fn(values, status);
    actor.update({ [`system.${status.path}`]: values });
  };
  const add = row => {
    if (!row) return;
    const input = row.querySelector(".lh-status-list-input");
    if (!input) return;
    const rating = Math.floor(Number(input.value) || 0);
    if (rating <= 0) return;
    const tag = row.querySelector(".lh-status-list-tag")?.value.trim() ?? "";
    update(input.dataset.statusId, (values, status) => values.push(status.tagged ? { value: rating, tag } : rating));
  };

  for (const el of root.querySelectorAll(".lh-status-list-add")) {
    el.addEventListener("click", ev => {
      ev.preventDefault();
      add(ev.currentTarget.closest("[data-add-row]"));
    });
  }
  for (const el of root.querySelectorAll(".lh-status-list-input, .lh-status-list-tag")) {
    el.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      add(ev.currentTarget.closest("[data-add-row]"));
    });
  }
  for (const el of root.querySelectorAll(".lh-status-entry-input")) {
    el.addEventListener("change", ev => {
      ev.stopPropagation();
      const { statusId, index } = ev.currentTarget.dataset;
      const rating = Math.floor(Number(ev.currentTarget.value) || 0);
      update(statusId, (values, status) => {
        if (rating <= 0) return values.splice(index, 1);
        values.splice(index, 1, status.tagged ? { ...values[index], value: rating } : rating);
      });
    });
  }
  for (const el of root.querySelectorAll(".lh-status-entry-tag")) {
    el.addEventListener("change", ev => {
      ev.stopPropagation();
      const { statusId, index } = ev.currentTarget.dataset;
      const tag = ev.currentTarget.value.trim();
      update(statusId, values => { if (values[index]) values[index] = { ...values[index], tag }; });
    });
  }
  for (const el of root.querySelectorAll(".lh-status-entry-remove")) {
    el.addEventListener("click", ev => {
      ev.preventDefault();
      const { statusId, index } = ev.currentTarget.dataset;
      update(statusId, values => values.splice(index, 1));
    });
  }
}

/* -------------------------------------------- */
/*  Field <-> effect sync                       */
/* -------------------------------------------- */

function _fieldValue(actor, status) {
  const value = foundry.utils.getProperty(actor._source.system, status.path);
  return status.list ? _listValue(value, status.tagged) : value;
}

/**
 * Entries of a list status, ignoring empty/invalid ones: Ratings, or `{ value, tag }` when tagged.
 * @param {*} value
 * @param {boolean} [tagged]
 * @returns {Array<number|{value: number, tag: string}>}
 */
export function listStatusEntries(value, tagged = false) {
  const list = Array.isArray(value) ? value : [];
  if (!tagged) return list.map(v => Number(v) || 0).filter(v => v > 0);
  return list
    .map(v => (v && (typeof v === "object"))
      ? { value: Math.floor(Number(v.value) || 0), tag: String(v.tag ?? "").trim() }
      : { value: Math.floor(Number(v) || 0), tag: "" })
    .filter(e => e.value > 0);
}
const _listValue = listStatusEntries;

function _isFieldActive(status, value) {
  if (status.list) return _listValue(value, status.tagged).length > 0;
  return status.rated ? (Number(value) || 0) > 0 : !!value;
}

/** Field value of a status just added from the HUD, and of one just removed. */
function _activeFieldValue(status) {
  if (status.list) return status.tagged ? [{ value: 1, tag: "" }] : [1];
  return status.rated ? 1 : true;
}

function _inactiveFieldValue(status) {
  return status.list ? [] : status.rated ? 0 : false;
}

function _effectName(status, value) {
  const label = game.i18n.localize(`LHTRPG.StatusEffect.${status.id}`);
  if (status.list) {
    const entries = _listValue(value, status.tagged).map(e => status.tagged ? (e.tag ? `(${e.tag}) ${e.value}` : e.value) : e);
    return `${label}: ${entries.join(" / ")}`;
  }
  return status.rated ? `${label}: ${Number(value) || 0}` : label;
}

/** The LH status data of an effect (flags.lhtrpg.statusData), if any. */
function _statusData(effect) {
  const data = effect.getFlag?.("lhtrpg", "statusData");
  return data?.statusId ? data : null;
}

/**
 * Effects of the actor that mirror a status: the plain status effects (HUD, one status, no status
 * data: renamed with the field) and the effects that carry that status with its own Rating/Tag.
 */
function _findStatusEffects(actor, statusId) {
  const hud = [];
  const data = [];
  for (const effect of actor.effects) {
    const statusData = _statusData(effect);
    if (statusData) {
      if (statusData.statusId === statusId) data.push(effect);
    } else if ((effect.statuses.size === 1) && effect.statuses.has(statusId)) hud.push(effect);
  }
  return { hud, data };
}

/**
 * Make the status effect of `status` match the actor's field.
 */
async function _syncEffectFromField(actor, status) {
  const value = _fieldValue(actor, status);
  if (value === undefined) return;
  const active = _isFieldActive(status, value);
  const { hud, data } = _findStatusEffects(actor, status.id);

  // Clearing the field (sheet) removes the status, whatever gave it.
  if (!active) {
    const ids = [...hud, ...data].map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return;
  }

  // Effects with their own Rating/Tag already show the status: no plain one next to them.
  if (data.length) {
    if (hud.length) await actor.deleteEmbeddedDocuments("ActiveEffect", hud.map(e => e.id));
    return;
  }

  const name = _effectName(status, value);
  if (hud.length) {
    if (hud[0].name !== name) await hud[0].update({ name });
    return;
  }

  const effect = await ActiveEffect.implementation.fromStatusEffect(status.id);
  effect.updateSource({ name });
  await ActiveEffect.implementation.create(effect, { parent: actor, keepId: true });
}

function _onUpdateActor(actor, changes, options, userId) {
  if (!isLocalChange(options, userId) || options.lhStatusMigration) return;
  for (const status of LH_STATUSES) {
    if (!status.path) continue;
    if (!foundry.utils.hasProperty(changes, `system.${status.path}`)) continue;
    _queueSync(actor, status);
  }
}

/** Pending field -> effect syncs, by actor and status. */
const _syncQueue = new Map();

/**
 * Run the syncs of one actor's status one after another: a token actor's update can fire this
 * hook twice, and two syncs at once would both create the (fixed id) status effect.
 */
function _queueSync(actor, status) {
  const key = `${actor.uuid}.${status.id}`;
  const next = (_syncQueue.get(key) ?? Promise.resolve())
    .then(() => _syncEffectFromField(actor, status))
    .catch(err => console.error(`Log Horizon TRPG | Could not sync ${status.id} of ${actor.uuid}`, err));
  _syncQueue.set(key, next);
  next.then(() => { if (_syncQueue.get(key) === next) _syncQueue.delete(key); });
}

/** Pending field updates from status effect changes, by actor and status. */
const _fieldUpdateQueue = new Map();

/**
 * Queue status field changes by actor+status to prevent race conditions when multiple
 * effects are created/deleted in the same tick.
 */
function _queueFieldUpdate(actor, status, fn) {
  const key = `${actor.uuid}.${status.id}`;
  const next = (_fieldUpdateQueue.get(key) ?? Promise.resolve())
    .then(() => fn())
    .catch(err => console.error(`Log Horizon TRPG | Could not update status field ${status.id} on ${actor.uuid}`, err));
  _fieldUpdateQueue.set(key, next);
  next.then(() => { if (_fieldUpdateQueue.get(key) === next) _fieldUpdateQueue.delete(key); });
  return next;
}

async function _applyStatusDataOnCreate(actor, status, statusData) {
  const value = _fieldValue(actor, status);
  if (value === undefined) return;

  if (status.rated) {
    const effVal = Math.floor(Number(statusData.value) || 0) || 1;
    const currentVal = Number(value) || 0;
    const maxVal = Math.max(currentVal, effVal);
    if (maxVal !== currentVal) {
      await actor.update({ [`system.${status.path}`]: maxVal });
    }
  } else if (status.list) {
    const effVal = Math.floor(Number(statusData.value) || 0) || 1;
    const currentList = [..._listValue(value, status.tagged)];
    let entry;
    if (status.tagged) {
      const tag = canonicalTag(statusData.tag ?? "");
      entry = { value: effVal, tag };
    } else {
      entry = effVal;
    }
    currentList.push(entry);
    await actor.update({ [`system.${status.path}`]: currentList });
  } else {
    if (!value) {
      await actor.update({ [`system.${status.path}`]: true });
    }
  }
}

async function _applyStatusDataOnDelete(actor, status, statusData, deletedEffect) {
  const value = _fieldValue(actor, status);
  if (value === undefined) return;

  if (status.list) {
    const effVal = Math.floor(Number(statusData.value) || 0) || 1;
    const currentList = [..._listValue(value, status.tagged)];
    let index = -1;
    if (status.tagged) {
      const effTag = canonicalTag(statusData.tag ?? "");
      index = currentList.findIndex(e => (Number(e?.value) === effVal) && (canonicalTag(e?.tag ?? "") === effTag));
    } else {
      index = currentList.findIndex(e => Number(e) === effVal);
    }
    if (index >= 0) {
      currentList.splice(index, 1);
      await actor.update({ [`system.${status.path}`]: currentList });
    }
  } else if (status.rated) {
    const currentVal = Number(value) || 0;
    const effVal = Math.floor(Number(statusData.value) || 0) || 1;
    if (currentVal > effVal) return;

    // Decision D1: back to the highest Rating of the other effects of this status, or 0.
    const maxRemaining = _findStatusEffects(actor, status.id).data
      .filter(e => e.id !== deletedEffect.id)
      .reduce((max, e) => Math.max(max, Math.floor(Number(_statusData(e).value) || 0)), 0);

    if (maxRemaining !== currentVal) {
      await actor.update({ [`system.${status.path}`]: maxRemaining });
    }
  } else {
    const hasOther = actor.effects.some(e => (e.id !== deletedEffect.id) && e.statuses.has(status.id));
    if (!hasOther && value) {
      await actor.update({ [`system.${status.path}`]: false });
    }
  }
}

/**
 * A status effect was added/removed (Token HUD, sheet, macro...): update the mirrored field.
 */
function _onStatusEffectChange(effect, created, options, userId) {
  // Only the window that made the change acts, to avoid duplicated updates.
  if (!isLocalChange(options, userId)) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  const statusData = _statusData(effect);
  const handledStatuses = new Set();

  if (statusData) {
    const status = STATUS_BY_ID.get(statusData.statusId);
    if (status?.path) {
      handledStatuses.add(status.id);
      _queueFieldUpdate(actor, status, async () => {
        if (created) {
          await _applyStatusDataOnCreate(actor, status, statusData);
        } else {
          await _applyStatusDataOnDelete(actor, status, statusData, effect);
        }
      });
    }
  }

  // Other statuses (HUD, core multiselect): decided NOW, from the field as it is when the effect changes.
  // Not queued: the plain status effect is also created/deleted BY the field sync, and reading the field
  // later (after the user cleared it) would turn it back on, in a loop.
  const updates = {};
  for (const statusId of effect.statuses) {
    if (handledStatuses.has(statusId)) continue;
    const status = STATUS_BY_ID.get(statusId);
    if (!status?.path) continue;
    const value = _fieldValue(actor, status);
    if (value === undefined) continue;
    if (created && !_isFieldActive(status, value)) {
      updates[`system.${status.path}`] = _activeFieldValue(status);
    } else if (!created && _isFieldActive(status, value)
      && !actor.effects.some(e => (e.id !== effect.id) && e.statuses.has(statusId))) {
      updates[`system.${status.path}`] = _inactiveFieldValue(status);
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
  if (!isLocalChange(options, userId) || !("hidden" in changes)) return;
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
function _syncCombatantsHidden(effect, options, userId) {
  if (!isLocalChange(options, userId) || !effect.statuses.has(HIDDEN_STATUS)) return;
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
async function migrateStatuses() {
  // Icon overrides imported from Combat Utility Belt (third-party art) are no longer used.
  await game.settings.storage.get("world").find(s => s.key === "lhtrpg.statusIcons")?.delete();

  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) actors.push(token.actor);
    }
  }

  let failed = 0;
  for (const actor of actors) {
    try {
      await migrateActorStatuses(actor);
    } catch (err) {
      failed++;
      console.error(`Log Horizon TRPG | Could not migrate the statuses of ${actor.uuid}`, err);
    }
  }

  console.log(`Log Horizon TRPG | Migrated statuses of ${actors.length - failed}/${actors.length} actors`);
  return true;
}

/** World migration (see helpers/migrations.mjs). */
export const STATUSES_MIGRATION = {
  id: "statuses", setting: "statusMigrationVersion", version: MIGRATION_VERSION, run: migrateStatuses
};

/**
 * Migrate one actor's statuses: replace legacy and Combat Utility Belt effects with LH status
 * effects, create the effects of fields that are already set, and refresh status icons.
 * @param {Actor} actor
 */
export async function migrateActorStatuses(actor) {
  const legacy = actor.effects.filter(e => {
    const statusId = e.getFlag("core", "statusId");
    return statusId && STATUS_BY_ID.has(statusId) && !e.statuses.size;
  });
  // Combat Utility Belt conditions with a LH equivalent (by name) are replaced by that status;
  // the rest (e.g. Asleep) are left as they are. CUB is not active, so getFlag() would throw.
  const cub = actor.effects
    .filter(e => foundry.utils.getProperty(e.flags, "combat-utility-belt.conditionId"))
    .map(effect => ({ effect, status: _statusFromCUBName(effect.name) }))
    .filter(c => c.status);
  const toDelete = [...legacy, ...cub.map(c => c.effect)].map(e => e.id);
  if (toDelete.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);

  const fieldUpdates = {};
  // v4: Pursuit went from a single Rating to a list of Ratings
  const badStatus = actor._source.system["bad-status"];
  if (badStatus && ("pursuit" in badStatus)) {
    const pursuit = Number(badStatus.pursuit) || 0;
    const pursuits = _listValue(badStatus.pursuits);
    if ((pursuit > 0) && !pursuits.length) pursuits.push(pursuit);
    fieldUpdates["system.bad-status.pursuits"] = pursuits;
    fieldUpdates["system.bad-status.-=pursuit"] = null;
  }
  // v5: Weakness and Cancel went from a single Rating to a list of `{ value, tag }`
  for (const [old, list] of [["weakness", "weaknesses"], ["cancel", "cancels"]]) {
    if (!badStatus || !(old in badStatus)) continue;
    const rating = Number(badStatus[old]) || 0;
    const entries = _listValue(badStatus[list], true);
    if ((rating > 0) && !entries.length) entries.push({ value: rating, tag: "" });
    fieldUpdates[`system.bad-status.${list}`] = entries;
    fieldUpdates[`system.bad-status.-=${old}`] = null;
  }
  for (const { status } of cub) {
    if (status.path) {
      const value = _fieldValue(actor, status);
      const key = `system.${status.path}`;
      if (value !== undefined && !_isFieldActive(status, fieldUpdates[key] ?? value)) fieldUpdates[key] = _activeFieldValue(status);
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
    if ((effect.statuses.size !== 1) || _statusData(effect)) continue;
    const img = STATUS_BY_ID.get([...effect.statuses][0])?.img;
    if (img && (effect.img !== img)) iconUpdates.push({ _id: effect.id, img });
  }
  if (iconUpdates.length) await actor.updateEmbeddedDocuments("ActiveEffect", iconUpdates);
}

/**
 * Match a CUB condition name ("Pursuit 2", "Hate TOP"...) to a LH status.
 */
function _statusFromCUBName(name) {
  const key = (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return LH_STATUSES.find(s => s.id.toLowerCase() === key);
}
