import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateMockExamSubjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxScore?: number;
}
