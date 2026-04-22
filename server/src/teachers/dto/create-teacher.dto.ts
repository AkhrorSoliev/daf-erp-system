import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Matches,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';
import { IsPhotoUrl } from '../../common/decorators/is-photo-url.decorator';

export class CreateTeacherDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @IsPhotoUrl()
  photo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}
