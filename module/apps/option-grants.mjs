/**
 * Starting skills of a Race / Class / Subclass (`system.grants`): when a character takes one, a dialog
 * offers to add them. Each grant is a slot with one skill (fixed) or several (the player picks one).
 * The skills added this way remember the option that gave them, so changing class can remove them.
 */

const { DialogV2 } = foundry.applications.api;

/** Flag of the skills added from an option: { type, source } */
export const GRANT_FLAG = "grantedBy";

/** What identifies an option item across copies: the compendium entry it came from, or its name. */
function sourceOf(item) {
  return item._stats?.compendiumSource ?? item.name;
}

function normalize(name) {
  return String(name ?? "").trim().toLowerCase();
}

/** The actor already has this skill (same compendium entry or same name). */
function owns(actor, skill) {
  return actor.items.some(i => (i.type === "skill")
    && ((i._stats?.compendiumSource === skill.uuid) || (normalize(i.name) === normalize(skill.name))));
}

/**
 * Offer the starting skills of an option item the character just took, and the removal of the skills
 * granted by the previous option of the same type.
 * @param {Actor} actor
 * @param {Item} item  The new Race / Class / Subclass
 */
export async function offerGrants(actor, item) {
  const source = sourceOf(item);
  const stale = actor.items.filter(i => {
    const flag = i.getFlag("lhtrpg", GRANT_FLAG);
    return (flag?.type === item.type) && (flag.source !== source);
  });

  const slots = [];
  for (const [index, grant] of (item.system.grants ?? []).entries()) {
    const skills = (await Promise.all((grant.uuids ?? []).map(uuid => fromUuid(uuid).catch(() => null)))).filter(Boolean);
    if (!skills.length) continue;
    const options = skills.map(s => ({ uuid: s.uuid, name: s.name, img: s.img, owned: owns(actor, s) }));
    const choice = options.length > 1;
    // A choice already satisfied (the character has one of its skills) starts on that skill.
    const preset = options.find(o => o.owned) ?? options[0];
    options.forEach(o => o.checked = choice ? (o === preset) : !o.owned);
    slots.push({ index, choice, options, done: choice ? preset.owned : options[0].owned });
  }
  if (!slots.some(s => !s.done) && !stale.length) return;

  const typeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/lhtrpg/templates/apps/option-grants.hbs",
    { item, slots, stale, typeLabel }
  );
  const data = await DialogV2.wait({
    window: { title: game.i18n.format("LHTRPG.CharacterOptions.Grants.Title", { name: item.name }), icon: "fa-solid fa-book-atlas" },
    classes: ["lhtrpg", "option-grants"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "add",
        label: "LHTRPG.CharacterOptions.Grants.Add",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "skip", label: "LHTRPG.CharacterOptions.Grants.Skip", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!data || (typeof data !== "object")) return;

  // Remove the skills of the previous option
  if (data.removeStale && stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map(i => i.id));

  // Add the chosen skills
  // (a fixed slot is a checkbox: the form gives true/false; a choice is a radio: the form gives its uuid)
  const uuids = slots.map(slot => {
    const value = data[`slot${slot.index}`];
    if (value === true) return slot.options[0].uuid;
    return (typeof value === "string") ? value : null;
  }).filter(Boolean);
  const toCreate = [];
  for (const uuid of uuids) {
    const skill = await fromUuid(uuid);
    if (!skill || owns(actor, skill)) continue;
    const skillData = skill.toObject();
    delete skillData._id;
    delete skillData.folder;
    delete skillData.sort;
    delete skillData.ownership;
    foundry.utils.setProperty(skillData, "_stats.compendiumSource", skill.uuid);
    foundry.utils.setProperty(skillData, `flags.lhtrpg.${GRANT_FLAG}`, { type: item.type, source });
    toCreate.push(skillData);
  }
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
}
