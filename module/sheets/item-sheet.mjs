import {onManageActiveEffect, prepareActiveEffectCategories} from "../helpers/effects.mjs";
import {onManageTags} from "../helpers/tags.mjs";
import {diceOptions} from "../helpers/dice.mjs";
import {SKILL_MAX_DICE, rollSkill} from "../helpers/skill-rolls.mjs";
import {ARCHETYPES, OPTION_TYPES} from "../helpers/character-options.mjs";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class LHTrpgItemSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["lhtrpg", "sheet", "item"],
      width: 520,
      height: 550,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/lhtrpg/templates/item";
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.html`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.html`.
    return `${path}/item-${this.item.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve base data structure.
    const context = super.getData();

    // Use a safe clone of the item data for further operations.
    const itemData = context.item;

    // Retrieve the roll data for TinyMCE editors.
    context.rollData = {};
    let actor = this.object?.parent ?? null;
    if (actor) {
      context.rollData = actor.getRollData();
    }

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = itemData.system;
    context.flags = itemData.flags;

    context.enrichments = {
      "description": await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.description, {async: true}),
      "skillText": await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.skillText ?? "", {async: true})
    };

    // Skill Check / Damage: dice select options
    if (itemData.type === 'skill') context.skillDiceOptions = diceOptions(SKILL_MAX_DICE);

    // Class archetype options
    if (itemData.type === 'class') context.archetypes = ARCHETYPES;

    // Race / Class / Subclass starting skills
    if (OPTION_TYPES.includes(itemData.type)) context.grants = await this._prepareGrants();

    // Resolve the Skill item linked to this equipment, if any.
    context.linkedSkill = context.system.linkedSkillUuid
      ? await fromUuid(context.system.linkedSkillUuid).catch(() => null)
      : null;

    context.effects = prepareActiveEffectCategories(this.item.effects);
    return context;
  }

  /**
   * Starting skills of a Race / Class / Subclass, resolved for display.
   * @returns {Promise<object[]>}
   * @private
   */
  async _prepareGrants() {
    const grants = this.item.system.grants ?? [];
    return Promise.all(grants.map(async (grant, index) => {
      const skills = await Promise.all((grant.uuids ?? []).map(async uuid => {
        const skill = await fromUuid(uuid).catch(() => null);
        return skill ? { uuid, name: skill.name, img: skill.img } : { uuid, name: uuid, img: "icons/svg/hazard.svg", missing: true };
      }));
      return { index, choice: skills.length > 1, skills };
    }));
  }

  /**
   * Dropping a Skill on the starting skills tab: onto a slot adds it as an alternative of that slot
   * (the player will pick one), anywhere else adds a new slot.
   * @param {DragEvent} event
   * @private
   */
  async _onGrantDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const data = this._getDropData(event);
    if (!data || data.type !== "Item") return;
    const skill = await Item.implementation.fromDropData(data);
    if (!skill) return;
    if (skill.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("LHTRPG.CharacterOptions.Grants.OnlySkills"));
      return;
    }
    // Skills inside an actor are not stable references: link the compendium/world entry they came from.
    const uuid = skill.parent ? (skill._stats?.compendiumSource ?? null) : skill.uuid;
    if (!uuid) {
      ui.notifications.warn(game.i18n.localize("LHTRPG.CharacterOptions.Grants.OnlySkills"));
      return;
    }
    const grants = foundry.utils.deepClone(this.item.system.grants ?? []);
    const slot = event.target.closest(".grant-slot");
    if (slot) {
      const target = grants[Number(slot.dataset.slot)];
      if (!target.uuids.includes(uuid)) target.uuids.push(uuid);
    }
    else grants.push({ uuids: [uuid] });
    await this.item.update({ "system.grants": grants });
  }

  /* -------------------------------------------- */

  /**
   * Extract the drag payload from a drop event, regardless of which API is
   * available on this Foundry version.
   * @param {DragEvent} event
   * @returns {object|null}
   * @private
   */
  _getDropData(event) {
    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch (err) {
      data = null;
    }
    if (!data || !Object.keys(data).length) {
      try {
        data = JSON.parse(event.dataTransfer.getData("text/plain"));
      } catch (err) {
        return null;
      }
    }
    return data;
  }

  /**
   * Handle dropping a Skill item onto the linked-skill slot, linking it to
   * this equipment item.
   * @param {DragEvent} event
   * @private
   */
  async _onLinkedSkillDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const data = this._getDropData(event);
    if (!data || data.type !== "Item") return;

    const dropped = await Item.implementation.fromDropData(data);
    if (!dropped) return;

    if (dropped.type !== "skill") {
      ui.notifications.warn(game.i18n.format("INVENTORY.Notif.WrongItemType", {
        item: dropped.name,
        type: game.i18n.localize(`TYPES.ITEM.Type${dropped.type.capitalize()}`),
        slot: game.i18n.localize("TYPES.ITEM.TypeSkill")
      }));
      return;
    }

    await this.item.update({ "system.linkedSkillUuid": dropped.uuid });
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Send the linked skill's chat card to chat.
    html.find('.linked-skill-name.item-throw').click(async ev => {
      ev.preventDefault();
      const skill = this.item.system.linkedSkillUuid ? await fromUuid(this.item.system.linkedSkillUuid) : null;
      if (skill) skill.ItemThrow();
    });

    // Skill Check / Damage rolls, straight to chat
    html.find('.skill-roll-button').click(ev => {
      ev.preventDefault();
      rollSkill(this.item, ev.currentTarget.dataset.roll);
    });

    // Starting skills: open a skill's sheet
    html.find('.grant-open').click(async ev => {
      const skill = await fromUuid(ev.currentTarget.closest('.grant-skill').dataset.uuid).catch(() => null);
      skill?.sheet.render(true);
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Starting skills: remove one (a slot left empty disappears), drop skills to add them
    html.find('.grant-remove').click(ev => {
      const uuid = ev.currentTarget.closest('.grant-skill').dataset.uuid;
      const index = Number(ev.currentTarget.closest('.grant-slot').dataset.slot);
      const grants = foundry.utils.deepClone(this.item.system.grants ?? []);
      grants[index].uuids = grants[index].uuids.filter(u => u !== uuid);
      this.item.update({ "system.grants": grants.filter(g => g.uuids.length) });
    });
    const grantsTab = html.find('.tab.grants')[0];
    if (grantsTab) {
      grantsTab.addEventListener("dragover", ev => {
        ev.preventDefault();
        grantsTab.querySelectorAll(".drag-over").forEach(e => e.classList.remove("drag-over"));
        (ev.target.closest(".grant-slot") ?? grantsTab.querySelector(".grant-dropzone"))?.classList.add("drag-over");
      });
      grantsTab.addEventListener("dragleave", ev => {
        if (!grantsTab.contains(ev.relatedTarget)) grantsTab.querySelectorAll(".drag-over").forEach(e => e.classList.remove("drag-over"));
      });
      grantsTab.addEventListener("drop", ev => this._onGrantDrop(ev));
    }

    // Check vs (Evasion/Resistance/Auto) and Damage type (Physical/Magical): exclusive options,
    // unchecking the current one leaves none. The hidden input carries the value when the form submits.
    html.find('.skill-roll-toggle').on('change', ev => {
      const input = ev.currentTarget;
      html.find(`input[type=hidden][name="${input.dataset.field}"]`).val(input.checked ? input.dataset.value : '');
    });

    // Active Effect management
    html.find(".effect-control").click(ev => onManageActiveEffect(ev, this.item));

    // Tag management
    html.find(".tag-control").click(ev => onManageTags(ev, this.item));

    // Create a new Skill, linked to this equipment item, using this item's icon by default.
    html.find(".linked-skill-create").click(async ev => {
      ev.preventDefault();
      const data = { name: "New Skill", type: "skill", img: this.item.img };
      const parent = this.item.actor ?? null;
      const created = parent
        ? (await parent.createEmbeddedDocuments("Item", [data]))[0]
        : await Item.create(data);
      if (created) await this.item.update({ "system.linkedSkillUuid": created.uuid });
    });

    // Open the linked skill's own sheet for editing.
    html.find(".linked-skill-edit").click(async ev => {
      ev.preventDefault();
      const skill = this.item.system.linkedSkillUuid ? await fromUuid(this.item.system.linkedSkillUuid) : null;
      if (skill) skill.sheet.render(true);
    });

    // Unlink the skill from this equipment item (does not delete the skill itself).
    html.find(".linked-skill-delete").click(ev => {
      ev.preventDefault();
      this.item.update({ "system.linkedSkillUuid": "" });
    });

    // Link a Skill item to this equipment by dragging it onto the row.
    const linkedSkillSlot = html.find(".linked-skill-row")[0];
    if (linkedSkillSlot) {
      linkedSkillSlot.addEventListener("dragover", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        linkedSkillSlot.classList.add("drag-over");
      });
      linkedSkillSlot.addEventListener("dragleave", () => linkedSkillSlot.classList.remove("drag-over"));
      linkedSkillSlot.addEventListener("drop", ev => {
        linkedSkillSlot.classList.remove("drag-over");
        this._onLinkedSkillDrop(ev);
      });
    }
  }
}
