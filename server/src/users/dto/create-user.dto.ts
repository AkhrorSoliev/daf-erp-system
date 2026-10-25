import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

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
  @MinLength(4, { message: "Parol kamida 4 ta belgidan iborat bo'lishi kerak" })
  password?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';

  @IsOptional()
  @IsInt()
  mainBranch?: number;

  @IsString()
  @MinLength(2, {
    message: "Lavozim kamida 2 ta belgidan iborat bo'lishi kerak",
  })
  @MaxLength(60, { message: 'Lavozim 60 ta belgidan oshmasligi kerak' })
  position: string;

  @IsOptional()
  @IsInt({ message: "Rasmiy oylik butun son bo'lishi kerak" })
  @Min(0, { message: "Rasmiy oylik manfiy bo'lmaydi" })
  @Max(2_000_000_000, { message: 'Rasmiy oylik juda katta' })
  officialSalary?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  roleIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];
}
