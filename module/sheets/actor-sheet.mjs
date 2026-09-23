import {onManageActiveEffect, prepareActiveEffectCategories} from "../helpers/effects.mjs";
import {onManageTags} from "../helpers/tags.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class LHTrpgActorSheet extends foundry.appv1.sheets.ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["lhtrpg", "sheet", "actor"],
      template: "systems/lhtrpg/templates/actor/actor-sheet.html",
      width: 700,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" },
      { navSelector: ".status-tabs", contentSelector: ".status-body", initial: "status" },
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
      this._prepareCharacterData(context);
    }

    // Add roll data for TinyMCE editors.
    context.rollData = context.actor.getRollData();

    // Enrich textarea content
    context.enrichments = {
      "biography": await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.biography, {async: true})
    };

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(this.actor.effects);

    return context;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareCharacterData(context) {


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
    const itemsEquippedGear = [];
    const itemsWeapon = [];
    const itemsArmor = [];
    const itemsShield = [];
    const itemsAccessory = [];
    const itemsBag = [];
    const itemsGear = [];

    const itemsTicketTreasure = [];
    const itemsTicketFate = [];
    const itemsTicketConnection = [];
    const itemsTicketReset = [];

    const itemsConnection = [];
    const itemsUnion = [];

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || CONST.DEFAULT_TOKEN;
      // Append to Combat Skills.
      if (i.type === 'skill' && i.system.subtype === 'Combat') {
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
      else if (i.system.equipped === true && i.type === 'gear') {
        itemsEquippedGear.push(i);
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
      // Append to Gear.
      else if (i.system.equipped === false && i.type === 'gear') {
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
        "bags": itemsEquippedBag,
        "gear": itemsEquippedGear
      },
      "weapons": itemsWeapon,
      "armors": itemsArmor,
      "shields": itemsShield,
      "accessories": itemsAccessory,
      "bags": itemsBag,
      "gear": itemsGear,
    }

    context.tickets = {
      "treasure": itemsTicketTreasure,
      "fate": itemsTicketFate,
      "connection": itemsTicketConnection,
      "reset": itemsTicketReset
    }

    // Unequipped items fill the general inventory grid, one slot each, up to
    // the bag-derived maxSpace. Remaining slots render as empty placeholders
    // so the right-hand panel always shows the actual carrying capacity.
    const carriedItems = [].concat(itemsWeapon, itemsArmor, itemsShield, itemsAccessory, itemsBag, itemsGear);
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

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.item-throw').click(this._onItemThrow.bind(this));

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

    html.find('.neffect').on("change", (event) => {
      const input = event.currentTarget;
      const effectName = input.name.split(".").pop(); // Extrae el nombre del efecto
      const value = parseInt(input.value) || 0; // Obtiene el valor del input o 0 si está vacío
  
      this._updateEffect(effectName, value);
    });

    
    html.find('input[type="checkbox"]').on("change", (event) => {
      const input = event.currentTarget;
      const effectName = input.name.split(".").pop(); // Extrae el nombre del efecto
      const isChecked = input.checked;
  
      this._toggleEffect(effectName, isChecked);
    });

      // Escucha cambios en los cuadros de entrada tipo number
    
    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.find('.item-equip').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      let equipped = item.system.equipped;
      equipped = !equipped;
      item.update(
        { 'system.equipped': equipped}
      )
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
        Item.create({ name: 'New Ticket', type: 'ticket', system: { subtype } }, { parent: this.actor });
      }
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
    html.find(".tag-control").click(ev => onManageTags(ev, this.actor));

    // Rollable abilities.
    html.find('.rollable').click(this._onRoll.bind(this));

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
      await item.update({ "system.equipped": false });
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

    // Copy the item onto this actor first if it isn't already owned by it.
    if (item.parent?.id !== this.actor.id) {
      const [created] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
      item = created;
    }

    const slotType = slot.dataset.slotType;
    const slotIndex = Number(slot.dataset.slotIndex ?? 0);

    if (item.type !== slotType) {
      ui.notifications.warn(game.i18n.format("INVENTORY.Notif.WrongItemType", {
        item: item.name,
        type: game.i18n.localize(`TYPES.ITEM.Type${item.type.capitalize()}`),
        slot: game.i18n.localize(`TYPES.ITEM.Type${slotType.capitalize()}`)
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
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = foundry.utils.duplicate(header.dataset);
    console.log(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data
    };

    console.log(itemData);
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    // Finally, create the item!
    return await Item.create(itemData, {parent: this.actor});
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[roll] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  async _onRollSkill(event) {

    const element = event.currentTarget;
    const dataset = element.dataset;
    const dice = dataset.dice;
    const bonus = dataset.bonus;
    const skillName = dataset.name;
    console.log(dataset);
    const rendered_dialog = await foundry.applications.handlebars.renderTemplate("systems/lhtrpg/templates/dialogs/rollDialog.html");
    const checkName = `LHTRPG.Check.${skillName}`;
    let mod;

    let d = new Dialog({
      title: `${game.i18n.localize("LHTRPG.WindowTitle.AbilityCheck")} - ${game.i18n.localize(checkName)}`,
      content: rendered_dialog,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: game.i18n.localize("LHTRPG.ButtonLabel.Roll"),
          callback: html => {
            mod = $(html).find('.abilityCheckMod').val();
            this.rollSkill(skillName, dice, bonus, mod);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("LHTRPG.ButtonLabel.Cancel"),
        }
      },
      default: "cancel"
    });
    d.render(true);

  }

  rollSkill(skillName, dice, bonus, mod) {

    const checkName = `LHTRPG.Check.${skillName}`;
    const flavorText = `${game.i18n.localize("LHTRPG.WindowTitle.AbilityCheck")} - ${game.i18n.localize(checkName)}`;
    let roll;
    let formula;

    if(mod === undefined || mod == 0) {
      formula = `${dice}d6+${bonus}`;
    }
    else if (mod > 0) {
      formula = `${dice}d6+${bonus}+${mod}`;
    }
    else {
      formula = `${dice}d6+${bonus}-${Math.abs(mod)}`;
    }

    console.log(formula);


    roll = new Roll(formula);

    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavorText,
      rollMode: game.settings.get('core', 'rollMode'),
    });

    return roll;

  }

  _onItemThrow(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    console.log(itemId);
    const item = this.actor.items.get(itemId);
    console.log(item);

    item.ItemThrow();
}



async _toggleEffect(effectName, isChecked) {
  const actor = this.actor;

  // Busca si ya existe un efecto con ese nombre
  const existingEffect = actor.effects.find(e => e.getFlag("core", "statusId") === effectName);

  if (isChecked && !existingEffect) {
    // Crear nuevo efecto
    const effectData = {
      name: game.i18n.localize(`LHTRPG.Label.${effectName}`), // Traducir el nombre
      img: `systems/lhtrpg/assets/ui/effects/${effectName}.png`, // Ruta del icono
      changes: [], // Cambios mecánicos si aplica // Duración de ejemplo
      flags: { core: { statusId: effectName } } // Identificador único
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  } else if (!isChecked && existingEffect) {
    // Eliminar el efecto existente
    await actor.deleteEmbeddedDocuments("ActiveEffect", [existingEffect.id]);
  }
}

async _updateEffect(effectName, value) {
  const actor = this.actor;

  // Busca si ya existe un efecto con ese nombre
  const existingEffect = actor.effects.find(e => e.getFlag("core", "statusId") === effectName);

  if (value > 0) {
    if (existingEffect) {
      // Actualiza el efecto existente
      await existingEffect.update({ "flags.core.value": value });
    } else {
      // Crear nuevo efecto
      const effectData = {
        name: game.i18n.localize(`LHTRPG.Label.${effectName}`), // Traducir el nombre
        img: `systems/lhtrpg/assets/ui/effects/${effectName}.png`, // Ruta del icono
        changes: [
          {
            key: `flags.custom.${effectName}`,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: value,
            priority: 20
          }
        ],
        duration: { seconds: 3600 }, // Ejemplo de duración
        flags: { core: { statusId: effectName, value } } // Identificador único con valor
      };

      await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
  } else if (existingEffect) {
    // Eliminar el efecto si el valor es 0 o vacío
    await actor.deleteEmbeddedDocuments("ActiveEffect", [existingEffect.id]);
  }
}




  // async _onOpeningInfoWindow (state, actor) {
  //   console.log(state);
  //   console.log(actor);
  //   await actor.setFlag("lhtrpg", "hfWindowOpened", state);
  // }

}
