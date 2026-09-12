import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LEAD_LINKED_REASON } from '../leads/leads.service';
import { CustomFormSubmissionsService } from './custom-form-submissions.service';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { SUBMISSION_STAGES, stageWhere } from './submission-stage';

const FORM_FIELDS = [
  { id: 'fn', type: 'text', label: 'Ism', required: true, mapsTo: 'firstName' },
  {
    id: 'ln',
    type: 'text',
    label: 'Familya',
    required: true,
    mapsTo: 'lastName',
  },
  {
    id: 'ph',
    type: 'phone',
    label: 'Telefon',
    required: true,
    mapsTo: 'phone',
  },
  {
    id: 'lvl',
    type: 'select',
    label: 'Daraja',
    required: false,
    options: [{ value: 'a1', label: 'A1' }],
  },
];

function makeLead(over: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    statusEnum: 'NEW',
    deletedAt: null,
    calledAt: null,
    createdAt: new Date('2026-09-10T09:00:00Z'),
    convertedStudentId: null,
    lostReason: null,
    statusChangeReason: null,
    calledBy: null,
    source: { id: 'src-ig', name: 'Instagram' },
    ...over,
  };
}

function makeRecord(over: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    submittedAt: new Date('2026-09-10T09:00:00Z'),
    data: { fn: 'Ali', ln: 'Valiyev', ph: '901234567', lvl: 'a1' },
    lead: makeLead(),
    ...over,
  };
}

const query = (q: Partial<SubmissionQueryDto> = {}) => q as SubmissionQueryDto;

describe('CustomFormSubmissionsService', () => {
  let service: CustomFormSubmissionsService;
  let prisma: any;

  /** Birinchi `findMany` (id bilan) — sahifa qatorlari; ikkinchisi (faqat data) — eski maydonlar skani. */
  function givenRecords(records: unknown[], allData?: unknown[]) {
    prisma.customFormSubmission.findMany.mockImplementation(
      (args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          args.select.id
            ? records
            : (allData ?? records.map((r: any) => ({ data: r.data }))),
        ),
    );
  }

  beforeEach(async () => {
    prisma = {
      customForm: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'form-1', fields: FORM_FIELDS }),
      },
      customFormSubmission: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      lead: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leadSource: { findMany: jest.fn().mockResolvedValue([]) },
    };
    givenRecords([]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFormSubmissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CustomFormSubmissionsService);
  });

  it("forma chaqiruvchi filialiga tegishli bo'lmasa 404", async () => {
    prisma.customForm.findFirst.mockResolvedValue(null);
    await expect(service.list('form-1', query(), 1, [3])).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.customForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'form-1',
          companyId: 1,
          deletedAt: null,
          section: { column: { branchId: { in: [3] } } },
        }),
      }),
    );
  });

  it('qatorni bosqich, sabab va javoblar bilan qaytaradi', async () => {
    givenRecords([
      makeRecord(),
      makeRecord({
        id: 'sub-2',
        lead: makeLead({
          id: 'lead-2',
          statusEnum: 'LOST',
          deletedAt: new Date('2026-09-11T00:00:00Z'),
          lostReason: 'qimmat',
        }),
      }),
    ]);
    const result = await service.list('form-1', query(), 1, null);

    expect(result.data[0]).toMatchObject({
      id: 'sub-1',
      stage: 'awaiting',
      data: { lvl: 'a1' },
      submitted: { firstName: 'Ali', lastName: 'Valiyev', phone: '901234567' },
      lead: { id: 'lead-1', archived: false, lostReason: null },
    });
    expect(result.data[1]).toMatchObject({
      stage: 'lost',
      lead: { archived: true, lostReason: 'qimmat' },
    });
    expect(result.fields).toEqual([
      {
        id: 'lvl',
        label: 'Daraja',
        type: 'select',
        options: [{ value: 'a1', label: 'A1' }],
      },
    ]);
  });

  it("CONVERTED sentinel hech qachon yo'qotish sababi bo'lib chiqmaydi", async () => {
    givenRecords([
      makeRecord({
        lead: makeLead({
          statusEnum: 'CONVERTED',
          statusChangeReason: LEAD_LINKED_REASON,
        }),
      }),
    ]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.data[0]).toMatchObject({
      stage: 'converted',
      lead: { lostReason: null },
    });
  });

  it("lid butunlay o'chirilgan bo'lsa — yo'qotildi, ism formadagi javobdan", async () => {
    givenRecords([makeRecord({ lead: null })]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.data[0]).toMatchObject({
      stage: 'lost',
      lead: null,
      isRepeat: false,
      submitted: { firstName: 'Ali', lastName: 'Valiyev', phone: '901234567' },
    });
  });

  it("javobdagi primitiv bo'lmagan qiymatlarni tashlab yuboradi", async () => {
    givenRecords([
      makeRecord({ data: { fn: 'Ali', bad: { x: 1 }, ok: true } }),
    ]);
    const result = await service.list('form-1', query(), 1, null);
    expect(result.data[0].data).toEqual({ fn: 'Ali', ok: true });
  });

  describe('isRepeat', () => {
    it("telefon oldinroq boshqa lidda asosiy yoki qo'shimcha raqam bo'lsa — takroriy", async () => {
      givenRecords([
        makeRecord(),
        makeRecord({
          id: 'sub-2',
          lead: makeLead({ id: 'lead-2', phone: '931112233' }),
        }),
        makeRecord({
          id: 'sub-3',
          lead: makeLead({ id: 'lead-3', phone: '977778899' }),
        }),
      ]);
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          phone: '901234567',
          extraPhone: null,
          createdAt: new Date('2026-09-10T09:00:00Z'),
        },
        {
          id: 'old-a',
          phone: '901234567',
          extraPhone: null,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
        {
          id: 'old-b',
          phone: '000000000',
          extraPhone: '931112233',
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
        {
          id: 'new-c',
          phone: '977778899',
          extraPhone: null,
          createdAt: new Date('2026-09-11T00:00:00Z'),
        },
      ]);

      const result = await service.list('form-1', query(), 1, null);

      expect(result.data.map((r) => r.isRepeat)).toEqual([true, true, false]);
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1,
            OR: [
              { phone: { in: ['901234567', '931112233', '977778899'] } },
              { extraPhone: { in: ['901234567', '931112233', '977778899'] } },
            ],
          },
        }),
      );
    });
  });

  describe('sanoqlar', () => {
    it("bosqich sanoqlari butun forma bo'yicha, joriy filtrga qaramaydi", async () => {
      const totals = { awaiting: 17, contacted: 0, converted: 6, lost: 22 };
      prisma.customFormSubmission.count.mockImplementation(
        ({ where }: { where: any }) => {
          for (const s of SUBMISSION_STAGES) {
            if (
              JSON.stringify(where) ===
              JSON.stringify({ formId: 'form-1', AND: [stageWhere(s)] })
            ) {
              return Promise.resolve(totals[s]);
            }
          }
          return Promise.resolve(0);
        },
      );

      const result = await service.list(
        'form-1',
        query({ stage: 'lost', search: 'Ali' }),
        1,
        null,
      );

      expect(result.counts.stages).toEqual(totals);
    });

    it('manbalar kamayish tartibida; manbasiz lid va lidsiz javob bitta guruhda', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { sourceId: 'src-tg', _count: { _all: 12 } },
        { sourceId: 'src-ig', _count: { _all: 30 } },
        { sourceId: null, _count: { _all: 2 } },
      ]);
      prisma.leadSource.findMany.mockResolvedValue([
        { id: 'src-ig', name: 'Instagram' },
        { id: 'src-tg', name: 'Telegram' },
      ]);
      prisma.customFormSubmission.count.mockImplementation(
        ({ where }: { where: any }) =>
          Promise.resolve(where.leadId === null && !where.AND ? 1 : 0),
      );

      const result = await service.list('form-1', query(), 1, null);

      expect(result.counts.sources).toEqual([
        { id: 'src-ig', name: 'Instagram', count: 30 },
        { id: 'src-tg', name: 'Telegram', count: 12 },
        { id: null, name: null, count: 3 },
      ]);
    });
  });

  describe('filtrlar', () => {
    const whereOfPage = () =>
      prisma.customFormSubmission.findMany.mock.calls.find(
        ([args]: [any]) => args.select.id,
      )[0].where;

    it("bosqich, manba (none bilan), qidiruv va sana oralig'ini birlashtiradi", async () => {
      await service.list(
        'form-1',
        query({
          stage: 'awaiting',
          source: ['src-ig', 'none'],
          search: 'Ali 90',
          startDate: '2026-09-01',
          endDate: '2026-09-10',
        }),
        1,
        null,
      );

      const where = whereOfPage();
      expect(where.formId).toBe('form-1');
      expect(where.submittedAt).toEqual({
        gte: expect.any(Date),
        lt: expect.any(Date),
      });
      expect(where.AND).toEqual([
        stageWhere('awaiting'),
        {
          OR: [
            { lead: { is: { sourceId: { in: ['src-ig'] } } } },
            { leadId: null },
            { lead: { is: { sourceId: null } } },
          ],
        },
        {
          lead: {
            is: {
              OR: [
                { firstName: { contains: 'Ali', mode: 'insensitive' } },
                { lastName: { contains: 'Ali', mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          lead: {
            is: {
              OR: [
                { firstName: { contains: '90', mode: 'insensitive' } },
                { lastName: { contains: '90', mode: 'insensitive' } },
                { phone: { contains: '90' } },
              ],
            },
          },
        },
      ]);
    });

    it('telefon qidiruvi +998 formatidagi qiymatni ham topadi', async () => {
      await service.list(
        'form-1',
        query({ search: '+998 90 123 45 67' }),
        1,
        null,
      );
      expect(whereOfPage().AND).toEqual([
        { lead: { is: { phone: { contains: '901234567' } } } },
      ]);
    });

    it('telefon qidiruvi 998siz 9 xonali qiymatni ham topadi', async () => {
      await service.list('form-1', query({ search: '901234567' }), 1, null);
      expect(whereOfPage().AND).toEqual([
        { lead: { is: { phone: { contains: '901234567' } } } },
      ]);
    });

    it('telefon qidiruvi qisman raqamni ham topadi', async () => {
      await service.list('form-1', query({ search: '90 123' }), 1, null);
      expect(whereOfPage().AND).toEqual([
        { lead: { is: { phone: { contains: '90123' } } } },
      ]);
    });

    it("filtrsiz so'rovda AND yo'q, eng yangisi tepada, sahifa hisoblanadi", async () => {
      await service.list('form-1', query({ page: 3, pageSize: 20 }), 1, null);
      const call = prisma.customFormSubmission.findMany.mock.calls.find(
        ([args]: [any]) => args.select.id,
      )[0];
      expect(call.where).toEqual({ formId: 'form-1' });
      expect(call).toMatchObject({
        orderBy: { submittedAt: 'desc' },
        skip: 40,
        take: 20,
      });
    });
  });

  it("formadan o'chirilgan maydonlarning javoblari legacyFields bo'lib chiqadi", async () => {
    givenRecords(
      [],
      [
        { data: { fn: 'A', old1: 'x' } },
        { data: { fn: 'B', old1: 'y', old2: true } },
      ],
    );
    const result = await service.list('form-1', query(), 1, null);
    expect(result.legacyFields).toEqual([
      { id: 'old1', label: "O'chirilgan maydon 1" },
      { id: 'old2', label: "O'chirilgan maydon 2" },
    ]);
    const legacyScanCall = prisma.customFormSubmission.findMany.mock.calls.find(
      ([args]: [any]) => !args.select.id,
    )[0];
    expect(legacyScanCall.orderBy).toEqual({ submittedAt: 'asc' });
  });

  it("export sahifasiz, eng ko'pi 5000 qator", async () => {
    givenRecords([makeRecord()]);
    const result = await service.export('form-1', query({ page: 2 }), 1, null);
    const call = prisma.customFormSubmission.findMany.mock.calls.find(
      ([args]: [any]) => args.select.id,
    )[0];
    expect(call.take).toBe(5000);
    expect(call.skip).toBeUndefined();
    expect(result.data).toHaveLength(1);
  });
});
