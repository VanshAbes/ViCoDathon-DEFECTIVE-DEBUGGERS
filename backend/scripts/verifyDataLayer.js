'use strict';

/**
 * Dev-only sanity check for the data intelligence layer.
 * Run with: node backend/scripts/verifyDataLayer.js
 * This is NOT the API — just a local smoke test of the helper functions.
 */

const intel = require('../src/intellegence');

const candidateId = process.argv[2] || 'CAND-002'; // Alex Turner: mix of pass/repeat/no skips
const candidate = intel.getCandidateById(candidateId);

if (!candidate) {
  console.error(`No candidate found with id ${candidateId}`);
  process.exit(1);
}

console.log(`\n=== ${candidate.member.name} (${candidateId}) ===`);
console.log('Profile:', candidate.member.jobRole, `| ${candidate.member.yearsExperience}y exp`);

console.log('\n-- Completed --');
console.log(intel.getCompletedMissions(candidate).map((m) => `Day ${m.day}: ${m.title}`));

console.log('\n-- Failed / struggled --');
console.log(intel.getFailedMissions(candidate).map((m) => `Day ${m.day}: ${m.title}`));

console.log('\n-- Skipped --');
console.log(intel.getSkippedMissions(candidate).map((m) => `Day ${m.day}: ${m.title}`));

console.log('\n-- Repeated attempts (>=3) --');
console.log(intel.getRepeatedAttemptMissions(candidate).map((m) => `Day ${m.day}: ${m.title} (${m.attempts} attempts)`));

console.log('\n-- Learning signals --');
console.log(intel.getLearningSignals(candidate));

console.log('\n-- Relevant curriculum days (grounded) --');
for (const d of intel.getRelevantCurriculumDays(candidate)) {
  console.log(`Day ${d.day} [${d.module ? d.module.title : 'no module'}] ${d.title} — ${d.candidateStatus}${d.attempts ? ` (${d.attempts} attempts)` : ''}`);
}

console.log('\n-- Topics deserving deeper probing (ranked) --');
for (const p of intel.getTopicsForDeeperProbing(candidate)) {
  console.log(`[score ${p.score}] Day ${p.day.day}: ${p.reason} => ${p.probeStyle}`);
}

console.log('\n-- Coverage check: distinct curriculum days & modules touched --');
const byModule = intel.getRelevantDaysByModule(candidate);
console.log(
  `Distinct days: ${intel.getRelevantCurriculumDays(candidate).length}, distinct modules: ${byModule.size}`
);

console.log('\nOK — data intelligence layer responded for all six questions.\n');
