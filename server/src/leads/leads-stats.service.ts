import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  dayOfWeekForDateStr,
  tashkentDateStr,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
  tashkentRangeUtc,
} from '../common/date/tashkent';
import { activeBoardLeadWhere, leadBranchWhere } from './shared/lead-scope';
import type { LeadStatsPeriod } from './dto/lead-stats-query.dto';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_SOURCES = 2;

/**
 * UTC bounds of a stats period on the Tashkent calendar. The running periods
 * end at the start of tomorrow, so today's leads count.
 */
export function leadStatsRange(
  period: LeadStatsPeriod,
  now: Date,
): { gte: Date; lt: Date } {
  const today = tashkentDateStr(now);
  if (period === 'last-month') {
    return tashkentMonthRangeUtc(
      addMonthsToMonthKey(tashkentMonthKey(now), -1),
    );
  }
  if (period === 'week') {
    const sinceMonday = (dayOfWeekForDateStr(today) + 6) % 7;
    return tashkentRangeUtc(addDaysToDateStr(today, -sinceMonday), today);
  }
  return tashkentRangeUtc(`${today.slice(0, 7)}-01`, today);
}

/**
 * The figures above the leads board (spec 2026-10-08). Every count is of board
 * leads only (a section is set): leads written for students who came in
 * through `/students`, the bot or a mock exam have no section and are
 * CONVERTED at once, so counting them would inflate "O'quvchi bo'ldi".
 */
@Injectable()
export class LeadsStatsService {
  constructor(private prisma: PrismaService) {}

  async getStats(
    companyId: number,
    scope: ReportBranchIds,
    period: LeadStatsPeriod = 'month',
    now: Date = new Date(),
  ) {
    const onBoard = activeBoardLeadWhere(companyId, scope);
    const uncalled: Prisma.LeadWhereInput = { ...onBoard, calledAt: null };
    const range = leadStatsRange(period, now);
    const boardLead: Prisma.LeadWhereInput = {
      companyId,
      sectionId: { not: null },
      ...leadBranchWhere(scope),
    };
    // A lead lost later still arrived in the period, so deletedAt is not read.
    const created: Prisma.LeadWhereInput = { ...boardLead, createdAt: range };

    const [
      onBoardCount,
      uncalledCount,
      uncalledOverWeek,
      createdCount,
      bySource,
      converted,
      lost,
    ] = await Promise.all([
      this.prisma.lead.count({ where: onBoard }),
      this.prisma.lead.count({ where: uncalled }),
      this.prisma.lead.count({
        where: {
          ...uncalled,
          createdAt: { lt: new Date(now.getTime() - WEEK_MS) },
        },
      }),
      this.prisma.lead.count({ where: created }),
      this.prisma.lead.groupBy({
        by: ['sourceId'],
        where: { ...created, sourceId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { sourceId: 'desc' } },
        take: TOP_SOURCES,
      }),
      this.prisma.lead.count({
        where: {
          ...boardLead,
          statusEnum: LeadStatus.CONVERTED,
          statusChangedAt: range,
        },
      }),
      this.prisma.lead.count({
        where: {
          ...boardLead,
          statusEnum: LeadStatus.LOST,
          statusChangedAt: range,
        },
      }),
    ]);

    const sourceIds = bySource.map((row) => row.sourceId as string);
    const sources = sourceIds.length
      ? await this.prisma.leadSource.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(sources.map((s) => [s.id, s.name]));

    return {
      now: {
        onBoard: onBoardCount,
        uncalled: uncalledCount,
        uncalledOverWeek,
      },
      flow: {
        created: createdCount,
        topSources: bySource.map((row) => ({
          name: nameById.get(row.sourceId as string) ?? '—',
          count: row._count._all,
        })),
        converted,
        lost,
      },
    };
  }
}
