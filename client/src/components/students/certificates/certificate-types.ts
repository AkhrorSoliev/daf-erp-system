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
  thresholds: { attendance: number; app: number | null };
  verdict: CertificateVerdict;
  issued: IssuedCertificate[];
}

export interface CertificatePreview {
  studentId: number;
  unleveledGroups: string[];
  levels: LevelPreview[];
}
