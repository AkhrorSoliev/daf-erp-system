import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  LEAD_STATS_PERIODS,
  type LeadStatsPeriod,
} from '../../dto/lead-stats-query.dto';

export class OwnershipSummaryQueryDto {
  @IsOptional()
  @IsIn(LEAD_STATS_PERIODS)
  period?: LeadStatsPeriod;
}

export class AssignableQueryDto {
  @IsUUID()
  leadId!: string;
}
