'use strict';

/**
 * scripts/testInterviewEngine.js
 * ==============================
 * Exercises the REAL sessionModel, sessionStore, questionPlanner, and
 * answerEvaluator through interviewEngine.js's two public entry points
 * (startInterview / submitAnswer). Only the external LLM transport is
 * stubbed (via the `completeFn` injection point every layer already
 * supports) so this runs with no LLM_API_KEY and no network access.
 *
 * Run: node scripts/testInterviewEngine.js
 * Exits non-zero on any failed assertion.
 */

const assert = require('assert');
const path = require('path');

const candidateModel = require(path.join('..', 'src', 'models', 'candidateModel'));
const sessionModel = require(path.join('..', 'src', 'core', 'sessionModel'));
const sessionStore = require(path.join('..', 'src', 'core', 'sessionStore'));
const interviewEngine = require(path.join('..', 'src', 'core', 'interviewEngine'));

const { PHASES } = sessionModel;
const { ERROR_CODES } = interviewEngine;

// ---------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } catch (err) {
    failed += 1;
    failures.push({ label, err });
    console.log(`  \u2717 ${label}`);
    console.log(`      ${err.message}`);
  }
}

async function checkAsync(label, fn) {
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

async function expectRejects(promiseFn, code) {
  try {
    await promiseFn();
  } catch (err) {
    assert.strictEqual(err.code, code, `expected error code ${code}, got ${err.code} (${err.message})`);
    return;
  }
  throw new Error(`expected a rejection with code ${code}, but it resolved`);
}

// ---------------------------------------------------------------------
// Stubbed LLM transport
// ---------------------------------------------------------------------
// Every layer (answerEvaluator, questionPlanner) accepts an injectable
// `completeFn` matching llmClient.complete's signature. We branch on the
// system prompt's content to tell a "phrase a question" call apart from
// an "evaluate this answer" call, and drive the evaluator's JSON replies
// from a scripted queue so the planner's evaluation-driven branches
// (FOLLOW_UP / INCREASE_DIFFICULTY / CHANGE_TOPIC / COMPLETE) are all
// exercised deterministically, without a real model in the loop.

/** @type {{score:number, recommendedAction:string}[]} */
const evaluationScript = [
  { score: 2, recommendedAction: 'FOLLOW_UP' }, // answer to Q1 (baseline)
  { score: 5, recommendedAction: 'INCREASE_DIFFICULTY' }, // answer to Q2 (follow-up)
  { score: 4, recommendedAction: 'CHANGE_TOPIC' }, // answer to Q3 (depth)
  { score: 1, recommendedAction: 'CHANGE_TOPIC' }, // answer to Q4 (cross-topic #1)
  { score: 4, recommendedAction: 'CHANGE_TOPIC' }, // answer to Q5 (cross-topic #2)
  { score: 2, recommendedAction: 'CHANGE_TOPIC' }, // answer to Q6 (cross-topic #3)
  { score: 5, recommendedAction: 'CHANGE_TOPIC' }, // answer to Q7 (cross-topic #4)
  { score: 4, recommendedAction: 'CHANGE_TOPIC' }, // answer to Q8 (cross-topic #5) -> should trip completion minimums
  { score: 3, recommendedAction: 'COMPLETE' }, // answer to Q9 (final assessment)
];
let evalCallCount = 0;
let questionCallCount = 0;

function isEvaluationCall(messages) {
  const sys = (messages[0] && messages[0].content) || '';
  return sys.includes('interview evaluator');
}

/** @type {typeof import('../src/llm/llmClient').complete} */
async function stubCompleteFn(messages, _options) {
  if (isEvaluationCall(messages)) {
    const script = evaluationScript[Math.min(evalCallCount, evaluationScript.length - 1)];
    evalCallCount += 1;
    return JSON.stringify({
      score: script.score,
      strengths: script.score >= 4 ? ['Clear, concrete explanation'] : [],
      gaps: script.score <= 2 ? ['Missing key mechanism'] : [],
      evidence: ['Candidate referenced the relevant tool/concept'],
      competencyUpdates: [],
      recommendedAction: script.recommendedAction,
    });
  }
  questionCallCount += 1;
  return `Stub interview question #${questionCallCount} — tell me about your approach here.`;
}

// ---------------------------------------------------------------------
// setPhase call-counting spy (for test #10 — same-phase transitions
// must NOT call setPhase). We wrap the exported function in place; since
// interviewEngine.js accesses it as `sessionModel.setPhase(...)` (a
// property read at call time, not a destructured import), patching the
// shared module.exports object here also affects interviewEngine's calls.
// ---------------------------------------------------------------------

let setPhaseCalls = 0;
const realSetPhase = sessionModel.setPhase;
sessionModel.setPhase = function spySetPhase(...args) {
  setPhaseCalls += 1;
  return realSetPhase.apply(sessionModel, args);
};

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  console.log('\n=== testInterviewEngine.js ===\n');

  const candidates = candidateModel.getAllCandidates();
  assert.ok(candidates.length > 0, 'expected at least one candidate in candidates.json');
  const candidate = candidates[0];
  const sessionId = `test-session-${Date.now()}`;

  // -- 1/2/3: valid candidate can start; session is created; first question generated --
  let startResult;
  await checkAsync('1-3. startInterview() creates a session and returns an opening question', async () => {
    startResult = await interviewEngine.startInterview(
      { sessionId, candidateId: candidate.member.id },
      { completeFn: stubCompleteFn }
    );
    assert.strictEqual(startResult.sessionId, sessionId);
    assert.strictEqual(typeof startResult.question, 'string');
    assert.ok(startResult.question.length > 0);
    assert.strictEqual(startResult.phase, PHASES.BASELINE);
    assert.strictEqual(startResult.questionNumber, 1);
    assert.strictEqual(sessionStore.hasSession(sessionId), true);
  });

  const session = sessionStore.getSession(sessionId);
  check('session state has exactly one recorded question after start', () => {
    assert.strictEqual(session.questions.length, 1);
    assert.strictEqual(session.answers.length, 0);
  });

  // -- Drive the interview to completion, exercising the evaluation-driven
  //    planner branches and the phase-transition rules along the way. --
  const phaseHistory = [session.phase];
  let lastResult = startResult;
  let turns = 0;
  const MAX_TURNS = 20; // safety cap so a planner bug can't infinite-loop the test

  while (!lastResult.completed && turns < MAX_TURNS) {
    turns += 1;
    const answerText = `Turn ${turns} answer: here is my explanation of the topic in detail.`;

    // eslint-disable-next-line no-await-in-loop
    lastResult = await interviewEngine.submitAnswer({ sessionId, answer: answerText }, { completeFn: stubCompleteFn });
    phaseHistory.push(lastResult.phase);
  }

  check('4. an answer can be submitted without throwing', () => {
    assert.ok(turns > 0, 'expected at least one answer turn to run');
  });

  check('5. evaluator ran for every answered question', () => {
    const s = sessionStore.getSession(sessionId);
    assert.strictEqual(s.evaluations.length, turns, `expected ${turns} evaluations, found ${s.evaluations.length}`);
  });

  check('6. evaluations are stored with the scripted score/recommendedAction', () => {
    const s = sessionStore.getSession(sessionId);
    assert.strictEqual(s.evaluations[0].score, evaluationScript[0].score);
    assert.strictEqual(s.evaluations[0].recommendedAction, evaluationScript[0].recommendedAction);
    assert.strictEqual(s.evaluations[1].recommendedAction, 'INCREASE_DIFFICULTY');
  });

  check('7. planner reacted to the FOLLOW_UP evaluation (Q2 is a same-day follow-up)', () => {
    const s = sessionStore.getSession(sessionId);
    const q1 = s.questions[0];
    const q2 = s.questions[1];
    assert.strictEqual(q2.isFollowUp, true);
    assert.strictEqual(q2.day, q1.day);
    assert.strictEqual(q2.phase, PHASES.FOLLOW_UP);
  });

  check('7b. planner reacted to the INCREASE_DIFFICULTY evaluation (Q3 is DEPTH on the same day)', () => {
    const s = sessionStore.getSession(sessionId);
    const q1 = s.questions[0];
    const q3 = s.questions[2];
    assert.strictEqual(q3.phase, PHASES.DEPTH);
    assert.strictEqual(q3.day, q1.day);
  });

  check('8. subsequent questions were generated (multiple distinct question texts recorded)', () => {
    const s = sessionStore.getSession(sessionId);
    assert.ok(s.questions.length >= 8, `expected at least 8 questions asked, found ${s.questions.length}`);
    const distinctTexts = new Set(s.questions.map((q) => q.question));
    assert.ok(distinctTexts.size > 1, 'expected more than one distinct question text');
  });

  check('9. phase transitions occurred across the interview', () => {
    const distinctPhases = new Set(phaseHistory);
    assert.ok(distinctPhases.size >= 4, `expected several distinct phases visited, saw: ${[...distinctPhases].join(', ')}`);
    assert.ok(phaseHistory.includes(PHASES.FOLLOW_UP));
    assert.ok(phaseHistory.includes(PHASES.DEPTH));
    assert.ok(phaseHistory.includes(PHASES.CROSS_TOPIC));
  });

  check('10. same-phase transitions did not call setPhase (spy count < total decision points)', () => {
    const s = sessionStore.getSession(sessionId);
    // One decision point per question asked (start + each answer turn),
    // but consecutive CROSS_TOPIC picks in this scripted run should have
    // skipped several redundant setPhase calls.
    const totalDecisionPoints = s.questions.length; // one per question generated
    assert.ok(
      setPhaseCalls < totalDecisionPoints,
      `expected setPhase to be skipped at least once for same-phase transitions (calls=${setPhaseCalls}, decision points=${totalDecisionPoints})`
    );
    assert.ok(setPhaseCalls >= 3, `expected at least a few real phase transitions to have occurred (calls=${setPhaseCalls})`);
  });

  check('11. interview reached completion', () => {
    assert.strictEqual(lastResult.completed, true, `interview did not complete within ${MAX_TURNS} turns`);
    const s = sessionStore.getSession(sessionId);
    assert.strictEqual(s.done, true);
    assert.strictEqual(s.phase, PHASES.COMPLETE);
    assert.ok(sessionModel.meetsCompletionCriteria(s), 'completion criteria (min questions + min days) must actually be met');
  });

  check('12. final structured feedback was produced and is grounded in real session data', () => {
    assert.ok(lastResult.feedback, 'expected a feedback object on the completed response');
    const { summary, strengths, gaps, nextSteps } = lastResult.feedback;
    assert.strictEqual(typeof summary, 'string');
    assert.ok(summary.length > 0);
    assert.ok(Array.isArray(strengths) && strengths.length > 0);
    assert.ok(Array.isArray(gaps) && gaps.length > 0);
    assert.ok(Array.isArray(nextSteps) && nextSteps.length > 0);
    const s = sessionStore.getSession(sessionId);
    // Grounded, not invented: the candidate's name should show up in the
    // deterministic summary since it's built directly from session data.
    assert.ok(summary.includes(s.candidate.member.name), 'summary should reference the actual candidate name from session data');
  });

  // -- 13. invalid session/candidate handling --
  await checkAsync('13a. starting with an unknown candidateId is rejected with CANDIDATE_NOT_FOUND', async () => {
    await expectRejects(
      () => interviewEngine.startInterview({ sessionId: `bad-cand-${Date.now()}`, candidateId: 'NOPE-DOES-NOT-EXIST' }, { completeFn: stubCompleteFn }),
      ERROR_CODES.CANDIDATE_NOT_FOUND
    );
  });

  await checkAsync('13b. starting without a sessionId is rejected with MISSING_SESSION_ID', async () => {
    await expectRejects(
      () => interviewEngine.startInterview({ candidateId: candidate.member.id }, { completeFn: stubCompleteFn }),
      ERROR_CODES.MISSING_SESSION_ID
    );
  });

  await checkAsync('13c. starting a duplicate sessionId is rejected with SESSION_ALREADY_EXISTS', async () => {
    await expectRejects(
      () => interviewEngine.startInterview({ sessionId, candidateId: candidate.member.id }, { completeFn: stubCompleteFn }),
      ERROR_CODES.SESSION_ALREADY_EXISTS
    );
  });

  await checkAsync('13d. submitAnswer on an unknown sessionId is rejected with SESSION_NOT_FOUND', async () => {
    await expectRejects(
      () => interviewEngine.submitAnswer({ sessionId: 'no-such-session', answer: 'hello' }, { completeFn: stubCompleteFn }),
      ERROR_CODES.SESSION_NOT_FOUND
    );
  });

  await checkAsync('13e. submitAnswer with a missing answer is rejected with MISSING_ANSWER', async () => {
    await expectRejects(
      () => interviewEngine.submitAnswer({ sessionId, answer: '   ' }, { completeFn: stubCompleteFn }),
      ERROR_CODES.MISSING_ANSWER
    );
  });

  await checkAsync('13f. submitAnswer on an already-completed session is rejected with SESSION_COMPLETED', async () => {
    await expectRejects(
      () => interviewEngine.submitAnswer({ sessionId, answer: 'one more answer' }, { completeFn: stubCompleteFn }),
      ERROR_CODES.SESSION_COMPLETED
    );
  });

  await checkAsync('13g. starting without candidateId/candidate is rejected with INVALID_CANDIDATE', async () => {
    await expectRejects(
      () => interviewEngine.startInterview({ sessionId: `no-cand-${Date.now()}` }, { completeFn: stubCompleteFn }),
      ERROR_CODES.INVALID_CANDIDATE
    );
  });

  // -- bonus: a second, independent session works concurrently (Map-based store) --
  await checkAsync('bonus. a second independent session can start concurrently', async () => {
    const otherCandidate = candidates[1] || candidates[0];
    const sessionId2 = `test-session-2-${Date.now()}`;
    const res2 = await interviewEngine.startInterview(
      { sessionId: sessionId2, candidateId: otherCandidate.member.id },
      { completeFn: stubCompleteFn }
    );
    assert.strictEqual(res2.sessionId, sessionId2);
    assert.notStrictEqual(res2.sessionId, sessionId);
    assert.strictEqual(sessionStore.sessionCount() >= 2, true);
  });

  // -- restore the spy before printing results --
  sessionModel.setPhase = realSetPhase;

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed (${turns} answer turns to complete the scripted interview) ---\n`);

  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.label}: ${f.err.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nFATAL — testInterviewEngine.js crashed:', err);
  process.exitCode = 1;
});
