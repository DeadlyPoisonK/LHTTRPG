/**
 * World data migrations.
 *
 * Each migration is described by its module ({ id, setting, version, run }) and recorded in its own
 * world setting, so worlds that already ran it under the old per-module hooks don't run it again.
 * They run one after the other, in the order below, on the active GM once the world is ready:
 * later migrations may rely on the data left by earlier ones (e.g. tags are normalized after
 * Gear -> Usable rewrites the item's system data).
 *
 * `run(from)` receives the version already done (0 = never run) and returns true when finished;
 * anything else (false, or an error) leaves the migration pending, to be retried on the next load.
 */
import { CHARACTER_OPTIONS_MIGRATION } from "./character-options.mjs";
import { MONSTER_CHECKS_MIGRATION } from "./monster-checks.mjs";
import { STATUSES_MIGRATION } from "./statuses.mjs";
import { USABLE_MIGRATION } from "./item-use.mjs";
import { TAGS_MIGRATION } from "./tags.mjs";
import { HANDS_MIGRATION } from "./hands.mjs";
import { EFFECTS_MIGRATION } from "./effect-targets.mjs";

export const MIGRATIONS = [
  CHARACTER_OPTIONS_MIGRATION,   // legacy Race/Class/Subclass fields -> items
  MONSTER_CHECKS_MIGRATION,      // legacy text Evasion/Resistance -> { dice, mod }
  STATUSES_MIGRATION,            // legacy status effects/fields -> LH status effects
  USABLE_MIGRATION,              // usable Gear -> "usable" type (replaces the item's system data)
  TAGS_MIGRATION,                // canonical tags
  HANDS_MIGRATION,               // Two-Handed + off hand, equipped non-equipment
  EFFECTS_MIGRATION              // broken active effect keys -> valid effect targets
];

/** Register the world setting of every migration. Call during the `init` hook. */
export function registerMigrations() {
  for (const { setting } of MIGRATIONS) {
    game.settings.register("lhtrpg", setting, { scope: "world", config: false, type: Number, default: 0 });
  }
}

/** Migrations that still have to run in this world. */
export function pendingMigrations() {
  return MIGRATIONS.filter(m => game.settings.get("lhtrpg", m.setting) < m.version);
}

let running = null;

/**
 * Run the pending migrations in order (active GM only). Call on `ready`.
 * @returns {Promise<string[]>}   Ids of the migrations still pending afterwards
 */
export function runMigrations() {
  if (!game.user.isActiveGM) return Promise.resolve([]);
  running ??= _run().finally(() => running = null);
  return running;
}

async function _run() {
  const pending = pendingMigrations();
  if (!pending.length) return [];

  const notice = ui.notifications.info(game.i18n.localize("LHTRPG.Migration.Running"), { permanent: true });
  const left = [];
  for (const migration of pending) {
    const from = game.settings.get("lhtrpg", migration.setting);
    let done = false;
    try {
      done = (await migration.run(from)) === true;
    } catch (err) {
      console.error(`Log Horizon TRPG | Migration "${migration.id}" failed`, err);
    }
    if (done) await game.settings.set("lhtrpg", migration.setting, migration.version);
    else left.push(migration.id);
  }
  ui.notifications.remove(notice);

  if (left.length) {
    console.warn(`Log Horizon TRPG | Migrations left pending: ${left.join(", ")}`);
    ui.notifications.warn(game.i18n.format("LHTRPG.Migration.Pending", { list: left.join(", ") }), { permanent: true });
  } else {
    ui.notifications.info(game.i18n.localize("LHTRPG.Migration.Done"));
  }
  return left;
}
