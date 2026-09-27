/**
 * Character Rank Up (Log Ticket): +1 CR. Base Stats (+1 each) and Max HP (+ class HP Modifier)
 * follow on their own in LHTrpgActor#prepareDerivedData; this confirms the change and records it
 * in the chat, and opens the skill selection for the skills the character can now acquire or rank up.
 */

import { classStats } from "../helpers/character-options.mjs";
import { SkillBrowser, rankUpSkills, startSkillProgress } from "./skill-browser.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Raise the Character Rank of a character by one, after confirmation.
 * @param {Actor} actor
 * @returns {Promise<boolean>} The rank was raised
 */
export async function rankUp(actor) {
  const from = Number(actor.system.infos.crank) || 1;
  const to = from + 1;
  const hp = classStats(actor)?.hpPerRank ?? 0;
  const skills = rankUpSkills(to);
  const gains = [
    game.i18n.format("LHTRPG.RankUp.GainHP", { hp }),
    game.i18n.localize("LHTRPG.RankUp.GainStats"),
    game.i18n.format("LHTRPG.RankUp.GainSkills", skills)
  ];
  const list = `<ul>${gains.map(g => `<li>${g}</li>`).join("")}</ul>`;

  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.format("LHTRPG.RankUp.Title", { name: actor.name }), icon: "fa-solid fa-angles-up" },
    classes: ["lhtrpg", "rank-up-dialog"],
    content: `<p>${game.i18n.format("LHTRPG.RankUp.Confirm", { from, to })}</p>${list}`,
    rejectClose: false
  });
  if (!confirmed) return false;

  // The skill picks owed follow the CR (see skill-browser.mjs).
  await startSkillProgress(actor);
  await actor.update({ "system.infos.crank": to });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="lhtrpg rank-up-card"><h3><i class="fa-solid fa-angles-up"></i> `
      + `${game.i18n.format("LHTRPG.RankUp.Chat", { name: actor.name, to })}</h3>${list}</div>`
  });
  SkillBrowser.open(actor);
  return true;
}
