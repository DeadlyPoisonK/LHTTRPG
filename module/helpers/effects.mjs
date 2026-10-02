/**
 * Manage Active Effect instances through the Actor or Item Sheet via effect control buttons.
 * Compatible with both AppV1 (event, owner) and AppV2 (event, owner, target).
 * @param {MouseEvent} event      The click event on the effect control
 * @param {Actor|Item} owner      The owning document (Actor or Item)
 * @param {HTMLElement} [target]  The target element (in V2 action handlers)
 */
export function onManageActiveEffect(event, owner, target) {
  event?.preventDefault?.();
  const a = target ?? (event?.currentTarget instanceof HTMLElement ? event.currentTarget : null) ?? event?.target?.closest?.(".effect-control, [data-action]");
  const li = a?.closest("li");
  // Actor sheets also list the effects their items transfer: those rows carry the effect's uuid.
  const effect = li?.dataset?.effectUuid ? fromUuidSync(li.dataset.effectUuid)
    : (li?.dataset?.effectId ? owner?.effects?.get(li.dataset.effectId) : null);
  const action = a?.dataset?.action;
  switch ( action ) {
    case "create":
      return owner?.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.localize("LHTRPG.Effect.New"),
        img: "icons/svg/aura.svg",
        origin: owner.uuid,
        "duration.rounds": li?.dataset?.effectType === "temporary" ? 1 : undefined,
        disabled: li?.dataset?.effectType === "inactive"
      }]);
    case "edit":
      return effect?.sheet?.render(true);
    case "delete":
      return effect?.delete();
    case "toggle":
      return effect?.update({disabled: !effect.disabled});
  }
}

/**
 * Prepare the data structure for Active Effects which are currently applied to an Actor or Item.
 * @param {ActiveEffect[]} effects    The array of Active Effect instances to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {

    // Define effect header categories
    const categories = {
      temporary: {
        type: "temporary",
        label: "LHTRPG.Effect.Category.temporary",
        effects: []
      },
      passive: {
        type: "passive",
        label: "LHTRPG.Effect.Category.passive",
        effects: []
      },
      inactive: {
        type: "inactive",
        label: "LHTRPG.Effect.Category.inactive",
        effects: []
      },
      // Suppressed because a condition of the effect or its skill is not met (see effect-conditions.mjs)
      unmet: {
        type: "unmet",
        label: "LHTRPG.Effect.Category.unmet",
        effects: []
      },
      suppressed: {
        type: "suppressed",
        label: "LHTRPG.Effect.Category.suppressed",
        effects: []
      }
    };

    // Iterate over active effects, classifying them into categories
    for ( let e of effects ) {
      e.sourceName; // Trigger a lookup for the source name
      if ( e.unmetCondition ) categories.unmet.effects.push(e);
      else if ( e.isSuppressed ) categories.suppressed.effects.push(e);
      else if ( e.disabled ) categories.inactive.effects.push(e);
      else if ( e.isTemporary ) categories.temporary.effects.push(e);
      else categories.passive.effects.push(e);
    }

    categories.suppressed.hidden = true;
    categories.unmet.hidden = !categories.unmet.effects.length;
    return categories;
}