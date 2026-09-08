import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { tryResolveStudentBranchId } from '../../common/finance/resolve-branch';
import { currentGroupId } from '../shared/student-scope';
import { istRichtig } from './antwort';
import { punkteFuer } from './punkte';
import type {
  Frage,
  FrageFormat,
  MaterialDialog,
  MaterialPhrase,
  MaterialSatz,
  MaterialWort,
  PublicFrage,
} from './frage.types';
import { toPublic } from './frage.types';
import { dialogLuecke } from './dialog-fragen';
import { bevorzugteFormate } from './kind-formate';
import { naechsterZustand } from './leitner';
import {
  luecke,
  reaktion,
  satzBauen,
  satzUebersetzen,
  zuordnen,
  ZUORDNEN_JUFT,
} from './satz-fragen';
import { baueSeans } from './seans';
import { ohneWiederholteFormate } from './wiederholte-formate';
import {
  artikel,
  audioWort,
  paar,
  uzWort,
  wortTippen,
  wortUz,
} from './wort-fragen';

/**
 * So'z uchun quriladigan formatlar — `PAAR` bu yerda yo'q: u bitta so'zga
 * emas, to'rtlikka tegishli.
 *
 * `AUDIO_WORT`/`WORT_TIPPEN` ATAYLAB shu ro'yxatda: qaytarish — muddati
 * kelgan so'zning Leitner ko'rigi, eshitib tanish/yozish ham xuddi shu
 * ko'rikning bir turi, alohida yo'l emas. Ikkalasi ham `audioKey` yo'q
 * so'zga `null` qaytaradi (`baueWortFrage` buni allaqachon `artikel`
 * kabi kutadi — pastdagi `if (frage) break` sikli), shuning uchun audio
 * hali yasalmagan bugun bu ikkisi shunchaki hech qachon tanlanmaydi.
 */
const WORT_FORMATE: FrageFormat[] = [
  'WORT_UZ',
  'UZ_WORT',
  'ARTIKEL',
  'AUDIO_WORT',
  'WORT_TIPPEN',
];

/** Har seansda qaytariladigan (pflicht) o'rinlar ulushi — 6dan biri: 12 savolda 2 ta. */
const WIEDERHOLUNG_ULUSH = 6;
const SEANS_UZUNLIGI = 12;

/**
 * `lexemeId` bo'yicha DEDUPLIKATSIYA — bir xil so'z ro'yxatda ikki marta
 * bo'lsa, FAQAT BIRINCHI uchrashuv qoladi.
 *
 * HIMOYA QATLAMI (Finding 1, `PAAR` ball ko'paytmasi): asosiy to'siq
 * `pruefePaar`da (to'rtta ANIQ juft talabi) — u bitta so'zni to'rt marta
 * nomlagan javobni butunlay MALFORMED deb rad etadi. Lekin agar ertaga
 * kimdir shu talabni chetlab o'tsa ham (masalan boshqa formatga
 * kengaytirilganda), bu funksiya ikkinchi qatlam bo'lib qoladi: bitta
 * so'z bir so'rovda bir necha marta ballanib, Leitner holati bir necha
 * marta yangilanib ketmasin.
 */
function dedupeLexemeId<T extends { lexemeId: number }>(items: T[]): T[] {
  const koerilgan = new Set<number>();
  return items.filter((item) => {
    if (koerilgan.has(item.lexemeId)) return false;
    koerilgan.add(item.lexemeId);
    return true;
  });
}

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
  audioKey: string | null;
}): MaterialWort | null {
  if (!l.uz) return null;
  return {
    id: l.id,
    de: l.de,
    uz: l.uz,
    artikel: l.artikel,
    anzeige: l.anzeige,
    sectionCode: l.sectionCode,
    audioKey: l.audioKey,
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
    case 'DIALOG_LUECKE':
      // `DIALOG_LUECKE` — `LUECKE` bilan bir xil oddiy hol: to'g'ri javob
      // olib tashlangan satrning nemischasi, boshqa hech narsa hisobga
      // olinmaydi (dialog satri Leitner narvoniga kirmaydi — pastdagi
      // `itemType === 'WORT'` sharti buni allaqachon ta'minlaydi).
      return { richtig: material.de, akzeptiert: [] };
    case 'AUDIO_WORT':
    case 'WORT_TIPPEN':
      // Ikkalasida ham to'g'ri javob — eshitilgan so'zning o'zi
      // (`ziel.de`, artiklsiz — `wort-fragen.ts`dagi `audioWort`/
      // `wortTippen` bilan bir xil). Bu holat yo'q qolib ketsa, `pruefen`
      // yuqoridagi `default`ga tushib, savol ko'rsatilgandan keyin
      // JAVOB BERISHNING O'ZI 400 bilan yiqilardi.
      return { richtig: material.de, akzeptiert: [] };
    default:
      throw new BadRequestException(
        `${format} javobi hozircha tekshirilmaydi — savol o'zligi kengayishi kerak`,
      );
  }
}

export interface PruefenInput {
  itemType: 'WORT' | 'SATZ' | 'PHRASE' | 'DIALOGZEILE';
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
 * Bitta juftlash bosishi — `juft()` uchun kirish.
 *
 * `PruefenInput`dan farqi: bu yerda `given` yo'q, o'rniga `chap`/`ong`
 * (bosilgan ikkita element) bor. Faqat juftlash formatlari qamrab
 * olinadi — `PAAR` (so'z=tarjima) va `ZUORDNEN` (vaziyat=ibora); boshqa
 * sakkiz formatda "juft" degan tushunchaning o'zi yo'q.
 */
export interface JuftInput {
  itemType: 'WORT' | 'PHRASE';
  itemId: number;
  format: 'PAAR' | 'ZUORDNEN';
  chap: string;
  ong: string;
  /** `pruefen`dagi bilan bir xil ma'no — shu BITTA juftni bosishga ketgan vaqt. */
  durationMs?: number;
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

  // `config` IXTIYORIY: bu klass o'nlab testda `new UebungService(prisma)`
  // shaklida to'g'ridan-to'g'ri (Nest DI'siz) quriladi va ularning aksariyati
  // audio bilan umuman ishlamaydi. Productionda Nest uni har doim inyeksiya
  // qiladi (`ConfigModule` global) — ixtiyoriylik shu yerda faqat testlarni
  // buzmaslik uchun, ishlab chiqarish xatti-harakatida bo'shliq emas: audio
  // yo'lini ishlatadigan ikkita test (`uebung.service.spec.ts`) `config`ni
  // aniq beradi.
  constructor(
    private readonly prisma: PrismaService,
    private readonly config?: ConfigService,
  ) {}

  /**
   * R2 kalitini ommaviy manzilga aylantiradi — xuddi shu naqsh
   * `daf-portal-read.service.ts`/`daf-drill.service.ts`da ham bor,
   * uchinchi marta boshqacha yozilmaydi.
   *
   * `R2_PUBLIC_URL` sozlanmagan (yoki testda `config` berilmagan) bo'lsa
   * `null` qaytadi. `audioWort`/`wortTippen` buni `audioKey` yo'qligi
   * bilan BIR XIL ko'radi — savol shunchaki qurilmaydi. Muqobili — bo'sh
   * bazani baribir manzilga yopishtirib yuborish — aynan shu ko'rikda
   * topilgan doimiy "Ovoz yuklanmadi" nosozligini boshqa shaklda
   * qaytarardi.
   */
  private mediaUrl(key: string): string | null {
    const base = this.config?.get<string>('R2_PUBLIC_URL');
    return base ? `${base.replace(/\/$/, '')}/${key}` : null;
  }

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
    const natija = await this.baueKandidaten(lessonId, studentId, rnd);
    // Dars mavjud, lekin bo'limi yo'q (eski DiB darsi, `sectionId: null`) —
    // bu XATO emas, yangi dvigatel faqat sectionli darslar uchun ishlaydi.
    // Mijoz `seans.data.length === 0`ni ko'rib eski `LernenLessonPage`ga
    // qaytadi — shuning uchun bu yerda 404 EMAS, bo'sh massiv qaytariladi.
    // Darsning O'ZI topilmasa (`null`) `baueKandidaten` hamon 404 tashlaydi.
    if (!natija) return [];
    const { pflicht, kandidaten, kind } = natija;

    // Seans turining moyilligi (Vazifa 3) — QAT'IY BO'LINISH EMAS,
    // TARTIB. To'liq izoh `kind-formate.ts`da: kurs dizayni 16 format
    // uchun yozilgan, bugun 10 tasi bor, «Tanishuv»ga tegishlisi esa
    // uchtasi — qat'iy bo'linsa `MIN_FORMATE` (seans.ts) bilan
    // to'qnashardi. Shuning uchun mos formatlar `baueSeans` pooli
    // ichida oldinga suriladi, yetmasa qolganidan olinadi; xilma-xillik
    // kafolatlari (`baueSeans` ichida) buzilmaydi.
    const { fragen, nichtPlatziert } = baueSeans(
      kandidaten,
      SEANS_UZUNLIGI,
      rnd,
      pflicht,
      bevorzugteFormate(kind),
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
    itemType: 'WORT' | 'SATZ' | 'PHRASE' | 'DIALOGZEILE',
    itemId: number,
    nichtFormat: FrageFormat,
    rnd: () => number = Math.random,
  ): Promise<PublicFrage | null> {
    const natija = await this.baueKandidaten(lessonId, studentId, rnd);
    // Xuddi `seans` dagidek: bo'limsiz dars XATO emas — bu yerda mos
    // o'rinbosar yo'qligi bilan bir xil tabiiy holat, shuning uchun 404
    // emas, `null` (dizaynda allaqachon "topilmadi" degani emas).
    if (!natija) return null;
    const { pflicht, kandidaten } = natija;

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
    // `input.durationMs` — kelajak uchun qabul qilinadi, HOZIRCHA
    // saqlanmaydi: `DafLessonProgress`da bu qiymat uchun ustun yo'q. Bu
    // funksiya uni pastda hech qayerda o'qimaydi — kelajakda haqiqatda
    // yozish kerak bo'lsa, DTOsi allaqachon tayyor.
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
   * Takrorlash seansi — muddati kelgan so'zlardan qurilgan to'liq seans.
   *
   * NEGA ALOHIDA SEANS. Ballning qoidasi bo'yicha darsni qayta o'tish
   * hech narsa bermaydi, ya'ni hamma darsni tugatgan o'quvchi haftalik
   * jadvaldan yo'qolardi. Bu seans o'sha teshikni yopadi va u tuzilishi
   * bo'yicha har kuni yangi: so'zga javob berilishi bilan u bugungi
   * navbatdan chiqadi (`leitner.ts`), ya'ni navbat faqat KAMAYADI va
   * uni o'ynab to'ldirib bo'lmaydi.
   *
   * NEGA SAVOL QURISH `baueWiederholung`GA TASHLANADI. Bu yerda
   * so'zlarni tanlash, formatni almashtirish va savol qurish mantig'i
   * TAKRORLANMAYDI — ular allaqachon `seans()` uchun `baueWiederholung`da
   * yozilgan. Farqi faqat sonda: `seans` uni bitta seansning oltidan biri
   * uchun chaqiradi, bu yerda esa BUTUN seans uzunligi (`SEANS_UZUNLIGI`)
   * beriladi, chunki takrorlash seansining o'zi shu tanlovning o'zidan
   * quriladi — boshqa hech qanday material yo'q.
   *
   * CHALG'ITUVCHI PULI — O'QUVCHI KO'RGAN BARCHA SO'Z, muddatiga
   * qaramasdan. Bu yerda faqat SHU bitta so'rov yuriladi: muddati kelgan
   * so'zlarni `baueWiederholung` o'zi tanlaydi va o'z so'rovini
   * chegaralab (`take`) yuritadi, ya'ni ularni bu yerda ikkinchi marta
   * o'qish ortiqcha ish bo'lardi. Muddati kelgan so'z ko'rgan so'zlar
   * to'plamining ichida bo'lgani uchun pul baribir to'liq.
   *
   * NEGA FAQAT MUDDATI KELGANLAR YETARLI EMAS EDI (tuzatilgan nuqson).
   * Chalg'ituvchi puli faqat muddati kelgan so'zlardan olinsa,
   * `ablenker` (wort-fragen.ts) har bir savol uchun kamida 3 ta BOSHQA
   * qiymat topa olmaguncha `null` qaytaradi. Kunning aksariyatida
   * muddati kelgan so'z soni 2-3 ta bo'ladi (BU ODATIY HOLAT, kamdan-kam
   * emas) — demak deyarli har doim pul juda tor bo'lib, HAR BIR savol
   * "qurib bo'lmadi" deb tashlab yuboriladi va o'nlab so'z o'rgangan
   * o'quvchi ham bo'sh seans olib qolardi — aynan tinch kunda, seans
   * eng kerak bo'lgan paytda. O'quvchi ko'rmagan so'zdan chalg'ituvchi
   * qo'yish ham noto'g'ri (bilimni emas, taxminni tekshirardi) —
   * shuning uchun pul "butun lug'at" emas, "o'quvchi ko'rgan so'zlar".
   *
   * Bo'sh ro'yxat XATO EMAS: bugun takrorlanadigan so'z yo'q, xolos.
   */
  async wiederholung(
    studentId: number,
    rnd: () => number = Math.random,
  ): Promise<PublicFrage[]> {
    // Chalg'ituvchi manbai — MUDDATGA QARAMASDAN, o'quvchi duch kelgan
    // BARCHA so'z. Yuqoridagi izohga qarang: tor (faqat muddati kelgan)
    // pul deyarli har bir savolni qurib bo'lmas holga keltirgan edi.
    const koergan = (await this.prisma.dafLexemeState.findMany({
      where: { studentId },
    } as any)) as Array<{ lexemeId: number }>;
    // Hech qachon mashq qilmagan o'quvchi — bo'sh ro'yxat, xato emas.
    if (koergan.length === 0) return [];

    const wortIds = koergan.map((z) => z.lexemeId);

    const wortRows = (await this.prisma.dafLexeme.findMany({
      where: { id: { in: wortIds } },
    } as any)) as Array<{
      id: number;
      de: string;
      // Sxemada nullable — `toWort` tarjimasiz qatorni `null`ga aylantiradi.
      uz: string | null;
      artikel: string | null;
      anzeige: string | null;
      sectionId: number | null;
      audioKey: string | null;
    }>;

    // `sectionCode: ''` — takrorlash seansi hech qaysi bo'limga
    // tegishli emas, bu maydon faqat ko'rgazma uchun ishlatiladi
    // (savol qurishga ta'sir qilmaydi).
    const alleWoerter: MaterialWort[] = wortRows
      .map((l) => toWort({ ...l, sectionCode: '' }))
      .filter((w): w is MaterialWort => w !== null);

    const fragen = await this.baueWiederholung(
      studentId,
      alleWoerter,
      rnd,
      SEANS_UZUNLIGI,
    );
    return fragen.map((f, i) => toPublic(f, i));
  }

  /**
   * Material yuklash va nomzod qurish — `seans` HAM, `ersatz` HAM shu
   * yo'ldan boradi. Bu ikkalasida bir xil bosqichlar (darsni o'qish,
   * bo'lim materialini yuklash, qaytarish (pflicht) so'zlarini aniqlash,
   * so'z/gap/ibora nomzodlarini qurish, takroriy formatlarni filtrlash)
   * bir marta, shu yerda yoziladi — ikki nusxada ikki xil o'zgarib
   * qolmasligi uchun.
   *
   * IKKI XIL "YO'Q" BOR, VA ULAR BOSHQA-BOSHQA NARSA:
   * - Dars qatorining O'ZI topilmasa — bu HAQIQIY 404: bunday `lessonId`
   *   umuman mavjud emas.
   * - Dars bor, lekin `section`i yo'q (`sectionId: null`) — bular eski,
   *   yangi dvigatel migratsiyasidan OLDINGI DiB darslari. Bu XATO emas,
   *   faqat "bu dars yangi mashq tizimida ishlamaydi" degani — chaqiruvchi
   *   (`seans` bo'sh massiv, `ersatz` `null`) buni tabiiy holat sifatida
   *   ko'radi. Shuning uchun bu funksiya faqat BIRINCHI holatda istisno
   *   tashlaydi; ikkinchisida `null` qaytaradi.
   */
  private async baueKandidaten(
    lessonId: number,
    studentId: number,
    rnd: () => number,
  ): Promise<{
    pflicht: Frage[];
    kandidaten: Frage[];
    // Darsning turi (SECTION_A/SECTION_B/BRIDGE/UNIT_TEST) — `seans()`
    // buni `bevorzugteFormate`ga uzatib, seans turining moyilligini
    // hisoblaydi. `ersatz()` bu maydonni e'tiborsiz qoldiradi: u bitta
    // almashtiruvchi savol beradi, moyillikka ehtiyoj yo'q.
    kind: string | null;
  } | null> {
    const lesson = await this.prisma.dafLesson.findUnique({
      where: { id: lessonId },
      include: { section: true },
    } as any);
    if (!lesson) {
      throw new NotFoundException(`Dars topilmadi: ${lessonId}`);
    }
    if (!(lesson as any).section) {
      return null;
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

    const [lexemeRows, sentenceRows, phraseRows, dialogRows] =
      await Promise.all([
        this.prisma.dafLexeme.findMany({
          where: { sectionId: { in: sectionIds } },
        } as any),
        this.prisma.dafSentence.findMany({
          where: { sectionId: { in: sectionIds } },
        } as any),
        this.prisma.dafPhrase.findMany({
          where: { sectionId: { in: sectionIds } },
        } as any),
        this.prisma.dafDialog.findMany({
          where: { sectionId: { in: sectionIds } },
          include: { zeilen: { orderBy: { order: 'asc' } } },
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
      audioKey: string | null;
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
    interface DialogRow {
      id: number;
      titelDe: string;
      sectionId: number;
      zeilen: Array<{ id: number; sprecher: string; de: string; uz: string }>;
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
    const toDialog = (d: DialogRow): MaterialDialog => ({
      id: d.id,
      titelDe: d.titelDe,
      sectionCode: kodVon(d.sectionId),
      zeilen: d.zeilen.map((z) => ({
        id: z.id,
        sprecher: z.sprecher,
        de: z.de,
        uz: z.uz,
      })),
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
    // `dafDialog.findMany` argumenti `as any` bilan berilgan (Prisma
    // `include`ni to'g'ri chiqarib bermaydi — xuddi yuqoridagi
    // `dafLesson`+`section`dagi kabi), shuning uchun natija avval `any`ga
    // o'tkaziladi: to'g'ridan-to'g'ri `DialogRow[]`ga cast qilish "yetarli
    // kesishmaydi" xatosini beradi, chunki TS `zeilen`ni bazaviy model
    // turida ko'rmaydi.
    const dialoge: MaterialDialog[] = (dialogRows as any as DialogRow[]).map(
      toDialog,
    );

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
      const aw = audioWort(w, coreWords, rnd, (key) => this.mediaUrl(key));
      if (aw) rohKandidaten.push(aw);
      const wt = wortTippen(w, rnd, (key) => this.mediaUrl(key));
      if (wt) rohKandidaten.push(wt);
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
    // Bir marta, `PAAR` kabi uch marta emas: `ZUORDNEN` oltita iborani
    // oladi va bo'limlarda ibora kam (kamida 3 ta), ya'ni ikkinchi
    // chaqiruv deyarli har doim bir xil to'plamni qaytaradi.
    const zu = zuordnen(phrases, rnd);
    if (zu) rohKandidaten.push(zu);

    // Har dialog uchun bitta nomzod: chalg'ituvchilar BOSHQA dialoglarning
    // satrlaridan olinadi (`d.id !== o.id`) — shu dialogning o'zi emas
    // (qarang `dialog-fragen.ts`dagi izoh: shu dialogning satri savol
    // kontekstiga haqiqatda mos kelib qolishi mumkin, ya'ni "xato" javob
    // aslida to'g'ri bo'lib chiqardi).
    for (const d of dialoge) {
      const andereZeilen = dialoge
        .filter((o) => o.id !== d.id)
        .flatMap((o) => o.zeilen);
      const dl = dialogLuecke(d, andereZeilen, rnd);
      if (dl) rohKandidaten.push(dl);
    }

    // Qoida 5 (dizayn 4.3): ketma-ket ikki SEANSDA bir xil (so'z+format)
    // juftligi takrorlanmaydi. Nomzodning O'ZIDAN (`itemType`/`format`
    // + `belegteItems`dan) kelib chiqadi — qarang `wiederholte-formate.ts`
    // uchun to'liq izoh, nega hand-listed format ro'yxati emas.
    const kandidaten = ohneWiederholteFormate(
      rohKandidaten,
      letzterFormatByWort,
    );

    return { pflicht, kandidaten, kind: (lesson as any).kind ?? null };
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
    // Sukut qiymat — bitta seansdagi (pflicht) ulush, `seans()` shu
    // yordamida chaqiradi. `wiederholung()` esa BUTUN seans uzunligini
    // beradi (`SEANS_UZUNLIGI`) — chunki takrorlash seansining o'zi
    // to'liq shu tanlovdan quriladi, boshqa hech qanday material yo'q.
    anzahl: number = Math.floor(SEANS_UZUNLIGI / WIEDERHOLUNG_ULUSH),
  ): Promise<Frage[]> {
    const soni = anzahl;
    if (soni <= 0) return [];

    // `take: soni` — cheklov SO'ROVNING O'ZIDA. Natija yana `slice` bilan
    // qattiq ushlanadi: `anzahl` chaqiruvchiga berilgan QAT'IY VA'DA
    // (masalan `wiederholung()` uchun butun `SEANS_UZUNLIGI`), shuning
    // uchun bu chegara faqat so'rov qatlamiga ishonib qoldirilmaydi.
    const due = (
      (await this.prisma.dafLexemeState.findMany({
        where: { studentId, dueAt: { lte: new Date() } },
        orderBy: { dueAt: 'asc' },
        take: soni,
      } as any)) as Array<{ lexemeId: number; lastFormat: string | null }>
    ).slice(0, soni);
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
      audioKey: string | null;
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
      case 'AUDIO_WORT':
        return audioWort(wort, andere, Math.random, (key) =>
          this.mediaUrl(key),
        );
      case 'WORT_TIPPEN':
        return wortTippen(wort, Math.random, (key) => this.mediaUrl(key));
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
      // Himoya qatlami: `pruefePaar` allaqachon takrorlangan so'zli
      // javobni butunlay rad etadi (bo'sh `paare` bilan qaytadi), lekin
      // bu yerda ham DEDUPLIKATSIYA qilinadi — bitta so'z ikki marta
      // ballanmasin va Leitner holati bir necha marta yangilanmasin.
      paarNatijalari = dedupeLexemeId(
        natija.paare
          .filter((p) => p.lexemeId != null)
          .map((p) => ({ lexemeId: p.lexemeId as number, ok: p.ok })),
      );
    } else if (format === 'ZUORDNEN') {
      // `ZUORDNEN` ham `PAAR` kabi bitta "to'g'ri javob" satriga
      // sig'maydi (oltita juftning qaysilari savolga tushgani tasodifiy
      // tanlangan), shuning uchun `richtigeAntwort`ga UMUMAN yetib
      // bormaydi — o'z yo'li bilan (juft-juft) tekshiradi.
      if (itemType !== 'PHRASE' || material.unitId == null) {
        // PAAR bilan bir xil himoya qatlami: `CheckAntwortDto` `itemType`
        // va `format`ni MUSTAQIL tekshiradi, ya'ni mijoz `itemType: 'SATZ'`
        // + `format: 'ZUORDNEN'` yubora oladi. Shu holda `ladeMaterial`
        // `unitId`siz material qaytaradi — himoyasiz qoldirilsa,
        // `pruefeZuordnen`ga `unitId: undefined` o'tib, Prisma
        // `{ unitId: undefined }` filtrini JIMGINA tashlab yuboradi va
        // ibora qidiruvi BUTUN bazaga (barcha unitlarga) tarqaladi —
        // aynan shu funksiyaning shartnomasi taqiqlagan holat.
        //
        // FAQAT `material.unitId == null` YETARLI EMAS EDI (ko'rik
        // topilmasi): `WORT` materiali ham `unitId` bilan qaytadi, ya'ni
        // mijoz `itemType: 'WORT'` + `format: 'ZUORDNEN'` yuborsa, bu
        // tekshiruv (faqat `unitId`ga qarasa) OLDIN o'tkazib yuborardi —
        // xabari "faqat iboraga tegishli" desa ham. `itemType !==
        // 'PHRASE'` tekshiruvi shuni yopadi.
        throw new BadRequestException('ZUORDNEN savoli faqat iboraga tegishli');
      }
      const natija = await this.pruefeZuordnen(given, material.unitId);
      isCorrect = natija.isCorrect;
      richtig = natija.richtig;
    } else {
      const antwort = richtigeAntwort(format, material);
      isCorrect = istRichtig(given, antwort.richtig, antwort.akzeptiert);
      richtig = antwort.richtig;
    }

    // Bu javob qaysi so'z(lar)ga tegishli — PAAR uchun deduplikatsiya
    // qilingan ro'yxat, oddiy WORT savoli uchun bitta so'z, gap/ibora
    // uchun bo'sh.
    const betroffeneWoerter = paarNatijalari
      ? paarNatijalari.map((p) => ({ lexemeId: p.lexemeId, richtig: p.ok }))
      : itemType === 'WORT'
        ? [{ lexemeId: itemId, richtig: isCorrect }]
        : [];
    const punkteEingabe = await this.punkteEingabeFuer(
      ctx.studentId,
      betroffeneWoerter,
    );
    const points = punkteFuer(punkteEingabe);

    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const groupId = await currentGroupId(this.prisma, ctx.studentId);

    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        companyId: ctx.companyId,
        branchId,
        groupId,
        lexemeId: itemType === 'WORT' ? itemId : null,
        isCorrect,
        given,
        durationMs: durationMs ?? null,
        points,
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
   * Bitta juftni JONLI tekshiradi — o'quvchi ikkita elementni bir-biriga
   * ulagan zahoti (butun mashqni tugatmasdan) natija kerak. Direktor
   * ishlab ko'rgach aynan shuni so'radi: juftlash mashqi juft o'tirgan
   * zahoti aytishi kerak, hammasini yig'ib bo'lgandan keyin emas.
   *
   * REAL URINISH SIFATIDA YOZILADI — `pruefen` bilan bir xil yo'ldan
   * o'tadi: `dafAttempt` yozuvi, muddati kelgan bo'lsa ball, Leitner
   * yangilanishi. Bu ATAYLAB shunday: aynan shu qoida "tuzatish bepul"
   * xususiyatini HECH QANDAY QO'SHIMCHA KOD YOZMASDAN beradi. Xato
   * bosilgan so'z ertangi kunga suriladi (`aktualisiereZustand`), ya'ni
   * keyingi (to'g'ri) bosishda u endi "muddati kelmagan" bo'ladi va
   * `punkteFuer` nol qaytaradi — cheksiz bosib "yashil" qilish ham
   * bekorga, chunki har muvaffaqiyatsiz urinishdan keyingi urinish xuddi
   * shu sabab bilan ball bermaydi.
   *
   * TARTIB MUHIM: muddat holati (`punkteEingabeFuer`) `aktualisiereZustand`
   * DAN OLDIN o'qiladi — xuddi yuqoridagi `pruefen`dagidek. Aks holda
   * Leitner yozuvi "kelajakka surilgan" `dueAt`ni o'qib, "muddati
   * kelmagan" javobini har doim qaytarardi.
   */
  async juft(
    input: JuftInput,
    ctx: PruefenContext,
  ): Promise<{ isCorrect: boolean }> {
    const { itemType, itemId, format, chap, ong, durationMs } = input;

    // `itemType` formatga mos kelishi SHART — `pruefen`dagi `ZUORDNEN`
    // qo'riqchisi bilan bir xil sabab (ko'rikda topilgan kamchilik: faqat
    // `unitId`ni tekshirish YETARLI EMAS, chunki `PHRASE` materiali ham
    // `unitId` bilan qaytadi). `JuftDto`ning `itemType` va `format`
    // maydonlari BIR-BIRIDAN MUSTAQIL tekshiriladi, ya'ni mijoz
    // `itemType: 'WORT'` + `format: 'ZUORDNEN'` (yoki aksincha) yubora
    // oladi. Amalda bu unit-scoping tufayli xavfli emas — lekin noaniq:
    // aniq rad etish yashirin nomuvofiqlikdan yaxshiroq.
    if (format === 'PAAR' && itemType !== 'WORT') {
      throw new BadRequestException("PAAR savoli faqat so'zga tegishli");
    }
    if (format === 'ZUORDNEN' && itemType !== 'PHRASE') {
      throw new BadRequestException('ZUORDNEN savoli faqat iboraga tegishli');
    }

    const material = await this.ladeMaterial(itemType, itemId);
    if (!material) {
      throw new NotFoundException(`Material topilmadi: ${itemType}:${itemId}`);
    }
    if (material.unitId == null) {
      // `pruefePaar`/`pruefeZuordnen` dagi qoidaning o'zi: qidiruv unitga
      // cheklanishi shart, aks holda o'quvchi boshqa unitdan (hatto
      // ko'rsatilmagan darsdan) bir xil nomni aytib, hech qachon
      // ko'rmagan materialga "to'g'ri" javob olishi mumkin bo'lardi.
      throw new BadRequestException(
        'Juft savoli faqat unitga tegishli materialga tegishli',
      );
    }
    const unitId = material.unitId;

    // Baholanadigan so'zning `lexemeId`si — `PAAR`ning `itemId`si emas!
    // `itemId` to'rtlikning BIRINCHISI, bosilgan juft esa BOSHQASI
    // bo'lishi mumkin. `null` qoladi: format `ZUORDNEN` bo'lsa (ibora
    // Leitner narvoniga kirmaydi) yoki so'z topilmasa.
    let isCorrect: boolean;
    let lexemeId: number | null = null;

    if (format === 'PAAR') {
      const nomzodlar = (await this.prisma.dafLexeme.findMany({
        where: { de: chap, unitId },
      } as any)) as Array<{ id: number; de: string; uz: string }>;
      // NOMZODLAR ORASIDA NOYOBLIK KAFOLATLANMAGAN: bitta unitda ikkita
      // lexeme bir xil `de`ga ega bo'lishi mumkin (masalan `die Bank` →
      // `bank` (id 10) va `die Bank` → `o'rindiq` (id 40)) — savol
      // quruvchilar BITTA SAVOL ICHIDA takrorni yo'q qiladi, lekin butun
      // unit bo'yicha bunday kafolat yo'q. Shuning uchun avval o'quvchi
      // bosgan `ong`ga MOS kelgan nomzod tanlanadi, faqat hech biri mos
      // kelmasa (ikkalasi ham noto'g'ri) birinchisiga tushiladi.
      //
      // `pruefeZuordnen` xuddi shu noaniqlikda ATAYLAB boshqacha —
      // FAIL-CLOSED — ishlaydi (butun javobni xato deb hisoblaydi, ko'rik
      // topilmasi sifatida qoldirilgan). U yerda "Tekshirish" tugmasi bor
      // edi: xato chiqsa o'quvchi qayta urinib ko'rardi. Bu yerda tugma
      // YO'Q — savol har juft yashil bo'lgandagina tugaydi, ya'ni
      // fail-closed = CHEKSIZ TSIKL (bir xil noto'g'ri natija hech qachon
      // tuzalmaydi, chunki server doim boshqa lexemeni tekshiradi). Shu
      // sabab bu yerda mos nomzodni topib qabul qilish tanlandi —
      // noaniqlikni sukut biri bilan hal qilib, o'quvchini tuzoqdan
      // chiqaradi va u haqiqatda ulagan so'zni ballaydi.
      const soz = nomzodlar.find((l) => istRichtig(ong, l.uz)) ?? nomzodlar[0];
      isCorrect = soz != null && istRichtig(ong, soz.uz);
      lexemeId = soz?.id ?? null;
    } else {
      // `ZUORDNEN` — ibora Leitner jadvaliga kirmaydi, `lexemeId`
      // shu sabab `null`ligicha qoladi.
      const nomzodlar = (await this.prisma.dafPhrase.findMany({
        where: { funktionUz: chap, unitId },
      } as any)) as Array<{ funktionUz: string; de: string }>;
      // Yuqoridagi `PAAR` sharhidagi bir xil sabab: mos kelgan nomzod
      // ustunlik qiladi, aks holda birinchisiga tushiladi.
      const ibora =
        nomzodlar.find((p) => istRichtig(ong, p.de)) ?? nomzodlar[0];
      isCorrect = ibora != null && istRichtig(ong, ibora.de);
    }

    // Ball FAQAT `PAAR` uchun va FAQAT so'z topilgan bo'lsa — muddat
    // holati bu yerda, Leitner yangilanishidan OLDIN o'qiladi (yuqoridagi
    // izohga qarang).
    let points = 0;
    if (format === 'PAAR' && lexemeId != null) {
      const punkteEingabe = await this.punkteEingabeFuer(ctx.studentId, [
        { lexemeId, richtig: isCorrect },
      ]);
      points = punkteFuer(punkteEingabe);
    }

    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const groupId = await currentGroupId(this.prisma, ctx.studentId);

    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        companyId: ctx.companyId,
        branchId,
        groupId,
        lexemeId: format === 'PAAR' ? lexemeId : null,
        isCorrect,
        given: `${chap}=${ong}`,
        // `pruefen` buni yozadi, `juft()` avval YO'Q edi — har juftlashuv
        // urinishi hech qachon davomiylik saqlamasdi. Mijoz allaqachon
        // shu juftga ketgan vaqtni kuzatadi (`seans-ekrani.tsx`), shuni
        // qabul qilib yozamiz.
        durationMs: durationMs ?? null,
        points,
      },
    } as any);

    // Leitner FAQAT `PAAR` uchun — ibora bu jadvalga kirmaydi.
    if (format === 'PAAR' && lexemeId != null) {
      await this.aktualisiereZustand(
        ctx.studentId,
        ctx.companyId,
        lexemeId,
        isCorrect,
        format,
      );
    }

    return { isCorrect };
  }

  /**
   * Berilgan so'zlar ball uchun MUDDATI KELGANMI — savolni `punkteFuer`ga
   * yuboriladigan shaklga o'tkazadi.
   *
   * MUDDAT YOZUVDAN OLDIN O'QILADI: chaqiruvchida keyinroq ishlaydigan
   * `aktualisiereZustand` shu so'zlarning `dueAt`sini kelajakka surib
   * yuboradi — o'qish o'sha yozuvdan KEYIN sodir bo'lsa, "muddati
   * kelganmidi" degan savolga to'g'ri javob berib bo'lmaydi (band bo'lgan
   * holat allaqachon "kelmagan" ko'rinadi).
   */
  private async punkteEingabeFuer(
    studentId: number,
    woerter: Array<{ lexemeId: number; richtig: boolean }>,
  ): Promise<Array<{ faellig: boolean; richtig: boolean }>> {
    const lexemeIds = woerter.map((w) => w.lexemeId);
    const jetzt = new Date();
    const zustaende = lexemeIds.length
      ? ((await this.prisma.dafLexemeState.findMany({
          where: { studentId, lexemeId: { in: lexemeIds } },
        } as any)) as Array<{ lexemeId: number; dueAt: Date }>)
      : [];
    const dueByWort = new Map(zustaende.map((z) => [z.lexemeId, z.dueAt]));

    // Holatsiz so'z — hech qachon so'ralmagan, ya'ni MUDDATI KELGAN.
    const istFaellig = (lexemeId: number): boolean => {
      const due = dueByWort.get(lexemeId);
      return due == null || due.getTime() <= jetzt.getTime();
    };

    return woerter.map((w) => ({
      faellig: istFaellig(w.lexemeId),
      richtig: w.richtig,
    }));
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

    // TO'RTTA ANIQ SO'Z SHART (Finding 1: PAAR ball ko'paytmasi). `PAAR`
    // savoli qurilishida to'rt so'z HAR DOIM turlicha — shuning uchun bir
    // xil nemischa so'z ikki (yoki to'rt) marta kelgan javob savol
    // shaklini buzadi, xuddi to'rttadan farqli juft soni kabi. Bunday
    // javobni "qisman to'g'ri" deb hisoblash bitta muddati kelgan so'zni
    // (masalan `das Haus=uy` to'rt marta) TO'RT MARTA ballash va uning
    // Leitner holatini bitta so'rovda to'rt marta yangilab, muddatini
    // kunlar oldinga surib yuborish imkonini berardi.
    if (new Set(deLar).size !== deLar.length) {
      return { isCorrect: false, richtig: '', paare: [] };
    }
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

  /**
   * Har juftni (`vaziyat=ibora`) mustaqil tekshiradi — `pruefePaar`ning
   * ibora nusxasi.
   *
   * OLTITA JUFT SHART, xuddi `PAAR`da to'rtta so'z shart bo'lgani kabi:
   * boshqa son savol shaklini buzgan javob va butunlay XATO hisoblanadi.
   *
   * VAZIYATLAR NOYOB BO'LISHI SHART: savol qurilishida (`zuordnen`)
   * ikkita ibora bir xil `funktionUz` bilan kelmaydi, shuning uchun bir
   * xil vaziyat ikki marta nomlangan javob ham savol shaklini buzadi.
   *
   * IBORA QIDIRUVI SHU `unitId`GA CHEKLANADI — `pruefePaar` bilan bir
   * xil sabab: aks holda boshqa unitdan bir xil `funktionUz`li ibora
   * nomlab, hech qachon ko'rsatilmagan materialga "to'g'ri" javob olish
   * mumkin bo'lardi.
   *
   * BALL BERILMAYDI: chaqiruvchi (`pruefen`) bu natijani `PAAR`dagi kabi
   * `lexemeId`larga aylantirmaydi — ibora Leitner jadvaliga kirmaydi,
   * `itemType === 'WORT'` sharti buni allaqachon ta'minlaydi.
   */
  private async pruefeZuordnen(
    given: string,
    unitId: number,
  ): Promise<{ isCorrect: boolean; richtig: string }> {
    const juftlar = given
      .split('|')
      .map((p) => p.split('='))
      .filter((p): p is [string, string] => p.length === 2);

    if (juftlar.length !== ZUORDNEN_JUFT) {
      return { isCorrect: false, richtig: '' };
    }

    const vaziyatlar = juftlar.map(([vaziyat]) => vaziyat);
    if (new Set(vaziyatlar).size !== vaziyatlar.length) {
      return { isCorrect: false, richtig: '' };
    }

    const iboralar = (await this.prisma.dafPhrase.findMany({
      where: { funktionUz: { in: vaziyatlar }, unitId },
    } as any)) as Array<{ funktionUz: string; de: string; uz: string }>;

    // FAIL-CLOSED (ko'rik topilmasi, IMPORTANT): `byVaziyat` `funktionUz`
    // bo'yicha qurilgan `Map` — agar shu unitda ikkita ibora bir xil
    // `funktionUz`ga ega bo'lib qolsa (schema buni cheklamaydi, faqat
    // `zuordnen()` bitta savol ICHIDA noyoblikni kafolatlaydi), `Map`
    // OXIRGI qatorni jimgina g'olib qiladi va to'g'ri juftlashgan
    // o'quvchi noaniq g'olibga qarshi solishtirilib "xato" deb
    // belgilanadi — hech qanday iz qoldirmay. `vaziyatlar` allaqachon
    // yuqorida noyob ekani tekshirilgan, shuning uchun har bir vaziyatga
    // ANIQ bitta ibora mos kelishi kerak: sonlar mos kelmasa (kollizyadan
    // ortiqcha qator yoki topilmagan ibora) butun javobni XATO deb
    // hisoblaymiz — noaniq g'olibga tayanib baholash o'rniga.
    if (iboralar.length !== vaziyatlar.length) {
      return { isCorrect: false, richtig: '' };
    }
    const byVaziyat = new Map(iboralar.map((p) => [p.funktionUz, p]));

    const natijalar = juftlar.map(([vaziyat, deGegeben]) => {
      const ibora = byVaziyat.get(vaziyat);
      const ok = ibora != null && istRichtig(deGegeben, ibora.de);
      return { vaziyat, ok, deRichtig: ibora?.de ?? null };
    });

    return {
      isCorrect: natijalar.every((n) => n.ok),
      richtig: natijalar
        .map((n) => `${n.vaziyat}=${n.deRichtig ?? ''}`)
        .join('|'),
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
    if (itemType === 'DIALOGZEILE') {
      // `DIALOG_LUECKE` — `LUECKE` kabi oddiy hol: `unitId` shart emas,
      // chunki dialog satri `PAAR`/`ZUORDNEN` kabi bitta unitga cheklab
      // qidiriladigan javob emas — javob to'g'ridan-to'g'ri shu satrning
      // `de`si bilan solishtiriladi.
      const row = (await this.prisma.dafDialogLine.findUnique({
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
      /** `ZUORDNEN` javobini shu unitga cheklash uchun kerak (`PAAR` kabi). */
      unitId: number;
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
