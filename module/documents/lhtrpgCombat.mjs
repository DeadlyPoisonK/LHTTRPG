import { registerHandler, request } from "../piles/pile-socket.mjs";

/**
 * Log Horizon Round Progression:
 *   Briefing (combat created, not started)
 *   → Setup → Initiative/Main (one turn per combatant) → Cleanup → next round's Setup
 *
 * Setup and Cleanup are "no-one's turn" states (turn = null); the current phase is
 * stored in flags.lhtrpg.phase. Players can only change round/turn, so when ending
 * their turn requires a phase change the active GM performs it (combatAdvance).
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

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		// Phase known before the next update, to detect phase changes in _onUpdate
		this._lhPhaseState ??= { round: this.round, phase: this.phase };
	}

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

	/**
	 * @override
	 * Leave the Briefing and begin round 1 at its Setup Process.
	 */
	async startCombat() {
		await this._refreshInitiative();
		await this._resetHate();

		this._playCombatSound("startEncounter");
		const updateData = { round: 1, turn: null, "flags.lhtrpg.phase": "setup" };
		Hooks.callAll("combatStart", this, updateData);
		await this.update(updateData);
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
					await this.delete();
				}
			},
			modal: true
		});
		return this;
	}

	/**
	 * @override
	 * Setup → first turn → … → last turn → Cleanup → next round.
	 */
	async nextTurn() {
		if (this.round === 0) return this.startCombat();
		if (!game.user.isGM && this._needsGM(1)) return this._requestGM("nextTurn");

		switch (this.phase) {
			case "setup": {
				const turn = this._findTurn(0, 1);
				if (turn === null) return this._setPhase("cleanup");
				return this._setPhase("main", turn);
			}
			case "main": {
				const turn = this._findTurn((this.turn ?? -1) + 1, 1);
				if (turn === null) return this._setPhase("cleanup");
				return this._setPhase("main", turn);
			}
			default:
				return this.nextRound();
		}
	}

	/** @override */
	async previousTurn() {
		if (this.round === 0) return this;
		if (!game.user.isGM && this._needsGM(-1)) return this._requestGM("previousTurn");

		switch (this.phase) {
			case "cleanup": {
				const turn = this._findTurn(this.turns.length - 1, -1);
				if (turn === null) return this._setPhase("setup");
				return this._setPhase("main", turn);
			}
			case "main": {
				const turn = this._findTurn((this.turn ?? this.turns.length) - 1, -1);
				if (turn === null) return this._setPhase("setup");
				return this._setPhase("main", turn);
			}
			default:
				return this.previousRound();
		}
	}

	/**
	 * @override
	 * Advance to the Setup Process of the next round (initiative is recalculated).
	 */
	async nextRound() {
		if (!game.user.isGM) return this._requestGM("nextRound");
		await this._refreshInitiative();

		const updateData = { round: this.round + 1, turn: null, "flags.lhtrpg.phase": "setup" };
		const updateOptions = { direction: 1, worldTime: { delta: CONFIG.time.roundTime } };
		Hooks.callAll("combatRound", this, updateData, updateOptions);
		await this.update(updateData, updateOptions);
		return this;
	}

	/**
	 * @override
	 * Go back to the Cleanup Process of the previous round.
	 */
	async previousRound() {
		if (this.round <= 1) return this.phase === "setup" ? this : this._setPhase("setup");
		if (!game.user.isGM) return this._requestGM("previousRound");
		await this._refreshInitiative();

		const updateData = { round: this.round - 1, turn: null, "flags.lhtrpg.phase": "cleanup" };
		const updateOptions = { direction: -1, worldTime: { delta: -CONFIG.time.roundTime } };
		Hooks.callAll("combatRound", this, updateData, updateOptions);
		await this.update(updateData, updateOptions);
		return this;
	}

	/**
	 * Jump to a phase of the current round (GM, from the tracker's phase bar).
	 * @param {"setup"|"main"|"cleanup"} phase
	 */
	async goToPhase(phase) {
		if (!this.started || !PHASES.includes(phase) || phase === this.phase) return this;
		if (phase !== "main") return this._setPhase(phase);
		const turn = this._findTurn(0, 1);
		return turn === null ? this : this._setPhase("main", turn);
	}

	/**
	 * First non-defeated turn index starting at `from`, stepping by `dir`.
	 * @returns {number|null}
	 */
	_findTurn(from, dir) {
		const skip = this.settings.skipDefeated;
		for (let i = from; i >= 0 && i < this.turns.length; i += dir) {
			if (!skip || !this.turns[i].isDefeated) return i;
		}
		return null;
	}

	async _setPhase(phase, turn = null) {
		const updateData = { round: this.round, turn };
		// Players may only change round/turn: within the Main Process the flag is already "main"
		if (this.getFlag("lhtrpg", "phase") !== phase) updateData["flags.lhtrpg.phase"] = phase;
		const updateOptions = { direction: 1 };
		Hooks.callAll("combatTurn", this, updateData, updateOptions);
		await this.update(updateData, updateOptions);
		return this;
	}

	/** Would stepping in `dir` leave the Main Process (or change the round)? */
	_needsGM(dir) {
		if (this.phase !== "main") return true;
		return this._findTurn((this.turn ?? 0) + dir, dir) === null;
	}

	async _requestGM(action) {
		const result = await request("combatAdvance", { combatId: this.id, action });
		if (!result?.ok && result?.error) ui.notifications.warn(game.i18n.localize(result.error));
		return this;
	}

	/** @override */
	_onUpdate(changed, options, userId) {
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
		// Phase changes are always made by a GM client (players go through combatAdvance),
		// so only the one that made the update runs it: never twice, even with several GMs.
		if (userId === game.user.id) this._onPhaseStart(after.phase, after.round, before);
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

export function registerCombatPhases() {
	game.settings.register("lhtrpg", "announcePhases", {
		name: "LHTRPG.Combat.Setting.AnnouncePhases",
		hint: "LHTRPG.Combat.Setting.AnnouncePhasesHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});

	// Players ending their turn when that changes the phase (last turn → Cleanup)
	registerHandler("combatAdvance", async ({ combatId, action }, user) => {
		const combat = game.combats.get(combatId);
		if (!combat?.started) return { ok: false };
		const allowed = action === "nextTurn" || action === "previousTurn";
		if (!allowed || !combat.combatant?.testUserPermission(user, "OWNER")) {
			return { ok: false, error: "LHTRPG.Combat.Notif.NotYourTurn" };
		}
		await combat[action]();
		return { ok: true };
	});

	Hooks.on("renderCombatTracker", _onRenderCombatTracker);
}

function _onRenderCombatTracker(app, html) {
	const combat = app.viewed;
	const header = html.querySelector(".combat-tracker-header");
	if (!header) return;
	header.querySelector(".lh-phase-bar")?.remove();
	if (!combat || !(combat instanceof LHTrpgCombat)) return;

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
			const idx = combat.turns.filter(t => !t.isDefeated).indexOf(combat.combatant) + 1;
			const total = combat.turns.filter(t => !t.isDefeated).length;
			if (idx > 0) button.textContent += ` ${idx}/${total}`;
		}
		if (game.user.isGM && step !== "briefing") {
			button.addEventListener("click", () => combat.goToPhase(step));
		}
		else button.disabled = step !== phase;
		bar.append(button);
	}
	header.append(bar);
}
