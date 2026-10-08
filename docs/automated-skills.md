# Automated Skills — User Guide

Leer en español: [automated-skills.es.md](automated-skills.es.md) · Back to the [README](../README.md)

Most skills in the system compendiums now carry their rules as data, not only as text. When a character
has a skill, the system applies what it can on its own:

- **Constant skills** add their bonuses to the sheet, scaled by Skill Rank (SR), Character Rank (CR) or
  attributes: *Attack Mastery* gives `+[SR×2]` Attack Power, so it grows when the SR goes up.
- **Tiers and requirements**: "(SR2): …" tiers switch on by themselves, and Styles only work with the right
  equipment (*White Robe Style* stops working when you equip a Shield).
- **Bonuses to other skills**: *White Robe Style* and *Reactive Mastery* add to the HP healed by
  «Reactive Heal»; *Weapon Mastery: Blade* adds dice to Weapon Attacks made with a [Blade].
- **Changes to other skills**: lower Hate costs, longer ranges, extra notes on the chat card.
- **Active skills** have their Check and Damage ready to roll (`[(SR+3)D]` included) and apply their
  effects when used: stances, bonuses for this Main Process, Bad Statuses with their Rating on the target.

What can't be automated (choices, movement, tables, permissions to equip something, effects triggered by
other events…) stays as text in the skill description, as before.

**Contents**

1. [For players: what you see on the sheet](#1-for-players-what-you-see-on-the-sheet)
2. [For players: using skills](#2-for-players-using-skills)
3. [For GMs: updating the skills characters already have](#3-for-gms-updating-the-skills-characters-already-have)
4. [For creators: how a skill is automated](#4-for-creators-how-a-skill-is-automated)
5. [Reference](#5-reference)
6. [Limits and FAQ](#6-limits-and-faq)

---

## 1. For players: what you see on the sheet

### Effects of your skills

Open the character sheet, **Stats → Effects**. Each Constant skill appears with a one-line summary of what
it does, followed by the current value in parentheses:

![Effects tab of a character](images/skills/actor-effects-passive.webp)

- `Attack Power +[SR×2] (6)`: *Attack Mastery* at SR 3 gives +6. Raise its SR and the number updates.
- `Negotiation +1D, Operation +1D`: the SR2 tier of *Troubadour*.
- `Skill Damage/Recovery bonus (dice) +[SR]D (2D) → [Weapon Attack], weapon [Blade]`: a bonus that only
  applies to some rolls (see [section 2](#2-for-players-using-skills)).

You don't need to do anything: the bonuses are already included in the stats, checks and battle statuses of
the sheet.

### "Condition Not Met"

When a requirement of a skill isn't fulfilled, its effect moves to **Condition Not Met**, with the reason in
red:

![Effects whose condition is not met](images/skills/actor-effects-not-met.webp)

Here the character has *Troubadour* at SR 2, so the SR1 tier is off (`SR ≤ 1`); and they equipped a Buckler,
so *White Robe Style* stops working (`Not equipped with [Shield]`). Unequip the shield and both White Robe
effects go back to work at once.

Conditions that depend on combat ([Hate Top], [Hate Under], first round, Pre-Action, [Standby], having a
status) are re-checked automatically as the combat advances. Hate Top / Under is worked out from the Hate of
the characters in the current combat.

## 2. For players: using skills

### Rolls with bonuses from other skills

Roll a skill as usual (the **Check** / **Damage** buttons of its chat card, or its sheet). The bonuses of your
other skills that apply to that roll are added on their own, and the card lists them under the result:

![Damage card with bonuses from other skills](images/skills/chat-roll-bonuses.webp)

*Reactive Heal* heals 2D; with *Reactive Mastery* SR 2 (+[SR]D) and *White Robe Style* SR 2 (+[SR×3]) the roll
becomes `4d6 + 6`, and the card says where each part comes from.

A bonus can depend on the skill rolled, its tags, the weapon in your main hand, the tags of your target, your
own status or the damage type. Some are **exclusive**: only the highest *Weapon Mastery* applies to a single
attack, even if you know several.

### Skills that apply effects when used

Click a skill on the sheet to post its card. If the skill has effects "when used" (stances, "During this Main
Process…", statuses for the target), the system applies them:

![Card of a stance applied to the user](images/skills/chat-skill-use.webp)

- **Target: Self** → the effect goes to you at once ("Effects applied to: …").
- **Other targets** → it goes to the tokens you have **targeted** (hover a token and press T) when you use it.
  If you had no targets, the card shows an **Apply effects** button: target the tokens and press it.
- **Skills with an opposed check** (vs Evasion / Resistance) → nothing is applied until you see whether it
  hits: roll, and then press **Apply effects** with the hit targets selected.

Formulas are resolved with **your** values at that moment: *Pain Needle* gives the target `[Decay]` with a
Rating of `[INT mod × 2]`, calculated from the user's INT.

The applied effect appears under **Temporary Effects** on the sheet (and its icon on the token), and lasts what
the skill says: until the end of the process, of the round or of the scene (see [Duration](#duration)). Harmony, Servant Summon and Enchantment skills keep their limit of active uses
(1, 1 and 2): when you exceed it, a dialog asks which one to end.

## 3. For GMs: updating the skills characters already have

A skill on a character is a **copy** of the compendium entry. When the compendium improves (new effects,
conditions, Check/Damage), the copies the characters already had **don't change on their own**. Skills dragged
from the compendium from now on are already complete; for the old ones there is a tool.

### Where to find it

- **One character**: the ⋮ menu of the character sheet → **Refresh skills from the compendium**.

  ![Character sheet menu](images/skills/refresh-menu.webp)

- **Every character in the world**: **Game Settings → Log Horizon TRPG → Refresh characters' skills**.

  ![Button in the system settings](images/skills/refresh-settings.webp)

Only a GM sees them.

### What it does

The tool looks for each skill in the system compendiums and **shows the changes before touching anything**:

![Preview of the skills to update](images/skills/refresh-dialog.webp)

- Each line is a skill with differences, and below it what would change (effects, conditions, Damage…).
  Untick the ones you don't want to update.
- **by name**: the skill wasn't linked to the system compendium (for example, it came from a world
  compendium), so it was found by its name. From now on it will be linked.
- If two system skills share the name, it lets you choose; the most similar description is listed first.
- Skills that don't exist in the system compendiums (homebrew, renamed) are listed as **Not in the
  compendium** and are never touched.

When you press **Update selected**, each skill is updated in place (same item, same place on the sheet):

| Replaced with the compendium | Kept |
|---|---|
| Rules data: tags, timing, range, target, cost, limit, Check, Damage, conditions, max SR | The current **SR** (lowered if it exceeds the new maximum) |
| **All** the skill's effects | Its own macro |
| The description (unless you tick **Keep the current description**) | A custom image |

> **Careful**: effects you added or edited by hand on a character's skill are replaced by those of the
> compendium. The dialog warns you about effects that were switched off by hand. Homebrew skills are never
> touched.

### Undo

The previous version of each skill is saved. Open the tool again and press **Undo last refresh**:

![Undo button](images/skills/refresh-undo.webp)

Even so, make a backup of the world before updating every character at once.

## 4. For creators: how a skill is automated

This section is for GMs who want to automate a homebrew skill, or fix one of the compendium. Everything is
done from the skill sheet and the Active Effect editor; no code is needed.

### The parts of an automated skill

| Part | Where | What it's for |
|---|---|---|
| **Check / Damage** | Skill sheet, top | The skill's own rolls. Accept formulas. |
| **Conditions of the skill** | Skill sheet → Effects tab | Requirements of the whole skill ("This skill only produces an effect when…"). |
| **Effects** | Skill sheet → Effects tab | What the skill changes. Passive (Constant) or applied when used. |
| **Conditions of an effect** | Effect editor → Conditions | Requirements of a single effect ("(SR2): …" tiers). |
| **Skill filter** | Effect editor → Conditions | Which rolls / skills a bonus to other skills affects. |
| **LH Status** | Effect editor → LH Status | A Log Horizon status that the effect gives (with Rating / Tag). |
| **Duration (LH)** | Effect editor → Duration | How long an effect applied when used lasts. |

### Check and Damage

![Check and Damage of Magic Missiles](images/skills/skill-check-damage.webp)

*Magic Missiles*: "[(SR+3)D + Magic Power] magical damage" → Damage dice `@sr+3`, type **Magical**, vs
**Evasion**.

- The dice and the modifier accept a number or a formula: `@sr`, `@sr+3`, `@sr*2`, `@sr*5`, `@cr`…
  The dice field also suggests common values.
- **Physical** adds Attack Power, **Magical** adds Magic Power. **Recovery** marks a heal (adds Recovery
  Power). **No power** adds nothing: use it when the text gives its own total ("[4D + Magic Power] physical
  damage" → No power, modifier `@magic`).
- Also available: **Penetrating** and **Direct** damage types.

### Passive effects (Constant skills)

In the skill's **Effects** tab, add an effect (**+ Add**) and open it. In **Details**, **Apply Effect to Actor**
must be ticked: the effect works while the character owns the skill.

In **Changes**, the **Attribute Key** field is a picker: type part of the name (`defense`, `athletics`,
`hp`…) and choose a destination from the list. Only fields that really work are offered.

![Destination picker of the Changes tab](images/skills/effect-key-picker.webp)

Use the mode **Add** and put the value. The value can be a **formula** (the hint under the table reminds you
of the variables):

| Skill text | Destination | Value |
|---|---|---|
| +[SR×2] [Attack Power] | Attack Power | `@sr*2` |
| +[DEX mod] to [Initiative] | Initiative | `@dex` |
| +16 [Max HP] | Max. HP | `16` |
| +1D to [Athletics] | Athletics (dice) | `1` |
| [Attack Power] becomes [weapon's Attack Power × 2] | Attack Power | `@weapon.attack` (the base is already the weapon's) |

Results are rounded down, as in the rules. The full list of variables is in the
[reference](#formula-variables).

### Conditions

**Of the whole skill** — the "This skill only produces an effect when…" of the Styles. In the skill's Effects
tab, **Conditions → +**. They affect all its effects. *White Robe Style* = not equipped with [Heavy Armor] and
not equipped with [Shield]:

![Conditions of White Robe Style](images/skills/skill-conditions.webp)

**Of a single effect** — tiers and situations. In the effect editor, **Conditions** tab. The SR2 tier of
*Troubadour*:

![Condition of an effect: SR at least 2](images/skills/effect-tier-condition.webp)

When a tier **adds** something, one effect for the base and another with `SR at least 2`. When it **replaces**
the previous value ("the bonus becomes +1D instead"), two effects: one with `SR at most 1` and another with
`SR at least 2`. The same with CR (`CR at least 11`, `CR at most 10`…).

All the conditions of a list must be met. The available types are in the [reference](#condition-types).

### Bonuses to other skills (skill filter)

For texts like "+[SR×3] to the HP recovered when using «Reactive Heal»" or "+[(SR)D] to [Weapon Attack]
damage rolls with a [Blade] weapon":

1. In **Changes**, choose a destination from the **Skill Rolls** group:
   - **Skill Check bonus** / **(dice)** → the Check (Hit / Accuracy included) of the filtered skills.
   - **Skill Damage/Recovery bonus** / **(dice)** → their damage or their healing.
   - **Skill Hate cost** → Add `-1` / `-@sr`, or Override `0` for "reduces the cost to 0".
   - **Skill range (Sq)** → `1` = +1 Sq.
   - **Skill note** → a text shown with the skill (e.g. `Ignores [Cancel: Cold]`).

   ![Change with a roll bonus](images/skills/effect-changes.webp)

2. In **Conditions → Skill filter**, say which skills it applies to:

   ![Skill filter of White Robe Style](images/skills/effect-skill-filter.webp)

   | Field | Example | Applies when… |
   |---|---|---|
   | Skills | «Reactive Heal» | the skill rolled is one of these. Drop skills from a compendium, or add them by name. |
   | Skill tags | `Weapon Attack` | the skill has one of these tags |
   | Weapon tags | `Blade` | the main-hand weapon has one of these tags |
   | Target tags | `Construct` | a target has one of these tags |
   | Only while | Hidden | you have that status ([Hidden], [Hate Top], [Hate Under]) |
   | Damage types | Physical / Recovery | the skill deals that type of damage, or heals |
   | Exclusive group | `Weapon Mastery` | only the highest bonus of the group is used in a roll |

   Empty fields don't filter; filled ones must **all** match. With the whole filter empty, the bonus applies
   to every skill roll.

The Hate cost, range and notes modified this way are shown on the skill sheet and on its chat card (old value
crossed out → new value, with the source in the tooltip). The Hate cost is not deducted automatically.

### Effects applied when the skill is used

For active skills ("During this Main Process…", stances, "The target takes [Rigor]"):

1. In **Details**, **untick Apply Effect to Actor**. That makes the effect "when used": it isn't applied to the
   owner, it's copied to the target when the skill is used (see [section 2](#skills-that-apply-effects-when-used)).
2. In **Changes**, the bonuses as usual (they can also be roll bonuses with a skill filter: *Pinpoint* = Skill
   Damage/Recovery bonus `@sr*3`, filter skill tags `Weapon Attack`).
3. In **Duration**, choose **Duration (LH)**.

#### Duration

![Log Horizon durations](images/skills/effect-duration.webp)

| Skill text | Duration (LH) |
|---|---|
| "During this Main Process", "for this check", bonuses of Before Check / Damage Roll timing | End of process |
| "until the end of the round" | End of round |
| "until the end of the scene", stances, "Treat this effect as a Combat Status" | End of scene |

Outside combat, durations don't expire on their own: delete the effect by hand when it ends. An effect
applied when used without a duration ends with the combat (end of scene).

#### Statuses with a Rating

To give a Log Horizon status ("The target takes [Decay: (SR×5)]", "gains [Regen: 10]"), use the **LH Status**
tab: choose the status and, if it has one, its **Rating** (number or formula) and its **Tag** (for [Weakness]
and [Cancel]). One effect = one status.

![Pain Needle: Decay with a Rating of INT mod × 2](images/skills/effect-lh-status.webp)

The formula is resolved with the user's values when the skill is used. If the target already has the status,
the highest Rating remains.

#### Conditions of an effect applied when used

They are checked against the **user** when the skill is used, and the copy loses them. *Divine Might* (+2D,
CR11: +4D, CR21: +6D) = three effects with `CR at most 10` / `CR at least 11 + CR at most 20` /
`CR at least 21`.

## 5. Reference

### Formula variables

| Variable | Value |
|---|---|
| `@sr`, `@srMax` | SR / max SR of the skill that gives the effect |
| `@cr` | Character Rank (monsters: their Rank) |
| `@str`, `@dex`, `@pow`, `@int` | Attribute **modifier** (same as `@str.mod`…) |
| `@str.base`, `@dex.base`… | Attribute **score** |
| `@weapon.attack`, `@weapon.magic` | Attack / Magic Power of the main-hand weapon (0 without one) |
| `@offhand.attack`, `@offhand.magic` | The same for the weapon in the other hand (a shield counts as none) |
| `@attack`, `@magic`, `@recovery` | Attack / Magic / Recovery Power. **Only** in skill rolls, roll bonuses and effects applied when used |

Functions: `floor()`, `ceil()`, `max()`, `min()`. Results are always rounded down.
Examples: `@sr*3`, `@sr+1`, `floor(@cr/2)`, `@dex*2`, `@int*@sr`.

### Condition types

| Type | Value | Text it represents |
|---|---|---|
| SR at least / SR at most | number | "(SR2): …" tiers |
| CR at least / CR at most | number | "(CR11): …" tiers |
| Equipped with tag | tag | "while equipped with a [Bow] / [Shield] / [Two-Handed] weapon" |
| Not equipped with tag | tag | "when you are not equipped with [Heavy Armor]" |
| Both hand slots empty | — | "nothing equipped to your [Hand Slots]" |
| At least one empty hand slot | — | "at least one empty [Hand Slot]" |
| Only one weapon in hand | tag (optional) | "a single [One-Handed] weapon" |
| Two weapons in hand | tag (optional) | "two [One-Handed] weapons" |
| Armor slot empty | — | "your [Armor Slot] is empty" |
| Has status / Doesn't have status | status | "while [Hidden]" |
| Hate Top / Hate Under | — | "while [Hate Top]" |
| In combat | — | — |
| First round of combat | — | "during the first round of a scene" |
| Pre-Action | — | "in [Pre-Action]" (hasn't acted this round) |
| Declared Standby this round | — | "the round you declared [Standby]" |

### Most used destinations

| Text | Destination in the picker |
|---|---|
| STR / DEX / POW / INT (base included) | Attributes → STR… |
| [Max HP], [Starting Fate Points], [Inventory Slots] | Resources → Max. HP / Max. Fate / Space |
| +N / +ND to a check (Hit Check = Accuracy, Dodge = Evasion, Analyze = Analysis…) | Checks / Check Dice |
| [Attack / Magic / Recovery Power], [Physical / Magic Defense], [Initiative], [Speed] | Battle Status |
| Bonuses and modifiers for other skills | Skill Rolls |

## 6. Limits and FAQ

**What stays as text?** Choices ("choose one skill", "select [Flame] or [Cold]"), exhaustion and search tables,
movement and teleports, receiving another character's damage, permissions to equip something or Item Rank
limits, immunities, vision, and effects triggered by other events ("when you apply a Bad Status…"). If only
part of a skill can be automated, that part is, and the rest stays in the description.

**I raised the SR of a skill and nothing changed.** Check that its effect isn't under **Condition Not Met**
or **Inactive Effects**. If the skill is old (from before this update), refresh it with the GM tool
([section 3](#3-for-gms-updating-the-skills-characters-already-have)).

**A bonus doesn't show up on the card.** Look at the skill filter of the effect: all the filled fields must
match (the skill, its tags, the weapon in the main hand, the targets…). Exclusive bonuses of the same group
don't add up.

**Do the bonuses work on monsters?** Effects and formulas, yes (`@cr` = the monster's Rank). The Hate Top /
Under conditions and the refresh tool are for characters only.

**I edited a compendium skill and my characters didn't notice.** That's expected: the characters have
copies. Use the refresh tool, or drag the skill to the character again.

**Something is badly automated.** Please open an [issue](https://github.com/DeadlyPoisonK/LHTTRPG/issues)
with the name of the skill and what you expected.
