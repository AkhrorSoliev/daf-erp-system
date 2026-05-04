import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateWithdrawalDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsInt()
  @Min(1)
  amount: number;

  // Accounting month the withdrawn amount is recognized against. Format YYYY-MM.
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy formati noto'g'ri (kerak: YYYY-MM)",
  })
  targetMonth: string;

  // When true, also credits the chosen teacher's salary for `targetMonth`
  // by writing a SalaryAccrual linked to the BALANCE_WITHDRAWAL transaction.
  @IsBoolean()
  creditTeacher: boolean;

  @ValidateIf((o: CreateWithdrawalDto) => o.creditTeacher === true)
  @IsInt()
  @IsNotEmpty({ message: 'Ustoz tanlanishi shart' })
  teacherUserId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
