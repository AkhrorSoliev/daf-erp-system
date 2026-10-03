import { IsString, Matches, MinLength } from 'class-validator';

/** A backup number the student types, behind their password (ADR-0031). */
export class ExtraPhoneSendCodeDto {
  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 xonali bo'lishi kerak" })
  phone: string;

  @IsString()
  @MinLength(1, { message: 'Joriy parolni kiriting' })
  currentPassword: string;
}
