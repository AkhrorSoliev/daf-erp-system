# To'lovlar hisoboti — 1-bosqich: server (amalga oshirish rejasi)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchining «To'lovlar hisoboti»ni (JSON va PDF) bitta server modelidan quradigan modul, admin va o'quvchi uchun yuklab olish endpointlari hamda hisobot qoidalari uchun ADR.

**Architecture:**
- Sof (Prisma'siz) yadro uch fayldan iborat:
  - `statement-months.ts`: dars pulini dars o'tilgan oyga yozadi, ichki tuzatishlarni darsga qo'shadi, balans bilan so'mma-so'm tekshiradi.
  - `statement-analysis.ts`: FIFO taqsimot, qarz sarlavhasi, keskin farq va to'lov turi o'zgarishi.
  - `build-statement.ts`: ikkalasini `StatementModel` ga yig'adi.
- Matn yagona joyda: `statement-text.ts` va `present-statement.ts`, o'quvchi yoki admin tilida. PDF (`statement-pdf.ts`, pdfmake) va JSON shu ko'rinishdan chiziladi.
- `StatementLoader` Prisma'dan kirish ma'lumotini yig'adi. `StatementService` ularni ulaydi. Ikki controller hisobotni beradi: admin (`students/:id/statement`, `.pdf`) va portal (`student-portal/statement.pdf`).

**Tech Stack:** NestJS 11, Prisma 7 (`PrismaPg`), pdfmake 0.2 (`renderPdf`, Inter shrifti), Jest 30 + ts-jest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-26-tolovlar-hisoboti-design.md`. Bu reja faqat 1-bosqichni (server) qamraydi. Admin tabi, portal va bot keyingi rejalarda.
- Kod izohlari, test nomlari, commit va PR matni **inglizcha**. Hisobotdagi foydalanuvchi matni **o'zbekcha, faqat lotin yozuvida**. ADR o'zbekcha (repo odati).
- Repo ochiq: prod ID, ism va summalar repoga tushmaydi. Quruq yurish natijasi `~/daf-erp-ops/` ga yoziladi.
- Pul qoidasi (ADR-0004): ishora manba qatordan olinadi, `Math.abs` pul hisobida ishlatilmaydi (faqat matnda ko'rsatish uchun `som()` ichida).
- Kun chegaralari faqat `src/common/date/tashkent.ts` orqali: `tashkentDateStr` vaqt belgisi va `@db.Date` uchun, `Transaction.createdAt` Toshkent kuniga aylantiriladi.
- Guruh yorlig'i ilovadagidek: `#${String(groupNumber).padStart(3, '0')}` (`#036`).
- Keskin farq chegarasi: kamida **50 000 so'm va 20%**. Narx farqi 500 so'mdan kam bo'lsa, yaxlitlash deb hisoblanadi.
- Admin endpointlari: `@Roles('CEO', 'Branch Director', 'Administrator')` va `assertCallerMayTouchStudent`. Portal: `@Roles('Student')`, `StudentCardGuard`, `studentId` va `companyId` token'dan.
- Har yangi route `server/src/common/auth/branch-route-policy.ts` manifestida tasniflanadi.
- Prodga yozish (bir martalik skript) faqat CEO «ha» deganidan keyin.
- Deploy bu rejaning qismi emas: PR merge qilinadi, chiqarish CEO ruxsati bilan alohida.
- Buyruqlar `server/` papkasidan yuritiladi (worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/shartnoma-tolov-qoidalari`, branch `feat/tolovlar-hisoboti`).

---

### Task 1: Yangi qaytarish yozuvlariga `metadata.kind` belgisi

Hisobot keyinchalik matnni tahlil qilmasligi uchun, darsning pulini qaytaradigan har yangi ADJUSTMENT o'zini belgilab yozadi.

**Files:**
- Modify: `server/src/billing/monthly-charge.service.ts` (`reverseChargeForDeparture` ichidagi `createAdjustment`)
- Modify: `server/src/billing/enrollment-billing.service.ts` (`releasePrepaidLessons`, `refundPrepaidWithOverride` ichidagi `createAdjustment`)
- Test: `server/src/billing/monthly-charge.service.spec.ts`, `server/src/billing/enrollment-billing.service.spec.ts`

**Interfaces:**
- Produces: ADJUSTMENT `metadata`:
  - oylikdan ketish: `{ kind: 'monthly-release', enrollmentId, period: 'YYYY-MM', lessons, dates? }`;
  - paket qaytarish: `{ kind: 'prepaid-release', enrollmentId, lessons, ...callerMetadata }`.
  - 2-vazifadagi tasnif shu kalitlarni o'qiydi.

- [ ] **Step 1: Write the failing tests**

`monthly-charge.service.spec.ts` ichidagi `describe('reverseChargeForDeparture')` bo'limiga:

```ts
    it('tags the refund so the statement can fold it without reading the text', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-1',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        coveredDates: [
          '2026-09-01', '2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10',
          '2026-09-12', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-22',
          '2026-09-24', '2026-09-26', '2026-09-29',
        ],
        frozenOutDates: [],
        perLessonCost: 34_615,
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-09-20T00:00:00Z'),
        companyId: 1,
        reason: 'Guruhdan chiqarilganda',
        today: '2026-09-20',
      });

      expect(txWriteMock.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            kind: 'monthly-release',
            enrollmentId: 'enr-1',
            period: '2026-09',
            lessons: 4,
            dates: ['2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'],
          },
        }),
        tx,
      );
    });
```

`enrollment-billing.service.spec.ts` ichida `releasePrepaidLessons` va `refundPrepaidWithOverride` testlari yonida (mavjud fixture va mock nomlaridan foydalaning; `createAdjustment` mock'i `transactionsService.createAdjustment`):

```ts
  it('tags a prepaid release with its kind, enrollment and lesson count', async () => {
    // Arrange as the existing releasePrepaidLessons test does: an enrollment
    // with 5 prepaid lessons left on a 12-lesson course.
    await service.releasePrepaidLessons(tx, { enrollmentId: 'enr-1', lessons: 3 });

    expect(transactionsServiceMock.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { kind: 'prepaid-release', enrollmentId: 'enr-1', lessons: 3 },
      }),
      tx,
    );
  });

  it('keeps the caller metadata next to the release tag', async () => {
    await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enr-1',
      lessons: 2,
      metadata: { refundId: 'ref-1', lessonsReleased: 2 },
    });

    expect(transactionsServiceMock.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          kind: 'prepaid-release',
          enrollmentId: 'enr-1',
          lessons: 2,
          refundId: 'ref-1',
          lessonsReleased: 2,
        },
      }),
      tx,
    );
  });
```

`refundPrepaidWithOverride` uchun mavjud «override yo'q» testini nusxalab, `metadata` kutilishini qo'shing:

```ts
      expect(transactionsServiceMock.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            kind: 'prepaid-release',
            enrollmentId: 'enr-1',
          }),
        }),
        tx,
      );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/billing/monthly-charge.service.spec.ts src/billing/enrollment-billing.service.spec.ts -t "tags|caller metadata|prepaid-release"`
Expected: FAIL — `metadata` yo'q.

- [ ] **Step 3: Implement**

`monthly-charge.service.ts`, `reverseChargeForDeparture` dagi `createAdjustment` chaqiruvi:

```ts
    await this.transactionsWrite.createAdjustment(
      {
        studentId: enr.studentId,
        amount: refunded,
        companyId: params.companyId,
        branchId: enr.group.branchId,
        description: `${params.reason} — o'tmagan ${remaining} dars qaytarildi`,
        performedById: params.performedById,
        // Lets the payment statement fold this refund into the month's lessons
        // without parsing the description.
        metadata: {
          kind: 'monthly-release',
          enrollmentId: params.enrollmentId,
          period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
          lessons: remaining,
          ...(frozenOutAfter
            ? { dates: frozenOutAfter.filter((d) => !frozenOutBefore.includes(d)) }
            : {}),
        },
      },
      tx,
    );
```

`enrollment-billing.service.ts`, `releasePrepaidLessons` dagi chaqiruv:

```ts
      await this.transactionsService.createAdjustment(
        {
          studentId: enrollment.studentId,
          amount: refundAmount,
          description:
            params.reason ??
            `${params.lessons} ta oldindan to'langan dars bekor qilindi`,
          branchId: enrollment.group.branchId,
          companyId: enrollment.group.companyId,
          performedById: params.performedById,
          // The payment statement folds a tagged release into the lessons
          // instead of guessing from the description. Caller keys (a refund's
          // `refundId`) stay alongside.
          metadata: {
            kind: 'prepaid-release',
            enrollmentId: params.enrollmentId,
            lessons: params.lessons,
            ...((params.metadata as Prisma.InputJsonObject | undefined) ?? {}),
          },
        },
        tx,
      );
```

`refundPrepaidWithOverride` dagi chaqiruvga (`targetLessons` o'sha funksiyadagi o'zgaruvchi):

```ts
          metadata: {
            kind: 'prepaid-release',
            enrollmentId: params.enrollmentId,
            lessons: targetLessons,
          },
```

- [ ] **Step 4: Run the billing and student specs**

Run: `npx jest src/billing src/students src/common/status src/refunds`
Expected: PASS. Agar mavjud test `createAdjustment` ni aniq obyekt bilan kutsa, unga yangi `metadata` ni qo'shing (xatti-harakat o'zgarmaydi).

- [ ] **Step 5: Commit**

```bash
git add server/src/billing
git commit -m "Billing: tag lesson-refund adjustments with metadata.kind"
```

---

### Task 2: Hisobot turlari va oylar (sof yadro) + ADR-0037

**Files:**
- Create: `server/src/statements/statement.types.ts`
- Create: `server/src/statements/statement-months.ts`
- Test: `server/src/statements/statement-months.spec.ts`
- Create: `docs/adr/0037-tolovlar-hisoboti-pul-qoidalari.md`
- Modify: `docs/adr/README.md` (indeksga qator)

**Interfaces:**
- Produces:
  - `statement.types.ts` dagi hamma tur (pastda to'liq);
  - `buildMonths(input: StatementInput): MonthsResult`;
  - `monthOf(day)`, `nextMonthKey(key)`, `MIGRATION_REVERSAL`, `PRE_SYSTEM_MONTH`.

- [ ] **Step 1: Write the types**

`server/src/statements/statement.types.ts`:

```ts
import type { TransactionType } from '@prisma/client';

/** A Tashkent calendar day, 'YYYY-MM-DD'. */
export type Day = string;
/** A month, 'YYYY-MM'. */
export type MonthKey = string;

export type CoursePaymentModel = 'MONTHLY' | 'LESSON_PACK';

export interface StatementEnrollment {
  id: string;
  /** '#036' */
  group: string;
  status: string;
  /** `startDate ?? createdAt`, as a Tashkent day. */
  start: Day;
  /** The day it stopped (any status but ACTIVE), else null. */
  end: Day | null;
  deleted: boolean;
  course: {
    name: string;
    price: number;
    lessonPaymentCount: number;
    paymentModel: CoursePaymentModel;
  };
  branch: string;
}

export interface StatementRow {
  id: string;
  type: TransactionType;
  amount: number;
  /** `createdAt` as a Tashkent day. */
  day: Day;
  description: string | null;
  metadata: Record<string, unknown> | null;
  enrollmentId: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
  /** Another row reverses this one (`reversedAt` is set). */
  reversed: boolean;
  /** This row reverses another one (`reversedTransactionId` is set). */
  reversal: boolean;
  /** LESSON_DEDUCTION only: the lesson days its package paid, oldest first. */
  consumedDays: Day[] | null;
}

export interface StatementCharge {
  enrollmentId: string;
  period: MonthKey;
  plannedLessons: number;
  coveredDates: Day[];
  frozenOutDates: Day[];
  creditLessons: number;
  creditAmount: number;
  excusedLessons: number;
}

export type AttendanceMark = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export interface StatementAttendance {
  day: Day;
  group: string;
  status: AttendanceMark;
}

export interface StatementInput {
  asOf: Day;
  student: {
    id: number;
    name: string;
    balance: number;
    discountPercent: number;
  };
  enrollments: StatementEnrollment[];
  /** Every money row of the student, ordered by (createdAt, id). */
  rows: StatementRow[];
  /** CHARGED monthly charges only. */
  charges: StatementCharge[];
  /** Attendance of lessons that were not cancelled. */
  attendance: StatementAttendance[];
}

export type ItemKind =
  | 'refund'
  | 'mock-fee'
  | 'debt-write-off'
  | 'balance-withdrawal'
  | 'discount'
  | 'initial-balance'
  | 'correction'
  | 'unexplained';

/** Money that is neither a payment nor a lesson. It moves the balance. */
export interface StatementItem {
  day: Day;
  kind: ItemKind;
  amount: number;
  description: string | null;
}

export type ReleaseWhy =
  | 'left-group'
  | 'group-change'
  | 'frozen'
  | 'refund'
  | 'other';

/** Bookkeeping that only undoes lesson charges, said out loud. */
export interface StatementNote {
  day: Day;
  kind: 'prepaid-release' | 'monthly-release';
  why: ReleaseWhy;
  lessons: number | null;
  amount: number;
}

export interface PackPart {
  group: string;
  lessons: number;
  cost: number;
  days: Day[];
}

export interface MonthlyPart {
  group: string;
  lessons: number;
  planned: number;
  cost: number;
  perLesson: number;
  fromDay: Day | null;
  excusedLessons: number;
  creditLessons: number;
  creditAmount: number;
}

export type LessonStatus =
  | 'keldi'
  | 'kelmagan'
  | 'uzrli'
  | 'belgilanmagan'
  | 'kelgusi';

export interface LessonDay {
  day: Day;
  group: string;
  status: LessonStatus;
}

export type SharpReason =
  | { kind: 'lessons'; now: number; before: number }
  | { kind: 'price'; now: number; before: number }
  | { kind: 'left'; day: Day; group: string; frozen: boolean }
  | { kind: 'joined'; day: Day; group: string; awaySince: Day | null }
  | { kind: 'model'; to: CoursePaymentModel };

export interface StatementMonth {
  key: MonthKey;
  /** Lessons billed in this month, bookkeeping folded in. */
  lessons: number;
  /** Of them, missed without an excuse (billed like a lesson held). */
  absent: number;
  cost: number;
  /** Payments made this month. */
  paid: number;
  items: StatementItem[];
  /** `paid` plus the items. */
  money: number;
  /** The balance at the end of the month, in this view. */
  running: number;
  preSystem: { lessons: number; amount: number } | null;
  packParts: PackPart[];
  monthlyParts: MonthlyPart[];
  notes: StatementNote[];
  lessonDays: LessonDay[];
  model: CoursePaymentModel | null;
  sharp: { vs: MonthKey; diff: number; reasons: SharpReason[] } | null;
}

export interface ModelChange {
  month: MonthKey;
  to: CoursePaymentModel;
  /** Old-way charges of this month that the switch reversed. */
  oldCharged: number;
  newCharged: number;
  newLessons: number;
  /** Lessons paid the old way that the new charge covers again, credited back. */
  carriedIn: { lessons: number; amount: number } | null;
  /** Old-way lessons this month in a group the new model does not cover. */
  otherGroupPack: Array<{
    group: string;
    days: Day[];
    cost: number;
    leftDay: Day | null;
  }>;
}

export type DueRef =
  | { kind: 'month'; month: MonthKey }
  | { kind: 'item'; itemKind: ItemKind; day: Day }
  | { kind: 'prepaid' };

export interface Allocation {
  day: Day;
  kind: 'payment' | 'credit';
  method: string | null;
  itemKind: ItemKind | null;
  paymentId: string | null;
  amount: number;
  to: Array<{ due: DueRef; amount: number }>;
  leftover: number;
}

export interface StatementModel {
  asOf: Day;
  student: {
    id: number;
    name: string;
    groups: string[];
    course: {
      name: string;
      price: number;
      lessonPaymentCount: number;
      paymentModel: CoursePaymentModel;
    } | null;
    discountPercent: number;
    branch: string | null;
  };
  balance: number;
  headline: {
    kind: 'debt' | 'credit' | 'zero';
    amount: number;
    /** Unpaid dues after FIFO, newest first. Empty unless `kind` is 'debt'. */
    unpaid: Array<{ due: DueRef; amount: number }>;
  };
  equation: {
    paid: number;
    items: Array<{ kind: ItemKind; amount: number }>;
    lessons: number;
    prepaidAhead: number;
    unexplained: number;
    balance: number;
  };
  /** Set when some months were paid with lesson packs. */
  packEra: { size: number; until: MonthKey | null } | null;
  months: StatementMonth[];
  modelChanges: ModelChange[];
  allocations: Allocation[];
}
```

- [ ] **Step 2: Write the failing tests**

`server/src/statements/statement-months.spec.ts`:

```ts
import { buildMonths } from './statement-months';
import type {
  StatementEnrollment,
  StatementInput,
  StatementRow,
} from './statement.types';

let seq = 0;
const row = (over: Partial<StatementRow>): StatementRow => ({
  id: `t${++seq}`,
  type: 'PAYMENT',
  amount: 0,
  day: '2026-05-01',
  description: null,
  metadata: null,
  enrollmentId: 'e1',
  paymentId: null,
  paymentMethod: null,
  reversed: false,
  reversal: false,
  consumedDays: null,
  ...over,
});
const pay = (day: string, amount: number): StatementRow =>
  row({ type: 'PAYMENT', day, amount, enrollmentId: null, paymentId: `p-${day}`, paymentMethod: 'CASH' });
/** A package of `days.length` held lessons (or `capacity` if more were paid). */
const pack = (day: string, amount: number, days: string[], capacity = days.length, enrollmentId = 'e1'): StatementRow =>
  row({ type: 'LESSON_DEDUCTION', day, amount: -amount, enrollmentId, metadata: { lessonsCovered: capacity }, consumedDays: days });
const monthly = (period: string, amount: number, covered: number, planned: number, enrollmentId = 'e1'): StatementRow =>
  row({ type: 'LESSON_DEDUCTION', day: `${period}-26`, amount: -amount, enrollmentId, metadata: { mode: 'MONTHLY_PERIOD', period, coveredLessons: covered, plannedLessons: planned } });
const enr = (over: Partial<StatementEnrollment> = {}): StatementEnrollment => ({
  id: 'e1', group: '#036', status: 'ACTIVE', start: '2026-05-01', end: null, deleted: false,
  course: { name: 'Standart', price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' },
  branch: 'Filial', ...over,
});
const input = (over: Partial<StatementInput>): StatementInput => ({
  asOf: '2026-09-26',
  student: { id: 1, name: 'Test Student', balance: 0, discountPercent: 0 },
  enrollments: [enr()], rows: [], charges: [], attendance: [], ...over,
});
const SEPT = ['2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10', '2026-09-12', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'];
const AUG = ['2026-08-01', '2026-08-04', '2026-08-06', '2026-08-08', '2026-08-11', '2026-08-13', '2026-08-15', '2026-08-18', '2026-08-20', '2026-08-22', '2026-08-25', '2026-08-27'];
const sept = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1', period: '2026-09', plannedLessons: 12, coveredDates: SEPT, frozenOutDates: [] as string[],
  creditLessons: 0, creditAmount: 0, excusedLessons: 0, ...over,
});

describe('buildMonths', () => {
  it('puts each package lesson in the month it was held', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [pay('2026-08-01', 360_000), pack('2026-08-01', 360_000, [...AUG.slice(0, 10), '2026-09-03', '2026-09-05'])],
    }));
    expect(r.months.map((m) => [m.key, m.lessons, m.cost])).toEqual([
      ['2026-08', 10, 300_000],
      ['2026-09', 2, 60_000],
    ]);
    expect(r.unexplained).toBe(0);
  });

  it('bills a monthly charge to its period and lists its lesson days', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: -450_000, discountPercent: 0 },
      rows: [monthly('2026-09', 450_000, 12, 12)],
      charges: [sept()],
    }));
    const m = r.months[0];
    expect([m.key, m.lessons, m.cost, m.model]).toEqual(['2026-09', 12, 450_000, 'MONTHLY']);
    expect(m.monthlyParts[0]).toMatchObject({ group: '#036', lessons: 12, planned: 12, perLesson: 37_500, fromDay: null });
    expect(m.lessonDays).toHaveLength(12);
  });

  it('records a mid-month start', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: -262_500, discountPercent: 0 },
      rows: [monthly('2026-09', 262_500, 7, 12)],
      charges: [sept({ coveredDates: SEPT.slice(5) })],
    }));
    expect(r.months[0].monthlyParts[0]).toMatchObject({ lessons: 7, planned: 12, perLesson: 37_500, fromDay: '2026-09-15' });
  });

  it('skips reversed pairs and keeps the switch reversal as a fact of the month', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [
        pay('2026-09-16', 450_000),
        row({ type: 'LESSON_DEDUCTION', day: '2026-09-16', amount: -450_000, reversed: true, metadata: { lessonsCovered: 12 }, consumedDays: SEPT.slice(6, 9) }),
        row({ type: 'LESSON_DEDUCTION', day: '2026-09-26', amount: 450_000, reversal: true, description: "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi — 2026-09" }),
        monthly('2026-09', 450_000, 12, 12),
      ],
      charges: [sept()],
    }));
    expect(r.months[0].lessons).toBe(12);
    expect(r.switchFacts.get('2026-09')?.oldCharged).toBe(450_000);
    expect(r.unexplained).toBe(0);
  });

  it('takes a lesson the monthly charge covers again off the old-way part', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 30_000, discountPercent: 0 },
      rows: [
        pay('2026-08-01', 360_000),
        pack('2026-08-01', 360_000, [...AUG.slice(0, 11), '2026-09-03']),
        monthly('2026-09', 450_000, 12, 12),
        pay('2026-09-10', 450_000),
        row({ type: 'ADJUSTMENT', day: '2026-09-26', amount: 30_000, enrollmentId: null, metadata: { marker: 'overcharge-monthly-carried-in', period: '2026-09', enrollmentId: 'e1', lessons: 1 } }),
      ],
      charges: [sept()],
    }));
    const september = r.months.find((m) => m.key === '2026-09')!;
    expect([september.lessons, september.cost]).toEqual([12, 450_000]);
    expect(september.packParts).toEqual([]);
    expect(r.switchFacts.get('2026-09')?.carriedIn).toEqual({ lessons: 1, amount: 30_000 });
    expect(r.months.map((m) => m.running)).toEqual([30_000, 30_000]);
  });

  it('cancels one exact lesson when the credit names its day (a re-join)', () => {
    const r = buildMonths(input({
      enrollments: [enr({ id: 'old', end: '2026-09-03', status: 'DROPPED' }), enr({ id: 'e1', start: '2026-09-03' })],
      student: { id: 1, name: 'S', balance: -225_000, discountPercent: 0 },
      rows: [
        row({ type: 'LESSON_DEDUCTION', day: '2026-09-03', amount: -18_750, enrollmentId: 'old', metadata: { mode: 'SINGLE_UNCOVERED', perLessonCost: 37_500, lessonsCovered: 1 }, consumedDays: ['2026-09-03'] }),
        monthly('2026-09', 225_000, 12, 12),
        row({ type: 'ADJUSTMENT', day: '2026-09-26', amount: 18_750, enrollmentId: null, metadata: { marker: 'overcharge-monthly-carried-in', period: '2026-09', enrollmentId: 'e1', oldEnrollmentId: 'old', lessonDate: '2026-09-03', lessons: 1 } }),
      ],
      charges: [sept()],
    }));
    expect(r.months[0].lessons).toBe(12);
    expect(r.months[0].lessonDays.filter((d) => d.day === '2026-09-03')).toHaveLength(1);
  });

  it('folds a tagged monthly release into the month and says so', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [
        pay('2026-09-02', 300_000),
        monthly('2026-09', 450_000, 12, 12),
        row({ type: 'ADJUSTMENT', day: '2026-09-20', amount: 150_000, enrollmentId: null, description: "Guruhdan chiqarilganda — o'tmagan 4 dars qaytarildi", metadata: { kind: 'monthly-release', period: '2026-09', lessons: 4 } }),
      ],
      charges: [sept({ frozenOutDates: SEPT.slice(8) })],
    }));
    const m = r.months[0];
    expect([m.lessons, m.cost]).toEqual([8, 300_000]);
    expect(m.notes).toEqual([{ day: '2026-09-20', kind: 'monthly-release', why: 'left-group', lessons: 4, amount: 150_000 }]);
    expect(m.lessonDays).toHaveLength(8);
  });

  it('reads an untagged package release from its text and estimates the lessons', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 90_000, discountPercent: 0 },
      rows: [
        pay('2026-07-01', 360_000),
        pack('2026-07-01', 360_000, ['2026-07-02', '2026-07-04', '2026-07-07', '2026-07-09', '2026-07-11', '2026-07-14', '2026-07-16', '2026-07-18', '2026-07-21'], 12),
        row({ type: 'ADJUSTMENT', day: '2026-07-23', amount: 90_000, enrollmentId: null, description: 'Guruhdan chiqarilganda qoldiq darslar uchun balans tiklash' }),
      ],
    }));
    const m = r.months[0];
    expect([m.lessons, m.cost]).toEqual([9, 270_000]);
    expect(m.notes[0]).toEqual({ day: '2026-07-23', kind: 'prepaid-release', why: 'left-group', lessons: 3, amount: 90_000 });
    expect([r.prepaidAhead, r.unexplained]).toEqual([0, 0]);
  });

  it('keeps unreturned package lessons as paid ahead', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [pay('2026-07-01', 360_000), pack('2026-07-01', 360_000, ['2026-07-02', '2026-07-04', '2026-07-07'], 12)],
    }));
    expect(r.prepaidAhead).toBe(270_000);
    expect(r.unexplained).toBe(0);
  });

  it('treats the April cutover refund as lessons paid before the system', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [
        pack('2026-04-25', 120_000, ['2026-04-23', '2026-04-25', '2026-04-28', '2026-04-30'], 4),
        row({ type: 'ADJUSTMENT', day: '2026-06-06', amount: 120_000, enrollmentId: null, metadata: { marker: 'april-cutover-refund' } }),
      ],
    }));
    const april = r.months.find((m) => m.key === '2026-04')!;
    expect([april.lessons, april.cost, april.preSystem]).toEqual([0, 0, { lessons: 4, amount: 120_000 }]);
  });

  it('shows money that is not a payment as a dated item', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [
        pay('2026-09-05', 400_000), pay('2026-09-11', 400_000),
        monthly('2026-09', 400_000, 12, 12),
        row({ type: 'REFUND', day: '2026-09-24', amount: -400_000, enrollmentId: null }),
      ],
      charges: [sept()],
    }));
    const m = r.months[0];
    expect(m.items).toEqual([{ day: '2026-09-24', kind: 'refund', amount: -400_000, description: null }]);
    expect([m.paid, m.money, m.running]).toEqual([800_000, 400_000, 0]);
  });

  it('adds any difference from the balance as an unexplained item', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: 90_000, discountPercent: 0 },
      rows: [pay('2026-09-05', 100_000)],
    }));
    expect(r.unexplained).toBe(-10_000);
    expect(r.months[0].items).toEqual([{ day: '2026-09-26', kind: 'unexplained', amount: -10_000, description: null }]);
    expect(r.months[0].running).toBe(90_000);
  });

  it('fills quiet months between active ones', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: -330_000, discountPercent: 0 },
      rows: [pack('2026-07-01', 90_000, ['2026-07-02', '2026-07-04', '2026-07-07']), monthly('2026-09', 240_000, 6, 12)],
      charges: [sept({ coveredDates: SEPT.slice(6) })],
    }));
    expect(r.months.map((m) => [m.key, m.lessons])).toEqual([['2026-07', 3], ['2026-08', 0], ['2026-09', 6]]);
  });

  it('marks lesson days from attendance and counts unexcused absences', () => {
    const r = buildMonths(input({
      student: { id: 1, name: 'S', balance: -450_000, discountPercent: 0 },
      rows: [monthly('2026-09', 450_000, 12, 12)],
      charges: [sept()],
      attendance: [
        { day: '2026-09-03', group: '#036', status: 'PRESENT' },
        { day: '2026-09-05', group: '#036', status: 'ABSENT' },
        { day: '2026-09-08', group: '#036', status: 'EXCUSED' },
        { day: '2026-09-10', group: '#036', status: 'LATE' },
      ],
    }));
    const days = r.months[0].lessonDays;
    expect(days.slice(0, 5).map((d) => d.status)).toEqual(['keldi', 'kelmagan', 'uzrli', 'keldi', 'belgilanmagan']);
    expect(days[days.length - 1].status).toBe('kelgusi');
    expect(r.months[0].absent).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/statements/statement-months.spec.ts`
Expected: FAIL — `Cannot find module './statement-months'`.

- [ ] **Step 4: Implement `statement-months.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { splitLessonSlices } from '../common/finance/ledger-replay';
import type {
  CoursePaymentModel,
  Day,
  ItemKind,
  LessonDay,
  LessonStatus,
  MonthKey,
  MonthlyPart,
  PackPart,
  ReleaseWhy,
  StatementInput,
  StatementItem,
  StatementMonth,
  StatementNote,
  StatementRow,
} from './statement.types';

/** Reversal rows written by the switch to monthly billing (`migrate-to-monthly`). */
export const MIGRATION_REVERSAL = "Oylik to'lovga o'tish migratsiyasi";
/** Lessons paid before the system existed (the April cutover) all fell in April 2026. */
export const PRE_SYSTEM_MONTH: MonthKey = '2026-04';

/** Untagged refunds written before `metadata.kind` existed, known by their text. */
const MONTHLY_RELEASE_TEXT = /o'tmagan (\d+) dars qaytarildi/;
const PREPAID_RELEASE_TEXT = /qoldiq darslar|qoldiq oldindan to'langan|muzlat/i;

const ITEM_BY_TYPE: Record<string, ItemKind> = {
  REFUND: 'refund',
  MOCK_EXAM_FEE: 'mock-fee',
  DEBT_WRITE_OFF: 'debt-write-off',
  BALANCE_WITHDRAWAL: 'balance-withdrawal',
  DISCOUNT_ADJUSTMENT: 'discount',
  INITIAL_BALANCE: 'initial-balance',
};

export const monthOf = (day: Day): MonthKey => day.slice(0, 7);

export function nextMonthKey(key: MonthKey): MonthKey {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export interface MonthSwitchFacts {
  /** Old-way charges of the month that the switch reversed. */
  oldCharged: number;
  /** Lessons paid the old way that a monthly charge covers again, credited back. */
  carriedIn: { lessons: number; amount: number };
}

export interface MonthsResult {
  months: StatementMonth[];
  switchFacts: Map<MonthKey, MonthSwitchFacts>;
  /** Positive PAYMENT rows, oldest first. */
  payments: StatementRow[];
  paid: number;
  /** Package lessons paid ahead, not held and not returned. */
  prepaidAhead: number;
  /** Balance minus everything explained; added as an item when not 0. */
  unexplained: number;
  /** The most common package size among the package charges. */
  packSize: number | null;
}

interface PackAcc extends PackPart {
  enrollmentId: string;
}

interface MonthlyAcc extends MonthlyPart {
  days: Day[];
}

interface MonthAcc {
  key: MonthKey;
  pack: Map<string, PackAcc>;
  monthly: MonthlyAcc[];
  items: StatementItem[];
  notes: StatementNote[];
  paid: number;
  preSystem: number;
  facts: MonthSwitchFacts;
}

function releaseWhy(
  description: string,
  md: Record<string, unknown>,
): ReleaseWhy {
  if (md.refundId !== undefined) return 'refund';
  if (/Guruh o'zgartirilganda/i.test(description)) return 'group-change';
  if (/Guruhdan chiqarilganda/i.test(description)) return 'left-group';
  if (/muzlat/i.test(description)) return 'frozen';
  return 'other';
}

function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Money the student paid against the lessons they had, month by month.
 *
 * A lesson's price lands in the month the lesson happened. Bookkeeping that
 * only undoes lesson charges (a returned package, the April cutover, a lesson
 * the monthly charge covers again, a monthly refund on leaving) is folded
 * into the lessons and kept as a note; every other credit or debit is a dated
 * item. The result reconciles to `Student.balance` to the som, and any
 * difference is added as an `unexplained` item instead of being hidden.
 */
export function buildMonths(input: StatementInput): MonthsResult {
  const groupOf = new Map(input.enrollments.map((e) => [e.id, e.group]));
  const packSizeOf = new Map(
    input.enrollments.map((e) => [e.id, e.course.lessonPaymentCount]),
  );
  const accs = new Map<MonthKey, MonthAcc>();
  const acc = (key: MonthKey): MonthAcc => {
    let found = accs.get(key);
    if (!found) {
      found = {
        key,
        pack: new Map(),
        monthly: [],
        items: [],
        notes: [],
        paid: 0,
        preSystem: 0,
        facts: { oldCharged: 0, carriedIn: { lessons: 0, amount: 0 } },
      };
      accs.set(key, found);
    }
    return found;
  };

  // 1. Lesson charges: every lesson lands in the month it happened.
  let unusedSlices = 0;
  const packPrices: Array<{ day: Day; perLesson: number }> = [];
  const packSizes: number[] = [];
  for (const r of input.rows) {
    if (r.type !== 'LESSON_DEDUCTION') continue;
    if (r.reversal) {
      if ((r.description ?? '').includes(MIGRATION_REVERSAL)) {
        acc(monthOf(r.day)).facts.oldCharged += r.amount;
      }
      continue;
    }
    if (r.reversed) continue;
    const md = r.metadata ?? {};
    if (md.mode === 'MONTHLY_PERIOD') {
      const period =
        typeof md.period === 'string' ? md.period : monthOf(r.day);
      const charge = input.charges.find(
        (c) => c.enrollmentId === r.enrollmentId && c.period === period,
      );
      const covered = Number(md.coveredLessons) || 0;
      const planned =
        Number(md.plannedLessons) || charge?.plannedLessons || covered;
      const creditAmount = charge?.creditAmount ?? 0;
      const returned = new Set(charge?.frozenOutDates ?? []);
      acc(period).monthly.push({
        group: groupOf.get(r.enrollmentId ?? '') ?? '',
        lessons: covered,
        planned,
        cost: -r.amount,
        perLesson:
          covered > 0 ? Math.round((-r.amount + creditAmount) / covered) : 0,
        fromDay:
          charge && covered < planned && charge.coveredDates.length > 0
            ? charge.coveredDates[0]
            : null,
        excusedLessons: charge?.excusedLessons ?? 0,
        creditLessons: charge?.creditLessons ?? 0,
        creditAmount,
        days: (charge?.coveredDates ?? []).filter((d) => !returned.has(d)),
      });
      continue;
    }
    const days = r.consumedDays ?? [];
    const slices = splitLessonSlices(
      r.amount,
      r.metadata as Prisma.JsonValue,
      days.map((d) => new Date(`${d}T00:00:00.000Z`)),
    );
    if (r.amount < 0 && slices.length > 0) {
      packPrices.push({
        day: r.day,
        perLesson: Math.round(-r.amount / slices.length),
      });
      if (r.enrollmentId) packSizes.push(packSizeOf.get(r.enrollmentId) ?? 12);
    }
    slices.forEach((slice, i) => {
      if (!slice.date) {
        unusedSlices += slice.cost;
        return;
      }
      const day = days[i];
      const key = r.enrollmentId ?? '';
      const month = acc(monthOf(day));
      const part = month.pack.get(key) ?? {
        enrollmentId: key,
        group: groupOf.get(key) ?? '',
        lessons: 0,
        cost: 0,
        days: [],
      };
      part.lessons += 1;
      part.cost += slice.cost;
      part.days.push(day);
      month.pack.set(key, part);
    });
  }

  // 2. Everything else.
  let released = 0;
  const payments: StatementRow[] = [];
  const perLessonBefore = (day: Day): number | null => {
    let found: number | null = null;
    for (const p of packPrices) if (p.day <= day) found = p.perLesson;
    return found;
  };
  const pushItem = (r: StatementRow, kind: ItemKind) => {
    acc(monthOf(r.day)).items.push({
      day: r.day,
      kind,
      amount: r.amount,
      description: r.description,
    });
  };
  for (const r of input.rows) {
    if (r.type === 'LESSON_DEDUCTION' || r.type === 'LESSON_CONSUMPTION') {
      continue;
    }
    if (r.reversed || r.reversal) continue;
    if (r.type === 'PAYMENT') {
      payments.push(r);
      acc(monthOf(r.day)).paid += r.amount;
      continue;
    }
    if (r.type !== 'ADJUSTMENT') {
      pushItem(r, ITEM_BY_TYPE[r.type] ?? 'correction');
      continue;
    }
    const md = r.metadata ?? {};
    const description = r.description ?? '';
    const monthlyRelease = MONTHLY_RELEASE_TEXT.exec(description);
    if (md.marker === 'overcharge-monthly-carried-in') {
      const month = acc(
        typeof md.period === 'string' ? md.period : monthOf(r.day),
      );
      const lessons = Number(md.lessons) || 0;
      const part = month.pack.get(
        String(md.oldEnrollmentId ?? md.enrollmentId ?? ''),
      );
      if (!part) {
        // Nothing paid the old way to cancel: keep the money in sight.
        pushItem(r, 'correction');
        continue;
      }
      part.lessons -= lessons;
      part.cost -= r.amount;
      part.days =
        typeof md.lessonDate === 'string'
          ? part.days.filter((d) => d !== md.lessonDate)
          : [...part.days]
              .sort()
              .slice(0, Math.max(0, part.days.length - lessons));
      month.facts.carriedIn.lessons += lessons;
      month.facts.carriedIn.amount += r.amount;
    } else if (md.marker === 'april-cutover-refund') {
      acc(PRE_SYSTEM_MONTH).preSystem += r.amount;
    } else if (md.kind === 'monthly-release' || monthlyRelease) {
      acc(typeof md.period === 'string' ? md.period : monthOf(r.day)).notes.push(
        {
          day: r.day,
          kind: 'monthly-release',
          why: releaseWhy(description, md),
          lessons: Number(md.lessons) || Number(monthlyRelease?.[1]) || null,
          amount: r.amount,
        },
      );
    } else if (
      md.kind === 'prepaid-release' ||
      md.refundId !== undefined ||
      PREPAID_RELEASE_TEXT.test(description)
    ) {
      released += r.amount;
      const per = perLessonBefore(r.day);
      const estimate =
        per && Math.abs(r.amount / per - Math.round(r.amount / per)) < 0.01
          ? Math.round(r.amount / per)
          : null;
      acc(monthOf(r.day)).notes.push({
        day: r.day,
        kind: 'prepaid-release',
        why: releaseWhy(description, md),
        lessons: Number(md.lessons ?? md.lessonsReleased) || estimate || null,
        amount: r.amount,
      });
    } else {
      pushItem(r, 'correction');
    }
  }

  // 3. Each month's lessons with the bookkeeping folded in.
  const summarize = (a: MonthAcc) => {
    const pack = [...a.pack.values()].filter(
      (p) => p.lessons !== 0 || p.cost !== 0,
    );
    const packLessons = pack.reduce((s, p) => s + p.lessons, 0);
    const packCost = pack.reduce((s, p) => s + p.cost, 0);
    const releases = a.notes.filter((n) => n.kind === 'monthly-release');
    const preSystemLessons =
      a.preSystem > 0 && packLessons > 0 && packCost > 0
        ? Math.min(
            packLessons,
            Math.round(a.preSystem / (packCost / packLessons)),
          )
        : 0;
    return {
      pack,
      preSystemLessons,
      lessons:
        packLessons +
        a.monthly.reduce((s, m) => s + m.lessons, 0) -
        releases.reduce((s, n) => s + (n.lessons ?? 0), 0) -
        preSystemLessons,
      cost:
        packCost +
        a.monthly.reduce((s, m) => s + m.cost, 0) -
        releases.reduce((s, n) => s + n.amount, 0) -
        a.preSystem,
    };
  };

  // 4. Reconcile to the balance; say any difference out loud.
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const itemsTotal = [...accs.values()].reduce(
    (s, a) => s + a.items.reduce((t, i) => t + i.amount, 0),
    0,
  );
  const lessonsTotal = [...accs.values()].reduce(
    (s, a) => s + summarize(a).cost,
    0,
  );
  const prepaidAhead = Math.max(0, unusedSlices - released);
  const unexplained =
    input.student.balance - (paid + itemsTotal - lessonsTotal - prepaidAhead);
  if (unexplained !== 0) {
    acc(monthOf(input.asOf)).items.push({
      day: input.asOf,
      kind: 'unexplained',
      amount: unexplained,
      description: null,
    });
  }

  // 5. Months from the first to the last with anything in them, gaps included.
  const used = [...accs.values()]
    .filter(
      (a) =>
        a.pack.size > 0 ||
        a.monthly.length > 0 ||
        a.items.length > 0 ||
        a.notes.length > 0 ||
        a.paid !== 0 ||
        a.preSystem !== 0 ||
        a.facts.oldCharged !== 0,
    )
    .map((a) => a.key)
    .sort();
  const keys: MonthKey[] = [];
  if (used.length > 0) {
    for (let key = used[0]; ; key = nextMonthKey(key)) {
      keys.push(key);
      if (key === used[used.length - 1]) break;
    }
  }

  const marks = new Map(
    input.attendance.map((a) => [`${a.day}|${a.group}`, a.status]),
  );
  const statusOf = (day: Day, group: string): LessonStatus => {
    const mark = marks.get(`${day}|${group}`);
    if (mark === 'PRESENT' || mark === 'LATE') return 'keldi';
    if (mark === 'ABSENT') return 'kelmagan';
    if (mark === 'EXCUSED') return 'uzrli';
    return day > input.asOf ? 'kelgusi' : 'belgilanmagan';
  };

  let running = 0;
  const months = keys.map((key): StatementMonth => {
    const a = acc(key);
    const s = summarize(a);
    const money = a.paid + a.items.reduce((t, i) => t + i.amount, 0);
    running += money - s.cost;
    const seen = new Set<string>();
    const lessonDays: LessonDay[] = [];
    const addDay = (day: Day, group: string) => {
      const k = `${day}|${group}`;
      if (seen.has(k)) return;
      seen.add(k);
      lessonDays.push({ day, group, status: statusOf(day, group) });
    };
    for (const p of s.pack) for (const d of p.days) addDay(d, p.group);
    for (const m of a.monthly) for (const d of m.days) addDay(d, m.group);
    lessonDays.sort(
      (x, y) => x.day.localeCompare(y.day) || x.group.localeCompare(y.group),
    );
    const model: CoursePaymentModel | null =
      a.monthly.length > 0
        ? 'MONTHLY'
        : s.pack.some((p) => p.lessons > 0)
          ? 'LESSON_PACK'
          : null;
    return {
      key,
      lessons: s.lessons,
      absent: lessonDays.filter((d) => d.status === 'kelmagan').length,
      cost: s.cost,
      paid: a.paid,
      items: a.items,
      money,
      running,
      preSystem:
        a.preSystem > 0
          ? { lessons: s.preSystemLessons, amount: a.preSystem }
          : null,
      packParts: s.pack.map((p) => ({
        group: p.group,
        lessons: p.lessons,
        cost: p.cost,
        days: [...p.days].sort(),
      })),
      monthlyParts: a.monthly.map((m) => ({
        group: m.group,
        lessons: m.lessons,
        planned: m.planned,
        cost: m.cost,
        perLesson: m.perLesson,
        fromDay: m.fromDay,
        excusedLessons: m.excusedLessons,
        creditLessons: m.creditLessons,
        creditAmount: m.creditAmount,
      })),
      notes: a.notes,
      lessonDays,
      model,
      sharp: null,
    };
  });

  return {
    months,
    switchFacts: new Map(keys.map((k) => [k, acc(k).facts])),
    payments: payments.filter((p) => p.amount > 0),
    paid,
    prepaidAhead,
    unexplained,
    packSize: mostCommon(packSizes),
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/statements/statement-months.spec.ts`
Expected: PASS (13 test).

- [ ] **Step 6: Write ADR-0037**

Avval `origin/main` dagi oxirgi raqamni tekshiring: `git fetch -q origin && git ls-tree --name-only origin/main docs/adr/ | tail -3`. 0037 band bo'lsa, keyingi bo'sh raqamni oling va quyidagi hamma joyda almashtiring.

`docs/adr/0037-tolovlar-hisoboti-pul-qoidalari.md`:

```markdown
# ADR-0037 — To'lovlar hisoboti: pul dars o'tilgan oyga yoziladi, ichki tuzatishlar darsga qo'shiladi, taqsimot FIFO

**Holati:** Qabul qilindi
**Sana:** 2026-09-26
**Bog'liq:** `server/src/statements/`, `docs/superpowers/specs/2026-09-26-tolovlar-hisoboti-design.md`, ADR-0004, `server/src/common/finance/ledger-replay.ts`

## Kontekst

O'quvchi va admin «pulim qayerga ketdi?» degan savolga bitta javob kutadi.
Ledger qatorlari bunga javob bermaydi:

- 12 talik paket darsdan oldin yechiladi, ishlatilmagan darslar puli keyin
  qaytariladi;
- oylik to'lovga o'tish (26.09.2026) sentabr yechimlarini teskari qilib, oylik
  hisob yozdi;
- oylikdan ketganda o'tmagan darslar puli qaytadi.

Hisobotning birinchi maketida bu yozuvlar «Qaytarilgan 3 marta» bo'lib
chiqdi va CEO uni tushunmadi. CEO: «Sodda degani ma'lumot olib tashlanishi
emas». PDF'ning 8 ta haqiqiy misoli (v3) 26.09 da ma'qullandi.

## Qaror

1. **Dars narxi dars o'tilgan oyga yoziladi.**
   - Paket yechimi `splitLessonSlices` bilan darslarga bo'linadi. Har bo'lak
     FIFO qamrovi bergan dars kunining oyiga tushadi.
   - Oylik hisob o'z davriga tushadi. Uning darslari
     `coveredDates − frozenOutDates`.
2. **Faqat dars yechimini bekor qiladigan ichki yozuv darsga qo'shib
   yuboriladi va shu oyning izohida aytiladi.** Bunday yozuvlar:
   - paketdan qaytgan pul;
   - aprel cutover qaytarmasi;
   - `overcharge-monthly-carried-in` krediti;
   - oylikdan ketganda qaytgan pul;
   - migratsiya bekor qilgan yechim.
3. **Boshqa har qanday kirim yoki chiqim sanali alohida qator bo'ladi va
   balansni o'zgartiradi:** chegirma, qarz kechirilishi, naqd qaytarish,
   mock imtihon, balansdan olish, boshlang'ich balans, boshqa tuzatish.
4. **Tenglik so'mma-so'm:** to'lovlar + kirimlar − chiqimlar − darslar −
   oldindan to'langan darslar = `Student.balance`. Farq chiqsa, u yashirilmaydi:
   «tushuntirilmagan farq» qatori qo'shiladi va serverga xato yoziladi.
5. **Taqsimot FIFO.** To'lov va kreditlar sana tartibida eng eski to'lanmagan
   darsga yoziladi.
6. **Belgi.** Yangi qaytarish yozuvlari `metadata.kind` bilan yoziladi
   (`monthly-release`, `prepaid-release`). Eski yozuvlar izoh matnidan
   taniladi.
7. **To'lov turi har oy uchun yechimlarning o'zidan aniqlanadi,** sozlamadan
   emas. Paket bo'laklari bo'lsa paket, oylik hisob bo'lsa oylik. Tizim
   12 talikka qaytsa ham hisobot o'zgarishsiz to'g'ri gapiradi.

## Ko'rib chiqilgan muqobillar

- **Ledger qatorlarini bittama-bitta ko'rsatish (hozirgi tab).** Paket va
  oylik aralashganda tushunarsiz, oylik qatorlarini «hali o'tilmagan» deb
  ko'rsatadi.
- **Pulni to'lov oyiga yozish.** Paket oyni kesib o'tadi va bir oyning
  darslari ikki to'lovga bo'linadi, shuning uchun oylar o'zaro solishtirib
  bo'lmaydi. Oylik to'lov esa aynan oy bo'yicha, shu sabab dars oyi tanlandi.
- **Ichki tuzatishlarni alohida «qaytarilgan» qator qilish (v1).** CEO
  tushunmadi.

## Oqibatlari

- Hisobot balans bilan so'mma-so'm mos keladi yoki farqni ochiq aytadi.
- Eski yozuvlarni tanish izoh matniga bog'liq. Matn o'zgarsa, tasnif buziladi
  (`statement-months.spec.ts` himoya qiladi). Yangi yozuvlar belgi bilan
  yoziladi, shuning uchun bu bog'liqlik vaqt o'tishi bilan yo'qoladi.
- Qo'lda yozilgan, lekin aslida paketni qaytargan tuzatish belgisiz bo'lsa,
  replay o'sha darslarni keyingi oyga bog'laydi. Bunday yozuvlar bir martalik
  skript bilan belgilanadi.
```

`docs/adr/README.md` jadvalining oxiriga:

```markdown
| [0037](0037-tolovlar-hisoboti-pul-qoidalari.md) | To'lovlar hisoboti: pul dars o'tilgan oyga yoziladi, ichki tuzatishlar darsga qo'shiladi, taqsimot FIFO | Qabul qilindi | 2026-09-26 |
```

- [ ] **Step 7: Commit**

```bash
git add server/src/statements/statement.types.ts server/src/statements/statement-months.ts server/src/statements/statement-months.spec.ts docs/adr/0037-tolovlar-hisoboti-pul-qoidalari.md docs/adr/README.md
git commit -m "Statements: month-by-month lessons and money, reconciled to the balance"
```

---

### Task 3: FIFO, qarz sarlavhasi, keskin farq, to'lov turi o'zgarishi

**Files:**
- Create: `server/src/statements/statement-analysis.ts`
- Create: `server/src/statements/build-statement.ts`
- Test: `server/src/statements/build-statement.spec.ts`

**Interfaces:**
- Consumes: `buildMonths`, `monthOf`, `MonthSwitchFacts` (Task 2), types.
- Produces: `buildStatement(input: StatementInput): StatementModel`.

- [ ] **Step 1: Write the failing tests**

`server/src/statements/build-statement.spec.ts` (fixture yordamchilari Task 2 spec'idagi bilan bir xil; qayta yozing, fayllar mustaqil):

```ts
import { buildStatement } from './build-statement';
import type { StatementEnrollment, StatementInput, StatementRow } from './statement.types';

let seq = 0;
const row = (over: Partial<StatementRow>): StatementRow => ({
  id: `t${++seq}`, type: 'PAYMENT', amount: 0, day: '2026-05-01', description: null, metadata: null,
  enrollmentId: 'e1', paymentId: null, paymentMethod: null, reversed: false, reversal: false, consumedDays: null, ...over,
});
const pay = (day: string, amount: number, method = 'CASH'): StatementRow =>
  row({ type: 'PAYMENT', day, amount, enrollmentId: null, paymentId: `p-${day}`, paymentMethod: method });
const pack = (day: string, amount: number, days: string[], capacity = days.length, enrollmentId = 'e1'): StatementRow =>
  row({ type: 'LESSON_DEDUCTION', day, amount: -amount, enrollmentId, metadata: { lessonsCovered: capacity }, consumedDays: days });
const monthly = (period: string, amount: number, covered: number, planned: number, enrollmentId = 'e1'): StatementRow =>
  row({ type: 'LESSON_DEDUCTION', day: `${period}-26`, amount: -amount, enrollmentId, metadata: { mode: 'MONTHLY_PERIOD', period, coveredLessons: covered, plannedLessons: planned } });
const enr = (over: Partial<StatementEnrollment> = {}): StatementEnrollment => ({
  id: 'e1', group: '#036', status: 'ACTIVE', start: '2026-05-01', end: null, deleted: false,
  course: { name: 'Standart', price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' }, branch: 'Filial', ...over,
});
const input = (over: Partial<StatementInput>): StatementInput => ({
  asOf: '2026-09-26', student: { id: 1, name: 'Test Student', balance: 0, discountPercent: 0 },
  enrollments: [enr()], rows: [], charges: [], attendance: [], ...over,
});
const SEPT = ['2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10', '2026-09-12', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'];
const JULY = ['2026-07-02', '2026-07-04', '2026-07-07', '2026-07-09', '2026-07-11', '2026-07-14', '2026-07-16', '2026-07-18', '2026-07-21'];
const AUG = ['2026-08-01', '2026-08-04', '2026-08-06', '2026-08-08', '2026-08-11', '2026-08-13', '2026-08-15', '2026-08-18', '2026-08-20', '2026-08-22', '2026-08-25', '2026-08-27'];
const sept = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1', period: '2026-09', plannedLessons: 12, coveredDates: SEPT, frozenOutDates: [] as string[],
  creditLessons: 0, creditAmount: 0, excusedLessons: 0, ...over,
});

describe('buildStatement', () => {
  it('pays the oldest lessons first and carries the rest', () => {
    const s = buildStatement(input({
      student: { id: 1, name: 'S', balance: 187_500, discountPercent: 0 },
      enrollments: [enr({ start: '2026-09-15' })],
      rows: [pay('2026-09-16', 450_000), monthly('2026-09', 262_500, 7, 12)],
      charges: [sept({ coveredDates: SEPT.slice(5) })],
    }));
    expect(s.headline).toEqual({ kind: 'credit', amount: 187_500, unpaid: [] });
    expect(s.allocations[0]).toMatchObject({
      kind: 'payment', method: 'CASH', amount: 450_000, leftover: 187_500,
      to: [{ due: { kind: 'month', month: '2026-09' }, amount: 262_500 }],
    });
  });

  it('splits a debt into this month and what is left from before', () => {
    const s = buildStatement(input({
      enrollments: [
        enr({ id: 'e0', group: '#041', status: 'DROPPED', start: '2026-05-01', end: '2026-07-23' }),
        enr({ id: 'e1', start: '2026-09-19' }),
      ],
      student: { id: 1, name: 'S', balance: -257_500, discountPercent: 0 },
      rows: [pack('2026-07-02', 270_000, JULY, 9, 'e0'), pay('2026-07-21', 200_000), monthly('2026-09', 187_500, 5, 12)],
      charges: [sept({ coveredDates: SEPT.slice(7) })],
    }));
    expect(s.headline.kind).toBe('debt');
    expect(s.headline.amount).toBe(257_500);
    expect(s.headline.unpaid).toEqual([
      { due: { kind: 'month', month: '2026-09' }, amount: 187_500 },
      { due: { kind: 'month', month: '2026-07' }, amount: 70_000 },
    ]);
  });

  it('explains a sharp change: lessons, price, a return after a gap, the new model', () => {
    const s = buildStatement(input({
      enrollments: [
        enr({ id: 'e0', group: '#041', status: 'DROPPED', start: '2026-05-01', end: '2026-07-23' }),
        enr({ id: 'e1', start: '2026-09-19' }),
      ],
      student: { id: 1, name: 'S', balance: -257_500, discountPercent: 0 },
      rows: [pack('2026-07-02', 270_000, JULY, 9, 'e0'), pay('2026-07-21', 200_000), monthly('2026-09', 187_500, 5, 12)],
      charges: [sept({ coveredDates: SEPT.slice(7) })],
    }));
    const september = s.months[s.months.length - 1];
    expect(september.sharp).toEqual({
      vs: '2026-07',
      diff: -82_500,
      reasons: [
        { kind: 'lessons', now: 5, before: 9 },
        { kind: 'price', now: 37_500, before: 30_000 },
        { kind: 'joined', day: '2026-09-19', group: '#036', awaySince: '2026-07-23' },
        { kind: 'model', to: 'MONTHLY' },
      ],
    });
  });

  it('says a group change mid-month and ignores a same-day open and close', () => {
    const s = buildStatement(input({
      enrollments: [
        enr({ id: 'e0', group: '#001', status: 'DROPPED', start: '2026-05-01', end: '2026-09-05' }),
        enr({ id: 'e2', group: '#057', status: 'DROPPED', start: '2026-09-16', end: '2026-09-16' }),
        enr({ id: 'e1', group: '#052', start: '2026-09-16' }),
      ],
      student: { id: 1, name: 'S', balance: -279_808, discountPercent: 0 },
      rows: [
        pay('2026-08-01', 360_000), pack('2026-08-01', 360_000, AUG, 12, 'e0'),
        row({ type: 'LESSON_DEDUCTION', day: '2026-09-02', amount: -37_500, enrollmentId: 'e0', metadata: { lessonsCovered: 1 }, consumedDays: ['2026-09-02'] }),
        monthly('2026-09', 242_308, 7, 13),
      ],
      charges: [sept({ plannedLessons: 13, coveredDates: SEPT.slice(6, 11).concat(['2026-09-29', '2026-09-30']) })],
    }));
    const september = s.months[s.months.length - 1];
    expect(september.sharp?.reasons).toEqual([
      { kind: 'lessons', now: 8, before: 12 },
      { kind: 'price', now: 34_615, before: 30_000 },
      { kind: 'left', day: '2026-09-05', group: '#001', frozen: false },
      { kind: 'joined', day: '2026-09-16', group: '#052', awaySince: null },
      { kind: 'model', to: 'MONTHLY' },
    ]);
    expect(s.modelChanges[0].otherGroupPack).toEqual([
      { group: '#001', days: ['2026-09-02'], cost: 37_500, leftDay: '2026-09-05' },
    ]);
  });

  it('does not call a small change sharp', () => {
    const s = buildStatement(input({
      student: { id: 1, name: 'S', balance: -18_750, discountPercent: 0 },
      rows: [pay('2026-08-01', 432_000), pack('2026-08-01', 432_000, AUG, 12), pay('2026-09-10', 431_250), monthly('2026-09', 450_000, 12, 12)],
      charges: [sept()],
    }));
    expect(s.months[s.months.length - 1].sharp).toBeNull();
  });

  it('describes the switch to monthly billing, with what was reversed and credited', () => {
    const s = buildStatement(input({
      student: { id: 1, name: 'S', balance: 30_000, discountPercent: 0 },
      rows: [
        pay('2026-08-01', 360_000), pack('2026-08-01', 360_000, [...AUG.slice(0, 11), '2026-09-03']),
        pay('2026-09-10', 450_000),
        row({ type: 'LESSON_DEDUCTION', day: '2026-09-10', amount: -360_000, reversed: true, metadata: { lessonsCovered: 12 }, consumedDays: SEPT.slice(1, 4) }),
        row({ type: 'LESSON_DEDUCTION', day: '2026-09-26', amount: 360_000, reversal: true, description: "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi — 2026-09" }),
        monthly('2026-09', 450_000, 12, 12),
        row({ type: 'ADJUSTMENT', day: '2026-09-26', amount: 30_000, enrollmentId: null, metadata: { marker: 'overcharge-monthly-carried-in', period: '2026-09', enrollmentId: 'e1', lessons: 1 } }),
      ],
      charges: [sept()],
    }));
    expect(s.modelChanges).toEqual([{
      month: '2026-09', to: 'MONTHLY', oldCharged: 360_000, newCharged: 450_000, newLessons: 12,
      carriedIn: { lessons: 1, amount: 30_000 }, otherGroupPack: [],
    }]);
    expect(s.packEra).toEqual({ size: 12, until: '2026-09' });
  });

  it('sees a return to lesson packs as a model change of its own', () => {
    const OCT = ['2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08', '2026-10-10', '2026-10-13', '2026-10-15', '2026-10-17', '2026-10-20', '2026-10-22', '2026-10-24', '2026-10-27'];
    const s = buildStatement(input({
      asOf: '2026-10-28',
      enrollments: [enr({ course: { name: 'Standart', price: 400_000, lessonPaymentCount: 12, paymentModel: 'LESSON_PACK' } })],
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [pay('2026-09-02', 450_000), monthly('2026-09', 450_000, 12, 12), pay('2026-10-01', 360_000), pack('2026-10-01', 360_000, OCT)],
      charges: [sept()],
    }));
    expect(s.modelChanges.map((c) => [c.month, c.to])).toEqual([['2026-10', 'LESSON_PACK']]);
    expect(s.packEra).toEqual({ size: 12, until: null });
  });

  it('lets a credit such as a forgiven debt pay old lessons', () => {
    const s = buildStatement(input({
      student: { id: 1, name: 'S', balance: 138_462, discountPercent: 0 },
      rows: [
        pack('2026-05-10', 180_000, ['2026-05-12', '2026-05-14', '2026-05-16', '2026-05-19', '2026-05-21', '2026-05-23']),
        row({ type: 'DEBT_WRITE_OFF', day: '2026-08-14', amount: 180_000, enrollmentId: null }),
        pay('2026-09-16', 450_000),
        monthly('2026-09', 311_538, 9, 13),
      ],
      charges: [sept({ plannedLessons: 13, coveredDates: SEPT.slice(3) })],
    }));
    expect(s.allocations.map((a) => [a.kind, a.itemKind, a.to, a.leftover])).toEqual([
      ['credit', 'debt-write-off', [{ due: { kind: 'month', month: '2026-05' }, amount: 180_000 }], 0],
      ['payment', null, [{ due: { kind: 'month', month: '2026-09' }, amount: 311_538 }], 138_462],
    ]);
    expect(s.equation.items).toEqual([{ kind: 'debt-write-off', amount: 180_000 }]);
  });

  it('pays a cash refund like any other due', () => {
    const s = buildStatement(input({
      student: { id: 1, name: 'S', balance: 0, discountPercent: 0 },
      rows: [pay('2026-09-05', 400_000), pay('2026-09-11', 400_000, 'PAYME'), monthly('2026-09', 400_000, 12, 12), row({ type: 'REFUND', day: '2026-09-24', amount: -400_000, enrollmentId: null })],
      charges: [sept()],
    }));
    expect(s.headline.kind).toBe('zero');
    expect(s.allocations[1].to).toEqual([{ due: { kind: 'item', itemKind: 'refund', day: '2026-09-24' }, amount: 400_000 }]);
  });

  it('describes the student from the active enrollment', () => {
    const s = buildStatement(input({
      enrollments: [enr({ id: 'old', group: '#001', status: 'DROPPED', end: '2026-06-01' }), enr()],
      student: { id: 7, name: 'Test Student', balance: 0, discountPercent: 10 },
    }));
    expect(s.student).toEqual({
      id: 7, name: 'Test Student', groups: ['#036'],
      course: { name: 'Standart', price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' },
      discountPercent: 10, branch: 'Filial',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/statements/build-statement.spec.ts`
Expected: FAIL — `Cannot find module './build-statement'`.

- [ ] **Step 3: Implement `statement-analysis.ts`**

```ts
import type {
  Allocation,
  CoursePaymentModel,
  Day,
  DueRef,
  ModelChange,
  MonthKey,
  SharpReason,
  StatementEnrollment,
  StatementModel,
  StatementMonth,
  StatementRow,
} from './statement.types';
import { monthOf, type MonthSwitchFacts } from './statement-months';

/** A month is "sharply different" past both of these (CEO, 26.09.2026). */
const SHARP_MIN_SOM = 50_000;
const SHARP_MIN_SHARE = 0.2;
/** Per-lesson prices closer than this are rounding, not a change. */
const PRICE_NOISE = 500;

interface Due {
  ref: DueRef;
  day: Day;
  left: number;
}

const total = (parts: Array<{ cost: number; lessons: number }>) => ({
  cost: parts.reduce((s, p) => s + p.cost, 0),
  lessons: parts.reduce((s, p) => s + p.lessons, 0),
});

/** FIFO: payments and credits, by date, pay the oldest unpaid lessons first. */
export function allocate(
  months: StatementMonth[],
  payments: StatementRow[],
  prepaidAhead: number,
): { allocations: Allocation[]; unpaid: Array<{ due: DueRef; amount: number }> } {
  const dues: Due[] = [];
  for (const m of months) {
    if (m.cost > 0) {
      dues.push({ ref: { kind: 'month', month: m.key }, day: `${m.key}-01`, left: m.cost });
    }
    for (const it of m.items) {
      if (it.amount < 0) {
        dues.push({ ref: { kind: 'item', itemKind: it.kind, day: it.day }, day: it.day, left: -it.amount });
      }
    }
  }
  dues.sort((x, y) => x.day.localeCompare(y.day));
  if (prepaidAhead > 0) {
    dues.push({ ref: { kind: 'prepaid' }, day: '9999-12-31', left: prepaidAhead });
  }

  const sources = [
    ...payments.map((p) => ({
      day: p.day, kind: 'payment' as const, method: p.paymentMethod,
      itemKind: null, paymentId: p.paymentId, amount: p.amount,
    })),
    ...months.flatMap((m) =>
      m.items
        .filter((i) => i.amount > 0)
        .map((i) => ({
          day: i.day, kind: 'credit' as const, method: null,
          itemKind: i.kind, paymentId: null, amount: i.amount,
        })),
    ),
  ].sort((x, y) => x.day.localeCompare(y.day));

  const allocations = sources.map((s): Allocation => {
    let money = s.amount;
    const to: Allocation['to'] = [];
    for (const d of dues) {
      if (money <= 0) break;
      if (d.left <= 0) continue;
      const take = Math.min(money, d.left);
      d.left -= take;
      money -= take;
      to.push({ due: d.ref, amount: take });
    }
    return { ...s, to, leftover: money };
  });

  const unpaid = dues
    .filter((d) => d.left > 0)
    .map((d) => ({ due: d.ref, amount: d.left }))
    .reverse();
  return { allocations, unpaid };
}

export function headlineOf(
  balance: number,
  unpaid: Array<{ due: DueRef; amount: number }>,
): StatementModel['headline'] {
  if (balance < 0) return { kind: 'debt', amount: -balance, unpaid };
  if (balance > 0) return { kind: 'credit', amount: balance, unpaid: [] };
  return { kind: 'zero', amount: 0, unpaid: [] };
}

const perLessonOf = (m: StatementMonth): number =>
  m.monthlyParts[0]?.perLesson ||
  (m.lessons > 0 ? Math.round(m.cost / m.lessons) : 0);

function sharpReasons(
  m: StatementMonth,
  prev: StatementMonth,
  enrollments: StatementEnrollment[],
): SharpReason[] {
  const out: SharpReason[] = [];
  if (m.lessons !== prev.lessons) {
    out.push({ kind: 'lessons', now: m.lessons, before: prev.lessons });
  }
  const now = perLessonOf(m);
  const before = perLessonOf(prev);
  if (now > 0 && before > 0 && Math.abs(now - before) >= PRICE_NOISE) {
    out.push({ kind: 'price', now, before });
  }
  const inMonth = (d: Day | null): d is Day => d !== null && monthOf(d) === m.key;
  for (const e of enrollments) {
    if (!inMonth(e.end) || e.end === e.start) continue;
    // Taken out and put back into the same group that day: not a departure.
    if (enrollments.some((o) => o !== e && o.group === e.group && o.start === e.end)) continue;
    out.push({ kind: 'left', day: e.end, group: e.group, frozen: e.status === 'FROZEN' });
  }
  for (const e of enrollments) {
    if (!inMonth(e.start) || e.end === e.start) continue;
    if (enrollments.some((o) => o !== e && o.group === e.group && o.end === e.start)) continue;
    const ended = enrollments.filter((o) => o !== e && o.end !== null && o.end < e.start);
    const heldMeanwhile = enrollments.some(
      (o) => o !== e && o.start < e.start && (o.end === null || o.end >= e.start),
    );
    const awaySince =
      ended.length > 0 && !ended.some((o) => inMonth(o.end)) && !heldMeanwhile
        ? (ended.map((o) => o.end as Day).sort().pop() ?? null)
        : null;
    out.push({ kind: 'joined', day: e.start, group: e.group, awaySince });
  }
  if (m.model && prev.model && m.model !== prev.model) {
    out.push({ kind: 'model', to: m.model });
  }
  return out;
}

/** Flags the latest month when it is sharply different from the last month with lessons. */
export function markSharpChange(
  months: StatementMonth[],
  enrollments: StatementEnrollment[],
): void {
  const last = months[months.length - 1];
  if (!last) return;
  const prev = [...months.slice(0, -1)].reverse().find((m) => m.lessons > 0);
  if (!prev || prev.cost <= 0) return;
  const diff = last.cost - prev.cost;
  if (Math.abs(diff) < SHARP_MIN_SOM || Math.abs(diff) / prev.cost < SHARP_MIN_SHARE) return;
  last.sharp = { vs: prev.key, diff, reasons: sharpReasons(last, prev, enrollments) };
}

/**
 * The months where the payment model changed, read from the charges
 * themselves: a month with monthly charges after package months (or with
 * old-way charges the switch reversed), or package months after monthly ones.
 */
export function modelChangesOf(
  months: StatementMonth[],
  facts: Map<MonthKey, MonthSwitchFacts>,
  enrollments: StatementEnrollment[],
): ModelChange[] {
  const changes: ModelChange[] = [];
  let prevModel: CoursePaymentModel | null = null;
  for (const m of months) {
    if (!m.model) continue;
    const f = facts.get(m.key) ?? { oldCharged: 0, carriedIn: { lessons: 0, amount: 0 } };
    const switched = prevModel !== null && m.model !== prevModel;
    const migrated =
      m.model === 'MONTHLY' && f.oldCharged > 0 && !changes.some((c) => c.to === 'MONTHLY');
    if (switched || migrated) {
      const monthlyGroups = new Set(m.monthlyParts.map((p) => p.group));
      const now = m.model === 'MONTHLY' ? total(m.monthlyParts) : total(m.packParts);
      changes.push({
        month: m.key,
        to: m.model,
        oldCharged: f.oldCharged,
        newCharged: now.cost,
        newLessons: now.lessons,
        carriedIn: f.carriedIn.lessons > 0 ? { ...f.carriedIn } : null,
        otherGroupPack:
          m.model !== 'MONTHLY'
            ? []
            : m.packParts
                .filter((p) => p.lessons > 0 && !monthlyGroups.has(p.group))
                .map((p) => ({
                  group: p.group,
                  days: p.days,
                  cost: p.cost,
                  leftDay:
                    enrollments
                      .filter((e) => e.group === p.group && e.end !== null && monthOf(e.end) === m.key)
                      .map((e) => e.end as Day)
                      .sort()
                      .pop() ?? null,
                })),
      });
    }
    prevModel = m.model;
  }
  return changes;
}

export function packEraOf(
  months: StatementMonth[],
  packSize: number | null,
): StatementModel['packEra'] {
  const packMonths = months.filter((m) => m.model === 'LESSON_PACK');
  if (packMonths.length === 0) return null;
  const lastPack = packMonths[packMonths.length - 1].key;
  const until = months.find((m) => m.key > lastPack && m.model === 'MONTHLY')?.key ?? null;
  return { size: packSize ?? 12, until };
}
```

- [ ] **Step 4: Implement `build-statement.ts`**

```ts
import { buildMonths } from './statement-months';
import {
  allocate,
  headlineOf,
  markSharpChange,
  modelChangesOf,
  packEraOf,
} from './statement-analysis';
import type { ItemKind, StatementInput, StatementModel } from './statement.types';

/** The whole statement: pure, so the PDF, the admin tab and the bot tell one story. */
export function buildStatement(input: StatementInput): StatementModel {
  const r = buildMonths(input);
  markSharpChange(r.months, input.enrollments);
  const { allocations, unpaid } = allocate(r.months, r.payments, r.prepaidAhead);

  const itemTotals = new Map<ItemKind, number>();
  for (const m of r.months) {
    for (const it of m.items) {
      itemTotals.set(it.kind, (itemTotals.get(it.kind) ?? 0) + it.amount);
    }
  }
  const current = input.enrollments.filter((e) => e.status === 'ACTIVE' && !e.deleted);
  const main = current[0] ?? input.enrollments[input.enrollments.length - 1] ?? null;

  return {
    asOf: input.asOf,
    student: {
      id: input.student.id,
      name: input.student.name,
      groups: [...new Set((current.length > 0 ? current : main ? [main] : []).map((e) => e.group))],
      course: main ? { ...main.course } : null,
      discountPercent: input.student.discountPercent,
      branch: main?.branch ?? null,
    },
    balance: input.student.balance,
    headline: headlineOf(input.student.balance, unpaid),
    equation: {
      paid: r.paid,
      items: [...itemTotals]
        .filter(([, amount]) => amount !== 0)
        .map(([kind, amount]) => ({ kind, amount })),
      lessons: r.months.reduce((s, m) => s + m.cost, 0),
      prepaidAhead: r.prepaidAhead,
      unexplained: r.unexplained,
      balance: input.student.balance,
    },
    packEra: packEraOf(r.months, r.packSize),
    months: r.months,
    modelChanges: modelChangesOf(r.months, r.switchFacts, input.enrollments),
    allocations,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/statements`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/statements
git commit -m "Statements: FIFO allocation, debt headline, sharp changes and model switches"
```

---

### Task 4: Matnlar — o'quvchi va admin tilida

**Files:**
- Create: `server/src/statements/statement-text.ts`
- Create: `server/src/statements/present-statement.ts`
- Test: `server/src/statements/present-statement.spec.ts`

**Interfaces:**
- Consumes: `StatementModel` (Task 3), `nextMonthKey`, `monthOf` (Task 2), `applyDiscount` (`src/billing/monthly-price.ts`).
- Produces:
  - `presentStatement(model: StatementModel, voice: Voice): StatementView`;
  - turlar `Voice`, `Segment`, `MonthView`, `StatementView`;
  - `statement-text.ts` dagi `som`, `signed`, `dmy`, `dm`, `dayName`, `monthName`, `monthTitle`, `capitalize`, `METHOD_LABEL`.

- [ ] **Step 1: Write the failing tests**

`server/src/statements/present-statement.spec.ts`:

```ts
import { buildStatement } from './build-statement';
import { presentStatement } from './present-statement';
import { som, signed } from './statement-text';
import type { StatementEnrollment, StatementInput, StatementRow } from './statement.types';

let seq = 0;
const row = (over: Partial<StatementRow>): StatementRow => ({
  id: `t${++seq}`, type: 'PAYMENT', amount: 0, day: '2026-05-01', description: null, metadata: null,
  enrollmentId: 'e1', paymentId: null, paymentMethod: null, reversed: false, reversal: false, consumedDays: null, ...over,
});
const enr = (over: Partial<StatementEnrollment> = {}): StatementEnrollment => ({
  id: 'e1', group: '#036', status: 'ACTIVE', start: '2026-05-01', end: null, deleted: false,
  course: { name: 'Standart', price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' }, branch: 'Filial', ...over,
});
const SEPT = ['2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10', '2026-09-12', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'];
const JULY = ['2026-07-02', '2026-07-04', '2026-07-07', '2026-07-09', '2026-07-11', '2026-07-14', '2026-07-16', '2026-07-18', '2026-07-21'];

/** A student who left in July, came back on 19.09 and owes for both. */
const debtor = (): StatementInput => ({
  asOf: '2026-09-26',
  student: { id: 7, name: 'Test Student', balance: -257_500, discountPercent: 0 },
  enrollments: [
    enr({ id: 'e0', group: '#041', status: 'DROPPED', start: '2026-05-01', end: '2026-07-23' }),
    enr({ id: 'e1', start: '2026-09-19' }),
  ],
  rows: [
    row({ type: 'LESSON_DEDUCTION', day: '2026-07-02', amount: -270_000, enrollmentId: 'e0', metadata: { lessonsCovered: 9 }, consumedDays: JULY }),
    row({ type: 'PAYMENT', day: '2026-07-21', amount: 200_000, enrollmentId: null, paymentId: 'p1', paymentMethod: 'CASH' }),
    row({ type: 'LESSON_DEDUCTION', day: '2026-09-26', amount: -187_500, metadata: { mode: 'MONTHLY_PERIOD', period: '2026-09', coveredLessons: 5, plannedLessons: 12 } }),
  ],
  charges: [{ enrollmentId: 'e1', period: '2026-09', plannedLessons: 12, coveredDates: SEPT.slice(7), frozenOutDates: [], creditLessons: 0, creditAmount: 0, excusedLessons: 0 }],
  attendance: [{ day: '2026-07-04', group: '#041', status: 'ABSENT' }],
});

describe('statement text helpers', () => {
  it('groups thousands with no-break spaces and uses a real minus', () => {
    expect(som(-254156)).toBe('254 156');
    expect(signed(-254156)).toBe('−254 156');
    expect(signed(33345)).toBe('+33 345');
    expect(signed(0)).toBe('0');
  });
});

describe('presentStatement', () => {
  const nb = (s: string) => s.replace(/ /g, ' ');

  it('answers a debtor in the student voice, month by month', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(nb(v.answer.title)).toBe("Qarzingiz: 257 500 so'm");
    expect(nb(v.answer.subtitle)).toBe('sentabr darslari uchun 187 500 · iyuldan qolgan 70 000');
    expect(nb(v.studentLine)).toBe("Test Student · ID 7 · #036 guruh · Standart — oyiga 450 000 so'm");
    expect(v.asOfLine).toBe('DaF Sprachzentrum · 26.09.2026 holatiga');
  });

  it('answers the same debtor in the admin voice', () => {
    const v = presentStatement(buildStatement(debtor()), 'admin');
    expect(nb(v.answer.title)).toBe("Qarzi: 257 500 so'm");
    expect(nb(v.equation.map((s) => s.text).join(''))).toBe("To'lagan 200 000 − o'qigan darslari 457 500 = −257 500");
  });

  it('writes the months table with quiet months, absences and the monthly line', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(v.months.map((m) => [m.label, m.lessons, m.absent, m.cost, m.costNote])).toEqual([
      ['Iyul', '9 ta', '1 kelmagan', '270 000', null],
      ['Avgust', '0 ta', null, null, "hisoblangan dars yo'q"],
      ['Sentabr', '5 ta', null, '187 500', null],
    ]);
    expect(nb(v.months[2].details[0])).toBe("oylik to'lov: 19-sentabrdan, 12 darsdan 5 tasi × 37 500");
  });

  it('explains the sharp change in plain words', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(nb(v.sharpNote!.map((s) => s.text).join(''))).toBe(
      "Sentabr iyuldan 82 500 so'm kam. Sababi: darslar soni 5 ta (iyulda 9 ta); 1 dars narxi 30 000 → 37 500; 19-sentabrdan #036 guruhda o'qiydi (23-iyuldan beri darsda bo'lmagan); sentabrdan oylik to'lov.",
    );
    expect(v.months[2].highlight).toBe(true);
  });

  it('says where each payment went', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(v.allocations.map((a) => [a.date, a.what, nb(a.amount), nb(a.to), a.paymentId])).toEqual([
      ['21.07.2026', 'Naqd', '200 000', 'iyul darslari 200 000', 'p1'],
    ]);
  });

  it('tells a student with money ahead where it goes', () => {
    const input = debtor();
    input.student.balance = 12_500;
    input.rows.push(row({ type: 'PAYMENT', day: '2026-09-20', amount: 270_000, enrollmentId: null, paymentId: 'p2', paymentMethod: 'PAYME' }));
    const v = presentStatement(buildStatement(input), 'student');
    expect(nb(v.answer.title)).toBe("Qarzingiz yo'q. Hisobingizda 12 500 so'm ortiqcha pul bor.");
    expect(v.answer.subtitle).toBe("U oktabr to'loviga o'tadi.");
    expect(nb(v.allocations[1].to)).toBe("iyul darslari 70 000, sentabr darslari 187 500 · ortig'i 12 500 hisobingizda (oktabr to'loviga)");
  });

  it('says the pack era once, above the table', () => {
    const v = presentStatement(buildStatement(debtor()), 'student');
    expect(v.packHint).toBe(
      "Sentabrgacha pul 12 darslik paket uchun to'lanardi. Jadvalda esa har dars o'tilgan oyiga yozilgan, shuning uchun bir oyda 12 tadan ko'p yoki kam dars bo'lishi mumkin.",
    );
  });

  it('warns the admin, not the student, when the statement is off the balance', () => {
    const input = debtor();
    input.student.balance = -250_000;
    expect(presentStatement(buildStatement(input), 'student').warning).toBeNull();
    expect(presentStatement(buildStatement(input), 'admin').warning).toContain('7 500');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/statements/present-statement.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `statement-text.ts`**

```ts
import type { Day } from './statement.types';

const MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];
const NBSP = ' ';

/** 'sentabr' for '2026-09' or '2026-09-19'. */
export const monthName = (keyOrDay: string): string =>
  MONTHS[Number(keyOrDay.slice(5, 7)) - 1];

export const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

/** 'Sentabr'. */
export const monthTitle = (keyOrDay: string): string =>
  capitalize(monthName(keyOrDay));

/** '19-sentabr'. */
export const dayName = (day: Day): string =>
  `${Number(day.slice(8, 10))}-${monthName(day)}`;

/** '19.09.2026'. */
export const dmy = (day: Day): string =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** '19.09'. */
export const dm = (day: Day): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** 254156 → '254 156' (no-break space). Display only: the sign is dropped. */
export const som = (n: number): string =>
  String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** '+33 345', '−254 156', '0'. */
export const signed = (n: number): string =>
  (n > 0 ? '+' : n < 0 ? '−' : '') + som(n);

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};
```

- [ ] **Step 4: Implement `present-statement.ts`**

```ts
import { applyDiscount } from '../billing/monthly-price';
import { monthOf, nextMonthKey } from './statement-months';
import {
  METHOD_LABEL,
  capitalize,
  dayName,
  dm,
  dmy,
  monthName,
  monthTitle,
  signed,
  som,
} from './statement-text';
import type {
  DueRef,
  ItemKind,
  ModelChange,
  MonthKey,
  SharpReason,
  StatementModel,
  StatementMonth,
  StatementNote,
} from './statement.types';

export type Voice = 'student' | 'admin';

export interface Segment {
  text: string;
  bold?: boolean;
  tone?: 'red' | 'green' | 'muted';
}

export interface MonthView {
  key: MonthKey;
  label: string;
  lessons: string;
  absent: string | null;
  cost: string | null;
  costNote: string | null;
  money: string;
  running: string;
  runningTone: 'red' | 'green' | 'muted';
  details: string[];
  highlight: boolean;
  isLast: boolean;
}

export interface StatementView {
  title: string;
  studentLine: string;
  asOfLine: string;
  answer: { tone: 'debt' | 'credit' | 'zero'; title: string; subtitle: string };
  equation: Segment[];
  packHint: string | null;
  months: MonthView[];
  sharpNote: Segment[] | null;
  modelChanges: Array<{ title: string; lines: string[] }>;
  allocations: Array<{
    date: string;
    what: string;
    amount: string;
    to: string;
    paymentId: string | null;
  }>;
  footnote: string;
  /** Admin only: the statement does not reconcile to the balance. */
  warning: string | null;
}

const WORDS = {
  student: {
    debt: 'Qarzingiz',
    noDebt: "Qarzingiz yo'q.",
    credit: (x: string) => `Qarzingiz yo'q. Hisobingizda ${x} so'm ortiqcha pul bor.`,
    zero: "Hisobingiz nolda: qarz ham, ortiqcha pul ham yo'q.",
    paid: "To'lagansiz",
    lessons: "o'qigan darslaringiz",
    onAccount: 'hisobingizda',
    midMonth: "Oy o'rtasida qo'shilsangiz, faqat qo'shilgan kundan boshlab darslar hisoblanadi.",
    youLeft: 'chiqqansiz',
    yourDiscount: 'sizga ',
    footnote:
      "«Oy oxirida» — shu oy oxirigacha to'lagan pulingizdan o'qigan darslaringiz narxi ayirilgani: + ortiqcha, − qarz. " +
      '«Kelmagan» — sababsiz qoldirilgan dars, u ham hisoblanadi. Pul avval eng eski to\'lanmagan darslarga yoziladi. ' +
      "Hujjat tizim tomonidan avtomatik tuzilgan. Savol bo'lsa, filial administratoriga murojaat qiling.",
  },
  admin: {
    debt: 'Qarzi',
    noDebt: "Qarzi yo'q.",
    credit: (x: string) => `Qarzi yo'q. Hisobida ${x} so'm ortiqcha pul bor.`,
    zero: "Hisobi nolda: qarz ham, ortiqcha pul ham yo'q.",
    paid: "To'lagan",
    lessons: "o'qigan darslari",
    onAccount: 'hisobida',
    midMonth: "Oy o'rtasida qo'shilsa, qo'shilgan kundan boshlab darslar hisoblanadi.",
    youLeft: 'chiqqan',
    yourDiscount: '',
    footnote:
      "«Oy oxirida» — shu oy oxirigacha to'lagan pulidan o'qigan darslari narxi ayirilgani: + ortiqcha, − qarz. " +
      "«Kelmagan» — sababsiz qoldirilgan dars, u ham hisoblanadi. Pul avval eng eski to'lanmagan darslarga yoziladi.",
  },
};

const ITEM: Record<ItemKind, { student: string; admin: string }> = {
  refund: { student: 'sizga naqd qaytarib berildi', admin: 'naqd qaytarib berildi' },
  'mock-fee': { student: 'mock imtihon', admin: 'mock imtihon' },
  'debt-write-off': { student: 'qarz kechirildi', admin: 'qarz kechirildi' },
  'balance-withdrawal': { student: 'balansdan olindi', admin: 'balansdan olindi' },
  discount: {
    student: "chegirma (o'tgan darslar qayta hisoblandi)",
    admin: "chegirma (o'tgan darslar qayta hisoblandi)",
  },
  'initial-balance': { student: "boshlang'ich balans", admin: "boshlang'ich balans" },
  correction: { student: "to'g'rilash", admin: "to'g'rilash" },
  unexplained: { student: 'boshqa tuzatish', admin: 'tushuntirilmagan farq' },
};

const WHY: Record<StatementNote['why'], string> = {
  'left-group': 'guruhdan chiqqanda',
  'group-change': 'guruh almashganda',
  frozen: 'muzlatilganda',
  refund: 'pul qaytarib olinganda',
  other: '',
};

const itemLabel = (kind: ItemKind, voice: Voice) => ITEM[kind][voice];

function releaseText(n: StatementNote): string {
  const count = n.lessons ? `${n.lessons} ` : '';
  const what =
    n.kind === 'prepaid-release'
      ? `paketdagi o'tilmagan ${count}dars puli qaytarildi`
      : `o'tilmagan ${count}dars puli qaytarildi`;
  return [WHY[n.why], what].filter(Boolean).join(' ');
}

function dueLabel(due: DueRef, voice: Voice): string {
  if (due.kind === 'month') return `${monthName(due.month)} darslari`;
  if (due.kind === 'item') return `${itemLabel(due.itemKind, voice)} (${dm(due.day)})`;
  return "oldindan to'langan, hali o'tilmagan darslar";
}

function monthDetails(m: StatementMonth, voice: Voice): string[] {
  const out: string[] = [];
  const several = m.monthlyParts.length > 1;
  for (const p of m.monthlyParts) {
    const prefix = several ? `${p.group}: ` : '';
    out.push(
      p.fromDay && p.lessons < p.planned
        ? `${prefix}oylik to'lov: ${dayName(p.fromDay)}dan, ${p.planned} darsdan ${p.lessons} tasi × ${som(p.perLesson)}`
        : `${prefix}oylik to'lov: ${p.lessons} dars × ${som(p.perLesson)}`,
    );
    if (p.creditLessons > 0) {
      out.push(`o'tgan oydagi uzrli ${p.creditLessons} dars uchun −${som(p.creditAmount)}`);
    }
    if (p.excusedLessons > 0) {
      out.push(`uzrli ${p.excusedLessons} dars — ${monthName(nextMonthKey(m.key))} to'lovidan ayriladi`);
    }
  }
  const pack = m.packParts.filter((p) => p.lessons > 0);
  if (m.monthlyParts.length > 0) {
    for (const p of pack) {
      out.push(`${p.group} guruhda ${p.lessons} dars (${p.days.map(dayName).join(', ')}) eski usulda — ${som(p.cost)}`);
    }
  } else if (new Set(pack.map((p) => p.group)).size > 1) {
    const byGroup = new Map<string, number>();
    for (const p of pack) byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + p.lessons);
    out.push([...byGroup].map(([g, n]) => `${g} guruhda ${n} dars`).join(', '));
  }
  if (m.items.length > 0) {
    const bits = m.paid ? [`to'lov ${som(m.paid)}`] : [];
    for (const it of m.items) {
      const label = it.kind === 'correction' && it.description ? it.description : itemLabel(it.kind, voice);
      bits.push(`${dm(it.day)} ${label} ${signed(it.amount)}`);
    }
    out.push(bits.join(' · '));
  }
  for (const n of m.notes) {
    out.push(`${dm(n.day)}: ${releaseText(n)} (${som(n.amount)}) — bu darslar hisobga kirmagan`);
  }
  return out;
}

function reasonText(r: SharpReason, month: MonthKey, vs: MonthKey, packSize: number): string {
  switch (r.kind) {
    case 'lessons':
      return `darslar soni ${r.now} ta (${monthName(vs)}da ${r.before} ta)`;
    case 'price':
      return `1 dars narxi ${som(r.before)} → ${som(r.now)}`;
    case 'left':
      return r.frozen
        ? `${dayName(r.day)}da ${r.group} guruhda muzlatilgan`
        : `${dayName(r.day)}da ${r.group} guruhdan chiqqan`;
    case 'joined':
      return (
        `${dayName(r.day)}dan ${r.group} guruhda o'qiydi` +
        (r.awaySince ? ` (${dayName(r.awaySince)}dan beri darsda bo'lmagan)` : '')
      );
    case 'model':
      return r.to === 'MONTHLY'
        ? `${monthName(month)}dan oylik to'lov`
        : `${monthName(month)}dan ${packSize} darslik paket`;
  }
}

function modelChangeView(
  c: ModelChange,
  model: StatementModel,
  voice: Voice,
): { title: string; lines: string[] } {
  const w = WORDS[voice];
  const size = model.packEra?.size ?? model.student.course?.lessonPaymentCount ?? 12;
  if (c.to === 'LESSON_PACK') {
    return {
      title: `${monthTitle(c.month)}dan ${size} darslik paket`,
      lines: [
        `${monthTitle(c.month)}dan to'lov ${size} darslik paket bilan: pul paketga to'lanadi va har dars o'tilganda paketdan yechiladi.`,
      ],
    };
  }
  const lines: string[] = [];
  const course = model.student.course;
  const d = model.student.discountPercent;
  if (course && course.paymentModel === 'MONTHLY') {
    lines.push(
      `${monthTitle(c.month)}dan to'lov oyiga bir marta: ${som(course.price)} so'm` +
        (d > 0 ? `, ${w.yourDiscount}${d}% chegirma bilan ${som(applyDiscount(course.price, d))} so'm` : '') +
        ` — guruhning shu oydagi hamma darslari uchun. ${w.midMonth}`,
    );
  }
  if (c.oldCharged > 0) {
    lines.push(
      `${monthTitle(c.month)} darslari uchun eski usulda yechilgan ${som(c.oldCharged)} so'm qaytarildi, ` +
        `o'rniga oylik to'lov ${som(c.newCharged)} so'm yozildi (${c.newLessons} dars).`,
    );
  }
  if (c.carriedIn) {
    lines.push(
      `${c.carriedIn.lessons} ta ${monthName(c.month)} darsi eski usulda ham to'langan edi — ` +
        `ikki marta olinmasligi uchun uning puli ${som(c.carriedIn.amount)} so'm qaytarildi.`,
    );
  }
  for (const p of c.otherGroupPack) {
    const lesson = p.days.length > 1 ? 'darslari' : 'darsi';
    lines.push(
      `${p.days.map(dayName).join(', ')}dagi ${p.group} guruh ${lesson} eski usulda hisoblangan — ${som(p.cost)} so'm` +
        (p.leftDay ? ` (bu guruhdan ${dayName(p.leftDay)}da ${w.youLeft})` : '') +
        '.',
    );
  }
  return { title: `${monthTitle(c.month)}dan oylik to'lov`, lines };
}

export function presentStatement(model: StatementModel, voice: Voice): StatementView {
  const w = WORDS[voice];
  const last = model.months[model.months.length - 1];
  const nextFee = monthName(nextMonthKey(monthOf(model.asOf)));
  const size = model.packEra?.size ?? 12;

  const course = model.student.course;
  const d = model.student.discountPercent;
  const discounted = (price: number) =>
    d > 0 ? `, ${d}% chegirma bilan ${som(applyDiscount(price, d))} so'm` : '';
  const courseText = !course
    ? ''
    : course.paymentModel === 'MONTHLY'
      ? ` · ${course.name} — oyiga ${som(course.price)} so'm${discounted(course.price)}`
      : ` · ${course.name} — ${course.lessonPaymentCount} dars ${som(course.price)} so'm${discounted(course.price)}`;
  const groups = model.student.groups.length > 0 ? ` · ${model.student.groups.join(', ')} guruh` : '';

  let answer: StatementView['answer'];
  if (model.headline.kind === 'debt') {
    const parts = model.headline.unpaid.map(({ due, amount }) => {
      if (due.kind === 'month') {
        return due.month === last?.key
          ? `${monthName(due.month)} darslari uchun ${som(amount)}`
          : `${monthName(due.month)}dan qolgan ${som(amount)}`;
      }
      if (due.kind === 'item') return `${itemLabel(due.itemKind, voice)} (${dm(due.day)}) ${som(amount)}`;
      return `paketdagi hali o'tilmagan darslar uchun ${som(amount)}`;
    });
    answer = { tone: 'debt', title: `${w.debt}: ${som(model.headline.amount)} so'm`, subtitle: parts.join(' · ') };
  } else if (model.headline.kind === 'credit') {
    answer = { tone: 'credit', title: w.credit(som(model.headline.amount)), subtitle: `U ${nextFee} to'loviga o'tadi.` };
  } else {
    answer = { tone: 'zero', title: w.noDebt, subtitle: w.zero };
  }

  const eq = model.equation;
  const equation: Segment[] = [{ text: `${w.paid} ` }, { text: som(eq.paid), bold: true }];
  for (const it of eq.items.filter((i) => i.amount > 0)) {
    equation.push({ text: ` + ${itemLabel(it.kind, voice)} ` }, { text: som(it.amount), bold: true });
  }
  equation.push({ text: ` − ${w.lessons} ` }, { text: som(eq.lessons), bold: true });
  for (const it of eq.items.filter((i) => i.amount < 0)) {
    equation.push({ text: ` − ${itemLabel(it.kind, voice)} ` }, { text: som(it.amount), bold: true });
  }
  if (eq.prepaidAhead > 0) {
    equation.push({ text: " − oldindan to'langan darslar " }, { text: som(eq.prepaidAhead), bold: true });
  }
  equation.push(
    { text: ' = ' },
    {
      text: eq.balance === 0 ? '0' : signed(eq.balance),
      bold: true,
      tone: eq.balance > 0 ? 'green' : eq.balance < 0 ? 'red' : 'muted',
    },
  );

  const months = model.months.map((m, i): MonthView => {
    const preOnly = m.preSystem !== null && m.lessons === 0 && m.cost === 0 && m.money === 0;
    const quiet = !preOnly && m.lessons === 0 && m.cost === 0;
    return {
      key: m.key,
      label: monthTitle(m.key),
      lessons: `${preOnly ? m.preSystem!.lessons : m.lessons} ta`,
      absent: !preOnly && m.absent > 0 ? `${m.absent} kelmagan` : null,
      cost: preOnly || quiet ? null : m.cost < 0 ? signed(m.cost) : som(m.cost),
      costNote: preOnly ? "tizimga qadar to'langan" : quiet ? "hisoblangan dars yo'q" : null,
      money: m.items.length > 0 && m.money !== 0 ? signed(m.money) : m.money !== 0 ? som(m.money) : '—',
      running: preOnly ? '' : m.running === 0 ? '0' : signed(m.running),
      runningTone: m.running > 0 ? 'green' : m.running < 0 ? 'red' : 'muted',
      details: preOnly ? [] : monthDetails(m, voice),
      highlight: m.sharp !== null,
      isLast: i === model.months.length - 1,
    };
  });

  const sharp = last?.sharp ?? null;
  const sharpNote: Segment[] | null =
    last && sharp
      ? [
          {
            text: `${monthTitle(last.key)} ${monthName(sharp.vs)}dan ${som(sharp.diff)} so'm ${sharp.diff > 0 ? "ko'p" : 'kam'}.`,
            bold: true,
          },
          ...(sharp.reasons.length > 0
            ? [{ text: ` Sababi: ${sharp.reasons.map((r) => reasonText(r, last.key, sharp.vs, size)).join('; ')}.` }]
            : []),
        ]
      : null;

  const allocations = model.allocations.map((a) => {
    const to = a.to.map((t) => `${dueLabel(t.due, voice)} ${som(t.amount)}`).join(', ');
    const leftover =
      a.leftover > 0 ? `ortig'i ${som(a.leftover)} ${w.onAccount} (${nextFee} to'loviga)` : '';
    return {
      date: dmy(a.day),
      what:
        a.kind === 'payment'
          ? (METHOD_LABEL[a.method ?? ''] ?? "To'lov")
          : capitalize(itemLabel(a.itemKind ?? 'correction', voice)),
      amount: som(a.amount),
      to: [to, leftover].filter(Boolean).join(' · '),
      paymentId: a.paymentId,
    };
  });

  const packHint = !model.packEra
    ? null
    : (model.packEra.until
        ? `${monthTitle(model.packEra.until)}gacha pul ${size} darslik paket uchun to'lanardi.`
        : `Pul ${size} darslik paket uchun to'lanadi.`) +
      ` Jadvalda esa har dars o'tilgan oyiga yozilgan, shuning uchun bir oyda ${size} tadan ko'p yoki kam dars bo'lishi mumkin.`;

  return {
    title: "To'lovlar hisoboti",
    studentLine: `${model.student.name} · ID ${model.student.id}${groups}${courseText}`,
    asOfLine: `DaF Sprachzentrum · ${dmy(model.asOf)} holatiga`,
    answer,
    equation,
    packHint,
    months,
    sharpNote,
    modelChanges: model.modelChanges.map((c) => modelChangeView(c, model, voice)),
    allocations,
    footnote: w.footnote,
    warning:
      voice === 'admin' && eq.unexplained !== 0
        ? `Hisobot balans bilan ${signed(eq.unexplained)} so'm farq qildi va «tushuntirilmagan farq» qatori qo'shildi. Dasturchiga xabar bering.`
        : null,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/statements`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/statements
git commit -m "Statements: one place for the wording, in the student's and the admin's voice"
```

---

### Task 5: PDF shabloni (pdfmake, v3 ko'rinishi)

**Files:**
- Create: `server/src/statements/statement-pdf.ts`
- Test: `server/src/statements/statement-pdf.spec.ts`

**Interfaces:**
- Consumes: `StatementView`, `Segment`, `MonthView` (Task 4), `renderPdf` (`src/receipts/pdf/render.ts`).
- Produces:
  - `statementDocDefinition(view: StatementView): TDocumentDefinitions`;
  - `renderStatementPdf(view: StatementView): Promise<Buffer>`.

- [ ] **Step 1: Write the failing tests**

`server/src/statements/statement-pdf.spec.ts`:

```ts
import { renderStatementPdf, statementDocDefinition } from './statement-pdf';
import type { StatementView } from './present-statement';

const view = (): StatementView => ({
  title: "To'lovlar hisoboti",
  studentLine: "Test Student · ID 7 · #036 guruh · Standart — oyiga 450 000 so'm",
  asOfLine: 'DaF Sprachzentrum · 26.09.2026 holatiga',
  answer: { tone: 'debt', title: "Qarzingiz: 257 500 so'm", subtitle: 'sentabr darslari uchun 187 500' },
  equation: [{ text: "To'lagansiz " }, { text: '200 000', bold: true }, { text: ' = ' }, { text: '−257 500', bold: true, tone: 'red' }],
  packHint: "Sentabrgacha pul 12 darslik paket uchun to'lanardi.",
  months: [
    { key: '2026-09', label: 'Sentabr', lessons: '5 ta', absent: '1 kelmagan', cost: '187 500', costNote: null, money: '—', running: '−257 500', runningTone: 'red', details: ["oylik to'lov: 5 dars × 37 500"], highlight: true, isLast: true },
  ],
  sharpNote: [{ text: "Sentabr iyuldan 82 500 so'm kam.", bold: true }],
  modelChanges: [{ title: "Sentabrdan oylik to'lov", lines: ['Bir qator.'] }],
  allocations: [{ date: '21.07.2026', what: 'Naqd', amount: '200 000', to: 'iyul darslari 200 000', paymentId: 'p1' }],
  footnote: 'Izoh.',
  warning: null,
});

const flatten = (node: unknown): string => JSON.stringify(node);

describe('statement PDF', () => {
  it('lays out every part of the statement', () => {
    const doc = flatten(statementDocDefinition(view()).content);
    for (const text of ["Qarzingiz: 257 500 so'm", "Oylar bo'yicha", 'Sentabr', '1 kelmagan', "oylik to'lov: 5 dars × 37 500", "Sentabrdan oylik to'lov", "To'lovlaringiz qayerga ketdi", 'iyul darslari 200 000', 'Izoh.']) {
      expect(doc).toContain(text);
    }
  });

  it('renders a real PDF', async () => {
    const pdf = await renderStatementPdf(view());
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/statements/statement-pdf.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `statement-pdf.ts`**

```ts
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { renderPdf } from '../receipts/pdf/render';
import type { MonthView, Segment, StatementView } from './present-statement';

/** The colours of the layout the CEO approved (v3 mockups, 26.09.2026). */
const C = {
  blue: '#1F4E78',
  grey: '#666666',
  line: '#DADDE2',
  highlight: '#FFF3B0',
  green: '#1B7F3B',
  red: '#B42318',
  greenBg: '#E8F5EC',
  redBg: '#FDECEA',
};
const TONE = { red: C.red, green: C.green, muted: C.grey } as const;

const rich = (segments: Segment[]) =>
  segments.map((s) => ({
    text: s.text,
    bold: s.bold ?? false,
    ...(s.tone ? { color: TONE[s.tone] } : {}),
  }));

const section = (title: string): Content => ({
  text: title,
  bold: true,
  fontSize: 11.5,
  color: C.blue,
  margin: [0, 9, 0, 4],
});

function answerBox(answer: StatementView['answer']): Content {
  const debt = answer.tone === 'debt';
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: answer.title, bold: true, fontSize: 15, color: debt ? C.red : C.green },
              { text: answer.subtitle, fontSize: 10, margin: [0, 2, 0, 0] },
            ],
            fillColor: debt ? C.redBg : C.greenBg,
            margin: [8, 6, 8, 6],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 6],
  };
}

function monthsTable(months: MonthView[]): Content {
  const head = (text: string, right = true): TableCell => ({
    text,
    bold: true,
    ...(right ? { alignment: 'right' as const } : {}),
  });
  const body: TableCell[][] = [
    [head('Oy', false), head('Darslar'), head('Darslar narxi'), head("To'langan"), head('Oy oxirida')],
  ];
  const lineAfter = new Set<number>();
  for (const m of months) {
    const fillColor = m.highlight ? C.highlight : undefined;
    body.push([
      { text: m.label, bold: m.isLast, fillColor },
      {
        text: [
          { text: m.lessons },
          ...(m.absent ? [{ text: ` · ${m.absent}`, color: C.grey, fontSize: 8 }] : []),
        ],
        alignment: 'right',
        fillColor,
      },
      m.cost !== null
        ? { text: m.cost, alignment: 'right', fillColor }
        : { text: m.costNote ?? '', color: C.grey, fontSize: 8, alignment: 'right', fillColor },
      { text: m.money, alignment: 'right', fillColor },
      { text: m.running, alignment: 'right', color: TONE[m.runningTone], fillColor },
    ]);
    for (const line of m.details) {
      body.push([
        { text: '', fillColor },
        { text: line, colSpan: 4, color: C.grey, fontSize: 8, fillColor },
        '',
        '',
        '',
      ]);
    }
    lineAfter.add(body.length - 1);
  }
  return {
    table: { headerRows: 1, widths: [60, 92, 112, 100, '*'], body },
    layout: {
      hLineWidth: (i) => (i === 1 ? 0.8 : lineAfter.has(i - 1) ? 0.3 : 0),
      hLineColor: (i) => (i === 1 ? C.blue : C.line),
      vLineWidth: () => 0,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    },
  };
}

function allocationsTable(rows: StatementView['allocations']): Content {
  if (rows.length === 0) return { text: "Hali to'lov qilinmagan." };
  return {
    table: {
      widths: [58, 70, 56, '*'],
      body: rows.map((r) => [
        { text: r.date },
        { text: r.what },
        { text: r.amount, bold: true, alignment: 'right' },
        { text: `→ ${r.to}` },
      ]),
    },
    layout: {
      hLineWidth: (i, node) => (i > 0 && i < node.table.body.length ? 0.3 : 0),
      hLineColor: () => C.line,
      vLineWidth: () => 0,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    },
  };
}

export function statementDocDefinition(view: StatementView): TDocumentDefinitions {
  const content: Content[] = [
    { text: view.title, bold: true, fontSize: 16, margin: [0, 0, 0, 2] },
    { text: view.studentLine },
    { text: view.asOfLine, color: C.grey, fontSize: 9, margin: [0, 0, 0, 8] },
    answerBox(view.answer),
    { text: rich(view.equation), alignment: 'center', fontSize: 10.3, margin: [0, 2, 0, 2] },
    section("Oylar bo'yicha"),
  ];
  if (view.packHint) {
    content.push({ text: view.packHint, color: C.grey, fontSize: 8.3, margin: [0, 0, 0, 3] });
  }
  content.push(monthsTable(view.months));
  if (view.sharpNote) {
    content.push({
      table: {
        widths: ['*'],
        body: [[{ text: rich(view.sharpNote), fillColor: C.highlight, fontSize: 9, margin: [5, 3, 5, 3] }]],
      },
      layout: 'noBorders',
      margin: [0, 3, 0, 0],
    });
  }
  for (const change of view.modelChanges) {
    content.push(section(change.title), { ul: change.lines, fontSize: 9.4 });
  }
  content.push(section("To'lovlaringiz qayerga ketdi"), allocationsTable(view.allocations));
  content.push({ text: view.footnote, color: C.grey, fontSize: 8.3, margin: [0, 8, 0, 0] });

  return {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 36],
    info: { title: "To'lovlar hisoboti", author: 'DaF Sprachzentrum' },
    defaultStyle: { font: 'Inter', fontSize: 9.5, lineHeight: 1.15 },
    content,
  };
}

export function renderStatementPdf(view: StatementView): Promise<Buffer> {
  return renderPdf(statementDocDefinition(view));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/statements/statement-pdf.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/statements/statement-pdf.ts server/src/statements/statement-pdf.spec.ts
git commit -m "Statements: PDF in the layout the CEO approved"
```

---

### Task 6: Loader va servis (Prisma'dan kirish ma'lumoti)

**Files:**
- Create: `server/src/statements/statement.loader.ts`
- Create: `server/src/statements/statement.service.ts`
- Test: `server/src/statements/statement.loader.spec.ts`

**Interfaces:**
- Consumes: `computeEnrollmentCoverage`, `CoveragePrismaLike` (`src/billing/lesson-coverage.helper.ts`), `tashkentDateStr`, `buildStatement`, `presentStatement`, `renderStatementPdf`.
- Produces:
  - `StatementLoader.load(studentId, companyId, asOf?)`;
  - `groupLabel(n)`;
  - `StatementService.build(studentId, companyId): Promise<StatementModel>`;
  - `StatementService.pdf(studentId, companyId): Promise<{ buffer: Buffer; model: StatementModel }>`;
  - `statementFilename(model, withId: boolean): string`.

- [ ] **Step 1: Write the failing test**

`server/src/statements/statement.loader.spec.ts`:

```ts
import { computeEnrollmentCoverage } from '../billing/lesson-coverage.helper';
import { StatementLoader, groupLabel } from './statement.loader';

jest.mock('../billing/lesson-coverage.helper', () => ({
  computeEnrollmentCoverage: jest.fn(),
}));

describe('StatementLoader', () => {
  const prisma = {
    student: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
    enrollmentMonthlyCharge: { findMany: jest.fn() },
    attendance: { findMany: jest.fn() },
  };
  const loader = new StatementLoader(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.student.findFirst.mockResolvedValue({ id: 7, firstName: 'Test', lastName: 'Student', balance: -187_500, discountPercent: 0 });
    prisma.enrollment.findMany.mockResolvedValue([{
      id: 'e1', status: 'ACTIVE', startDate: new Date('2026-09-19T00:00:00Z'), createdAt: new Date('2026-09-19T08:00:00Z'),
      statusChangedAt: null, deletedAt: null,
      group: { groupNumber: 36, branch: { name: 'Filial' }, course: { name: 'Standart', price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' } },
    }]);
    prisma.transaction.findMany.mockResolvedValue([
      { id: 'd1', type: 'LESSON_DEDUCTION', amount: -37_500, createdAt: new Date('2026-09-19T12:00:00Z'), description: 'Dars uchun yechildi',
        metadata: { mode: 'SINGLE_UNCOVERED' }, enrollmentId: 'e1', paymentId: null, reversedAt: new Date(), reversedTransactionId: null, payment: null },
      { id: 'p1', type: 'PAYMENT', amount: 100_000, createdAt: new Date('2026-09-20T20:30:00Z'), description: null,
        metadata: null, enrollmentId: null, paymentId: 'pay-1', reversedAt: null, reversedTransactionId: null, payment: { method: 'PAYME' } },
    ]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([{
      enrollmentId: 'e1', periodYear: 2026, periodMonth: 9, plannedLessons: 12, coveredDates: ['2026-09-19'], frozenOutDates: [],
      creditLessons: 0, creditAmount: 0, excusedLessons: 0,
    }]);
    prisma.attendance.findMany.mockResolvedValue([{ date: new Date('2026-09-19T00:00:00Z'), status: 'PRESENT', group: { groupNumber: 36 } }]);
    (computeEnrollmentCoverage as jest.Mock).mockResolvedValue({
      byDeduction: new Map([['d1', { consumedDates: [new Date('2026-09-19T00:00:00Z')] }]]),
      cycleByAttendanceId: new Map(),
    });
  });

  it('formats a group number the way the app does', () => {
    expect(groupLabel(36)).toBe('#036');
    expect(groupLabel(1)).toBe('#001');
  });

  it('maps rows to Tashkent days with their flags and coverage', async () => {
    const input = await loader.load(7, 1, '2026-09-26');
    expect(input.student).toEqual({ id: 7, name: 'Test Student', balance: -187_500, discountPercent: 0 });
    expect(input.enrollments[0]).toMatchObject({ group: '#036', start: '2026-09-19', end: null, deleted: false });
    expect(input.rows[0]).toMatchObject({ day: '2026-09-19', reversed: true, reversal: false, consumedDays: ['2026-09-19'] });
    // 20:30 UTC is already the 21st in Tashkent.
    expect(input.rows[1]).toMatchObject({ day: '2026-09-21', paymentMethod: 'PAYME', consumedDays: null });
    expect(input.charges[0].period).toBe('2026-09');
    expect(input.attendance).toEqual([{ day: '2026-09-19', group: '#036', status: 'PRESENT' }]);
  });

  it('refuses a student of another company', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(loader.load(7, 2)).rejects.toThrow("O'quvchi topilmadi");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/statements/statement.loader.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `statement.loader.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeEnrollmentCoverage,
  type CoveragePrismaLike,
} from '../billing/lesson-coverage.helper';
import { tashkentDateStr } from '../common/date/tashkent';
import type { AttendanceMark, StatementInput } from './statement.types';

/** The app's own group label (receipts, group names): '#036'. */
export const groupLabel = (groupNumber: number): string =>
  `#${String(groupNumber).padStart(3, '0')}`;

/** Reads what the statement needs for one student. Read-only. */
@Injectable()
export class StatementLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    studentId: number,
    companyId: number,
    asOf: string = tashkentDateStr(new Date()),
  ): Promise<StatementInput> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: { id: true, firstName: true, lastName: true, balance: true, discountPercent: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        startDate: true,
        createdAt: true,
        statusChangedAt: true,
        deletedAt: true,
        group: {
          select: {
            groupNumber: true,
            branch: { select: { name: true } },
            course: { select: { name: true, price: true, lessonPaymentCount: true, paymentModel: true } },
          },
        },
      },
    });
    const rows = await this.prisma.transaction.findMany({
      where: { studentId, type: { not: TransactionType.LESSON_CONSUMPTION } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        description: true,
        metadata: true,
        enrollmentId: true,
        paymentId: true,
        reversedAt: true,
        reversedTransactionId: true,
        payment: { select: { method: true } },
      },
    });
    const deductionEnrollments = [
      ...new Set(
        rows
          .filter((r) => r.type === TransactionType.LESSON_DEDUCTION && r.enrollmentId)
          .map((r) => r.enrollmentId as string),
      ),
    ];
    const { byDeduction } = await computeEnrollmentCoverage(
      this.prisma as unknown as CoveragePrismaLike,
      deductionEnrollments,
    );
    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: { studentId, status: 'CHARGED' },
      select: {
        enrollmentId: true,
        periodYear: true,
        periodMonth: true,
        plannedLessons: true,
        coveredDates: true,
        frozenOutDates: true,
        creditLessons: true,
        creditAmount: true,
        excusedLessons: true,
      },
    });
    const attendance = await this.prisma.attendance.findMany({
      where: { studentId, cancellationId: null },
      select: { date: true, status: true, group: { select: { groupNumber: true } } },
    });

    return {
      asOf,
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        balance: student.balance,
        discountPercent: student.discountPercent ?? 0,
      },
      enrollments: enrollments.map((e) => ({
        id: e.id,
        group: groupLabel(e.group.groupNumber),
        status: e.status,
        start: tashkentDateStr(e.startDate ?? e.createdAt),
        end: e.status !== 'ACTIVE' && e.statusChangedAt ? tashkentDateStr(e.statusChangedAt) : null,
        deleted: e.deletedAt !== null,
        course: {
          name: e.group.course.name,
          price: e.group.course.price,
          lessonPaymentCount: e.group.course.lessonPaymentCount,
          paymentModel: e.group.course.paymentModel,
        },
        branch: e.group.branch.name,
      })),
      rows: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        day: tashkentDateStr(r.createdAt),
        description: r.description,
        metadata:
          r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
            ? (r.metadata as Record<string, unknown>)
            : null,
        enrollmentId: r.enrollmentId,
        paymentId: r.paymentId,
        paymentMethod: r.payment?.method ?? null,
        reversed: r.reversedAt !== null,
        reversal: r.reversedTransactionId !== null,
        consumedDays:
          r.type === TransactionType.LESSON_DEDUCTION
            ? (byDeduction.get(r.id)?.consumedDates ?? []).map((d) => tashkentDateStr(d))
            : null,
      })),
      charges: charges.map((c) => ({
        enrollmentId: c.enrollmentId,
        period: `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}`,
        plannedLessons: c.plannedLessons,
        coveredDates: c.coveredDates,
        frozenOutDates: c.frozenOutDates,
        creditLessons: c.creditLessons,
        creditAmount: c.creditAmount,
        excusedLessons: c.excusedLessons,
      })),
      attendance: attendance.map((a) => ({
        day: tashkentDateStr(a.date),
        group: groupLabel(a.group.groupNumber),
        status: a.status as AttendanceMark,
      })),
    };
  }
}
```

- [ ] **Step 4: Implement `statement.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { buildStatement } from './build-statement';
import { presentStatement } from './present-statement';
import { renderStatementPdf } from './statement-pdf';
import { StatementLoader } from './statement.loader';
import type { StatementModel } from './statement.types';

/** 'tolovlar-hisoboti-7-26-09-2026.pdf', or without the id for the student's own copy. */
export function statementFilename(model: StatementModel, withId: boolean): string {
  const d = model.asOf;
  const date = `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
  return withId
    ? `tolovlar-hisoboti-${model.student.id}-${date}.pdf`
    : `tolovlar-hisoboti-${date}.pdf`;
}

@Injectable()
export class StatementService {
  private readonly logger = new Logger(StatementService.name);

  constructor(private readonly loader: StatementLoader) {}

  async build(studentId: number, companyId: number): Promise<StatementModel> {
    const model = buildStatement(await this.loader.load(studentId, companyId));
    if (model.equation.unexplained !== 0) {
      this.logger.error(
        `Statement for student ${studentId} is off the balance by ${model.equation.unexplained}`,
      );
    }
    return model;
  }

  /** The student's copy: always in the student's voice, whoever downloads it. */
  async pdf(studentId: number, companyId: number): Promise<{ buffer: Buffer; model: StatementModel }> {
    const model = await this.build(studentId, companyId);
    const buffer = await renderStatementPdf(presentStatement(model, 'student'));
    return { buffer, model };
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/statements`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/statements
git commit -m "Statements: load one student's ledger, charges and attendance"
```

---

### Task 7: Endpointlar, modul va route manifesti

**Files:**
- Create: `server/src/statements/statements.controller.ts`
- Create: `server/src/statements/statement-portal.controller.ts`
- Create: `server/src/statements/statements.module.ts`
- Test: `server/src/statements/statements.controller.spec.ts`
- Modify: `server/src/app.module.ts` (`imports` ga `StatementsModule`)
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `StatementService`, `statementFilename`, `presentStatement`, `assertCallerMayTouchStudent` (`src/common/auth/student-branch-scope.ts`), `RolesGuard`, `StudentCardGuard`, `Roles`, `CurrentUser`.
- Produces:
  - `GET /students/:id/statement` → `{ model: StatementModel, view: StatementView }` (admin tilida);
  - `GET /students/:id/statement.pdf` → `attachment` PDF;
  - `GET /student-portal/statement.pdf` → `attachment` PDF.

- [ ] **Step 1: Write the failing test**

`server/src/statements/statements.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { StatementsController } from './statements.controller';
import { StatementPortalController } from './statement-portal.controller';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn(),
}));

const model = {
  asOf: '2026-09-26',
  student: { id: 7, name: 'Test Student', groups: ['#036'], course: null, discountPercent: 0, branch: null },
  balance: 0,
  headline: { kind: 'zero', amount: 0, unpaid: [] },
  equation: { paid: 0, items: [], lessons: 0, prepaidAhead: 0, unexplained: 0, balance: 0 },
  packEra: null,
  months: [],
  modelChanges: [],
  allocations: [],
};

const res = () => ({ setHeader: jest.fn(), end: jest.fn() });

describe('StatementsController', () => {
  const service = { build: jest.fn().mockResolvedValue(model), pdf: jest.fn().mockResolvedValue({ buffer: Buffer.from('%PDF-1.3'), model }) };
  const controller = new StatementsController(service as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('checks the branch before building the statement', async () => {
    (assertCallerMayTouchStudent as jest.Mock).mockRejectedValueOnce(new ForbiddenException());
    await expect(controller.getStatement(7, 1, 99)).rejects.toThrow(ForbiddenException);
    expect(service.build).not.toHaveBeenCalled();
  });

  it('returns the model with the admin wording', async () => {
    const out = await controller.getStatement(7, 1, 99);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith({}, 99, 7, 1);
    expect(out.model).toBe(model);
    expect(out.view.answer.title).toBe("Qarzi yo'q.");
  });

  it('sends the PDF as a download named after the student and the day', async () => {
    const r = res();
    await controller.getStatementPdf(7, 1, 99, r as never);
    expect(r.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(r.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="tolovlar-hisoboti-7-26-09-2026.pdf"');
    expect(r.end).toHaveBeenCalled();
  });
});

describe('StatementPortalController', () => {
  it("serves the signed-in student's own statement", async () => {
    const service = { pdf: jest.fn().mockResolvedValue({ buffer: Buffer.from('%PDF-1.3'), model }) };
    const controller = new StatementPortalController(service as never);
    const r = res();
    await controller.myStatementPdf(7, 1, r as never);
    expect(service.pdf).toHaveBeenCalledWith(7, 1);
    expect(r.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="tolovlar-hisoboti-26-09-2026.pdf"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/statements/statements.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the controllers and the module**

`server/src/statements/statements.controller.ts`:

```ts
import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { presentStatement } from './present-statement';
import { StatementService, statementFilename } from './statement.service';

export function sendPdfAttachment(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

/**
 * The payment statement on the student profile's To'lovlar tab. Same roles
 * as the tab; the student's own branch is checked against the caller, like
 * every other profile read (`assertCallerMayTouchStudent`).
 */
@Controller('students')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class StatementsController {
  constructor(
    private readonly statements: StatementService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/statement')
  async getStatement(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    const model = await this.statements.build(id, companyId);
    return { model, view: presentStatement(model, 'admin') };
  }

  @Get(':id/statement.pdf')
  async getStatementPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    const { buffer, model } = await this.statements.pdf(id, companyId);
    sendPdfAttachment(res, buffer, statementFilename(model, true));
  }
}
```

`server/src/statements/statement-portal.controller.ts`:

```ts
import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard, StudentCardGuard } from '../common/guards';
import { StatementService, statementFilename } from './statement.service';
import { sendPdfAttachment } from './statements.controller';

/**
 * The student's own payment statement. `StudentCardGuard` refuses a token
 * with no `studentId` (404) before the handler runs.
 */
@Controller('student-portal')
@UseGuards(RolesGuard, StudentCardGuard)
@Roles('Student')
export class StatementPortalController {
  constructor(private readonly statements: StatementService) {}

  @Get('statement.pdf')
  async myStatementPdf(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Res() res: Response,
  ) {
    const { buffer, model } = await this.statements.pdf(studentId, companyId);
    sendPdfAttachment(res, buffer, statementFilename(model, false));
  }
}
```

`server/src/statements/statements.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StatementLoader } from './statement.loader';
import { StatementService } from './statement.service';
import { StatementsController } from './statements.controller';
import { StatementPortalController } from './statement-portal.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StatementsController, StatementPortalController],
  providers: [StatementLoader, StatementService],
  exports: [StatementService],
})
export class StatementsModule {}
```

`server/src/app.module.ts`: `imports` ro'yxatining oxiriga `StatementsModule` va fayl boshiga `import { StatementsModule } from './statements/statements.module';`.

`server/src/common/auth/branch-route-policy.ts`:
- `'GET /students/:id/balance-summary'` turgan `BRANCH_SCOPED_BY_ENTITY` blokining `routes` ro'yxatiga `'GET /students/:id/statement'` va `'GET /students/:id/statement.pdf'` qo'shing.
- Shu blokning `reason` matni oxiriga qo'shing: `' The payment statement (JSON and PDF) is one more profile read and runs the same check.'`.
- `SELF` bloklari yoniga yangi blok qo'shing:

```ts
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` behind `StudentCardGuard` — the " +
      'caller downloads their own payment statement and no id comes from the ' +
      'request.',
    routes: ['GET /student-portal/statement.pdf'],
  },
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/statements src/common/auth/branch-route-policy.spec.ts`
Expected: PASS. Manifest testi «missing» yoki «names no route» desa, xabardagi route kalitini aynan o'sha ko'rinishda manifestga yozing.

- [ ] **Step 5: Commit**

```bash
git add server/src/statements server/src/app.module.ts server/src/common/auth/branch-route-policy.ts
git commit -m "Statements: admin JSON and PDF, and the student's own PDF"
```

---

### Task 8: Prodda quruq yurish (faqat o'qish) va 8 misolni ko'z bilan solishtirish

**Files:**
- Create: `server/scripts/statement-dry-run.ts`
- Modify: `server/tsconfig.check.json` (`include` ga `scripts/statement-dry-run.ts`)

**Interfaces:**
- Consumes: `StatementLoader`, `buildStatement`, `presentStatement`, `renderStatementPdf`.
- Produces: CSV and PDFs outside the repo, used by Task 9.

- [ ] **Step 1: Write the script**

`server/scripts/statement-dry-run.ts`:

```ts
/**
 * READ-ONLY. Builds the payment statement for every student of a company and
 * reports:
 *   - how many reconcile to the balance to the som;
 *   - months that bill more lessons than they have lesson days (a lesson
 *     counted twice).
 * Writes a CSV, and PDFs for the ids given, OUTSIDE the repo (the repo is
 * public).
 *
 *   DATABASE_URL=<url> npx ts-node scripts/statement-dry-run.ts <companyId> <outDir> [pdfId,pdfId,...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { StatementLoader } from '../src/statements/statement.loader';
import { buildStatement } from '../src/statements/build-statement';
import { presentStatement } from '../src/statements/present-statement';
import { renderStatementPdf } from '../src/statements/statement-pdf';

async function main() {
  const companyId = Number(process.argv[2]);
  const outDir = process.argv[3];
  const pdfIds = new Set((process.argv[4] ?? '').split(',').filter(Boolean).map(Number));
  if (!companyId || !outDir) {
    throw new Error('usage: statement-dry-run.ts <companyId> <outDir> [pdfIds]');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const loader = new StatementLoader(prisma as never);
    const students = await prisma.student.findMany({
      where: { companyId, transactions: { some: {} } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const lines = ['studentId,balance,unexplained,doubledMonths'];
    let reconciled = 0;
    let doubled = 0;
    const queue = [...students];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const model = buildStatement(await loader.load(s.id, companyId));
        const doubledMonths = model.months
          .filter((m) => m.lessons > m.lessonDays.length && m.preSystem === null)
          .map((m) => m.key);
        if (model.equation.unexplained === 0) reconciled += 1;
        if (doubledMonths.length > 0) doubled += 1;
        lines.push(`${s.id},${model.balance},${model.equation.unexplained},${doubledMonths.join(' ')}`);
        if (pdfIds.has(s.id)) {
          const pdf = await renderStatementPdf(presentStatement(model, 'student'));
          fs.writeFileSync(path.join(outDir, `statement-${s.id}.pdf`), pdf);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    fs.writeFileSync(path.join(outDir, 'statement-dry-run.csv'), lines.join('\n') + '\n');
    console.log(`students=${students.length} reconciled=${reconciled} off=${students.length - reconciled} doubledMonths=${doubled}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
```

`server/tsconfig.check.json` `include` ro'yxatiga `"scripts/statement-dry-run.ts"` qo'shing va `npm run typecheck` ni yurgizing (Expected: xatosiz).

- [ ] **Step 2: Run against production (read-only)**

Run (from `server/`; the URL is never printed):

```bash
DBURL=$(railway variables --service caring-courage --environment production --kv 2>/dev/null | grep '^DATABASE_URL=' | cut -d= -f2-)
DATABASE_URL="$DBURL" npx ts-node scripts/statement-dry-run.ts 1 ~/daf-erp-ops/tolovlar-hisoboti/dry-run-2026-09-26 <ids>
```

Expected:
- the last line reads `students=… reconciled=… off=… doubledMonths=…`;
- the CSV and 8 PDFs are in `~/daf-erp-ops/tolovlar-hisoboti/dry-run-2026-09-26/`.
- `companyId` prodda 1 bo'lmasa, avval `select id from "Company"` bilan tekshiring.

- [ ] **Step 3: Compare the 8 PDFs with v3**

Har PDF'ni v3 maketi (`~/daf-erp-ops/oylik-otish/tolovlar-hisoboti-misollar-v3.pdf`) bilan solishtiring:
- raqamlar bir xil;
- javob qutisi, tenglama, oylar, sariq sabab va to'lovlar bo'limi o'z joyida.

Ism endi haqiqiy chiqadi, bu kutilgan. Farq topilsa, tegishli vazifaga qaytib, tuzating.

- [ ] **Step 4: Classify every `off` and `doubled` student**

CSV'dagi har `unexplained ≠ 0` va `doubledMonths ≠ ''` qator uchun sababni aniqlang. Sabablar ikki xil:
1. **Tasnif xatosi** (masalan, izoh matni tanilmagan). Kodda tuzatiladi, test qo'shiladi.
2. **Belgisiz qo'lda qaytarish** (spec'dagi «ma'lum holat»). Task 9 ro'yxatiga kiradi.

Natija `~/daf-erp-ops/tolovlar-hisoboti/dry-run-2026-09-26/sabablar.txt` ga yoziladi.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/statement-dry-run.ts server/tsconfig.check.json
git commit -m "Statements: read-only dry run over a whole company"
```

---

### Task 9: Belgisiz qo'lda qaytarishlarni belgilash (bir martalik, CEO ruxsati bilan)

Faqat Task 8 bunday yozuvlarni topsa bajariladi.

**Files:**
- Create: `server/scripts/_tag-manual-releases.ts` (gitignore: `server/scripts/_*.ts`)

- [ ] **Step 1: Write the one-off**

Task 8 da topilgan ADJUSTMENT id'lari skript ichida qattiq yoziladi. Skript faqat repoda emas, gitignore'da turadi, chunki unda prod ID'lari bor. Har yozuv uchun:
- kutilgan holat tekshiriladi (summa, sana, `metadata.kind` yo'q);
- `metadata` ga `kind: 'prepaid-release'`, `enrollmentId`, `lessons` qo'shiladi.

Pulga tegmaydi: `amount` va balans o'zgarmaydi. Har yozuvga `EntityHistory` qatori yoziladi. Standart holatda dry-run, `--apply` bo'lsa yozadi.

```ts
/**
 * ONE-OFF (gitignored). Tags manual corrections that actually returned
 * package lessons, so the payment statement folds them like any release.
 * Metadata only — no money moves. Dry-run by default; `--apply` writes.
 *   DATABASE_URL=<url> npx ts-node scripts/_tag-manual-releases.ts [--apply]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TAGS: Array<{ id: string; amount: number; enrollmentId: string; lessons: number }> = [
  // Filled in from Task 8's sabablar.txt.
];

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    for (const t of TAGS) {
      const row = await prisma.transaction.findUnique({
        where: { id: t.id },
        select: { type: true, amount: true, metadata: true, companyId: true },
      });
      const md = (row?.metadata ?? {}) as Record<string, unknown>;
      if (!row || row.type !== 'ADJUSTMENT' || row.amount !== t.amount || md.kind !== undefined) {
        console.log(`SKIP ${t.id}: not as checked`);
        continue;
      }
      console.log(`${apply ? 'TAG' : 'WOULD TAG'} ${t.id}: prepaid-release, ${t.lessons} lessons`);
      if (!apply) continue;
      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: t.id },
          data: { metadata: { ...md, kind: 'prepaid-release', enrollmentId: t.enrollmentId, lessons: t.lessons } },
        });
        await tx.entityHistory.create({
          data: {
            entityType: 'Transaction',
            entityId: t.id,
            action: 'UPDATE',
            oldValues: { kind: null },
            newValues: { kind: 'prepaid-release', sabab: "To'lovlar hisoboti: qo'lda yozilgan paket qaytarishi belgilandi" },
            companyId: row.companyId,
          },
        });
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Dry-run, show the CEO in plain words, wait for «ha»**

Run: `DATABASE_URL="$DBURL" npx ts-node scripts/_tag-manual-releases.ts`
CEO'ga har o'quvchi uchun bir jumla yetkaziladi: «Pul o'zgarmaydi, faqat hisobotda dars soni to'g'ri chiqadi».

- [ ] **Step 3: Apply and re-run the dry run**

Run: `DATABASE_URL="$DBURL" npx ts-node scripts/_tag-manual-releases.ts --apply`

Keyin Task 8, Step 2 buyrug'ini qayta yurgizing. Expected: o'sha o'quvchilar `doubledMonths` ustunida endi yo'q.

---

### Task 10: Yakuniy tekshiruv va PR

- [ ] **Step 1: Full verification**

Run (from `server/`):

```bash
npx jest
npm run typecheck
npx eslint src/statements src/billing/monthly-charge.service.ts src/billing/enrollment-billing.service.ts scripts/statement-dry-run.ts
npx nest build
```

Expected:
- hamma to'plam PASS;
- typecheck xatosiz;
- eslint'da yangi `error` yo'q;
- build muvaffaqiyatli.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/tolovlar-hisoboti
gh pr create --base main --title "Payment statement: server model, PDF and download routes" --body-file <body>
```

PR matni inglizcha. Unda: nima qo'shildi, ADR-0037, quruq yurishning umumiy natijasi (faqat sonlar, ID yo'q), test rejasi. Oxirida `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: CEO'ga holat**

Oddiy tilda qisqa hisobot:
- nima tayyor;
- saytga hali chiqmagani;
- keyingi qadam: admin tabi maketdagidek, keyin portal va bot.

Deploy faqat CEO ruxsati bilan.
