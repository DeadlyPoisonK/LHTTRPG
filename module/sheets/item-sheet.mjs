import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { activateTagInput } from "../helpers/tags.mjs";
import { canonicalTags } from "../helpers/tag-catalog.mjs";
import { diceOptions } from "../helpers/dice.mjs";
import { SKILL_MAX_DICE, CHECK_STATS, isMonsterSkill, rollSkill } from "../helpers/skill-rolls.mjs";
import { ARCHETYPES, OPTION_TYPES } from "../helpers/character-options.mjs";
import { prepareSkillFields, composeSkillField, CUSTOM } from "../helpers/skill-fields.mjs";
import { canUseItem, useItem } from "../helpers/item-use.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Sheet for items in AppV2.
 * Supports all 14 item types, dynamically selecting the template in _configureRenderParts.
 * @extends {foundry.applications.sheets.ItemSheetV2}
 */
export class LHTrpgItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg", "sheet", "item"],
    position: { width: 520, height: 550 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      editImage: LHTrpgItemSheet.#onEditImage,
      throwLinkedSkill: LHTrpgItemSheet.#onThrowLinkedSkill,
      createLinkedSkill: LHTrpgItemSheet.#onCreateLinkedSkill,
      editLinkedSkill: LHTrpgItemSheet.#onEditLinkedSkill,
      deleteLinkedSkill: LHTrpgItemSheet.#onDeleteLinkedSkill,
      rollSkill: LHTrpgItemSheet.#onRollSkill,
      useItem: LHTrpgItemSheet.#onUseItem,
      openGrant: LHTrpgItemSheet.#onOpenGrant,
      removeGrant: LHTrpgItemSheet.#onRemoveGrant,
      removeSubclassSkill: LHTrpgItemSheet.#onRemoveSubclassSkill,
      create: LHTrpgItemSheet.#onManageActiveEffect,
      edit: LHTrpgItemSheet.#onManageActiveEffect,
      delete: LHTrpgItemSheet.#onManageActiveEffect,
      toggle: LHTrpgItemSheet.#onManageActiveEffect
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/lhtrpg/templates/item/item-weapon-sheet.html",
      scrollable: [".sheet-body"]
    }
  };

  /** Primary tab group state (survives re-renders). */
  tabGroups = { primary: "description" };

  /** Drag & drop handler instance. */
  #dragDrop = null;

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.sheet.template = `systems/lhtrpg/templates/item/item-${this.item.type}-sheet.html`;
    return parts;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;

    context.item = item;
    context.document = item;
    context.system = item.system;
    context.flags = item.flags;
    context.editable = this.isEditable;
    context.owner = item.isOwner;

    // Retrieve the roll data for TinyMCE/ProseMirror editors.
    context.rollData = {};
    const actor = item.parent instanceof Actor ? item.parent : (item.actor ?? null);
    if (actor) {
      context.rollData = actor.getRollData();
    }

    context.enrichments = {
      description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.description ?? "", {
        async: true,
        rollData: context.rollData,
        relativeTo: item
      }),
      skillText: await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.skillText ?? "", {
        async: true,
        rollData: context.rollData,
        relativeTo: item
      })
    };

    // Skill / usable item Check / Damage: dice select options
    if (["skill", "usable"].includes(item.type)) {
      context.skillDiceOptions = diceOptions(SKILL_MAX_DICE);
      // Character skills: check stat of the character, extra dice on top of it / of the Attack-Magic Power
      context.isMonsterSkill = isMonsterSkill(item);
      context.skillBonusDiceOptions = Object.fromEntries(Object.keys(context.skillDiceOptions).map(n => [n, `+${n}D`]));
      context.checkStatOptions = Object.fromEntries(CHECK_STATS.map(s => [s, `LHTRPG.Check.${s.capitalize()}`]));
      context.checkVsOptions = { evasion: "LHTRPG.Check.Evasion", resistance: "LHTRPG.Check.Resistance", auto: "LHTRPG.Skill.Label.CheckAuto" };
      context.skillDamageDiceOptions = context.isMonsterSkill ? context.skillDiceOptions : context.skillBonusDiceOptions;
      // Timing / Target / Range / Cost / Limit dropdowns
      context.skillFields = prepareSkillFields(item.system);
    }

    // Usable items: Use button, when carried by a character
    if (item.type === "usable") context.canUse = canUseItem(item);

    // Class archetype options
    if (item.type === "class") context.archetypes = ARCHETYPES;

    // Race / Class / Subclass starting skills
    if (OPTION_TYPES.includes(item.type)) context.grants = await this._prepareGrants();
    // Skills a Subclass allows
    if (item.type === "subclass") context.subclassSkills = await this._prepareSubclassSkills();

    // Resolve the Skill item linked to this equipment, if any.
    context.linkedSkill = context.system.linkedSkillUuid
      ? await fromUuid(context.system.linkedSkillUuid).catch(() => null)
      : null;

    context.effects = prepareActiveEffectCategories(item.effects);
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
   * Skills a Subclass allows, resolved for display.
   * @returns {Promise<object[]>}
   * @private
   */
  async _prepareSubclassSkills() {
    const skills = await Promise.all((this.item.system.skills ?? []).map(async uuid => {
      const skill = await fromUuid(uuid).catch(() => null);
      return skill ? { uuid, name: skill.name, img: skill.img } : { uuid, name: uuid, img: "icons/svg/hazard.svg", missing: true };
    }));
    return skills.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /* -------------------------------------------- */
  /*  Form Data Processing                        */
  /* -------------------------------------------- */

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Ensure all numeric inputs and selects preserve number type
    for (const el of form.querySelectorAll("[data-dtype='Number'], input[type='number']")) {
      const name = el.name;
      if (!name) continue;
      const val = foundry.utils.getProperty(data, name);
      if (val !== undefined && val !== null && val !== "") {
        const num = Number(val);
        foundry.utils.setProperty(data, name, Number.isNaN(num) ? 0 : num);
      } else if (val === "") {
        foundry.utils.setProperty(data, name, 0);
      }
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Life Cycle Listeners & Drag Drop            */
  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);

    // Drag & Drop for grants, subclass skills and linked skill slots
    this.#dragDrop = new foundry.applications.ux.DragDrop({
      dropSelector: ".tab.grants, .tab.subclass-skills, .linked-skill-row",
      permissions: {
        drop: () => this.isEditable
      },
      callbacks: {
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      }
    });
    this.#dragDrop.bind(this.element);

    this.element.addEventListener("dragleave", ev => {
      if (!ev.relatedTarget || !this.element.contains(ev.relatedTarget)) {
        this.element.querySelectorAll(".drag-over").forEach(e => e.classList.remove("drag-over"));
      } else {
        const slot = ev.target.closest(".grant-slot, .grant-dropzone, .linked-skill-row");
        if (slot && !slot.contains(ev.relatedTarget)) {
          slot.classList.remove("drag-over");
        }
      }
    });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Synchronize active tabs
    const activeTab = this.tabGroups.primary ?? "description";
    for (const nav of this.element.querySelectorAll("nav.sheet-tabs")) {
      for (const a of nav.querySelectorAll("[data-tab]")) {
        a.classList.toggle("active", a.dataset.tab === activeTab);
      }
    }
    for (const tab of this.element.querySelectorAll(".sheet-body > .tab")) {
      tab.classList.toggle("active", tab.dataset.tab === activeTab);
    }

    // Damage type (Physical/Magical): exclusive options,
    // unchecking the current one leaves none. The hidden input carries the value when the form submits.
    for (const toggle of this.element.querySelectorAll(".skill-roll-toggle")) {
      toggle.addEventListener("change", ev => {
        const input = ev.currentTarget;
        const hidden = this.element.querySelector(`input[type=hidden][name="${input.dataset.field}"]`);
        if (hidden) {
          hidden.value = input.checked ? input.dataset.value : "";
          hidden.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }

    // Timing / Target / Range / Cost / Limit: rebuild the stored string from the dropdown parts
    // before the form submits (these handlers run before the form's delegated change handler).
    for (const el of this.element.querySelectorAll(".skill-field")) {
      const type = el.querySelector(".skill-field-type");
      const n = el.querySelector(".skill-field-n");
      const qual = el.querySelector(".skill-field-qual");
      const custom = el.querySelector(".skill-field-custom");
      const hidden = el.querySelector("input[type=hidden]");
      if (!type || !hidden) continue;

      const onChange = ev => {
        const option = type.selectedOptions[0];
        if (ev.currentTarget === type) {
          if (option?.dataset.n && !n?.value.trim()) n.value = option.dataset.n;
          if (type.value === CUSTOM && !custom?.value.trim()) custom.value = hidden.value === "-" ? "" : hidden.value;
        }
        if (n) n.hidden = !option?.dataset.n;
        if (qual) qual.hidden = option?.dataset.qual !== "true";
        if (custom) custom.hidden = type.value !== CUSTOM;
        hidden.value = composeSkillField(el.dataset.field, {
          type: type.value,
          n: n?.value,
          qual: qual?.value,
          custom: custom?.value
        });
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      };

      el.querySelectorAll("select, input:not([type=hidden])").forEach(inp => inp.addEventListener("change", onChange));
    }

    // Tag management
    activateTagInput(this.element, this.item, this);
  }

  /**
   * Handle dragover visual highlights on drop targets.
   * @param {DragEvent} event
   * @private
   */
  _onDragOver(event) {
    const grantsTab = event.target.closest(".tab.grants");
    if (grantsTab) {
      grantsTab.querySelectorAll(".drag-over").forEach(e => e.classList.remove("drag-over"));
      (event.target.closest(".grant-slot") ?? grantsTab.querySelector(".grant-dropzone"))?.classList.add("drag-over");
      return;
    }
    const subclassTab = event.target.closest(".tab.subclass-skills");
    if (subclassTab) {
      subclassTab.querySelector(".grant-dropzone")?.classList.add("drag-over");
      return;
    }
    const linkedRow = event.target.closest(".linked-skill-row");
    if (linkedRow) {
      linkedRow.classList.add("drag-over");
    }
  }

  /**
   * Main drop dispatcher for the sheet.
   * @param {DragEvent} event
   * @private
   */
  async _onDrop(event) {
    this.element.querySelectorAll(".drag-over").forEach(e => e.classList.remove("drag-over"));
    if (event.target.closest(".tab.grants")) return this._onGrantDrop(event);
    if (event.target.closest(".tab.subclass-skills")) return this._onSubclassSkillDrop(event);
    if (event.target.closest(".linked-skill-row")) return this._onLinkedSkillDrop(event);
  }

  /**
   * Extract the drag payload from a drop event.
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

  /**
   * Dropping a Skill on the Skills tab of a Subclass: the Subclass allows it. Skills inside an actor
   * are not stable references: the compendium/world entry they came from is linked.
   * @param {DragEvent} event
   * @private
   */
  async _onSubclassSkillDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const data = this._getDropData(event);
    if (!data || data.type !== "Item") return;
    const skill = await Item.implementation.fromDropData(data);
    if (!skill) return;
    const uuid = (skill.type !== "skill") ? null : (skill.parent ? (skill._stats?.compendiumSource ?? null) : skill.uuid);
    if (!uuid) {
      ui.notifications.warn(game.i18n.localize("LHTRPG.CharacterOptions.Grants.OnlySkills"));
      return;
    }
    const skills = this.item.system.skills ?? [];
    if (skills.includes(uuid)) return;
    await this.item.update({ "system.skills": [...skills, uuid] });
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
        type: game.i18n.localize(`TYPES.Item.${dropped.type}`),
        slot: game.i18n.localize("TYPES.Item.skill")
      }));
      return;
    }

    await this.item.update({ "system.linkedSkillUuid": dropped.uuid });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onEditImage(event, target) {
    if (!this.isEditable) return;
    const attr = target.dataset.edit ?? "img";
    const current = foundry.utils.getProperty(this.item, attr);
    const fp = new FilePicker({
      type: "image",
      current,
      callback: path => this.item.update({ [attr]: path }),
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  static async #onThrowLinkedSkill() {
    const skill = this.item.system.linkedSkillUuid ? await fromUuid(this.item.system.linkedSkillUuid) : null;
    if (skill) skill.ItemThrow();
  }

  static async #onCreateLinkedSkill() {
    if (!this.isEditable) return;
    const data = { name: "New Skill", type: "skill", img: this.item.img, system: { subtype: "Item" } };
    const parent = this.item.actor ?? null;
    const created = parent
      ? (await parent.createEmbeddedDocuments("Item", [data]))[0]
      : await Item.create(data);
    if (created) await this.item.update({ "system.linkedSkillUuid": created.uuid });
  }

  static async #onEditLinkedSkill() {
    const skill = this.item.system.linkedSkillUuid ? await fromUuid(this.item.system.linkedSkillUuid) : null;
    skill?.sheet.render(true);
  }

  static async #onDeleteLinkedSkill() {
    if (!this.isEditable) return;
    await this.item.update({ "system.linkedSkillUuid": "" });
  }

  static #onRollSkill(event, target) {
    rollSkill(this.item, target.dataset.roll);
  }

  static #onUseItem() {
    useItem(this.item);
  }

  static async #onOpenGrant(event, target) {
    const uuid = target.closest(".grant-skill")?.dataset.uuid;
    const skill = uuid ? await fromUuid(uuid).catch(() => null) : null;
    skill?.sheet.render(true);
  }

  static async #onRemoveGrant(event, target) {
    if (!this.isEditable) return;
    const uuid = target.closest(".grant-skill")?.dataset.uuid;
    const slotEl = target.closest(".grant-slot");
    const index = Number(slotEl?.dataset.slot);
    const grants = foundry.utils.deepClone(this.item.system.grants ?? []);
    if (!grants[index]) return;
    grants[index].uuids = grants[index].uuids.filter(u => u !== uuid);
    await this.item.update({ "system.grants": grants.filter(g => g.uuids.length) });
  }

  static async #onRemoveSubclassSkill(event, target) {
    if (!this.isEditable) return;
    const uuid = target.closest(".grant-skill")?.dataset.uuid;
    await this.item.update({ "system.skills": (this.item.system.skills ?? []).filter(u => u !== uuid) });
  }

  static async #onManageActiveEffect(event, target) {
    return onManageActiveEffect(event, this.item, target);
  }
}
