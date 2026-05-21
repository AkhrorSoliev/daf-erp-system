import { IsString } from 'class-validator';

export class MoveLeadDto {
  // Target section the lead is moved into (appended to the end).
  @IsString()
  sectionId: string;
}
