'use strict';

/**
 * Dev-only test for the Answer Evaluator (P6).
 * Run with: node backend/scripts/testAnswerEvaluator.js
 * Not the API. Uses a stubbed `completeFn` (no live LLM key needed) that
 * returns canned JSON strings, so this proves:
 *   1. well-formed JSON is parsed/sanitized into the exact required shape
 *   2. malformed JSON falls back to a deterministic, content-agnostic action
 *   3. recordEvaluation persists recommendedAction onto the session
 *   4. that recommendedAction actually steers P5's next decideNextQuestion()
 *      call — i.e. the evaluation influences the next question, per spec.
 */

const assert = require('assert');
const store = require('../src/core/sessionStore');
const model = require('../src/core/sessionModel');
const planner = require('../src/core/questionPlanner');
const evaluator = require('../src/core/answerEvaluator');
const { getCandidateById } = require('../src/models/candidateModel');

const REQUIRED_KEYS = ['score', 'strengths', 'gaps', 'evidence', 'competencyUpdates', 'recommendedAction'].sort();

function makeStub(jsonOrRaw) {
  return async () => (typeof jsonOrRaw === 'string' ? jsonOrRaw : JSON.stringify(jsonOrRaw));
}

async function main() {
  const candidate = getCandidateById('CAND-002');
  assert(candidate, 'fixture candidate CAND-002 must exist');

  // -------------------------------------------------------------
  // 0. Pure sanitizer unit checks (no session needed).
  // -------------------------------------------------------------
  assert.strictEqual(evaluator.clampScore(7), 5, 'score must clamp to max 5');
  assert.strictEqual(evaluator.clampScore(-3), 0, 'score must clamp to min 0');
  assert.strictEqual(evaluator.clampScore('not a number'), 0, 'non-numeric score falls back to 0');
  assert.deepStrictEqual(
    evaluator.coerceStringArray(['a', '', 42, 'b', '   ', 'c']),
    ['a', 'b', 'c'],
    'coerceStringArray must drop non-strings and blanks'
  );
  assert.throws(() => evaluator.safeParseJson('not json at all {{{'), 'unparsable text must throw, not silently return garbage');
  const parsedFromFenced = evaluator.safeParseJson('```json\n{"score": 3}\n```');
  assert.strictEqual(parsedFromFenced.score, 3, 'must strip markdown code fences before parsing');
  console.log('✔ Sanitizer unit checks passed (clampScore, coerceStringArray, safeParseJson).');

  // -------------------------------------------------------------
  // 1. Set up a session and ask a first (baseline) question via P5.
  // -------------------------------------------------------------
  let session = model.createInitialState('test-eval-001', candidate);
  store.saveSession(session);

  let q = await planner.generateNextQuestion(session, {
    completeFn: async () => 'Tell me about a project where you used this.',
  });
  let { questionId: q1 } = model.recordQuestion(session, {
    day: q.curriculumDay,
    title: q.topic,
    phase: model.PHASES.BASELINE,
    question: q.question,
  });
  model.recordAnswer(session, { questionId: q1, answer: 'I built a small RAG pipeline with a vector DB and re-ranking.' });

  // -------------------------------------------------------------
  // 2. Evaluate a STRONG, well-formed answer.
  // -------------------------------------------------------------
  const strongJson = {
    score: 5,
    strengths: ['clear pipeline description', 'mentions re-ranking'],
    gaps: [],
    evidence: ['described vector DB + re-ranking'],
    competencyUpdates: [{ day: q.curriculumDay, competency: q.topic, signal: 'strong', note: 'Confident, specific.' }],
    recommendedAction: 'increase_difficulty', // lowercase on purpose — must be normalized
  };
  let evaluation = await evaluator.evaluateAnswer(session, { questionId: q1, answer: 'irrelevant here, evaluator reads from stub' }, {
    completeFn: makeStub(strongJson),
  });
  assert.deepStrictEqual(Object.keys(evaluation).sort(), REQUIRED_KEYS, 'evaluation must return exactly the required shape');
  assert.strictEqual(evaluation.score, 5);
  assert.strictEqual(evaluation.recommendedAction, 'INCREASE_DIFFICULTY', 'recommendedAction must be normalized to uppercase enum');
  console.log(`✔ Strong well-formed answer -> score ${evaluation.score}, recommendedAction ${evaluation.recommendedAction}`);

  await evaluator.evaluateAndRecord(session, { questionId: q1, answer: 'same' }, { completeFn: makeStub(strongJson) });
  assert.strictEqual(session.evaluations[session.evaluations.length - 1].recommendedAction, 'INCREASE_DIFFICULTY');
  console.log('✔ evaluateAndRecord persisted recommendedAction onto the session.');

  // -------------------------------------------------------------
  // 3. Confirm this evaluation STEERS P5's next decision: an
  //    INCREASE_DIFFICULTY action must produce a DEPTH decision on the
  //    SAME day, with difficulty stepped up.
  // -------------------------------------------------------------
  const difficultyBefore = planner.computeCurrentDifficulty(session);
  const decision = planner.decideNextQuestion(session);
  assert.strictEqual(decision.phase, model.PHASES.DEPTH);
  assert.strictEqual(decision.day, q1 && q.curriculumDay);
  const rank = { foundational: 0, intermediate: 1, advanced: 2 };
  assert(rank[decision.difficulty] >= rank[difficultyBefore], 'INCREASE_DIFFICULTY must not lower difficulty');
  console.log(`✔ P6 -> P5 wiring confirmed: INCREASE_DIFFICULTY drove phase=${decision.phase}, difficulty=${decision.difficulty} on Day ${decision.day}.`);

  model.setPhase(session, model.PHASES.DEPTH);
  let { questionId: q2 } = model.recordQuestion(session, {
    day: decision.day,
    title: decision.topic,
    phase: model.PHASES.DEPTH,
    question: 'Harder follow-up question.',
  });
  model.recordAnswer(session, { questionId: q2, answer: 'not sure, kind of guessing here' });

  // -------------------------------------------------------------
  // 4. Malformed JSON from the model -> deterministic structural
  //    fallback, not a crash, not a hardcoded "correct answer" lookup.
  //    Uses a FRESH session/topic so this is a clean "first attempt on
  //    this day" case, isolated from the DEPTH escalation above.
  // -------------------------------------------------------------
  let session2 = model.createInitialState('test-eval-002', candidate);
  store.saveSession(session2);
  let s2decision = planner.decideNextQuestion(session2); // BASELINE, turn 1
  let { questionId: s2q1 } = model.recordQuestion(session2, {
    day: s2decision.day,
    title: s2decision.topic,
    phase: s2decision.phase,
    question: 'Warm-up question.',
  });
  model.recordAnswer(session2, { questionId: s2q1, answer: 'not sure, kind of guessing here' });

  let evaluation2 = await evaluator.evaluateAnswer(session2, { questionId: s2q1, answer: 'not sure, kind of guessing here' }, {
    completeFn: makeStub('I think the answer is probably around a 3 out of 5, roughly.'), // not valid JSON
  });
  assert(Object.values(evaluator.RECOMMENDED_ACTIONS).includes(evaluation2.recommendedAction), 'fallback action must still be a valid enum value');
  assert.strictEqual(evaluation2.score, 0, 'unparsable response falls back to score 0, not a guess at intent');
  assert(evaluation2.competencyUpdates.length >= 1, 'fallback must still produce at least one competencyUpdate');
  console.log(`✔ Malformed model output -> deterministic fallback (score=${evaluation2.score}, recommendedAction=${evaluation2.recommendedAction}), no crash.`);

  await evaluator.evaluateAndRecord(session2, { questionId: s2q1, answer: 'not sure, kind of guessing here' }, {
    completeFn: makeStub({ score: 1, strengths: [], gaps: ['no real answer given'], evidence: [], competencyUpdates: [], recommendedAction: 'FOLLOW_UP' }),
  });

  // -------------------------------------------------------------
  // 5. First shallow answer -> a genuine FOLLOW_UP (this day has had
  //    exactly one attempt so far, so it is NOT yet a repeated struggle).
  // -------------------------------------------------------------
  const decisionAfterFirstShallow = planner.decideNextQuestion(session2);
  assert.strictEqual(decisionAfterFirstShallow.phase, model.PHASES.FOLLOW_UP);
  assert.strictEqual(decisionAfterFirstShallow.day, s2decision.day, 'the first follow-up must stay on the same day');
  console.log(`✔ First shallow answer correctly produced a FOLLOW_UP on Day ${decisionAfterFirstShallow.day} (not yet a repeated struggle).`);

  model.setPhase(session2, model.PHASES.FOLLOW_UP);
  let { questionId: q3 } = model.recordQuestion(session2, {
    day: decisionAfterFirstShallow.day,
    title: decisionAfterFirstShallow.topic,
    phase: model.PHASES.FOLLOW_UP,
    question: 'Simplify: what do you think this concept is for?',
    isFollowUp: true,
  });
  model.recordAnswer(session2, { questionId: q3, answer: 'still no idea, sorry' });

  // -------------------------------------------------------------
  // 6. Repeated struggle override: even if the model insists on
  //    FOLLOW_UP a second time in a row on the same day, the evaluator
  //    must override it to CHANGE_TOPIC so the interview doesn't loop.
  // -------------------------------------------------------------
  const stubStillInsistsFollowUp = makeStub({
    score: 1,
    strengths: [],
    gaps: ['still no understanding demonstrated'],
    evidence: [],
    competencyUpdates: [],
    recommendedAction: 'FOLLOW_UP', // the model keeps suggesting FOLLOW_UP even though this is the 2nd shallow answer on this day
  });
  const overriddenEval = await evaluator.evaluateAnswer(session2, { questionId: q3, answer: 'still no idea, sorry' }, { completeFn: stubStillInsistsFollowUp });
  assert.strictEqual(
    overriddenEval.recommendedAction,
    'CHANGE_TOPIC',
    'evaluator must override a repeated FOLLOW_UP/CLARIFY into CHANGE_TOPIC to prevent an infinite clarification loop'
  );
  console.log('✔ Repeated-struggle safety net overrode a stubborn FOLLOW_UP into CHANGE_TOPIC.');

  await evaluator.evaluateAndRecord(session2, { questionId: q3, answer: 'still no idea, sorry' }, { completeFn: stubStillInsistsFollowUp });
  const decisionAfterOverride = planner.decideNextQuestion(session2);
  assert.strictEqual(decisionAfterOverride.phase, model.PHASES.CROSS_TOPIC);
  assert.notStrictEqual(decisionAfterOverride.day, decisionAfterFirstShallow.day, 'must move to a genuinely different day');
  console.log(`✔ P5 correctly moved topics after the override -> Day ${decisionAfterOverride.day} ("${decisionAfterOverride.topic}").`);

  console.log(`\nSession 1: ${session.questionsAsked} questions, ${session.daysCovered.size} days covered, phase=${session.phase}`);
  console.log(`Session 2: ${session2.questionsAsked} questions, ${session2.daysCovered.size} days covered, phase=${session2.phase}`);
  console.log('\nAll answer evaluator checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
