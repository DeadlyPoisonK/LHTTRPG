import { onManageActiveEffect, prepareActiveEffectCategories } from "../helpers/effects.mjs";
import { onManageTags } from "../helpers/tags.mjs";
import { getStatusPanel } from "../helpers/statuses.mjs";
import { MONSTER_CHECK_MAX_DICE } from "../helpers/monster-checks.mjs";
import { diceFormula, diceOptions } from "../helpers/dice.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class LHTrpgActorMonsterSheet extends foundry.appv1.sheets.ActorSheet {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["lhtrpg", "sheet", "monster"],
            template: "systems/lhtrpg/templates/actor/actor-monster-sheet.html",
            width: 520,
            height: 550,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" },
            { navSelector: ".status-tabs", contentSelector: ".status-body", initial: "status" }],
            dragDrop: [{dragSelector: ".items-list .item", dropSelector: null},
            {dragSelector: ".inventory-list .item", dropSelector: null}]
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

        // Add the actor's data to context.system for easier access, as well as flags.
        context.system = actorData.system;
        context.flags = actorData.flags;

        // Prepare character data and items.
        if (actorData.type == 'monster') {
            this._prepareItems(context);
            this._prepareCharacterData(context);
        }
        // Add roll data for TinyMCE editors.
        context.rollData = context.actor.getRollData();

        context.enrichments = {
            "description": await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.system.description, {async: true})
        };

        // Prepare active effects
        context.effects = prepareActiveEffectCategories(this.actor.effects);
        context.statusPanel = getStatusPanel(this.actor);

        // Evasion / Resistance dice: 0D6 to 5D6
        context.checkDiceOptions = diceOptions(MONSTER_CHECK_MAX_DICE);

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
        const skillsMonster = [];

        // Iterate through items, allocating to containers, but for monsters
        for (let i of context.items) {

            i.img = i.img || CONST.DEFAULT_TOKEN;

            if (i.type === 'skill') {
                skillsMonster.push(i);
            }

        }

        context.skillsMonster = skillsMonster;
    }

    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        
        html.find('.item-throw').click(this._onItemThrow.bind(this));

        html.find('.monster-send-to-chat').click(this._onSendToChat.bind(this));

        // Evasion / Resistance rolls
        html.find('.monster-check-roll').click(this._onRollCheck.bind(this));

        // Render the item sheet for viewing/editing prior to the editable check.
        html.find('.item-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.sheet.render(true);
        });


        html.find('#hate-button').click(ev => {
            let content = ev.target.nextElementSibling;
            ev.target.classList.toggle("active");

            if (content.style.transform === "perspective(400px) rotateY(-30deg)") {
                content.style.transform = "perspective(400px) rotateY(-90deg)";
                // this._onOpeningInfoWindow(false, this.actor);
            } else {
                content.style.transform = "perspective(400px) rotateY(-30deg)";
                // this._onOpeningInfoWindow(true, this.actor);
            }

        });


        // -------------------------------------------------------------
        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        // Toggle statuses that have no data field (the others sync from their inputs)
        html.find('.status-toggle').on("change", ev => {
            this.actor.toggleStatusEffect(ev.currentTarget.dataset.statusId, { active: ev.currentTarget.checked });
        });

        // Add Inventory Item
        html.find('.item-create').click(this._onItemCreate.bind(this));

        // Delete Inventory Item
        html.find('.item-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.delete();
            li.slideUp(200, () => this.render(false));
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
        // Initialize a default name.
        const name = `New ${type.capitalize()}`;
        // Prepare the item object.
        const itemData = {
            name: name,
            type: type,
            system: data
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.system["type"];

        // Finally, create the item!
        return await Item.create(itemData, { parent: this.actor });
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

    /**
     * Roll the monster's Evasion or Resistance straight to chat: no rule modifies them situationally.
     * @param {Event} event   The originating click event
     * @private
     */
    _onRollCheck(event) {
        event.preventDefault();
        const { check, name } = event.currentTarget.dataset;
        const values = this.actor.system.checks?.[check];
        if (!values) return;
        return new Roll(diceFormula(values)).toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `${game.i18n.localize("LHTRPG.WindowTitle.AbilityCheck")} - ${game.i18n.localize(`LHTRPG.Check.${name}`)}`,
            rollMode: game.settings.get('core', 'rollMode'),
        });
    }

    /**
     * Send the monster's Identify info to chat: the GM clicks this after the
     * party succeeds an Identification check. Per the rules, this reveals
     * name/rank/tags/condition (always visible on sight) plus, once
     * Identified, which Defense is lower, the Hate Multiplier, and Skill
     * details. Exact attributes, HP/Fate, Evasion/Resistance and the raw
     * defense values are never shown to players.
     * @param {Event} event   The originating click event
     * @private
     */
    async _onSendToChat(event) {
        event.preventDefault();
        const actor = this.actor;
        const system = actor.system;
        // Condition = every LS/BS/CS/OS on the monster, ratings included in the effect name.
        // [Hidden] is left out: the players would not know about it.
        const conditions = actor.effects
            .filter(e => e.active && e.statuses.size && !e.statuses.has("hidden"))
            .map(e => e.name);

        const pdef = system['battle-status']?.defense?.phys ?? 0;
        const mdef = system['battle-status']?.defense?.magic ?? 0;
        let lowerDefense;
        if (pdef < mdef) lowerDefense = game.i18n.localize('LHTRPG.Monster.DefensePhysical');
        else if (mdef < pdef) lowerDefense = game.i18n.localize('LHTRPG.Monster.DefenseMagical');
        else lowerDefense = game.i18n.localize('LHTRPG.Monster.DefenseEqual');

        const skills = await Promise.all(actor.items.filter(i => i.type === 'skill').map(async item => ({
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
            "systems/lhtrpg/templates/dialogs/monsterInfoCard.hbs", cardData
        );

        return ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content
        });
    }

    _onItemThrow(event) {
        event.preventDefault();
        const itemId = event.currentTarget.closest(".item").dataset.itemId;
        console.log(itemId);
        const item = this.actor.items.get(itemId);
        console.log(item);
    
        item.ItemThrow();
    
      }

    // async _onOpeningInfoWindow (state, actor) {
    //   console.log(state);
    //   console.log(actor);
    //   await actor.setFlag("lhtrpg", "hfWindowOpened", state);
    // }

}
