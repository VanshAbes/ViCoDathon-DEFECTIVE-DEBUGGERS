'use strict';

/**
 * Public surface of the data intelligence layer. The interview engine
 * (built in a later step) should import from here rather than reaching
 * into models/ or data/ directly.
 */

const candidateModel = require('../models/candidateModel');
const curriculumModel = require('../models/curriculumModel');
const candidateIntelligence = require('./candidateIntelligence');
const curriculumIntelligence = require('./curriculumIntelligence');
const probingEngine = require('./probingEngine');

module.exports = {
  // raw lookups
  getAllCandidates: candidateModel.getAllCandidates,
  getCandidateById: candidateModel.getCandidateById,
  getAllCurriculumDays: curriculumModel.getAllDays,
  getAllCurriculumModules: curriculumModel.getAllModules,
  getCurriculumDayByNumber: curriculumModel.getDayByNumber,
  getModuleForDay: curriculumModel.getModuleForDay,

  // Q: What has this candidate completed?
  getCompletedMissions: candidateIntelligence.getCompletedMissions,

  // Q: What did they struggle with?
  getFailedMissions: candidateIntelligence.getFailedMissions,

  // Q: What did they skip?
  getSkippedMissions: candidateIntelligence.getSkippedMissions,

  // Q: Which topics had repeated attempts?
  getRepeatedAttemptMissions: candidateIntelligence.getRepeatedAttemptMissions,

  // Q: Which curriculum days are relevant?
  getRelevantCurriculumDays: curriculumIntelligence.getRelevantCurriculumDays,
  getRelevantDaysByModule: curriculumIntelligence.getRelevantDaysByModule,

  // Q: Which topics deserve deeper probing?
  getTopicsForDeeperProbing: probingEngine.getTopicsForDeeperProbing,

  // convenience bundles
  getLearningSignals: candidateIntelligence.getLearningSignals,
  getCandidateSummary: candidateIntelligence.getCandidateSummary,
};
