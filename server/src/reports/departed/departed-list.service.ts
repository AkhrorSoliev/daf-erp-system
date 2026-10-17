import { BadRequestException, Injectable } from '@nestjs/common';
import { tashkentDateStr } from '../../common/date/tashkent';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertDepartedScope,
  DepartedOverviewService,
} from './departed-overview.service';
import { parseDayRange } from './departed-period';
import { departedWorkbook, type ExcelRow } from './departed.excel';
import type {
  DepartedList,
  DepartureFact,
  ListRow,
  ListState,
} from './departed.types';
import { applyFilter, loadDepartureFacts } from './departure-facts.loader';
import type {
  DepartedFilterDto,
  DepartedListQueryDto,
} from './dto/departed-query.dto';

const DEFAULT_PAGE_SIZE = 10;
export const EXCEL_ROW_LIMIT = 20_000;

type RowFilter = Pick<
  DepartedListQueryDto,
  'q' | 'reasonId' | 'state' | 'debtorsOnly'
>;

const stateOf = (f: DepartureFact): ListState =>
  f.state === 'pending' ? 'kutilmoqda' : f.returnedAt ? 'qaytgan' : 'ketgan';

const debtOf = (f: DepartureFact) => (f.balance < 0 ? -f.balance : 0);

const digits = (s: string) => s.replace(/\D/g, '');

function matchesSearch(f: DepartureFact, raw: string | undefined): boolean {
  const q = raw?.trim();
  if (!q) return true;
  if (/^\d+$/.test(q) && f.studentId === Number(q)) return true;
  if (f.fullName.toLowerCase().includes(q.toLowerCase())) return true;
  const d = digits(q).replace(/^998(?=\d{9})/, '');
  return d !== '' && digits(f.phone).includes(d);
}

/** Facts of the list, newest departure first (spec B7a §5). */
function selectFacts(
  facts: { current: DepartureFact[]; pendingInRange: DepartureFact[] },
  f: RowFilter,
): DepartureFact[] {
  return [...facts.current, ...facts.pendingInRange]
    .filter(
      (x) =>
        matchesSearch(x, f.q) &&
        (!f.reasonId ||
          (f.reasonId === 'none'
            ? x.reason.id === null
            : x.reason.id === f.reasonId)) &&
        (!f.state || stateOf(x) === f.state) &&
        (!f.debtorsOnly || x.balance < 0),
    )
    .sort(
      (a, b) =>
        b.startedAt.getTime() - a.startedAt.getTime() ||
        b.studentId - a.studentId,
    );
}

const toListRow = (f: DepartureFact): ListRow => ({
  studentId: f.studentId,
  fullName: f.fullName,
  phone: f.phone,
  group: f.group,
  departedAt: f.startedAt.toISOString(),
  studyMonths: f.studyMonths,
  reason: f.reason,
  comment: f.comment,
  state: stateOf(f),
  debt: debtOf(f),
});

const toExcelRow = (f: DepartureFact): ExcelRow => ({
  fullName: f.fullName,
  studentId: f.studentId,
  phone: f.phone,
  branch: f.branch?.name ?? '',
  course: f.course?.name ?? '',
  group: f.group?.name ?? '',
  teachers: f.teachers.map((t) => t.fullName).join(', '),
  departedOn: tashkentDateStr(f.startedAt),
  studyMonths: f.studyMonths,
  reason: f.reason.name,
  comment: f.comment ?? '',
  state: stateOf(f),
  debt: debtOf(f),
});

/** «Ketgan o'quvchilar» — the table and its Excel (spec B7a §5). */
@Injectable()
export class DepartedListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overviewService: DepartedOverviewService,
  ) {}

  async list(
    companyId: number,
    scope: ReportBranchIds,
    q: DepartedListQueryDto,
  ): Promise<DepartedList> {
    assertDepartedScope(scope);
    const sets = await loadDepartureFacts(this.prisma, companyId, scope, {
      range: parseDayRange(q.startDate, q.endDate),
    });
    const filtered = applyFilter(sets, {
      courseIds: q.courseId,
      teacherIds: q.teacherIds,
    });
    const all = selectFacts(filtered, q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? DEFAULT_PAGE_SIZE;
    const states = all.map(stateOf);
    const count = (s: ListState) => states.filter((x) => x === s).length;
    return {
      data: all.slice((page - 1) * pageSize, page * pageSize).map(toListRow),
      total: all.length,
      page,
      pageSize,
      confirmed: count('ketgan') + count('qaytgan'),
      returned: count('qaytgan'),
      pending: count('kutilmoqda'),
    };
  }

  /** Every filtered row (no page) and the overview of the same filtered facts. */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: DepartedFilterDto & RowFilter,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { overview, facts } = await this.overviewService.overviewWithFacts(
      companyId,
      scope,
      q,
    );
    const rows = selectFacts(facts, q);
    if (rows.length > EXCEL_ROW_LIMIT) {
      throw new BadRequestException(
        'Qatorlar 20 000 dan oshdi — filtrni toraytiring',
      );
    }
    return {
      buffer: await departedWorkbook({ rows: rows.map(toExcelRow), overview }),
      filename: `ketgan-oquvchilar-${q.startDate}_${q.endDate}.xlsx`,
    };
  }
}
