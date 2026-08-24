import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { MockExamBillingService } from './mock-exam-billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Guards the rule that came out of the August 2026 overcharge: a mock exam fee
 * never comes out of a Student's balance.
 *
 * That balance is prepayment for LESSONS. The centre collects mock fees at the
 * desk, so a silent deduction meant 21 students paid twice — 690 000 so'm —
 * and 810 000 more sat armed for their next lesson payment. The two channels
 * could not see each other, which is why neither the student nor the cashier
 * ever caught it.
 */
describe('Mock exam fees never touch a lesson balance', () => {
  let service: MockExamBillingService;
  let prisma: any;
  let transactions: { reverseTransaction: jest.Mock };

  const STUDENT = 10500;

  beforeEach(async () => {
    prisma = {
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    transactions = { reverseTransaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();

    service = module.get(MockExamBillingService);
  });

  describe('no charging path exists', () => {
    it('the billing service exposes no way to deduct a fee', () => {
      // `tryDeductForStudent` is deleted, not merely unwired. A method left
      // behind "for later" is the one a future change reconnects.
      expect((service as any).tryDeductForStudent).toBeUndefined();

      const chargeLike = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      ).filter((m) => /deduct|charge|settle|bill/i.test(m));
      expect(chargeLike).toEqual([]);
    });

    // A source scan rather than a behavioural test, because the failure mode is
    // a NEW call site appearing somewhere in the tree — which no test of the
    // existing paths would ever see.
    //
    // Comments are stripped first: the billing service's own header explains at
    // length why the method was removed, and that history is worth keeping
    // readable. Only real code counts.
    it('nothing under src/ calls a mock-fee deduction', () => {
      const stripComments = (s: string) =>
        s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;
          const code = stripComments(readFileSync(full, 'utf8'));
          if (
            /tryDeductForStudent|mockExamBilling\s*\.\s*\w*[Dd]educt/.test(code)
          ) {
            offenders.push(full);
          }
        }
      };
      walk(join(__dirname, '..'));
      expect(offenders).toEqual([]);
    });

    it('the payment write path does not reference mock exam billing', () => {
      // 15 of the 21 students lost their money here, at the cashier's desk,
      // weeks after registering: a lesson payment landed and was immediately
      // drained. A lesson payment settles lessons.
      const src = readFileSync(
        join(__dirname, '..', 'payments', 'payments-write.service.ts'),
        'utf8',
      );
      expect(src).not.toMatch(/mockExamBilling/);
      expect(src).not.toMatch(/MockExamBillingService/);
    });

    it('the Telegram registration scene does not reference mock exam billing', () => {
      // The scene used to deduct BEFORE building the payment menu, so a student
      // with funds never saw the "Naqd (markazda)" button at all.
      const src = readFileSync(
        join(
          __dirname,
          '..',
          'telegram',
          'scenes',
          'mock-exam-registration.scene.ts',
        ),
        'utf8',
      );
      expect(src).not.toMatch(/mockExamBilling/);
      expect(src).not.toMatch(/MockExamBillingService/);
    });
  });

  describe('refundParticipantFee — still needed for historical rows', () => {
    it('reverses a fee a removed participant had paid from balance', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { id: 'tx-fee', amount: -30_000, studentId: STUDENT },
      ]);

      const returned = await service.refundParticipantFee('p-1', 10000);

      expect(returned).toBe(30_000);
      expect(transactions.reverseTransaction).toHaveBeenCalledWith(
        'tx-fee',
        expect.objectContaining({ performedById: 10000 }),
        undefined,
      );
    });

    it('looks only at live fee rows for that participant', async () => {
      await service.refundParticipantFee('p-1');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'MOCK_EXAM_FEE',
            reversedAt: null,
            amount: { lt: 0 },
            metadata: { path: ['mockParticipantId'], equals: 'p-1' },
          }),
        }),
      );
    });

    it('is a no-op for a cash / gateway payer who never touched their balance', async () => {
      const returned = await service.refundParticipantFee('p-cash');

      expect(returned).toBe(0);
      expect(transactions.reverseTransaction).not.toHaveBeenCalled();
    });

    it('returns every fee when a participant was somehow billed twice', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { id: 'tx-a', amount: -30_000, studentId: STUDENT },
        { id: 'tx-b', amount: -30_000, studentId: STUDENT },
      ]);

      const returned = await service.refundParticipantFee('p-dup');

      expect(returned).toBe(60_000);
      expect(transactions.reverseTransaction).toHaveBeenCalledTimes(2);
    });
  });
});
