import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMockExamSubjectDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNumber()
  @Min(1)
  maxScore: number;

  /**
   * Optional per-subject pass bar (e.g. Goethe B2 modular: 60/100 each).
   * When omitted, no per-subject pass marker is rendered.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;
}

export class CreateMockExamDto {
  /**
   * Optional grouping by exam type (IELTS / SAT / DTM / ...). When
   * omitted, the service auto-picks the first available section or
   * creates a default "Umumiy" one. The UI currently doesn't surface
   * sections — kept in the data model for future grouping.
   */
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  examDate?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  /**
   * Total score for the whole exam. UI no longer exposes this directly;
   * the service auto-sums it from the per-subject maxScore values below.
   * Defaults to 100 when omitted.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;

  /**
   * Mock fee in so'm. Defaults to 0 (free). Charged to Student.balance via
   * MockExamBillingService once payment lands or balance is sufficient.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  /**
   * Subjects (Lesen / Hören / ... or whatever the admin picks). At least
   * one is required — the score entry / PDF generation pipelines depend
   * on it. Order matches the array order; admins reorder via a separate
   * endpoint later.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMockExamSubjectDto)
  subjects: CreateMockExamSubjectDto[];
}
