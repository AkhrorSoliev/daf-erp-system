import { IsString, MaxLength } from 'class-validator';

export class CreateLeadColumnDto {
  @IsString()
  @MaxLength(100)
  name: string;
}
