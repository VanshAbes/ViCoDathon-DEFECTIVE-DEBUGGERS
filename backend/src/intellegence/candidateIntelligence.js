'use strict';

const { classifyAllMissions, getProfile, getSignals } = require('../models/candidateModel');

/** @typedef {import('../models/candidateModel').ClassifiedMission} ClassifiedMission */
/** @typedef {import('../models/types').RawCandidate} RawCandidate */

const DEFAULT_REPEATED_ATTEMPTS_THRESHOLD = 3;

/**
 * Q: "What has this candidate completed?"
 * @param {RawCandidate} candidate
 * @returns {ClassifiedMission[]} missions with status === 'completed'
 */
function getCompletedMissions(candidate) {
  return classifyAllMissions(candidate).filter((m) => m.status === 'completed');
}

/**
 * Q: "What did they struggle with?"
 * "Struggle" = explicitly failed (passed: false) in the source data.
 * This does NOT include high-attempt passes — see getRepeatedAttemptMissions
 * for that, since a candidate who eventually passed after many attempts is
 * a distinct signal from one who never passed at all.
 * @param {RawCandidate} candidate
 * @returns {ClassifiedMission[]} missions with status === 'failed'
 */
function getFailedMissions(candidate) {
  return classifyAllMissions(candidate).filter((m) => m.status === 'failed');
}

/**
 * Q: "What did they skip?"
 * @param {RawCandidate} candidate
 * @returns {ClassifiedMission[]} missions with status === 'skipped'
 */
function getSkippedMissions(candidate) {
  return classifyAllMissions(candidate).filter((m) => m.status === 'skipped');
}

/**
 * Q: "Which topics had repeated attempts?"
 * Returns any mission (completed or failed — skipped missions have no
 * attempts field and are excluded) whose attempts count meets/exceeds the
 * threshold, sorted by attempts descending so the most-struggled-with
 * topics come first.
 * @param {RawCandidate} candidate
 * @param {number} [threshold=3]
 * @returns {ClassifiedMission[]}
 */
function getRepeatedAttemptMissions(candidate, threshold = DEFAULT_REPEATED_ATTEMPTS_THRESHOLD) {
  return classifyAllMissions(candidate)
    .filter((m) => typeof m.attempts === 'number' && m.attempts >= threshold)
    .sort((a, b) => (b.attempts ?? 0) - (a.attempts ?? 0));
}

/**
 * Learning signals plus a couple of simple derived rates. Both rates are
 * computed directly from fields already present on the candidate
 * (signals + mission list) — nothing outside the source data is used.
 *
 * NOTE on `completionRate`: `signals.missionsCompleted` reflects the
 * candidate's full 31-day cohort record, while `candidate.missions` in
 * candidates.json is only a *sample* of missions (the ones relevant to
 * this interview dataset). Because of that, `missionsCompleted` can be
 * larger than `totalMissionsListed`, so this ratio can exceed 1 — it's
 * exposed as-is (not clamped or reinterpreted) so the engine can decide
 * how to use it; `firstTryRate` is the more reliable of the two since
 * both its inputs come from the same `signals` block.
 *
 * @param {RawCandidate} candidate
 * @returns {{
 *   commitDays: number,
 *   missionsCompleted: number,
 *   missionsFirstTry: number,
 *   totalMissionsListed: number,
 *   firstTryRate: number,
 *   completionRate: number
 * }}
 */
function getLearningSignals(candidate) {
  const signals = getSignals(candidate);
  const totalMissionsListed = candidate.missions.length;
  const firstTryRate = signals.missionsCompleted > 0
    ? Number((signals.missionsFirstTry / signals.missionsCompleted).toFixed(2))
    : 0;
  const completionRate = totalMissionsListed > 0
    ? Number((signals.missionsCompleted / totalMissionsListed).toFixed(2))
    : 0;
  return { ...signals, totalMissionsListed, firstTryRate, completionRate };
}

/**
 * One-call bundle covering completed / failed / skipped / repeated-attempts
 * for a candidate, plus their profile and signals. Useful as a single
 * input object for prompt-building in the interview engine.
 * @param {RawCandidate} candidate
 * @param {{ repeatedAttemptsThreshold?: number }} [options]
 */
function getCandidateSummary(candidate, options = {}) {
  const threshold = options.repeatedAttemptsThreshold ?? DEFAULT_REPEATED_ATTEMPTS_THRESHOLD;
  return {
    profile: getProfile(candidate),
    signals: getLearningSignals(candidate),
    completed: getCompletedMissions(candidate),
    failed: getFailedMissions(candidate),
    skipped: getSkippedMissions(candidate),
    repeatedAttempts: getRepeatedAttemptMissions(candidate, threshold),
  };
}

module.exports = {
  DEFAULT_REPEATED_ATTEMPTS_THRESHOLD,
  getCompletedMissions,
  getFailedMissions,
  getSkippedMissions,
  getRepeatedAttemptMissions,
  getLearningSignals,
  getCandidateSummary,
};
