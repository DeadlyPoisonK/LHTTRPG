import { useItem } from "../helpers/item-use.mjs";
import {onManageActiveEffect, prepareActiveEffectCategories} from "../helpers/effects.mjs";
import {activateTagInput} from "../helpers/tags.mjs";
import {getStatusPanel, activateStatusPanelListeners} from "../helpers/statuses.mjs";
import {getOption, OPTION_TYPES} from "../helpers/character-options.mjs";
import {allocateBonusPoints, chooseHumanStats, isHumanRace} from "../apps/stat-allocation.mjs";
import {rankUp} from "../apps/rank-up.mjs";
import {PICK_SUBTYPES, SkillBrowser, getPendingSkills} from "../apps/skill-browser.mjs";
import {OptionBrowser} from "../apps/option-browser.mjs";
import {equipInHand, getHands, swapHands, unequipHand} from "../helpers/hands.mjs";
import {EQUIP_TYPES} from "../piles/pile-config.mjs";
import {diceFormula} from "../helpers/dice.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
// Number of equipment slots available per item type, mirroring the slots
// rendered in actor-inventory.html. Types not listed here have no slot cap.
// Weapons and shields go in the hand slots instead (see hands.mjs).
const EQUIP_SLOT_CAPACITY = {
  armor: 1,
  bag: 1,
  accessory: 3
};

export class LHTrpgActorSheet extends foundry.appv1.sheets.ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["lhtrpg", "sheet", "actor"],
      template: "systems/lhtrpg/templates/actor/actor-sheet.html",
      width: 700,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" },
      { navSelector: ".status-tabs", contentSelector: ".status-body", initial: "stats" },
      { navSelector: ".skills-tabs", contentSelector: ".skills-body", initial: "basic" },
      { navSelector: ".items-tabs", contentSelector: ".items-body", initial: "equipment" },
      { navSelector: ".bio-tabs", contentSelector: ".bio-body", initial: "bio" }],
      dragDrop: [{dragSelector: ".items-list .item", dropSelector: null},
      {dragSelector: ".inventory-list .item", dropSelector: null},
      {dragSelector: ".equip-slots-grid .item", dropSelector: null}]
    });
  }

  /** @override */
  get template() {
    return `systems/lhtrpg/templates/actor/actor-${this.actor.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.actor.toObject(false);

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      this._prepareItems(context);

      // Race / Class / Subclass items (header fields); the class item's image is the class logo.
      context.characterOptions = Object.fromEntries(OPTION_TYPES.map(type => [type, getOption(this.actor, type)]));
      context.classImg = context.characterOptions.class?.img ?? context.system.class.img;

      // "Browse" tile of each skill grid, with the picks left (creation, CR Up).
      if (this.isEditable) {
        const pending = getPendingSkills(this.actor);
        context.skillBrowse = { Basic: {}, ...Object.fromEntries(PICK_SUBTYPES.map(s => [s, { pending: pending[s] }])) };
      }
    }

    // Add roll data for TinyMCE editors.
    context.rollData = context.actor.getRollData();

    // Enrich textarea content
    context.enrichments = {
      "biography": await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.biography, {async: true})
    };

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(this.actor.effects);
    context.statusPanel = getStatusPanel(this.actor);

    return context;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
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
    }

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
    }

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
    }
  }

  /* -------------------------------------------- */

  /**
   * ⋮ menu of the Race / Class / Subclass fields: change (selection window), edit or delete the item.
   * @param {HTMLElement} element
   * @private
   */
  _createOptionMenu(element) {
    const field = target => target.closest('.option-field');
    const item = target => this.actor.items.get(field(target).dataset.itemId);
    new foundry.applications.ux.ContextMenu(element, '.option-menu', [
      {
        name: 'LHTRPG.CharacterOptions.Change',
        icon: '<i class="fa-solid fa-magnifying-glass"></i>',
        callback: target => OptionBrowser.open(this.actor, field(target).dataset.optionType)
      },
      {
        name: 'LHTRPG.StatAllocation.Human.Menu',
        icon: '<i class="fa-solid fa-person"></i>',
        condition: target => isHumanRace(item(target)),
        callback: target => chooseHumanStats(item(target))
      },
      {
        name: 'LHTRPG.StatAllocation.Bonus.Menu',
        icon: '<i class="fa-solid fa-chart-simple"></i>',
        condition: target => field(target).dataset.optionType === 'class',
        callback: () => allocateBonusPoints(this.actor)
      },
      {
        name: 'LHTRPG.ButtonLabel.Edit',
        icon: '<i class="fa-solid fa-pen-to-square"></i>',
        callback: target => item(target)?.sheet.render(true)
      },
      {
        name: 'LHTRPG.ButtonLabel.Delete',
        icon: '<i class="fa-solid fa-trash"></i>',
        callback: target => item(target)?.deleteDialog()
      }
    ], { eventName: 'click', jQuery: false, fixed: true });
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.item-throw').click(this._onItemThrow.bind(this));

    // Use a potion, scroll… (usable items)
    html.find('.item-use').click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.actor.items.get($(ev.currentTarget).parents(".item").data("itemId"));
      if (item) useItem(item);
    });

    // Send an equipment's linked skill to chat without opening the item.
    html.find('.linked-skill-throw-badge').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      const skill = item?.system.linkedSkillUuid ? await fromUuid(item.system.linkedSkillUuid) : null;
      if (skill) skill.ItemThrow();
    });

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find('.addItem a.item-controls').click(ev => {
      $('.addItem .dropdown-content').toggleClass('show');
    });

    // Race / Class / Subclass: the name opens the item sheet, the empty field the selection window.
    html.find('.option-field .option-name').click(ev => {
      const item = this.actor.items.get(ev.currentTarget.closest('.option-field').dataset.itemId);
      item?.sheet.render(true);
    });
    html.find('.class-img').click(() => {
      const item = getOption(this.actor, 'class');
      if (item) item.sheet.render(true);
      else if (this.isEditable) OptionBrowser.open(this.actor, 'class');
    });
    if (this.isEditable) {
      html.find('.option-field .option-browse').click(ev => {
        OptionBrowser.open(this.actor, ev.currentTarget.closest('.option-field').dataset.optionType);
      });
      this._createOptionMenu(html[0]);
      html.find('.rank-up').click(() => rankUp(this.actor));
      html.find('.skill-browse').click(ev => SkillBrowser.open(this.actor, { tab: ev.currentTarget.dataset.subtype }));
    }

    html.find('#hate-button').click(ev => {
      let content = ev.target.nextElementSibling;
      ev.target.classList.toggle("active");

      if (content.style.transform === "perspective(400px) rotateY(-30deg)"){
        content.style.transform = "perspective(400px) rotateY(-90deg)";
        // this._onOpeningInfoWindow(false, this.actor);
      } else {
        content.style.transform = "perspective(400px) rotateY(-30deg)";    
        // this._onOpeningInfoWindow(true, this.actor);
      }

    });

    // Roll skill
    html.find('.rollableSkill').click(this._onRollSkill.bind(this));

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Toggle statuses that have no data field (the others sync from their inputs)
    // Pursuit list: add/edit/remove Ratings
    activateStatusPanelListeners(html, this.actor);

    html.find('.status-toggle').on("change", ev => {
      this.actor.toggleStatusEffect(ev.currentTarget.dataset.statusId, { active: ev.currentTarget.checked });
    });

    // Add Inventory Item
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Give an item or gold to another player character
    html.find('.item-give').click(ev => {
      ev.stopPropagation();
      const item = this.actor.items.get(ev.currentTarget.closest(".item").dataset.itemId);
      if (item) game.lhtrpg.piles.giveItem(item);
    });
    html.find('.gold-give').click(ev => {
      ev.preventDefault();
      game.lhtrpg.piles.giveGold(this.actor);
    });

    // Delete Inventory Item
    html.find('.item-equip').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      // Only equipment goes in a slot (gear, potions… are carried, not equipped).
      if (!item || !EQUIP_TYPES.includes(item.type)) return;
      // Weapons and shields: fill the main hand, then the off hand (see hands.mjs).
      if (["weapon", "shield"].includes(item.type)) {
        const done = item.system.equipped ? unequipHand(this.actor, item) : equipInHand(this.actor, item);
        return done.then(() => this.render(false));
      }
      const equipped = !item.system.equipped;
      const updates = [{ _id: item.id, "system.equipped": equipped }];

      // When equipping, unequip whatever exceeds this type's slot capacity
      // so items can't stack past the equipment slots shown on the sheet.
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

      this.actor.updateEmbeddedDocuments("Item", updates);
      li.slideUp(200, () => this.render(false));
    });

    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Increase a ticket's stack quantity, creating the ticket if the slot is empty
    html.find('.ticket-increment').click(ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = itemId ? this.actor.items.get(itemId) : null;
      if (item) {
        const quantity = Number(item.system.quantity) || 0;
        item.update({ 'system.quantity': quantity + 1 });
      } else {
        const subtype = ev.currentTarget.dataset.subtype;
        this._createTicket(subtype);
      }
    });

    // Add a Treasure Ticket of the rank typed next to the button (stacks with that rank if owned)
    const addRankedTicket = input => {
      const rank = Math.max(0, Math.floor(Number(input.value) || 0));
      this._createTicket('Treasure', { rank });
    };
    html.find('.ticket-rank-create').click(ev => {
      ev.preventDefault();
      addRankedTicket(ev.currentTarget.closest('.ticket-rank-add').querySelector('.ticket-rank-input'));
    });
    html.find('.ticket-rank-input').on('keydown', ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      addRankedTicket(ev.currentTarget);
    });

    // Decrease a ticket's stack quantity, removing the item once it hits 0
    html.find('.ticket-decrement').click(ev => {
      ev.preventDefault();
      const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
      if (!item) return;
      const quantity = Number(item.system.quantity) || 0;
      if (quantity <= 1) {
        item.delete();
      } else {
        item.update({ 'system.quantity': quantity - 1 });
      }
    });

    // Active Effect management
    html.find(".effect-control").click(ev => onManageActiveEffect(ev, this.actor));

    // Tag management
    activateTagInput(html, this.actor, this);


    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = ev => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }

    // Equip an item by dragging it onto one of the equipment slots.
    html.find('.equip-slot').each((i, slot) => {
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
    });

    // Swap the two equipped weapons between the hands.
    html.find('.hand-swap').click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      swapHands(this.actor);
    });

    // Unequip an item by dragging it back onto the general inventory grid.
    const inventoryList = html.find('.inventory-list')[0];
    if (inventoryList) {
      inventoryList.addEventListener("dragover", ev => ev.preventDefault());
      inventoryList.addEventListener("drop", ev => this._onInventoryDrop(ev));
    }
  }

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

  /** @override */
  _canDragDrop(selector) {
    // Players can drop items on sheets they don't own to give them away.
    return true;
  }

  /**
   * Items coming from another actor (a player, a loot pile, a chest...) are
   * moved through the piles API instead of being copied. Dragging from a
   * merchant buys the item.
   * @override
   */
  async _onDropItem(event, data) {
    const item = await Item.implementation.fromDropData(data);
    const source = item?.parent;
    if ((source instanceof Actor) && (source.uuid !== this.actor.uuid)) {
      if (game.lhtrpg.piles.isMerchant(source) && !game.user.isGM) return game.lhtrpg.piles.buyItem(source, item, this.actor);
      return game.lhtrpg.piles.transferItem(item, this.actor);
    }
    if (!this.isEditable) return false;
    return super._onDropItem(event, data);
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

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  /**
   * Give the actor one ticket of `subtype`, copied from the system compendium (keeps its text).
   * Stacks with an owned ticket of the same subtype (and rank, for Treasure Tickets).
   */
  async _createTicket(subtype, options) {
    const data = await Item.implementation.ticketData(subtype, options);
    return Item.create(data, { parent: this.actor });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    if (type === 'ticket') return this._createTicket(header.dataset.subtype);
    // Grab any data associated with this control.
    const data = foundry.utils.duplicate(header.dataset);
    // Initialize a default name.
    const name = Item.implementation.defaultName({ type, parent: this.actor });
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data
    };

    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    // Finally, create the item!
    return await Item.create(itemData, {parent: this.actor});
  }

  /**
   * Ability Check from the Stats tab: ask for a situational modifier, then roll.
   * @param {Event} event   The originating click event
   * @private
   */
  async _onRollSkill(event) {
    event.preventDefault();
    const { dice, bonus, name } = event.currentTarget.dataset;
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
      rollMode: game.settings.get('core', 'rollMode'),
    });
  }

  _onItemThrow(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    this.actor.items.get(itemId)?.ItemThrow();
  }
}
