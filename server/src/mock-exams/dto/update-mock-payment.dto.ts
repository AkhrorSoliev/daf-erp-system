import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MockPaymentMethod } from './mark-mock-paid.dto';

/**
 * Body for `PATCH /mock-exam-participants/:id/payment` — fixes the details of
 * a payment an admin accepted by hand: the method picked by mistake, or the
 * note. The money itself does not change, so no reason is asked (the same
 * rule as a method-only fix of a lesson payment, `CorrectPaymentDto`).
 *
 * `note` absent keeps the stored note; an empty string clears it.
 */
export class UpdateMockPaymentDto {
  @IsEnum(MockPaymentMethod, {
    message: "To'lov turi naqd, Payme yoki Click bo'lishi kerak",
  })
  method: MockPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
