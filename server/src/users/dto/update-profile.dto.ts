import { IsOptional, IsString, Length } from 'class-validator';
import { IsPhotoUrl } from '../../common/decorators/is-photo-url.decorator';

/**
 * Your own name and photo. It deliberately carries no phone, login or
 * password: those are sign-in keys and change only through the doors that ask
 * for your current password — `PATCH /users/phone` and `PATCH /users/password`
 * (ADR-0031).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsPhotoUrl()
  photo?: string;
}
