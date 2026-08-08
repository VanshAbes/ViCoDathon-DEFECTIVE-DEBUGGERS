'use strict';

const fs = require('fs');
const path = require('path');

/** @typedef {import('../models/types').RawCandidate} RawCandidate */
/** @typedef {import('../models/types').RawCurriculum} RawCurriculum */

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CANDIDATES_PATH = path.join(DATA_DIR, 'candidates.json');
const CURRICULUM_PATH = path.join(DATA_DIR, 'curriculum.json');

/**
 * Reads and JSON-parses a local file. Throws a clear error if the file is
 * missing or malformed — fail loudly at boot rather than silently later.
 * @param {string} filePath
 * @returns {any}
 */
function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
}

/**
 * Minimal shape validation so a missing/renamed field in the source data
 * fails fast and clearly instead of causing a confusing bug deep in the
 * interview engine later.
 * @param {any} candidatesDoc
 */
function assertCandidatesShape(candidatesDoc) {
  if (!candidatesDoc || !Array.isArray(candidatesDoc.candidates)) {
    throw new Error('candidates.json: expected a top-level "candidates" array');
  }
  for (const c of candidatesDoc.candidates) {
    if (!c.member || !c.member.id) {
      throw new Error('candidates.json: found a candidate entry missing member.id');
    }
    if (!Array.isArray(c.missions)) {
      throw new Error(`candidates.json: candidate ${c.member.id} is missing a missions array`);
    }
  }
}

/**
 * @param {any} curriculumDoc
 */
function assertCurriculumShape(curriculumDoc) {
  if (!curriculumDoc || !Array.isArray(curriculumDoc.days) || !Array.isArray(curriculumDoc.modules)) {
    throw new Error('curriculum.json: expected top-level "days" and "modules" arrays');
  }
  for (const d of curriculumDoc.days) {
    if (typeof d.day !== 'number' || !d.title) {
      throw new Error('curriculum.json: found a day entry missing "day" or "title"');
    }
  }
}

let _cache = null;

/**
 * Loads both source files once and caches the result in memory for the
 * lifetime of the process. Matches the "avoid unnecessary DBs/infra" and
 * "local-file based" constraints — this is the entire data layer's I/O.
 *
 * @returns {{ candidates: RawCandidate[], curriculum: RawCurriculum }}
 */
function loadData() {
  if (_cache) return _cache;

  const candidatesDoc = readJson(CANDIDATES_PATH);
  const curriculumDoc = readJson(CURRICULUM_PATH);

  assertCandidatesShape(candidatesDoc);
  assertCurriculumShape(curriculumDoc);

  _cache = {
    candidates: candidatesDoc.candidates,
    curriculum: curriculumDoc,
  };
  return _cache;
}

/**
 * Clears the in-memory cache. Exposed for tests only.
 */
function _resetCacheForTests() {
  _cache = null;
}

module.exports = { loadData, _resetCacheForTests, CANDIDATES_PATH, CURRICULUM_PATH };
