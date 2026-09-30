import { Injectable } from '@nestjs/common';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { LateAttendanceDto } from './dto/late-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceStatsService } from './attendance-stats.service';
import { AttendanceSaveService } from './attendance-save.service';
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import { ADMITTED_WITHOUT_RULE, LEFT_OUT } from '../billing/lesson-admission';
import {
  leftOutAfterEnd,
  lessonHasEnded,
  tashkentClock,
} from './shared/attendance-window';

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

  getLessonDates(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    return this.read.getLessonDates(groupId, month, year, companyId);
  }

  /**
   * The roster plus what the screen must obey: the company's lead
   * (`opensMinutesBefore`, next to the roster's effective times, so the form
   * opens the new-register window as the server judges it) and, per student,
   * whether contract 3.2 admits them to this lesson (ADR-0047). `late` (the
   * «Bo'ldi» register) is judged by the same rule.
   */
  async getByDate(
    groupId: string,
    date: string,
    companyId: number,
    roles?: string[],
    late = false,
  ) {
    const roster = await this.read.getByDate(
      groupId,
      date,
      companyId,
      roles,
      late,
    );
    const [opensMinutesBefore, admission] = await Promise.all([
      this.validation.opensMinutesBefore(companyId),
      this.admission.forLesson({
        groupId,
        lessonDay: date,
        studentIds: roster.activeStudents.map((s) => s.studentId),
      }),
    ]);
    // After the lesson a student the register left out stays out, paid or
    // not — as `save()` judges it.
    const leftOut = leftOutAfterEnd({
      date,
      ended: lessonHasEnded({
        date,
        ...tashkentClock(),
        endTime: roster.effectiveEndTime,
      }),
      takenManually: roster.registerTakenManually,
      unmarkedIds: roster.activeStudents
        .filter((s) => s.status === null)
        .map((s) => s.studentId),
    });
    return {
      ...roster,
      opensMinutesBefore,
      activeStudents: roster.activeStudents.map((s) => ({
        ...s,
        admission: leftOut.has(s.studentId)
          ? LEFT_OUT
          : (admission.get(s.studentId) ?? ADMITTED_WITHOUT_RULE),
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
  ) {
    return this.saveService.save(groupId, date, dto, userId, roles, companyId);
  }

  saveLate(
    groupId: string,
    date: string,
    dto: LateAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    return this.saveService.saveLate(
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
    );
  }
}
