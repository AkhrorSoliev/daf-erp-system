import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_VOICE_SECONDS, VOICE_LIMIT_MESSAGE } from '../task-file-rules';

/** The text fields of `POST /tasks/:id/files` (multipart; the file itself is `file`). */
export class UploadTaskFileDto {
  /** The name as the person sees it: multer decodes the part's filename as latin1, so UTF-8 names travel here. */
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  /** A recording's length from the website recorder. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_VOICE_SECONDS, { message: VOICE_LIMIT_MESSAGE })
  durationSec?: number;
}
