import { IsInt, IsNotEmpty, IsString } from 'class-validator';

/**
 * No `branchId`: the ledger row takes the student's branch
 * (`TransactionsWriteService.branchForStudent`). A branch named in the body
 * used to win, so an adjustment could be booked to any branch's books.
 */
export class CreateAdjustmentDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsInt()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;
}
