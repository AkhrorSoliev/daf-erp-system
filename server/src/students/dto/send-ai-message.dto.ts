import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendAiMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}
