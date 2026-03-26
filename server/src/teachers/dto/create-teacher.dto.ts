import {
  IsString,
  IsOptional,
  IsEnum,
  Matches,
  MinLength,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class CreateTeacherDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  @Matches(/^\d{9}$/, { message: 'Telefon raqam 9 ta raqamdan iborat bo\'lishi kerak' })
  phone: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  photo?: string;
}
