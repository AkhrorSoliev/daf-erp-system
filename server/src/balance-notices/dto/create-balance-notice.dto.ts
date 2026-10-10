import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BalanceNoticeChannel } from '@prisma/client';

export class CreateBalanceNoticeDto {
  @IsEnum(BalanceNoticeChannel)
  channel: BalanceNoticeChannel;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string;
}
