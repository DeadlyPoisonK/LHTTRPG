/**
 * Refresh the skills characters already own from the system compendiums (GM tool).
 *
 * The skills on a character are copies: when the compendium entry gains effects, conditions or a configured
 * Check / Damage, the copies keep the old data. This tool finds each skill's compendium entry
 * (`_stats.compendiumSource` / `flags.core.sourceId` when it points to a system skill pack, otherwise the name),
 * shows what would change and, once confirmed, updates the item in place (same id):
 * - replaced: the rules data (REPLACED_FIELDS, `skillRank.max`) and all the item's effects;
 * - kept: the current SR (clamped to the new max), a macro of its own, a custom image, and the description
 *   when the GM ticks "keep" (pre-ticked when the old one has inline rolls or links the compendium lacks);
 * - the previous item is saved in `flags.lhtrpg.refreshBackup`, which "Undo" restores.
 *
 * Opened from the character sheet header menu (one character) and from the system settings (all characters).
 */

const { DialogV2 } = foundry.applications.api;

/** Rules data taken from the compendium entry. */
const REPLACED_FIELDS = ["description", "tags", "timing", "checkType", "range", "target", "subtype", "cost", "limit",
  "check", "damage", "conditions"];

const BACKUP_FLAG = "refreshBackup";

const normalize = name => String(name ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** System packs holding skills. */
function skillPacks() {
  return game.packs.filter(p => (p.metadata.packageType === "system") && (p.metadata.packageName === game.system.id)
    && (p.documentName === "Item") && p.metadata.name.startsWith("skills-"));
}

/** All the system skills, by uuid and by normalized name. */
async function buildIndex() {
  const byUuid = new Map();
  const byName = new Map();
  for (const pack of skillPacks()) {
    for (const doc of await pack.getDocuments({ type: "skill" })) {
      byUuid.set(doc.uuid, doc);
      const key = normalize(doc.name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(doc);
    }
  }
  return { byUuid, byName };
}

/** Rough likeness of two descriptions (shared words), to pick between skills with the same name. */
function likeness(a, b) {
  const words = text => new Set(String(text ?? "").replace(/<[^>]+>/g, " ").toLowerCase().split(/\W+/).filter(Boolean));
  const wa = words(a);
  let shared = 0;
  for (const w of words(b)) if (wa.has(w)) shared++;
  return shared;
}

/** Compendium candidates for an owned skill, best first, and how they were found. */
function findCandidates(item, index) {
  const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  const linked = source ? index.byUuid.get(source) : null;
  if (linked) return { by: "source", candidates: [linked] };
  const named = index.byName.get(normalize(item.name)) ?? [];
  const candidates = named.slice().sort((a, b) => likeness(item.system.description, b.system.description)
    - likeness(item.system.description, a.system.description));
  return { by: "name", candidates };
}

/** What identifies an effect for the comparison (ids and timestamps aside). */
function effectSignature(effect) {
  const data = (effect instanceof foundry.abstract.DataModel) ? effect.toObject() : effect;
  return JSON.stringify({
    name: data.name,
    transfer: data.transfer,
    disabled: data.disabled,
    statuses: [...(data.statuses ?? [])].sort(),
    changes: (data.changes ?? []).map(c => [c.key, Number(c.mode), String(c.value), c.priority ?? null]),
    lhtrpg: data.flags?.lhtrpg ?? {}
  });
}

/** The old value is the same as the compendium one (extra keys in old objects do not count). */
function sameValue(current, wanted) {
  if ((wanted === undefined) || (wanted === null)) return true;
  // (foundry.utils.objectsEqual does not take arrays)
  if (Array.isArray(wanted)) return JSON.stringify(current ?? []) === JSON.stringify(wanted);
  if (typeof wanted === "object") {
    if ((typeof current !== "object") || (current === null)) return false;
    return foundry.utils.isEmpty(foundry.utils.diffObject(current, wanted));
  }
  return current === wanted;
}

/** Inline rolls / links of the old description the compendium one does not have. */
function hasCustomMarkup(oldText, newText) {
  const marks = text => String(text ?? "").match(/\[\[[^\]]*\]\]|@UUID\[[^\]]*\]/g) ?? [];
  const wanted = new Set(marks(newText));
  return marks(oldText).some(m => !wanted.has(m));
}

const isDefaultImage = img => !img || img.startsWith(`systems/${game.system.id}/`) || img.startsWith("icons/svg/");

/**
 * Plan the refresh of one owned skill from one compendium entry.
 * @returns {{changes: string[], update: object, effects: object[]|null, keepDescriptionDefault: boolean, disabledNames: string[]}}
 */
function planSkill(item, entry) {
  const src = item._source;
  const comp = entry.toObject();
  const changes = [];
  const update = { _id: item.id, system: {} };

  for (const field of REPLACED_FIELDS) {
    if (sameValue(src.system[field], comp.system[field])) continue;
    update.system[field] = foundry.utils.deepClone(comp.system[field]);
    changes.push(field);
  }
  const max = Number(comp.system.skillRank?.max) || 1;
  const sr = Number(src.system.skillRank?.value) || 1;
  if (Number(src.system.skillRank?.max) !== max) {
    update.system.skillRank = { max, value: Math.min(sr, max) };
    changes.push("skillRank");
  }
  if (!src.system.macroeffect && comp.system.macroeffect) {
    update.system.macroeffect = comp.system.macroeffect;
    changes.push("macroeffect");
  }
  if (src.name !== comp.name) {
    update.name = comp.name;
    changes.push("name");
  }
  if ((src.img !== comp.img) && isDefaultImage(src.img) && comp.img) {
    update.img = comp.img;
    changes.push("img");
  }
  if (src._stats?.compendiumSource !== entry.uuid) update["_stats.compendiumSource"] = entry.uuid;

  const oldEffects = item.effects.contents.map(effectSignature).sort();
  const newEffects = comp.effects.map(effectSignature).sort();
  const effects = (JSON.stringify(oldEffects) === JSON.stringify(newEffects)) ? null : comp.effects;
  if (effects) changes.push("effects");

  // Effects the player switched off by hand (they come back as in the compendium)
  const disabledNames = effects ? item.effects.filter(e => e.transfer && e.disabled).map(e => e.name) : [];
  const keepDescriptionDefault = changes.includes("description")
    && hasCustomMarkup(src.system.description, comp.system.description);
  return { changes, update, effects, keepDescriptionDefault, disabledNames };
}

/** Characters in scope: one actor, or every character of the world. */
function scopeActors(actor) {
  return actor ? [actor] : game.actors.filter(a => a.type === "character");
}

/** Build the preview rows. */
async function preview(actors) {
  const index = await buildIndex();
  const rows = [];
  for (const actor of actors) {
    const row = { actor, skills: [], upToDate: 0, unmatched: [], backups: 0 };
    for (const item of actor.items.filter(i => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.getFlag("lhtrpg", BACKUP_FLAG)) row.backups++;
      const { by, candidates } = findCandidates(item, index);
      if (!candidates.length) {
        row.unmatched.push(item.name);
        continue;
      }
      const plans = candidates.map(entry => ({ entry, ...planSkill(item, entry) }));
      const best = plans[0];
      const linkOnly = !best.changes.length;
      if (linkOnly && (candidates.length === 1)) {
        row.upToDate++;
        // Still record the link to the compendium entry, silently, when matched by name
        if (by === "name") row.silentLinks = [...(row.silentLinks ?? []), best.update];
        continue;
      }
      row.skills.push({ item, by, plans, key: `${actor.id}.${item.id}` });
    }
    rows.push(row);
  }
  return rows;
}

/** Labels of the changed fields. */
function changeLabels(changes) {
  return changes.map(c => game.i18n.localize(`LHTRPG.SkillRefresh.Field.${c}`)).join(", ");
}

/** Template data for the dialog. */
function templateRows(rows) {
  return rows.filter(r => r.skills.length || r.unmatched.length || r.backups).map(r => ({
    actorName: r.actor.name,
    actorImg: r.actor.img,
    upToDate: r.upToDate,
    unmatched: r.unmatched.join(", "),
    backups: r.backups,
    skills: r.skills.map(s => ({
      key: s.key,
      name: s.item.name,
      img: s.item.img,
      byName: s.by === "name",
      choice: s.plans.length > 1,
      options: s.plans.map((p, i) => ({
        value: i,
        label: `${p.entry.name} — ${p.entry.compendium?.metadata.label ?? ""}${p.entry.folder ? ` / ${p.entry.folder.name}` : ""}`
      })),
      changes: changeLabels(s.plans[0].changes),
      hasDescription: s.plans[0].changes.includes("description"),
      keepDescription: s.plans[0].keepDescriptionDefault,
      disabled: s.plans[0].disabledNames.join(", ")
    }))
  }));
}

/** Apply the chosen plans. */
async function applyRefresh(rows, form) {
  let count = 0;
  for (const row of rows) {
    const updates = [...(row.silentLinks ?? [])];
    const effectJobs = [];
    for (const skill of row.skills) {
      if (!form[`apply.${skill.key}`]) continue;
      const plan = skill.plans[Number(form[`choice.${skill.key}`] ?? 0)] ?? skill.plans[0];
      const update = foundry.utils.deepClone(plan.update);
      if (form[`keep.${skill.key}`]) delete update.system.description;
      const backup = skill.item.toObject();
      delete backup.flags?.lhtrpg?.[BACKUP_FLAG];
      update[`flags.lhtrpg.${BACKUP_FLAG}`] = { date: Date.now(), data: backup };
      updates.push(update);
      if (plan.effects) effectJobs.push({ item: skill.item, effects: plan.effects });
      count++;
    }
    if (!updates.length) continue;
    // Arrays (tags, conditions) are replaced whole, objects merged
    await row.actor.updateEmbeddedDocuments("Item", updates, { lhKeepCheckType: true });
    for (const { item, effects } of effectJobs) await replaceEffects(item, effects);
  }
  return count;
}

/** Swap all the item's effects for the given ones. */
async function replaceEffects(item, effects) {
  if (item.effects.size) await item.deleteEmbeddedDocuments("ActiveEffect", item.effects.map(e => e.id));
  if (!effects.length) return;
  await item.createEmbeddedDocuments("ActiveEffect", effects.map(e => {
    const data = foundry.utils.deepClone(e);
    delete data._id;
    data.origin = item.uuid;
    return data;
  }));
}

/** Restore the skills of the given actors from their backup. */
async function undoRefresh(actors) {
  let count = 0;
  for (const actor of actors) {
    for (const item of actor.items.filter(i => i.getFlag("lhtrpg", BACKUP_FLAG))) {
      const { data } = item.getFlag("lhtrpg", BACKUP_FLAG);
      await item.update({
        name: data.name,
        img: data.img,
        system: data.system,
        "_stats.compendiumSource": data._stats?.compendiumSource ?? null,
        [`flags.lhtrpg.-=${BACKUP_FLAG}`]: null
      }, { lhKeepCheckType: true });
      await replaceEffects(item, data.effects ?? []);
      count++;
    }
  }
  return count;
}

/**
 * Open the refresh dialog for one character, or for every character of the world.
 * @param {Actor} [actor]
 */
export async function refreshSkills(actor) {
  if (!game.user.isGM) return;
  const actors = scopeActors(actor);
  const rows = await preview(actors);
  const data = templateRows(rows);
  const pending = rows.reduce((n, r) => n + r.skills.length, 0);
  const backups = rows.reduce((n, r) => n + r.backups, 0);
  const upToDate = rows.reduce((n, r) => n + r.upToDate, 0);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/lhtrpg/templates/apps/skill-refresh.hbs",
    { rows: data, pending, upToDate, single: !!actor }
  );
  const buttons = [];
  if (pending) buttons.push({
    action: "apply", label: "LHTRPG.SkillRefresh.Apply", icon: "fa-solid fa-rotate", default: true,
    callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
  });
  if (backups) buttons.push({
    action: "undo", label: game.i18n.format("LHTRPG.SkillRefresh.Undo", { count: backups }), icon: "fa-solid fa-rotate-left"
  });
  buttons.push({ action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", default: !pending });

  const result = await DialogV2.wait({
    window: {
      title: actor ? game.i18n.format("LHTRPG.SkillRefresh.TitleActor", { name: actor.name })
        : game.i18n.localize("LHTRPG.SkillRefresh.Title"),
      icon: "fa-solid fa-rotate"
    },
    classes: ["lhtrpg", "skill-refresh"],
    position: { width: 560 },
    content,
    buttons,
    rejectClose: false
  });

  if (result === "undo") {
    const ok = await DialogV2.confirm({
      window: { title: "LHTRPG.SkillRefresh.Title" },
      content: `<p>${game.i18n.format("LHTRPG.SkillRefresh.UndoConfirm", { count: backups })}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    const count = await undoRefresh(actors);
    ui.notifications.info(game.i18n.format("LHTRPG.SkillRefresh.Undone", { count }));
    return;
  }
  if (!result || (typeof result !== "object")) return;
  const count = await applyRefresh(rows, result);
  ui.notifications.info(game.i18n.format("LHTRPG.SkillRefresh.Done", { count }));
}

/** Settings menu entry (Configure Settings → System): opens the dialog for every character. */
class SkillRefreshMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    refreshSkills();
    return this;
  }
}

export function registerSkillRefresh() {
  game.settings.registerMenu("lhtrpg", "skillRefresh", {
    name: "LHTRPG.SkillRefresh.Title",
    label: "LHTRPG.SkillRefresh.MenuLabel",
    hint: "LHTRPG.SkillRefresh.MenuHint",
    icon: "fa-solid fa-rotate",
    type: SkillRefreshMenu,
    restricted: true
  });
}
