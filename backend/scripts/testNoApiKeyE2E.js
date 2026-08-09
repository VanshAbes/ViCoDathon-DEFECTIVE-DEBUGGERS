'use strict';

/**
 * scripts/testNoApiKeyE2E.js
 * ==============================
 * End-to-end, NO-API-KEY test of the REAL HTTP backend.
 *
 * This deliberately does NOT set LLM_API_KEY, does NOT point at a stub
 * LLM, and does NOT inject any completeFn. It boots the real
 * src/server.js on an ephemeral port and drives a complete interview
 * purely over HTTP using POST /api/interview. The answer evaluator must
 * fall back to the deterministic local evaluator (added for exactly this
 * no-key environment) so the whole flow works without any external LLM.
 *
 * Run: node scripts/testNoApiKeyE2E.js
 * Exits non-zero on any failed assertion.
 */

const assert = require('assert');
const path = require('path');

// Crucially: do NOT set LLM_PROVIDER / LLM_API_KEY / LLM_BASE_URL.
// Ensure none leak from the environment so we truly exercise the
// no-LLM fallback path.
delete process.env.LLM_API_KEY;
delete process.env.LLM_PROVIDER;
delete process.env.LLM_BASE_URL;
delete process.env.LLM_MODEL;

const { createServer } = require(path.join('..', 'src', 'server'));
const candidateModel = require(path.join('..', 'src', 'models', 'candidateModel'));

let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, extra) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

async function main() {
  console.log('\n=== testNoApiKeyE2E.js (no LLM_API_KEY) ===\n');

  const appServer = createServer();
  await new Promise((resolve) => appServer.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${appServer.address().port}`;

  const candidates = candidateModel.getAllCandidates();
  const candidate = candidates[0]; // Sarah Johnson, Senior Data Engineer
  const sessionId = `no-api-key-e2e-${Date.now()}`;

  async function post(body) {
    const res = await fetch(`${baseUrl}/api/interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    return { status: res.status, body: parsed };
  }

  // ---------- 1. Start ----------
  const start = await post({ sessionId, candidateId: candidate.member.id });
  check('1. start returns 200 (not 502)', start.status === 200, `status=${start.status}`);
  check('1b. start returns a question + questionNumber=1', start.body.questionNumber === 1 && typeof start.body.question === 'string' && start.body.question.length > 0, JSON.stringify(start.body));
  check('1c. start response has sessionId', start.body.sessionId === sessionId);

  // ---------- 2. Drive the interview to completion with varied answers ----------
  // A rotating set of realistic answers. Some are strong/technical
  // (concept-rich, multi-sentence), some brief, so the deterministic
  // evaluator's score meaningfully varies and the planner adapts.
  const answers = [
    'I built a retrieval pipeline using vector embeddings stored in Chroma with semantic search and re-ranking to improve matching quality.',
    'Yes I can do that.',
    'I would use a vector database like ChromaDB to store embeddings and query them with similarity search, then merge results with SQL for structured data and deduplicate before returning.',
    'Hmm, not really sure about that one.',
    'Embeddings convert text into vectors. I generate them with a sentence transformer, store them in a vector DB, and retrieve the most similar chunks by cosine similarity to ground the answer.',
    'I would set up observability with logging and monitoring, track latency and failures, and add guardrails and input validation for security.',
    'I would secure the API with authentication, validate inputs, protect sensitive data, implement prompt injection safeguards, and test common security scenarios.',
    'I would containerize the app with Docker and deploy to Kubernetes, configure health checks and environment variables, and verify the deployed chatbot works.',
  ];

  let lastResult = start.body;
  let turn = 0;
  const MAX_TURNS = 15;
  const phases = [];
  const days = new Set();
  const statuses = [];

  while (!lastResult.completed && turn < MAX_TURNS) {
    const answer = answers[turn % answers.length];
    const res = await post({ sessionId, message: answer });
    statuses.push(res.status);
    check(`turn ${turn + 1} returns 200 (not 502)`, res.status === 200, `status=${res.status} body=${JSON.stringify(res.body)}`);
    if (res.status !== 200) break;
    lastResult = res.body;
    phases.push(lastResult.phase);
    if (typeof lastResult.questionNumber === 'number') {
      // no-op, questionNumber tracked below via session final state
    }
    turn += 1;
  }

  // ---------- 3. Verify completion + requirements ----------
  check('3. interview reached completion', lastResult.completed === true, JSON.stringify(lastResult));
  check('3b. at least 8 questions were asked', (lastResult.questionNumber || 0) >= 8, `questionNumber=${lastResult.questionNumber}`);
  check('3c. structured feedback was produced', Boolean(lastResult.feedback && typeof lastResult.feedback.summary === 'string' && Array.isArray(lastResult.feedback.strengths) && Array.isArray(lastResult.feedback.gaps) && Array.isArray(lastResult.feedback.nextSteps)), JSON.stringify(lastResult.feedback));
  check('3d. feedback has non-empty strengths/gaps/next', lastResult.feedback && lastResult.feedback.strengths.length > 0 && lastResult.feedback.gaps.length > 0 && lastResult.feedback.nextSteps.length > 0);
  check('3e. feedback summary references the candidate name', lastResult.feedback && lastResult.feedback.summary.includes(candidate.member.name), lastResult.feedback && lastResult.feedback.summary);

  // ---------- 4. Days covered ----------
  // Fetch the live session to count distinct days covered.
  const store = require(path.join('..', 'src', 'core', 'sessionStore'));
  const session = store.getSession(sessionId);
  if (session) {
    check('4. at least 4 distinct curriculum days covered', session.daysCovered.size >= 4, `days=${[...session.daysCovered]}`);
    check('4b. exactly one completion recorded', session.done === true);
  } else {
    check('4. at least 4 distinct curriculum days covered', false, 'session not found');
  }

  // ---------- 5. Adaptive follow-ups ----------
  // The deterministic evaluator should have produced at least one
  // non-trivial spread of scores and the planner should have moved among
  // multiple phases (BASELINE, PROBE, FOLLOW_UP, CROSS_TOPIC, DEPTH...).
  const distinctPhases = new Set(phases);
  check('5. multiple phases were visited (adaptive flow)', distinctPhases.size >= 3, `phases=${[...distinctPhases].join(', ')}`);

  // ---------- 6. Deterministic evaluator distinguishes answers ----------
  // Confirm the evaluator produced genuinely different scores (not a
  // constant) by inspecting the session's recorded evaluations.
  if (session) {
    const scores = session.evaluations.map((e) => e.score);
    const distinctScores = new Set(scores);
    check('6. recorded evaluations have a spread of scores (not constant)', distinctScores.size >= 2, `scores=${scores.join(',')}`);
    check('6b. every recorded evaluation has a valid recommendedAction', session.evaluations.every((e) => ['FOLLOW_UP', 'CLARIFY', 'INCREASE_DIFFICULTY', 'CHANGE_TOPIC', 'CROSS_CONNECT', 'COMPLETE'].includes(e.recommendedAction)));
  }

  // ---------- 7. No 502s anywhere ----------
  check('7. zero 502 responses across the whole interview', !statuses.includes(502), `statuses=${statuses.join(',')}`);

  await new Promise((resolve) => appServer.close(resolve));

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed (${turn} answer turns) ---\n`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('✓ No-API-key end-to-end interview completed successfully.');
  }
}

main().catch((err) => {
  console.error('\nFATAL — testNoApiKeyE2E.js crashed:', err);
  process.exitCode = 1;
});
