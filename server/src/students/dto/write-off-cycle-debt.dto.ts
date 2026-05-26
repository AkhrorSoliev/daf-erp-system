import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Body for `POST /students/:id/enrollments/:enrollmentId/write-off-cycle-debt`.
 * Used for the already-DROPPED-or-FROZEN enrollment cleanup flow — the admin
 * opens the modal on the student profile, sees the precomputed amount, and
 * confirms with a free-text reason.
 *
 * `confirmAmount` is compared against the eligibility re-computation inside
 * the service tx; a mismatch (e.g. the balance shifted between the modal
 * read and submit) rolls back with 400.
 */
export class WriteOffCycleDebtDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsInt()
  @Min(1)
  confirmAmount!: number;
}
