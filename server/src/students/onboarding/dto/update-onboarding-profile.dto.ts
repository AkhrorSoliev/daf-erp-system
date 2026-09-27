import { Gender } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

/**
 * First-run profile data. Both optional so a client can send only the steps
 * still missing; the service writes only fields that are empty on the card.
 */
export class UpdateOnboardingProfileDto {
  @IsOptional()
  @IsEnum(Gender, { message: "Jinsi noto'g'ri tanlangan" })
  gender?: Gender;

  // A calendar date, not an instant: the range check (age 5–100, not in the
  // future) happens in the service against the Tashkent calendar.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Tug'ilgan sana YYYY-MM-DD ko'rinishida bo'lishi kerak",
  })
  dateOfBirth?: string;
}
