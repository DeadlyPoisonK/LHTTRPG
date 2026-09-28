/**
 * Combat chat cards (Rules v0.3, IV.c. ATTACKS).
 *
 * Attack card: a skill Check rolled with targets becomes an opposed [Hit Check] against each
 * target's [Dodge Check] (Evasion / Resistance). Monsters dodge automatically; characters dodge
 * from the card (their owner clicks "Dodge"). Ties, and Critical vs Critical, go to the Defender.
 *
 * Damage card: the skill's Damage Roll, with one row per target hit. Whoever owns a target applies
 * the damage to it: Physical/Magic Defense by type, [Cancel], then [Barrier], then HP. If the target
 * failed its Dodge Check, Hate Damage, [Pursuit] and [Weakness] follow, each through [Barrier] on
 * its own, and a character loses 1 Hate. Every application posts a summary with an Undo button.
 *
 * Players can't update messages they didn't write, so dodges and "applied" marks made on someone
 * else's card go through the active GM (see pile-socket.mjs).
 */
import { diceFormula } from "./dice.mjs";
import { registerHandler, request } from "../piles/pile-socket.mjs";
import { listStatusEntries } from "./statuses.mjs";

const TEMPLATES = {
  attack: "systems/lhtrpg/templates/chat/attack-card.hbs",
  damage: "systems/lhtrpg/templates/chat/damage-card.hbs",
  applied: "systems/lhtrpg/templates/chat/damage-applied.hbs"
};

/** Damage modes of the damage card buttons. */
const MODES = ["damage", "half", "double", "direct", "heal"];
/** Card fields the owner of a target may change on someone else's card. */
const PATCHABLE = { attack: ["dodge", "hit"], damage: ["applied"] };

const toInt = value => Math.trunc(Number(value) || 0);
const L = key => game.i18n.localize(`LHTRPG.Combat.${key}`);

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

/** Call during the `init` hook. */
export function registerCombatCards() {
  registerHandler("combatCardUpdate", _onCardUpdateRequest);
  Hooks.on("renderChatMessageHTML", _onRenderChatMessage);
}

/* -------------------------------------------- */
/*  Dice helpers                                */
/* -------------------------------------------- */

/**
 * Critical (two or more 6s) and Fumble (all 1s; any 1 when [Overconfident]) of a 2D6-style roll.
 * A Fumble counts as a result of 0.
 * @param {Roll} roll
 * @param {Actor} [actor]   The roller, for [Overconfident]
 */
function rollOutcome(roll, actor) {
  const results = roll.dice.flatMap(d => d.results.filter(r => r.active).map(r => r.result));
  const overconfident = !!actor?.system["bad-status"]?.overconfident;
  const fumble = results.length > 0 && (results.every(r => r === 1) || (overconfident && results.includes(1)));
  const critical = !fumble && results.filter(r => r === 6).length >= 2;
  return { total: fumble ? 0 : roll.total, critical, fumble, formula: roll.formula, results: results.join(", ") };
}

/**
 * Whether the Hit Check beats the Dodge Check.
 * Fumbles always fail, Criticals always succeed, the Defender wins ties and Critical vs Critical.
 */
function resolveHit(attack, dodge) {
  if (attack.fumble) return false;
  if (dodge.fumble) return true;
  if (dodge.critical) return false;
  if (attack.critical) return true;
  return attack.total > dodge.total;
}

/* -------------------------------------------- */
/*  Hate                                        */
/* -------------------------------------------- */

/**
 * "top" / "under" for a character, from its [Hate Top] / [Hate Under] status, or else from the
 * Hate of the characters fighting in the current combat. null for monsters or outside combat.
 * @param {Actor} actor
 */
function hateRank(actor) {
  if (actor?.type !== "character") return null;
  if (actor.statuses.has("hateTop")) return "top";
  if (actor.statuses.has("hateUnder")) return "under";
  const out = a => a.statuses.has("incapacitated") || a.statuses.has("dead");
  const party = (game.combat?.combatants ?? [])
    .map(c => c.actor)
    .filter(a => (a?.type === "character") && !out(a));
  if (!party.some(a => a.uuid === actor.uuid)) return null;
  const top = Math.max(...party.map(a => toInt(a.system.infos?.hate)));
  return toInt(actor.system.infos?.hate) >= top ? "top" : "under";
}

/** A monster's Hate Multiplier ("x2", "2", "×1.5"), 0 for anything else. */
function hateMultiplier(actor) {
  if (actor?.type !== "monster") return 0;
  return Number(String(actor.system.hateMultiplier ?? "").replace(/[^\d.]/g, "")) || 0;
}

/* -------------------------------------------- */
/*  Targets                                     */
/* -------------------------------------------- */

/** The actor of a card target (synthetic token actors included). */
function targetActor(target) {
  return fromUuidSync(target.tokenUuid)?.actor ?? fromUuidSync(target.actorUuid) ?? null;
}

/** Card entries for the user's targeted tokens. */
function userTargets() {
  return [...game.user.targets].filter(t => t.actor).map(t => ({
    tokenUuid: t.document.uuid,
    actorUuid: t.actor.uuid,
    name: t.document.name,
    // Animated tokens (.webm) can't be shown in an <img>: use the actor's picture instead.
    img: foundry.helpers.media.VideoHelper.hasVideoExtension(t.document.texture.src ?? "") ? t.actor.img : (t.document.texture.src ?? t.actor.img)
  }));
}

/**
 * Roll a target's Dodge Check: its Evasion / Resistance, -1D when [Dazed] (min 1D),
 * +2 for a [Hate Under] character.
 * @param {Actor} actor
 * @param {"evasion"|"resistance"} vs
 */
async function rollDodge(actor, vs) {
  const check = actor.system.checks?.[vs] ?? {};
  let dice = toInt(check.dice);
  let mod = toInt(actor.type === "monster" ? check.mod : check.total);
  if (actor.system["bad-status"]?.dazed) dice = Math.max(dice - 1, 1);
  const hateUnder = hateRank(actor) === "under";
  if (hateUnder) mod += 2;
  const roll = await new Roll(diceFormula({ dice, mod })).evaluate();
  return { roll, dodge: { ...rollOutcome(roll, actor), hateUnder } };
}

/* -------------------------------------------- */
/*  Range                                       */
/* -------------------------------------------- */

/**
 * Range in Sq from a skill / weapon Range text: "Close" -> 0, "4Sq" -> 4, "Weapon" -> the range of
 * the user's main weapon. null when it can't be checked ("-", "Refer", unknown).
 * @param {string|number} text
 * @param {Actor} [actor]        The user, for "Weapon"
 * @returns {number|null}
 */
function parseRange(text, actor) {
  if (typeof text === "number") return Math.max(text, 0);
  const t = String(text ?? "").trim();
  if (/close|至近|근접/i.test(t)) return 0;
  const sq = t.match(/(\d+)\s*sq/i) ?? t.match(/^(\d+)$/);
  if (sq) return Number(sq[1]);
  if (/weapon|武器|무기/i.test(t) && actor) {
    const weapons = actor.items.filter(i => (i.type === "weapon") && i.system.equipped);
    const main = weapons.find(w => w.system.main) ?? weapons[0];
    return main ? parseRange(main.system.range || "Close") : null;
  }
  return null;
}

/** The token an actor acts from: a controlled one, else its first token on the scene. */
function actorToken(actor) {
  if (!actor || !canvas.ready) return null;
  return canvas.tokens.controlled.find(t => t.actor === actor) ?? actor.getActiveTokens(true)[0] ?? null;
}

/**
 * Distance in Sq between two tokens, counted from the square each token's center is in, with
 * Manhattan distance (a diagonal counts as 2). null outside square grids.
 */
function sqDistance(a, b) {
  if (!a || !b || (canvas.grid.type !== CONST.GRID_TYPES.SQUARE)) return null;
  const p = canvas.grid.getOffset(a.center);
  const q = canvas.grid.getOffset(b.center);
  return Math.abs(p.i - q.i) + Math.abs(p.j - q.j);
}

/* -------------------------------------------- */
/*  Damage tags                                 */
/* -------------------------------------------- */

/** "[Flame]", " flame " -> "flame" */
const normalizeTag = tag => String(tag ?? "").replace(/[\[\]]/g, "").trim().toLowerCase();

/** Implicit tags of a damage type, so [Weakness (Physical)] / [Cancel (Magic)] also match. */
const TYPE_TAGS = { physical: ["Physical"], magical: ["Magic", "Magical"], penetrating: ["Penetrating"], direct: ["Direct"] };

/**
 * Tags of an attack's damage: the skill's tags, plus the main weapon's tags when the skill attacks
 * with the weapon (Range "Weapon", or a [Weapon / Melee / Ranged Attack] tag).
 * @param {Item} item
 * @param {Actor} [attacker]
 * @returns {string[]}
 */
function attackTags(item, attacker) {
  const tags = [...(item.system.tags ?? [])];
  const weaponAttack = /weapon|武器|무기/i.test(item.system.range ?? "")
    || tags.some(t => /^(weapon|melee|ranged) attack$/i.test(normalizeTag(t)));
  const actor = attacker ?? item.actor;
  if (weaponAttack && actor) {
    const weapons = actor.items.filter(i => (i.type === "weapon") && i.system.equipped);
    const main = weapons.find(w => w.system.main) ?? weapons[0];
    tags.push(...(main?.system.tags ?? []));
  }
  const seen = new Set();
  return tags.filter(t => {
    const key = normalizeTag(t);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The highest [Weakness] / [Cancel] entry that applies to damage with these tags: entries without
 * a tag apply to any damage.
 * @param {object} bad        The actor's `bad-status`
 * @param {string} list       "weaknesses" | "cancels"
 * @param {string} legacy     Pre-v5 single Rating field ("weakness" | "cancel")
 * @param {string[]} tags     Tags of the damage (with its type tags)
 * @returns {{value: number, tag: string}|null}
 */
function bestTagged(bad, list, legacy, tags) {
  const entries = listStatusEntries(bad[list], true);
  if (!entries.length && (Number(bad[legacy]) > 0)) entries.push({ value: Number(bad[legacy]), tag: "" });
  const keys = new Set(tags.map(normalizeTag));
  return entries
    .filter(e => !e.tag || keys.has(normalizeTag(e.tag)))
    .reduce((best, e) => (!best || (e.value > best.value)) ? e : best, null);
}

/* -------------------------------------------- */
/*  Card rendering                              */
/* -------------------------------------------- */

async function renderCard(kind, data, roll) {
  const labels = {
    vs: data.vs ? game.i18n.localize(`LHTRPG.Check.${data.vs.capitalize()}`) : "",
    type: data.recovery ? L("Type.recovery") : L(`Type.${data.type}`)
  };
  return foundry.applications.handlebars.renderTemplate(TEMPLATES[kind], {
    ...data,
    labels,
    rollHTML: roll ? await roll.render() : "",
    recoveryOnly: !!data.recovery
  });
}

/**
 * Change one target of an attack / damage card and re-render it.
 * Done directly by the card's author or a GM, else by the active GM on request.
 */
async function updateCardTarget(message, kind, index, patch) {
  if (message.isOwner) return _applyTargetPatch(message, kind, index, patch);
  const result = await request("combatCardUpdate", { messageId: message.id, kind, index, patch });
  if (!result.ok) ui.notifications.warn(game.i18n.localize(result.error ?? "LHTRPG.Piles.Error.Generic"));
}

async function _applyTargetPatch(message, kind, index, patch) {
  const data = foundry.utils.deepClone(message.getFlag("lhtrpg", kind));
  if (!data?.targets?.[index]) return;
  Object.assign(data.targets[index], patch);
  const content = await renderCard(kind, data, message.rolls[0]);
  return message.update({ content, [`flags.lhtrpg.${kind}`]: data });
}

/** GM side of updateCardTarget: only the owner of that target may change it. */
async function _onCardUpdateRequest({ messageId, kind, index, patch }, user) {
  const message = game.messages.get(messageId);
  const target = message?.getFlag("lhtrpg", kind)?.targets?.[index];
  if (!target || !PATCHABLE[kind]) return { ok: false };
  if (!targetActor(target)?.testUserPermission(user, "OWNER")) return { ok: false };
  const allowed = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => PATCHABLE[kind].includes(k)));
  await _applyTargetPatch(message, kind, index, allowed);
  return { ok: true };
}

/* -------------------------------------------- */
/*  Attack card                                 */
/* -------------------------------------------- */

/**
 * Whether a skill Check should become an attack card: it is made against Evasion / Resistance
 * (or is Automatic) and the user targets at least one token.
 */
export function isAttack(item) {
  return ["evasion", "resistance", "auto"].includes(item.system.check.vs) && game.user.targets.size > 0;
}

/**
 * Roll the Hit Check (none when Automatic) and post the attack card. Monster targets dodge now.
 * @param {Item} item
 * @param {Actor|null} attacker
 * @param {string|null} formula    Hit Check formula, null for an Automatic check
 * @param {string} flavor
 */
export async function createAttackCard(item, attacker, formula, flavor) {
  const vs = item.system.check.vs;
  const auto = vs === "auto";

  // Range: every target must be within the skill's range, else the attack can't be declared.
  const range = parseRange(item.system.range, attacker ?? item.actor);
  // "Weapon" also shows the weapon's actual range: "Weapon (Close)".
  let rangeLabel = item.system.range;
  if ((range !== null) && !/^\s*(close|\d+\s*sq)\s*$/i.test(rangeLabel ?? "")) {
    rangeLabel += ` (${range ? `${range}Sq` : L("Close")})`;
  }
  const origin = actorToken(attacker ?? item.actor);
  const targets = userTargets().map(target => ({
    ...target, dodge: null, hit: auto ? true : null, auto,
    distance: sqDistance(origin, fromUuidSync(target.tokenUuid)?.object)
  }));
  const far = targets.filter(t => (range !== null) && (t.distance !== null) && (t.distance > range));
  if (far.length) {
    ui.notifications.warn(game.i18n.format("LHTRPG.Combat.Notif.OutOfRange", {
      names: far.map(t => `${t.name} (${t.distance} Sq)`).join(", "), range: rangeLabel
    }));
    return null;
  }

  const rolls = [];
  let attack = null;
  if (!auto) {
    const roll = await new Roll(formula).evaluate();
    rolls.push(roll);
    attack = rollOutcome(roll, attacker);
  }
  // Monsters dodge right away.
  for (const entry of targets) {
    const actor = targetActor(entry);
    if (auto || (actor?.type !== "monster")) continue;
    const { roll, dodge } = await rollDodge(actor, vs);
    rolls.push(roll);
    entry.dodge = dodge;
    entry.hit = resolveHit(attack, dodge);
  }

  const data = {
    itemUuid: item.uuid,
    skillName: item.name,
    img: item.img,
    flavor,
    range: rangeLabel,
    vs: auto ? "" : vs,
    auto,
    attack,
    attackerType: attacker?.type ?? item.actor?.type ?? null,
    hateMultiplier: hateMultiplier(attacker ?? item.actor),
    targets
  };
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor: attacker ?? item.actor }),
    content: await renderCard("attack", data, rolls[0]),
    rolls,
    flags: { lhtrpg: { attack: data } }
  };
  ChatMessage.applyRollMode(messageData, game.settings.get("core", "rollMode"));
  return ChatMessage.create(messageData);
}

/** A character's owner rolls its Dodge Check from the attack card. */
async function onRollDodge(message, index) {
  const data = message.getFlag("lhtrpg", "attack");
  const target = data?.targets?.[index];
  const actor = target && targetActor(target);
  if (!actor?.isOwner || target.dodge) return;
  const { roll, dodge } = await rollDodge(actor, data.vs);
  await game.dice3d?.showForRoll(roll, game.user, true);
  await updateCardTarget(message, "attack", index, { dodge, hit: resolveHit(data.attack, dodge) });
}

/* -------------------------------------------- */
/*  Damage card                                 */
/* -------------------------------------------- */

/** How many recent chat messages are searched for the attack a Damage Roll belongs to. */
const ATTACK_LOOKBACK = 30;

/**
 * The latest attack card of this skill among the recent chat messages, if any.
 * @param {Item} item
 * @returns {ChatMessage|null}
 */
export function findAttackMessage(item) {
  const recent = game.messages.contents.slice(-ATTACK_LOOKBACK).reverse();
  return recent.find(m => m.getFlag("lhtrpg", "attack")?.itemUuid === item.uuid) ?? null;
}

/**
 * Roll the Damage Roll and post the damage card. With the skill's attack card, its targets are the
 * ones that were not dodged; otherwise, the user's targets (no Dodge Check failed).
 * @param {Item} item
 * @param {Actor|null} attacker
 * @param {string} formula
 * @param {string} flavor
 * @param {ChatMessage} [attackMessage]
 */
export async function createDamageCard(item, attacker, formula, flavor, attackMessage) {
  const roll = await new Roll(formula).evaluate();
  const attack = attackMessage?.getFlag("lhtrpg", "attack");
  const targets = attack
    ? attack.targets.filter(t => t.hit !== false).map(t => ({
      tokenUuid: t.tokenUuid, actorUuid: t.actorUuid, name: t.name, img: t.img,
      // Pending dodges are treated as failed: the attack was not dodged (yet).
      dodgeFailed: !attack.auto, applied: null
    }))
    : userTargets().map(t => ({ ...t, dodgeFailed: false, applied: null }));

  const { type, recovery } = item.system.damage;
  // No damage type set on the skill: weapon attacks go against Evasion, magic against Resistance.
  const fallbackType = { evasion: "physical", resistance: "magical" }[item.system.check.vs] ?? "penetrating";
  const data = {
    itemUuid: item.uuid,
    skillName: item.name,
    img: item.img,
    flavor,
    total: roll.total,
    type: type || fallbackType,
    recovery,
    tags: attackTags(item, attacker),
    attackerType: attack?.attackerType ?? attacker?.type ?? item.actor?.type ?? null,
    hateMultiplier: attack?.hateMultiplier ?? hateMultiplier(attacker ?? item.actor),
    targets
  };
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor: attacker ?? item.actor }),
    content: await renderCard("damage", data, roll),
    rolls: [roll],
    flags: { lhtrpg: { damage: data } }
  };
  ChatMessage.applyRollMode(messageData, game.settings.get("core", "rollMode"));
  return ChatMessage.create(messageData);
}

/* -------------------------------------------- */
/*  Applying damage                             */
/* -------------------------------------------- */

/** Physical / Magic Defense of an actor. */
function defenseOf(actor, type) {
  const key = { physical: "phys", magical: "magic" }[type];
  if (!key) return 0;
  const value = actor.system["battle-status"]?.defense?.[key];
  return toInt(typeof value === "object" ? value.total : value);
}

/**
 * Apply a damage card's damage (or healing) to one actor.
 * @param {Actor} actor
 * @param {object} card          The damage card data
 * @param {string} mode          damage | half | double | direct | heal
 * @param {boolean} dodgeFailed  Whether Hate Damage / Pursuit / Weakness apply
 * @returns {Promise<string>}    Short result shown on the damage card
 */
async function applyDamage(actor, card, mode, dodgeFailed) {
  const system = actor.system;
  const bad = system["bad-status"] ?? {};
  const before = {
    hp: toInt(system.health.value),
    barrier: toInt(bad.barrier),
    pursuits: [...(bad.pursuits ?? [])].map(toInt),
    hate: toInt(system.infos?.hate),
    overconfident: !!bad.overconfident,
    incapacitated: actor.statuses.has("incapacitated")
  };
  const lines = [];

  if (mode === "heal") {
    const hp = Math.min(before.hp + card.total, toInt(system.health.max));
    await actor.update({ "system.health.value": hp });
    lines.push(`${L("Applied.Heal")}: +${hp - before.hp} HP`);
    if ((hp > 0) && before.incapacitated) await actor.toggleStatusEffect("incapacitated", { active: false });
    return postApplied(actor, card, before, lines, `+${hp - before.hp} HP`);
  }

  let barrier = before.barrier;
  let hpLoss = 0;
  /** Damage through [Barrier], then to HP. */
  const hit = amount => {
    const absorbed = Math.min(barrier, amount);
    barrier -= absorbed;
    hpLoss += amount - absorbed;
    return absorbed;
  };

  // Damage Roll
  const direct = (mode === "direct") || (card.type === "direct");
  let amount = card.total;
  if (mode === "half") amount = Math.floor(amount / 2);
  if (mode === "double") amount *= 2;
  const steps = [`${amount}`];
  const tags = [...(card.tags ?? []), ...(TYPE_TAGS[direct ? "direct" : card.type] ?? [])];
  const tagLabel = (status, entry) => game.i18n.localize(`LHTRPG.StatusEffect.${status}`) + (entry.tag ? ` (${entry.tag})` : "");
  if (!direct) {
    const defense = defenseOf(actor, card.type);
    if (defense) steps.push(`− ${defense} ${L(card.type === "magical" ? "Applied.MDef" : "Applied.PDef")}`);
    const cancel = bestTagged(bad, "cancels", "cancel", tags);
    if (cancel) steps.push(`− ${cancel.value} ${tagLabel("cancel", cancel)}`);
    amount -= defense + (cancel?.value ?? 0);
  }
  amount = Math.max(amount, 0);
  const absorbed = hit(amount);
  if (absorbed) steps.push(`− ${absorbed} ${game.i18n.localize("LHTRPG.StatusEffect.barrier")}`);
  lines.push(`${L(direct ? "Mode.direct" : "Applied.Damage")}: ${steps.join(" ")} → ${amount - absorbed} HP`);

  // Failed Dodge Check: Hate Damage, Pursuit, Weakness (direct damage, each through Barrier)
  const updates = {};
  if (dodgeFailed) {
    const extra = (label, value) => {
      if (value <= 0) return;
      const absorbed = hit(value);
      lines.push(`${label}: ${value}${absorbed ? ` − ${absorbed} ${game.i18n.localize("LHTRPG.StatusEffect.barrier")}` : ""} → ${value - absorbed} HP`);
    };
    if ((card.hateMultiplier > 0) && (hateRank(actor) === "top")) {
      extra(L("Applied.Hate"), Math.floor(before.hate * card.hateMultiplier));
    }
    if (before.pursuits.length) {
      const top = Math.max(...before.pursuits);
      const pursuits = [...before.pursuits];
      pursuits.splice(pursuits.indexOf(top), 1);
      updates["system.bad-status.pursuits"] = pursuits;
      extra(game.i18n.localize("LHTRPG.StatusEffect.pursuit"), top);
    }
    const weakness = bestTagged(bad, "weaknesses", "weakness", tags);
    if (weakness) extra(tagLabel("weakness", weakness), weakness.value);
    // A character who fails a Dodge Check against an enemy loses 1 Hate.
    if ((actor.type === "character") && (card.attackerType === "monster") && (before.hate > 0)) {
      updates["system.infos.hate"] = before.hate - 1;
      lines.push(L("Applied.HateDown"));
    }
  }

  const hp = Math.max(before.hp - hpLoss, 0);
  updates["system.health.value"] = hp;
  updates["system.bad-status.barrier"] = barrier;
  // [Overconfident] ends when the character loses HP.
  if (hpLoss > 0 && before.overconfident) updates["system.bad-status.overconfident"] = false;
  await actor.update(updates);
  if ((hp <= 0) && !before.incapacitated) await actor.toggleStatusEffect("incapacitated", { active: true });

  return postApplied(actor, card, before, lines, `−${hpLoss} HP`);
}

/** Post the summary of an application, with the values needed to undo it. */
async function postApplied(actor, card, before, lines, result) {
  const data = { actorUuid: actor.uuid, name: actor.token?.name ?? actor.name, skillName: card.skillName, lines, result, before, undone: false };
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await foundry.applications.handlebars.renderTemplate(TEMPLATES.applied, data),
    // A monster's breakdown gives away its Defense and statuses: GM only, until revealed.
    whisper: actor.hasPlayerOwner ? [] : ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: { lhtrpg: { applied: data } }
  });
  return result;
}

/** Restore what an application changed. */
async function undoApplied(message) {
  const data = message.getFlag("lhtrpg", "applied");
  const actor = data && fromUuidSync(data.actorUuid);
  if (!actor?.isOwner || data.undone) return;
  const { before } = data;
  const updates = {
    "system.health.value": before.hp,
    "system.bad-status.barrier": before.barrier,
    "system.bad-status.pursuits": before.pursuits,
    "system.bad-status.overconfident": before.overconfident
  };
  if (actor.type === "character") updates["system.infos.hate"] = before.hate;
  await actor.update(updates);
  if (actor.statuses.has("incapacitated") !== before.incapacitated) {
    await actor.toggleStatusEffect("incapacitated", { active: before.incapacitated });
  }
  if (!message.isOwner) return;
  const undone = { ...data, undone: true };
  await message.update({
    content: await foundry.applications.handlebars.renderTemplate(TEMPLATES.applied, undone),
    "flags.lhtrpg.applied": undone
  });
}

/** A damage card button: apply to that target, or to the controlled tokens when the card has none. */
async function onApplyDamage(message, index, mode) {
  const card = message.getFlag("lhtrpg", "damage");
  if (!card || !MODES.includes(mode)) return;
  if (index === null) {
    const actors = canvas.tokens.controlled.map(t => t.actor).filter(a => a?.isOwner);
    if (!actors.length) return ui.notifications.warn(L("Notif.NoTokens"));
    for (const actor of actors) await applyDamage(actor, card, mode, false);
    return;
  }
  const target = card.targets[index];
  const actor = target && targetActor(target);
  if (!actor?.isOwner) return;
  const result = await applyDamage(actor, card, mode, target.dodgeFailed);
  await updateCardTarget(message, "damage", index, { applied: result });
}

/* -------------------------------------------- */
/*  Chat listeners                              */
/* -------------------------------------------- */

function _onRenderChatMessage(message, html) {
  const flags = message.flags?.lhtrpg ?? {};
  const kind = flags.attack ? "attack" : flags.damage ? "damage" : null;

  if (kind) {
    const data = flags[kind];
    // Only the owners of a target see its buttons and the damage it took.
    html.querySelectorAll(".lh-target[data-index]").forEach(row => {
      const target = data.targets[Number(row.dataset.index)];
      if (!target || !targetActor(target)?.isOwner) row.querySelectorAll(".owner-only, .lh-applied").forEach(el => el.remove());
    });
  }

  // GM-only damage summaries (monsters): the GM may show them to everyone.
  html.querySelectorAll(".lh-reveal").forEach(button => {
    if (!game.user.isGM || !message.whisper.length) return button.remove();
    button.addEventListener("click", event => {
      event.preventDefault();
      button.disabled = true;
      message.update({ whisper: [] });
    });
  });

  html.querySelectorAll(".lh-roll-dodge").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    button.disabled = true;
    onRollDodge(message, Number(button.closest(".lh-target").dataset.index));
  }));
  html.querySelectorAll(".lh-apply").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    const row = button.closest(".lh-target");
    const index = row?.dataset.index !== undefined ? Number(row.dataset.index) : null;
    onApplyDamage(message, index, button.dataset.mode);
  }));
  html.querySelectorAll(".lh-undo").forEach(button => {
    const actor = fromUuidSync(flags.applied?.actorUuid);
    if (!actor?.isOwner) return button.remove();
    button.addEventListener("click", event => {
      event.preventDefault();
      button.disabled = true;
      undoApplied(message);
    });
  });
}
