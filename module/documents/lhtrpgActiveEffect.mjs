import { evaluateFormula, formulaData, isFormula, readsAttributes } from "../helpers/effect-formulas.mjs";
import { effectConditions, unmetCondition } from "../helpers/effect-conditions.mjs";
import { collectRollBonus, isSkillFilterKey } from "../helpers/roll-bonuses.mjs";

/**
 * Extend the base ActiveEffect class to implement system-specific logic.
 * @extends {ActiveEffect}
 */
export class LHTrpgActiveEffect extends ActiveEffect {

    /**
     * Is this active effect currently suppressed?
     * @type {boolean}
     */
    isSuppressed = false;

    /**
     * The condition (see effect-conditions.mjs) that suppresses this effect, if any.
     * @type {object|null}
     */
    unmetCondition = null;

    /* --------------------------------------------- */

    /**
     * The item whose Skill Rank the effect's formulas and conditions read: the item that carries it, or the
     * actor's item it came from (origin). Effects copied when a skill was used don't depend on it any more.
     * @type {Item|null}
     */
    get sourceItem() {
        if (this.parent?.documentName === "Item") return this.parent;
        if ((this.parent?.documentName !== "Actor") || this.getFlag("lhtrpg", "itemUse")) return null;
        const [parentType, parentId, documentType, documentId] = this.origin?.split(".") ?? [];
        if ((parentType !== "Actor") || (parentId !== this.parent.id) || (documentType !== "Item")) return null;
        return this.parent.items.get(documentId) ?? null;
    }

    /* --------------------------------------------- */

    /**
     * Formula values ("@sr*3") are evaluated against the actor and the source item. On a character, those
     * reading attributes wait for its modifiers: they are kept in `actor._lhDeferredChanges` and applied by
     * the actor (`_applyDeferredChanges`) with `actor._lhDeferredPass` set. Roll bonuses go to
     * `actor.rollBonuses` instead.
     * @inheritdoc
     */
    apply(actor, change) {
        if (this.isSuppressed) return null;
        // Roll bonuses and skill modifiers (see roll-bonuses.mjs): kept on the actor, evaluated when used.
        if (isSkillFilterKey(change.key)) {
            collectRollBonus(actor, this, change);
            return {};
        }
        if (isFormula(change.value)) {
            if ((actor.type === "character") && readsAttributes(change.value) && !actor._lhDeferredPass) {
                (actor._lhDeferredChanges ??= []).push(change);
                return {};
            }
            const value = evaluateFormula(change.value, formulaData(actor, this.sourceItem));
            if (value === null) {
                console.warn(`lhtrpg | Invalid formula "${change.value}" in effect "${this.name}" (${this.uuid})`);
                return {};
            }
            change = { ...change, value: String(value) };
        }
        return super.apply(actor, change);
    }

    /**
     * Determine whether this Active Effect is suppressed or not.
     */
    determineSuppression() {
        this.isSuppressed = false;
        this.unmetCondition = null;
        if (this.disabled) return;
        const item = this.sourceItem;
        // Effect of an item held by the actor (transferred, or copied with it as origin): the item decides
        // (equipped, usable…).
        if (item) {
            this.isSuppressed = item.areEffectsSuppressed;
            if (this.isSuppressed) return;
        }
        if (this.parent?.documentName === "Item" && !this.parent.parent) return;
        const actor = this.parent?.documentName === "Actor" ? this.parent : this.parent?.parent;
        this.unmetCondition = unmetCondition(effectConditions(this, item), actor, item);
        this.isSuppressed = !!this.unmetCondition;
    }


}
