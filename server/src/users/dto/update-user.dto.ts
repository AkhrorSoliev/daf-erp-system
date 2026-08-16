import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateUserDto {
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
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';

  @IsOptional()
  @IsInt()
  mainBranch?: number;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Lavozim kamida 2 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(60, { message: 'Lavozim 60 ta belgidan oshmasligi kerak' })
  position?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  roleIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED'])
  status?: string;
}
