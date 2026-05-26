-- Drop the global unique index on MockExamParticipant.publicId.
-- A DaF student reuses their Student.id as publicId across every mock they
-- sign up for; with the global unique constraint, the second registration
-- would always hit P2002 and be misreported as "already registered for this
-- exam". Per-exam uniqueness is still enforced by
-- @@unique([examId, publicId]) (index MockExamParticipant_examId_publicId_key).

DROP INDEX IF EXISTS "MockExamParticipant_publicId_key";
