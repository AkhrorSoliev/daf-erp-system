import { Injectable } from '@nestjs/common';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceStatsService } from './attendance-stats.service';
import { AttendanceSaveService } from './attendance-save.service';

@Injectable()
export class AttendanceService {
  constructor(
    private validation: AttendanceValidationService,
    private read: AttendanceReadService,
    private stats: AttendanceStatsService,
    private saveService: AttendanceSaveService,
  ) {}

  validateLessonDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    return this.validation.validateLessonDate(groupId, date, companyId, roles);
  }

  getLessonDates(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    return this.read.getLessonDates(groupId, month, year, companyId);
  }

  getByDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    return this.read.getByDate(groupId, date, companyId, roles);
  }

  getLessonSequence(groupId: string, companyId?: number) {
    return this.read.getLessonSequence(groupId, companyId);
  }

  getLessonCalendar(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    return this.read.getLessonCalendar(groupId, month, year, companyId);
  }

  getStats(
    groupId: string,
    startDate?: string,
    endDate?: string,
    companyId?: number,
  ) {
    return this.stats.getStats(groupId, startDate, endDate, companyId);
  }

  save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    return this.saveService.save(groupId, date, dto, userId, roles, companyId);
  }
}
