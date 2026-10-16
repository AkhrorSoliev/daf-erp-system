import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
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
