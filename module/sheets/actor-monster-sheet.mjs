import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { activateTagInput } from "../helpers/tags.mjs";
import { getStatusPanel, activateStatusPanelListeners } from "../helpers/statuses.mjs";
import { MONSTER_CHECK_MAX_DICE } from "../helpers/monster-checks.mjs";
import { diceFormula, diceOptions } from "../helpers/dice.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Sheet for monster actors in AppV2.
 * @extends {foundry.applications.sheets.ActorSheetV2}
 */
export class LHTrpgActorMonsterSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg", "sheet", "monster"],
    position: { width: 520, height: 550 },
    window: { resizable: true },
    form: { submitOnChange: true },
    dragDrop: [{ dragSelector: ".items-list .item[data-item-id], [data-effect-id]", dropSelector: null }],
    actions: {
      editImage: LHTrpgActorMonsterSheet.#onEditImage,
      "monster-send-to-chat": LHTrpgActorMonsterSheet.#onSendToChat,
      "monster-check-roll": LHTrpgActorMonsterSheet.#onRollCheck,
      "item-create": LHTrpgActorMonsterSheet.#onItemCreate,
      "item-edit": LHTrpgActorMonsterSheet.#onItemEdit,
      "item-delete": LHTrpgActorMonsterSheet.#onItemDelete,
      "item-throw": LHTrpgActorMonsterSheet.#onItemThrow,
      create: LHTrpgActorMonsterSheet.#onManageActiveEffect,
      edit: LHTrpgActorMonsterSheet.#onManageActiveEffect,
      delete: LHTrpgActorMonsterSheet.#onManageActiveEffect,
      toggle: LHTrpgActorMonsterSheet.#onManageActiveEffect
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/lhtrpg/templates/actor/actor-monster-sheet.html",
      scrollable: [".sheet-body"]
    }
  };

  /** Primary tab group state (survives re-renders). */
  tabGroups = { primary: "stats" };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;

    context.actor = actor;
    context.document = actor;
    context.system = actor.system;
    context.flags = actor.flags;
    context.editable = this.isEditable;
    context.owner = actor.isOwner;

    // Roll data for TinyMCE/ProseMirror editors
    context.rollData = actor.getRollData();

    context.enrichments = {
      description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.description ?? "", {
        async: true,
        rollData: context.rollData,
        relativeTo: actor
      })
    };

    // Classify skills for monster
    context.skillsMonster = actor.items
      .filter(i => i.type === "skill")
      .map(i => ({
        ...i.toObject(false),
        id: i.id,
        _id: i.id,
        img: i.img || CONST.DEFAULT_TOKEN,
        system: {
          ...i.system
        }
      }));

    // Prepare active effects and status panel
    context.effects = prepareActiveEffectCategories(actor.effects);
    context.statusPanel = getStatusPanel(actor);

    // Evasion / Resistance dice options: 0D6 to 5D6
    context.checkDiceOptions = diceOptions(MONSTER_CHECK_MAX_DICE);

    return context;
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
  /*  Life Cycle Listeners                        */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Synchronize active tabs
    const activeTab = this.tabGroups.primary ?? "stats";
    for (const nav of this.element.querySelectorAll("nav.sheet-tabs")) {
      for (const a of nav.querySelectorAll("[data-tab]")) {
        a.classList.toggle("active", a.dataset.tab === activeTab);
      }
    }
    for (const tab of this.element.querySelectorAll(".sheet-body > .tab")) {
      tab.classList.toggle("active", tab.dataset.tab === activeTab);
    }

    // Toggle statuses that have no data field (the others sync from their inputs)
    // Pursuit list: add/edit/remove Ratings
    if (this.isEditable) {
      activateStatusPanelListeners(this.element, this.actor);

      for (const toggle of this.element.querySelectorAll(".status-toggle")) {
        toggle.addEventListener("change", ev => {
          this.actor.toggleStatusEffect(ev.currentTarget.dataset.statusId, { active: ev.currentTarget.checked });
        });
      }
    }

    // Tag management
    activateTagInput(this.element, this.actor, this);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop Permissions                     */
  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return this.actor.isOwner;
  }

  /** @override */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onEditImage(event, target) {
    if (!this.isEditable) return;
    const attr = target.dataset.edit ?? "img";
    const current = foundry.utils.getProperty(this.actor, attr);
    const fp = new FilePicker({
      type: "image",
      current,
      callback: path => this.actor.update({ [attr]: path }),
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  static #onRollCheck(event, target) {
    const { check, name } = target.dataset;
    const values = this.actor.system.checks?.[check];
    if (!values) return;
    return new Roll(diceFormula(values)).toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${game.i18n.localize("LHTRPG.WindowTitle.AbilityCheck")} - ${game.i18n.localize(`LHTRPG.Check.${name}`)}`,
      rollMode: game.settings.get("core", "rollMode")
    });
  }

  static async #onSendToChat(event, target) {
    const actor = this.actor;
    const system = actor.system;
    // Condition = every LS/BS/CS/OS on the monster, ratings included in the effect name.
    // [Hidden] is left out: the players would not know about it.
    const conditions = actor.effects
      .filter(e => e.active && e.statuses.size && !e.statuses.has("hidden"))
      .map(e => e.name);

    const pdef = system["battle-status"]?.defense?.phys ?? 0;
    const mdef = system["battle-status"]?.defense?.magic ?? 0;
    let lowerDefense;
    if (pdef < mdef) lowerDefense = game.i18n.localize("LHTRPG.Monster.DefensePhysical");
    else if (mdef < pdef) lowerDefense = game.i18n.localize("LHTRPG.Monster.DefenseMagical");
    else lowerDefense = game.i18n.localize("LHTRPG.Monster.DefenseEqual");

    const skills = await Promise.all(actor.items.filter(i => i.type === "skill").map(async item => ({
      ...item.toObject(false),
      enrichedDescription: item.system.description
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, { async: true })
        : ""
    })));

    const cardData = {
      name: actor.name,
      img: actor.img,
      rank: system.rank,
      tags: system.tags,
      conditions,
      lowerDefense,
      hateMultiplier: system.hateMultiplier,
      skills
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/lhtrpg/templates/dialogs/monsterInfoCard.hbs",
      cardData
    );

    return ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });
  }

  static #onItemThrow(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    this.actor.items.get(itemId)?.ItemThrow();
  }

  static #onItemEdit(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    item?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    if (!this.isEditable) return;
    const itemId = target.closest(".item")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await item.delete();
  }

  static async #onItemCreate(event, target) {
    if (!this.isEditable) return;
    const type = target.dataset.type;
    const data = foundry.utils.duplicate(target.dataset);
    const name = Item.implementation.defaultName({ type, parent: this.actor });
    const itemData = {
      name,
      type,
      system: data
    };
    delete itemData.system["type"];
    delete itemData.system["action"];
    return await Item.create(itemData, { parent: this.actor });
  }

  static async #onManageActiveEffect(event, target) {
    return onManageActiveEffect(event, this.actor, target);
  }
}
