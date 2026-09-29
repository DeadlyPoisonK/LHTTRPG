import {
  EFFECT_TARGETS,
  findEffectTarget,
  isDerivedEffectKey,
  getEffectTargetActorTypes,
  getEffectKeyInfo
} from "../helpers/effect-targets.mjs";
import { SuggestInput } from "../helpers/suggest-input.mjs";

const GROUP_ORDER = {
  attributes: 0,
  resources: 1,
  checks: 2,
  checkDice: 3,
  battle: 4,
  other: 5
};

/**
 * Format the HTML for the target info row below the key input.
 * @param {object|null} info
 * @returns {string}
 */
function renderTargetInfoHtml(info) {
  if (!info) return "";
  const esc = globalThis.foundry?.utils?.escapeHTML ?? (s => s);
  if (info.warning) {
    return `<span class="lh-target-warning ${esc(info.status)}" data-tooltip="${esc(info.message)}"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(info.message)}</span>`;
  }
  if (info.label) {
    let html = `<span class="lh-target-label">${esc(info.label)}</span>`;
    if (info.chip) {
      html += ` <span class="lh-target-chip ${esc(info.chip.type)}">[${esc(info.chip.label)}]</span>`;
    }
    return html;
  }
  return "";
}

/**
 * Custom ActiveEffect configuration sheet for Log Horizon TRPG (AppV2).
 * Provides an attribute key suggestion dropdown with catalog destinations,
 * translated labels, type exclusivity chips, and derived-field warnings.
 * @extends {foundry.applications.sheets.ActiveEffectConfig}
 */
export class LHTrpgActiveEffectConfig extends foundry.applications.sheets.ActiveEffectConfig {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg-effect-config"]
  };

  /** @override */
  static PARTS = {
    ...foundry.applications.sheets.ActiveEffectConfig.PARTS,
    changes: {
      template: "systems/lhtrpg/templates/effects/effect-changes.hbs",
      scrollable: ["ol[data-changes]"]
    }
  };

  /**
   * Active SuggestInput instances attached to current changes inputs.
   * @type {SuggestInput[]}
   * @private
   */
  _suggestInputs = [];

  /**
   * Applicable actor types for the effect document (destination).
   * @type {string[]}
   */
  get targetActorTypes() {
    return getEffectTargetActorTypes(this.document);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "changes") {
      const targetActorTypes = this.targetActorTypes;
      context.targetActorTypes = targetActorTypes;
      context.changeInfos = (context.source?.changes ?? []).map(c => getEffectKeyInfo(c?.key, targetActorTypes));
    }
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Destroy any existing SuggestInputs from previous render pass
    this._suggestInputs?.forEach(s => s.destroy());
    this._suggestInputs = [];

    const targetActorTypes = this.targetActorTypes;
    const catalog = globalThis.CONFIG?.LHTRPG?.effectTargets ?? EFFECT_TARGETS;
    const applicable = catalog.filter(t => t.actorTypes.some(at => targetActorTypes.includes(at)));

    const rows = this.element.querySelectorAll("ol[data-changes] li[data-index]");
    for (const row of rows) {
      const keyInput = row.querySelector('input[name$=".key"]');
      if (!keyInput) continue;
      const infoEl = row.querySelector(".lh-effect-target-info");

      const suggest = new SuggestInput(keyInput, {
        getOptions: query => {
          const q = (query ?? "").trim().toLowerCase();
          const scored = [];
          for (const target of applicable) {
            let label;
            if (target.group === "checkDice") {
              const checkName = game.i18n.localize(target.label);
              label = game.i18n.format("LHTRPG.EffectTarget.Dice", { check: checkName });
            } else {
              label = game.i18n.localize(target.label);
            }
            const group = game.i18n.localize(`LHTRPG.EffectTarget.Group.${target.group}`);
            let badge = null;
            let badgeType = null;
            if (targetActorTypes.length > 1 && target.actorTypes.length === 1) {
              badgeType = target.actorTypes[0];
              badge = game.i18n.localize(badgeType === "monster" ? "LHTRPG.EffectTarget.Chip.Monster" : "LHTRPG.EffectTarget.Chip.Character");
            }

            let score = 3;
            if (q) {
              const lowerLabel = label.toLowerCase();
              const lowerKey = target.key.toLowerCase();
              const strippedKey = target.key.replace(/^system\./, "").toLowerCase();
              const words = lowerLabel.split(/\s+/);

              if (lowerLabel.startsWith(q) || lowerKey.startsWith(q) || strippedKey.startsWith(q)) {
                score = 0;
              } else if (words.some(w => w.startsWith(q)) || group.toLowerCase().startsWith(q)) {
                score = 1;
              } else if (lowerLabel.includes(q) || group.toLowerCase().includes(q) || lowerKey.includes(q)) {
                score = 2;
              } else {
                continue;
              }
            } else {
              score = 0;
            }

            scored.push({
              value: target.key,
              label,
              group,
              desc: target.key,
              badge,
              badgeType,
              groupKey: target.group,
              score
            });
          }

          scored.sort((a, b) => {
            return (a.score - b.score)
              || (GROUP_ORDER[a.groupKey] ?? 99) - (GROUP_ORDER[b.groupKey] ?? 99)
              || a.label.localeCompare(b.label);
          });

          const best = scored[0]?.score ?? 3;
          const filtered = scored.filter(s => (best > 1) || (s.score < 2));

          if (q) {
            const exact = applicable.some(t => t.key.toLowerCase() === q);
            if (!exact) {
              filtered.push({
                value: query.trim(),
                label: `${game.i18n.localize("LHTRPG.EffectTarget.Custom")}: ${query.trim()}`,
                desc: query.trim(),
                custom: true
              });
            }
          }
          return filtered;
        },
        onPick: option => {
          keyInput.value = option.value;
          const info = getEffectKeyInfo(option.value, targetActorTypes);
          if (infoEl) infoEl.innerHTML = renderTargetInfoHtml(info);

          // If mode is empty or CUSTOM (0), default to ADD (2)
          const modeEl = row.querySelector('[name$=".mode"]');
          if (modeEl && (!modeEl.value || modeEl.value === "0")) {
            modeEl.value = "2";
            modeEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
          // Not "input": the SuggestInput would take it as typing and reopen the menu.
          keyInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      this._suggestInputs.push(suggest);

      // Listen directly to key input so manual changes update the label/warning row
      keyInput.addEventListener("input", () => {
        const info = getEffectKeyInfo(keyInput.value, targetActorTypes);
        if (infoEl) infoEl.innerHTML = renderTargetInfoHtml(info);
      });
    }
  }

  /** @override */
  async close(options) {
    this._suggestInputs?.forEach(s => s.destroy());
    this._suggestInputs = [];
    return super.close(options);
  }
}
