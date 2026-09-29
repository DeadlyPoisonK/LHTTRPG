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

    /* --------------------------------------------- */

    /** @inheritdoc */
    apply(actor, change) {
        if (this.isSuppressed) return null;

        return super.apply(actor, change);
    }

    /**
     * Determine whether this Active Effect is suppressed or not.
     */
    determineSuppression() {
        this.isSuppressed = false;
        if (this.disabled) return;
        // Effect of an item held by the actor (transferred): the item decides (equipped, usable…).
        if ((this.parent.documentName === "Item") && this.parent.parent) {
            this.isSuppressed = this.parent.areEffectsSuppressed;
            return;
        }
        if (this.parent.documentName !== "Actor") return;
        // Copied from a usable item when it was used (item-use.mjs): not tied to the item any more.
        if (this.getFlag("lhtrpg", "itemUse")) return;
        const [parentType, parentId, documentType, documentId] = this.origin?.split(".") ?? [];
        if ((parentType !== "Actor") || (parentId !== this.parent.id) || (documentType !== "Item")) return;
        const item = this.parent.items.get(documentId);
        if (!item) return;
        this.isSuppressed = item.areEffectsSuppressed;
    }


}