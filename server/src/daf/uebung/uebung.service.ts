import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { istRichtig } from './antwort';
import type {
  Frage,
  FrageFormat,
  MaterialPhrase,
  MaterialSatz,
  MaterialWort,
  PublicFrage,
} from './frage.types';
import { toPublic } from './frage.types';
import { naechsterZustand } from './leitner';
import { luecke, reaktion, satzBauen, satzUebersetzen } from './satz-fragen';
import { baueSeans } from './seans';
import { ohneWiederholteFormate } from './wiederholte-formate';
import { artikel, paar, uzWort, wortUz } from './wort-fragen';

/** So'z uchun quriladigan formatlar — `PAAR` bu yerda yo'q: u bitta so'zga emas, to'rtlikka tegishli. */
const WORT_FORMATE: FrageFormat[] = ['WORT_UZ', 'UZ_WORT', 'ARTIKEL'];

/** Har seansda qaytariladigan (pflicht) o'rinlar ulushi — 6dan biri: 12 savolda 2 ta. */
const WIEDERHOLUNG_ULUSH = 6;
const SEANS_UZUNLIGI = 12;

function mischen<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * DB qatoridan mashq materialiga o'tkazadi — SHU YERDA, BIR MARTA.
 *
 * `DafLexeme.uz` sxemada NULLABLE (`String?`) — ba'zi so'zlar hali
 * tarjima qilinmagan (Netzwerk 2–12 unitlari, eski DiB so'zlarining bir
 * qismi). Tarjimasi yo'q so'zdan savol qurib bo'lmaydi: `prompt`/`options`
 * ichida `null` chiqib ketardi va `pruefen` javobni solishtirishda
 * `normalisieren(null)`da yiqilardi. Shuning uchun bu funksiya `uz` yo'q
 * bo'lsa `null` qaytaradi — chaqiruvchi (bo'lim materiali ham, qaytarish
 * nomzodi ham) shu SO'ZNI butunlay tashlab ketadi.
 */
function toWort(l: {
  id: number;
  de: string;
  uz: string | null;
  artikel: string | null;
  anzeige: string | null;
  sectionCode: string;
}): MaterialWort | null {
  if (!l.uz) return null;
  return {
    id: l.id,
    de: l.de,
    uz: l.uz,
    artikel: l.artikel,
    anzeige: l.anzeige,
    sectionCode: l.sectionCode,
  };
}

/**
 * To'g'ri javob MATERIALDAN qaytadan hisoblanadi, savoldan emas.
 *
 * `LUECKE` ENDI ODATDAGI SO'Z SAVOLI: `luecke` bo'shatilgan so'zning
 * `id`sini `itemId` sifatida qaytaradi (`itemType: 'WORT'`), shuning
 * uchun to'g'ri javob boshqa har qanday so'z savoli kabi — o'sha so'zning
 * `de`si — qaytadan hisoblanadi. Gap qaysi so'z olib tashlangani savol
 * qurilganda tasodifiy tanlangan bo'lsa ham, MUAMMO EMAS: natija allaqachon
 * savolning o'zligiga yozib qo'yilgan, qayta tanlash kerak emas.
 *
 * `PAAR` bundan boshqacha: to'rt juftning qaysilari tushgani ham
 * tasodifiy, lekin ularni bitta "to'g'ri javob" satriga sig'dirib
 * bo'lmaydi (to'rtta so'z, to'rtta natija). Shuning uchun `PAAR` bu
 * funksiyaga UMUMAN yetib kelmaydi — `pruefen` uni bundan OLDIN o'z yo'li
 * bilan (juft-juft) tekshiradi.
 */
function richtigeAntwort(
  format: FrageFormat,
  material: { de: string; uz: string; artikel?: string | null },
): { richtig: string; akzeptiert: string[] } {
  switch (format) {
    case 'WORT_UZ':
    case 'SATZ_UEBERSETZEN':
      return { richtig: material.uz, akzeptiert: [] };
    case 'UZ_WORT':
      return {
        richtig: material.artikel
          ? `${material.artikel} ${material.de}`
          : material.de,
        akzeptiert: [material.de],
      };
    case 'ARTIKEL':
      if (!material.artikel) {
        throw new BadRequestException("Bu so'zda artikl yo'q");
      }
      return { richtig: material.artikel, akzeptiert: [] };
    case 'SATZ_BAUEN':
    case 'LUECKE':
    case 'REAKTION':
      return { richtig: material.de, akzeptiert: [] };
    default:
      throw new BadRequestException(
        `${format} javobi hozircha tekshirilmaydi — savol o'zligi kengayishi kerak`,
      );
  }
}

export interface PruefenInput {
  itemType: 'WORT' | 'SATZ' | 'PHRASE';
  itemId: number;
  format: FrageFormat;
  given: string;
  durationMs?: number;
}

export interface PruefenContext {
  studentId: number;
  companyId: number;
}

export interface PruefenErgebnis {
  isCorrect: boolean;
  richtig: string;
}

/**
 * Mashq servisi: materialni bazadan o'qiydi, seans quradi, javobni
 * tekshiradi.
 *
 * NEGA SAVOL QAYTA QURILMAYDI (dizayn D7). Javob kelganda server savolni
 * o'sha ko'rinishda QAYTA TUG'DIRISHI mumkin edi — xuddi `DafDrillService`
 * qiladiganidek. Bu yerda bunday emas: qaytariladigan so'zlar har
 * o'quvchida boshqacha (Leitner holatiga bog'liq), ya'ni savolni qayta
 * qurish uchun kerak bo'ladigan "urug'" (qaysi so'zlar, qaysi tartibda)
 * beqaror — bir xil chaqiruv ikki marta bir xil savol bermasligi mumkin.
 * Shuning uchun `pruefen` savolni qayta qurmaydi: u faqat `itemType`
 * va `itemId` bo'yicha MATERIALNI o'qiydi va to'g'ri javobni o'shandan
 * hisoblaydi (`richtigeAntwort`).
 *
 * BUNING NARXI OCHIQ AYTILADI: o'quvchi o'ziga seansda ko'rsatilmagan
 * `itemId`/`format` juftligi uchun ham javob yubora oladi — server buni
 * taqiqlamaydi, chunki savolni "ko'rsatilganmi" deb tekshirish uchun
 * seansni serverda saqlash kerak bo'lardi. Bu faqat o'sha o'quvchining
 * o'z mashq statistikasiga (urinish yozuvi, Leitner holati) ta'sir
 * qiladi, boshqa hech kimga emas — shuning uchun ataylab ochiq qoldirilgan.
 */
@Injectable()
export class UebungService {
  private readonly logger = new Logger(UebungService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `rnd` ixtiyoriy — sukut bo'yicha `Math.random`. Faqat testlar uchun:
   * seedlangan generator berilsa, oddiy (qaytarish ro'yxatida bo'lmagan)
   * nomzodlar panelining qurilishi va seans tanlovi DETERMINISTIK
   * bo'ladi — shu bilan "so'z+format takrorlanmaydi" kabi qoidalarni
   * haqiqiy so'rov ustida CI'da barqaror tekshirish mumkin (tasodifiy
   * namunaga tayangan test har safar boshqa natija berardi).
   */
  async seans(
    lessonId: number,
    studentId: number,
    rnd: () => number = Math.random,
  ): Promise<PublicFrage[]> {
    const { pflicht, kandidaten } = await this.baueKandidaten(
      lessonId,
      studentId,
      rnd,
    );

    const { fragen, nichtPlatziert } = baueSeans(
      kandidaten,
      SEANS_UZUNLIGI,
      rnd,
      pflicht,
    );

    if (nichtPlatziert.length > 0) {
      this.logger.warn(
        `Muddati kelgan ${nichtPlatziert.length} savol seansga joylashmadi ` +
          `(lessonId=${lessonId}, studentId=${studentId}): ` +
          nichtPlatziert.map((f) => `${f.itemType}:${f.itemId}`).join(', '),
      );
    }

    return fragen.map((f, i) => toPublic(f, i));
  }

  /**
   * Shu material haqida, `nichtFormat`dan BOSHQA formatda bitta to'liq
   * savol.
   *
   * NEGA BU YO'L BOR. Mijoz noto'g'ri javob berganda ekranda "boshqa
   * ko'rinishda qayta ko'rsat" imkoniyati bo'lishi mumkin — lekin savolni
   * mijozning o'zi qura olmaydi (chalg'ituvchi tanlash, options tuzish
   * serverning ishi) va to'g'ri javobni ham bilmaydi. Shuning uchun
   * server materialni qaytadan yuklab, o'sha material uchun boshqa
   * formatdagi savolni to'liq qurib beradi.
   *
   * `seans` bilan bir xil yo'ldan boradi (`baueKandidaten`) — material
   * yuklash va nomzod qurish takrorlanmaydi. Farqi: bu yerda seans
   * QURILMAYDI, faqat berilgan `itemType`/`itemId`ga tegishli, formati
   * `nichtFormat`ga teng bo'lmagan BITTA nomzod tanlanadi. Mos nomzod
   * topilmasa (masalan, bo'limda chalg'ituvchi yetmasa) `null` qaytadi —
   * bu xato emas, tabiiy holat.
   */
  async ersatz(
    lessonId: number,
    studentId: number,
    itemType: 'WORT' | 'SATZ' | 'PHRASE',
    itemId: number,
    nichtFormat: FrageFormat,
    rnd: () => number = Math.random,
  ): Promise<PublicFrage | null> {
    const { pflicht, kandidaten } = await this.baueKandidaten(
      lessonId,
      studentId,
      rnd,
    );

    const nomzod = [...pflicht, ...kandidaten].find(
      (f) =>
        f.itemType === itemType &&
        f.itemId === itemId &&
        f.format !== nichtFormat,
    );

    return nomzod ? toPublic(nomzod, 0) : null;
  }

  /**
   * Seans tugaganini yozadi.
   *
   * NEGA MIJOZ AYTADI. Server seans tugaganini o'zi bilmaydi: u savollarni
   * saqlamaydi va nechta savol berilganini eslamaydi. Bu D6 qarorining
   * ("savollar saqlanmaydi") tabiiy narxi.
   *
   * NEGA BU YETARLI. Mijoz "tugadi" deb yolg'on ayta oladi, lekin bundan
   * yutadigan narsa yo'q — keyingi dars ochiladi, xolos. Haqiqiy o'lchov
   * `DafAttempt` da: kim nechta savolga qanday javob berganini mijoz
   * o'zgartira olmaydi.
   */
  async abschluss(
    lessonId: number,
    input: { richtig: number; gesamt: number; durationMs?: number },
    ctx: { studentId: number; companyId: number },
  ): Promise<{ bestScore: number; runs: number }> {
    if (input.gesamt <= 0) {
      throw new BadRequestException("Seansda savol bo'lmagan");
    }
    if (input.richtig < 0 || input.richtig > input.gesamt) {
      throw new BadRequestException(
        "To'g'ri javob soni savol sonidan oshib ketdi",
      );
    }

    const oldingi = await this.prisma.dafLessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: ctx.studentId, lessonId } },
    } as any);

    // Eng yaxshi ball SAQLANADI, oxirgisi emas: qayta o'tish natijani
    // pasaytirmasligi kerak, aks holda o'quvchi mashq qilishdan qo'rqadi.
    const bestScore = Math.max((oldingi as any)?.bestScore ?? 0, input.richtig);
    const runs = ((oldingi as any)?.runs ?? 0) + 1;

    await this.prisma.dafLessonProgress.upsert({
      where: { studentId_lessonId: { studentId: ctx.studentId, lessonId } },
      create: {
        studentId: ctx.studentId,
        lessonId,
        companyId: ctx.companyId,
        completedAt: new Date(),
        bestScore,
        runs,
      },
      update: { completedAt: new Date(), bestScore, runs },
    } as any);

    return { bestScore, runs };
  }

  /**
   * Material yuklash va nomzod qurish — `seans` HAM, `ersatz` HAM shu
   * yo'ldan boradi. Bu ikkalasida bir xil bosqichlar (darsni o'qish,
   * bo'lim materialini yuklash, qaytarish (pflicht) so'zlarini aniqlash,
   * so'z/gap/ibora nomzodlarini qurish, takroriy formatlarni filtrlash)
   * bir marta, shu yerda yoziladi — ikki nusxada ikki xil o'zgarib
   * qolmasligi uchun.
   */
  private async baueKandidaten(
    lessonId: number,
    studentId: number,
    rnd: () => number,
  ): Promise<{ pflicht: Frage[]; kandidaten: Frage[] }> {
    const lesson = await this.prisma.dafLesson.findUnique({
      where: { id: lessonId },
      include: { section: true },
    } as any);
    if (!lesson || !(lesson as any).section) {
      throw new NotFoundException(`Dars topilmadi: ${lessonId}`);
    }
    const section = (lesson as any).section as {
      id: number;
      order: number;
      unitId: number;
    };

    // Chalg'ituvchilar shu darsning bo'limi va undan OLDINGI bo'limlar
    // materialidan olinadi — o'quvchi hali o'qimagan mavzudan chalg'ituvchi
    // taxminni emas, bilimni tekshiradi.
    const sections = await this.prisma.dafSection.findMany({
      where: { unitId: section.unitId, order: { lte: section.order } },
    } as any);
    const sectionIds = (sections as Array<{ id: number; code: string }>).map(
      (s) => s.id,
    );
    const sectionCodeById = new Map(
      (sections as Array<{ id: number; code: string }>).map((s) => [
        s.id,
        s.code,
      ]),
    );

    const [lexemeRows, sentenceRows, phraseRows] = await Promise.all([
      this.prisma.dafLexeme.findMany({
        where: { sectionId: { in: sectionIds } },
      } as any),
      this.prisma.dafSentence.findMany({
        where: { sectionId: { in: sectionIds } },
      } as any),
      this.prisma.dafPhrase.findMany({
        where: { sectionId: { in: sectionIds } },
      } as any),
    ]);

    interface LexemeRow {
      id: number;
      de: string;
      // Sxemada nullable (`DafLexeme.uz String?`) — `toWort` shuni hisobga
      // olib, tarjimasiz qatorni `null`ga aylantiradi.
      uz: string | null;
      artikel: string | null;
      anzeige: string | null;
      core: boolean;
      sectionId: number | null;
    }
    interface SentenceRow {
      id: number;
      de: string;
      uz: string;
      sectionId: number | null;
    }
    interface PhraseRow {
      id: number;
      funktionUz: string;
      de: string;
      uz: string;
      sectionId: number | null;
    }

    const kodVon = (sectionId: number | null): string =>
      (sectionId != null && sectionCodeById.get(sectionId)) || '';

    const toSatz = (s: SentenceRow): MaterialSatz => ({
      id: s.id,
      de: s.de,
      uz: s.uz,
      sectionCode: kodVon(s.sectionId),
    });
    const toPhrase = (p: PhraseRow): MaterialPhrase => ({
      id: p.id,
      funktionUz: p.funktionUz,
      de: p.de,
      uz: p.uz,
      sectionCode: kodVon(p.sectionId),
    });

    // `core: false` so'zlar so'ralmaydi VA chalg'ituvchi sifatida ham
    // ishlatilmaydi — o'quvchi ularni o'rganmagan (rule 2).
    //
    // Tarjimasi (`uz`) yo'q so'z ham shu yerda tushib qoladi (`toWort`
    // `null` qaytaradi) — u ORQADAGI materialdan chiqarilmasa, savol
    // qurilib, `prompt`/`options`da `null` chiqib ketardi.
    const coreWords: MaterialWort[] = (lexemeRows as LexemeRow[])
      .filter((l) => l.core)
      .map((l) => toWort({ ...l, sectionCode: kodVon(l.sectionId) }))
      .filter((w): w is MaterialWort => w !== null);

    const sentences: MaterialSatz[] = (sentenceRows as SentenceRow[]).map(
      toSatz,
    );
    const phrases: MaterialPhrase[] = (phraseRows as PhraseRow[]).map(toPhrase);

    // Qaytarish (pflicht) savollari — DUE so'rovi shu yerda, kandidaten
    // qurilishidan OLDIN chaqiriladi, chunki pastdagi `letzterFormatByWort`
    // so'rovi ham `dafLexemeState`ga boradi va ikkalasining tartibi
    // testlarda kuzatilgan (birinchi chaqiruv — DUE so'rovi).
    const pflicht = await this.baueWiederholung(studentId, coreWords, rnd);

    // Qoida 5 (dizayn 4.3): ketma-ket ikki SEANSDA bir xil (so'z+format)
    // juftligi takrorlanmaydi. `DafLexemeState.lastFormat` shu so'z oxirgi
    // marta qaysi formatda so'ralganini saqlaydi — shu bo'limning BARCHA
    // so'zlari uchun (qaytarish uchun DUE bo'lgan ozgina so'z emas) shu
    // xaritani so'raymiz, chunki har qanday so'z (nafaqat qaytariladigan)
    // shu qoidaga bo'ysunishi kerak.
    const coreWordIds = coreWords.map((w) => w.id);
    const letzteZustaende = coreWordIds.length
      ? ((await this.prisma.dafLexemeState.findMany({
          where: { studentId, lexemeId: { in: coreWordIds } },
        } as any)) as Array<{ lexemeId: number; lastFormat: string | null }>)
      : [];
    const letzterFormatByWort = new Map(
      letzteZustaende.map((z) => [z.lexemeId, z.lastFormat]),
    );

    const rohKandidaten: Frage[] = [];

    // Bu yerda hech qanday format lastFormat bo'yicha OLDINDAN
    // filtrlanmaydi — barcha so'zlar uchun UCHALA format quriladi.
    // Qoida 5 (bir xil so'z+format juftligi ikki seansda ketma-ket
    // takrorlanmaydi) endi PASTDA, `ohneWiederholteFormate` orqali,
    // BUTUN nomzodlar ro'yxatiga (LUECKE va PAAR ham qo'shilgan holda)
    // bir yo'la qo'llanadi — qarang shu funksiyaning izohi.
    for (const w of coreWords) {
      const wu = wortUz(w, coreWords, rnd);
      if (wu) rohKandidaten.push(wu);
      const uw = uzWort(w, coreWords, rnd);
      if (uw) rohKandidaten.push(uw);
      const art = artikel(w);
      if (art) rohKandidaten.push(art);
    }
    // Bir necha PAAR nomzodi: har chaqiruv `rnd` holatini siljitib, boshqa
    // to'rtlikni tanlaydi. Material yetmasa `paar` `null` qaytaradi.
    for (let i = 0; i < 3; i += 1) {
      const p = paar(coreWords, rnd);
      if (p) rohKandidaten.push(p);
    }

    for (const s of sentences) {
      const lu = luecke(s, coreWords, rnd);
      if (lu) rohKandidaten.push(lu);
      const sb = satzBauen(s, rnd);
      if (sb) rohKandidaten.push(sb);
      const su = satzUebersetzen(s, sentences, rnd);
      if (su) rohKandidaten.push(su);
    }

    for (const p of phrases) {
      const re = reaktion(p, phrases, rnd);
      if (re) rohKandidaten.push(re);
    }

    // Qoida 5 (dizayn 4.3): ketma-ket ikki SEANSDA bir xil (so'z+format)
    // juftligi takrorlanmaydi. Nomzodning O'ZIDAN (`itemType`/`format`
    // + `belegteItems`dan) kelib chiqadi — qarang `wiederholte-formate.ts`
    // uchun to'liq izoh, nega hand-listed format ro'yxati emas.
    const kandidaten = ohneWiederholteFormate(
      rohKandidaten,
      letzterFormatByWort,
    );

    return { pflicht, kandidaten };
  }

  /**
   * Muddati kelgan (qaytarish) so'zlardan majburiy savollar quradi.
   *
   * Har biri so'z OXIRGI marta so'ralgan formatdan BOSHQA formatda
   * so'raladi (`lastFormat` — dizayn D dagi qoida): bir xil tarzda
   * qaytarilgan savol o'quvchiga savol shaklini yodlatadi, so'zni emas.
   * Muddati kelgan so'z yo'q bo'lsa (masalan, birinchi dars) bo'sh
   * massiv qaytadi — bu xato emas, tabiiy holat.
   */
  private async baueWiederholung(
    studentId: number,
    coreWords: MaterialWort[],
    rnd: () => number,
  ): Promise<Frage[]> {
    const soni = Math.floor(SEANS_UZUNLIGI / WIEDERHOLUNG_ULUSH);
    if (soni <= 0) return [];

    const due = (await this.prisma.dafLexemeState.findMany({
      where: { studentId, dueAt: { lte: new Date() } },
      orderBy: { dueAt: 'asc' },
      take: soni,
    } as any)) as Array<{ lexemeId: number; lastFormat: string | null }>;
    if (due.length === 0) return [];

    const dueIds = due.map((d) => d.lexemeId);
    const dueLexemeRows = (await this.prisma.dafLexeme.findMany({
      where: { id: { in: dueIds } },
    } as any)) as Array<{
      id: number;
      de: string;
      // Sxemada nullable — `toWort` tarjimasiz qatorni `null`ga aylantiradi.
      uz: string | null;
      artikel: string | null;
      anzeige: string | null;
      sectionId: number | null;
    }>;
    const byId = new Map(dueLexemeRows.map((l) => [l.id, l]));

    // Chalg'ituvchi manbai: joriy darsning so'zlariga qaytariladigan
    // so'zning o'zi ham qo'shiladi — u boshqa bo'limdan bo'lishi mumkin,
    // shuning uchun panelda kamida o'zi bor bo'lishi kerak.
    const pflicht: Frage[] = [];
    for (const state of due) {
      const raw = byId.get(state.lexemeId);
      if (!raw) continue; // so'z bazadan o'chirilgan — o'tkazib yuboriladi.
      const wort = toWort({ ...raw, sectionCode: '' });
      if (!wort) continue; // tarjimasiz so'z qaytarish savoliga aylana olmaydi.
      const andere = coreWords.some((w) => w.id === wort.id)
        ? coreWords
        : [...coreWords, wort];

      const moeglich = mischen(
        WORT_FORMATE.filter((f) => f !== state.lastFormat),
        rnd,
      );
      let frage: Frage | null = null;
      for (const format of moeglich) {
        frage = this.baueWortFrage(format, wort, andere);
        if (frage) break;
      }
      if (!frage) {
        // Boshqa formatda savol qurib bo'lmadi (masalan, so'zda artikl
        // yo'q va yagona muqobil format ham hozir lastFormat bilan bir
        // xil) — takrorlash o'rniga so'zni bu safar tashlab ketamiz.
        this.logger.warn(
          `Qaytarish uchun so'z ${wort.id} (${wort.de}) boshqa formatda ` +
            `savol qurib bo'lmadi, lastFormat=${state.lastFormat}`,
        );
        continue;
      }
      pflicht.push(frage);
    }
    return pflicht;
  }

  private baueWortFrage(
    format: FrageFormat,
    wort: MaterialWort,
    andere: MaterialWort[],
  ): Frage | null {
    switch (format) {
      case 'WORT_UZ':
        return wortUz(wort, andere, Math.random);
      case 'UZ_WORT':
        return uzWort(wort, andere, Math.random);
      case 'ARTIKEL':
        return artikel(wort);
      default:
        return null;
    }
  }

  async pruefen(
    input: PruefenInput,
    ctx: PruefenContext,
  ): Promise<PruefenErgebnis> {
    const { itemType, itemId, format, given, durationMs } = input;

    const material = await this.ladeMaterial(itemType, itemId);
    if (!material) {
      throw new NotFoundException(`Material topilmadi: ${itemType}:${itemId}`);
    }

    let isCorrect: boolean;
    let richtig: string;
    // `PAAR` uchun har bir juftning O'Z natijasi — Leitner holatini
    // qaysi so'z uchun qanday yangilash kerakligini bildiradi. `null` —
    // format `PAAR` emas, holat pastda ITEMTYPE bo'yicha yagona so'zga
    // yangilanadi.
    let paarNatijalari: Array<{ lexemeId: number; ok: boolean }> | null = null;

    if (format === 'PAAR') {
      // `PAAR` javobi bitta "to'g'ri javob" satriga sig'maydi: to'rt
      // juftning qaysilari savolga tushgani savol qurilganda tasodifiy
      // tanlangan va bu yerda qayta tiklanmaydi. Shuning uchun har juft
      // (de=uz) MUSTAQIL tekshiriladi — savol qaysi to'rtlikni ko'rsatgani
      // bilan ishimiz yo'q, faqat har bir juftlashning o'zi to'g'rimi.
      if (material.unitId == null) {
        // Amalda yetib bo'lmaydi: `PAAR`ning `itemType`si doim `WORT`,
        // va WORT materiali doim `unitId` bilan qaytadi. Himoya sifatida.
        throw new BadRequestException("PAAR savoli faqat so'zga tegishli");
      }
      const natija = await this.pruefePaar(given, material.unitId);
      isCorrect = natija.isCorrect;
      richtig = natija.richtig;
      paarNatijalari = natija.paare
        .filter((p) => p.lexemeId != null)
        .map((p) => ({ lexemeId: p.lexemeId as number, ok: p.ok }));
    } else {
      const antwort = richtigeAntwort(format, material);
      isCorrect = istRichtig(given, antwort.richtig, antwort.akzeptiert);
      richtig = antwort.richtig;
    }

    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        companyId: ctx.companyId,
        lexemeId: itemType === 'WORT' ? itemId : null,
        isCorrect,
        given,
        durationMs: durationMs ?? null,
      },
    } as any);

    if (paarNatijalari) {
      // Har so'z FAQAT O'Z juftining natijasi bilan yangilanadi. Umumiy
      // `isCorrect` (to'rttasining AND'i) faqat urinish yozuviga ketadi —
      // bitta xato juft qolgan uchtasini "unutmagan" so'zlarni jazolamasin.
      for (const p of paarNatijalari) {
        await this.aktualisiereZustand(
          ctx.studentId,
          ctx.companyId,
          p.lexemeId,
          p.ok,
          format,
        );
      }
    } else if (itemType === 'WORT') {
      await this.aktualisiereZustand(
        ctx.studentId,
        ctx.companyId,
        itemId,
        isCorrect,
        format,
      );
    }

    return { isCorrect, richtig };
  }

  /**
   * Har juftni (`de=uz`) mustaqil tekshiradi va HAR SO'ZNING o'z
   * natijasini (`lexemeId` + `ok`) qaytaradi — chaqiruvchi shu natija
   * bilan o'sha so'zning Leitner holatini yangilaydi, umumiy verdikt
   * bilan emas.
   *
   * TO'RTTA JUFT SHART. `PAAR` savoli har doim to'rt juft ko'rsatadi;
   * boshqa son — masalan bitta yoki uchta juft yuborilishi — savol
   * shaklini buzgan javob va butunlay XATO hisoblanadi, ekzeptsiya emas
   * (xuddi bo'sh javob har doim xato bo'lgani kabi). Aks holda bitta
   * to'g'ri juft yuborib, qolgan uchtasini o'ylab ko'rmasdan ham
   * "to'liq to'g'ri" deb hisoblanib qolardi.
   *
   * SO'Z QIDIRUVI SHU `unitId`GA CHEKLANADI — savol qurilgan material
   * qaysi unitdan bo'lsa, shundan. Aks holda o'quvchi boshqa unitdan
   * (hatto butunlay o'zga darsdan) bir xil nemischa so'zni nomlab,
   * hech qachon ko'rsatilmagan materialga "to'g'ri" javob olishi mumkin
   * edi — chalg'ituvchi variant sifatida ham ko'rsatilmagan so'z.
   */
  private async pruefePaar(
    given: string,
    unitId: number,
  ): Promise<{
    isCorrect: boolean;
    richtig: string;
    paare: Array<{ lexemeId: number | null; ok: boolean }>;
  }> {
    const juftlar = given
      .split('|')
      .map((p) => p.split('='))
      .filter((p): p is [string, string] => p.length === 2);

    if (juftlar.length !== 4) {
      return { isCorrect: false, richtig: '', paare: [] };
    }

    const deLar = juftlar.map(([de]) => de);
    const soezler = (await this.prisma.dafLexeme.findMany({
      where: { de: { in: deLar }, unitId },
    } as any)) as Array<{ id: number; de: string; uz: string }>;
    const byDe = new Map(soezler.map((s) => [s.de, s]));

    const natijalar = juftlar.map(([de, uzGegeben]) => {
      const soz = byDe.get(de);
      const ok = soz != null && istRichtig(uzGegeben, soz.uz);
      return { lexemeId: soz?.id ?? null, de, ok, uzRichtig: soz?.uz ?? null };
    });

    return {
      isCorrect: natijalar.every((n) => n.ok),
      richtig: natijalar.map((n) => `${n.de}=${n.uzRichtig ?? ''}`).join('|'),
      paare: natijalar.map(({ lexemeId, ok }) => ({ lexemeId, ok })),
    };
  }

  private async ladeMaterial(
    itemType: PruefenInput['itemType'],
    itemId: number,
  ): Promise<{
    de: string;
    uz: string;
    artikel?: string | null;
    /** Faqat `WORT` uchun — `PAAR` javobini shu unitga cheklash uchun kerak. */
    unitId?: number;
  } | null> {
    if (itemType === 'WORT') {
      const row = (await this.prisma.dafLexeme.findUnique({
        where: { id: itemId },
      } as any)) as {
        de: string;
        uz: string;
        artikel: string | null;
        unitId: number;
      } | null;
      return row;
    }
    if (itemType === 'SATZ') {
      const row = (await this.prisma.dafSentence.findUnique({
        where: { id: itemId },
      } as any)) as {
        de: string;
        uz: string;
      } | null;
      return row;
    }
    const row = (await this.prisma.dafPhrase.findUnique({
      where: { id: itemId },
    } as any)) as {
      de: string;
      uz: string;
    } | null;
    return row;
  }

  /**
   * So'zning Leitner holatini yangilaydi va `lastFormat` ga shu javobning
   * formatini yozadi — qaytarish savoli keyingi safar boshqa format
   * tanlashi uchun.
   */
  private async aktualisiereZustand(
    studentId: number,
    companyId: number,
    lexemeId: number,
    isCorrect: boolean,
    format: FrageFormat,
  ): Promise<void> {
    const mavjud = (await this.prisma.dafLexemeState.findUnique({
      where: { studentId_lexemeId: { studentId, lexemeId } },
    } as any)) as { strength: number } | null;

    const jetzt = new Date();
    const zustand = naechsterZustand(mavjud?.strength ?? 0, isCorrect, jetzt);

    await this.prisma.dafLexemeState.upsert({
      where: { studentId_lexemeId: { studentId, lexemeId } },
      create: {
        studentId,
        lexemeId,
        companyId,
        strength: zustand.strength,
        dueAt: zustand.dueAt,
        lastSeenAt: jetzt,
        correctCount: isCorrect ? 1 : 0,
        wrongCount: isCorrect ? 0 : 1,
        lastFormat: format,
      },
      update: {
        strength: zustand.strength,
        dueAt: zustand.dueAt,
        lastSeenAt: jetzt,
        correctCount: { increment: isCorrect ? 1 : 0 },
        wrongCount: { increment: isCorrect ? 0 : 1 },
        lastFormat: format,
      },
    } as any);
  }
}
