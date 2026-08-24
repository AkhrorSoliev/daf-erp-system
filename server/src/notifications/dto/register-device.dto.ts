import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  token: string;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}
