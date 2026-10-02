import { prepareSkillRolls, skillRollable } from "../helpers/skill-rolls.mjs";
import { skillModifiers } from "../helpers/roll-bonuses.mjs";
import { OPTION_ICONS, OPTION_TYPES } from "../helpers/character-options.mjs";
import { useSkillEffects } from "../helpers/sustained.mjs";

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
    "usable": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "ticket": "systems/lhtrpg/templates/dialogs/itemCard.hbs",
    "connection": "systems/lhtrpg/templates/item/item-connection-sheet.html",
    "union": "systems/lhtrpg/templates/item/item-union-sheet.html",
    }

  /**
 * Should this item's active effects be suppressed.
 * @type {boolean}
 */
  get areEffectsSuppressed() {
    // Usable items (potions, scrolls…) don't affect whoever carries them: their effects are copied
    // to the target when the item is used (see item-use.mjs).
    if (this.type === "usable") return true;
    // Race / Class / Subclass effects apply as long as the character holds the item, and so do the
    // effects of other carried items (Gear such as the Cursed Stone), which are never equipped.
    const requireEquipped = !["skill", "connection", "union", "gear", ...OPTION_TYPES].includes(this.type);
    if (requireEquipped && (this.system.equipped === false)) return true;

    return false;
  }


  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    // Skill Check / Damage: normalized values plus the labels shown on sheets and chat cards
    if (["skill", "usable"].includes(this.type)) prepareSkillRolls(this);
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

  /** System compendium holding the base ticket of each subtype. */
  static TICKET_PACK = "lhtrpg.items";

  /**
   * Data for one new ticket of `subtype`, copied from the system compendium so it keeps its
   * name, picture and rules text. Falls back to a blank ticket if the entry is missing.
   * @param {string} subtype          Treasure | Fate | Connection | Reset
   * @param {object} [options]
   * @param {number} [options.rank]   Rank (CR) of the ticket, used by Treasure Tickets
   * @returns {Promise<object>}
   */
  static async ticketData(subtype, { rank } = {}) {
    let data = { name: "New Ticket", type: "ticket", system: { subtype } };
    const pack = game.packs.get(LHTrpgItem.TICKET_PACK);
    if (pack) {
      const index = await pack.getIndex({ fields: ["system.subtype"] });
      const entry = index.find(e => (e.type === "ticket") && (e.system?.subtype === subtype));
      const source = entry ? await pack.getDocument(entry._id) : null;
      if (source) {
        data = game.items.fromCompendium(source);
        foundry.utils.setProperty(data, "_stats.compendiumSource", source.uuid);
      }
    }
    data.system.quantity = 1;
    if (rank !== undefined) data.system.rank = rank;
    return data;
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

  /** @override */
  async _preUpdate(changed, options, user) {
    if ((await super._preUpdate(changed, options, user)) === false) return false;
    // Once the Check is set on the sheet, the legacy free-text Check is no longer used.
    if (["skill", "usable"].includes(this.type) && changed.system?.check && this._source.system.checkType) {
      changed.system.checkType = "";
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
   * Send the item's card to chat (skills get Check / Damage buttons). A skill with a macro
   * (`system.macroeffect`, a macro id) also runs it.
   * @returns {Promise<ChatMessage>}
   */
  async ItemThrow() {
    const element = this;
    const system = element.system;

    const macro = system.macroeffect ? game.macros.get(system.macroeffect) : null;
    if (macro) macro.execute({ actor: element.actor, item: element });

    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: element.actor })
    };

    const enrichedDescription = system.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.description)
      : "";
    const enrichedSkillText = system.skillText
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.skillText)
      : "";

    let appliedNames = "";
    let canApplyEffects = false;
    let skillUseFlag = null;

    if (element.type === "skill") {
      const nonTransferEffects = element.effects.filter(e => e.transfer === false);
      if (nonTransferEffects.length > 0) {
        const result = await useSkillEffects(element);
        appliedNames = result.appliedNames;
        canApplyEffects = result.canApplyEffects;
        skillUseFlag = result.skillUse;
      }
    }

    let cardData = {
        ...element.toObject(false),
        owner: element.actor?.id,
        typeLabel: game.i18n.localize(`TYPES.Item.${element.type}`),
        isWeapon: element.type === "weapon",
        isArmor: element.type === "armor",
        isShield: element.type === "shield",
        isAccessory: element.type === "accessory",
        isBag: element.type === "bag",
        isGear: ["gear", "usable"].includes(element.type),
        isTicket: element.type === "ticket",
        enrichedDescription,
        enrichedSkillText,
        // Skill cards: Check / Damage roll buttons (see the renderChatMessageHTML hook)
        uuid: element.uuid,
        rollable: element.type === "skill" ? skillRollable(element) : {},
        appliedNames,
        canApplyEffects,
        // Hate cost / range / notes changed by the user's effects (see roll-bonuses.mjs)
        mods: element.type === "skill" ? skillModifiers(element.actor, element) : null
    };

    chatData.content = await foundry.applications.handlebars.renderTemplate(this.chatTemplate[element.type], cardData);
    if (skillUseFlag) {
      foundry.utils.setProperty(chatData, "flags.lhtrpg.skillUse", skillUseFlag);
    }
    return ChatMessage.create(chatData);
  }
}
