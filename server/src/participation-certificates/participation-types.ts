import type {
  AppTally,
  AttendanceTally,
  GerLevel,
  Thresholds,
  Verdict,
} from './participation-rules';

/** What the database says about one student at one level (read-only). */
export interface LevelFacts {
  level: GerLevel;
  groupNames: string[];
  courseName: string | null;
  lessonMinutes: number | null;
  /** 'YYYY-MM-DD' of the first and the last attendance row of the level. */
  from: string;
  to: string;
  attendance: AttendanceTally;
  app: AppTally;
  /** Open `UNIT_TEST` lessons and how many of them the student passed. */
  unitTests: { passed: number; total: number } | null;
  mock: { score: number; maxScore: number; date: string | null } | null;
}

export interface StudentFacts {
  student: {
    firstName: string;
    lastName: string;
    /** 'YYYY-MM-DD' (the Tashkent day, `storedBirthDay`). */
    dateOfBirth: string | null;
  };
  levels: LevelFacts[];
  /** Groups the student attended whose `level` is empty or not a GER level. */
  unleveledGroups: string[];
}

/** Frozen into `ParticipationCertificate.snapshot`; the PDF reads only this. */
export interface CertificateSnapshot {
  version: 1;
  student: StudentFacts['student'];
  level: GerLevel;
  courseName: string | null;
  groupNames: string[];
  lessonMinutes: number | null;
  from: string;
  to: string;
  attendance: AttendanceTally;
  app: AppTally;
  unitTests: { passed: number; total: number } | null;
  mock: { score: number; maxScore: number; date: string | null } | null;
  thresholds: Thresholds;
  /** Given with a CEO exemption although the verdict was «not eligible». */
  exempt: boolean;
}

export interface IssuedView {
  id: string;
  number: string;
  level: string;
  /** ISO instant. */
  issuedAt: string;
  exempt: boolean;
  revoked: boolean;
  /** ISO instant; null while the document stands. */
  revokedAt: string | null;
  /** Staff only: the public QR answer never carries it. */
  revokedReason: string | null;
}

export interface LevelPreview extends LevelFacts {
  thresholds: Thresholds;
  verdict: Verdict;
  issued: IssuedView[];
}

export interface CertificatePreview {
  studentId: number;
  unleveledGroups: string[];
  levels: LevelPreview[];
}

/** The public QR page. No branch, no birth date, no percentages. */
export interface VerifyView {
  valid: boolean;
  revoked: boolean;
  number: string;
  studentName: string;
  level: string;
  from: string;
  to: string;
  issuedAt: string;
  companyName: string;
}
