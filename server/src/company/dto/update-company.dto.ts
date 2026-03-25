import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  activatedTill?: string;

  @IsOptional()
  @IsString()
  startOfWorkingDay?: string;

  @IsOptional()
  @IsString()
  endOfWorkingDay?: string;

  @IsOptional()
  @IsString()
  customCss?: string;

  @IsOptional()
  @IsString()
  customCssLead?: string;

  @IsOptional()
  @IsString()
  leadSuccessText?: string;
}
