// Localization check: every language has the keys of lang/en.json, and every literal
// "LHTRPG.*" / "TYPES.*" key used in module/ and templates/ exists in en.json.
// Usage: npm run check:i18n   (exit code 1 when something is missing)
import fs from "fs";
import path from "path";

const flat = (o, p = "", r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, r);
    else r[key] = v;
  }
  return r;
};
const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

const system = JSON.parse(fs.readFileSync("system.json", "utf8"));
const en = flat(JSON.parse(fs.readFileSync("lang/en.json", "utf8")));
let problems = 0;

for (const { lang, path: file } of system.languages) {
  if (lang === "en") continue;
  const keys = flat(JSON.parse(fs.readFileSync(file, "utf8")));
  const missing = Object.keys(en).filter(k => !(k in keys));
  const extra = Object.keys(keys).filter(k => !(k in en));
  console.log(`${lang}: ${Object.keys(keys).length}/${Object.keys(en).length} keys` +
    (missing.length ? `, missing ${missing.length}` : "") + (extra.length ? `, not in en ${extra.length}` : ""));
  for (const k of missing) console.log(`  - ${k}`);
  for (const k of extra) console.log(`  + ${k}`);
  problems += missing.length;
}

const used = new Map();
for (const file of [...walk("module"), ...walk("templates")]) {
  const text = fs.readFileSync(file, "utf8");
  for (const [, key] of text.matchAll(/["'`]((?:LHTRPG|TYPES)\.[A-Za-z0-9_.-]+)["'`]/g)) {
    if (!key.endsWith(".") && !(key in en) && !used.has(key)) used.set(key, file);
  }
}
for (const [key, file] of used) console.log(`en.json lacks ${key} (${file})`);
problems += used.size;

process.exit(problems ? 1 : 0);
