import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlannedAbsenceKind } from '@prisma/client';

export class UpsertPlannedAbsenceDto {
  @IsInt()
  studentId: number;

  // Only the two pre-mark intents are valid — a student doesn't pre-announce
  // that they will attend.
  @IsIn([PlannedAbsenceKind.SABABLI, PlannedAbsenceKind.SABABSIZ])
  kind: PlannedAbsenceKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
