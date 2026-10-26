import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatAccessService } from './chat-access.service';

const NOW = new Date('2026-10-25T07:00:00Z'); // 12:00 Tashkent, same calendar day

function make(opts: {
  enabled?: boolean;
  testers?: string;
  student?: object | null;
  usage?: {
    day: Date;
    _sum: { activeSeconds: number; radioSeconds: number };
  }[];
}) {
  const prisma = {
    student: {
      findFirst: jest.fn().mockResolvedValue(
        opts.student === undefined
          ? {
              balance: 0,
              gender: 'MALE',
              dateOfBirth: new Date('2000-01-01'),
              phone: '901234567',
              verifiedPhone: '901234567',
              chatBannedAt: null,
            }
          : opts.student,
      ),
    },
    studentAppSession: {
      groupBy: jest.fn().mockResolvedValue(opts.usage ?? []),
    },
  };
  const settings = {
    get: jest.fn(async (_c: number, key: string) => {
      if (key === 'chat.enabled') return opts.enabled ?? true;
      if (key === 'chat.weekMinutesActive') return 60;
      return 30;
    }),
  };
  return {
    service: new ChatAccessService(
      prisma as never,
      settings as never,
      { get: () => opts.testers } as never,
    ),
    prisma,
  };
}

const fullWeek = [
  {
    day: new Date('2026-10-25T00:00:00Z'),
    _sum: { activeSeconds: 3600, radioSeconds: 1800 },
  },
];

describe('ChatAccessService', () => {
  it('opens for a student who meets everything', async () => {
    const { service } = make({ usage: fullWeek });
    const a = await service.forStudent(1, 1, NOW);
    expect(a.canWrite).toBe(true);
    expect(a.reasons).toEqual([]);
    expect(a.quota.activeMin).toBe(60);
  });

  it('is shut for everyone while the switch is off', async () => {
    const { service } = make({ enabled: false, usage: fullWeek });
    const a = await service.forStudent(1, 1, NOW);
    expect(a.enabled).toBe(false);
    expect(a.canWrite).toBe(false);
    await expect(service.assertCanWrite(1, 1)).rejects.toThrow(
      'Chat hozircha ochilmagan',
    );
  });

  it('explains a lock with the first reason text', async () => {
    const { service } = make({ usage: [] });
    await expect(service.assertCanWrite(1, 1)).rejects.toThrow(
      ForbiddenException,
    );
    const a = await service.forStudent(1, 1, NOW);
    expect(a.reasons).toEqual(['QUOTA']);
    expect(a.messages[0]).toBe(
      'Ochish uchun yana 60 daqiqa ishlang va 30 daqiqa radio eshiting.',
    );
  });

  it('queries only the 7-day window of this student', async () => {
    const { service, prisma } = make({ usage: fullWeek });
    await service.forStudent(7, 1, NOW);
    const where = prisma.studentAppSession.groupBy.mock.calls[0][0].where;
    expect(where.studentId).toBe(7);
    expect(where.day.gte).toEqual(new Date('2026-10-19T00:00:00Z'));
    expect(where.day.lte).toEqual(new Date('2026-10-25T00:00:00Z'));
  });

  it('404s for a missing card', async () => {
    const { service } = make({ student: null });
    await expect(service.forStudent(1, 1, NOW)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('tester (CHAT_TESTER_IDS)', () => {
    const bad = {
      balance: -500000,
      gender: null,
      dateOfBirth: null,
      phone: '901234567',
      verifiedPhone: null,
      chatBannedAt: null,
    };

    it('writes with the switch off despite debt, missing profile, unproven phone and empty quota', async () => {
      const { service } = make({ enabled: false, testers: '7', student: bad });
      const a = await service.forStudent(7, 1, NOW);
      expect(a).toMatchObject({
        enabled: true,
        canWrite: true,
        reasons: [],
        messages: [],
        warning: null,
      });
      expect(a.quota).toBeDefined();
      await expect(service.assertCanWrite(7, 1)).resolves.toBeUndefined();
    });

    it('is still stopped by a ban', async () => {
      const { service } = make({
        enabled: false,
        testers: '7',
        student: { ...bad, chatBannedAt: new Date() },
      });
      const a = await service.forStudent(7, 1, NOW);
      expect(a.reasons).toEqual(['BANNED']);
      expect(a.canWrite).toBe(false);
      await expect(service.assertCanWrite(7, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('leaves a non-tester unchanged', async () => {
      const { service } = make({ enabled: false, testers: '8', student: bad });
      const a = await service.forStudent(7, 1, NOW);
      expect(a.enabled).toBe(false);
      expect(a.canWrite).toBe(false);
      expect(a.reasons.length).toBeGreaterThan(0);
    });
  });
});
