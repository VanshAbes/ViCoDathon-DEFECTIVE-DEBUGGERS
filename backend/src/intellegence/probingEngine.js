'use strict';

const { getRelevantCurriculumDays } = require('./curriculumIntelligence');
const { DEFAULT_REPEATED_ATTEMPTS_THRESHOLD } = require('./candidateIntelligence');

/** @typedef {import('../models/types').RawCandidate} RawCandidate */
/** @typedef {import('./curriculumIntelligence').RelevantDay} RelevantDay */

/**
 * @typedef {Object} ProbeCandidate
 * @property {RelevantDay} day
 * @property {number} score       - higher = more worth probing
 * @property {string} reason      - human-readable justification
 * @property {string} probeStyle  - suggested question angle for the interview engine
 */

/**
 * Scoring rules — all derived only from fields already present on the
 * mission (status, attempts). No external assumptions.
 *
 *   skipped                          -> score 3, "confirm/probe the gap"
 *   failed                           -> score 3, "probe the gap, gauge current understanding"
 *   completed with attempts >= threshold -> score 2, "probe depth given repeated attempts"
 *   completed with attempts === 1    -> score 1, "ask to go deeper / teach-back"
 *   completed, attempts unknown/other -> score 1, "standard follow-up"
 *
 * @param {RelevantDay} day
 * @param {number} threshold
 * @returns {{score:number, reason:string, probeStyle:string}}
 */
function scoreDay(day, threshold) {
  if (day.candidateStatus === 'skipped') {
    return {
      score: 3,
      reason: `Skipped Day ${day.day} ("${day.title}") entirely.`,
      probeStyle: 'Check whether they have working knowledge of this topic despite skipping it.',
    };
  }
  if (day.candidateStatus === 'failed') {
    return {
      score: 3,
      reason: `Did not pass Day ${day.day} ("${day.title}").`,
      probeStyle: 'Probe the specific gap; gauge current understanding, not just the past result.',
    };
  }
  // completed
  if (typeof day.attempts === 'number' && day.attempts >= threshold) {
    return {
      score: 2,
      reason: `Passed Day ${day.day} ("${day.title}") but needed ${day.attempts} attempts.`,
      probeStyle: 'Probe depth and reasoning — confirm the concept is solid, not just memorized.',
    };
  }
  if (day.attempts === 1) {
    return {
      score: 1,
      reason: `Passed Day ${day.day} ("${day.title}") on the first try.`,
      probeStyle: 'Ask them to go deeper or teach the concept back — likely a strength to showcase.',
    };
  }
  return {
    score: 1,
    reason: `Passed Day ${day.day} ("${day.title}").`,
    probeStyle: 'Standard follow-up question.',
  };
}

/**
 * Q: "Which topics deserve deeper probing?"
 *
 * Ranks every curriculum day relevant to this candidate by how much
 * signal it carries for an interview: skipped/failed days rank highest,
 * then completed-with-many-attempts, then clean first-try passes last.
 *
 * @param {RawCandidate} candidate
 * @param {{ repeatedAttemptsThreshold?: number, limit?: number }} [options]
 * @returns {ProbeCandidate[]} sorted by score descending, then day ascending
 */
function getTopicsForDeeperProbing(candidate, options = {}) {
  const threshold = options.repeatedAttemptsThreshold ?? DEFAULT_REPEATED_ATTEMPTS_THRESHOLD;
  const relevantDays = getRelevantCurriculumDays(candidate);

  const ranked = relevantDays
    .map((day) => {
      const { score, reason, probeStyle } = scoreDay(day, threshold);
      return { day, score, reason, probeStyle };
    })
    .sort((a, b) => b.score - a.score || a.day.day - b.day.day);

  return typeof options.limit === 'number' ? ranked.slice(0, options.limit) : ranked;
}

module.exports = {
  getTopicsForDeeperProbing,
};
