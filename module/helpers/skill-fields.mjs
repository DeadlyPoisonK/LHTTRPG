/**
 * Standardized skill block fields (Rules II.c. READING SKILL BLOCKS): Timing, Target, Range,
 * Cost and Limit (Activation). They are still stored as plain strings (chat cards, monster sheet
 * and compendiums read them as text); the item sheet edits them through a type dropdown plus an
 * optional amount (n) and qualifier. Values that don't match the rules are kept as "custom" text.
 */

/**
 * Each type: `key` (option value), `label`, and optionally `n` (takes an amount, with its default)
 * and `qual` (accepts the field's qualifiers). `compose` builds the stored string.
 */
export const SKILL_FIELDS = {
  timing: {
    types: [
      "Constant", "Pre-Play", "Interlude", "Briefing", "Rest Time",
      "Major", "Minor", "Move", "Instant", "Main Process",
      "Setup", "Initiative", "Cleanup",
      "Before Check", "After Check", "Damage Roll", "Before Damage", "After Damage",
      "Action", "Refer"
    ].map(t => ({ key: t, label: t }))
  },
  target: {
    quals: ["P", "A"],
    types: [
      { key: "Self", label: "Self" },
      { key: "Single", label: "Single" },
      { key: "Targets", label: "Targets", n: "2", compose: (n) => `${n} Targets` },
      { key: "Area", label: "Area", qual: true, compose: (n, q) => `Area${q ? ` (${q})` : ""}` },
      { key: "Wide", label: "Wide", n: "1", qual: true, compose: (n, q) => `Wide ${n}${q ? ` (${q})` : ""}` },
      { key: "Line", label: "Line", n: "1", qual: true, compose: (n, q) => `Line ${n}${q ? ` (${q})` : ""}` },
      { key: "Refer", label: "Refer" }
    ]
  },
  range: {
    types: [
      { key: "Close", label: "Close" },
      { key: "Weapon", label: "Weapon" },
      { key: "Sq", label: "Sq", n: "1", compose: (n) => `${n}Sq` },
      { key: "Refer", label: "Refer" }
    ]
  },
  cost: {
    quals: ["Party", "Allies"],
    types: [
      { key: "Hate", label: "Hate", n: "1", qual: true, compose: (n, q) => `Hate ${n}${q ? ` (${q})` : ""}` },
      { key: "Fate", label: "Fate", n: "1", qual: true, compose: (n, q) => `Fate ${n}${q ? ` (${q})` : ""}` },
      { key: "Refer", label: "Refer" }
    ]
  },
  limit: {
    types: [
      { key: "Scenario", label: "Scenario", n: "1", compose: (n) => `${n}/Scenario` },
      { key: "Scene", label: "Scene", n: "1", compose: (n) => `${n}/Scene` },
      { key: "Round", label: "Round", n: "1", compose: (n) => `${n}/Round` },
      { key: "[Party]", label: "[Party]" },
      { key: "Other", label: "Other" }
    ]
  }
};

/** Option value meaning "no value" (stored as "-") and "free text". */
export const NONE = "-";
export const CUSTOM = "custom";

const simplify = s => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Parse a stored string into its dropdown parts.
 * @param {string} field  Key of SKILL_FIELDS
 * @param {string} value  Stored value
 * @returns {{type: string, n: string, qual: string, custom: string}}
 */
export function parseSkillField(field, value) {
  const raw = String(value ?? "").trim();
  const result = { type: CUSTOM, n: "", qual: "", custom: raw };
  const spec = SKILL_FIELDS[field];
  if (!raw || raw === NONE) return { ...result, type: NONE, custom: "" };

  // Plain keywords (case/space/hyphen insensitive: "Pre-play", "Preplay", "major"...)
  const plain = spec.types.find(t => !t.n && !t.qual && simplify(t.key) === simplify(raw));
  if (plain) return { ...result, type: plain.key };

  const qualOf = q => {
    if (!q) return "";
    q = q.toLowerCase();
    if (field === "target") return q === "select" || q === "p" ? "P" : (q === "indiscriminate" || q === "a" ? "A" : null);
    return spec.quals?.find(x => x.toLowerCase() === q) ?? null;
  };
  let m;
  switch (field) {
    case "target":
      if ((m = raw.match(/^(\S+)(?:\s+targets?)?$/i))) {
        const words = { two: "2", three: "3", four: "4", five: "5", six: "6" };
        const n = words[m[1].toLowerCase()] ?? m[1];
        if (/targets?$/i.test(raw) || /^\d+$/.test(n)) return { ...result, type: "Targets", n };
      }
      if ((m = raw.match(/^(area|wide|line)(?:\s+area)?\s*([^\s(]*)\s*(?:\(([^)]*)\))?$/i))) {
        const type = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
        const qual = qualOf(m[3]);
        const needsN = type !== "Area";
        if (qual !== null && (needsN ? !!m[2] : !m[2])) return { ...result, type, n: m[2], qual };
      }
      break;
    case "range":
      if ((m = raw.match(/^(.+?)\s*sq\.?$/i))) return { ...result, type: "Sq", n: m[1] };
      break;
    case "cost":
      if ((m = raw.match(/^(hate|fate)\s+(.+?)\s*(?:\((party|allies)\))?$/i))) {
        return { ...result, type: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), n: m[2], qual: qualOf(m[3]) };
      }
      break;
    case "limit":
      // "1/Scene", "(SR)/Scenario", "1 Scene" or the rules' own "Scene 1"
      if ((m = raw.match(/^(?<n>.+?)\s*(?:\/|\s)\s*(?<type>scenario|scene|round)$/i)
        ?? raw.match(/^(?<type>scenario|scene|round)\s+(?<n>.+)$/i))) {
        const { type, n } = m.groups;
        return { ...result, type: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(), n };
      }
      if (simplify(raw) === "party") return { ...result, type: "[Party]" };
      break;
  }
  return result;
}

/**
 * Build the stored string from its dropdown parts.
 * @param {string} field
 * @param {{type: string, n?: string, qual?: string, custom?: string}} parts
 * @returns {string}
 */
export function composeSkillField(field, { type, n, qual, custom }) {
  if (type === NONE) return NONE;
  if (type === CUSTOM) return (custom ?? "").trim() || NONE;
  const spec = SKILL_FIELDS[field].types.find(t => t.key === type);
  if (!spec) return NONE;
  if (!spec.compose) return spec.key;
  return spec.compose((n ?? "").trim() || spec.n || "", spec.qual ? (qual ?? "") : "");
}

/**
 * Render context for the item sheet: one entry per field with its parsed parts and options.
 * @param {object} system  Skill item system data
 * @returns {object}
 */
export function prepareSkillFields(system) {
  return Object.fromEntries(Object.entries(SKILL_FIELDS).map(([field, spec]) => {
    const parts = parseSkillField(field, system[field]);
    const current = spec.types.find(t => t.key === parts.type);
    return [field, {
      field,
      name: `system.${field}`,
      value: system[field] ?? "",
      ...parts,
      showN: !!current?.n,
      showQual: !!current?.qual,
      isCustom: parts.type === CUSTOM,
      quals: spec.quals ?? [],
      types: spec.types.map(t => ({ key: t.key, label: t.label, n: t.n ?? "", qual: !!t.qual }))
    }];
  }));
}
