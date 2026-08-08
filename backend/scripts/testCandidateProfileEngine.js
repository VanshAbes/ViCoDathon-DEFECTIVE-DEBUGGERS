'use strict';

/**
 * Dev-only test for the Candidate Intelligence Engine.
 * Run with: node backend/scripts/testCandidateProfileEngine.js
 * Not the API — just verifies buildCandidateProfile() against real data.
 */

const intel = require('../src/intelligence');

const allCandidates = intel.getAllCandidates();

// ---------------------------------------------------------------------
// 1. Determinism check across EVERY candidate in the dataset: calling
//    buildCandidateProfile() twice on the same input must produce a
//    byte-identical result.
// ---------------------------------------------------------------------
let determinismFailures = 0;
for (const candidate of allCandidates) {
  const a = JSON.stringify(intel.buildCandidateProfile(candidate));
  const b = JSON.stringify(intel.buildCandidateProfile(candidate));
  if (a !== b) {
    determinismFailures++;
    console.error(`NOT DETERMINISTIC: ${candidate.member.id}`);
  }
}
console.log(
  determinismFailures === 0
    ? `✔ Determinism check passed for all ${allCandidates.length} candidates.`
    : `✘ Determinism check FAILED for ${determinismFailures} candidate(s).`
);

// ---------------------------------------------------------------------
// 2. Rule sanity checks called out explicitly in the spec:
//    (A) a skip alone must never appear in weakRiskyAreas
//    (B) a multi-attempt pass must never appear in strengths
// ---------------------------------------------------------------------
let ruleAViolations = 0;
let ruleBViolations = 0;
for (const candidate of allCandidates) {
  const p = intel.buildCandidateProfile(candidate);

  // Rule A: every skip in weakRiskyAreas must have a corroborating
  // struggle signal elsewhere in the same module (we just re-check the
  // invariant holds: any skip-derived weakRiskyAreas entry has kind
  // 'skipped-with-corroborating-struggle', never a bare skip).
  const bareSkipsInWeakAreas = p.weakRiskyAreas.filter(
    (a) => a.kind && a.kind.startsWith('skipped') && a.kind !== 'skipped-with-corroborating-struggle'
  );
  if (bareSkipsInWeakAreas.length > 0) {
    ruleAViolations++;
    console.error(`RULE A VIOLATION (${candidate.member.id}):`, bareSkipsInWeakAreas);
  }

  // Rule B: strengths must only contain attempts === 1.
  const badStrengths = p.strengths.filter((s) => s.reason.includes('first attempt') === false);
  // Cross-check directly against source data too.
  for (const s of p.strengths) {
    const mission = candidate.missions.find((m) => m.day === s.day);
    if (!mission || mission.attempts !== 1) {
      ruleBViolations++;
      console.error(`RULE B VIOLATION (${candidate.member.id}): strength claimed for`, s, 'source mission:', mission);
    }
  }
}
console.log(
  ruleAViolations === 0
    ? '✔ Rule A (skips are not auto-weaknesses) holds for all candidates.'
    : `✘ Rule A violated ${ruleAViolations} time(s).`
);
console.log(
  ruleBViolations === 0
    ? '✔ Rule B (only first-try passes count as strengths) holds for all candidates.'
    : `✘ Rule B violated ${ruleBViolations} time(s).`
);

// ---------------------------------------------------------------------
// 3. Print full profiles for a diverse sample so the output can be
//    read and judged manually.
// ---------------------------------------------------------------------
const sampleIds = [
  'CAND-009', // near-perfect: all first-try, no fails/skips
  'CAND-011', // heavy skipper, no fails
  'CAND-010', // has genuine failures
  'CAND-017', // junior, everything passed but only after many attempts
  'CAND-008', // senior, deliberately skipped fine-tuning days
];

for (const id of sampleIds) {
  const candidate = intel.getCandidateById(id);
  if (!candidate) continue;
  const profile = intel.buildCandidateProfile(candidate);
  console.log(`\n\n########## ${profile.candidateSummary.name} (${id}) — ${profile.candidateSummary.jobRole} ##########`);
  console.log(JSON.stringify(profile, null, 2));
}

console.log('\n\nDone.');
