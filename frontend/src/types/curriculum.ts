/**
 * Mirrors the shape of the provided `curriculum.json`.
 */

export type CurriculumDayType =
  | "SETUP"
  | "BUILD"
  | "LEARN"
  | "SHIP_IT"
  | "OPTIMIZE"
  | "CAPSTONE";

export interface CurriculumModule {
  n: number;
  title: string;
  /** Inclusive [startDay, endDay] range. */
  days: [number, number];
}

export interface CurriculumDay {
  day: number;
  title: string;
  type: CurriculumDayType | string;
  tools: string[];
  objectives: string[];
}

export interface Curriculum {
  cohort: string;
  modules: CurriculumModule[];
  days: CurriculumDay[];
}
