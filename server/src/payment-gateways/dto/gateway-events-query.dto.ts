import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { toStringArray } from '../../common/dto/to-array';

/**
 * "Natija" filtri variantlari. Har biri ikki ustun ustidagi KOMPOZIT shart,
 * ustun qiymati emas — shuning uchun ular `in` bilan emas, OR bilan
 * birlashadi (`gateway-events.service.ts` dagi `outcomeWhere`).
 */
export const GATEWAY_OUTCOMES = ['success', 'pending', 'rejected'] as const;
export type GatewayOutcome = (typeof GATEWAY_OUTCOMES)[number];

export class GatewayEventsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(GATEWAY_OUTCOMES, { each: true })
  outcome?: GatewayOutcome[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  provider?: PaymentMethod[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  processed?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  signatureValid?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hideChecks?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
