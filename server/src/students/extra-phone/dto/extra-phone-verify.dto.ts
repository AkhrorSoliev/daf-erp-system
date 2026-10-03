import { IsString, Matches } from 'class-validator';

export class ExtraPhoneVerifyDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: "Kod 4 xonali bo'lishi kerak" })
  code: string;
}
