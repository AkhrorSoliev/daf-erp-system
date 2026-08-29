import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DafLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Yo'lning tartibi. Daraja o'sish tartibida yuriladi.
 *
 * Uchta daraja, beshta emas: `A1.1`/`A1.2` bo'linishi manbaning yorlig'i
 * edi, o'quvchi va Goethe imtihoni uchun esa daraja bitta — A1.
 */
export const LEVEL_ORDER: DafLevel[] = [DafLevel.A1, DafLevel.A2, DafLevel.B1];

/** Ekranda ko'rinadigan daraja nomi. */
export const LEVEL_LABEL: Record<DafLevel, string> = {
  [DafLevel.A1]: 'A1',
  [DafLevel.A2]: 'A2',
  [DafLevel.B1]: 'B1',
};

export interface LevelPathItem {
  level: DafLevel;
  label: string;
  units: {
    id: number;
    order: number;
    titleUz: string;
    titleDe: string;
    lessonCount: number;
  }[];
}

@Injectable()
export class DafPortalReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** R2 kalitini ommaviy manzilga aylantiradi. */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

  /**
   * Daraja yo'li: A1 dan B1 gacha, har darajada bo'limlar.
   *
   * Bo'limi yo'q daraja ham qaytariladi — o'quvchi butun yo'lni ko'rishi
   * kerak, shu jumladan hali kontenti yo'q bosqichlarni ham. Ularni
   * yashirish «B1 umuman yo'q» degan taassurot qoldirardi.
   */
  async getLevels(): Promise<LevelPathItem[]> {
    const units = await this.prisma.dafUnit.findMany({
      orderBy: [{ level: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        level: true,
        order: true,
        titleUz: true,
        titleDe: true,
        _count: { select: { lessons: true } },
      },
    });

    return LEVEL_ORDER.map((level) => ({
      level,
      label: LEVEL_LABEL[level],
      units: units
        .filter((u) => u.level === level)
        .map((u) => ({
          id: u.id,
          order: u.order,
          titleUz: u.titleUz,
          titleDe: u.titleDe,
          lessonCount: u._count.lessons,
        })),
    }));
  }

  /**
   * Bitta bo'lim — BOSQICHLAR ro'yxati (har bo'limda aynan beshta).
   *
   * Bo'limning o'zi lug'at yoki mashq qaytarmaydi: bo'limda 30–50 so'z va
   * o'nlab mashq bor, ya'ni bitta ekranga sig'maydi va o'quvchi qayerdan
   * boshlashini bilmaydi. Kontent bosqichning ichida.
   */
  async getUnit(unitId: number) {
    const unit = await this.prisma.dafUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        level: true,
        order: true,
        titleUz: true,
        titleDe: true,
      },
    });
    if (!unit) throw new NotFoundException("Bo'lim topilmadi");

    // Bosqich tartibi — `tier` ning o'zi. `order` ustuni saqlanib qolgan,
    // lekin yo'lni belgilaydigan raqam bosqichniki.
    const lessons = await this.prisma.dafLesson.findMany({
      where: { unitId },
      orderBy: { tier: 'asc' },
      select: {
        id: true,
        order: true,
        tier: true,
        titleDe: true,
        titleUz: true,
        _count: { select: { lexemes: true, exercises: true } },
      },
    });

    return {
      ...unit,
      label: LEVEL_LABEL[unit.level],
      lessons: lessons.map((l) => ({
        id: l.id,
        order: l.order,
        tier: l.tier,
        titleDe: l.titleDe,
        titleUz: l.titleUz,
        wordCount: l._count.lexemes,
        exerciseCount: l._count.exercises,
      })),
    };
  }

  /**
   * Bitta dars: lug'at yoki grammatika izohi, so'ng mashqlar.
   *
   * TO'G'RI JAVOB QAYTARILMAYDI. Uni yuborish mashqning ma'nosini
   * yo'qotardi — brauzerdagi tarmoq oynasida ko'rinib turardi. Javob
   * faqat urinish yozilganda, serverda tekshiriladi.
   *
   * Nafaqaga chiqarilgan mashq ro'yxatga tushmaydi, lekin bazada qoladi:
   * unga ishora qiluvchi urinish tarixi saqlanadi.
   */
  async getLesson(lessonId: number) {
    const lesson = await this.prisma.dafLesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        order: true,
        tier: true,
        titleDe: true,
        titleUz: true,
        unit: { select: { id: true, titleUz: true, level: true } },
        grammar: {
          select: {
            id: true,
            code: true,
            titleDe: true,
            titleUz: true,
            explanationUz: true,
            explanationEn: true,
          },
        },
      },
    });
    if (!lesson) throw new NotFoundException('Dars topilmadi');

    const [lexemes, exercises] = await Promise.all([
      this.prisma.dafLexeme.findMany({
        where: { lessonId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          de: true,
          uz: true,
          audioKey: true,
          audioStartMs: true,
          audioEndMs: true,
          imageKey: true,
        },
      }),
      this.prisma.dafExercise.findMany({
        where: { lessonId, retiredAt: null },
        orderBy: [{ sourceSetCode: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          kind: true,
          prompt: true,
          options: true,
          answerStatus: true,
        },
      }),
    ]);

    return {
      ...lesson,
      label: LEVEL_LABEL[lesson.unit.level],
      lexemes: lexemes.map((l) => ({
        id: l.id,
        de: l.de,
        uz: l.uz,
        audioUrl: this.mediaUrl(l.audioKey),
        // Oraliq — so'zning fayl ichidagi o'rni. Usiz tugma butun
        // bo'limni ketma-ket eshittirardi.
        audioStartMs: l.audioStartMs,
        audioEndMs: l.audioEndMs,
        imageUrl: this.mediaUrl(l.imageKey),
      })),
      exercises,
    };
  }

  /**
   * Grammatika mavzulari — 92 sahifaning hammasi.
   *
   * Bu ro'yxat kamchilikni yopadi: mashqlarning 459 tasi (39 %) hech
   * qaysi bo'limga tegishli emas, chunki ularning sahifasini hech qaysi
   * bob o'z mavzusi deb ko'rsatmagan. Bo'lim yo'li ularni ko'rsatmaydi;
   * bu ro'yxat ko'rsatadi.
   */
  async getGrammarIndex() {
    const rows = await this.prisma.dafGrammar.findMany({
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        titleDe: true,
        titleUz: true,
        level: true,
        unitId: true,
        _count: { select: { exercises: true } },
      },
    });

    return rows.map((g) => ({
      id: g.id,
      code: g.code,
      titleDe: g.titleDe,
      titleUz: g.titleUz,
      level: g.level,
      /** Yo'lda ko'rinadimi — yo'q bo'lsa faqat shu ro'yxatdan ochiladi. */
      inPath: g.unitId !== null,
      exerciseCount: g._count.exercises,
    }));
  }
}
