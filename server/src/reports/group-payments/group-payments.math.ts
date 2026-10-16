import { BadRequestException } from '@nestjs/common';
import type { EnrollmentStatus } from '@prisma/client';
import { tashkentMonthKey } from '../../common/date/tashkent';
import { MONTHLY_BILLING_START_MONTH, paidPctOf } from '../month-charges';

/**
 * «Guruhlar bo'yicha to'lov» (spec B5 §4). Pure: every figure is a sum of the
 * per-charge shares `splitMonthChargesByCharge` gave the loader, so the groups
 * add up to the overview's «Qoldi» to the so'm. Groups, teachers and courses
 * are today's (`GroupTeacher`, `courseId`), not those of the month.
 */
export type Kesim = 'guruh' | 'ustoz' | 'kurs';
export type Tartib = 'foiz' | 'qoldi' | 'nomi';
export type GroupMark = 'ochirilgan' | 'yopilgan';
export type PayStatus = 'toladi' | 'qisman' | 'tolamagan';
export type StudentMark = 'arxivda' | 'muzlatilgan' | 'chiqqan';

export const KESIMLAR: readonly Kesim[] = ['guruh', 'ustoz', 'kurs'];
export const TARTIBLAR: readonly Tartib[] = ['foiz', 'qoldi', 'nomi'];
export const USTOZSIZ_ID = 'ustozsiz';

/** One in-scope charge of the month, its unpaid share and its enrollment. */
export interface GpCharge {
  id: string;
  studentId: number;
  groupId: string;
  enrollmentId: string;
  charged: number;
  unpaid: number;
  enrollmentStatus: EnrollmentStatus;
  enrollmentCreatedAt: Date;
}
export interface GpGroup {
  id: string;
  name: string;
  groupNumber: number | null;
  courseId: string;
  courseName: string;
  teachers: { id: number; name: string }[];
  deleted: boolean;
  closed: boolean;
}
export interface GpStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  archived: boolean;
}
export interface GpData {
  month: string;
  charges: GpCharge[];
  groups: Map<string, GpGroup>;
  students: Map<number, GpStudent>;
}

export interface GpTotals {
  charged: number;
  paid: number;
  unpaid: number;
  paidPct: number | null;
  students: number;
  unpaidStudents: number;
}
export interface GpSummary extends GpTotals {
  groups: number;
  fullyPaidGroups: number;
  underHalfGroups: number;
  avgGroupPct: number | null;
}
export interface GpRow extends GpTotals {
  id: string;
  name: string;
  sub: string;
  teachers?: string[];
  marks: GroupMark[];
}
export interface GpRowsResponse {
  month: string;
  summary: GpSummary;
  rows: GpRow[];
  total: number;
  multiTeacherNote: boolean;
}
export interface GpStudentLine {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  charged: number;
  paid: number;
  unpaid: number;
  status: PayStatus;
  mark: StudentMark | null;
}
export interface GpGroupResponse {
  group: {
    id: string;
    name: string;
    course: string;
    teachers: string[];
    deleted: boolean;
    closed: boolean;
  };
  charged: number;
  paid: number;
  unpaid: number;
  paidPct: number | null;
  students: GpStudentLine[];
}
/** The query as the DTOs carry it. */
export interface GpRawQuery {
  oy?: string;
  kesim?: Kesim;
  q?: string;
  tartib?: Tartib;
  qarzdor?: '1';
  sahifa?: number;
  soni?: number;
}
export interface GpFilters {
  kesim: Kesim;
  q: string;
  tartib: Tartib;
  qarzdor: boolean;
}
export interface GpQuery extends GpFilters {
  sahifa: number;
  soni: number;
}
export interface GpSheetStudent extends GpStudentLine {
  groupName: string;
  teachers: string[];
}

/** The report's month (spec B5 §5.1): empty = the current Tashkent month; 2026-09 up to it. */
export function parseReportMonth(oy: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!oy) return current;
  if (oy < MONTHLY_BILLING_START_MONTH)
    throw new BadRequestException('Bu hisobot sentabr 2026 dan boshlanadi');
  if (oy > current)
    throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  return oy;
}

export function toGpQuery(q: GpRawQuery): GpQuery {
  return {
    kesim: q.kesim ?? 'guruh',
    q: q.q ?? '',
    tartib: q.tartib ?? 'foiz',
    qarzdor: q.qarzdor === '1',
    sahifa: q.sahifa ?? 1,
    soni: q.soni ?? 10,
  };
}

/** Spec B5 §4.4: nothing left — paid; something but not all — part; all — unpaid. */
export function payStatus(charged: number, unpaid: number): PayStatus {
  if (unpaid <= 0) return 'toladi';
  return unpaid < charged ? 'qisman' : 'tolamagan';
}

/** Spec B5 §4.4: an archived card first, then the charge's enrollment. */
export function studentMark(
  archived: boolean,
  status: EnrollmentStatus,
): StudentMark | null {
  if (archived) return 'arxivda';
  if (status === 'FROZEN') return 'muzlatilgan';
  return status === 'ACTIVE' ? null : 'chiqqan';
}

/** Sums; a student counts once however many of these charges are his. */
export function totalsOf(charges: readonly GpCharge[]): GpTotals {
  const perStudent = new Map<number, number>();
  let charged = 0;
  let unpaid = 0;
  for (const c of charges) {
    charged += c.charged;
    unpaid += c.unpaid;
    perStudent.set(c.studentId, (perStudent.get(c.studentId) ?? 0) + c.unpaid);
  }
  const paid = charged - unpaid;
  return {
    charged,
    paid,
    unpaid,
    paidPct: paidPctOf(paid, charged),
    students: perStudent.size,
    unpaidStudents: [...perStudent.values()].filter((u) => u > 0).length,
  };
}

function bucket(
  charges: readonly GpCharge[],
  keysOf: (c: GpCharge) => string[],
): Map<string, GpCharge[]> {
  const out = new Map<string, GpCharge[]>();
  for (const c of charges) {
    for (const k of keysOf(c)) {
      const list = out.get(k);
      if (list) list.push(c);
      else out.set(k, [c]);
    }
  }
  return out;
}

// The loader reads every group a charge names; the fallback only keeps the types honest.
const groupOf = (data: GpData, id: string): GpGroup =>
  data.groups.get(id) ?? {
    id,
    name: '',
    groupNumber: null,
    courseId: '',
    courseName: '',
    teachers: [],
    deleted: false,
    closed: false,
  };
const groupsText = (charges: readonly GpCharge[]) =>
  `${new Set(charges.map((c) => c.groupId)).size} guruh`;

export function groupRows(data: GpData): GpRow[] {
  return [...bucket(data.charges, (c) => [c.groupId])].map(([id, charges]) => {
    const g = groupOf(data, id);
    const marks: GroupMark[] = [];
    if (g.deleted) marks.push('ochirilgan');
    if (g.closed) marks.push('yopilgan');
    return {
      id,
      name: g.name,
      sub: g.courseName,
      teachers: g.teachers.map((t) => t.name),
      marks,
      ...totalsOf(charges),
    };
  });
}

/** A group goes to each of its current teachers; one without any to «Ustozsiz» (spec B5 §3.5). */
export function teacherRows(data: GpData): GpRow[] {
  const names = new Map<string, string>([[USTOZSIZ_ID, 'Ustozsiz']]);
  const keysOf = (c: GpCharge) => {
    const teachers = groupOf(data, c.groupId).teachers;
    for (const t of teachers) names.set(String(t.id), t.name);
    return teachers.length ? teachers.map((t) => String(t.id)) : [USTOZSIZ_ID];
  };
  return [...bucket(data.charges, keysOf)].map(([id, charges]) => ({
    id,
    name: names.get(id) ?? '',
    sub: groupsText(charges),
    marks: [],
    ...totalsOf(charges),
  }));
}

export function courseRows(data: GpData): GpRow[] {
  return [
    ...bucket(data.charges, (c) => [groupOf(data, c.groupId).courseId]),
  ].map(([id, charges]) => ({
    id,
    name: groupOf(data, charges[0].groupId).courseName,
    sub: groupsText(charges),
    marks: [],
    ...totalsOf(charges),
  }));
}

/** The card (spec B5 §3.3): the whole month, never the table's filters. */
export function summarize(data: GpData): GpSummary {
  const groups = groupRows(data);
  const pcts = groups
    .map((g) => g.paidPct)
    .filter((p): p is number => p !== null);
  return {
    ...totalsOf(data.charges),
    groups: groups.length,
    fullyPaidGroups: groups.filter((g) => g.unpaid === 0).length,
    underHalfGroups: pcts.filter((p) => p < 50).length,
    avgGroupPct: pcts.length
      ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10
      : null,
  };
}

const ROWS_OF: Record<Kesim, (data: GpData) => GpRow[]> = {
  guruh: groupRows,
  ustoz: teacherRows,
  kurs: courseRows,
};

/** What the search looks in (spec B5 §3.4). */
function haystack(row: GpRow, kesim: Kesim, data: GpData): string {
  if (kesim !== 'guruh') return row.name;
  const n = data.groups.get(row.id)?.groupNumber;
  return [
    row.name,
    n == null ? '' : String(n),
    row.sub,
    ...(row.teachers ?? []),
  ].join(' ');
}

const byName = (a: GpRow, b: GpRow) =>
  a.name.localeCompare(b.name, 'uz', { numeric: true });
const SORTS: Record<Tartib, (a: GpRow, b: GpRow) => number> = {
  // A row with nothing charged has no percentage: it goes last.
  foiz: (a, b) =>
    (a.paidPct ?? 101) - (b.paidPct ?? 101) ||
    b.unpaid - a.unpaid ||
    byName(a, b),
  qoldi: (a, b) => b.unpaid - a.unpaid || byName(a, b),
  nomi: byName,
};

/** The table's rows after kesim, «Faqat qarzi borlar», search and sort — every page (the Excel's first sheet). */
export function filteredRows(data: GpData, f: GpFilters): GpRow[] {
  const q = f.q.trim().toLowerCase();
  return ROWS_OF[f.kesim](data)
    .filter((r) => !f.qarzdor || r.unpaid > 0)
    .filter((r) => !q || haystack(r, f.kesim, data).toLowerCase().includes(q))
    .sort(SORTS[f.tartib]);
}

export function buildRowsResponse(data: GpData, q: GpQuery): GpRowsResponse {
  const rows = filteredRows(data, q);
  return {
    month: data.month,
    summary: summarize(data),
    rows: rows.slice((q.sahifa - 1) * q.soni, q.sahifa * q.soni),
    total: rows.length,
    multiTeacherNote:
      q.kesim === 'ustoz' &&
      [...data.groups.values()].some((g) => g.teachers.length > 1),
  };
}

const STATUS_ORDER: Record<PayStatus, number> = {
  tolamagan: 0,
  qisman: 1,
  toladi: 2,
};

/** A group's students, one line each (two charges of one student merged), in the drawer's order. */
export function studentLines(data: GpData, groupId: string): GpStudentLine[] {
  const own = data.charges.filter((c) => c.groupId === groupId);
  return [...bucket(own, (c) => [String(c.studentId)])]
    .map(([, charges]) => {
      const latest = charges.reduce((a, b) =>
        b.enrollmentCreatedAt > a.enrollmentCreatedAt ? b : a,
      );
      const s = data.students.get(latest.studentId) ?? {
        id: latest.studentId,
        firstName: '',
        lastName: '',
        phone: '',
        archived: false,
      };
      const { charged, paid, unpaid } = totalsOf(charges);
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        charged,
        paid,
        unpaid,
        status: payStatus(charged, unpaid),
        mark: studentMark(s.archived, latest.enrollmentStatus),
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        b.unpaid - a.unpaid ||
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
          'uz',
        ),
    );
}

/** The drawer; null when the group had no charge in the month and scope (the caller answers 404). */
export function groupDrawer(
  data: GpData,
  groupId: string,
): GpGroupResponse | null {
  const charges = data.charges.filter((c) => c.groupId === groupId);
  if (charges.length === 0) return null;
  const g = groupOf(data, groupId);
  const { charged, paid, unpaid, paidPct } = totalsOf(charges);
  return {
    group: {
      id: g.id,
      name: g.name,
      course: g.courseName,
      teachers: g.teachers.map((t) => t.name),
      deleted: g.deleted,
      closed: g.closed,
    },
    charged,
    paid,
    unpaid,
    paidPct,
    students: studentLines(data, groupId),
  };
}

/** The Excel's second sheet: every student–group line of the month by group name; `onlyDebtors` keeps those with something left. */
export function studentSheetLines(
  data: GpData,
  onlyDebtors: boolean,
): GpSheetStudent[] {
  return groupRows(data)
    .sort(byName)
    .flatMap((g) =>
      studentLines(data, g.id).map((s) => ({
        ...s,
        groupName: g.name,
        teachers: g.teachers ?? [],
      })),
    )
    .filter((s) => !onlyDebtors || s.unpaid > 0);
}
