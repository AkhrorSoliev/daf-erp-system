import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { CONCURRENT_CHANGE_MESSAGE } from '../../common/transaction-conflict';
import { LEAD_OWNER_CHANGED } from '../lead-events';
import { LeadOwnershipService } from './lead-ownership.service';

const FREE_LEAD = {
  id: 'L1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  statusEnum: LeadStatus.NEW as LeadStatus,
  branchId: 1,
  ownerId: null as number | null,
  owner: null as { firstName: string; lastName: string } | null,
};

function setup(
  opts: {
    lead?: typeof FREE_LEAD | null;
    untouched?: number;
    callerMayAssign?: boolean;
    targetMayClaim?: boolean;
    target?: object | null;
  } = {},
) {
  const lead = opts.lead === undefined ? FREE_LEAD : opts.lead;
  const tx = {
    lead: {
      findFirst: jest.fn().mockResolvedValue(lead),
      count: jest.fn().mockResolvedValue(opts.untouched ?? 0),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    leadOwnershipLog: { create: jest.fn().mockResolvedValue({}) },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 11, firstName: 'Nodira', lastName: 'R' },
        { id: 12, firstName: 'Farangiz', lastName: 'N' },
      ]),
    },
  };
  // The target user: the active check and the branch scope read the same row.
  const target =
    opts.target === undefined
      ? {
          id: 12,
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          roles: [{ role: { name: 'Administrator' } }],
        }
      : opts.target;
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    user: { findFirst: jest.fn().mockResolvedValue(target) },
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const permissions = {
    has: jest.fn(async (userId: number, key: string) =>
      key === 'leads.assign'
        ? Boolean(opts.callerMayAssign)
        : (opts.targetMayClaim ?? true),
    ),
  };
  const values: Record<string, number> = {
    'leads.maxUntouched': 10,
    'leads.firstActionHours': 2,
    'leads.followUpDays': 3,
  };
  const settings = {
    get: jest.fn(async (_c: number, key: string) => values[key]),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const events = { emit: jest.fn() };
  const service = new LeadOwnershipService(
    prisma as never,
    history as never,
    permissions as never,
    settings as never,
    events as never,
  );
  return { service, tx, prisma, history, settings, events };
}

describe('LeadOwnershipService.claim', () => {
  it('gives a free lead to the caller, logs it and tells listeners', async () => {
    const s = setup();
    await s.service.claim('L1', 11, 1, [1]);
    expect(s.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: expect.objectContaining({ ownerId: 11, ownerActedAt: null }),
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'CLAIM',
        fromUserId: null,
        toUserId: 11,
        actorId: 11,
        branchId: 1,
      }),
    });
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Lead',
        entityId: 'L1',
        changedById: 11,
        newValues: expect.objectContaining({
          action: 'LID_BAND_QILINDI',
          masul: 'Nodira R',
        }),
      }),
    );
    expect(s.events.emit).toHaveBeenCalledWith(
      LEAD_OWNER_CHANGED,
      expect.objectContaining({
        kind: 'CLAIM',
        toUserId: 11,
        leadName: 'Ali Valiyev',
      }),
    );
  });

  it('refuses a lead someone else holds and names them', async () => {
    const s = setup({
      lead: {
        ...FREE_LEAD,
        ownerId: 12,
        owner: { firstName: 'Farangiz', lastName: 'N' },
      },
    });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      new ConflictException('Bu lidni Farangiz N band qilgan'),
    );
    expect(s.tx.lead.update).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });

  it('refuses once the caller holds the limit of untouched leads', async () => {
    const s = setup({ untouched: 10 });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
    expect(s.tx.lead.update).not.toHaveBeenCalled();
  });

  it('refuses a converted lead', async () => {
    const s = setup({
      lead: { ...FREE_LEAD, statusEnum: LeadStatus.CONVERTED },
    });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('answers 404 for a lead outside the caller scope', async () => {
    const s = setup({ lead: null });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('LeadOwnershipService.claim — a lost race', () => {
  // Serializable lost the race: Prisma reports it as P2034.
  const lost = () =>
    Object.assign(new Error('write conflict'), { code: 'P2034' });

  function raceSetup(read: jest.Mock) {
    const s = setup();
    (s.prisma.$transaction as jest.Mock).mockRejectedValue(lost());
    Object.assign(s.prisma, { lead: { findFirst: read } });
    return s;
  }

  it('names the person who won, like a claim on an owned lead does', async () => {
    const read = jest.fn().mockResolvedValue({
      ownerId: 12,
      owner: { firstName: 'Farangiz', lastName: 'N' },
    });
    const s = raceSetup(read);
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      new ConflictException('Bu lidni Farangiz N band qilgan'),
    );
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'L1',
          companyId: 1,
          deletedAt: null,
        }),
      }),
    );
    expect(s.events.emit).not.toHaveBeenCalled();
  });

  it('falls back to the generic conflict when nobody holds the lead now', async () => {
    const s = raceSetup(
      jest.fn().mockResolvedValue({ ownerId: null, owner: null }),
    );
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      new ConflictException(CONCURRENT_CHANGE_MESSAGE),
    );
  });

  it('falls back to the generic conflict when the winner is the caller', async () => {
    const s = raceSetup(
      jest.fn().mockResolvedValue({
        ownerId: 11,
        owner: { firstName: 'Nodira', lastName: 'R' },
      }),
    );
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      new ConflictException(CONCURRENT_CHANGE_MESSAGE),
    );
  });

  it('falls back to the generic conflict when the lead cannot be read again', async () => {
    const s = raceSetup(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      new ConflictException(CONCURRENT_CHANGE_MESSAGE),
    );
  });

  it('reads nothing again for an error that is not a lost race', async () => {
    const read = jest.fn();
    const s = raceSetup(read);
    (s.prisma.$transaction as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow('boom');
    expect(read).not.toHaveBeenCalled();
  });
});

describe('LeadOwnershipService.release', () => {
  const OWNED = { ...FREE_LEAD, ownerId: 11, owner: null };

  it('lets the owner release their lead', async () => {
    const s = setup({ lead: OWNED });
    await s.service.release('L1', 11, 1, [1]);
    expect(s.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: { ownerId: null, ownedAt: null, ownerActedAt: null },
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RELEASE', fromUserId: 11 }),
    });
  });

  it("refuses someone else's lead to a caller without leads.assign", async () => {
    const s = setup({ lead: OWNED });
    await expect(s.service.release('L1', 99, 1, [1])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("lets a manager release someone else's lead", async () => {
    const s = setup({ lead: OWNED, callerMayAssign: true });
    await s.service.release('L1', 99, 1, [1]);
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RELEASE', actorId: 99 }),
    });
  });
});

describe('LeadOwnershipService.assign', () => {
  it('gives the lead to the target and restarts the clock', async () => {
    const s = setup({
      lead: { ...FREE_LEAD, ownerId: 11, owner: null },
    });
    await s.service.assign('L1', 12, 2, 1, [1]);
    expect(s.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: expect.objectContaining({ ownerId: 12, ownerActedAt: null }),
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'ASSIGN',
        fromUserId: 11,
        toUserId: 12,
        actorId: 2,
      }),
    });
  });

  it('refuses a target who may not claim leads', async () => {
    const s = setup({ targetMayClaim: false });
    await expect(s.service.assign('L1', 12, 2, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
    expect(s.tx.lead.update).not.toHaveBeenCalled();
  });

  it("refuses a target who does not work in the lead's branch", async () => {
    const s = setup({
      target: {
        id: 12,
        mainBranch: 2,
        branches: [{ branchId: 2 }],
        roles: [{ role: { name: 'Administrator' } }],
      },
    });
    await expect(s.service.assign('L1', 12, 2, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('releases the lead when no target is given', async () => {
    const s = setup({
      lead: { ...FREE_LEAD, ownerId: 11, owner: null },
      callerMayAssign: true,
    });
    await s.service.assign('L1', null, 2, 1, [1]);
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RELEASE', actorId: 2 }),
    });
  });
});

describe('LeadOwnershipService.setRules', () => {
  it('writes only the fields it was given', async () => {
    const s = setup();
    await s.service.setRules(1, { followUpDays: 5 }, 7);
    expect(s.settings.set).toHaveBeenCalledTimes(1);
    expect(s.settings.set).toHaveBeenCalledWith(1, 'leads.followUpDays', 5, 7);
  });

  it('refuses an empty change', async () => {
    const s = setup();
    await expect(s.service.setRules(1, {}, 7)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('LeadOwnershipService.dueResolver', () => {
  const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);
  const s = () => {
    const x = setup();
    (x.prisma as Record<string, unknown>).holiday = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    return x;
  };

  it('gives an owned lead its deadline', async () => {
    const due = await s().service.dueResolver(1, at('2026-10-19', '10:30'));
    expect(
      due({
        ownerId: 11,
        ownedAt: at('2026-10-19', '10:00'),
        ownerActedAt: null,
        branchId: 1,
        statusEnum: LeadStatus.NEW,
      }),
    ).toEqual(at('2026-10-19', '12:00'));
  });

  it('counts the days of a long holiday begun well before today', async () => {
    const x = setup();
    // Two and a half weeks of holiday that opened the day the lead was taken,
    // seven weeks before now: a 30-day look-back would have cut it off.
    (x.prisma as Record<string, unknown>).holiday = {
      findMany: jest.fn().mockResolvedValue([
        {
          date: at('2026-11-02', '00:00'),
          endDate: at('2026-11-20', '00:00'),
          branchId: null,
        },
      ]),
    };
    const due = await x.service.dueResolver(1, at('2026-12-21', '12:00'));
    expect(
      due({
        ownerId: 11,
        ownedAt: at('2026-11-02', '10:00'),
        ownerActedAt: null,
        branchId: 1,
        statusEnum: LeadStatus.NEW,
      }),
      // The first working day after the holiday: Saturday 21 November.
    ).toEqual(at('2026-11-21', '10:00'));
  });

  it('gives no deadline to a free or a converted lead', async () => {
    const due = await s().service.dueResolver(1, at('2026-10-19', '10:30'));
    const owned = {
      ownerId: 11,
      ownedAt: at('2026-10-19', '10:00'),
      ownerActedAt: null,
      branchId: 1,
      statusEnum: LeadStatus.NEW,
    };
    expect(due({ ...owned, ownerId: null, ownedAt: null })).toBeNull();
    expect(due({ ...owned, statusEnum: LeadStatus.CONVERTED })).toBeNull();
  });
});

describe('LeadOwnershipService.expireOverdue', () => {
  const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);
  const OWNED = {
    ...FREE_LEAD,
    ownerId: 11,
    owner: { firstName: 'Nodira', lastName: 'R' },
    ownedAt: at('2026-10-19', '10:00'),
    ownerActedAt: null,
  };

  function expirySetup(updated = 1, leads: object[] = [OWNED]) {
    const s = setup();
    Object.assign(s.prisma, {
      company: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      lead: { findMany: jest.fn().mockResolvedValue(leads) },
    });
    Object.assign(s.tx.lead, {
      updateMany: jest.fn().mockResolvedValue({ count: updated }),
    });
    return s;
  }

  it('takes back a lead whose first action is late, as the system', async () => {
    const s = expirySetup();
    await expect(
      s.service.expireOverdue(at('2026-10-19', '12:15')),
    ).resolves.toBe(1);
    expect(s.tx.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'L1',
        ownerId: 11,
        ownedAt: OWNED.ownedAt,
        ownerActedAt: null,
        deletedAt: null,
        statusEnum: { not: LeadStatus.CONVERTED },
      },
      data: { ownerId: null, ownedAt: null, ownerActedAt: null },
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'EXPIRE',
        fromUserId: 11,
        actorId: null,
        reason: "Muddatida harakat bo'lmadi",
      }),
    });
    expect(s.events.emit).toHaveBeenCalledWith(
      LEAD_OWNER_CHANGED,
      expect.objectContaining({ kind: 'EXPIRE', fromUserId: 11 }),
    );
  });

  it('leaves a lead that is still in time', async () => {
    const s = expirySetup();
    await expect(
      s.service.expireOverdue(at('2026-10-19', '11:59')),
    ).resolves.toBe(0);
    expect(s.tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it('goes on to the next lead when one lead fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const s = expirySetup(1, [OWNED, { ...OWNED, id: 'L2' }]);
    (s.prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error('db blip'),
    );
    await expect(
      s.service.expireOverdue(at('2026-10-19', '12:15')),
    ).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('lead L1 ownership expiry failed: db blip'),
    );
    expect(s.events.emit).toHaveBeenCalledTimes(1);
    expect(s.events.emit).toHaveBeenCalledWith(
      LEAD_OWNER_CHANGED,
      expect.objectContaining({ kind: 'EXPIRE', leadId: 'L2' }),
    );
    error.mockRestore();
  });

  it('skips a lead whose owner acted or changed since the read', async () => {
    const s = expirySetup(0);
    await expect(
      s.service.expireOverdue(at('2026-10-19', '12:15')),
    ).resolves.toBe(0);
    expect(s.tx.leadOwnershipLog.create).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });
});

describe('LeadOwnershipService.summary', () => {
  it('joins held, untouched, taken and expired per person', async () => {
    const s = setup();
    Object.assign(s.prisma, {
      lead: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ ownerId: 11, _count: { _all: 4 } }])
          .mockResolvedValueOnce([{ ownerId: 11, _count: { _all: 1 } }]),
      },
      leadOwnershipLog: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ toUserId: 11, _count: { _all: 6 } }])
          .mockResolvedValueOnce([{ fromUserId: 12, _count: { _all: 2 } }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 11, firstName: 'Nodira', lastName: 'R' },
          { id: 12, firstName: 'Farangiz', lastName: 'N' },
        ]),
      },
    });
    const out = await s.service.summary(1, [1], 'month');
    expect(out.rows).toEqual([
      {
        userId: 11,
        name: 'Nodira R',
        held: 4,
        untouched: 1,
        taken: 6,
        expired: 0,
      },
      {
        userId: 12,
        name: 'Farangiz N',
        held: 0,
        untouched: 0,
        taken: 0,
        expired: 2,
      },
    ]);
  });
});

describe('LeadOwnershipService.assignable', () => {
  it("lists the lead branch's staff who may claim leads", async () => {
    const s = setup();
    Object.assign(s.prisma, {
      lead: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 11, firstName: 'Nodira', lastName: 'R', photo: null },
          { id: 13, firstName: 'Bobur', lastName: 'K', photo: null },
        ]),
      },
    });
    const permissions = (
      s.service as unknown as { permissions: { has: jest.Mock } }
    ).permissions;
    permissions.has.mockImplementation(async (id: number) => id === 11);
    await expect(s.service.assignable('L1', 1, [1])).resolves.toEqual([
      { id: 11, firstName: 'Nodira', lastName: 'R', photo: null },
    ]);
  });
});
