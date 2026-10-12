# Changelog

All notable changes to this system since it is maintained by DeadlyPoisonK. Versions up to 1.3.0 were
released by the original author, Kyane (Tenyryas): see the
[original repository](https://github.com/Tenyryas/lhtrpg).

## [2.0.3] - 2026-10-12

Foundry v13 release (branch `v13`). For v14, the font fix is already in 2.1.0 and the CSS fixes come in
the next 2.1.x.

### Fixed
- Inventory, equipment and skill tiles: item frames are no longer cut off and icons sit inside them; with a
  large inventory the item count and gold stay inside the sheet; the "+" (create item) menu no longer covers
  its button. Thanks to Tenyryas ([#1](https://github.com/DeadlyPoisonK/LHTTRPG/pull/1)).
- Sub-tabs: removed stray borders and every tab has the same width; defense icons are centered in the stats
  tab, and the Japanese attribute rows no longer overlap.
- The Edu SA Beginner font never loaded since 2.0.0 (a stray `*/` in the font stylesheet); numbers, tab titles
  and chat card titles used a fallback font.

## [2.1.0] - 2026-10-11

Requires Foundry VTT **v14** (verified 14.369). Foundry v13 stays on 2.0.x. Back up your world before you
update: a world migrated to v14 cannot be opened again in v13.

### Changed
- Ported to Foundry v14: Active Effects use the new `system.changes` format (change type and phase), with a
  system phase for formulas that read attributes; the effect editor uses the v14 Changes and Duration tabs.
- Log Horizon durations (end of process, round or scene) still decide when an effect ends. The Foundry duration
  is optional and only counts on effects that belong to an actor.
- Compendium effects stored in the v14 format.
- Loot piles dropped on the canvas are created on the Level being viewed, and only characters on the same Level
  can reach them.

### Added
- Automated skills: effect values with formulas (`@sr`, `@cr`, attributes, weapon powers), conditions per
  skill and per effect (SR/CR tiers, equipment, statuses, combat), bonuses to other skills' rolls with a skill
  filter, and changes to other skills (Hate cost, range, notes). Compendium skills filled in: Constant bonuses,
  Check / Damage of active skills, and effects applied when used.
- GM tool to refresh the skills characters already have from the system compendium, with preview and undo.
- [Automated Skills guide](docs/automated-skills.md) (also in [Spanish](docs/automated-skills.es.md)).

### Fixed
- The dice field of a skill's Check / Damage cut formulas such as `@sr+3`.
- Effects applied when a skill is used are listed as temporary (and shown on the token) even without a core
  duration, and the effects list shows the skill that gives each effect instead of "None".
- The Edu SA Beginner font never loaded since 2.0.0 (a stray `*/` in the font stylesheet); numbers, tab titles
  and chat card titles used a fallback font.

### Note for worlds coming from 2.0.x
Effects on actors that still carry a Foundry duration in rounds from v13 are now counted by Foundry: they expire
and move to the **Inactive** category. Delete or re-enable them as needed.

## [2.0.2] - 2026-10-01

### Changed
- Compendium icons from [game-icons.net](https://game-icons.net) (CC BY 3.0): each race, and every
  racial, archetype, class, subclass and mount skill, now shows the icon of its group.

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
