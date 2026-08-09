'use strict';

/**
 * scripts/testApi.js
 * ==============================
 * Smoke-tests the actual HTTP layer (src/server.js) end to end: real
 * sessionModel/sessionStore/questionPlanner/answerEvaluator/
 * interviewEngine, real Node `http` server, real JSON over the wire.
 *
 * The only thing stubbed is the LLM provider itself, and it's stubbed
 * the same way llmClient.js already supports swapping providers in
 * production: via env vars, not code changes. We point LLM_PROVIDER at
 * "openai-compatible" and LLM_BASE_URL at a tiny local HTTP server this
 * script spins up, which speaks just enough of the OpenAI chat/completions
 * shape to answer both "phrase a question" and "evaluate this answer"
 * calls. No LLM_API_KEY, no network access, no real model needed.
 *
 * Run: node scripts/testApi.js
 * Exits non-zero on any failed assertion.
 */

const assert = require('assert');
const http = require('http');
const path = require('path');

// ---------------------------------------------------------------------
// 1. Start a stub LLM server BEFORE pointing env vars at it.
// ---------------------------------------------------------------------

function isEvaluationCall(messages) {
  const sys = (messages && messages[0] && messages[0].content) || '';
  return sys.includes('interview evaluator');
}

const stubLlmServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
    } catch (_err) {
      parsed = {};
    }
    const messages = parsed.messages || [];

    let content;
    if (isEvaluationCall(messages)) {
      content = JSON.stringify({
        score: 3,
        strengths: ['Reasonable explanation'],
        gaps: [],
        evidence: ['Mentioned the relevant concept'],
        competencyUpdates: [],
        recommendedAction: 'FOLLOW_UP',
      });
    } else {
      content = 'Stub question: can you walk me through your approach to this topic?';
    }

    const payload = JSON.stringify({ choices: [{ message: { content } }] });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  });
});

// ---------------------------------------------------------------------
// Tiny test harness (mirrors scripts/testInterviewEngine.js)
// ---------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function check(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } catch (err) {
    failed += 1;
    failures.push({ label, err });
    console.log(`  \u2717 ${label}`);
    console.log(`      ${err.message}`);
  }
}

/**
 * Sends a raw HTTP request to the running test server using fetch
 * (Node 18+ global). `rawBody`, when provided, is sent as-is (a string)
 * so we can deliberately send malformed JSON; otherwise `jsonBody` is
 * JSON.stringify'd.
 */
async function request(baseUrl, method, urlPath, { jsonBody, rawBody } = {}) {
  const init = { method, headers: {} };
  if (rawBody !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = rawBody;
  } else if (jsonBody !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(jsonBody);
  }
  const res = await fetch(`${baseUrl}${urlPath}`, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_err) {
    body = null;
  }
  return { status: res.status, body };
}

async function main() {
  console.log('\n=== testApi.js ===\n');

  await new Promise((resolve) => stubLlmServer.listen(0, resolve));
  const stubLlmPort = stubLlmServer.address().port;

  // Point the (frozen, unmodified) llmClient at our local stub — this is
  // exactly the env-var-driven provider swap the codebase already
  // supports, not a code change.
  process.env.LLM_PROVIDER = 'openai-compatible';
  process.env.LLM_BASE_URL = `http://127.0.0.1:${stubLlmPort}`;
  process.env.LLM_MODEL = 'stub-model';
  delete process.env.LLM_API_KEY; // openai-compatible + LLM_BASE_URL doesn't require one

  // Require the server AFTER env vars are set (llmClient reads env vars
  // at call time inside its functions, so this ordering isn't strictly
  // required — but keeping it this way avoids any doubt).
  const { createServer } = require(path.join('..', 'src', 'server'));
  const candidateModel = require(path.join('..', 'src', 'models', 'candidateModel'));

  const appServer = createServer();
  await new Promise((resolve) => appServer.listen(0, resolve));
  const appPort = appServer.address().port;
  const baseUrl = `http://127.0.0.1:${appPort}`;

  const candidates = candidateModel.getAllCandidates();
  const candidate = candidates[0];
  const sessionId = `api-test-session-${Date.now()}`;

  // -- 1. GET /health --
  await check('1. GET /health returns { status: "ok" }', async () => {
    const { status, body } = await request(baseUrl, 'GET', '/health');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { status: 'ok' });
  });

  // -- 2. malformed POST request (invalid JSON body) --
  await check('2. malformed JSON body on POST /api/interview returns 400', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', { rawBody: '{ this is not valid json' });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error.code, 'MALFORMED_JSON');
  });

  await check('2b. a well-formed JSON body with neither candidate nor message returns 400', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', { jsonBody: { sessionId } });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error.code, 'MALFORMED_REQUEST');
  });

  // -- 3. valid interview start --
  let startBody;
  await check('3. valid interview start returns 200 with sessionId/question/phase', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', {
      jsonBody: { sessionId, candidateId: candidate.member.id },
    });
    assert.strictEqual(status, 200);
    startBody = body;
    assert.strictEqual(body.sessionId, sessionId);
    assert.strictEqual(typeof body.question, 'string');
    assert.ok(body.question.length > 0);
    assert.strictEqual(typeof body.phase, 'string');
    assert.strictEqual(body.questionNumber, 1);
    assert.strictEqual(body.done, false);
    assert.strictEqual(body.completed, false);
  });

  check('3b. start response also satisfies technical-spec.md\'s literal { reply, done } contract', () => {
    assert.strictEqual(typeof startBody.reply, 'string');
    assert.strictEqual(startBody.reply, startBody.question);
    assert.strictEqual(startBody.done, false);
  });

  // -- 4. answer submission --
  let turnBody;
  await check('4. answer submission returns 200 with the next question', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', {
      jsonBody: { sessionId, message: 'Here is my detailed answer to that question.' },
    });
    assert.strictEqual(status, 200);
    turnBody = body;
    assert.strictEqual(body.sessionId, sessionId);
    assert.strictEqual(body.completed, false);
    assert.strictEqual(typeof body.question, 'string');
    assert.strictEqual(body.questionNumber, 2);
  });

  // -- 5. JSON response structure --
  check('5. turn response contains every field required by both the brief and technical-spec.md', () => {
    const requiredKeys = ['sessionId', 'reply', 'done', 'completed', 'question', 'phase', 'questionNumber'];
    for (const key of requiredKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(turnBody, key), `missing key "${key}" in turn response`);
    }
  });

  // -- 6. error handling --
  await check('6a. submitting an answer for an unknown session returns 404 SESSION_NOT_FOUND', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', {
      jsonBody: { sessionId: 'does-not-exist', message: 'hello' },
    });
    assert.strictEqual(status, 404);
    assert.strictEqual(body.error.code, 'SESSION_NOT_FOUND');
  });

  await check('6b. starting without a sessionId returns 400 MISSING_SESSION_ID', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', {
      jsonBody: { candidateId: candidate.member.id },
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error.code, 'MISSING_SESSION_ID');
  });

  await check('6c. starting with an unknown candidateId returns 404 CANDIDATE_NOT_FOUND', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', {
      jsonBody: { sessionId: `unknown-cand-${Date.now()}`, candidateId: 'NOPE-NOT-REAL' },
    });
    assert.strictEqual(status, 404);
    assert.strictEqual(body.error.code, 'CANDIDATE_NOT_FOUND');
  });

  await check('6d. starting a duplicate sessionId returns 409 SESSION_ALREADY_EXISTS', async () => {
    const { status, body } = await request(baseUrl, 'POST', '/api/interview', {
      jsonBody: { sessionId, candidateId: candidate.member.id },
    });
    assert.strictEqual(status, 409);
    assert.strictEqual(body.error.code, 'SESSION_ALREADY_EXISTS');
  });

  await check('6e. GET on an unknown route returns 404 NOT_FOUND', async () => {
    const { status, body } = await request(baseUrl, 'GET', '/does-not-exist');
    assert.strictEqual(status, 404);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
  });

  await check('6f. CORS header reflects FRONTEND_ORIGIN (or "*" by default)', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const header = res.headers.get('access-control-allow-origin');
    assert.strictEqual(header, process.env.FRONTEND_ORIGIN || '*');
  });

  await new Promise((resolve) => appServer.close(resolve));
  await new Promise((resolve) => stubLlmServer.close(resolve));

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---\n`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.label}: ${f.err.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nFATAL — testApi.js crashed:', err);
  process.exitCode = 1;
});
