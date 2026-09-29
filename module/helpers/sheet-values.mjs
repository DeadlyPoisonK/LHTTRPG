/* ------------------------------------------------------------------------- */
/*  V2 Sheet Pattern: Base vs. Effective Data                                */
/* ------------------------------------------------------------------------- */
// In AppV2 with submitOnChange: true, the entire form is serialized and submitted
// on every field change. Editable inputs must display the un-modified base value
// (from _source.system) rather than the prepared value (actor.system), otherwise
// active effect bonuses get permanently baked into the underlying document source
// data.
//
// Pattern:
// 1. Editable inputs bind to `source = this.actor._source.system` (with fallback defaults
//    and any legacy normalization).
// 2. Active bonuses (effective !== base) are tracked in `context.modified` and
//    displayed discretely (e.g. `has-effect` class, `→ <effective>` indicator,
//    and `data-tooltip="Base X, con efectos Y"`).
// 3. Inputs marked `disabled` (derived stats, check totals, defense, power, speed, etc.)
//    continue showing `system.*` (effective values) because disabled fields are not
//    serialized by FormDataExtended.
// 4. Rolls and derived displays continue using effective values (`actor.system`).
/* ------------------------------------------------------------------------- */

/**
 * Detect if a numeric field is modified by Active Effects (effective !== base).
 *
 * @param {number|string} base        Base value from document._source.system
 * @param {number|string} effective   Prepared value from document.system
 * @returns {{base: number, effective: number, display: string, tooltip: string}|null}
 */
export function effectModified(base, effective) {
  const b = Number(base) || 0;
  const e = Number(effective) || 0;
  if (b === e) return null;
  return {
    base: b,
    effective: e,
    display: `→ ${e}`,
    tooltip: game.i18n.format("LHTRPG.Effect.ModifiedTooltip", { base: b, effective: e })
  };
}
