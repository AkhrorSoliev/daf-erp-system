import { IsString, MinLength } from 'class-validator';

export class UpdatePortalNameDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;
}
