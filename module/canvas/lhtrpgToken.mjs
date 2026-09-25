import { HIDDEN_STATUS } from "../helpers/statuses.mjs";

/**
 * Token with support for the [Hidden] status: the token disappears for every user that does not
 * own it, and is drawn semi-transparent for its owners and the GM.
 * @extends {foundry.canvas.placeables.Token}
 */
export class LHTrpgToken extends foundry.canvas.placeables.Token {

  /** Is the token under the [Hidden] status? */
  get isLHHidden() {
    return !!this.document.hasStatusEffect(HIDDEN_STATUS);
  }

  /** @override */
  get isVisible() {
    if (this.isLHHidden && !game.user.isGM && !this.document.isOwner) return false;
    return super.isVisible;
  }

  /** @override */
  _getTargetAlpha() {
    const alpha = super._getTargetAlpha();
    return this.isLHHidden ? Math.min(alpha, 0.5) : alpha;
  }
}
