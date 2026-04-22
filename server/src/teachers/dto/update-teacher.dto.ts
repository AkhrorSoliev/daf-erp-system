import {
  IsString,
  IsOptional,
  IsEnum,
  Matches,
  MinLength,
} from 'class-validator';
import { Gender } from '@prisma/client';
import { IsPhotoUrl } from '../../common/decorators/is-photo-url.decorator';

export class UpdateTeacherDto {
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
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @IsPhotoUrl()
  photo?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
