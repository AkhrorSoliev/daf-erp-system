# Oylik to'lov tizimi — 1-bosqich (yadro + migratsiya) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurs to'lovini 12 talik dars paketidan kalendar oyga o'tkazish va 01.09.2026 sanasiga prod ma'lumotini ko'chirish — migratsiyadan oldin real ma'lumot bilan majburiy hisobot chiqarib.

**Architecture:** `Course.paymentModel` yangi maydoni ikki yo'lni ajratadi. `LESSON_PACK` yo'li (mavjud prepaid/sikl mexanizmi) **umuman tegilmaydi**. `MONTHLY` yo'lida har yozilish uchun oyiga bitta `EnrollmentMonthlyCharge` qatori yaratiladi — u dars sonini, dars narxini va oy narxini muzlatib saqlaydi. Davomat balansga tegmaydi; u faqat o'qituvchi haqini va uzrli dars kreditini boshqaradi. Arifmetika sof funksiyalarga ajratiladi (`monthly-price.ts`, `planned-lessons.ts`) — `lesson-price.ts` da o'rnashgan amaliyot.

**Tech Stack:** NestJS 11, Prisma 7 (Neon Postgres), Jest, `@nestjs/schedule` cron, ts-node skriptlar.

## Global Constraints

- **Til:** butun foydalanuvchi matni lotin o'zbekchada. Kirill yoki arab harflari ishlatilmaydi.
- **Migratsiya:** `npx prisma migrate dev` bu repoda **ishlamaydi** (P3006). Faqat `migrate diff` + `db execute` + `migrate resolve` yo'li (Task 1 da qadamma-qadam berilgan).
- **Pul yozuvi:** balansga tegadigan har qanday yozuv **faqat** `TransactionsWriteService` orqali. Servislar `client.student.update({ balance })` ni to'g'ridan-to'g'ri chaqirmaydi.
- **`Math.abs` taqiqi:** teskari qatorda `Math.abs` ishlatilmaydi — ADR-0004 (`docs/adr/0004-balans-haqiqati-ledgerda.md`). Teskari qator asl qatorning ishorasi bilan qarama-qarshi bo'lishi kerak.
- **Tranzaksiya:** balansga tegadigan har amal `Serializable` tranzaksiya ichida; `tx: Prisma.TransactionClient` parametri majburiy.
- **Filial qamrovi:** har yangi so'rov `branchId` bo'yicha fail-closed cheklanadi — ADR-0002.
- **Sanalar:** Toshkent vaqti (UTC+5, DST yo'q). Sof funksiyalar sanalarni `'YYYY-MM-DD'` satr sifatida oladi — `Date` obyekti bilan vaqt mintaqasi tuzog'iga tushmaslik uchun.
- **`LESSON_PACK` yo'li o'zgarmaydi.** Har PR dan keyin `npx jest src/billing` to'liq yashil bo'lishi shart.

---

## Fayl tuzilishi

**Yangi:**

| Fayl | Mas'uliyati |
|---|---|
| `server/src/billing/monthly-price.ts` | Sof arifmetika: dars narxi, proratsiya, kredit qo'llash |
| `server/src/billing/monthly-price.spec.ts` | Yuqoridagining testi |
| `server/src/billing/planned-lessons.ts` | Sof: oydagi dars kunlari ro'yxati (`exactDays` − bayram − bekor) |
| `server/src/billing/planned-lessons.spec.ts` | Yuqoridagining testi |
| `server/src/billing/monthly-charge.service.ts` | `EnrollmentMonthlyCharge` yaratish / teskari qilish / kredit yig'ish |
| `server/src/billing/monthly-charge.service.spec.ts` | Yuqoridagining testi |
| `server/src/billing/monthly-billing-cron.service.ts` | Oyning 1-kuni hisob yaratadi |
| `server/scripts/migrate-to-monthly.ts` | Migratsiya: `--dry-run` hisobot + `--apply` |
| `server/scripts/lib/monthly-migration-report.ts` | Hisobotni yasash va CSV yozish |

**O'zgaradi:**

| Fayl | O'zgarish |
|---|---|
| `server/prisma/schema.prisma` | `PaymentModel`, `MonthlyChargeStatus`, `Course.paymentModel`, `EnrollmentMonthlyCharge` |
| `server/src/transactions/transactions-write.service.ts` | `chargeMonthlyFee`, `reverseMonthlyFee` |
| `server/src/billing/lesson-billing.service.ts` | `processAttendanceBilling` da `MONTHLY` shoxi |
| `server/src/billing/lesson-coverage.helper.ts` | `MONTHLY_PERIOD` qatorlarini chetlab o'tish |
| `server/src/billing/billing.module.ts` | Yangi servislarni ro'yxatga olish |

---

### Task 1: Ma'lumot bazasi sxemasi

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260902120000_monthly_payment_model/migration.sql`

**Interfaces:**
- Produces: `PaymentModel` va `MonthlyChargeStatus` enumlari, `Course.paymentModel` maydoni, `EnrollmentMonthlyCharge` modeli — keyingi barcha tasklar shularga tayanadi.

- [ ] **Step 1: Sxemaga enumlarni qo'shish**

`server/prisma/schema.prisma`, `enum LessonDeductionMode` blokidan keyin:

```prisma
enum PaymentModel {
  LESSON_PACK // hozirgi: price / lessonPaymentCount
  MONTHLY // yangi: price = bir oy narxi
}

enum MonthlyChargeStatus {
  CHARGED
  REVERSED
}
```

- [ ] **Step 2: `Course` ga maydon qo'shish**

`model Course` ichida, `lessonPaymentCount` qatoridan keyin:

```prisma
  // MONTHLY da `price` bir OY narxi, `lessonPaymentCount` o'qilmaydi.
  // LESSON_PACK — mavjud xatti-harakat, hech narsa o'zgarmaydi.
  paymentModel       PaymentModel @default(LESSON_PACK)
```

- [ ] **Step 3: `EnrollmentMonthlyCharge` modelini qo'shish**

`model Enrollment` blokidan keyin:

```prisma
/// Oylik to'lov modelining yagona haqiqat manbasi: har yozilish, har oy
/// uchun bitta qator. plannedLessons/perLessonCost/monthlyPrice MUZLATILADI
/// — jadval oy o'rtasida o'zgarsa ham o'quvchining hisobi va o'qituvchining
/// haqi qimirlamaydi.
model EnrollmentMonthlyCharge {
  id           String     @id @default(uuid())
  enrollmentId String
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
  studentId    Int
  student      Student    @relation(fields: [studentId], references: [id])
  groupId      String
  group        Group      @relation(fields: [groupId], references: [id])
  branchId     Int
  branch       Branch     @relation(fields: [branchId], references: [id])
  companyId    Int
  company      Company    @relation(fields: [companyId], references: [id])

  periodYear  Int
  periodMonth Int

  plannedLessons Int
  perLessonCost  Int
  monthlyPrice   Int
  coveredLessons Int
  creditLessons  Int @default(0)
  creditAmount   Int @default(0)
  chargedAmount  Int

  /// Oy davomida to'planadi; keyingi oyning creditLessons'iga aylanadi.
  excusedLessons Int @default(0)

  status        MonthlyChargeStatus @default(CHARGED)
  transactionId String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([enrollmentId, periodYear, periodMonth])
  @@index([studentId, periodYear, periodMonth])
  @@index([groupId, periodYear, periodMonth])
  @@index([branchId, periodYear, periodMonth])
}
```

- [ ] **Step 4: Teskari munosabatlarni qo'shish**

Prisma teskari tomonni talab qiladi. Quyidagi qatorni tegishli modellarga qo'shing:

- `model Enrollment` ichiga: `monthlyCharges EnrollmentMonthlyCharge[]`
- `model Student` ichiga: `monthlyCharges EnrollmentMonthlyCharge[]`
- `model Group` ichiga: `monthlyCharges EnrollmentMonthlyCharge[]`
- `model Branch` ichiga: `monthlyCharges EnrollmentMonthlyCharge[]`
- `model Company` ichiga: `monthlyCharges EnrollmentMonthlyCharge[]`

- [ ] **Step 5: SQL farqini olish**

```bash
cd server
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/monthly-diff.sql
cat /tmp/monthly-diff.sql
```

- [ ] **Step 6: Farqni tozalash**

Dev bazada oldindan mavjud drift bor (`Branch.workingDays`, `Transaction_reversedAt_idx`, `TelegramGroup` FK). Faqat quyidagi to'rt turdagi qatorni qoldiring, qolganini **o'chiring**:

- `CREATE TYPE "PaymentModel"` va `CREATE TYPE "MonthlyChargeStatus"`
- `ALTER TABLE "Course" ADD COLUMN "paymentModel"`
- `CREATE TABLE "EnrollmentMonthlyCharge"`
- Unga tegishli `CREATE INDEX` / `CREATE UNIQUE INDEX` / `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`

Tozalangan faylni `server/prisma/migrations/20260902120000_monthly_payment_model/migration.sql` ga yozing.

- [ ] **Step 7: Dev bazaga qo'llash va ro'yxatga olish**

```bash
cd server
npx prisma db execute --file prisma/migrations/20260902120000_monthly_payment_model/migration.sql
npx prisma migrate resolve --applied 20260902120000_monthly_payment_model
npx prisma generate
```

- [ ] **Step 8: Tip tekshiruvi**

Run: `cd server && npx tsc -p tsconfig.check.json --noEmit`
Expected: PASS (xatosiz)

- [ ] **Step 9: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260902120000_monthly_payment_model/
git commit -m "Oylik to'lov: PaymentModel va EnrollmentMonthlyCharge sxemasi"
```

---

### Task 2: Oylik arifmetika (sof funksiyalar)

**Files:**
- Create: `server/src/billing/monthly-price.ts`
- Test: `server/src/billing/monthly-price.spec.ts`

**Interfaces:**
- Consumes: hech narsa (sof funksiyalar, Prisma'ga bog'liq emas)
- Produces:
  - `perLessonCostForMonth(monthlyPrice: number, plannedLessons: number): number`
  - `proratedMonthlyAmount(monthlyPrice: number, plannedLessons: number, coveredLessons: number): number`
  - `applyLessonCredit(grossAmount: number, perLessonCost: number, creditLessons: number): { creditLessonsUsed: number; creditAmount: number; chargedAmount: number; carriedCreditLessons: number }`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/billing/monthly-price.spec.ts`:

```ts
import {
  applyLessonCredit,
  perLessonCostForMonth,
  proratedMonthlyAmount,
} from './monthly-price';

describe('perLessonCostForMonth', () => {
  it('oy narxini o`sha oydagi dars soniga bo`ladi', () => {
    expect(perLessonCostForMonth(450_000, 13)).toBe(34_615);
    expect(perLessonCostForMonth(740_000, 22)).toBe(33_636);
  });

  it('dars soni yoki narx nol bo`lsa 0 qaytaradi', () => {
    expect(perLessonCostForMonth(450_000, 0)).toBe(0);
    expect(perLessonCostForMonth(0, 13)).toBe(0);
    expect(perLessonCostForMonth(450_000, -3)).toBe(0);
  });
});

describe('proratedMonthlyAmount', () => {
  it('to`liq oyda aynan oy narxini qaytaradi — yaxlitlash siljishi yo`q', () => {
    // 450 000 x 13/13 ni hisoblasak ham 450 000 chiqadi, lekin bu yo'l
    // umuman hisoblamaydi: to'liq oy = e'lon qilingan narx, nuqta.
    expect(proratedMonthlyAmount(450_000, 13, 13)).toBe(450_000);
    expect(proratedMonthlyAmount(740_000, 22, 22)).toBe(740_000);
  });

  it('o`rtada qo`shilganda qolgan darslarga proratsiya qiladi', () => {
    // 17.09 da keldi, sentabrda qolgan 5 dars, oyda jami 13
    expect(proratedMonthlyAmount(450_000, 13, 5)).toBe(173_077);
  });

  it('dars sonidan ortiq qoplamani oy narxi bilan cheklaydi', () => {
    // Jadval kengayib 14-dars o'tsa ham o'quvchi oy narxidan ortiq to'lamaydi.
    expect(proratedMonthlyAmount(450_000, 13, 14)).toBe(450_000);
  });

  it('nol yoki manfiy qoplamada 0 qaytaradi', () => {
    expect(proratedMonthlyAmount(450_000, 13, 0)).toBe(0);
    expect(proratedMonthlyAmount(450_000, 13, -2)).toBe(0);
  });
});

describe('applyLessonCredit', () => {
  it('uzrli darslar ulushini keyingi oy hisobidan chegiradi', () => {
    // Sentabrda 2 ta uzrli -> oktabr: 450 000 - 2 x 34 615 = 380 770
    const r = applyLessonCredit(450_000, 34_615, 2);
    expect(r.creditLessonsUsed).toBe(2);
    expect(r.creditAmount).toBe(69_230);
    expect(r.chargedAmount).toBe(380_770);
    expect(r.carriedCreditLessons).toBe(0);
  });

  it('krediti oy hisobidan katta bo`lsa ortiqchasini keyingi oyga suradi', () => {
    // 20 ta kredit dars, oy hisobi atigi 13 tasiga yetadi.
    const r = applyLessonCredit(450_000, 34_615, 20);
    expect(r.creditLessonsUsed).toBe(13);
    expect(r.creditAmount).toBe(449_995);
    expect(r.chargedAmount).toBe(5);
    expect(r.carriedCreditLessons).toBe(7);
  });

  it('chargedAmount hech qachon manfiy bo`lmaydi', () => {
    const r = applyLessonCredit(100_000, 34_615, 50);
    expect(r.chargedAmount).toBeGreaterThanOrEqual(0);
    expect(r.creditAmount).toBeLessThanOrEqual(100_000);
  });

  it('kredit yo`q bo`lsa hisobga tegmaydi', () => {
    const r = applyLessonCredit(450_000, 34_615, 0);
    expect(r.creditAmount).toBe(0);
    expect(r.chargedAmount).toBe(450_000);
    expect(r.carriedCreditLessons).toBe(0);
  });

  it('dars narxi 0 bo`lsa kreditni sarflamaydi, hammasini suradi', () => {
    const r = applyLessonCredit(450_000, 0, 3);
    expect(r.creditLessonsUsed).toBe(0);
    expect(r.chargedAmount).toBe(450_000);
    expect(r.carriedCreditLessons).toBe(3);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/billing/monthly-price.spec.ts`
Expected: FAIL — `Cannot find module './monthly-price'`

- [ ] **Step 3: Minimal implementatsiya**

`server/src/billing/monthly-price.ts`:

```ts
/**
 * Oylik to'lov arifmetikasi.
 *
 * `lesson-price.ts` paket narxini darslarga bo'lsa, bu modul teskarisini
 * qiladi: oy narxi e'lon qilingan raqam, dars narxi esa undan kelib
 * chiqadi. Shuning uchun to'liq oy HECH QACHON qayta hisoblanmaydi — u
 * aynan e'lon qilingan narx, aks holda 450 000 x 13/13 kabi ifodalar
 * yaxlitlashda bir-ikki so'm siljitib, sikl narxidagi qoldiq muammosini
 * boshqa nom bilan qaytarardi.
 *
 * Sof funksiyalar: hisob servisi Serializable tranzaksiya va qulflar
 * ichida ishlaydi, o'quvchidan qancha olinishini hal qiladigan arifmetika
 * esa ularsiz ham sinaladigan bo'lishi kerak.
 */

/** Oy narxining bitta darsga to'g'ri keladigan ulushi. */
export function perLessonCostForMonth(
  monthlyPrice: number,
  plannedLessons: number,
): number {
  if (plannedLessons <= 0 || monthlyPrice <= 0) return 0;
  return Math.round(monthlyPrice / plannedLessons);
}

/**
 * O'quvchi shu oy uchun qancha to'laydi.
 *
 * To'liq oyni o'taydigan o'quvchi aynan `monthlyPrice` to'laydi. Proratsiya
 * faqat o'rtada qo'shilganda ishlaydi — qolgan darslar ulushi.
 */
export function proratedMonthlyAmount(
  monthlyPrice: number,
  plannedLessons: number,
  coveredLessons: number,
): number {
  if (plannedLessons <= 0 || monthlyPrice <= 0) return 0;
  if (coveredLessons <= 0) return 0;
  if (coveredLessons >= plannedLessons) return monthlyPrice;
  return Math.round((monthlyPrice * coveredLessons) / plannedLessons);
}

export interface LessonCreditResult {
  /** Shu oyda sarflangan kredit darslari soni. */
  creditLessonsUsed: number;
  /** Ularning pul ifodasi. */
  creditAmount: number;
  /** Balansdan yechiladigan yakuniy summa — hech qachon manfiy emas. */
  chargedAmount: number;
  /** Sig'magani — keyingi oyga suriladi. */
  carriedCreditLessons: number;
}

/**
 * O'tgan oyning uzrli darslarini shu oy hisobidan chegiradi.
 *
 * Kredit BUTUN dars birligida sarflanadi: yarim dars chegirish o'quvchiga
 * tushuntirib bo'lmaydigan raqam yasaydi. Sig'magani kuymaydi — keyingi
 * oyga suriladi.
 */
export function applyLessonCredit(
  grossAmount: number,
  perLessonCost: number,
  creditLessons: number,
): LessonCreditResult {
  const credit = Math.max(0, Math.trunc(creditLessons));
  if (credit === 0 || perLessonCost <= 0 || grossAmount <= 0) {
    return {
      creditLessonsUsed: 0,
      creditAmount: 0,
      chargedAmount: Math.max(0, grossAmount),
      carriedCreditLessons: credit,
    };
  }

  const affordable = Math.floor(grossAmount / perLessonCost);
  const used = Math.min(credit, affordable);
  const creditAmount = used * perLessonCost;

  return {
    creditLessonsUsed: used,
    creditAmount,
    chargedAmount: grossAmount - creditAmount,
    carriedCreditLessons: credit - used,
  };
}
```

- [ ] **Step 4: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/billing/monthly-price.spec.ts`
Expected: PASS — 11 ta test

- [ ] **Step 5: Commit**

```bash
git add server/src/billing/monthly-price.ts server/src/billing/monthly-price.spec.ts
git commit -m "Oylik to'lov: oy narxi arifmetikasi (sof funksiyalar)"
```

---

### Task 3: Oydagi dars kunlarini sanash

**Files:**
- Create: `server/src/billing/planned-lessons.ts`
- Test: `server/src/billing/planned-lessons.spec.ts`

**Interfaces:**
- Consumes: hech narsa (sof)
- Produces:
  - `lessonDatesInMonth(params: LessonDatesParams): string[]` — `'YYYY-MM-DD'` ro'yxati
  - `type LessonDatesParams = { year: number; month: number; exactDays: string[]; excludedDates?: string[]; fromDate?: string | null; toDate?: string | null }`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/billing/planned-lessons.spec.ts`:

```ts
import { lessonDatesInMonth } from './planned-lessons';

// Prod'dagi ikkita haqiqiy jadval shakli.
const MON_WED_FRI = ['friday', 'monday', 'wednesday'];
const TUE_THU_SAT = ['saturday', 'thursday', 'tuesday'];
const FIVE_DAYS = ['friday', 'monday', 'thursday', 'tuesday', 'wednesday'];

describe('lessonDatesInMonth', () => {
  it('sentabr 2026 da haftada 3 kunlik guruhga 13 dars beradi', () => {
    // Prod o'lchovi: 45 guruhda aynan shu raqam chiqqan.
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: TUE_THU_SAT }),
    ).toHaveLength(13);
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: MON_WED_FRI }),
    ).toHaveLength(13);
  });

  it('sentabr 2026 da haftada 5 kunlik Intensive guruhga 22 dars beradi', () => {
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: FIVE_DAYS }),
    ).toHaveLength(22);
  });

  it('sanalarni o`sish tartibida, YYYY-MM-DD ko`rinishida qaytaradi', () => {
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
    });
    expect(dates[0]).toBe('2026-09-01'); // seshanba
    expect(dates[1]).toBe('2026-09-03'); // payshanba
    expect(dates[2]).toBe('2026-09-05'); // shanba
    expect([...dates].sort()).toEqual(dates);
  });

  it('bayram va bekor qilingan kunlarni chiqarib tashlaydi', () => {
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      excludedDates: ['2026-09-01', '2026-09-03'],
    });
    expect(dates).toHaveLength(11);
    expect(dates).not.toContain('2026-09-01');
    expect(dates).not.toContain('2026-09-03');
  });

  it('fromDate berilsa o`sha kundan boshlab sanaydi (o`rtada qo`shilgan)', () => {
    // 17.09.2026 — payshanba. Shu kundan oy oxirigacha qolgan darslar.
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      fromDate: '2026-09-17',
    });
    expect(dates[0]).toBe('2026-09-17');
    expect(dates).toHaveLength(5);
  });

  it('toDate berilsa o`sha kungacha sanaydi (o`rtada ketgan)', () => {
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      toDate: '2026-09-10',
    });
    expect(dates[dates.length - 1]).toBe('2026-09-10');
    expect(dates).toHaveLength(5);
  });

  it('fromDate oydan keyin bo`lsa bo`sh ro`yxat qaytaradi', () => {
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: TUE_THU_SAT,
        fromDate: '2026-10-05',
      }),
    ).toEqual([]);
  });

  it('exactDays bo`sh bo`lsa bo`sh ro`yxat qaytaradi', () => {
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: [] }),
    ).toEqual([]);
  });

  it('kun nomlarini registr va bo`shliqqa qaramay tanidi', () => {
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: [' Monday ', 'WEDNESDAY', 'friday'],
      }),
    ).toHaveLength(13);
  });

  it('fevral kabi qisqa oyni to`g`ri sanaydi', () => {
    // 2028 — kabisa yili, fevral 29 kun.
    expect(
      lessonDatesInMonth({ year: 2028, month: 2, exactDays: MON_WED_FRI }),
    ).toHaveLength(13);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/billing/planned-lessons.spec.ts`
Expected: FAIL — `Cannot find module './planned-lessons'`

- [ ] **Step 3: Minimal implementatsiya**

`server/src/billing/planned-lessons.ts`:

```ts
/**
 * Bir oyda guruhda nechta dars bo'lishi.
 *
 * Oylik to'lovda bu raqam narxni belgilaydi (oy narxi / dars soni), shuning
 * uchun u sof funksiya bo'lishi va vaqt mintaqasidan mustaqil sinalishi
 * kerak. Sanalar `Date` emas, `'YYYY-MM-DD'` satr sifatida kiradi va
 * chiqadi: baza Toshkent yarim tunini UTC da saqlaydi, `Date` bilan
 * solishtirish esa serverning mintaqasiga qarab bir kun siljib ketardi.
 */

/** `Group.exactDays` da saqlanadigan kun nomlari, JS getUTCDay tartibida. */
export const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export interface LessonDatesParams {
  year: number;
  /** 1–12. */
  month: number;
  /** `Group.exactDays` — registr va bo'shliqqa e'tibor berilmaydi. */
  exactDays: string[];
  /** Bayramlar va bekor qilingan darslar: 'YYYY-MM-DD'. */
  excludedDates?: string[];
  /** Shu kundan boshlab (o'rtada qo'shilgan o'quvchi). Kiritiladi. */
  fromDate?: string | null;
  /** Shu kungacha (o'rtada ketgan o'quvchi). Kiritiladi. */
  toDate?: string | null;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Oydagi dars kunlari, o'sish tartibida. */
export function lessonDatesInMonth(params: LessonDatesParams): string[] {
  const { year, month } = params;
  if (month < 1 || month > 12) return [];

  const wanted = new Set(
    params.exactDays.map((d) => d.trim().toLowerCase()).filter(Boolean),
  );
  if (wanted.size === 0) return [];

  const excluded = new Set(params.excludedDates ?? []);
  const from = params.fromDate || null;
  const to = params.toDate || null;

  // 0-kun = keyingi oyning nol-kuni = shu oyning oxirgi kuni.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const out: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = iso(year, month, day);
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (excluded.has(date)) continue;

    const weekday = WEEKDAY_KEYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
    if (wanted.has(weekday)) out.push(date);
  }
  return out;
}
```

- [ ] **Step 4: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/billing/planned-lessons.spec.ts`
Expected: PASS — 10 ta test

- [ ] **Step 5: Prod raqamlariga qarshi tekshirish**

Testdagi 13 va 22 raqamlari `_probe-sep-lessoncount.ts` prod o'lchovidan olingan (45 guruhda 13 dars, Intensive'da 22). Agar test boshqa raqam bersa — implementatsiya noto'g'ri, testni o'zgartirmang.

- [ ] **Step 6: Commit**

```bash
git add server/src/billing/planned-lessons.ts server/src/billing/planned-lessons.spec.ts
git commit -m "Oylik to'lov: oydagi dars kunlarini sanash (sof funksiya)"
```

---

### Task 4: Oylik to'lovni ledgerga yozish

**Files:**
- Modify: `server/src/transactions/transactions-write.service.ts` (`recordLessonConsumption` dan oldin, ~259-qator)
- Modify: `server/src/billing/lesson-coverage.helper.ts:104`
- Test: `server/src/transactions/transactions-write.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 dagi `EnrollmentMonthlyCharge`
- Produces:
  - `TransactionsWriteService.chargeMonthlyFee(params, tx?): Promise<Transaction>`
  - `TransactionsWriteService.reverseMonthlyFee(params, tx?): Promise<Transaction>`
  - Metadata belgisi: `{ mode: 'MONTHLY_PERIOD', period: 'YYYY-MM', ... }`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/transactions/transactions-write.service.spec.ts` oxiriga:

```ts
describe('chargeMonthlyFee', () => {
  it('oylik to`lovni manfiy summa bilan LESSON_DEDUCTION sifatida yozadi', async () => {
    // Oylik qator mavjud hisobot va qarz so'rovlarini buzmasligi uchun
    // ataylab LESSON_DEDUCTION turida yoziladi — metadata bilan ajratiladi.
    const tx = await service.chargeMonthlyFee({
      studentId: 10453,
      amount: 450_000,
      enrollmentId: 'enr-1',
      companyId: 1,
      branchId: 1,
      periodYear: 2026,
      periodMonth: 9,
      monthlyPrice: 450_000,
      plannedLessons: 13,
      coveredLessons: 13,
      perLessonCost: 34_615,
      creditLessons: 0,
    });

    expect(tx.type).toBe('LESSON_DEDUCTION');
    expect(tx.amount).toBe(-450_000);
    expect(tx.attendanceId).toBeNull();
    expect(tx.metadata).toMatchObject({
      mode: 'MONTHLY_PERIOD',
      period: '2026-09',
      perLessonCost: 34_615,
      plannedLessons: 13,
    });
  });

  it('metadataga lessonsCovered YOZMAYDI — sikl dvigateli uni yutib yubormasligi uchun', async () => {
    // lesson-coverage.helper `lessonsCovered` bo'yicha sikl ochilganini
    // aniqlaydi. Oylik qatorda u bo'lsa, qoplama hisobi buzilardi.
    const written = await service.chargeMonthlyFee({
      studentId: 10453,
      amount: 450_000,
      enrollmentId: 'enr-1',
      companyId: 1,
      periodYear: 2026,
      periodMonth: 9,
      monthlyPrice: 450_000,
      plannedLessons: 13,
      coveredLessons: 13,
      perLessonCost: 34_615,
      creditLessons: 0,
    });
    expect(Object.keys(written.metadata as object)).not.toContain(
      'lessonsCovered',
    );
  });

  it('summa 0 bo`lsa ham qator yozadi — kredit oyni to`liq yopgani ko`rinishi kerak', async () => {
    const tx = await service.chargeMonthlyFee({
      studentId: 10453,
      amount: 0,
      enrollmentId: 'enr-1',
      companyId: 1,
      periodYear: 2026,
      periodMonth: 10,
      monthlyPrice: 450_000,
      plannedLessons: 13,
      coveredLessons: 13,
      perLessonCost: 34_615,
      creditLessons: 13,
    });
    expect(tx.amount).toBe(0);
    expect(tx.balanceBefore).toBe(tx.balanceAfter);
  });

  it('manfiy summani rad etadi', async () => {
    await expect(
      service.chargeMonthlyFee({
        studentId: 10453,
        amount: -1,
        enrollmentId: 'enr-1',
        companyId: 1,
        periodYear: 2026,
        periodMonth: 9,
        monthlyPrice: 450_000,
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615,
        creditLessons: 0,
      }),
    ).rejects.toThrow();
  });
});

describe('reverseMonthlyFee', () => {
  it('asl qatorning teskarisini yozadi — Math.abs ishlatmasdan', async () => {
    // ADR-0004: teskari qator asl qatorning ishorasidan kelib chiqadi.
    const original = { id: 'tx-1', amount: -450_000 };
    const rev = await service.reverseMonthlyFee({
      transactionId: original.id,
      companyId: 1,
      reason: 'Oylikka o`tish migratsiyasi',
    });
    expect(rev.amount).toBe(450_000);
    expect(rev.reversedTransactionId).toBe('tx-1');
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/transactions/transactions-write.service.spec.ts -t "chargeMonthlyFee"`
Expected: FAIL — `service.chargeMonthlyFee is not a function`

- [ ] **Step 3: `chargeMonthlyFee` ni yozish**

`server/src/transactions/transactions-write.service.ts`, `recordLessonConsumption` dan oldin:

```ts
  /**
   * Bir oylik to'lovni balansdan yechish.
   *
   * Ataylab `LESSON_DEDUCTION` turida yoziladi: qarz, hisobot va kassa
   * so'rovlarining o'nlab joyi shu turga tayanadi, yangi tur qo'shish
   * ularning hammasini qayta yozishni talab qilardi. Oylik qatorni
   * `metadata.mode === 'MONTHLY_PERIOD'` ajratib turadi.
   *
   * `lessonsCovered` metadataga ATAYLAB yozilmaydi — `lesson-coverage.helper`
   * o'sha kalit bo'yicha "sikl ochildi" deb hisoblaydi va oylik qatorni
   * paket sikliga aylantirib yuborardi.
   */
  async chargeMonthlyFee(
    params: {
      studentId: number;
      /** Balansdan yechiladigan summa; 0 bo'lishi mumkin, manfiy emas. */
      amount: number;
      enrollmentId: string;
      companyId: number;
      branchId?: number;
      periodYear: number;
      periodMonth: number;
      monthlyPrice: number;
      plannedLessons: number;
      coveredLessons: number;
      perLessonCost: number;
      creditLessons: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    if (!Number.isFinite(params.amount) || params.amount < 0) {
      throw new BadRequestException(
        `Oylik to'lov summasi manfiy bo'lishi mumkin emas: ${params.amount}`,
      );
    }

    return this.runInTx(async (client) => {
      const student = await this.lockStudent(client, params.studentId);
      const balanceBefore = student.balance;
      const balanceAfter = balanceBefore - params.amount;
      const branchId = await this.branchForStudent(
        client,
        params.studentId,
        params.companyId,
        params.branchId,
      );

      const period = `${params.periodYear}-${String(params.periodMonth).padStart(2, '0')}`;

      const transaction = await client.transaction.create({
        data: {
          type: TransactionType.LESSON_DEDUCTION,
          amount: -params.amount,
          balanceBefore,
          balanceAfter,
          studentId: params.studentId,
          enrollmentId: params.enrollmentId,
          branchId,
          companyId: params.companyId,
          description: `${MONTH_NAMES_UZ[params.periodMonth - 1]} ${params.periodYear} oylik to'lovi`,
          metadata: {
            mode: 'MONTHLY_PERIOD',
            period,
            monthlyPrice: params.monthlyPrice,
            plannedLessons: params.plannedLessons,
            coveredLessons: params.coveredLessons,
            perLessonCost: params.perLessonCost,
            creditLessons: params.creditLessons,
          },
        },
      });

      if (balanceAfter !== balanceBefore) {
        await client.student.update({
          where: { id: params.studentId },
          data: { balance: balanceAfter },
        });
      }

      return transaction;
    }, tx);
  }
```

Fayl boshiga oy nomlarini qo'shing (agar allaqachon yo'q bo'lsa):

```ts
const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
] as const;
```

`BadRequestException` importini `@nestjs/common` dan qo'shing (agar yo'q bo'lsa).

- [ ] **Step 4: `reverseMonthlyFee` ni yozish**

Xuddi shu faylda, `chargeMonthlyFee` dan keyin:

```ts
  /**
   * Oylik to'lov qatorini teskari qilish (o'quvchi ketdi, migratsiya, tuzatish).
   *
   * Teskari summa asl qatorning ishorasidan kelib chiqadi — `Math.abs`
   * ishlatilmaydi (ADR-0004). Asl qator manfiy edi, teskarisi musbat.
   */
  async reverseMonthlyFee(
    params: {
      transactionId: string;
      companyId: number;
      reason: string;
      performedById?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.runInTx(async (client) => {
      const original = await client.transaction.findFirst({
        where: {
          id: params.transactionId,
          companyId: params.companyId,
          reversedAt: null,
        },
      });
      if (!original) {
        throw new NotFoundException(
          `Teskari qilinadigan oylik to'lov topilmadi: ${params.transactionId}`,
        );
      }
      if (!original.studentId) {
        throw new BadRequestException(
          `Oylik to'lov qatorida o'quvchi yo'q: ${params.transactionId}`,
        );
      }

      const student = await this.lockStudent(client, original.studentId);
      const balanceBefore = student.balance;
      // Asl qator manfiy -> teskarisi musbat. Ishora asl qatordan olinadi.
      const reversalAmount = -original.amount;
      const balanceAfter = balanceBefore + reversalAmount;

      const reversal = await client.transaction.create({
        data: {
          type: original.type,
          amount: reversalAmount,
          balanceBefore,
          balanceAfter,
          studentId: original.studentId,
          enrollmentId: original.enrollmentId,
          branchId: original.branchId,
          companyId: params.companyId,
          description: `Bekor qilindi: ${params.reason}`,
          reversedTransactionId: original.id,
          reversedById: params.performedById,
          metadata: original.metadata ?? undefined,
        },
      });

      await client.transaction.update({
        where: { id: original.id },
        data: { reversedAt: new Date(), reversedById: params.performedById },
      });

      if (balanceAfter !== balanceBefore) {
        await client.student.update({
          where: { id: original.studentId },
          data: { balance: balanceAfter },
        });
      }

      return reversal;
    }, tx);
  }
```

- [ ] **Step 5: Sikl dvigatelini oylik qatorlardan himoya qilish**

`server/src/billing/lesson-coverage.helper.ts`, 104-qatordagi `if (tx.type === TransactionType.LESSON_DEDUCTION) {` blokining eng boshiga:

```ts
      if (tx.type === TransactionType.LESSON_DEDUCTION) {
        const md = (tx.metadata ?? {}) as Record<string, unknown>;
        // Oylik to'lov qatori sikl OCHMAYDI — u butun oyni qoplaydi va
        // dars birligida sanalmaydi. Bu tekshiruvsiz oylik qator paket
        // sikliga aylanib, qoplama hisobini buzardi.
        if (md.mode === 'MONTHLY_PERIOD') continue;
```

(Mavjud `const md = ...` qatori bo'lsa, uni takrorlamang — faqat `if (md.mode === 'MONTHLY_PERIOD') continue;` ni qo'shing.)

- [ ] **Step 6: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/transactions/transactions-write.service.spec.ts src/billing/lesson-coverage.helper.spec.ts`
Expected: PASS — yangi testlar o'tadi, mavjud coverage testlari ham yashil qoladi

- [ ] **Step 7: Commit**

```bash
git add server/src/transactions/transactions-write.service.ts server/src/transactions/transactions-write.service.spec.ts server/src/billing/lesson-coverage.helper.ts
git commit -m "Oylik to'lov: ledger yozuvi va sikl dvigatelidan himoya"
```

---

### Task 5: `MonthlyChargeService` — oylik hisob yaratish

**Files:**
- Create: `server/src/billing/monthly-charge.service.ts`
- Test: `server/src/billing/monthly-charge.service.spec.ts`
- Modify: `server/src/billing/billing.module.ts`

**Interfaces:**
- Consumes: Task 2 (`perLessonCostForMonth`, `proratedMonthlyAmount`, `applyLessonCredit`), Task 3 (`lessonDatesInMonth`), Task 4 (`chargeMonthlyFee`, `reverseMonthlyFee`)
- Produces:
  - `MonthlyChargeService.createChargeForEnrollment(tx, params): Promise<EnrollmentMonthlyCharge | null>`
  - `MonthlyChargeService.createChargesForPeriod(params): Promise<{ created: number; skipped: number; totalCharged: number }>`
  - `MonthlyChargeService.recordExcusedLesson(tx, params): Promise<void>`
  - `MonthlyChargeService.findChargeForLesson(tx, enrollmentId, lessonDate): Promise<EnrollmentMonthlyCharge | null>`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/billing/monthly-charge.service.spec.ts`:

```ts
import { MonthlyChargeService } from './monthly-charge.service';

const enrollment = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'enr-1',
  studentId: 10453,
  groupId: 'grp-1',
  status: 'ACTIVE',
  startDate: null,
  group: {
    id: 'grp-1',
    branchId: 1,
    companyId: 1,
    statusEnum: 'ACTIVE',
    exactDays: ['saturday', 'thursday', 'tuesday'],
    course: { price: 450_000, paymentModel: 'MONTHLY', lessonPaymentCount: 12 },
  },
  ...over,
});

describe('MonthlyChargeService.createChargeForEnrollment', () => {
  it('to`liq oyda oy narxini muzlatilgan dars soni bilan yozadi', async () => {
    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment(),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });

    expect(charge).toMatchObject({
      plannedLessons: 13,
      coveredLessons: 13,
      perLessonCost: 34_615,
      monthlyPrice: 450_000,
      chargedAmount: 450_000,
      creditLessons: 0,
      status: 'CHARGED',
    });
  });

  it('o`rtada qo`shilgan o`quvchiga qolgan darslar bo`yicha proratsiya qiladi', async () => {
    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment({ startDate: new Date('2026-09-17T00:00:00Z') }),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });

    expect(charge?.plannedLessons).toBe(13); // guruhning oyi o'zgarmaydi
    expect(charge?.coveredLessons).toBe(5); // o'quvchining ulushi
    expect(charge?.chargedAmount).toBe(173_077);
  });

  it('o`tgan oyning uzrli darslarini kredit sifatida chegiradi', async () => {
    // Sentabr hisobida excusedLessons = 2 turibdi.
    prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce({
      excusedLessons: 2,
      perLessonCost: 34_615,
    });

    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment(),
      periodYear: 2026,
      periodMonth: 10,
      companyId: 1,
    });

    expect(charge?.creditLessons).toBe(2);
    expect(charge?.creditAmount).toBe(69_230);
    expect(charge?.chargedAmount).toBe(380_770);
  });

  it('LESSON_PACK kursini butunlay chetlab o`tadi', async () => {
    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment({
        group: {
          ...enrollment().group,
          course: { price: 450_000, paymentModel: 'LESSON_PACK', lessonPaymentCount: 12 },
        },
      }),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });
    expect(charge).toBeNull();
  });

  it('PAUSED guruhga hisob yozmaydi', async () => {
    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment({
        group: { ...enrollment().group, statusEnum: 'PAUSED' },
      }),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });
    expect(charge).toBeNull();
  });

  it('FROZEN yozilishga hisob yozmaydi', async () => {
    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment({ status: 'FROZEN' }),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });
    expect(charge).toBeNull();
  });

  it('oyda birorta dars bo`lmasa hisob yozmaydi', async () => {
    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment({
        group: { ...enrollment().group, exactDays: [] },
      }),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });
    expect(charge).toBeNull();
  });

  it('ikkinchi marta chaqirilganda yangi qator yozmaydi (idempotent)', async () => {
    prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
      id: 'chg-1',
      status: 'CHARGED',
    });

    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment(),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });

    expect(charge?.id).toBe('chg-1');
    expect(txWriteMock.chargeMonthlyFee).not.toHaveBeenCalled();
  });

  it('bayram kunlarini rejadan chiqaradi va dars narxini oshiradi', async () => {
    prismaMock.holiday.findMany.mockResolvedValueOnce([
      { date: new Date('2026-09-01T00:00:00Z') },
    ]);

    const charge = await service.createChargeForEnrollment(tx, {
      enrollment: enrollment(),
      periodYear: 2026,
      periodMonth: 9,
      companyId: 1,
    });

    expect(charge?.plannedLessons).toBe(12);
    expect(charge?.perLessonCost).toBe(37_500); // 450 000 / 12
    expect(charge?.chargedAmount).toBe(450_000); // oy narxi o'zgarmaydi
  });
});

describe('MonthlyChargeService.recordExcusedLesson', () => {
  it('uzrli darsni o`sha oyning hisobiga qo`shadi', async () => {
    await service.recordExcusedLesson(tx, {
      enrollmentId: 'enr-1',
      lessonDate: new Date('2026-09-10T00:00:00Z'),
      delta: 1,
    });

    expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { excusedLessons: { increment: 1 } },
      }),
    );
  });

  it('tuzatishda (uzrli -> keldi) sanoqni kamaytiradi', async () => {
    await service.recordExcusedLesson(tx, {
      enrollmentId: 'enr-1',
      lessonDate: new Date('2026-09-10T00:00:00Z'),
      delta: -1,
    });

    expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { excusedLessons: { increment: -1 } },
      }),
    );
  });

  it('o`sha oyning hisobi topilmasa jim o`tadi', async () => {
    prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.recordExcusedLesson(tx, {
        enrollmentId: 'enr-1',
        lessonDate: new Date('2026-09-10T00:00:00Z'),
        delta: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
```

Mock qurilmasini fayl boshida `lesson-billing.service.spec.ts` dagi uslubda tuzing (`prismaMock`, `txWriteMock`, `service` — `beforeEach` da qayta yaratiladi).

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/billing/monthly-charge.service.spec.ts`
Expected: FAIL — `Cannot find module './monthly-charge.service'`

- [ ] **Step 3: Servisni yozish**

`server/src/billing/monthly-charge.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { EnrollmentStatus, GroupStatus, PaymentModel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsWriteService } from '../transactions/transactions-write.service';
import { lessonDatesInMonth } from './planned-lessons';
import {
  applyLessonCredit,
  perLessonCostForMonth,
  proratedMonthlyAmount,
} from './monthly-price';

/** Hisob yaratish uchun kerakli yozilish shakli. */
export interface ChargeableEnrollment {
  id: string;
  studentId: number;
  groupId: string;
  status: EnrollmentStatus;
  startDate: Date | null;
  group: {
    id: string;
    branchId: number;
    companyId: number;
    statusEnum: GroupStatus;
    exactDays: string[];
    course: { price: number; paymentModel: PaymentModel };
  };
}

/** `Date` -> Toshkent kunining 'YYYY-MM-DD' ko'rinishi. */
export function tashkentDay(date: Date): string {
  return new Date(date.getTime() + 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Oylik to'lov hisoblarini yaratadi va boshqaradi.
 *
 * Bu servis `EnrollmentMonthlyCharge` ni yozadigan YAGONA joy: dars narxi
 * ikki xil yo'l bilan hisoblanib, o'quvchi bilan o'qituvchi turli raqamga
 * qarab qolmasligi uchun.
 */
@Injectable()
export class MonthlyChargeService {
  private readonly logger = new Logger(MonthlyChargeService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsWrite: TransactionsWriteService,
  ) {}

  /**
   * Bitta yozilish uchun bir oylik hisob yaratadi va balansdan yechadi.
   *
   * `null` qaytaradi: kurs oylik emas, guruh/yozilish faol emas, yoki oyda
   * dars yo'q. Idempotent — hisob allaqachon bo'lsa o'shani qaytaradi.
   */
  async createChargeForEnrollment(
    tx: Prisma.TransactionClient,
    params: {
      enrollment: ChargeableEnrollment;
      periodYear: number;
      periodMonth: number;
      companyId: number;
      performedById?: number;
    },
  ) {
    const { enrollment: enr, periodYear, periodMonth } = params;

    if (enr.group.course.paymentModel !== PaymentModel.MONTHLY) return null;
    if (enr.status !== EnrollmentStatus.ACTIVE) return null;
    if (enr.group.statusEnum !== GroupStatus.ACTIVE) return null;

    const existing = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: enr.id,
          periodYear,
          periodMonth,
        },
      },
    });
    if (existing) return existing;

    const excludedDates = await this.excludedDates(
      tx,
      enr.groupId,
      periodYear,
      periodMonth,
    );

    // Guruhning oyi — narxni belgilaydi va MUZLATILADI.
    const groupDates = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
    });
    const plannedLessons = groupDates.length;
    if (plannedLessons === 0) return null;

    // O'quvchining ulushi — o'rtada qo'shilgan bo'lsa kamroq.
    const coveredLessons = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
      fromDate: enr.startDate ? tashkentDay(enr.startDate) : null,
    }).length;
    if (coveredLessons === 0) return null;

    const monthlyPrice = enr.group.course.price;
    const perLessonCost = perLessonCostForMonth(monthlyPrice, plannedLessons);
    const grossAmount = proratedMonthlyAmount(
      monthlyPrice,
      plannedLessons,
      coveredLessons,
    );

    const carried = await this.carriedCredit(tx, enr.id, periodYear, periodMonth);
    const credit = applyLessonCredit(grossAmount, perLessonCost, carried);

    const charge = await tx.enrollmentMonthlyCharge.create({
      data: {
        enrollmentId: enr.id,
        studentId: enr.studentId,
        groupId: enr.groupId,
        branchId: enr.group.branchId,
        companyId: params.companyId,
        periodYear,
        periodMonth,
        plannedLessons,
        perLessonCost,
        monthlyPrice,
        coveredLessons,
        creditLessons: credit.creditLessonsUsed,
        creditAmount: credit.creditAmount,
        chargedAmount: credit.chargedAmount,
        // Sig'magan kredit kuymaydi: keyingi oy uni ko'rishi uchun shu
        // oyning uzrli sanog'ida qoldiriladi.
        excusedLessons: credit.carriedCreditLessons,
      },
    });

    const transaction = await this.transactionsWrite.chargeMonthlyFee(
      {
        studentId: enr.studentId,
        amount: credit.chargedAmount,
        enrollmentId: enr.id,
        companyId: params.companyId,
        branchId: enr.group.branchId,
        periodYear,
        periodMonth,
        monthlyPrice,
        plannedLessons,
        coveredLessons,
        perLessonCost,
        creditLessons: credit.creditLessonsUsed,
      },
      tx,
    );

    return tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: { transactionId: transaction.id },
    });
  }

  /** O'tgan oyning sarflanmagan uzrli darslari. */
  private async carriedCredit(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<number> {
    const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
    const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;

    const prev = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId,
          periodYear: prevYear,
          periodMonth: prevMonth,
        },
      },
      select: { excusedLessons: true },
    });
    return Math.max(0, prev?.excusedLessons ?? 0);
  }

  /** Bayramlar + bekor qilingan darslar, 'YYYY-MM-DD' ro'yxati. */
  private async excludedDates(
    tx: Prisma.TransactionClient,
    groupId: string,
    year: number,
    month: number,
  ): Promise<string[]> {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const [holidays, cancellations] = await Promise.all([
      tx.holiday.findMany({
        where: { date: { gte: start, lt: end } },
        select: { date: true },
      }),
      tx.lessonCancellation.findMany({
        where: { groupId, date: { gte: start, lt: end }, deletedAt: null },
        select: { date: true },
      }),
    ]);

    return [
      ...holidays.map((h) => h.date.toISOString().slice(0, 10)),
      ...cancellations.map((c) => c.date.toISOString().slice(0, 10)),
    ];
  }

  /**
   * Uzrli dars sanog'ini o'sha dars tushgan oyning hisobiga yozadi.
   * `delta`: +1 uzrli bo'ldi, -1 tuzatish (uzrli -> keldi).
   */
  async recordExcusedLesson(
    tx: Prisma.TransactionClient,
    params: { enrollmentId: string; lessonDate: Date; delta: number },
  ): Promise<void> {
    const day = tashkentDay(params.lessonDate);
    const periodYear = Number(day.slice(0, 4));
    const periodMonth = Number(day.slice(5, 7));

    const charge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: params.enrollmentId,
          periodYear,
          periodMonth,
        },
      },
      select: { id: true },
    });
    if (!charge) return;

    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: { excusedLessons: { increment: params.delta } },
    });
  }

  /** Dars sanasiga to'g'ri keladigan oylik hisob (o'qituvchi haqi uchun). */
  async findChargeForLesson(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    lessonDate: Date,
  ) {
    const day = tashkentDay(lessonDate);
    return tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId,
          periodYear: Number(day.slice(0, 4)),
          periodMonth: Number(day.slice(5, 7)),
        },
      },
    });
  }
}
```

- [ ] **Step 4: Modulga ro'yxatga olish**

`server/src/billing/billing.module.ts` — `providers` va `exports` ro'yxatiga `MonthlyChargeService` ni qo'shing.

- [ ] **Step 5: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/billing/monthly-charge.service.spec.ts`
Expected: PASS — 11 ta test

- [ ] **Step 6: Commit**

```bash
git add server/src/billing/monthly-charge.service.ts server/src/billing/monthly-charge.service.spec.ts server/src/billing/billing.module.ts
git commit -m "Oylik to'lov: MonthlyChargeService (hisob yaratish va kredit)"
```

---

### Task 6: Davomat yo'lining `MONTHLY` shoxi

**Files:**
- Modify: `server/src/billing/lesson-billing.service.ts:93-105` (`processAttendanceBilling`)
- Test: `server/src/billing/lesson-billing.service.spec.ts`

**Interfaces:**
- Consumes: Task 5 (`MonthlyChargeService.recordExcusedLesson`, `findChargeForLesson`)
- Produces: `processAttendanceBilling` endi `MONTHLY` kursda balansga tegmaydi

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/billing/lesson-billing.service.spec.ts` oxiriga:

```ts
describe('MONTHLY kurs — davomat balansga tegmaydi', () => {
  it('PRESENT belgilanganda balansdan hech narsa yechmaydi', async () => {
    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: null,
      newStatus: 'PRESENT',
    }));

    expect(txWriteMock.deductLessonFee).not.toHaveBeenCalled();
    expect(txWriteMock.recordLessonConsumption).not.toHaveBeenCalled();
  });

  it('PRESENT belgilanganda o`qituvchiga muzlatilgan narx bo`yicha haq yozadi', async () => {
    monthlyChargeMock.findChargeForLesson.mockResolvedValue({
      id: 'chg-1',
      perLessonCost: 34_615,
      transactionId: 'tx-monthly-1',
    });

    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: null,
      newStatus: 'PRESENT',
    }));

    expect(accrualMock.createAccrual).toHaveBeenCalledWith(
      expect.objectContaining({
        perLessonCost: 34_615,
        deductionTransactionId: 'tx-monthly-1',
      }),
    );
  });

  it('ABSENT ham to`langan dars — o`qituvchi haqi yoziladi', async () => {
    // Dars o'tdi, o'quvchi kelmadi: oylik modelda ham dars hisoblanadi.
    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: null,
      newStatus: 'ABSENT',
    }));
    expect(accrualMock.createAccrual).toHaveBeenCalled();
  });

  it('EXCUSED da o`qituvchiga haq yozmaydi va kredit qo`shadi', async () => {
    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: null,
      newStatus: 'EXCUSED',
    }));

    expect(accrualMock.createAccrual).not.toHaveBeenCalled();
    expect(monthlyChargeMock.recordExcusedLesson).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ delta: 1 }),
    );
  });

  it('PRESENT -> EXCUSED tuzatishida haqni teskari qiladi va kredit qo`shadi', async () => {
    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: 'PRESENT',
      newStatus: 'EXCUSED',
    }));

    expect(accrualMock.reverseAccrualForAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'grp-1', studentId: 10453 }),
    );
    expect(monthlyChargeMock.recordExcusedLesson).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ delta: 1 }),
    );
  });

  it('EXCUSED -> PRESENT tuzatishida kreditni qaytarib oladi', async () => {
    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: 'EXCUSED',
      newStatus: 'PRESENT',
    }));

    expect(monthlyChargeMock.recordExcusedLesson).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ delta: -1 }),
    );
    expect(accrualMock.createAccrual).toHaveBeenCalled();
  });

  it('oylik hisob topilmasa ham o`qituvchi haqsiz qolmaydi', async () => {
    // Cron ishlamay qolgan holat: narx joyida hisoblanadi.
    monthlyChargeMock.findChargeForLesson.mockResolvedValue(null);

    await service.processAttendanceBilling(tx, monthlyParams({
      oldStatus: null,
      newStatus: 'PRESENT',
    }));

    expect(accrualMock.createAccrual).toHaveBeenCalledWith(
      expect.objectContaining({ perLessonCost: 34_615 }),
    );
  });
});

describe('LESSON_PACK kurs — eski yo`l o`zgarmaydi', () => {
  it('PRESENT da avvalgidek balansdan yechadi', async () => {
    await service.processAttendanceBilling(tx, packParams({
      oldStatus: null,
      newStatus: 'PRESENT',
    }));
    expect(txWriteMock.deductLessonFee).toHaveBeenCalled();
    expect(monthlyChargeMock.recordExcusedLesson).not.toHaveBeenCalled();
  });
});
```

`monthlyParams()` va `packParams()` yordamchilarini fayl boshida yozing: ular `ProcessAttendanceBillingParams` qaytaradi, farqi faqat kursning `paymentModel` i (mock'da `tx.enrollment.findUnique` qaytaradigan qiymat).

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/billing/lesson-billing.service.spec.ts -t "MONTHLY kurs"`
Expected: FAIL — oylik shoxi yo'q, `deductLessonFee` chaqirilgan bo'ladi

- [ ] **Step 3: Shoxlanishni yozish**

`server/src/billing/lesson-billing.service.ts`, `processAttendanceBilling` ni almashtiring:

```ts
  async processAttendanceBilling(
    tx: Prisma.TransactionClient,
    params: ProcessAttendanceBillingParams,
  ): Promise<void> {
    const paymentModel = await this.resolvePaymentModel(tx, params.enrollmentId);
    if (paymentModel === PaymentModel.MONTHLY) {
      await this.processMonthlyAttendance(tx, params);
      return;
    }

    const wasBillable =
      params.oldStatus !== null && BILLABLE.has(params.oldStatus);
    const isBillable = BILLABLE.has(params.newStatus);

    if (!wasBillable && isBillable) {
      await this.bill(tx, params);
    } else if (wasBillable && !isBillable) {
      await this.reverse(tx, params);
    }
    // Other transitions: no-op.
  }

  private async resolvePaymentModel(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
  ): Promise<PaymentModel> {
    const enr = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        group: { select: { course: { select: { paymentModel: true } } } },
      },
    });
    return enr?.group.course.paymentModel ?? PaymentModel.LESSON_PACK;
  }

  /**
   * Oylik kursda davomat BALANSGA TEGMAYDI — oy boshida to'langan.
   * Davomat faqat ikki narsani hal qiladi: o'qituvchi haq oladimi, va
   * uzrli dars keyingi oyga kredit bo'lib o'tadimi.
   */
  private async processMonthlyAttendance(
    tx: Prisma.TransactionClient,
    params: ProcessAttendanceBillingParams,
  ): Promise<void> {
    const wasBillable =
      params.oldStatus !== null && BILLABLE.has(params.oldStatus);
    const isBillable = BILLABLE.has(params.newStatus);
    if (wasBillable === isBillable) return;

    if (isBillable) {
      // Uzrli edi, endi dars hisoblanadi: kreditni qaytarib olamiz.
      if (params.oldStatus === AttendanceStatus.EXCUSED) {
        await this.monthlyChargeService.recordExcusedLesson(tx, {
          enrollmentId: params.enrollmentId,
          lessonDate: params.lessonDate,
          delta: -1,
        });
      }
      await this.accrueMonthlySalary(tx, params);
      return;
    }

    // Dars hisoblanardi, endi uzrli: haqni qaytarib, kredit yozamiz.
    // `reverseAccrualForAttendance` O'QITUVCHI bo'yicha ishlaydi
    // (`salary-accrual.service.ts:391`), shuning uchun darsning
    // o'qituvchilari avval aniqlanadi.
    const teacherIds = await this.resolveTeachersForLesson(
      tx,
      params.groupId,
      params.lessonDate,
    );
    for (const teacherId of teacherIds) {
      await this.salaryAccrualService.reverseAccrualForAttendance({
        teacherId,
        studentId: params.studentId,
        groupId: params.groupId,
        lessonDate: params.lessonDate,
        reversedById: params.performedById,
        reversalReason: 'Dars uzrli deb belgilandi',
        tx,
      });
    }
    await this.monthlyChargeService.recordExcusedLesson(tx, {
      enrollmentId: params.enrollmentId,
      lessonDate: params.lessonDate,
      delta: 1,
    });
  }

  /** Oylik kursda o'qituvchi haqi — narx muzlatilgan hisobdan olinadi. */
  private async accrueMonthlySalary(
    tx: Prisma.TransactionClient,
    params: ProcessAttendanceBillingParams,
  ): Promise<void> {
    const charge = await this.monthlyChargeService.findChargeForLesson(
      tx,
      params.enrollmentId,
      params.lessonDate,
    );

    let perLessonCost = charge?.perLessonCost ?? 0;
    let deductionTransactionId = charge?.transactionId ?? null;

    if (!charge) {
      // Zaxira yo'l: cron ishlamay qolgan bo'lsa ham o'qituvchi haqsiz
      // qolmaydi. Narx joyida hisoblanadi va ogohlantirish yoziladi.
      const fallback = await this.fallbackMonthlyPerLessonCost(tx, params);
      perLessonCost = fallback.perLessonCost;
      deductionTransactionId = null;
      this.logger.warn(
        `Oylik hisob topilmadi: enrollment=${params.enrollmentId} ` +
          `sana=${params.lessonDate.toISOString().slice(0, 10)} — ` +
          `o'qituvchi haqi ${perLessonCost} bo'yicha markaz hisobidan yozildi`,
      );
    }

    if (perLessonCost <= 0) return;

    const teacherIds = await this.resolveTeachersForLesson(
      tx,
      params.groupId,
      params.lessonDate,
    );
    for (const teacherId of teacherIds) {
      try {
        await this.salaryAccrualService.createAccrual({
          teacherId,
          studentId: params.studentId,
          groupId: params.groupId,
          attendanceId: params.attendanceId,
          lessonDate: params.lessonDate,
          perLessonCost,
          companyId: params.companyId,
          deductionTransactionId,
          // Hisob yo'q bo'lsa o'quvchi tomonidan qoplanmagan — markaz
          // qoplaydi, aks holda createAccrual null qaytarib chiqib ketardi.
          centerFunded: !charge,
          tx,
        });
      } catch (err) {
        this.logger.error(
          `Oylik salary accrual failed for teacher ${teacherId}`,
          err,
        );
      }
    }
  }

  private async fallbackMonthlyPerLessonCost(
    tx: Prisma.TransactionClient,
    params: ProcessAttendanceBillingParams,
  ): Promise<{ perLessonCost: number }> {
    const enr = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        group: {
          select: { exactDays: true, course: { select: { price: true } } },
        },
      },
    });
    if (!enr) return { perLessonCost: 0 };

    const day = tashkentDay(params.lessonDate);
    const planned = lessonDatesInMonth({
      year: Number(day.slice(0, 4)),
      month: Number(day.slice(5, 7)),
      exactDays: enr.group.exactDays,
    }).length;

    return {
      perLessonCost: perLessonCostForMonth(enr.group.course.price, planned),
    };
  }
```

Fayl boshiga importlarni qo'shing:

```ts
import { PaymentModel } from '@prisma/client';
import { MonthlyChargeService, tashkentDay } from './monthly-charge.service';
import { lessonDatesInMonth } from './planned-lessons';
import { perLessonCostForMonth } from './monthly-price';
```

Konstruktorga qo'shing: `private monthlyChargeService: MonthlyChargeService,`

- [ ] **Step 4: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/billing`
Expected: PASS — yangi 8 ta test o'tadi VA mavjud `LESSON_PACK` testlari yashil qoladi

- [ ] **Step 5: Commit**

```bash
git add server/src/billing/lesson-billing.service.ts server/src/billing/lesson-billing.service.spec.ts
git commit -m "Oylik to'lov: davomat balansga tegmaydi, uzrli dars kredit yozadi"
```

---

### Task 7: Oy boshi cron'i

**Files:**
- Create: `server/src/billing/monthly-billing-cron.service.ts`
- Test: `server/src/billing/monthly-billing-cron.service.spec.ts`
- Modify: `server/src/billing/billing.module.ts`
- Modify: `server/src/billing/monthly-charge.service.ts` (`createChargesForPeriod` qo'shiladi)

**Interfaces:**
- Consumes: Task 5 (`createChargeForEnrollment`)
- Produces: `MonthlyChargeService.createChargesForPeriod(params): Promise<{ created: number; skipped: number; totalCharged: number }>`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/billing/monthly-billing-cron.service.spec.ts`:

```ts
describe('MonthlyBillingCronService', () => {
  it('faqat oyning 1-kuni ishlaydi', async () => {
    jest.setSystemTime(new Date('2026-10-05T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).not.toHaveBeenCalled();
  });

  it('1-kuni joriy oy uchun hisob yaratadi', async () => {
    jest.setSystemTime(new Date('2026-10-01T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ periodYear: 2026, periodMonth: 10 }),
    );
  });

  it('bir kompaniya yiqilsa boshqasini to`xtatmaydi', async () => {
    jest.setSystemTime(new Date('2026-10-01T02:05:00+05:00'));
    monthlyChargeMock.createChargesForPeriod
      .mockRejectedValueOnce(new Error('baza yiqildi'))
      .mockResolvedValueOnce({ created: 5, skipped: 0, totalCharged: 2_250_000 });

    await expect(cron.chargeMonthlyFees()).resolves.toBeUndefined();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledTimes(2);
  });
});

describe('createChargesForPeriod', () => {
  it('har yozilishni alohida tranzaksiyada yozadi', async () => {
    // Bitta o'quvchi yiqilsa 370 tasi ham yiqilmasligi kerak.
    prismaMock.enrollment.findMany.mockResolvedValue([enrA, enrB, enrC]);
    createChargeSpy.mockRejectedValueOnce(new Error('B yiqildi'));

    const res = await service.createChargesForPeriod({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 10,
    });

    expect(res.created).toBe(2);
    expect(res.skipped).toBe(1);
  });

  it('yaratilgan hisoblarning summasini qaytaradi', async () => {
    const res = await service.createChargesForPeriod({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 10,
    });
    expect(res.totalCharged).toBe(900_000); // 2 x 450 000
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/billing/monthly-billing-cron.service.spec.ts`
Expected: FAIL — modul topilmaydi

- [ ] **Step 3: `createChargesForPeriod` ni qo'shish**

`server/src/billing/monthly-charge.service.ts` ga:

```ts
  /**
   * Bir kompaniyaning barcha oylik yozilishlariga bir oylik hisob yozadi.
   *
   * Har yozilish O'ZINING Serializable tranzaksiyasida ishlanadi: bitta
   * o'quvchidagi xato qolgan 369 tasini to'xtatmasligi kerak. Idempotent —
   * unique kalit takroriy yozuvni to'sadi, shuning uchun cron ikki marta
   * ishlasa ham zarar yo'q.
   */
  async createChargesForPeriod(params: {
    companyId: number;
    periodYear: number;
    periodMonth: number;
    performedById?: number;
  }): Promise<{ created: number; skipped: number; totalCharged: number }> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: {
          deletedAt: null,
          companyId: params.companyId,
          statusEnum: GroupStatus.ACTIVE,
          course: { paymentModel: PaymentModel.MONTHLY, deletedAt: null },
        },
        student: { deletedAt: null, status: 'ACTIVE' },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        startDate: true,
        group: {
          select: {
            id: true,
            branchId: true,
            companyId: true,
            statusEnum: true,
            exactDays: true,
            course: { select: { price: true, paymentModel: true } },
          },
        },
      },
    });

    let created = 0;
    let skipped = 0;
    let totalCharged = 0;

    for (const enr of enrollments) {
      try {
        const charge = await this.prisma.$transaction(
          (tx) =>
            this.createChargeForEnrollment(tx, {
              enrollment: enr as ChargeableEnrollment,
              periodYear: params.periodYear,
              periodMonth: params.periodMonth,
              companyId: params.companyId,
              performedById: params.performedById,
            }),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (charge) {
          created++;
          totalCharged += charge.chargedAmount;
        } else {
          skipped++;
        }
      } catch (err) {
        skipped++;
        this.logger.error(
          `Oylik hisob yozilmadi: enrollment=${enr.id} ` +
            `davr=${params.periodYear}-${params.periodMonth}`,
          err,
        );
      }
    }

    return { created, skipped, totalCharged };
  }
```

- [ ] **Step 4: Cron servisini yozish**

`server/src/billing/monthly-billing-cron.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyChargeService } from './monthly-charge.service';

/**
 * Oylik to'lovni oyning 1-kuni hisoblab, balansdan yechadi.
 *
 * Kunlik ishlaydi va "bugun 1-mi?" deb tekshiradi — `SalaryCronService`
 * bilan bir xil naqsh. Bu kelajakda hisoblash sanasini sozlamadan
 * o'zgartirish imkonini beradi, cron jadvalini qayta deploy qilmasdan.
 *
 * Vaqti 03:00 — oylik hisoblash cron'i (02:00) tugab, o'tgan oyni yopib
 * bo'lgach ishlaydi, aks holda ikkalasi bir davrga urishardi.
 */
@Injectable()
export class MonthlyBillingCronService {
  private readonly logger = new Logger(MonthlyBillingCronService.name);

  constructor(
    private prisma: PrismaService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async chargeMonthlyFees(): Promise<void> {
    const now = new Date();
    const tashkent = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    if (tashkent.getUTCDate() !== 1) return;

    const periodYear = tashkent.getUTCFullYear();
    const periodMonth = tashkent.getUTCMonth() + 1;

    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });

    for (const company of companies) {
      try {
        const res = await this.monthlyChargeService.createChargesForPeriod({
          companyId: company.id,
          periodYear,
          periodMonth,
        });
        this.logger.log(
          `Kompaniya ${company.id}: ${periodYear}-${periodMonth} oylik hisobi — ` +
            `${res.created} yozildi, ${res.skipped} o'tkazildi, ` +
            `jami ${res.totalCharged} so'm`,
        );
      } catch (error) {
        this.logger.error(
          `Kompaniya ${company.id}: oylik hisob yaratish yiqildi`,
          error,
        );
      }
    }
  }
}
```

- [ ] **Step 5: Modulga qo'shish**

`server/src/billing/billing.module.ts` — `providers` ga `MonthlyBillingCronService` ni qo'shing.

- [ ] **Step 6: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/billing`
Expected: PASS — barcha billing testlari

- [ ] **Step 7: Commit**

```bash
git add server/src/billing/monthly-billing-cron.service.ts server/src/billing/monthly-billing-cron.service.spec.ts server/src/billing/monthly-charge.service.ts server/src/billing/billing.module.ts
git commit -m "Oylik to'lov: oy boshi cron'i va davr bo'yicha hisob yaratish"
```

---

### Task 8: O'rtada qo'shilgan va ketgan o'quvchi

**Files:**
- Modify: `server/src/students/student-enrollment.service.ts` (yozilish yaratilgandan keyin)
- Modify: `server/src/billing/monthly-charge.service.ts` (`reverseChargeForDeparture` qo'shiladi)
- Test: `server/src/billing/monthly-charge.service.spec.ts`

**Interfaces:**
- Consumes: Task 5
- Produces: `MonthlyChargeService.reverseChargeForDeparture(tx, params): Promise<{ refunded: number } | null>`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/billing/monthly-charge.service.spec.ts` ga:

```ts
describe('reverseChargeForDeparture', () => {
  it('o`tmagan darslar ulushini balansga qaytaradi', async () => {
    // 20.09 da chiqdi. Sentabrda 13 dars, 9 tasi o'tgan, 4 tasi qolgan.
    prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
      id: 'chg-1',
      plannedLessons: 13,
      coveredLessons: 13,
      perLessonCost: 34_615,
      chargedAmount: 450_000,
      transactionId: 'tx-1',
      status: 'CHARGED',
    });

    const res = await service.reverseChargeForDeparture(tx, {
      enrollmentId: 'enr-1',
      departureDate: new Date('2026-09-20T00:00:00Z'),
      companyId: 1,
      reason: 'Guruhdan chiqdi',
    });

    expect(res?.refunded).toBe(138_460); // 4 x 34 615
  });

  it('oy oxirida chiqqanda hech narsa qaytarmaydi', async () => {
    const res = await service.reverseChargeForDeparture(tx, {
      enrollmentId: 'enr-1',
      departureDate: new Date('2026-09-30T00:00:00Z'),
      companyId: 1,
      reason: 'Guruhdan chiqdi',
    });
    expect(res).toBeNull();
  });

  it('qaytarilgan summa hech qachon yechilgandan ko`p bo`lmaydi', async () => {
    // Kredit tufayli faqat 5 so'm yechilgan oy: 4 dars ulushi undan katta.
    prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
      id: 'chg-1',
      plannedLessons: 13,
      coveredLessons: 13,
      perLessonCost: 34_615,
      chargedAmount: 5,
      transactionId: 'tx-1',
      status: 'CHARGED',
    });

    const res = await service.reverseChargeForDeparture(tx, {
      enrollmentId: 'enr-1',
      departureDate: new Date('2026-09-20T00:00:00Z'),
      companyId: 1,
      reason: 'Guruhdan chiqdi',
    });

    expect(res?.refunded).toBe(5);
  });

  it('hisob topilmasa null qaytaradi', async () => {
    prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue(null);
    const res = await service.reverseChargeForDeparture(tx, {
      enrollmentId: 'enr-1',
      departureDate: new Date('2026-09-20T00:00:00Z'),
      companyId: 1,
      reason: 'Guruhdan chiqdi',
    });
    expect(res).toBeNull();
  });
});

describe('o`rtada qo`shilgan o`quvchi', () => {
  it('yozilish yaratilganda darhol hisob yoziladi — cronni kutmaydi', async () => {
    // 17.09 da qo'shildi: sentabr hisobi o'sha zahoti chiqishi kerak,
    // aks holda oktabrgacha bepul o'qib yurardi.
    await enrollmentService.enroll({ /* ... */ });
    expect(monthlyChargeMock.createChargeForEnrollment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodYear: 2026, periodMonth: 9 }),
    );
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest src/billing/monthly-charge.service.spec.ts -t "reverseChargeForDeparture"`
Expected: FAIL — `service.reverseChargeForDeparture is not a function`

- [ ] **Step 3: `reverseChargeForDeparture` ni yozish**

`server/src/billing/monthly-charge.service.ts` ga:

```ts
  /**
   * O'quvchi oy o'rtasida ketdi: o'tmagan darslar ulushini balansga qaytaradi.
   *
   * Butun oy hisobi teskari qilinmaydi — o'tgan darslar to'langan bo'lib
   * qolishi kerak. Faqat qolgan darslar ulushi qaytariladi va qaytariladigan
   * summa hech qachon yechilgandan oshmaydi (kredit tufayli oz yechilgan oy).
   */
  async reverseChargeForDeparture(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      departureDate: Date;
      companyId: number;
      reason: string;
      performedById?: number;
    },
  ): Promise<{ refunded: number } | null> {
    const day = tashkentDay(params.departureDate);
    const periodYear = Number(day.slice(0, 4));
    const periodMonth = Number(day.slice(5, 7));

    const charge = await tx.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: {
          enrollmentId: params.enrollmentId,
          periodYear,
          periodMonth,
        },
      },
    });
    if (!charge || charge.status !== 'CHARGED') return null;

    const enr = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        studentId: true,
        group: { select: { branchId: true, exactDays: true } },
      },
    });
    if (!enr) return null;

    const excludedDates = await this.excludedDates(
      tx,
      charge.groupId,
      periodYear,
      periodMonth,
    );

    // Ketgan kundan KEYINGI darslar — ketgan kunning o'zi o'tgan hisoblanadi.
    const remaining = lessonDatesInMonth({
      year: periodYear,
      month: periodMonth,
      exactDays: enr.group.exactDays,
      excludedDates,
    }).filter((d) => d > day).length;

    if (remaining === 0) return null;

    const refunded = Math.min(
      remaining * charge.perLessonCost,
      charge.chargedAmount,
    );
    if (refunded <= 0) return null;

    await this.transactionsWrite.createAdjustment(
      {
        studentId: enr.studentId,
        amount: refunded,
        companyId: params.companyId,
        branchId: enr.group.branchId,
        description: `${params.reason} — o'tmagan ${remaining} dars qaytarildi`,
        performedById: params.performedById,
      },
      tx,
    );

    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: {
        coveredLessons: charge.coveredLessons - remaining,
        chargedAmount: charge.chargedAmount - refunded,
      },
    });

    return { refunded };
  }
```

`createAdjustment` ning aniq parametr shakli `transactions-write.service.ts:766` da — uni ochib, chaqiruvni o'sha imzoga moslang.

- [ ] **Step 4: Yozilish yaratilganda hisobni chaqirish**

`server/src/students/student-enrollment.service.ts` — yozilish yaratilgan tranzaksiyaning oxirida, `startDate` o'rnatilgandan keyin:

```ts
    // Oylik kursda o'rtada qo'shilgan o'quvchi cronni kutmaydi: uning
    // proratsiya qilingan hisobi shu zahoti yoziladi.
    const now = new Date();
    const tashkent = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    await this.monthlyChargeService.createChargeForEnrollment(tx, {
      enrollment: createdEnrollment as ChargeableEnrollment,
      periodYear: tashkent.getUTCFullYear(),
      periodMonth: tashkent.getUTCMonth() + 1,
      companyId: params.companyId,
      performedById: params.performedById,
    });
```

(`createChargeForEnrollment` oylik bo'lmagan kursda `null` qaytaradi, shuning uchun `LESSON_PACK` yo'liga ta'sir qilmaydi.)

- [ ] **Step 5: Chiqish yo'liga ulash**

`student-enrollment.service.ts:467` atrofidagi `DROPPED` kaskadida, `refundPrepaidToBalance` chaqiruvi yonida `reverseChargeForDeparture` ni qo'shing. Ikkalasi bir-birini istisno qiladi: prepaid faqat `LESSON_PACK` da, oylik hisob faqat `MONTHLY` da to'ladi.

- [ ] **Step 6: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest src/billing src/students`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/billing/monthly-charge.service.ts server/src/billing/monthly-charge.service.spec.ts server/src/students/student-enrollment.service.ts
git commit -m "Oylik to'lov: o'rtada qo'shilgan va ketgan o'quvchi"
```

---

### Task 9: Migratsiya hisoboti (`--dry-run`)

**Files:**
- Create: `server/scripts/lib/monthly-migration-report.ts`
- Create: `server/scripts/migrate-to-monthly.ts`
- Test: `server/scripts/lib/monthly-migration-report.spec.ts`

**Interfaces:**
- Consumes: Task 2, Task 3
- Produces:
  - `buildMigrationPlan(input: MigrationInput): MigrationPlan`
  - `renderSummary(plan: MigrationPlan): string`
  - `renderStudentCsv(plan: MigrationPlan): string`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/scripts/lib/monthly-migration-report.spec.ts`:

```ts
import { buildMigrationPlan } from './monthly-migration-report';

const row = (over = {}) => ({
  enrollmentId: 'enr-1',
  studentId: 10453,
  studentName: 'Aziz Karimov',
  groupId: 'grp-1',
  groupName: '#031',
  branchId: 1,
  balance: -120_000,
  prepaidLessons: 5,
  packPerLessonCost: 37_500,
  monthlyPrice: 450_000,
  plannedLessons: 13,
  coveredLessons: 13,
  ...over,
});

describe('buildMigrationPlan', () => {
  it('har o`quvchi uchun uch qadamli balans yo`lini hisoblaydi', () => {
    const plan = buildMigrationPlan({ rows: [row()], reversedDeductions: {} });
    const s = plan.students[0];

    expect(s.oldBalance).toBe(-120_000);
    expect(s.prepaidRefund).toBe(187_500); // 5 x 37 500
    expect(s.monthlyCharge).toBe(450_000);
    expect(s.newBalance).toBe(-382_500);
  });

  it('yakuniy balans = eski + prepaid - oylik (har qatorda)', () => {
    const plan = buildMigrationPlan({
      rows: [row(), row({ enrollmentId: 'enr-2', studentId: 10231, balance: 340_000, prepaidLessons: 0 })],
      reversedDeductions: {},
    });
    for (const s of plan.students) {
      expect(s.newBalance).toBe(s.oldBalance + s.prepaidRefund - s.monthlyCharge);
    }
  });

  it('02.09 da yechilgan pulni ham qaytarilganlar qatoriga qo`shadi', () => {
    const plan = buildMigrationPlan({
      rows: [row()],
      reversedDeductions: { 10453: 37_500 },
    });
    expect(plan.students[0].reversedSeptember).toBe(37_500);
    expect(plan.students[0].newBalance).toBe(-345_000);
  });

  it('o`quvchilarni uch holatga ajratadi', () => {
    const plan = buildMigrationPlan({
      rows: [
        row({ balance: 900_000, prepaidLessons: 0 }), // to'liq yopadi
        row({ enrollmentId: 'e2', studentId: 2, balance: 0, prepaidLessons: 0 }), // shu oy kutilmoqda
        row({ enrollmentId: 'e3', studentId: 3, balance: -600_000, prepaidLessons: 0 }), // eski qarz
      ],
      reversedDeductions: {},
    });

    expect(plan.summary.paidCount).toBe(1);
    expect(plan.summary.currentMonthPendingCount).toBe(1);
    expect(plan.summary.oldDebtCount).toBe(1);
  });

  it('sarhisobda eski qarzni shu oy hisobidan ajratadi', () => {
    const plan = buildMigrationPlan({
      rows: [row({ balance: -600_000, prepaidLessons: 0 })],
      reversedDeductions: {},
    });
    // Qarz 1 050 000: shundan 450 000 shu oy, 600 000 eski.
    expect(plan.summary.currentMonthDebt).toBe(450_000);
    expect(plan.summary.oldDebt).toBe(600_000);
  });

  it('eng katta o`zgarishlarni kamayish tartibida beradi', () => {
    const plan = buildMigrationPlan({
      rows: [
        row({ prepaidLessons: 1 }),
        row({ enrollmentId: 'e2', studentId: 2, prepaidLessons: 11 }),
        row({ enrollmentId: 'e3', studentId: 3, prepaidLessons: 6 }),
      ],
      reversedDeductions: {},
    });
    const deltas = plan.biggestChanges.map((s) => Math.abs(s.newBalance - s.oldBalance));
    expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
  });

  it('bir o`quvchining bir nechta yozilishini birlashtiradi', () => {
    const plan = buildMigrationPlan({
      rows: [row(), row({ enrollmentId: 'enr-2', groupId: 'grp-2' })],
      reversedDeductions: {},
    });
    expect(plan.students).toHaveLength(1);
    expect(plan.students[0].monthlyCharge).toBe(900_000); // ikki guruh
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `cd server && npx jest scripts/lib/monthly-migration-report.spec.ts`
Expected: FAIL — modul topilmaydi

- [ ] **Step 3: Hisobot moduli**

`server/scripts/lib/monthly-migration-report.ts` — sof funksiyalar:

```ts
/**
 * Migratsiya rejasini bazadan MUSTAQIL hisoblaydi.
 *
 * Sof funksiya bo'lgani muhim: CEO ko'radigan raqamlar prod'ga tegmasdan
 * sinaladi, va `--dry-run` bilan `--apply` AYNAN bir xil arifmetikani
 * ishlatadi — hisobotda ko'rgan raqam bilan bazaga tushgan raqam
 * bir-biridan farq qila olmaydi.
 */

export interface MigrationRow {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  branchId: number;
  /** O'quvchining migratsiyadan oldingi balansi. */
  balance: number;
  prepaidLessons: number;
  /** Eski paket bo'yicha dars narxi — prepaid qaytarish shu bo'yicha. */
  packPerLessonCost: number;
  monthlyPrice: number;
  plannedLessons: number;
  coveredLessons: number;
}

export interface StudentPlan {
  studentId: number;
  studentName: string;
  groups: string[];
  oldBalance: number;
  prepaidRefund: number;
  reversedSeptember: number;
  monthlyCharge: number;
  newBalance: number;
  state: 'PAID' | 'CURRENT_MONTH_PENDING' | 'OLD_DEBT';
}

export interface MigrationPlan {
  students: StudentPlan[];
  biggestChanges: StudentPlan[];
  summary: {
    studentCount: number;
    paidCount: number;
    currentMonthPendingCount: number;
    oldDebtCount: number;
    totalPrepaidRefund: number;
    totalReversedSeptember: number;
    totalMonthlyCharge: number;
    currentMonthDebt: number;
    oldDebt: number;
    positiveBalanceAfter: number;
  };
}

export interface MigrationInput {
  rows: MigrationRow[];
  /** studentId -> 02.09 da yechilgan va qaytariladigan summa. */
  reversedDeductions: Record<number, number>;
}

export function buildMigrationPlan(input: MigrationInput): MigrationPlan {
  const byStudent = new Map<number, StudentPlan>();

  for (const r of input.rows) {
    const prepaidRefund = r.prepaidLessons * r.packPerLessonCost;
    const monthlyCharge = Math.round(
      r.coveredLessons >= r.plannedLessons
        ? r.monthlyPrice
        : (r.monthlyPrice * r.coveredLessons) / r.plannedLessons,
    );

    const existing = byStudent.get(r.studentId);
    if (existing) {
      existing.groups.push(r.groupName);
      existing.prepaidRefund += prepaidRefund;
      existing.monthlyCharge += monthlyCharge;
      continue;
    }

    byStudent.set(r.studentId, {
      studentId: r.studentId,
      studentName: r.studentName,
      groups: [r.groupName],
      oldBalance: r.balance,
      prepaidRefund,
      reversedSeptember: input.reversedDeductions[r.studentId] ?? 0,
      monthlyCharge,
      newBalance: 0,
      state: 'PAID',
    });
  }

  const students = [...byStudent.values()];
  for (const s of students) {
    s.newBalance =
      s.oldBalance + s.prepaidRefund + s.reversedSeptember - s.monthlyCharge;
    if (s.newBalance >= 0) {
      s.state = 'PAID';
    } else if (-s.newBalance <= s.monthlyCharge) {
      s.state = 'CURRENT_MONTH_PENDING';
    } else {
      s.state = 'OLD_DEBT';
    }
  }

  const summary = {
    studentCount: students.length,
    paidCount: students.filter((s) => s.state === 'PAID').length,
    currentMonthPendingCount: students.filter(
      (s) => s.state === 'CURRENT_MONTH_PENDING',
    ).length,
    oldDebtCount: students.filter((s) => s.state === 'OLD_DEBT').length,
    totalPrepaidRefund: sum(students, (s) => s.prepaidRefund),
    totalReversedSeptember: sum(students, (s) => s.reversedSeptember),
    totalMonthlyCharge: sum(students, (s) => s.monthlyCharge),
    // Qarzning qancha qismi shu oyniki, qancha qismi eskidan qolgani.
    currentMonthDebt: sum(students, (s) =>
      s.newBalance < 0 ? Math.min(-s.newBalance, s.monthlyCharge) : 0,
    ),
    oldDebt: sum(students, (s) =>
      s.newBalance < 0 ? Math.max(0, -s.newBalance - s.monthlyCharge) : 0,
    ),
    positiveBalanceAfter: sum(students, (s) => Math.max(0, s.newBalance)),
  };

  const biggestChanges = [...students]
    .sort(
      (a, b) =>
        Math.abs(b.newBalance - b.oldBalance) -
        Math.abs(a.newBalance - a.oldBalance),
    )
    .slice(0, 20);

  return { students, biggestChanges, summary };
}

function sum<T>(xs: T[], f: (x: T) => number): number {
  return xs.reduce((acc, x) => acc + f(x), 0);
}

const som = (n: number) => n.toLocaleString('ru-RU');

export function renderSummary(plan: MigrationPlan): string {
  const s = plan.summary;
  return [
    '='.repeat(72),
    'MIGRATSIYA REJASI — HECH NARSA YOZILMADI',
    '='.repeat(72),
    `O'quvchi soni:                 ${s.studentCount}`,
    '',
    `Qaytariladigan prepaid:        ${som(s.totalPrepaidRefund)} so'm`,
    `Bekor qilinadigan 02.09:       ${som(s.totalReversedSeptember)} so'm`,
    `Hisoblanadigan sentabr oyligi: ${som(s.totalMonthlyCharge)} so'm`,
    '',
    'MIGRATSIYADAN KEYINGI HOLAT',
    `  To'langan (musbat balans):   ${s.paidCount} ta — ${som(s.positiveBalanceAfter)} so'm`,
    `  Shu oy kutilmoqda:           ${s.currentMonthPendingCount} ta — ${som(s.currentMonthDebt)} so'm`,
    `  Eski qarzi bor:              ${s.oldDebtCount} ta — ${som(s.oldDebt)} so'm`,
    '='.repeat(72),
  ].join('\n');
}

export function renderStudentCsv(plan: MigrationPlan): string {
  const head =
    'studentId,ism,guruhlar,eski_balans,prepaid_qaytdi,02_09_bekor,sentabr_hisobi,yangi_balans,holat';
  const lines = plan.students.map((s) =>
    [
      s.studentId,
      `"${s.studentName}"`,
      `"${s.groups.join('; ')}"`,
      s.oldBalance,
      s.prepaidRefund,
      s.reversedSeptember,
      s.monthlyCharge,
      s.newBalance,
      s.state,
    ].join(','),
  );
  return [head, ...lines].join('\n');
}
```

- [ ] **Step 4: Skript qobig'ini yozish**

`server/scripts/migrate-to-monthly.ts` — bazadan `MigrationRow[]` yig'adi, `buildMigrationPlan` ni chaqiradi, `renderSummary` ni konsolga, `renderStudentCsv` ni `docs/migration-preview-<sana>.csv` ga yozadi. Guruh kesimini ham chop etadi (guruh nomi, o'quvchi soni, rejalashtirilgan dars, eski → yangi dars narxi, kutilayotgan tushum).

**Bayroqlar:** `--dry-run` (standart, majburiy birinchi), `--apply` (Task 10), `--period=2026-09`.

`--apply` bayrog'i Task 10 gacha `throw new Error("--apply hali yozilmagan")` qaytaradi.

- [ ] **Step 5: Testni ishga tushirib o'tishini ko'rish**

Run: `cd server && npx jest scripts/lib/monthly-migration-report.spec.ts`
Expected: PASS — 7 ta test

- [ ] **Step 6: Prod'da hisobotni chiqarish (faqat o'qish)**

```bash
cd server && railway run npx ts-node scripts/migrate-to-monthly.ts --dry-run --period=2026-09
```

Expected: sarhisob chiqadi va `docs/migration-preview-2026-09-02.csv` yoziladi. **Bazaga hech narsa yozilmaydi.**

Tekshiring: `studentCount` ≈ 370, `totalPrepaidRefund` ≈ 16 546 494, `totalReversedSeptember` ≈ 3 661 160, `totalMonthlyCharge` ≈ 169 800 000. Bu raqamlar `_probe-monthly-cutover.ts` bilan mos kelmasa — **to'xtang va sababini toping.**

- [ ] **Step 7: Commit**

```bash
git add server/scripts/lib/monthly-migration-report.ts server/scripts/lib/monthly-migration-report.spec.ts server/scripts/migrate-to-monthly.ts
git commit -m "Oylik to'lov: migratsiya oldindan hisoboti (--dry-run)"
```

---

### Task 10: Migratsiyani qo'llash

**Files:**
- Modify: `server/scripts/migrate-to-monthly.ts` (`--apply` yo'li)
- Create: `server/scripts/verify-monthly-migration.ts`

**Interfaces:**
- Consumes: Task 9 (`buildMigrationPlan`), Task 5 (`MonthlyChargeService`), Task 4 (`reverseMonthlyFee`)

- [ ] **Step 1: Hisobot faylini talab qiladigan qorovul yozish**

`--apply` ishga tushganda avval `docs/migration-preview-<sana>.csv` mavjudligini tekshiradi. Yo'q bo'lsa:

```ts
throw new Error(
  "Avval --dry-run ishga tushiring va hisobotni CEO bilan ko'rib chiqing. " +
    `Kutilgan fayl: ${previewPath}`,
);
```

Bu spec'ning "tasdiqlanmaguncha bloklanadi" talabini kodga bog'laydi.

- [ ] **Step 2: Zaxira nusxa qadamini qo'shish**

`--apply` ishga tushishidan oldin konsolga chiqaradi va tasdiq so'raydi:

```
DIQQAT: 370 o'quvchining balansi o'zgaradi.
Zaxira nusxa olindimi? (pg_dump)
Davom etish uchun --confirmed bayrog'ini qo'shing.
```

`--confirmed` bo'lmasa chiqib ketadi.

- [ ] **Step 3: Migratsiya qadamlarini yozish**

Har filial uchun alohida `Serializable` tranzaksiya, quyidagi tartibda:

1. 02.09 dagi `LESSON_DEDUCTION` qatorlarini `reverseMonthlyFee` bilan teskari qilish (`Math.abs` yo'q)
2. `EnrollmentBillingService.refundPrepaidToBalance()` — har yozilish uchun
3. `enrollment.update({ prepaidLessonsRemaining: 0, cycleLessonIndex: 0 })`
4. `course.updateMany({ data: { paymentModel: 'MONTHLY' } })`
5. `MonthlyChargeService.createChargesForPeriod({ periodYear: 2026, periodMonth: 9 })`
6. 02.09 `SalaryAccrual` larini yangi `perLessonCost` bo'yicha qayta hisoblash

- [ ] **Step 4: Har o'quvchi uchun tenglik tekshiruvini yozish**

Tranzaksiya `commit` dan OLDIN, har o'quvchi uchun:

```ts
const expected =
  plan.oldBalance + plan.prepaidRefund + plan.reversedSeptember - plan.monthlyCharge;
if (actual !== expected) {
  throw new Error(
    `O'quvchi ${studentId}: kutilgan ${expected}, chiqdi ${actual}. ` +
      `Migratsiya to'xtatildi, hech narsa yozilmadi.`,
  );
}
```

Bitta chetlashish butun tranzaksiyani qaytaradi — yarim ko'chgan holat qolmaydi.

- [ ] **Step 5: Tekshiruv skriptini yozish**

`server/scripts/verify-monthly-migration.ts` — migratsiyadan keyin ishlaydi va tasdiqlaydi:

- Har aktiv oylik yozilishda 2026-09 hisobi bor
- Hech bir `MONTHLY` yozilishda `prepaidLessonsRemaining > 0` qolmagan
- Ledger yig'indisining o'zgarishi aynan `prepaidRefund + reversedSeptember − monthlyCharge` ga teng
- CSV dagi `yangi_balans` ustuni bazadagi haqiqiy balans bilan qator-qator mos

Har tekshiruv `PASS` yoki `FAIL` chiqaradi; bitta `FAIL` bo'lsa chiqish kodi 1.

- [ ] **Step 6: Dev bazada mashq qilish**

```bash
cd server
npx ts-node scripts/migrate-to-monthly.ts --dry-run --period=2026-09
npx ts-node scripts/migrate-to-monthly.ts --apply --confirmed --period=2026-09
npx ts-node scripts/verify-monthly-migration.ts
```

Expected: barcha tekshiruvlar `PASS`.

**Diqqat:** dev baza urug'lantirilgan (seeded) — u yerdagi "hammasi PASS" prod uchun dalil emas. Dev'da faqat skript yiqilmasligi tekshiriladi; raqamlarning to'g'riligi prod `--dry-run` hisobotidan tasdiqlanadi.

- [ ] **Step 7: Commit**

```bash
git add server/scripts/migrate-to-monthly.ts server/scripts/verify-monthly-migration.ts
git commit -m "Oylik to'lov: migratsiyani qo'llash va tekshirish skriptlari"
```

- [ ] **Step 8: TO'XTASH NUQTASI — CEO tasdig'i**

Prod'da `--apply` ni **ishga tushirmang**. Quyidagilarni CEO ga taqdim eting:

1. Prod `--dry-run` sarhisobi
2. `docs/migration-preview-2026-09-02.csv`
3. Eng katta o'zgarishlar ro'yxati (20 ta)

Faqat aniq og'zaki tasdiqdan keyin `pg_dump` oling va `--apply --confirmed` ni ishga tushiring.

---

## Self-Review

**1. Spec qamrovi**

| Spec bo'limi | Task |
|---|---|
| 4.1 `Course.paymentModel` | Task 1 |
| 4.2 `EnrollmentMonthlyCharge` | Task 1 |
| 4.3 `plannedLessons` hisobi | Task 3, Task 5 |
| 4.4 `Setting` | **2-bosqich** — bu rejaga kirmaydi |
| 4.5 prepaid ishlatilmaydi | Task 6 |
| 5.1 oy boshi cron | Task 7 |
| 5.2 davomat jadvali | Task 6 |
| 5.3 o'rtada qo'shilgan | Task 5 + Task 8 |
| 5.4 o'rtada ketgan | Task 8 |
| 5.5 jadval o'zgarishi | Task 5 (muzlatish) |
| 6 o'qituvchi oyligi + zaxira yo'l | Task 6 |
| 7 interfeys | **3-bosqich** — bu rejaga kirmaydi |
| 8 sozlamalar paneli | **2-bosqich** — bu rejaga kirmaydi |
| 9 migratsiya + majburiy hisobot | Task 9, Task 10 |

**2. Aniqlangan va tuzatilgan kamchiliklar**

- `chargeMonthlyFee` metadatasiga `lessonsCovered` yozilmasligi Task 4 Step 1 da alohida test bilan qotirildi — aks holda `lesson-coverage.helper` oylik qatorni sikl deb o'qirdi.
- `createAccrual` `deductionTransactionId` bo'lmasa `null` qaytaradi. Zaxira yo'lda (`charge` topilmaganda) `centerFunded: true` berilmasa o'qituvchi haqsiz qolardi — Task 6 Step 3 da hisobga olindi.
- Kredit oy hisobidan katta bo'lgan holat Task 2 da testlangan va `carriedCreditLessons` orqali keyingi oyga suriladi.

**3. Tip nomlari izchilligi**

`ChargeableEnrollment`, `MigrationRow`, `StudentPlan`, `MigrationPlan`, `LessonDatesParams`, `LessonCreditResult` — barchasi bir marta ta'riflanadi va keyingi tasklarda o'zgarmagan nom bilan ishlatiladi. `tashkentDay()` `monthly-charge.service.ts` da eksport qilinadi va Task 6 shu yerdan import qiladi.
