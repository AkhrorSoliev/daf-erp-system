import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  content: string;
}
