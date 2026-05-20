import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

/**
 * Payload for `POST /payments/:id/correct` — fixes a wrong amount on an
 * already-posted manual payment (e.g. cashier typed 4 000 000 instead of
 * 400 000). The correction reverses the original payment and re-posts a
 * new one at `correctAmount`; both steps run in the same flow.
 *
 * A `reason` is mandatory: every correction must be explained in the audit
 * trail (Student/Payment EntityHistory + the CEO notification).
 */
export class CorrectPaymentDto {
  @IsInt()
  @Min(1000)
  correctAmount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}