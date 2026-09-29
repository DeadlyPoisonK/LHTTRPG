import { useItem } from "../helpers/item-use.mjs";
import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { activateTagInput } from "../helpers/tags.mjs";
import { getStatusPanel, activateStatusPanelListeners } from "../helpers/statuses.mjs";
import { getOption, OPTION_TYPES } from "../helpers/character-options.mjs";
import { allocateBonusPoints, chooseHumanStats, isHumanRace } from "../apps/stat-allocation.mjs";
import { rankUp } from "../apps/rank-up.mjs";
import { PICK_SUBTYPES, SkillBrowser, getPendingSkills } from "../apps/skill-browser.mjs";
import { OptionBrowser } from "../apps/option-browser.mjs";
import { equipInHand, getHands, swapHands, unequipHand } from "../helpers/hands.mjs";
import { EQUIP_TYPES } from "../piles/pile-config.mjs";
import { diceFormula } from "../helpers/dice.mjs";
import { effectModified } from "../helpers/sheet-values.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

// Number of equipment slots available per item type, mirroring the slots
// rendered in actor-inventory.html. Types not listed here have no slot cap.
// Weapons and shields go in the hand slots instead (see hands.mjs).
const EQUIP_SLOT_CAPACITY = {
  armor: 1,
  bag: 1,
  accessory: 3
};

/**
 * Sheet for character actors in AppV2.
 * @extends {foundry.applications.sheets.ActorSheetV2}
 */
export class LHTrpgActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg", "sheet", "actor"],
    position: { width: 700, height: 700 },
    window: { resizable: false },
    form: { submitOnChange: true },
    actions: {
      editImage: LHTrpgActorSheet.#onEditImage,
      "item-throw": LHTrpgActorSheet.#onItemThrow,
      "item-use": LHTrpgActorSheet.#onItemUse,
      "linked-skill-throw": LHTrpgActorSheet.#onLinkedSkillThrow,
      "item-edit": LHTrpgActorSheet.#onItemEdit,
      "item-delete": LHTrpgActorSheet.#onItemDelete,
      "item-equip": LHTrpgActorSheet.#onItemEquip,
      "item-create": LHTrpgActorSheet.#onItemCreate,
      "item-give": LHTrpgActorSheet.#onItemGive,
      "gold-give": LHTrpgActorSheet.#onGoldGive,
      "option-name": LHTrpgActorSheet.#onOptionName,
      "class-img": LHTrpgActorSheet.#onClassImg,
      "option-browse": LHTrpgActorSheet.#onOptionBrowse,
      "rank-up": LHTrpgActorSheet.#onRankUp,
      "skill-browse": LHTrpgActorSheet.#onSkillBrowse,
      "roll-check": LHTrpgActorSheet.#onRollCheck,
      "ticket-increment": LHTrpgActorSheet.#onTicketIncrement,
      "ticket-decrement": LHTrpgActorSheet.#onTicketDecrement,
      "ticket-rank-create": LHTrpgActorSheet.#onTicketRankCreate,
      "hand-swap": LHTrpgActorSheet.#onHandSwap,
      "toggle-hate": LHTrpgActorSheet.#onToggleHate,
      "add-item-menu": LHTrpgActorSheet.#onAddItemMenu,
      create: LHTrpgActorSheet.#onManageActiveEffect,
      edit: LHTrpgActorSheet.#onManageActiveEffect,
      delete: LHTrpgActorSheet.#onManageActiveEffect,
      toggle: LHTrpgActorSheet.#onManageActiveEffect
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/lhtrpg/templates/actor/actor-character-sheet.html"
    }
  };

  /** Tab group states (survive re-renders). */
  tabGroups = {
    primary: "stats",
    stats: "stats",
    skills: "basic",
    items: "equipment",
    bio: "bio"
  };

  /** Is the Hate/Fatigue flyout panel open? */
  #hateOpen = false;

  /** The custom header only has room for the name (V2 would prefix "Player Character:"). */
  get title() {
    return this.actor.name;
  }

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

    // Items array: flat objects with id and _id, sorted by sort order
    context.items = actor.items.contents
      .sort((a, b) => a.sort - b.sort)
      .map(i => ({ ...i.toObject(false), id: i.id, _id: i.id }));

    // Prepare character data and items.
    this._prepareItems(context);

    // Race / Class / Subclass items (header fields); the class item's image is the class logo.
    context.characterOptions = Object.fromEntries(OPTION_TYPES.map(type => [type, getOption(actor, type)]));
    context.classImg = context.characterOptions.class?.img ?? actor.system.class?.img ?? "systems/lhtrpg/assets/ui/classes/none.webp";

    // "Browse" tile of each skill grid, with the picks left (creation, CR Up).
    if (this.isEditable) {
      const pending = getPendingSkills(actor);
      context.skillBrowse = { Basic: {}, ...Object.fromEntries(PICK_SUBTYPES.map(s => [s, { pending: pending[s] }])) };
    }

    // Roll data for TinyMCE/ProseMirror editors.
    context.rollData = actor.getRollData();

    // Source data for editable inputs (prevents active effect baking on submitOnChange)
    const baseSource = actor._source.system ?? {};
    const source = foundry.utils.deepClone(baseSource);
    source.health ??= {};
    source.health.value ??= 0;
    source.fate ??= {};
    source.fate.value ??= 0;
    source.infos ??= {};
    source.infos.hate ??= 0;
    source.infos.fatigue ??= 0;
    source.infos.crank ??= 0;
    source.inventory ??= {};
    source.inventory.gold ??= 0;
    source.social ??= {};
    source.social.guild ??= "";
    source.biography ??= "";
    context.source = source;

    // Detect fields modified by Active Effects (effective !== base)
    context.modified = {
      hpValue: effectModified(source.health.value, actor.system.health?.value),
      fateValue: effectModified(source.fate.value, actor.system.fate?.value),
      hate: effectModified(source.infos.hate, actor.system.infos?.hate),
      fatigue: effectModified(source.infos.fatigue, actor.system.infos?.fatigue),
      crank: effectModified(source.infos.crank, actor.system.infos?.crank)
    };

    // Enrich textarea / biography content
    context.enrichments = {
      biography: await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.biography ?? "", {
        async: true,
        rollData: context.rollData,
        relativeTo: actor
      })
    };

    // Prepare active effects and status panel
    context.effects = prepareActiveEffectCategories(actor.effects);
    context.statusPanel = getStatusPanel(actor);

    return context;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} context The sheet context.
   * @private
   */
  _prepareItems(context) {
    // Initialize containers.
    const skillsBasic = [];
    const skillsCombat = [];
    const skillsGeneral = [];

    const itemsEquippedWeapon = [];
    const itemsEquippedArmor = [];
    const itemsEquippedShield = [];
    const itemsEquippedAccessory = [];
    const itemsEquippedBag = [];
    const itemsWeapon = [];
    const itemsArmor = [];
    const itemsShield = [];
    const itemsAccessory = [];
    const itemsBag = [];
    const itemsUsable = [];
    const itemsGear = [];

    const itemsTicketTreasure = [];
    const itemsTicketFate = [];
    const itemsTicketConnection = [];
    const itemsTicketReset = [];

    const itemsConnection = [];
    const itemsUnion = [];

    // Item skills linked to one of the character's equipment items are used from that item (inventory
    // badge), not listed with the skills.
    const linkedSkills = new Set(this.actor.items.map(i => i.system.linkedSkillUuid).filter(Boolean));

    // Iterate through items, allocating to containers
    const itemList = context.items;
    for (let i of itemList) {
      i.img = i.img || CONST.DEFAULT_TOKEN;
      if (i.type === 'skill' && (i.system.subtype === 'Item')
        && linkedSkills.has(this.actor.items.get(i._id)?.uuid)) continue;
      // Append to Combat Skills.
      // (Monster skills and unlinked Item skills given to a character are listed with the Combat skills.)
      if (i.type === 'skill' && ['Combat', 'Monster', 'Item'].includes(i.system.subtype)) {
        skillsCombat.push(i);
      }
      // Append to Basic Skills.
      else if (i.type === 'skill' && i.system.subtype === 'Basic') {
        skillsBasic.push(i);
      }
      // Append to General Skills.
      else if (i.type === 'skill' && i.system.subtype === 'General') {
        skillsGeneral.push(i);
      }
      // Append to Equipped gear.
      else if (i.system.equipped === true && i.type === 'weapon') {
        itemsEquippedWeapon.push(i);
      }
      else if (i.system.equipped === true && i.type === 'armor') {
        itemsEquippedArmor.push(i);
      }
      else if (i.system.equipped === true && i.type === 'shield') {
        itemsEquippedShield.push(i);
      }
      else if (i.system.equipped === true && i.type === 'accessory') {
        itemsEquippedAccessory.push(i);
      }
      else if (i.system.equipped === true && i.type === 'bag') {
        itemsEquippedBag.push(i);
      }
      // Append to Weapons.
      else if (i.system.equipped === false && i.type === 'weapon') {
        itemsWeapon.push(i);
      }
      // Append to Armors.
      else if (i.system.equipped === false && i.type === 'armor') {
        itemsArmor.push(i);
      }
      // Append to Shields.
      else if (i.system.equipped === false && i.type === 'shield') {
        itemsShield.push(i);
      }
      // Append to Accessories.
      else if (i.system.equipped === false && i.type === 'accessory') {
        itemsAccessory.push(i);
      }
      // Append to Bags.
      else if (i.system.equipped === false && i.type === 'bag') {
        itemsBag.push(i);
      }
      // Append to Usables / Gear.
      // Neither can be equipped: always carried in the general inventory.
      else if (i.type === 'usable') {
        itemsUsable.push(i);
      }
      else if (i.type === 'gear') {
        itemsGear.push(i);
      }
      // Append to Tickets.
      else if (i.type === 'ticket' && i.system.subtype === 'Treasure') {
        itemsTicketTreasure.push(i);
      }
      else if (i.type === 'ticket' && i.system.subtype === 'Fate') {
        itemsTicketFate.push(i);
      }
      else if (i.type === 'ticket' && i.system.subtype === 'Connection') {
        itemsTicketConnection.push(i);
      }
      else if (i.type === 'ticket' && i.system.subtype === 'Reset') {
        itemsTicketReset.push(i);
      }
      // Append to Connections.
      else if (i.type === 'connection') {
        itemsConnection.push(i);
      }
      // Append to Unions.
      else if (i.type === 'union') {
        itemsUnion.push(i);
      }
    }

    // Assign and return
    context.skills = {
      "combat": skillsCombat,
      "basic": skillsBasic,
      "general": skillsGeneral
    };

    context.items = {
      "equipped": {
        "weapons": itemsEquippedWeapon,
        "armors": itemsEquippedArmor,
        "shields": itemsEquippedShield,
        "accessories": itemsEquippedAccessory,
        "bags": itemsEquippedBag
      },
      "weapons": itemsWeapon,
      "armors": itemsArmor,
      "shields": itemsShield,
      "accessories": itemsAccessory,
      "bags": itemsBag,
      "usables": itemsUsable,
      "gear": itemsGear,
    };

    // Main / off hand slots (what each hand holds is deduced from the equipped items).
    const hands = getHands(this.actor);
    const byId = id => itemList.find(i => i._id === id) ?? null;
    context.hands = {
      main: hands.main ? byId(hands.main.id) : null,
      off: hands.locked ? null : (hands.off ? byId(hands.off.id) : null),
      locked: hands.locked ? byId(hands.main.id) : null,
      canSwap: this.isEditable && (hands.off?.type === "weapon") && !hands.locked
    };

    // Treasure Tickets are kept as one stack per rank
    itemsTicketTreasure.sort((a, b) => (Number(a.system.rank) || 0) - (Number(b.system.rank) || 0));
    context.tickets = {
      "treasure": itemsTicketTreasure,
      "treasureTotal": itemsTicketTreasure.reduce((sum, i) => sum + (Number(i.system.quantity) || 0), 0),
      "fate": itemsTicketFate,
      "connection": itemsTicketConnection,
      "reset": itemsTicketReset
    };

    // Unequipped items fill the general inventory grid, one slot each, up to
    // the bag-derived maxSpace. Remaining slots render as empty placeholders
    // so the right-hand panel always shows the actual carrying capacity.
    const carriedItems = [].concat(itemsWeapon, itemsArmor, itemsShield, itemsAccessory, itemsBag, itemsUsable, itemsGear);
    for (const i of carriedItems) {
      i.equippable = EQUIP_TYPES.includes(i.type);
      i.usable = (i.type === "usable") && this.isEditable;
    }
    const maxSpace = context.system.inventory?.maxSpace ?? carriedItems.length;
    const inventorySlots = carriedItems.slice(0, maxSpace);
    for (let i = inventorySlots.length; i < maxSpace; i++) {
      inventorySlots.push(null);
    }
    context.inventorySlots = inventorySlots;

    context.social = {
      "connections": itemsConnection,
      "unions": itemsUnion
    };
  }

  /* -------------------------------------------- */
  /*  Form Data Processing                        */
  /* -------------------------------------------- */

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Ensure all numeric inputs preserve number type
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
  /*  Tabs Management                             */
  /* -------------------------------------------- */

  /**
   * Synchronize active tab classes for each of the 5 tab groups.
   * @private
   */
  _syncTabs() {
    for (const [group, activeTab] of Object.entries(this.tabGroups)) {
      for (const nav of this.element.querySelectorAll(`nav[data-group="${group}"]`)) {
        for (const a of nav.querySelectorAll("[data-tab]")) {
          a.classList.toggle("active", a.dataset.tab === activeTab);
        }
      }
      for (const tab of this.element.querySelectorAll(`.tab[data-group="${group}"]`)) {
        tab.classList.toggle("active", tab.dataset.tab === activeTab);
      }
    }
  }

  /** @override */
  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    this.tabGroups[group] = tab;
    this._syncTabs();
  }

  /* -------------------------------------------- */
  /*  Flyout Panel (Hate / Fatigue)               */
  /* -------------------------------------------- */

  /**
   * Apply the Hate/Fatigue flyout transform state.
   * @private
   */
  _applyHateState() {
    const btn = this.element.querySelector("#hate-button");
    const content = this.element.querySelector("#hate");
    if (!btn || !content) return;
    btn.classList.toggle("active", this.#hateOpen);
    content.style.transform = this.#hateOpen
      ? "perspective(400px) rotateY(-30deg)"
      : "perspective(400px) rotateY(-90deg)";
  }

  /* -------------------------------------------- */
  /*  Life Cycle Listeners                        */
  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._createOptionMenu(this.element);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Synchronize active tabs for all 5 groups
    this._syncTabs();

    // Re-apply hate/fatigue flyout state
    this._applyHateState();

    // Enter key on ticket rank input
    for (const input of this.element.querySelectorAll(".ticket-rank-input")) {
      input.addEventListener("keydown", async ev => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        const rank = Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0));
        await this._createTicket("Treasure", { rank });
      });
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

    // Equip an item by dragging it onto one of the equipment slots.
    for (const slot of this.element.querySelectorAll(".equip-slot")) {
      slot.addEventListener("dragover", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        slot.classList.add("drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
      slot.addEventListener("drop", ev => {
        slot.classList.remove("drag-over");
        this._onEquipSlotDrop(ev, slot);
      });
    }

    // Unequip an item by dragging it back onto the general inventory grid.
    const inventoryList = this.element.querySelector(".inventory-list");
    if (inventoryList) {
      inventoryList.addEventListener("dragover", ev => ev.preventDefault());
      inventoryList.addEventListener("drop", ev => this._onInventoryDrop(ev));
    }
  }

  /* -------------------------------------------- */
  /*  Context Menus                               */
  /* -------------------------------------------- */

  /**
   * ⋮ menu of the Race / Class / Subclass fields: change (selection window), edit or delete the item.
   * @param {HTMLElement} element
   * @private
   */
  _createOptionMenu(element) {
    const field = target => target.closest(".option-field");
    const item = target => this.actor.items.get(field(target)?.dataset.itemId);
    new foundry.applications.ux.ContextMenu(element, ".option-menu", [
      {
        name: "LHTRPG.CharacterOptions.Change",
        icon: '<i class="fa-solid fa-magnifying-glass"></i>',
        callback: target => OptionBrowser.open(this.actor, field(target).dataset.optionType)
      },
      {
        name: "LHTRPG.StatAllocation.Human.Menu",
        icon: '<i class="fa-solid fa-person"></i>',
        condition: target => isHumanRace(item(target)),
        callback: target => chooseHumanStats(item(target))
      },
      {
        name: "LHTRPG.StatAllocation.Bonus.Menu",
        icon: '<i class="fa-solid fa-chart-simple"></i>',
        condition: target => field(target).dataset.optionType === "class",
        callback: () => allocateBonusPoints(this.actor)
      },
      {
        name: "LHTRPG.ButtonLabel.Edit",
        icon: '<i class="fa-solid fa-pen-to-square"></i>',
        callback: target => item(target)?.sheet.render(true)
      },
      {
        name: "LHTRPG.ButtonLabel.Delete",
        icon: '<i class="fa-solid fa-trash"></i>',
        callback: target => item(target)?.deleteDialog()
      }
    ], { eventName: "click", jQuery: false, fixed: true });
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return this.actor.isOwner;
  }

  /** @override */
  _canDragDrop(selector) {
    // Players can drop items on sheets they don't own to give them away.
    return true;
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
   * Items coming from another actor (a player, a loot pile, a chest...) are
   * moved through the piles API instead of being copied. Dragging from a
   * merchant buys the item.
   * @override
   */
  async _onDropItem(event, item) {
    if (!item) return null;
    const source = item.parent;
    if ((source instanceof Actor) && (source.uuid !== this.actor.uuid)) {
      if (game.lhtrpg.piles.isMerchant(source) && !game.user.isGM) return game.lhtrpg.piles.buyItem(source, item, this.actor);
      return game.lhtrpg.piles.transferItem(item, this.actor);
    }
    if (!this.isEditable) return false;
    return super._onDropItem(event, item);
  }

  /**
   * Handle dropping an Item back onto the general inventory grid, unequipping
   * it if it was equipped. Newly dropped items and simple reordering are left
   * to the sheet's default drop handling.
   * @param {DragEvent} event
   * @private
   */
  async _onInventoryDrop(event) {
    event.preventDefault();

    const data = this._getDropData(event);
    if (!data || data.type !== "Item") return;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    if (item.parent?.id === this.actor.id && item.system.equipped === true) {
      event.stopPropagation();
      if (["weapon", "shield"].includes(item.type)) await unequipHand(this.actor, item);
      else await item.update({ "system.equipped": false });
    }
  }

  /**
   * Handle dropping an Item onto one of the equipment slots, equipping it
   * if its type matches the slot and swapping out whatever previously
   * occupied that slot.
   * @param {DragEvent} event
   * @param {HTMLElement} slot
   * @private
   */
  async _onEquipSlotDrop(event, slot) {
    event.preventDefault();
    event.stopPropagation();

    const data = this._getDropData(event);
    if (!data || data.type !== "Item") return;

    let item = await Item.implementation.fromDropData(data);
    if (!item) return;

    // Bring the item onto this actor first if it isn't already owned by it:
    // items from another actor (player, loot, chest) are moved, not copied.
    if (item.parent?.uuid !== this.actor.uuid) {
      if (item.parent instanceof Actor) {
        const result = await game.lhtrpg.piles.transferItem(item, this.actor, { ask: false });
        item = this.actor.items.get(result?.createdItemId);
        if (!item) return;
      }
      else {
        const [created] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        item = created;
      }
    }

    const slotType = slot.dataset.slotType;
    const slotIndex = Number(slot.dataset.slotIndex ?? 0);

    // Hand slots: main hand takes any weapon, off hand a shield or a One-Handed weapon.
    const hand = slot.dataset.hand;
    if (hand) {
      if (!["weapon", "shield"].includes(item.type)) {
        ui.notifications.warn(game.i18n.format("LHTRPG.Hands.Notif.NotHandItem", { item: item.name }));
        return;
      }
      return equipInHand(this.actor, item, hand);
    }

    if (item.type !== slotType) {
      ui.notifications.warn(game.i18n.format("INVENTORY.Notif.WrongItemType", {
        item: item.name,
        type: game.i18n.localize(`TYPES.Item.${item.type}`),
        slot: game.i18n.localize(`TYPES.Item.${slotType}`)
      }));
      return;
    }

    // Whatever currently sits in this exact slot (by equip order) gets
    // unequipped and returned to the general inventory.
    const equippedOfType = this.actor.items.filter(i => i.type === slotType && i.system.equipped === true && i.id !== item.id);
    const occupant = equippedOfType[slotIndex] ?? null;

    const updates = [];
    if (occupant) updates.push({ _id: occupant.id, "system.equipped": false });
    if (item.system.equipped !== true) updates.push({ _id: item.id, "system.equipped": true });
    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /* -------------------------------------------- */
  /*  Tickets & Rolls Helpers                     */
  /* -------------------------------------------- */

  /**
   * Give the actor one ticket of `subtype`, copied from the system compendium (keeps its text).
   * Stacks with an owned ticket of the same subtype (and rank, for Treasure Tickets).
   * @param {string} subtype
   * @param {object} [options]
   * @returns {Promise<Item>}
   * @private
   */
  async _createTicket(subtype, options) {
    const data = await Item.implementation.ticketData(subtype, options);
    return Item.create(data, { parent: this.actor });
  }

  /**
   * Roll an Ability Check to chat.
   * @param {string} skillName    Check key (LHTRPG.Check.<skillName>)
   * @param {number} dice         Number of D6
   * @param {number} bonus        Check total
   * @param {number} [mod]        Situational modifier
   * @returns {Promise<ChatMessage>}
   */
  rollSkill(skillName, dice, bonus, mod = 0) {
    const formula = diceFormula({ dice, mod: (Number(bonus) || 0) + (Number(mod) || 0) });
    return new Roll(formula).toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${game.i18n.localize("LHTRPG.WindowTitle.AbilityCheck")} - ${game.i18n.localize(`LHTRPG.Check.${skillName}`)}`,
      rollMode: game.settings.get("core", "rollMode")
    });
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

  static #onItemThrow(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    this.actor.items.get(itemId)?.ItemThrow();
  }

  static #onItemUse(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) useItem(item);
  }

  static async #onLinkedSkillThrow(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    const skill = item?.system.linkedSkillUuid ? await fromUuid(item.system.linkedSkillUuid) : null;
    if (skill) skill.ItemThrow();
  }

  static #onItemEdit(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    if (!this.isEditable) return;
    const itemId = target.closest(".item")?.dataset.itemId;
    await this.actor.items.get(itemId)?.delete();
  }

  static async #onItemEquip(event, target) {
    if (!this.isEditable) return;
    const itemId = target.closest(".item")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item || !EQUIP_TYPES.includes(item.type)) return;

    if (["weapon", "shield"].includes(item.type)) {
      if (item.system.equipped) await unequipHand(this.actor, item);
      else await equipInHand(this.actor, item);
      return;
    }

    const equipped = !item.system.equipped;
    const updates = [{ _id: item.id, "system.equipped": equipped }];

    const capacity = EQUIP_SLOT_CAPACITY[item.type];
    if (equipped && capacity) {
      const othersEquipped = this.actor.items.filter(
        i => i.type === item.type && i.system.equipped === true && i.id !== item.id
      );
      const overflow = othersEquipped.length - (capacity - 1);
      for (let i = 0; i < overflow; i++) {
        updates.push({ _id: othersEquipped[i].id, "system.equipped": false });
      }
    }

    await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  static async #onItemCreate(event, target) {
    if (!this.isEditable) return;
    const type = target.dataset.type;
    if (type === "ticket") return this._createTicket(target.dataset.subtype);
    const data = foundry.utils.duplicate(target.dataset);
    const name = Item.implementation.defaultName({ type, parent: this.actor });
    const itemData = {
      name,
      type,
      system: data
    };
    delete itemData.system.type;
    delete itemData.system.action;
    return Item.create(itemData, { parent: this.actor });
  }

  static #onItemGive(event, target) {
    const itemId = target.closest(".item")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) game.lhtrpg.piles.giveItem(item);
  }

  static #onGoldGive() {
    game.lhtrpg.piles.giveGold(this.actor);
  }

  static #onOptionName(event, target) {
    const field = target.closest(".option-field");
    const item = this.actor.items.get(field?.dataset.itemId);
    item?.sheet.render(true);
  }

  static #onClassImg() {
    const item = getOption(this.actor, "class");
    if (item) item.sheet.render(true);
    else if (this.isEditable) OptionBrowser.open(this.actor, "class");
  }

  static #onOptionBrowse(event, target) {
    if (!this.isEditable) return;
    const field = target.closest(".option-field");
    if (field) OptionBrowser.open(this.actor, field.dataset.optionType);
  }

  static #onRankUp() {
    if (this.isEditable) rankUp(this.actor);
  }

  static #onSkillBrowse(event, target) {
    if (this.isEditable) SkillBrowser.open(this.actor, { tab: target.dataset.subtype });
  }

  static async #onRollCheck(event, target) {
    const { dice, bonus, name } = target.dataset;
    const title = `${game.i18n.localize("LHTRPG.WindowTitle.AbilityCheck")} - ${game.i18n.localize(`LHTRPG.Check.${name}`)}`;
    const mod = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: await foundry.applications.handlebars.renderTemplate("systems/lhtrpg/templates/dialogs/rollDialog.html"),
      ok: {
        icon: "fas fa-dice",
        label: game.i18n.localize("LHTRPG.ButtonLabel.Roll"),
        callback: (event, button) => Number(button.form.elements.mod.value) || 0
      },
      rejectClose: false
    });
    if (mod === null) return;
    return this.rollSkill(name, dice, bonus, mod);
  }

  static async #onTicketIncrement(event, target) {
    if (!this.isEditable) return;
    const itemId = target.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (item) {
      const quantity = Number(item.system.quantity) || 0;
      await item.update({ "system.quantity": quantity + 1 });
    } else {
      const subtype = target.dataset.subtype;
      await this._createTicket(subtype);
    }
  }

  static async #onTicketDecrement(event, target) {
    if (!this.isEditable) return;
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const quantity = Number(item.system.quantity) || 0;
    if (quantity <= 1) await item.delete();
    else await item.update({ "system.quantity": quantity - 1 });
  }

  static async #onTicketRankCreate(event, target) {
    if (!this.isEditable) return;
    const input = target.closest(".ticket-rank-add")?.querySelector(".ticket-rank-input");
    if (input) {
      const rank = Math.max(0, Math.floor(Number(input.value) || 0));
      await this._createTicket("Treasure", { rank });
    }
  }

  static async #onHandSwap() {
    if (this.isEditable) await swapHands(this.actor);
  }

  static #onToggleHate() {
    this.#hateOpen = !this.#hateOpen;
    this._applyHateState();
  }

  static #onAddItemMenu(event, target) {
    const dropdown = target.closest(".addItem")?.querySelector(".dropdown-content");
    dropdown?.classList.toggle("show");
  }

  static async #onManageActiveEffect(event, target) {
    return onManageActiveEffect(event, this.actor, target);
  }
}
