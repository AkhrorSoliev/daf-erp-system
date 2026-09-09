import { Injectable } from '@nestjs/common';
import { DafLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** So'z: audio VA rasm ikkalasi ham bo'lishi mumkin. */
export interface WordMediaCounts {
  total: number;
  withAudio: number;
  /** Rasm chizib bo'ladigan so'zlar soni — rasm nisbati shunga qarab hisoblanadi. */
  pictureEligible: number;
  withImage: number;
}

/** Gap, ibora, dialog qatori — faqat audio tashiydi, rasm o'ylab topilmaydi. */
export interface AudioOnlyMediaCounts {
  total: number;
  withAudio: number;
}

export interface MediaSectionCoverage {
  sectionId: number;
  code: string;
  order: number;
  titleUz: string;
  words: WordMediaCounts;
  sentences: AudioOnlyMediaCounts;
  phrases: AudioOnlyMediaCounts;
  dialogLines: AudioOnlyMediaCounts;
}

export interface MediaUnitCoverage {
  unitId: number;
  code: string | null;
  order: number;
  titleUz: string;
  sections: MediaSectionCoverage[];
}

export interface MediaLevelCoverage {
  level: DafLevel;
  units: MediaUnitCoverage[];
}

export interface MediaCoverageOverview {
  levels: MediaLevelCoverage[];
}

/** `COUNT(*)` postgresda bigint qaytaradi — Prisma buni JS `bigint`ga aylantiradi. */
interface RawSectionCount {
  sectionId: number | null;
  total: bigint;
  withAudio: bigint;
}

interface RawWordSectionCount extends RawSectionCount {
  pictureEligible: bigint;
  withImage: bigint;
}

const zeroWords = (): WordMediaCounts => ({
  total: 0,
  withAudio: 0,
  pictureEligible: 0,
  withImage: 0,
});
const zeroAudioOnly = (): AudioOnlyMediaCounts => ({ total: 0, withAudio: 0 });

/**
 * `/media` sahifasining bazadan o'zi to'ladigan bo'limi.
 *
 * `DafMediaOverviewService`dan farqi: u eskirgan `content/daf/*.json`
 * fayllarini o'qiydi, bu esa haqiqiy kontent jadvallarini (`DafLexeme`,
 * `DafSentence`, `DafPhrase`, `DafDialogLine`) hisoblaydi. Har safar
 * `daf-gen-audio.ts`/`daf-gen-images.ts` yangi kalit yozganda, bu ko'rinish
 * QAYTA ISHLASHSIZ yangilanadi — muammoning o'zi shu edi: eski manifest
 * hech qachon o'z-o'zidan to'lmasdi.
 */
@Injectable()
export class DafMediaCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async coverage(): Promise<MediaCoverageOverview> {
    const [
      units,
      sections,
      wordRows,
      sentenceRows,
      phraseRows,
      dialogLineRows,
    ] = await Promise.all([
      // Nafaqaga chiqqan bo'lim (retiredAt) joriy kursda ko'rsatilmaydi —
      // xuddi portal o'quvchiga ko'rsatmagani kabi (daf-portal-read.service.ts).
      this.prisma.dafUnit.findMany({
        where: { retiredAt: null },
        orderBy: [{ level: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          level: true,
          order: true,
          code: true,
          titleUz: true,
        },
      }),
      this.prisma.dafSection.findMany({
        orderBy: [{ unitId: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          unitId: true,
          order: true,
          code: true,
          titleUz: true,
        },
      }),
      this.prisma.$queryRaw<RawWordSectionCount[]>`
          SELECT "sectionId",
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE "audioKey" IS NOT NULL) AS "withAudio",
            COUNT(*) FILTER (WHERE "picturable" = true) AS "pictureEligible",
            COUNT(*) FILTER (WHERE "picturable" = true AND "imageKey" IS NOT NULL) AS "withImage"
          FROM "DafLexeme"
          WHERE "sectionId" IS NOT NULL
          GROUP BY "sectionId"
        `,
      this.prisma.$queryRaw<RawSectionCount[]>`
          SELECT "sectionId",
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE "audioKey" IS NOT NULL) AS "withAudio"
          FROM "DafSentence"
          WHERE "sectionId" IS NOT NULL
          GROUP BY "sectionId"
        `,
      this.prisma.$queryRaw<RawSectionCount[]>`
          SELECT "sectionId",
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE "audioKey" IS NOT NULL) AS "withAudio"
          FROM "DafPhrase"
          GROUP BY "sectionId"
        `,
      // DafDialogLine o'zi sectionId tashimaydi — u DafDialog orqali keladi.
      this.prisma.$queryRaw<RawSectionCount[]>`
          SELECT d."sectionId" AS "sectionId",
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE dl."audioKey" IS NOT NULL) AS "withAudio"
          FROM "DafDialogLine" dl
          JOIN "DafDialog" d ON d.id = dl."dialogId"
          GROUP BY d."sectionId"
        `,
    ]);

    const wordsBySection = new Map<number, WordMediaCounts>();
    for (const r of wordRows) {
      if (r.sectionId === null) continue;
      wordsBySection.set(r.sectionId, {
        total: Number(r.total),
        withAudio: Number(r.withAudio),
        pictureEligible: Number(r.pictureEligible),
        withImage: Number(r.withImage),
      });
    }
    const toAudioOnlyMap = (rows: RawSectionCount[]) => {
      const m = new Map<number, AudioOnlyMediaCounts>();
      for (const r of rows) {
        if (r.sectionId === null) continue;
        m.set(r.sectionId, {
          total: Number(r.total),
          withAudio: Number(r.withAudio),
        });
      }
      return m;
    };
    const sentencesBySection = toAudioOnlyMap(sentenceRows);
    const phrasesBySection = toAudioOnlyMap(phraseRows);
    const dialogLinesBySection = toAudioOnlyMap(dialogLineRows);

    const sectionsByUnit = new Map<number, MediaSectionCoverage[]>();
    for (const s of sections) {
      const row: MediaSectionCoverage = {
        sectionId: s.id,
        code: s.code,
        order: s.order,
        titleUz: s.titleUz,
        words: wordsBySection.get(s.id) ?? zeroWords(),
        sentences: sentencesBySection.get(s.id) ?? zeroAudioOnly(),
        phrases: phrasesBySection.get(s.id) ?? zeroAudioOnly(),
        dialogLines: dialogLinesBySection.get(s.id) ?? zeroAudioOnly(),
      };
      const list = sectionsByUnit.get(s.unitId) ?? [];
      list.push(row);
      sectionsByUnit.set(s.unitId, list);
    }

    // `units` keladi allaqachon `[level, order]` bo'yicha saralangan — shu
    // tartibni buzmasdan har bir unitni o'z darajasi ro'yxatiga qo'shamiz.
    const levelsByKey = new Map<DafLevel, MediaUnitCoverage[]>();
    for (const u of units) {
      const row: MediaUnitCoverage = {
        unitId: u.id,
        code: u.code,
        order: u.order,
        titleUz: u.titleUz,
        sections: sectionsByUnit.get(u.id) ?? [],
      };
      const list = levelsByKey.get(u.level) ?? [];
      list.push(row);
      levelsByKey.set(u.level, list);
    }

    const levels: MediaLevelCoverage[] = [...levelsByKey.entries()].map(
      ([level, unitsForLevel]) => ({ level, units: unitsForLevel }),
    );

    return { levels };
  }
}
