import { IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export enum ArchiveEntityType {
  USERS = 'users',
  BRANCHES = 'branches',
  ROOMS = 'rooms',
  COURSES = 'courses',
  STUDENTS = 'students',
  LEADS = 'leads',
  GROUPS = 'groups',
  ENROLLMENTS = 'enrollments',
  HOLIDAYS = 'holidays',
}

export class ArchiveQueryDto extends PaginationDto {
  @IsOptional()
  search?: string;
}
