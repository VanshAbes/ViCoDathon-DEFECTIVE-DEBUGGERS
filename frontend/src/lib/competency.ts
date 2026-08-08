import { getCurriculumDay } from "@/lib/curriculum";
import type { CurriculumCoverage } from "@/types/curriculumCoverage";
import type { CompetencySignal, CompetencyStatus } from "@/types/competency";
import type { InterviewMessage } from "@/types/interview";

const EVIDENCE_MAX_CHARS = 90;
const STRONG_WORD_THRESHOLD = 12;

function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > EVIDENCE_MAX_CHARS ? `${trimmed.slice(0, EVIDENCE_MAX_CHARS).trimEnd()}…` : trimmed;
}

/**
 * Derives a compact list of competency signals from real inputs only:
 *
 *  - real curriculum topics (from `curriculum.json`, scoped to whichever
 *    days the F4 coverage system says have been covered or are current)
 *  - real candidate message text (used as evidence, only when a topic is
 *    actually mentioned in something the candidate said)
 *
 * This is a coarse, explicitly-labeled heuristic (see the "Mock Signal"
 * badge on `CompetencyPanel`) standing in for a real assessment — it never
 * invents a topic, a quote, or a numeric score. Word count is used only to
 * distinguish "mentioned in passing" from "elaborated on", not as a stand-in
 * for correctness or mastery.
 */
export function deriveCompetencySignals(
  messages: InterviewMessage[],
  coverage: CurriculumCoverage
): CompetencySignal[] {
  const touchedDays = [...coverage.coveredDays, ...(coverage.currentDay !== null ? [coverage.currentDay] : [])];
  const uniqueDays = Array.from(new Set(touchedDays)).sort((a, b) => b - a); // most recent/current first

  const candidateMessages = messages.filter((m) => m.role === "candidate");

  return uniqueDays.reduce<CompetencySignal[]>((signals, day) => {
    const dayMeta = getCurriculumDay(day);
    if (!dayMeta) return signals;

    const topic = dayMeta.tools[0] ?? dayMeta.title;
    const isCurrent = day === coverage.currentDay;

    const match = candidateMessages.find((m) => m.content.toLowerCase().includes(topic.toLowerCase()));

    let status: CompetencyStatus;
    let evidence: string | undefined;

    if (!match) {
      // Reached in curriculum terms, but nothing in the transcript speaks to
      // it yet: distinguish "just arrived here" from "passed through without
      // addressing it".
      status = isCurrent ? "UNCLEAR" : "NEEDS_PROBE";
    } else {
      const wordCount = match.content.trim().split(/\s+/).filter(Boolean).length;
      status = wordCount >= STRONG_WORD_THRESHOLD ? "STRONG" : "DEVELOPING";
      evidence = excerpt(match.content);
    }

    signals.push({ topic, day, status, evidence });
    return signals;
  }, []);
}
