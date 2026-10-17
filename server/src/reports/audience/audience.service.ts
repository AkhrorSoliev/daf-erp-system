import { ForbiddenException, Injectable } from '@nestjs/common';
import { tashkentDateStr } from '../../common/date/tashkent';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { AudienceFactsLoader } from './audience-facts.loader';
import { buildOverview } from './audience-math';
import type { AudienceOverview } from './audience.types';

/**
 * «Auditoriya»: who studies here, by gender and age. One read of the studying
 * students, then pure functions.
 *
 * // ponytail: no cache — about a thousand rows per request; add Redis
 * (company + scope key) if it is measured slow.
 */
@Injectable()
export class AudienceService {
  constructor(private readonly loader: AudienceFactsLoader) {}

  async overview(
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<AudienceOverview> {
    // An empty scope is refused, never served as zeros (ADR-0002).
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    const students = await this.loader.load(companyId, scope);
    return buildOverview(students, tashkentDateStr(new Date()));
  }
}
