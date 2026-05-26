import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderMockExamSubjectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  subjectIds: string[];
}
