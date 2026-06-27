import { IsString } from 'class-validator';

export class RestoreLeadDto {
  // The board column + section the archived lead should be restored into.
  @IsString()
  columnId: string;

  @IsString()
  sectionId: string;
}
