import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { currentGroupId } from '../shared/student-scope';
import {
  serieAus,
  stufeFuer,
  wochenStartTag,
  wochenStartUtc,
} from '../uebung/punkte';

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
}

export type ReytingQamrovi = 'gruppe' | 'zentrum';

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

/** A `@db.Date` value is UTC midnight of its calendar day. */
function tagStr(day: Date): string {
  return day.toISOString().slice(0, 10);
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
 * So'ragan o'quvchining o'z qatori ro'yxatda bo'lmasa (bu hafta hali
 * mashq qilmagan), nol ball bilan qo'shib beradi — aks holda o'z o'rnini
 * hech qachon hisoblab bo'lmaydi.
 */
function oʻziniQoshib(
  royxat: HaftalikYigindi[],
  studentId: number,
): HaftalikYigindi[] {
  if (royxat.some((s) => s.studentId === studentId)) return royxat;
  return [...royxat, { studentId, _sum: { points: 0 } }];
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
    const heute = tashkentDateStr(new Date());
    const [jamiy, serie, groupId, faelligeWoerter] = await Promise.all([
      this.prisma.dafStudentDay.aggregate({
        where: { studentId },
        _sum: { points: true },
      }),
      this.serieFuer(studentId, heute),
      currentGroupId(this.prisma, studentId),
      // `uebung.wiederholung()` bilan BIR XIL predikat (`dueAt <= hozir`)
      // — bu shu o'quvchi uchun so'ragan `student`ga tegishli qatorlar
      // ustida ishlaydi, deyarli bepul (`DafLexemeState` studentId bo'yicha
      // indekslangan).
      this.prisma.dafLexemeState.count({
        where: { studentId, dueAt: { lte: new Date() } },
      } as any),
    ]);

    const gesamt = jamiy._sum.points ?? 0;
    const { jetzt, naechste } = stufeFuer(gesamt);

    const montag = montagGte(new Date());

    // Markaz o'rni `zentrumHaftaligi` orqali hisoblanadi — xuddi shu
    // funksiya `reyting('zentrum')` jadvalini quradi. Guruh uchun
    // qilingan tuzatish (pastdagi izohga qarang) markazga tegishli emas
    // edi: `zentrumReytingi` o'z qatorini FAQAT o'quvchi shu hafta
    // urinish qilgan bo'lsa qo'shar edi, shuning uchun dushanba ertalab
    // chip "1-o'rin" deb, Markaz jadvali esa "hech kim ball yig'magan"
    // deb ikkitasi bir vaqtda ikki xil javob berardi.
    const zentrumSaralangan = await this.zentrumHaftaligi(
      studentId,
      companyId,
      montag,
    );
    const wochePunkte =
      zentrumSaralangan.find((s) => s.studentId === studentId)?._sum.points ??
      0;
    const wochePlatzZentrum = platziniTop(zentrumSaralangan, studentId);

    // Guruh o'rni `gruppeHaftaligi` orqali hisoblanadi — xuddi shu funksiya
    // `reyting('gruppe')` jadvalini quradi. Bitta joyda hisoblanmasa, ikki
    // ekran bir xil savolga ikki xil javob berishi mumkin edi: bu haqiqiy
    // xato bo'lib topilgan (mashq qilmagan a'zo o'z o'rnini past ko'rsatgan
    // — "shu hafta mashq qilganlar" populyatsiyasi bilan hisoblangan
    // eski versiya butun rosterni emas, faqat urinish qilganlarni ko'rgan).
    let wochePlatzGruppe: number | null = null;
    if (groupId) {
      const { saralangan } = await this.gruppeHaftaligi(
        groupId,
        companyId,
        montag,
      );
      if (saralangan.length > 0) {
        wochePlatzGruppe = platziniTop(saralangan, studentId);
      }
    }

    return {
      gesamt,
      stufe: { de: jetzt.de, uz: jetzt.uz, ab: jetzt.ab },
      naechsteStufe: naechste
        ? { de: naechste.de, uz: naechste.uz, ab: naechste.ab }
        : null,
      serie,
      wochePunkte,
      wochePlatzGruppe,
      wochePlatzZentrum,
      faelligeWoerter,
    };
  }

  /**
   * Days with at least one attempt — the streak rule is unchanged
   * (06.09 design §7). At most one row per day per group, so this stays
   * small however many answers the student gave.
   *
   * Seriya "mashq qilingan kun" bo'yicha sanaladi, "tugatilgan seans"
   * emas: `DafLessonProgress.completedAt` har o'tishda ustiga yoziladi va
   * tarix qolmaydi, urinishlar esa qoladi. Bu yumshoqroq — seansni
   * boshlab tugatmagan o'quvchi ham seriyasini saqlaydi, "jazolamaslik"
   * qaroriga mos.
   */
  private async serieFuer(studentId: number, heute: string): Promise<number> {
    const kunlar = await this.prisma.dafStudentDay.findMany({
      where: { studentId, attempts: { gt: 0 } },
      select: { day: true },
      distinct: ['day'],
    });
    return serieAus(
      kunlar.map((k) => tagStr(k.day)),
      heute,
    );
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

    const [urinishlar, bugun, groupId, serie, zentrum] = await Promise.all([
      this.prisma.dafAttempt.findMany({
        where: { sessionId, studentId },
        select: { points: true, createdAt: true, groupId: true },
      }),
      this.prisma.dafStudentDay.aggregate({
        where: { studentId, day: utcMidnightFromDateStr(heute) },
        _sum: { attempts: true },
      }),
      currentGroupId(this.prisma, studentId),
      this.serieFuer(studentId, heute),
      this.zentrumHaftaligi(studentId, companyId, montag),
    ]);

    const sum = (xs: { points: number }[]) =>
      xs.reduce((s, x) => s + x.points, 0);
    const shuHafta = urinishlar.filter((u) => u.createdAt >= montagUtc);
    const bugungi = urinishlar.filter(
      (u) => tashkentDateStr(u.createdAt) === heute,
    ).length;

    const zentrumOldin = saralaBarqaror(
      ayir(zentrum, studentId, sum(shuHafta)),
    );

    let gruppe: SeansNatijasi['orin']['gruppe'] = null;
    if (groupId) {
      const { saralangan } = await this.gruppeHaftaligi(
        groupId,
        companyId,
        montag,
      );
      if (saralangan.length > 0) {
        const minus = sum(shuHafta.filter((u) => u.groupId === groupId));
        gruppe = {
          oldin: platziniTop(
            saralaBarqaror(ayir(saralangan, studentId, minus)),
            studentId,
          ),
          hozir: platziniTop(saralangan, studentId),
        };
      }
    }

    return {
      punkte: sum(urinishlar),
      serie,
      serieYangi: bugungi > 0 && (bugun._sum.attempts ?? 0) === bugungi,
      orin: {
        gruppe,
        zentrum: {
          oldin: platziniTop(zentrumOldin, studentId),
          hozir: platziniTop(zentrum, studentId),
        },
      },
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

  async reyting(
    studentId: number,
    companyId: number,
    scope: ReytingQamrovi,
  ): Promise<ReytingZeile[]> {
    const montag = montagGte(new Date());

    if (scope === 'gruppe') {
      return this.gruppeReytingi(studentId, companyId, montag);
    }
    return this.zentrumReytingi(studentId, companyId, montag);
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
   */
  /**
   * Markazning haftalik saralangan ro'yxati (o'quvchining O'Z qatori
   * MAJBURIY qo'shilgan, hatto nol ball bilan) — `uebersicht` (o'z
   * o'rnini hisoblash uchun) va `zentrumReytingi` (jadval qurish uchun)
   * IKKALASI HAM shu funksiyani chaqiradi.
   *
   * Guruh tomonida xuddi shu nomdagi `gruppeHaftaligi` bilan qilingan
   * tuzatish shu yerga ham ko'chirildi: ilgari `zentrumReytingi` o'z
   * qatorini FAQAT `top`da bo'lmasa VA topilsa qo'shar edi — `groupBy`
   * natijasida esa hech qachon mashq qilmagan o'quvchi umuman yo'q edi.
   * Natijada `uebersicht`ning chipi (bu funksiya orqali) o'quvchini "1-
   * o'rin" deb ko'rsatardi, `reyting('zentrum')` esa uni umuman
   * qatorlarda ko'rsatmasdi — ikki ekran bitta o'quvchiga ikki xil javob
   * berardi (dizayn 6.2: har bir o'quvchi ikkalasida ham bo'lishi shart).
   */
  private async zentrumHaftaligi(
    studentId: number,
    companyId: number,
    montag: Date,
  ): Promise<HaftalikYigindi[]> {
    const haftalik = await this.prisma.dafStudentDay.groupBy({
      by: ['studentId'],
      where: { companyId, day: { gte: montag } },
      _sum: { points: true },
    });
    return saralaBarqaror(oʻziniQoshib(haftalik, studentId));
  }

  /**
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
    montag: Date,
  ): Promise<ReytingZeile[]> {
    const saralangan = await this.zentrumHaftaligi(
      studentId,
      companyId,
      montag,
    );
    const darajali = saralangan.map((s, i) => ({
      studentId: s.studentId,
      punkte: ballOl(s),
      platz: i + 1,
    }));

    const top = darajali.slice(0, ZENTRUM_TOP_CHEGARA);
    const oʻzi = darajali.find((d) => d.studentId === studentId);
    const qatorlar =
      oʻzi && !top.some((d) => d.studentId === studentId)
        ? [...top, oʻzi]
        : top;

    const idlar = qatorlar.map((q) => q.studentId);
    const talabalar = await this.prisma.student.findMany({
      where: { id: { in: idlar } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nomMap = new Map(
      talabalar.map((t) => [t.id, `${t.firstName} ${t.lastName}`]),
    );

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
    const nomMap = new Map(
      talabalar.map((t) => [t.id, `${t.firstName} ${t.lastName}`]),
    );

    return saralangan.map((s, i) => ({
      studentId: s.studentId,
      name: nomMap.get(s.studentId) ?? '',
      punkte: ballOl(s),
      platz: i + 1,
      selbst: s.studentId === studentId,
    }));
  }
}
