# Avansni tahrirlash va o'chirish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ish haqi sahifasidagi ikkala avans ro'yxatiga tahrirlash/o'chirish
tugmalarini qo'shish, va oylikka allaqachon hisoblangan avansni serverda
qulflash.

**Architecture:** Avans — `TEACHER_ADVANCE` toifasidagi `Expense`. Mavjud
`PATCH /expenses/:id` va `DELETE /expenses/:id` ishlatiladi (daftar tuzatmasi
va kassa qaytarishi u yerda allaqachon yozilgan), ularga avansga xos qorovullar
qo'shiladi. Ikkala ro'yxat endpoint'i har bir avansning oylikka hisoblangan
yoki hisoblanmaganini qaytaradi; UI shu bo'yicha tugmani o'chiradi. Klientda
uchta umumiy bo'lak: `EditableAdvance` turi + qator tugmalari, o'chirish
tasdig'i, va ikki rejimli avans oynasi.

**Tech Stack:** NestJS + Prisma (server, Jest), Next.js App Router + React
Query + shadcn/ui (klient, Vitest — faqat hook/lib uchun, komponent testi yo'q).

**Spec:** `docs/superpowers/specs/2026-09-19-avans-tahrirlash-design.md`

## Global Constraints

- **Til:** barcha foydalanuvchiga ko'rinadigan matn — lotin alifbosidagi
  o'zbekcha. Kirill yoki arab yozuvi aralashtirilmaydi.
- **Worktree:** ish `.worktrees/avans-tahrirlash` ichida, tarmoq
  `feat/avans-tahrirlash`. Asosiy checkout'da commit qilinmaydi.
- **Commit izohi** oxirida: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Xodim o'zgarmaydi.** Hech bir yo'l avansning `relatedUserId` sini
  o'zgartirishga ruxsat bermaydi.
- **Oylikka hisoblangan avans** (`settledBySalaryPaymentId !== null`) hech
  qanday yo'l bilan tahrirlanmaydi va o'chirilmaydi.
- **Yangi endpoint yozilmaydi.** Faqat `PATCH /expenses/:id` va
  `DELETE /expenses/:id`.
- **Yangi migratsiya yo'q.** Sxema o'zgarmaydi.
- Server testlari: `cd server && npx jest <path>`. Klient tekshiruvi:
  `cd client && npm run typecheck && npm run lint`.

---

## File Structure

| Fayl | Mas'uliyati | Holat |
|---|---|---|
| `server/src/expenses/expenses.service.ts` | Avans qorovullari (`assertAdvanceUnsettled`, `assertAdvanceRecipient`) | o'zgaradi |
| `server/src/salary/salary-advance-calendar.service.ts` | Kalendar qatorlariga `settled*` maydonlari | o'zgaradi |
| `server/src/salary/salary-monthly.service.ts` | `getAdvancesForUser` ga `settled*` maydonlari | o'zgaradi |
| `server/src/salary/salary-breakdown.service.ts` | O'chirilgan avans varaqaga tushmasin | o'zgaradi |
| `client/src/components/payments/advance-row-actions.tsx` | `EditableAdvance` turi + qator tugmalari + sabab matni | **yangi** |
| `client/src/components/payments/salary-delete-advance-dialog.tsx` | O'chirish tasdig'i + `DELETE` chaqiruvi | **yangi** |
| `client/src/components/payments/salary-advance-dialog.tsx` | Qo'shish/tahrirlash oynasi (ikki rejim) | `salary-add-advance-dialog.tsx` dan nomi o'zgaradi |
| `client/src/components/payments/salary-advance-day-panel.tsx` | Kun panelida tugmalar | o'zgaradi |
| `client/src/components/payments/salary-advances-tab.tsx` | Kun paneli holati va yangilanish | o'zgaradi |
| `client/src/components/payments/salary-advance-breakdown-drawer.tsx` | Drawer'da tugmalar + o'z holati | o'zgaradi |
| `client/src/components/payments/salary-monthly-view.tsx` | Drawer'ga `canPay` va `onChanged` | o'zgaradi |

Nega uchta umumiy klient bo'lagi: ikkala ro'yxat bir xil tugmalarni, bir xil
o'chiq holat sababini va bir xil o'chirish matnini ko'rsatadi. Nusxalash
muqarrar ravishda ikkita turli xil matnga olib kelardi.

---

### Task 1: Server — hisoblangan avansni qulflash

**Files:**
- Modify: `server/src/expenses/expenses.service.ts`
- Test: `server/src/expenses/expenses.service.spec.ts`

**Interfaces:**
- Consumes: hech narsa (birinchi task).
- Produces: `PATCH /expenses/:id` va `DELETE /expenses/:id` endi hisoblangan
  avansda `409 Conflict`, avansning toifasi/xodimi o'zgartirilsa
  `400 Bad Request` qaytaradi. Klient shu xatolarni `getErrorMessage` orqali
  ko'rsatadi.

- [ ] **Step 1: Write the failing tests**

`server/src/expenses/expenses.service.spec.ts` — faylning eng yuqorisidagi
importga `ConflictException` qo'shing:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
```

Keyin `describe('remove', ...)` blokidan KEYIN, tashqi `describe` ning yopuvchi
`});` idan OLDIN quyidagini qo'shing:

```ts
  /**
   * Avans (TEACHER_ADVANCE) oddiy xarajatdan ikki narsa bilan farq qiladi:
   * u xodimga bog'langan va u keyingi oylikdan ushlab qolinadi. Ushlab
   * qolingandan keyin uning summasini o'zgartirish yoki o'chirish
   * SalaryPayment'ni eski raqam bo'yicha kamaytirilgan holda qoldiradi —
   * oylik varaqasi bilan haqiqat farq qila boshlaydi.
   */
  describe('avans qorovullari', () => {
    const openAdvance = {
      id: 'adv-open',
      category: ExpenseCategory.TEACHER_ADVANCE,
      amount: 500_000,
      branchId: 1,
      companyId: COMPANY_ID,
      deletedAt: null,
      relatedUserId: 10005,
      settledBySalaryPaymentId: null,
    };

    const settledAdvance = {
      ...openAdvance,
      id: 'adv-settled',
      settledBySalaryPaymentId: 'sp-1',
    };

    it('oylikka hisoblangan avansni tahrirlashni rad etadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(settledAdvance);

      await expect(
        service.update('adv-settled', { amount: 600_000 } as any, 42, COMPANY_ID),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("oylikka hisoblangan avansni o'chirishni rad etadi", async () => {
      prisma.expense.findFirst.mockResolvedValue(settledAdvance);

      await expect(
        service.remove('adv-settled', 42, COMPANY_ID),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hisoblanmagan avans summasini tuzatadi va daftarni qayta yozadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);
      prisma.transaction.findFirst.mockResolvedValue({ id: 'tx-7' });
      tx.expense.update.mockResolvedValue({
        ...openAdvance,
        amount: 600_000,
        description: 'Avans',
        paymentMethod: ExpensePaymentMethod.CASH,
      });

      await service.update('adv-open', { amount: 600_000 } as any, 42, COMPANY_ID);

      expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
        'tx-7',
        expect.objectContaining({ performedById: 42 }),
        tx,
      );
      expect(transactionsService.recordExpense).toHaveBeenCalledWith(
        expect.objectContaining({ expenseId: 'adv-open', amount: 600_000 }),
        tx,
      );
    });

    it('faqat sana tuzatilsa daftarga tegmaydi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);
      tx.expense.update.mockResolvedValue({ ...openAdvance });

      await service.update(
        'adv-open',
        { date: '2026-09-15' } as any,
        42,
        COMPANY_ID,
      );

      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
      expect(transactionsService.recordExpense).not.toHaveBeenCalled();
    });

    it('avansni boshqa toifaga aylantirishni rad etadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);

      await expect(
        service.update(
          'adv-open',
          { category: ExpenseCategory.RENT } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('avansning xodimini almashtirishni rad etadi', async () => {
      prisma.expense.findFirst.mockResolvedValue(openAdvance);

      await expect(
        service.update('adv-open', { relatedUserId: 10006 } as any, 42, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("avansdan xodim biriktirmasini uzishni rad etadi (relatedUserId: null)", async () => {
      // `expense-form-dialog.tsx` har saqlashda `relatedUserId: null` yuboradi.
      // U oyna avansga ochilmaydi, lekin ochilib qolsa jimgina emas, baland
      // ovoz bilan to'xtasin.
      prisma.expense.findFirst.mockResolvedValue(openAdvance);

      await expect(
        service.update('adv-open', { relatedUserId: null } as any, 42, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('oddiy xarajatni avansga aylantirishda xodim talab qiladi', async () => {
      prisma.expense.findFirst.mockResolvedValue({
        id: 'exp-plain',
        category: ExpenseCategory.RENT,
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        relatedUserId: null,
        settledBySalaryPaymentId: null,
      });

      await expect(
        service.update(
          'exp-plain',
          { category: ExpenseCategory.TEACHER_ADVANCE } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("avans bo'lmagan xarajatga qorovul tegmaydi", async () => {
      // `settledBySalaryPaymentId` faqat avansda ma'noga ega — boshqa toifa
      // uchun eski xatti-harakat o'zgarmasligi kerak.
      prisma.expense.findFirst.mockResolvedValue({
        id: 'exp-plain-2',
        category: ExpenseCategory.RENT,
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        relatedUserId: null,
        settledBySalaryPaymentId: 'sp-1',
      });
      prisma.transaction.findFirst.mockResolvedValue(null);
      tx.expense.update.mockResolvedValue({
        id: 'exp-plain-2',
        amount: 200,
        branchId: 1,
        companyId: COMPANY_ID,
        relatedUserId: null,
        description: 'Ijara',
        paymentMethod: ExpensePaymentMethod.CASH,
      });

      await expect(
        service.update('exp-plain-2', { amount: 200 } as any, 42, COMPANY_ID),
      ).resolves.toBeDefined();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/expenses/expenses.service.spec.ts -t "avans qorovullari"`

Expected: FAIL. Birinchi ikkita test `ConflictException` kutadi, lekin kod
hech qanday istisno tashlamaydi.

- [ ] **Step 3: Implement the guards**

`server/src/expenses/expenses.service.ts`:

3a. Importga `ConflictException` qo'shing:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```

3b. `assertBranchWritable` metodidan KEYIN ikkita yangi xususiy metod qo'shing:

```ts
  /**
   * TEACHER_ADVANCE oluvchi xodimni nomlashi shart, va u xodim shu kompaniyada
   * bo'lishi kerak. `create` va `update` (bir qator avansga aylantirilganda)
   * uchun bitta joy — ikki nusxa muqarrar ravishda bir-biridan ajralib
   * ketardi.
   */
  private async assertAdvanceRecipient(
    relatedUserId: number | null | undefined,
    companyId: number,
  ): Promise<void> {
    if (!relatedUserId) {
      throw new BadRequestException(
        "TEACHER_ADVANCE xarajati uchun xodim (relatedUserId) ko'rsatilishi shart",
      );
    }
    const user = await this.prisma.user.findFirst({
      where: { id: relatedUserId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Xodim topilmadi');
    }
  }

  /**
   * Oylikdan ushlab qolingan avans qulflanadi. `applyPendingAdvances` uni
   * bitta SalaryPayment'ga bog'lab, o'sha to'lov summasini aynan shu avans
   * miqdoriga kamaytirgan. Endi summasini o'zgartirish yoki o'chirish o'sha
   * to'lovni eski raqam bo'yicha qoldiradi — oylik varaqasidagi
   * «grossTotal − avanslar = to'langan» tenglama buziladi. Tuzatishning
   * yagona to'g'ri yo'li: avval o'sha oylikni bekor qilish.
   */
  private assertAdvanceUnsettled(expense: {
    settledBySalaryPaymentId: string | null;
  }): void {
    if (expense.settledBySalaryPaymentId !== null) {
      throw new ConflictException(
        "Bu avans oylikka hisoblangan — o'zgartirib bo'lmaydi. Avval o'sha oylikni bekor qiling.",
      );
    }
  }
```

3c. `create` ichidagi mavjud blokni almashtiring. Bu:

```ts
    // TEACHER_ADVANCE must name the recipient employee, and that employee
    // must belong to this company.
    if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      if (!dto.relatedUserId) {
        throw new BadRequestException(
          "TEACHER_ADVANCE xarajati uchun xodim (relatedUserId) ko'rsatilishi shart",
        );
      }
      const user = await this.prisma.user.findFirst({
        where: { id: dto.relatedUserId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('Xodim topilmadi');
      }
    }
```

quyidagiga aylanadi:

```ts
    if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(dto.relatedUserId, companyId);
    }
```

3d. `update` ichida, ikkala `assertBranchWritable` chaqiruvidan KEYIN va
`amountChanged` hisobidan OLDIN qo'shing:

```ts
    // Avans qoidalari. Xodimni almashtirish va toifani o'zgartirish ataylab
    // taqiqlangan: pul bir xodimdan ikkinchisiga jimgina ko'chib qolmasin,
    // tarixda ikkita aniq harakat (o'chirish + yangi avans) qolsin.
    if (existing.category === ExpenseCategory.TEACHER_ADVANCE) {
      this.assertAdvanceUnsettled(existing);

      if (
        dto.category !== undefined &&
        dto.category !== ExpenseCategory.TEACHER_ADVANCE
      ) {
        throw new BadRequestException(
          "Avansni boshqa toifaga o'tkazib bo'lmaydi — o'chirib, yangi xarajat yozing",
        );
      }
      if (
        dto.relatedUserId !== undefined &&
        dto.relatedUserId !== existing.relatedUserId
      ) {
        throw new BadRequestException(
          "Avansning xodimini almashtirib bo'lmaydi — o'chirib, to'g'ri xodimga yangi avans yozing",
        );
      }
    } else if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(dto.relatedUserId, companyId);
    }
```

3e. `remove` ichida, `assertBranchWritable` chaqiruvidan KEYIN qo'shing:

```ts
    if (existing.category === ExpenseCategory.TEACHER_ADVANCE) {
      this.assertAdvanceUnsettled(existing);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/expenses/expenses.service.spec.ts`

Expected: PASS — yangi 9 ta test va mavjud testlarning hammasi.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git add server/src/expenses/expenses.service.ts server/src/expenses/expenses.service.spec.ts
git commit -m "$(cat <<'EOF'
Oylikka hisoblangan avansni tahrirlashdan qulflash

Ushlab qolingan avansning summasini o'zgartirish SalaryPayment'ni eski
raqam bo'yicha qoldirardi. Avansning toifasi va xodimi ham endi
o'zgarmaydi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server — ro'yxatlarda «hisoblangan» belgisi

**Files:**
- Modify: `server/src/salary/salary-advance-calendar.service.ts`
- Modify: `server/src/salary/salary-monthly.service.ts` (`getAdvancesForUser`)
- Test: `server/src/salary/salary-advance-calendar.service.spec.ts`
- Test: `server/src/salary/salary-monthly.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 dagi qorovullar (mustaqil, lekin bir xil semantika).
- Produces: `GET /salary/advance-calendar` javobidagi har bir `advances[]`
  qatori va `GET /salary/advances/:userId` javobidagi har bir `advances[]`
  qatori endi shu uchta maydonni olib yuradi:
  ```ts
  settled: boolean;
  settledPeriodStart: Date | null; // JSON'da ISO satr
  settledPeriodEnd: Date | null;   // JSON'da ISO satr
  ```
  Task 4–6 shu maydonlarga tayanadi.

- [ ] **Step 1: Write the failing tests**

1a. `server/src/salary/salary-advance-calendar.service.spec.ts` — `advance()`
yordamchisiga ikkita standart maydon qo'shing. Mavjud `createdBy` qatoridan
keyin:

```ts
      settledBySalaryPaymentId: over.settledBySalaryPaymentId ?? null,
      settledBySalaryPayment: over.settledBySalaryPayment ?? null,
```

1b. O'sha faylga yangi test qo'shing (oxirgi `it(...)` dan keyin):

```ts
  it('hisoblangan avansni belgilaydi va oylik davrini qaytaradi', async () => {
    prisma.expense.findMany.mockResolvedValue([
      advance({ id: 'open' }),
      advance({
        id: 'settled',
        settledBySalaryPaymentId: 'sp-1',
        settledBySalaryPayment: {
          periodStart: new Date('2026-07-01T00:00:00.000Z'),
          periodEnd: new Date('2026-07-31T00:00:00.000Z'),
        },
      }),
    ]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    const open = res.advances.find((a) => a.id === 'open');
    const settled = res.advances.find((a) => a.id === 'settled');

    expect(open?.settled).toBe(false);
    expect(open?.settledPeriodStart).toBeNull();
    expect(open?.settledPeriodEnd).toBeNull();

    expect(settled?.settled).toBe(true);
    expect(settled?.settledPeriodStart).toEqual(
      new Date('2026-07-01T00:00:00.000Z'),
    );
    expect(settled?.settledPeriodEnd).toEqual(
      new Date('2026-07-31T00:00:00.000Z'),
    );
  });
```

1c. `server/src/salary/salary-monthly.service.spec.ts` — `describe('getAdvancesForUser', ...)`
bloki ichiga, mavjud testdan keyin:

```ts
    it('har bir avansda hisoblangan-hisoblanmaganini qaytaradi', async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'a1',
          amount: 300_000,
          date: new Date('2026-06-05'),
          paymentMethod: 'CASH',
          description: '1-qism',
          createdAt: new Date('2026-06-05'),
          createdBy: { id: 2, firstName: 'Admin', lastName: 'A' },
          settledBySalaryPaymentId: null,
          settledBySalaryPayment: null,
        },
        {
          id: 'a2',
          amount: 200_000,
          date: new Date('2026-06-20'),
          paymentMethod: 'CARD',
          description: '2-qism',
          createdAt: new Date('2026-06-20'),
          createdBy: { id: 2, firstName: 'Admin', lastName: 'A' },
          settledBySalaryPaymentId: 'sp-9',
          settledBySalaryPayment: {
            periodStart: new Date('2026-06-01'),
            periodEnd: new Date('2026-06-30'),
          },
        },
      ]);

      const res = await service.getAdvancesForUser(
        10010,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.total).toBe(500_000);
      expect(res.advances[0]).toMatchObject({
        id: 'a1',
        settled: false,
        settledPeriodStart: null,
        settledPeriodEnd: null,
      });
      expect(res.advances[1]).toMatchObject({ id: 'a2', settled: true });
      expect(res.advances[1].settledPeriodEnd).toEqual(new Date('2026-06-30'));
    });
```

1d. O'sha blokdagi MAVJUD testda `prisma.expense.findMany.mockResolvedValue([...])`
ichidagi ikkala obyektga ham `settledBySalaryPaymentId: null` va
`settledBySalaryPayment: null` qo'shing — aks holda `a.settledBySalaryPaymentId`
`undefined` bo'lib `settled` `true` chiqib ketadi.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd server && npx jest src/salary/salary-advance-calendar.service.spec.ts src/salary/salary-monthly.service.spec.ts
```

Expected: FAIL — `settled` maydoni `undefined`.

- [ ] **Step 3: Implement**

3a. `server/src/salary/salary-advance-calendar.service.ts` — `AdvanceCalendarRow`
interfeysiga `createdAt: Date;` dan keyin qo'shing:

```ts
  /** Bu avans allaqachon bitta oylik to'loviga hisoblangan (qulflangan). */
  settled: boolean;
  /** Qaysi oylik davriga hisoblangani — hisoblanmagan bo'lsa `null`. */
  settledPeriodStart: Date | null;
  settledPeriodEnd: Date | null;
```

3b. O'sha faylda `prisma.expense.findMany` ning `select` ichiga,
`createdAt: true,` dan keyin qo'shing:

```ts
        settledBySalaryPaymentId: true,
        settledBySalaryPayment: {
          select: { periodStart: true, periodEnd: true },
        },
```

3c. O'sha faylda `advances` map'iga, `createdAt: e.createdAt,` dan keyin
qo'shing:

```ts
              settled: e.settledBySalaryPaymentId !== null,
              settledPeriodStart: e.settledBySalaryPayment?.periodStart ?? null,
              settledPeriodEnd: e.settledBySalaryPayment?.periodEnd ?? null,
```

3d. `server/src/salary/salary-monthly.service.ts` — `getAdvancesForUser` ichida
`select` ga, `createdBy: {...}` dan keyin qo'shing:

```ts
        settledBySalaryPaymentId: true,
        settledBySalaryPayment: {
          select: { periodStart: true, periodEnd: true },
        },
```

3e. O'sha metodning oxirgi ikki qatorini almashtiring. Bu:

```ts
    const total = advances.reduce((s, a) => s + a.amount, 0);
    return { month, userId, count: advances.length, total, advances };
```

quyidagiga aylanadi:

```ts
    // Qulflangan avansni UI o'chiq tugma bilan ko'rsatadi, shuning uchun
    // «hisoblangan» belgisi ro'yxat bilan birga keladi — alohida so'rov
    // qilinmaydi.
    const rows = advances.map((a) => ({
      id: a.id,
      amount: a.amount,
      date: a.date,
      paymentMethod: a.paymentMethod,
      description: a.description,
      createdAt: a.createdAt,
      createdBy: a.createdBy,
      settled: a.settledBySalaryPaymentId !== null,
      settledPeriodStart: a.settledBySalaryPayment?.periodStart ?? null,
      settledPeriodEnd: a.settledBySalaryPayment?.periodEnd ?? null,
    }));

    const total = rows.reduce((s, a) => s + a.amount, 0);
    return { month, userId, count: rows.length, total, advances: rows };
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd server && npx jest src/salary/salary-advance-calendar.service.spec.ts src/salary/salary-monthly.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git add server/src/salary/salary-advance-calendar.service.ts server/src/salary/salary-advance-calendar.service.spec.ts server/src/salary/salary-monthly.service.ts server/src/salary/salary-monthly.service.spec.ts
git commit -m "$(cat <<'EOF'
Avans ro'yxatlarida «oylikka hisoblangan» belgisi

Ikkala ro'yxat endpoint'i har bir avansda settled va oylik davrini
qaytaradi — UI shu bo'yicha tahrirlash tugmasini o'chiradi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server — o'chirilgan avans oylik varaqasiga tushmasin

**Files:**
- Modify: `server/src/salary/salary-breakdown.service.ts`
- Test: `server/src/salary/salary-breakdown.service.spec.ts`

**Interfaces:**
- Consumes: hech narsa.
- Produces: `getPaymentBreakdown` endi faqat o'chirilmagan settled avanslarni
  hisoblaydi. Tashqi shakl o'zgarmaydi.

- [ ] **Step 1: Write the failing test**

`server/src/salary/salary-breakdown.service.spec.ts` — MAVJUD testdagi
tasdiqni yangilang. Bu:

```ts
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settledBySalaryPaymentId: 'sp1', companyId: 1 },
      }),
    );
```

quyidagiga aylanadi:

```ts
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          settledBySalaryPaymentId: 'sp1',
          companyId: 1,
          deletedAt: null,
        },
      }),
    );
```

Keyin yangi test qo'shing:

```ts
  it("o'chirilgan avansni varaqaga qo'shmaydi", async () => {
    // Avansni o'chirish endi saytdan mumkin. O'chirilgan avans varaqada
    // qolsa, «grossTotal − avanslar = to'langan» tenglamasi buziladi.
    await service.getPaymentBreakdown('sp1', 1);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/salary/salary-breakdown.service.spec.ts`

Expected: FAIL — `where.deletedAt` `undefined`.

- [ ] **Step 3: Implement**

`server/src/salary/salary-breakdown.service.ts` — settled avanslar so'rovida:

```ts
    const settledAdvances = await this.prisma.expense.findMany({
      where: { settledBySalaryPaymentId: salaryPaymentId, companyId },
```

quyidagiga aylanadi:

```ts
    const settledAdvances = await this.prisma.expense.findMany({
      // `deletedAt: null` — o'chirilgan avans varaqada qolsa, sahifadagi
      // «grossTotal − avanslar = to'langan» tenglamasi buziladi.
      where: {
        settledBySalaryPaymentId: salaryPaymentId,
        companyId,
        deletedAt: null,
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/salary/salary-breakdown.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git add server/src/salary/salary-breakdown.service.ts server/src/salary/salary-breakdown.service.spec.ts
git commit -m "$(cat <<'EOF'
O'chirilgan avans oylik varaqasida hisoblanmasin

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Klient — uchta umumiy bo'lak

**Files:**
- Create: `client/src/components/payments/advance-row-actions.tsx`
- Create: `client/src/components/payments/salary-delete-advance-dialog.tsx`
- Rename + modify: `client/src/components/payments/salary-add-advance-dialog.tsx`
  → `client/src/components/payments/salary-advance-dialog.tsx`
- Modify: `client/src/components/payments/salary-advances-tab.tsx` (faqat import)
- Modify: `client/src/components/payments/salary-monthly-view.tsx` (faqat import)

**Interfaces:**
- Consumes: Task 2 dagi `settled`, `settledPeriodStart`, `settledPeriodEnd`.
- Produces:
  ```ts
  // advance-row-actions.tsx
  export interface EditableAdvance {
    id: string;
    date: string;            // "YYYY-MM-DD"
    amount: number;
    paymentMethod: "CASH" | "CARD";
    description: string;
    employeeName: string;
    settled: boolean;
    settledPeriodStart: string | null; // ISO
    settledPeriodEnd: string | null;   // ISO
  }
  export function settledLabel(a: EditableAdvance): string | null;
  export function AdvanceRowActions(props: {
    advance: EditableAdvance;
    onEdit: (a: EditableAdvance) => void;
    onDelete: (a: EditableAdvance) => void;
  }): JSX.Element;

  // salary-delete-advance-dialog.tsx
  export function SalaryDeleteAdvanceDialog(props: {
    advance: EditableAdvance | null;
    onOpenChange: (open: boolean) => void;
    onDeleted: () => void;
  }): JSX.Element;

  // salary-advance-dialog.tsx
  export function SalaryAdvanceDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
    defaultDate?: Date | null;
    advance?: EditableAdvance | null; // berilsa — tahrirlash rejimi
  }): JSX.Element;
  ```
  Task 5 va Task 6 aynan shu uchtasini ishlatadi.

- [ ] **Step 1: Create `advance-row-actions.tsx`**

```tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel } from "./salary-utils";

/**
 * Ikkala avans ro'yxati — «Avanslar» tabidagi kun paneli va «Avans» katagining
 * drawer'i — qatorlarini shu shaklga keltiradi. Ikkalasi serverdan turli
 * shaklda keladi (kalendar `date` ni "YYYY-MM-DD", drawer esa ISO qilib
 * qaytaradi), shuning uchun normalizatsiya chaqiruvchi tomonda bo'ladi va bu
 * tur bitta aniq shartnoma bo'lib qoladi.
 */
export interface EditableAdvance {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
  paymentMethod: "CASH" | "CARD";
  description: string;
  /** Oynada va o'chirish tasdig'ida ko'rsatiladi; hech qachon o'zgarmaydi. */
  employeeName: string;
  settled: boolean;
  /** ISO. Hisoblanmagan avansda `null`. */
  settledPeriodStart: string | null;
  settledPeriodEnd: string | null;
}

/** "2026-09-01T00:00:00.000Z" yoki "2026-09-01" → "01.09.2026". */
function isoDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Qator ostidagi qisqa sabab. Oylik davri `cycleStartDay` ga qarab kalendar
 * oyga to'g'ri kelmasligi mumkin, shuning uchun davr OXIRI qaysi oyga
 * tushsa — o'sha oy nomi olinadi.
 */
export function settledLabel(a: EditableAdvance): string | null {
  if (!a.settled) return null;
  if (!a.settledPeriodEnd) return "Oylikka hisoblangan";
  return `${monthLabel(a.settledPeriodEnd.slice(0, 7))} oyligiga hisoblangan`;
}

/** Tugma ustidagi to'liq sabab — oy nomi emas, aniq davr. */
function settledTitle(a: EditableAdvance): string {
  if (a.settledPeriodStart && a.settledPeriodEnd) {
    return `Bu avans ${isoDay(a.settledPeriodStart)}–${isoDay(
      a.settledPeriodEnd,
    )} oyligiga hisoblangan — o'zgartirib bo'lmaydi`;
  }
  return "Bu avans oylikka hisoblangan — o'zgartirib bo'lmaydi";
}

/**
 * Bitta avans qatorining amallari. Hisoblangan avansda ikkala tugma ham
 * o'chiq: uni o'zgartirish allaqachon yozilgan oylik to'lovini eski raqam
 * bo'yicha qoldirib ketardi. O'chiq tugma yonida sabab MATN bilan ham
 * ko'rsatiladi (`settledLabel`) — `title` o'chiq tugmada ko'rinmasligi
 * mumkin, sabab esa yo'qolmasligi kerak.
 */
export function AdvanceRowActions({
  advance,
  onEdit,
  onDelete,
}: {
  advance: EditableAdvance;
  onEdit: (a: EditableAdvance) => void;
  onDelete: (a: EditableAdvance) => void;
}) {
  const disabled = advance.settled;
  const reason = disabled ? settledTitle(advance) : undefined;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        title={reason ?? "Tahrirlash"}
        aria-label="Avansni tahrirlash"
        onClick={() => onEdit(advance)}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
        disabled={disabled}
        title={reason ?? "O'chirish"}
        aria-label="Avansni o'chirish"
        onClick={() => onDelete(advance)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create `salary-delete-advance-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import type { EditableAdvance } from "./advance-row-actions";

/** "2026-09-15" → "15.09.2026". */
function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Avansni o'chirish tasdig'i. Ikkala ro'yxat ham shuni ishlatadi — matn bitta
 * joyda tursin. O'chirish daftar yozuvini teskari yozadi va pulni kassaga
 * qaytaradi (server tomonda), shuning uchun tasdiq matni buni aniq aytadi.
 */
export function SalaryDeleteAdvanceDialog({
  advance,
  onOpenChange,
  onDeleted,
}: {
  advance: EditableAdvance | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!advance) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${advance.id}`);
      toast.success("Avans o'chirildi");
      onOpenChange(false);
      onDeleted();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={!!advance}
      onOpenChange={(v) => {
        if (!v && !deleting) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Avansni o&apos;chirasizmi?</AlertDialogTitle>
          <AlertDialogDescription>
            {advance
              ? `${advance.employeeName} — ${formatPrice(advance.amount)} so'm, ${day(advance.date)}. Pul kassaga qaytariladi va bu avans keyingi oylik hisobiga tushmaydi. Bu amalni qaytarib bo'lmaydi.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            Bekor qilish
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(ev) => {
              ev.preventDefault();
              void handleDelete();
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
            O&apos;chirish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Rename the add dialog**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git mv client/src/components/payments/salary-add-advance-dialog.tsx client/src/components/payments/salary-advance-dialog.tsx
```

- [ ] **Step 4: Convert the dialog to two modes**

`client/src/components/payments/salary-advance-dialog.tsx` da quyidagi
o'zgarishlarni qiling.

4a. Importlarga qo'shing:

```tsx
import type { EditableAdvance } from "./advance-row-actions";
```

4b. `Props` interfeysiga qo'shing (`defaultDate` dan keyin):

```tsx
  /**
   * Berilsa — tahrirlash rejimi. Xodim o'zgarmaydi (CEO qarori): noto'g'ri
   * odamga yozilgan avans o'chirilib, to'g'ri odamga yangisi yoziladi —
   * shunda tarixda ikkita aniq harakat qoladi.
   */
  advance?: EditableAdvance | null;
```

4c. Komponent nomi va parametrini o'zgartiring:

```tsx
export function SalaryAdvanceDialog({
  open,
  onOpenChange,
  onSaved,
  defaultDate,
  advance,
}: Props) {
```

4d. `const { selectedBranch } = useBranchSwitcher();` dan keyin qo'shing:

```tsx
  const isEdit = !!advance;
```

4e. Prefill `useEffect` ni almashtiring. Bu:

```tsx
  useEffect(() => {
    if (!open) return;
    setRelatedUserId("");
    setPaymentMethod("CASH");
    setAmount("");
    setDescription("Avans");
    setDate(defaultDate ?? new Date());
  }, [open, defaultDate]);
```

quyidagiga aylanadi:

```tsx
  useEffect(() => {
    if (!open) return;
    if (advance) {
      setRelatedUserId("");
      setPaymentMethod(advance.paymentMethod);
      setAmount(advance.amount.toLocaleString("uz-UZ"));
      setDescription(advance.description);
      setDate(new Date(`${advance.date}T00:00:00`));
      return;
    }
    setRelatedUserId("");
    setPaymentMethod("CASH");
    setAmount("");
    setDescription("Avans");
    setDate(defaultDate ?? new Date());
  }, [open, defaultDate, advance]);
```

4f. Xodimlar so'rovini faqat qo'shish rejimida yuklang:

```tsx
    enabled: open && !isEdit,
```

4g. `canSubmit` ni almashtiring:

```tsx
  const canSubmit =
    (isEdit || !!relatedUserId) && rawAmount >= 1 && !!description.trim() && !!date;
```

4h. `handleSubmit` ni almashtiring:

```tsx
  const handleSubmit = async () => {
    if (!canSubmit || !date) return;
    setSubmitting(true);
    try {
      if (advance) {
        // Faqat to'rt maydon. `category`, `relatedUserId` va `branchId`
        // ataylab yuborilmaydi — yuborilmagan maydon o'zgarmaydi, va server
        // avansning xodimini almashtirishni baribir rad etadi.
        await api.patch(`/expenses/${advance.id}`, {
          paymentMethod,
          amount: rawAmount,
          description: description.trim(),
          date: format(date, "yyyy-MM-dd"),
        });
        toast.success("Avans yangilandi");
      } else {
        await api.post("/expenses", {
          category: "TEACHER_ADVANCE",
          paymentMethod,
          amount: rawAmount,
          description: description.trim(),
          date: format(date, "yyyy-MM-dd"),
          relatedUserId: parseInt(relatedUserId, 10),
          branchId: selectedBranch?.id,
        });
        toast.success("Avans qo'shildi");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Avansni saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };
```

4i. Sarlavhani almashtiring:

```tsx
          <DialogTitle>
            {isEdit ? "Avansni tahrirlash" : "Avans qo'shish"}
          </DialogTitle>
```

4j. Xodim blokini almashtiring. Bu butun blok:

```tsx
          <div className="space-y-2">
            <Label>Xodim</Label>
            <EmployeeAdvanceSelect
              value={relatedUserId}
              onChange={setRelatedUserId}
              employees={employees ?? []}
              loading={employeesLoading}
            />
            <p className="text-xs text-muted-foreground">
              Avans keyingi oylik hisobida ushbu xodimning oyligidan avtomatik
              ushlab qolinadi
            </p>
          </div>
```

quyidagiga aylanadi:

```tsx
          <div className="space-y-2">
            <Label>Xodim</Label>
            {isEdit ? (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {advance?.employeeName}
                </div>
                <p className="text-xs text-muted-foreground">
                  Xodim o&apos;zgarmaydi. Avans boshqa odamga yozilgan
                  bo&apos;lsa — buni o&apos;chirib, to&apos;g&apos;ri xodimga
                  yangi avans yozing.
                </p>
              </>
            ) : (
              <>
                <EmployeeAdvanceSelect
                  value={relatedUserId}
                  onChange={setRelatedUserId}
                  employees={employees ?? []}
                  loading={employeesLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Avans keyingi oylik hisobida ushbu xodimning oyligidan
                  avtomatik ushlab qolinadi
                </p>
              </>
            )}
          </div>
```

4k. Sana blokiga izoh qo'shing. Bu:

```tsx
          <div className="space-y-2">
            <Label>Sana</Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ?? null)}
              placeholder="Sanani tanlang"
            />
          </div>
```

quyidagiga aylanadi:

```tsx
          <div className="space-y-2">
            <Label>Sana</Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ?? null)}
              placeholder="Sanani tanlang"
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Sana o&apos;zgarsa avans hisobotlarda yangi kunga
                ko&apos;chadi, Kassa oqimidagi harakat esa kiritilgan kunida
                qoladi.
              </p>
            )}
          </div>
```

4l. Fayl boshidagi JSDoc izohini yangilang: «"Avans qo'shish" — records a
TEACHER_ADVANCE expense...» o'rniga:

```tsx
/**
 * Avans oynasi — ikki rejimda. `advance` berilmasa yangi TEACHER_ADVANCE
 * xarajati yoziladi; berilsa mavjudi tahrirlanadi (summa, sana, naqd/karta,
 * izoh — xodim emas). Bitta oyna, chunki maydonlar, summa formatlash va
 * validatsiya bir xil: ikki nusxa muqarrar ravishda bir-biridan ajralib
 * ketardi.
 */
```

- [ ] **Step 5: Update the two import sites**

`client/src/components/payments/salary-advances-tab.tsx`:

```tsx
import { SalaryAdvanceDialog } from "./salary-advance-dialog";
```

va JSX'da `<SalaryAddAdvanceDialog` → `<SalaryAdvanceDialog`.

`client/src/components/payments/salary-monthly-view.tsx`:

```tsx
import { SalaryAdvanceDialog } from "./salary-advance-dialog";
```

va JSX'da `<SalaryAddAdvanceDialog` → `<SalaryAdvanceDialog`.

- [ ] **Step 6: Verify typecheck and lint pass**

Run: `cd client && npm run typecheck && npm run lint`

Expected: xatosiz o'tadi.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git add client/src/components/payments/
git commit -m "$(cat <<'EOF'
Avans tahrirlash uchun umumiy klient bo'laklari

Qator tugmalari, o'chirish tasdig'i va ikki rejimli avans oynasi —
ikkala ro'yxat ham shu uchtasini ishlatadi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Klient — Avanslar tabidagi kun panelida tugmalar

**Files:**
- Modify: `client/src/components/payments/salary-advance-day-panel.tsx`
- Modify: `client/src/components/payments/salary-advances-tab.tsx`

**Interfaces:**
- Consumes: Task 4 dagi `EditableAdvance`, `AdvanceRowActions`, `settledLabel`,
  `SalaryDeleteAdvanceDialog`, `SalaryAdvanceDialog`.
- Produces: `SalaryAdvanceDayPanel` ikkita yangi prop oladi:
  `onEdit: (a: EditableAdvance) => void` va
  `onDelete: (a: EditableAdvance) => void`.

- [ ] **Step 1: Extend the `AdvanceRow` type**

`client/src/components/payments/salary-advances-tab.tsx` — `AdvanceRow`
interfeysiga `createdAt: string;` dan keyin qo'shing:

```ts
  settled: boolean;
  settledPeriodStart: string | null;
  settledPeriodEnd: string | null;
```

- [ ] **Step 2: Add the buttons to the day panel**

`client/src/components/payments/salary-advance-day-panel.tsx`:

2a. Importlarga qo'shing:

```tsx
import {
  AdvanceRowActions,
  settledLabel,
  type EditableAdvance,
} from "./advance-row-actions";
```

2b. Komponent parametrlariga `onEdit` va `onDelete` qo'shing:

```tsx
export function SalaryAdvanceDayPanel({
  date,
  advances,
  canPay,
  onAdd,
  onEdit,
  onDelete,
}: {
  date: string | null;
  advances: AdvanceRow[];
  canPay: boolean;
  onAdd: (date: string) => void;
  onEdit: (a: EditableAdvance) => void;
  onDelete: (a: EditableAdvance) => void;
}) {
```

2c. `rows` hisobidan keyin normalizator qo'shing:

```tsx
  /**
   * Kun paneli qatorini umumiy shaklga keltiradi. Kalendar `date` ni
   * allaqachon "YYYY-MM-DD" qilib qaytaradi, shuning uchun kesish shart emas.
   */
  const toEditable = (a: AdvanceRow): EditableAdvance => ({
    id: a.id,
    date: a.date,
    amount: a.amount,
    paymentMethod: a.paymentMethod,
    description: a.description,
    employeeName: `${a.user.firstName} ${a.user.lastName}`,
    settled: a.settled,
    settledPeriodStart: a.settledPeriodStart,
    settledPeriodEnd: a.settledPeriodEnd,
  });
```

2d. Qatordagi summa qismini almashtiring. Bu:

```tsx
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatPrice(a.amount)}
                </span>
```

quyidagiga aylanadi:

```tsx
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatPrice(a.amount)}
                  </span>
                  {canPay && (
                    <AdvanceRowActions
                      advance={toEditable(a)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  )}
                </div>
```

2e. Sabab matnini belgilar qatoridan keyin qo'shing. Qatorning oxiri hozir
shunday:

```tsx
                {a.createdBy && (
                  <span className="text-xs text-muted-foreground">
                    · {a.createdBy.firstName} {a.createdBy.lastName} bergan
                  </span>
                )}
              </div>
            </div>
```

quyidagiga aylanadi:

```tsx
                {a.createdBy && (
                  <span className="text-xs text-muted-foreground">
                    · {a.createdBy.firstName} {a.createdBy.lastName} bergan
                  </span>
                )}
              </div>
              {/* O'chiq tugma sababsiz bo'lsa buzuq tuyuladi — sabab
                  `title` ga tashlanmaydi, matn bo'lib turadi. */}
              {a.settled && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {settledLabel(toEditable(a))}
                </p>
              )}
            </div>
```

- [ ] **Step 3: Wire the state in the tab**

`client/src/components/payments/salary-advances-tab.tsx`:

3a. Importlarga qo'shing:

```tsx
import { SalaryDeleteAdvanceDialog } from "./salary-delete-advance-dialog";
import type { EditableAdvance } from "./advance-row-actions";
```

3b. Mavjud `useState` qatorlaridan keyin ikkita yangi holat qo'shing:

```tsx
  // Tahrirlanayotgan va o'chirilayotgan avans — ikkalasi ham vaqtinchalik UI
  // holati, URL'ga yozilmaydi.
  const [editAdvance, setEditAdvance] = useState<EditableAdvance | null>(null);
  const [deleteAdvance, setDeleteAdvance] = useState<EditableAdvance | null>(
    null,
  );
```

3c. `<SalaryAdvanceDayPanel ... />` ga ikkita prop qo'shing:

```tsx
            onEdit={(a) => setEditAdvance(a)}
            onDelete={(a) => setDeleteAdvance(a)}
```

3d. Mavjud `<SalaryAdvanceDialog ... />` dan keyin ikkita yangi komponent
qo'shing:

```tsx
      {/* Tahrirlash — xuddi shu oyna, `advance` berilgan rejimda */}
      <SalaryAdvanceDialog
        open={!!editAdvance}
        onOpenChange={(v) => {
          if (!v) setEditAdvance(null);
        }}
        onSaved={() => refetch()}
        advance={editAdvance}
      />

      <SalaryDeleteAdvanceDialog
        advance={deleteAdvance}
        onOpenChange={(v) => {
          if (!v) setDeleteAdvance(null);
        }}
        onDeleted={() => refetch()}
      />
```

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `cd client && npm run typecheck && npm run lint`

Expected: xatosiz o'tadi.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git add client/src/components/payments/salary-advance-day-panel.tsx client/src/components/payments/salary-advances-tab.tsx
git commit -m "$(cat <<'EOF'
Avanslar tabida tahrirlash va o'chirish tugmalari

Oylikka hisoblangan avansda ikkala tugma o'chiq va sabab qator ostida
matn bilan ko'rsatiladi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Klient — «Avans» katagi ro'yxatida tugmalar

**Files:**
- Modify: `client/src/components/payments/salary-advance-breakdown-drawer.tsx`
- Modify: `client/src/components/payments/salary-monthly-view.tsx`

**Interfaces:**
- Consumes: Task 4 dagi uchta bo'lak.
- Produces: `SalaryAdvanceBreakdownDrawer` ikkita yangi prop oladi:
  `canPay: boolean` va `onChanged: () => void`.

- [ ] **Step 1: Extend the drawer's row type and props**

`client/src/components/payments/salary-advance-breakdown-drawer.tsx`:

1a. Importlarga qo'shing:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdvanceRowActions,
  settledLabel,
  type EditableAdvance,
} from "./advance-row-actions";
import { SalaryAdvanceDialog } from "./salary-advance-dialog";
import { SalaryDeleteAdvanceDialog } from "./salary-delete-advance-dialog";
```

(mavjud `import { useQuery } from "@tanstack/react-query";` qatorini
yuqoridagi `useQueryClient` li variant bilan almashtiring)

1b. Ichki `AdvanceRow` interfeysiga qo'shing:

```ts
  settled: boolean;
  settledPeriodStart: string | null;
  settledPeriodEnd: string | null;
```

1c. `Props` interfeysiga qo'shing:

```ts
  canPay: boolean;
  /** Tahrirlash/o'chirishdan keyin oyliklar jadvalini yangilash uchun. */
  onChanged: () => void;
```

1d. Komponent parametrlarini yangilang:

```tsx
export function SalaryAdvanceBreakdownDrawer({
  target,
  onClose,
  canPay,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const [editAdvance, setEditAdvance] = useState<EditableAdvance | null>(null);
  const [deleteAdvance, setDeleteAdvance] = useState<EditableAdvance | null>(
    null,
  );
```

1e. `const advances = data?.advances ?? [];` dan keyin qo'shing:

```tsx
  /**
   * Drawer o'z ro'yxatini o'zi yuklaydi, shuning uchun o'zgarishdan keyin
   * shu so'rovni ham, ustidagi oyliklar jadvalini ham yangilash kerak.
   */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["salary-advances"] });
    onChanged();
  };

  /** Drawer `date` ni ISO qilib qaytaradi — umumiy shakl "YYYY-MM-DD" kutadi. */
  const toEditable = (a: AdvanceRow): EditableAdvance => ({
    id: a.id,
    date: a.date.slice(0, 10),
    amount: a.amount,
    paymentMethod: a.paymentMethod,
    description: a.description,
    employeeName: target?.name ?? "",
    settled: a.settled,
    settledPeriodStart: a.settledPeriodStart,
    settledPeriodEnd: a.settledPeriodEnd,
  });
```

- [ ] **Step 2: Add the actions column**

2a. `<TableHead>Kim bergan</TableHead>` dan keyin qo'shing:

```tsx
                    {canPay && <TableHead className="w-20" />}
```

2b. «Kim bergan» `<TableCell>` idan keyin qo'shing:

```tsx
                      {canPay && (
                        <TableCell className="text-right">
                          <AdvanceRowActions
                            advance={toEditable(a)}
                            onEdit={setEditAdvance}
                            onDelete={setDeleteAdvance}
                          />
                        </TableCell>
                      )}
```

2c. «Sana» katakchasiga sabab matnini qo'shing. Bu:

```tsx
                      <TableCell className="text-sm">
                        {format(new Date(a.date), "dd.MM.yyyy")}
                        {a.description && a.description !== "Avans" && (
                          <span className="block text-xs text-muted-foreground">
                            {a.description}
                          </span>
                        )}
                      </TableCell>
```

quyidagiga aylanadi:

```tsx
                      <TableCell className="text-sm">
                        {format(new Date(a.date), "dd.MM.yyyy")}
                        {a.description && a.description !== "Avans" && (
                          <span className="block text-xs text-muted-foreground">
                            {a.description}
                          </span>
                        )}
                        {a.settled && (
                          <span className="block text-xs text-muted-foreground">
                            {settledLabel(toEditable(a))}
                          </span>
                        )}
                      </TableCell>
```

- [ ] **Step 3: Render the two dialogs inside the drawer**

Oynalar `<Sheet>` ichida emas, yonida turishi kerak (Sheet yopilganda ular
ham yo'q bo'lib ketmasin), shuning uchun `return` fragmentga o'raladi.

3a. `return (` dan keyingi qatorni o'zgartiring. Bu:

```tsx
  return (
    <Sheet open={!!target} onOpenChange={(v) => !v && onClose()}>
```

quyidagiga aylanadi:

```tsx
  return (
    <>
      <Sheet open={!!target} onOpenChange={(v) => !v && onClose()}>
```

3b. Fayl oxiridagi yopuvchi qismni almashtiring. Bu:

```tsx
      </SheetContent>
    </Sheet>
  );
}
```

quyidagiga aylanadi:

```tsx
        </SheetContent>
      </Sheet>

      <SalaryAdvanceDialog
        open={!!editAdvance}
        onOpenChange={(v) => {
          if (!v) setEditAdvance(null);
        }}
        onSaved={refresh}
        advance={editAdvance}
      />

      <SalaryDeleteAdvanceDialog
        advance={deleteAdvance}
        onOpenChange={(v) => {
          if (!v) setDeleteAdvance(null);
        }}
        onDeleted={refresh}
      />
    </>
  );
}
```

3c. `<Sheet>` va `</SheetContent>` orasidagi butun JSX endi bir daraja ichkariga
suriladi. Buni qo'lda qilmang — `npx prettier --write` faylni o'zi
tekislaydi:

```bash
cd client && npx prettier --write src/components/payments/salary-advance-breakdown-drawer.tsx
```

- [ ] **Step 4: Pass the new props from the monthly view**

`client/src/components/payments/salary-monthly-view.tsx` — drawer'ni
yangilang:

```tsx
      <SalaryAdvanceBreakdownDrawer
        target={advanceTarget}
        onClose={() => setAdvanceTarget(null)}
        canPay={canPay}
        onChanged={bumpRefresh}
      />
```

- [ ] **Step 5: Verify typecheck and lint pass**

Run: `cd client && npm run typecheck && npm run lint`

Expected: xatosiz o'tadi.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git add client/src/components/payments/salary-advance-breakdown-drawer.tsx client/src/components/payments/salary-monthly-view.tsx
git commit -m "$(cat <<'EOF'
«Avans» katagi ro'yxatida tahrirlash va o'chirish

Xato ko'pincha aynan shu ro'yxatda ko'zga tashlanadi — CEO ni boshqa
tabga yuborish shart emas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Yakuniy tekshiruv

**Files:** hech qanday fayl o'zgarmaydi (tuzatish kerak bo'lsa — o'zgaradi).

**Interfaces:**
- Consumes: Task 1–6.
- Produces: butun repo yashil, qo'lda tekshirish ro'yxati bajarilgan.

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm test`

Expected: hammasi PASS. **Eslatma:** `attendance` spec'i 23:40–00:02 oralig'ida
vaqtga bog'liq ravishda yiqiladi — agar aynan o'sha test yiqilsa, soatni
tekshiring, bu bizning o'zgarishimizdan emas.

- [ ] **Step 2: Run server typecheck and lint**

Run: `cd server && npm run typecheck && npm run lint`

Expected: xatosiz.

- [ ] **Step 3: Run client checks**

Run: `cd client && npm run typecheck && npm run lint && npm test`

Expected: xatosiz.

- [ ] **Step 4: Manual check against real data**

Dev bazada avans bor bir oyni oching (bo'sh ro'yxat hech narsani isbotlamaydi).
Ish haqi → Avanslar:

1. Hisoblanmagan avansning **sanasini** o'zgartiring → kalendarda yangi kunga
   ko'chdi.
2. Hisoblanmagan avansning **summasini** o'zgartiring → kun paneli jamisi va
   «Oyliklar» tabidagi Avans ustuni yangi summani ko'rsatadi.
3. Avansni **o'chiring** → ro'yxatdan yo'qoladi, kun jamisi kamayadi.
4. **Hisoblangan** avans qatorida ikkala tugma o'chiq va ostida
   «<Oy> oyligiga hisoblangan» matni turibdi.
5. «Oyliklar» jadvalidagi **Avans katagi**ni oching → o'sha to'rt holat shu
   yerda ham ishlaydi.

Agar dev bazada hisoblangan avans bo'lmasa, 4-band uchun bitta avansga qo'lda
`settledBySalaryPaymentId` qo'ying (mavjud `SalaryPayment` id'si bilan) yoki
`POST /salary/calculate` ni o'sha xodim uchun ishga tushiring.

- [ ] **Step 5: Final commit if anything needed fixing**

Tuzatish bo'lmasa bu qadam o'tkazib yuboriladi.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/avans-tahrirlash
git status
```

---

## Deploy eslatmasi

Railway va Vercel GitHub'ga ulanmagan — merge o'z-o'zidan hech narsa
chiqarmaydi. Prodga chiqarish alohida, qo'lda qadam (`/deploy`), va u CEO
ruxsatisiz bajarilmaydi. Migratsiya yo'q, seed yo'q.
