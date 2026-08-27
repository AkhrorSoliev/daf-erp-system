import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DafAnswerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import { DafDrillService } from './lesson/daf-drill.service';

export interface AttemptResult {
  isCorrect: boolean;
  /** To'g'ri javob — FAQAT urinishdan KEYIN qaytariladi. */
  correctAnswers: (string | null)[];
}

export interface AttemptContext {
  studentId: number;
  companyId: number;
}

/**
 * Urinishni yozadi va javobni SERVERDA tekshiradi.
 *
 * Tekshiruv mijozda bo'lishi mumkin emas: to'g'ri javobni brauzerga
 * yuborish uni tarmoq oynasida ko'rinadigan qiladi, va mashqning ham,
 * keyingi reytingning ham ma'nosi qolmaydi.
 */
@Injectable()
export class DafAttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drills: DafDrillService,
  ) {}

  /**
   * Lug'at mashqiga javobni yozadi.
   *
   * Grammatika mashqidan farqi: bu savol bazada YO'Q — u lug'atdan har
   * safar qayta tug'iladi. Shuning uchun urinish `DafExercise` ga emas,
   * LEKSEMAga bog'lanadi, va `exerciseId` bo'sh qoladi.
   */
  async recordDrill(
    input: {
      lessonId: number;
      index: number;
      given: string;
      durationMs?: number;
    },
    ctx: AttemptContext,
  ): Promise<{ isCorrect: boolean; answer: string }> {
    const r = await this.drills.check(input.lessonId, input.index, input.given);

    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const groupId = await this.currentGroupId(ctx.studentId);

    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        lexemeId: r.lexemeId,
        isCorrect: r.isCorrect,
        given: input.given,
        durationMs: input.durationMs ?? null,
        companyId: ctx.companyId,
        branchId,
        groupId,
      },
    });

    return { isCorrect: r.isCorrect, answer: r.answer };
  }

  async record(
    input: { exerciseId: number; given: string; durationMs?: number },
    ctx: AttemptContext,
  ): Promise<AttemptResult> {
    const exercise = await this.prisma.dafExercise.findUnique({
      where: { id: input.exerciseId },
      select: { id: true, answers: true, answerStatus: true, retiredAt: true },
    });
    if (!exercise) throw new NotFoundException('Mashq topilmadi');

    // Nafaqadagi mashqqa yangi urinish yozilmaydi: u endi o'quv yo'lining
    // qismi emas, va unga ball berish reytingni manbadan yo'qolgan
    // kontentga bog'lardi. Eski urinishlar joyida qoladi.
    if (exercise.retiredAt !== null) {
      throw new BadRequestException('Bu mashq endi faol emas');
    }

    // Ochiq javobli mashqda «to'g'ri javob» tushunchasi yo'q — manba uni
    // bermagan, chunki to'g'ri javob bitta emas. Uni «xato» deb belgilash
    // o'quvchini adashtiradi.
    if (exercise.answerStatus === DafAnswerStatus.OPEN) {
      throw new BadRequestException(
        "Bu topshiriqning bitta to'g'ri javobi yo'q — u avtomatik tekshirilmaydi",
      );
    }

    const answers = (exercise.answers ?? []) as (string | null)[];
    const isCorrect = this.check(input.given, answers);

    // Filial va guruh YOZISH PAYTIDA muhrlanadi. Jonli bog'lanishdan
    // o'qilsa, o'quvchi filialdan filialga ko'chganda uning o'tgan oydagi
    // natijalari yangi filialga ko'chib o'tardi.
    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const groupId = await this.currentGroupId(ctx.studentId);

    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        exerciseId: exercise.id,
        isCorrect,
        // Xato javob ham saqlanadi: o'qituvchiga eng kerakli signal aynan
        // shu — guruh qaysi mashqda qoqilyapti.
        given: input.given,
        durationMs: input.durationMs ?? null,
        companyId: ctx.companyId,
        branchId,
        groupId,
      },
    });

    return { isCorrect, correctAnswers: answers };
  }

  /**
   * Javob to'g'rimi.
   *
   * Hozircha faqat MC ishlaydi, ya'ni javob variantning O'ZI — solishtirish
   * aniq. Bo'sh joyli mashqlar uchun bu yetarli emas (`die`/`Die`,
   * `ist gekommen`/`gekommen ist`, imlo xatosi) va ular Faza 3 gacha
   * javob qabul qilmaydi.
   */
  private check(given: string, answers: (string | null)[]): boolean {
    const first = answers[0];
    if (typeof first !== 'string') return false;
    return given.trim() === first.trim();
  }

  /** O'quvchining faol guruhi — muhrlash uchun. Topilmasa `null`. */
  private async currentGroupId(studentId: number): Promise<string | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { groupId: true },
    });
    return enrollment?.groupId ?? null;
  }
}
