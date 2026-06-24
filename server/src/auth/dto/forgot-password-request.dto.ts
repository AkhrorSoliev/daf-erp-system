import { IsString, Matches } from 'class-validator';

export class ForgotPasswordRequestDto {
  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 xonali bo'lishi kerak" })
  phone: string;
}
