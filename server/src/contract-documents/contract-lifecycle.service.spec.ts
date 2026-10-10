import { NotFoundException } from '@nestjs/common';
import { ContractLifecycleService } from './contract-lifecycle.service';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(1),
}));
jest.mock('./pdf/contract-pdf', () => ({
  renderContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.3')),
}));

const ENR = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-10T06:00:00Z');

const sealed = {
  branch: {
    name: 'Namangan filiali',
    city: 'Namangan',
    address: "Istiqlol ko'chasi, 48",
    representativeName: 'Karimov Anvar',
    representativePosition: 'Direktor',
  },
  student: {
    fullName: 'Soliyev Ahror',
    birthDate: '1995-05-05',
    isMinor: false,
  },
  customer: {
    kind: 'SELF',
    kindOther: null,
    fullName: 'Soliyev Ahror',
    birthDate: '1995-05-05',
    passport: null,
    address: null,
    phone: null,
    telegram: null,
    email: null,
  },
  courses: [
    {
      enrollmentId: ENR,
      courseName: 'Standart',
      groupName: '#032',
      monthlyPrice: 450_000,
      discountPercent: 10,
      firstPaymentAmount: 405_000,
      firstPaymentDate: null,
      discountReason: null,
      discountFrom: null,
      discountTo: null,
      includes: [],
    },
  ],
};

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  companyId: 1,
  number: 'DAF-2026-00001',
  studentId: 10001,
  templateVersion: 1,
  contractDate: new Date('2026-10-10T00:00:00Z'),
  fields: sealed,
  signedAt: null,
  cancelledAt: null,
  ...over,
});

/** What `loadContractView` reads back after a write. */
const viewRow = {
  ...doc(),
  branchId: 1,
  createdById: 99,
  createdAt: NOW,
  updatedAt: NOW,
  signedById: null,
  signMethod: null,
  cancelledById: null,
  cancelReason: null,
  createdBy: { firstName: 'Ali', lastName: 'Valiyev' },
  signedBy: null,
  cancelledBy: null,
  enrollments: [{ id: ENR, status: 'ACTIVE', group: { name: '#032' } }],
};

function makePrisma() {
  const prisma = {
    contractDocument: {
      findFirst: jest.fn().mockResolvedValue(doc()),
      findUniqueOrThrow: jest.fn().mockResolvedValue(viewRow),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    enrollment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('ContractLifecycleService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let hist: { recordCreate: jest.Mock };
  let service: ContractLifecycleService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    hist = { recordCreate: jest.fn() };
    service = new ContractLifecycleService(prisma as never, hist as never);
  });
  afterEach(() => jest.useRealTimers());

  it('updates the customer and course extras of an unsigned contract', async () => {
    await service.update(
      'doc-1',
      {
        customer: { kind: 'SELF', fullName: 'x', passport: 'AB1234567' },
        courses: [
          {
            enrollmentId: ENR,
            firstPaymentDate: '2026-10-12',
            includes: ['DARSLIK'],
          },
        ],
      } as never,
      1,
      99,
    );
    const call = prisma.contractDocument.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'doc-1',
      signedAt: null,
      cancelledAt: null,
    });
    expect(call.data.fields.customer.passport).toBe('AB1234567');
    expect(call.data.fields.courses[0]).toMatchObject({
      firstPaymentDate: '2026-10-12',
      firstPaymentAmount: 405_000,
      includes: ['DARSLIK'],
      courseName: 'Standart',
    });
    expect(hist.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'SHARTNOMA_TAHRIRLANDI',
          ozgardi: 'Buyurtmachi, Kurs: Standart',
        }),
      }),
    );
  });

  it('writes nothing when nothing changed', async () => {
    await service.update('doc-1', {} as never, 1, 99);
    expect(prisma.contractDocument.updateMany).not.toHaveBeenCalled();
  });

  it('refuses extras for a course outside the contract', async () => {
    await expect(
      service.update(
        'doc-1',
        {
          courses: [{ enrollmentId: '22222222-2222-4222-8222-222222222222' }],
        } as never,
        1,
        99,
      ),
    ).rejects.toThrow(/bunday kurs/);
  });

  it('locks a signed contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(doc({ signedAt: NOW }));
    await expect(service.update('doc-1', {} as never, 1, 99)).rejects.toThrow(
      /Imzolangan/,
    );
  });

  it('marks paper signing once', async () => {
    await service.sign('doc-1', 1, 99);
    expect(prisma.contractDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', signedAt: null, cancelledAt: null },
      data: { signedAt: NOW, signedById: 99, signMethod: 'PAPER' },
    });
    prisma.contractDocument.findFirst.mockResolvedValue(doc({ signedAt: NOW }));
    await expect(service.sign('doc-1', 1, 99)).rejects.toThrow(/allaqachon/);
  });

  it('turns a signing lost to a concurrent change into 409', async () => {
    prisma.contractDocument.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sign('doc-1', 1, 99)).rejects.toThrow(/Bir vaqtda/);
  });

  it('cancels an unsigned contract and frees its courses', async () => {
    await service.cancel('doc-1', 'Xato tuzildi', 1, 99);
    expect(prisma.contractDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', cancelledAt: null, signedAt: null },
      data: {
        cancelledAt: NOW,
        cancelledById: 99,
        cancelReason: 'Xato tuzildi',
      },
    });
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { contractDocumentId: 'doc-1' },
      data: { contractDocumentId: null },
    });
    expect(hist.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'SHARTNOMA_BEKOR_QILINDI',
          sabab: 'Xato tuzildi',
        }),
      }),
    );
  });

  it('lets only the CEO cancel a signed contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(doc({ signedAt: NOW }));
    await expect(service.cancel('doc-1', 'Xato', 1, 99)).rejects.toThrow(
      /faqat CEO/,
    );
    prisma.user.findFirst.mockResolvedValue({ id: 99 });
    await service.cancel('doc-1', 'Xato', 1, 99);
    expect(prisma.contractDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', cancelledAt: null },
      data: { cancelledAt: NOW, cancelledById: 99, cancelReason: 'Xato' },
    });
  });

  it('builds the PDF from the sealed fields', async () => {
    const out = await service.pdf('doc-1', 1, 99);
    expect(out.filename).toBe('Shartnoma-DAF-2026-00001.pdf');
    expect(out.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('answers 404 for another company contract', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(null);
    await expect(service.sign('doc-x', 1, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
