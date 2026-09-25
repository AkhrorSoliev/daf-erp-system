import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** `PATCH /users/phone`: your own phone, behind your current password (ADR-0031). */
export class ChangePhoneDto {
  @IsString()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Joriy parolni kiriting' })
  currentPassword: string;
}
