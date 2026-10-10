/** Mirrors server/src/contract-documents/contract-view.ts (ADR-0075). */
export type CustomerKind = "SELF" | "PARENT" | "GUARDIAN" | "OTHER";
export type ContractInclude = "DARSLIK" | "MATERIALLAR" | "ICHKI_TEST" | "SERTIFIKAT";
export type EnrollmentState = "ACTIVE" | "FROZEN" | "COMPLETED" | "DROPPED" | "TRANSFERRED";
export type ContractStatus = "UNSIGNED" | "SIGNED" | "CANCELLED";

export interface ContractCustomer {
  kind: CustomerKind;
  kindOther: string | null;
  fullName: string;
  birthDate: string | null;
  passport: string | null;
  address: string | null;
  phone: string | null;
  telegram: string | null;
  email: string | null;
}

export interface ContractCourseFields {
  enrollmentId: string;
  courseName: string;
  level: string | null;
  groupName: string;
  teachers: string[];
  startDate: string;
  days: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  lessonsPerWeek: number;
  lessonMinutes: number | null;
  monthlyPrice: number;
  discountPercent: number;
  firstPaymentAmount: number;
  firstPaymentDate: string | null;
  discountReason: string | null;
  discountFrom: string | null;
  discountTo: string | null;
  includes: ContractInclude[];
}

export interface ContractFields {
  branch: {
    name: string;
    city: string;
    address: string;
    representativeName: string;
    representativePosition: string;
  };
  student: { fullName: string; birthDate: string; isMinor: boolean };
  customer: ContractCustomer;
  courses: ContractCourseFields[];
}

export interface ContractView {
  id: string;
  number: string;
  contractDate: string;
  templateVersion: number;
  status: ContractStatus;
  createdAt: string;
  createdBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  fields: ContractFields;
  links: { enrollmentId: string; status: EnrollmentState; groupName: string }[];
}

export interface UncoveredCourse {
  enrollmentId: string;
  status: EnrollmentState;
  courseName: string;
  groupName: string;
}

export interface ContractsResponse {
  contracts: ContractView[];
  uncovered: UncoveredCourse[];
}

export interface PrefillCourse {
  enrollmentId: string;
  status: EnrollmentState;
  courseName: string;
  groupName: string;
  contractNumber: string | null;
  monthlyPrice: number;
  discountPercent: number;
  firstPaymentAmount: number;
}

export interface ContractPrefill {
  today: string;
  branch: { name: string; missing: string[] };
  student: {
    fullName: string;
    birthDate: string | null;
    isMinor: boolean | null;
    phone: string;
    telegram: string | null;
    passport: string | null;
    address: string | null;
    parentName: string | null;
    parentPhone: string | null;
  };
  lastCustomer: ContractCustomer | null;
  courses: PrefillCourse[];
}
