import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveEntityType } from './dto/archive-query.dto';

/**
 * ADR-0092 / spec 6.3 rule 9: a lead restored from the archive returns to the
 * common pool, whichever door it comes back through. This is the generic
 * `/archive` door: one lead, or a whole deletion batch.
 */
describe('ArchiveRestoreService: owner of a restored lead (ADR-0092)', () => {
  const OWNED = {
    id: 'lead-1',
    firstName: 'Ali',
    lastName: 'Valiyev',
    statusEnum: 'LOST',
    ownerId: 11,
    branchId: 2,
    companyId: 1001,
    deletionBatchId: null,
  };
  let prisma: any;
  let tx: any;
  let statusHistory: any;
  let history: any;
  let ownership: { recordChange: jest.Mock; emit: jest.Mock };
  let service: ArchiveRestoreService;

  beforeEach(() => {
    const touched = () => ({ updateMany: jest.fn().mockResolvedValue({}) });
    tx = {
      lead: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      enrollmentStateLog: { createMany: jest.fn() },
      group: touched(),
      room: touched(),
      course: touched(),
      branch: touched(),
      student: touched(),
      user: touched(),
      holiday: touched(),
    };
    prisma = {
      lead: {
        findFirst: jest.fn().mockResolvedValue(OWNED),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    statusHistory = { changeStatus: jest.fn().mockResolvedValue({}) };
    history = { recordRestore: jest.fn(), recordUpdate: jest.fn() };
    ownership = { recordChange: jest.fn(), emit: jest.fn() };
    service = new ArchiveRestoreService(
      prisma,
      statusHistory,
      history,
      ownership as never,
    );
  });

  const restoreOne = () =>
    service.restore(ArchiveEntityType.LEADS, 'lead-1', 7, 1001);

  describe('one lead', () => {
    it('comes back without an owner, the release recorded in the same transaction', async () => {
      await restoreOne();

      expect(tx.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({
            deletedAt: null,
            statusEnum: 'NEW',
            ownerId: null,
            ownedAt: null,
            ownerActedAt: null,
          }),
        }),
      );
      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(ownership.recordChange).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          leadId: 'lead-1',
          leadName: 'Ali Valiyev',
          branchId: 2,
          kind: 'RELEASE',
          fromUserId: 11,
          toUserId: null,
          actorId: 7,
          reason: 'Arxivdan tiklandi',
          companyId: 1001,
        }),
      );
    });

    it('tells listeners only after the transaction commits', async () => {
      const order: string[] = [];
      ownership.recordChange.mockImplementation(() => {
        order.push('recordChange');
      });
      ownership.emit.mockImplementation(() => {
        order.push('emit');
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const r = await fn(tx);
        order.push('commit');
        return r;
      });

      await restoreOne();

      expect(order).toEqual(['recordChange', 'commit', 'emit']);
      expect(ownership.emit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'RELEASE', fromUserId: 11 }),
      );
    });

    it('restores a lead that has no owner as before', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...OWNED, ownerId: null });

      await restoreOne();

      expect(prisma.lead.update).toHaveBeenCalledTimes(1);
      expect(prisma.lead.update.mock.calls[0][0].data).not.toHaveProperty(
        'ownerId',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(ownership.recordChange).not.toHaveBeenCalled();
      expect(ownership.emit).not.toHaveBeenCalled();
    });
  });

  describe('a deletion batch', () => {
    const BATCH_LEAD = {
      id: 'lead-5',
      firstName: 'Vali',
      lastName: 'Aliyev',
      ownerId: 12,
      branchId: 3,
      companyId: 1001,
    };

    beforeEach(() => {
      prisma.lead.findFirst.mockResolvedValue({
        ...OWNED,
        deletionBatchId: 'batch-1',
      });
    });

    it('brings every lead of the batch back without an owner and records each release', async () => {
      tx.lead.findMany.mockResolvedValue([
        BATCH_LEAD,
        { ...BATCH_LEAD, id: 'lead-6', ownerId: 13 },
      ]);

      await restoreOne();

      expect(tx.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletionBatchId: 'batch-1', ownerId: { not: null } },
        }),
      );
      expect(tx.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletionBatchId: 'batch-1' },
          data: expect.objectContaining({
            statusEnum: 'NEW',
            ownerId: null,
            ownedAt: null,
            ownerActedAt: null,
          }),
        }),
      );
      expect(ownership.recordChange).toHaveBeenCalledTimes(2);
      expect(ownership.recordChange).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          leadId: 'lead-5',
          leadName: 'Vali Aliyev',
          branchId: 3,
          kind: 'RELEASE',
          fromUserId: 12,
          actorId: 7,
          reason: 'Arxivdan tiklandi',
          companyId: 1001,
        }),
      );
      expect(ownership.recordChange).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ leadId: 'lead-6', fromUserId: 13 }),
      );
    });

    it('tells listeners only after the batch transaction commits', async () => {
      tx.lead.findMany.mockResolvedValue([BATCH_LEAD]);
      const order: string[] = [];
      ownership.recordChange.mockImplementation(() => {
        order.push('recordChange');
      });
      ownership.emit.mockImplementation(() => {
        order.push('emit');
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const r = await fn(tx);
        order.push('commit');
        return r;
      });

      await restoreOne();

      expect(order).toEqual(['recordChange', 'commit', 'emit']);
    });

    it('records and tells nothing when no lead of the batch had an owner', async () => {
      await restoreOne();

      expect(tx.lead.updateMany).toHaveBeenCalled();
      expect(ownership.recordChange).not.toHaveBeenCalled();
      expect(ownership.emit).not.toHaveBeenCalled();
    });
  });
});
