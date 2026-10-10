import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NOTIFICATION_GROUPS,
  type NotificationGroup,
} from '../notification-kind';

export class NotificationQueryDto {
  /** `pending` = waits for the caller (actionRequired, not resolved), read or not. Default `all`. */
  @IsOptional()
  @IsIn(['pending', 'all'])
  filter?: 'pending' | 'all';

  /** One of the bell's four groups. */
  @IsOptional()
  @IsIn([...NOTIFICATION_GROUPS])
  type?: NotificationGroup;

  /** Searched in the title and the message, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** The previous page's `nextCursor`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  /** @deprecated The pre-phase-5 bell sends `page=1`; accepted and ignored until that client is gone. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
