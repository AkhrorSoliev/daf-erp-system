import { IsString, MinLength } from 'class-validator';

export class ForgotPasswordResetDto {
  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(6, { message: "Parol kamida 6 ta belgidan iborat bo'lishi kerak" })
  newPassword: string;
}
