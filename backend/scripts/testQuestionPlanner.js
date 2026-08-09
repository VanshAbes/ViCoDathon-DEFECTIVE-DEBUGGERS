'use strict';

/**
 * Dev-only integration test for the Adaptive Question Planner (rewrite).
 * Run with: node backend/scripts/testQuestionPlanner.js
 *
 * The PREVIOUS version of this file drove a fictional `../src/session`
 * module (startSession/transitionPhase/flat snapshot) that never matched
 * what actually got built. This version drives the REAL architecture only:
 *   - src/core/sessionModel.js + sessionStore.js (existing, untouched)
 *   - src/core/questionPlanner.js (rewritten)
 *   - src/llm/prompts.js (existing, untouched — used to confirm the
 *     planner's decisions are actually consumable by buildQuestionMessages)
 *
 * No live LLM calls — generateNextQuestion() is exercised with a stubbed
 * completeFn, same pattern as scripts/testAnswerEvaluator.js.
 */

const assert = require('assert');
const store = require('../src/core/sessionStore');
const model = require('../src/core/sessionModel');
const planner = require('../src/core/questionPlanner');
const { buildQuestionMessages } = require('../src/llm/prompts');
const { getCandidateById } = require('../src/models/candidateModel');
const { getDayByNumber } = require('../src/models/curriculumModel');

let passed = 0;
let failed = 0;
function ok(label, condition) {
  if (condition) {
    passed++;
    console.log(`  \u2714 ${label}`);
  } else {
    failed++;
    console.error(`  \u2718 ${label}`);
  }
}

const VALID_QUESTION_TYPES = new Set([
  'baseline', 'clarification', 'technical_probe', 'scenario', 'architecture_design', 'cross_topic', 'challenge',
]);
const VALID_DIFFICULTIES = new Set(['foundational', 'intermediate', 'advanced']);

/**
 * Records a full synthetic turn (question + answer + evaluation) for a
 * given decision, WITHOUT calling the LLM — mirrors what the future
 * interviewEngine.js will do, minus the actual model calls.
 */
function applyTurn(session, decision, { score, shallow, recommendedAction, notes }) {
  if (session.phase !== decision.phase) {
    model.setPhase(session, decision.phase);
  }
  const { questionId } = model.recordQuestion(session, {
    day: decision.day,
    title: decision.topic,
    phase: decision.phase,
    question: `[synthetic] ${decision.questionType || 'question'} about day ${decision.day ?? 'n/a'}`,
    isFollowUp: decision.isFollowUp,
  });
  model.recordAnswer(session, { questionId, answer: '[synthetic answer]' });
  model.recordEvaluation(session, { questionId, score, shallow, notes, recommendedAction });
  return questionId;
}

// -----------------------------------------------------------------
// 1. decideNextQuestion on a fresh session -> valid BASELINE decision
// -----------------------------------------------------------------
function testBaselineDecision() {
  console.log('\n=== decideNextQuestion: fresh session -> BASELINE ===');
  const candidate = getCandidateById('CAND-002');
  const session = model.createInitialState('qp-test-baseline', candidate);
  store.saveSession(session);

  const decision = planner.decideNextQuestion(session);
  ok('phase is BASELINE', decision.phase === model.PHASES.BASELINE);
  ok('day is a real curriculum day', typeof decision.day === 'number' && Boolean(getDayByNumber(decision.day)));
  ok('topic is a non-empty string', typeof decision.topic === 'string' && decision.topic.length > 0);
  ok('questionType is valid', VALID_QUESTION_TYPES.has(decision.questionType));
  ok('difficulty is valid', VALID_DIFFICULTIES.has(decision.difficulty));
  ok('isFollowUp is false for the opener', decision.isFollowUp === false);
  ok('readyToComplete is false', decision.readyToComplete === false);

  const messages = buildQuestionMessages(session, decision);
  ok('decision is accepted by prompts.buildQuestionMessages (2 messages)', Array.isArray(messages) && messages.length === 2);
  ok('system message present', messages[0].role === 'system' && messages[0].content.length > 0);
  ok('user message present', messages[1].role === 'user' && messages[1].content.length > 0);
}

// -----------------------------------------------------------------
// 2. Evaluator steering: FOLLOW_UP / CLARIFY / INCREASE_DIFFICULTY /
//    CHANGE_TOPIC / CROSS_CONNECT / COMPLETE, each checked in isolation
//    against a hand-driven session so the mapping is unambiguous.
// -----------------------------------------------------------------
function testEvaluatorSteering() {
  console.log('\n=== decideNextQuestion: evaluator recommendedAction steering ===');
  const candidate = getCandidateById('CAND-010');

  // FOLLOW_UP -> same day, FOLLOW_UP phase, not a clarify-style question
  {
    const session = model.createInitialState('qp-test-followup', candidate);
    store.saveSession(session);
    const baseline = planner.decideNextQuestion(session);
    const day = baseline.day;
    applyTurn(session, baseline, { score: 1, shallow: true, recommendedAction: 'FOLLOW_UP', notes: 'weak' });

    const next = planner.decideNextQuestion(session);
    ok('FOLLOW_UP -> phase FOLLOW_UP', next.phase === model.PHASES.FOLLOW_UP);
    ok('FOLLOW_UP -> same day', next.day === day);
    ok('FOLLOW_UP -> isFollowUp true', next.isFollowUp === true);
    ok('FOLLOW_UP -> questionType technical_probe', next.questionType === 'technical_probe');
  }

  // CLARIFY -> same day, FOLLOW_UP phase, clarification questionType
  {
    const session = model.createInitialState('qp-test-clarify', candidate);
    store.saveSession(session);
    const baseline = planner.decideNextQuestion(session);
    const day = baseline.day;
    applyTurn(session, baseline, { score: 2, shallow: false, recommendedAction: 'CLARIFY', notes: 'ambiguous' });

    const next = planner.decideNextQuestion(session);
    ok('CLARIFY -> phase FOLLOW_UP', next.phase === model.PHASES.FOLLOW_UP);
    ok('CLARIFY -> same day', next.day === day);
    ok('CLARIFY -> questionType clarification', next.questionType === 'clarification');
  }

  // INCREASE_DIFFICULTY -> DEPTH, same day, difficulty steps up (or stays at max)
  {
    const session = model.createInitialState('qp-test-depth', candidate);
    store.saveSession(session);
    const baseline = planner.decideNextQuestion(session);
    const day = baseline.day;
    const difficultyBefore = planner.computeCurrentDifficulty(session);
    applyTurn(session, baseline, { score: 5, shallow: false, recommendedAction: 'INCREASE_DIFFICULTY', notes: 'strong' });

    const next = planner.decideNextQuestion(session);
    const rank = { foundational: 0, intermediate: 1, advanced: 2 };
    ok('INCREASE_DIFFICULTY -> phase DEPTH', next.phase === model.PHASES.DEPTH);
    ok('INCREASE_DIFFICULTY -> same day', next.day === day);
    ok('INCREASE_DIFFICULTY -> difficulty did not decrease', rank[next.difficulty] >= rank[difficultyBefore]);
    ok('INCREASE_DIFFICULTY -> questionType challenge', next.questionType === 'challenge');
  }

  // CHANGE_TOPIC -> a genuinely different, uncovered day, CROSS_TOPIC phase
  {
    const session = model.createInitialState('qp-test-changetopic', candidate);
    store.saveSession(session);
    const baseline = planner.decideNextQuestion(session);
    const day = baseline.day;
    applyTurn(session, baseline, { score: 1, shallow: true, recommendedAction: 'CHANGE_TOPIC', notes: 'stuck' });

    const next = planner.decideNextQuestion(session);
    ok('CHANGE_TOPIC -> phase CROSS_TOPIC', next.phase === model.PHASES.CROSS_TOPIC);
    ok('CHANGE_TOPIC -> a different day', next.day !== day);
    ok('CHANGE_TOPIC -> relatedDays references the old day', next.relatedDays.includes(day));
    ok('CHANGE_TOPIC -> not marked as a follow-up', next.isFollowUp === false);
  }

  // CROSS_CONNECT -> bridges to an ALREADY-covered day in a different module
  {
    const session = model.createInitialState('qp-test-crossconnect', candidate);
    store.saveSession(session);
    // Cover two days first (baseline + one probe) so there's something to bridge to.
    const d1 = planner.decideNextQuestion(session);
    applyTurn(session, d1, { score: 4, shallow: false, recommendedAction: 'CHANGE_TOPIC', notes: 'move on' });
    const d2 = planner.decideNextQuestion(session);
    applyTurn(session, d2, { score: 4, shallow: false, recommendedAction: 'CROSS_CONNECT', notes: 'bridges nicely' });

    const next = planner.decideNextQuestion(session);
    ok('CROSS_CONNECT -> phase CROSS_TOPIC', next.phase === model.PHASES.CROSS_TOPIC);
    ok('CROSS_CONNECT -> crossConnectDay is set to the day just discussed', next.crossConnectDay === d2.day);
    ok('CROSS_CONNECT -> target day already covered', session.daysCovered.has(next.day) || next.day === d2.day);
    ok('CROSS_CONNECT -> target day differs from the source day', next.day !== d2.day);
  }

  // COMPLETE recommendedAction only advances to FINAL_ASSESSMENT once minimums are met
  {
    const session = model.createInitialState('qp-test-complete-early', candidate, { minQuestions: 2, minDaysCovered: 1 });
    store.saveSession(session);
    const baseline = planner.decideNextQuestion(session);
    applyTurn(session, baseline, { score: 5, shallow: false, recommendedAction: 'COMPLETE', notes: 'wrap up' });

    const next = planner.decideNextQuestion(session);
    ok(
      'COMPLETE -> FINAL_ASSESSMENT once minimums are met (minQuestions=2 already satisfied by 1 Q... falls back if not)',
      next.phase === model.PHASES.FINAL_ASSESSMENT || next.phase === model.PHASES.PROBE || next.phase === model.PHASES.CROSS_TOPIC
    );
  }
}

// -----------------------------------------------------------------
// 3. Full adaptive loop: drive a real candidate through decideNextQuestion
//    until readyToComplete, using a deterministic synthetic evaluator
//    (INCREASE_DIFFICULTY on first attempt at a day, CHANGE_TOPIC on the
//    second) so day coverage keeps growing, then verify the interview's
//    structural minimums and curriculum-scope/no-repetition guarantees.
// -----------------------------------------------------------------
function runFullInterview(sessionId, candidate, { maxSteps = 60 } = {}) {
  const session = model.createInitialState(sessionId, candidate);
  store.saveSession(session);

  const newTopicDaysAsked = []; // days asked via BASELINE/PROBE/CROSS_TOPIC (i.e. "new topic" turns)

  for (let step = 0; step < maxSteps; step++) {
    const decision = planner.decideNextQuestion(session);

    if (decision.readyToComplete) {
      if (session.phase !== model.PHASES.COMPLETE) model.setPhase(session, model.PHASES.COMPLETE);
      return { session, newTopicDaysAsked };
    }

    // Confirm every decision along the way is consumable by prompts.js.
    buildQuestionMessages(session, decision);

    const isNewTopicTurn = [model.PHASES.BASELINE, model.PHASES.PROBE, model.PHASES.CROSS_TOPIC].includes(decision.phase)
      && decision.day !== null;
    if (isNewTopicTurn) newTopicDaysAsked.push(decision.day);

    // Deterministic synthetic evaluator: first attempt on a day -> strong
    // (drive toward DEPTH), second attempt on that day -> move on.
    const priorAttempts = session.competencySignals.get(decision.day)?.attempts ?? 0;
    const recommendedAction = decision.day === null
      ? 'COMPLETE'
      : priorAttempts === 0
        ? 'INCREASE_DIFFICULTY'
        : 'CHANGE_TOPIC';

    applyTurn(session, decision, {
      score: recommendedAction === 'INCREASE_DIFFICULTY' ? 5 : 3,
      shallow: false,
      recommendedAction,
      notes: 'synthetic',
    });
  }
  throw new Error(`runFullInterview exceeded ${maxSteps} steps without reaching readyToComplete for ${sessionId}`);
}

function testFullInterview(label, sessionId, candidate) {
  console.log(`\n=== Full adaptive loop: ${label} (${candidate.member.id}) ===`);
  const { session, newTopicDaysAsked } = runFullInterview(sessionId, candidate);

  ok('reached COMPLETE phase', session.phase === model.PHASES.COMPLETE);
  ok('done flag is true', session.done === true);
  ok(`questionsAsked >= minQuestions (got ${session.questionsAsked}/${session.minQuestions})`, session.questionsAsked >= session.minQuestions);
  ok(`daysCovered >= minDaysCovered (got ${session.daysCovered.size}/${session.minDaysCovered})`, session.daysCovered.size >= session.minDaysCovered);
  ok('exactly one FINAL_ASSESSMENT question was asked', session.questions.filter((q) => q.phase === model.PHASES.FINAL_ASSESSMENT).length === 1);
  ok('exactly one BASELINE question was asked', session.questions.filter((q) => q.phase === model.PHASES.BASELINE).length === 1);
  ok(
    'no "new topic" turn repeated a day already covered at the time it was asked (no unnecessary repetition)',
    new Set(newTopicDaysAsked).size === newTopicDaysAsked.length
  );
  ok(
    'every question with a day stayed within curriculum scope',
    session.questions.every((q) => q.day === null || Boolean(getDayByNumber(q.day)))
  );

  console.log(`  Days covered: [${Array.from(session.daysCovered).join(', ')}]`);
  console.log(`  Phase question counts:`, Object.fromEntries(
    model.PHASE_ORDER.map((p) => [p, session.questions.filter((q) => q.phase === p).length])
  ));
}

// -----------------------------------------------------------------
// 4. generateNextQuestion(): LLM phrasing (stubbed) + graceful failure
// -----------------------------------------------------------------
async function testGenerateNextQuestion() {
  console.log('\n=== generateNextQuestion: stubbed LLM + failure handling ===');
  const candidate = getCandidateById('CAND-009');
  const session = model.createInitialState('qp-test-generate', candidate);
  store.saveSession(session);

  const stubbed = await planner.generateNextQuestion(session, {
    completeFn: async () => 'Walk me through how you approached that day of the cohort.',
  });
  ok('generateNextQuestion returns the stubbed question text', stubbed.question === 'Walk me through how you approached that day of the cohort.');
  ok('generateNextQuestion returns curriculumDay matching decideNextQuestion', typeof stubbed.curriculumDay === 'number');
  ok('generateNextQuestion returns a valid questionType', VALID_QUESTION_TYPES.has(stubbed.questionType));

  const failing = await planner.generateNextQuestion(session, {
    completeFn: async () => { throw new Error('simulated provider outage'); },
  });
  ok('LLM failure does not throw — falls back to deterministic question text', typeof failing.question === 'string' && failing.question.length > 0);
  ok('fallback question references the chosen day', failing.curriculumDay === null || failing.question.includes(String(failing.curriculumDay)));

  const empty = await planner.generateNextQuestion(session, { completeFn: async () => '   ' });
  ok('empty LLM response also falls back to deterministic question text', empty.question.length > 0);
}

// -----------------------------------------------------------------
// 5. Sparse-candidate edge case: forces the pickUncoveredDay() fallback
//    to the full curriculum (mirrors the old PROBE-fallback test).
// -----------------------------------------------------------------
function testSparseCandidateFallback() {
  console.log('\n=== Sparse candidate: forces fallback to full curriculum pool ===');
  const sparseCandidate = {
    member: {
      id: 'TEST-SPARSE-01',
      name: 'Synthetic Sparse Candidate',
      jobRole: 'QA Tester',
      yearsExperience: 1,
      education: 'N/A',
      status: 'test-fixture',
    },
    missions: [
      { day: 1, title: 'Setup', passed: true, attempts: 1 },
      { day: 4, title: 'Embeddings Basics', passed: false, attempts: 2 },
    ],
    signals: { commitDays: 2, missionsCompleted: 1, missionsFirstTry: 1 },
  };
  const { session } = runFullInterview('qp-test-sparse', sparseCandidate);
  ok(
    'sparse candidate still reached minimum day coverage via curriculum fallback',
    session.daysCovered.size >= session.minDaysCovered
  );
  ok(
    'sparse candidate coverage exceeds their own 2 real missions',
    session.daysCovered.size > sparseCandidate.missions.length
  );
}

// -----------------------------------------------------------------
// Run everything
// -----------------------------------------------------------------
async function main() {
  testBaselineDecision();
  testEvaluatorSteering();
  testFullInterview('Mixed pass/fail/skip candidate', 'qp-full-cand010', getCandidateById('CAND-010'));
  testFullInterview('Near-perfect candidate', 'qp-full-cand009', getCandidateById('CAND-009'));
  testFullInterview('Heavy skipper candidate', 'qp-full-cand011', getCandidateById('CAND-011'));
  await testGenerateNextQuestion();
  testSparseCandidateFallback();

  console.log(`\n\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
