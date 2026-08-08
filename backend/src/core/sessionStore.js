'use strict';

/**
 * In-memory session store.
 *
 * Per ARCHITECTURE.md §1/§4: a single `Map<sessionId, SessionState>` held
 * in process RAM. No Redis, no Postgres, no persistence — if the process
 * restarts mid-interview the session is lost, which is an accepted
 * tradeoff for a 48h hackathon demo.
 *
 * This module only owns storage (get/set/delete/has). It knows nothing
 * about interview phases, questions, or scoring — that logic lives in
 * `sessionModel.js`. Keeping the two separate means the storage mechanism
 * (Map today) could be swapped later without touching interview logic.
 */

/** @typedef {import('./sessionModel').SessionState} SessionState */

/** @type {Map<string, SessionState>} */
const sessions = new Map();

/**
 * @param {string} sessionId
 * @returns {boolean}
 */
function hasSession(sessionId) {
  return sessions.has(sessionId);
}

/**
 * @param {string} sessionId
 * @returns {SessionState|undefined}
 */
function getSession(sessionId) {
  return sessions.get(sessionId);
}

/**
 * Stores (creates or overwrites) a session under its own sessionId.
 * @param {SessionState} session
 * @returns {SessionState}
 */
function saveSession(session) {
  if (!session || !session.sessionId) {
    throw new Error('saveSession: session must have a sessionId');
  }
  sessions.set(session.sessionId, session);
  return session;
}

/**
 * @param {string} sessionId
 * @returns {boolean} true if a session was deleted
 */
function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

/**
 * @returns {number} count of live sessions (useful for /health or debugging)
 */
function sessionCount() {
  return sessions.size;
}

/**
 * Exposed for tests only — clears all in-memory sessions.
 */
function _resetForTests() {
  sessions.clear();
}

module.exports = {
  hasSession,
  getSession,
  saveSession,
  deleteSession,
  sessionCount,
  _resetForTests,
};
