import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DafDailyGoal } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { currentGroupId } from '../shared/student-scope';
import { reytingIsmi } from '../shared/reyting-ismi';
import { liganiYangilaXavfsiz } from '../liga/liga-seans';
import { ligaJavobi, type LigaJavobi } from '../liga/liga-xona';
import { guruhlarJavobi, type GuruhlarJavobi } from '../liga/guruhlar-jadvali';
import { nishonlarniBerXavfsiz, woerterSoni } from '../nishon/nishon-berish';
import {
  MAQSAD_BALL,
  maqsadDarajasi,
  maqsadHolati,
  serieAus,
  stufeFuer,
  wochenStartTag,
  wochenStartUtc,
  yangiBajarildi,
  type MaqsadHolati,
} from '../uebung/punkte';
import { nishonlarRoyxati, type NishonQatori } from '../nishon/nishonlar';
import { bugunBoshmi, maqsadniSaqla } from './maqsad';
import { eslatmalarniSaqla } from '../eslatma/eslatma-sozlama';

export interface Fortschritt {
  gesamt: number;
  /** `ab` — shu darajaning PASTKI chegarasi, `naechsteStufe.ab` bilan simmetrik. */
  stufe: { de: string; uz: string; ab: number };
  naechsteStufe: { de: string; uz: string; ab: number } | null;
  serie: number;
  wochePunkte: number;
  wochePlatzGruppe: number | null;
  wochePlatzZentrum: number;
  /**
   * Bugun MUDDATI KELGAN so'zlar soni — Takrorlash tugmasi shu songa
   * qarab faol/xira bo'ladi (Fix 5, dizayn §4). `uebung.wiederholung()`
   * aynan shu predikat (`dueAt <= hozir`) bilan so'z tanlaydi, shuning
   * uchun bu son "tugma bosilsa savol chiqadimi" degan savolga aniq
   * javob beradi — taxmin emas.
   */
  faelligeWoerter: number;
  /** Kunlik maqsad (spec S2 1.3): daraja, maqsad balli, bugungi ball, holat. */
  maqsad: MaqsadHolati;
  /** S4: Telegram eslatmalari yoqilganmi (sozlama qatori yo'q = yoqilgan). */
  eslatmalar: boolean;
  /** S4: karta botga ulangan va chat uzilmagan (ADR-0066 belgisi yo'q). */
  telegramUlangan: boolean;
}

export interface ReytingZeile {
  studentId: number;
  name: string;
  punkte: number;
  platz: number;
  selbst: boolean;
}

/** What the session-end screen shows: this session's points, the streak, the rank before/after. */
export interface SeansNatijasi {
  punkte: number;
  serie: number;
  serieYangi: boolean;
  orin: {
    gruppe: { oldin: number; hozir: number } | null;
    zentrum: { oldin: number; hozir: number };
  };
  /** Kunlik maqsad: `yangiBajarildi` — shu seans uni kesib o'tdi (spec S2 1.3). */
  maqsad: {
    ball: number;
    hozir: number;
    bajarildi: boolean;
    yangiBajarildi: boolean;
  };
  /** Shu seans bergan nishon kalitlari (spec S2 2.3). */
  yangiNishonlar: string[];
}

export type ReytingQamrovi = 'gruppe' | 'zentrum';

/** `oquvchiRaqamlari` so'rovining bitta qatori. */
interface OquvchiRaqamlari {
  punkte: number;
  hozir: number;
  oldin: number;
  gesamt: number;
  tage: string[];
  heuteAttempts: number;
  heutePunkte: number;
  /** `DafStudentSetting.dailyGoal`, qator yo'q bo'lsa `null`. */
  dailyGoal: string | null;
  eslatmalar: boolean;
  telegramUlangan: boolean;
}

/** Haftalik jadvaldan qaytadigan bitta qatorning umumlashgan shakli. */
interface HaftalikYigindi {
  studentId: number;
  _sum: { points: number | null };
}

/** Markaz jadvalida TO'LIQ ko'rsatiladigan yuqori qatorlar soni — undan
 * pastdagilar faqat o'z qatori sifatida (haqiqiy o'rni bilan) qo'shiladi. */
const ZENTRUM_TOP_CHEGARA = 50;

/** The week's lower bound for the `@db.Date` column. */
function montagGte(jetzt: Date): Date {
  return utcMidnightFromDateStr(wochenStartTag(jetzt));
}

function ballOl(satr: HaftalikYigindi): number {
  return satr._sum.points ?? 0;
}

/**
 * Ball bo'yicha kamayish, teng bo'lsa `studentId` bo'yicha o'sish tartibida
 * saralaydi — natija har so'rovda BARQAROR bo'lishi uchun.
 *
 * Haftalik yig'indi (`groupBy` + `_sum`) kim tengni QACHON yetganini
 * saqlamaydi — faqat oxirgi urinish vaqti bor, u esa tengga yetgan lahza
 * emas. `studentId` — bu jadvaldan chiqarib bo'ladigan yagona determinstik
 * mezon (dizayn §6.2).
 */
function saralaBarqaror<T extends HaftalikYigindi>(royxat: T[]): T[] {
  return [...royxat].sort((a, b) => {
    const farq = ballOl(b) - ballOl(a);
    return farq !== 0 ? farq : a.studentId - b.studentId;
  });
}

/**
 * Markazning haftalik ro'yxati — SQL'dagi `t` CTE. Markaz jadvali
 * (`zentrumReytingi`) ham, o'rin (`oquvchiRaqamlari`: chip va seans oxiri) ham
 * SHU bo'lakdan o'qiydi, shuning uchun ular bir xil populyatsiya va bir xil
 * tartib bilan hisoblanadi.
 *
 * - Bir qator = bir o'quvchining shu haftadagi `SUM(points)`; qatori bor,
 *   lekin 0 balli o'quvchi ham ro'yxatda.
 * - So'ragan o'quvchining o'z qatori yo'q bo'lsa (bu hafta mashq qilmagan),
 *   0 ball bilan QO'SHILADI — aks holda o'z o'rnini hech qachon hisoblab
 *   bo'lmaydi, va u boshqalarning o'rnini ham surishi kerak (u qo'shilgan
 *   ro'yxatdagi tartib — eski `oʻziniQoshib` qoidasi).
 * - Tartib (chaqiruvchilarda): ball kamayishi, teng bo'lsa `studentId`
 *   o'sishi (dizayn §6.2).
 *
 * Ro'yxat Node'ga tashilmaydi: ilgari har chaqiruv ~5 000 qatorni olib JS
 * da saralardi va 50 parallel so'rovda event loop tiqilib p95 300–460 ms
 * bo'lgan (S1 yuklama sinovi). `day` — `@db.Date`, shuning uchun chegara
 * sana MATNI sifatida `::date` bilan beriladi, vaqt lahzasi emas.
 *
 * Bog'langan qiymatlar tartibi `[companyId, montagTag, studentId, …]` —
 * spec'dagi soxta `$queryRaw` (`zentrum-sql.fake-spec.ts`) shunga tayanadi.
 */
function zentrumHaftaCte(
  companyId: number,
  montagTag: string,
  studentId: number,
): Prisma.Sql {
  return Prisma.sql`haftalik AS (
      SELECT "studentId", SUM(points)::int AS p
      FROM "DafStudentDay"
      WHERE "companyId" = ${companyId} AND day >= ${montagTag}::date
      GROUP BY "studentId"
    ),
    t AS (
      SELECT "studentId", p FROM haftalik
      UNION ALL
      SELECT ${studentId}::int, 0
      WHERE NOT EXISTS (SELECT 1 FROM haftalik h WHERE h."studentId" = ${studentId})
    )`;
}

function platziniTop(saralangan: HaftalikYigindi[], studentId: number): number {
  return saralangan.findIndex((s) => s.studentId === studentId) + 1;
}

/** The same list with one student's points lowered by `minus` (never below 0). */
function ayir(
  royxat: HaftalikYigindi[],
  studentId: number,
  minus: number,
): HaftalikYigindi[] {
  return royxat.map((s) =>
    s.studentId === studentId
      ? { studentId, _sum: { points: Math.max(0, ballOl(s) - minus) } }
      : s,
  );
}

@Injectable()
export class FortschrittService {
  private readonly logger = new Logger(FortschrittService.name);

  constructor(private readonly prisma: PrismaService) {}

  async uebersicht(studentId: number, companyId: number): Promise<Fortschritt> {
    const hozir = new Date();
    const heute = tashkentDateStr(hozir);
    const montag = montagGte(hozir);

    // Hamma so'rov BIR bosqichda: 50 o'quvchi bir vaqtda kelganda har
    // ketma-ket bosqich ulanishlar navbatiga qaytadan turadi (S1 yuklama
    // sinovi). Guruh zanjiri faqat `groupId` ga bog'liq.
    const faelligeP = this.prisma.dafLexemeState.count({
      where: { studentId, dueAt: { lte: hozir } },
    } as any);
    const [faelligeWoerter, oz, wochePlatzGruppe, bosh] = await Promise.all([
      // `uebung.wiederholung()` bilan BIR XIL predikat (`dueAt <= hozir`)
      // — bu shu o'quvchi uchun so'ragan `student`ga tegishli qatorlar
      // ustida ishlaydi, deyarli bepul (`DafLexemeState` studentId bo'yicha
      // indekslangan).
      faelligeP,
      // Markaz o'rni `zentrumHaftaCte` orqali hisoblanadi — xuddi shu
      // bo'lak `reyting('zentrum')` jadvalini quradi. Guruh uchun
      // qilingan tuzatish (pastdagi izohga qarang) markazga tegishli emas
      // edi: `zentrumReytingi` o'z qatorini FAQAT o'quvchi shu hafta
      // urinish qilgan bo'lsa qo'shar edi, shuning uchun dushanba ertalab
      // chip "1-o'rin" deb, Markaz jadvali esa "hech kim ball yig'magan"
      // deb ikkitasi bir vaqtda ikki xil javob berardi.
      // Umumiy ball, seriya kunlari va haftalik bal ham shu so'rovda.
      this.oquvchiRaqamlari(
        studentId,
        companyId,
        wochenStartTag(hozir),
        heute,
        0,
      ),
      // Guruh o'rni `gruppeHaftaligi` orqali hisoblanadi — xuddi shu
      // funksiya `reyting('gruppe')` jadvalini quradi. Bitta joyda
      // hisoblanmasa, ikki ekran bir xil savolga ikki xil javob berishi
      // mumkin edi: bu haqiqiy xato bo'lib topilgan (mashq qilmagan a'zo
      // o'z o'rnini past ko'rsatgan — "shu hafta mashq qilganlar"
      // populyatsiyasi bilan hisoblangan eski versiya butun rosterni
      // emas, faqat urinish qilganlarni ko'rgan).
      this.gruppePlatz(studentId, companyId, montag),
      // Kam yo'l: so'z bor bo'lsa so'rovsiz `false` (spec S2 1.3); so'z yo'q
      // bo'lsa dars so'rovi sanash bilan ketma-ket, lekin qolgan so'rovlar
      // bilan PARALLEL — kritik yo'l uzaymaydi.
      faelligeP.then((n) => bugunBoshmi(this.prisma, studentId, n)),
    ]);

    const gesamt = oz.gesamt;
    const { jetzt, naechste } = stufeFuer(gesamt);

    return {
      gesamt,
      stufe: { de: jetzt.de, uz: jetzt.uz, ab: jetzt.ab },
      naechsteStufe: naechste
        ? { de: naechste.de, uz: naechste.uz, ab: naechste.ab }
        : null,
      serie: serieAus(oz.tage, heute),
      wochePunkte: oz.punkte,
      wochePlatzGruppe,
      wochePlatzZentrum: oz.hozir,
      faelligeWoerter,
      maqsad: maqsadHolati(maqsadDarajasi(oz.dailyGoal), oz.heutePunkte, bosh),
      eslatmalar: oz.eslatmalar,
      telegramUlangan: oz.telegramUlangan,
    };
  }

  /** O'quvchining guruh jadvalidagi o'rni; guruhsiz yoki bo'sh guruh — `null`. */
  private async gruppePlatz(
    studentId: number,
    companyId: number,
    montag: Date,
  ): Promise<number | null> {
    const groupId = await currentGroupId(this.prisma, studentId);
    if (!groupId) return null;
    const { saralangan } = await this.gruppeHaftaligi(
      groupId,
      companyId,
      montag,
    );
    return saralangan.length > 0 ? platziniTop(saralangan, studentId) : null;
  }

  /**
   * The session's result for the end screen (spec §5). "Before" = everyone
   * else as now, this student's week without this session's share of it.
   * Both ranks go through the same sort, so the two can be compared.
   */
  async seansNatijasi(
    sessionId: string,
    studentId: number,
    companyId: number,
  ): Promise<SeansNatijasi> {
    const jetzt = new Date();
    const heute = tashkentDateStr(jetzt);
    const montag = montagGte(jetzt);
    const montagUtc = wochenStartUtc(jetzt);

    // Ikki zanjir parallel: seans urinishlari → markaz o'rni (`minus` ga
    // muhtoj) va guruh → guruh ro'yxati (urinishlarni kutmaydi). Har
    // ketma-ket bosqich 50 parallel so'rovda ulanishlar navbatiga qaytadan
    // turadi (S1 yuklama sinovi).
    const urinishlarP = this.prisma.dafAttempt.findMany({
      where: { sessionId, studentId },
      select: { points: true, createdAt: true, groupId: true },
    });
    const guruhP = currentGroupId(this.prisma, studentId).then(
      async (groupId) =>
        groupId
          ? {
              groupId,
              ...(await this.gruppeHaftaligi(groupId, companyId, montag)),
            }
          : null,
    );

    const sum = (xs: { points: number }[]) =>
      xs.reduce((s, x) => s + x.points, 0);
    const shuHaftaOf = (xs: Awaited<typeof urinishlarP>) =>
      xs.filter((u) => u.createdAt >= montagUtc);

    // So'z soni seriyaga bog'liq emas: birinchi bosqichda parallel. Yiqilsa
    // `null` (nishon berilmaydi) — bu yerda tashlanmaydi, aks holda
    // `urinishlarP` yiqilganda ushlanmagan rad etish qoladi.
    const woerterP = woerterSoni(this.prisma, studentId).catch(() => null);
    // S3: liga holati — bitta so'rov, birinchi bosqich bilan parallel; xonaga
    // qo'shilish (haftada bir marta) va kechikkan hisob ham shu zanjirda.
    // Hech qachon otmaydi: `null` bo'lsa liga nishonlari berilmaydi.
    const ligaP = liganiYangilaXavfsiz(
      this.prisma,
      studentId,
      companyId,
      jetzt,
    );

    const [urinishlar, oz, guruh] = await Promise.all([
      urinishlarP,
      urinishlarP.then((xs) =>
        this.oquvchiRaqamlari(
          studentId,
          companyId,
          wochenStartTag(jetzt),
          heute,
          sum(shuHaftaOf(xs)),
        ),
      ),
      guruhP,
    ]);

    const shuHafta = shuHaftaOf(urinishlar);
    const bugungiUrinishlar = urinishlar.filter(
      (u) => tashkentDateStr(u.createdAt) === heute,
    );
    const bugungi = bugungiUrinishlar.length;

    let gruppe: SeansNatijasi['orin']['gruppe'] = null;
    if (guruh && guruh.saralangan.length > 0) {
      const minus = sum(shuHafta.filter((u) => u.groupId === guruh.groupId));
      gruppe = {
        oldin: platziniTop(
          saralaBarqaror(ayir(guruh.saralangan, studentId, minus)),
          studentId,
        ),
        hozir: platziniTop(guruh.saralangan, studentId),
      };
    }

    const serie = serieAus(oz.tage, heute);
    const ball = MAQSAD_BALL[maqsadDarajasi(oz.dailyGoal)];
    // Seansdan oldingi bugungi ball = hozir − seansning BUGUNGI qismi
    // (yarim tundan oldingi qismi kechaga tushgan).
    const kesdi = yangiBajarildi(
      ball,
      oz.heutePunkte,
      sum(bugungiUrinishlar),
      false,
    );
    // `bosh` faqat maqsad kesilganda o'qiladi — kuniga ko'pi bilan bir marta.
    // Nishonlar shu yerda (seriya yangilangan); xatosi o'zi ushlanadi,
    // natija `null` ga tushmaydi. `bosh` yiqilsa faqat `yangiBajarildi`
    // pasayadi (false): nishonlar allaqachon yozilgan bo'lishi mumkin va
    // keyingi INSERT ularni qaytarmaydi, natijani yo'qotib bo'lmaydi.
    const [bosh, yangiNishonlar] = await Promise.all([
      kesdi
        ? bugunBoshmi(this.prisma, studentId).catch((err: Error) => {
            this.logger.warn(
              `Bosh holat o'qilmadi (studentId=${studentId}): ${err.message}`,
            );
            return true;
          })
        : Promise.resolve(false),
      nishonlarniBerXavfsiz(
        this.prisma,
        studentId,
        companyId,
        serie,
        woerterP,
        ligaP,
      ),
    ]);

    return {
      punkte: sum(urinishlar),
      serie,
      serieYangi: bugungi > 0 && oz.heuteAttempts === bugungi,
      orin: {
        gruppe,
        zentrum: { oldin: oz.oldin, hozir: oz.hozir },
      },
      // `bajarildi` faqat ballga qarab: `bosh` kesilgandagina o'qiladi.
      maqsad: {
        ball,
        hozir: oz.heutePunkte,
        bajarildi: oz.heutePunkte >= ball,
        yangiBajarildi: kesdi && !bosh,
      },
      yangiNishonlar,
    };
  }

  /**
   * The end screen's figures are decoration: the lesson is already saved
   * when this runs, so a failure here must not turn the answer into an
   * error (the client would say «Natija saqlanmadi»).
   */
  async seansNatijasiXavfsiz(
    sessionId: string | undefined,
    studentId: number,
    companyId: number,
  ): Promise<SeansNatijasi | null> {
    if (!sessionId) return null;
    try {
      return await this.seansNatijasi(sessionId, studentId, companyId);
    } catch (err) {
      this.logger.warn(
        `Seans natijasi hisoblanmadi (sessionId=${sessionId}, studentId=${studentId}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** `PATCH .../maqsad` — o'quvchi faqat o'zining maqsadini o'zgartiradi. */
  maqsadniOzgartir(
    studentId: number,
    companyId: number,
    daraja: DafDailyGoal,
  ): Promise<MaqsadHolati> {
    return maqsadniSaqla(this.prisma, studentId, companyId, daraja);
  }

  /** `PATCH .../eslatmalar` — S4: o'quvchi faqat o'z eslatmalarini o'zgartiradi. */
  eslatmalarniOzgartir(
    studentId: number,
    companyId: number,
    yoqilgan: boolean,
  ): Promise<{ eslatmalar: boolean }> {
    return eslatmalarniSaqla(this.prisma, studentId, companyId, yoqilgan);
  }

  /** `GET .../nishonlar` — hamma katalog, o'quvchining o'z nishonlari bilan. Yozmaydi. */
  nishonlar(studentId: number, companyId: number): Promise<NishonQatori[]> {
    return nishonlarRoyxati(this.prisma, studentId, companyId, new Date());
  }

  /** `GET .../liga` — o'quvchining xonasi va darajasi (spec S3 §4). Yozmaydi. */
  liga(studentId: number): Promise<LigaJavobi> {
    return ligaJavobi(this.prisma, studentId, new Date());
  }

  /** `GET .../guruhlar` — markazning haftalik guruhlar jadvali (spec S3 §2). Yozmaydi. */
  guruhlar(studentId: number, companyId: number): Promise<GuruhlarJavobi> {
    return guruhlarJavobi(this.prisma, studentId, companyId, new Date());
  }

  async reyting(
    studentId: number,
    companyId: number,
    scope: ReytingQamrovi,
  ): Promise<ReytingZeile[]> {
    const jetzt = new Date();

    if (scope === 'gruppe') {
      return this.gruppeReytingi(studentId, companyId, montagGte(jetzt));
    }
    return this.zentrumReytingi(studentId, companyId, wochenStartTag(jetzt));
  }

  /**
   * Guruh jadvali TO'LIQ: guruh kichik, hammasini yuborish arzon.
   * Nol ballilar ham ko'rinishi kerak — hafta boshida hech kimda ball
   * yo'q, va o'z qatorini topa olmagan o'quvchi tizimni buzuq deb
   * o'ylaydi. Shu sabab ro'yxat guruh a'zolaridan boshlanadi (roster),
   * ballar esa unga chap qo'shiladi (left-join), aksincha emas.
   */
  private async gruppeReytingi(
    studentId: number,
    companyId: number,
    montag: Date,
  ): Promise<ReytingZeile[]> {
    const groupId = await currentGroupId(this.prisma, studentId);
    if (!groupId) return [];

    const { saralangan, azoIdlari } = await this.gruppeHaftaligi(
      groupId,
      companyId,
      montag,
    );
    if (azoIdlari.length === 0) return [];

    return this.qatorlargaAylantir(saralangan, azoIdlari, studentId);
  }

  /**
   * Guruhning haftalik ROSTER asosidagi saralangan ro'yxati — `uebersicht`
   * (o'z o'rnini hisoblash uchun) va `gruppeReytingi` (jadval qurish uchun)
   * IKKALASI HAM shu funksiyani chaqiradi.
   *
   * Ilgari ikkalasi mustaqil hisoblangan edi: `uebersicht` faqat shu hafta
   * kamida bitta urinish qilgan a'zolarni ko'rar edi (`dafAttempt.groupBy`
   * natijasi to'g'ridan-to'g'ri), `gruppeReytingi` esa butun faol rosterni
   * (`enrollment.findMany`) nol ball bilan to'ldirib. Ikkisi FARQLI
   * populyatsiya bo'lgani uchun ikki ekran bir xil o'quvchiga ikki xil
   * o'rin ko'rsatishi mumkin edi — masalan, o'quvchidan kichik id'li,
   * bu hafta mashq qilmagan a'zo faqat rosterda ko'rinadi va teng ballda
   * uni oldinga chiqaradi. To'g'ri populyatsiya ROSTER: nol ballilar ham
   * ko'rinishi kerak bo'lgani uchun ular o'rin hisobida ham qatnashishi
   * shart.
   */
  private async gruppeHaftaligi(
    groupId: string,
    companyId: number,
    montag: Date,
  ): Promise<{ saralangan: HaftalikYigindi[]; azoIdlari: number[] }> {
    const azolar = await this.prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    const azoIdlari = [...new Set(azolar.map((a) => a.studentId))];
    if (azoIdlari.length === 0) {
      return { saralangan: [], azoIdlari: [] };
    }

    // `groupId` yozuv paytida muhrlangan: ball topilgan paytdagi guruhga
    // tegishli, o'quvchining HOZIRGI guruhiga emas. Shu bitta so'rov bilan
    // guruh a'zolari sonidan qat'i nazar N+1 ga tushilmaydi.
    const haftalik = await this.prisma.dafStudentDay.groupBy({
      by: ['studentId'],
      where: { companyId, groupKey: groupId, day: { gte: montag } },
      _sum: { points: true },
    });
    const ballMap = new Map(haftalik.map((h) => [h.studentId, ballOl(h)]));

    const toliqRoyxat: HaftalikYigindi[] = azoIdlari.map((id) => ({
      studentId: id,
      _sum: { points: ballMap.get(id) ?? 0 },
    }));

    return { saralangan: saralaBarqaror(toliqRoyxat), azoIdlari };
  }

  /**
   * O'quvchining O'Z raqamlari BITTA so'rovda — `uebersicht` (chip) va
   * `seansNatijasi` (oldin/hozir) shuni chaqiradi. Har alohida so'rov 50
   * parallel chaqiruvda ulanish navbatiga qaytadan turardi (S1 yuklama
   * sinovi: `uebersicht` 7 so'rovdan 5 taga tushdi).
   *
   * - `punkte`, `hozir` — markazdagi haftalik bal va o'rin. Jadval
   *   (`zentrumReytingi`) bilan bir xil `zentrumHaftaCte` dan o'qiladi.
   *   O'rin = (boshqalar ichida ballari ko'p, yoki teng ball va `studentId`
   *   kichik bo'lganlar soni) + 1 — `row_number() OVER (ORDER BY p DESC,
   *   "studentId")` bilan aynan bir xil, faqat ro'yxatni tashimaydi.
   * - `oldin` — o'quvchining bali `minus` ga kamaytirilgan (0 dan past
   *   emas), boshqalarniki o'sha; `minus = 0` da `oldin === hozir`.
   * - `gesamt` — o'quvchining hamma kunlik qatorlari `SUM(points)`.
   * - `tage` — `attempts > 0` bo'lgan kunlar (`YYYY-MM-DD`), seriya
   *   `serieAus` bilan hisoblanadi (qoida o'zgarmaydi, 06.09 §7). Seriya
   *   "mashq qilingan kun" bo'yicha, "tugatilgan seans" emas: seansni
   *   boshlab tugatmagan o'quvchi ham seriyasini saqlaydi.
   * - `heuteAttempts` — bugungi (Toshkent) urinishlar soni.
   * - `heutePunkte` — bugungi (Toshkent) ball, hamma `groupKey` (kunlik
   *   maqsad, spec S2 1.1).
   * - `dailyGoal` — `DafStudentSetting` dagi tanlov yoki `null`. Shu so'rovga
   *   CTE sifatida qo'shilgan: alohida `findUnique` 50 parallel o'quvchida
   *   ulanish navbatiga yana bir joy olardi.
   * - `eslatmalar`, `telegramUlangan` — S4: `remindersEnabled` (qator yo'q =
   *   true) va kartaning botga ulanganligi; `sozlama` / `ulanish` CTE lari,
   *   alohida so'rov yo'q. `ulanish` `o` CTE sidan OLDIN turadi: oxirgi ikki
   *   bog'langan qiymat hamon `minus`, `heuteTag`.
   *
   * Guruh tomonidagi `gruppeHaftaligi` tuzatishi markazga ham tegishli:
   * mashq qilmagan o'quvchi ham o'rin oladi, va jadvalda ham shu o'rin
   * bilan ko'rinadi (dizayn 6.2).
   */
  private async oquvchiRaqamlari(
    studentId: number,
    companyId: number,
    montagTag: string,
    heuteTag: string,
    minus: number,
  ): Promise<OquvchiRaqamlari> {
    // Bog'langan qiymatlarning OXIRGI ikkitasi `minus`, `heuteTag` bo'lishi
    // shart (soxta `$queryRaw`). O'rin bitta o'tishda (`COUNT FILTER`),
    // korrelyatsiyali subso'rov emas: u reja narxini 228k ga ko'tarib
    // `jit_above_cost` (100k) dan oshirardi va Postgres har chaqiruvda
    // ~20 ms JIT kompilyatsiya qilardi.
    const [satr] = await this.prisma.$queryRaw<OquvchiRaqamlari[]>(
      Prisma.sql`/* oquvchi-raqamlari */
      WITH ${zentrumHaftaCte(companyId, montagTag, studentId)},
      mine AS (
        SELECT day, points, attempts FROM "DafStudentDay"
        WHERE "studentId" = ${studentId}
      ),
      q AS (SELECT "studentId" AS id, p FROM t WHERE "studentId" = ${studentId}),
      sozlama AS (
        SELECT "dailyGoal"::text AS g, "remindersEnabled" AS e FROM "DafStudentSetting"
        WHERE "studentId" = ${studentId}
      ),
      ulanish AS (
        SELECT ("telegramChatId" IS NOT NULL AND "telegramDisconnectedAt" IS NULL) AS u
        FROM "Student" WHERE id = ${studentId}
      ),
      o AS (SELECT id, p, GREATEST(p - ${minus}::int, 0) AS op FROM q),
      r AS (
        SELECT o.p AS punkte,
          1 + (COUNT(*) FILTER (WHERE t."studentId" <> o.id
            AND (t.p > o.p OR (t.p = o.p AND t."studentId" < o.id))))::int AS hozir,
          1 + (COUNT(*) FILTER (WHERE t."studentId" <> o.id
            AND (t.p > o.op OR (t.p = o.op AND t."studentId" < o.id))))::int AS oldin
        FROM t CROSS JOIN o
        GROUP BY o.id, o.p, o.op
      ),
      bugun AS (
        SELECT COALESCE(SUM(points), 0)::int AS p,
               COALESCE(SUM(attempts), 0)::int AS a
        FROM mine WHERE day = ${heuteTag}::date
      )
      SELECT r.punkte, r.hozir, r.oldin,
        (SELECT COALESCE(SUM(points), 0)::int FROM mine) AS gesamt,
        ARRAY(
          SELECT DISTINCT to_char(day, 'YYYY-MM-DD') FROM mine WHERE attempts > 0
        ) AS tage,
        (SELECT a FROM bugun) AS "heuteAttempts",
        (SELECT p FROM bugun) AS "heutePunkte",
        (SELECT g FROM sozlama) AS "dailyGoal",
        COALESCE((SELECT e FROM sozlama), true) AS eslatmalar,
        COALESCE((SELECT u FROM ulanish), false) AS "telegramUlangan"
      FROM r`,
    );
    return satr;
  }

  /**
   * MARKAZ JADVALI FILIALGA CHEKLANMAYDI — bu ataylab qilingan istisno.
   *
   * Bu repoda deyarli hamma narsa filialga qulflangan
   * (`branch-route-policy` manifesti, `narrowPayrollScope` va boshqalar).
   * O'quvchilar reytingi shundan chiqariladi: CEO 2026-09-06 da reyting
   * butun markaz bo'yicha bo'lsin dedi. Natijasi ochiq: Namangandagi
   * o'quvchi Farg'onadagi o'quvchining to'liq ismini ko'radi.
   *
   * Buni "xato" deb tuzatmang — qaror hujjatda
   * (`docs/superpowers/specs/2026-09-06-ball-va-yol-design.md`, 6.1).
   *
   * Markaz jadvalining qatorlari.
   *
   * Ro'yxat markazning TO'LIQ ro'yxati emas — TOP 50 + o'quvchining o'z
   * qatori. Markazda yuzlab o'quvchi bor va hammasini har so'rovda
   * yuborish sahifani sekinlashtiradi.
   *
   * QO'SHIB QO'YILGAN O'Z QATORI QAYTA RAQAMLANMAYDI — u to'liq
   * saralangan ro'yxatdagi HAQIQIY o'rnini saqlaydi (`platz` to'liq
   * ro'yxatdan olinadi, `slice`dan keyin emas). Buni o'zgartirish oson
   * unutiladigan xato: "TOP 50 + 1" deb 51 qilib qayta yozilsa,
   * o'quvchining haqiqiy o'rni (masalan 137) yo'qoladi va u o'zini
   * borganidan ancha yuqorida deb o'ylab qoladi.
   */
  private async zentrumReytingi(
    studentId: number,
    companyId: number,
    montagTag: string,
  ): Promise<ReytingZeile[]> {
    // `platz` to'liq ro'yxat ustidagi `row_number()` — o'z qatori TOP 50
    // dan tashqarida bo'lsa ham haqiqiy o'rni bilan keladi. Chegara OXIRGI
    // bog'langan qiymat bo'lishi shart (soxta `$queryRaw`).
    const qatorlar = await this.prisma.$queryRaw<
      { studentId: number; punkte: number; platz: number }[]
    >(Prisma.sql`/* zentrum-top */
      WITH ${zentrumHaftaCte(companyId, montagTag, studentId)},
      r AS (
        SELECT "studentId", p,
               row_number() OVER (ORDER BY p DESC, "studentId") AS platz
        FROM t
      )
      SELECT "studentId", p AS punkte, platz::int AS platz
      FROM r
      WHERE "studentId" = ${studentId} OR platz <= ${ZENTRUM_TOP_CHEGARA}
      ORDER BY platz`);

    const idlar = qatorlar.map((q) => q.studentId);
    const talabalar = await this.prisma.student.findMany({
      where: { id: { in: idlar } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nomMap = new Map(talabalar.map((t) => [t.id, reytingIsmi(t)]));

    return qatorlar.map((q) => ({
      studentId: q.studentId,
      name: nomMap.get(q.studentId) ?? '',
      punkte: q.punkte,
      platz: q.platz,
      selbst: q.studentId === studentId,
    }));
  }

  private async qatorlargaAylantir(
    saralangan: HaftalikYigindi[],
    idlar: number[],
    studentId: number,
  ): Promise<ReytingZeile[]> {
    const talabalar = await this.prisma.student.findMany({
      where: { id: { in: idlar } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nomMap = new Map(talabalar.map((t) => [t.id, reytingIsmi(t)]));

    return saralangan.map((s, i) => ({
      studentId: s.studentId,
      name: nomMap.get(s.studentId) ?? '',
      punkte: ballOl(s),
      platz: i + 1,
      selbst: s.studentId === studentId,
    }));
  }
}
