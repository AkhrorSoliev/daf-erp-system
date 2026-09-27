import { IsString, Matches } from 'class-validator';

export class VerifyPhoneCodeDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: "Kod 4 xonali bo'lishi kerak" })
  code: string;
}
