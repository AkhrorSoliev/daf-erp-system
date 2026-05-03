import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export const VALID_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export class CreateBranchDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "Vaqt formati HH:mm bo'lishi kerak" })
  startOfWorkingDay?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "Vaqt formati HH:mm bo'lishi kerak" })
  endOfWorkingDay?: string;

  /**
   * Working days of the branch. Group lesson days must fall within this set
   * (validated server-side in `GroupsWriteService`). Each value is a
   * lowercase English weekday name; matches `Group.exactDays` shape.
   */
  @IsOptional()
  @IsArray()
  @IsIn(VALID_WEEKDAYS as unknown as string[], { each: true })
  @ArrayUnique()
  workingDays?: string[];

  @IsNotEmpty()
  @IsInt()
  companyId: number;
}
