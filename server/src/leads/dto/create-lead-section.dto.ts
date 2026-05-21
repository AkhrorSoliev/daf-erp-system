import { IsString, MaxLength } from 'class-validator';

export class CreateLeadSectionDto {
  @IsString()
  columnId: string;

  @IsString()
  @MaxLength(100)
  name: string;
}
