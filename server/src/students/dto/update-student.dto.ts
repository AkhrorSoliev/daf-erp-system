import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  IsDateString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';
import { IsPhotoUrl } from '../../common/decorators/is-photo-url.decorator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  extraPhone?: string | null;

  @IsOptional()
  @IsString()
  parentPhone?: string | null;

  @IsOptional()
  @IsString()
  parentName?: string | null;

  @IsOptional()
  @IsString()
  telegram?: string | null;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  @IsPhotoUrl()
  photo?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsString()
  placeOfStudy?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  passportSeries?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  branchIds?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  discountPercent?: number;
}
