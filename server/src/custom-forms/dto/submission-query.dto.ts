import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toStringArray } from '../../common/dto/to-array';
import { SUBMISSION_STAGES } from '../submission-stage';
import type { SubmissionStage } from '../submission-stage';

/** `?source=` da manbasi yo'q javoblarni bildiradigan belgi. */
export const NO_SOURCE_TOKEN = 'none';

export class SubmissionQueryDto extends PaginationDto {
  // Bosqichlar bir-birini qoplamaydi — ko'p tanlash "hammasi" bilan bir xil
  // bo'lib qolardi, shuning uchun bitta qiymat.
  @IsOptional()
  @IsIn(SUBMISSION_STAGES)
  stage?: SubmissionStage;

  // Manba id'lari vergul bilan; `none` = manbasi yo'q.
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  source?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  // `submittedAt` oralig'i, Toshkent kuni bo'yicha (yyyy-MM-dd).
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
