/**
 * Bring the Active Effects of the compendium sources (src/packs/**) to the Foundry v14 format, as core's
 * ActiveEffect.migrateData does on load, so the sources match what v14 stores:
 *   - `changes` -> `system.changes`, numeric `mode` -> `type` ("add", "override"…), JSON values deserialized
 *     ("1" -> 1; formulas and text stay strings) and `phase: "initial"`.
 *   - `duration`: v14 shape `{value, units, expiry, expired}` and `start: null`. Compendium effects carry no core
 *     duration: their length is the Log Horizon one (flags.lhtrpg.expires) and copies start when applied, so the
 *     leftover v13 rounds/turns/startTime are dropped.
 *   - `origin: null` (old "Compendium.world.*" uuids of the world they were made in) and `showIcon`.
 * Run it again after cherry-picking compendium changes made in the v13 branch.
 * Usage: npm run packs:v14 [-- --dry]
 */
import fs from "node:fs";
import path from "node:path";

const dry = process.argv.includes("--dry");
const MODE_TYPES = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };
const SHOW_ICON_CONDITIONAL = 1;
const counts = new Map();
let files = 0;

function count(label) {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

/** Same as core's #migrateChangeValue: parse JSON strings recursively ("5" -> 5), keep the rest. */
function migrateValue(value) {
  if ((typeof value !== "string") || (value === "")) return value;
  try {
    return migrateValue(JSON.parse(value));
  } catch {
    return value;
  }
}

function migrateChange(change) {
  const { key, mode, value, priority, ...rest } = change;
  const type = change.type ?? MODE_TYPES[mode] ?? `custom.${mode}`;
  const migrated = migrateValue(value);
  if (migrated !== value) count(`value ${typeof value} -> ${typeof migrated}`);
  return { key, type, value: migrated, phase: change.phase ?? "initial", priority: priority ?? null, ...rest };
}

function migrateEffect(effect) {
  let changed = false;
  if (Array.isArray(effect.changes)) {
    const system = effect.system ?? {};
    effect.system = { ...system, changes: [...(system.changes ?? []), ...effect.changes.map(migrateChange)] };
    delete effect.changes;
    count("changes -> system.changes");
    changed = true;
  }

  const duration = effect.duration ?? {};
  const legacy = ["seconds", "rounds", "turns", "combat", "startTime", "startRound", "startTurn"].filter(k => k in duration);
  if (legacy.length || !("units" in duration)) {
    if (legacy.some(k => (duration[k] !== null) && (duration[k] !== undefined))) count(`core duration dropped (${effect.name})`);
    effect.duration = { value: null, units: "seconds", expiry: null, expired: false };
    changed = true;
  }
  if (effect.start !== null) {
    effect.start = null;
    changed = true;
  }
  if (effect.origin) {
    count("origin -> null");
    effect.origin = null;
    changed = true;
  }
  if (!("showIcon" in effect)) {
    effect.showIcon = SHOW_ICON_CONDITIONAL;
    changed = true;
  }
  return changed;
}

function fix(doc) {
  let changed = false;
  for (const effect of doc?.effects ?? []) changed = migrateEffect(effect) || changed;
  for (const item of doc?.items ?? []) changed = fix(item) || changed;
  return changed;
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith(".json")) {
      const text = fs.readFileSync(file, "utf8");
      const doc = JSON.parse(text);
      if (!fix(doc)) continue;
      files++;
      if (!dry) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + (text.endsWith("\n") ? "\n" : ""));
    }
  }
}

walk(path.resolve("src/packs"));
for (const [label, n] of [...counts].sort()) console.log(`${String(n).padStart(4)}  ${label}`);
console.log(`${dry ? "Would change" : "Changed"} ${files} files.`);
