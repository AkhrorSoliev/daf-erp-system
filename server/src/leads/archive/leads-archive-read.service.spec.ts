import { BadRequestException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { LeadsArchiveReadService } from './leads-archive-read.service';

describe('LeadsArchiveReadService', () => {
  let service: LeadsArchiveReadService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      lead: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      leadSection: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new LeadsArchiveReadService(prisma);
  });

  describe('listLeads', () => {
    it('pages the list, orders it steadily and reports the total', async () => {
      prisma.lead.count.mockResolvedValue(23);
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'l1',
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          lostReason: 'Qimmat',
          deletedAt: new Date('2026-10-01T10:00:00Z'),
          deletedBy: { id: 5, firstName: 'Ali', lastName: 'Valiyev' },
          section: null,
          statusEnum: LeadStatus.LOST,
          convertedStudentId: null,
          ownerId: 8,
        },
      ]);

      const res = await service.listLeads(1001, null, {
        page: 3,
        pageSize: 10,
      });

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(res).toMatchObject({ total: 23, page: 3, pageSize: 10 });
      expect(res.data[0]).toMatchObject({ id: 'l1', lostReason: 'Qimmat' });
      expect(res.data[0].notes).toHaveLength(2);
      // the raw owner / status columns are not leaked
      expect(res.data[0]).not.toHaveProperty('ownerId');
      expect(res.data[0]).not.toHaveProperty('statusEnum');
    });

    it('scopes by company and applies the archive filter', async () => {
      await service.listLeads(1001, null, { search: 'aziz', deletedById: [5] });
      const where = prisma.lead.count.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual(
        expect.objectContaining({ companyId: 1001 }),
      );
      expect(where.AND[1]).toEqual(
        expect.objectContaining({
          deletedAt: { not: null },
          deletedById: { in: [5] },
        }),
      );
    });

    it('refuses an impossible day before touching the database', async () => {
      await expect(
        service.listLeads(1001, null, { startDate: '2026-02-31' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.lead.count).not.toHaveBeenCalled();
    });
  });

  describe('listSections', () => {
    it('counts the leads each section would bring back', async () => {
      prisma.leadSection.count.mockResolvedValue(2);
      prisma.leadSection.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'Reklama',
          deletedAt: new Date(),
          deletionBatchId: 'b1',
          deletedBy: null,
          column: { id: 'c1', name: 'Yangi', branchId: 1, branch: null },
        },
        {
          id: 's2',
          name: 'Eski',
          deletedAt: new Date(),
          deletionBatchId: null,
          deletedBy: null,
          column: null,
        },
      ]);
      prisma.lead.groupBy
        .mockResolvedValueOnce([{ deletionBatchId: 'b1', _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ sectionId: 's2', _count: { _all: 5 } }]);

      const res = await service.listSections(1001, null, {});

      expect(res.total).toBe(2);
      expect(res.data).toEqual([
        expect.objectContaining({ id: 's1', leadCount: 2 }),
        expect.objectContaining({ id: 's2', leadCount: 5 }),
      ]);
      expect(res.data[0]).not.toHaveProperty('deletionBatchId');
      expect(res.data[0].column).toEqual({ id: 'c1', name: 'Yangi' });
    });
  });

  describe('getSummary', () => {
    it('returns unfiltered counts and the people who archived, once each, by name', async () => {
      prisma.lead.count.mockResolvedValue(12);
      prisma.leadSection.count.mockResolvedValue(3);
      prisma.lead.groupBy.mockResolvedValue([
        { deletedById: 9 },
        { deletedById: 5 },
        { deletedById: null },
      ]);
      prisma.leadSection.groupBy.mockResolvedValue([{ deletedById: 5 }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 9, firstName: 'Zafar', lastName: 'Aliyev' },
        { id: 5, firstName: 'Ali', lastName: 'Valiyev' },
      ]);

      const res = await service.getSummary(1001, null);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [9, 5] } } }),
      );
      expect(res).toEqual({
        leads: 12,
        sections: 3,
        archivers: [
          { id: 5, name: 'Ali Valiyev' },
          { id: 9, name: 'Zafar Aliyev' },
        ],
      });
    });

    it('does not ask for users when nobody is recorded', async () => {
      const res = await service.getSummary(1001, null);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(res.archivers).toEqual([]);
    });
  });

  describe('getArchivedLead', () => {
    const row = (extra: object = {}) => ({
      id: 'l1',
      firstName: 'Aziz',
      lastName: 'Karimov',
      statusEnum: LeadStatus.LOST,
      convertedStudentId: null,
      ownerId: 8,
      ownershipLogs: [],
      ...extra,
    });

    it('scopes to archived leads of the company and returns the panel shape', async () => {
      prisma.lead.findFirst = jest.fn().mockResolvedValue(row());
      const res = await service.getArchivedLead('l1', 1001, null);
      const arg = prisma.lead.findFirst.mock.calls[0][0];
      expect(arg.where.AND[0]).toMatchObject({
        id: 'l1',
        companyId: 1001,
        deletedAt: { not: null },
      });
      expect(res.notes).toHaveLength(2);
      expect(res).not.toHaveProperty('ownerId');
      expect(res.ownershipLog).toEqual([]);
    });

    it('404s when not archived or out of scope', async () => {
      prisma.lead.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.getArchivedLead('x', 1001, null)).rejects.toThrow(
        'Arxivda lid topilmadi',
      );
    });

    it('resolves names with one lookup; a system actor stays null; limit 30 newest first', async () => {
      const d = new Date('2026-10-01T10:00:00Z');
      prisma.lead.findFirst = jest.fn().mockResolvedValue(
        row({
          ownershipLogs: [
            {
              id: 'a',
              kind: 'EXPIRE',
              fromUserId: 5,
              toUserId: null,
              actorId: null,
              reason: null,
              createdAt: d,
            },
            {
              id: 'b',
              kind: 'ASSIGN',
              fromUserId: null,
              toUserId: 5,
              actorId: 6,
              reason: 'x',
              createdAt: d,
            },
          ],
        }),
      );
      prisma.user.findMany.mockResolvedValue([
        { id: 5, firstName: 'Ali', lastName: 'Valiyev' },
        { id: 6, firstName: 'Vali', lastName: 'Aliyev' },
      ]);
      const res = await service.getArchivedLead('l1', 1001, null);
      const sel = prisma.lead.findFirst.mock.calls[0][0].select.ownershipLogs;
      expect(sel).toMatchObject({
        take: 30,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(res.ownershipLog[0]).toMatchObject({
        from: 'Ali Valiyev',
        to: null,
        actor: null,
      });
      expect(res.ownershipLog[1]).toMatchObject({
        to: 'Ali Valiyev',
        actor: 'Vali Aliyev',
        reason: 'x',
      });
    });
  });
});
