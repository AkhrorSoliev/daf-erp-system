# Muzlatilgan balans — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Muzlatilgan o'quvchining o'tmagan darslari puli darhol balansiga
qaytsin, va 30 kundan ko'p kutgan bunday o'quvchilar `/payments/debt` da
alohida tabda ish ro'yxati bo'lib chiqsin.

**Architecture:** Uchta bo'lak. (1) Muzlatish yo'liga `MONTHLY` shoxi —
mavjud `reverseChargeForDeparture` qayta ishlatiladi, yangi arifmetika yo'q.
(2) Yangi read-only endpoint — jonli so'rov, cron va jadval yo'q.
(3) `/payments/debt` ga beshinchi tab, mavjud amal oynalarini chaqiradi.

**Tech Stack:** NestJS + Prisma (server), Next.js App Router + shadcn/ui (client).

## Global Constraints

- Barcha izoh va foydalanuvchi matni **lotin yozuvidagi o'zbekcha**. Kirill yoki arab harfi — nuqson.
- Balansga tegadigan har amal `TransactionsWriteService` orqali. Yangi pul arifmetikasi YOZILMAYDI.
- `LESSON_PACK` muzlatish yo'li (`refundPrepaidForFreeze`) o'zgarmaydi — u allaqachon to'g'ri.
- Yangi jadval, yangi cron, yangi `NotificationType` YO'Q.
- Chegara: **30 kun**, kodda konstanta. Sozlamaga chiqarilmaydi.
- Filial qamrovi `/payments/debt` ning boshqa tablari bilan bir xil.
- Lint CI darvozasi: `npx eslint src` ikkala workspace'da 0 xato bo'lib qolishi shart.
- `EntityHistory` har mutatsiyada (repo qoidasi).

---

### Task 1: Muzlatishda oylik hisob puli balansga qaytadi

**Files:**
- Modify: `server/src/students/students-status.service.ts` (`changeStatus`, ~128-148 va yangi private metod)
- Modify: `server/src/students/students.module.ts` (agar `MonthlyChargeService` hali import qilinmagan bo'lsa)
- Test: `server/src/students/students-status.service.spec.ts`

**Interfaces:**
- Consumes: `MonthlyChargeService.reverseChargeForDeparture(tx, { enrollmentId, departureDate, companyId, reason, performedById?, today? })` — `{ refunded: number; lessons: number } | null` qaytaradi, `null` = qaytariladigan narsa yo'q.
- Produces: `refundMonthlyForFreeze(studentId, userId, freezeDate)` — private, `Array<{ enrollmentId: string; refunded: number }>` qaytaradi.

- [ ] **Step 1: Yiqiladigan testlarni yoz**

```ts
describe('changeStatus → FROZEN, oylik kurs', () => {
  it('o`tmagan darslar pulini balansga qaytaradi', async () => {
    // Oylik kursdagi aktiv yozilish, sentabr hisobi bor.
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enr-1', prepaidLessonsRemaining: 0 },
    ]);
    monthlyCharge.reverseChargeForDeparture.mockResolvedValue({
      refunded: 257_144,
      lessons: 8,
    });

    await service.changeStatus(10453, { status: 'FROZEN' } as never, 10001);

    expect(monthlyCharge.reverseChargeForDeparture).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrollmentId: 'enr-1',
        reason: expect.stringContaining('Muzlatish'),
      }),
    );
  });

  it('12 talik kursda reverseChargeForDeparture CHAQIRILMAYDI', async () => {
    // `reverseChargeForDeparture` o'zi non-MONTHLY kursda null qaytaradi,
    // lekin muzlatish yo'li uni umuman chaqirmasligi kerak — chunki
    // `refundPrepaidForFreeze` o'sha yozilishni allaqachon qaytargan.
    // Ikkalasi bir yozilishda ishlasa, ikki marta qaytarish xavfi tug'iladi.
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enr-pack', prepaidLessonsRemaining: 5 },
    ]);
    course.paymentModel = 'LESSON_PACK';

    await service.changeStatus(10453, { status: 'FROZEN' } as never, 10001);

    expect(monthlyCharge.reverseChargeForDeparture).not.toHaveBeenCalled();
  });

  // Spec 4-bo'limdagi asosiy pul invarianti: muzlatish qaytardi, keyin
  // o'quvchi guruhdan chiqarildi -> IKKINCHI marta qaytmasligi shart.
  // `reverseChargeForDeparture` `remaining` ni jonli `charge.coveredLessons`
  // dan oladi (kalendardan qayta hisoblamaydi), shuning uchun birinchi
  // chaqiruv sanagichni kamaytiradi va ikkinchisi 0 topadi.
  it('muzlatish qaytargandan keyin chiqarishda IKKINCHI marta qaytmaydi', async () => {
    // 1-chaqiruv (muzlatish): 8 dars qaytdi.
    monthlyCharge.reverseChargeForDeparture.mockResolvedValueOnce({
      refunded: 257_144,
      lessons: 8,
    });
    await service.changeStatus(10453, { status: 'FROZEN' } as never, 10001);

    // 2-chaqiruv (guruhdan chiqarish): qaytariladigan narsa qolmadi.
    monthlyCharge.reverseChargeForDeparture.mockResolvedValueOnce(null);
    const second = await monthlyCharge.reverseChargeForDeparture(
      {} as never,
      { enrollmentId: 'enr-1' } as never,
    );

    expect(second).toBeNull();
  });

  it('muzlatish qaytarishi yiqilsa status O`ZGARMAYDI', async () => {
    monthlyCharge.reverseChargeForDeparture.mockRejectedValue(
      new Error('tranzaksiya yiqildi'),
    );

    await expect(
      service.changeStatus(10453, { status: 'FROZEN' } as never, 10001),
    ).rejects.toThrow();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

`cd server && npx jest src/students/students-status.service.spec.ts`
Kutilgan: birinchi test yiqiladi (`reverseChargeForDeparture` chaqirilmaydi).

Agar `PaymentModel` `@prisma/client` da yo'q desa, avval `npx prisma generate`
(node_modules qo'shni worktree bilan bo'lishilgan).

- [ ] **Step 3: `refundMonthlyForFreeze` ni yoz**

`refundPrepaidForFreeze` yonida, o'sha uslubda. Faqat **MONTHLY kursdagi
ACTIVE yozilishlar** olinadi (`group.course.paymentModel === MONTHLY`), va
har biri uchun `reverseChargeForDeparture` bitta Serializable tranzaksiyada
chaqiriladi. `departureDate` — muzlatish sanasi (`new Date()`).

`reason`: `"Muzlatish — o'tmagan darslar puli balansga qaytarildi"`.

- [ ] **Step 4: `changeStatus` ga ulash**

Mavjud `if (dto.status === StudentStatus.FROZEN)` blokida
`refundPrepaidForFreeze` dan KEYIN chaqiriladi. Ikkalasi ham status
almashishidan OLDIN turadi — yozilishlar hali `ACTIVE` bo'lishi kerak.

- [ ] **Step 5: Testlarni qayta ishga tushir**

`cd server && npx jest src/students` — hammasi yashil.

- [ ] **Step 6: To'liq suite + typecheck + lint**

`cd server && npx jest && npx tsc -p tsconfig.check.json --noEmit && npx eslint src`

- [ ] **Step 7: Commit**

---

### Task 2: `GET /payments/frozen-balances` endpoint

**Files:**
- Create: `server/src/payments/payments-frozen-balance.service.ts`
- Create: `server/src/payments/payments-frozen-balance.service.spec.ts`
- Modify: `server/src/payments/payments.controller.ts` (yangi `@Get('frozen-balances')`)
- Modify: `server/src/payments/payments.module.ts`
- Test: `server/src/payments/payments.controller.spec.ts` (qorovul testi)

**Interfaces:**
- Produces: `getFrozenBalances(companyId, { branchId?, page?, pageSize?, userId, roles })` →
  `{ data: FrozenBalanceRow[]; total: number; page: number; pageSize: number }`
  bunda `FrozenBalanceRow = { studentId, firstName, lastName, phone, balance, frozenAt: Date, daysFrozen: number, lastPaymentAt: Date | null }`.

- [ ] **Step 1: Yiqiladigan testlarni yoz**

```ts
const FROZEN_BALANCE_MIN_DAYS = 30;

describe('getFrozenBalances', () => {
  it('uchala shartni ham qo`llaydi', async () => {
    await service.getFrozenBalances(1001, { userId: 10001, roles: ['CEO'] });

    const where = prisma.student.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('FROZEN');
    expect(where.balance).toEqual({ gt: 0 });
    expect(where.deletedAt).toBeNull();
    // 30 kundan eski
    expect(where.statusChangedAt.lt).toBeInstanceOf(Date);
  });

  it('29 kun bo`lganni QAYTARMAYDI, 31 kun bo`lganni qaytaradi', async () => {
    const now = new Date('2026-09-03T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    await service.getFrozenBalances(1001, { userId: 10001, roles: ['CEO'] });

    const cutoff = prisma.student.findMany.mock.calls[0][0].where
      .statusChangedAt.lt as Date;
    const days = (now.getTime() - cutoff.getTime()) / 86_400_000;
    expect(days).toBe(FROZEN_BALANCE_MIN_DAYS);
    jest.useRealTimers();
  });

  it('daysFrozen ni hisoblaydi', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
    prisma.student.findMany.mockResolvedValue([
      {
        id: 10453,
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        balance: 257_144,
        statusChangedAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]);

    const res = await service.getFrozenBalances(1001, {
      userId: 10001,
      roles: ['CEO'],
    });

    expect(res.data[0].daysFrozen).toBe(45);
    expect(res.data[0].balance).toBe(257_144);
    jest.useRealTimers();
  });

  it('filial qamrovini qo`llaydi', async () => {
    await service.getFrozenBalances(1001, {
      branchId: 2,
      userId: 10002,
      roles: ['Branch Director'],
    });

    const where = prisma.student.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('branch');
  });
});
```

- [ ] **Step 2: Testlarni ishga tushir, yiqilishini ko'r**

`cd server && npx jest src/payments/payments-frozen-balance.service.spec.ts`
Kutilgan: `Cannot find module`.

- [ ] **Step 3: Servisni yoz**

Bitta `prisma.student.findMany`. Filial qamrovi uchun `studentBranchWhere`
(`src/common/finance/report-branch-scope.ts`) — `/payments/debtors` bilan
bir xil naqsh, `resolveCallerReportBranchIds` orqali. Qamrov bo'sh bo'lsa
(`[]`) — bo'sh ro'yxat, hech qachon butun kompaniya.

`lastPaymentAt` — o'sha o'quvchilarning oxirgi `PAYMENT` sanasi, BITTA
guruhlangan so'rov bilan (har qator uchun alohida so'rov emas).

**Faqat o'qiydi** — hech qanday `create`/`update`/`delete`.

- [ ] **Step 4: Kontrollerga ulash**

`@Get('frozen-balances')`, `/payments/debtors` bilan bir xil ruxsat va
`@CurrentUser` naqshi. `payments.controller.spec.ts` ga qorovul testi.

- [ ] **Step 5: Testlar + typecheck + lint**

`cd server && npx jest && npx tsc -p tsconfig.check.json --noEmit && npx eslint src`

- [ ] **Step 6: Commit**

---

### Task 3: «Muzlatilgan puli» tabi

**Files:**
- Create: `client/src/components/payments/debt/frozen-balance-view.tsx`
- Modify: `client/src/components/payments/debt/debt-page-client.tsx` (`TABS` ro'yxati + `TabsContent`)

**Interfaces:**
- Consumes: `GET /api/payments/frozen-balances?branchId=&page=&pageSize=` →
  `{ data: FrozenBalanceRow[]; total; page; pageSize }`.

- [ ] **Step 1: `TABS` ga beshinchi bandni qo'sh**

`debt-page-client.tsx:29-33` dagi ro'yxatga:
`{ value: "muzlatilgan", label: "Muzlatilgan puli" }`, va mos `TabsContent`.

- [ ] **Step 2: `FrozenBalanceView` ni yoz**

Loyihaning jadval qoidalariga rioya qil (`client/CLAUDE.md`):
`#` ustuni `border-r` bilan birinchi, sahifalash 10 tadan (10/20/30/40/50
tanlovi bilan), skeleton yuklanish holati, bo'sh holat harakatga
chorlaydigan matn bilan (`"Muzlatilgan, puli qolgan o'quvchi yo'q"`).

Ustunlar: `#` · O'quvchi (ism + ID) · Muzlatilgan (sana + «45 kun») ·
Balansi (`formatBalance`) · Oxirgi to'lov · Amal.

«Amal» — 3 nuqtali `DropdownMenu` (loyiha qoidasi), ikkita band:
- «Markaz hisobiga o'tkazish» → mavjud `withdrawal-dialog.tsx`
- «O'quvchiga qaytarish» → mavjud qaytarish oqimi

Yangi ma'lumot olish naqshi kiritilmaydi — qo'shni `debtors-view.tsx` nima
qilsa, shuni takrorla.

- [ ] **Step 3: Qurish va tekshirish**

`cd client && npx tsc --noEmit && npm test && npm run build`
Lint: `npx eslint src` — 0 xato.

- [ ] **Step 4: Commit**
