import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'email',
  'phone',
  'select',
  'radio',
  'checkbox',
  'date',
] as const;

export type FormFieldType = (typeof FIELD_TYPES)[number];

export const TYPES_WITH_OPTIONS: FormFieldType[] = ['select', 'radio'];

export const MAPS_TO_VALUES = ['firstName', 'lastName', 'phone'] as const;
export type MapsToValue = (typeof MAPS_TO_VALUES)[number];

export class FormFieldOptionDto {
  @IsString()
  @MaxLength(100)
  value: string;

  @IsString()
  @MaxLength(200)
  label: string;
}

export class FormFieldDto {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsIn(FIELD_TYPES)
  type: FormFieldType;

  @IsString()
  @MaxLength(200)
  label: string;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FormFieldOptionDto)
  options?: FormFieldOptionDto[];

  @IsOptional()
  @IsEnum(MAPS_TO_VALUES)
  mapsTo?: MapsToValue;
}
