import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderMockExamSectionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sectionIds: string[];
}
