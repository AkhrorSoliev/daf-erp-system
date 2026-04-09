import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsDateString,
  Matches,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';

export class CreateStudentDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak" })
  phone: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak" })
  extraPhone?: string;

  @IsOptional()
  @IsString()
  parentPhone?: string;

  @IsOptional()
  @IsString()
  parentName?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  placeOfStudy?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  passportSeries?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  branchIds?: number[];
}
