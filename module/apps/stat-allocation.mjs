/**
 * Base Stats chosen at character creation:
 * - Human race: +1 to any two of STR/DEX/POW/INT, written into the embedded Race item.
 * - Five bonus points distributed freely (no Base Stat above 7 at CR 1), stored in
 *   `system.attributes.<stat>.value` of the character.
 */

import { classStats, raceStats } from "../helpers/character-options.mjs";

const { DialogV2 } = foundry.applications.api;

export const STATS = ["str", "dex", "pow", "int"];

/** Bonus points of a new character and the highest Base Stat allowed at creation. */
export const BONUS_POINTS = 5;
export const MAX_BASE_STAT = 7;

/** Number of stats a Human picks for its +1. */
const HUMAN_PICKS = 2;

/** The race lets the player choose which stats get its bonus (the core Human). */
export function isHumanRace(item) {
  return (item?.type === "race") && (item.system.identifier === "human");
}

/**
 * Ask which two stats get the Human +1 and write them into the Race item.
 * @param {Item} item  The Human race embedded in a character
 * @returns {Promise<boolean>} The choice was saved
 */
export async function chooseHumanStats(item) {
  const current = item.system.attributes ?? {};
  const stats = STATS.map(key => ({
    key,
    label: key.toUpperCase(),
    checked: Number(current[key]) > 0
  }));
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/lhtrpg/templates/apps/human-stats.hbs", { stats, picks: HUMAN_PICKS }
  );
  const data = await DialogV2.wait({
    window: { title: game.i18n.localize("LHTRPG.StatAllocation.Human.Title"), icon: "fa-solid fa-person" },
    classes: ["lhtrpg", "stat-allocation"],
    position: { width: 360 },
    content,
    buttons: [
      {
        action: "ok",
        label: "LHTRPG.StatAllocation.Confirm",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "skip", label: "LHTRPG.StatAllocation.Later", icon: "fa-solid fa-xmark" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      const confirm = dialog.element.querySelector('[data-action="ok"]');
      const refresh = () => {
        const boxes = [...form.querySelectorAll('input[type="checkbox"]')];
        const count = boxes.filter(b => b.checked).length;
        // Once two are picked the others lock, so the choice is always valid when confirmed.
        boxes.forEach(b => b.disabled = !b.checked && (count >= HUMAN_PICKS));
        confirm.disabled = count !== HUMAN_PICKS;
      };
      form.addEventListener("change", refresh);
      refresh();
    },
    rejectClose: false
  });
  if (!data || (typeof data !== "object")) return false;
  const attributes = Object.fromEntries(STATS.map(key => [key, data[key] ? 1 : 0]));
  await item.update({ "system.attributes": attributes });
  return true;
}

/**
 * Distribute the bonus points of a character among its Base Stats.
 * The Base Stat checked against the cap is the one of CR 1: class + race + bonus.
 * @param {Actor} actor
 * @returns {Promise<boolean>} The points were saved
 */
export async function allocateBonusPoints(actor) {
  const job = classStats(actor) ?? {};
  const race = raceStats(actor) ?? {};
  const attributes = actor.system.attributes;
  const stats = STATS.map(key => ({
    key,
    label: key.toUpperCase(),
    job: job[key] ?? 0,
    race: race[key] ?? 0,
    bonus: Number(attributes[key]?.value) || 0
  }));
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/lhtrpg/templates/apps/bonus-points.hbs",
    { stats, points: BONUS_POINTS, max: MAX_BASE_STAT }
  );
  const data = await DialogV2.wait({
    window: { title: game.i18n.format("LHTRPG.StatAllocation.Bonus.Title", { name: actor.name }), icon: "fa-solid fa-chart-simple" },
    classes: ["lhtrpg", "stat-allocation"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "ok",
        label: "LHTRPG.StatAllocation.Confirm",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "skip", label: "LHTRPG.StatAllocation.Later", icon: "fa-solid fa-xmark" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      const confirm = dialog.element.querySelector('[data-action="ok"]');
      const refresh = () => {
        let spent = 0;
        let valid = true;
        for (const stat of stats) {
          const input = form.querySelector(`input[name="${stat.key}"]`);
          const bonus = Math.max(0, Math.trunc(Number(input.value) || 0));
          const base = stat.job + stat.race + bonus;
          const cell = form.querySelector(`[data-base="${stat.key}"]`);
          cell.textContent = base;
          cell.classList.toggle("invalid", base > MAX_BASE_STAT);
          if (base > MAX_BASE_STAT) valid = false;
          spent += bonus;
        }
        const left = BONUS_POINTS - spent;
        const counter = form.querySelector(".bonus-left");
        counter.textContent = left;
        counter.classList.toggle("invalid", left < 0);
        confirm.disabled = !valid || (left < 0);
      };
      form.addEventListener("input", refresh);
      refresh();
    },
    rejectClose: false
  });
  if (!data || (typeof data !== "object")) return false;
  const update = Object.fromEntries(STATS.map(key =>
    [`system.attributes.${key}.value`, Math.max(0, Math.trunc(Number(data[key]) || 0))]));
  await actor.update(update);
  return true;
}

/**
 * After a Class is taken: distribute the bonus points of a new character (CR 1). The dialog starts
 * on the points already spent, so changing class at creation keeps them.
 * @param {Actor} actor
 */
export async function offerBonusPoints(actor) {
  if ((Number(actor.system.infos?.crank) || 1) > 1) return;
  await allocateBonusPoints(actor);
}
