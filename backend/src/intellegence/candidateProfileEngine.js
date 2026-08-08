'use strict';

/**
 * Candidate Intelligence Engine
 * ==============================
 * Pure, deterministic transformation: (candidate, curriculum data) -> structured profile.
 *
 * No LLM calls. No randomness. No timestamps. No network I/O. Given the
 * same candidate record and the same options, buildCandidateProfile()
 * always returns the same output — verified in scripts/testCandidateProfileEngine.js
 * by calling it twice and diffing.
 *
 * This module composes the lower layers already built:
 *   - candidateModel / curriculumModel   (typed raw lookups)
 *   - candidateIntelligence              (completed/failed/skipped/repeated)
 *   - curriculumIntelligence             (mission days grounded in curriculum)
 *   - probingEngine                      (per-day probe-worthiness ranking)
 *
 * Two rules from the spec are load-bearing and are called out at every
 * point they apply in this file:
 *
 *   (A) A SKIPPED topic is NOT automatically a weakness.
 *       Skips are only escalated into weakRiskyAreas when there is
 *       CORROBORATING evidence in the same curriculum module — i.e. the
 *       candidate also failed or repeatedly struggled with another day in
 *       that same module. Otherwise a skip is just "unverified," and is
 *       reported separately, not as a risk.
 *
 *   (B) A PASSED mission is NOT proof of deep mastery.
 *       "Demonstrated strength" is only claimed for missions passed in a
 *       single attempt (attempts === 1) — the strongest signal available
 *       in this dataset, and it's still just a signal, not a guarantee.
 *       Passes that took several attempts are never counted as strengths;
 *       they're routed to repeatedAttemptTopics instead (see rule C).
 *
 *   (C) Repeated attempts are a LEARNING SIGNAL, not a verdict.
 *       A mission with attempts >= threshold is reported in
 *       repeatedAttemptTopics regardless of whether it was ultimately
 *       passed or failed, with its outcome attached — "struggled but got
 *       there" and "struggled and didn't" are both useful, different
 *       signals for the interviewer, and are kept distinct from both
 *       strengths and outright failures.
 */

const { getProfile } = require('../models/candidateModel');
const {
  DEFAULT_REPEATED_ATTEMPTS_THRESHOLD,
  getLearningSignals,
  getCompletedMissions,
  getFailedMissions,
  getSkippedMissions,
  getRepeatedAttemptMissions,
} = require('./candidateIntelligence');
const {
  getRelevantCurriculumDays,
  getRelevantDaysByModule,
} = require('./curriculumIntelligence');
const { getTopicsForDeeperProbing } = require('./probingEngine');

/** @typedef {import('../models/types').RawCandidate} RawCandidate */
/** @typedef {import('./curriculumIntelligence').RelevantDay} RelevantDay */

/** A mission is treated as a "clean, single-attempt pass" at this threshold. */
const STRENGTH_ATTEMPTS_MAX = 1;

/**
 * A completed mission is flagged "risky despite passing" once attempts
 * reach this level — separate from (higher than) the general repeated-
 * attempts threshold, because passing after a lot of struggle is a softer
 * risk signal than failing outright, and deserves its own bar.
 */
const RISKY_PASS_ATTEMPTS_MIN = 4;

const DIFFICULTY_LEVELS = ['foundational', 'intermediate', 'advanced'];

/**
 * Builds the list of "demonstrated strengths."
 * Rule (B): only single-attempt passes qualify. This is deliberately the
 * narrowest possible claim the data supports.
 * @param {RawCandidate} candidate
 * @param {RelevantDay[]} relevantDays
 * @returns {{day:number, title:string, module:string|null, reason:string}[]}
 */
function computeStrengths(candidate, relevantDays) {
  return relevantDays
    .filter((d) => d.candidateStatus === 'completed' && d.attempts === STRENGTH_ATTEMPTS_MAX)
    .map((d) => ({
      day: d.day,
      title: d.title,
      module: d.module ? d.module.title : null,
      reason: `Passed on the first attempt — the strongest available signal of comfort with this topic (not a guarantee of deep mastery).`,
    }));
}

/**
 * Builds weak/risky areas from two sources:
 *  1. Explicit failures (definite risk).
 *  2. Passes that only succeeded after many attempts (soft risk — mastery
 *     is uncertain even though the mission is technically "complete").
 *  3. Skips ONLY when corroborated by a failure/heavy-struggle elsewhere
 *     in the same curriculum module (rule A) — never on their own.
 *
 * @param {RawCandidate} candidate
 * @param {RelevantDay[]} relevantDays
 * @param {number} repeatedAttemptsThreshold
 * @returns {{day:number, title:string, module:string|null, kind:string, reason:string}[]}
 */
function computeWeakRiskyAreas(candidate, relevantDays, repeatedAttemptsThreshold) {
  const areas = [];

  // 1. Explicit failures.
  for (const d of relevantDays) {
    if (d.candidateStatus === 'failed') {
      areas.push({
        day: d.day,
        title: d.title,
        module: d.module ? d.module.title : null,
        kind: 'failed',
        reason: `Did not pass after ${d.attempts ?? 'multiple'} attempt(s).`,
      });
    }
  }

  // 2. Passed only after heavy struggle.
  for (const d of relevantDays) {
    if (d.candidateStatus === 'completed' && typeof d.attempts === 'number' && d.attempts >= RISKY_PASS_ATTEMPTS_MIN) {
      areas.push({
        day: d.day,
        title: d.title,
        module: d.module ? d.module.title : null,
        kind: 'passed-with-heavy-struggle',
        reason: `Eventually passed, but needed ${d.attempts} attempts — mastery is uncertain despite the pass.`,
      });
    }
  }

  // 3. Skips corroborated by a failure or heavy-struggle mission in the
  //    SAME module. A skip with no such corroboration is left out of this
  //    list entirely (rule A) — it appears only in skippedTopics.
  const byModule = getRelevantDaysByModule(candidate);
  for (const [, daysInModule] of byModule) {
    const hasCorroboratingStruggle = daysInModule.some(
      (d) =>
        d.candidateStatus === 'failed' ||
        (d.candidateStatus === 'completed' && typeof d.attempts === 'number' && d.attempts >= repeatedAttemptsThreshold)
    );
    if (!hasCorroboratingStruggle) continue;

    for (const d of daysInModule) {
      if (d.candidateStatus === 'skipped') {
        areas.push({
          day: d.day,
          title: d.title,
          module: d.module ? d.module.title : null,
          kind: 'skipped-with-corroborating-struggle',
          reason: `Skipped, and this candidate also struggled with or failed another topic in the same module ("${d.module ? d.module.title : 'module'}") — worth verifying directly rather than assuming a gap.`,
        });
      }
    }
  }

  return areas.sort((a, b) => a.day - b.day);
}

/**
 * Builds the skippedTopics list — every skip, reported neutrally.
 * Each entry notes whether it was ALSO escalated into weakRiskyAreas, so
 * a caller only reading skippedTopics still sees that flag, without this
 * list itself implying risk by default (rule A).
 * @param {RelevantDay[]} relevantDays
 * @param {{day:number, kind:string}[]} weakRiskyAreas
 * @returns {{day:number, title:string, module:string|null, flaggedAsRisky:boolean}[]}
 */
function computeSkippedTopics(relevantDays, weakRiskyAreas) {
  const riskyDaySet = new Set(
    weakRiskyAreas.filter((a) => a.kind === 'skipped-with-corroborating-struggle').map((a) => a.day)
  );
  return relevantDays
    .filter((d) => d.candidateStatus === 'skipped')
    .map((d) => ({
      day: d.day,
      title: d.title,
      module: d.module ? d.module.title : null,
      flaggedAsRisky: riskyDaySet.has(d.day),
    }));
}

/**
 * Distinct curriculum modules this candidate actually engaged with
 * (attempted or skipped), each with a small rollup of outcomes.
 * @param {RawCandidate} candidate
 * @returns {{n:number, title:string, daysTouched:number, completed:number, failed:number, skipped:number}[]}
 */
function computeRelevantModules(candidate) {
  const byModule = getRelevantDaysByModule(candidate);
  const result = [];
  for (const [moduleNumber, days] of byModule) {
    const title = days[0]?.module?.title ?? 'Unmatched';
    result.push({
      n: moduleNumber,
      title,
      daysTouched: days.length,
      completed: days.filter((d) => d.candidateStatus === 'completed').length,
      failed: days.filter((d) => d.candidateStatus === 'failed').length,
      skipped: days.filter((d) => d.candidateStatus === 'skipped').length,
    });
  }
  return result.sort((a, b) => a.n - b.n);
}

/**
 * Deterministic, rule-based difficulty recommendation. Every rule is an
 * explicit, explainable threshold — no opaque weighted score — so a
 * reviewer can see exactly why a candidate landed at a given level.
 *
 * Inputs used: yearsExperience (from candidate.json, not invented),
 * firstTryRate (derived from signals already on the candidate), and the
 * counts already computed above (failures, heavy-struggle passes).
 *
 * @param {RawCandidate} candidate
 * @param {ReturnType<typeof getLearningSignals>} signals
 * @param {number} failedCount
 * @param {number} heavyStruggleCount
 * @returns {{level: 'foundational'|'intermediate'|'advanced', reason: string}}
 */
function computeRecommendedDifficulty(candidate, signals, failedCount, heavyStruggleCount) {
  const years = candidate.member.yearsExperience;

  // Strong candidate: senior experience, reliable first-try rate, no outright failures.
  if (years >= 8 && signals.firstTryRate >= 0.5 && failedCount === 0) {
    // Even here, heavy repeated-attempt passes pull it back down one notch —
    // experience alone doesn't override an observed struggle signal.
    if (heavyStruggleCount >= 2) {
      return {
        level: 'intermediate',
        reason: `${years}y experience and a ${Math.round(signals.firstTryRate * 100)}% first-try rate suggest strong ability, but ${heavyStruggleCount} topics only passed after heavy struggle — capping at intermediate rather than advanced.`,
      };
    }
    return {
      level: 'advanced',
      reason: `${years}y experience, ${Math.round(signals.firstTryRate * 100)}% first-try rate, and zero outright failures support starting at an advanced difficulty.`,
    };
  }

  // Mid-tier: some experience, decent first-try rate, at most one failure.
  if (years >= 3 && signals.firstTryRate >= 0.3 && failedCount <= 1) {
    return {
      level: 'intermediate',
      reason: `${years}y experience with a ${Math.round(signals.firstTryRate * 100)}% first-try rate and ${failedCount} failure(s) fits an intermediate starting difficulty.`,
    };
  }

  // Everyone else: junior, low first-try rate, or multiple failures.
  return {
    level: 'foundational',
    reason: `${years}y experience, ${Math.round(signals.firstTryRate * 100)}% first-try rate, and ${failedCount} failure(s) suggest starting at a foundational difficulty and adapting upward if they perform well.`,
  };
}

/**
 * Recommended starting topics for the interview: one confidence-building
 * warm-up (their strongest single-attempt pass, if any) followed by the
 * highest-signal items from the probing ranking (skips/failures first,
 * then heavy-struggle passes), deduplicated, up to `limit`.
 *
 * @param {RawCandidate} candidate
 * @param {{day:number, title:string, module:string|null}[]} strengths
 * @param {number} repeatedAttemptsThreshold
 * @param {number} limit
 * @returns {{day:number, title:string, module:string|null, role:'warm-up'|'primary-probe', reason:string}[]}
 */
function computeRecommendedStartingTopics(candidate, strengths, repeatedAttemptsThreshold, limit) {
  const ranked = getTopicsForDeeperProbing(candidate, { repeatedAttemptsThreshold });
  const topics = [];
  const usedDays = new Set();

  if (strengths.length > 0) {
    const warmUp = strengths[0];
    topics.push({
      day: warmUp.day,
      title: warmUp.title,
      module: warmUp.module,
      role: 'warm-up',
      reason: 'Open with a topic they passed cleanly to build rapport before probing weaker areas.',
    });
    usedDays.add(warmUp.day);
  }

  for (const p of ranked) {
    if (topics.length >= limit) break;
    if (usedDays.has(p.day.day)) continue;
    topics.push({
      day: p.day.day,
      title: p.day.title,
      module: p.day.module ? p.day.module.title : null,
      role: 'primary-probe',
      reason: p.reason,
    });
    usedDays.add(p.day.day);
  }

  return topics.slice(0, limit);
}

/**
 * Builds the full deterministic Candidate Intelligence profile.
 *
 * @param {RawCandidate} candidate
 * @param {{ repeatedAttemptsThreshold?: number, startingTopicsLimit?: number }} [options]
 * @returns {object} structured internal profile — see fields below
 */
function buildCandidateProfile(candidate, options = {}) {
  if (!candidate || !candidate.member || !Array.isArray(candidate.missions)) {
    throw new Error('buildCandidateProfile: expected a full candidate record with member + missions');
  }

  const repeatedAttemptsThreshold = options.repeatedAttemptsThreshold ?? DEFAULT_REPEATED_ATTEMPTS_THRESHOLD;
  const startingTopicsLimit = options.startingTopicsLimit ?? 4;

  const profile = getProfile(candidate);
  const signals = getLearningSignals(candidate);
  const relevantDays = getRelevantCurriculumDays(candidate);

  const completed = getCompletedMissions(candidate);
  const failed = getFailedMissions(candidate);
  const skipped = getSkippedMissions(candidate);
  const repeatedAttempts = getRepeatedAttemptMissions(candidate, repeatedAttemptsThreshold);

  const strengths = computeStrengths(candidate, relevantDays);
  const weakRiskyAreas = computeWeakRiskyAreas(candidate, relevantDays, repeatedAttemptsThreshold);
  const skippedTopics = computeSkippedTopics(relevantDays, weakRiskyAreas);
  const relevantCurriculumModules = computeRelevantModules(candidate);
  const recommendedDifficulty = computeRecommendedDifficulty(
    candidate,
    signals,
    failed.length,
    weakRiskyAreas.filter((a) => a.kind === 'passed-with-heavy-struggle').length
  );
  const recommendedStartingTopics = computeRecommendedStartingTopics(
    candidate,
    strengths,
    repeatedAttemptsThreshold,
    startingTopicsLimit
  );

  return {
    candidateSummary: {
      id: profile.id,
      name: profile.name,
      jobRole: profile.jobRole,
      yearsExperience: profile.yearsExperience,
      education: profile.education,
      status: profile.status,
      signals,
      totals: {
        completed: completed.length,
        failed: failed.length,
        skipped: skipped.length,
        repeatedAttempts: repeatedAttempts.length,
      },
    },
    strengths,
    weakRiskyAreas,
    repeatedAttemptTopics: repeatedAttempts.map((m) => ({
      day: m.day,
      title: m.title,
      attempts: m.attempts,
      outcome: m.status, // 'completed' or 'failed' — struggled-then-passed vs struggled-and-failed
      reason: `Took ${m.attempts} attempts (>= threshold of ${repeatedAttemptsThreshold}) — a learning-effort signal, tracked independently of pass/fail.`,
    })),
    failedTopics: failed.map((m) => ({ day: m.day, title: m.title, attempts: m.attempts })),
    skippedTopics,
    relevantCurriculumModules,
    recommendedDifficulty,
    recommendedStartingTopics,
  };
}

module.exports = {
  DIFFICULTY_LEVELS,
  STRENGTH_ATTEMPTS_MAX,
  RISKY_PASS_ATTEMPTS_MIN,
  buildCandidateProfile,
};
