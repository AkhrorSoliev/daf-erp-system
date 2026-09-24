import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SubjectScoreEntryDto {
  @IsString()
  subjectId: string;

  /** `null` — shu fan bahosini o'chirish (xato kiritilgan bahoni bekor qilish). */
  @ValidateIf((o: SubjectScoreEntryDto) => o.score !== null)
  @IsNumber()
  @Min(0)
  score: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  feedback?: string;
}

export class ParticipantScoresDto {
  @IsString()
  participantId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectScoreEntryDto)
  scores: SubjectScoreEntryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}

export class BulkEnterScoresDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ParticipantScoresDto)
  participants: ParticipantScoresDto[];
}
