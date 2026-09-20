import { Injectable } from '@nestjs/common';
import { tashkentDayStartUtc } from '../../common/date/tashkent';
import {
  isEmptyScope,
  ReportBranchIds,
  studentBranchWhere,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
} from '../../students/shared/active-student-where';
import { AppActivityStatsQueries } from '../app-activity-stats.queries';
import {
  holat,
  kerakliKunlar,
  Norma,
  normaniOqi,
  STANDART_NORMA,
} from '../norma/norma';
import { guruhDarajasi, JoriyDaraja, joriyDaraja } from '../stats/daraja';
import { Davr, davrOynasi } from '../stats/davr';
import { guruhla } from '../stats/kunlik-faollik';
import { foizi } from '../stats/mashq-natijasi';
import { CenterAppActivityQueries } from './center-app-activity.queries';
import {
  GuruhAzoligi,
  MarkazFilialQatori,
  MarkazOquvchilar,
  MarkazOquvchiQatori,
  MarkazTelefonlar,
  MarkazUmumiy,
  OquvchiHisobi,
  TELEFON_CHEGARASI,
} from './center-app-activity.types';
import {
  filtrla,
  filtrVariantlari,
  korsatiladiganGuruh,
  OquvchilarSorovi,
  sahifala,
  sarala,
} from './markaz-royxat';
import { oquvchiSurati } from './markaz-surati';

/** Trend va xarita har doim 30 kun (dizayn 5.3). */
const XARITA_KUNLARI = 30;

interface Yigindi {
  norma: Norma;
  bugun: string;
  kuzatuvBoshi: string | null;
  kunlar30: string[];
  hisoblar: OquvchiHisobi[];
}

/**
 * Markaz bo'yicha ilova faolligi (dizayn 9.3). So'rovlar soni o'quvchilar
 * sonidan qat'i nazar doimiy: norma, populyatsiya (Prisma —
 * `activeStudentWhere()`, ADR-0015), kuzatuv boshi, to'rt xom yig'indi,
 * oxirgi faollik — keyin hamma qaror TypeScript da. Kurs ustuni faqat
 * sahifadagi qatorlar uchun (uch qo'shimcha so'rov).
 *
 * Filial: `scope` `@BranchScope()` dan keladi (sarlavhadagi tanlov ∩ ruxsat).
 * `[]` — hech narsa (fail-closed, ADR-0002): bazaga so'rov ketmaydi.
 */
@Injectable()
export class CenterAppActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: CenterAppActivityQueries,
    private readonly umumiyQueries: AppActivityStatsQueries,
  ) {}

  async umumiy(
    companyId: number,
    scope: ReportBranchIds,
    davr: Davr,
    now: Date,
  ): Promise<MarkazUmumiy> {
    const y = await this.yig(companyId, scope, davr, now);
    const kirganlar = y.hisoblar.filter((h) => h.kirdi);
    const savollar = jam(y.hisoblar, (h) => h.savollar);
    const togri = jam(y.hisoblar, (h) => h.togri);
    const yashillar = y.hisoblar.filter((h) => h.holat === 'YASHIL').length;
    const kartalar = {
      oquvchilar: y.hisoblar.length,
      akkauntlar: y.hisoblar.filter((h) => h.akkaunt).length,
      birMartaKirganlar: y.hisoblar.filter((h) => h.akkaunt && !h.hechKirmagan)
        .length,
      davrdaKirganlar: kirganlar.length,
      yashillar,
      // Filiallar jadvali (`filialQatorlari`, pastda) bilan bitta ta'rif —
      // brauzer bu nisbatni o'zi qayta hisoblamaydi (I3/I4).
      normaFoiz: foizi(yashillar, y.hisoblar.length),
      // Butun tanlangan davr kuzatilgan o'quvchi uchun yashil chegara —
      // kartaning tooltipi shu sonni ko'rsatadi (I3). Har bir qatorning o'z
      // `kerakliKun`i o'z `maxraj`idan chiqadi (`markaz-royxat.ts`); bu yerdagi
      // `davr` esa maxrajning YUQORI chegarasi (7 yoki 30) — «kechroq
      // qo'shilganlar kam talab qilinadi» aynan shu tafovutdan ko'rinadi.
      kerakliKun: kerakliKunlar(davr, y.norma).kerakliKun,
      // O'rtachalar davrda kirganlar orasida — nollar o'rtachani yutmasin
      // (guruh tabi ham shunday, dizayn 5.1).
      ortachaFaolKunHaftada: ortacha(
        kirganlar,
        (h) => (h.faolKun / h.maxraj) * 7,
        1,
      ),
      ortachaKunlikSoniya: ortacha(
        kirganlar,
        (h) => h.lernenSoniya / h.maxraj,
        0,
      ),
      savollar,
      togri,
      foiz: foizi(togri, savollar),
      tugatilganDarslar: jam(y.hisoblar, (h) => h.tugatilganDarslar),
    };
    return {
      davr,
      bugun: y.bugun,
      kuzatuvBoshi: y.kuzatuvBoshi,
      norma: y.norma,
      kartalar,
      voronka: {
        faolOquvchi: kartalar.oquvchilar,
        akkauntiBor: kartalar.akkauntlar,
        birMartaKirgan: kartalar.birMartaKirganlar,
        davrdaKirgan: kartalar.davrdaKirganlar,
        normaniBajargan: kartalar.yashillar,
      },
      // Hamma o'quvchining kun30 bir xil 30 sanani qamraydi (davrOynasi kunlari
      // faqat `now` ga bog'liq), shuning uchun indeks bo'yicha yig'sa bo'ladi.
      trend: y.kunlar30.map((sana, i) => ({
        sana,
        kirganlar: y.hisoblar.filter((h) => h.kun30[i]?.kirdi).length,
        faollar: y.hisoblar.filter((h) => h.kun30[i]?.shugullangan).length,
      })),
      filiallar: scope === null ? filialQatorlari(y.hisoblar) : [],
    };
  }

  async oquvchilar(
    companyId: number,
    scope: ReportBranchIds,
    sorov: OquvchilarSorovi,
    now: Date,
  ): Promise<MarkazOquvchilar> {
    const y = await this.yig(companyId, scope, sorov.davr, now);
    const tanlangan = sarala(filtrla(y.hisoblar, sorov), sorov.sort, sorov.dir);
    const s = sahifala(tanlangan, sorov.page, sorov.pageSize);
    const kurslar = await this.kurslar(s.qatorlar, sorov.groupId);
    return {
      davr: sorov.davr,
      bugun: y.bugun,
      kuzatuvBoshi: y.kuzatuvBoshi,
      norma: y.norma,
      jami: s.jami,
      sahifa: s.sahifa,
      sahifaHajmi: sorov.pageSize,
      qatorlar: s.qatorlar.map((h) =>
        qator(h, sorov.groupId, kurslar.get(h.studentId) ?? null),
      ),
      filtrVariantlari: filtrVariantlari(y.hisoblar),
      filialUstuni: scope === null,
    };
  }

  async telefonlar(
    companyId: number,
    scope: ReportBranchIds,
    sorov: OquvchilarSorovi,
    now: Date,
  ): Promise<MarkazTelefonlar> {
    const y = await this.yig(companyId, scope, sorov.davr, now);
    const tanlangan = sarala(filtrla(y.hisoblar, sorov), sorov.sort, sorov.dir);
    return {
      jami: tanlangan.length,
      qisqartirildi: tanlangan.length > TELEFON_CHEGARASI,
      qatorlar: tanlangan.slice(0, TELEFON_CHEGARASI).map((h) => ({
        ism: h.ism,
        guruh: korsatiladiganGuruh(h, sorov.groupId)?.nomi ?? null,
        telefon: h.telefon,
        otaOnaTelefoni: h.otaOnaTelefoni,
      })),
    };
  }

  /** Kurs ustuni — guruh tabi bilan bir xil manba, faqat sahifadagi o'quvchilar. */
  private async kurslar(
    qatorlar: OquvchiHisobi[],
    groupId?: string,
  ): Promise<Map<number, JoriyDaraja>> {
    if (qatorlar.length === 0) return new Map();
    const ids = qatorlar.map((h) => h.studentId);
    const [jami, tugatilganlar, oxirgiDarajalar] = await Promise.all([
      this.umumiyQueries.kursJamisi(),
      this.umumiyQueries.tugatilganDarslar(ids),
      this.umumiyQueries.oxirgiDarsDarajalari(ids),
    ]);
    return new Map(
      qatorlar.map((h) => [
        h.studentId,
        joriyDaraja({
          oxirgiDarsDarajasi: oxirgiDarajalar.get(h.studentId) ?? null,
          guruhDarajasi: korsatiladiganGuruh(h, groupId)?.daraja ?? null,
          tugatilgan: tugatilganlar.get(h.studentId) ?? {},
          jami,
        }),
      ]),
    );
  }

  private async yig(
    companyId: number,
    scope: ReportBranchIds,
    davr: Davr,
    now: Date,
  ): Promise<Yigindi> {
    const bosh30 = davrOynasi(XARITA_KUNLARI, now, now, null);
    const boshDavr = davrOynasi(davr, now, now, null);

    // Bo'sh qamrov tekshiruvi normani o'qishdan ham OLDIN turadi (ADR-0002).
    // O'qiladigan narsa filialga bog'liq bo'lmagan kompaniya sozlamasi, ya'ni
    // hech narsa sizmaydi — lekin bu klassning o'z shartnomasi «bazaga so'rov
    // ketmaydi» deydi, va yarim bajarilgan va'da keyingi o'quvchini adashtiradi.
    // Javobda standart norma qaytadi: ekranda rang beradigan o'quvchi yo'q.
    if (isEmptyScope(scope)) {
      return {
        norma: STANDART_NORMA,
        bugun: bosh30.bugun,
        kuzatuvBoshi: null,
        kunlar30: bosh30.kunlar,
        hisoblar: [],
      };
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        dafKunlikDaqiqa: true,
        dafKunlikSavol: true,
        dafHaftalikKun: true,
        dafSariqKun: true,
      },
    });
    const norma = company ? normaniOqi(company) : STANDART_NORMA;
    const bosh: Yigindi = {
      norma,
      bugun: bosh30.bugun,
      kuzatuvBoshi: null,
      kunlar30: bosh30.kunlar,
      hisoblar: [],
    };

    const [oquvchilar, kuzatuvBoshi] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...activeStudentWhere(),
          ...studentBranchWhere(scope),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photo: true,
          phone: true,
          parentPhone: true,
          createdAt: true,
          user: { select: { createdAt: true } },
          branches: {
            select: { branch: { select: { id: true, name: true } } },
            take: 1,
          },
          enrollments: {
            where: ACTIVE_ENROLLMENT_WHERE,
            select: {
              startDate: true,
              createdAt: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                  teachers: {
                    select: {
                      teacher: {
                        select: { id: true, firstName: true, lastName: true },
                      },
                    },
                    orderBy: { teacherId: 'asc' },
                  },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
      this.umumiyQueries.kuzatuvBoshi(companyId),
    ]);
    if (oquvchilar.length === 0) return { ...bosh, kuzatuvBoshi };
    const ids = oquvchilar.map((s) => s.id);

    const [seanslar, savollar, umumanKirganlar, darslar, oxirgilar] =
      await Promise.all([
        this.queries.kunlikSeanslar(
          companyId,
          ids,
          bosh30.davrBoshi,
          bosh30.bugun,
        ),
        this.queries.kunlikSavollar(
          companyId,
          ids,
          tashkentDayStartUtc(bosh30.davrBoshi),
        ),
        this.queries.umumanKirganlar(companyId, ids),
        this.queries.tugatilganDarsSoni(
          companyId,
          ids,
          tashkentDayStartUtc(boshDavr.davrBoshi),
        ),
        this.umumiyQueries.oxirgiFaolliklar(ids),
      ]);
    const seansMap = guruhla(seanslar, (r) => r.studentId);
    const savolMap = guruhla(savollar, (r) => r.studentId);

    const hisoblar = oquvchilar.map((s): OquvchiHisobi => {
      const akkaunt = s.user !== null;
      const akkauntKuni = s.user?.createdAt ?? s.createdAt;
      const oyna = davrOynasi(davr, now, akkauntKuni, kuzatuvBoshi);
      const surat = oquvchiSurati(
        oyna,
        seansMap.get(s.id) ?? [],
        savolMap.get(s.id) ?? [],
        norma,
      );
      const surat30 =
        davr === XARITA_KUNLARI
          ? surat
          : oquvchiSurati(
              davrOynasi(XARITA_KUNLARI, now, akkauntKuni, kuzatuvBoshi),
              seansMap.get(s.id) ?? [],
              savolMap.get(s.id) ?? [],
              norma,
            );
      const hechKirmagan = akkaunt && !umumanKirganlar.has(s.id);
      return {
        studentId: s.id,
        ism: `${s.firstName} ${s.lastName}`.trim(),
        photo: s.photo,
        telefon: s.phone,
        otaOnaTelefoni: s.parentPhone,
        akkaunt,
        hechKirmagan,
        kirdi: surat.kirdi,
        holat: holat(
          {
            akkaunt,
            hechKirmagan,
            faolKun: surat.faolKun,
            maxraj: oyna.maxraj,
          },
          norma,
        ),
        faolKun: surat.faolKun,
        maxraj: oyna.maxraj,
        hisobBoshi: oyna.hisobBoshi,
        ...kerakliKunlar(oyna.maxraj, norma),
        kunlar: surat.kunlar,
        kun30: surat30.kunlar,
        lernenSoniya: surat.lernenSoniya,
        savollar: surat.savollar,
        togri: surat.togri,
        foiz: foizi(surat.togri, surat.savollar),
        tugatilganDarslar: darslar.get(s.id) ?? 0,
        oxirgiFaollik: oxirgilar.get(s.id) ?? null,
        guruhlar: s.enrollments
          .map(
            (e): GuruhAzoligi => ({
              id: e.group.id,
              nomi: e.group.name,
              daraja: guruhDarajasi(e.group.level),
              boshlanish: (e.startDate ?? e.createdAt).toISOString(),
              oqituvchilar: e.group.teachers.map((t) => ({
                id: t.teacher.id,
                ism: `${t.teacher.firstName} ${t.teacher.lastName}`.trim(),
              })),
            }),
          )
          .sort((a, b) => a.boshlanish.localeCompare(b.boshlanish)),
        filial: s.branches[0]
          ? { id: s.branches[0].branch.id, nomi: s.branches[0].branch.name }
          : null,
      };
    });

    return {
      norma,
      bugun: bosh30.bugun,
      kuzatuvBoshi,
      kunlar30: bosh30.kunlar,
      hisoblar,
    };
  }
}

function jam<T>(r: T[], f: (x: T) => number): number {
  return r.reduce((j, x) => j + f(x), 0);
}

function ortacha<T>(r: T[], f: (x: T) => number, kasr: number): number | null {
  if (r.length === 0) return null;
  const k = 10 ** kasr;
  return Math.round((jam(r, f) / r.length) * k) / k;
}

function qator(
  h: OquvchiHisobi,
  groupId: string | undefined,
  kurs: JoriyDaraja | null,
): MarkazOquvchiQatori {
  const g = korsatiladiganGuruh(h, groupId);
  return {
    studentId: h.studentId,
    ism: h.ism,
    photo: h.photo,
    guruh: g ? { id: g.id, nomi: g.nomi, daraja: g.daraja } : null,
    oqituvchi: g?.oqituvchilar[0] ?? null,
    filial: h.filial,
    akkaunt: h.akkaunt,
    hechKirmagan: h.hechKirmagan,
    kirdi: h.kirdi,
    holat: h.holat,
    faolKun: h.faolKun,
    maxraj: h.maxraj,
    hisobBoshi: h.hisobBoshi,
    kerakliKun: h.kerakliKun,
    sariqKerak: h.sariqKerak,
    kunlar: h.kunlar,
    lernenSoniya: h.lernenSoniya,
    ortachaKunlikSoniya: Math.round(h.lernenSoniya / h.maxraj),
    savollar: h.savollar,
    togri: h.togri,
    foiz: h.foiz,
    oxirgiFaollik: h.oxirgiFaollik,
    kurs,
  };
}

/** Filiallar jadvali (dizayn 5.4) — o'quvchining `StudentBranch` filiali bo'yicha. */
function filialQatorlari(hisoblar: OquvchiHisobi[]): MarkazFilialQatori[] {
  const guruhlar = new Map<number, { nomi: string; royxat: OquvchiHisobi[] }>();
  for (const h of hisoblar) {
    const kalit = h.filial?.id ?? 0;
    const g = guruhlar.get(kalit) ?? {
      nomi: h.filial?.nomi ?? 'Filialsiz',
      royxat: [],
    };
    g.royxat.push(h);
    guruhlar.set(kalit, g);
  }
  return [...guruhlar]
    .map(([branchId, g]): MarkazFilialQatori => {
      const kirganlar = g.royxat.filter((h) => h.kirdi);
      const savollar = jam(g.royxat, (h) => h.savollar);
      const togri = jam(g.royxat, (h) => h.togri);
      return {
        branchId,
        nomi: g.nomi,
        oquvchilar: g.royxat.length,
        qamrovFoiz: foizi(
          g.royxat.filter((h) => h.akkaunt && !h.hechKirmagan).length,
          g.royxat.length,
        ),
        normaFoiz: foizi(
          g.royxat.filter((h) => h.holat === 'YASHIL').length,
          g.royxat.length,
        ),
        ortachaFaolKunHaftada: ortacha(
          kirganlar,
          (h) => (h.faolKun / h.maxraj) * 7,
          1,
        ),
        foiz: foizi(togri, savollar),
        tugatilganDarslar: jam(g.royxat, (h) => h.tugatilganDarslar),
      };
    })
    .sort((a, b) => b.oquvchilar - a.oquvchilar);
}
