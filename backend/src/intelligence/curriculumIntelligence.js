'use strict';

const { classifyAllMissions } = require('../models/candidateModel');
const { getDayByNumber, getModuleForDay } = require('../models/curriculumModel');

/** @typedef {import('../models/types').RawCandidate} RawCandidate */
/** @typedef {import('../models/types').CurriculumDay} CurriculumDay */

/**
 * A curriculum day enriched with this specific candidate's outcome on it.
 * @typedef {Object} RelevantDay
 * @property {number} day
 * @property {string} title
 * @property {string} type
 * @property {string[]} tools
 * @property {string[]} objectives
 * @property {{n:number, title:string}|null} module
 * @property {'completed'|'failed'|'skipped'} candidateStatus
 * @property {number|null} attempts
 */

/**
 * Q: "Which curriculum days are relevant [to this candidate]?"
 *
 * A day is relevant if it appears in the candidate's own mission list —
 * i.e. it's a day they actually engaged with (attempted or explicitly
 * skipped), so grounding an interview question in it is meaningful rather
 * than generic. Each result is enriched with the real curriculum content
 * (title/type/tools/objectives/module) so the interview engine never has
 * to fabricate what a day covered.
 *
 * Missions referencing a day number not found in curriculum.json are
 * silently skipped (defensive — the two source files are independent).
 *
 * @param {RawCandidate} candidate
 * @returns {RelevantDay[]} sorted by day number ascending
 */
function getRelevantCurriculumDays(candidate) {
  const classified = classifyAllMissions(candidate);

  return classified
    .map((mission) => {
      const curriculumDay = getDayByNumber(mission.day);
      if (!curriculumDay) return null;
      const mod = getModuleForDay(mission.day);
      return {
        day: curriculumDay.day,
        title: curriculumDay.title,
        type: curriculumDay.type,
        tools: [...curriculumDay.tools],
        objectives: [...curriculumDay.objectives],
        module: mod ? { n: mod.n, title: mod.title } : null,
        candidateStatus: mission.status,
        attempts: mission.attempts,
      };
    })
    .filter((d) => d !== null)
    .sort((a, b) => a.day - b.day);
}

/**
 * Groups a candidate's relevant days by curriculum module number, so the
 * interview engine can check module/day coverage (e.g. "at least 4
 * distinct curriculum days across different modules").
 * @param {RawCandidate} candidate
 * @returns {Map<number, RelevantDay[]>} keyed by module number (0 if unmatched)
 */
function getRelevantDaysByModule(candidate) {
  const days = getRelevantCurriculumDays(candidate);
  const grouped = new Map();
  for (const d of days) {
    const key = d.module ? d.module.n : 0;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(d);
  }
  return grouped;
}

module.exports = {
  getRelevantCurriculumDays,
  getRelevantDaysByModule,
};
