import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for `POST /mock-exam-participants/:id/cancel-payment` — undoes a
 * payment an admin accepted by hand (the wrong participant was marked, or the
 * money was handed back). The registration returns to unpaid and leaves mock
 * revenue, so the reason is mandatory and lands in the participant's history.
 */
export class CancelMockPaymentDto {
  @IsString()
  @MinLength(3, { message: 'Bekor qilish sababini yozing' })
  @MaxLength(500)
  reason: string;
}
