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
  _onClickLeft2(event) {
    // Players open piles (loot, chests, merchants) through the pile API, which
    // checks the interaction distance first.
    if ((this.actor?.type === "pile") && !game.user.isGM) {
      if (!this._propagateLeftClick(event)) event.stopPropagation();
      return game.lhtrpg.piles.openPile(this.actor);
    }
    return super._onClickLeft2(event);
  }

  /** @override */
  _getTargetAlpha() {
    const alpha = super._getTargetAlpha();
    return this.isLHHidden ? Math.min(alpha, 0.5) : alpha;
  }
}
