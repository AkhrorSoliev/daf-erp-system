import { Injectable, Logger } from '@nestjs/common';
import { DafAnswerStatus, DafLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CefrLevel,
  DafDataset,
  GapExercise,
} from '../../daf-content/dataset.types';
import { DAF_UNIT_TITLES, orderWithinLevel } from './daf-unit-titles';

export interface SeedReport {
  units: number;
  lexemes: number;
  grammar: number;
  exercises: number;
  /** Manbadan yo'qolgani uchun nafaqaga chiqarilgan mashqlar. */
  retired: number;
  /** Manbadan yo'qolgani uchun o'chirilgan lug'at yozuvlari. */
  lexemesRemoved: number;
}

/** `A1.1` → `A1_1`. Prisma enum nuqtani qabul qilmaydi. */
export function toDafLevel(level: CefrLevel): DafLevel {
  return level.replace('.', '_') as DafLevel;
}

/**
 * Yig'ish holatini bazadagi holatga o'giradi.
 *
 * `MISSING` bazaga tushmaydi: u yig'ish oralig'idagi holat («javob hali
 * biriktirilmagan»), saqlanadigan fakt emas. Bazada javobsizlikning yagona
 * nomi — `OPEN`, ya'ni «manba javob bermagan».
 *
 * `DRAFT`/`APPROVED` — o'zimiz yozadigan savollar uchun (Hören, Faza 3).
 * Bazada ular uchun hali joy yo'q, shuning uchun ular jimgina boshqa
 * qiymatga aylantirilmaydi: yiqilish migratsiya kerakligini aytadi,
 * soxta `OPEN` esa tasdiqlangan javobni javobsiz qilib ko'rsatardi.
 */
export function toAnswerStatus(
  status: GapExercise['answerStatus'],
  exerciseId: string,
): DafAnswerStatus {
  switch (status) {
    case 'MISSING':
    case 'OPEN':
      return DafAnswerStatus.OPEN;
    case 'FROM_SOURCE':
      return DafAnswerStatus.FROM_SOURCE;
    case 'PARTIAL':
      return DafAnswerStatus.PARTIAL;
    default:
      throw new Error(
        `${exerciseId}: \`${status}\` holati bazada yo'q — migratsiya kerak`,
      );
  }
}

/**
 * Lug'at yozuvining barqaror id'si.
 *
 * Manbada leksemaning o'z id'si YO'Q — faqat bo'lim id'si bor. Shuning uchun
 * kalit bo'lim id'si va bo'lim ichidagi tartibdan quriladi. Bu manba
 * tartibi barqaror ekaniga tayanadi, va u barqaror: yozuvlar sahifadagi
 * ro'yxat tartibida o'qiladi.
 */
export function lexemeSourceId(sectionId: string, index: number): string {
  return `${sectionId}#${index + 1}`;
}

/**
 * `dib.json` ni bazaga tushiradi.
 *
 * IDEMPOTENT: hamma narsa `sourceId` bo'yicha `upsert` qilinadi, shuning
 * uchun qayta yuritish yangilaydi, takrorlamaydi. Bu qulaylik emas —
 * `dib.json` qayta yig'ilganda seed ham qayta yuritiladi, va takrorlangan
 * qatorlar mashqni o'quvchiga ikki marta ko'rsatardi.
 *
 * Manbadan yo'qolgan MASHQ o'chirilmaydi, `retiredAt` bilan belgilanadi:
 * unga ishora qiluvchi urinish tarixi ma'nosini yo'qotadi. Lug'at yozuvi
 * esa o'chiriladi — unga hech narsa ishora qilmaydi.
 */
/**
 * Bir martada bitta tranzaksiyaga yuboriladigan yozuvlar soni.
 *
 * Sabab o'lchangan: 3 100 ta ketma-ket `upsert` Neon'ga qirq daqiqadan
 * oshdi, chunki har biri alohida borish-kelish kutardi. Bo'lak ichida ular
 * baravariga ketadi. 50 — ulanishlar hovuzini bo'g'ib qo'ymaslik uchun
 * tanlangan chegara.
 */
const BATCH = 50;

@Injectable()
export class DafSeedService {
  private readonly logger = new Logger(DafSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(dataset: DafDataset): Promise<SeedReport> {
    const unitIdByChapter = await this.seedUnits(dataset);
    const lexemes = await this.seedLexemes(dataset, unitIdByChapter);
    const grammarIdByCode = await this.seedGrammar(dataset, unitIdByChapter);
    const exercises = await this.seedExercises(dataset, grammarIdByCode);

    const retired = await this.retireMissingExercises(dataset);
    const lexemesRemoved = await this.removeMissingLexemes(dataset);

    return {
      units: unitIdByChapter.size,
      lexemes,
      grammar: grammarIdByCode.size,
      exercises,
      retired,
      lexemesRemoved,
    };
  }

  private async seedUnits(dataset: DafDataset): Promise<Map<number, number>> {
    const byChapter = new Map<number, number>();

    for (const ch of dataset.chapters) {
      // Darajasi hisoblanmagan bob bo'lim bo'la olmaydi: yo'l darajaga
      // qurilgan, va darajasiz bo'limni qayerga qo'yishni hech kim
      // ayta olmaydi.
      if (!ch.level) continue;

      const title = DAF_UNIT_TITLES.find((t) => t.chapter === ch.chapter);
      if (!title) continue;

      const level = toDafLevel(ch.level);
      const order = orderWithinLevel(ch.chapter, ch.level, dataset.chapters);

      const unit = await this.prisma.dafUnit.upsert({
        where: { level_order: { level, order } },
        create: {
          level,
          order,
          titleDe: title.titleDe,
          titleUz: title.titleUz,
          sourceChapter: ch.chapter,
        },
        update: {
          titleDe: title.titleDe,
          titleUz: title.titleUz,
          sourceChapter: ch.chapter,
        },
      });
      byChapter.set(ch.chapter, unit.id);
    }

    return byChapter;
  }

  private async seedLexemes(
    dataset: DafDataset,
    unitIdByChapter: Map<number, number>,
  ): Promise<number> {
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    for (const section of dataset.sections) {
      const unitId = unitIdByChapter.get(section.chapter);
      if (unitId === undefined) continue;

      for (const [i, entry] of section.entries.entries()) {
        const sourceId = lexemeSourceId(section.id, i);
        const data = {
          unitId,
          de: entry.de,
          en: entry.en,
          sectionTitleDe: section.titleDe,
          audioKey: section.audio?.key ?? null,
          order: i + 1,
        };
        // `uz` va `translationSource` `update` da YO'Q: o'qituvchi tuzatgan
        // tarjima seed qayta yuritilganda yo'qolmasligi kerak.
        writes.push(
          this.prisma.dafLexeme.upsert({
            where: { sourceId },
            create: { sourceId, ...data },
            update: data,
          }),
        );
      }
    }

    await this.runBatched(writes);
    return writes.length;
  }

  /**
   * Yozuvlarni bo'laklab, bo'lak ichida BARAVARIGA yuboradi.
   *
   * Tranzaksiya ATAYLAB ishlatilmaydi. Ikki sabab: yozuvlar bir-biriga
   * bog'liq emas (har biri o'z `sourceId` si bo'yicha mustaqil `upsert`),
   * va seed idempotent — yarim yo'lda uzilsa, qayta yuritish tugatadi.
   * Massiv shaklidagi `$transaction` esa faqat `isolationLevel` qabul
   * qiladi, chegara berib bo'lmaydi: 50 ta yozuv standart 5 soniyaga
   * sig'may «rollback» bilan uzildi.
   *
   * Bo'lak hajmi ulanishlar hovuzini bo'g'ib qo'ymaslik uchun cheklangan.
   */
  private async runBatched(
    writes: Prisma.PrismaPromise<unknown>[],
  ): Promise<void> {
    for (let i = 0; i < writes.length; i += BATCH) {
      await Promise.all(writes.slice(i, i + BATCH));
    }
  }

  private async seedGrammar(
    dataset: DafDataset,
    unitIdByChapter: Map<number, number>,
  ): Promise<Map<string, number>> {
    // Bitta grammatika sahifasi bir necha bobda uchraydi. Bo'lim sifatida
    // uni BIRINCHI marta `grammarFocus` sifatida ko'rsatgan bob olinadi —
    // «tavsiya» dan ko'ra «asosiy» kuchliroq bog'lanish. Hech qaysi bob
    // ko'rsatmasa, sahifa bo'limsiz qoladi (u baribir kodi bo'yicha
    // ochiladi).
    const focusChapter = new Map<string, number>();
    for (const ch of dataset.chapters) {
      for (const code of ch.grammarFocus) {
        if (!focusChapter.has(code)) focusChapter.set(code, ch.chapter);
      }
    }
    for (const ch of dataset.chapters) {
      for (const code of ch.grammarRecommended) {
        if (!focusChapter.has(code)) focusChapter.set(code, ch.chapter);
      }
    }

    const byCode = new Map<string, number>();

    for (const g of dataset.grammar) {
      const chapter = focusChapter.get(g.code);
      const unitId =
        chapter === undefined ? null : (unitIdByChapter.get(chapter) ?? null);

      const row = await this.prisma.dafGrammar.upsert({
        where: { sourceId: g.code },
        create: {
          sourceId: g.code,
          code: g.code,
          unitId,
          titleDe: g.titleDe,
          explanationEn: g.explanation,
          level: g.level ? toDafLevel(g.level) : null,
        },
        update: {
          unitId,
          titleDe: g.titleDe,
          explanationEn: g.explanation,
          level: g.level ? toDafLevel(g.level) : null,
        },
      });
      byCode.set(g.code, row.id);
    }

    return byCode;
  }

  private async seedExercises(
    dataset: DafDataset,
    grammarIdByCode: Map<string, number>,
  ): Promise<number> {
    // Bo'limlar bitta so'rovda o'qiladi: sahifa boshiga alohida
    // `findUnique` 92 ta ortiqcha borish-kelish edi.
    const rows = await this.prisma.dafGrammar.findMany({
      where: { id: { in: [...grammarIdByCode.values()] } },
      select: { id: true, unitId: true },
    });
    const unitIdByGrammarId = new Map(rows.map((r) => [r.id, r.unitId]));

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const page of dataset.grammar) {
      const grammarId = grammarIdByCode.get(page.code) ?? null;
      const unitId =
        grammarId === null ? null : (unitIdByGrammarId.get(grammarId) ?? null);

      for (const [i, ex] of page.exercises.entries()) {
        const data = this.exerciseData(ex, grammarId, unitId, i);
        writes.push(
          this.prisma.dafExercise.upsert({
            where: { sourceId: ex.id },
            create: data,
            // `retiredAt: null` — manbada qaytadan paydo bo'lgan mashq
            // nafaqadan qaytariladi, aks holda u bir marta yo'qolgani uchun
            // abadiy ko'rinmay qolardi.
            update: { ...data, retiredAt: null },
          }),
        );
      }
    }

    await this.runBatched(writes);
    return writes.length;
  }

  private exerciseData(
    ex: GapExercise,
    grammarId: number | null,
    unitId: number | null,
    index: number,
  ): Prisma.DafExerciseUncheckedCreateInput {
    return {
      sourceId: ex.id,
      grammarId,
      unitId,
      kind: ex.kind,
      prompt: ex.sentenceDe,
      options: ex.options ?? [],
      answers: (ex.answers ?? []) as Prisma.InputJsonValue,
      answerStatus: toAnswerStatus(ex.answerStatus, ex.id),
      slots: ex.slots,
      sourceSetCode: ex.setCode,
      order: index + 1,
    };
  }

  private async retireMissingExercises(dataset: DafDataset): Promise<number> {
    const live = dataset.grammar.flatMap((g) => g.exercises.map((e) => e.id));
    const { count } = await this.prisma.dafExercise.updateMany({
      where: { sourceId: { notIn: live }, retiredAt: null },
      data: { retiredAt: new Date() },
    });
    if (count > 0) {
      this.logger.warn(`${count} ta mashq nafaqaga chiqarildi (manbada yo'q)`);
    }
    return count;
  }

  private async removeMissingLexemes(dataset: DafDataset): Promise<number> {
    const live = dataset.sections.flatMap((s) =>
      s.entries.map((_, i) => lexemeSourceId(s.id, i)),
    );
    const { count } = await this.prisma.dafLexeme.deleteMany({
      where: { sourceId: { notIn: live } },
    });
    return count;
  }
}
