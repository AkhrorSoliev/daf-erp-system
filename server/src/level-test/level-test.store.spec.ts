import {
  branchChoices,
  createLeadFromTest,
  LEVEL_TEST_SOURCE_NAME,
  saveAttempt,
  seenQuestionIds,
} from './level-test.store';

const PARAMS = {
  attemptId: 'att-1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '901234567',
  branchId: 2,
  companyId: 1001,
  result: 'A2' as const,
};

function makePrisma() {
  const tx = {
    leadSource: {
      findFirst: jest.fn().mockResolvedValue({ id: 'src-1' }),
      create: jest.fn(),
    },
    lead: {
      aggregate: jest.fn().mockResolvedValue({ _max: { order: 4 } }),
      create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
    },
    levelTestAttempt: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    levelTestAttempt: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    branch: { findMany: jest.fn() },
    lead: { findFirst: jest.fn().mockResolvedValue(null) },
    leadSection: { findFirst: jest.fn().mockResolvedValue({ id: 'sec-1' }) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

describe('level-test store', () => {
  const history = { recordCreate: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => jest.clearAllMocks());

  describe('seenQuestionIds', () => {
    it("oxirgi urinishlardagi savollarni bitta to'plamga yig'adi", async () => {
      const { prisma } = makePrisma();
      prisma.levelTestAttempt.findMany.mockResolvedValue([
        { questionIds: ['a1-1', 'a1-2'] },
        { questionIds: ['a1-2', 'b1-9'] },
      ]);

      const seen = await seenQuestionIds(prisma as any, '777');

      expect([...seen].sort()).toEqual(['a1-1', 'a1-2', 'b1-9']);
      expect(prisma.levelTestAttempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chatId: '777' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
    });
  });

  describe('saveAttempt', () => {
    it('urinishni yozadi va id qaytaradi', async () => {
      const { prisma } = makePrisma();
      prisma.levelTestAttempt.create.mockResolvedValue({ id: 'att-9' });

      const id = await saveAttempt(prisma as any, {
        chatId: '777',
        questionIds: ['a1-1'],
        correctByLevel: { A1: 1 },
        result: 'BEGINNER',
        companyId: 1001,
      });

      expect(id).toBe('att-9');
      expect(prisma.levelTestAttempt.create).toHaveBeenCalledWith({
        data: {
          chatId: '777',
          questionIds: ['a1-1'],
          correctByLevel: { A1: 1 },
          result: 'BEGINNER',
          companyId: 1001,
        },
        select: { id: true },
      });
    });
  });

  describe('branchChoices', () => {
    it("faqat faol, o'chirilmagan filiallarni so'raydi", async () => {
      const { prisma } = makePrisma();
      prisma.branch.findMany.mockResolvedValue([{ id: 1, name: 'A' }]);

      await expect(branchChoices(prisma as any, 1001)).resolves.toEqual([
        { id: 1, name: 'A' },
      ]);
      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1001, deletedAt: null, status: 'ACTIVE' },
        }),
      );
    });
  });

  describe('createLeadFromTest', () => {
    it("tanlangan filialning «Yangi» ustunidagi birinchi bo'limga lid ochadi", async () => {
      const { prisma, tx } = makePrisma();

      const out = await createLeadFromTest(prisma as any, history, PARAMS);

      expect(out).toEqual({ kind: 'created', leadId: 'lead-1' });
      expect(prisma.leadSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            deletedAt: null,
            column: { branchId: 2, systemKey: 'NEW', deletedAt: null },
          },
        }),
      );
      expect(tx.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901234567',
          sectionId: 'sec-1',
          sourceId: 'src-1',
          order: 5,
          statusEnum: 'NEW',
          companyId: 1001,
          branchId: 2,
        }),
        select: { id: true },
      });
      expect(tx.levelTestAttempt.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { leadId: 'lead-1' },
      });
    });

    it('tarixga lid yaratilishi va daraja natijasi yoziladi (tx bilan)', async () => {
      const { prisma, tx } = makePrisma();

      await createLeadFromTest(prisma as any, history, PARAMS);

      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Lead',
          entityId: 'lead-1',
          companyId: 1001,
          tx,
          newValues: expect.objectContaining({
            manba: LEVEL_TEST_SOURCE_NAME,
            darajaTesti: 'A2',
          }),
        }),
      );
    });

    it("manba yo'q bo'lsa — yaratadi", async () => {
      const { prisma, tx } = makePrisma();
      tx.leadSource.findFirst.mockResolvedValue(null);
      tx.leadSource.create.mockResolvedValue({ id: 'src-new' });

      await createLeadFromTest(prisma as any, history, PARAMS);

      expect(tx.leadSource.create).toHaveBeenCalledWith({
        data: { name: LEVEL_TEST_SOURCE_NAME, companyId: 1001 },
        select: { id: true },
      });
      expect(tx.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sourceId: 'src-new' }),
        select: { id: true },
      });
    });

    it("shu telefonli jonli lid bor — ikkinchisi ochilmaydi, urinish unga bog'lanadi", async () => {
      const { prisma, tx } = makePrisma();
      prisma.lead.findFirst.mockResolvedValue({ id: 'old-lead' });

      const out = await createLeadFromTest(prisma as any, history, PARAMS);

      expect(out).toEqual({ kind: 'existing', leadId: 'old-lead' });
      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { companyId: 1001, phone: '901234567', deletedAt: null },
        select: { id: true },
      });
      expect(prisma.levelTestAttempt.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { leadId: 'old-lead' },
      });
      expect(tx.lead.create).not.toHaveBeenCalled();
      expect(history.recordCreate).not.toHaveBeenCalled();
    });

    it("filialda «Yangi» bo'limi yo'q — hech narsa yozilmaydi", async () => {
      const { prisma, tx } = makePrisma();
      prisma.leadSection.findFirst.mockResolvedValue(null);

      const out = await createLeadFromTest(prisma as any, history, PARAMS);

      expect(out).toEqual({ kind: 'no-section' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.lead.create).not.toHaveBeenCalled();
    });
  });
});
