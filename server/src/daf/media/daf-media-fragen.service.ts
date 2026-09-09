import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  Frage,
  FrageFormat,
  MaterialDialog,
  MaterialPhrase,
  MaterialSatz,
  MaterialWort,
} from '../uebung/frage.types';
import { dialogLuecke } from '../uebung/dialog-fragen';
import {
  luecke,
  reaktion,
  satzBauen,
  satzUebersetzen,
  zuordnen,
} from '../uebung/satz-fragen';
import {
  artikel,
  audioWort,
  paar,
  uzWort,
  wortTippen,
  wortUz,
} from '../uebung/wort-fragen';

/**
 * Mijozga (CEO/admin ko'rigi) ketadigan savol — TO'G'RI JAVOB BILAN.
 *
 * `PublicFrage`dan (`frage.types.ts`) farqi shu — u o'quvchiga ketadi va
 * javobni ATAYLAB yashiradi. Bu ro'yxat esa "dvigatel qanday savol
 * qurishi mumkin"ni ko'rsatish uchun, o'quvchi hech qachon ko'rmaydi —
 * shuning uchun javobni yashirishning ma'nosi yo'q, aksincha CEO aynan
 * shuni ko'rmoqchi.
 */
export interface VorschauFrage {
  format: FrageFormat;
  itemType: Frage['itemType'];
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
  richtig: string;
  titel?: string | null;
  audioUrl: string | null;
}

function toVorschau(f: Frage): VorschauFrage {
  return {
    format: f.format,
    itemType: f.itemType,
    itemId: f.itemId,
    prompt: f.prompt,
    hilfe: f.hilfe,
    options: f.options,
    richtig: f.richtig,
    titel: f.titel,
    audioUrl: f.audioUrl,
  };
}

function nichtNull<T>(x: T | null): x is T {
  return x !== null;
}

/** Bitta bo'lim uchun quriladigan barcha material — 12 quruvchining kirishi. */
interface Material {
  woerter: MaterialWort[];
  saetze: MaterialSatz[];
  phrasen: MaterialPhrase[];
  dialoge: MaterialDialog[];
  /**
   * R2 kalitini to'liq manzilga aylantiradi — `audioWort`/`wortTippen`ga
   * TO'G'RIDAN-TO'G'RI shu ko'rinishda uzatiladi (`MediaUrlResolver`,
   * `wort-fragen.ts`). Natijani KEYIN qayta o'girish (post-process) xato
   * bo'lardi: resolver `null` qaytarganda quruvchining o'zi savolni
   * QURMASLIGI kerak (audiosi yo'q so'z bilan bir xil qoida) — buni faqat
   * quruvchining ICHIDA, chaqiruv vaqtida tekshirish mumkin.
   */
  mediaUrl: (key: string) => string | null;
}

/**
 * Barqaror pseudo-tasodifiy generator (mulberry32).
 *
 * `sectionId`dan hosil qilinadi — `Math.random` EMAS: sahifa har
 * yangilanganda bir xil savollarni ko'rsatishi kerak (o'quvchi ko'rmaydigan
 * ko'rikni CEO ikkinchi marta topa olsin), lekin boshqa bo'lim boshqa
 * tartib bilan chiqsin — ikkalasi ham shu bitta funksiyadan keladi.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Format → o'sha formatni quradigan chaqiruv.
 *
 * `Record<FrageFormat, ...>` ATAYLAB: yangi format qo'shilib bu yerga
 * yozilmasa TypeScript build'ni yiqitadi. Testga tayanib bo'lmasdi —
 * yangi format qo'shgan odam testni ham yangilamaydi va sahifa jimgina
 * "hammasi shu" deb turaverardi.
 *
 * Har quruvchi shu yerda TO'G'RIDAN-TO'G'RI chaqiriladi — nusxasi
 * yozilmaydi (vazifaning o'zagi, qarang faylning tepasidagi izoh).
 * `PAAR`/`ZUORDNEN` bitta chaqiruvda bitta savol quradi (butun to'plamni
 * bittada ko'rsatadi), qolganlari har material birligi uchun bittadan.
 */
export const VORSCHAU_BAUER: Record<
  FrageFormat,
  (m: Material, rnd: () => number) => Frage[]
> = {
  WORT_UZ: (m, r) => m.woerter.map((w) => wortUz(w, m.woerter, r)).filter(nichtNull),
  UZ_WORT: (m, r) => m.woerter.map((w) => uzWort(w, m.woerter, r)).filter(nichtNull),
  PAAR: (m, r) => {
    const f = paar(m.woerter, r);
    return f ? [f] : [];
  },
  ARTIKEL: (m) => m.woerter.map((w) => artikel(w)).filter(nichtNull),
  AUDIO_WORT: (m, r) =>
    m.woerter
      .map((w) => audioWort(w, m.woerter, r, m.mediaUrl))
      .filter(nichtNull),
  WORT_TIPPEN: (m, r) =>
    m.woerter.map((w) => wortTippen(w, r, m.mediaUrl)).filter(nichtNull),
  LUECKE: (m, r) => m.saetze.map((s) => luecke(s, m.woerter, r)).filter(nichtNull),
  SATZ_BAUEN: (m, r) => m.saetze.map((s) => satzBauen(s, r)).filter(nichtNull),
  SATZ_UEBERSETZEN: (m, r) =>
    m.saetze.map((s) => satzUebersetzen(s, m.saetze, r)).filter(nichtNull),
  REAKTION: (m, r) => m.phrasen.map((p) => reaktion(p, m.phrasen, r)).filter(nichtNull),
  ZUORDNEN: (m, r) => {
    const f = zuordnen(m.phrasen, r);
    return f ? [f] : [];
  },
  DIALOG_LUECKE: (m, r) =>
    m.dialoge
      .map((d) => {
        // Chalg'ituvchilar FAQAT boshqa dialoglardan — qarang
        // `dialog-fragen.ts`dagi izoh: shu dialogning o'z satri kontekstga
        // haqiqatda mos kelib qolishi mumkin.
        const andere = m.dialoge
          .filter((o) => o.id !== d.id)
          .flatMap((o) => o.zeilen);
        return dialogLuecke(d, andere, r);
      })
      .filter(nichtNull),
};

/**
 * Bo'lim materialidan quriladigan BARCHA savollarni ko'rsatadi — bitta
 * o'quvchiga tegadigan o'n ikkitasi emas.
 *
 * BAZADA SAVOL YO'Q: dvigatel har so'rovda materialdan qayta quradi
 * (qarang `frage.types.ts`dagi `Frage` izohi — dizayn D7). Shuning uchun
 * bu xizmat ham savolni O'QIMAYDI, xuddi shu 12 quruvchini material
 * ustida ishlatadi — ularning nusxasi TAQIQLANADI, nusxa dvigateldan
 * ajralib ketib, sahifa o'quvchi hech qachon ko'rmaydigan savolni
 * ko'rsatib turadi.
 */
@Injectable()
export class DafMediaFragenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * R2 kalitini ommaviy manzilga aylantiradi — `daf-media-inhalt.service.ts`
   * bilan BIR XIL qoida, uchinchi marta boshqacha yozilmaydi.
   */
  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    const base = this.config.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

  async fragen(sectionId: number): Promise<VorschauFrage[]> {
    const [woerterRows, saetzeRows, phrasenRows, dialogRows] =
      await Promise.all([
        this.prisma.dafLexeme.findMany({
          where: { sectionId },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            de: true,
            uz: true,
            artikel: true,
            anzeige: true,
            core: true,
            audioKey: true,
          },
        } as any),
        this.prisma.dafSentence.findMany({
          where: { sectionId },
          orderBy: { order: 'asc' },
          select: { id: true, de: true, uz: true },
        } as any),
        this.prisma.dafPhrase.findMany({
          where: { sectionId },
          orderBy: { id: 'asc' },
          select: { id: true, de: true, uz: true, funktionUz: true },
        } as any),
        // `DafDialog` sectionId'ga TO'G'RIDAN-TO'G'RI ega (satrlari esa
        // dialog orqali) — xuddi `uebung.service.ts`dagi `baueKandidaten`
        // kabi, `include` bilan bitta so'rovda.
        this.prisma.dafDialog.findMany({
          where: { sectionId },
          include: { zeilen: { orderBy: { order: 'asc' } } },
        } as any),
      ]);

    interface LexemeRow {
      id: number;
      de: string;
      uz: string | null;
      artikel: string | null;
      anzeige: string | null;
      core: boolean;
      audioKey: string | null;
    }
    interface SentenceRow {
      id: number;
      de: string;
      uz: string;
    }
    interface PhraseRow {
      id: number;
      de: string;
      uz: string;
      funktionUz: string;
    }
    interface DialogRow {
      id: number;
      titelDe: string;
      zeilen: Array<{ id: number; sprecher: string; de: string; uz: string }>;
    }

    // `core: true` VA tarjimasi bor so'zlargina — xuddi `baueKandidaten`
    // dagi `toWort`/filter bilan bir xil qoida (qarang `uebung.service.ts`).
    // Passiv so'z hech qachon so'ralmaydi VA chalg'ituvchi bo'lmaydi;
    // tarjimasiz so'zdan savol qurib bo'lmaydi (`prompt`/`options`da
    // `null` chiqib ketardi).
    const woerter: MaterialWort[] = (woerterRows as LexemeRow[])
      .filter((l) => l.core && l.uz)
      .map((l) => ({
        id: l.id,
        de: l.de,
        uz: l.uz as string,
        artikel: l.artikel,
        anzeige: l.anzeige,
        // Quruvchilar `sectionCode`ni o'qimaydi (12 formatning hech biri
        // undan foydalanmaydi) — bo'lim bitta bo'lgani uchun bo'sh qoldi.
        sectionCode: '',
        audioKey: l.audioKey,
      }));

    const saetze: MaterialSatz[] = (saetzeRows as SentenceRow[]).map((s) => ({
      id: s.id,
      de: s.de,
      uz: s.uz,
      sectionCode: '',
    }));

    const phrasen: MaterialPhrase[] = (phrasenRows as PhraseRow[]).map(
      (p) => ({
        id: p.id,
        funktionUz: p.funktionUz,
        de: p.de,
        uz: p.uz,
        sectionCode: '',
      }),
    );

    // `as any as DialogRow[]` — xuddi `uebung.service.ts`dagi
    // `baueKandidaten` bilan bir xil sabab: Prisma `include`ni to'g'ri
    // chiqarib bermaydi, `DialogRow`ga to'g'ridan-to'g'ri cast "yetarli
    // kesishmaydi" xatosini beradi, chunki TS `zeilen`ni bazaviy model
    // turida ko'rmaydi.
    const dialoge: MaterialDialog[] = (dialogRows as any as DialogRow[]).map(
      (d) => ({
        id: d.id,
        titelDe: d.titelDe,
        sectionCode: '',
        zeilen: d.zeilen.map((z) => ({
          id: z.id,
          sprecher: z.sprecher,
          de: z.de,
          uz: z.uz,
        })),
      }),
    );

    const material: Material = {
      woerter,
      saetze,
      phrasen,
      dialoge,
      mediaUrl: (key: string) => this.mediaUrl(key),
    };
    const rnd = mulberry32(sectionId);

    const alle: Frage[] = (Object.keys(VORSCHAU_BAUER) as FrageFormat[]).flatMap(
      (format) => VORSCHAU_BAUER[format](material, rnd),
    );

    return alle.map(toVorschau);
  }
}
