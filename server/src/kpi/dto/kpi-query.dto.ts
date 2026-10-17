import { IsOptional, Matches } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_MESSAGE = "Oy YYYY-MM ko'rinishida bo'lishi kerak";

/** `?month=` — the range (2026-10 … the current month) is `kpiMonth`'s. */
export class KpiMonthQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: MONTH_MESSAGE })
  month?: string;
}

/** `GET /kpi/overview` — `compare` absent = the month before. */
export class KpiOverviewQueryDto extends KpiMonthQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: MONTH_MESSAGE })
  compare?: string;
}
