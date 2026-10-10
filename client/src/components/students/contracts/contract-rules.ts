import { format, parse } from "date-fns";
import type {
  ContractCourseFields,
  ContractCustomer,
  ContractInclude,
  ContractPrefill,
  ContractStatus,
  ContractsResponse,
  ContractView,
  CustomerKind,
  EnrollmentState,
  PrefillCourse,
} from "./contract-types";

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  UNSIGNED: "Imzolanmagan",
  SIGNED: "Imzolangan",
  CANCELLED: "Bekor qilingan",
};

export const LINK_STATE_LABEL: Record<EnrollmentState, string> = {
  ACTIVE: "o'qimoqda",
  FROZEN: "muzlatilgan",
  TRANSFERRED: "guruh almashgan",
  DROPPED: "shu kurs bo'yicha bekor",
  COMPLETED: "yakunlangan",
};

export const CUSTOMER_KINDS: CustomerKind[] = ["SELF", "PARENT", "GUARDIAN", "OTHER"];

export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = {
  SELF: "O'quvchining o'zi",
  PARENT: "Ota-ona",
  GUARDIAN: "Vasiy yoki homiy",
  OTHER: "Boshqa",
};

export const INCLUDES: ContractInclude[] = ["DARSLIK", "MATERIALLAR", "ICHKI_TEST", "SERTIFIKAT"];

export const INCLUDE_LABEL: Record<ContractInclude, string> = {
  DARSLIK: "Darslik",
  MATERIALLAR: "Materiallar",
  ICHKI_TEST: "Ichki test",
  SERTIFIKAT: "Sertifikat",
};

/** Form state: every field a string, "" = not filled. */
export interface CustomerDraft {
  kind: CustomerKind;
  kindOther: string;
  fullName: string;
  birthDate: string;
  passport: string;
  address: string;
  phone: string;
  telegram: string;
  email: string;
}

export interface CourseDraft {
  firstPaymentAmount: string;
  firstPaymentDate: string;
  discountReason: string;
  discountFrom: string;
  discountTo: string;
  includes: ContractInclude[];
}

const text = (v: string | null | undefined): string => v ?? "";
const opt = (v: string): string | undefined => (v.trim() ? v.trim() : undefined);

/** Same rule as the server (`ageOn`): a year is complete on the birthday. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function isMinor(birthDate: string | null, today: string): boolean | null {
  return birthDate ? ageOn(birthDate, today) < 18 : null;
}

export function initialKind(prefill: ContractPrefill): CustomerKind {
  const minor = prefill.student.isMinor === true;
  const last = prefill.lastCustomer?.kind;
  if (last && !(last === "SELF" && minor)) return last;
  return minor ? "PARENT" : "SELF";
}

/** Defaults for a kind: profile first, then what the last contract of that kind had. */
export function customerDraft(kind: CustomerKind, prefill: ContractPrefill): CustomerDraft {
  const st = prefill.student;
  const base: CustomerDraft =
    kind === "SELF"
      ? {
          kind,
          kindOther: "",
          fullName: st.fullName,
          birthDate: text(st.birthDate),
          passport: text(st.passport),
          address: text(st.address),
          phone: text(st.phone),
          telegram: text(st.telegram),
          email: "",
        }
      : {
          kind,
          kindOther: "",
          fullName: text(st.parentName),
          birthDate: "",
          passport: "",
          address: text(st.address),
          phone: text(st.parentPhone),
          telegram: "",
          email: "",
        };
  const last = prefill.lastCustomer;
  if (!last || last.kind !== kind) return base;
  return {
    kind,
    kindOther: text(last.kindOther),
    fullName: kind === "SELF" ? base.fullName : last.fullName || base.fullName,
    birthDate: kind === "SELF" ? base.birthDate : text(last.birthDate),
    passport: text(last.passport) || base.passport,
    address: text(last.address) || base.address,
    phone: text(last.phone) || base.phone,
    telegram: text(last.telegram) || base.telegram,
    email: text(last.email),
  };
}

export function customerDraftFromFields(c: ContractCustomer): CustomerDraft {
  return {
    kind: c.kind,
    kindOther: text(c.kindOther),
    fullName: c.fullName,
    birthDate: text(c.birthDate),
    passport: text(c.passport),
    address: text(c.address),
    phone: text(c.phone),
    telegram: text(c.telegram),
    email: text(c.email),
  };
}

export function courseDraftFromPrefill(c: PrefillCourse): CourseDraft {
  return {
    firstPaymentAmount: String(c.firstPaymentAmount),
    firstPaymentDate: "",
    discountReason: "",
    discountFrom: "",
    discountTo: "",
    includes: [],
  };
}

export function courseDraftFromFields(c: ContractCourseFields): CourseDraft {
  return {
    firstPaymentAmount: String(c.firstPaymentAmount),
    firstPaymentDate: text(c.firstPaymentDate),
    discountReason: text(c.discountReason),
    discountFrom: text(c.discountFrom),
    discountTo: text(c.discountTo),
    includes: [...c.includes],
  };
}

function customerBody(d: CustomerDraft) {
  return {
    kind: d.kind,
    kindOther: d.kind === "OTHER" ? opt(d.kindOther) : undefined,
    fullName: d.fullName.trim(),
    birthDate: opt(d.birthDate),
    passport: opt(d.passport),
    address: opt(d.address),
    phone: opt(d.phone),
    telegram: opt(d.telegram),
    email: opt(d.email),
  };
}

function courseBody(enrollmentId: string, d: CourseDraft) {
  return {
    enrollmentId,
    firstPaymentAmount: d.firstPaymentAmount.trim() ? Number(d.firstPaymentAmount) : undefined,
    firstPaymentDate: opt(d.firstPaymentDate),
    discountReason: opt(d.discountReason),
    discountFrom: opt(d.discountFrom),
    discountTo: opt(d.discountTo),
    includes: d.includes,
  };
}

/** Body of `POST /contract-documents`. */
export function createBody(input: {
  studentId: number;
  enrollmentIds: string[];
  birthDate: string;
  customer: CustomerDraft;
  courses: Record<string, CourseDraft>;
}) {
  return {
    studentId: input.studentId,
    enrollmentIds: input.enrollmentIds,
    studentBirthDate: opt(input.birthDate),
    customer: customerBody(input.customer),
    courses: input.enrollmentIds.map((id) => courseBody(id, input.courses[id])),
  };
}

/** Body of `PATCH /contract-documents/:id` — the whole customer and every course. */
export function updateBody(customer: CustomerDraft, courses: Record<string, CourseDraft>) {
  return {
    customer: customerBody(customer),
    courses: Object.entries(courses).map(([id, d]) => courseBody(id, d)),
  };
}

/** Why «Saqlash» is still disabled; null when the form may be sent. The server re-checks all of it. */
export function formProblem(input: {
  enrollmentIds?: string[];
  needsBirthDate?: boolean;
  birthDate?: string;
  customer: CustomerDraft;
  minor: boolean | null;
  branchMissing?: string[];
}): string | null {
  if (input.branchMissing && input.branchMissing.length > 0) {
    return `Filial sozlamasida ${input.branchMissing.join(", ")} kiritilmagan`;
  }
  if (input.enrollmentIds && input.enrollmentIds.length === 0) return "Kamida bitta kursni tanlang";
  if (input.needsBirthDate && !input.birthDate) return "O'quvchining tug'ilgan sanasini kiriting";
  if (input.minor === true && input.customer.kind === "SELF") {
    return "Voyaga yetmagan o'quvchi o'zi Buyurtmachi bo'la olmaydi";
  }
  if (!input.customer.fullName.trim()) return "Buyurtmachining F.I.O. sini kiriting";
  if (input.customer.kind === "OTHER" && !input.customer.kindOther.trim()) {
    return "Vakillik asosini yozing";
  }
  return null;
}

export function canCancel(c: ContractView, isCeo: boolean): boolean {
  if (c.status === "UNSIGNED") return true;
  return c.status === "SIGNED" && isCeo;
}

/** The list after a create, edit or sign answered with `view`. A cancel also refetches. */
export function upsertContract(res: ContractsResponse, view: ContractView): ContractsResponse {
  const exists = res.contracts.some((c) => c.id === view.id);
  const covered = new Set(
    view.status === "CANCELLED" ? [] : view.links.map((l) => l.enrollmentId),
  );
  return {
    contracts: exists
      ? res.contracts.map((c) => (c.id === view.id ? view : c))
      : [view, ...res.contracts],
    uncovered: res.uncovered.filter((u) => !covered.has(u.enrollmentId)),
  };
}

/** "YYYY-MM-DD" ↔ the DatePicker's local Date, with no timezone shift. */
export function dateValue(day: string): Date | undefined {
  return day ? parse(day, "yyyy-MM-dd", new Date()) : undefined;
}

export function dayString(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function dmy(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}
