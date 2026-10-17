import {
  BadRequestException,
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

const facts = (levels: LevelFacts[]): StudentFacts => ({
  student: {
    firstName: 'Madina',
    lastName: 'Karimova',
    dateOfBirth: '2004-03-14',
  },
  levels,
  unleveledGroups: [],
});

const SETTINGS = {
  minAttendancePercent: 80,
  minAppPercent: { A1: 100, A2: 100, B1: 100 },
};

function make(
  over: { facts?: StudentFacts; lastSeq?: number | null; ceo?: boolean } = {},
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
          ...data,
        });
      }),
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
    expect(out.levels[0].thresholds).toEqual({ attendance: 80, app: 100 });
    expect(out.levels[0].issued).toEqual([
      {
        id: 'c1',
        number: 'TB-2026-0001',
        level: 'A1',
        issuedAt: '2026-10-01T05:00:00.000Z',
        exempt: false,
        revoked: false,
      },
    ]);
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

  it('marks a revoked document invalid', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(
      row({ revokedAt: new Date('2026-10-18T00:00:00.000Z') }),
    );
    expect(await service.verify(CERT_ID)).toMatchObject({
      valid: false,
      revoked: true,
    });
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
