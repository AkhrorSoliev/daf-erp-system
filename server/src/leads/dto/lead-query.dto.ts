import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { LeadStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class LeadQueryDto extends PaginationDto {
  // Free-text search across first name, last name and phone.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  columnId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  // createdAt range (yyyy-MM-dd).
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
