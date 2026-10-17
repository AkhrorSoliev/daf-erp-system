import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../../common/date/tashkent';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import type { CenterFacts, CenterOverview } from './center-activity.types';
import {
  asOfForMonth,
  monthsUpTo,
  parseCenterMonth,
} from './center-activity-period';
import { CenterFactsLoader } from './center-facts.loader';
import { centerActivityWorkbook } from './center-activity.excel';
import { buildHeat } from './center-heat';
import { evaluateCenter } from './center-metrics';
import { buildOverview } from './center-overview';
import type { CenterActivityQueryDto } from './dto/center-activity-query.dto';

/** «Markaz faoliyati» (spec B7b). One read, then pure functions; no cache. */
@Injectable()
export class CenterActivityService {
  constructor(private readonly loader: CenterFactsLoader) {}

  /**
   * `GET /reports/center-activity/overview`.
   *
   * `filial` only picks the branch the heat table is drawn for; the cards and
   * tables always cover the whole scope. A branch outside the caller's scope is
   * a 400. A branch inside it that has no room yet in the chosen month (opened
   * later, month viewed earlier) is not an error: the heat falls back to the
   * first branch, as when no branch is picked.
   */
  async overview(
    companyId: number,
    scope: ReportBranchIds,
    q: CenterActivityQueryDto,
  ): Promise<CenterOverview> {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial hisobotini ko'rish huquqingiz yo'q",
      );
    }
    if (q.filial !== undefined && scope && !scope.includes(q.filial)) {
      throw new BadRequestException("Bu filial tanlangan qamrovda yo'q");
    }
    const { facts, month, now } = await this.read(companyId, scope, q);
    try {
      return buildOverview(facts, month, now, q.filial);
    } catch (e) {
      if (e instanceof RangeError) return buildOverview(facts, month, now);
      throw e;
    }
  }

  /** `GET /reports/center-activity/excel`: the page's figures, every branch's free-rooms table, every open group. */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: CenterActivityQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { facts, month, now } = await this.read(companyId, scope, q);
    const overview = buildOverview(facts, month, now);
    const ev = evaluateCenter(
      facts,
      asOfForMonth(month, now),
      month === tashkentMonthKey(now),
    );
    const heats = overview.branches.map((b) => ({
      branchName: b.name,
      heat: buildHeat(ev.rooms.filter((r) => r.branchId === b.id)),
    }));
    const buffer = await centerActivityWorkbook({
      month,
      overview,
      groups: ev.groups,
      heats,
    });
    return { buffer, filename: `markaz-faoliyati-${month}.xlsx` };
  }

  /** The facts for the month and the bars before it — shared by the page and the Excel. */
  async read(
    companyId: number,
    scope: ReportBranchIds,
    q: CenterActivityQueryDto,
  ): Promise<{ facts: CenterFacts; month: string; now: Date }> {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial hisobotini ko'rish huquqingiz yo'q",
      );
    }
    const now = new Date();
    const month = parseCenterMonth(q.oy, now);
    const firstAt = tashkentMonthRangeUtc(monthsUpTo(month)[0]).gte;
    const facts = await this.loader.load(
      companyId,
      scope,
      firstAt,
      asOfForMonth(month, now),
    );
    return { facts, month, now };
  }
}
