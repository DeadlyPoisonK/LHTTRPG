/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class LHTrpgItem extends Item {

  
  chatTemplate = {
    "skill": "systems/lhtrpg/templates/dialogs/skillThrow.hbs",
    "weapon": "systems/lhtrpg/templates/item/item-weapon-sheet.html",
    "armor": "systems/lhtrpg/templates/item/item-armor-sheet.html",
    "shield": "systems/lhtrpg/templates/item/item-shield-sheet.html",
    "accessory": "systems/lhtrpg/templates/item/item-accessory-sheet.html",
    "bag": "systems/lhtrpg/templates/item/item-bag-sheet.html",
    "gear": "systems/lhtrpg/templates/item/item-gear-sheet.html",
    "valuable": "systems/lhtrpg/templates/item/item-valuable-sheet.html",
    "connection": "systems/lhtrpg/templates/item/item-connection-sheet.html",
    "union": "systems/lhtrpg/templates/item/item-union-sheet.html",
    }

  /**
 * Should this item's active effects be suppressed.
 * @type {boolean}
 */
  get areEffectsSuppressed() {
    const requireEquipped = (this.type !== "skill") && (this.type !== "connection") && (this.type !== "union");
    if (requireEquipped && (this.system.equipped === false)) return true;

    return false;
  }


  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Make adjustments before Item creation, like an item type default picture
   */
  async _preCreate(createData, options, user) {
    await super._preCreate(createData, options, user);

    // add item default picture depending on type
    if (this.img === 'icons/svg/item-bag.svg') {
      const updateData = {};
      updateData['img'] = `systems/lhtrpg/assets/ui/items_icons/${this.type}.svg`;
      
      await this.updateSource(updateData);
    }
  }

  /**
   * Prepare a data object which is passed to any Roll formulas which are created related to this Item
   * @private
   */
  getRollData() {
    // If present, return the actor's roll data.
    if (!this.actor) return null;
    const rollData = this.actor.getRollData();
    rollData.item = foundry.utils.deepClone(this.system);

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this.system;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${this.type}] ${this.name}`;

    // If there's no roll data, send a chat message.
    if (!item.formula) {
      await ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.description ?? ''
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.item.formula, rollData);
      // If you need to store the value first, uncomment the next line.
      // let result = await roll.roll({async: true});
      await roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }

  async ItemThrow(event) {
    const element = this;
    const system = element.system;
    const macroId = system.macroeffect; // Asumiendo que esto es directamente el ID de la macro

    if (macroId) {
        // Encuentra la macro por su ID
        const macro = game.macros.get(macroId);
        if (macro) {
            // Ejecuta la macro
            macro.execute();
        } else {
        }
    } else {
    }

    let chatData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
    };

    let cardData = {
        ...element.toObject(),
        owner: element.actor.id
    };

    // Renderizar la plantilla del chat
    chatData.content = await foundry.applications.handlebars.renderTemplate(this.chatTemplate[element.type], cardData);
    chatData.roll = true;
    console.log(chatData);
    return ChatMessage.create(chatData);
}
}
