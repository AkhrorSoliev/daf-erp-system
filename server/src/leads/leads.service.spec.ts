import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeadsService } from './leads.service';
import { leadStatsRange } from './leads-stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentsService } from '../students/students.service';
import { StudentEnrollmentService } from '../students/student-enrollment.service';
import { PermissionsService } from '../common/permissions/permissions.service';
import { fakePermissions } from '../common/permissions/testing';
import { ROLE_ID } from '../common/auth/role-ids';
import { LeadOwnershipService } from './ownership/lead-ownership.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: any;
  let history: any;
  let students: any;
  let enrollment: any;
  let events: { emit: jest.Mock };
  let ownership: {
    recordChange: jest.Mock;
    emit: jest.Mock;
    dueResolver: jest.Mock;
  };

  const validDto = {
    firstName: 'Aziz',
    lastName: 'Karimov',
    phone: '901234567',
    sectionId: 'sec-1',
  };

  // Callers as `resolveCallerBranchScope` reads them (`prisma.user.findFirst`).
  const CEO_ROW = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const adminOf = (branchId: number) => ({
    mainBranch: branchId,
    branches: [{ branchId }],
    roles: [{ role: { name: 'Administrator' } }],
  });
  // The signed-in employee behind `POST /leads`.
  const CALLER = { kind: 'user', id: 1 } as const;

  beforeEach(async () => {
    prisma = {
      lead: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        // ADR-0093: the owner's action stamp (touchLeadOwnerAction).
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn(),
      },
      leadSection: { findFirst: jest.fn() },
      leadSource: { findFirst: jest.fn() },
      group: { findFirst: jest.fn() },
      // Phone-based duplicate lookup (findOne matched-student + convert guard).
      // Defaults to "no existing student" so create/convert paths proceed.
      // findMany backs the "aylanganlar" name lookup in findAll.
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Backup-number rule (ADR-0070): another student account on the number.
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      mockExamParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      // Comment counts are grouped, not relation-counted (polymorphic table).
      comment: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest
        .fn()
        .mockImplementation((arg: any) =>
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
    events = { emit: jest.fn() };
    ownership = {
      recordChange: jest.fn(),
      emit: jest.fn(),
      // ADR-0093: every card asks for its deadline; no lead has one here.
      dueResolver: jest.fn().mockResolvedValue(() => null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: StudentsService, useValue: students },
        { provide: StudentEnrollmentService, useValue: enrollment },
        { provide: EventEmitter2, useValue: events },
        {
          provide: PermissionsService,
          useValue: fakePermissions([ROLE_ID.ADMINISTRATOR]),
        },
        { provide: LeadOwnershipService, useValue: ownership },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  describe('getSectionLeads', () => {
    it('throws NotFound when the section is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(
        service.getSectionLeads('missing', 1001, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('lists non-deleted, non-converted leads of the section', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.lead.findMany.mockResolvedValue([]);
      await service.getSectionLeads('sec-1', 1001, null);
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sectionId: 'sec-1',
            deletedAt: null,
            // Company scoping is now part of the query — this assertion used to
            // pass only because the argument was silently `undefined`.
            companyId: 1001,
            statusEnum: { not: 'CONVERTED' },
          },
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

      const result = await service.getSectionLeads('sec-1', 1001, null);

      expect(prisma.comment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['entityId'],
          where: {
            entityType: 'Lead',
            entityId: { in: ['lead-1', 'lead-2'] },
            // A migrated task is not a comment.
            isTask: false,
          },
        }),
      );
      expect(result).toEqual([
        { id: 'lead-1', calledAt: null, commentCount: 3, ownerDueAt: null },
        { id: 'lead-2', calledAt: null, commentCount: 0, ownerDueAt: null },
      ]);
    });

    it('selects the owner and gives each card its server-computed deadline (ADR-0093)', async () => {
      const due = new Date('2026-10-19T07:00:00Z');
      ownership.dueResolver.mockResolvedValue(
        (l: { ownerId: number | null }) => (l.ownerId === 11 ? due : null),
      );
      prisma.leadSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', ownerId: 11 },
        { id: 'lead-2', ownerId: null },
      ]);

      const result = await service.getSectionLeads('sec-1', 1001, null);

      const select = prisma.lead.findMany.mock.calls[0][0].select;
      expect(select).toEqual(
        expect.objectContaining({
          branchId: true,
          ownerId: true,
          ownedAt: true,
          ownerActedAt: true,
          owner: { select: { id: true, firstName: true, lastName: true } },
        }),
      );
      expect(ownership.dueResolver).toHaveBeenCalledTimes(1);
      expect(ownership.dueResolver).toHaveBeenCalledWith(1001);
      expect(result.map((l) => l.ownerDueAt)).toEqual([due, null]);
    });

    it('asks for no deadlines when the section is empty', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.lead.findMany.mockResolvedValue([]);

      await service.getSectionLeads('sec-1', 1001, null);

      expect(ownership.dueResolver).not.toHaveBeenCalled();
    });

    it('reads no settings or holidays when no lead has a running clock', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      // One lead nobody owns, one whose owner is frozen by the conversion.
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', ownerId: null, statusEnum: 'NEW' },
        { id: 'lead-2', ownerId: 11, statusEnum: 'CONVERTED' },
      ]);

      const result = await service.getSectionLeads('sec-1', 1001, null);

      expect(ownership.dueResolver).not.toHaveBeenCalled();
      expect(result.map((l) => l.ownerDueAt)).toEqual([null, null]);
    });
  });

  describe('card', () => {
    it('returns one card with its comment count and owner deadline', async () => {
      const due = new Date('2026-10-19T07:00:00Z');
      ownership.dueResolver.mockResolvedValue(() => due);
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', ownerId: 11 });
      prisma.comment.groupBy.mockResolvedValue([
        { entityId: 'lead-1', _count: { _all: 2 } },
      ]);

      const card = await service.card('lead-1', 1001);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-1', companyId: 1001 } }),
      );
      expect(card).toEqual({
        id: 'lead-1',
        ownerId: 11,
        commentCount: 2,
        ownerDueAt: due,
      });
    });

    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.card('missing', 1001)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('a stats card lists exactly what the card counts, archived leads included', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(
        { card: 'created', period: 'week', search: 'Ali' },
        1001,
        [3],
      );

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('deletedAt');
      expect(where.sectionId).toEqual({ not: null });
      expect(where.createdAt).toEqual(leadStatsRange('week', new Date()));
      // The search OR must not replace the branch predicate.
      expect(where.AND).toEqual([
        { OR: [{ branchId: { in: [3] } }, { branchId: null }] },
      ]);
      expect(where.OR).toBeDefined();
    });

    it('bir nechta bosqich tanlansa `in` bilan filtrlaydi', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(
        { status: ['NEW', 'CONVERTED'] as any },
        1001,
        null,
      );

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            statusEnum: { in: ['NEW', 'CONVERTED'] },
          }),
        }),
      );
    });

    it("bosqich bilan aloqa filtri BIRGA qo'llanadi (o'lchamlar orasida AND)", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(
        { status: ['NEW'] as any, called: 'false' },
        1001,
        null,
      );

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.statusEnum).toBe('NEW');
      expect(where.calledAt).toBeNull();
    });

    it('bir nechta ustun va manba tanlansa `in` bilan filtrlaydi', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(
        { columnId: ['col-1', 'col-2'], sourceId: ['s-1', 's-2'] },
        1001,
        null,
      );

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            section: { columnId: { in: ['col-1', 'col-2'] } },
            sourceId: { in: ['s-1', 's-2'] },
          }),
        }),
      );
    });

    it('applies search, status and column filters with pagination', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      const result = await service.findAll(
        {
          search: 'Aziz',
          status: ['NEW'] as any,
          columnId: ['col-1'],
          page: 2,
          pageSize: 20,
        },
        1001,
        null,
      );

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

      await service.findAll({}, 1001, null);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null, companyId: 1001 }),
          skip: 0,
          take: 10,
        }),
      );
    });

    it('confines the list to the caller branch plus the unassigned pool', async () => {
      // `Lead` had NO tenancy at all — this list returned every lead in the
      // database. Null-branch leads stay visible because a lead from the public
      // form arrives before anyone knows which branch it belongs to.
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({}, 1001, [2]);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(1001);
      expect(where.AND).toEqual([
        { OR: [{ branchId: { in: [2] } }, { branchId: null }] },
      ]);
    });

    it('keeps the branch confinement when a search term is present', async () => {
      // Both the branch predicate and the search filter produce an `OR`; the
      // branch one lives under AND so the search cannot overwrite it.
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ search: 'Aziz' }, 1001, [2]);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { OR: [{ branchId: { in: [2] } }, { branchId: null }] },
      ]);
      expect(where.OR).toBeDefined();
    });

    it('filters by contacted (called) leads', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ called: 'true' }, 1001, null);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ calledAt: { not: null } }),
        }),
      );
    });

    it("«Mas'ul» filtri: meniki, egasiz va tanlangan xodimlar YOKI bilan", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ owner: ['me', 'none', '10500'] }, 1001, null, 7);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({
        OR: [{ ownerId: { in: [10500, 7] } }, { ownerId: null }],
      });
    });

    it("«Mas'ul» filtri filial chegarasini o'chirmaydi", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ owner: ['none'] }, 1001, [2], 7);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { OR: [{ branchId: { in: [2] } }, { branchId: null }] },
        { OR: [{ ownerId: null }] },
      ]);
    });

    it("«Mas'ul» filtri: 'me' bo'lsa-yu foydalanuvchi noma'lum bo'lsa, faqat qolganlari", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ owner: ['me'] }, 1001, null);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(where)).not.toContain('ownerId');
    });

    it('constrains by commented lead ids when hasComments=true', async () => {
      prisma.comment.findMany.mockResolvedValue([
        { entityId: 'lead-1' },
        { entityId: 'lead-2' },
      ]);
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ hasComments: 'true' }, 1001, null);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Lead', isTask: false },
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

  describe('LeadsService.findAll — aylanganlar hisoboti', () => {
    it("aylangan lidga o'quvchi ma'lumotini biriktiradi", async () => {
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901234567',
          statusEnum: 'CONVERTED',
          createdAt: new Date('2026-09-01'),
          statusChangedAt: new Date('2026-09-05'),
          convertedStudentId: 555,
          source: null,
          section: null,
        },
      ]);
      prisma.lead.count.mockResolvedValue(1);
      prisma.student.findMany.mockResolvedValue([
        { id: 555, firstName: 'Ali', lastName: 'Valiyev' },
      ]);

      const res = await service.findAll({} as any, 1001, null);

      expect(res.data[0].convertedStudent).toEqual({
        id: 555,
        firstName: 'Ali',
        lastName: 'Valiyev',
      });
    });

    // F3 — o'quvchi qidiruvi kompaniya va arxiv bo'yicha ham chegaralanadi:
    // arxivlangan o'quvchi 404 beradigan havola bo'lib chiqardi, so'rovning
    // o'zi esa ijarachi chegarasidan bitta xatolik narida turardi.
    it("aylangan o'quvchini kompaniya ichidan va arxivsiz qidiradi", async () => {
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901234567',
          statusEnum: 'CONVERTED',
          createdAt: new Date('2026-09-01'),
          statusChangedAt: new Date('2026-09-05'),
          convertedStudentId: 555,
          source: null,
          section: null,
        },
      ]);
      prisma.lead.count.mockResolvedValue(1);
      prisma.student.findMany.mockResolvedValue([]);

      await service.findAll({} as any, 1001, null);

      expect(prisma.student.findMany).toHaveBeenCalledWith({
        where: { id: { in: [555] }, companyId: 1001, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      });
    });

    it("dateField=statusChangedAt bo'lsa sana filtri aylangan sanaga tushadi", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll(
        { dateField: 'statusChangedAt', startDate: '2026-09-01' } as any,
        1001,
        null,
      );

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.statusChangedAt).toBeDefined();
      expect(where.createdAt).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing', 1001, null)).rejects.toThrow(
        NotFoundException,
      );
    });

    // Telefon noyob emas: boshqa kompaniyaning o'quvchisi yoki mock
    // ishtirokchisi shu lidga "tegishli" bo'lib ko'rinmasin.
    it('matches mock sign-ups and the student by phone within the company', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        phone: '901234567',
      });

      await service.findOne('lead-1', 1001, null);

      expect(prisma.mockExamParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: '901234567',
            companyId: 1001,
          }),
        }),
      );
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: '901234567',
            companyId: 1001,
          }),
        }),
      );
    });

    it('returns the owner and the server-computed deadline (ADR-0093)', async () => {
      const due = new Date('2026-10-19T07:00:00Z');
      ownership.dueResolver.mockResolvedValue(() => due);
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        phone: '901234567',
        ownerId: 11,
        owner: { id: 11, firstName: 'Nodira', lastName: 'R' },
      });

      const lead = await service.findOne('lead-1', 1001, null);

      const select = prisma.lead.findFirst.mock.calls[0][0].select;
      expect(select).toEqual(
        expect.objectContaining({
          branchId: true,
          ownerId: true,
          ownedAt: true,
          ownerActedAt: true,
          owner: { select: { id: true, firstName: true, lastName: true } },
        }),
      );
      expect(lead.ownerDueAt).toEqual(due);
      expect(lead.owner).toEqual({
        id: 11,
        firstName: 'Nodira',
        lastName: 'R',
      });
    });

    // Lid oynasi to'lov holatini ko'rsatadi — bepul (yoki DaF uchun bepul)
    // imtihonda "To'lov kutilmoqda" chiqmasligi uchun summa kerak.
    it('returns the locked fee with each mock sign-up', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        phone: '901234567',
      });

      await service.findOne('lead-1', 1001, null);

      const select =
        prisma.mockExamParticipant.findMany.mock.calls[0][0].select;
      expect(select.feeAmount).toBe(true);
      expect(select.exam.select.price).toBe(true);
    });
  });

  describe('create', () => {
    // The cases below are about the lead itself; a CEO holds every branch.
    beforeEach(() => prisma.user.findFirst.mockResolvedValue(CEO_ROW));

    it('rejects an empty name', async () => {
      await expect(
        service.create({ ...validDto, firstName: '  ' }, 1001, CALLER),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the section is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(service.create(validDto, 1001, CALLER)).rejects.toThrow(
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
        service.create({ ...validDto, sourceId: 'src-x' }, 1001, CALLER),
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

      await service.create(validDto, 1001, CALLER);

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

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'NEW',
            order: 0,
          }),
        }),
      );
    });

    it("qo'shimcha telefon berilsa uni saqlaydi", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        column: { systemKey: 'NEW' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: '911112233',
        statusEnum: 'NEW',
      });

      await service.create(
        { ...validDto, extraPhone: '911112233' },
        1001,
        CALLER,
      );

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ extraPhone: '911112233' }),
        }),
      );
    });

    it("qo'shimcha telefon berilmasa null yozadi", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        column: { systemKey: 'NEW' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: null,
        statusEnum: 'NEW',
      });

      await service.create(validDto, 1001, CALLER);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ extraPhone: null }),
        }),
      );
    });

    it("refuses a section on another branch's board and writes nothing", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.user.findFirst.mockResolvedValue(adminOf(1));

      await expect(
        service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, deletedAt: null } }),
      );
      expect(prisma.lead.aggregate).not.toHaveBeenCalled();
      expect(prisma.lead.create).not.toHaveBeenCalled();
      expect(history.recordCreate).not.toHaveBeenCalled();
    });

    it("creates the lead on the caller's own branch board", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.user.findFirst.mockResolvedValue(adminOf(2));
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-3',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2, companyId: 1001 }),
        }),
      );
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ changedById: 1 }),
      );
    });

    it("lets a CEO create a lead on any branch's board", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-4',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2 }),
        }),
      );
    });

    it('a public-form submission creates the lead with no caller check and no actor in history', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-5',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, {
        kind: 'public-form',
      });

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2 }),
        }),
      );
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ changedById: undefined }),
      );
    });

    describe('owner (ADR-0093)', () => {
      beforeEach(() => {
        prisma.leadSection.findFirst.mockResolvedValue({
          id: 'sec-2',
          column: { systemKey: 'NEW', branchId: 2 },
        });
        prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
        prisma.lead.create.mockResolvedValue({
          id: 'lead-6',
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          statusEnum: 'NEW',
        });
      });

      it('makes the staff member who adds a lead its owner, the creation counting as the first action', async () => {
        await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

        const data = prisma.lead.create.mock.calls[0][0].data;
        expect(data.ownerId).toBe(1);
        expect(data.ownedAt).toBeInstanceOf(Date);
        expect(data.ownerActedAt).toBeInstanceOf(Date);
        expect(ownership.recordChange).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            leadId: 'lead-6',
            kind: 'CLAIM',
            fromUserId: null,
            toUserId: 1,
            actorId: 1,
            branchId: 2,
            companyId: 1001,
            reason: "Lidni o'zi qo'shdi",
          }),
        );
        expect(ownership.emit).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'CLAIM', toUserId: 1 }),
        );
      });

      describe('one transaction', () => {
        // A client of its own, so a write that bypasses the transaction shows.
        let tx: { lead: { create: jest.Mock } };
        let committed: boolean;
        let committedAtEmit: boolean | null;

        beforeEach(() => {
          tx = {
            lead: {
              create: jest.fn().mockResolvedValue({
                id: 'lead-6',
                firstName: 'Aziz',
                lastName: 'Karimov',
                phone: '901234567',
                statusEnum: 'NEW',
                ownerId: 1,
              }),
            },
          };
          committed = false;
          committedAtEmit = null;
          prisma.$transaction.mockImplementation(async (fn: any) => {
            const result = await fn(tx);
            committed = true;
            return result;
          });
          ownership.emit.mockImplementation(() => {
            committedAtEmit = committed;
          });
        });

        it('writes the lead, its history row and the ownership log on the same client', async () => {
          await service.create(
            { ...validDto, sectionId: 'sec-2' },
            1001,
            CALLER,
          );

          expect(tx.lead.create).toHaveBeenCalledTimes(1);
          expect(prisma.lead.create).not.toHaveBeenCalled();
          expect(history.recordCreate).toHaveBeenCalledWith(
            expect.objectContaining({ entityId: 'lead-6', tx }),
          );
          expect(ownership.recordChange).toHaveBeenCalledWith(
            tx,
            expect.objectContaining({ leadId: 'lead-6', kind: 'CLAIM' }),
          );
        });

        it('tells listeners only after the commit', async () => {
          await service.create(
            { ...validDto, sectionId: 'sec-2' },
            1001,
            CALLER,
          );

          expect(ownership.emit).toHaveBeenCalledTimes(1);
          expect(committedAtEmit).toBe(true);
        });

        it('announces nothing when the ownership log cannot be written', async () => {
          ownership.recordChange.mockRejectedValue(new Error('log failed'));

          await expect(
            service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER),
          ).rejects.toThrow('log failed');

          expect(committed).toBe(false);
          expect(ownership.emit).not.toHaveBeenCalled();
        });

        it('keeps the lead and its history in the transaction when nobody owns it', async () => {
          await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, {
            kind: 'public-form',
          });

          expect(tx.lead.create).toHaveBeenCalledTimes(1);
          expect(history.recordCreate).toHaveBeenCalledWith(
            expect.objectContaining({ entityId: 'lead-6', tx }),
          );
          expect(ownership.recordChange).not.toHaveBeenCalled();
          expect(ownership.emit).not.toHaveBeenCalled();
        });
      });

      it('answers with the new card and its deadline', async () => {
        const due = new Date('2026-10-19T07:00:00Z');
        ownership.dueResolver.mockResolvedValue(() => due);
        // The owned row the insert returns, as the real card select carries it.
        prisma.lead.create.mockResolvedValue({
          id: 'lead-6',
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          statusEnum: 'NEW',
          ownerId: 1,
        });

        const card = await service.create(
          { ...validDto, sectionId: 'sec-2' },
          1001,
          CALLER,
        );

        expect(card.ownerDueAt).toEqual(due);
        expect(card.commentCount).toBe(0);
      });

      it('leaves a public-form lead without an owner', async () => {
        await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, {
          kind: 'public-form',
        });

        const data = prisma.lead.create.mock.calls[0][0].data;
        expect(data.ownerId).toBeNull();
        expect(data.ownedAt).toBeNull();
        expect(data.ownerActedAt).toBeNull();
        expect(ownership.recordChange).not.toHaveBeenCalled();
        expect(ownership.emit).not.toHaveBeenCalled();
      });

      it('leaves a lead without an owner when the staff member may not claim leads', async () => {
        // A teacher holds no leads.claim; the caller is still let in to add it.
        const module = await Test.createTestingModule({
          providers: [
            LeadsService,
            { provide: PrismaService, useValue: prisma },
            { provide: EntityHistoryService, useValue: history },
            { provide: StudentsService, useValue: students },
            { provide: StudentEnrollmentService, useValue: enrollment },
            { provide: EventEmitter2, useValue: events },
            {
              provide: PermissionsService,
              useValue: fakePermissions([ROLE_ID.TEACHER]),
            },
            { provide: LeadOwnershipService, useValue: ownership },
          ],
        }).compile();

        await module
          .get(LeadsService)
          .create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

        expect(prisma.lead.create.mock.calls[0][0].data.ownerId).toBeNull();
        expect(ownership.recordChange).not.toHaveBeenCalled();
      });
    });
  });

  describe('update', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.update('missing', { firstName: 'Yangi' }, 1001, 1, null),
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
        service.update('lead-1', { firstName: '   ' }, 1001, 1, null),
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
        service.update('lead-1', { sourceId: 'src-x' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps the current source even when it was archived since', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        sourceId: 'src-old',
      });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.update(
        'lead-1',
        { firstName: 'Aziz', sourceId: 'src-old' },
        1001,
        1,
        null,
      );

      expect(prisma.leadSource.findFirst).not.toHaveBeenCalled();
      expect(prisma.lead.update).toHaveBeenCalled();
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

      await service.update('lead-1', { firstName: 'Azizbek' }, 1001, 1, null);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: { firstName: 'Azizbek' },
        }),
      );
      expect(history.recordUpdate).toHaveBeenCalled();
    });

    it('answers with the card, deadline included (ADR-0093)', async () => {
      const due = new Date('2026-10-19T07:00:00Z');
      ownership.dueResolver.mockResolvedValue(() => due);
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      // An owned lead: only a running clock asks for a deadline.
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Azizbek',
        ownerId: 11,
      });

      const card = await service.update(
        'lead-1',
        { firstName: 'Azizbek' },
        1001,
        1,
        null,
      );

      expect(card).toEqual({
        id: 'lead-1',
        firstName: 'Azizbek',
        ownerId: 11,
        commentCount: 0,
        ownerDueAt: due,
      });
    });

    it("qo'shimcha telefonni yangilaydi", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: null,
      });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: '911112233',
      });

      await service.update(
        'lead-1',
        { extraPhone: '911112233' },
        1001,
        1,
        null,
      );

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { extraPhone: '911112233' } }),
      );
    });

    it("bo'sh satr yuborilsa qo'shimcha telefonni tozalaydi", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: '911112233',
      });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: null,
      });

      await service.update('lead-1', { extraPhone: '' }, 1001, 1, null);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { extraPhone: null } }),
      );
    });

    it("qo'shimcha telefon o'zgarishini tarixga yozadi", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: null,
      });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        extraPhone: '911112233',
      });

      await service.update(
        'lead-1',
        { extraPhone: '911112233' },
        1001,
        1,
        null,
      );

      expect(history.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: expect.objectContaining({ extraPhone: null }),
          newValues: expect.objectContaining({ extraPhone: '911112233' }),
        }),
      );
    });
  });

  describe('move', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.move('missing', { sectionId: 'sec-2' }, 1001, 1, null),
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
        service.move('lead-1', { sectionId: 'missing' }, 1001, 1, null),
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

      await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 1, null);

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

      await service.move('lead-1', { sectionId: 'sec-9' }, 1001, 1, null);

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

    describe('owner and branch (ADR-0093)', () => {
      const OWNED_LEAD = {
        id: 'lead-1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        sectionId: 'sec-1',
        statusEnum: 'NEW',
        branchId: 1,
        ownerId: 11,
      };
      // A client of its own, so a write that bypasses the transaction shows.
      let tx: { lead: { updateMany: jest.Mock; update: jest.Mock } };
      let committed: boolean;
      let committedAtEmit: boolean | null;

      const setupMove = (
        lead: object,
        branchId: number,
        updateManyCount = 1,
      ) => {
        prisma.lead.findFirst.mockResolvedValue(lead);
        prisma.leadSection.findFirst.mockResolvedValue({
          id: 'sec-2',
          column: { systemKey: null, branchId },
        });
        prisma.lead.aggregate.mockResolvedValue({ _max: { order: 1 } });
        tx.lead.updateMany.mockResolvedValue({ count: updateManyCount });
      };

      beforeEach(() => {
        tx = {
          lead: {
            updateMany: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: 'lead-1' }),
          },
        };
        committed = false;
        committedAtEmit = null;
        prisma.$transaction.mockImplementation(async (fn: any) => {
          const result = await fn(tx);
          committed = true;
          return result;
        });
        ownership.emit.mockImplementation(() => {
          committedAtEmit = committed;
        });
      });

      it("releases the owner in the move's own transaction when the branch changes", async () => {
        setupMove(OWNED_LEAD, 2);

        await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null);

        expect(tx.lead.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'lead-1',
            ownerId: 11,
            statusEnum: { not: 'CONVERTED' },
          },
          data: { ownerId: null, ownedAt: null, ownerActedAt: null },
        });
        expect(ownership.recordChange).toHaveBeenCalledWith(tx, {
          leadId: 'lead-1',
          leadName: 'Aziz Karimov',
          // The branch the owner worked in.
          branchId: 1,
          kind: 'RELEASE',
          fromUserId: 11,
          toUserId: null,
          actorId: 5,
          reason: "Boshqa filialga o'tkazildi",
          companyId: 1001,
        });
        // The move itself and its history row are in the same transaction.
        expect(tx.lead.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ branchId: 2 }),
          }),
        );
        expect(prisma.lead.update).not.toHaveBeenCalled();
        expect(history.recordUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ entityId: 'lead-1', tx }),
        );
      });

      it('tells listeners only after the commit', async () => {
        setupMove(OWNED_LEAD, 2);

        await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null);

        expect(ownership.emit).toHaveBeenCalledTimes(1);
        expect(ownership.emit).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'RELEASE', fromUserId: 11 }),
        );
        expect(committedAtEmit).toBe(true);
      });

      it('answers with a card that no longer names the old owner', async () => {
        setupMove(OWNED_LEAD, 2);
        // The card is read after the release, inside the transaction.
        tx.lead.update.mockImplementation(async () => ({
          id: 'lead-1',
          ownerId: tx.lead.updateMany.mock.calls.length ? null : 11,
        }));

        const card = await service.move(
          'lead-1',
          { sectionId: 'sec-2' },
          1001,
          5,
          null,
        );

        expect(card.ownerId).toBeNull();
      });

      it('keeps the owner when the lead stays in its branch', async () => {
        setupMove(OWNED_LEAD, 1);

        await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null);

        expect(tx.lead.updateMany).not.toHaveBeenCalled();
        expect(ownership.recordChange).not.toHaveBeenCalled();
        expect(ownership.emit).not.toHaveBeenCalled();
      });

      it('refuses to move a converted lead and keeps its owner', async () => {
        setupMove({ ...OWNED_LEAD, statusEnum: 'CONVERTED' }, 2);

        await expect(
          service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null),
        ).rejects.toThrow("O'quvchiga aylangan lidni ko'chirib bo'lmaydi");

        expect(tx.lead.updateMany).not.toHaveBeenCalled();
        expect(tx.lead.update).not.toHaveBeenCalled();
        expect(ownership.recordChange).not.toHaveBeenCalled();
      });

      it('has nothing to release on a lead nobody owns', async () => {
        setupMove({ ...OWNED_LEAD, ownerId: null }, 2);

        await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null);

        expect(tx.lead.updateMany).not.toHaveBeenCalled();
        expect(ownership.recordChange).not.toHaveBeenCalled();
      });

      it('logs and announces nothing when the owner changed since the read', async () => {
        setupMove(OWNED_LEAD, 2, 0);

        await service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null);

        expect(ownership.recordChange).not.toHaveBeenCalled();
        expect(ownership.emit).not.toHaveBeenCalled();
        // The move itself still goes through.
        expect(tx.lead.update).toHaveBeenCalled();
      });

      it('announces nothing when the move fails after the release', async () => {
        setupMove(OWNED_LEAD, 2);
        tx.lead.update.mockRejectedValue(new Error('update failed'));

        await expect(
          service.move('lead-1', { sectionId: 'sec-2' }, 1001, 5, null),
        ).rejects.toThrow('update failed');

        expect(committed).toBe(false);
        expect(ownership.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('reorder', () => {
    beforeEach(() => {
      // A section on branch 2's board; the caller holds branch 2.
      prisma.leadSection.findFirst.mockResolvedValue({
        column: { branchId: 2 },
      });
      prisma.user.findFirst.mockResolvedValue(adminOf(2));
    });

    it("throws NotFound when the section is not the company's", async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);

      await expect(
        service.reorder({ sectionId: 'sec-x', leadIds: ['lead-1'] }, 1001, 1),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.leadSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-x', deletedAt: null, companyId: 1001 },
        }),
      );
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it("refuses a section on another branch's board and reorders nothing", async () => {
      prisma.user.findFirst.mockResolvedValue(adminOf(1));

      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['lead-1'] }, 1001, 1),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it("lets a CEO reorder any branch's section", async () => {
      prisma.user.findFirst.mockResolvedValue(CEO_ROW);
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

      await service.reorder(
        { sectionId: 'sec-1', leadIds: ['lead-1'] },
        1001,
        1,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects a lead that does not belong to the section', async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['other'] }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a partial id list (full coverage required)', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);
      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['lead-1'] }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('renumbers the section leads inside a transaction', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);
      await service.reorder(
        { sectionId: 'sec-1', leadIds: ['lead-2', 'lead-1'] },
        1001,
        1,
      );
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
        service.remove('lead-1', { reason: '   ' }, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.remove('missing', { reason: 'Javob bermadi' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to delete a converted lead', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        sectionId: 'sec-1',
        statusEnum: 'CONVERTED',
      });

      await expect(
        service.remove('lead-1', { reason: 'Xato' }, 1001, 1, null),
      ).rejects.toThrow("O'quvchiga aylangan lidni o'chirib bo'lmaydi");

      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(history.recordStatusChange).not.toHaveBeenCalled();
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
        null,
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
      await expect(
        service.convert('missing', {}, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
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
      await expect(
        service.convert('lead-1', {}, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
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

      const result = await service.convert(
        'lead-1',
        { branchId: 5 },
        1001,
        1,
        null,
      );

      expect(students.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Aziz',
          phone: '901234567',
          branchIds: [5],
        }),
        1001,
        1,
        { kind: 'LEAD', leadId: 'lead-1' },
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'CONVERTED',
            convertedStudentId: 10007,
            statusChangeReason: null,
          }),
        }),
      );
      expect(result.studentId).toBe(10007);
      // Fresh convert → history badge marker "aylantirildi".
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({ action: 'LID_AYLANTIRILDI' }),
        }),
      );
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

    it("lidning qo'shimcha telefonini yangi o'quvchiga ko'chiradi", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...convertibleLead,
        extraPhone: '911112233',
      });
      students.create.mockResolvedValue({ id: 10008 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { branchId: 5 }, 1001, 1, null);

      expect(students.create).toHaveBeenCalledWith(
        expect.objectContaining({ extraPhone: '911112233' }),
        1001,
        1,
        { kind: 'LEAD', leadId: 'lead-1' },
      );
    });

    const leadWithBackup = {
      id: 'lead-1',
      firstName: 'Aziz',
      lastName: 'Karimov',
      phone: '901234567',
      extraPhone: '935554433',
      gender: null,
      telegram: null,
      parentPhone: null,
      parentName: null,
      statusEnum: 'NEW',
      convertedStudentId: null,
    };

    it("copies the lead's backup number when no student holds it (ADR-0070)", async () => {
      prisma.lead.findFirst.mockResolvedValue(leadWithBackup);
      students.create.mockResolvedValue({ id: 10007 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { branchId: 5 }, 1001, 1, null);

      expect(students.create.mock.calls[0][0].extraPhone).toBe('935554433');
    });

    it('leaves a backup number another student holds on the lead; conversion goes on', async () => {
      prisma.lead.findFirst.mockResolvedValue(leadWithBackup);
      // 1st: the main-number duplicate guard → none; 2nd: the rule → a holder.
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 10999,
          firstName: 'Vali',
          lastName: 'Aliyev',
        });
      students.create.mockResolvedValue({ id: 10007 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { branchId: 5 }, 1001, 1, null);

      expect(students.create).toHaveBeenCalledTimes(1);
      expect(students.create.mock.calls[0][0].extraPhone).toBeUndefined();
    });

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
        null,
      );

      expect(students.create).toHaveBeenCalledWith(
        expect.objectContaining({ branchIds: [7] }),
        1001,
        1,
        { kind: 'LEAD', leadId: 'lead-1' },
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
        service.convert('lead-1', { groupId: 'missing' }, 1001, 1, null),
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
        service.convert('lead-1', { groupId: 'grp-done' }, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
      expect(students.create).not.toHaveBeenCalled();
      expect(enrollment.enrollToGroup).not.toHaveBeenCalled();
    });

    it('blocks creating a duplicate when a live student already holds the phone', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      // A live student already exists on this phone → refuse to mint a second.
      prisma.student.findFirst.mockResolvedValue({ id: 10099 });

      await expect(
        service.convert('lead-1', {}, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
      expect(students.create).not.toHaveBeenCalled();
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('links the lead to an existing student without creating a new account', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      // existingStudentId lookup resolves to a live student.
      prisma.student.findFirst.mockResolvedValue({ id: 10050 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      const result = await service.convert(
        'lead-1',
        { existingStudentId: 10050 },
        1001,
        1,
        null,
      );

      expect(students.create).not.toHaveBeenCalled();
      expect(prisma.group.findFirst).not.toHaveBeenCalled();
      expect(enrollment.enrollToGroup).not.toHaveBeenCalled();
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'CONVERTED',
            convertedStudentId: 10050,
            statusChangeReason: 'LINKED_TO_EXISTING',
          }),
        }),
      );
      // Link-to-existing → history badge marker "biriktirildi".
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({ action: 'LID_BIRIKTIRILDI' }),
        }),
      );
      expect(result.studentId).toBe(10050);
    });

    it('throws NotFound when existingStudentId does not resolve to a live student', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...convertibleLead });
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.convert('lead-1', { existingStudentId: 99999 }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
      expect(students.create).not.toHaveBeenCalled();
    });
  });

  describe('findByStudentId', () => {
    beforeEach(() => {
      // The student exists in company 1001 and studies in branch 2
      // (`assertCallerMayTouchStudent` → `tryResolveStudentBranchId`).
      prisma.student.findFirst.mockResolvedValue({ id: 10733 });
      prisma.studentBranch = {
        findFirst: jest.fn().mockResolvedValue({ branchId: 2 }),
      };
      prisma.enrollment = { findFirst: jest.fn().mockResolvedValue(null) };
      prisma.user.findFirst.mockResolvedValue(adminOf(2));
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
    });

    it('returns the leads linked to the student inside the company, with no board status filter', async () => {
      const result = await service.findByStudentId(10733, 1001, 1);

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 10733, companyId: 1001 } }),
      );
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { convertedStudentId: 10733, companyId: 1001 },
        }),
      );
      // Must NOT copy the board's `statusEnum: { not: CONVERTED }` filter — a
      // converted lead is exactly what the student profile tab wants to show.
      const arg = prisma.lead.findMany.mock.calls.at(-1)?.[0];
      expect(arg.where.statusEnum).toBeUndefined();
      expect(arg.where.deletedAt).toBeUndefined();
      expect(result).toEqual([{ id: 'lead-1' }]);
    });

    it("refuses another branch's student and reads no lead", async () => {
      prisma.user.findFirst.mockResolvedValue(adminOf(1));

      await expect(service.findByStudentId(10733, 1001, 1)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('answers 404 for a student outside the company and reads no lead', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.findByStudentId(10733, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it("lets a CEO read any branch's student", async () => {
      prisma.user.findFirst.mockResolvedValue(CEO_ROW);

      await expect(service.findByStudentId(10733, 1001, 1)).resolves.toEqual([
        { id: 'lead-1' },
      ]);
    });
  });

  describe('getHoverSummary', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.getHoverSummary('missing', 1001, [1]),
      ).rejects.toThrow(NotFoundException);
    });

    it("looks the lead up inside the company and the caller's branch, unassigned pool included", async () => {
      // Another branch's lead does not match this filter, so the database
      // answers null — and its latest comment is never read.
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.getHoverSummary('lead-9', 1001, [1]),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'lead-9',
            deletedAt: null,
            companyId: 1001,
            OR: [{ branchId: { in: [1] } }, { branchId: null }],
          },
        }),
      );
      expect(prisma.comment.findFirst).not.toHaveBeenCalled();
    });

    it('gives a CEO every lead of the company and no other company', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-9',
        calledAt: null,
        calledBy: null,
      });

      await service.getHoverSummary('lead-9', 1001, null);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-9', deletedAt: null, companyId: 1001 },
        }),
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
        author: { firstName: 'Dilnoza', lastName: 'Karimova' },
      });

      const result = await service.getHoverSummary('lead-1', 1001, [1]);

      expect(prisma.comment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Lead', entityId: 'lead-1', isTask: false },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.calledBy).toEqual({ id: 7, name: 'Olim Aliyev' });
      expect(result.latestComment).toEqual(
        expect.objectContaining({
          authorName: 'Dilnoza Karimova',
          content: 'Ertaga qayta qo‘ng‘iroq',
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

      const result = await service.getHoverSummary('lead-2', 1001, [1]);

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
        service.markCalled('missing', { called: true }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('stamps calledAt/calledById when marking called and records history', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', calledAt: null });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date('2026-06-16T10:00:00Z'),
      });

      await service.markCalled('lead-1', { called: true }, 1001, 7, null);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({ calledById: 7 }),
        }),
      );
      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data.calledAt).toBeInstanceOf(Date);
      expect(history.recordUpdate).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith('lead.called', {
        leadId: 'lead-1',
        companyId: 1001,
        userId: 7,
      });
    });

    it("stamps the owner's action when marking called (ADR-0093)", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', calledAt: null });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date(),
      });

      await service.markCalled('lead-1', { called: true }, 1001, 7, null);

      expect(prisma.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'lead-1', ownerId: 7 }),
        }),
      );
    });

    it('does not stamp an action when the call mark could not be saved', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', calledAt: null });
      prisma.lead.update.mockRejectedValue(new Error('update failed'));

      await expect(
        service.markCalled('lead-1', { called: true }, 1001, 7, null),
      ).rejects.toThrow('update failed');

      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it('does not stamp an action when the call mark is cleared', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date(),
      });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1', calledAt: null });

      await service.markCalled('lead-1', { called: false }, 1001, 7, null);

      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it('keeps the original caller and timestamp when re-marking an already-called lead', async () => {
      const original = new Date('2026-06-01T08:00:00Z');
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: original,
      });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        calledAt: original,
      });

      // A different user (9) re-marks; neither the timestamp nor the caller
      // identity may change — the (when, who) pair must stay coherent.
      await service.markCalled('lead-1', { called: true }, 1001, 9, null);

      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data.calledAt).toBeUndefined();
      expect(data.calledById).toBeUndefined();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('clears the marker when called is false', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date(),
      });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1', calledAt: null });

      await service.markCalled('lead-1', { called: false }, 1001, 7, null);

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { calledAt: null, calledById: null },
        }),
      );
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
