import { registerHandler, request } from "../piles/pile-socket.mjs";
// Identifies this browser window: the same user can be logged in from several.
import { CLIENT_ID } from "../helpers/clients.mjs";

/**
 * Log Horizon Round Progression:
 *   Briefing (combat created, not started)
 *   → Setup → Initiative/Main (one turn per combatant) → Cleanup → next round's Setup
 *
 * State (flags.lhtrpg):
 *   phase    setup | main | cleanup (Setup and Cleanup are "no-one's turn": turn = null)
 *   acted    ids that finished their Main Process this round, in order (Post-Action)
 *   active   id taking its Main Process
 *   standby  ids that declared Standby this round (once per round)
 *   prev     {acted, standby} of the previous round, to step back into its Cleanup
 *
 * The turn order is derived from that state: Post-Action (in the order they acted), the
 * active combatant, then the Initiative Process order for the rest — highest Initiative
 * first, then those on Standby from the lowest Initiative; PCs win ties.
 *
 * Only GMs write this state: players' turn controls go through the active GM (combatAdvance).
 */
export const PHASES = ["setup", "main", "cleanup"];


export class LHTrpgCombat extends Combat {

	/** Current Round Progression phase: briefing | setup | main | cleanup */
	get phase() {
		if (!this.started) return "briefing";
		const phase = this.getFlag("lhtrpg", "phase");
		if (PHASES.includes(phase)) return phase;
		return this.turn === null ? "setup" : "main";
	}

	/** Initiative Process state of the current round. */
	get progress() {
		const flags = this.flags.lhtrpg ?? {};
		const exists = id => this.combatants.has(id);
		const active = exists(flags.active) ? flags.active : null;
		return {
			acted: (flags.acted ?? []).filter(exists),
			active,
			standby: (flags.standby ?? []).filter(exists)
		};
	}

	/** Has this combatant finished its Main Process this round? */
	isPostAction(combatant) {
		if (!this.started) return false;
		if (this.phase === "cleanup") return true;
		return this.progress.acted.includes(combatant.id);
	}

	/** Is this combatant waiting on Standby? */
	isOnStandby(combatant) {
		const { acted, active, standby } = this.progress;
		return standby.includes(combatant.id) && !acted.includes(combatant.id) && active !== combatant.id;
	}

	/** Can the active combatant still declare Standby this round? */
	canStandby(combatant = this.combatant) {
		if (!combatant || this.phase !== "main") return false;
		const { active, standby } = this.progress;
		return active === combatant.id && !standby.includes(combatant.id);
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		// Phase known before the next update, to detect phase changes in _onUpdate
		this._lhPhaseState ??= { round: this.round, phase: this.phase };
	}

	/* -------------------------------------------- */
	/*  Turn order                                   */
	/* -------------------------------------------- */

	/**
	 * @override
	 * Core sorts with an unbound _sortCombatants, so the order is built here.
	 */
	setupTurns() {
		this.turns ||= [];
		const turns = this._orderTurns(this.progress);
		if (this.turn !== null) this.turn = Math.clamp(this.turn, 0, Math.max(turns.length - 1, 0));
		this.current = this._getCurrentState(turns[this.turn]);
		if (!this.previous) this.previous = this.current;
		return this.turns = turns;
	}

	/**
	 * Combatants in turn order for a given round state.
	 * @param {{acted: string[], active: string|null, standby: string[]}} state
	 * @returns {Combatant[]}
	 */
	_orderTurns({ acted, active, standby }) {
		const group = c => {
			if (acted.includes(c.id)) return 0;
			if (c.id === active) return 1;
			return standby.includes(c.id) ? 3 : 2;
		};
		const init = c => Number.isNumeric(c.initiative) ? Math.floor(c.initiative) : -Infinity;
		const pc = c => c.actor?.type === "character" ? 0 : 1;
		return this.combatants.contents.sort((a, b) => {
			const ga = group(a), gb = group(b);
			if (ga !== gb) return ga - gb;
			if (ga === 0) return acted.indexOf(a.id) - acted.indexOf(b.id);
			const byInit = ga === 3 ? init(a) - init(b) : init(b) - init(a);
			return byInit || (pc(a) - pc(b)) || a.name.localeCompare(b.name) || (a.id > b.id ? 1 : -1);
		});
	}

	/** Next combatant chosen by the Initiative Process, or null if everyone is Post-Action. */
	_nextActor(state) {
		const skip = this.settings.skipDefeated;
		return this._orderTurns(state).find(c =>
			!state.acted.includes(c.id) && c.id !== state.active && !(skip && c.isDefeated)) ?? null;
	}

	/**
	 * Write a new round state (phase + progress) and the matching turn index.
	 * @param {string} phase
	 * @param {{acted: string[], active: string|null, standby: string[]}} state
	 */
	async _applyState(phase, state, { round = this.round, options = {}, extra = {} } = {}) {
		const active = phase === "main" ? state.active : null;
		const next = { ...state, active };
		const turn = active ? this._orderTurns(next).findIndex(c => c.id === active) : null;
		const updateData = {
			round, turn,
			"flags.lhtrpg.phase": phase,
			"flags.lhtrpg.acted": next.acted,
			"flags.lhtrpg.active": active,
			"flags.lhtrpg.standby": next.standby,
			...extra
		};
		const updateOptions = { direction: 1, ...options, lhtrpgOrigin: CLIENT_ID };
		Hooks.callAll(round !== this.round ? "combatRound" : "combatTurn", this, updateData, updateOptions);
		await this.update(updateData, updateOptions);
		await this._syncStandbyStatus();
		return this;
	}

	/** Start the Main Process of the next combatant, or go to Cleanup. */
	async _advance(state) {
		const next = this._nextActor(state);
		if (!next) return this._applyState("cleanup", { ...state, active: null });
		return this._applyState("main", { ...state, active: next.id });
	}

	/* -------------------------------------------- */
	/*  Initiative                                   */
	/* -------------------------------------------- */

	/**
	 * @override
	 * Initiative is not rolled: it is the actor's Initiative value. PCs win ties.
	 */
	async rollInitiative(ids, { formula = null, updateTurn = true, messageOptions = {} } = {}) {

		// Structure input data
		ids = typeof ids === "string" ? [ids] : ids;
		const currentId = this.combatant?.id;
		let combatantUpdates = [];
		for (const id of ids) {
			// Get Combatant data
			const c = this.combatants.get(id, { strict: true });
			if (!c.actor) continue;

			let Init;
			if (c.actor.type === 'character') {
				Init = c.actor.system['battle-status'].initiative.total ?? 0;
			}
			else {
				Init = c.actor.system['battle-status'].initiative ?? 0;
			}

			//Do not roll for defeated combatants
			if (c.defeated) continue;

			if (c.actor.type === 'character') {
				Init += 0.1;
			}

			// Draw initiative
			combatantUpdates.push({
				_id: c.id,
				initiative: Init
			});
		}

		// Update multiple combatants
		await this.updateEmbeddedDocuments('Combatant', combatantUpdates);

		// Ensure the turn order remains with the same combatant
		if (updateTurn && currentId) {
			await this.update({ turn: this.turns.findIndex(t => t.id === currentId) });
		}

		// Return the updated Combat
		return this;
	}

	async _refreshInitiative() {
		await this.rollInitiative(this.combatants.map(c => c.id), { updateTurn: false });
	}

	/* -------------------------------------------- */
	/*  Round Progression                            */
	/* -------------------------------------------- */

	/**
	 * @override
	 * Leave the Briefing and begin round 1 at its Setup Process.
	 */
	async startCombat() {
		await this._refreshInitiative();
		await this._resetHate();

		this._playCombatSound("startEncounter");
		const updateData = {
			round: 1, turn: null,
			"flags.lhtrpg": { phase: "setup", acted: [], active: null, standby: [], prev: null }
		};
		Hooks.callAll("combatStart", this, updateData);
		await this.update(updateData, { lhtrpgOrigin: CLIENT_ID });
		return this;
	}

	/**
	 * @override
	 * Display a dialog querying the GM whether they wish to end the combat encounter and empty the tracker
	 */
	async endCombat() {
		await foundry.applications.api.DialogV2.confirm({
			window: { title: "COMBAT.EndTitle" },
			content: `<p>${game.i18n.localize("COMBAT.EndConfirmation")}</p>`,
			yes: {
				callback: async () => {
					await this._resetHate();
					await this._syncStandbyStatus({ clear: true });
					await this.delete();
				}
			},
			modal: true
		});
		return this;
	}

	/**
	 * @override
	 * Setup → Initiative Process → Main Process… → Cleanup → next round.
	 * Ending a Main Process makes the combatant Post-Action.
	 */
	async nextTurn() {
		if (this.round === 0) return this.startCombat();
		if (!game.user.isGM) return this._requestGM("nextTurn");

		const state = this.progress;
		switch (this.phase) {
			case "setup":
				return this._advance({ ...state, active: null });
			case "main": {
				const acted = state.active ? [...state.acted, state.active] : state.acted;
				return this._advance({ ...state, acted, active: null });
			}
			default:
				return this.nextRound();
		}
	}

	/**
	 * @override
	 * Undo the last step: the last Post-Action combatant takes its Main Process again.
	 */
	async previousTurn() {
		if (this.round === 0) return this;
		if (!game.user.isGM) return this._requestGM("previousTurn");

		const state = this.progress;
		if (this.phase === "setup") return this.previousRound();
		if (!state.acted.length) return this._applyState("setup", { ...state, active: null });
		const acted = state.acted.slice(0, -1);
		return this._applyState("main", { ...state, acted, active: state.acted.at(-1) });
	}

	/**
	 * @override
	 * Advance to the Setup Process of the next round: everyone returns to Pre-Action,
	 * Standby is available again and Initiative is recalculated.
	 */
	async nextRound() {
		if (!game.user.isGM) return this._requestGM("nextRound");
		await this._refreshInitiative();

		const { acted, standby } = this.progress;
		return this._applyState("setup", { acted: [], active: null, standby: [] }, {
			round: this.round + 1,
			options: { worldTime: { delta: CONFIG.time.roundTime } },
			extra: { "flags.lhtrpg.prev": { acted, standby } }
		});
	}

	/**
	 * @override
	 * Go back to the Cleanup Process of the previous round.
	 */
	async previousRound() {
		if (this.round <= 1) {
			return this.phase === "setup" ? this : this._applyState("setup", { acted: [], active: null, standby: [] });
		}
		if (!game.user.isGM) return this._requestGM("previousRound");
		await this._refreshInitiative();

		const prev = this.getFlag("lhtrpg", "prev") ?? {};
		const acted = prev.acted ?? this.turns.map(c => c.id);
		return this._applyState("cleanup", { acted, active: null, standby: prev.standby ?? [] }, {
			round: this.round - 1,
			options: { direction: -1, worldTime: { delta: -CONFIG.time.roundTime } },
			extra: { "flags.lhtrpg.prev": null }
		});
	}

	/**
	 * The active combatant declares Standby: it skips its Main Process for now and acts after
	 * everyone not on Standby (lowest Initiative first). Once per round.
	 */
	async declareStandby() {
		if (!this.canStandby()) return this;
		if (!game.user.isGM) return this._requestGM("standby");

		const state = this.progress;
		const standby = [...state.standby, state.active];
		const result = await this._advance({ ...state, active: null, standby });
		ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.combatants.get(state.active)?.actor }),
			content: `<div class="lhtrpg chat-card lh-phase-card standby"><p>${game.i18n.localize("LHTRPG.Combat.StandbyDeclared")}</p></div>`
		});
		return result;
	}

	/**
	 * Jump to a phase of the current round (GM, from the tracker's phase bar).
	 * @param {"setup"|"main"|"cleanup"} phase
	 */
	async goToPhase(phase) {
		if (!this.started || !PHASES.includes(phase) || phase === this.phase) return this;
		const state = this.progress;
		switch (phase) {
			case "setup":
				return this._applyState("setup", { acted: [], active: null, standby: [] });
			case "cleanup":
				return this._applyState("cleanup", { ...state, active: null });
			default:
				return this._advance({ ...state, active: null });
		}
	}

	/**
	 * Keep the [Standby] status (shown on the token) in line with the round state:
	 * from declaring Standby until the combatant's turn comes up.
	 * @param {{clear?: boolean}} options  Remove it from everyone (combat ending).
	 */
	async _syncStandbyStatus({ clear = false } = {}) {
		for (const combatant of this.combatants) {
			const actor = combatant.actor;
			if (!actor) continue;
			const wanted = !clear && this.isOnStandby(combatant);
			if (actor.statuses.has("standby") !== wanted) {
				await actor.toggleStatusEffect("standby", { active: wanted });
			}
		}
	}

	async _requestGM(action) {
		const result = await request("combatAdvance", { combatId: this.id, action });
		if (!result?.ok && result?.error) ui.notifications.warn(game.i18n.localize(result.error));
		return this;
	}

	/** @override */
	_onUpdate(changed, options, userId) {
		// Order depends on flags: rebuild it before core reads the current combatant
		if (foundry.utils.hasProperty(changed, "flags.lhtrpg")) {
			const current = this.current;
			this.setupTurns();
			this.current = current;
		}

		const before = this._lhPhaseState;
		super._onUpdate(changed, options, userId);
		const after = { round: this.round, phase: this.phase };
		this._lhPhaseState = after;
		if (!this.started) return;
		if (before && before.round === after.round && before.phase === after.phase) return;
		if (!("round" in changed) && !("turn" in changed) && !foundry.utils.hasProperty(changed, "flags.lhtrpg.phase")) return;

		/**
		 * A new Round Progression phase started. Called on every client.
		 * @param {LHTrpgCombat} combat
		 * @param {{round: number, phase: string}} current
		 * @param {{round: number, phase: string}|undefined} previous
		 */
		Hooks.callAll("lhtrpg.combatPhase", this, after, before);
		// Only the window that made the change runs it: never twice, even with several GMs
		// or the same user logged in from two windows.
		if (options.lhtrpgOrigin === CLIENT_ID) this._onPhaseStart(after.phase, after.round, before);
	}

	/**
	 * Runs once (on the GM client that changed the phase) when a Setup or Cleanup Process begins.
	 * Hook point for timed effects (Regen/Decay, Harmonies, end-of-round expiries…).
	 */
	async _onPhaseStart(phase, round, previous) {
		if (phase === "main") return;
		if (!game.settings.get("lhtrpg", "announcePhases")) return;
		const label = game.i18n.localize(`LHTRPG.Combat.Phase.${phase}`);
		const hint = game.i18n.localize(`LHTRPG.Combat.PhaseHint.${phase}`);
		await ChatMessage.create({
			speaker: { alias: game.i18n.format("COMBAT.Round", { round }) },
			content: `<div class="lhtrpg chat-card lh-phase-card ${phase}">
				<header class="chat-card-header"><div class="chat-card-title">
					<h3>${label}</h3>
					<span class="chat-card-type">${game.i18n.format("COMBAT.Round", { round })}</span>
				</div></header>
				<p>${hint}</p>
			</div>`
		});
	}

	async _resetHate() {
		for (const combatant of this.combatants) {
			const actor = combatant.actor;
			if (actor?.type === "character" && actor.system.infos?.hate) {
				await actor.update({ "system.infos.hate": 0 });
			}
		}
	}
}

/* -------------------------------------------- */
/*  Registration: GM relay, setting, tracker UI  */
/* -------------------------------------------- */

const PLAYER_ACTIONS = {
	nextTurn: "nextTurn",
	previousTurn: "previousTurn",
	standby: "declareStandby"
};

export function registerCombatPhases() {
	game.settings.register("lhtrpg", "announcePhases", {
		name: "LHTRPG.Combat.Setting.AnnouncePhases",
		hint: "LHTRPG.Combat.Setting.AnnouncePhasesHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});

	// Players' turn controls (end turn, Standby) are carried out by the GM
	registerHandler("combatAdvance", async ({ combatId, action }, user) => {
		const combat = game.combats.get(combatId);
		const method = PLAYER_ACTIONS[action];
		if (!combat?.started || !method) return { ok: false };
		if (combat.phase !== "main" || !combat.combatant?.testUserPermission(user, "OWNER")) {
			return { ok: false, error: "LHTRPG.Combat.Notif.NotYourTurn" };
		}
		await combat[method]();
		return { ok: true };
	});

	Hooks.on("renderCombatTracker", _onRenderCombatTracker);
	Hooks.on("getCombatTrackerEntryContext", _addStandbyContextOption);
}

function _onRenderCombatTracker(app, html) {
	const combat = app.viewed;
	const header = html.querySelector(".combat-tracker-header");
	if (!header) return;
	header.querySelector(".lh-phase-bar")?.remove();
	if (!combat || !(combat instanceof LHTrpgCombat)) return;

	_renderPhaseBar(combat, header);
	_renderCombatantStates(combat, html);
}

function _renderPhaseBar(combat, header) {
	const phase = combat.phase;
	const bar = document.createElement("nav");
	bar.className = "lh-phase-bar";
	const steps = phase === "briefing" ? ["briefing"] : PHASES;
	for (const step of steps) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `lh-phase ${step}` + (step === phase ? " active" : "");
		button.textContent = game.i18n.localize(`LHTRPG.Combat.Phase.${step}`);
		button.dataset.tooltip = game.i18n.localize(`LHTRPG.Combat.PhaseHint.${step}`);
		if (step === "main" && phase === "main") {
			const alive = combat.turns.filter(t => !t.isDefeated);
			const done = alive.filter(t => combat.isPostAction(t)).length;
			button.textContent += ` ${done + 1}/${alive.length}`;
		}
		if (game.user.isGM && step !== "briefing") {
			button.addEventListener("click", () => combat.goToPhase(step));
		}
		else button.disabled = step !== phase;
		bar.append(button);
	}
	header.append(bar);
}

/** Pre/Post-Action and Standby marks on each row, plus the Standby button of the active one. */
function _renderCombatantStates(combat, html) {
	if (!combat.started) return;
	const phase = combat.phase;
	for (const li of html.querySelectorAll(".combatant[data-combatant-id]")) {
		const combatant = combat.combatants.get(li.dataset.combatantId);
		if (!combatant) continue;
		li.querySelector(".lh-action-state")?.remove();

		const post = combat.isPostAction(combatant);
		const standby = !post && combat.isOnStandby(combatant);
		const active = phase === "main" && combat.combatant?.id === combatant.id;
		li.classList.toggle("lh-post-action", post);
		li.classList.toggle("lh-standby", standby);

		const state = post ? "post" : (standby ? "standby" : "pre");
		const badge = document.createElement("span");
		badge.className = `lh-action-state ${state}`;
		badge.textContent = game.i18n.localize(`LHTRPG.Combat.ActionState.${state}`);
		badge.dataset.tooltip = game.i18n.localize(`LHTRPG.Combat.ActionStateHint.${state}`);

		const controls = li.querySelector(".combatant-controls");
		if (active && combat.canStandby(combatant) && (game.user.isGM || combatant.isOwner)) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "inline-control combatant-control icon fa-solid fa-hourglass-half lh-standby-button";
			button.dataset.tooltip = game.i18n.localize("LHTRPG.Combat.StandbyHint");
			button.ariaLabel = game.i18n.localize("LHTRPG.Combat.Standby");
			button.addEventListener("click", event => {
				event.stopPropagation();
				combat.declareStandby();
			});
			controls?.prepend(button);
		}
		li.querySelector(".token-name")?.append(badge);
	}
}

function _addStandbyContextOption(app, options) {
	options.unshift({
		name: "LHTRPG.Combat.Standby",
		icon: '<i class="fa-solid fa-hourglass-half"></i>',
		condition: li => {
			const combat = app.viewed;
			const combatant = combat?.combatants.get(li.dataset.combatantId);
			return game.user.isGM && combat instanceof LHTrpgCombat && combat.canStandby(combatant);
		},
		callback: () => app.viewed.declareStandby()
	});
}
