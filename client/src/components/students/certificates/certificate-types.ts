export type CertificateLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface AttendanceTally {
  attended: number;
  late: number;
  absent: number;
  counted: number;
  percent: number | null;
}

export interface AppTally {
  applies: boolean;
  done: number;
  open: number;
  percent: number | null;
}

export interface CertificateVerdict {
  attendanceOk: boolean;
  appOk: boolean | null;
  /** No debt: the balance is not negative. */
  debtOk: boolean;
  /** The counted lessons reach the minimum. */
  lessonsOk: boolean;
  /** Late lessons are within the limit. */
  lateOk: boolean;
  /** Share of the attended lessons that were late, rounded up by the server; null when none attended. */
  latePercent: number | null;
  /** null: the level has no final tests. */
  testsOk: boolean | null;
  eligible: boolean;
  reasons: string[];
}

export interface IssuedCertificate {
  id: string;
  number: string;
  level: string;
  issuedAt: string;
  exempt: boolean;
  revoked: boolean;
  /** ISO instant; null while the document stands. */
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface LevelPreview {
  level: CertificateLevel;
  groupNames: string[];
  courseName: string | null;
  lessonMinutes: number | null;
  from: string;
  to: string;
  attendance: AttendanceTally;
  app: AppTally;
  unitTests: { passed: number; total: number } | null;
  mock: { score: number; maxScore: number; date: string | null } | null;
  thresholds: {
    attendance: number;
    app: number | null;
    /** The fewest counted lessons. */
    minLessons: number;
    /** The most late lessons, percent of the lessons attended. */
    maxLatePercent: number;
  };
  verdict: CertificateVerdict;
  issued: IssuedCertificate[];
}

export interface CertificatePreview {
  studentId: number;
  /** The student's balance now: negative is a debt. */
  balance: number;
  unleveledGroups: string[];
  levels: LevelPreview[];
}
