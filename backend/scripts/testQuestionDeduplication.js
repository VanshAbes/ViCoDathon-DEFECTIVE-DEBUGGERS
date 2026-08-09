'use strict';

/**
 * Regression test for the duplicate/rephrased follow-up bug.
 *
 * Background: with no LLM API key, every question is phrased by the
 * deterministic fallback in questionPlanner.js. The old fallback emitted a
 * near-verbatim rephrase of the current question for ANY follow-up, e.g.
 * after asking "...how would you approach it?" and getting a strong answer,
 * it asked "...specifically, how would you approach it in practice?".
 *
 * This test locks in the fix:
 *   - a strong Day 7 answer -> INCREASE_DIFFICULTY (evaluator, unchanged)
 *   - planner selects DEPTH / challenge (decision logic, unchanged)
 *   - forcing the LLM to throw -> deterministic fallback is used
 *   - the fallback must NOT be identical to the previous question
 *   - the fallback must NOT merely rephrase the previous question
 *   - a DEPTH fallback must introduce a genuinely new information demand
 *     (edge case / failure mode / limitation / trade-off / mitigation)
 *   - a full no-LLM interview must not produce consecutive duplicate or
 *     heavily-overlapping questions
 *
 * Run with: node scripts/testQuestionDeduplication.js
 */

const assert = require('assert');
const store = require('../src/core/sessionStore');
const model = require('../src/core/sessionModel');
const planner = require('../src/core/questionPlanner');
const evaluator = require('../src/core/answerEvaluator');
const { getCandidateById } = require('../src/models/candidateModel');

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

// Same token-overlap heuristic used by the fallback (kept in sync for the
// "does not rephrase" assertion). Overlap > 0.75 is treated as a rephrase.
function tokenSet(text) {
  const set = new Set();
  for (const t of (text || '').toLowerCase().match(/[a-z0-9']+/g) || []) {
    if (t.length >= 4) set.add(t);
  }
  return set;
}
function overlapRatio(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  return shared / Math.min(sa.size, sb.size);
}

// The detailed, technically strong Day 7 answer from the bug report.
const STRONG_DAY7_ANSWER =
  "I'd start by converting the raw text data into vector representations using an embedding model. I'd choose a good embedding model, then store the vectors in a vector database. At query time I'd embed the query and run a similarity search against the stored vectors. I'd use RAG retrieval to pull the most relevant chunks and also consider retrieval quality. I'd think about latency and scaling, and tune chunk size and the indexing strategy.";

// The original Day 7 opener the backend actually asks (from the bug report).
const OPENING_DAY7_QUESTION =
  "Let's talk about Day 7 (Embeddings Explained). Can you walk me through how you'd approach it?";

// A rotating pool of realistic answers (strong, partial, brief) so the
// deterministic evaluator's score varies and the planner advances to cover
// multiple days — mirrors the real no-LLM E2E harness.
const VARIED_ANSWERS = [
  STRONG_DAY7_ANSWER,
  'Yes I can do that.',
  'I would use a vector database to store embeddings and query them with similarity search, then merge with structured data and deduplicate before returning.',
  'Hmm, not really sure about that one.',
  'Embeddings convert text into vectors. I generate them with a sentence transformer, store them in a vector DB, and retrieve the most similar chunks to ground the answer.',
  'I would set up observability with logging and monitoring, track latency and failures, and add guardrails and input validation for security.',
  'I would secure the API with authentication, validate inputs, protect sensitive data, implement prompt injection safeguards, and test common security scenarios.',
  'I would containerize the app with Docker and deploy to Kubernetes, configure health checks, and verify the deployed chatbot works.',
];

/**
 * Builds a fresh session for CAND-001 (whose first planned topic is Day 7),
 * asks the opening question through the real planner, and returns
 * { session, openingQuestionId, openingQuestion }.
 */
function startSessionWithOpening() {
  const candidate = getCandidateById('CAND-001');
  const session = model.createInitialState('dedup-cand001', candidate);
  store.saveSession(session);

  const decision = planner.decideNextQuestion(session);
  assert.strictEqual(decision.phase, model.PHASES.BASELINE, 'opening phase should be BASELINE');
  assert.strictEqual(decision.day, 7, 'CAND-001 should open on Day 7');

  const { questionId } = model.recordQuestion(session, {
    day: decision.day,
    title: decision.topic,
    phase: decision.phase,
    question: OPENING_DAY7_QUESTION,
    isFollowUp: decision.isFollowUp,
  });
  return { session, openingQuestionId: questionId, openingQuestion: OPENING_DAY7_QUESTION };
}

// -----------------------------------------------------------------
// 1. Evaluator: strong Day 7 answer -> INCREASE_DIFFICULTY (unchanged)
// -----------------------------------------------------------------
function testEvaluatorStrongAnswer() {
  console.log('\n=== 1. Evaluator classifies a strong Day 7 answer ===');
  const { session, openingQuestionId } = startSessionWithOpening();

  const questionRec = session.questions.find((q) => q.id === openingQuestionId);
  const evaluation = evaluator.deterministicEvaluate(
    session,
    questionRec,
    STRONG_DAY7_ANSWER,
    [
      'Understand how text is converted into vector embeddings',
      'Generate embeddings for every knowledge base chunk',
      'Store embeddings alongside the original documents',
      'Visualize embedding clusters using PCA',
      'Analyze whether similar healthcare concepts cluster together',
    ]
  );

  ok(
    `strong answer scored >= 4 (got ${evaluation.score})`,
    evaluation.score >= 4
  );
  ok(
    `strong answer -> INCREASE_DIFFICULTY (got ${evaluation.recommendedAction})`,
    evaluation.recommendedAction === 'INCREASE_DIFFICULTY'
  );
  console.log(`  score=${evaluation.score} action=${evaluation.recommendedAction}`);
}

// -----------------------------------------------------------------
// 2. Planner: after a strong answer, DEPTH / challenge on the same day
// -----------------------------------------------------------------
function testPlannerDepthDecision() {
  console.log('\n=== 2. Planner selects DEPTH / challenge on the same day ===');
  const { session, openingQuestionId } = startSessionWithOpening();

  model.recordAnswer(session, { questionId: openingQuestionId, answer: STRONG_DAY7_ANSWER });
  model.recordEvaluation(session, {
    questionId: openingQuestionId,
    score: 5,
    shallow: false,
    notes: 'Gaps: none',
    recommendedAction: 'INCREASE_DIFFICULTY',
  });

  const decision = planner.decideNextQuestion(session);
  ok('decision phase is DEPTH', decision.phase === model.PHASES.DEPTH);
  ok('decision stays on Day 7', decision.day === 7);
  ok('decision is a follow-up', decision.isFollowUp === true);
  ok('decision questionType is challenge', decision.questionType === 'challenge');
}

// -----------------------------------------------------------------
// 3. Fallback: forcing LLM failure yields a NEW, non-rephrased question
// -----------------------------------------------------------------
async function testFallbackNovelty() {
  console.log('\n=== 3. LLM failure -> fallback adds NEW information demand ===');
  const { session, openingQuestionId } = startSessionWithOpening();

  model.recordAnswer(session, { questionId: openingQuestionId, answer: STRONG_DAY7_ANSWER });
  model.recordEvaluation(session, {
    questionId: openingQuestionId,
    score: 5,
    shallow: false,
    notes: 'Gaps: none',
    recommendedAction: 'INCREASE_DIFFICULTY',
  });

  // Force the fallback path: completeFn throws.
  const generated = await planner.generateNextQuestion(session, {
    completeFn: async () => { throw new Error('simulated provider outage'); },
  });

  const newQ = generated.question;

  ok('fallback produced a non-empty question', typeof newQ === 'string' && newQ.length > 0);
  ok(
    'fallback question is NOT identical to the previous question',
    newQ.trim().toLowerCase() !== OPENING_DAY7_QUESTION.trim().toLowerCase()
  );
  ok(
    `fallback does NOT rephrase the previous question (overlap=${overlapRatio(newQ, OPENING_DAY7_QUESTION).toFixed(2)})`,
    overlapRatio(newQ, OPENING_DAY7_QUESTION) <= 0.75
  );
  ok(
    'DEPTH fallback introduces a new information demand (edge case / failure / limitation / trade-off / mitigate / hardest)',
    /edge case|failure|limitation|trade[- ]off|mitigat|diagnos|boundary|hardest to get right/i.test(newQ)
  );
  ok(
    'new question does NOT re-ask the opener "how would you approach it"',
    !/how would you approach it\?/i.test(newQ)
  );

  console.log(`  PREVIOUS: ${OPENING_DAY7_QUESTION}`);
  console.log(`  NEW:      ${newQ}`);
}

// -----------------------------------------------------------------
// 4. Full no-LLM interview: no consecutive duplicate / rephrased questions
// -----------------------------------------------------------------
async function testFullNoLlmInterview() {
  console.log('\n=== 4. Full no-LLM interview: no consecutive duplicates ===');
  const candidate = getCandidateById('CAND-001');
  const session = model.createInitialState('dedup-full', candidate);
  store.saveSession(session);

  const asked = [];
  let completed = false;

  for (let step = 0; step < 80; step++) {
    const decision = planner.decideNextQuestion(session);
    if (decision.readyToComplete) {
      if (session.phase !== model.PHASES.COMPLETE && session.phase !== model.PHASES.FINAL_ASSESSMENT) {
        // A FINAL_ASSESSMENT question was already asked; the only legal
        // move from FINAL_ASSESSMENT is COMPLETE.
        model.setPhase(session, model.PHASES.COMPLETE);
      }
      completed = true;
      break;
    }

    // Apply the phase transition the real interview engine performs via
    // interviewEngine.askNextQuestion -> sessionModel.setPhase, so the
    // session stays on a legal phase path (e.g. -> FINAL_ASSESSMENT).
    if (decision.phase && decision.phase !== session.phase) {
      model.setPhase(session, decision.phase);
    }

    // Generate the question through the fallback (throwing LLM every turn).
    const generated = await planner.generateNextQuestion(session, {
      completeFn: async () => { throw new Error('no LLM'); },
    });
    const qText = generated.question;
    assert(typeof qText === 'string' && qText.length > 0, 'fallback must always produce text');

    asked.push(qText);

    // Record the question + answer + a deterministic evaluation.
    const answerText = VARIED_ANSWERS[step % VARIED_ANSWERS.length];
    const { questionId } = model.recordQuestion(session, {
      day: decision.day,
      title: decision.topic,
      phase: decision.phase,
      question: qText,
      isFollowUp: decision.isFollowUp,
    });
    model.recordAnswer(session, { questionId, answer: answerText });
    const questionRec = session.questions.find((q) => q.id === questionId);
    const evaluation = evaluator.deterministicEvaluate(
      session,
      questionRec,
      answerText,
      []
    );
    model.recordEvaluation(session, {
      questionId,
      score: evaluation.score,
      shallow: evaluation.recommendedAction === 'FOLLOW_UP' || evaluation.recommendedAction === 'CLARIFY' || evaluation.score <= 1,
      notes: 'Gaps: none',
      recommendedAction: evaluation.recommendedAction,
    });
  }

  ok('no-LLM interview reached completion', completed === true);
  ok(
    `reached minimum question count (asked ${asked.length}, min ${session.minQuestions})`,
    asked.length >= session.minQuestions
  );
  ok(
    `reached minimum day coverage (got ${session.daysCovered.size}, min ${session.minDaysCovered})`,
    session.daysCovered.size >= session.minDaysCovered
  );

  // Consecutive duplicate check.
  let consecutiveDuplicates = 0;
  for (let i = 1; i < asked.length; i++) {
    if (asked[i].trim().toLowerCase() === asked[i - 1].trim().toLowerCase()) consecutiveDuplicates++;
  }
  ok('no two consecutive questions are identical', consecutiveDuplicates === 0);

  // Consecutive rephrase check (overlap > 0.75).
  let consecutiveRephrases = 0;
  let worstOverlap = 0;
  for (let i = 1; i < asked.length; i++) {
    const r = overlapRatio(asked[i], asked[i - 1]);
    if (r > worstOverlap) worstOverlap = r;
    if (r > 0.75) consecutiveRephrases++;
  }
  ok(
    `no consecutive pair is a near-verbatim rephrase (worst overlap=${worstOverlap.toFixed(2)})`,
    consecutiveRephrases === 0
  );

  console.log(`  Questions asked: ${asked.length}`);
  console.log(`  Days covered: [${Array.from(session.daysCovered).join(', ')}]`);
  console.log('  First 4 questions:');
  asked.slice(0, 4).forEach((q, i) => console.log(`    ${i + 1}. ${q}`));
}

// -----------------------------------------------------------------
// Run everything
// -----------------------------------------------------------------
async function main() {
  testEvaluatorStrongAnswer();
  testPlannerDepthDecision();
  await testFallbackNovelty();
  await testFullNoLlmInterview();

  console.log(`\n\n${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
