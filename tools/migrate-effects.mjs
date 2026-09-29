/**
 * Migrate ActiveEffect changes in compendium sources (src/packs/**) to canonical effect targets.
 * Usage: npm run packs:effects [-- --dry]
 */
import fs from "node:fs";
import path from "node:path";
import {
  migrateEffectChanges,
  findEffectTarget,
  isDerivedEffectKey,
  EFFECT_KEY_MIGRATIONS,
  CHARACTER_ONLY_EFFECT_KEY_MIGRATIONS
} from "../module/helpers/effect-targets.mjs";

const dry = process.argv.includes("--dry");
const migrationCounts = new Map();
const auditIssues = [];
let changedFiles = 0;
let totalEffectsScanned = 0;
let monsterPackEffectsCount = 0;

function recordChange(from, to) {
  const label = `${from} -> ${to}`;
  migrationCounts.set(label, (migrationCounts.get(label) ?? 0) + 1);
}

function processEffects(effects, actorType, packName, docName, fileName) {
  if (!Array.isArray(effects)) return false;
  let effectsChanged = false;

  for (const effect of effects) {
    totalEffectsScanned++;
    if (packName === "bestiary") monsterPackEffectsCount++;

    const sourceChanges = effect.changes;
    if (!Array.isArray(sourceChanges)) continue;

    const { changes: newChanges, changed } = migrateEffectChanges(sourceChanges, actorType);
    if (changed) {
      effectsChanged = true;

      for (const oldChange of sourceChanges) {
        const oldKey = oldChange?.key ? String(oldChange.key).trim() : "";
        if (!oldKey) {
          recordChange("(empty)", "(removed)");
          continue;
        }

        let targetKey = null;
        if (actorType !== "monster" && oldKey in CHARACTER_ONLY_EFFECT_KEY_MIGRATIONS) {
          targetKey = CHARACTER_ONLY_EFFECT_KEY_MIGRATIONS[oldKey];
        } else if (oldKey in EFFECT_KEY_MIGRATIONS) {
          targetKey = EFFECT_KEY_MIGRATIONS[oldKey];
        }

        if (targetKey && targetKey !== oldKey) {
          recordChange(oldKey, targetKey);
        }
      }

      effect.changes = newChanges;
    }

    // Audit remaining keys against the catalog and for derived fields
    for (const change of effect.changes ?? []) {
      const key = change?.key ? String(change.key).trim() : "";
      if (!key) continue;
      const target = findEffectTarget(key);
      const isDerived = isDerivedEffectKey(key, actorType);
      if (!target || isDerived) {
        auditIssues.push({
          pack: packName,
          file: fileName,
          doc: docName,
          effect: effect.name ?? "unnamed",
          key,
          reason: isDerived ? "derived" : "unknown"
        });
      }
    }
  }

  return effectsChanged;
}

function fixDocument(doc, packName, fileName) {
  const isMonster = (packName === "bestiary") || (doc.type === "monster");
  const actorType = isMonster ? "monster" : "character";
  let docChanged = false;

  // Effects directly on the document
  if (processEffects(doc.effects, actorType, packName, doc.name ?? "unnamed", fileName)) {
    docChanged = true;
  }

  // Effects on embedded items
  if (Array.isArray(doc.items)) {
    for (const item of doc.items) {
      const itemDocName = `${doc.name ?? "unnamed"} > ${item.name ?? "unnamed"}`;
      if (processEffects(item.effects, actorType, packName, itemDocName, fileName)) {
        docChanged = true;
      }
    }
  }

  return docChanged;
}

function walk(dir, packName = "") {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) {
      walk(file, packName || name);
    } else if (name.endsWith(".json")) {
      const text = fs.readFileSync(file, "utf8");
      try {
        const doc = JSON.parse(text);
        if (fixDocument(doc, packName, name)) {
          changedFiles++;
          if (!dry) {
            fs.writeFileSync(file, JSON.stringify(doc, null, 2) + (text.endsWith("\n") ? "\n" : ""));
          }
        }
      } catch (err) {
        console.error(`Error parsing ${file}:`, err);
      }
    }
  }
}

const packsDir = path.resolve("src/packs");
walk(packsDir);

console.log("=== Active Effects Migration ===");
if (migrationCounts.size) {
  for (const [change, n] of [...migrationCounts].sort()) {
    console.log(`${String(n).padStart(4)}  ${change}`);
  }
} else {
  console.log("No migrations needed.");
}
console.log(`${dry ? "[dry] " : ""}${changedFiles} files ${dry ? "would change" : "changed"}.`);
console.log(`Scanned ${totalEffectsScanned} effect(s) across packs.`);
console.log(`Monster pack (bestiary) effects found: ${monsterPackEffectsCount}.`);

console.log("\n=== Active Effects Target Audit ===");
if (auditIssues.length) {
  console.log(`Found ${auditIssues.length} change(s) with issues (outside catalog or derived):`);
  for (const issue of auditIssues) {
    const reasonTag = issue.reason === "derived" ? " [derived field]" : "";
    console.log(`  - [${issue.pack}] ${issue.doc} ("${issue.effect}"): ${issue.key}${reasonTag}`);
  }
} else {
  console.log("All effect change keys are valid catalog targets.");
}
