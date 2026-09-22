import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import {
  AbsenceStreakService,
  type StreakRow,
} from '../outreach/absence-streak.service';
import { StudentsStatusService } from '../students/students-status.service';
import {
  AbsencePauseNotifyService,
  type PauseTarget,
} from './absence-pause-notify.service';

export interface AutoPauseRunResult {
  paused: number;
  warned: number;
  /** Kunlik chegara oshgani uchun hech kim pauza qilinmadimi. */
  blockedByCap: boolean;
}

/**
 * Ketma-ket dars qoldirgan o'quvchini avtomatik muzlatadi (pauza).
 *
 * NEGA ERTALAB, KECHQURUN EMAS: prodda eng erta dars 08:00, eng kech
 * tugash 20:00. Ertalabki yurishda kechagi davomat yakunlangan —
 * davomatning 5,6% i keyingi kunlarda tuzatiladi va kechqurungi yurish
 * ularni o'tkazib yuborardi. Pauza birinchi darsdan oldin ro'yxatga
 * tushadi, xabar esa yarim tunda emas, odam o'qiydigan vaqtda boradi.
 *
 * Yakshanba va bayramlarda ham yuradi: davomatsiz kun sanoqni
 * o'zgartirmaydi, lekin kechikkan tuzatishlar aynan shunday ushlanadi.
 *
 * `CRONS_ENABLED=false` da `ScheduleModule` umuman yuklanmaydi, shuning
 * uchun bu yerda alohida gate kerak emas.
 */
@Injectable()
export class AbsenceAutoPauseCronService {
  private readonly logger = new Logger(AbsenceAutoPauseCronService.name);

  constructor(
    private prisma: PrismaService,
    private settings: AbsencePauseSettingService,
    private streaks: AbsenceStreakService,
    private studentsStatus: StudentsStatusService,
    private notify: AbsencePauseNotifyService,
  ) {}

  @Cron('0 30 7 * * *', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    for (const c of companies) {
      try {
        const r = await this.runForCompany(c.id);
        if (r.paused || r.warned || r.blockedByCap) {
          this.logger.log(
            `Kompaniya ${c.id}: ${r.paused} pauza, ${r.warned} ogohlantirish` +
              (r.blockedByCap ? ' (chegara oshdi — pauza qilinmadi)' : ''),
          );
        }
      } catch (err) {
        this.logger.error(
          `Kompaniya ${c.id} uchun avtomatik pauza yiqildi: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async runForCompany(companyId: number): Promise<AutoPauseRunResult> {
    const settings = await this.settings.get(companyId);
    if (!settings.enabled) {
      return { paused: 0, warned: 0, blockedByCap: false };
    }

    // BITTA so'rov: ogohlantirish chegarasidan boshlab hammasi. Pauza
    // ro'yxati shundan ajratiladi — ikkinchi marta hisoblash ro'yxat bilan
    // harakatning zid bo'lishiga yo'l ochardi.
    const rows = await this.streaks.computeStreaks({
      companyId,
      threshold: settings.warnThreshold,
    });

    const toPause = rows.filter(
      (r) => r.consecutiveAbsentCount >= settings.pauseThreshold,
    );
    const toWarn = rows.filter(
      (r) => r.consecutiveAbsentCount < settings.pauseThreshold,
    );

    const targets = await this.loadTargets(rows, companyId);

    // FAIL-CLOSED: nomzodlar chegaradan ko'p bo'lsa HECH KIM pauza
    // qilinmaydi. Davomat noto'g'ri kiritilgan kun yoki migratsiya bir
    // kechada yuzlab o'quvchini muzlatib qo'yishi mumkin, va buni
    // qaytarish yuz marta tugma bosish degani. Birinchi N tasini pauza
    // qilish ham noto'g'ri bo'lardi — qaysi N tasi ekani tasodifiy.
    //
    // Ogohlantirishlar chegaraga bog'liq emas: ular hech narsani buzmaydi
    // va aynan shunday kunda ular ayniqsa kerak.
    const blockedByCap = toPause.length > settings.dailyCap;
    if (blockedByCap) {
      await this.notify.alertCeos(
        companyId,
        `Avtomatik pauza to'xtatildi: ${toPause.length} ta nomzod topildi, ` +
          `kunlik chegara esa ${settings.dailyCap}. Hech kim pauza qilinmadi. ` +
          `Davomat ma'lumotini tekshiring yoki chegarani oshiring.`,
      );
    }

    const failures: string[] = [];
    let paused = 0;

    if (!blockedByCap) {
      for (const row of toPause) {
        const target = targets.get(row.enrollmentId);
        if (!target) continue;
        try {
          // Yaxlit tranzaksiya EMAS: mavjud status oqimi tranzaksion emas
          // (ichida faqat oldindan to'langan darslarni qaytarish o'z
          // Serializable tranzaksiyasida ketadi). Nomzodlar bir-biridan
          // mustaqil, shuning uchun biri yiqilsa boshqasi yarim holatda
          // qolmaydi. `pauseForAbsence` o'quvchini qayta o'qiydi, ya'ni
          // shu orada admin uni chiqarib yuborgan bo'lsa o'tkazib yuboradi.
          await this.studentsStatus.pauseForAbsence({
            studentId: row.studentId,
            companyId,
            streak: row.consecutiveAbsentCount,
            lastAbsenceDate: row.lastAbsenceDate,
          });
          paused++;
          await this.notify.announcePause({
            ...target,
            streak: row.consecutiveAbsentCount,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`#${row.studentId}: ${msg}`);
          this.logger.error(`Pauza yiqildi #${row.studentId}: ${msg}`);
        }
      }
    }

    const warned = await this.sendWarnings(
      companyId,
      toWarn,
      targets,
      settings.pauseThreshold,
    );

    // Yiqilgan holat jim qolmasin — aks holda o'quvchi pauzada deb
    // o'ylanadi, aslida esa hisob yozilib turadi.
    if (failures.length > 0) {
      await this.notify.alertCeos(
        companyId,
        `Avtomatik pauzada ${failures.length} ta xatolik: ${failures.join('; ')}`,
      );
    }

    return { paused, warned, blockedByCap };
  }

  /**
   * Bir qoldirish — bir xabar.
   *
   * Cron har kuni yuradi, sanoq esa keyingi darsgacha o'zgarmaydi. Kunlik
   * marker bo'lsa o'quvchi bir xil xabarni har kuni olardi, shuning uchun
   * marker — qoldirish SANASI (`AbsenceWarningLog` unique kaliti).
   */
  private async sendWarnings(
    companyId: number,
    rows: StreakRow[],
    targets: Map<string, PauseTarget>,
    pauseThreshold: number,
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const already = await this.prisma.absenceWarningLog.findMany({
      where: {
        companyId,
        OR: rows.map((r) => ({
          enrollmentId: r.enrollmentId,
          absenceDate: r.lastAbsenceDate,
        })),
      },
      select: { enrollmentId: true },
    });
    const sentSet = new Set(already.map((a) => a.enrollmentId));

    let warned = 0;
    for (const row of rows) {
      if (sentSet.has(row.enrollmentId)) continue;
      const target = targets.get(row.enrollmentId);
      if (!target) continue;

      const remaining = pauseThreshold - row.consecutiveAbsentCount;
      try {
        const sentToStudent = await this.notify.warnStudent(
          { ...target, streak: row.consecutiveAbsentCount },
          remaining,
        );
        await this.prisma.absenceWarningLog.create({
          data: {
            enrollmentId: row.enrollmentId,
            studentId: row.studentId,
            groupId: row.groupId,
            absenceDate: row.lastAbsenceDate,
            streak: row.consecutiveAbsentCount,
            sentToStudent,
            companyId,
          },
        });
        warned++;
      } catch (err) {
        this.logger.warn(
          `Ogohlantirish yiqildi #${row.studentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return warned;
  }

  /** Xabar uchun kerak bo'lgan ism, guruh, filial va ustozlar — bitta so'rov. */
  private async loadTargets(
    rows: StreakRow[],
    companyId: number,
  ): Promise<Map<string, PauseTarget>> {
    if (rows.length === 0) return new Map();
    const enrollments = await this.prisma.enrollment.findMany({
      where: { id: { in: rows.map((r) => r.enrollmentId) } },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            telegramChatId: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            branchId: true,
            teachers: { select: { teacherId: true } },
          },
        },
      },
    });
    return new Map(
      enrollments.map((e) => [
        e.id,
        {
          enrollmentId: e.id,
          studentId: e.studentId,
          // Haqiqiy son chaqiruv joyida qo'yiladi — bu yerda shakl uchun.
          streak: 0,
          companyId,
          student: e.student,
          group: e.group,
        },
      ]),
    );
  }
}
