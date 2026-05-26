-- Per-subject pass threshold. Nullable: when null the subject has no
-- explicit pass bar (only the exam-level passingScore applies).
ALTER TABLE "MockExamSubject" ADD COLUMN "passingScore" DOUBLE PRECISION;
