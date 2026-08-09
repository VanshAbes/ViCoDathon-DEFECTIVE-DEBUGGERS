'use strict';

/**
 * HTTP server bootstrap (ARCHITECTURE.md §3: server.js).
 *
 * Built on Node's built-in `http` module only — no Express/cors/dotenv
 * dependency required, so `npm install` has nothing to fetch and this
 * is fully runnable/testable offline. Routing, JSON body parsing, CORS
 * headers, and .env loading are all handled directly below (each is a
 * handful of lines — not worth a dependency for a 48h hackathon).
 *
 * Exports createServer() (an http.Server NOT yet listening) so
 * scripts/testApi.js can bind it to an ephemeral port. Running this
 * file directly (`npm start` / `node src/server.js`) boots and listens
 * on PORT.
 *
 * No auth, no DB, no websockets — matches ARCHITECTURE.md §8 exactly.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { handleHealthRequest } = require('./routes/health');
const { handleInterviewRequest } = require('./routes/interview');

// ---------------------------------------------------------------------
// Minimal .env loader (no `dotenv` dependency). Only fills in vars that
// aren't already set in the real environment, so real deployment env
// vars always win over a stray local .env file.
// ---------------------------------------------------------------------
function loadDotEnvIfPresent() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvIfPresent();

const MAX_BODY_BYTES = 1024 * 1024; // 1MB — plenty for a candidate record + one answer

/**
 * Reads and JSON-parses a request body, with a size cap so a malicious
 * or broken client can't stream unbounded data into memory.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ ok: true, body: any } | { ok: false }>}
 */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let received = 0;
    const chunks = [];
    let tooLarge = false;

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) return resolve({ ok: false });
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) return resolve({ ok: true, body: {} }); // empty body is not a parse error
      try {
        resolve({ ok: true, body: JSON.parse(raw) });
      } catch (_err) {
        resolve({ ok: false });
      }
    });

    req.on('error', () => resolve({ ok: false }));
  });
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Applies CORS headers so the already-built frontend can call this API.
 * FRONTEND_ORIGIN is env-var driven per the "no hardcoded config"
 * pattern the rest of this backend already uses (see llm/llmClient.js);
 * falls back to "*" for local hackathon development when it's not set.
 * @param {import('http').ServerResponse} res
 */
function applyCors(res) {
  const origin = process.env.FRONTEND_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Builds (but does not start listening on) the HTTP server.
 * @returns {import('http').Server}
 */
function createServer() {
  return http.createServer(async (req, res) => {
    applyCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      const { status, body } = handleHealthRequest();
      return sendJson(res, status, body);
    }

    if (req.method === 'POST' && url.pathname === '/api/interview') {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) {
        return sendJson(res, 400, { error: { code: 'MALFORMED_JSON', message: 'Request body must be valid JSON.' } });
      }
      try {
        const { status, body } = await handleInterviewRequest(parsed.body);
        return sendJson(res, status, body);
      } catch (err) {
        // Should be unreachable — handleInterviewRequest already catches
        // its own errors — but never let an unexpected throw crash the
        // whole process or leak internals to the client.
        // eslint-disable-next-line no-console
        console.error('Unhandled error in POST /api/interview:', err);
        return sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
      }
    }

    return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${url.pathname}.` } });
  });
}

if (require.main === module) {
  const server = createServer();
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`AI Interview Agent backend listening on port ${port}`);
  });
}

module.exports = { createServer };
