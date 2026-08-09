'use strict';

/**
 * Prompt templates (P5).
 *
 * Two responsibilities only:
 *   1. buildSystemPrompt   — fixed interviewer persona + hard output rules.
 *   2. buildQuestionMessages — grounds one turn's request in exactly the
 *      context the LLM needs (candidate signal, chosen day/topic/type/
 *      difficulty, recent transcript) and nothing more.
 *
 * The decision of WHICH day/topic/questionType/difficulty to ask about is
 * made deterministically in questionPlanner.js, BEFORE the LLM is ever
 * called. The LLM's only job is to phrase that decision as one natural
 * interview question — it does not choose the topic and it does not
 * explain itself.
 */

const { getDayByNumber } = require('../models/curriculumModel');

/** Human-readable framing for each supported question type. */
const QUESTION_TYPE_GUIDANCE = {
  baseline: 'A warm, low-pressure opener about a topic they handled well — build rapport, not pressure.',
  clarification: 'A gentle, specific follow-up that gives them a chance to clarify or rebuild an answer that was thin or off-target. Do not repeat the previous question verbatim — narrow it or rephrase it.',
  technical_probe: 'A concrete technical question that requires them to explain a real mechanism, decision, or trade-off from that topic — not a yes/no question.',
  scenario: 'A realistic "what would you do if..." scenario question that applies the topic to a new situation, testing applied understanding rather than recall.',
  architecture_design: 'A system-design-style question asking them to reason about structure, trade-offs, or how components fit together for that topic.',
  cross_topic: 'A question that shifts to a new curriculum day/topic — signal the shift briefly and naturally, then ask the question.',
  challenge: 'A harder, pointed question that pushes on an edge case, a failure mode, or a common misconception for that topic — appropriate for a candidate performing well.',
};

/**
 * Fixed interviewer persona + non-negotiable output contract.
 * @param {{ jobRole: string, yearsExperience: number, name: string }} candidateProfile
 * @returns {string}
 */
function buildSystemPrompt(candidateProfile) {
  return [
    `You are an experienced, friendly technical interviewer conducting a live spoken interview for a ${candidateProfile.yearsExperience}-year-experience ${candidateProfile.jobRole} candidate who just finished a 31-day AI Cohort program.`,
    `You are given the exact topic, question type, and difficulty to use for this turn — do not choose a different topic.`,
    `Ask exactly ONE question, phrased the way a human interviewer would say it out loud in conversation.`,
    ``,
    `Strict output rules:`,
    `- Output ONLY the question text itself.`,
    `- Do NOT include any preamble, labels, headers, or meta-commentary (no "Question:", no "Here's a question:", no explanations).`,
    `- Do NOT reveal your reasoning, scoring criteria, or how you chose the topic.`,
    `- Do NOT restate the candidate's stats or profile back to them.`,
    `- Keep it to 1-3 sentences.`,
  ].join('\n');
}

/**
 * Short, neutral grounding line describing how this candidate did on a
 * given day — gives the LLM real signal without leaking scoring internals
 * into the question itself.
 * @param {string|null} candidateStatus
 * @param {number|null} attempts
 */
function describeCandidateStatus(candidateStatus, attempts) {
  if (candidateStatus === 'skipped') return 'The candidate skipped this day entirely.';
  if (candidateStatus === 'failed') return `The candidate did not pass this day (${attempts ?? 'unknown'} attempt(s)).`;
  if (candidateStatus === 'completed' && typeof attempts === 'number' && attempts === 1) {
    return 'The candidate passed this day on their first attempt.';
  }
  if (candidateStatus === 'completed' && typeof attempts === 'number' && attempts > 1) {
    return `The candidate passed this day after ${attempts} attempts.`;
  }
  return 'No specific completion signal for this day.';
}

/**
 * Builds the message list for one question-generation LLM call.
 *
 * @param {import('../core/sessionModel').SessionState} session
 * @param {{
 *   phase: string,
 *   day: number|null,
 *   topic: string|null,
 *   module: string|null,
 *   candidateStatus: string|null,
 *   attempts?: number|null,
 *   questionType: string,
 *   difficulty: string,
 *   isFollowUp: boolean,
 * }} decision
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
function buildQuestionMessages(session, decision) {
  const profile = session.profile.candidateSummary;
  const system = buildSystemPrompt(profile);

  const curriculumDay = typeof decision.day === 'number' ? getDayByNumber(decision.day) : null;
  const objectives = curriculumDay ? curriculumDay.objectives.slice(0, 4).join('; ') : 'N/A';
  const tools = curriculumDay ? curriculumDay.tools.join(', ') : 'N/A';

  const recentTranscript = session.history
    .slice(-6)
    .map((turn) => `${turn.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${turn.content}`)
    .join('\n') || '(interview has not started yet)';

  const lastEvaluation = session.evaluations[session.evaluations.length - 1];
  const lastEvaluationNote =
    decision.isFollowUp && lastEvaluation ? `Note on their last answer: ${lastEvaluation.notes}` : '';

  const guidance = QUESTION_TYPE_GUIDANCE[decision.questionType] || 'Ask a clear, relevant interview question.';
  const crossConnectLine =
    decision.crossConnectDay != null && decision.crossConnectTopic
      ? `Bridge instruction: explicitly connect this new topic back to Day ${decision.crossConnectDay} ("${decision.crossConnectTopic}"), which was just discussed — ask one question that links the two rather than switching topics abruptly.`
      : '';

  const userPrompt = [
    `Interview phase: ${decision.phase}`,
    `Question type to use: ${decision.questionType} — ${guidance}`,
    `Target difficulty: ${decision.difficulty}`,
    decision.day !== null
      ? `Topic: Day ${decision.day} — "${decision.topic}"${decision.module ? ` (module: ${decision.module})` : ''}`
      : `Topic: closing/reflection question — not tied to a specific curriculum day`,
    curriculumDay ? `Day objectives: ${objectives}` : '',
    curriculumDay ? `Tools/technologies for this day: ${tools}` : '',
    decision.day !== null ? describeCandidateStatus(decision.candidateStatus, decision.attempts ?? null) : '',
    crossConnectLine,
    lastEvaluationNote,
    ``,
    `Recent transcript:`,
    recentTranscript,
    ``,
    `Now produce the next interview question, following the strict output rules from the system prompt.`,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ];
}

// ---------------------------------------------------------------------
// Answer evaluation prompts (P6)
// ---------------------------------------------------------------------

/**
 * Recommended-action definitions, shared verbatim with the LLM so it
 * picks consistently with how answerEvaluator.js interprets them.
 */
const RECOMMENDED_ACTION_GUIDE = [
  'FOLLOW_UP — the answer was weak, shallow, or incomplete: dig deeper on the SAME topic.',
  'CLARIFY — the answer was ambiguous, off-target, or unclear (not necessarily wrong): ask them to restate or narrow it.',
  'INCREASE_DIFFICULTY — the answer was strong: go deeper/harder on this same topic.',
  'CHANGE_TOPIC — the candidate has struggled repeatedly here or this topic is fully explored: move on to a new topic.',
  'CROSS_CONNECT — the answer opens a natural bridge to another topic/module already covered: ask a question connecting the two.',
  'COMPLETE — the candidate has shown enough overall signal that the interview could reasonably wrap up soon.',
].join('\n');

/**
 * Fixed evaluator persona + non-negotiable JSON-only output contract.
 * Kept separate from buildSystemPrompt (the question-asking persona) —
 * evaluation and question-generation are different jobs with different
 * output contracts, so they get separate system prompts even though
 * both eventually feed the same session.
 * @returns {string}
 */
function buildEvaluationSystemPrompt() {
  return [
    `You are an expert technical interview evaluator scoring ONE candidate answer against the specific curriculum objectives it was meant to demonstrate.`,
    `Evaluate: correctness, technical depth, conceptual understanding, missing concepts, misconceptions, practical reasoning, and architecture/design reasoning (where relevant to the topic).`,
    `Base your evaluation only on what the candidate actually said — never assume knowledge they didn't demonstrate, and never penalize them for topics outside the given objectives.`,
    ``,
    `recommendedAction must be exactly one of:`,
    RECOMMENDED_ACTION_GUIDE,
    ``,
    `Respond with STRICT JSON ONLY, matching exactly this shape — no markdown, no code fences, no commentary, no preamble, and no explanation of your reasoning process:`,
    `{`,
    `  "score": <integer 0-5>,`,
    `  "strengths": ["short phrase", ...],`,
    `  "gaps": ["short phrase", ...],`,
    `  "evidence": ["short paraphrase of a specific thing the candidate said that supports the score", ...],`,
    `  "competencyUpdates": [{"day": <curriculum day number or null>, "competency": "<short skill/topic label>", "signal": "strong"|"weak"|"mixed"|"unclear", "note": "<one short sentence>"}],`,
    `  "recommendedAction": "FOLLOW_UP" | "CLARIFY" | "INCREASE_DIFFICULTY" | "CHANGE_TOPIC" | "CROSS_CONNECT" | "COMPLETE"`,
    `}`,
    `"strengths", "gaps", and "evidence" should each be short phrases (a few words), not full sentences or restated transcript.`,
  ].join('\n');
}

/**
 * Builds the message list for one answer-evaluation LLM call.
 *
 * @param {import('../core/sessionModel').SessionState} session
 * @param {{ id:string, day:number|null, title:string|null, question:string, isFollowUp:boolean }} question - the question actually asked (session.questions entry)
 * @param {string} answerText - the candidate's raw answer
 * @param {string[]} objectives - curriculum objectives for question.day (already resolved by the caller; empty array if none)
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
function buildEvaluationMessages(session, question, answerText, objectives) {
  const summary = session.profile.candidateSummary;
  const system = buildEvaluationSystemPrompt();

  const priorSignal = question.day !== null ? session.competencySignals.get(question.day) : null;
  const priorSignalNote = priorSignal
    ? `This candidate has answered ${priorSignal.attempts} question(s) on this day already in THIS interview (avg score so far: ${priorSignal.avgScore.toFixed(1)}, last answer shallow: ${priorSignal.lastShallow}).`
    : 'This is the first question asked about this day in the interview.';

  const cohortStatus =
    question.day !== null
      ? describeCandidateStatus(
          (session.topicPool.find((t) => t.day === question.day) || {}).candidateStatus ?? null,
          (session.topicPool.find((t) => t.day === question.day) || {}).attempts ?? null
        )
      : 'Not tied to a specific curriculum day (closing/reflection question).';

  const recentTranscript = session.history
    .slice(-8, -1) // exclude the just-asked question itself, which we show separately below
    .map((turn) => `${turn.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${turn.content}`)
    .join('\n') || '(no prior turns)';

  const objectivesText = objectives && objectives.length ? objectives.join('; ') : 'N/A';

  const userPrompt = [
    `Candidate: ${summary.jobRole}, ${summary.yearsExperience}y experience, recommended difficulty "${session.profile.recommendedDifficulty.level}".`,
    `Curriculum context (cohort record, not this interview): ${cohortStatus}`,
    priorSignalNote,
    ``,
    `Relevant curriculum objectives being assessed: ${objectivesText}`,
    ``,
    `Prior transcript:`,
    recentTranscript,
    ``,
    `Question just asked${question.isFollowUp ? ' (a follow-up clarification)' : ''}: "${question.question}"`,
    `Candidate's answer: "${answerText}"`,
    ``,
    `Evaluate this answer now and respond with the JSON object only, following the system prompt's schema and rules.`,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ];
}

module.exports = {
  QUESTION_TYPE_GUIDANCE,
  buildSystemPrompt,
  buildQuestionMessages,
  describeCandidateStatus,
  RECOMMENDED_ACTION_GUIDE,
  buildEvaluationSystemPrompt,
  buildEvaluationMessages,
};
