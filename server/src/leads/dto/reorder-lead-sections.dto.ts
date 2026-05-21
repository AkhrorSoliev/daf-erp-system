import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderLeadSectionsDto {
  @IsString()
  columnId: string;

  // Section ids of that column in their new top-to-bottom order.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sectionIds: string[];
}
