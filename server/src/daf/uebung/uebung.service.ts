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

  async seans(lessonId: number, studentId: number): Promise<PublicFrage[]> {
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
      uz: string;
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

    const toWort = (l: LexemeRow): MaterialWort => ({
      id: l.id,
      de: l.de,
      uz: l.uz,
      artikel: l.artikel,
      anzeige: l.anzeige,
      sectionCode: kodVon(l.sectionId),
    });
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
    const coreWords: MaterialWort[] = (lexemeRows as LexemeRow[])
      .filter((l) => l.core)
      .map(toWort);

    const sentences: MaterialSatz[] = (sentenceRows as SentenceRow[]).map(
      toSatz,
    );
    const phrases: MaterialPhrase[] = (phraseRows as PhraseRow[]).map(toPhrase);

    const rnd = Math.random;
    const kandidaten: Frage[] = [];

    for (const w of coreWords) {
      const wu = wortUz(w, coreWords, rnd);
      if (wu) kandidaten.push(wu);
      const uw = uzWort(w, coreWords, rnd);
      if (uw) kandidaten.push(uw);
      const art = artikel(w);
      if (art) kandidaten.push(art);
    }
    // Bir necha PAAR nomzodi: har chaqiruv `rnd` holatini siljitib, boshqa
    // to'rtlikni tanlaydi. Material yetmasa `paar` `null` qaytaradi.
    for (let i = 0; i < 3; i += 1) {
      const p = paar(coreWords, rnd);
      if (p) kandidaten.push(p);
    }

    for (const s of sentences) {
      const lu = luecke(s, coreWords, rnd);
      if (lu) kandidaten.push(lu);
      const sb = satzBauen(s, rnd);
      if (sb) kandidaten.push(sb);
      const su = satzUebersetzen(s, sentences, rnd);
      if (su) kandidaten.push(su);
    }

    for (const p of phrases) {
      const re = reaktion(p, phrases, rnd);
      if (re) kandidaten.push(re);
    }

    const pflicht = await this.baueWiederholung(studentId, coreWords, rnd);

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
      uz: string;
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
      const wort: MaterialWort = {
        id: raw.id,
        de: raw.de,
        uz: raw.uz,
        artikel: raw.artikel,
        anzeige: raw.anzeige,
        sectionCode: '',
      };
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
