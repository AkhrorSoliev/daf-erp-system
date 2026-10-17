import { ForbiddenException, Injectable } from '@nestjs/common';
import { tashkentDateStr, tashkentMonthKey } from '../../common/date/tashkent';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { AbsenceStreakService } from '../../outreach/absence-streak.service';
import { SettingsService } from '../../settings/settings.service';
import { cutRows, groupOf, missPairs } from './attendance-counts';
import { excusedCredit, excusedMonthly } from './attendance-credit';
import { attendanceWorkbook } from './attendance-stats.excel';
import { AttendanceFactsLoader } from './attendance-facts.loader';
import { buildOverview, missersOf } from './attendance-overview';
import { resolvePeriod, type StatsPeriod } from './attendance-stats-period';
import type {
  AttendanceFacts,
  AttendanceOverview,
  CreditResult,
  CreditSetting,
  MisserPair,
  MisserRow,
  MissersPage,
} from './attendance-stats.types';
import type {
  AttendanceMissersQueryDto,
  AttendanceStatsQueryDto,
} from './dto/attendance-stats-query.dto';

/** An empty scope is refused, never served as zeros (ADR-0002). */
function assertScope(scope: ReportBranchIds) {
  if (isEmptyScope(scope)) {
    throw new ForbiddenException(
      "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
    );
  }
}

const pageOf = (total: number, page: number, pageSize: number) =>
  Math.min(page, Math.max(1, Math.ceil(total / pageSize)));

/**
 * «Davomat» (spec B7c, ADR-0103). One read of the marks, then pure functions.
 *
 * // ponytail: no cache — six months are ~35k marks, the previous window is
 * read too (a long period reads up to about twice that), and every cut/page
 * click reads them again plus the streak query and the charge/settings reads
 * (accepted); add Redis (key: company + scope + startDate + endDate) if it is
 * measured slow.
 */
@Injectable()
export class AttendanceStatsService {
  constructor(
    private readonly loader: AttendanceFactsLoader,
    private readonly settings: SettingsService,
    private readonly streaks: AbsenceStreakService,
  ) {}

  /** `GET /reports/attendance-stats/overview`. */
  async overview(
    companyId: number,
    scope: ReportBranchIds,
    q: AttendanceStatsQueryDto,
  ): Promise<AttendanceOverview> {
    assertScope(scope);
    const now = new Date();
    const period = resolvePeriod(q.startDate, q.endDate, tashkentDateStr(now));
    const [facts, streakRows] = await Promise.all([
      this.loader.load(companyId, scope, period.load),
      // «Ketma-ket kelmayotganlar» is today's state, not the period's (spec §4).
      this.streaks.computeStreaks({
        companyId,
        branchIds: scope ?? undefined,
        threshold: 3,
      }),
    ]);
    const credit = await this.credit(companyId, facts, period);
    return {
      ...buildOverview({
        facts,
        period,
        currentMonth: tashkentMonthKey(now),
        credit,
        cut: q.cut ?? 'group',
        page: q.page ?? 1,
        pageSize: q.pageSize ?? 10,
      }),
      streak: new Set(streakRows.map((r) => r.studentId)).size,
    };
  }

  /** `GET /reports/attendance-stats/missers`: the «ko'p qoldiruvchi» list of one cut row, paged. */
  async missers(
    companyId: number,
    scope: ReportBranchIds,
    q: AttendanceMissersQueryDto,
  ): Promise<MissersPage> {
    assertScope(scope);
    const period = resolvePeriod(
      q.startDate,
      q.endDate,
      tashkentDateStr(new Date()),
    );
    const facts = await this.loader.load(companyId, scope, period.window);
    const rows = await this.named(
      companyId,
      facts,
      missersOf(facts, period.window, q.cut ?? 'group', q.key),
    );
    const pageSize = q.pageSize ?? 10;
    const page = pageOf(rows.length, q.page ?? 1, pageSize);
    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }

  /** `GET /reports/attendance-stats/excel`: the page's answer, every cut row, every 3+ pair (spec §9). */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: AttendanceStatsQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    assertScope(scope);
    const now = new Date();
    const period = resolvePeriod(q.startDate, q.endDate, tashkentDateStr(now));
    const facts = await this.loader.load(companyId, scope, period.load);
    const credit = await this.credit(companyId, facts, period);
    const overview = buildOverview({
      facts,
      period,
      currentMonth: tashkentMonthKey(now),
      credit,
      cut: 'group',
      page: 1,
      pageSize: 10,
    });
    const buffer = await attendanceWorkbook({
      overview,
      cuts: {
        group: cutRows(facts, period.window, 'group'),
        teacher: cutRows(facts, period.window, 'teacher'),
        course: cutRows(facts, period.window, 'course'),
      },
      missers: await this.named(
        companyId,
        facts,
        missPairs(facts.rows, period.window),
      ),
    });
    return { buffer, filename: `davomat-${q.startDate}_${q.endDate}.xlsx` };
  }

  /** The «Sababli» money block: charges and the per-branch setting behind its marks. */
  private async credit(
    companyId: number,
    facts: AttendanceFacts,
    period: StatsPeriod,
  ): Promise<CreditResult> {
    const excused = excusedMonthly(facts.rows, period.window, facts.groups);
    const branchIds = [
      ...new Set(excused.map((r) => groupOf(facts.groups, r.groupId).branchId)),
    ];
    const [charges, settings] = await Promise.all([
      this.loader.loadCharges(
        companyId,
        excused.map((r) => ({
          studentId: r.studentId,
          groupId: r.groupId,
          month: r.date.slice(0, 7),
        })),
      ),
      Promise.all(
        branchIds.map(
          async (b): Promise<[number, CreditSetting]> => [
            b,
            {
              enabled: await this.settings.get(
                companyId,
                'payment.excusedCreditEnabled',
                b,
              ),
              cap: await this.settings.get(
                companyId,
                'payment.excusedCreditMonthlyCap',
                b,
              ),
            },
          ],
        ),
      ),
    ]);
    return excusedCredit(excused, facts.groups, charges, new Map(settings));
  }

  /** Names the pairs; most absences first, then the name (uz, numeric). */
  private async named(
    companyId: number,
    facts: AttendanceFacts,
    pairs: MisserPair[],
  ): Promise<MisserRow[]> {
    const names = await this.loader.loadStudentNames(
      companyId,
      pairs.map((p) => p.studentId),
    );
    return pairs
      .map((p) => ({
        ...p,
        name: names.get(p.studentId) ?? `#${p.studentId}`,
        groupName: groupOf(facts.groups, p.groupId).name,
      }))
      .sort(
        (a, b) =>
          b.absent - a.absent ||
          a.name.localeCompare(b.name, 'uz', { numeric: true }) ||
          a.groupName.localeCompare(b.groupName, 'uz', { numeric: true }),
      );
  }
}
