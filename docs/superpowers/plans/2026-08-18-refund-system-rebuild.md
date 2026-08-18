# Pul qaytarish tizimini qayta qurish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pul qaytarish oldindan to'langan darslarni **bekor qilib** amalga oshsin, shunda bitta pul ikki marta sanalmasin va fantom kredit yaratilmasin.

**Architecture:** «Foydalanilmagan dars» ni davomatdan taxmin qiluvchi mantiq butunlay olib tashlanadi. Yagona haqiqat manbai — `Enrollment.prepaidLessonsRemaining` ustuni va `EnrollmentBillingService` dagi mavjud narxlash mantig'i. Refund moduli o'z hisobini yuritmay, shu servisga delegatsiya qiladi.

**Tech Stack:** NestJS, Prisma 7, Jest, Next.js (client), TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-18-refund-system-rebuild-design.md`

## Global Constraints

- Barcha foydalanuvchi ko'radigan matn — **faqat lotin o'zbekchada**. Kirill yoki arab harflari mumkin emas.
- Balansga tegadigan har bir yozuv `Prisma.TransactionIsolationLevel.Serializable` tranzaksiyasi ichida bo'lishi shart.
- Yozilgan ledger qatori o'zgartirilmaydi — orqaga qaytarish faqat teskari qator yozish orqali (`reverseTransaction`).
- Jest bu yerda **tip tekshirmaydi**. Har bir vazifadan keyin `cd server && npx tsc --noEmit -p tsconfig.json 2>&1 | grep '^src/refunds\|^src/billing\|^src/transactions'` toza bo'lishi shart.
- `railway up` dan oldin `cd server && npm run build` `exit=0` berishi shart.
- Prod ma'lumotiga tegadigan skript avval `--dry-run` bilan ishlaydi.

---

### Task 1: `createAdjustment` metadata qabul qilsin

Qaytarish yozgan `ADJUSTMENT` ni keyinchalik topib bekor qilish uchun unga `refundId` yozib qo'yish kerak. Hozir `createAdjustment` da `metadata` yo'q.

**Files:**
- Modify: `server/src/transactions/transactions-write.service.ts:762-817`
- Test: `server/src/transactions/transactions-write.service.spec.ts`

**Interfaces:**
- Produces: `createAdjustment(params: { studentId, amount, description, branchId?, companyId, performedById?, metadata?: Prisma.InputJsonValue }, tx?)`

- [ ] **Step 1: Testni yoz (yiqiladi)**

```ts
it('metadata berilganda uni ADJUSTMENT qatoriga yozadi', async () => {
  await service.createAdjustment({
    studentId: 10001,
    amount: 50_000,
    description: 'test',
    companyId: 1,
    metadata: { refundId: 'ref-1', lessonsReleased: 2 },
  });

  expect(client.transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        type: 'ADJUSTMENT',
        metadata: { refundId: 'ref-1', lessonsReleased: 2 },
      }),
    }),
  );
});

it('metadata berilmasa metadata maydonini umuman yubormaydi', async () => {
  await service.createAdjustment({
    studentId: 10001,
    amount: 50_000,
    description: 'test',
    companyId: 1,
  });

  const arg = client.transaction.create.mock.calls[0][0];
  expect('metadata' in arg.data).toBe(false);
});
```

- [ ] **Step 2: Testni ishga tushir, yiqilishini ko'r**

Run: `cd server && npx jest src/transactions/transactions-write.service.spec.ts -t metadata`
Expected: FAIL — `metadata` `create` chaqiruviga tushmaydi.

- [ ] **Step 3: Minimal implementatsiya**

`params` tipiga qo'sh:

```ts
      /**
       * Ixtiyoriy audit izi. Pul qaytarish o'zi yozgan ADJUSTMENT ni keyin
       * topib bekor qilishi uchun bu yerga `{ refundId, lessonsReleased }`
       * yozadi — Transaction jadvalida refund uchun FK yo'q.
       */
      metadata?: Prisma.InputJsonValue;
```

`transaction.create` chaqiruvida `description` dan keyin:

```ts
          ...(params.metadata !== undefined && { metadata: params.metadata }),
```

- [ ] **Step 4: Testlar o'tishini tekshir**

Run: `cd server && npx jest src/transactions/transactions-write.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/transactions/transactions-write.service.ts server/src/transactions/transactions-write.service.spec.ts
git commit -m "Let an adjustment say which refund created it"
```

---

### Task 2: `releasePrepaidLessons` — N ta darsni bekor qilib pulini qaytarish

Mavjud `refundPrepaidToBalance` **hamma** prepaid darsni qaytarib, hisoblagichni nolga tushiradi. Bizga aynan N tasini kamaytiradigan variant kerak.

**Files:**
- Modify: `server/src/billing/enrollment-billing.service.ts:47-78` (`resolvePrepaidRefund` → public `prepaidRefundValue`)
- Modify: `server/src/billing/enrollment-billing.service.ts:123-177` (`refundPrepaidToBalance` delegatsiya qiladi)
- Test: `server/src/billing/enrollment-billing.service.spec.ts`

**Interfaces:**
- Consumes: `TransactionsService.createAdjustment` (Task 1 dagi `metadata` bilan)
- Produces:
  - `prepaidRefundValue(tx: Prisma.TransactionClient, enrollmentId: string, course: { price: number; lessonPaymentCount: number | null }, lessons: number): Promise<number>`
  - `releasePrepaidLessons(tx: Prisma.TransactionClient, params: { enrollmentId: string; lessons: number; reason?: string; performedById?: number; metadata?: Prisma.InputJsonValue }): Promise<{ refunded: number; lessons: number } | null>`

- [ ] **Step 1: Testlarni yoz (yiqiladi)**

```ts
describe('releasePrepaidLessons', () => {
  const enrollmentRow = {
    id: 'enroll-1',
    studentId: 10001,
    prepaidLessonsRemaining: 6,
    group: {
      branchId: 1,
      companyId: 1,
      course: { price: 400_000, lessonPaymentCount: 12 },
    },
  };

  it('so\'ralgan dars sonini AYNAN kamaytiradi, nolga tushirmaydi', async () => {
    tx.enrollment.findUnique.mockResolvedValue(enrollmentRow);

    const result = await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 2,
      performedById: 99,
    });

    expect(result).toEqual({ refunded: 66_666, lessons: 2 });
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-1' },
      data: { prepaidLessonsRemaining: { decrement: 2 } },
    });
  });

  it('qoldiqdan ko\'p dars so\'ralsa rad etadi', async () => {
    tx.enrollment.findUnique.mockResolvedValue(enrollmentRow);

    await expect(
      service.releasePrepaidLessons(tx, {
        enrollmentId: 'enroll-1',
        lessons: 7,
        performedById: 99,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
  });

  it('0 dars so\'ralsa hech narsa qilmaydi', async () => {
    tx.enrollment.findUnique.mockResolvedValue(enrollmentRow);

    const result = await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 0,
      performedById: 99,
    });

    expect(result).toBeNull();
    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });

  it('metadatani ADJUSTMENT ga uzatadi', async () => {
    tx.enrollment.findUnique.mockResolvedValue(enrollmentRow);

    await service.releasePrepaidLessons(tx, {
      enrollmentId: 'enroll-1',
      lessons: 1,
      performedById: 99,
      metadata: { refundId: 'ref-1', lessonsReleased: 1 },
    });

    expect(transactionsService.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { refundId: 'ref-1', lessonsReleased: 1 },
      }),
      tx,
    );
  });
});

describe('refundPrepaidToBalance delegatsiyasi', () => {
  it('hamma prepaid darsni bo\'shatadi va hisoblagichni nolga tushiradi', async () => {
    tx.enrollment.findUnique.mockResolvedValue({
      id: 'enroll-1',
      studentId: 10001,
      prepaidLessonsRemaining: 5,
      group: {
        branchId: 1,
        companyId: 1,
        course: { price: 400_000, lessonPaymentCount: 12 },
      },
    });

    const result = await service.refundPrepaidToBalance(tx, {
      enrollmentId: 'enroll-1',
      performedById: 99,
    });

    expect(result).toEqual({ refunded: 166_665, lessons: 5 });
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enroll-1' },
      data: { prepaidLessonsRemaining: { decrement: 5 } },
    });
  });
});
```

`BadRequestException` ni fayl boshida import qil:

```ts
import { BadRequestException } from '@nestjs/common';
```

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

Run: `cd server && npx jest src/billing/enrollment-billing.service.spec.ts`
Expected: FAIL — `service.releasePrepaidLessons is not a function`

- [ ] **Step 3: Implementatsiya**

`resolvePrepaidRefund` ni public qilib nomini o'zgartir (barcha ichki chaqiruvlarni ham yangila):

```ts
  /**
   * `lessons` ta ishlatilmagan dars uchun qancha qaytarilishi kerak.
   *
   * Batchga nisbatan narxlanadi, dars boshiga emas: `lessons × perLessonCost`
   * sikl yaxlitlash qoldig'iga kam chiqadi va chegirmasiz raqamni o'qiydi.
   * Preview ham, qaytarishning o'zi ham SHU metodni chaqiradi — ikkalasi bir
   * xil summa ko'rsatishi uchun.
   */
  async prepaidRefundValue(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    course: { price: number; lessonPaymentCount: number | null },
    lessons: number,
  ): Promise<number> {
    // ... mavjud resolvePrepaidRefund tanasi, `remaining` → `lessons`
  }
```

Yangi metod qo'sh:

```ts
  /**
   * `lessons` ta oldindan to'langan darsni bekor qilib, pulini balansga
   * o'tkazadi.
   *
   * `refundPrepaidWithOverride` dan farqi: u hisoblagichni NOLGA tushiradi
   * (muzlatishda qolgani kuyadi), bu esa aynan `lessons` ga kamaytiradi —
   * o'quvchi guruhda qolib, faqat bir qism pulini olayotgan holat uchun.
   *
   * Tashqi Serializable tranzaksiya ichida chaqirilishi SHART.
   */
  async releasePrepaidLessons(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      lessons: number;
      reason?: string;
      performedById?: number;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<{ refunded: number; lessons: number } | null> {
    if (params.lessons < 0) {
      throw new BadRequestException(
        "Bekor qilinadigan dars soni manfiy bo'lishi mumkin emas",
      );
    }
    if (params.lessons === 0) return null;

    const enrollment = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        id: true,
        studentId: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            branchId: true,
            companyId: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });
    if (!enrollment) return null;

    if (params.lessons > enrollment.prepaidLessonsRemaining) {
      throw new BadRequestException(
        `Faqat ${enrollment.prepaidLessonsRemaining} ta oldindan to'langan darsni bekor qilish mumkin`,
      );
    }

    const refundAmount = await this.prepaidRefundValue(
      tx,
      enrollment.id,
      enrollment.group.course,
      params.lessons,
    );

    if (refundAmount > 0) {
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
          ...(params.metadata !== undefined && { metadata: params.metadata }),
        },
        tx,
      );
    }

    await tx.enrollment.update({
      where: { id: params.enrollmentId },
      data: { prepaidLessonsRemaining: { decrement: params.lessons } },
    });

    return { refunded: refundAmount, lessons: params.lessons };
  }
```

`refundPrepaidToBalance` tanasini delegatsiyaga almashtir (mavjud JSDoc saqlanadi):

```ts
    const lessons = enrollment.prepaidLessonsRemaining;
    if (lessons <= 0) return null;

    return this.releasePrepaidLessons(tx, {
      enrollmentId: params.enrollmentId,
      lessons,
      reason:
        params.reason ??
        "Yozilishdan chiqishda qaytarilmagan dars uchun balans tiklash",
      performedById: params.performedById,
    });
```

- [ ] **Step 4: Testlar o'tishini tekshir**

Run: `cd server && npx jest src/billing`
Expected: PASS — mavjud `refundPrepaidToBalance` testlari ham o'tishi shart.

- [ ] **Step 5: Tiplarni tekshir**

Run: `cd server && npx tsc --noEmit -p tsconfig.json 2>&1 | grep '^src/billing' ; echo done`
Expected: hech qanday qator chiqmasin.

- [ ] **Step 6: Commit**

```bash
git add server/src/billing/enrollment-billing.service.ts server/src/billing/enrollment-billing.service.spec.ts
git commit -m "Give the billing layer a way to cancel exactly N prepaid lessons"
```

---

### Task 3: `previewRefund` prepaid hisoblagichdan o'qisin

**Files:**
- Modify: `server/src/refunds/refunds-eligibility.service.ts`
- Modify: `server/src/refunds/refunds.module.ts`
- Test: `server/src/refunds/refunds-eligibility.service.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentBillingService.prepaidRefundValue` (Task 2)
- Produces: `previewRefund` javobi:
  ```ts
  {
    enrollmentId: string; groupId: string; groupName: string; courseName: string;
    paidAmount: number;
    lastPayment: { amount: number; method: PaymentMethod; paidAt: Date } | null;
    studentBalance: number;
    lessonsAttended: number;
    prepaidLessons: number;
    prepaidValue: number;
    perLessonCost: number;
    previousRefunds: number;
    maxRefundable: number;
    suggestedAmount: number;
    warning: string | null;
  }
  ```

- [ ] **Step 1: Testlarni yoz (yiqiladi)**

Mavjud `ledger filter regression` describe blokini butunlay o'chir — u endi mavjud bo'lmagan mantiqni tekshiradi. O'rniga:

```ts
describe('prepaid asosidagi limit', () => {
  it("maxRefundable = balans + prepaid qiymati", async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 17 });
    prisma.enrollment.findMany.mockResolvedValue([
      { ...enrollmentRow, prepaidLessonsRemaining: 6 },
    ]);
    billing.prepaidRefundValue.mockResolvedValue(199_998);

    const result = await service.previewRefund(10001, 1);

    expect(result.prepaidLessons).toBe(6);
    expect(result.prepaidValue).toBe(199_998);
    expect(result.maxRefundable).toBe(200_015);
  });

  it('ABSENT darslar limitni oshirmaydi', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 0 });
    prisma.enrollment.findMany.mockResolvedValue([
      { ...enrollmentRow, prepaidLessonsRemaining: 0 },
    ]);
    billing.prepaidRefundValue.mockResolvedValue(0);
    prisma.attendance.count.mockResolvedValue(5);

    const result = await service.previewRefund(10001, 1);

    expect(result.maxRefundable).toBe(0);
  });

  it('manfiy balans prepaid qiymatidan ayiriladi', async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: -50_000 });
    prisma.enrollment.findMany.mockResolvedValue([
      { ...enrollmentRow, prepaidLessonsRemaining: 3 },
    ]);
    billing.prepaidRefundValue.mockResolvedValue(99_999);

    const result = await service.previewRefund(10001, 1);

    expect(result.maxRefundable).toBe(49_999);
  });

  it("prepaid darsi yo'q bo'lsa ogohlantiradi", async () => {
    prisma.student.findFirst.mockResolvedValue({ id: 10001, balance: 10_000 });
    prisma.enrollment.findMany.mockResolvedValue([
      { ...enrollmentRow, prepaidLessonsRemaining: 0 },
    ]);
    billing.prepaidRefundValue.mockResolvedValue(0);

    const result = await service.previewRefund(10001, 1);

    expect(result.warning).toMatch(/balansdan/i);
  });
});
```

`beforeEach` ga mock qo'sh va `enrollmentRow` ga maydon qo'sh:

```ts
  const enrollmentRow = {
    id: 'enr-1',
    groupId: 'group-1',
    status: 'ACTIVE',
    prepaidLessonsRemaining: 0,
    group: {
      name: 'TOS-101',
      course: { name: 'Standart', price: 400_000, lessonPaymentCount: 12 },
    },
  };

  const billing = { prepaidRefundValue: jest.fn().mockResolvedValue(0) };
  // providers: [..., { provide: EnrollmentBillingService, useValue: billing }]
```

Mavjud `warnings` describe blokidagi 50% testlarini o'chir — ogohlantirish o'zgardi.

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

Run: `cd server && npx jest src/refunds/refunds-eligibility.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Servisni qayta yoz**

`RefundsEligibilityService` konstruktoriga qo'sh:

```ts
  constructor(
    private prisma: PrismaService,
    private enrollmentBilling: EnrollmentBillingService,
  ) {}
```

`previewRefund` ichida `ledgerAgg`/`ledgerConsumed`/`attendanceConsumed`/`overDeducted` bloklarini butunlay o'chir va o'rniga:

```ts
    // Nima qaytarish mumkinligining YAGONA manbai: prepaid hisoblagichi.
    // Ilgari bu davomatdan taxmin qilinardi (`yechilgan − PRESENT/LATE`), va
    // o'sha ayirma har doim ABSENT + prepaid ga teng chiqib, ikkalasini ham
    // qaytarishga ruxsat berardi. ABSENT dars to'lanadi, prepaid esa allaqachon
    // kelasi darsga band — ikkovi ham «ortiqcha yechilgan pul» emas.
    const prepaidLessons = enrollment.prepaidLessonsRemaining;
    const prepaidValue = await this.enrollmentBilling.prepaidRefundValue(
      this.prisma,
      enrollment.id,
      enrollment.group.course,
      prepaidLessons,
    );

    const maxRefundable = Math.max(0, student.balance + prepaidValue);
    const suggestedAmount = maxRefundable;

    const warning =
      prepaidLessons === 0 && student.balance > 0
        ? "Oldindan to'langan darsi yo'q — faqat balansdagi puldan qaytariladi"
        : null;
```

Qaytariladigan obyektni yangi shaklga keltir: `ledgerConsumed`, `attendanceConsumed`, `overDeducted`, `totalLessons` o'rniga `lessonsAttended`, `prepaidLessons`, `prepaidValue`.

`resolveEnrollment` ning ikkala `select` iga `status: true` va `prepaidLessonsRemaining: true` qo'sh.

`refunds.module.ts` ga `BillingModule` ni import qil:

```ts
import { BillingModule } from '../billing/billing.module';
// imports: [TransactionsModule, BillingModule],
```

- [ ] **Step 4: Testlar o'tishini tekshir**

Run: `cd server && npx jest src/refunds`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/refunds/refunds-eligibility.service.ts server/src/refunds/refunds-eligibility.service.spec.ts server/src/refunds/refunds.module.ts
git commit -m "Read what a refund may return from the prepaid counter"
```

---

### Task 4: `quickRefund` darslarni bekor qilib qaytarsin

**Files:**
- Modify: `server/src/refunds/refunds-create.service.ts:137-263`
- Create: `server/src/refunds/refunds-create.service.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentBillingService.prepaidRefundValue`, `EnrollmentBillingService.releasePrepaidLessons` (Task 2)

- [ ] **Step 1: Testlarni yoz (yiqiladi)**

```ts
describe('RefundsCreateService.quickRefund', () => {
  // ... standart TestingModule quruvchisi, mocklar:
  // prisma, transactionsService, entityHistoryService, enrollmentBilling

  it('balans yetsa hech qanday darsni bekor qilmaydi', async () => {
    student.balance = 500_000;
    enrollment.prepaidLessonsRemaining = 6;
    enrollmentBilling.prepaidRefundValue.mockResolvedValue(199_998);

    await service.quickRefund(
      { studentId: 10001, enrollmentId: 'enr-1', amount: 100_000, refundMethod: 'CASH' },
      99, 1,
    );

    expect(enrollmentBilling.releasePrepaidLessons).not.toHaveBeenCalled();
    expect(transactionsService.recordRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100_000 }), expect.anything(),
    );
  });

  it('balans yetmasa yetarli sondagi darsni bekor qiladi', async () => {
    student.balance = 17;
    enrollment.prepaidLessonsRemaining = 6;
    // 1 dars = 33 333, 2 dars = 66 666, 3 dars = 99 999, 4 dars = 133 332
    enrollmentBilling.prepaidRefundValue.mockImplementation(
      (_tx, _id, _course, lessons) => Promise.resolve(lessons * 33_333),
    );

    await service.quickRefund(
      { studentId: 10001, enrollmentId: 'enr-1', amount: 100_000, refundMethod: 'CASH' },
      99, 1,
    );

    // 100 000 − 17 = 99 983 kerak → 3 dars (99 999) yetmaydi, 4 dars kerak emas:
    // 99 999 >= 99 983, demak 3 dars.
    expect(enrollmentBilling.releasePrepaidLessons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enrollmentId: 'enr-1', lessons: 3 }),
    );
  });

  it('limitdan oshsa rad etadi va hech narsa yozmaydi', async () => {
    student.balance = 17;
    enrollment.prepaidLessonsRemaining = 6;
    enrollmentBilling.prepaidRefundValue.mockResolvedValue(199_998);

    await expect(
      service.quickRefund(
        { studentId: 10001, enrollmentId: 'enr-1', amount: 500_000, refundMethod: 'CASH' },
        99, 1,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(enrollmentBilling.releasePrepaidLessons).not.toHaveBeenCalled();
    expect(transactionsService.recordRefund).not.toHaveBeenCalled();
  });

  it('ABSENT darslar qaytarish limitini oshirmaydi', async () => {
    student.balance = 0;
    enrollment.prepaidLessonsRemaining = 0;
    enrollmentBilling.prepaidRefundValue.mockResolvedValue(0);

    await expect(
      service.quickRefund(
        { studentId: 10001, enrollmentId: 'enr-1', amount: 33_333, refundMethod: 'CASH' },
        99, 1,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('bekor qilingan darslar ADJUSTMENT iga refundId yoziladi', async () => {
    student.balance = 0;
    enrollment.prepaidLessonsRemaining = 4;
    enrollmentBilling.prepaidRefundValue.mockImplementation(
      (_tx, _id, _course, lessons) => Promise.resolve(lessons * 33_333),
    );

    await service.quickRefund(
      { studentId: 10001, enrollmentId: 'enr-1', amount: 33_333, refundMethod: 'CASH' },
      99, 1,
    );

    expect(enrollmentBilling.releasePrepaidLessons).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lessons: 1,
        metadata: expect.objectContaining({ lessonsReleased: 1 }),
      }),
    );
  });
});
```

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

Run: `cd server && npx jest src/refunds/refunds-create.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: `quickRefund` ni qayta yoz**

Konstruktorga `private enrollmentBilling: EnrollmentBillingService` qo'sh.

`lessonsCompleted`/`attendanceConsumed`/`ledgerConsumed`/`overDeducted` hisoblarini o'chir. O'rniga:

```ts
    const prepaidLessons = enrollment.prepaidLessonsRemaining;
    const prepaidValue = await this.enrollmentBilling.prepaidRefundValue(
      this.prisma,
      enrollment.id,
      enrollment.group.course,
      prepaidLessons,
    );
    const maxRefundable = Math.max(0, student.balance + prepaidValue);

    if (dto.amount > maxRefundable) {
      throw new BadRequestException(
        `Qaytarish summasi maksimal summadan oshib ketdi (maksimum ${maxRefundable} so'm)`,
      );
    }

    // Balansdagi bo'sh pul yetmasa, yetishmagan qismni qoplaydigan eng KAM
    // sonli darsni bekor qilamiz. Dars donaligi tufayli kredit yetishmovchilikdan
    // sal ko'p chiqishi mumkin — o'sha qoldiq balansda qoladi va haqiqiy pul,
    // chunki dars rostdan bekor qilindi.
    const shortfall = dto.amount - student.balance;
    let lessonsToRelease = 0;
    if (shortfall > 0) {
      for (let n = 1; n <= prepaidLessons; n++) {
        const value = await this.enrollmentBilling.prepaidRefundValue(
          this.prisma,
          enrollment.id,
          enrollment.group.course,
          n,
        );
        if (value >= shortfall) {
          lessonsToRelease = n;
          break;
        }
      }
      if (lessonsToRelease === 0) lessonsToRelease = prepaidLessons;
    }
```

`deductions` obyektini yangila:

```ts
    const deductions = {
      balanceBeforeRefund: student.balance,
      prepaidLessonsBefore: prepaidLessons,
      prepaidValueBefore: prepaidValue,
      lessonsReleased: lessonsToRelease,
      previousRefunds: previousRefundsTotal,
      tax: 0,
      bankFee: 0,
    };
```

Tranzaksiya ichida `if (overDeducted > 0) createAdjustment(...)` blokini almashtir:

```ts
        if (lessonsToRelease > 0) {
          await this.enrollmentBilling.releasePrepaidLessons(tx, {
            enrollmentId: enrollment.id,
            lessons: lessonsToRelease,
            reason: `Pul qaytarish: ${lessonsToRelease} ta oldindan to'langan dars bekor qilindi`,
            performedById: userId,
            metadata: { refundId: refundRow.id, lessonsReleased: lessonsToRelease },
          });
        }
```

`Refund.lessonsCompleted` maydoniga endi bekor qilingan dars soni emas, o'quvchining shu guruhdagi davomati yoziladi — `countAttendance` ni **saqlab qol**, faqat u endi hech qanday hisobga ta'sir qilmaydi, faqat yozuv uchun.

`balanceAfter` hisobini yangila:

```ts
    const balanceAfter = student.balance + releasedAmount - dto.amount;
```

bunda `releasedAmount` tranzaksiyadan qaytarilgan `{ refunded }` qiymati.

- [ ] **Step 4: Testlar o'tishini tekshir**

Run: `cd server && npx jest src/refunds`
Expected: PASS

- [ ] **Step 5: Tiplarni tekshir**

Run: `cd server && npx tsc --noEmit -p tsconfig.json 2>&1 | grep '^src/refunds' ; echo done`
Expected: hech qanday qator chiqmasin.

- [ ] **Step 6: Commit**

```bash
git add server/src/refunds/refunds-create.service.ts server/src/refunds/refunds-create.service.spec.ts
git commit -m "Pay a refund by cancelling the lessons it is taken from"
```

---

### Task 5: `reverse()` bekor qilingan darslarni ham tiklasin

**Files:**
- Modify: `server/src/refunds/refunds-process.service.ts:165-255`
- Test: `server/src/refunds/refunds-process.service.spec.ts`

- [ ] **Step 1: Testlarni yoz (yiqiladi)**

```ts
describe('reverse — bekor qilingan darslarni tiklash', () => {
  it('juft ADJUSTMENT ni ham bekor qiladi va prepaid hisoblagichini tiklaydi', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })       // REFUND qatori
      .mockResolvedValueOnce({                            // juft ADJUSTMENT
        id: 'tx-adj',
        metadata: { refundId: 'ref-1', lessonsReleased: 3 },
      });

    await service.reverse('ref-1', { performedById: 99, companyId: 1 });

    expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
      'tx-adj', expect.anything(), expect.anything(),
    );
    expect(prisma.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { prepaidLessonsRemaining: { increment: 3 } },
      }),
    );
  });

  it("juft ADJUSTMENT bo'lmasa faqat REFUND ni bekor qiladi", async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce(null);

    await service.reverse('ref-1', { performedById: 99, companyId: 1 });

    expect(transactionsService.reverseTransaction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

Run: `cd server && npx jest src/refunds/refunds-process.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implementatsiya**

`reverse()` da `refund` select'iga `enrollmentId: true` qo'sh. REFUND qatorini topgandan keyin:

```ts
    // Qaytarish darslarni bekor qilib to'langan bo'lishi mumkin. U holda
    // ADJUSTMENT ham bekor qilinib, prepaid hisoblagichi tiklanishi kerak —
    // aks holda pul qaytdi, lekin darslar bekorligicha qolib ketardi.
    const releaseEntry = await this.prisma.transaction.findFirst({
      where: {
        studentId: refund.studentId,
        type: 'ADJUSTMENT',
        reversedTransactionId: null,
        reversedAt: null,
        metadata: { path: ['refundId'], equals: id },
      },
      select: { id: true, metadata: true },
    });
```

Tranzaksiya ichida, `reverseTransaction(ledgerEntry.id, ...)` dan keyin:

```ts
        if (releaseEntry) {
          await this.transactionsService.reverseTransaction(
            releaseEntry.id,
            {
              performedById: params.performedById,
              reason: params.reason ?? 'Refund bekor qilindi',
            },
            tx,
          );

          const meta = releaseEntry.metadata as
            | { lessonsReleased?: number }
            | null;
          const lessons = Number(meta?.lessonsReleased ?? 0);
          if (lessons > 0 && refund.enrollmentId) {
            await tx.enrollment.update({
              where: { id: refund.enrollmentId },
              data: { prepaidLessonsRemaining: { increment: lessons } },
            });
          }
        }
```

- [ ] **Step 4: Testlar o'tishini tekshir**

Run: `cd server && npx jest src/refunds`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/refunds/refunds-process.service.ts server/src/refunds/refunds-process.service.spec.ts
git commit -m "Undo the cancelled lessons when a refund is undone"
```

---

### Task 6: Preview/create qoidalarini birxillashtirish va takroriy so'rovni bloklash

**Files:**
- Modify: `server/src/refunds/refunds-eligibility.service.ts` (`resolveEnrollment`)
- Modify: `server/src/refunds/refunds-create.service.ts` (`quickRefund`)
- Test: `server/src/refunds/refunds-eligibility.service.spec.ts`, `server/src/refunds/refunds-create.service.spec.ts`

- [ ] **Step 1: Testlarni yoz (yiqiladi)**

```ts
// eligibility spec
it('aniq enrollmentId berilsa ham faqat ACTIVE guruhni qabul qiladi', async () => {
  prisma.enrollment.findFirst.mockResolvedValue({
    ...enrollmentRow,
    status: 'DROPPED',
  });

  await expect(service.previewRefund(10001, 1, 'enr-1')).rejects.toThrow(
    BadRequestException,
  );
});

// create spec
it('bir daqiqa ichida bir xil summali takroriy qaytarishni rad etadi', async () => {
  prisma.refund.findFirst.mockResolvedValue({ id: 'ref-oldingi' });

  await expect(
    service.quickRefund(
      { studentId: 10001, enrollmentId: 'enr-1', amount: 100_000, refundMethod: 'CASH' },
      99, 1,
    ),
  ).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

Run: `cd server && npx jest src/refunds`
Expected: FAIL

- [ ] **Step 3: Implementatsiya**

`resolveEnrollment` da aniq `enrollmentId` shoxiga qo'sh (`loadEnrollment` dagi tekshiruvning aynan o'zi):

```ts
      if (enrollment.status !== EnrollmentStatus.ACTIVE) {
        throw new BadRequestException(
          'Faqat faol guruhdan pul qaytarish mumkin',
        );
      }
```

`quickRefund` da, limit tekshiruvidan oldin:

```ts
    // Ikki marta bosish serverda ikkita qaytarish yozardi — ekрandagi tugma
    // qulfi yagona himoya edi. Bir daqiqalik oyna qo'sh so'rovni to'xtatadi,
    // ammo bir necha daqiqadan keyingi qonuniy ikkinchi qaytarishga xalaqit
    // bermaydi.
    const recentDuplicate = await this.prisma.refund.findFirst({
      where: {
        studentId: dto.studentId,
        enrollmentId: enrollment.id,
        approvedAmount: dto.amount,
        status: RefundStatus.COMPLETED,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
    });
    if (recentDuplicate) {
      throw new BadRequestException(
        "Shu summadagi qaytarish hozirgina yozildi — takror yuborilmadi",
      );
    }
```

- [ ] **Step 4: Testlar o'tishini tekshir**

Run: `cd server && npx jest src/refunds`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/refunds/
git commit -m "Refuse in the dialog what the refund itself would refuse"
```

---

### Task 7: O'lik `create()` oqimini olib tashlash

`POST /refunds` hech qaysi ekranga ulanmagan, `paidAmount` ni o'quvchi darajasida, `consumedAmount` ni enrollment darajasida o'qiydi va ko'p guruhli o'quvchida ortiqcha qaytarish beradi.

**Files:**
- Modify: `server/src/refunds/refunds-create.service.ts` (`create` va faqat unga kerak bo'lgan `sumPayments` metodini o'chir)
- Modify: `server/src/refunds/refunds.service.ts`, `server/src/refunds/refunds.controller.ts`
- Delete: `server/src/refunds/dto/create-refund.dto.ts`

- [ ] **Step 1: Chaqiruvchilar yo'qligini tasdiqla**

Run: `cd /Users/a1111/Desktop/daf-erp-system && grep -rn "CreateRefundDto\|refundsService.create\b" server/src client/src | grep -v "\.spec\.ts"`
Expected: faqat o'chiriladigan fayllarning o'zi chiqsin.

- [ ] **Step 2: O'chir**

`RefundsController` dan `@Post()` `create` metodini, `RefundsService.create` ni, `RefundsCreateService.create` ni va `sumPayments` ni o'chir. `CreateRefundDto` faylini o'chir va importlarini tozala.

- [ ] **Step 3: Testlar va tiplar**

Run: `cd server && npx jest src/refunds && npx tsc --noEmit -p tsconfig.json 2>&1 | grep '^src/refunds' ; echo done`
Expected: testlar PASS, tip xatosi yo'q.

- [ ] **Step 4: Commit**

```bash
git add -A server/src/refunds/
git commit -m "Delete the refund path nothing calls"
```

---

### Task 8: Dialogni yangi ma'lumotga moslash

**Files:**
- Modify: `client/src/components/payments/refund-dialog.tsx`

- [ ] **Step 1: `RefundPreview` interfeysini yangila**

`ledgerConsumed`, `attendanceConsumed`, `overDeducted`, `totalLessons` o'rniga:

```ts
  lessonsAttended: number;
  prepaidLessons: number;
  prepaidValue: number;
```

- [ ] **Step 2: Ko'rsatiladigan qatorlarni yangila**

«O'tilgan darslar» qatorini `lessonsAttended` ga o'tkaz (foizsiz, chunki maxraj yo'q). «Foydalanilmagan darslar» qatorini almashtir:

```tsx
                {preview.prepaidLessons > 0 && (
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">
                      Oldindan to&apos;langan darslar:
                    </span>
                    <span className="text-right">
                      <span className="block font-medium">
                        {preview.prepaidLessons} dars &middot;{" "}
                        {formatPrice(preview.prepaidValue)} so&apos;m
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Kerak bo&apos;lsa bekor qilinadi
                      </span>
                    </span>
                  </div>
                )}
```

- [ ] **Step 3: Ogohlantirish ostiga izoh qo'sh**

Summa maydoni ostiga, `rawAmount > preview.studentBalance` bo'lganda:

```tsx
                {rawAmount > preview.studentBalance && !overMax && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Balansdagi pul yetmaydi — yetishmagan qismi oldindan
                    to&apos;langan darslarni bekor qilish hisobidan qaytariladi
                  </p>
                )}
```

- [ ] **Step 4: Tiplar va lint**

Run: `cd client && npx tsc --noEmit -p tsconfig.json && npx eslint src/components/payments/refund-dialog.tsx`
Expected: ikkalasi ham exit 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/payments/refund-dialog.tsx
git commit -m "Say in the dialog which lessons a refund will cancel"
```

---

### Task 9: #10393 ni tuzatish va bazani qayta audit qilish

**Files:**
- Create: `server/scripts/fix-refund-phantom-credit.ts`

- [ ] **Step 1: Skriptni yoz**

Skript `--dry-run` (standart) va `--apply` rejimlarida ishlaydi. Har bir COMPLETED refund uchun `metadata.refundId` yoki eski `description = 'Refund: foydalanilmagan darslar balansga qaytarildi'` bo'yicha juft `ADJUSTMENT` ni topadi, bekor qilinmaganlarini ro'yxatlaydi va `--apply` bilan `reverseTransaction` orqali bekor qiladi. `prepaidLessonsRemaining` ga **tegmaydi** — eski xato yozuvlar darslarni bekor qilmagan edi, shuning uchun tiklash ham kerak emas.

- [ ] **Step 2: Dry-run**

Run: `cd server && railway run npx ts-node --transpile-only scripts/fix-refund-phantom-credit.ts`
Expected: bitta nomzod — #10393, 266 664 so'm. (#10655 allaqachon bekor qilingan, ro'yxatga tushmasligi kerak.)

- [ ] **Step 3: Natijani CEO ga ko'rsat va tasdiq ol**

Bu prod balansiga tegadi — tasdiqsiz `--apply` ishlatilmaydi.

- [ ] **Step 4: Qo'lla**

Run: `cd server && railway run npx ts-node --transpile-only scripts/fix-refund-phantom-credit.ts --apply`

- [ ] **Step 5: Tekshir**

Run: `cd server && railway run npx ts-node --transpile-only scripts/check-student.ts 10393`
Expected: balans −99 983, pozitsiya 100 015.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/fix-refund-phantom-credit.ts
git commit -m "Add a script that unwinds the phantom refund credits"
```

---

## Yakuniy tekshiruv

- [ ] `cd server && npm run build` → `exit=0`
- [ ] `cd server && npx jest src/refunds src/billing src/transactions` → hammasi PASS
- [ ] `cd client && npx tsc --noEmit -p tsconfig.json` → `exit=0`
- [ ] PR ochilib CI ikkala job'da yashil
- [ ] Merge, keyin Vercel + Railway deploy (backend GitHub'ga ulanmagan — `railway up` qo'lda)
- [ ] Deploy'dan keyin: `git diff origin/main -- server/src client/src` bo'sh
