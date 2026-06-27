import { IsString } from 'class-validator';

export class MoveLeadSectionDto {
  // The column this section should be moved into (appended to its end).
  @IsString()
  targetColumnId: string;
}
