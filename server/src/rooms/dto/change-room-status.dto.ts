import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RoomStatus } from '@prisma/client';

export class ChangeRoomStatusDto {
  @IsEnum(RoomStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(RoomStatus).join(', ')}`,
  })
  status: RoomStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
