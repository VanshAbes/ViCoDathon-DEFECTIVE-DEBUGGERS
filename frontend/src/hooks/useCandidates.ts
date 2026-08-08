import { useMemo } from "react";
import candidatesData from "@/data/candidates.json";
import type { Candidate, CandidatesFile } from "@/types/candidate";
import { scoreCandidate, type CandidateScorecard } from "@/lib/curriculum";

export interface CandidateWithScore {
  candidate: Candidate;
  scorecard: CandidateScorecard;
}

/**
 * Loads the candidate roster from the local (copied) data source and joins
 * each candidate with a derived readiness scorecard.
 *
 * TODO(api): once the backend is wired, replace the static import with a
 * fetch to the candidate roster endpoint. The `CandidateWithScore` shape
 * returned here should remain stable so consuming components don't change.
 */
export function useCandidates(): CandidateWithScore[] {
  return useMemo(() => {
    const { candidates } = candidatesData as CandidatesFile;
    return candidates.map((candidate) => ({
      candidate,
      scorecard: scoreCandidate(candidate),
    }));
  }, []);
}

export function useCandidate(id: string | undefined): CandidateWithScore | undefined {
  const all = useCandidates();
  return useMemo(() => all.find((c) => c.candidate.member.id === id), [all, id]);
}
