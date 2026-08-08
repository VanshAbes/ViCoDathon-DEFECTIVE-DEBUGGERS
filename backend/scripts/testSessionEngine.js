'use strict';

/**
 * Dev-only test for the Interview Session Engine (P4).
 * Run with: node backend/scripts/testSessionEngine.js
 * Not the API — proves a session can be created, updated turn-by-turn,
 * tracks coverage/dedup correctly, and refuses to complete early.
 */

const assert = require('assert');
const store = require('../src/core/sessionStore');
const model = require('../src/core/sessionModel');
const { getCandidateById } = require('../src/models/candidateModel');

const candidate = getCandidateById('CAND-002');
assert(candidate, 'fixture candidate CAND-002 must exist in candidates.json');

// ---------------------------------------------------------------------
// 1. Create a session, save it, and re-fetch it from the store.
// ---------------------------------------------------------------------
const sessionId = 'test-session-001';
let session = model.createInitialState(sessionId, candidate);
store.saveSession(session);

assert.strictEqual(session.phase, model.PHASES.BASELINE);
assert.strictEqual(session.questionsAsked, 0);
assert.strictEqual(session.daysCovered.size, 0);
assert(session.plannedTopics.length > 0, 'plannedTopics should be seeded from the P3 profile');
assert(store.hasSession(sessionId));
console.log(`✔ Session created for ${candidate.member.name} (${sessionId}), phase=${session.phase}`);
console.log(`  plannedTopics: ${session.plannedTopics.map((t) => `Day ${t.day} (${t.role})`).join(', ')}`);

session = store.getSession(sessionId);

// ---------------------------------------------------------------------
// 2. BASELINE question -> answer -> evaluation, then advance to PROBE.
// ---------------------------------------------------------------------
const baselineTopic = session.plannedTopics[0];
let { questionId: q1 } = model.recordQuestion(session, {
  day: baselineTopic.day,
  title: baselineTopic.title,
  phase: model.PHASES.BASELINE,
  question: `Warm-up: walk me through how you approached Day ${baselineTopic.day} (${baselineTopic.title}).`,
});
model.recordAnswer(session, { questionId: q1, answer: 'I used embeddings and cosine similarity to rank results.' });
model.recordEvaluation(session, { questionId: q1, score: 4, shallow: false, notes: 'Solid, specific answer.' });

assert.strictEqual(session.questionsAsked, 1);
assert.strictEqual(session.daysCovered.size, 1);
assert(model.isDayCovered(session, baselineTopic.day));

const nextPhase1 = model.recommendNextPhase(session);
assert.strictEqual(nextPhase1, model.PHASES.PROBE, 'after a solid baseline answer, engine should recommend PROBE');
model.setPhase(session, nextPhase1);
console.log(`✔ Turn 1 (BASELINE) recorded on Day ${baselineTopic.day}. Recommended next phase: ${nextPhase1}`);

// ---------------------------------------------------------------------
// 3. Simulate a shallow PROBE answer -> engine should recommend FOLLOW_UP,
//    and the follow-up question must NOT mark a new day as "covered"
//    beyond the one already being probed (dedup / no phantom coverage).
// ---------------------------------------------------------------------
const uncovered = model.getUncoveredTopics(session);
const probeTopic = uncovered[0];
let { questionId: q2 } = model.recordQuestion(session, {
  day: probeTopic.day,
  title: probeTopic.title,
  phase: model.PHASES.PROBE,
  question: `Tell me about Day ${probeTopic.day} (${probeTopic.title}).`,
});
model.recordAnswer(session, { questionId: q2, answer: 'Not sure, I skipped that one.' });
model.recordEvaluation(session, { questionId: q2, score: 1, shallow: true, notes: 'Shallow — needs a follow-up.' });

const nextPhase2 = model.recommendNextPhase(session, { lastAnswerShallow: true });
assert.strictEqual(nextPhase2, model.PHASES.FOLLOW_UP);
model.setPhase(session, nextPhase2);

const daysCoveredBeforeFollowUp = session.daysCovered.size;
let { questionId: q3 } = model.recordQuestion(session, {
  day: probeTopic.day,
  title: probeTopic.title,
  phase: model.PHASES.FOLLOW_UP,
  question: `No worries — in plain terms, what do you think Day ${probeTopic.day} was about?`,
  isFollowUp: true,
});
model.recordAnswer(session, { questionId: q3, answer: 'Maybe something about deployment.' });
model.recordEvaluation(session, { questionId: q3, score: 2, shallow: true, notes: 'Still shallow, move on.' });

assert.strictEqual(
  session.daysCovered.size,
  daysCoveredBeforeFollowUp,
  'a follow-up on the same day must not inflate daysCovered'
);
assert.strictEqual(session.questionsAsked, 3, 'follow-ups still count toward total questions asked');
console.log(`✔ Turns 2-3 (PROBE + FOLLOW_UP) recorded on Day ${probeTopic.day} without double-counting coverage.`);

// ---------------------------------------------------------------------
// 4. Push through CROSS_TOPIC / DEPTH turns on fresh days until the
//    completion minimums (>=8 questions, >=4 days) are met, verifying
//    the engine refuses FINAL_ASSESSMENT / COMPLETE before that.
// ---------------------------------------------------------------------
let illegalTransitionCaught = false;
try {
  model.setPhase(session, model.PHASES.FINAL_ASSESSMENT);
} catch (err) {
  illegalTransitionCaught = true;
}
assert(illegalTransitionCaught, 'setPhase must refuse FINAL_ASSESSMENT before minimums are met');
console.log('✔ Engine correctly refused to jump to FINAL_ASSESSMENT before minimums were met.');

model.setPhase(session, model.PHASES.CROSS_TOPIC);
let turn = 4;
while (!model.meetsCompletionCriteria(session)) {
  const nextTopic = model.getUncoveredTopics(session)[0];
  if (!nextTopic) break; // exhausted the pool — shouldn't happen for this fixture candidate
  const { questionId } = model.recordQuestion(session, {
    day: nextTopic.day,
    title: nextTopic.title,
    phase: session.phase,
    question: `Let's switch topics — tell me about Day ${nextTopic.day} (${nextTopic.title}).`,
  });
  model.recordAnswer(session, { questionId, answer: 'Solid answer with specific details.' });
  model.recordEvaluation(session, { questionId, score: 4, shallow: false, notes: 'Good depth.' });
  turn += 1;
  const rec = model.recommendNextPhase(session);
  if (rec !== model.PHASES.FINAL_ASSESSMENT) model.setPhase(session, rec);
}

assert(model.meetsCompletionCriteria(session), 'loop should exit only once minimums are met');
console.log(
  `✔ Reached completion minimums after ${session.questionsAsked} questions across ${session.daysCovered.size} days.`
);

// ---------------------------------------------------------------------
// 5. Walk BASELINE-recommended path into FINAL_ASSESSMENT -> COMPLETE.
// ---------------------------------------------------------------------
const finalRec = model.recommendNextPhase(session);
assert.strictEqual(finalRec, model.PHASES.FINAL_ASSESSMENT);
model.setPhase(session, finalRec);

const { questionId: qFinal } = model.recordQuestion(session, {
  day: null,
  title: null,
  phase: model.PHASES.FINAL_ASSESSMENT,
  question: 'Last one — looking back, which part of the cohort are you proudest of, and why?',
});
model.recordAnswer(session, { questionId: qFinal, answer: 'Probably the capstone — it tied everything together.' });

model.setPhase(session, model.PHASES.COMPLETE);
assert.strictEqual(session.phase, model.PHASES.COMPLETE);
assert.strictEqual(session.done, true);
console.log(`✔ Session completed. Final: ${session.questionsAsked} questions, ${session.daysCovered.size} days covered.`);

// ---------------------------------------------------------------------
// 6. Store round-trip sanity: fetch again, confirm mutation persisted
//    (sessionStore holds a reference, mutated in place by sessionModel).
// ---------------------------------------------------------------------
const reloaded = store.getSession(sessionId);
assert.strictEqual(reloaded.phase, model.PHASES.COMPLETE);
assert.strictEqual(reloaded.questionsAsked, session.questionsAsked);
console.log('✔ Store round-trip confirms mutations persisted for the session lifetime.');

console.log('\nAll session engine checks passed.');
