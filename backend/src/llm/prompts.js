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

module.exports = {
  QUESTION_TYPE_GUIDANCE,
  buildSystemPrompt,
  buildQuestionMessages,
  describeCandidateStatus,
};
