import { Injectable, Logger } from '@nestjs/common';
import {
  DafAnswerStatus,
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
import type { A1UnitsFile } from '../units/a1-units.types';
import { validateA1Units } from '../units/a1-units.validate';
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

export function toDafLevel(level: CefrLevel): DafLevel {
  // A1.1/A1.2 bo'linishi manbaning yorlig'i edi. O'quvchi va Goethe
  // imtihoni uchun daraja bitta: A1.
  if (level === 'A1.1' || level === 'A1.2') return DafLevel.A1;
  if (level === 'A2.1' || level === 'A2.2') return DafLevel.A2;
  return DafLevel.B1;
}

/**
 * Dars identifikatori — bo'lim va bosqichdan, manbadan emas.
 *
 * Avval kalit manbanikidan olinardi (`dib-voc-01-01`, `gram:no_02`), ya'ni
 * dars manbaning bo'linishini takrorlardi. Endi dars bo'limning ichki
 * bosqichi, shuning uchun kalit ham shundan quriladi. Barqarorligi shart:
 * o'zgarsa, har seed eski darsni tashlab yangisini yaratardi va o'quvchining
 * `DafLessonProgress` tarixi darssiz qolardi.
 */
export function lessonSourceId(
  level: DafLevel,
  order: number,
  tier: number,
): string {
  return `lesson_${level}_${order}_t${tier}`;
}

/**
 * Bosqich nomlari — har bo'limda bir xil beshta.
 *
 * Bosqich dars TURI emas, qiyinlik pog'onasi: tanishishdan sinovgacha.
 * Shuning uchun nomlar manbadan olinmaydi, ular yo'lning o'z atamalari.
 */
export const TIER_TITLES: { de: string; uz: string }[] = [
  { de: 'Kennenlernen', uz: 'Tanish' },
  { de: 'Bedeutung', uz: "Ma'no" },
  { de: 'Sätze', uz: 'Gap' },
  { de: 'Schreiben', uz: 'Yozish' },
  { de: 'Test', uz: 'Sinov' },
];

/** Bo'lim — seed ichida darslar va lug'at unga suyanadi. */
interface SeededUnit {
  id: number;
  level: DafLevel;
  order: number;
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

  /**
   * @param a1Units berilsa A1 bo'limlari SHU fayldan quriladi; fayl da'vo
   * qilmagan boblar avvalgidek bob-bo'lim bo'lib qoladi (A2 va B1 shu
   * yo'lda ishlashda davom etadi).
   */
  async seed(
    dataset: DafDataset,
    translations?: TranslationFile,
    a1Units?: A1UnitsFile,
  ): Promise<SeedReport> {
    const { unitIdBySection, unitIdByChapter, units } = await this.seedUnits(
      dataset,
      a1Units,
    );
    const grammarIdByCode = await this.seedGrammar(
      dataset,
      unitIdByChapter,
      unitIdBySection,
      a1Units,
    );
    const lessonIdBySource = await this.seedLessons(units);
    const lexemes = await this.seedLexemes(dataset, unitIdBySection);
    const exercises = await this.seedExercises(dataset, grammarIdByCode);

    const retired = await this.retireMissingExercises(dataset);
    const lexemesRemoved = await this.removeMissingLexemes(dataset);
    const translationsApplied = await this.applyTranslations(translations);

    return {
      units: units.length,
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

  /**
   * Bo'limlar IKKI yo'ldan quriladi.
   *
   * `a1-units.json` da'vo qilgan mavzular uning bo'limlariga tushadi —
   * A1 ning chegarasi qo'lda chizilgan, chunki manbaning bobi o'quv
   * bosqichi emas (bitta bobda 226 so'z bor edi). Fayl tegmagan boblar
   * esa avvalgidek bob-bo'lim bo'lib qoladi: A2 va B1 hali qo'lda
   * chizilmagan, va ularni shu o'zgarish bilan buzib bo'lmaydi.
   */
  private async seedUnits(
    dataset: DafDataset,
    a1Units?: A1UnitsFile,
  ): Promise<{
    unitIdBySection: Map<string, number>;
    unitIdByChapter: Map<number, number>;
    units: SeededUnit[];
  }> {
    const unitIdBySection = new Map<string, number>();
    const unitIdByChapter = new Map<number, number>();
    const units: SeededUnit[] = [];

    // Bob darajasi manbada bob yozuvida turadi, mavzuda emas.
    const levelByChapter = new Map<number, DafLevel>();
    for (const ch of dataset.chapters) {
      if (ch.level) levelByChapter.set(ch.chapter, toDafLevel(ch.level));
    }

    const claimed = new Set<string>(
      a1Units?.units.flatMap((u) => u.sections) ?? [],
    );

    if (a1Units) {
      // A1 ga tegishli mavzular — fayl aynan shularni qoplashi shart.
      // Tekshiruv seed'ning ichida turadi, chunki jimgina yo'qolgan
      // mavzu faqat o'quvchida ko'rinardi: bo'lim ochiladi, so'z esa yo'q.
      const a1Sections = dataset.sections.filter(
        (s) => levelByChapter.get(s.chapter) === DafLevel.A1,
      );
      const sizes = new Map(
        a1Sections.map((s) => [s.id, s.entries.length] as const),
      );
      const problems = validateA1Units(
        a1Units,
        sizes,
        a1Sections.map((s) => s.id),
        dataset.grammar.map((g) => g.code),
      );
      if (problems.length > 0) {
        throw new Error(`a1-units.json noto'g'ri:\n${problems.join('\n')}`);
      }

      for (const u of a1Units.units) {
        const row = await this.prisma.dafUnit.upsert({
          where: { level_order: { level: DafLevel.A1, order: u.order } },
          create: {
            level: DafLevel.A1,
            order: u.order,
            titleUz: u.titleUz,
            titleDe: u.titleDe,
            // `sourceChapter` ATAYLAB bo'sh: bu bo'lim bobdan tug'ilmagan,
            // u bir necha bobning mavzusini yig'ishi mumkin. Eski
            // qatorda qolgan raqam yolg'on kelib chiqish ko'rsatardi.
            sourceChapter: null,
          },
          update: {
            titleUz: u.titleUz,
            titleDe: u.titleDe,
            sourceChapter: null,
          },
        });
        for (const s of u.sections) unitIdBySection.set(s, row.id);
        units.push({ id: row.id, level: DafLevel.A1, order: u.order });
      }
    }

    // Fayl da'vo qilmagan boblar — eski yo'l (A2, B1).
    //
    // Tartib daraja ICHIDA sanaladi va daraja BAZANIKI (`A2`), manbaniki
    // (`A2.1`/`A2.2`) emas: aks holda 5-bob (A2.2) ham, 6-bob (A2.1) ham
    // «A2 ning 1-bo'limi» bo'lib, bittasi ikkinchisini bosib o'tardi.
    const mapped = dataset.chapters.map((c) => ({
      chapter: c.chapter,
      level: c.level ? toDafLevel(c.level) : undefined,
    }));

    for (const section of dataset.sections) {
      if (claimed.has(section.id)) continue;

      // Darajasi hisoblanmagan bob bo'lim bo'la olmaydi: yo'l darajaga
      // qurilgan, va darajasiz bo'limni qayerga qo'yishni hech kim
      // ayta olmaydi.
      const level = levelByChapter.get(section.chapter);
      if (!level) continue;

      const title = DAF_UNIT_TITLES.find((t) => t.chapter === section.chapter);
      if (!title) continue;

      let unitId = unitIdByChapter.get(section.chapter);
      if (unitId === undefined) {
        const order = orderWithinLevel(section.chapter, level, mapped);
        const unit = await this.prisma.dafUnit.upsert({
          where: { level_order: { level, order } },
          create: {
            level,
            order,
            titleDe: title.titleDe,
            titleUz: title.titleUz,
            sourceChapter: section.chapter,
          },
          update: {
            titleDe: title.titleDe,
            titleUz: title.titleUz,
            sourceChapter: section.chapter,
          },
        });
        unitId = unit.id;
        unitIdByChapter.set(section.chapter, unitId);
        units.push({ id: unitId, level, order });
      }
      unitIdBySection.set(section.id, unitId);
    }

    return { unitIdBySection, unitIdByChapter, units };
  }

  /**
   * Darslar — bo'lim ichidagi BESHTA bosqich, boshqa hech narsa.
   *
   * Avval dars manbaning bo'linishini takrorlardi: har lug'at mavzusi
   * bitta dars, har grammatika sahifasi yana bitta — bir bo'limda 26
   * tagacha. Endi bo'lim ichida aynan 5 bosqich bor va ular turi bilan
   * emas, qiyinligi bilan farq qiladi: har bosqichda ham lug'at, ham
   * grammatika, ham eshitish bo'ladi.
   *
   * Darsning KONTENTI shu yerda biriktirilmaydi. So'z bo'limga tegishli
   * (`DafLexeme.unitId`), mashq esa grammatika orqali bo'limga bog'langan;
   * bosqich ularni ish vaqtida oladi. Shuning uchun `grammarId` ham
   * qo'yilmaydi — bitta bo'limda bir necha grammatika sahifasi bor, va
   * bosqichni ulardan bittasiga qadab qo'yish qolganini ko'rinmas qilardi.
   */
  private async seedLessons(units: SeededUnit[]): Promise<Map<string, number>> {
    const bySource = new Map<string, number>();

    for (const unit of units) {
      for (const [i, t] of TIER_TITLES.entries()) {
        const tier = i + 1;
        const sourceId = lessonSourceId(unit.level, unit.order, tier);
        const data = {
          unitId: unit.id,
          tier,
          order: tier,
          titleDe: t.de,
        };
        const row = await this.prisma.dafLesson.upsert({
          where: { sourceId },
          // `titleUz` faqat `create` da: bosqich nomini o'qituvchi
          // tuzatgan bo'lsa, seed uni qayta yuritilganda bosib o'tmasin.
          create: { sourceId, ...data, titleUz: t.uz },
          update: data,
        });
        bySource.set(sourceId, row.id);
      }
    }

    return bySource;
  }

  /**
   * Lug'at BO'LIMga yoziladi, darsga emas.
   *
   * Mavzu → bo'lim xaritasi ikkala yo'lni ham qamraydi: `a1-units.json`
   * da'vo qilgan mavzu o'z bo'limiga, qolgani bobining bo'limiga tushadi.
   */
  private async seedLexemes(
    dataset: DafDataset,
    unitIdBySection: Map<string, number>,
  ): Promise<number> {
    const writes: Prisma.PrismaPromise<unknown>[] = [];

    for (const section of dataset.sections) {
      const unitId = unitIdBySection.get(section.id);
      if (unitId === undefined) continue;

      for (const [i, entry] of section.entries.entries()) {
        const sourceId = lexemeSourceId(section.id, i);
        const data = {
          unitId,
          // So'z hech qaysi bosqichga qadalmaydi: bosqich so'zlarni ish
          // vaqtida, o'quvchining holatiga qarab oladi. Eski qiymat
          // qolib ketmasligi uchun `null` ATAYLAB yoziladi.
          lessonId: null,
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

  /**
   * Grammatika sahifasini bo'limga biriktiradi.
   *
   * `a1-units.json` ko'rsatgan biriktirish USTUN turadi. Sabab o'lchangan:
   * bob biriktiruvida 1 180 mashqning 459 tasi (39 %) hech qaysi bo'limga
   * yetib bormasdi, chunki ularning sahifasini hech bir bob o'z mavzusi
   * deb ko'rsatmagan. Fayl bu bog'lanishni qo'lda yozadi, ya'ni yetim
   * sahifa ham kerakli bo'limga ulanadi va mashqi o'quvchiga yetib boradi.
   *
   * Fayl ko'rsatmagan sahifa avvalgidek o'z bobining bo'limiga tushadi.
   */
  private async seedGrammar(
    dataset: DafDataset,
    unitIdByChapter: Map<number, number>,
    unitIdBySection: Map<string, number>,
    a1Units?: A1UnitsFile,
  ): Promise<Map<string, number>> {
    // Bo'limning id'si uning birinchi mavzusi orqali topiladi — mavzusiz
    // bo'lim bo'lmaydi (validator har bo'limda kamida 30 so'z talab qiladi).
    const unitIdByGrammar = new Map<string, number>();
    for (const u of a1Units?.units ?? []) {
      const unitId = unitIdBySection.get(u.sections[0]);
      if (unitId === undefined) continue;
      for (const g of u.grammar) unitIdByGrammar.set(g, unitId);
    }

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
      const byChapter =
        chapter === undefined ? null : (unitIdByChapter.get(chapter) ?? null);
      const unitId = unitIdByGrammar.get(g.code) ?? byChapter;

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

  /**
   * Mashq grammatika sahifasi ORQALI bo'limga yetib boradi: sahifa qaysi
   * bo'limda tursa, uning mashqlari ham o'sha bo'limda. Bosqichga
   * biriktirilmaydi — bosqich mashqni ish vaqtida bo'limdan oladi.
   */
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
      // Bosqich mashqni ish vaqtida oladi; eski bog'lanish qolib
      // ketmasligi uchun `null` ATAYLAB yoziladi.
      lessonId: null,
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
