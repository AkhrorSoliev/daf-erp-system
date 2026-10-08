import { IsIn, IsOptional } from 'class-validator';

export const LEAD_STATS_PERIODS = ['week', 'month', 'last-month'] as const;
export type LeadStatsPeriod = (typeof LEAD_STATS_PERIODS)[number];

export class LeadStatsQueryDto {
  // Omitted = the current Tashkent month.
  @IsOptional()
  @IsIn(LEAD_STATS_PERIODS)
  period?: LeadStatsPeriod;
}

/** The period cards whose leads the list can show (`GET /leads?card=`). */
export const LEAD_STAT_CARDS = ['created', 'converted', 'lost'] as const;
export type LeadStatCard = (typeof LEAD_STAT_CARDS)[number];
