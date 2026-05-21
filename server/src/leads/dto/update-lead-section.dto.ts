import { IsString, MaxLength } from 'class-validator';

export class UpdateLeadSectionDto {
  @IsString()
  @MaxLength(100)
  name: string;
}
