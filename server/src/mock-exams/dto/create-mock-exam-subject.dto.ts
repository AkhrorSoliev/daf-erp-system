import { IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CreateMockExamSubjectDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNumber()
  @Min(1)
  maxScore: number;
}
