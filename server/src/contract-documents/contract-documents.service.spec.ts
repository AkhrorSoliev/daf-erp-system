import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { ContractDocumentsService } from './contract-documents.service';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(1),
}));
jest.mock('./pdf/contract-pdf', () => ({
  renderContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.3')),
}));

const ENR = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-10T06:00:00Z');

const STUDENT = {
  id: 10001,
  firstName: 'Ahror',
  lastName: 'Soliyev',
  dateOfBirth: new Date('1995-05-05T00:00:00Z'),
  deletedAt: null,
  discountPercent: 10,
  phone: '901234567',
  telegram: '@ahror',
  passportSeries: null,
  address: 'Namangan',
  parentName: 'Soliyeva Malika',
  parentPhone: '907654321',
};

const BRANCH = {
  name: 'Namangan filiali',
  city: 'Namangan',
  address: "Istiqlol ko'chasi, 48",
  representativeName: 'Karimov Anvar',
  representativePosition: 'Direktor',
};

const enrollmentRow = (over: Record<string, unknown> = {}) => ({
  id: ENR,
  status: 'ACTIVE',
  startDate: new Date('2026-09-01T00:00:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
  contractDocument: null,
  group: {
    name: '#032',
    level: 'A1',
    exactDays: ['monday', 'wednesday', 'friday'],
    lessonStartTime: '14:00',
    lessonEndTime: '15:30',
    lessonMinutes: 90,
    course: {
      name: 'Standart',
      price: 450_000,
      lessonMinutes: null,
      paymentModel: 'MONTHLY',
    },
    teachers: [{ teacher: { firstName: 'Aziza', lastName: 'Karimova' } }],
  },
  ...over,
});

const viewRow = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 1,
  number: 'DAF-2026-00001',
  studentId: 10001,
  branchId: 1,
  templateVersion: 1,
  contractDate: new Date('2026-10-10T00:00:00Z'),
  fields: {
    customer: { kind: 'SELF', fullName: 'Soliyev Ahror' },
    courses: [],
  },
  createdById: 99,
  createdAt: NOW,
  updatedAt: NOW,
  signedAt: null,
  signedById: null,
  signMethod: null,
  cancelledAt: null,
  cancelledById: null,
  cancelReason: null,
  createdBy: { firstName: 'Ali', lastName: 'Valiyev' },
  signedBy: null,
  cancelledBy: null,
  enrollments: [{ id: ENR, status: 'ACTIVE', group: { name: '#032' } }],
  ...over,
});

function makePrisma() {
  const prisma = {
    student: {
      findFirst: jest.fn().mockResolvedValue(STUDENT),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    branch: { findFirst: jest.fn().mockResolvedValue(BRANCH) },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([enrollmentRow()]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    contractDocument: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(viewRow()),
      create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

const history = () => ({
  recordCreate: jest.fn(),
  recordUpdate: jest.fn(),
  recordDelete: jest.fn(),
  recordStatusChange: jest.fn(),
  recordRestore: jest.fn(),
});

const dto = (over: Record<string, unknown> = {}) =>
  ({
    studentId: 10001,
    enrollmentIds: [ENR],
    customer: {
      kind: 'SELF',
      fullName: 'Soliyev Ahror',
      passport: 'AB1234567',
    },
    courses: [{ enrollmentId: ENR, includes: ['DARSLIK'] }],
    ...over,
  }) as never;

describe('ContractDocumentsService — create', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let hist: ReturnType<typeof history>;
  let service: ContractDocumentsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    hist = history();
    service = new ContractDocumentsService(prisma as never, hist as never);
  });
  afterEach(() => jest.useRealTimers());

  it('seals the fields, numbers the contract and links the courses', async () => {
    const view = await service.create(dto(), 1, 99);

    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      prisma,
      99,
      10001,
      1,
    );
    expect(prisma.contractDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        number: 'DAF-2026-00001',
        studentId: 10001,
        branchId: 1,
        templateVersion: 1,
        createdById: 99,
        fields: expect.objectContaining({
          branch: expect.objectContaining({ city: 'Namangan' }),
          student: {
            fullName: 'Soliyev Ahror',
            birthDate: '1995-05-05',
            isMinor: false,
          },
          customer: expect.objectContaining({
            kind: 'SELF',
            passport: 'AB1234567',
          }),
          courses: [
            expect.objectContaining({
              courseName: 'Standart',
              lessonsPerWeek: 3,
              firstPaymentAmount: 405_000,
              includes: ['DARSLIK'],
            }),
          ],
        }),
      }),
    });
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ENR] }, contractDocumentId: null },
      data: { contractDocumentId: 'doc-1' },
    });
    expect(hist.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10001,
        newValues: expect.objectContaining({
          action: 'SHARTNOMA_TUZILDI',
          raqam: 'DAF-2026-00001',
          kurslar: 'Standart (#032)',
        }),
      }),
    );
    expect(view.number).toBe('DAF-2026-00001');
  });

  it('continues the year sequence', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue({
      number: 'DAF-2026-00041',
    });
    await service.create(dto(), 1, 99);
    expect(prisma.contractDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ number: 'DAF-2026-00042' }),
    });
  });

  it('asks for the birth date when the profile has none, then writes it', async () => {
    prisma.student.findFirst.mockResolvedValue({
      ...STUDENT,
      dateOfBirth: null,
    });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      BadRequestException,
    );

    await service.create(dto({ studentBirthDate: '2001-02-03' }), 1, 99);
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 10001, dateOfBirth: null },
      data: { dateOfBirth: new Date('2001-02-03T00:00:00.000Z') },
    });
    expect(hist.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { dateOfBirth: null },
        newValues: { dateOfBirth: '2001-02-03' },
      }),
    );
  });

  it('refuses a minor as their own customer', async () => {
    prisma.student.findFirst.mockResolvedValue({
      ...STUDENT,
      dateOfBirth: new Date('2012-01-01T00:00:00Z'),
    });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      /Voyaga yetmagan/,
    );
  });

  it('refuses while the branch settings are incomplete', async () => {
    prisma.branch.findFirst.mockResolvedValue({
      ...BRANCH,
      city: null,
      representativeName: ' ',
    });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      /shahar, vakil ismi/,
    );
  });

  it('refuses a course already under a contract', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enrollmentRow({ contractDocument: { number: 'DAF-2026-00012' } }),
    ]);
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses a 12-lesson pack course', async () => {
    const pack = enrollmentRow();
    (pack.group as { course: { paymentModel: string } }).course.paymentModel =
      'LESSON_PACK';
    prisma.enrollment.findMany.mockResolvedValue([pack]);
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('turns a link lost to a concurrent contract into 409', async () => {
    prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create(dto(), 1, 99)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses extras for a course that is not selected', async () => {
    await expect(
      service.create(
        dto({
          courses: [{ enrollmentId: '22222222-2222-4222-8222-222222222222' }],
        }),
        1,
        99,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an impossible calendar day', async () => {
    await expect(
      service.create(
        dto({
          customer: { kind: 'PARENT', fullName: 'X', birthDate: '2026-02-30' },
        }),
        1,
        99,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ContractDocumentsService — reads', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ContractDocumentsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    service = new ContractDocumentsService(prisma as never, history() as never);
  });
  afterEach(() => jest.useRealTimers());

  it('lists contracts and the courses still without one', async () => {
    prisma.contractDocument.findMany.mockResolvedValue([viewRow()]);
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: 'e-2',
        status: 'FROZEN',
        group: { name: '#041', course: { name: 'Intensive' } },
      },
    ]);
    const out = await service.list(10001, 1, 99);
    expect(out.contracts[0]).toMatchObject({
      number: 'DAF-2026-00001',
      status: 'UNSIGNED',
    });
    expect(out.uncovered).toEqual([
      {
        enrollmentId: 'e-2',
        status: 'FROZEN',
        courseName: 'Intensive',
        groupName: '#041',
      },
    ]);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: 10001,
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
          contractDocumentId: null,
          group: { course: { paymentModel: 'MONTHLY' } },
        },
      }),
    );
  });

  it('prefills from the profile and the last contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue({
      fields: { customer: { kind: 'SELF', passport: 'AB1234567' } },
    });
    prisma.branch.findFirst.mockResolvedValue({ ...BRANCH, address: null });
    const out = await service.prefill(10001, 1, 99);
    expect(out.today).toBe('2026-10-10');
    expect(out.branch.missing).toEqual(['manzil']);
    expect(out.student).toMatchObject({
      birthDate: '1995-05-05',
      isMinor: false,
    });
    expect(out.lastCustomer).toMatchObject({ passport: 'AB1234567' });
    expect(out.courses[0]).toMatchObject({
      enrollmentId: ENR,
      contractNumber: null,
      firstPaymentAmount: 405_000,
    });
  });

  it('throws NotFound when the student is gone', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.prefill(10001, 1, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
