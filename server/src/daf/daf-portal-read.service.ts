import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DafLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Yo'lning tartibi. Daraja o'sish tartibida yuriladi. */
export const LEVEL_ORDER: DafLevel[] = [
  DafLevel.A1_1,
  DafLevel.A1_2,
  DafLevel.A2_1,
  DafLevel.A2_2,
  DafLevel.B1,
];

/** Ekranda ko'rinadigan daraja nomi. */
export const LEVEL_LABEL: Record<DafLevel, string> = {
  [DafLevel.A1_1]: 'A1.1',
  [DafLevel.A1_2]: 'A1.2',
  [DafLevel.A2_1]: 'A2.1',
  [DafLevel.A2_2]: 'A2.2',
  [DafLevel.B1]: 'B1',
};

export interface LevelPathItem {
  level: DafLevel;
  label: string;
  units: { id: number; order: number; titleUz: string; titleDe: string }[];
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
   * Daraja yo'li: A1.1 dan B1 gacha, har darajada bo'limlar.
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
      },
    });

    return LEVEL_ORDER.map((level) => ({
      level,
      label: LEVEL_LABEL[level],
      units: units
        .filter((u) => u.level === level)
        .map(({ id, order, titleUz, titleDe }) => ({
          id,
          order,
          titleUz,
          titleDe,
        })),
    }));
  }

  /**
   * Bitta bo'lim: lug'at, grammatika va mashqlar.
   *
   * TO'G'RI JAVOB QAYTARILMAYDI. Uni yuborish mashqning ma'nosini
   * yo'qotardi — brauzerdagi tarmoq oynasida ko'rinib turardi. Javob
   * faqat urinish yozilganda, serverda tekshiriladi.
   *
   * Nafaqaga chiqarilgan mashq ro'yxatga tushmaydi, lekin bazada qoladi:
   * unga ishora qiluvchi urinish tarixi saqlanadi.
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

    const [lexemes, grammar, exercises] = await Promise.all([
      this.prisma.dafLexeme.findMany({
        where: { unitId },
        orderBy: [{ sectionTitleDe: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          de: true,
          uz: true,
          sectionTitleDe: true,
          audioKey: true,
          imageKey: true,
        },
      }),
      this.prisma.dafGrammar.findMany({
        where: { unitId },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          titleDe: true,
          titleUz: true,
          explanationUz: true,
          level: true,
        },
      }),
      this.prisma.dafExercise.findMany({
        where: { unitId, retiredAt: null },
        orderBy: [{ sourceSetCode: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          kind: true,
          prompt: true,
          options: true,
          answerStatus: true,
          grammarId: true,
        },
      }),
    ]);

    return {
      ...unit,
      label: LEVEL_LABEL[unit.level],
      lexemes: lexemes.map((l) => ({
        id: l.id,
        de: l.de,
        uz: l.uz,
        section: l.sectionTitleDe,
        audioUrl: this.mediaUrl(l.audioKey),
        imageUrl: this.mediaUrl(l.imageKey),
      })),
      grammar,
      exercises,
    };
  }
}
