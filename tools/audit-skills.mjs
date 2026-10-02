/**
 * Audit of skill automation in the compendium sources (src/packs/skills-*).
 * Usage: npm run packs:audit-skills [-- --out report.md] [-- --pack skills-class] [-- --constant]
 *
 * For each skill it reports:
 *   - automated: it has effects (or conditions / a roll formula) and none of them is broken;
 *   - broken: effects that do nothing or can't work (Custom mode on a stat, key outside the catalog,
 *     empty changes, bad formula, filter skill missing from the compendiums);
 *   - pending: its text suggests something to automate (SR/CR scaling, tiers, equipment or state
 *     conditions, other skills, damage) and it has no effect;
 *   - noRoll: its text deals damage / heals but its Damage is not set;
 *   - rolls: an active skill whose Check / Damage are set and nothing else was detected (the SR / CR /
 *     attribute scaling of its text is taken as part of its roll).
 * The hints say what the text mentions, to choose the mechanism (see .claude/handoff/skills-auto-spec.md).
 */
import fs from "node:fs";
import path from "node:path";
import { findEffectTarget } from "../module/helpers/effect-targets.mjs";
import { CONDITION_TYPES } from "../module/helpers/effect-conditions.mjs";

const ROOT = "src/packs";
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const onlyPack = opt("--pack");
const onlyConstant = args.includes("--constant");
const out = opt("--out");

const ENTITIES = { laquo: "«", raquo: "»", times: "×", nbsp: " ", amp: "&", quot: "\"", rsquo: "'", lsquo: "'", ldquo: "\"", rdquo: "\"", mdash: "—", ndash: "–", hellip: "…" };
const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&([a-z]+);/g, (m, e) => ENTITIES[e] ?? " ").replace(/\s+/g, " ").trim();

/** What the text mentions (hints for the mechanism to use). */
const HINTS = {
  "SR scaling": /\[[^\]]*SR[^\]]*\]|\(SR\)|SR\s*[x×*+]/i,
  "CR": /\[CR|\(CR\s*\d+\)|CR\s*[+-]\s*\d/i,
  "SR tiers": /\(SR\s*\d+[^)]*\)\s*:/i,
  "equipment": /equipped|hand slot|wielding|armor slot|accessory slot/i,
  "state": /\[hidden\]|hate top|hate under|first round|standby|pre-action|incapacitated/i,
  "other skills": /«[^»]+»/,
  "roll bonus": /(bonus|\+)[^.]{0,40}(damage roll|to the damage|hit check|accuracy check|amount of hp recovered)/i,
  "hate cost": /\[hate\] cost|hate cost/i,
  "range": /range[^.]{0,30}(\+\d|increase)|\[range:/i,
  "attribute": /\[(str|dex|pow|int)\b[^\]]*\]|\((str|dex|pow|int) mod\)/i,
  "stat bonus": /(bonus|\+\d|\+1D)[^.]{0,40}\[(accuracy|evasion|resistance|attack power|magic power|recovery|initiative|speed|physical defense|magic(al)? defense|max hp|\w+ checks?)\]/i
};
const DEALS_DAMAGE = /\b(deal|deals|inflict|recovers?|heal)\b[^.]{0,60}(damage|hp)/i;

/** Every skill uuid of the system compendiums (filters must point to existing skills). */
function compendiumUuids() {
  const uuids = new Set();
  for (const dir of fs.readdirSync(ROOT)) {
    for (const file of fs.readdirSync(path.join(ROOT, dir))) {
      if (!file.endsWith(".json")) continue;
      const doc = JSON.parse(fs.readFileSync(path.join(ROOT, dir, file), "utf8"));
      uuids.add(`Compendium.lhtrpg.${dir}.Item.${doc._id}`);
    }
  }
  return uuids;
}

/** A formula can be evaluated: only @variables, numbers, operators and Math functions. */
function validFormula(value) {
  const expr = String(value)
    .replace(/@(weapon|offhand)\.(attack|magic)\b/g, "1")
    .replace(/@(srMax|sr|cr|attack|magic|recovery|str|dex|pow|int)(\.(mod|base))?\b/g, "1");
  if (!/^[\d\s+\-*/().,]*(?:(floor|ceil|round|max|min|abs)[\d\s+\-*/().,]*)*$/.test(expr)) return false;
  try {
    const result = Function("floor", "ceil", "round", "max", "min", "abs", `return (${expr});`)(Math.floor, Math.ceil, Math.round, Math.max, Math.min, Math.abs);
    return Number.isFinite(result);
  }
  catch { return false; }
}

const CONDITION_IDS = new Set(CONDITION_TYPES.map(t => t.id));

/** Problems of a skill's effects and conditions. */
function problems(doc, uuids) {
  const issues = [];
  for (const c of doc.system.conditions ?? []) if (!CONDITION_IDS.has(c?.type)) issues.push(`skill condition "${c?.type}"`);
  for (const effect of doc.effects ?? []) {
    const name = effect.name || "(no name)";
    if (!effect.changes?.length && !effect.statuses?.length && !effect.flags?.lhtrpg?.statusData) issues.push(`${name}: no changes`);
    for (const change of effect.changes ?? []) {
      const target = findEffectTarget(change.key);
      const virtual = String(change.key).startsWith("lhtrpg.");
      if (!change.key) issues.push(`${name}: empty key`);
      else if (!target) issues.push(`${name}: key outside the catalog (${change.key})`);
      if (target && (target.kind !== "text") && !virtual && (Number(change.mode) === 0)) {
        issues.push(`${name}: Custom mode on ${change.key} (does nothing)`);
      }
      const value = String(change.value ?? "").trim();
      if (value.includes("@") && !validFormula(value)) issues.push(`${name}: bad formula "${value}"`);
      else if (target && ["number", "dice"].includes(target.kind) && !value.includes("@") && !/^[+-]?\d+$/.test(value)) {
        issues.push(`${name}: value "${value}" is not a number`);
      }
    }
    for (const c of effect.flags?.lhtrpg?.conditions ?? []) if (!CONDITION_IDS.has(c?.type)) issues.push(`${name}: condition "${c?.type}"`);
    const rating = effect.flags?.lhtrpg?.statusData?.value;
    if (String(rating ?? "").includes("@") && !validFormula(rating)) issues.push(`${name}: bad status rating "${rating}"`);
    if (effect.flags?.lhtrpg?.statusData?.statusId && !(effect.statuses ?? []).includes(effect.flags.lhtrpg.statusData.statusId)) {
      issues.push(`${name}: statuses must include "${effect.flags.lhtrpg.statusData.statusId}"`);
    }
    for (const s of effect.flags?.lhtrpg?.rollFilter?.skills ?? []) {
      if (s.uuid && !uuids.has(s.uuid)) issues.push(`${name}: filter skill not found (${s.name} ${s.uuid})`);
    }
  }
  return issues;
}

const uuids = compendiumUuids();
const rows = [];
for (const dir of fs.readdirSync(ROOT).filter(d => d.startsWith("skills-")).sort()) {
  if (onlyPack && (dir !== onlyPack)) continue;
  for (const file of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    if (!file.endsWith(".json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, dir, file), "utf8"));
    if ((doc.type !== "skill") || (doc.system.subtype === "Monster")) continue;
    const constant = /constant/i.test(doc.system.timing ?? "");
    if (onlyConstant && !constant) continue;
    const text = plain(doc.system.description);
    const hints = Object.entries(HINTS).filter(([, re]) => re.test(text)).map(([k]) => k);
    const issues = problems(doc, uuids);
    const damage = doc.system.damage ?? {};
    const hasEffects = !!doc.effects?.length || !!doc.system.conditions?.length;
    const rollSet = !!(damage.dice || damage.mod || damage.type || damage.recovery);
    const rollHints = new Set(["SR scaling", "attribute", "CR"]);
    const left = (!constant && rollSet) ? hints.filter(h => !rollHints.has(h)) : hints;
    let status;
    if (issues.length) status = "broken";
    else if (hasEffects) status = "automated";
    else if (!constant && DEALS_DAMAGE.test(text) && !rollSet) status = "noRoll";
    else if (left.length) status = "pending";
    else if (rollSet) status = "rolls";
    else status = "text";
    rows.push({ pack: dir, file, name: doc.name, timing: doc.system.timing, constant, status, hints: left, issues });
  }
}

const order = ["broken", "pending", "noRoll", "automated", "rolls", "text"];
const count = s => rows.filter(r => r.status === s).length;
const lines = [
  `# Skill automation audit (${new Date().toISOString().slice(0, 10)})`,
  "",
  `${rows.length} skills${onlyPack ? ` in ${onlyPack}` : ""}${onlyConstant ? " (Constant only)" : ""}: `
    + order.map(s => `${s} ${count(s)}`).join(", "),
  "",
  "- broken: effects that do nothing or can't work",
  "- pending: the text suggests automation and there is no effect",
  "- noRoll: the text deals damage / heals and its Damage is not set",
  "- automated: effects present and valid; rolls: Check / Damage set, nothing else detected",
  "- text: nothing detected to automate",
  ""
];
for (const status of order.filter(s => !["text", "rolls"].includes(s))) {
  const list = rows.filter(r => r.status === status);
  if (!list.length) continue;
  lines.push(`## ${status} (${list.length})`, "");
  for (const r of list) {
    const detail = r.issues.length ? r.issues.join("; ") : r.hints.join(", ");
    lines.push(`- **${r.name}** [${r.pack}${r.constant ? ", Constant" : ""}] ${detail ? `— ${detail}` : ""}`.trimEnd());
  }
  lines.push("");
}
const report = lines.join("\n");
if (out) {
  fs.writeFileSync(out, report);
  console.log(`${lines[2]}\nReport: ${out}`);
}
else console.log(report);
process.exitCode = count("broken") ? 1 : 0;
