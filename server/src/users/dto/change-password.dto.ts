import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, {
    message: "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak",
  })
  newPassword: string;
}
