import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentsService } from '../students/students.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: any;
  let history: any;
  let students: any;

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
      // Comment counts are grouped, not relation-counted (polymorphic table).
      comment: {
        groupBy: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    students = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: StudentsService, useValue: students },
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

    it('derives CONTACTED status from a fixed CONTACTED column', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'CONTACTED' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-2',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'CONTACTED',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, 1);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'CONTACTED',
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

    it('syncs status to CONTACTED when moved into a fixed CONTACTED column', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        sectionId: 'sec-1',
        statusEnum: 'NEW',
      });
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'CONTACTED' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: 1 } });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 1);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sectionId: 'sec-2',
            order: 2,
            statusEnum: 'CONTACTED',
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

  describe('remove', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes the lead and records history', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        sectionId: 'sec-1',
      });

      const result = await service.remove('lead-1', 1001, 1);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(result.sectionId).toBe('sec-1');
      expect(history.recordDelete).toHaveBeenCalled();
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
