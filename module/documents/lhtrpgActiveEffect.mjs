import { evaluateFormula, formulaData, isFormula, readsAttributes } from "../helpers/effect-formulas.mjs";
import { effectConditions, unmetCondition } from "../helpers/effect-conditions.mjs";
import { isSkillFilterKey } from "../helpers/roll-bonuses.mjs";

/**
 * Change phase of the formulas that read attribute modifiers ("@dex*2"): on a character they are computed in
 * prepareDerivedData, so these changes apply there (see LHTrpgActor#prepareDerivedData), before the checks and
 * battle statuses that add up the `.mod` fields.
 */
export const ATTRIBUTES_PHASE = "attributes";

/**
 * Extend the base ActiveEffect class to implement system-specific logic.
 * @extends {ActiveEffect}
 */
export class LHTrpgActiveEffect extends ActiveEffect {

    /**
     * Whether the system suppresses this effect: its item (unequipped…) or an unmet condition.
     * See determineSuppression.
     * @type {boolean}
     */
    _lhSuppressed = false;

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
     * Effects applied when a skill or item is used are temporary even without a core duration: they last until
     * their Log Horizon expiry (end of process / round / scene) or, without one, the end of the scene.
     * @inheritdoc
     */
    get isTemporary() {
        return super.isTemporary || !!this.getFlag("lhtrpg", "expires") || !!this.getFlag("lhtrpg", "itemUse");
    }

    /* --------------------------------------------- */

    /**
     * The item that carries the effect, or the skill / item whose use applied it; else the core origin lookup
     * (compendium effects come with no origin, which core shows as "None").
     * @inheritdoc
     */
    get sourceName() {
        if (this.parent?.documentName === "Item") return this.parent.name;
        return this.getFlag("lhtrpg", "source")?.itemName || super.sourceName;
    }

    /* --------------------------------------------- */

    /**
     * Suppressed by the system (see determineSuppression) or, as in core, expired.
     * @inheritdoc
     */
    get isSuppressed() {
        return this._lhSuppressed || super.isSuppressed;
    }

    /* --------------------------------------------- */

    /**
     * Roll bonuses and skill modifiers are not applied: the actor collects them (see LHTrpgActor#_prepareEffects).
     * On a character, the changes whose formula reads attributes wait for the attributes phase.
     * @inheritdoc
     */
    shouldApplyChange(change, options) {
        if (isSkillFilterKey(change.key)) return false;
        if ((change.phase === "initial") && (this.target?.type === "character") && readsAttributes(change.value)) {
            return options?.phase === ATTRIBUTES_PHASE;
        }
        return super.shouldApplyChange(change, options);
    }

    /* --------------------------------------------- */

    /**
     * Formula values ("@sr*3") are evaluated against the actor and the source item of the change's effect.
     * @inheritdoc
     */
    static applyChange(targetDoc, change, options) {
        const effect = change.effect;
        if (effect && isFormula(change.value)) {
            const value = evaluateFormula(change.value, formulaData(effect.target ?? targetDoc, effect.sourceItem));
            if (value === null) {
                console.warn(`lhtrpg | Invalid formula "${change.value}" in effect "${effect.name}" (${effect.uuid})`);
                return {};
            }
            change = { ...change, value };
        }
        return super.applyChange(targetDoc, change, options);
    }

    /**
     * Determine whether this Active Effect is suppressed or not.
     */
    determineSuppression() {
        this._lhSuppressed = false;
        this.unmetCondition = null;
        if (this.disabled) return;
        const item = this.sourceItem;
        // Effect of an item held by the actor (transferred, or copied with it as origin): the item decides
        // (equipped, usable…).
        if (item) {
            this._lhSuppressed = item.areEffectsSuppressed;
            if (this._lhSuppressed) return;
        }
        if (this.parent?.documentName === "Item" && !this.parent.parent) return;
        const actor = this.parent?.documentName === "Actor" ? this.parent : this.parent?.parent;
        this.unmetCondition = unmetCondition(effectConditions(this, item), actor, item);
        this._lhSuppressed = !!this.unmetCondition;
    }


}
