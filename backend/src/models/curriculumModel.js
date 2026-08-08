'use strict';

const { loadData } = require('../data/loadData');

/** @typedef {import('./types').CurriculumDay} CurriculumDay */
/** @typedef {import('./types').CurriculumModule} CurriculumModule */
/** @typedef {import('./types').RawCurriculum} RawCurriculum */

/**
 * @returns {RawCurriculum}
 */
function getCurriculum() {
  return loadData().curriculum;
}

/**
 * @returns {CurriculumDay[]}
 */
function getAllDays() {
  return getCurriculum().days;
}

/**
 * @returns {CurriculumModule[]}
 */
function getAllModules() {
  return getCurriculum().modules;
}

/**
 * @param {number} dayNumber
 * @returns {CurriculumDay|undefined}
 */
function getDayByNumber(dayNumber) {
  return getAllDays().find((d) => d.day === dayNumber);
}

/**
 * Finds the module that owns a given day, using the module's [start, end]
 * inclusive day range.
 * @param {number} dayNumber
 * @returns {CurriculumModule|undefined}
 */
function getModuleForDay(dayNumber) {
  return getAllModules().find(
    (m) => dayNumber >= m.days[0] && dayNumber <= m.days[1]
  );
}

/**
 * @param {number} dayNumber
 * @returns {string[]} objectives for that day, or [] if the day doesn't exist
 */
function getObjectivesForDay(dayNumber) {
  const day = getDayByNumber(dayNumber);
  return day ? [...day.objectives] : [];
}

/**
 * @param {number} dayNumber
 * @returns {string[]} tools for that day, or [] if the day doesn't exist
 */
function getToolsForDay(dayNumber) {
  const day = getDayByNumber(dayNumber);
  return day ? [...day.tools] : [];
}

/**
 * Returns full curriculum day records for a list of day numbers, in the
 * order given, silently skipping day numbers that don't exist in the
 * curriculum (defensive — candidate data and curriculum data are separate
 * source files and could in principle drift).
 * @param {number[]} dayNumbers
 * @returns {CurriculumDay[]}
 */
function getDaysByNumbers(dayNumbers) {
  const byNumber = new Map(getAllDays().map((d) => [d.day, d]));
  return dayNumbers
    .map((n) => byNumber.get(n))
    .filter((d) => Boolean(d));
}

/**
 * Returns all curriculum days belonging to a given module number.
 * @param {number} moduleNumber
 * @returns {CurriculumDay[]}
 */
function getDaysForModule(moduleNumber) {
  const mod = getAllModules().find((m) => m.n === moduleNumber);
  if (!mod) return [];
  const [start, end] = mod.days;
  return getAllDays().filter((d) => d.day >= start && d.day <= end);
}

module.exports = {
  getCurriculum,
  getAllDays,
  getAllModules,
  getDayByNumber,
  getModuleForDay,
  getObjectivesForDay,
  getToolsForDay,
  getDaysByNumbers,
  getDaysForModule,
};
