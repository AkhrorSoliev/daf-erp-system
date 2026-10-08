import { IsIn, IsOptional } from 'class-validator';

export const LEAD_STATS_PERIODS = ['week', 'month', 'last-month'] as const;
export type LeadStatsPeriod = (typeof LEAD_STATS_PERIODS)[number];

export class LeadStatsQueryDto {
  // Omitted = the current Tashkent month.
  @IsOptional()
  @IsIn(LEAD_STATS_PERIODS)
  period?: LeadStatsPeriod;
}
