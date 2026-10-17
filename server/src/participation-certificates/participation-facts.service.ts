import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DafLessonKind,
  MockExamStatus,
  PlannedAbsenceKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { storedBirthDay } from '../contract-documents/contract-fields';
import {
  GER_LEVELS,
  isAppLevel,
  normalizeLevel,
  tallyApp,
  tallyAttendance,
  type AppLevel,
  type AppTally,
  type GerLevel,
} from './participation-rules';
import type { LevelFacts, StudentFacts } from './participation-types';

/** A `@db.Date` column read as its calendar day (UTC midnight). */
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Loads what the database says about one student's levels. Read-only; it
 * decides nothing (`participation-rules.ts` does). An attendance row exists
 * only for a day the student was on the roster of a held lesson, so holidays,
 * cancelled and unmarked lessons need no calendar reconstruction (spec 3.1).
 */
@Injectable()
export class ParticipationFactsService {
  constructor(private prisma: PrismaService) {}

  async load(
    studentId: number,
    companyId: number,
    onlyLevel?: GerLevel,
  ): Promise<StudentFacts> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { firstName: true, lastName: true, dateOfBirth: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const [rows, planned] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId, companyId, group: { deletedAt: null } },
        select: {
          date: true,
          status: true,
          cancellationId: true,
          groupId: true,
          group: {
            select: {
              name: true,
              level: true,
              lessonMinutes: true,
              course: { select: { name: true, lessonMinutes: true } },
            },
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.plannedAbsence.findMany({
        where: { studentId, companyId, kind: PlannedAbsenceKind.SABABSIZ },
        select: { groupId: true, date: true },
      }),
    ]);
    const plannedKeys = new Set(
      planned.map((p) => `${p.groupId}|${dayOf(p.date)}`),
    );

    const byLevel = new Map<GerLevel, typeof rows>();
    const unleveled = new Set<string>();
    for (const row of rows) {
      const level = normalizeLevel(row.group.level);
      if (level === null) {
        unleveled.add(row.group.name);
        continue;
      }
      if (onlyLevel && level !== onlyLevel) continue;
      const bucket = byLevel.get(level);
      if (bucket) bucket.push(row);
      else byLevel.set(level, [row]);
    }

    const levels: LevelFacts[] = [];
    for (const level of GER_LEVELS) {
      const levelRows = byLevel.get(level);
      if (!levelRows) continue;
      const attendance = tallyAttendance(
        levelRows.map((r) => ({
          status: r.status,
          cancellationId: r.cancellationId,
          plannedUnexcused: plannedKeys.has(`${r.groupId}|${dayOf(r.date)}`),
        })),
      );
      const latest = levelRows[levelRows.length - 1].group;
      const groupNames = [...new Set(levelRows.map((r) => r.group.name))];
      const appFacts = isAppLevel(level)
        ? await this.appFacts(studentId, level)
        : { app: tallyApp(0, 0), unitTests: null };
      levels.push({
        level,
        groupNames,
        courseName: latest.course.name,
        lessonMinutes:
          latest.lessonMinutes ?? latest.course.lessonMinutes ?? null,
        from: dayOf(levelRows[0].date),
        to: dayOf(levelRows[levelRows.length - 1].date),
        attendance,
        app: appFacts.app,
        unitTests: appFacts.unitTests,
        mock: await this.mockFor(studentId, companyId, level),
      });
    }

    return {
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth
          ? storedBirthDay(student.dateOfBirth)
          : null,
      },
      levels,
      unleveledGroups: [...unleveled],
    };
  }

  /**
   * Open lessons of a level (spec 3.2): a lesson with exercises, or the unit
   * test of a unit that has at least one lesson with exercises. A unit with
   * no material yet contributes nothing, so the share the CEO asks for is the
   * share of what students can actually do today.
   */
  private async appFacts(
    studentId: number,
    level: AppLevel,
  ): Promise<{
    app: AppTally;
    unitTests: { passed: number; total: number } | null;
  }> {
    const lessons = await this.prisma.dafLesson.findMany({
      where: { unit: { level, retiredAt: null } },
      select: {
        id: true,
        unitId: true,
        kind: true,
        _count: { select: { exercises: true } },
      },
    });
    const unitsWithMaterial = new Set(
      lessons.filter((l) => l._count.exercises > 0).map((l) => l.unitId),
    );
    const open = lessons.filter(
      (l) =>
        l._count.exercises > 0 ||
        (l.kind === DafLessonKind.UNIT_TEST && unitsWithMaterial.has(l.unitId)),
    );
    const openIds = open.map((l) => l.id);
    if (openIds.length === 0) return { app: tallyApp(0, 0), unitTests: null };

    const done = await this.prisma.dafLessonProgress.findMany({
      where: {
        studentId,
        lessonId: { in: openIds },
        completedAt: { not: null },
      },
      select: { lessonId: true },
    });

    const testIds = open
      .filter((l) => l.kind === DafLessonKind.UNIT_TEST)
      .map((l) => l.id);
    let unitTests: { passed: number; total: number } | null = null;
    if (testIds.length > 0) {
      const passed = await this.prisma.dafSession.findMany({
        where: { studentId, passed: true, lessonId: { in: testIds } },
        select: { lessonId: true },
      });
      unitTests = {
        passed: new Set(passed.map((s) => s.lessonId)).size,
        total: testIds.length,
      };
    }
    return {
      app: tallyApp(new Set(done.map((p) => p.lessonId)).size, openIds.length),
      unitTests,
    };
  }

  /**
   * The latest mock result of the level from an exam whose results were
   * announced to students (ANNOUNCED, or ARCHIVED, which is reachable only
   * from ANNOUNCED); none when the participant is not linked to the card. An
   * exam still in grading can change its scores, and the snapshot is sealed.
   */
  private async mockFor(
    studentId: number,
    companyId: number,
    level: GerLevel,
  ): Promise<LevelFacts['mock']> {
    const mock = await this.prisma.mockExamParticipant.findFirst({
      where: {
        studentId,
        companyId,
        deletedAt: null,
        exam: {
          status: { in: [MockExamStatus.ANNOUNCED, MockExamStatus.ARCHIVED] },
          deletedAt: null,
        },
        level: { equals: level, mode: 'insensitive' },
        totalScore: { not: null },
        gradedAt: { not: null },
      },
      orderBy: { gradedAt: 'desc' },
      select: {
        totalScore: true,
        gradedAt: true,
        exam: { select: { maxScore: true, examDate: true } },
      },
    });
    if (!mock || mock.totalScore === null) return null;
    const when = mock.exam.examDate ?? mock.gradedAt;
    return {
      score: mock.totalScore,
      maxScore: mock.exam.maxScore,
      date: when ? tashkentDateStr(when) : null,
    };
  }
}
