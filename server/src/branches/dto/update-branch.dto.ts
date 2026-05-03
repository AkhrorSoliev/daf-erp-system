import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { VALID_WEEKDAYS } from './create-branch.dto';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsArray()
  @IsIn(VALID_WEEKDAYS as unknown as string[], { each: true })
  @ArrayUnique()
  workingDays?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
