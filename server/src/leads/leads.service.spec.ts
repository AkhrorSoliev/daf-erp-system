import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentsService } from '../students/students.service';
import { StudentEnrollmentService } from '../students/student-enrollment.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: any;
  let history: any;
  let students: any;
  let enrollment: any;

  const validDto = {
    firstName: 'Aziz',
    lastName: 'Karimov',
    phone: '901234567',
    sectionId: 'sec-1',
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      leadSection: { findFirst: jest.fn() },
      leadSource: { findFirst: jest.fn() },
      group: { findFirst: jest.fn() },
      // Comment counts are grouped, not relation-counted (polymorphic table).
      comment: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    students = { create: jest.fn() };
    enrollment = { enrollToGroup: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: StudentsService, useValue: students },
        { provide: StudentEnrollmentService, useValue: enrollment },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  describe('getSectionLeads', () => {
    it('throws NotFound when the section is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(service.getSectionLeads('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lists non-deleted leads of the section', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.lead.findMany.mockResolvedValue([]);
      await service.getSectionLeads('sec-1');
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sectionId: 'sec-1', deletedAt: null },
        }),
      );
    });

    it('attaches a comment count to each card (0 when none)', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', calledAt: null },
        { id: 'lead-2', calledAt: null },
      ]);
      prisma.comment.groupBy.mockResolvedValue([
        { entityId: 'lead-1', _count: { _all: 3 } },
      ]);

      const result = await service.getSectionLeads('sec-1');

      expect(prisma.comment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['entityId'],
          where: { entityType: 'Lead', entityId: { in: ['lead-1', 'lead-2'] } },
        }),
      );
      expect(result).toEqual([
        { id: 'lead-1', calledAt: null, commentCount: 3 },
        { id: 'lead-2', calledAt: null, commentCount: 0 },
      ]);
    });
  });

  describe('findAll', () => {
    it('applies search, status and column filters with pagination', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      const result = await service.findAll({
        search: 'Aziz',
        status: 'NEW' as any,
        columnId: 'col-1',
        page: 2,
        pageSize: 20,
      });

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            statusEnum: 'NEW',
            section: { columnId: 'col-1' },
            OR: expect.any(Array),
          }),
          skip: 20,
          take: 20,
        }),
      );
      expect(result).toEqual({ data: [], total: 0, page: 2, pageSize: 20 });
    });

    it('defaults to page 1 / size 10 with no filters', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({});

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('filters by contacted (called) leads', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ called: 'true' });

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ calledAt: { not: null } }),
        }),
      );
    });

    it('constrains by commented lead ids when hasComments=true', async () => {
      prisma.comment.findMany.mockResolvedValue([
        { entityId: 'lead-1' },
        { entityId: 'lead-2' },
      ]);
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ hasComments: 'true' });

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Lead' },
          distinct: ['entityId'],
        }),
      );
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['lead-1', 'lead-2'] },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('rejects an empty name', async () => {
      await expect(
        service.create({ ...validDto, firstName: '  ' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the section is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(service.create(validDto, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFound when the given source does not exist', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        column: { systemKey: 'NEW' },
      });
      prisma.leadSource.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ ...validDto, sourceId: 'src-x' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a NEW lead in a fixed NEW column and records history', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        column: { systemKey: 'NEW' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: 4 } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create(validDto, 1001, 1);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Aziz',
            lastName: 'Karimov',
            sectionId: 'sec-1',
            order: 5,
            statusEnum: 'NEW',
          }),
        }),
      );
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Lead', entityId: 'lead-1' }),
      );
    });

    it('creates a NEW lead in a custom column (status decoupled from column)', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: null },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-2',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, 1);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'NEW',
            order: 0,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.update('missing', { firstName: 'Yangi' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty first name', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      await expect(
        service.update('lead-1', { firstName: '   ' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the new source does not exist', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      prisma.leadSource.findFirst.mockResolvedValue(null);
      await expect(
        service.update('lead-1', { sourceId: 'src-x' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the lead and records history', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Azizbek',
        lastName: 'Karimov',
        phone: '901234567',
      });

      await service.update('lead-1', { firstName: 'Azizbek' }, 1001, 1);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { firstName: 'Azizbek' },
        }),
      );
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.move('missing', { sectionId: 'sec-2' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target section is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        sectionId: 'sec-1',
        statusEnum: 'NEW',
      });
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(
        service.move('lead-1', { sectionId: 'missing' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('resets status to NEW when moved into the fixed NEW column', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        sectionId: 'sec-1',
        statusEnum: 'CONTACTED',
      });
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: 1 } });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 1);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sectionId: 'sec-2',
            order: 2,
            statusEnum: 'NEW',
          }),
        }),
      );
      expect(history.recordUpdate).toHaveBeenCalled();
    });

    it('keeps the existing status when moved into a custom column', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        sectionId: 'sec-1',
        statusEnum: 'CONTACTED',
      });
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-9',
        column: { systemKey: null },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.move('lead-1', { sectionId: 'sec-9' }, 1001, 1);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sectionId: 'sec-9',
            order: 0,
            statusEnum: 'CONTACTED',
          }),
        }),
      );
    });
  });

  describe('reorder', () => {
    it('rejects a lead that does not belong to the section', async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['other'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a partial id list (full coverage required)', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);
      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['lead-1'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('renumbers the section leads inside a transaction', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);
      await service.reorder({
        sectionId: 'sec-1',
        leadIds: ['lead-2', 'lead-1'],
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-2' },
          data: { order: 0 },
        }),
      );
    });
  });

  describe('remove', () => {
    it('rejects an empty reason', async () => {
      await expect(
        service.remove('lead-1', { reason: '   ' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.remove('missing', { reason: 'Javob bermadi' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks the lead LOST with a reason, archives it and records the status change', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        sectionId: 'sec-1',
        statusEnum: 'NEW',
      });

      const result = await service.remove(
        'lead-1',
        { reason: 'Narx qimmat keldi' },
        1001,
        1,
      );

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({
            statusEnum: 'LOST',
            status: 'lost',
            lostReason: 'Narx qimmat keldi',
            deletedById: 1,
          }),
        }),
      );
      // The update payload must carry an archival timestamp.
      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(result.sectionId).toBe('sec-1');
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({
            status: 'LOST',
            lostReason: 'Narx qimmat keldi',
          }),
        }),
      );
    });
  });

  describe('convert', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.convert('missing', {}, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a lead that is already converted', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
        convertedStudentId: 10005,
      });
      await expect(service.convert('lead-1', {}, 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a student, links it and flags the lead CONVERTED', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        gender: null,
        telegram: null,
        parentPhone: null,
        parentName: null,
        statusEnum: 'NEW',
        convertedStudentId: null,
      });
      students.create.mockResolvedValue({ id: 10007 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      const result = await service.convert('lead-1', { branchId: 5 }, 1001, 1);

      expect(students.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Aziz',
          phone: '901234567',
          branchIds: [5],
        }),
        1001,
        1,
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'CONVERTED',
            convertedStudentId: 10007,
          }),
        }),
      );
      expect(result.studentId).toBe(10007);
      expect(history.recordStatusChange).toHaveBeenCalled();
      // No group requested → no enrollment attempt.
      expect(prisma.group.findFirst).not.toHaveBeenCalled();
      expect(enrollment.enrollToGroup).not.toHaveBeenCalled();
    });

    const convertibleLead = {
      id: 'lead-1',
      firstName: 'Aziz',
      lastName: 'Karimov',
      phone: '901234567',
      gender: null,
      telegram: null,
      parentPhone: null,
      parentName: null,
      statusEnum: 'NEW',
      convertedStudentId: null,
    };

    it('enrolls the new student into the chosen group using the group branch', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      // Group lives in branch 7 — that branch must win over dto.branchId (5).
      prisma.group.findFirst.mockResolvedValue({
        branchId: 7,
        statusEnum: 'ACTIVE',
      });
      students.create.mockResolvedValue({ id: 10008 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      const result = await service.convert(
        'lead-1',
        { branchId: 5, groupId: 'grp-1', startDate: '2026-06-28' },
        1001,
        1,
      );

      expect(students.create).toHaveBeenCalledWith(
        expect.objectContaining({ branchIds: [7] }),
        1001,
        1,
      );
      expect(enrollment.enrollToGroup).toHaveBeenCalledWith(
        10008,
        'grp-1',
        1,
        1001,
        { startDate: '2026-06-28' },
      );
      expect(result.studentId).toBe(10008);
    });

    it('throws NotFound when the chosen group is missing (no student created)', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.convert('lead-1', { groupId: 'missing' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
      expect(students.create).not.toHaveBeenCalled();
      expect(enrollment.enrollToGroup).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the chosen group is not enrollable', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      prisma.group.findFirst.mockResolvedValue({
        branchId: 7,
        statusEnum: 'COMPLETED',
      });

      await expect(
        service.convert('lead-1', { groupId: 'grp-done' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
      expect(students.create).not.toHaveBeenCalled();
      expect(enrollment.enrollToGroup).not.toHaveBeenCalled();
    });
  });

  describe('getHoverSummary', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.getHoverSummary('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns caller name + latest comment with composed names', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date('2026-06-16T10:00:00Z'),
        calledBy: { id: 7, firstName: 'Olim', lastName: 'Aliyev' },
      });
      prisma.comment.findFirst.mockResolvedValue({
        content: 'Ertaga qayta qo‘ng‘iroq',
        createdAt: new Date('2026-06-16T11:00:00Z'),
        isTask: false,
        author: { firstName: 'Dilnoza', lastName: 'Karimova' },
      });

      const result = await service.getHoverSummary('lead-1');

      expect(prisma.comment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Lead', entityId: 'lead-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.calledBy).toEqual({ id: 7, name: 'Olim Aliyev' });
      expect(result.latestComment).toEqual(
        expect.objectContaining({
          authorName: 'Dilnoza Karimova',
          content: 'Ertaga qayta qo‘ng‘iroq',
          isTask: false,
        }),
      );
    });

    it('returns nulls when the lead was never called and has no comments', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-2',
        calledAt: null,
        calledBy: null,
      });
      prisma.comment.findFirst.mockResolvedValue(null);

      const result = await service.getHoverSummary('lead-2');

      expect(result).toEqual({
        calledAt: null,
        calledBy: null,
        latestComment: null,
      });
    });
  });

  describe('markCalled', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.markCalled('missing', { called: true }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('stamps calledAt/calledById when marking called and records history', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', calledAt: null });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date('2026-06-16T10:00:00Z'),
      });

      await service.markCalled('lead-1', { called: true }, 1001, 7);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({ calledById: 7 }),
        }),
      );
      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data.calledAt).toBeInstanceOf(Date);
      expect(history.recordUpdate).toHaveBeenCalled();
    });

    it('keeps the original caller and timestamp when re-marking an already-called lead', async () => {
      const original = new Date('2026-06-01T08:00:00Z');
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: original,
      });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1', calledAt: original });

      // A different user (9) re-marks; neither the timestamp nor the caller
      // identity may change — the (when, who) pair must stay coherent.
      await service.markCalled('lead-1', { called: true }, 1001, 9);

      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data.calledAt).toBeUndefined();
      expect(data.calledById).toBeUndefined();
    });

    it('clears the marker when called is false', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date(),
      });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1', calledAt: null });

      await service.markCalled('lead-1', { called: false }, 1001, 7);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { calledAt: null, calledById: null },
        }),
      );
    });
  });
});
