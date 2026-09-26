/**
 * System compendiums: the JSON sources in src/packs/<pack>/ are the ones kept in git, the LevelDB
 * databases in packs/<pack>/ are generated from them (and shipped in the release zip).
 *
 *   npm run packs:build    src/packs  ->  packs     (Foundry must not have the packs open: close the world)
 *   npm run packs:unpack   packs      ->  src/packs (after editing the system compendiums inside Foundry)
 */
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "packs");
const DEST = path.join(ROOT, "packs");

const manifest = JSON.parse(readFileSync(path.join(ROOT, "system.json"), "utf8"));
const packs = manifest.packs.map(p => p.name);

/** File name of an extracted document: its name plus its id, so renames never collide. */
function transformName(doc) {
  const safe = (doc.name ?? "unnamed").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "unnamed";
  const kind = doc._key?.split("!")[1] ?? "doc";
  return `${kind === "folders" ? "_folder_" : ""}${safe}_${doc._id}.json`;
}

async function build() {
  for (const name of packs) {
    const src = path.join(SRC, name);
    if (!existsSync(src)) {
      console.warn(`- ${name}: no sources, skipped`);
      continue;
    }
    const dest = path.join(DEST, name);
    rmSync(dest, { recursive: true, force: true });
    await compilePack(src, dest, { recursive: true });
    console.log(`+ ${name}`);
  }
}

async function unpack() {
  for (const name of packs) {
    const src = path.join(DEST, name);
    if (!existsSync(src)) continue;
    await extractPack(src, path.join(SRC, name), { clean: true, folders: true, transformName, jsonOptions: { space: 2 } });
    console.log(`+ ${name}`);
  }
}

const command = process.argv[2];
if (command === "build") await build();
else if (command === "unpack") await unpack();
else console.log("Usage: node tools/packs.mjs build|unpack");
