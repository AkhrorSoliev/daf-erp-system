import { TelegramReportLayout, TelegramReportSection } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
} from 'class-validator';

export const SEND_TIME = /^(0[7-9]|1\d|2[0-3]):(00|30)$/;

export class CreateRecipientDto {
  @Type(() => Number)
  @IsInt()
  userId!: number;
}

export class UpdateRecipientDto {
  @IsOptional()
  @Matches(SEND_TIME, {
    message: "Vaqt 07:00–23:30 oralig'ida, yarim soat qadam bilan",
  })
  sendTime?: string;

  @IsOptional()
  @IsEnum(TelegramReportLayout)
  layout?: TelegramReportLayout;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  branchIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Kamida bitta bo'lim tanlang" })
  @IsEnum(TelegramReportSection, { each: true })
  sections?: TelegramReportSection[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
