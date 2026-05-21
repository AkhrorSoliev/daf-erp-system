import { IsString, MaxLength } from 'class-validator';

export class UpdateLeadSourceDto {
  @IsString()
  @MaxLength(100)
  name: string;
}
