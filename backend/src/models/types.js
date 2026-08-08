/**
 * Shared type definitions for the data intelligence layer.
 *
 * These are JSDoc typedefs only (no runtime code / no build step required),
 * so editors and IDEs get type-checking and autocomplete without adding
 * TypeScript tooling to a 48h hackathon backend.
 *
 * Shapes here mirror candidates.json and curriculum.json EXACTLY as
 * supplied — no fields are invented or assumed beyond what the source
 * files contain.
 */

/**
 * A single mission attempt record from candidates.json.
 * A mission is either:
 *   - skipped: { day, title, skipped: true }                (no attempts field)
 *   - attempted: { day, title, passed: true|false, attempts: number }
 *
 * @typedef {Object} RawMission
 * @property {number} day
 * @property {string} title
 * @property {boolean} [passed]   - present only when attempted (not skipped)
 * @property {boolean} [skipped]  - present only when skipped (not attempted)
 * @property {number} [attempts]  - present only when attempted (not skipped)
 */

/**
 * @typedef {Object} CandidateProfile
 * @property {string} id
 * @property {string} name
 * @property {string} jobRole
 * @property {number} yearsExperience
 * @property {string} education
 * @property {string} status
 */

/**
 * @typedef {Object} CandidateSignals
 * @property {number} commitDays
 * @property {number} missionsCompleted
 * @property {number} missionsFirstTry
 */

/**
 * A raw candidate record exactly as shaped in candidates.json.
 * @typedef {Object} RawCandidate
 * @property {CandidateProfile} member
 * @property {RawMission[]} missions
 * @property {CandidateSignals} signals
 */

/**
 * A curriculum day exactly as shaped in curriculum.json.
 * @typedef {Object} CurriculumDay
 * @property {number} day
 * @property {string} title
 * @property {string} type       - e.g. SETUP, BUILD, LEARN, SHIP_IT, OPTIMIZE, CAPSTONE
 * @property {string[]} tools
 * @property {string[]} objectives
 */

/**
 * A curriculum module exactly as shaped in curriculum.json.
 * @typedef {Object} CurriculumModule
 * @property {number} n
 * @property {string} title
 * @property {[number, number]} days - inclusive [startDay, endDay] range
 */

/**
 * The full curriculum document exactly as shaped in curriculum.json.
 * @typedef {Object} RawCurriculum
 * @property {string} cohort
 * @property {CurriculumModule[]} modules
 * @property {CurriculumDay[]} days
 */

module.exports = {};
