# «Oylik berilganini tasdiqlash» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir oyning barcha `CALCULATED`/`APPROVED` `SalaryPayment` qatorlarini bitta tasdiqlangan amalda `PAID` ga o'tkazish — tanlangan to'lov sanasi va tanlangan kassa hisobi bilan — shunda tizimdan tashqarida berilgan iyun/iyul oyliklari ledger, ustoz balansi va kassada to'g'ri aks etadi.

**Architecture:** Yangi `SalarySettleMonthService` oyni `resolveMonthlyScope` orqali davrga aylantiradi (jadval ishlatadigan aynan o'sha helper), nomzod to'lovlarni yig'adi, **hammasini oldindan tekshiradi** va faqat shundan keyin har bir to'lovni o'z `Serializable` tranzaksiyasida yozadi. `recordSalaryPayment` ga ixtiyoriy `cashAccountId` va `description` qo'shiladi — usiz kassa chiqimi filialning eng eski `CASH` hisobiga (prodda balansi 0 bo'lgan «Asosiy kassa») tushib ketadi.

**Tech Stack:** NestJS + Prisma (server), Next.js + shadcn/ui + TanStack Query (client), Jest.

## Global Constraints

- Barcha UI matni **faqat lotin alifbosidagi o'zbekcha** — kirill yoki arab harflari aralashmaydi.
- Pul butun son (`Int`), so'mda. Formatlash `formatPrice` / `formatNumber` orqali (`uz-UZ`).
- Yangi endpoint **majburiy** ravishda `server/src/common/auth/branch-route-policy.ts` manifestiga kiritiladi — aks holda `branch-route-policy.spec.ts` build'ni yiqitadi.
- Har bir moliyaviy yozuv `Prisma.TransactionIsolationLevel.Serializable`, `maxWait: 10000`, `timeout: 15000`.
- Ledger append-only: mavjud qatorlar tahrirlanmaydi, `SALARY_PAYMENT_TRANSITIONS` o'zgartirilmaydi.
- Ishni tugallashdan oldin: `cd server && npm test` (hammasi o'tishi shart) va `cd client && npm run build`.
- Commit xabarlari ingliz tilida, oxirida `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Server**

| Fayl | Mas'uliyati |
|---|---|
| `server/src/transactions/transactions-write.service.ts` (modify) | `recordSalaryPayment` ga ixtiyoriy `cashAccountId` + `description` |
| `server/src/transactions/transactions.service.ts` (modify) | fasad imzosi |
| `server/src/salary/dto/settle-month.dto.ts` (create) | so'rov validatsiyasi |
| `server/src/salary/salary-settle-month.service.ts` (create) | nomzodlarni yig'ish, tekshirish, yozish |
| `server/src/salary/salary.module.ts` (modify) | provider ro'yxati |
| `server/src/salary/salary.service.ts` (modify) | fasad ikkita metod |
| `server/src/salary/salary.controller.ts` (modify) | ikkita endpoint, CEO-only |
| `server/src/common/auth/branch-route-policy.ts` (modify) | ikkita yangi route manifestga |

**Client**

| Fayl | Mas'uliyati |
|---|---|
| `client/src/components/payments/salary-settle-month-dialog.tsx` (create) | ogohlantirish + ro'yxat + sana + kassa + summa tasdig'i |
| `client/src/components/payments/salary-monthly-view.tsx` (modify) | tugma va dialog holati |

---

## Task 1: `recordSalaryPayment` kassa hisobini qabul qiladi

**Files:**
- Modify: `server/src/transactions/transactions-write.service.ts:469-533`
- Modify: `server/src/transactions/transactions.service.ts:108-119`
- Test: `server/src/transactions/transactions-write.service.spec.ts`

**Interfaces:**
- Produces: `TransactionsWriteService.recordSalaryPayment(params, tx?)` bu yerda `params` endi ixtiyoriy `cashAccountId?: string` va `description?: string` ni ham qabul qiladi. Ular berilmasa xatti-harakat **aynan avvalgidek** qoladi (`resolveAccountId` ishlaydi, matn `"Oylik to'landi"`).

- [ ] **Step 1: Failing testni yozish**

`server/src/transactions/transactions-write.service.spec.ts` faylining oxiriga qo'shing. Faylning boshidagi mavjud `describe` bloklaridagi mock uslubiga rioya qiling — quyidagi blok o'zining `beforeEach` i bilan mustaqil:

```ts
describe('TransactionsWriteService.recordSalaryPayment — cash account + description', () => {
  let service: TransactionsWriteService;
  let prisma: any;
  let cashMovements: any;

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7, balance: 5_000_000 }]),
      $transaction: jest.fn((cb: any) => cb(prisma)),
      transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      user: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ mainBranch: 1, branches: [] }),
      },
    };
    cashMovements = { recordOutflow: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsWriteService,
        { provide: PrismaService, useValue: prisma },
        { provide: CashMovementsService, useValue: cashMovements },
      ],
    }).compile();
    service = module.get(TransactionsWriteService);
  });

  const base = {
    userId: 7,
    amount: 1_000_000,
    salaryPaymentId: 'sp-1',
    companyId: 1,
    performedById: 99,
  };

  it('forwards an explicit cashAccountId to the cash journal', async () => {
    await service.recordSalaryPayment({ ...base, cashAccountId: 'acc-42' });

    expect(cashMovements.recordOutflow).toHaveBeenCalledWith(
      expect.objectContaining({ cashAccountId: 'acc-42' }),
      expect.anything(),
    );
  });

  it('writes the given description onto BOTH the ledger row and the cash movement', async () => {
    await service.recordSalaryPayment({
      ...base,
      description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
        }),
      }),
    );
    expect(cashMovements.recordOutflow).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
      }),
      expect.anything(),
    );
  });

  it('keeps the old behaviour when neither is given', async () => {
    await service.recordSalaryPayment(base);

    expect(cashMovements.recordOutflow).toHaveBeenCalledWith(
      expect.objectContaining({
        cashAccountId: undefined,
        description: "Oylik to'landi",
      }),
      expect.anything(),
    );
  });
});
```

Fayl boshida `CashMovementsService` importi yo'q bo'lsa qo'shing:

```ts
import { CashMovementsService } from '../cash-accounts/cash-movements.service';
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qilish**

Run: `cd server && npx jest src/transactions/transactions-write.service.spec.ts -t "cash account + description"`
Expected: FAIL — `cashAccountId` `recordOutflow` ga uzatilmayapti (chaqiruvda bunday maydon yo'q).

- [ ] **Step 3: Implementatsiya**

`server/src/transactions/transactions-write.service.ts`, `recordSalaryPayment` — params tipiga ikkita maydon qo'shing:

```ts
  async recordSalaryPayment(
    params: {
      userId: number;
      amount: number;
      salaryPaymentId: string;
      branchId?: number | null;
      companyId: number;
      performedById?: number;
      /**
       * Explicit kassa account. Without it `resolveAccountId` picks the branch's
       * OLDEST CASH account, which in production is an empty «Asosiy kassa»
       * rather than the one the money actually left. The month-settle flow lets
       * the CEO name the account, so the cash journal matches reality.
       */
      cashAccountId?: string;
      /** Ledger + cash-journal text. Defaults to the plain payout wording. */
      description?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
```

Tana ichida matnni bir marta hisoblang va ikkala yozuvda ishlating:

```ts
      const description = params.description ?? "Oylik to'landi";
```

`client.transaction.create` chaqiruvidagi `description: "Oylik to'landi"` ni `description,` ga almashtiring.

`this.cashMovements.recordOutflow` chaqiruviga `cashAccountId` ni qo'shing va matnni almashtiring:

```ts
      await this.cashMovements.recordOutflow(
        {
          companyId: params.companyId,
          branchId,
          amount: params.amount,
          cashAccountId: params.cashAccountId,
          transactionId: transaction.id,
          description,
          performedById: params.performedById,
        },
        client,
      );
```

`server/src/transactions/transactions.service.ts` fasadida ham params tipini kengaytiring:

```ts
  recordSalaryPayment(
    params: {
      userId: number;
      amount: number;
      salaryPaymentId: string;
      companyId: number;
      performedById?: number;
      cashAccountId?: string;
      description?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.write.recordSalaryPayment(params, tx);
  }
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

Run: `cd server && npx jest src/transactions/`
Expected: PASS — yangi 3 ta test va mavjud transactions testlari.

- [ ] **Step 5: Commit**

```bash
git add server/src/transactions/
git commit -m "$(cat <<'EOF'
Let a salary payout name the kassa account it leaves

resolveAccountId picks a branch's oldest CASH account, which in production is
an empty «Asosiy kassa» rather than the drawer the money actually came from.
Callers that know the account can now say so; those that don't keep the
existing resolution untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `SalarySettleMonthService` — nomzodlar va oldindan tekshiruv

**Files:**
- Create: `server/src/salary/dto/settle-month.dto.ts`
- Create: `server/src/salary/salary-settle-month.service.ts`
- Create: `server/src/salary/salary-settle-month.service.spec.ts`
- Modify: `server/src/salary/salary.module.ts:20-40`

**Interfaces:**
- Consumes: Task 1 dagi `TransactionsService.recordSalaryPayment({ …, cashAccountId, description }, tx)`.
- Produces:
  - `SettleMonthDto { month?: string; paidAt: string; accounts: SettleMonthAccountDto[]; confirmAmount: number; note?: string }`
  - `SettleMonthAccountDto { branchId: number; cashAccountId: string }`
  - `SalarySettleMonthService.preview(month, companyId, performedById): Promise<SettleMonthPreview>`
  - `SalarySettleMonthService.settle(dto, companyId, performedById): Promise<SettleMonthResult>`
  - `SettleMonthPreview { month: string; period: { periodStart: Date; periodEnd: Date }; rows: SettleRow[]; total: number; branches: { branchId: number; branchName: string }[] }`
  - `SettleRow { paymentId: string; userId: number; fullName: string; branchId: number | null; branchName: string | null; amount: number; status: SalaryPaymentStatus }`
  - `SettleMonthResult { month: string; paidAt: Date; count: number; total: number; paymentIds: string[] }`

- [ ] **Step 1: DTO ni yozish**

`server/src/salary/dto/settle-month.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SettleMonthAccountDto {
  @IsInt()
  branchId!: number;

  @IsString()
  cashAccountId!: string;
}

export class SettleMonthDto {
  /** "YYYY-MM". Omitted → the current Tashkent month (same rule as the report). */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy 'YYYY-MM' ko'rinishida bo'lishi kerak",
  })
  month?: string;

  /** "YYYY-MM-DD" — the day the money actually changed hands. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "To'lov sanasi 'YYYY-MM-DD' ko'rinishida bo'lishi kerak",
  })
  paidAt!: string;

  /**
   * One kassa account per branch present in the batch. A list, not a single id:
   * each branch pays its own payroll from its own drawer (D4).
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SettleMonthAccountDto)
  accounts!: SettleMonthAccountDto[];

  /**
   * The operator retypes the exact total. Re-checked server-side, so a list that
   * changed after the dialog opened is refused instead of half-settled.
   */
  @IsInt()
  @Min(1)
  confirmAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

- [ ] **Step 2: Failing testni yozish**

`server/src/salary/salary-settle-month.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SalarySettleMonthService } from './salary-settle-month.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';

jest.mock('./shared/resolve-monthly-scope');

const mockedScope = resolveMonthlyScope as jest.MockedFunction<
  typeof resolveMonthlyScope
>;

describe('SalarySettleMonthService', () => {
  let service: SalarySettleMonthService;
  let prisma: any;
  let transactions: any;

  // 2026-07 payroll period, Tashkent-shifted instants.
  const periodStart = new Date('2026-06-30T19:00:00.000Z');
  const periodEnd = new Date('2026-07-31T18:59:59.999Z');

  const scope = {
    month: '2026-07',
    period: { periodStart, periodEnd },
    periodStartLow: new Date('2026-06-30T19:00:00.000Z'),
    periodStartHigh: new Date('2026-07-31T19:00:00.000Z'),
    branchId: undefined,
    blocked: false,
  };

  const payment = (over: Partial<any> = {}) => ({
    id: 'sp-1',
    userId: 10010,
    amount: 1_000_000,
    status: 'CALCULATED',
    note: null,
    user: {
      firstName: 'Jamsher',
      lastName: 'Murtazoxonov',
      mainBranch: 1,
      branches: [],
    },
    ...over,
  });

  beforeEach(async () => {
    mockedScope.mockResolvedValue(scope as any);

    prisma = {
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([payment()]),
        findUnique: jest.fn().mockResolvedValue({ status: 'CALCULATED', note: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      cashAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'acc-1', branchId: 1, name: "Farg'ona filiali kassa" },
          ]),
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, name: "Farg'ona" }]),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    transactions = { recordSalaryPayment: jest.fn().mockResolvedValue({ id: 'tx-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalarySettleMonthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();
    service = module.get(SalarySettleMonthService);
  });

  const dto = (over: Partial<any> = {}) => ({
    month: '2026-07',
    paidAt: '2026-08-05',
    accounts: [{ branchId: 1, cashAccountId: 'acc-1' }],
    confirmAmount: 1_000_000,
    ...over,
  });

  describe('preview', () => {
    it('returns only unpaid rows with their total and the branches they touch', async () => {
      const res = await service.preview('2026-07', 1, 1);

      expect(res.total).toBe(1_000_000);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]).toMatchObject({
        paymentId: 'sp-1',
        fullName: 'Jamsher Murtazoxonov',
        branchId: 1,
        amount: 1_000_000,
      });
      expect(res.branches).toEqual([{ branchId: 1, branchName: "Farg'ona" }]);
    });

    it('asks Prisma only for CALCULATED and APPROVED rows in the period', async () => {
      await service.preview('2026-07', 1, 1);

      expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['CALCULATED', 'APPROVED'] },
            periodStart: { gte: scope.periodStartLow, lt: scope.periodStartHigh },
          }),
        }),
      );
    });
  });

  describe('settle — refusals write nothing', () => {
    it('refuses when the retyped total does not match', async () => {
      await expect(
        service.settle(dto({ confirmAmount: 999 }) as any, 1, 1),
      ).rejects.toThrow(BadRequestException);

      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
    });

    it('refuses when there is nothing left to settle', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses a paidAt in the future', async () => {
      await expect(
        service.settle(dto({ paidAt: '2099-01-01' }) as any, 1, 1),
      ).rejects.toThrow(BadRequestException);
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses a paidAt before the period started', async () => {
      await expect(
        service.settle(dto({ paidAt: '2026-06-01' }) as any, 1, 1),
      ).rejects.toThrow(BadRequestException);
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses an account belonging to another branch', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { id: 'acc-1', branchId: 2, name: 'Namangan kassa' },
      ]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses when a payee has no branch — nothing is written for anyone', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        payment(),
        payment({
          id: 'sp-2',
          userId: 10505,
          amount: 0,
          user: { firstName: 'Muzzammila', lastName: 'Sobirova', mainBranch: null, branches: [] },
        }),
      ]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });

    it('refuses when a payee branch has no account in the request', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        payment(),
        payment({
          id: 'sp-2',
          amount: 0,
          user: { firstName: 'X', lastName: 'Y', mainBranch: 2, branches: [] },
        }),
      ]);

      await expect(service.settle(dto() as any, 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
    });
  });

  describe('settle — the happy path', () => {
    it('records the payout against the chosen account with the chosen date', async () => {
      const res = await service.settle(dto() as any, 1, 42);

      expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 10010,
          amount: 1_000_000,
          salaryPaymentId: 'sp-1',
          cashAccountId: 'acc-1',
          performedById: 42,
          description: "Oylik to'landi (tashqarida berilgani tasdiqlandi)",
        }),
        expect.anything(),
      );

      expect(prisma.salaryPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sp-1' },
          data: expect.objectContaining({
            status: 'PAID',
            paidById: 42,
            // 05.08.2026 00:00 Tashkent
            paidAt: new Date('2026-08-04T19:00:00.000Z'),
          }),
        }),
      );

      expect(res).toMatchObject({ count: 1, total: 1_000_000, month: '2026-07' });
    });

    it('stamps an audit marker onto the note', async () => {
      await service.settle(dto({ note: 'Naqd berildi' }) as any, 1, 42);

      const data = prisma.salaryPayment.update.mock.calls[0][0].data;
      expect(data.note).toContain('Tashqarida berilgan oylik tasdiqlandi');
      expect(data.note).toContain('2026-08-05');
      expect(data.note).toContain('Naqd berildi');
    });

    it('skips a row another request already paid, inside the transaction', async () => {
      prisma.salaryPayment.findUnique.mockResolvedValue({ status: 'PAID', note: null });

      const res = await service.settle(dto() as any, 1, 42);

      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(res.count).toBe(0);
    });
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, yiqilishiga ishonch hosil qilish**

Run: `cd server && npx jest src/salary/salary-settle-month.service.spec.ts`
Expected: FAIL — `Cannot find module './salary-settle-month.service'`.

- [ ] **Step 4: Servisni yozish**

`server/src/salary/salary-settle-month.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  assertValidTransition,
  SALARY_PAYMENT_TRANSITIONS,
} from '../common/finance/status-transitions';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';
import { parseTashkentDateStart } from './shared/resolve-current-period';
import { SettleMonthDto } from './dto/settle-month.dto';

const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10000,
  timeout: 15000,
} as const;

/** Ledger + cash-journal wording, so the row explains itself years later. */
const SETTLE_DESCRIPTION = "Oylik to'landi (tashqarida berilgani tasdiqlandi)";

export interface SettleRow {
  paymentId: string;
  userId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  amount: number;
  status: SalaryPaymentStatus;
}

export interface SettleMonthPreview {
  month: string;
  period: { periodStart: Date; periodEnd: Date };
  rows: SettleRow[];
  total: number;
  branches: { branchId: number; branchName: string }[];
}

export interface SettleMonthResult {
  month: string;
  paidAt: Date;
  count: number;
  total: number;
  paymentIds: string[];
}

/**
 * Close a whole payroll month that was paid OUTSIDE the system.
 *
 * June and July 2026 were handed over in cash at exactly the calculated
 * amounts, but the rows stayed CALCULATED — so teacher balances carried
 * payouts that had already happened and the kassa read that much too high.
 *
 * Two things make this different from `batchPay`:
 *
 * 1. **The kassa account is named by the caller.** `resolveAccountId` picks the
 *    branch's oldest CASH account, which in production is an empty
 *    «Asosiy kassa» — 130 mln booked there would be a fiction.
 * 2. **Validate everything, then write.** `batchPay` wraps each payment in its
 *    own try/catch and reports failures; that is right for a routine run. Here
 *    the money is irreversible and the operator has just retyped the total, so
 *    a half-settled month is the one outcome nobody can act on.
 */
@Injectable()
export class SalarySettleMonthService {
  constructor(
    private prisma: PrismaService,
    private transactions: TransactionsService,
  ) {}

  async preview(
    month: string | undefined,
    companyId: number,
    performedById: number,
  ): Promise<SettleMonthPreview> {
    const { scope, rows, total } = await this.loadCandidates(
      month,
      companyId,
      performedById,
    );

    const branchIds = [
      ...new Set(rows.map((r) => r.branchId).filter((b): b is number => b != null)),
    ];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        })
      : [];
    const nameById = new Map(branches.map((b) => [b.id, b.name]));

    return {
      month: scope.month,
      period: {
        periodStart: scope.period.periodStart,
        periodEnd: scope.period.periodEnd,
      },
      rows: rows.map((r) => ({
        ...r,
        branchName: r.branchId != null ? (nameById.get(r.branchId) ?? null) : null,
      })),
      total,
      branches: branchIds.map((id) => ({
        branchId: id,
        branchName: nameById.get(id) ?? `#${id}`,
      })),
    };
  }

  async settle(
    dto: SettleMonthDto,
    companyId: number,
    performedById: number,
  ): Promise<SettleMonthResult> {
    const { scope, rows, total, raw } = await this.loadCandidates(
      dto.month,
      companyId,
      performedById,
    );

    if (rows.length === 0) {
      throw new BadRequestException(
        "Bu oyda to'lanmagan oylik yo'q — hammasi allaqachon to'langan yoki bekor qilingan",
      );
    }

    // Optimistic lock. The operator retyped a total they read on screen; if the
    // set moved since (a cron re-run, another admin), that total is no longer a
    // statement about what will leave, so nothing may leave.
    if (dto.confirmAmount !== total) {
      throw new BadRequestException(
        `Summa mos kelmadi — ro'yxat o'zgargan bo'lishi mumkin. Oynani yangilang. ` +
          `Kutilgan summa: ${total}`,
      );
    }

    const paidAt = parseTashkentDateStart(dto.paidAt);
    if (paidAt.getTime() > Date.now()) {
      throw new BadRequestException(
        "To'lov sanasi kelajakda bo'lishi mumkin emas",
      );
    }
    if (paidAt.getTime() < scope.period.periodStart.getTime()) {
      throw new BadRequestException(
        "To'lov sanasi hisoblash davri boshlanishidan oldin bo'lishi mumkin emas",
      );
    }

    // ─── Kassa accounts: exist, active, and belong to the branch claimed ───
    const requestedIds = dto.accounts.map((a) => a.cashAccountId);
    const accounts = await this.prisma.cashAccount.findMany({
      where: {
        id: { in: requestedIds },
        companyId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, branchId: true, name: true },
    });
    const accById = new Map(accounts.map((a) => [a.id, a]));
    const accountByBranch = new Map<number, string>();
    for (const a of dto.accounts) {
      const found = accById.get(a.cashAccountId);
      if (!found) {
        throw new BadRequestException(
          'Tanlangan kassa hisobi topilmadi yoki faol emas',
        );
      }
      if (found.branchId !== a.branchId) {
        throw new BadRequestException(
          `«${found.name}» hisobi boshqa filialga tegishli — har filial o'z kassasidan to'laydi`,
        );
      }
      accountByBranch.set(a.branchId, a.cashAccountId);
    }

    // ─── Per-payment pre-flight: nothing is written until all of this holds ──
    const noBranch = rows.filter((r) => r.branchId == null).map((r) => r.fullName);
    if (noBranch.length) {
      throw new BadRequestException(
        `Bu xodimlarning filiali aniqlanmadi, shuning uchun oylik yozilmadi: ${noBranch.join(', ')}`,
      );
    }
    const noAccount = rows
      .filter((r) => !accountByBranch.has(r.branchId as number))
      .map((r) => r.fullName);
    if (noAccount.length) {
      throw new BadRequestException(
        `Bu xodimlar filiali uchun kassa hisobi tanlanmadi: ${noAccount.join(', ')}`,
      );
    }
    for (const r of rows) {
      if (r.status === SalaryPaymentStatus.CALCULATED) {
        assertValidTransition(
          'SalaryPayment',
          SALARY_PAYMENT_TRANSITIONS,
          r.status,
          SalaryPaymentStatus.APPROVED,
        );
      }
      assertValidTransition(
        'SalaryPayment',
        SALARY_PAYMENT_TRANSITIONS,
        SalaryPaymentStatus.APPROVED,
        SalaryPaymentStatus.PAID,
      );
    }

    // ─── Write. One Serializable tx per payment. ────────────────────────────
    const noteById = new Map(raw.map((p) => [p.id, p.note]));
    const paymentIds: string[] = [];
    let settledTotal = 0;

    for (const r of rows) {
      const written = await this.prisma.$transaction(async (tx) => {
        // Re-read under the tx: another request may have paid this row between
        // the pre-flight and here. Skipping keeps the action idempotent.
        const fresh = await tx.salaryPayment.findUnique({
          where: { id: r.paymentId },
          select: { status: true, note: true },
        });
        if (!fresh || fresh.status === SalaryPaymentStatus.PAID) return false;

        await this.transactions.recordSalaryPayment(
          {
            userId: r.userId,
            amount: r.amount,
            salaryPaymentId: r.paymentId,
            companyId,
            performedById,
            cashAccountId: accountByBranch.get(r.branchId as number),
            description: SETTLE_DESCRIPTION,
          },
          tx,
        );

        await tx.salaryPayment.update({
          where: { id: r.paymentId },
          data: {
            status: SalaryPaymentStatus.PAID,
            paidAt,
            paidById: performedById,
            note: buildSettleNote(
              fresh.note ?? noteById.get(r.paymentId) ?? null,
              dto.paidAt,
              dto.note,
            ),
          },
        });
        return true;
      }, TX);

      if (written) {
        paymentIds.push(r.paymentId);
        settledTotal += r.amount;
      }
    }

    return {
      month: scope.month,
      paidAt,
      count: paymentIds.length,
      total: settledTotal,
      paymentIds,
    };
  }

  /**
   * The month's still-unpaid payroll rows.
   *
   * The month → period translation is `resolveMonthlyScope` — the SAME helper
   * the `/salary/monthly` table uses — so the button can never settle a set the
   * table did not show. CANCELLED and PAID rows are excluded, which is what
   * makes a repeat call a no-op.
   */
  private async loadCandidates(
    month: string | undefined,
    companyId: number,
    performedById: number,
  ) {
    const scope = await resolveMonthlyScope(
      this.prisma,
      { month },
      companyId,
      performedById,
    );

    const raw = scope.blocked
      ? []
      : await this.prisma.salaryPayment.findMany({
          where: {
            companyId,
            status: {
              in: [SalaryPaymentStatus.CALCULATED, SalaryPaymentStatus.APPROVED],
            },
            periodStart: {
              gte: scope.periodStartLow,
              lt: scope.periodStartHigh,
            },
            ...(scope.branchId !== undefined && {
              user: { mainBranch: scope.branchId },
            }),
          },
          select: {
            id: true,
            userId: true,
            amount: true,
            status: true,
            note: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                mainBranch: true,
                branches: { select: { branchId: true }, orderBy: { branchId: 'asc' } },
              },
            },
          },
          orderBy: [{ amount: 'desc' }],
        });

    const rows: SettleRow[] = raw.map((p) => ({
      paymentId: p.id,
      userId: p.userId,
      fullName: `${p.user.firstName} ${p.user.lastName}`.trim(),
      // Same rule as `tryResolveUserBranchId`: mainBranch, else the single
      // attached branch. Inlined because the payee list is already loaded and a
      // per-row DB round trip would be pure waste.
      branchId:
        p.user.mainBranch ??
        (p.user.branches.length === 1 ? p.user.branches[0].branchId : null),
      branchName: null,
      amount: p.amount,
      status: p.status,
    }));

    return {
      scope,
      raw,
      rows,
      total: rows.reduce((s, r) => s + r.amount, 0),
    };
  }
}

/** Audit marker on the payment itself, alongside `paidById` / `paidAt`. */
export function buildSettleNote(
  existing: string | null,
  paidAtStr: string,
  userNote?: string,
): string {
  const parts = [
    existing?.trim(),
    `Tashqarida berilgan oylik tasdiqlandi (${paidAtStr})`,
    userNote?.trim(),
  ].filter((p): p is string => !!p);
  return parts.join(' · ');
}
```

- [ ] **Step 5: Modulga ro'yxatdan o'tkazish**

`server/src/salary/salary.module.ts` — importni qo'shing:

```ts
import { SalarySettleMonthService } from './salary-settle-month.service';
```

`providers` ro'yxatiga `SalaryPaymentService,` dan keyin `SalarySettleMonthService,` qo'shing, `exports` ga tegmang (faqat fasad orqali ishlatiladi).

- [ ] **Step 6: Testlar o'tishini tekshirish**

Run: `cd server && npx jest src/salary/salary-settle-month.service.spec.ts`
Expected: PASS — 13 ta test.

- [ ] **Step 7: Commit**

```bash
git add server/src/salary/salary-settle-month.service.ts \
        server/src/salary/salary-settle-month.service.spec.ts \
        server/src/salary/dto/settle-month.dto.ts \
        server/src/salary/salary.module.ts
git commit -m "$(cat <<'EOF'
Close a payroll month that was paid outside the system

Validate everything first, then write. batchPay's per-payment try/catch is
right for a routine run, but here the money is irreversible and the operator
has just retyped the total — a half-settled month is the one outcome nobody
can act on. The retyped total is re-checked server-side, so a set that moved
after the dialog opened is refused rather than partly settled.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Endpointlar, fasad va route manifesti

**Files:**
- Modify: `server/src/salary/salary.service.ts` (fasad oxiriga)
- Modify: `server/src/salary/salary.controller.ts` (oxirgi metoddan keyin)
- Modify: `server/src/common/auth/branch-route-policy.ts:292-303`
- Test: `server/src/salary/salary.controller.spec.ts`

**Interfaces:**
- Consumes: Task 2 dagi `SalarySettleMonthService.preview` / `.settle`.
- Produces: `GET /salary/payments/settle-month/preview?month=YYYY-MM` va `POST /salary/payments/settle-month`, ikkalasi ham `@Roles('CEO')`.

- [ ] **Step 1: Failing guard testini yozish**

`server/src/salary/salary.controller.spec.ts` — mavjud `'CEO-only writes (Faza 2 narrowing)'` blokining ichiga qo'shing:

```ts
    it.each(['previewSettleMonth', 'settleMonth'] as const)(
      '%s requires CEO — a month-wide irreversible settle is not a BD action',
      (method) => {
        expect(rolesFor(method)).toEqual(['CEO']);
      },
    );
```

- [ ] **Step 2: Testni ishga tushirib, yiqilishiga ishonch hosil qilish**

Run: `cd server && npx jest src/salary/salary.controller.spec.ts`
Expected: FAIL — `previewSettleMonth` `SalaryController.prototype` da yo'q (`rolesFor` `undefined` handler'da yiqiladi).

- [ ] **Step 3: Fasadga metodlarni qo'shish**

`server/src/salary/salary.service.ts` — importlarga:

```ts
import { SalarySettleMonthService } from './salary-settle-month.service';
import { SettleMonthDto } from './dto/settle-month.dto';
```

Konstruktorga `private settleMonthService: SalarySettleMonthService,` qo'shing va faylning oxiriga (klass ichida):

```ts
  // Month-wide settle for payroll handed over outside the system.
  previewSettleMonth(
    month: string | undefined,
    companyId: number,
    performedById: number,
  ) {
    return this.settleMonthService.preview(month, companyId, performedById);
  }
  settleMonth(dto: SettleMonthDto, companyId: number, performedById: number) {
    return this.settleMonthService.settle(dto, companyId, performedById);
  }
```

- [ ] **Step 4: Controllerga endpointlarni qo'shish**

`server/src/salary/salary.controller.ts` — importga:

```ts
import { SettleMonthDto } from './dto/settle-month.dto';
```

Klassning oxirgi metodi (`batchPay`) dan keyin:

```ts
  /**
   * What a month-wide settle would close, for the confirmation dialog: every
   * still-unpaid payroll row of the month, its total, and the branches whose
   * kassa the money leaves. Read-only.
   *
   * A dedicated endpoint rather than reusing `/salary/monthly`: that table shows
   * ONE payment per employee, and a re-calculated month legitimately carries
   * several rows per person (June 2026 has two for six teachers). The dialog
   * must list exactly what it is about to settle.
   */
  @Get('payments/settle-month/preview')
  @Roles('CEO')
  previewSettleMonth(
    @Query('month') month: string | undefined,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.salaryService.previewSettleMonth(month, companyId, userId);
  }

  /**
   * Mark a whole month's payroll PAID — for salaries that were handed over
   * outside the system at the amounts the system had already calculated.
   * CEO-only: irreversible and month-wide. A Branch Director still pays a
   * single employee through `POST /salary/payments/:id/pay`.
   */
  @Post('payments/settle-month')
  @Roles('CEO')
  settleMonth(
    @Body() dto: SettleMonthDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.salaryService.settleMonth(dto, companyId, userId);
  }
```

**Diqqat — joylashuv:** Nest yo'llarni **e'lon tartibida** ro'yxatdan o'tkazadi, shuning uchun literal segmentli yo'l parametrli yo'ldan oldin turishi kerak. Bu yerdagi ikkala yangi yo'l mavjudlari bilan aslida to'qnashmaydi (`payments/settle-month` — 2 segment, `payments/:id/pay` — 3), lekin ehtiyot yuzasidan ikkala yangi metodni `approvePayment` / `payPayment` dan **oldin** joylashtiring — keyinchalik kimdir `@Get('payments/:id')` qo'shsa, tartib allaqachon to'g'ri bo'ladi.

- [ ] **Step 5: Route manifestini yangilash**

`server/src/common/auth/branch-route-policy.ts`, `BRANCH_SCOPED_BY_PAYROLL` bloki, `routes` massiviga alifbo tartibida qo'shing:

```ts
      'GET /salary/payments/settle-month/preview',
```
(`'GET /salary/payments/:id/breakdown'` dan keyin)

```ts
      'POST /salary/payments/settle-month',
```
(`'POST /salary/payments/batch-pay'` dan keyin)

- [ ] **Step 6: Testlar o'tishini tekshirish**

Run: `cd server && npx jest src/salary/salary.controller.spec.ts src/common/auth/branch-route-policy.spec.ts`
Expected: PASS — guard metadata testlari va manifest to'liqligi testi.

- [ ] **Step 7: Commit**

```bash
git add server/src/salary/salary.controller.ts \
        server/src/salary/salary.controller.spec.ts \
        server/src/salary/salary.service.ts \
        server/src/common/auth/branch-route-policy.ts
git commit -m "$(cat <<'EOF'
Expose the month settle behind a CEO-only pair of routes

The preview is its own endpoint rather than a reuse of /salary/monthly: that
table shows one payment per employee, while a re-calculated month carries
several per person — June 2026 has two for six teachers — and a confirmation
dialog has to list exactly what it will settle.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tasdiqlash dialogi

**Files:**
- Create: `client/src/components/payments/salary-settle-month-dialog.tsx`

**Interfaces:**
- Consumes: `GET /salary/payments/settle-month/preview?month=`, `GET /cash-accounts`, `POST /salary/payments/settle-month`.
- Produces: `<SettleMonthDialog open month onOpenChange onSettled />` — `onSettled` muvaffaqiyatdan keyin ota-komponentga xabar beradi.

- [ ] **Step 1: Komponentni yozish**

`client/src/components/payments/salary-settle-month-dialog.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { monthLabel } from "./salary-utils";

interface SettleRow {
  paymentId: string;
  userId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  amount: number;
  status: string;
}
interface PreviewResponse {
  month: string;
  period: { periodStart: string; periodEnd: string };
  rows: SettleRow[];
  total: number;
  branches: { branchId: number; branchName: string }[];
}
interface CashAccount {
  id: string;
  name: string;
  type: "CASH" | "BANK";
  branchId: number | null;
  balance: number;
}

interface Props {
  open: boolean;
  month: string;
  onOpenChange: (open: boolean) => void;
  onSettled: () => void;
}

/** "yyyy-MM-dd" in Tashkent terms — the API takes a date, not an instant. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SettleMonthDialog({ open, month, onOpenChange, onSettled }: Props) {
  const [paidAt, setPaidAt] = useState<Date>(() => new Date());
  const [accountByBranch, setAccountByBranch] = useState<Record<number, string>>({});
  const [typedTotal, setTypedTotal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["settle-month-preview", month],
    queryFn: () =>
      api
        .get<PreviewResponse>("/salary/payments/settle-month/preview", {
          params: { month },
        })
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const { data: accounts } = useQuery({
    queryKey: ["cash-accounts-for-settle"],
    queryFn: () =>
      api
        .get<{ data: CashAccount[] }>("/cash-accounts")
        .then((r) => r.data.data),
    enabled: open,
    staleTime: 0,
  });

  const total = preview?.total ?? 0;
  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const branches = useMemo(() => preview?.branches ?? [], [preview]);

  // Every branch in the batch must have an account picked, and the retyped
  // digits must equal the total exactly. Typing the sum is the confirmation:
  // it is the one number the operator has to have read.
  const allBranchesChosen =
    branches.length > 0 && branches.every((b) => !!accountByBranch[b.branchId]);
  const totalMatches = typedTotal.replace(/\D/g, "") === String(total);
  const canSubmit = allBranchesChosen && totalMatches && total > 0 && !submitting;

  const periodStart = preview ? new Date(preview.period.periodStart) : undefined;

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ count: number; total: number }>(
        "/salary/payments/settle-month",
        {
          month,
          paidAt: toDateStr(paidAt),
          accounts: branches.map((b) => ({
            branchId: b.branchId,
            cashAccountId: accountByBranch[b.branchId],
          })),
          confirmAmount: total,
        },
      );
      toast.success(
        `${res.data.count} ta oylik to'langan deb belgilandi — ${formatPrice(res.data.total)} so'm`,
      );
      onSettled();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Tasdiqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {monthLabel(preview?.month ?? month)} oyligi — to&apos;langanini tasdiqlash
          </DialogTitle>
          <DialogDescription>
            Tizimdan tashqarida berilgan oylikni rasmiylashtirish.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Bu oyda to&apos;lanmagan oylik yo&apos;q.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Bu amal qaytarilmaydi. Tizim{" "}
                  <b className="tabular-nums">{formatPrice(total)} so&apos;m</b>ni
                  kassadan chiqim qilib yozadi va {rows.length} ta xodim balansidan
                  ayiradi.
                </span>
              </div>

              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 border-r">#</TableHead>
                      <TableHead>Xodim</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.paymentId}>
                        <TableCell className="border-r text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell>{r.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.branchName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPrice(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell className="border-r" />
                      <TableCell colSpan={2}>JAMI</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <Label>Pul qachon berilgan?</Label>
                <DatePicker
                  value={paidAt}
                  onChange={(d) => d && setPaidAt(d)}
                  maxDate={new Date()}
                  minDate={periodStart}
                />
              </div>

              {branches.map((b) => {
                const chosen = accounts?.find(
                  (a) => a.id === accountByBranch[b.branchId],
                );
                const after = chosen ? chosen.balance - branchTotal(rows, b.branchId) : null;
                return (
                  <div key={b.branchId} className="space-y-2">
                    <Label>{b.branchName} — qaysi kassadan chiqdi?</Label>
                    <Select
                      value={accountByBranch[b.branchId] ?? ""}
                      onValueChange={(v) =>
                        setAccountByBranch((prev) => ({ ...prev, [b.branchId]: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kassa hisobini tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {(accounts ?? [])
                          .filter((a) => a.branchId === b.branchId)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} — {formatPrice(a.balance)} so&apos;m
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {after !== null && (
                      <p
                        className={
                          after < 0
                            ? "text-xs text-amber-600 dark:text-amber-500"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        Keyin: {formatPrice(after)} so&apos;m
                        {after < 0 &&
                          " — bu hisobda yetarli mablag' ko'rinmayapti, lekin pul haqiqatda chiqib ketgan bo'lsa davom eting."}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="space-y-2">
                <Label htmlFor="settle-total">
                  Tasdiqlash uchun jami summani yozing: {total}
                </Label>
                <Input
                  id="settle-total"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={String(total)}
                  value={typedTotal}
                  onChange={(e) => setTypedTotal(e.target.value)}
                />
                {typedTotal.length > 0 && !totalMatches && (
                  <p className="text-xs text-destructive">Summa mos kelmadi</p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            To&apos;langanini tasdiqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** How much of the batch leaves one branch's kassa. */
function branchTotal(rows: SettleRow[], branchId: number): number {
  return rows
    .filter((r) => r.branchId === branchId)
    .reduce((s, r) => s + r.amount, 0);
}
```

- [ ] **Step 2: `DatePicker` propslarini tekshirish**

Run: `cd client && grep -n "interface DatePickerProps" -A 15 src/components/ui/date-picker.tsx`
Expected: `value`, `onChange`, `minDate`, `maxDate` mavjud. Nomlari farq qilsa — komponentdagi chaqiruvni fayldagi haqiqiy imzoga moslang, `date-picker.tsx` ni **o'zgartirmang**.

- [ ] **Step 3: Kompilyatsiyani tekshirish**

Run: `cd client && npx tsc --noEmit`
Expected: bu fayl bo'yicha xato yo'q. (Loyihada oldindan mavjud, aloqasi yo'q xatolar bo'lsa — ular qoladi, yangisini kiritmang.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/payments/salary-settle-month-dialog.tsx
git commit -m "$(cat <<'EOF'
Ask for the total in digits before settling a payroll month

A random code would prove deliberateness without proving comprehension. The
total is the one number that has to be read, so retyping it is both the
friction and the check — and the server re-checks it against the live set.

The row list is not paginated, deliberately: a confirmation dialog that hides
part of what it is confirming works against its own purpose.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tugmani hisobot sahifasiga ulash

**Files:**
- Modify: `client/src/components/payments/salary-monthly-view.tsx:1-56` (importlar), `:140-230` (holat + filter qatori)

**Interfaces:**
- Consumes: Task 4 dagi `<SettleMonthDialog />`, Task 3 dagi preview endpoint.

- [ ] **Step 1: Importlarni qo'shish**

`salary-monthly-view.tsx` importlariga:

```tsx
import { BadgeCheck } from "lucide-react";
import { SettleMonthDialog } from "./salary-settle-month-dialog";
```

(`lucide-react` importi allaqachon bor — `BadgeCheck` ni mavjud ro'yxatga qo'shing.)

- [ ] **Step 2: Holat va nomzodlar sonini qo'shish**

`const { data, isLoading } = useQuery({ queryKey: ["salary-monthly", ...`  chaqiruvidan keyin qo'shing:

```tsx
  const [settleOpen, setSettleOpen] = useState(false);

  // How many payroll rows this month still carries as unpaid. Read from the
  // settle preview, not from the table: the table shows one payment per
  // employee, and a re-calculated month can carry several per person.
  const { data: settlePreview } = useQuery({
    queryKey: ["settle-month-preview", shownMonth, refreshKey],
    queryFn: () =>
      api
        .get<{ rows: unknown[]; total: number }>(
          "/salary/payments/settle-month/preview",
          { params: { month: shownMonth } },
        )
        .then((r) => r.data),
    enabled: isCeo,
    staleTime: 0,
  });
  const unpaidCount = settlePreview?.rows.length ?? 0;
```

**Diqqat:** `shownMonth` `data` dan keyin e'lon qilingan — bu blokni `const monthHasNoData = …` qatoridan **keyin** joylashtiring, aks holda `shownMonth` hali mavjud bo'lmaydi.

- [ ] **Step 3: Tugmani filter qatoriga qo'shish**

`{isCeo && ( … Sozlamalar … )}` blokidan **oldin**:

```tsx
        {isCeo && unpaidCount > 0 && (
          <Button
            variant="outline"
            className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={() => setSettleOpen(true)}
          >
            <BadgeCheck className="size-4" />
            Oylik berilganini tasdiqlash ({unpaidCount} ta)
          </Button>
        )}
```

- [ ] **Step 4: Dialogni render qilish**

Komponentning `return` ichidagi, boshqa dialoglar turgan joyga (fayl oxiridagi `<SalarySettingsSheet …/>` yonига):

```tsx
      {isCeo && (
        <SettleMonthDialog
          open={settleOpen}
          month={shownMonth}
          onOpenChange={setSettleOpen}
          onSettled={bumpRefresh}
        />
      )}
```

- [ ] **Step 5: Build**

Run: `cd client && npm run build`
Expected: muvaffaqiyatli build, xatosiz.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/payments/salary-monthly-view.tsx
git commit -m "$(cat <<'EOF'
Surface the month settle on the salary report

The count comes from the settle preview rather than the table, because the
table renders one payment per employee while the batch may hold several.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Hujjat va to'liq tekshiruv

**Files:**
- Modify: `server/CLAUDE.md` (Salary Module bo'limi)
- Modify: `client/CLAUDE.md` (Financial UI → Key Components)

- [ ] **Step 1: Server hujjatini yangilash**

`server/CLAUDE.md`, `#### Salary Module (src/salary/)` bo'limidagi **Endpoints** qatoriga `POST /salary/payments/batch-pay` dan keyin qo'shing:

```
`GET /salary/payments/settle-month/preview` (CEO), `POST /salary/payments/settle-month` (CEO)
```

Shu bo'limning oxiriga yangi paragraf:

```markdown
- **Month settle for payroll paid outside the system** (`SalarySettleMonthService`): June and July 2026 were handed over in cash at exactly the calculated amounts, but every `SalaryPayment` stayed `CALCULATED` — so teacher balances carried ~169 mln so'm of payouts that had already happened, and the kassa read 130 mln too high. `POST /salary/payments/settle-month` closes a whole month: it resolves the month through **`resolveMonthlyScope`** (the same helper `/salary/monthly` uses, so the button can never settle a set the table did not show), takes every `CALCULATED`/`APPROVED` row of that period, and walks each through `CALCULATED → APPROVED → PAID` with `recordSalaryPayment`. Three things differ from `batchPay` and each is load-bearing: (1) **the kassa account is named by the caller** — `resolveAccountId` picks the branch's OLDEST `CASH` account, which in production is an empty «Asosiy kassa», so `recordSalaryPayment` now takes an optional `cashAccountId` (and `description`); (2) **accounts are a per-branch LIST, not one id** — each branch pays its own payroll from its own drawer (D4), and the service rejects an account whose `branchId` does not match the payee's; (3) **validate everything, then write** — `batchPay`'s per-payment `try/catch` is right for a routine run, but here the money is irreversible and the operator has just retyped the total, so a missing branch or account aborts the whole batch before anything is written. The retyped `confirmAmount` is re-checked server-side: a set that moved after the dialog opened is refused, not partly settled. `PAID`/`CANCELLED` rows never enter the candidate set, which is what makes a repeat call a no-op, and each write re-reads the row inside its own Serializable tx so a concurrent settle is skipped rather than doubled. **Consequence to expect:** the month becomes a CLOSED payroll period, so a late student payment settling one of its lessons carries the teacher's accrual forward to the current period via `creditPeriodDate` ("Oldingi oydan") — the designed behaviour, nothing is lost. Net profit does NOT move: `getMonthlyNetProfit` subtracts DESERVED salary, not `paidAt`; what moves is the cash-basis surfaces (`/overview` «Ustoz oyliklari — to'langan», the Excel «Oyliklar» sheet, Foyda-zarar), which is why `paidAt` is the real handover date the CEO enters and not `now()`.
```

- [ ] **Step 2: Client hujjatini yangilash**

`client/CLAUDE.md`, `#### Key Components` ro'yxatiga `**salary-settings-sheet.tsx**` dan oldin qo'shing:

```markdown
- **`salary-settle-month-dialog.tsx`** — «Oylik berilganini tasdiqlash» (CEO-only button in the `/payments/salary` filter row, shown only when the selected month still has unpaid payroll). Confirms salaries that were **handed over outside the system** at the calculated amounts. Reads `GET /salary/payments/settle-month/preview` — a dedicated endpoint, NOT the table, because the table shows one payment per employee while a re-calculated month carries several per person (June 2026: two rows for six teachers) and the dialog must list exactly what it settles. Requires three things: the real handover **date** (`DatePicker`, `maxDate` today, `minDate` period start), one **kassa account per branch** in the batch (with a live "keyin: X so'm" projection that warns in amber on a negative result but never blocks — the money really did leave), and the **total retyped in digits**. Typing the sum is the confirmation rather than a random code: the total is the one number the operator has to have read, and the server re-checks it against the live set. **This dialog's table is deliberately NOT paginated** — a confirmation dialog that hides part of what it is confirming works against its own purpose.
```

- [ ] **Step 3: To'liq test to'plami**

Run: `cd server && npm test`
Expected: barcha testlar o'tadi (yangilari bilan birga).

- [ ] **Step 4: Client build**

Run: `cd client && npm run build`
Expected: xatosiz build.

- [ ] **Step 5: Commit**

```bash
git add server/CLAUDE.md client/CLAUDE.md
git commit -m "$(cat <<'EOF'
Document the month settle and why paidAt is the real handover date

Net profit subtracts deserved salary, so it does not move; the cash-basis
surfaces do, which is the whole reason the date is asked for rather than
stamped as now().

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Deploy eslatmasi (implementatsiyadan keyin, alohida qadam)

Backend GitHub'ga ulanmagan — `main` ga merge **deploy qilmaydi**. Ishlagandan keyin `cd server && railway up` kerak. Frontend uchun Vercel ham git-ulangan emas: toza `origin/main` worktree'dan deploy qiling, WIP ko'targan daraxtdan emas.

Prodda birinchi ishlatishda: iyun (16 qator, 50 387 430) va iyul (10 qator, 80 083 715) alohida dialoglar bilan yopiladi — har biriga o'z sanasi va o'z kassa hisobi.
