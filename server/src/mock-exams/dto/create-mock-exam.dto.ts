import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CEFR_LEVELS } from '../mock-exam-pricing.util';

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
   * Discounted mock fee (so'm) for real DaF students. Omitted / null = DaF
   * students pay the full `price`. 0 = free for DaF students.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  studentPrice?: number;

  /**
   * CEFR levels offered by this exam (subset of A1..C2). Empty / omitted =
   * no level step in the bot. The participant picks exactly one of these.
   */
  @IsOptional()
  @IsArray()
  @IsIn(CEFR_LEVELS, { each: true })
  offeredLevels?: string[];

  /**
   * Time slots offered on `examDate` as "HH:mm" strings. When more than
   * one, the bot asks the participant to pick one. Empty / single = no
   * time-choice step.
   */
  @IsOptional()
  @IsArray()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  examTimes?: string[];

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
