import { PILE_MODES, PHYSICAL_TYPES, STOCK_FLAG, SETTINGS, SORT_MODES, TYPE_ICONS } from "./pile-config.mjs";
import {
  isMerchant, getGold, getStock, itemQuantity, buyPrice, sellPrice, getInteractingActor, usedSpace
} from "./pile-utils.mjs";
import * as api from "./pile-api.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Sheet for pile actors (loot, chests and merchants). The GM sees the
 * configuration and management controls; players see the interaction view.
 */
export class LHTrpgPileSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["lhtrpg", "pile-sheet"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      take: LHTrpgPileSheet.#onTake,
      takeAll: LHTrpgPileSheet.#onTakeAll,
      takeGold: LHTrpgPileSheet.#onTakeGold,
      depositGold: LHTrpgPileSheet.#onDepositGold,
      splitGold: LHTrpgPileSheet.#onSplitGold,
      openChest: LHTrpgPileSheet.#onOpenChest,
      closeChest: LHTrpgPileSheet.#onCloseChest,
      buy: LHTrpgPileSheet.#onBuy,
      sell: LHTrpgPileSheet.#onSell,
      viewItem: LHTrpgPileSheet.#onViewItem,
      deleteItem: LHTrpgPileSheet.#onDeleteItem,
      filterType: LHTrpgPileSheet.#onFilterType,
      shopTab: LHTrpgPileSheet.#onShopTab,
      toggleConfig: LHTrpgPileSheet.#onToggleConfig
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/lhtrpg/templates/pile/pile-sheet.html",
      scrollable: [".pile-body"]
    }
  };

  /** Is the GM configuration panel expanded? */
  #showConfig = false;

  /** Current text of the contents search box. */
  #search = "";

  /** Merchant tab: "buy" or "sell". */
  #shopTab = "buy";

  /** @override */
  get title() {
    return this.actor.token?.name ?? this.actor.name;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;
    const mode = system.mode ?? "loot";
    const merchant = isMerchant(actor);
    const interactor = getInteractingActor();
    const isGM = game.user.isGM;

    // Personal sort & type filter of this user.
    const view = this.#getView();
    const shopTab = merchant ? this.#shopTab : null;

    // Buy tab / loot / chest: the pile's own items. Sell tab: the interacting
    // character's unequipped items.
    const selling = shopTab === "sell";
    const source = selling
      ? (interactor?.items.contents ?? []).filter(i => PHYSICAL_TYPES.includes(i.type) && (i.system.equipped !== true))
      : actor.items.contents.filter(i => PHYSICAL_TYPES.includes(i.type));
    const list = this.#buildList(source, view, item => {
      const stock = getStock(item);
      const price = selling ? sellPrice(actor, item) : (merchant ? buyPrice(actor, item) : (Number(item.system.price) || 0));
      return {
        id: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        typeLabel: game.i18n.localize(`TYPES.ITEM.Type${item.type.capitalize()}`),
        // In shops the type is already the group heading: show rank and tags instead.
        details: [item.system.rank ? `R${item.system.rank}` : null, ...(item.system.tags ?? [])].filter(Boolean).join(" · "),
        quantity: item.type === "ticket" ? itemQuantity(item) : null,
        price,
        stock,
        stockLabel: stock === -1 ? "∞" : stock,
        soldOut: merchant && !selling && (stock === 0),
        canAfford: selling || !interactor || price <= getGold(interactor)
      };
    }, selling ? sellPrice : buyPrice);
    const items = list.groups.flatMap(g => g.entries);

    const closed = (mode === "chest") && !!system.chest?.closed;
    const merchantClosed = merchant && !system.merchant?.open;

    Object.assign(context, {
      actor,
      system,
      isGM,
      mode,
      modeLabel: game.i18n.localize(PILE_MODES[mode] ?? PILE_MODES.loot),
      modeOptions: Object.entries(PILE_MODES).map(([value, label]) => ({ value, label: game.i18n.localize(label), selected: value === mode })),
      isLoot: mode === "loot",
      isChest: mode === "chest",
      isMerchant: merchant,
      showConfig: isGM && this.#showConfig,
      img: actor.token?.texture.src ?? actor.img,
      name: this.title,
      gold: getGold(actor),
      infiniteGold: merchant && !!system.merchant?.infiniteGold,
      items,
      groups: list.groups,
      isEmpty: !actor.items.size && !getGold(actor),
      shopTab,
      isBuyTab: shopTab === "buy",
      isSellTab: shopTab === "sell",
      acceptsSales: !!system.merchant?.acceptsSales,
      description: system.description ?? "",
      descriptionHTML: merchant ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(system.description ?? "", { relativeTo: actor }) : "",
      // Players can't see inside a closed chest or a closed shop.
      hideContents: !isGM && (closed || merchantClosed),
      closed,
      locked: !!system.chest?.locked,
      merchantClosed,
      canDragOut: isGM || !merchant,
      interactor: interactor ? {
        name: interactor.name,
        img: interactor.img,
        gold: getGold(interactor),
        space: interactor.type === "character" ? `${usedSpace(interactor)} / ${interactor.system.inventory?.maxSpace ?? 0}` : null
      } : null,
      search: this.#search,
      hasItems: list.total > 0,
      typeFilters: list.typeFilters,
      allActive: list.type === "all",
      totalCount: list.total,
      // Merchants are always grouped by type: sorting by type would be redundant there.
      sortOptions: Object.entries(SORT_MODES)
        .filter(([value]) => !(merchant && (value === "type")))
        .map(([value, label]) => ({ value, label: game.i18n.localize(label), selected: value === view.sort })),
      buyPercent: Math.round(Number(system.merchant?.buyMultiplier ?? 1) * 100),
      sellPercent: Math.round(Number(system.merchant?.sellMultiplier ?? 0.5) * 100)
    });
    return context;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // Shops use a two-column layout (portrait + description | items).
    if (isMerchant(this.actor)) this.setPosition({ width: 860, height: 700 });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Toolbar: live search (client side) and personal sort order.
    const search = this.element.querySelector(".pile-search-input");
    search?.addEventListener("input", ev => {
      this.#search = ev.currentTarget.value;
      this.#applySearch();
    });
    search?.addEventListener("keydown", ev => { if (ev.key === "Enter") ev.preventDefault(); });
    const sort = this.element.querySelector(".pile-sort-select");
    sort?.addEventListener("change", ev => {
      ev.stopPropagation();
      this.#setView({ sort: ev.currentTarget.value });
    });
    this.#applySearch();

    // Merchant stock inputs (GM): -1 or empty = infinite.
    for (const input of this.element.querySelectorAll(".pile-stock-input")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        const item = this.actor.items.get(ev.currentTarget.closest("[data-item-id]").dataset.itemId);
        const raw = ev.currentTarget.value.trim();
        const value = (raw === "" || raw === "∞") ? -1 : Math.max(-1, Math.floor(Number(raw) || 0));
        item?.setFlag("lhtrpg", STOCK_FLAG, value);
      });
    }
  }

  /** @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Multipliers are edited as percentages.
    const merchant = data.system?.merchant;
    if (merchant) {
      if ("buyPercent" in merchant) merchant.buyMultiplier = Math.max(0, Number(merchant.buyPercent) || 0) / 100;
      if ("sellPercent" in merchant) merchant.sellMultiplier = Math.max(0, Number(merchant.sellPercent) || 0) / 100;
      delete merchant.buyPercent;
      delete merchant.sellPercent;
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Sorting, filtering & search                 */
  /* -------------------------------------------- */

  /** This user's sort/filter preference. */
  #getView() {
    const view = { sort: "manual", type: "all", ...(game.settings.get("lhtrpg", SETTINGS.view) ?? {}) };
    if (!(view.sort in SORT_MODES)) view.sort = "manual";
    if ((view.type !== "all") && !PHYSICAL_TYPES.includes(view.type)) view.type = "all";
    return view;
  }

  /**
   * Filter, sort and (when sorting by type) group a list of items.
   * @param {Item[]} source
   * @param {{sort: string, type: string}} view
   * @param {(item: Item) => object} toEntry   Template data of one item
   * @param {Function} priceFn                 Price used by the price sorts
   */
  #buildList(source, view, toEntry, priceFn) {
    const typeLabel = type => game.i18n.localize(`TYPES.ITEM.Type${type.capitalize()}`);
    const typeFilters = PHYSICAL_TYPES
      .map(type => ({ type, count: source.filter(i => i.type === type).length }))
      .filter(f => f.count);
    // A filter on a type this list doesn't hold would show nothing: fall back to all.
    const type = typeFilters.some(f => f.type === view.type) ? view.type : "all";
    const shown = (type === "all") ? source : source.filter(i => i.type === type);
    const sorted = this.#sortItems(shown, view.sort, priceFn);

    // Merchants always group their items by type; other piles only when sorting by type.
    let groups;
    if (isMerchant(this.actor) || (view.sort === "type")) {
      groups = PHYSICAL_TYPES
        .map(t => ({
          type: t,
          label: game.i18n.localize(`LHTRPG.Piles.TypePlural.${t}`),
          icon: TYPE_ICONS[t],
          entries: sorted.filter(i => i.type === t).map(toEntry)
        }))
        .filter(g => g.entries.length)
        .map(g => ({ ...g, count: g.entries.length }));
    }
    else groups = [{ type: null, label: null, entries: sorted.map(toEntry) }];

    return {
      type,
      total: source.length,
      groups,
      typeFilters: typeFilters.map(f => ({ ...f, icon: TYPE_ICONS[f.type], label: typeLabel(f.type), active: type === f.type }))
    };
  }

  async #setView(changes) {
    const current = game.settings.get("lhtrpg", SETTINGS.view) ?? {};
    await game.settings.set("lhtrpg", SETTINGS.view, { ...current, ...changes });
    this.render();
  }

  /**
   * @param {Item[]} items
   * @param {string} mode   One of SORT_MODES
   */
  #sortItems(items, mode, priceFn) {
    const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
    const price = i => (isMerchant(this.actor) ? priceFn(this.actor, i) : (Number(i.system.price) || 0));
    const typeIndex = i => PHYSICAL_TYPES.indexOf(i.type);
    const compare = {
      manual: (a, b) => (a.sort - b.sort) || byName(a, b),
      name: byName,
      type: (a, b) => (typeIndex(a) - typeIndex(b)) || byName(a, b),
      priceAsc: (a, b) => (price(a) - price(b)) || byName(a, b),
      priceDesc: (a, b) => (price(b) - price(a)) || byName(a, b)
    }[mode] ?? ((a, b) => (a.sort - b.sort));
    return [...items].sort(compare);
  }

  /**
   * Hide the entries not matching the search box. In the slot grid, pad with
   * empty slots so the last row is complete (at least 4 rows are shown).
   */
  #applySearch() {
    const query = this.#search.trim().toLocaleLowerCase();
    const entries = this.element.querySelectorAll(".pile-contents [data-name]");
    let visible = 0;
    for (const entry of entries) {
      const match = !query || entry.dataset.name.toLocaleLowerCase().includes(query);
      entry.hidden = !match;
      if (match) visible++;
    }
    // Type headings with nothing left under them.
    for (const group of this.element.querySelectorAll(".pile-group")) {
      group.hidden = !group.querySelector("[data-name]:not([hidden])");
    }
    const grid = this.element.querySelector(".pile-grid");
    if (!grid) return;
    grid.querySelectorAll(".pile-slot-empty").forEach(e => e.remove());
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const total = Math.max(Math.ceil(visible / columns), 4) * columns;
    for (let i = visible; i < total; i++) {
      const empty = document.createElement("li");
      empty.className = "pile-slot-empty";
      grid.append(empty);
    }
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return game.user.isGM || !isMerchant(this.actor);
  }

  /** @override */
  _canDragDrop(selector) {
    return true;
  }

  /** @override */
  async _onDropItem(event, item) {
    if (!item) return null;
    const source = item.parent;

    // Reordering inside the pile (GM only).
    if (source?.uuid === this.actor.uuid) return this.isEditable ? super._onDropItem(event, item) : null;

    // From an actor: sell to a merchant, or move the item into the pile.
    if (source instanceof Actor) {
      if (isMerchant(this.actor) && !game.user.isGM) return api.sellItem(this.actor, item);
      return api.transferItem(item, this.actor);
    }

    // From the sidebar or a compendium: only the GM stocks piles this way.
    return game.user.isGM ? super._onDropItem(event, item) : null;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  #itemFromEvent(target) {
    return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static async #onTake(event, target) {
    const item = this.#itemFromEvent(target);
    const actor = api.requireInteractingActor();
    if (item && actor) await api.transferItem(item, actor);
  }

  static async #onTakeAll() {
    await api.takeAll(this.actor);
  }

  static async #onTakeGold() {
    const actor = api.requireInteractingActor();
    if (actor) await api.transferGold(this.actor, actor, undefined, { title: game.i18n.localize("LHTRPG.Piles.TakeGold") });
  }

  static async #onDepositGold() {
    const actor = api.requireInteractingActor();
    if (actor) await api.transferGold(actor, this.actor, undefined, { title: game.i18n.localize("LHTRPG.Piles.DepositGold") });
  }

  static async #onSplitGold() {
    await api.splitGold(this.actor);
  }

  static async #onOpenChest() {
    await api.setChestState(this.actor, false);
  }

  static async #onCloseChest() {
    await api.setChestState(this.actor, true);
  }

  static async #onBuy(event, target) {
    const item = this.#itemFromEvent(target);
    if (item) await api.buyItem(this.actor, item);
  }

  static async #onSell(event, target) {
    const actor = getInteractingActor();
    const item = actor?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) await api.sellItem(this.actor, item);
  }

  static #onViewItem(event, target) {
    this.#itemFromEvent(target)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    if (!game.user.isGM) return;
    await this.#itemFromEvent(target)?.delete();
  }

  static #onShopTab(event, target) {
    this.#shopTab = target.dataset.tab;
    this.#search = "";
    this.render();
  }

  static #onFilterType(event, target) {
    this.#setView({ type: target.dataset.type });
  }

  static #onToggleConfig() {
    this.#showConfig = !this.#showConfig;
    this.render();
  }
}
