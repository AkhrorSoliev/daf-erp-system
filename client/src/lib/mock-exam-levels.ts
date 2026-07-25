// CEFR levels a mock exam can offer. Kept in sync with the backend
// `server/src/mock-exams/mock-exam-pricing.util.ts` CEFR_LEVELS. The code
// doubles as the label (A1, A2, ...).

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
