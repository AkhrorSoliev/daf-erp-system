import { IsString, MaxLength } from 'class-validator';

export class UpdateLeadColumnDto {
  @IsString()
  @MaxLength(100)
  name: string;
}
