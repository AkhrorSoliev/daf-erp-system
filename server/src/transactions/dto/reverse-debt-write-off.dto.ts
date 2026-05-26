import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for `POST /transactions/debt-write-offs/:id/reverse` — CEO-only
 * rollback of a DEBT_WRITE_OFF that turns out to have been a mistake.
 * Restores the original debt by writing the inverse Transaction.
 */
export class ReverseDebtWriteOffDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
