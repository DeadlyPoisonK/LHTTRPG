import { prepareSkillRolls } from "../helpers/skill-rolls.mjs";
import { OPTION_ICONS, OPTION_TYPES } from "../helpers/character-options.mjs";

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class LHTrpgItem extends Item {

  
  chatTemplate = {
    "skill": "systems/lhtrpg/templates/dialogs/skillThrow.hbs",
    "weapon": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "armor": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "shield": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "accessory": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "bag": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "gear": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "ticket": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "valuable": "systems/lhtrpg/templates/item/item-valuable-sheet.html",
    "connection": "systems/lhtrpg/templates/item/item-connection-sheet.html",
    "union": "systems/lhtrpg/templates/item/item-union-sheet.html",
    }

  /**
 * Should this item's active effects be suppressed.
 * @type {boolean}
 */
  get areEffectsSuppressed() {
    // Race / Class / Subclass effects apply as long as the character holds the item.
    const requireEquipped = !["skill", "connection", "union", ...OPTION_TYPES].includes(this.type);
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

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    // Skill Check / Damage: normalized values plus the labels shown on sheets and chat cards
    if (this.type === "skill") prepareSkillRolls(this.system, this._source.system);
  }

  /**
   * Default name/icon per ticket subtype, matching the core Foundry banner
   * icons so no custom art needs to ship with the system.
   */
  static TICKET_PRESETS = {
    Treasure: { name: "Treasure Ticket", img: "icons/sundries/flags/banner-pink.webp" },
    Fate: { name: "Fate Ticket", img: "icons/sundries/flags/banner-green.webp" },
    Connection: { name: "Connection Ticket", img: "icons/sundries/flags/banner-purple.webp" },
    Reset: { name: "Reset Ticket", img: "icons/sundries/flags/banner-blue.webp" }
  }

  /**
   * Make adjustments before Item creation, like an item type default picture
   */
  async _preCreate(createData, options, user) {
    await super._preCreate(createData, options, user);

    if (this.type === "ticket") {
      const preset = LHTrpgItem.TICKET_PRESETS[this.system.subtype] ?? LHTrpgItem.TICKET_PRESETS.Treasure;
      const updateData = {};
      if (!this.name || this.name === "New Ticket") updateData['name'] = preset.name;
      if (this.img === 'icons/svg/item-bag.svg') updateData['img'] = preset.img;
      if (Object.keys(updateData).length) await this.updateSource(updateData);
      return;
    }

    // add item default picture depending on type
    if (this.img === 'icons/svg/item-bag.svg') {
      const updateData = {};
      updateData['img'] = OPTION_ICONS[this.type] ?? `systems/lhtrpg/assets/ui/items_icons/${this.type}.svg`;

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

    const enrichedDescription = system.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.description, { async: true })
      : "";
    const enrichedSkillText = system.skillText
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.skillText, { async: true })
      : "";

    let cardData = {
        ...element.toObject(false),
        owner: element.actor?.id,
        typeLabel: game.i18n.localize(`TYPES.ITEM.Type${element.type.capitalize()}`),
        isWeapon: element.type === "weapon",
        isArmor: element.type === "armor",
        isShield: element.type === "shield",
        isAccessory: element.type === "accessory",
        isBag: element.type === "bag",
        isGear: element.type === "gear",
        isTicket: element.type === "ticket",
        enrichedDescription,
        enrichedSkillText
    };

    // Renderizar la plantilla del chat
    chatData.content = await foundry.applications.handlebars.renderTemplate(this.chatTemplate[element.type], cardData);
    chatData.roll = true;
    return ChatMessage.create(chatData);
}
}
