import { DEFAULT_IMAGES, EQUIP_TYPES, PILE_TYPE, SPACE_TYPES } from "../piles/pile-config.mjs";
import { syncChestImage } from "../piles/piles.mjs";
import { completeChecksChange, legacyChecksUpdate, prepareMonsterChecks } from "../helpers/monster-checks.mjs";
import { classStats, legacyOptionItems, raceStats } from "../helpers/character-options.mjs";
import { getHands } from "../helpers/hands.mjs";

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class LHTrpgActor extends Actor {


  /**
   * Make adjustments before Character creation, like an actor type default picture
   */
  async _preCreate(createData, options, user) {
    await super._preCreate(createData, options, user);

    // Piles (loot, chests, merchants): visible to every player so they can
    // interact with them, with an image matching their mode.
    if (this.type === PILE_TYPE) {
      const updateData = {};
      const img = DEFAULT_IMAGES[this.system.mode] ?? DEFAULT_IMAGES.loot;
      if (this.img === 'icons/svg/mystery-man.svg') updateData['img'] = img;
      if (this.prototypeToken.texture.src === 'icons/svg/mystery-man.svg') updateData['prototypeToken.texture.src'] = img;
      if (createData.ownership?.default === undefined) updateData['ownership.default'] = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
      await this.updateSource(updateData);
      return;
    }

    // add actor default picture depending on type
    if (this.img === 'icons/svg/mystery-man.svg') {
      const updateData = {};
      updateData['img'] = `systems/lhtrpg/assets/ui/actors_icons/${this.type}.svg`;
      await this.updateSource(updateData);
    }

    // Characters imported with the legacy Race/Class/Subclass text fields get the matching items.
    if (this.type === 'character') {
      const legacy = await legacyOptionItems(this._source);
      if (legacy) this.updateSource({ ...legacy.update, items: [...this._source.items, ...legacy.items] });
    }

    // Monsters imported with legacy text Evasion/Resistance ("1+2D")
    if (this.type === 'monster') {
      const checksUpdate = legacyChecksUpdate(this._source.system.checks);
      if (checksUpdate) this.updateSource(checksUpdate);
    }
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    if ((await super._preUpdate(changed, options, user)) === false) return false;
    // Editing only the dice (or the modifier) of a legacy text check keeps the other half.
    if ((this.type === 'monster') && changed.system?.checks) {
      completeChecksChange(this._source.system.checks, changed.system.checks);
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // Chest opened/closed: swap the image of its tokens.
    if ((this.type === PILE_TYPE) && (userId === game.user.id) && foundry.utils.hasProperty(changed, "system.chest")) {
      syncChestImage(this, changed.system.chest);
    }
  }

  /**
   * Piles only store items: the effects their items would transfer (and any
   * effect of their own) never apply to them nor show on their tokens.
   * @override
   */
  *allApplicableEffects() {
    if (this.type === PILE_TYPE) return;
    yield* super.allApplicableEffects();
  }

  /** @override */
  applyActiveEffects() {
    // The Active Effects do not have access to their parent at preparation time so we wait until this stage to determine whether they are suppressed or not.
    // Also the effects of its items, which the item may suppress (unequipped, usable items…).
    for (const effect of this.allApplicableEffects()) effect.determineSuppression();
    return super.applyActiveEffects();
  }

  /** @override */
  prepareBaseData() {
    // Legacy text checks ("1+2D") must be { dice, mod } before effects add to them.
    if (this.type === 'monster') prepareMonsterChecks(this.system);
  }

  /**
   * @override
   * Augment the basic actor data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as ability modifiers rather than ability scores) and should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {
    // Piles only hold items and gold: none of the character computations apply.
    if (this.type === PILE_TYPE) return;
    const system = this.system;
    // Monsters set their values directly on the sheet: only their Evasion/Resistance need preparing.
    // (They have no class/race/infos, so the character computations below would throw.)
    if (this.type === 'monster') return prepareMonsterChecks(system);
    if (this.type !== 'character') return;

    const { str, dex, pow, int } = system.attributes;
    const fate = system.fate;
    const hp = system.health;
    const cr = system.infos.crank;
    const fati = system.infos.fatigue;

    for (const value of [fate, str, dex, pow, int, hp]) value.effect ??= 0;

    // Race and Class items (see helpers/character-options.mjs)
    const rc = raceStats(this) ?? {};
    str.rc = rc.str ?? 0;
    dex.rc = rc.dex ?? 0;
    pow.rc = rc.pow ?? 0;
    int.rc = rc.int ?? 0;
    hp.rc = rc.hp ?? 0;
    fate.rc = rc.fate ?? 0;

    const jb = classStats(this);
    const crhp = cr - 1;
    str.jb = jb ? jb.str + crhp : 0;
    dex.jb = jb ? jb.dex + crhp : 0;
    pow.jb = jb ? jb.pow + crhp : 0;
    int.jb = jb ? jb.int + crhp : 0;
    hp.jb = jb?.hp ?? 0;
    hp.mod = jb ? jb.hpPerRank * crhp : 0;

    str.total = str.jb + str.value + str.rc + str.effect;
    dex.total = dex.jb + dex.value + dex.rc + dex.effect;
    int.total = int.jb + int.value + int.rc + int.effect;
    pow.total = pow.jb + pow.value + pow.rc + pow.effect;
    fate.max = fate.rc + fate.effect;
    hp.max = hp.jb + hp.mod + hp.rc - fati + hp.effect;

    // Attributes modifiers
    for (const attribute of Object.values(system.attributes)) {
      if (attribute.mod !== undefined) attribute.mod = Math.floor(attribute.total / 3);
    }

    // Abilities Scores
    this._computeChecks();

    // Battle statuses
    this._computeBattleStatuses();

    // Inventory space
    this._computeInventoryMaxSpace();

    // item count inventory: unequipped items of the general grid (tickets
    // have their own slots and don't use inventory space)
    system.inventory.space = this.items.filter(item => SPACE_TYPES.includes(item.type)
      && ((item.system.equipped !== true) || !EQUIP_TYPES.includes(item.type))).length;
  }

  /**
   * Equipped items of a type.
   * @param {string} type
   * @returns {Item[]}
   */
  _equipped(type) {
    return this.itemTypes[type].filter(item => item.system.equipped);
  }

  /**
   * Override getRollData() that's supplied to rolls.
   */
  getRollData() {
    const system = super.getRollData();

    // Prepare character roll data.
    this._getCharacterRollData(system);

    return system;
  }

  /**
   * Prepare character roll data.
   */
  _getCharacterRollData(system) {
    if (this.type !== 'character') return;

    for (const [k, v] of Object.entries(system.attributes ?? {})) {
      system[k] = foundry.utils.deepClone(v);
    }
    for (const [k, v] of Object.entries(system['battle-status']?.power ?? {})) {
      system[k] = foundry.utils.deepClone(v);
    }

    system.itemData = {};
    system.skillData = {};
    for (const item of this.items) {
      const target = (item.type === "skill") ? system.skillData : system.itemData;
      target[item.id] = foundry.utils.deepClone(item.system);
    }
  }

  /** Attribute each Ability Check is based on (Accuracy uses the highest one). */
  static CHECK_ATTRIBUTES = {
    athletics: "str", endurance: "str",
    disable: "dex", operation: "dex", evasion: "dex",
    perception: "pow", negotiation: "pow", resistance: "pow",
    knowledge: "int", analysis: "int"
  };

  /**
   * Sum a numeric field over a list of items.
   * @param {Item[]} items
   * @param {string} field
   * @returns {number}
   */
  static _sum(items, field) {
    return items.reduce((total, item) => total + (item.system[field] ?? 0), 0);
  }

  /**
   * Autocalc the Abilities/Checks Scores
   */
  _computeChecks() {
    const system = this.system;
    const checks = system.checks;
    const { str, dex, pow, int } = system.attributes;

    for (const [check, attribute] of Object.entries(LHTrpgActor.CHECK_ATTRIBUTES)) {
      checks[check].base = system.attributes[attribute].mod ?? 0;
      checks[check].total = checks[check].base + checks[check].mod;
    }

    // Accuracy: highest attribute modifier, plus the weapons' accuracy bonus
    // (only if there's 2 or less of them, as that's the equippable limit)
    const weapons = this._equipped("weapon");
    const accuBonus = (weapons.length <= 2) ? LHTrpgActor._sum(weapons, "accuracy") : 0;
    checks.accuracy.base = Math.max(str.mod, int.mod, pow.mod, dex.mod);
    checks.accuracy.total = checks.accuracy.base + accuBonus + checks.accuracy.mod;

    // If any of the dice values goes under 1, get it back to 1.
    for (const check of Object.values(checks)) {
      check.dice = Math.max(check.dice, 1);
    }
  }

  _computeBattleStatuses() {
    const system = this.system;
    const bStatus = system["battle-status"];
    const { str, int } = system.attributes;
    const sum = LHTrpgActor._sum;

    const weapons = this._equipped("weapon");
    // Only one armor can be equipped at a time: only the first one counts
    const armors = this._equipped("armor").slice(0, 1);
    const shields = this._equipped("shield");
    const accessories = this._equipped("accessory");
    // Weapons (max. 2) and accessories (max. 3) over the equippable limit give no bonus
    const weaponBonus = (weapons.length <= 2) ? weapons : [];
    const accessoryBonus = (accessories.length <= 3) ? accessories : [];

    /**
     * ATTACK, MAGIC, RESTORATION POWER
    */

    // The main-hand weapon (see hands.mjs)
    const mainWeapon = getHands(this).main;
    bStatus.power.attack.base = mainWeapon?.system.attack ?? 0;
    bStatus.power.magic.base = mainWeapon?.system.magic ?? 0;

    // Assign values to total (accessories such as Magic stones add to the magic power)
    bStatus.power.attack.total = bStatus.power.attack.base + (bStatus.power.attack.mod ?? 0);
    bStatus.power.magic.total = bStatus.power.magic.base + (bStatus.power.magic.mod ?? 0) + sum(accessories, "magic");
    bStatus.power.restoration.total = bStatus.power.restoration.mod ?? 0;

    /**
     * DEFENSES
    */

    const defenseItems = [...armors, ...shields, ...accessoryBonus];
    bStatus.defense.phys.base = str.mod * 2;
    bStatus.defense.magic.base = int.mod * 2;
    bStatus.defense.phys.total = bStatus.defense.phys.base + bStatus.defense.phys.mod + sum(defenseItems, "pdef");
    bStatus.defense.magic.total = bStatus.defense.magic.base + bStatus.defense.magic.mod + sum(defenseItems, "mdef");

    /**
     * SPEED/MOVEMENT
    */

    bStatus.speed.base = 2;
    bStatus.speed.total = bStatus.speed.base + (bStatus.speed.mod ?? 0);

    /**
     * INITIATIVE
     */

    const initBonus = sum([...weaponBonus, ...armors, ...accessoryBonus], "initiative");
    bStatus.initiative.base = str.mod + int.mod;
    // If the initiative goes under zero, it's equal to zero
    bStatus.initiative.total = Math.max(bStatus.initiative.base + initBonus + bStatus.initiative.mod, 0);
  }

  _computeInventoryMaxSpace() {
    const inventory = this.system.inventory;
    inventory.base = 2;
    inventory.maxSpace = inventory.base + (inventory.mod ?? 0) + LHTrpgActor._sum(this._equipped("bag"), "bagSpace");
  }

}
