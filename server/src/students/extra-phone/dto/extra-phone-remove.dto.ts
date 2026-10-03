import { IsString, MinLength } from 'class-validator';

export class ExtraPhoneRemoveDto {
  @IsString()
  @MinLength(1, { message: 'Joriy parolni kiriting' })
  currentPassword: string;
}
