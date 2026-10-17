import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { tashkentMonthRangeUtc } from '../../common/date/tashkent';
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
