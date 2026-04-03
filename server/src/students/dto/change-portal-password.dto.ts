import { IsString, MinLength } from 'class-validator';

export class ChangePortalPasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
