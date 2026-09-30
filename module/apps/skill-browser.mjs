/**
 * Skill selection window (in the spirit of the PF2e Compendium Browser): Combat / General / Basic tabs,
 * search and source filter over every skill of the Item compendiums, and a selection confirmed at
 * once. A skill is either acquired (SR 1) or, when the character has it, raised by one SR, never
 * beyond its Maximum SR or the character's CR.
 *
 * At character creation and after a CR Up the character has skills to choose
 * (`flags.lhtrpg.skillProgress`): the window counts them down. Opened from the sheet without pending
 * picks it has no quota. Basic skills are never counted.
 *
 * Which skills a character can learn comes from the compendium folders: Archetype (Warrior, Weapon
 * Master...), Main Class (Guardian...), Race (Human...) and Common, plus the skills its Subclass
 * allows (`system.skills` of the Subclass item).
 */

import { getOption } from "../helpers/character-options.mjs";
import { isLocalChange } from "../helpers/clients.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Skill subtypes counted in the picks of a character (creation, CR Up). */
export const PICK_SUBTYPES = ["Combat", "General"];

/** Tabs of the window: the counted subtypes, then the Basic skills. */
const TABS = [...PICK_SUBTYPES, "Basic"];

/**
 * Flag of the skill picks record of a character: { base, creation }. The picks it is owed are worked
 * out from its CR: the creation picks (when `creation`), then those of each rank from base + 1 to its
 * CR. `base` is the CR the count starts from (1 for a character made with the creation picks, the CR
 * of its first CR Up otherwise).
 */
export const PROGRESS_FLAG = "skillProgress";

/**
 * Hidden mark of the skills chosen in the window (only picks that count): a list of
 * { rank, subtype, kind: "new" | "raise", fromSR }, one per pick, with the CR it was made at. The
 * picks spent are counted from these marks, and lowering the CR or removing the Main Class offers to
 * undo the marked picks (delete the skill / give back the SR).
 */
export const PICK_FLAG = "skillPicks";

/** Skills chosen at character creation, besides the three automatic ones of the Main Class. */
const CREATION_SKILLS = { combat: 3, general: 1 };

/** [Training] skills a character can acquire at creation. */
const CREATION_TRAINING = 2;
const TRAINING_TAG = "training";

/** CR from which a rank up grants one Combat skill instead of two. */
const LATE_RANK = 11;

/** Skills a character acquires or ranks up when reaching a CR. */
export function rankUpSkills(rank) {
  return { combat: (rank >= LATE_RANK) ? 1 : 2, general: 1 };
}

/** Compendium folder names of each archetype (the Skill List calls Weapon Attackers "Weapon Master"). */
const ARCHETYPE_FOLDERS = {
  warrior: ["warrior"],
  weaponAttacker: ["weapon master", "weapon attacker"],
  healer: ["healer"],
  mage: ["mage"]
};

/** Folder of the skills every character can learn. */
const COMMON_FOLDER = "common";

/** Compendiums of the Basic skills a character can take (not the GM EX Powers nor monster skills). */
const BASIC_PACKS = ["lhtrpg.skills-basic", "lhtrpg.skills-mounts"];

/** Source filter values, in display order. */
const SOURCES = ["eligible", "archetype", "class", "race", "subclass", "common", "all"];

/* -------------------------------------------- */
/*  Index                                       */
/* -------------------------------------------- */

const INDEX_FIELDS = ["system.subtype", "system.skillRank", "system.tags", "folder"];

let indexPromise = null;

/** Forget the index (a skill changed in a compendium, or the compendiums changed). */
export function clearSkillIndex() {
  indexPromise = null;
}

/** Every Combat / General / Basic skill of the visible Item compendiums. */
function getSkillIndex() {
  indexPromise ??= buildIndex();
  return indexPromise;
}

async function buildIndex() {
  const entries = [];
  for (const pack of game.packs) {
    if ((pack.documentName !== "Item") || !pack.visible) continue;
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    for (const e of index) {
      if ((e.type !== "skill") || !TABS.includes(e.system?.subtype)) continue;
      // Folder placeholders left in the compendiums by the old Compendium Folders module.
      if (e.name?.startsWith("#[CF_tempEntity]")) continue;
      // Folder names from the skill up to the root, lowercased, to match archetypes / classes / races.
      const folders = [];
      let folder = e.folder ? pack.folders.get(e.folder) : null;
      while (folder) {
        folders.push(folder.name);
        folder = folder.folder;
      }
      entries.push({
        uuid: e.uuid ?? pack.getUuid(e._id),
        name: e.name,
        img: e.img,
        subtype: e.system.subtype,
        maxSR: Number(e.system.skillRank?.max) || 1,
        tags: e.system.tags ?? [],
        folder: folders[0] ?? "",
        folders: folders.map(f => f.toLowerCase()),
        pack: pack.title,
        packId: pack.collection
      });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function normalize(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * Where a character can learn a skill from: "archetype", "class", "race", "common" or null.
 * @param {object} entry  Index entry
 * @param {{archetype: string[], class: string, race: string, subclass: Set<string>}} lists  The character's skill lists
 */
function sourceOf(entry, lists) {
  // Basic skills of the system compendiums belong to every character.
  if (entry.subtype === "Basic") return BASIC_PACKS.includes(entry.packId) ? "basic" : null;
  const folders = entry.folders;
  if (lists.class && folders.includes(lists.class)) return "class";
  if (lists.archetype.some(f => folders.includes(f))) return "archetype";
  if (lists.race && folders.includes(lists.race)) return "race";
  if (lists.subclass.has(entry.uuid)) return "subclass";
  if (folders.includes(COMMON_FOLDER)) return "common";
  return null;
}

/** The skill lists of a character: its archetype folders, class name, race name and Subclass skills. */
function skillLists(actor) {
  const job = getOption(actor, "class");
  return {
    archetype: ARCHETYPE_FOLDERS[job?.system.archetype] ?? [],
    class: normalize(job?.name),
    race: normalize(getOption(actor, "race")?.name),
    subclass: new Set(getOption(actor, "subclass")?.system.skills ?? [])
  };
}

/** The character's copy of a skill (same compendium entry, or same name). */
function ownedSkill(actor, entry) {
  return actor.items.find(i => (i.type === "skill")
    && ((i._stats?.compendiumSource === entry.uuid) || (normalize(i.name) === normalize(entry.name))));
}

/* -------------------------------------------- */
/*  Pending picks                               */
/* -------------------------------------------- */

function rankOf(actor) {
  return Number(actor.system.infos?.crank) || 1;
}

/** Skill picks record of a character, or null when it has none. */
function getProgress(actor) {
  return actor.getFlag("lhtrpg", PROGRESS_FLAG) ?? null;
}

/** Skills a character is owed at its CR: { Combat, General }. */
function ownedPicks(actor, progress) {
  const picks = { Combat: 0, General: 0 };
  if (progress.creation) {
    picks.Combat += CREATION_SKILLS.combat;
    picks.General += CREATION_SKILLS.general;
  }
  for (let rank = (Number(progress.base) || 1) + 1; rank <= rankOf(actor); rank++) {
    const skills = rankUpSkills(rank);
    picks.Combat += skills.combat;
    picks.General += skills.general;
  }
  return picks;
}

/** Marked picks of a skill item. */
function picksOf(item) {
  const picks = item.getFlag("lhtrpg", PICK_FLAG);
  return Array.isArray(picks) ? picks : [];
}

/** Picks the character has spent: { Combat, General }. */
function spentPicks(actor) {
  const spent = { Combat: 0, General: 0 };
  for (const item of actor.items) {
    if (item.type !== "skill") continue;
    for (const pick of picksOf(item)) if (pick.subtype in spent) spent[pick.subtype] += 1;
  }
  return spent;
}

/** Skills a character still has to choose: { Combat, General } (none without a Main Class). */
export function getPendingSkills(actor) {
  const progress = getProgress(actor);
  if (!progress || !getOption(actor, "class")) return { Combat: 0, General: 0 };
  const owed = ownedPicks(actor, progress);
  const spent = spentPicks(actor);
  return Object.fromEntries(PICK_SUBTYPES.map(s => [s, Math.max(0, owed[s] - spent[s])]));
}

function isTraining(entry) {
  return (entry.tags ?? []).some(t => normalize(t) === TRAINING_TAG);
}

/** [Training] skills the character can still acquire (at creation), or null when there is no such limit. */
function getTrainingLimit(actor) {
  const progress = getProgress(actor);
  if (!progress?.creation || (rankOf(actor) > 1)) return null;
  const acquired = actor.items.filter(i => (i.type === "skill") && isTraining(i.system)
    && picksOf(i).some(p => (p.kind === "new") && (p.rank === 1))).length;
  return Math.max(0, CREATION_TRAINING - acquired);
}

/**
 * Start counting the skill picks of a character that has no record yet: from its current CR, before
 * its first CR Up.
 * @param {Actor} actor
 */
export async function startSkillProgress(actor) {
  if (getProgress(actor)) return;
  await actor.setFlag("lhtrpg", PROGRESS_FLAG, { base: rankOf(actor), creation: false });
}

/**
 * A Main Class was taken: at CR 1 the character gets its creation picks, the three Combat skills and
 * the General skill (at most two [Training] skills); then the selection opens when there are picks
 * to choose. A CR 1 character with skills of its own and no record (made before this existed)
 * doesn't get creation picks.
 * @param {Actor} actor
 */
export async function offerClassSkills(actor) {
  if ((rankOf(actor) === 1) && !getProgress(actor)?.creation) {
    const chosen = actor.items.some(i => (i.type === "skill") && PICK_SUBTYPES.includes(i.system.subtype)
      && !i.getFlag("lhtrpg", "grantedBy") && !picksOf(i).length);
    if (getProgress(actor) || !chosen) await actor.setFlag("lhtrpg", PROGRESS_FLAG, { base: 1, creation: true });
  }
  const pending = getPendingSkills(actor);
  if (PICK_SUBTYPES.some(s => pending[s] > 0)) return SkillBrowser.open(actor);
}

/* -------------------------------------------- */
/*  Undoing picks                               */
/* -------------------------------------------- */

/** Actor id -> Promise of the undo dialog in progress (the class selection waits for it). */
const rollbacks = new Map();

/** Wait for the undo dialog of a character, if one is open. */
export function waitForRollback(actor) {
  return rollbacks.get(actor.id);
}

/**
 * Offer to undo marked picks: the skills acquired are deleted, the SR raised given back. The skills
 * the user keeps lose the marks of those picks (they no longer count as picks).
 * @param {Actor} actor
 * @param {object} options
 * @param {number} [options.aboveRank]  Undo the picks made above this CR (CR lowered); all when omitted
 * @param {string} options.reason       Localization key of the dialog hint
 * @returns {Promise<void>}
 */
export function rollbackPicks(actor, { aboveRank = 0, reason }) {
  const previous = rollbacks.get(actor.id) ?? Promise.resolve();
  const run = previous.then(() => rollbackDialog(actor, aboveRank, reason)).finally(() => {
    if (rollbacks.get(actor.id) === run) rollbacks.delete(actor.id);
  });
  rollbacks.set(actor.id, run);
  return run;
}

async function rollbackDialog(actor, aboveRank, reason) {
  const rows = [];
  for (const item of actor.items) {
    if (item.type !== "skill") continue;
    const undone = picksOf(item).filter(p => p.rank > aboveRank);
    if (!undone.length) continue;
    const acquired = undone.some(p => p.kind === "new");
    // Back to the SR before the first pick undone.
    const fromSR = Math.min(...undone.filter(p => p.kind === "raise").map(p => Number(p.fromSR) || 1));
    const sr = Number(item.system.skillRank?.value) || 1;
    rows.push({
      id: item.id,
      name: item.name,
      img: item.img,
      acquired,
      fromSR,
      action: acquired
        ? game.i18n.localize("LHTRPG.SkillBrowser.Undo.Delete")
        : game.i18n.format("LHTRPG.SkillBrowser.Undo.Lower", { from: sr, to: fromSR }),
      ranks: [...new Set(undone.map(p => p.rank))].sort((x, y) => x - y).join(", ")
    });
  }
  if (!rows.length) return;

  const { DialogV2 } = foundry.applications.api;
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/lhtrpg/templates/apps/skill-undo.hbs",
    { rows, hint: game.i18n.format(reason, { name: actor.name, rank: aboveRank }) }
  );
  const data = await DialogV2.wait({
    window: { title: game.i18n.format("LHTRPG.SkillBrowser.Undo.Title", { name: actor.name }), icon: "fa-solid fa-rotate-left" },
    classes: ["lhtrpg", "skill-undo"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "apply",
        label: "LHTRPG.SkillBrowser.Undo.Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "keep", label: "LHTRPG.SkillBrowser.Undo.Keep", icon: "fa-solid fa-xmark", callback: () => ({}) }
    ],
    rejectClose: false
  });
  // Closing the dialog keeps everything, like "Keep".
  const chosen = (data && (typeof data === "object")) ? data : {};

  const toDelete = [];
  const toUpdate = [];
  for (const row of rows) {
    const item = actor.items.get(row.id);
    const kept = picksOf(item).filter(p => p.rank <= aboveRank);
    if (chosen[row.id] && row.acquired) toDelete.push(row.id);
    else if (chosen[row.id]) toUpdate.push({ _id: row.id, "system.skillRank.value": row.fromSR, [`flags.lhtrpg.${PICK_FLAG}`]: kept });
    else toUpdate.push({ _id: row.id, [`flags.lhtrpg.${PICK_FLAG}`]: kept });
  }
  if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);
  if (toUpdate.length) await actor.updateEmbeddedDocuments("Item", toUpdate);
}

/* -------------------------------------------- */
/*  Window                                      */
/* -------------------------------------------- */

export class SkillBrowser extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, options = {}) {
    super({ ...options, id: SkillBrowser.idFor(actor) });
    this.actor = actor;
    this.tab = options.tab ?? "Combat";
    this.source = "eligible";
    this.query = "";
    /** uuid -> index entry picked (acquire or raise one SR) */
    this.picks = new Map();
    /** uuids whose description is shown */
    this.expanded = new Set();
    /** uuid -> enriched description */
    this.descriptions = new Map();
  }

  static idFor(actor) {
    return `lhtrpg-skill-browser-${actor.id}`;
  }

  /**
   * Open the window of a character (one per character).
   * @param {Actor} actor
   * @param {object} [options]
   * @param {string} [options.tab]  "Combat" or "General"
   */
  static open(actor, { tab } = {}) {
    const existing = foundry.applications.instances.get(SkillBrowser.idFor(actor));
    if (existing) {
      if (tab) existing.tab = tab;
      return existing.render({ force: true });
    }
    const pending = getPendingSkills(actor);
    // Start on the first tab with picks left.
    tab ??= PICK_SUBTYPES.find(s => pending[s] > 0) ?? "Combat";
    return new SkillBrowser(actor, { tab }).render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg", "skill-browser"],
    tag: "div",
    window: { icon: "fa-solid fa-book-open-reader", resizable: true },
    position: { width: 640, height: 680 },
    actions: {
      switchTab: SkillBrowser.#onTab,
      pick: SkillBrowser.#onPick,
      unpick: SkillBrowser.#onUnpick,
      expand: SkillBrowser.#onExpand,
      view: SkillBrowser.#onView,
      confirm: SkillBrowser.#onConfirm
    }
  };

  static PARTS = {
    main: { template: "systems/lhtrpg/templates/apps/skill-browser.hbs", scrollable: [".skill-list"] }
  };

  /** @override */
  get title() {
    return game.i18n.format("LHTRPG.SkillBrowser.Title", { name: this.actor.name });
  }

  /** Pending picks of the character, or null when it has none (no quota). */
  get quota() {
    const pending = getPendingSkills(this.actor);
    return PICK_SUBTYPES.some(s => pending[s] > 0) ? pending : null;
  }

  /** Picks of a subtype in the current selection. */
  #picked(subtype) {
    return [...this.picks.values()].filter(p => p.subtype === subtype).length;
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    const rank = Number(actor.system.infos?.crank) || 1;
    const lists = skillLists(actor);
    const quota = this.quota;
    const full = (quota && PICK_SUBTYPES.includes(this.tab)) ? (this.#picked(this.tab) >= quota[this.tab]) : false;
    // [Training] skills left at creation: the limit minus the new ones picked.
    let training = getTrainingLimit(actor);
    if (training !== null) training -= [...this.picks.values()].filter(p => p.training && !p.owned).length;

    const entries = [];
    for (const entry of await getSkillIndex()) {
      if (entry.subtype !== this.tab) continue;
      const source = sourceOf(entry, lists);
      if ((this.source === "eligible") && !source) continue;
      if (!["eligible", "all"].includes(this.source) && (source !== this.source)) continue;

      const owned = ownedSkill(actor, entry);
      const sr = owned ? (Number(owned.system.skillRank?.value) || 1) : 0;
      const maxSR = owned ? (Number(owned.system.skillRank?.max) || entry.maxSR) : entry.maxSR;
      const picked = this.picks.has(entry.uuid);
      // Can't go beyond the Maximum SR of the skill or the character's CR.
      const capped = (sr + 1 > maxSR) || (sr + 1 > rank);
      const trainingFull = !owned && (training !== null) && (training <= 0) && isTraining(entry);
      const counted = PICK_SUBTYPES.includes(entry.subtype);
      entries.push({
        ...entry,
        sourceLabel: (source === "basic") ? entry.pack
          : (source ? game.i18n.localize(`LHTRPG.SkillBrowser.Source.${source}`) : (entry.folder || entry.pack)),
        owned: !!owned,
        sr,
        maxSR,
        next: sr + 1,
        picked,
        capped,
        disabled: !picked && (capped || (counted && full) || trainingFull),
        reason: capped
          ? game.i18n.format((sr + 1 > maxSR) ? "LHTRPG.SkillBrowser.MaxSR" : "LHTRPG.SkillBrowser.MaxCR", { max: Math.min(maxSR, rank) })
          : ((counted && full) ? game.i18n.localize("LHTRPG.SkillBrowser.Full")
            : (trainingFull ? game.i18n.format("LHTRPG.SkillBrowser.TrainingFull", { max: CREATION_TRAINING }) : "")),
        expanded: this.expanded.has(entry.uuid),
        description: this.descriptions.get(entry.uuid) ?? "",
        search: `${entry.name} ${entry.folder} ${entry.tags.join(" ")}`.toLowerCase()
      });
    }

    const tabs = TABS.map(subtype => ({
      subtype,
      label: game.i18n.localize(`LHTRPG.Skill.Type.${subtype}`),
      active: subtype === this.tab,
      count: (quota && PICK_SUBTYPES.includes(subtype)) ? `${this.#picked(subtype)}/${quota[subtype]}` : (this.#picked(subtype) || "")
    }));
    const sources = SOURCES.map(value => ({
      value,
      label: game.i18n.localize(`LHTRPG.SkillBrowser.Filter.${value}`),
      selected: value === this.source
    }));
    const picks = [...this.picks.values()].map(p => ({
      ...p,
      label: p.owned ? `${p.name} (SR ${p.sr} → ${p.sr + 1})` : p.name
    }));

    return {
      entries,
      tabs,
      sources,
      picks,
      query: this.query,
      rank,
      quota,
      editable: actor.isOwner,
      hint: [
        quota ? game.i18n.format("LHTRPG.SkillBrowser.HintPending", { combat: quota.Combat, general: quota.General })
          : game.i18n.localize("LHTRPG.SkillBrowser.HintFree"),
        (training !== null) ? game.i18n.format("LHTRPG.SkillBrowser.HintTraining", { left: Math.max(0, training), max: CREATION_TRAINING }) : ""
      ].filter(Boolean).join(" ")
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Next to the character sheet when there is room.
    const sheet = this.actor.sheet;
    if (!sheet?.rendered) return;
    const { left, top, width } = sheet.position;
    const own = this.position.width;
    const x = (left + width + own + 10 < window.innerWidth) ? left + width + 5 : Math.max(0, window.innerWidth - own - 10);
    this.setPosition({ left: Math.max(0, x), top: Math.max(0, top) });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const input = this.element.querySelector("input[name=search]");
    input.addEventListener("input", ev => {
      this.query = ev.currentTarget.value;
      this.#applySearch();
    });
    this.element.querySelector("select[name=source]").addEventListener("change", ev => {
      this.source = ev.currentTarget.value;
      this.render();
    });
    this.#applySearch();
  }

  /** Live search, without rendering again. */
  #applySearch() {
    const query = this.query.trim().toLowerCase();
    let shown = 0;
    for (const row of this.element.querySelectorAll(".skill-row")) {
      const match = !query || row.dataset.search.includes(query);
      row.hidden = !match;
      if (match) shown += 1;
    }
    this.element.querySelector(".skill-empty-search").hidden = (shown > 0) || !query;
  }

  /** Index entry of a row. */
  async #entry(target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    return (await getSkillIndex()).find(e => e.uuid === uuid);
  }

  static #onTab(event, target) {
    this.tab = target.dataset.subtype;
    this.render();
  }

  static async #onPick(event, target) {
    const entry = await this.#entry(target);
    if (!entry) return;
    const owned = ownedSkill(this.actor, entry);
    this.picks.set(entry.uuid, {
      uuid: entry.uuid,
      name: entry.name,
      img: entry.img,
      subtype: entry.subtype,
      owned: !!owned,
      training: isTraining(entry),
      sr: owned ? (Number(owned.system.skillRank?.value) || 1) : 0
    });
    this.render();
  }

  static #onUnpick(event, target) {
    this.picks.delete(target.closest("[data-uuid]").dataset.uuid);
    this.render();
  }

  static async #onExpand(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    if (this.expanded.has(uuid)) this.expanded.delete(uuid);
    else {
      this.expanded.add(uuid);
      if (!this.descriptions.has(uuid)) {
        const item = await fromUuid(uuid);
        const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item?.system.description ?? "", { relativeTo: item });
        this.descriptions.set(uuid, html);
      }
    }
    this.render();
  }

  static async #onView(event, target) {
    const item = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    item?.sheet.render(true);
  }

  /** Acquire / raise the picked skills, count them down from the pending ones and record it in the chat. */
  static async #onConfirm() {
    const actor = this.actor;
    if (!this.picks.size) return;
    const toCreate = [];
    const toUpdate = [];
    const lines = [];
    // Picks that count (Combat / General while some are owed) get a hidden mark with the current CR.
    const quota = this.quota;
    const rank = rankOf(actor);
    const mark = (pick, kind, fromSR) => (quota && PICK_SUBTYPES.includes(pick.subtype))
      ? [{ rank, subtype: pick.subtype, kind, ...(kind === "raise" ? { fromSR } : {}) }] : [];
    for (const pick of this.picks.values()) {
      const entry = (await getSkillIndex()).find(e => e.uuid === pick.uuid);
      const owned = entry && ownedSkill(actor, entry);
      if (owned) {
        const from = Number(owned.system.skillRank?.value) || 1;
        const sr = from + 1;
        const picks = [...picksOf(owned), ...mark(pick, "raise", from)];
        toUpdate.push({ _id: owned.id, "system.skillRank.value": sr, [`flags.lhtrpg.${PICK_FLAG}`]: picks });
        lines.push(game.i18n.format("LHTRPG.SkillBrowser.ChatRaise", { name: owned.name, sr }));
        continue;
      }
      const skill = await fromUuid(pick.uuid);
      if (!skill) continue;
      const data = skill.toObject();
      delete data._id;
      delete data.folder;
      delete data.sort;
      delete data.ownership;
      foundry.utils.setProperty(data, "_stats.compendiumSource", skill.uuid);
      foundry.utils.setProperty(data, "system.skillRank.value", 1);
      const picks = mark(pick, "new");
      if (picks.length) foundry.utils.setProperty(data, `flags.lhtrpg.${PICK_FLAG}`, picks);
      toCreate.push(data);
      lines.push(game.i18n.format("LHTRPG.SkillBrowser.ChatNew", { name: skill.name }));
    }
    if (toUpdate.length) await actor.updateEmbeddedDocuments("Item", toUpdate);
    if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="lhtrpg skill-pick-card"><h3><i class="fa-solid fa-book-open-reader"></i> `
        + `${game.i18n.format("LHTRPG.SkillBrowser.ChatTitle", { name: actor.name })}</h3>`
        + `<ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul></div>`
    });

    this.picks.clear();
    if (this.quota) this.render();
    else this.close();
  }
}

/* -------------------------------------------- */

/** Rebuild the index whenever a skill changes in a compendium. */
function watchSkills(item) {
  if ((item.type === "skill") && item.pack) clearSkillIndex();
}

export function registerSkillBrowser() {
  Hooks.on("createItem", watchSkills);
  Hooks.on("updateItem", watchSkills);
  Hooks.on("deleteItem", watchSkills);
  Hooks.on("createCompendium", clearSkillIndex);
  Hooks.on("deleteCompendium", clearSkillIndex);
  Hooks.on("updateCompendium", clearSkillIndex);
  // The pending picks and the skills of a character change what the window shows.
  const refresh = actor => {
    if (!(actor instanceof Actor)) return;
    foundry.applications.instances.get(SkillBrowser.idFor(actor))?.render();
  };
  Hooks.on("updateActor", actor => refresh(actor));
  Hooks.on("deleteItem", item => (item.type === "skill") && refresh(item.parent));

  // CR lowered (by hand, e.g. a GM fixing a wrong CR Up): offer to undo the picks of the ranks removed.
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if ((actor.type !== "character") || !foundry.utils.hasProperty(changes, "system.infos.crank")) return;
    options.lhtrpgPreviousRank = rankOf(actor);
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (!isLocalChange(options, userId) || (options.lhtrpgPreviousRank === undefined)) return;
    const rank = rankOf(actor);
    if (rank < options.lhtrpgPreviousRank) rollbackPicks(actor, { aboveRank: rank, reason: "LHTRPG.SkillBrowser.Undo.HintRank" });
  });
}
