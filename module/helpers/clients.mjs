/**
 * Browser windows ("clients") of the same user.
 *
 * A user can be logged in from several windows at once (e.g. a GM with a second screen). Foundry's
 * `userId` and `game.users.activeGM.isSelf` can't tell those windows apart, so work meant to run once
 * would run in each of them. This module gives every window an id and:
 * - `isLocalChange(options, userId)`: whether a document change was made from THIS window (every
 *   create / update / delete made here carries `options.lhOrigin`).
 * - `isPrimaryGM()`: whether this window is the one that does the active GM's work (socket requests,
 *   expiries, migrations): among the active GM's open windows, the one with the lowest id.
 */

export const CLIENT_ID = foundry.utils.randomID();

const SOCKET = "system.lhtrpg";
const SCOPE = "clients";
const HEARTBEAT = 5000;
const TIMEOUT = 12000;
/** Time to hear from the other windows of the user after this one connects. */
const DISCOVERY = 600;

/** Other windows of this user: clientId -> last time heard from. */
const peers = new Map();
let discovered = null;

/** Documents whose changes carry the id of the window that made them. */
const ORIGIN_DOCUMENTS = ["Actor", "Item", "ActiveEffect", "Combat", "Combatant", "Token", "ChatMessage", "Scene"];

/** Call during the `init` hook. */
export function registerClients() {
  const stamp = options => { if (options && !options.lhOrigin) options.lhOrigin = CLIENT_ID; };
  for (const name of ORIGIN_DOCUMENTS) {
    Hooks.on(`preCreate${name}`, (doc, data, options) => stamp(options));
    Hooks.on(`preUpdate${name}`, (doc, changes, options) => stamp(options));
    Hooks.on(`preDelete${name}`, (doc, options) => stamp(options));
  }

  Hooks.once("ready", () => {
    game.socket.on(SOCKET, _onMessage);
    _emit("hello");
    setInterval(() => {
      _emit("here");
      const now = Date.now();
      for (const [id, seen] of peers) if (now - seen > TIMEOUT) peers.delete(id);
    }, HEARTBEAT);
    // A window that closes without saying so is dropped after TIMEOUT.
    window.addEventListener("pagehide", () => _emit("bye"));
    discovered = new Promise(resolve => setTimeout(resolve, DISCOVERY));
  });
}

function _emit(type) {
  game.socket.emit(SOCKET, { scope: SCOPE, type, clientId: CLIENT_ID, userId: game.user.id });
}

function _onMessage(message) {
  if ((message?.scope !== SCOPE) || (message.userId !== game.user.id) || (message.clientId === CLIENT_ID)) return;
  if (message.type === "bye") return peers.delete(message.clientId);
  const known = peers.has(message.clientId);
  peers.set(message.clientId, Date.now());
  // A new window: tell it this one exists.
  if ((message.type === "hello") && !known) _emit("here");
}

/**
 * Whether a document change was made from this window. Changes that don't carry the window id
 * (made before this module stamps them) fall back to the user.
 * @param {object} options   Options of the create / update / delete
 * @param {string} userId
 * @returns {boolean}
 */
export function isLocalChange(options, userId) {
  if (options?.lhOrigin) return options.lhOrigin === CLIENT_ID;
  return userId === game.user.id;
}

/** Whether this is the lowest-id open window of this user. */
export function isPrimaryClient() {
  const now = Date.now();
  for (const [id, seen] of peers) {
    if ((now - seen <= TIMEOUT) && (id < CLIENT_ID)) return false;
  }
  return true;
}

/** Whether this window does the active GM's work. */
export function isPrimaryGM() {
  return !!game.users?.activeGM?.isSelf && isPrimaryClient();
}

/** Resolves once this window had time to hear from the other windows of the user. */
export function clientsDiscovered() {
  return discovered ?? Promise.resolve();
}
