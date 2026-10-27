import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
} from '../../common/date/tashkent';
import {
  DAFI_BOT_ISMI,
  KIRISH_MS,
  KORILGAN_KUN,
  KUCH_OYNA,
  KUNLIK_CHEGARA,
  RUH_NOMZOD_LIMIT,
  SAVOL_SONI,
  TARIX_KUN,
  UCHRASHMASLIK_KUN,
  jangYoqilganmi,
  kuch,
  kunOldin,
  otilganUnitlar,
  raqibIsmi,
  seriya,
  yangiToplamNavbati,
  type Natija,
} from './jang-qoidalari';
import { aralashtir, savollarniTanla } from './savol-tanlash';
import { ruhniTanla, type RuhNomzodi, type RuhSharti } from './ruh-tanlash';
import { botJavoblari } from './dafi-bot';
import type { JangBoshlandi, JangHolati, JangRaqibi } from './jang.types';

/**
 * Jang (spec 2026-10-27). Liga balliga TEGMAYDI: `DafAttempt`/`DafStudentDay`
 * yozilmaydi, jang o'z jadvallarida yashaydi.
 */
@Injectable()
export class JangService {
  private readonly logger = new Logger(JangService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private yoqilgan(studentId: number): boolean {
    return jangYoqilganmi(this.config.get<string>('DAF_JANG'), studentId);
  }

  async holat(studentId: number, hozir = new Date()): Promise<JangHolati> {
    if (!this.yoqilgan(studentId)) {
      return {
        yoqilgan: false,
        ochiq: false,
        bugunQoldi: 0,
        golibSoni: 0,
        seriya: 0,
      };
    }
    const [unitlar, bugun, golibSoni, oxirgilar] = await Promise.all([
      this.otilganUnitIdlar(studentId),
      this.bugungiJanglar(studentId, hozir),
      this.prisma.dafBattle.count({ where: { studentId, result: 'WIN' } }),
      // ponytail: seriya 100 jang bilan cheklanadi; undan uzun seriya kam uchraydi.
      this.prisma.dafBattle.findMany({
        where: { studentId, status: 'DONE' },
        orderBy: { finishedAt: 'desc' },
        take: 100,
        select: { result: true },
      }),
    ]);
    return {
      yoqilgan: true,
      ochiq: unitlar.length > 0,
      bugunQoldi: Math.max(0, KUNLIK_CHEGARA - bugun),
      golibSoni,
      seriya: seriya(oxirgilar.map((o) => o.result as Natija)),
    };
  }

  async boshla(
    studentId: number,
    companyId: number,
    hozir = new Date(),
    rng: () => number = Math.random,
  ): Promise<JangBoshlandi> {
    if (!this.yoqilgan(studentId)) throw new NotFoundException();
    // Yangi jang boshlansa eskisi davom ettirilmaydi — u mag'lubiyat emas, ruh ham bo'lmaydi.
    await this.prisma.dafBattle.updateMany({
      where: { studentId, status: 'OPEN' },
      data: { status: 'ABANDONED' },
    });
    if ((await this.bugungiJanglar(studentId, hozir)) >= KUNLIK_CHEGARA) {
      throw new BadRequestException('Bugungi janglar tugadi');
    }
    const unitIds = await this.otilganUnitIdlar(studentId);
    if (unitIds.length === 0)
      throw new BadRequestException('Avval birinchi unitni tugating');

    const [savollar, menJanglari, oldingiSoni, menTogrilar] = await Promise.all(
      [
        this.prisma.dafBattleQuestion.findMany({
          where: { unitId: { in: unitIds }, status: 'APPROVED' },
          select: { id: true, kind: true },
        }),
        this.prisma.dafBattle.findMany({
          where: { studentId, createdAt: { gte: kunOldin(hozir, TARIX_KUN) } },
          select: {
            questionIds: true,
            createdAt: true,
            ghostBattle: { select: { studentId: true } },
          },
        }),
        this.prisma.dafBattle.count({
          where: { studentId, status: { in: ['DONE', 'ABANDONED'] } },
        }),
        this.prisma.dafBattle.findMany({
          where: { studentId, status: 'DONE' },
          orderBy: { finishedAt: 'desc' },
          take: KUCH_OYNA,
          select: { correctCount: true },
        }),
      ],
    );

    const oxirgiKorilgan = new Map<number, Date>();
    for (const j of menJanglari) {
      for (const q of j.questionIds) {
        const e = oxirgiKorilgan.get(q);
        if (!e || e < j.createdAt) oxirgiKorilgan.set(q, j.createdAt);
      }
    }
    const korilganChegara = kunOldin(hozir, KORILGAN_KUN);
    const korilgan = new Set(
      [...oxirgiKorilgan]
        .filter(([, d]) => d >= korilganChegara)
        .map(([id]) => id),
    );
    const uchrashmaChegara = kunOldin(hozir, UCHRASHMASLIK_KUN);
    const uchrashganlar = new Set(
      menJanglari
        .filter((j) => j.ghostBattle && j.createdAt >= uchrashmaChegara)
        .map((j) => j.ghostBattle!.studentId),
    );
    const menKuchi = kuch(menTogrilar.map((t) => t.correctCount));

    const ruh = yangiToplamNavbati(oldingiSoni)
      ? null
      : await this.ruhQidir(
          companyId,
          hozir,
          {
            menId: studentId,
            menKuchi,
            ruxsatSavollar: new Set(savollar.map((s) => s.id)),
            korilgan,
            uchrashganlar,
          },
          rng,
        );
    const questionIds = ruh
      ? ruh.questionIds
      : savollarniTanla(
          savollar.map((s) => ({
            id: s.id,
            kind: s.kind,
            oxirgiKorilgan: oxirgiKorilgan.get(s.id) ?? null,
          })),
          korilgan,
          rng,
        );
    if (questionIds.length < SAVOL_SONI) {
      throw new ConflictException('Jang savollari hali yetarli emas');
    }
    const bot = ruh ? null : botJavoblari(SAVOL_SONI, menKuchi, rng);

    const jang = await this.prisma.dafBattle.create({
      data: {
        studentId,
        companyId,
        opponent: ruh ? 'GHOST' : 'BOT',
        ghostBattleId: ruh?.battleId ?? null,
        questionIds,
        ...(bot ? { botAnswers: bot as unknown as Prisma.InputJsonValue } : {}),
        lastActivityAt: new Date(hozir.getTime() + KIRISH_MS),
      },
      select: { id: true },
    });

    const [raqib, qatorlar] = await Promise.all([
      this.raqibKartasi(ruh),
      this.prisma.dafBattleQuestion.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          kind: true,
          prompt: true,
          options: true,
          audioKey: true,
          audioStartMs: true,
          audioEndMs: true,
        },
      }),
    ]);
    const byId = new Map(qatorlar.map((q) => [q.id, q]));
    return {
      jangId: jang.id,
      kirishMs: KIRISH_MS,
      raqib,
      savollar: questionIds.map((id, pozitsiya) => {
        const q = byId.get(id)!;
        const url = this.mediaUrl(q.audioKey);
        return {
          pozitsiya,
          kind: q.kind,
          prompt: q.prompt,
          options: q.kind === 'TYPE' ? [] : aralashtir(q.options, rng),
          audio: url
            ? { url, startMs: q.audioStartMs, endMs: q.audioEndMs }
            : null,
        };
      }),
    };
  }

  private async ruhQidir(
    companyId: number,
    hozir: Date,
    shart: RuhSharti,
    rng: () => number,
  ): Promise<RuhNomzodi | null> {
    const nomzodlar = await this.prisma.dafBattle.findMany({
      where: {
        companyId,
        status: 'DONE',
        studentId: { not: shart.menId },
        finishedAt: { gte: kunOldin(hozir, TARIX_KUN) },
        student: { deletedAt: null },
      },
      orderBy: { finishedAt: 'desc' },
      take: RUH_NOMZOD_LIMIT,
      select: { id: true, studentId: true, questionIds: true },
    });
    if (nomzodlar.length === 0) return null;
    const egalar = [...new Set(nomzodlar.map((n) => n.studentId))];
    // ponytail: umumiy `take` — bitta faol ega boshqalarning tarixini siqib chiqarishi mumkin; kerak bo'lsa ega boshiga SQL window.
    const tarix = await this.prisma.dafBattle.findMany({
      where: { studentId: { in: egalar }, status: 'DONE' },
      orderBy: { finishedAt: 'desc' },
      take: egalar.length * KUCH_OYNA * 3,
      select: { studentId: true, correctCount: true },
    });
    const togrilar = new Map<number, number[]>();
    for (const t of tarix) {
      const xs = togrilar.get(t.studentId) ?? [];
      if (xs.length < KUCH_OYNA) xs.push(t.correctCount);
      togrilar.set(t.studentId, xs);
    }
    return ruhniTanla(
      nomzodlar.map((n) => ({
        battleId: n.id,
        studentId: n.studentId,
        questionIds: n.questionIds,
        egaKuchi: kuch(togrilar.get(n.studentId) ?? []),
      })),
      shart,
      rng,
    );
  }

  private async raqibKartasi(ruh: RuhNomzodi | null): Promise<JangRaqibi> {
    if (!ruh)
      return {
        tur: 'BOT',
        studentId: null,
        ism: DAFI_BOT_ISMI,
        rasm: null,
        golibSoni: null,
      };
    const [s, golibSoni] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: ruh.studentId },
        select: { firstName: true, lastName: true, photo: true },
      }),
      this.prisma.dafBattle.count({
        where: { studentId: ruh.studentId, result: 'WIN' },
      }),
    ]);
    return {
      tur: 'GHOST',
      studentId: ruh.studentId,
      ism: s ? raqibIsmi(s) : '—',
      rasm: s?.photo ?? null,
      golibSoni,
    };
  }

  private async otilganUnitIdlar(studentId: number): Promise<number[]> {
    const darslar = await this.prisma.dafLesson.findMany({
      where: { unit: { retiredAt: null } },
      select: {
        unitId: true,
        progress: {
          where: { studentId, completedAt: { not: null } },
          select: { id: true },
        },
      },
    });
    return otilganUnitlar(
      darslar.map((d) => ({
        unitId: d.unitId,
        tugagan: d.progress.length > 0,
      })),
    );
  }

  private bugungiJanglar(studentId: number, hozir: Date): Promise<number> {
    return this.prisma.dafBattle.count({
      where: {
        studentId,
        createdAt: tashkentDayRangeUtc(tashkentDateStr(hozir)),
      },
    });
  }

  /** R2 kaliti → ommaviy manzil (`DafPortalReadService.mediaUrl` bilan bir xil). */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }
}
