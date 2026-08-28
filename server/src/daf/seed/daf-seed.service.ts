import { Injectable, Logger } from '@nestjs/common';
import {
  DafAnswerStatus,
  DafLessonKind,
  DafLevel,
  DafTranslationSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CefrLevel,
  DafDataset,
  GapExercise,
} from '../../daf-content/dataset.types';
import { DAF_UNIT_TITLES, orderWithinLevel } from './daf-unit-titles';

export interface SeedReport {
  units: number;
  lessons: number;
  lexemes: number;
  grammar: number;
  exercises: number;
  /** Manbadan yo'qolgani uchun nafaqaga chiqarilgan mashqlar. */
  retired: number;
  /** Manbadan yo'qolgani uchun o'chirilgan lug'at yozuvlari. */
  lexemesRemoved: number;
  /** Fayldan qo'yilgan tarjimalar. */
  translationsApplied: number;
}

/** `content/daf/translations.json` ning shakli. */
export interface TranslationFile {
  lexemes: {
    sourceId: string;
    uz: string | null;
    translationSource: string | null;
    /** Audio oralig'i — tarjima emas, lekin u ham faqat bazada yashaydi. */
    audioStartMs?: number | null;
    audioEndMs?: number | null;
  }[];
  grammar: {
    sourceId: string;
    titleUz: string | null;
    explanationUz: string | null;
    translationSource: string | null;
  }[];
  lessons: {
    sourceId: string;
    titleUz: string | null;
    translationSource: string | null;
  }[];
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

  async seed(
    dataset: DafDataset,
    translations?: TranslationFile,
  ): Promise<SeedReport> {
    const unitIdByChapter = await this.seedUnits(dataset);
    const grammarIdByCode = await this.seedGrammar(dataset, unitIdByChapter);
    const lessonIdBySource = await this.seedLessons(
      dataset,
      unitIdByChapter,
      grammarIdByCode,
    );
    const lexemes = await this.seedLexemes(
      dataset,
      unitIdByChapter,
      lessonIdBySource,
    );
    const exercises = await this.seedExercises(
      dataset,
      grammarIdByCode,
      lessonIdBySource,
    );

    const retired = await this.retireMissingExercises(dataset);
    const lexemesRemoved = await this.removeMissingLexemes(dataset);
    const translationsApplied = await this.applyTranslations(translations);

    return {
      units: unitIdByChapter.size,
      lessons: lessonIdBySource.size,
      lexemes,
      grammar: grammarIdByCode.size,
      exercises,
      retired,
      lexemesRemoved,
      translationsApplied,
    };
  }

  /**
   * Tarjimalarni fayldan qo'yadi.
   *
   * Shu tufayli ishlab chiqarishda tarjima UMUMAN qilinmaydi: model
   * chaqirilmaydi, API kaliti kerak emas, va har muhitda aynan bir xil matn
   * turadi (model bir xil so'rovga bir xil javob bermaydi).
   *
   * O'QITUVCHI tuzatgan tarjima qayta yozilmaydi. Faylda modelning eski
   * tarjimasi turishi mumkin, bazada esa o'qituvchi tuzatgani — fayl uni
   * bosib o'tsa, tuzatish jimgina yo'qolardi.
   */
  private async applyTranslations(file?: TranslationFile): Promise<number> {
    if (!file) return 0;

    let n = 0;
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    for (const l of file.lexemes) {
      // Audio oralig'i tarjimadan MUSTAQIL yoziladi: o'qituvchi tarjimani
      // tuzatgan bo'lsa ham, oraliq baribir qo'yilishi kerak — u
      // o'lchangan fakt, tahrir emas.
      if (l.audioStartMs != null && l.audioEndMs != null) {
        writes.push(
          this.prisma.dafLexeme.updateMany({
            where: { sourceId: l.sourceId },
            data: { audioStartMs: l.audioStartMs, audioEndMs: l.audioEndMs },
          }),
        );
      }

      if (!l.uz) continue;
      writes.push(
        this.prisma.dafLexeme.updateMany({
          where: {
            sourceId: l.sourceId,
            // `not: TEACHER` YOLG'IZ yetarli emas. Yangi bazada bu ustun
            // NULL, va SQL da `NULL <> 'TEACHER'` natijasi `true` emas,
            // `NULL` — ya'ni qator mos kelmaydi. Aynan shu holat ishlab
            // chiqarishda: birinchi seed'da hamma yozuv tarjimasiz
            // qolardi, va hech qanday xato chiqmasdi.
            OR: [
              { translationSource: null },
              { translationSource: { not: DafTranslationSource.TEACHER } },
            ],
          },
          data: {
            uz: l.uz,
            translationSource: this.toSource(l.translationSource),
          },
        }),
      );
      n++;
    }

    for (const g of file.grammar) {
      writes.push(
        this.prisma.dafGrammar.updateMany({
          where: {
            sourceId: g.sourceId,
            OR: [
              { translationSource: null },
              { translationSource: { not: DafTranslationSource.TEACHER } },
            ],
          },
          data: {
            titleUz: g.titleUz,
            explanationUz: g.explanationUz,
            translationSource: this.toSource(g.translationSource),
          },
        }),
      );
      n++;
    }

    for (const l of file.lessons) {
      if (!l.titleUz) continue;
      writes.push(
        this.prisma.dafLesson.updateMany({
          where: {
            sourceId: l.sourceId,
            OR: [
              { translationSource: null },
              { translationSource: { not: DafTranslationSource.TEACHER } },
            ],
          },
          data: {
            titleUz: l.titleUz,
            translationSource: this.toSource(l.translationSource),
          },
        }),
      );
      n++;
    }

    await this.runBatched(writes);
    return n;
  }

  private toSource(value: string | null): DafTranslationSource {
    return value === 'TEACHER'
      ? DafTranslationSource.TEACHER
      : DafTranslationSource.MODEL;
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

  /**
   * Darslar — bo'lim ichidagi bosqichlar.
   *
   * Tartib ATAYLAB shunday: avval lug'at darslari, keyin grammatika.
   * So'zsiz grammatika ma'nosiz — o'quvchi qoidani biladi, lekin uni
   * qo'llaydigan so'zi yo'q.
   *
   * Dars kaliti manbanikidan quriladi (`dib-voc-01-01`, `gram:no_02`),
   * shuning uchun qayta yuritish darslarni takrorlamaydi.
   */
  private async seedLessons(
    dataset: DafDataset,
    unitIdByChapter: Map<number, number>,
    grammarIdByCode: Map<string, number>,
  ): Promise<Map<string, number>> {
    const byUnit = new Map<
      number,
      {
        sourceId: string;
        kind: DafLessonKind;
        titleDe: string;
        grammarId: number | null;
      }[]
    >();

    for (const section of dataset.sections) {
      const unitId = unitIdByChapter.get(section.chapter);
      if (unitId === undefined) continue;
      const list = byUnit.get(unitId) ?? [];
      list.push({
        sourceId: section.id,
        kind: DafLessonKind.VOCAB,
        titleDe: section.titleDe,
        grammarId: null,
      });
      byUnit.set(unitId, list);
    }

    // Grammatika darsi FAQAT bo'limga biriktirilgan sahifadan tug'iladi.
    // Bo'limsiz 34 sahifa yo'lda ko'rinmaydi, lekin ular yo'qolmaydi —
    // grammatika ro'yxati ularni alohida ko'rsatadi.
    for (const g of dataset.grammar) {
      const grammarId = grammarIdByCode.get(g.code);
      if (grammarId === undefined) continue;
      const row = await this.prisma.dafGrammar.findUnique({
        where: { id: grammarId },
        select: { unitId: true },
      });
      if (!row?.unitId) continue;
      const list = byUnit.get(row.unitId) ?? [];
      list.push({
        sourceId: `gram:${g.code}`,
        kind: DafLessonKind.GRAMMAR,
        titleDe: g.titleDe,
        grammarId,
      });
      byUnit.set(row.unitId, list);
    }

    const bySource = new Map<string, number>();
    for (const [unitId, list] of byUnit) {
      for (const [i, l] of list.entries()) {
        const data = {
          unitId,
          order: i + 1,
          kind: l.kind,
          titleDe: l.titleDe,
          grammarId: l.grammarId,
        };
        const row = await this.prisma.dafLesson.upsert({
          where: { sourceId: l.sourceId },
          create: { sourceId: l.sourceId, ...data },
          // `titleUz` `update` da YO'Q: o'qituvchi tuzatgan tarjima seed
          // qayta yuritilganda yo'qolmasligi kerak.
          update: data,
        });
        bySource.set(l.sourceId, row.id);
      }
    }

    return bySource;
  }

  private async seedLexemes(
    dataset: DafDataset,
    unitIdByChapter: Map<number, number>,
    lessonIdBySource: Map<string, number>,
  ): Promise<number> {
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    for (const section of dataset.sections) {
      const unitId = unitIdByChapter.get(section.chapter);
      const lessonId = lessonIdBySource.get(section.id);
      if (unitId === undefined || lessonId === undefined) continue;

      for (const [i, entry] of section.entries.entries()) {
        const sourceId = lexemeSourceId(section.id, i);
        const data = {
          unitId,
          lessonId,
          de: entry.de,
          en: entry.en,
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
    lessonIdBySource: Map<string, number>,
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

      // Mashq grammatika DARSIGA biriktiriladi. Darsi yo'q (bo'limsiz)
      // sahifaning mashqlari `lessonId: null` bo'lib qoladi — ular
      // yo'lda emas, lekin grammatika ro'yxatida ko'rinadi.
      const lessonId = lessonIdBySource.get(`gram:${page.code}`) ?? null;

      for (const [i, ex] of page.exercises.entries()) {
        const data = this.exerciseData(ex, grammarId, unitId, lessonId, i);
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
    lessonId: number | null,
    index: number,
  ): Prisma.DafExerciseUncheckedCreateInput {
    return {
      sourceId: ex.id,
      grammarId,
      unitId,
      lessonId,
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
