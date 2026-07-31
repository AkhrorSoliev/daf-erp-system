import { IsString, Matches } from 'class-validator';

export class TelegramOauthCompleteDto {
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, { message: "Noto'g'ri handoff" })
  handoff: string;
}
