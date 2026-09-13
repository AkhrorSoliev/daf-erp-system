import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Bir sutkadagi soniyalar — bitta seans bundan uzun bo'la olmaydi (seans kun almashganda yopiladi). */
const SUTKA_S = 86_400;

export class ActivitySectionsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  LERNEN?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  OTHER?: number;
}

/**
 * Faollik yuborishi (dizayn 4.2). Barcha sonlar seans boshidan JAMI — delta
 * emas. `studentId` ATAYLAB YO'Q: u tokendan olinadi.
 */
export class ActivityHeartbeatDto {
  @IsUUID('4')
  sessionId!: string;

  @IsIn(['WEB', 'ANDROID', 'IOS'])
  platform!: 'WEB' | 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  activeSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(SUTKA_S)
  radioSeconds!: number;

  @ValidateNested()
  @Type(() => ActivitySectionsDto)
  sections!: ActivitySectionsDto;
}
