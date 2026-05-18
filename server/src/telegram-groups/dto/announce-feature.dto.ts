import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type { AnnouncementTemplateKey } from '../constants';

const TEMPLATE_KEYS = [
  'NEW_PAYMENT_METHOD',
  'NEW_REPORT',
  'BUG_FIX',
  'GENERAL',
] as const;

export class AnnounceFeatureDto {
  @IsOptional()
  @IsEnum(TEMPLATE_KEYS)
  templateKey?: AnnouncementTemplateKey;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @ValidateIf((o) => !o.templateKey)
  @IsString()
  @MaxLength(2000)
  customMessage?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
