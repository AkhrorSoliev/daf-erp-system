import { IsString, MaxLength } from 'class-validator';

export class CreateLeadSourceDto {
  @IsString()
  @MaxLength(100)
  name: string;
}
