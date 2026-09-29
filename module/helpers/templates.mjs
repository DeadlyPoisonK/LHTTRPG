/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
 export const preloadHandlebarsTemplates = async function() {
  return foundry.applications.handlebars.loadTemplates([

    // Actor partials.
    "systems/lhtrpg/templates/actor/parts/actor-stats.html",
    "systems/lhtrpg/templates/actor/parts/actor-effects.html",
    "systems/lhtrpg/templates/actor/parts/actor-inventory.html",
    "systems/lhtrpg/templates/actor/parts/actor-tickets.html",
    "systems/lhtrpg/templates/actor/parts/inventory/inventory-ticket-ranked-slot.html",
    "systems/lhtrpg/templates/item/parts/item-subclass-skills.html",
    "systems/lhtrpg/templates/actor/parts/actor-biography.html",
    "systems/lhtrpg/templates/actor/parts/actor-bio-connections.html",
    "systems/lhtrpg/templates/actor/parts/actor-bio-unions.html",
    "systems/lhtrpg/templates/actor/parts/actor-skills-basic.html",
    "systems/lhtrpg/templates/actor/parts/actor-skills-combat.html",
    "systems/lhtrpg/templates/actor/parts/actor-skills-general.html",
    "systems/lhtrpg/templates/actor/parts/actor-status.html",
    "systems/lhtrpg/templates/actor/parts/actor-status-panel.html",
    "systems/lhtrpg/templates/actor/parts/actor-option.html",

    "systems/lhtrpg/templates/actor/parts/inventory/inventory-itemlist.html",
    "systems/lhtrpg/templates/actor/parts/inventory/inventory-equip-slot.html",
    "systems/lhtrpg/templates/actor/parts/inventory/inventory-ticket-slot.html",
    "systems/lhtrpg/templates/actor/parts/skills/skills-grid.html",

    "systems/lhtrpg/templates/actor/parts/monster-skills.html",
    "systems/lhtrpg/templates/actor/parts/monster-effects.html",

    //Items partials
    "systems/lhtrpg/templates/item/parts/item-effects.html",
    "systems/lhtrpg/templates/item/parts/item-header.html",
    "systems/lhtrpg/templates/parts/tag-input.html",
    "systems/lhtrpg/templates/item/parts/item-linked-skill.html",
    "systems/lhtrpg/templates/item/parts/item-grants.html",
    "systems/lhtrpg/templates/item/parts/skill-field.html",
    "systems/lhtrpg/templates/item/parts/roll-check.html",
    "systems/lhtrpg/templates/item/parts/roll-damage.html",

    // Combat chat cards
    "systems/lhtrpg/templates/chat/attack-card.hbs",
    "systems/lhtrpg/templates/chat/damage-card.hbs",
    "systems/lhtrpg/templates/chat/damage-applied.hbs",
    "systems/lhtrpg/templates/chat/use-card.hbs",

    // ActiveEffect sheets
    "systems/lhtrpg/templates/effects/effect-changes.hbs",
    "systems/lhtrpg/templates/effects/effect-status.hbs",
    "systems/lhtrpg/templates/effects/effect-duration.hbs"
  ]);
};
