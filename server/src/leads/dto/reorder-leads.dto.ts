import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderLeadsDto {
  @IsString()
  sectionId: string;

  // Lead ids of that section in their new top-to-bottom order.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  leadIds: string[];
}
