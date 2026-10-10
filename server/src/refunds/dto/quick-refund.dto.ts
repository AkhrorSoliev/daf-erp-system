import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class QuickRefundDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  // Optional: a frozen student has no ACTIVE enrollment, so the refund draws
  // on the free balance alone. Omitted (or null) selects that balance-only
  // path; a student with an ACTIVE enrollment must supply it as before.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  enrollmentId?: string;

  @IsInt()
  @Min(1)
  amount: number;

  // Ignored since ADR-0076: the method is the drawer's, chosen at hand-over.
  // Still accepted so a dialog opened before the deploy keeps working.
  @IsOptional()
  @IsEnum(PaymentMethod)
  refundMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  reason?: string;
}
