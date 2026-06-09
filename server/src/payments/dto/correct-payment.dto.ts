import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/**
 * Payload for `POST /payments/:id/correct` — fixes a wrong amount (and/or the
 * wrong payment method) on an already-posted manual payment (e.g. cashier
 * typed 4 000 000 instead of 400 000, or recorded CASH for a TRANSFER). The
 * correction reverses the original payment and re-posts a new one at
 * `correctAmount` with the chosen `method`; both steps run in the same flow.
 *
 * `method` is optional — when omitted, the original payment's method is kept,
 * so an amount-only correction works unchanged.
 *
 * A `reason` is mandatory: every correction must be explained in the audit
 * trail (Student/Payment EntityHistory + the CEO notification).
 */
export class CorrectPaymentDto {
  @IsInt()
  @Min(1000)
  correctAmount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}