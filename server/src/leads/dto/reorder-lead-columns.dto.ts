import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderLeadColumnsDto {
  // Custom (non-system) column ids in their new left-to-right order.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columnIds: string[];
}
