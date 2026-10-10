import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CONTRACT_INCLUDES,
  CUSTOMER_KINDS,
  type ContractInclude,
  type CustomerKind,
} from '../contract-fields';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak";
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** `GET /contract-documents?studentId=` and `GET /contract-documents/prefill`. */
export class StudentContractsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studentId: number;
}

export class ContractCustomerDto {
  @IsIn(CUSTOMER_KINDS)
  kind: CustomerKind;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  kindOther?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Buyurtmachining F.I.O. sini kiriting' })
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  birthDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  passport?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  telegram?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: "E-mail noto'g'ri" })
  @MaxLength(120)
  email?: string;
}

export class ContractCourseExtrasDto {
  @IsUUID('all')
  enrollmentId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  firstPaymentAmount?: number;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  firstPaymentDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  discountReason?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  discountFrom?: string;

  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  discountTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTRACT_INCLUDES.length)
  @IsIn(CONTRACT_INCLUDES, { each: true })
  includes?: ContractInclude[];
}

export class CreateContractDocumentDto {
  @IsInt()
  @Min(1)
  studentId: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta kursni tanlang' })
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  enrollmentIds: string[];

  /** Only when the profile has none; written to the profile (never overwrites). */
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  studentBirthDate?: string;

  @ValidateNested()
  @Type(() => ContractCustomerDto)
  customer: ContractCustomerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractCourseExtrasDto)
  courses?: ContractCourseExtrasDto[];
}

/** Only the parts that stay editable until signing; a course's extras are replaced whole. */
export class UpdateContractDocumentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractCustomerDto)
  customer?: ContractCustomerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractCourseExtrasDto)
  courses?: ContractCourseExtrasDto[];
}

export class CancelContractDocumentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Bekor qilish sababini yozing' })
  @MaxLength(500)
  reason: string;
}
