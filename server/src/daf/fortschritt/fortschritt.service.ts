import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { tashkentDateStr } from '../../attendance/shared/date-utils';
import { currentGroupId } from '../shared/student-scope';
import { serieAus, stufeFuer, wochenStartUtc } from '../uebung/punkte';

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

export type ReytingQamrovi = 'gruppe' | 'zentrum';

/** Haftalik jadvaldan qaytadigan bitta qatorning umumlashgan shakli. */
interface HaftalikYigindi {
  studentId: number;
  _sum: { points: number | null };
}

/** Markaz jadvalida TO'LIQ ko'rsatiladigan yuqori qatorlar soni — undan
 * pastdagilar faqat o'z qatori sifatida (haqiqiy o'rni bilan) qo'shiladi. */
const ZENTRUM_TOP_CHEGARA = 50;

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

@Injectable()
export class FortschrittService {
  constructor(private readonly prisma: PrismaService) {}

  async uebersicht(studentId: number, companyId: number): Promise<Fortschritt> {
    const [jamiy, urinishlar, groupId, faelligeWoerter] = await Promise.all([
      this.prisma.dafAttempt.aggregate({
        where: { studentId },
        _sum: { points: true },
      }),
      // Butun tarix o'qiladi — `serieAus` yig'ilgan sanalar to'plamiga
      // qarab hisoblaydi, haftalik oynaga qamalmaydi.
      this.prisma.dafAttempt.findMany({
        where: { studentId },
        select: { createdAt: true },
      }),
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

    const heute = tashkentDateStr(new Date());
    // Seriya "mashq qilingan kun" bo'yicha sanaladi, "tugatilgan seans"
    // emas: `DafLessonProgress.completedAt` har o'tishda ustiga yoziladi va
    // tarix qolmaydi, urinishlar esa qoladi. Bu yumshoqroq — seansni
    // boshlab tugatmagan o'quvchi ham seriyasini saqlaydi, "jazolamaslik"
    // qaroriga mos.
    const kunlar = urinishlar.map((u) => tashkentDateStr(u.createdAt));
    const serie = serieAus(kunlar, heute);

    const wochenStart = wochenStartUtc(new Date());

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
      wochenStart,
    );
    const wochePunkte =
      zentrumSaralangan.find((s) => s.studentId === studentId)?._sum
        .points ?? 0;
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
        wochenStart,
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

  async reyting(
    studentId: number,
    companyId: number,
    scope: ReytingQamrovi,
  ): Promise<ReytingZeile[]> {
    const wochenStart = wochenStartUtc(new Date());

    if (scope === 'gruppe') {
      return this.gruppeReytingi(studentId, companyId, wochenStart);
    }
    return this.zentrumReytingi(studentId, companyId, wochenStart);
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
    wochenStart: Date,
  ): Promise<ReytingZeile[]> {
    const groupId = await currentGroupId(this.prisma, studentId);
    if (!groupId) return [];

    const { saralangan, azoIdlari } = await this.gruppeHaftaligi(
      groupId,
      companyId,
      wochenStart,
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
    wochenStart: Date,
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
    const haftalik = await this.prisma.dafAttempt.groupBy({
      by: ['studentId'],
      where: { companyId, groupId, createdAt: { gte: wochenStart } },
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
    wochenStart: Date,
  ): Promise<HaftalikYigindi[]> {
    const haftalik = await this.prisma.dafAttempt.groupBy({
      by: ['studentId'],
      where: { companyId, createdAt: { gte: wochenStart } },
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
    wochenStart: Date,
  ): Promise<ReytingZeile[]> {
    const saralangan = await this.zentrumHaftaligi(
      studentId,
      companyId,
      wochenStart,
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
