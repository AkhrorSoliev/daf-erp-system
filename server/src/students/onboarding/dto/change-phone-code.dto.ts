import { IsString, Matches, MinLength } from 'class-validator';

/** «Yo'q, boshqa raqam»: the student's own number, behind their password. */
export class ChangePhoneCodeDto {
  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 xonali bo'lishi kerak" })
  phone: string;

  @IsString()
  @MinLength(1, { message: 'Joriy parolni kiriting' })
  currentPassword: string;
}
