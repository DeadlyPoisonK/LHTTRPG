# Changelog

All notable changes to this system since it is maintained by DeadlyPoisonK. Versions up to 1.3.0 were
released by the original author, Kyane (Tenyryas): see the
[original repository](https://github.com/Tenyryas/lhtrpg).

## [2.0.1] - 2026-09-30

### Changed
- Status icons replaced with icons from [game-icons.net](https://game-icons.net) (CC BY 3.0).
- The manifest URL now points to the latest GitHub release
  (`releases/latest/download/system.json`), ready for the official package listing.
- New English README with installation, compatibility, content sources, languages and credits.

### Fixed
- The Race / Class / Subclass browser did not open (missing `toLowerCase` template helper).

## [2.0.0] - 2026-09-29

### Added
- Races, Classes and Subclasses as items, picked from a browser that offers their starting skills;
  bonus points for Humans and the "CR Up" button instead of the level field.
- System compendiums: skills (basic, common & subclass, racial, archetype, class, mount), GM EX Powers,
  items, bestiary, races & classes, and the Rules journal.
- Skill browser in the style of the Compendium Browser, including character-creation skills.
- Direct Check / Damage rolls from skills, and Evasion / Resistance rolls for monsters.
- Combat chat cards: attack vs. dodge, damage with defenses, ranges, and undo.
- Round progression in the combat tracker: Briefing, Setup, Main and Cleanup phases, Standby and
  Pre/Post-Action.
- Usable items: a `usable` item type with a Use button, effects and `[Consumable]`.
- Main hand / off hand and dual wielding.
- Tags in the style of PF2e: catalog, autocomplete and normalization.
- Treasure Tickets by rank, multiple Pursuit, and Weakness / Cancel with a tag.
- Skill subtypes Monster and Item; monster skills in the bestiary use the Monster subtype.
- Active Effects: target catalog with a picker in the effect editor, readable summaries, Log Horizon
  statuses with Rating / Tag from the editor, and Log Horizon durations (end of process, round or scene)
  with automatic expiry.
- Skills that apply their effects when used, and sustained skills with their limits (Harmony,
  Servant Summon, Enchantment).
- Item macros when dragging an item to the hotbar.

### Changed
- Character, monster and item sheets rebuilt on Foundry's ApplicationV2.
- Skill Timing / Target / Range / Cost / Limit are now dropdowns, normalized across the compendiums.
- The editable stats row was removed from the character sheet.
- Only equipment can be equipped.
- All fixed English texts moved to language keys; all six languages complete.
- Fonts are bundled with the system instead of being loaded from Google Fonts.
- World migrations run from a single, ordered runner on the GM's client.

### Fixed
- Broken effect keys migrated to valid targets.
- Monster sheet: effect bonuses were saved into the base values; skills and effects could not be
  dragged.
- Data preparation error on some monsters.
- Equipment sheet not refreshing when its linked skill was renamed.
- Duplicated compendium entries.
- Infinite loop when clearing a list status on an unlinked token.
- A GM connected in several windows ran GM-only actions more than once.
- Missing default class logo on the character sheet.

## [1.5.0] - 2026-09-25

### Added
- Built-in item piles: ground loot, chests, merchants, and item / gold transfers between characters.

## [1.4.0] - 2026-09-25

### Added
- Equip-slot inventory in the Items tab, with slot capacity enforced when equipping.
- Treasure tickets and equipment-linked skills in the Items tab.
- Log Horizon statuses as token status effects, synced with the sheet.
- "Send Info to Chat" button on the monster sheet.

### Changed
- Reworked item and skill sheets.
- Monster sheet split into Stats and Status tabs.
- The combat tracker's hide toggle is linked to the [Hidden] status.
- Character sheet tabs renamed.

### Fixed
- Items tab inventory stacking below the equipment slots.
- Status migration aborting on an inactive CUB flag scope.

## [1.3.1] - 2026-09-22

First release of the maintained fork.

### Changed
- Compatibility with Foundry VTT v13.
