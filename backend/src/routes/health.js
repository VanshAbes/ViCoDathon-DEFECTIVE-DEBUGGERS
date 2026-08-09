'use strict';

/**
 * GET /health — deployment/debugging liveness check only. No auth, no
 * dependency checks (no DB to ping) — just confirms the process is up.
 */

function handleHealthRequest() {
  return { status: 200, body: { status: 'ok' } };
}

module.exports = { handleHealthRequest };
