import { IsString, Matches } from 'class-validator';

export class ForgotPasswordVerifyDto {
  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 xonali bo'lishi kerak" })
  phone: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: "Kod 4 xonali bo'lishi kerak" })
  code: string;
}
