import {onManageActiveEffect, prepareActiveEffectCategories} from "../helpers/effects.mjs";
import {onManageTags} from "../helpers/tags.mjs";
import {diceOptions} from "../helpers/dice.mjs";
import {SKILL_MAX_DICE, rollSkill} from "../helpers/skill-rolls.mjs";

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

    // Resolve the Skill item linked to this equipment, if any.
    context.linkedSkill = context.system.linkedSkillUuid
      ? await fromUuid(context.system.linkedSkillUuid).catch(() => null)
      : null;

    context.effects = prepareActiveEffectCategories(this.item.effects);
    return context;
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

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

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
