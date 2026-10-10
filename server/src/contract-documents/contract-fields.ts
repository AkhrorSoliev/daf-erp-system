import { applyDiscount, clampDiscount } from '../billing/monthly-price';
import { tashkentDateStr } from '../common/date/tashkent';
import { ageOn } from '../students/shared/student-onboarding';

/** The contract text in force (ADR-0075): 1 = the 02.10.2026 final text. */
export const CONTRACT_TEMPLATE_VERSION = 1;

/** Under this age the student is not their own customer (contract, preamble). */
export const ADULT_AGE = 18;

export const CUSTOMER_KINDS = ['SELF', 'PARENT', 'GUARDIAN', 'OTHER'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CONTRACT_INCLUDES = [
  'DARSLIK',
  'MATERIALLAR',
  'ICHKI_TEST',
  'SERTIFIKAT',
] as const;
export type ContractInclude = (typeof CONTRACT_INCLUDES)[number];

/** BUYURTMACHI block of the contract. */
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

/** What the admin may type per course; editable until the contract is signed. */
export interface ContractCourseExtras {
  firstPaymentAmount: number;
  firstPaymentDate: string | null;
  discountReason: string | null;
  discountFrom: string | null;
  discountTo: string | null;
  includes: ContractInclude[];
}

/** One course of table 2.1, sealed when the contract is created. */
export interface ContractCourseFields extends ContractCourseExtras {
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
}

export interface ContractBranchFields {
  name: string;
  city: string;
  address: string;
  representativeName: string;
  representativePosition: string;
}

export interface ContractStudentFields {
  fullName: string;
  birthDate: string;
  isMinor: boolean;
}

/** Everything the PDF prints, stored in `ContractDocument.fields`. */
export interface ContractFields {
  branch: ContractBranchFields;
  student: ContractStudentFields;
  customer: ContractCustomer;
  courses: ContractCourseFields[];
}

/** The customer block as it arrives from the request. */
export interface CustomerInput {
  kind: CustomerKind;
  kindOther?: string;
  fullName: string;
  birthDate?: string;
  passport?: string;
  address?: string;
  phone?: string;
  telegram?: string;
  email?: string;
}

/** The enrollment shape the course block is built from. */
export interface EnrollmentForContract {
  id: string;
  startDate: Date | null;
  createdAt: Date;
  group: {
    name: string;
    level: string | null;
    exactDays: string[];
    lessonStartTime: string | null;
    lessonEndTime: string | null;
    lessonMinutes: number | null;
    course: { name: string; price: number; lessonMinutes: number | null };
    teachers: { teacher: { firstName: string; lastName: string } }[];
  };
}

const BRANCH_FIELD_LABELS = {
  city: 'shahar',
  address: 'manzil',
  representativeName: 'vakil ismi',
  representativePosition: 'vakil lavozimi',
} as const;

export type BranchContractRow = Record<
  keyof typeof BRANCH_FIELD_LABELS,
  string | null
>;

/**
 * Branch settings the contract cannot be printed without. They are sealed
 * into the contract, so a contract made while one is empty stays empty.
 */
export function missingBranchFields(branch: BranchContractRow): string[] {
  return (
    Object.keys(BRANCH_FIELD_LABELS) as (keyof typeof BRANCH_FIELD_LABELS)[]
  )
    .filter((key) => !branch[key]?.trim())
    .map((key) => BRANCH_FIELD_LABELS[key]);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function personName(p: { firstName: string; lastName: string }): string {
  return `${p.lastName} ${p.firstName}`.trim();
}

/**
 * `Student.dateOfBirth` as a calendar day. The staff picker stores local
 * midnight (19:00Z the day before), the student's own form stores UTC
 * midnight; the Tashkent day is right for both.
 */
export function storedBirthDay(dob: Date): string {
  return tashkentDateStr(dob);
}

export function isMinorOn(birthDate: string, day: string): boolean {
  return ageOn(birthDate, day) < ADULT_AGE;
}

export function customerProblem(
  kind: CustomerKind,
  kindOther: string | undefined,
  isMinor: boolean,
): string | null {
  if (kind === 'SELF' && isMinor) {
    return "Voyaga yetmagan o'quvchi o'zi Buyurtmachi bo'la olmaydi — ota-ona yoki vasiyni tanlang";
  }
  if (kind === 'OTHER' && !kindOther?.trim()) {
    return '«Boshqa» tanlangan — vakillik asosini yozing';
  }
  return null;
}

/** SELF takes name and birth date from the student, never from the form. */
export function buildCustomer(
  input: CustomerInput,
  student: ContractStudentFields,
): ContractCustomer {
  const self = input.kind === 'SELF';
  return {
    kind: input.kind,
    kindOther: input.kind === 'OTHER' ? blankToNull(input.kindOther) : null,
    fullName: self ? student.fullName : input.fullName.trim(),
    birthDate: self ? student.birthDate : (input.birthDate ?? null),
    passport: blankToNull(input.passport),
    address: blankToNull(input.address),
    phone: blankToNull(input.phone),
    telegram: blankToNull(input.telegram),
    email: blankToNull(input.email),
  };
}

export function withExtras(
  extras: Partial<ContractCourseExtras>,
  defaultFirstPayment: number,
): ContractCourseExtras {
  return {
    firstPaymentAmount: extras.firstPaymentAmount ?? defaultFirstPayment,
    firstPaymentDate: extras.firstPaymentDate ?? null,
    discountReason: blankToNull(extras.discountReason),
    discountFrom: extras.discountFrom ?? null,
    discountTo: extras.discountTo ?? null,
    includes: CONTRACT_INCLUDES.filter((item) =>
      extras.includes?.includes(item),
    ),
  };
}

const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/**
 * Table 2.1 for one course. The first payment defaults to the month's price
 * after the student's discount — the monthly charge's own formula
 * (`applyDiscount`), so the contract and the bill agree.
 */
export function buildCourseFields(
  e: EnrollmentForContract,
  discountPercent: number,
  extras: Partial<ContractCourseExtras> = {},
): ContractCourseFields {
  const discount = clampDiscount(discountPercent);
  const wanted = new Set(e.group.exactDays.map((d) => d.trim().toLowerCase()));
  const days = DAY_ORDER.filter((d) => wanted.has(d));
  const price = e.group.course.price;
  return {
    enrollmentId: e.id,
    courseName: e.group.course.name,
    level: blankToNull(e.group.level),
    groupName: e.group.name,
    teachers: e.group.teachers.map((t) => personName(t.teacher)),
    startDate: tashkentDateStr(e.startDate ?? e.createdAt),
    days,
    lessonStartTime: e.group.lessonStartTime,
    lessonEndTime: e.group.lessonEndTime,
    lessonsPerWeek: days.length,
    lessonMinutes: e.group.lessonMinutes ?? e.group.course.lessonMinutes,
    monthlyPrice: price,
    discountPercent: discount,
    ...withExtras(extras, applyDiscount(price, discount)),
  };
}

/** «Standart (#032), Intensive (#041)» — for history rows. */
export function courseList(
  courses: Pick<ContractCourseFields, 'courseName' | 'groupName'>[],
): string {
  return courses.map((c) => `${c.courseName} (${c.groupName})`).join(', ');
}
