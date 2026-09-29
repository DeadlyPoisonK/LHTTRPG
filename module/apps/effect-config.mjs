import {
  EFFECT_TARGETS,
  findEffectTarget,
  isDerivedEffectKey,
  getEffectTargetActorTypes,
  getEffectKeyInfo
} from "../helpers/effect-targets.mjs";
import { SuggestInput } from "../helpers/suggest-input.mjs";
import { LH_STATUSES, LH_STATUS_GROUPS } from "../helpers/statuses.mjs";
import { canonicalTag, findTag, tagKey, TAG_CATALOG, tagDescription } from "../helpers/tag-catalog.mjs";

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
 * Format the readable preview of a status (e.g. "[Pursuit: 10]", "[Weakness (Flame): 5]").
 * @param {string} statusId
 * @param {number|string} [value]
 * @param {string} [tag]
 * @returns {string}
 */
export function formatStatusPreview(statusId, value, tag) {
  if (!statusId) return "—";
  const statusInfo = LH_STATUSES.find(s => s.id === statusId);
  const label = globalThis.game?.i18n?.localize ? game.i18n.localize(`LHTRPG.StatusEffect.${statusId}`) : statusId;
  const rating = Math.max(1, Math.floor(Number(value) || 0) || 1);
  const cleanTag = (tag ?? "").trim();

  if (statusInfo?.tagged) {
    return cleanTag ? `[${label} (${cleanTag}): ${rating}]` : `[${label}: ${rating}]`;
  }
  if (statusInfo?.rated || statusInfo?.list) {
    return `[${label}: ${rating}]`;
  }
  return `[${label}]`;
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
  static TABS = {
    sheet: {
      tabs: [
        { id: "details", icon: "fa-solid fa-book" },
        { id: "duration", icon: "fa-solid fa-clock" },
        { id: "changes", icon: "fa-solid fa-gears" },
        { id: "lhStatus", icon: "fa-solid fa-heart-crack", label: "LHTRPG.EffectConfig.StatusTab" }
      ],
      initial: "details",
      labelPrefix: "EFFECT.TABS"
    }
  };

  /** @override */
  static PARTS = {
    header: foundry.applications.sheets.ActiveEffectConfig.PARTS.header,
    tabs: foundry.applications.sheets.ActiveEffectConfig.PARTS.tabs,
    details: foundry.applications.sheets.ActiveEffectConfig.PARTS.details,
    duration: {
      template: "systems/lhtrpg/templates/effects/effect-duration.hbs"
    },
    changes: {
      template: "systems/lhtrpg/templates/effects/effect-changes.hbs",
      scrollable: ["ol[data-changes]"]
    },
    lhStatus: {
      template: "systems/lhtrpg/templates/effects/effect-status.hbs"
    },
    footer: foundry.applications.sheets.ActiveEffectConfig.PARTS.footer
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
    } else if (partId === "lhStatus") {
      const statusData = context.source?.flags?.lhtrpg?.statusData ?? {};
      const statusId = statusData.statusId ?? "";
      const statusInfo = LH_STATUSES.find(s => s.id === statusId);

      context.statusData = statusData;
      context.isRated = !!(statusInfo?.rated || statusInfo?.list);
      context.isTagged = !!statusInfo?.tagged;
      context.statusGroups = LH_STATUS_GROUPS.map(group => ({
        id: group,
        label: `LHTRPG.StatusGroup.${group}`,
        statuses: LH_STATUSES.filter(s => s.group === group).map(s => ({
          id: s.id,
          label: `LHTRPG.StatusEffect.${s.id}`,
          selected: s.id === statusId,
          rated: !!s.rated,
          list: !!s.list,
          tagged: !!s.tagged
        }))
      }));

      if (statusInfo?.rated) {
        context.hint = game.i18n.localize("LHTRPG.EffectConfig.HintRated");
      } else if (statusInfo?.list) {
        context.hint = game.i18n.localize("LHTRPG.EffectConfig.HintList");
      } else {
        context.hint = "";
      }

      context.preview = formatStatusPreview(statusId, statusData.value, statusData.tag);
    } else if (partId === "duration") {
      let expires = context.source?.flags?.lhtrpg?.expires;
      if (expires === undefined) {
        expires = this.document.getFlag("lhtrpg", "expires");
      }
      if (expires === undefined) {
        const statusId = context.source?.flags?.lhtrpg?.statusData?.statusId ?? this.document.getFlag("lhtrpg", "statusData")?.statusId;
        const statusInfo = LH_STATUSES.find(s => s.id === statusId);
        if (statusInfo?.group === "combat") expires = "endOfScene";
        else expires = "";
      }
      context.expiryOptions = [
        { value: "", label: "LHTRPG.EffectDuration.Manual" },
        { value: "endOfProcess", label: "LHTRPG.EffectDuration.EndOfProcess" },
        { value: "endOfRound", label: "LHTRPG.EffectDuration.EndOfRound" },
        { value: "endOfScene", label: "LHTRPG.EffectDuration.EndOfScene" }
      ].map(opt => ({ ...opt, selected: opt.value === expires }));
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

    // LH Status tab listeners
    const statusTab = this.element.querySelector(".tab.lh-status");
    if (statusTab) {
      const selectStatus = statusTab.querySelector('select[name="flags.lhtrpg.statusData.statusId"]');
      const groupRating = statusTab.querySelector(".lh-status-rating-group");
      const inputRating = statusTab.querySelector('input[name="flags.lhtrpg.statusData.value"]');
      const groupTag = statusTab.querySelector(".lh-status-tag-group");
      const inputTag = statusTab.querySelector('input[name="flags.lhtrpg.statusData.tag"]');
      const hintEl = statusTab.querySelector(".lh-status-hint");
      const previewEl = statusTab.querySelector(".lh-status-preview");

      const updatePreview = () => {
        const statusId = selectStatus?.value ?? "";
        if (previewEl) {
          previewEl.textContent = formatStatusPreview(statusId, inputRating?.value, inputTag?.value);
        }
      };

      const updateStatusUi = () => {
        const statusId = selectStatus?.value ?? "";
        const statusInfo = LH_STATUSES.find(s => s.id === statusId);
        const isRated = !!(statusInfo?.rated || statusInfo?.list);
        const isTagged = !!statusInfo?.tagged;

        if (groupRating) {
          groupRating.hidden = !isRated;
          if (isRated && !inputRating.value) inputRating.value = "1";
        }
        if (groupTag) {
          groupTag.hidden = !isTagged;
        }
        if (hintEl) {
          if (statusInfo?.rated) {
            hintEl.textContent = game.i18n.localize("LHTRPG.EffectConfig.HintRated");
            hintEl.hidden = false;
          } else if (statusInfo?.list) {
            hintEl.textContent = game.i18n.localize("LHTRPG.EffectConfig.HintList");
            hintEl.hidden = false;
          } else {
            hintEl.textContent = "";
            hintEl.hidden = true;
          }
        }
        updatePreview();
      };

      if (selectStatus) {
        selectStatus.addEventListener("change", () => {
          updateStatusUi();
          // Combat Statuses last until the end of the scene, unless a duration was already chosen.
          const expiresSelect = this.element.querySelector('select[name="flags.lhtrpg.expires"]');
          if (expiresSelect && (this.document.getFlag("lhtrpg", "expires") === undefined)) {
            const group = LH_STATUSES.find(s => s.id === selectStatus.value)?.group;
            expiresSelect.value = (group === "combat") ? "endOfScene" : "";
          }
        });
      }
      if (inputRating) {
        inputRating.addEventListener("input", () => {
          updatePreview();
        });
      }
      if (inputTag) {
        inputTag.addEventListener("input", () => {
          updatePreview();
        });

        const catalog = globalThis.CONFIG?.LHTRPG?.tags ?? TAG_CATALOG;
        const applicableTags = catalog.filter(t => t.group === "LHTRPG.TagGroup.Element" || t.group === "LHTRPG.TagGroup.Attack");

        const tagSuggest = new SuggestInput(inputTag, {
          getOptions: query => {
            const q = tagKey(query);
            const scored = [];
            for (const entry of applicableTags) {
              const names = [entry.label, ...(entry.aliases ?? [])].map(tagKey);
              let score = 3;
              if (q) {
                if (names.some(n => n.startsWith(q))) score = 0;
                else if (names.some(n => n.split(" ").some(w => w.startsWith(q)))) score = 1;
                else if (names.some(n => n.includes(q))) score = 2;
                else continue;
              } else {
                score = 0;
              }
              scored.push({
                value: entry.label,
                label: entry.label,
                group: game.i18n.localize(entry.group),
                desc: tagDescription(entry.label),
                score
              });
            }
            scored.sort((a, b) => (a.score - b.score) || a.label.localeCompare(b.label));
            const best = scored[0]?.score ?? 3;
            const filtered = scored.filter(s => (best > 1) || (s.score < 2));
            if (query && !findTag(query)) {
              filtered.push({
                value: canonicalTag(query),
                label: canonicalTag(query),
                custom: true
              });
            }
            return filtered;
          },
          onPick: option => {
            inputTag.value = option.value;
            updatePreview();
            inputTag.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        this._suggestInputs.push(tagSuggest);
      }

      updateStatusUi();
    }
  }

  /**
   * @override
   * Synchronous, like core's: the addChange/deleteChange actions read its result right away.
   */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);

    const prevStatusId = this.document.getFlag("lhtrpg", "statusData")?.statusId ?? null;
    const rawStatusData = foundry.utils.getProperty(submitData, "flags.lhtrpg.statusData") ?? {};
    const newStatusId = String(rawStatusData.statusId ?? "").trim();
    const lhFlags = foundry.utils.getProperty(submitData, "flags.lhtrpg");
    if (lhFlags) delete lhFlags.statusData;

    if (!newStatusId) {
      if (prevStatusId) foundry.utils.setProperty(submitData, "flags.lhtrpg.-=statusData", null);
      const statuses = new Set(submitData.statuses ?? this.document.statuses);
      if (prevStatusId) statuses.delete(prevStatusId);
      submitData.statuses = Array.from(statuses);
    } else {
      const statusInfo = LH_STATUSES.find(s => s.id === newStatusId);
      const cleanData = { statusId: newStatusId };

      // Flags are merged on update: keys that no longer apply must be deleted explicitly.
      if (statusInfo?.rated || statusInfo?.list) {
        cleanData.value = Math.max(1, Math.floor(Number(rawStatusData.value) || 0) || 1);
      } else cleanData["-=value"] = null;
      if (statusInfo?.tagged) {
        const rawTag = String(rawStatusData.tag ?? "").trim();
        cleanData.tag = rawTag ? canonicalTag(rawTag) : "";
      } else cleanData["-=tag"] = null;

      foundry.utils.setProperty(submitData, "flags.lhtrpg.statusData", cleanData);

      const statuses = new Set(submitData.statuses ?? this.document.statuses);
      if (prevStatusId && (prevStatusId !== newStatusId)) {
        statuses.delete(prevStatusId);
      }
      statuses.add(newStatusId);
      submitData.statuses = Array.from(statuses);
    }

    const rawExpires = foundry.utils.getProperty(submitData, "flags.lhtrpg.expires");
    if (rawExpires !== undefined) {
      foundry.utils.setProperty(submitData, "flags.lhtrpg.expires", String(rawExpires ?? ""));
    } else if (this.document.getFlag("lhtrpg", "expires") === undefined && newStatusId) {
      const statusInfo = LH_STATUSES.find(s => s.id === newStatusId);
      if (statusInfo?.group === "combat") {
        foundry.utils.setProperty(submitData, "flags.lhtrpg.expires", "endOfScene");
      }
    }

    return submitData;
  }

  /** @override */
  async close(options) {
    this._suggestInputs?.forEach(s => s.destroy());
    this._suggestInputs = [];
    return super.close(options);
  }
}
