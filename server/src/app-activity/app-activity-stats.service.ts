import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { FortschrittService } from '../daf/fortschritt/fortschritt.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  GuruhFaolligi,
  GuruhOquvchiQatori,
  GuruhQiyinElement,
  OquvchiFaolligi,
  OxirgiFaollik,
} from './app-activity-stats.types';
import {
  Daraja,
  darajaQatorlari,
  guruhDarajasi,
  joriyDaraja,
} from './stats/daraja';
import { Davr, davrOynasi } from './stats/davr';
import { davrSurati } from './stats/davr-surati';
import { dayStr, Platforma, SeansSatri } from './stats/kunlik-faollik';
import { foizi, MashqUrinishi } from './stats/mashq-natijasi';
import { ElementAgregati, qiyinElementlar } from './stats/qiyin-elementlar';

const XARITA_KUNLARI = 30;

const seansSelect = {
  studentId: true,
  day: true,
  firstSeenAt: true,
  lastSeenAt: true,
  activeSeconds: true,
  radioSeconds: true,
  platform: true,
  sections: true,
} as const;

const urinishSelect = {
  studentId: true,
  createdAt: true,
  sessionId: true,
  questionIndex: true,
  attemptNo: true,
  format: true,
  score: true,
  gradingStatus: true,
} as const;

type Sonlar = Partial<Record<Daraja, number>>;

/**
 * Ilova faolligi statistikasi (dizayn 6). Guruh endpointi o'quvchilar soniga
 * bog'liq bo'lmagan, o'zgarmas sondagi so'rov bilan ishlaydi — o'quvchi
 * bo'yicha sikl ichida so'rov YO'Q (dizayn 6.6, test qayd etadi).
 */
@Injectable()
export class AppActivityStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fortschritt: FortschrittService,
  ) {}

  async guruhAzosiEkaniniTekshir(
    groupId: string,
    studentId: number,
  ): Promise<void> {
    const azo = await this.prisma.enrollment.findFirst({
      where: { groupId, studentId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!azo)
      throw new NotFoundException("O'quvchi bu guruhning faol a'zosi emas");
  }

  async guruhFaolligi(
    groupId: string,
    companyId: number,
    davr: Davr,
    now: Date,
  ): Promise<GuruhFaolligi> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: { level: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const gDaraja = guruhDarajasi(group.level);

    const [azolar, kuzatuvBoshi] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { groupId, status: 'ACTIVE', deletedAt: null },
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              createdAt: true,
              user: { select: { createdAt: true } },
            },
          },
        },
      }),
      this.kuzatuvBoshi(companyId),
    ]);
    const oquvchilarXom = [
      ...new Map(azolar.map((a) => [a.student.id, a.student])).values(),
    ];
    const ids = oquvchilarXom.map((s) => s.id);
    const bosh = davrOynasi(davr, now, now, null);

    if (ids.length === 0) {
      return {
        davr,
        bugun: bosh.bugun,
        kuzatuvBoshi,
        guruhDarajasi: gDaraja,
        kartalar: {
          oquvchilar: 0,
          akkauntlar: 0,
          kirganlar: 0,
          ortachaFaolSoniya: null,
          savollar: 0,
          foiz: null,
          tugatilganDarslar: 0,
          radioSoniya: 0,
          radioTinglaganlar: 0,
        },
        oquvchilar: [],
        qiyinElementlar: [],
      };
    }

    const [
      seanslar,
      oxirgilar,
      urinishlar,
      jami,
      tugatilganlar,
      oxirgiDarajalar,
      darslar,
      agregatlar,
    ] = await Promise.all([
      this.prisma.studentAppSession.findMany({
        where: {
          studentId: { in: ids },
          day: {
            gte: utcMidnightFromDateStr(bosh.davrBoshi),
            lte: utcMidnightFromDateStr(bosh.bugun),
          },
        },
        select: seansSelect,
      }),
      this.oxirgiFaolliklar(ids),
      this.prisma.dafAttempt.findMany({
        where: {
          studentId: { in: ids },
          companyId,
          createdAt: { gte: tashkentDayStartUtc(bosh.davrBoshi) },
        },
        select: urinishSelect,
      }),
      this.kursJamisi(),
      this.tugatilganDarslar(ids),
      this.oxirgiDarsDarajalari(ids),
      this.prisma.dafSession.findMany({
        where: {
          studentId: { in: ids },
          kind: 'LESSON',
          lessonId: { not: null },
          finishedAt: { gte: tashkentDayStartUtc(bosh.davrBoshi) },
        },
        select: { studentId: true, lessonId: true },
      }),
      this.elementAgregatlari(ids, tashkentDayStartUtc(bosh.davrBoshi)),
    ]);

    const seansMap = guruhla(seanslar, (s) => s.studentId);
    const urinishMap = guruhla(urinishlar, (u) => u.studentId);
    const darsMap = guruhla(darslar, (d) => d.studentId);
    // ↓ metodning davomi keyingi blokda (bitta metod, ikki blokka bo'lingan)

    const qatorlar: GuruhOquvchiQatori[] = [];
    let tugatilganDarslar = 0;
    for (const s of oquvchilarXom) {
      const oyna = davrOynasi(
        davr,
        now,
        s.user?.createdAt ?? s.createdAt,
        kuzatuvBoshi,
      );
      const surat = davrSurati(
        oyna,
        (seansMap.get(s.id) ?? []).map(seansSatri),
        (urinishMap.get(s.id) ?? []) as MashqUrinishi[],
      );
      tugatilganDarslar += new Set(
        (darsMap.get(s.id) ?? []).map((d) => d.lessonId),
      ).size;
      qatorlar.push({
        studentId: s.id,
        ism: `${s.firstName} ${s.lastName}`.trim(),
        photo: s.photo,
        akkaunt: s.user !== null,
        oxirgiFaollik: oxirgilar.get(s.id) ?? null,
        faolSoniya: surat.faolSoniya,
        radioSoniya: surat.radioSoniya,
        kirdi: surat.kirdi,
        shugullanganKunlar: surat.shugullanganKunlar,
        maxraj: oyna.maxraj,
        hisobBoshi: oyna.hisobBoshi,
        kunlar: surat.kunlar,
        mashq: {
          savollar: surat.mashq.savollar,
          togri: surat.mashq.togri,
          foiz: surat.mashq.foiz,
        },
        kurs: joriyDaraja({
          oxirgiDarsDarajasi: oxirgiDarajalar.get(s.id) ?? null,
          guruhDarajasi: gDaraja,
          tugatilgan: tugatilganlar.get(s.id) ?? {},
          jami,
        }),
      });
    }
    qatorlar.sort(guruhTartibi);

    const kirganlar = qatorlar.filter((q) => q.kirdi);
    const savollar = qatorlar.reduce((j, q) => j + q.mashq.savollar, 0);
    const togri = qatorlar.reduce((j, q) => j + q.mashq.togri, 0);

    return {
      davr,
      bugun: bosh.bugun,
      kuzatuvBoshi,
      guruhDarajasi: gDaraja,
      kartalar: {
        oquvchilar: qatorlar.length,
        akkauntlar: qatorlar.filter((q) => q.akkaunt).length,
        kirganlar: kirganlar.length,
        ortachaFaolSoniya: kirganlar.length
          ? Math.round(
              kirganlar.reduce((j, q) => j + q.faolSoniya, 0) /
                kirganlar.length,
            )
          : null,
        savollar,
        foiz: foizi(togri, savollar),
        tugatilganDarslar,
        radioSoniya: qatorlar.reduce((j, q) => j + q.radioSoniya, 0),
        radioTinglaganlar: qatorlar.filter((q) => q.radioSoniya > 0).length,
      },
      oquvchilar: qatorlar,
      qiyinElementlar: await this.elementMatnlari(qiyinElementlar(agregatlar)),
    };
  }

  async oquvchiFaolligi(
    studentId: number,
    companyId: number,
    davr: Davr,
    now: Date,
  ): Promise<OquvchiFaolligi> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photo: true,
        createdAt: true,
        user: { select: { createdAt: true } },
      },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const kuzatuvBoshi = await this.kuzatuvBoshi(companyId);
    const akkauntKuni = student.user?.createdAt ?? student.createdAt;
    const oyna = davrOynasi(davr, now, akkauntKuni, kuzatuvBoshi);
    const xaritaOynasi = davrOynasi(
      XARITA_KUNLARI,
      now,
      akkauntKuni,
      kuzatuvBoshi,
    );
    const boshlanish = tashkentDayStartUtc(xaritaOynasi.davrBoshi);

    const [
      seanslar,
      oxirgilar,
      urinishlar,
      fortschritt,
      birliklar,
      oxirgiDarajalar,
      sozQatorlari,
      qiyin,
      seansTarixi,
    ] = await Promise.all([
      this.prisma.studentAppSession.findMany({
        where: {
          studentId,
          day: {
            gte: utcMidnightFromDateStr(xaritaOynasi.davrBoshi),
            lte: utcMidnightFromDateStr(oyna.bugun),
          },
        },
        select: seansSelect,
      }),
      this.oxirgiFaolliklar([studentId]),
      this.prisma.dafAttempt.findMany({
        where: { studentId, companyId, createdAt: { gte: boshlanish } },
        select: urinishSelect,
      }),
      this.fortschritt.uebersicht(studentId, companyId),
      this.birlikProgressi(studentId),
      this.oxirgiDarsDarajalari([studentId]),
      this.prisma.$queryRaw<
        { mustahkam: number; organilmoqda: number; yangi: number }[]
      >`
          SELECT
            COUNT(*) FILTER (WHERE s.strength >= 3)::int AS mustahkam,
            COUNT(*) FILTER (WHERE s.strength BETWEEN 1 AND 2)::int AS organilmoqda,
            COUNT(*) FILTER (WHERE s.strength <= 0)::int AS yangi
          FROM "DafLexemeState" s
          WHERE s."studentId" = ${studentId}
        `,
      this.prisma.dafLexemeState.findMany({
        where: { studentId, strength: { lte: 2 }, wrongCount: { gt: 0 } },
        orderBy: [{ wrongCount: 'desc' }, { lastSeenAt: 'desc' }],
        take: 5,
        select: {
          lexemeId: true,
          wrongCount: true,
          lexeme: { select: { de: true, uz: true } },
        },
      }),
      this.prisma.dafSession.findMany({
        where: {
          studentId,
          finishedAt: { not: null, gte: tashkentDayStartUtc(oyna.davrBoshi) },
        },
        orderBy: { finishedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          kind: true,
          lessonId: true,
          startedAt: true,
          finishedAt: true,
          questionCount: true,
          firstTryCorrect: true,
        },
      }),
    ]);

    const seansSatrlari = seanslar.map(seansSatri);
    const surat = davrSurati(
      oyna,
      seansSatrlari,
      urinishlar as MashqUrinishi[],
    );
    const xarita = davrSurati(
      xaritaOynasi,
      seansSatrlari,
      urinishlar as MashqUrinishi[],
    ).kunlar;

    const tugatilgan: Sonlar = {};
    const jami: Sonlar = {};
    const oxirgiSana: Partial<Record<Daraja, Date>> = {};
    for (const b of birliklar) {
      tugatilgan[b.daraja] = (tugatilgan[b.daraja] ?? 0) + b.tugatilgan;
      jami[b.daraja] = (jami[b.daraja] ?? 0) + b.jami;
      if (
        b.oxirgi &&
        (!oxirgiSana[b.daraja] || b.oxirgi > oxirgiSana[b.daraja]!)
      )
        oxirgiSana[b.daraja] = b.oxirgi;
    }
    const joriy = joriyDaraja({
      oxirgiDarsDarajasi: oxirgiDarajalar.get(studentId) ?? null,
      guruhDarajasi: null,
      tugatilgan,
      jami,
    });

    const darsIds = [
      ...new Set(
        seansTarixi
          .map((s) => s.lessonId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const darslar = darsIds.length
      ? await this.prisma.dafLesson.findMany({
          where: { id: { in: darsIds } },
          select: { id: true, titleUz: true, titleDe: true },
        })
      : [];
    const darsNomi = new Map(
      darslar.map((d) => [d.id, d.titleUz ?? d.titleDe]),
    );
    const soz = sozQatorlari[0] ?? { mustahkam: 0, organilmoqda: 0, yangi: 0 };

    return {
      davr,
      bugun: oyna.bugun,
      kuzatuvBoshi,
      studentId: student.id,
      ism: `${student.firstName} ${student.lastName}`.trim(),
      photo: student.photo,
      akkaunt: student.user !== null,
      hisobBoshi: oyna.hisobBoshi,
      maxraj: oyna.maxraj,
      oxirgiFaollik: oxirgilar.get(studentId) ?? null,
      fortschritt: {
        gesamt: fortschritt.gesamt,
        stufe: { de: fortschritt.stufe.de, uz: fortschritt.stufe.uz },
        serie: fortschritt.serie,
      },
      vaqt: {
        faolSoniya: surat.faolSoniya,
        radioSoniya: surat.radioSoniya,
        kirdi: surat.kirdi,
        platforma: surat.platforma,
        bolim: surat.bolim,
      },
      shugullanganKunlar: surat.shugullanganKunlar,
      xarita,
      mashq: {
        savollar: surat.mashq.savollar,
        togri: surat.mashq.togri,
        xatolar: surat.mashq.xatolar,
        foiz: surat.mashq.foiz,
        konikmalar: surat.mashq.konikmalar,
      },
      darajalar: darajaQatorlari(tugatilgan, jami).map((q) => ({
        ...q,
        tugatilganSana:
          q.holat === 'TUGATILGAN' && oxirgiSana[q.daraja]
            ? oxirgiSana[q.daraja]!.toISOString()
            : null,
      })),
      joriyDaraja: joriy,
      bolimlar: birliklar
        .filter((b) => b.daraja === joriy.daraja)
        .map((b) => ({
          unitId: b.unitId,
          nomi: b.nomi,
          tugatilgan: b.tugatilgan,
          jami: b.jami,
        })),
      sozlar: { ...soz, bugunTakror: fortschritt.faelligeWoerter },
      qiyinSozlar: qiyin.map((q) => ({
        lexemeId: q.lexemeId,
        de: q.lexeme.de,
        uz: q.lexeme.uz,
        xatolar: q.wrongCount,
      })),
      seanslar: seansTarixi.map((s) => ({
        id: s.id,
        tur: s.kind,
        darsNomi:
          s.lessonId !== null ? (darsNomi.get(s.lessonId) ?? null) : null,
        boshlandi: s.startedAt.toISOString(),
        tugadi: s.finishedAt!.toISOString(),
        savollar: s.questionCount ?? 0,
        togri: s.firstTryCorrect ?? 0,
      })),
    };
  }

  /** Kompaniyadagi eng birinchi `StudentAppSession.day` (dizayn 6.2). */
  private async kuzatuvBoshi(companyId: number): Promise<string | null> {
    const r = await this.prisma.studentAppSession.aggregate({
      where: { companyId },
      _min: { day: true },
    });
    return r._min.day ? dayStr(r._min.day) : null;
  }

  private async oxirgiFaolliklar(
    ids: number[],
  ): Promise<Map<number, OxirgiFaollik>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; lastSeenAt: Date; platform: Platforma }[]
    >`
      SELECT DISTINCT ON ("studentId") "studentId", "lastSeenAt", "platform"::text AS "platform"
      FROM "StudentAppSession"
      WHERE "studentId" IN (${Prisma.join(ids)})
      ORDER BY "studentId", "lastSeenAt" DESC
    `;
    return new Map(
      rows.map((r) => [
        r.studentId,
        { vaqt: r.lastSeenAt.toISOString(), platforma: r.platform },
      ]),
    );
  }

  /** Darajadagi kurs darslari soni (dizayn 3: kurs ta'rifi). */
  private async kursJamisi(): Promise<Sonlar> {
    const rows = await this.prisma.$queryRaw<
      { daraja: Daraja; jami: number }[]
    >`
      SELECT u.level::text AS daraja, COUNT(l.id)::int AS jami
      FROM "DafLesson" l
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY u.level
    `;
    return Object.fromEntries(rows.map((r) => [r.daraja, r.jami]));
  }

  private async tugatilganDarslar(ids: number[]): Promise<Map<number, Sonlar>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; daraja: Daraja; soni: number }[]
    >`
      SELECT p."studentId", u.level::text AS daraja, COUNT(*)::int AS soni
      FROM "DafLessonProgress" p
      JOIN "DafLesson" l ON l.id = p."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE p."studentId" IN (${Prisma.join(ids)})
        AND p."completedAt" IS NOT NULL
        AND u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY p."studentId", u.level
    `;
    const natija = new Map<number, Sonlar>();
    for (const r of rows) {
      const s = natija.get(r.studentId) ?? {};
      s[r.daraja] = r.soni;
      natija.set(r.studentId, s);
    }
    return natija;
  }

  private async oxirgiDarsDarajalari(
    ids: number[],
  ): Promise<Map<number, Daraja>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; daraja: Daraja }[]
    >`
      SELECT DISTINCT ON (s."studentId") s."studentId", u.level::text AS daraja
      FROM "DafSession" s
      JOIN "DafLesson" l ON l.id = s."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE s."studentId" IN (${Prisma.join(ids)}) AND s.kind = 'LESSON'
      ORDER BY s."studentId", s."startedAt" DESC
    `;
    return new Map(rows.map((r) => [r.studentId, r.daraja]));
  }

  private async birlikProgressi(studentId: number) {
    return this.prisma.$queryRaw<
      {
        unitId: number;
        daraja: Daraja;
        nomi: string;
        jami: number;
        tugatilgan: number;
        oxirgi: Date | null;
      }[]
    >`
      SELECT u.id AS "unitId", u.level::text AS daraja, u."titleUz" AS nomi,
        COUNT(l.id)::int AS jami,
        COUNT(p.id) FILTER (WHERE p."completedAt" IS NOT NULL)::int AS tugatilgan,
        MAX(p."completedAt") AS oxirgi
      FROM "DafUnit" u
      JOIN "DafLesson" l ON l."unitId" = u.id
      LEFT JOIN "DafLessonProgress" p ON p."lessonId" = l.id AND p."studentId" = ${studentId}
      WHERE u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY u.id
      ORDER BY u.level, u."order"
    `;
  }

  /** Dizayn 6.5: birinchi urinishlar `(itemType, itemId)` bo'yicha; kamida 3 o'quvchi SQL da. */
  private async elementAgregatlari(
    ids: number[],
    dan: Date,
  ): Promise<ElementAgregati[]> {
    return this.prisma.$queryRaw<ElementAgregati[]>`
      SELECT "itemType", "itemId",
        COUNT(DISTINCT "studentId")::int AS oquvchilar,
        AVG(COALESCE(score, 0))::float AS "ortachaBall",
        MODE() WITHIN GROUP (ORDER BY format) AS format
      FROM "DafAttempt"
      WHERE "studentId" IN (${Prisma.join(ids)})
        AND "attemptNo" = 1 AND "gradingStatus" = 'GRADED'
        AND "itemType" IS NOT NULL AND "itemId" IS NOT NULL
        AND "createdAt" >= ${dan}
      GROUP BY "itemType", "itemId"
      HAVING COUNT(DISTINCT "studentId") >= 3
    `;
  }

  /** Har material turi uchun bittadan so'rov (≤ 5, o'quvchilar soniga bog'liq emas). */
  private async elementMatnlari(
    elementlar: ReturnType<typeof qiyinElementlar>,
  ): Promise<GuruhQiyinElement[]> {
    const idlar = (tur: string) =>
      elementlar.filter((e) => e.itemType === tur).map((e) => e.itemId);
    const matn = new Map<string, { de: string; uz: string | null }>();
    const qosh = (
      tur: string,
      rows: { id: number; de: string; uz: string | null }[],
    ) => {
      for (const r of rows) matn.set(`${tur}:${r.id}`, { de: r.de, uz: r.uz });
    };
    const wort = idlar('WORT');
    const satz = idlar('SATZ');
    const phrase = idlar('PHRASE');
    const zeile = idlar('DIALOGZEILE');
    const hoer = idlar('HOERFRAGE');
    const vazifalar: Promise<void>[] = [];
    if (wort.length)
      vazifalar.push(
        this.prisma.dafLexeme
          .findMany({
            where: { id: { in: wort } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('WORT', r)),
      );
    if (satz.length)
      vazifalar.push(
        this.prisma.dafSentence
          .findMany({
            where: { id: { in: satz } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('SATZ', r)),
      );
    if (phrase.length)
      vazifalar.push(
        this.prisma.dafPhrase
          .findMany({
            where: { id: { in: phrase } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('PHRASE', r)),
      );
    if (zeile.length)
      vazifalar.push(
        this.prisma.dafDialogLine
          .findMany({
            where: { id: { in: zeile } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('DIALOGZEILE', r)),
      );
    if (hoer.length)
      vazifalar.push(
        this.prisma.dafHoerFrage
          .findMany({
            where: { id: { in: hoer } },
            select: { id: true, frageDe: true, frageUz: true },
          })
          .then((r) =>
            qosh(
              'HOERFRAGE',
              r.map((x) => ({ id: x.id, de: x.frageDe, uz: x.frageUz })),
            ),
          ),
      );
    await Promise.all(vazifalar);
    return elementlar
      .map((e) => ({
        ...e,
        ...(matn.get(`${e.itemType}:${e.itemId}`) ?? { de: '', uz: null }),
      }))
      .filter((e) => e.de !== '');
  }
}

function guruhla<T>(rows: T[], kalit: (r: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    const k = kalit(r);
    const royxat = m.get(k) ?? [];
    royxat.push(r);
    m.set(k, royxat);
  }
  return m;
}

function seansSatri(s: {
  day: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  activeSeconds: number;
  radioSeconds: number;
  platform: Platforma;
  sections: unknown;
}): SeansSatri {
  return {
    day: dayStr(s.day),
    firstSeenAt: s.firstSeenAt,
    lastSeenAt: s.lastSeenAt,
    activeSeconds: s.activeSeconds,
    radioSeconds: s.radioSeconds,
    platform: s.platform,
    sections: s.sections,
  };
}

/** Dizayn 7: faol vaqt kamayishi; kirmaganlar, keyin akkauntsizlar pastda; teng bo'lsa ism. */
export function guruhTartibi(
  a: GuruhOquvchiQatori,
  b: GuruhOquvchiQatori,
): number {
  const daraja = (q: GuruhOquvchiQatori) => (!q.akkaunt ? 2 : q.kirdi ? 0 : 1);
  return (
    daraja(a) - daraja(b) ||
    b.faolSoniya - a.faolSoniya ||
    a.ism.localeCompare(b.ism)
  );
}
