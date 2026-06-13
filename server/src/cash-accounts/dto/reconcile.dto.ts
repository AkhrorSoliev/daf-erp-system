import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

// Reconcile the system balance to a counted/real balance. The service writes
// an ADJUSTMENT cash movement for the delta (actualBalance − systemBalance),
// which may be positive or negative.
export class ReconcileDto {
  @IsInt()
  @Min(0)
  actualBalance: number;

  @IsString()
  @IsNotEmpty()
  reason: string;
}
