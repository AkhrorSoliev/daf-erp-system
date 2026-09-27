import { Injectable } from '@nestjs/common';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceStatsService } from './attendance-stats.service';
import {
  AttendanceSaveService,
  type SaveAttendanceOptions,
} from './attendance-save.service';
import type { LessonTimes } from './shared/lesson-window';
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import { ADMITTED_WITHOUT_RULE } from '../billing/lesson-admission';

@Injectable()
export class AttendanceService {
  constructor(
    private validation: AttendanceValidationService,
    private read: AttendanceReadService,
    private stats: AttendanceStatsService,
    private saveService: AttendanceSaveService,
    private admission: LessonAdmissionService,
  ) {}

  validateLessonDate(groupId: string, date: string, companyId?: number) {
    return this.validation.validateLessonDate(groupId, date, companyId);
  }

  assertWindowOpen(lesson: LessonTimes) {
    this.validation.assertWindowOpen(lesson);
  }

  getLessonDates(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    return this.read.getLessonDates(groupId, month, year, companyId);
  }

  /**
   * The roster plus what the screen must obey (ADR-0045): the lesson window
   * and, per student, whether contract 3.2 admits them to this lesson.
   */
  async getByDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    const roster = await this.read.getByDate(groupId, date, companyId, roles);
    const [window, admission] = await Promise.all([
      this.validation.windowFor(groupId, date, companyId),
      this.admission.forLesson({
        groupId,
        lessonDay: date,
        studentIds: roster.activeStudents.map((s) => s.studentId),
      }),
    ]);
    return {
      ...roster,
      window,
      activeStudents: roster.activeStudents.map((s) => ({
        ...s,
        admission: admission.get(s.studentId) ?? ADMITTED_WITHOUT_RULE,
      })),
    };
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
    options?: SaveAttendanceOptions,
  ) {
    return this.saveService.save(
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
      options,
    );
  }
}
