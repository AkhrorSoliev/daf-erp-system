import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ROLE_ID } from '../common/auth/role-ids';
import { ParticipationCertificatesService } from './participation-certificates.service';
import type { LevelFacts, StudentFacts } from './participation-types';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(3),
}));
jest.mock('./participation-certificate-pdf', () => ({
  renderCertificatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
}));

import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { renderCertificatePdf } from './participation-certificate-pdf';

const level = (over: Partial<LevelFacts> = {}): LevelFacts => ({
  level: 'A1',
  groupNames: ['A1-17'],
  courseName: 'Deutsch A1',
  lessonMinutes: 90,
  from: '2026-07-07',
  to: '2026-10-15',
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: null,
  ...over,
});

const facts = (levels: LevelFacts[], balance = 0): StudentFacts => ({
  student: {
    firstName: 'Madina',
    lastName: 'Karimova',
    dateOfBirth: '2004-03-14',
  },
  balance,
  levels,
  unleveledGroups: [],
});

const SETTINGS = {
  minAttendancePercent: 80,
  minAppPercent: { A1: 100, A2: 100, B1: 100 },
  minLessons: 20,
  maxLatePercent: 20,
};

function make(
  over: {
    facts?: StudentFacts;
    lastSeq?: number | null;
    ceo?: boolean;
    updateCount?: number;
  } = {},
) {
  const created: unknown[] = [];
  const tx = {
    participationCertificate: {
      findFirst: jest
        .fn()
        .mockResolvedValue(over.lastSeq == null ? null : { seq: over.lastSeq }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          id: 'uuid-1',
          issuedAt: new Date('2026-10-17T07:00:00.000Z'),
          revokedAt: null,
          revokedReason: null,
          ...data,
        });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: over.updateCount ?? 1 }),
    },
  };
  const prisma = {
    participationCertificate: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(over.ceo ? { id: 7 } : null),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue({ name: 'DaF Sprachzentrum' }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
  };
  const factsService = {
    load: jest.fn().mockResolvedValue(over.facts ?? facts([level()])),
  };
  const settings = {
    read: jest.fn().mockResolvedValue(SETTINGS),
    thresholdsFor: jest.fn((_s: unknown, lvl: string) => ({
      attendance: 80,
      app: ['A1', 'A2', 'B1'].includes(lvl) ? 100 : null,
      minLessons: 20,
      maxLatePercent: 20,
    })),
  };
  const history = { recordCreate: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ParticipationCertificatesService(
    prisma as never,
    factsService as never,
    settings as never,
    history as never,
    config as never,
  );
  return { service, prisma, tx, created, factsService, history };
}

beforeEach(() => jest.clearAllMocks());

/** A well-formed certificate id (the id column is a uuid). */
const CERT_ID = '3f2b8c1e-5a47-4d9e-8b6a-0c1d2e3f4a5b';
const OTHER_ID = '9a8b7c6d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';

/**
 * The exemption door reads the caller from the DATABASE (ADR-0028): a live
 * account (not archived, not SUSPENDED / TERMINATED / ARCHIVED) that holds the
 * CEO role. `make()` answers `user.findFirst` from a flag whatever the query
 * is, so this pins the query itself: dropping the role clause or the
 * live-account clause would let any active non-CEO grant exemptions.
 */
const CEO_LOOKUP = expect.objectContaining({
  where: expect.objectContaining({
    id: 7,
    deletedAt: null,
    status: {
      notIn: [UserStatus.SUSPENDED, UserStatus.TERMINATED, UserStatus.ARCHIVED],
    },
    roles: { some: { role: { id: ROLE_ID.CEO } } },
  }),
});

describe('preview', () => {
  it('checks the student branch, then returns each level with its verdict and issued list', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findMany.mockResolvedValue([
      {
        id: 'c1',
        level: 'A1',
        number: 'TB-2026-0001',
        issuedAt: new Date('2026-10-01T05:00:00.000Z'),
        exemptReason: null,
        revokedAt: null,
        revokedReason: null,
      },
      {
        id: 'c0',
        level: 'A1',
        number: 'TB-2026-0000',
        issuedAt: new Date('2026-09-01T05:00:00.000Z'),
        exemptReason: null,
        revokedAt: new Date('2026-09-02T05:00:00.000Z'),
        revokedReason: "Noto'g'ri o'quvchiga berilgan",
      },
    ]);
    const out = await service.preview(7, 1001, 10001);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10001,
      1001,
    );
    expect(out.levels).toHaveLength(1);
    expect(out.levels[0].verdict.eligible).toBe(true);
    expect(out.levels[0].thresholds).toEqual({
      attendance: 80,
      app: 100,
      minLessons: 20,
      maxLatePercent: 20,
    });
    expect(out.levels[0].issued).toEqual([
      {
        id: 'c1',
        number: 'TB-2026-0001',
        level: 'A1',
        issuedAt: '2026-10-01T05:00:00.000Z',
        exempt: false,
        revoked: false,
        revokedAt: null,
        revokedReason: null,
      },
      {
        id: 'c0',
        number: 'TB-2026-0000',
        level: 'A1',
        issuedAt: '2026-09-01T05:00:00.000Z',
        exempt: false,
        revoked: true,
        revokedAt: '2026-09-02T05:00:00.000Z',
        revokedReason: "Noto'g'ri o'quvchiga berilgan",
      },
    ]);
    // The staff view needs the reason, so the query has to select it.
    expect(prisma.participationCertificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ revokedReason: true }),
      }),
    );
  });
});

describe('preview of the conditions of 17.10', () => {
  it('returns the live balance and the new parts of the verdict', async () => {
    const { service } = make({ facts: facts([level()], -5000) });
    const out = await service.preview(7, 1001, 10001);
    expect(out.balance).toBe(-5000);
    expect(out.levels[0].verdict).toMatchObject({
      attendanceOk: true,
      debtOk: false,
      lessonsOk: true,
      lateOk: true,
      testsOk: true,
      eligible: false,
      reasons: ["Qarzi bor: 5 000 so'm"],
    });
  });

  it('judges every level with the settings of this company', async () => {
    const { service } = make({
      facts: facts([
        level({
          attendance: {
            attended: 10,
            late: 0,
            absent: 0,
            counted: 10,
            percent: 100,
          },
        }),
      ]),
    });
    const out = await service.preview(7, 1001, 10001);
    expect(out.levels[0].verdict.lessonsOk).toBe(false);
    expect(out.levels[0].verdict.reasons).toEqual([
      'Darslar soni 10 ta, kamida 20 ta kerak',
    ]);
  });
});

/** One student per new condition, each failing only that one. */
const failing: [string, StudentFacts, RegExp][] = [
  ['a debt', facts([level()], -1), /Qarzi bor: 1 so'm/],
  [
    'too few lessons (19 of 20)',
    facts([
      level({
        attendance: {
          attended: 19,
          late: 0,
          absent: 0,
          counted: 19,
          percent: 100,
        },
      }),
    ]),
    /Darslar soni 19 ta, kamida 20 ta kerak/,
  ],
  [
    'too many late lessons (5 of 20 attended)',
    facts([
      level({
        attendance: {
          attended: 20,
          late: 5,
          absent: 0,
          counted: 20,
          percent: 100,
        },
      }),
    ]),
    /Kech qolish 25%, ruxsat etilgani 20%/,
  ],
  [
    'a final test not passed (2 of 3)',
    facts([level({ unitTests: { passed: 2, total: 3 } })]),
    /Yakuniy sinovlar 2\/3 ta topshirilgan, hammasi kerak/,
  ],
];

describe('issue under the conditions of 17.10', () => {
  it.each(failing)(
    'refuses %s without a reason, and names it',
    async (_label, data, reason) => {
      const { service, prisma } = make({ facts: data });
      const err = await service
        .issue(7, 1001, 10001, { level: 'A1' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toMatch(reason);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(failing)(
    'lets only the CEO exempt %s, with a reason',
    async (_label, data) => {
      const refused = make({ facts: data, ceo: false });
      await expect(
        refused.service.issue(7, 1001, 10001, {
          level: 'A1',
          exemptReason: 'Rahbar ruxsati',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(refused.prisma.$transaction).not.toHaveBeenCalled();

      const { service, created, prisma } = make({ facts: data, ceo: true });
      const out = await service.issue(7, 1001, 10001, {
        level: 'A1',
        exemptReason: 'Rahbar ruxsati',
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith(CEO_LOOKUP);
      expect(out.exempt).toBe(true);
      expect(created[0]).toMatchObject({
        exemptReason: 'Rahbar ruxsati',
        exemptById: 7,
      });
    },
  );

  it('seals the thresholds in force, new ones included, and not the balance', async () => {
    const { service, created } = make({ facts: facts([level()], 120000) });
    await service.issue(7, 1001, 10001, { level: 'A1' });
    const snapshot = (created[0] as { snapshot: Record<string, unknown> })
      .snapshot;
    expect(snapshot.thresholds).toEqual({
      attendance: 80,
      app: 100,
      minLessons: 20,
      maxLatePercent: 20,
    });
    expect(JSON.stringify(snapshot)).not.toContain('120000');
    expect(snapshot).not.toHaveProperty('balance');
  });

  it('issues without a reason exactly at every boundary (20 lessons, 20 % late, no debt, all tests)', async () => {
    const edge = facts(
      [
        level({
          attendance: {
            attended: 20,
            late: 4,
            absent: 0,
            counted: 20,
            percent: 100,
          },
          unitTests: { passed: 3, total: 3 },
        }),
      ],
      0,
    );
    const { service } = make({ facts: edge });
    const out = await service.issue(7, 1001, 10001, { level: 'A1' });
    expect(out.exempt).toBe(false);
  });

  it('skips the tests condition on a level that has none', async () => {
    const { service } = make({
      facts: facts([level({ unitTests: null })]),
    });
    const out = await service.issue(7, 1001, 10001, { level: 'A1' });
    expect(out.exempt).toBe(false);
  });
});

describe('issue', () => {
  it('numbers the next certificate of the year, stores the snapshot and writes the student history', async () => {
    const { service, created, history, tx } = make({ lastSeq: 41 });
    const out = await service.issue(7, 1001, 10001, { level: 'A1' });
    expect(out).toMatchObject({
      id: 'uuid-1',
      number: expect.stringMatching(/^TB-\d{4}-0042$/),
      level: 'A1',
      exempt: false,
      revoked: false,
    });
    const data = created[0] as Record<string, unknown>;
    expect(data).toMatchObject({
      companyId: 1001,
      branchId: 3,
      studentId: 10001,
      level: 'A1',
      seq: 42,
      issuedById: 7,
      exemptReason: null,
      exemptById: null,
    });
    expect(
      (data.snapshot as { attendance: { percent: number } }).attendance.percent,
    ).toBe(91);
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10001,
        companyId: 1001,
        changedById: 7,
        // Written on the issue transaction's own client, with the number the
        // row was just given, so the audit entry commits or rolls back with it.
        tx,
        newValues: expect.objectContaining({
          action: 'QATNASHISH_HUJJATI_BERILDI',
          raqam: out.number,
          daraja: 'A1',
        }),
      }),
    );
  });

  it('rolls the document back when its history entry cannot be written', async () => {
    const { service, prisma, tx, history } = make({ lastSeq: 41 });
    let committed = false;
    prisma.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => {
        const result = await fn(tx);
        committed = true;
        return result;
      },
    );
    history.recordCreate.mockRejectedValue(new Error('history down'));
    await expect(
      service.issue(7, 1001, 10001, { level: 'A1' }),
    ).rejects.toThrow('history down');
    // The failure happened inside the transaction callback, before commit.
    expect(tx.participationCertificate.create).toHaveBeenCalledTimes(1);
    expect(committed).toBe(false);
  });

  it('starts a fresh year at 0001', async () => {
    const { service, created } = make({ lastSeq: null });
    await service.issue(7, 1001, 10001, { level: 'A1' });
    expect((created[0] as { seq: number }).seq).toBe(1);
  });

  it('refuses a student below the rule and names the reason', async () => {
    const weak = level({
      attendance: {
        attended: 37,
        late: 0,
        absent: 13,
        counted: 50,
        percent: 74,
      },
    });
    const { service } = make({ facts: facts([weak]) });
    await expect(
      service.issue(7, 1001, 10001, { level: 'A1' }),
    ).rejects.toThrow(/Davomat 74%, kerak 80%/);
  });

  it('refuses an exemption from anyone but the CEO', async () => {
    const weak = level({
      attendance: {
        attended: 37,
        late: 0,
        absent: 13,
        counted: 50,
        percent: 74,
      },
    });
    const { service, prisma } = make({ facts: facts([weak]), ceo: false });
    await expect(
      service.issue(7, 1001, 10001, { level: 'A1', exemptReason: 'Kasal edi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(CEO_LOOKUP);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets the CEO give an exemption and records who and why', async () => {
    const weak = level({
      attendance: {
        attended: 37,
        late: 0,
        absent: 13,
        counted: 50,
        percent: 74,
      },
    });
    const { service, prisma, created, history } = make({
      facts: facts([weak]),
      ceo: true,
    });
    const out = await service.issue(7, 1001, 10001, {
      level: 'A1',
      exemptReason: '  Kasal edi  ',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(CEO_LOOKUP);
    expect(out.exempt).toBe(true);
    expect(created[0]).toMatchObject({
      exemptReason: 'Kasal edi',
      exemptById: 7,
    });
    expect(
      (created[0] as { snapshot: { exempt: boolean } }).snapshot.exempt,
    ).toBe(true);
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ istisno: 'Kasal edi' }),
      }),
    );
  });

  it('ignores an exemption reason when the student already qualifies', async () => {
    const { service, created } = make({ ceo: false });
    await service.issue(7, 1001, 10001, {
      level: 'A1',
      exemptReason: 'kerak emas',
    });
    expect(created[0]).toMatchObject({ exemptReason: null, exemptById: null });
  });

  it('404s for a level the student never attended and 400s for a bad level', async () => {
    const { service } = make({ facts: facts([]) });
    await expect(
      service.issue(7, 1001, 10001, { level: 'A1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.issue(7, 1001, 10001, { level: 'Z9' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rolls conflicting sequence numbers into a 409', async () => {
    const { service, prisma } = make();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.issue(7, 1001, 10001, { level: 'A1' }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('verify', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    number: 'TB-2026-0001',
    level: 'A1',
    issuedAt: new Date('2026-10-17T07:00:00.000Z'),
    companyId: 1001,
    revokedAt: null,
    snapshot: {
      student: {
        firstName: 'Madina',
        lastName: 'Karimova',
        dateOfBirth: '2004-03-14',
      },
      from: '2026-07-07',
      to: '2026-10-15',
    },
    ...over,
  });

  it('404s for an unknown id', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(null);
    await expect(service.verify(OTHER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.participationCertificate.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each(['\u0000', 'abc\u0000def', 'not-a-uuid', '', '3f2b8c1e'])(
    '404s with the same text, and never asks the database, for the malformed id %j',
    async (bad) => {
      const { service, prisma } = make();
      const err = await service.verify(bad).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Hujjat topilmadi');
      expect(prisma.participationCertificate.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    },
  );

  it('shows only what the public page may show', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(row());
    expect(await service.verify(CERT_ID)).toEqual({
      valid: true,
      revoked: false,
      number: 'TB-2026-0001',
      studentName: 'Madina Karimova',
      level: 'A1',
      from: '2026-07-07',
      to: '2026-10-15',
      issuedAt: '2026-10-17T07:00:00.000Z',
      companyName: 'DaF Sprachzentrum',
    });
  });

  it('marks a revoked document invalid and shows nothing more about it', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(
      row({
        revokedAt: new Date('2026-10-18T00:00:00.000Z'),
        // Even if a row carried it, the public answer must not.
        revokedReason: "Noto'g'ri o'quvchiga berilgan",
      }),
    );
    expect(await service.verify(CERT_ID)).toEqual({
      valid: false,
      revoked: true,
      number: 'TB-2026-0001',
      studentName: 'Madina Karimova',
      level: 'A1',
      from: '2026-07-07',
      to: '2026-10-15',
      issuedAt: '2026-10-17T07:00:00.000Z',
      companyName: 'DaF Sprachzentrum',
    });
    // The reason is never even read for the public page.
    const select = (
      prisma.participationCertificate.findFirst.mock.calls[0] as [
        { select: Record<string, boolean> },
      ]
    )[0].select;
    expect(select).not.toHaveProperty('revokedReason');
  });
});

describe('pdf', () => {
  it('checks the student branch and renders from the stored snapshot, QR to the public page', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue({
      id: CERT_ID,
      studentId: 10001,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      snapshot: { version: 1 },
    });
    const out = await service.pdf(7, 1001, CERT_ID);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10001,
      1001,
    );
    expect(renderCertificatePdf).toHaveBeenCalledWith({
      snapshot: { version: 1 },
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: `https://admin.dafzentrum.uz/t/${CERT_ID}`,
    });
    expect(out.filename).toBe('TB-2026-0001.pdf');
    expect(out.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('hands a document sealed before the new conditions to the renderer untouched (no defaults are invented)', async () => {
    const { service, prisma } = make();
    const old = {
      version: 1,
      level: 'A1',
      thresholds: { attendance: 80, app: 100 },
      exempt: false,
    };
    prisma.participationCertificate.findFirst.mockResolvedValue({
      id: CERT_ID,
      studentId: 10001,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      revokedAt: null,
      snapshot: old,
    });
    await service.pdf(7, 1001, CERT_ID);
    const arg = (renderCertificatePdf as jest.Mock).mock.calls[0][0] as {
      snapshot: typeof old;
    };
    expect(arg.snapshot).toBe(old);
    expect(arg.snapshot.thresholds).toEqual({ attendance: 80, app: 100 });
  });

  it('refuses the PDF of a cancelled document with a 409 and renders nothing', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue({
      id: CERT_ID,
      studentId: 10001,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      revokedAt: new Date('2026-10-18T07:00:00.000Z'),
      snapshot: { version: 1 },
    });
    const err = await service.pdf(7, 1001, CERT_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe('Hujjat bekor qilingan');
    expect(renderCertificatePdf).not.toHaveBeenCalled();
    // The branch check comes first: another branch's caller learns nothing.
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10001,
      1001,
    );
  });

  it('asks for the revoke state in the PDF lookup', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue({
      id: CERT_ID,
      studentId: 10001,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      revokedAt: null,
      snapshot: { version: 1 },
    });
    await service.pdf(7, 1001, CERT_ID);
    expect(prisma.participationCertificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ revokedAt: true }),
      }),
    );
  });

  it('404s for a certificate of another company', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(null);
    await expect(service.pdf(7, 1001, OTHER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.participationCertificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OTHER_ID, companyId: 1001 } }),
    );
  });

  it.each(['\u0000', 'abc\u0000def', 'not-a-uuid', ''])(
    '404s with the same text, and never asks the database, for the malformed id %j',
    async (bad) => {
      const { service, prisma } = make();
      const err = await service.pdf(7, 1001, bad).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Hujjat topilmadi');
      expect(prisma.participationCertificate.findFirst).not.toHaveBeenCalled();
      expect(assertCallerMayTouchStudent).not.toHaveBeenCalled();
    },
  );
});

describe('revoke', () => {
  const LIVE = {
    id: CERT_ID,
    studentId: 10001,
    number: 'TB-2026-0007',
    level: 'A1',
    issuedAt: new Date('2026-10-17T07:00:00.000Z'),
    exemptReason: null,
    revokedAt: null,
  };
  const REASON = "Noto'g'ri o'quvchiga berilgan";

  it('cancels in one transaction: conditional update, then the history on the same client', async () => {
    const { service, prisma, tx, history } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(LIVE);
    const out = await service.revoke(7, 1001, CERT_ID, REASON);

    // The company is part of the lookup (another company's row is a 404).
    expect(prisma.participationCertificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CERT_ID, companyId: 1001 } }),
    );
    // Race-safe: only a still-live row is written, and only in this company.
    expect(tx.participationCertificate.updateMany).toHaveBeenCalledWith({
      where: { id: CERT_ID, companyId: 1001, revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: REASON },
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10001,
        companyId: 1001,
        changedById: 7,
        tx,
        newValues: {
          action: 'QATNASHISH_HUJJATI_BEKOR_QILINDI',
          raqam: 'TB-2026-0007',
          daraja: 'A1',
          sabab: REASON,
        },
      }),
    );
    expect(out).toEqual({
      id: CERT_ID,
      number: 'TB-2026-0007',
      level: 'A1',
      issuedAt: '2026-10-17T07:00:00.000Z',
      exempt: false,
      revoked: true,
      revokedAt: expect.any(String),
      revokedReason: REASON,
    });
    // The stored figures are never touched: no snapshot write anywhere.
    const data = tx.participationCertificate.updateMany.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['revokedAt', 'revokedReason']);
  });

  it('checks the student branch exactly as the PDF does', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(LIVE);
    await service.revoke(7, 1001, CERT_ID, REASON);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      prisma,
      7,
      10001,
      1001,
    );
  });

  it('stops at the branch guard: nothing is written for a caller outside the branch', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(LIVE);
    (assertCallerMayTouchStudent as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException('Bu filial emas'),
    );
    await expect(
      service.revoke(7, 1001, CERT_ID, REASON),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for a certificate of another company (or an unknown id)', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(null);
    await expect(
      service.revoke(7, 1001, OTHER_ID, REASON),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assertCallerMayTouchStudent).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['\u0000', 'abc\u0000def', 'not-a-uuid', ''])(
    '404s with the same text, and never asks the database, for the malformed id %j',
    async (bad) => {
      const { service, prisma } = make();
      const err = await service
        .revoke(7, 1001, bad, REASON)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).message).toBe('Hujjat topilmadi');
      expect(prisma.participationCertificate.findFirst).not.toHaveBeenCalled();
      expect(assertCallerMayTouchStudent).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('409s for a document that is already cancelled, writing nothing', async () => {
    const { service, prisma, history } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue({
      ...LIVE,
      revokedAt: new Date('2026-10-18T07:00:00.000Z'),
    });
    const err = await service
      .revoke(7, 1001, CERT_ID, REASON)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(
      'Hujjat allaqachon bekor qilingan',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(history.recordCreate).not.toHaveBeenCalled();
  });

  it('409s when a concurrent cancel wins the race (no row matched), without a history entry', async () => {
    const { service, prisma, history } = make({ updateCount: 0 });
    prisma.participationCertificate.findFirst.mockResolvedValue(LIVE);
    const err = await service
      .revoke(7, 1001, CERT_ID, REASON)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toBe(
      'Hujjat allaqachon bekor qilingan',
    );
    expect(history.recordCreate).not.toHaveBeenCalled();
  });

  it('rolls the cancel back when its history entry cannot be written', async () => {
    const { service, prisma, tx, history } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(LIVE);
    let committed = false;
    prisma.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => {
        const result = await fn(tx);
        committed = true;
        return result;
      },
    );
    history.recordCreate.mockRejectedValue(new Error('history down'));
    await expect(service.revoke(7, 1001, CERT_ID, REASON)).rejects.toThrow(
      'history down',
    );
    expect(tx.participationCertificate.updateMany).toHaveBeenCalledTimes(1);
    expect(committed).toBe(false);
  });

  it('turns a serialization conflict into a 409 and writes nothing outside the transaction', async () => {
    const { service, prisma, tx } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(LIVE);
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(
      service.revoke(7, 1001, CERT_ID, REASON),
    ).rejects.toMatchObject({ status: 409 });
    // A serialization conflict became a 409 and nothing ran outside the tx.
    expect(tx.participationCertificate.updateMany).not.toHaveBeenCalled();
  });
});
