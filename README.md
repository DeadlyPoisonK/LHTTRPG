# Log Horizon TRPG for Foundry VTT

ログ・ホライズンTRPG

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-orange)](https://foundryvtt.com/)
[![Latest release](https://img.shields.io/github/v/release/DeadlyPoisonK/LHTTRPG)](https://github.com/DeadlyPoisonK/LHTTRPG/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)

Leer en español: [README.es.md](README.es.md) · Changes: [CHANGELOG.md](CHANGELOG.md)

An unofficial game system for playing [Log Horizon TRPG](https://en.wikipedia.org/wiki/Log_Horizon) on Foundry Virtual Tabletop. This system is an independent community project and is not affiliated with or endorsed by Mamare Touno or Kadokawa.

![Character sheet](docs/images/character-sheet.webp)

## Features

- **Character and Monster Sheets**: Built on Foundry's ApplicationV2, with automatic calculation of stats, modifiers, and checks.
- **Option Browser and Starting Skill Grants**: Pick a Race, Class, and Subclass from a browser; the sheet then offers their starting skills.
- **11 Built-in Compendiums**: Core content packs for Races & Classes, Basic Skills, Common & Subclass Skills, Racial Skills, Archetype Skills, Class Skills, Mount Skills, GM EX Powers, Items, Bestiary, and Rules.
- **Opposed Checks and Combat Cards**: Chat cards for opposed Hit vs. Dodge checks (Evasion / Resistance) with automatic damage mitigation (Physical/Magic Defense, Cancel, Barrier, HP), Hate Damage, Pursuit, Weakness, and one-click Undo.
- **Usable and Consumable Items**: Items with a dedicated "Use" action, phase timing checks, active effect transfer, and automatic consumption for `[Consumable]` items.
- **Active Effects Destination Editor**: Active Effect editor that suggests valid targets for characters and monsters, so effects don't point at fields that don't exist.
- **Skill Effects and Sustained Limits**: Skills can apply their effects when used, enforcing the sustained-skill limits (Harmony: 1, Servant Summon: 1, Enchantment: 2) with a dialog to pick which one to replace.
- **Log Horizon Statuses and Token HUD Sync**: All 23 Log Horizon statuses (Life, Bad, Combat, Other) as token status effects, with Ratings and tags, kept in sync with the sheet both ways; `[Hidden]` hides the token from other players.
- **Log Horizon Effect Durations**: Effects can expire at the end of the process, the round, or the scene.
- **Tactical Combat Phases**: Combat tracker modeling Log Horizon round progression (Briefing, Setup, Main/Initiative with Standby declaration and Post-Action tracking, and Cleanup).
- **Integrated Loot and Trading (Piles)**: Built-in pile actor system for ground loot, chests, merchants, and direct player-to-player item and gold trading without external dependencies.
- **Core Resource Tracking**: Fate, Hate, and slot-based inventory capacity expanded by bags.

![Monster sheet](docs/images/monster-sheet.webp)

![Option browser](docs/images/option-browser.webp)

![Combat chat card](docs/images/chat-card.webp)

## Installation

### Via Foundry VTT Package Browser

1. In Foundry VTT, go to the **Game Systems** tab in the setup screen.
2. Click **Install System**.
3. Search for **Log Horizon TRPG** and click **Install**.

### Via Manifest URL

To install manually via the system manifest:

1. In Foundry VTT, go to the **Game Systems** tab in the setup screen.
2. Click **Install System**.
3. Paste the following URL into the **Manifest URL** field at the bottom:

```
https://github.com/DeadlyPoisonK/LHTTRPG/releases/latest/download/system.json
```

4. Click **Install**.

## Compatibility

- **Foundry VTT v13**: Fully verified and supported (verified up to 13.351).
- **Foundry VTT v14**: Unverified. The system loads in v14, but Active Effects and certain features may not function correctly. Dedicated v14 compatibility is planned for version **2.1**.
- **Important Warning**: A world opened or migrated in Foundry v14 **cannot be opened again in v13**. Always make a full backup of your world data before testing on newer Foundry versions.

## Content & Sources

- **Compendiums**: Approximately 98% of the compendium text (including the full bestiary) was translated by hand from Japanese to English by DeadlyPoisonK about three years ago, before any use of AI. In 2026 the text was reviewed, and a few remaining gaps were filled with the help of a local AI model and corrected by hand.
- **Source Database**: Compendium data is adapted from the official, public, and free Log Horizon TRPG database: [lhrpg.com/lhz](https://lhrpg.com/lhz/top).
- **Rules Journal**: The bundled Rules compendium journal and reference sheet (`assets/rules/lhtrpg_cheat_sheet.pdf`) originate from the free official rules translation.
- **Unofficial Disclaimer**: Log Horizon TRPG is the property of Mamare Touno and Kadokawa (ログ・ホライズンTRPG). This system is unofficial and unaffiliated. Purchasing and owning the official manual and rulebooks is strongly recommended.
- Community corrections and proofreading for compendium texts are welcome.

## Languages

The user interface is localized in `lang/`:

| Language | Code | Translation Status |
| :--- | :---: | :--- |
| English | `en` | Human-translated |
| Español | `es` | Human-translated |
| Français | `fr` | Community base; new keys translated via local AI (not reviewed by native speakers) |
| Italiano | `it` | Community base; new keys translated via local AI (not reviewed by native speakers) |
| 日本語 | `ja` | Community base; new keys translated via local AI (not reviewed by native speakers) |
| 한국어 | `ko` | Community base; new keys translated via local AI (not reviewed by native speakers) |

Compendiums are currently available in English only. Translations and corrections from native speakers are warmly invited via pull requests.

## Contributing

- **Issues**: Report bugs or suggest enhancements via [GitHub Issues](https://github.com/DeadlyPoisonK/LHTTRPG/issues).
- **Localization**: Translations can be submitted by editing `lang/*.json`. Run `npm run check:i18n` to verify that no translation keys are missing.
- **Compendium Editing**:
  - Compendium source data is tracked in `src/packs/<pack>/*.json`. Never commit raw database files under `packs/`.
  - Install dependencies: `npm install`
  - Compile compendiums (`src/packs` → `packs`): `npm run packs:build` (with the world closed: Foundry locks the packs of an open world).
  - Unpack compendiums (`packs` → `src/packs`): `npm run packs:unpack` after editing compendiums inside Foundry.
  - Pull requests modifying compendiums must touch `src/packs/`.

## License

The code of this system (module scripts, templates, styles, and localization files) is licensed under the **MIT License** — see [LICENSE.txt](LICENSE.txt).

This license applies strictly to the system code and does not cover the Log Horizon TRPG rules, setting, or intellectual property owned by Mamare Touno and Kadokawa.

## Credits

- **Mamare Touno / Kadokawa**: Creators of Log Horizon and Log Horizon TRPG (ログ・ホライズンTRPG).
- **Kyane (Tenyryas)**: Original creator of the system ([original repository](https://github.com/Tenyryas/lhtrpg)).
- **Asacolips Projects / Foundry Mods**: Authors of the Boilerplate system template from which this project originated.
- **DeadlyPoisonK**: Maintainer since 2026 and manual English translator of the compendiums.
- **Original Project Community**: Contributors who provided the initial community translations for French, Italian, Japanese, and Korean.
- **Fonts**: Noto Serif JP and Edu SA Beginner (`assets/fonts/`), licensed under the SIL Open Font License 1.1 (`OFL.txt`).
- **Interface Artwork**: The remaining UI assets (`assets/ui/**`, `assets/Logo_lhtrpg.webp`) come from Kyane's original system.
- **Game Icons**: Status effect icons (`assets/ui/status/*.svg`) from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) (background recolored). Authors: Lorc, Delapouite, Skoll, Sbed, and Zeromancer.

<details>
<summary>Status Icon Attributions (game-icons.net)</summary>

| Status | Icon Name | Author |
| :--- | :--- | :--- |
| fatigue | tired-eye | Delapouite |
| weakness | cracked-shield | Lorc |
| incapacitated | knockout | Skoll |
| dead | tombstone | Lorc |
| staggered | foot-trip | Lorc |
| dazed | knocked-out-stars | Delapouite |
| rigor | frozen-body | Delapouite |
| confused | brainstorm | Lorc |
| decay | bleeding-wound | Lorc |
| pursuit | footprint | Lorc |
| afflicted | broken-heart | Lorc |
| overconfident | laurel-crown | Lorc |
| regen | heart-plus | Zeromancer |
| cancel | cancel | Sbed |
| barrier | magic-shield | Lorc |
| hidden | hidden | Lorc |
| swimming | swimfins | Delapouite |
| flying | feathered-wing | Lorc |
| identified | magnifying-glass | Lorc |
| standby | hourglass | Lorc |
| hateTop | angry-eyes | Delapouite |
| hateUnder | target-arrows | Lorc |
| absent | exit-door | Delapouite |

</details>
