'use strict';

const { loadData } = require('../data/loadData');

/** @typedef {import('./types').RawCandidate} RawCandidate */
/** @typedef {import('./types').RawMission} RawMission */

/**
 * A mission classified into exactly one bucket based on the fields
 * actually present in candidates.json. No inference beyond that.
 * @typedef {Object} ClassifiedMission
 * @property {number} day
 * @property {string} title
 * @property {'completed'|'failed'|'skipped'} status
 * @property {number|null} attempts - null when skipped (no attempts recorded)
 */

/**
 * Classifies a single raw mission using only the fields present on it.
 * - skipped: true            -> 'skipped'
 * - passed: true             -> 'completed'
 * - passed: false            -> 'failed'
 * Any other shape is treated as a data error, not guessed at.
 *
 * @param {RawMission} mission
 * @returns {ClassifiedMission}
 */
function classifyMission(mission) {
  if (mission.skipped === true) {
    return { day: mission.day, title: mission.title, status: 'skipped', attempts: null };
  }
  if (mission.passed === true) {
    return { day: mission.day, title: mission.title, status: 'completed', attempts: mission.attempts ?? null };
  }
  if (mission.passed === false) {
    return { day: mission.day, title: mission.title, status: 'failed', attempts: mission.attempts ?? null };
  }
  throw new Error(
    `Unclassifiable mission on day ${mission.day} ("${mission.title}") — ` +
    `expected "skipped: true" or a boolean "passed" field, found neither.`
  );
}

/**
 * @param {RawCandidate} candidate
 * @returns {ClassifiedMission[]}
 */
function classifyAllMissions(candidate) {
  return candidate.missions.map(classifyMission);
}

/**
 * Returns all candidates from candidates.json, unmodified.
 * @returns {RawCandidate[]}
 */
function getAllCandidates() {
  return loadData().candidates;
}

/**
 * Finds a single candidate by member.id.
 * @param {string} candidateId
 * @returns {RawCandidate|undefined}
 */
function getCandidateById(candidateId) {
  return getAllCandidates().find((c) => c.member.id === candidateId);
}

/**
 * Returns a clean, flat profile view of a candidate — just the
 * member-level fields, nothing derived.
 * @param {RawCandidate} candidate
 * @returns {{id:string, name:string, jobRole:string, yearsExperience:number, education:string, status:string}}
 */
function getProfile(candidate) {
  const { id, name, jobRole, yearsExperience, education, status } = candidate.member;
  return { id, name, jobRole, yearsExperience, education, status };
}

/**
 * Returns the raw learning signals block, unmodified.
 * @param {RawCandidate} candidate
 * @returns {{commitDays:number, missionsCompleted:number, missionsFirstTry:number}}
 */
function getSignals(candidate) {
  return { ...candidate.signals };
}

module.exports = {
  classifyMission,
  classifyAllMissions,
  getAllCandidates,
  getCandidateById,
  getProfile,
  getSignals,
};
