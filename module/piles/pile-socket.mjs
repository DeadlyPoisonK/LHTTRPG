/**
 * Request/response layer that lets players ask the active GM to perform pile
 * operations on documents they do not own (taking loot, buying, giving items
 * to another player...). The GM validates every request before executing it.
 */

const SOCKET = "system.lhtrpg";
const SCOPE = "piles";
const TIMEOUT = 15000;

const handlers = {};
const pending = new Map();

// Requests are executed one after another on the GM client, so two players
// grabbing the same item at once can't duplicate it.
let queue = Promise.resolve();

/**
 * Register a GM-side handler.
 * @param {string} action
 * @param {(payload: object, user: User) => Promise<object>} fn
 */
export function registerHandler(action, fn) {
  handlers[action] = fn;
}

export function initSocket() {
  game.socket.on(SOCKET, _onMessage);
}

/**
 * Execute an action on the active GM client and wait for its result.
 * @param {string} action
 * @param {object} payload
 * @returns {Promise<{ok: boolean, error?: string, errorData?: object, warnings?: object[]}>}
 */
export async function request(action, payload = {}) {
  const gm = game.users.activeGM;
  if (!gm) return { ok: false, error: "LHTRPG.Piles.Error.NoGM" };
  if (gm.isSelf) return _enqueue(action, payload, game.user.id);

  const id = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: "LHTRPG.Piles.Error.Timeout" });
    }, TIMEOUT);
    pending.set(id, result => {
      clearTimeout(timer);
      resolve(result);
    });
    game.socket.emit(SOCKET, { scope: SCOPE, type: "request", id, action, payload, userId: game.user.id });
  });
}

function _enqueue(action, payload, userId) {
  const run = queue.then(() => _execute(action, payload, userId));
  queue = run.catch(() => null);
  return run;
}

async function _execute(action, payload, userId) {
  const handler = handlers[action];
  const user = game.users.get(userId);
  if (!handler || !user) return { ok: false, error: "LHTRPG.Piles.Error.Generic" };
  try {
    return (await handler(payload, user)) ?? { ok: true };
  } catch (err) {
    console.error(`Log Horizon TRPG | Pile action "${action}" failed`, err);
    return { ok: false, error: "LHTRPG.Piles.Error.Generic" };
  }
}

async function _onMessage(message) {
  if (message?.scope !== SCOPE) return;

  if (message.type === "request") {
    if (!game.users.activeGM?.isSelf) return;
    const result = await _enqueue(message.action, message.payload, message.userId);
    game.socket.emit(SOCKET, { scope: SCOPE, type: "response", id: message.id, userId: message.userId, result });
  }
  else if (message.type === "response") {
    if (message.userId !== game.user.id) return;
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
  }
}
