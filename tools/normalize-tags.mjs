/**
 * Normalize the tags of the compendium sources (src/packs/**) to the canonical spelling of the tag
 * catalog (module/helpers/tag-catalog.mjs): no brackets, Title Case, typos fixed, no duplicates.
 * Usage: npm run packs:tags [-- --dry]
 */
import fs from "node:fs";
import path from "node:path";
import { canonicalTags } from "../module/helpers/tag-catalog.mjs";

const dry = process.argv.includes("--dry");
const changes = new Map();
let files = 0;

function fix(doc) {
  let changed = false;
  const tags = doc?.system?.tags;
  if (Array.isArray(tags)) {
    const clean = canonicalTags(tags);
    if (JSON.stringify(clean) !== JSON.stringify(tags)) {
      for (const t of tags) {
        const c = canonicalTags([t])[0] ?? "(removed)";
        if (c !== t) changes.set(`${t} -> ${c}`, (changes.get(`${t} -> ${c}`) ?? 0) + 1);
      }
      doc.system.tags = clean;
      changed = true;
    }
  }
  for (const item of doc?.items ?? []) changed = fix(item) || changed;
  return changed;
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file);
    else if (name.endsWith(".json")) {
      const text = fs.readFileSync(file, "utf8");
      const doc = JSON.parse(text);
      if (!fix(doc)) continue;
      files++;
      if (!dry) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + (text.endsWith("\n") ? "\n" : ""));
    }
  }
}

walk(path.resolve("src/packs"));
for (const [change, n] of [...changes].sort()) console.log(`${String(n).padStart(4)}  ${change}`);
console.log(`${dry ? "[dry] " : ""}${files} files ${dry ? "would change" : "changed"}.`);
