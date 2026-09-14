import { NotFoundException } from '@nestjs/common';
import {
  AppActivityStatsService,
  guruhTartibi,
} from './app-activity-stats.service';

const NOW = new Date('2026-09-13T05:00:00Z');

function soxtaPrisma(oquvchiSoni: number) {
  const ids = Array.from({ length: oquvchiSoni }, (_, i) => 10001 + i);
  const raw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('"DafAttempt"') && sql.includes('HAVING')) {
      return Promise.resolve([
        {
          itemType: 'WORT',
          itemId: 7,
          oquvchilar: 3,
          ortachaBall: 0.25,
          format: 'WORT_UZ',
        },
      ]);
    }
    if (sql.includes('COUNT(l.id)'))
      return Promise.resolve([{ daraja: 'A1', jami: 192 }]);
    return Promise.resolve([]);
  });
  const prisma = {
    group: { findFirst: jest.fn().mockResolvedValue({ level: 'A1' }) },
    enrollment: {
      findMany: jest.fn().mockResolvedValue(
        ids.map((id) => ({
          student: {
            id,
            firstName: 'Ali',
            lastName: `N${id}`,
            photo: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            user: { createdAt: new Date('2026-01-01T00:00:00Z') },
          },
        })),
      ),
      findFirst: jest.fn(),
    },
    studentAppSession: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _min: { day: new Date('2026-09-01T00:00:00Z') } }),
      findMany: jest.fn().mockResolvedValue(
        ids.map((studentId) => ({
          studentId,
          day: new Date('2026-09-13T00:00:00Z'),
          firstSeenAt: new Date('2026-09-13T04:00:00Z'),
          lastSeenAt: new Date('2026-09-13T04:30:00Z'),
          activeSeconds: 600,
          radioSeconds: 0,
          platform: 'WEB',
          sections: { LERNEN: 600 },
        })),
      ),
    },
    dafAttempt: {
      findMany: jest.fn().mockResolvedValue(
        ids.map((studentId) => ({
          studentId,
          createdAt: new Date('2026-09-13T04:10:00Z'),
          sessionId: `s${studentId}`,
          questionIndex: 0,
          attemptNo: 1,
          format: 'WORT_UZ',
          score: 1,
          gradingStatus: 'GRADED',
        })),
      ),
    },
    dafSession: { findMany: jest.fn().mockResolvedValue([]) },
    dafLexeme: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 7, de: 'der Tisch', uz: 'stol' }]),
    },
    dafSentence: { findMany: jest.fn().mockResolvedValue([]) },
    dafPhrase: { findMany: jest.fn().mockResolvedValue([]) },
    dafDialogLine: { findMany: jest.fn().mockResolvedValue([]) },
    dafHoerFrage: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: raw,
  };
  return prisma;
}

function soroqlarSoni(prisma: ReturnType<typeof soxtaPrisma>): number {
  let jami = prisma.$queryRaw.mock.calls.length;
  for (const [kalit, model] of Object.entries(prisma)) {
    if (kalit.startsWith('$')) continue;
    for (const fn of Object.values(model as Record<string, jest.Mock>))
      jami += fn.mock.calls.length;
  }
  return jami;
}

const fortschritt = {
  uebersicht: jest.fn().mockResolvedValue({
    gesamt: 120,
    stufe: { de: 'Anfänger', uz: 'Boshlovchi', ab: 0 },
    naechsteStufe: null,
    serie: 3,
    wochePunkte: 0,
    wochePlatzGruppe: null,
    wochePlatzZentrum: 1,
    faelligeWoerter: 4,
  }),
};

describe('AppActivityStatsService.guruhFaolligi', () => {
  it('so`rovlar soni o`quvchilar soniga bog`liq emas (dizayn 6.6)', async () => {
    const bir = soxtaPrisma(1);
    await new AppActivityStatsService(
      bir as never,
      fortschritt as never,
    ).guruhFaolligi('g1', 1, 7, NOW);
    const yigirma = soxtaPrisma(20);
    await new AppActivityStatsService(
      yigirma as never,
      fortschritt as never,
    ).guruhFaolligi('g1', 1, 7, NOW);
    expect(soroqlarSoni(yigirma)).toBe(soroqlarSoni(bir));
  });

  it('qator va kartalar bitta ta`rifdan', async () => {
    const prisma = soxtaPrisma(3);
    const n = await new AppActivityStatsService(
      prisma as never,
      fortschritt as never,
    ).guruhFaolligi('g1', 1, 7, NOW);
    expect(n.oquvchilar).toHaveLength(3);
    expect(n.oquvchilar[0]).toMatchObject({
      akkaunt: true,
      faolSoniya: 600,
      kirdi: true,
      shugullanganKunlar: 1,
      mashq: { savollar: 1, togri: 1, foiz: 100 },
      kurs: { daraja: 'A1', jami: 192, tugatilgan: 0, holat: 'BOSHLANMAGAN' },
    });
    expect(n.kartalar).toMatchObject({
      oquvchilar: 3,
      kirganlar: 3,
      ortachaFaolSoniya: 600,
      savollar: 3,
      foiz: 100,
    });
    expect(n.qiyinElementlar).toEqual([
      expect.objectContaining({
        itemId: 7,
        de: 'der Tisch',
        uz: 'stol',
        xatoFoizi: 75,
        konikma: 'WORTSCHATZ',
      }),
    ]);
  });

  it('guruh topilmasa 404', async () => {
    const prisma = soxtaPrisma(1);
    prisma.group.findFirst.mockResolvedValue(null);
    await expect(
      new AppActivityStatsService(
        prisma as never,
        fortschritt as never,
      ).guruhFaolligi('g1', 1, 7, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bo`sh guruh — bo`sh ro`yxat, xatosiz', async () => {
    const prisma = soxtaPrisma(0);
    const n = await new AppActivityStatsService(
      prisma as never,
      fortschritt as never,
    ).guruhFaolligi('g1', 1, 7, NOW);
    expect(n.oquvchilar).toEqual([]);
    expect(n.kartalar.kirganlar).toBe(0);
  });
});

describe('AppActivityStatsService.guruhAzosiEkaniniTekshir', () => {
  it('faol a`zo bo`lmasa 404', async () => {
    const prisma = soxtaPrisma(1);
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      new AppActivityStatsService(
        prisma as never,
        fortschritt as never,
      ).guruhAzosiEkaniniTekshir('g1', 10001),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        studentId: 10001,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
  });
});

describe('AppActivityStatsService.oquvchiFaolligi', () => {
  function oquvchiPrisma(akkaunt: boolean) {
    const p = soxtaPrisma(1) as ReturnType<typeof soxtaPrisma> &
      Record<string, unknown>;
    Object.assign(p, {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          photo: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          user: akkaunt
            ? { createdAt: new Date('2026-01-01T00:00:00Z') }
            : null,
        }),
      },
      dafLexemeState: {
        findMany: jest.fn().mockResolvedValue([
          {
            lexemeId: 7,
            wrongCount: 4,
            lexeme: { de: 'der Tisch', uz: 'stol' },
          },
        ]),
      },
      dafLesson: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 3, titleUz: 'Salomlashish', titleDe: 'Begrüßung' },
          ]),
      },
    });
    p.dafSession.findMany.mockResolvedValue([
      {
        id: 's1',
        kind: 'LESSON',
        lessonId: 3,
        startedAt: new Date('2026-09-13T04:00:00Z'),
        finishedAt: new Date('2026-09-13T04:12:00Z'),
        questionCount: 12,
        firstTryCorrect: 9,
      },
    ]);
    p.$queryRaw.mockImplementation(((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('FROM "DafLexemeState"')) {
        return Promise.resolve([{ mustahkam: 5, organilmoqda: 3, yangi: 2 }]);
      }
      if (sql.includes('LEFT JOIN "DafLessonProgress"')) {
        return Promise.resolve([
          {
            unitId: 1,
            daraja: 'A1',
            nomi: 'Salom',
            jami: 16,
            tugatilgan: 16,
            oxirgi: new Date('2026-09-10T10:00:00Z'),
          },
          {
            unitId: 2,
            daraja: 'A1',
            nomi: 'Oila',
            jami: 16,
            tugatilgan: 4,
            oxirgi: new Date('2026-09-12T10:00:00Z'),
          },
        ]);
      }
      return Promise.resolve([]);
    }) as never);
    return p;
  }

  it('panel ma`lumoti bitta javobda', async () => {
    const p = oquvchiPrisma(true);
    const n = await new AppActivityStatsService(
      p as never,
      fortschritt as never,
    ).oquvchiFaolligi(10001, 1, 7, NOW);
    expect(n).toMatchObject({
      akkaunt: true,
      ism: 'Ali Valiyev',
      fortschritt: { gesamt: 120, serie: 3 },
      vaqt: { faolSoniya: 600, bolim: { LERNEN: 600, OTHER: 0 } },
      mashq: { savollar: 1, togri: 1, foiz: 100 },
      joriyDaraja: { daraja: 'A1', tugatilgan: 20, jami: 32, holat: 'DAVOM' },
      sozlar: { mustahkam: 5, organilmoqda: 3, yangi: 2, bugunTakror: 4 },
      qiyinSozlar: [{ lexemeId: 7, de: 'der Tisch', uz: 'stol', xatolar: 4 }],
      seanslar: [
        expect.objectContaining({
          tur: 'LESSON',
          darsNomi: 'Salomlashish',
          savollar: 12,
          togri: 9,
        }),
      ],
    });
    expect(n.xarita).toHaveLength(30);
    expect(n.bolimlar).toEqual([
      { unitId: 1, nomi: 'Salom', tugatilgan: 16, jami: 16 },
      { unitId: 2, nomi: 'Oila', tugatilgan: 4, jami: 16 },
    ]);
    expect(n.darajalar[0]).toMatchObject({
      daraja: 'A1',
      holat: 'DAVOM',
      tugatilganSana: null,
    });
  });

  it('akkauntsiz o`quvchi', async () => {
    const n = await new AppActivityStatsService(
      oquvchiPrisma(false) as never,
      fortschritt as never,
    ).oquvchiFaolligi(10001, 1, 7, NOW);
    expect(n.akkaunt).toBe(false);
  });

  it('o`quvchi topilmasa 404', async () => {
    const p = oquvchiPrisma(true);
    (p.student as { findFirst: jest.Mock }).findFirst.mockResolvedValue(null);
    await expect(
      new AppActivityStatsService(
        p as never,
        fortschritt as never,
      ).oquvchiFaolligi(10001, 1, 7, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('guruhTartibi', () => {
  it('faol vaqt kamayishi; kirmaganlar, keyin akkauntsizlar pastda', () => {
    const q = (
      ism: string,
      akkaunt: boolean,
      kirdi: boolean,
      faolSoniya: number,
    ) => ({ ism, akkaunt, kirdi, faolSoniya }) as never;
    const royxat = [
      q('D', false, false, 0),
      q('C', true, false, 0),
      q('A', true, true, 60),
      q('B', true, true, 900),
    ];
    expect(
      royxat.sort(guruhTartibi).map((x: { ism: string }) => x.ism),
    ).toEqual(['B', 'A', 'C', 'D']);
  });
});
