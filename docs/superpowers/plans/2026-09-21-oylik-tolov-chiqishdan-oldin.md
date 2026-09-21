# Oylik to'lov — chiqishdan oldingi 5 ish: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 21.09.2026 dagi CEO qarorlaridan chiqishdan OLDIN shart bo'lgan
beshtasini `feat/oylik-tolov-tizimi` shoxiga kiritish — shunda oylik yadro
o'quvchidan ham, ustozdan ham CEO qoidasiga zid pul hisoblamaydi.

**Architecture:** Yadro (Task 1–10, `2026-09-02-oylik-tolov-yadro.md`)
o'zgarmaydi. Uch nuqtada bitta-bitta tuzatish kiradi: (1) `createAccrual`
oylik kursda `FIXED_PER_STUDENT` stavkasini kursning `lessonPaymentCount`
(12) ga emas, o'sha oyning `plannedLessons` iga bo'ladi — chaqiruvchi buni
`lessonDivisor` sifatida uzatadi; (2) `resolveExcludedDates` bayramni
rejadan chiqarmaydi (bayram darsi shu oyda qayta o'tiladi — 10-javob),
faqat bekor qilingan dars chiqadi; (3) qarz kechirish yangi
`payment.debtWriteOffEnabled` sozlamasi (boshlang'ich `false`) bilan
yopiladi — server rad etadi, klient `eligible=false` ni ko'rib blokni
yashiradi. CEO tasdiqlagan kurs almashish misoli test bilan qotiriladi.
Sinov hisoboti — proddagi yangi jadvalga bog'liq, shuning uchun u
sxema chiqqandan KEYIN yuradi.

**Tech Stack:** NestJS 11, Prisma 7 (Neon Postgres), Jest, Next.js 15
klient (vitest), Railway CLI (`railway run`), `tsx`.

**Spec:** [2026-09-21-oylik-tolov-qarorlar-design.md](../specs/2026-09-21-oylik-tolov-qarorlar-design.md) §9 «Chiqishdan OLDIN shart bo'lganlar».

## Global Constraints

- **Til:** foydalanuvchi matni, izohlar va commit xabarlari lotin o'zbekchada. Kirill yoki arab harflari ishlatilmaydi.
- **Ish joyi:** `/Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov`, shox `feat/oylik-tolov-tizimi`. `main` bilan birlashtirish **bu rejaga kirmaydi** (508 commit farq — alohida ish, 6-vazifadan oldin).
- **Har commit:** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` bilan tugaydi.
- **`LESSON_PACK` yo'li o'zgarmaydi.** Har vazifadan keyin `npx jest src/billing src/salary` to'liq yashil.
- **Pul yozuvi faqat `TransactionsWriteService` orqali** — bu rejada yangi pul yozuvi yo'q.
- **`Math.abs` taqiqi** (ADR-0004) — tegishli kod yo'q, lekin qoida amal qiladi.
- **Sozlama faqat iste'molchisi bilan** (`settings.types.ts` sarlavha izohi): bu rejada qo'shiladigan yagona kalit `payment.debtWriteOffEnabled` ning iste'molchisi `StudentEnrollmentService` — bitta PR ichida.
- **`excusedMode` KIRITILMAYDI.** 18-javob «ikkalasi ham» dedi, lekin `RETEACH` mexanizmi yo'q; faqat `CREDIT` bor bo'lgan enum dekorativ variant bo'lardi. Mavjud `payment.excusedCreditEnabled` kredit yo'lining o'zi; `excusedMode` 4-bosqichda `RETEACH` bilan birga keladi.
- **Sanalar:** Toshkent (UTC+5). Testlarda `new Date('YYYY-MM-DDT00:00:00Z')` = o'sha kun 05:00 Toshkent → `tashkentDateStr` shu kunni beradi.
- **Sinov hisoboti prodga o'qish uchun ham `EnrollmentMonthlyCharge` jadvalini talab qiladi** (`scopeWhere`), prodda u yo'q. Tartib: sxema + kod chiqadi (`Course.paymentModel` DEFAULT `LESSON_PACK` — hech bir kurs oylikka o'tmaydi, cron hech narsa yozmaydi) → hisobot → CEO tasdig'i → `--apply`.

---

## Fayl tuzilishi

**O'zgaradi (server):**

| Fayl | O'zgarish |
|---|---|
| `server/src/salary/salary-accrual.service.ts` | `createAccrual` ga `lessonDivisor?: number`; `FIXED_PER_STUDENT` bo'luvchisi |
| `server/src/salary/shared/deserved-math.ts` | Parametr nomi `lessonPaymentCount` → `lessonDivisor`, izoh |
| `server/src/billing/lesson-billing.service.ts` | `accrueMonthlySalary` `lessonDivisor` uzatadi; `fallbackMonthlyPerLessonCost` `plannedLessons` qaytaradi |
| `server/src/billing/monthly-charge.service.ts` | `resolveExcludedDates` — bayram chiqmaydi, faqat bekor qilingan dars |
| `server/src/settings/settings.types.ts` | `payment.debtWriteOffEnabled` (false); `payment.defaultModel` boshlang'ichi `LESSON_PACK` |
| `server/src/settings/dto/update-payment-settings.dto.ts` | `debtWriteOffEnabled?: boolean` |
| `server/src/settings/settings.controller.ts` | `edits` ga yangi kalit |
| `server/src/billing/debt-write-off.service.ts` | `DebtWriteOffEligibilityReason` ga `'DISABLED'` |
| `server/src/students/student-enrollment.service.ts` | `SettingsService` in'ektsiyasi; uchta yo'lda sozlama tekshiruvi |
| `server/src/students/students.module.ts` | `SettingsModule` import |

**O'zgaradi (klient):**

| Fayl | O'zgarish |
|---|---|
| `client/src/components/students/debt-write-off-types.ts` | reason union ga `"DISABLED"` |
| `client/src/components/students/write-off-debt-dialog.tsx` | `IneligibleNotice` da `DISABLED` matni |
| `client/src/components/settings/payment-settings-client.tsx` | «Qarz kechirishga ruxsat» Switch |

**Testlar:** `salary-accrual.service.spec.ts`, `lesson-billing.service.spec.ts`, `monthly-charge.service.spec.ts`, `settings.types.spec.ts`, `settings.controller.spec.ts`, `student-enrollment.service.spec.ts`.

**Hujjat:** `docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md` (§4, §5, §6, §9).

---

### Task 1: `FIXED_PER_STUDENT` oylik kursda oyning dars soniga bo'linadi

**Files:**
- Modify: `server/src/salary/salary-accrual.service.ts:64-86` (params), `:196-208` (amount)
- Modify: `server/src/salary/shared/deserved-math.ts:20-41`
- Modify: `server/src/billing/lesson-billing.service.ts:211-273` (`accrueMonthlySalary`), `:279-323` (`fallbackMonthlyPerLessonCost`)
- Test: `server/src/salary/salary-accrual.service.spec.ts`
- Test: `server/src/billing/lesson-billing.service.spec.ts:1178-1345`

**Interfaces:**
- Consumes: `EnrollmentMonthlyCharge.plannedLessons` (mavjud ustun), `MonthlyChargeService.findChargeForLesson` (butun qatorni qaytaradi — `plannedLessons` ichida).
- Produces: `SalaryAccrualService.createAccrual(params: { ...; lessonDivisor?: number })` — oylik kursda `FIXED_PER_STUDENT` uchun bo'luvchi. `LessonBillingService['fallbackMonthlyPerLessonCost']` endi `Promise<{ perLessonCost: number; plannedLessons: number }>` qaytaradi.

Nega: `PERCENTAGE` oylik yo'lda allaqachon to'g'ri (`perLessonCost` = oy narxi / oydagi dars soni, muzlatilgan). `FIXED_PER_STUDENT` esa `getCourseLessonCount` → `lessonPaymentCount` (12) ga bo'ladi: 13 darslik oyda ustoz 13 × value/12 oladi — oydan oshadi. CEO 1-javob: ustoz oyligi dars soniga bog'liq emas. Cron va oylik hisobot (`gap-sweep.ts` → `resolveLessonPricing`) buni allaqachon `plannedLessons` bilan qiladi — faqat jonli davomat yo'li qolgan.

- [ ] **Step 1: Muhit va boshlang'ich holat**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov/server
npm ci
npx prisma generate 2>&1 | tail -2
npx jest src/salary src/billing src/settings src/students --silent 2>&1 | tail -6
```

Expected: `Generated Prisma Client`; `Tests: N passed, N total`, 0 failed. Yiqilgan test bo'lsa — to'xtang, bu reja shoxning yashil holatiga tayanadi. (`prisma generate` shart: worktree'da klient shox sxemasidan — `Course.paymentModel`, `EnrollmentMonthlyCharge` — yasalishi kerak, aks holda tiplar main'nikidan qoladi.)

- [ ] **Step 2: Yiqiladigan testni yozish (`salary-accrual.service.spec.ts`)**

`'FIXED_PER_STUDENT with 20-lesson Intensiv: divides by 20'` testidan KEYIN qo'shing:

```ts
    it("FIXED_PER_STUDENT + lessonDivisor (oylik kurs): oyning rejalashtirilgan dars soniga bo'ladi, kursning 12 siga emas", async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'FIXED_PER_STUDENT',
        value: 250_000, // bir sikl (= bir oy) uchun
      });
      // Kurs kartochkasida 12 turadi — lekin oylik yo'lda bu son ma'nosiz.
      prisma.group.findUnique.mockResolvedValue({
        course: { lessonPaymentCount: 12 },
        branchId: 2,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual({ ...baseParams, lessonDivisor: 13 });

      // 250 000 / 13 = 19 230.77 → 19 231. 12 ga bo'linsa 20 833 chiqardi:
      // 13 darslik oyda ustoz 13 × 20 833 = 270 833 — oydan 20 833 ortiq
      // (CEO, 21.09.2026, 1-javob: ustoz oyligi dars soniga bog'liq emas).
      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amount: 19_231 }),
        }),
      );
    });

    it("lessonDivisor berilmasa (12 talik yo'l) avvalgidek lessonPaymentCount ga bo'ladi", async () => {
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce({
        id: 'v1',
        salaryType: 'FIXED_PER_STUDENT',
        value: 250_000,
      });
      prisma.group.findUnique.mockResolvedValue({
        course: { lessonPaymentCount: 12 },
        branchId: 2,
      });
      prisma.salaryAccrual.upsert.mockResolvedValue({});

      await service.createAccrual(baseParams);

      expect(prisma.salaryAccrual.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amount: 20_833 }),
        }),
      );
    });
```

- [ ] **Step 3: Testni yurgizib yiqilishini ko'rish**

Run: `npx jest src/salary/salary-accrual.service.spec.ts -t "lessonDivisor" 2>&1 | tail -20`
Expected: birinchi test FAIL — `amount: 20_833` yozilgan (yoki TS xatosi: `lessonDivisor` param mavjud emas). Ikkinchisi PASS.

- [ ] **Step 4: `createAccrual` ga parametr va bo'luvchi**

`server/src/salary/salary-accrual.service.ts` — params obyektida `creditPeriodDateOverride?: Date;` dan keyin qo'shing:

```ts
    /**
     * Oylik (`MONTHLY`) kursda — shu oyning rejalashtirilgan dars soni
     * (`EnrollmentMonthlyCharge.plannedLessons`). `FIXED_PER_STUDENT`
     * bo'luvchisi shu bo'ladi; berilmasa kursning `lessonPaymentCount`
     * (12 talik yo'l, avvalgidek). `PERCENTAGE` ga ta'sir qilmaydi — u
     * `perLessonCost` dan hisoblanadi, u esa oylik yo'lda allaqachon
     * oy narxi / oydagi dars soni. CEO (21.09.2026, 1-javob): ustoz
     * oyligi dars soniga bog'liq emas — 13 darslik oy ham, 14 ham bir xil.
     */
    lessonDivisor?: number;
```

Amount shoxini (196–208) shunga almashtiring:

```ts
    let amount: number;
    if (version.salaryType === SalaryType.PERCENTAGE) {
      amount = Math.round((params.perLessonCost * version.value) / 100);
    } else {
      // FIXED_PER_STUDENT: `value` — bir SIKLDA bir o'quvchidan tushadigan
      // haq. 12 talik kursda sikl = kursning `lessonPaymentCount`; OYLIK
      // kursda sikl = o'sha oyning rejalashtirilgan dars soni, chaqiruvchi
      // uni `lessonDivisor` sifatida uzatadi. Aks holda 13 darslik oyda
      // 13 × value/12 — oydan oshib ketadi (1-javob). Bu `gap-sweep.ts`
      // `resolveLessonPricing().divisor` bilan bir xil qoida — cron va
      // hisobot allaqachon shunday, bu jonli davomat yo'li.
      const lessonCount =
        params.lessonDivisor ??
        (await this.getCourseLessonCount(db, params.groupId));
      amount =
        lessonCount > 0
          ? Math.round(version.value / lessonCount)
          : version.value;
    }
```

- [ ] **Step 5: Testni yurgizib o'tishini ko'rish**

Run: `npx jest src/salary/salary-accrual.service.spec.ts 2>&1 | tail -6`
Expected: hammasi PASS (yangi ikkitasi ham).

- [ ] **Step 6: `lesson-billing.service.spec.ts` — bo'luvchi uzatilishini talab qilish**

`describe('MONTHLY kurs — davomat balansga tegmaydi'` ichidagi `beforeEach` mockiga `plannedLessons` qo'shing:

```ts
      monthlyChargeService.findChargeForLesson.mockResolvedValue({
        id: 'chg-1',
        perLessonCost: 34_615,
        plannedLessons: 13,
        transactionId: 'tx-monthly-1',
      });
```

`'PRESENT belgilanganda o`qituvchiga muzlatilgan narx bo`yicha haq yozadi'` testining tasdig'ini:

```ts
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          perLessonCost: 34_615,
          lessonDivisor: 13,
          deductionTransactionId: 'tx-monthly-1',
        }),
      );
```

Zaxira yo'l testida (`centerFunded: true` tasdig'i, ~1332-qator):

```ts
      expect(salaryAccrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          perLessonCost: 34_615,
          lessonDivisor: 13,
          deductionTransactionId: null,
          centerFunded: true,
        }),
      );
```

- [ ] **Step 7: Yurgizib yiqilishini ko'rish**

Run: `npx jest src/billing/lesson-billing.service.spec.ts -t "MONTHLY" 2>&1 | tail -20`
Expected: ikki test FAIL — `lessonDivisor` uzatilmagan.

- [ ] **Step 8: `lesson-billing.service.ts` — bo'luvchini uzatish**

`accrueMonthlySalary` da:

```ts
    let perLessonCost = charge?.perLessonCost ?? 0;
    // Oylik kursda FIXED_PER_STUDENT bo'luvchisi — shu oyning rejalashtirilgan
    // dars soni (1-javob). Hisob bo'lsa muzlatilgan qatordan, bo'lmasa
    // zaxira hisob-kitobdan (u ham `resolveExcludedDates` bilan bir manba).
    let lessonDivisor: number | undefined = charge?.plannedLessons;
    let deductionTransactionId: string | null = charge?.transactionId ?? null;

    if (!charge) {
      // ... (mavjud logger.error o'zgarmaydi)
      const fallback = await this.fallbackMonthlyPerLessonCost(tx, params);
      perLessonCost = fallback.perLessonCost;
      lessonDivisor = fallback.plannedLessons;
      deductionTransactionId = null;
    }
```

`createAccrual` chaqiruviga `perLessonCost,` dan keyin `lessonDivisor,` qo'shing.

`fallbackMonthlyPerLessonCost`:

```ts
  private async fallbackMonthlyPerLessonCost(
    tx: Prisma.TransactionClient,
    params: ProcessAttendanceBillingParams,
  ): Promise<{ perLessonCost: number; plannedLessons: number }> {
    // ...
    if (!enr) return { perLessonCost: 0, plannedLessons: 0 };
    // ...
    return {
      perLessonCost: perLessonCostForMonth(enr.group.course.price, planned),
      plannedLessons: planned,
    };
  }
```

(`planned === 0` bo'lsa `perLessonCost` 0 → `accrueMonthlySalary` dagi `if (perLessonCost <= 0) return;` avvalgidek to'xtatadi; nol bo'luvchi `createAccrual` ga yetib bormaydi.)

- [ ] **Step 9: `deserved-math.ts` — parametr nomi va izoh**

```ts
/**
 * Per-lesson accrual for one student, by salary type. Identical to
 * `SalaryAccrualService.createAccrual`'s amount branch:
 *  - PERCENTAGE        → round(perLessonCost * value / 100)
 *  - FIXED_PER_STUDENT → round(value / lessonDivisor)   (value is per-cycle)
 *  - FIXED_MONTHLY     → 0 (flat salary, not per-lesson)
 *
 * `lessonDivisor` — sikldagi dars soni: 12 talik kursda `lessonPaymentCount`,
 * oylik kursda o'sha oyning `plannedLessons` (`resolveLessonPricing().divisor`).
 * `createAccrual` ham xuddi shu bo'luvchini `lessonDivisor` sifatida oladi.
 */
export function perLessonAccrual(
  version: RateVersion,
  perLessonCost: number,
  lessonDivisor: number,
): number {
  if (version.salaryType === 'PERCENTAGE') {
    return Math.round((perLessonCost * version.value) / 100);
  }
  if (version.salaryType === 'FIXED_PER_STUDENT') {
    return lessonDivisor > 0
      ? Math.round(version.value / lessonDivisor)
      : version.value;
  }
  return 0; // FIXED_MONTHLY
}
```

Chaqiruvchilar (`gap-sweep.ts:219`, `salary-calculation.service.ts:822`) pozitsion — o'zgarmaydi.

- [ ] **Step 10: Yurgizib o'tishini ko'rish + tip tekshiruvi**

```bash
npx jest src/billing src/salary --silent 2>&1 | tail -6
npm run typecheck 2>&1 | tail -3
```

Expected: hammasi PASS; typecheck toza.

- [ ] **Step 11: Commit**

```bash
git add server/src/salary/salary-accrual.service.ts server/src/salary/salary-accrual.service.spec.ts server/src/salary/shared/deserved-math.ts server/src/billing/lesson-billing.service.ts server/src/billing/lesson-billing.service.spec.ts
git commit -m "$(cat <<'EOF'
Oylik kursda FIXED_PER_STUDENT oyning dars soniga bo'linadi

CEO (21.09.2026, 1-javob): ustoz oyligi oydagi dars soniga bog'liq emas.
PERCENTAGE oylik yo'lda allaqachon shunday — perLessonCost oy narxi /
oydagi dars soni bilan muzlatilgan. FIXED_PER_STUDENT esa jonli davomat
yo'lida kursning lessonPaymentCount (12) ga bo'linardi: 13 darslik oyda
ustoz 13 × value/12 olardi. Cron va hisobot (resolveLessonPricing.divisor)
buni allaqachon plannedLessons bilan qilardi — endi createAccrual ham,
chaqiruvchi lessonDivisor uzatadi.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Bayram rejalashtirilgan dars sonini kamaytirmaydi (10-javob)

**Files:**
- Modify: `server/src/billing/monthly-charge.service.ts:13` (import), `:1070-1112` (`resolveExcludedDates`)
- Test: `server/src/billing/monthly-charge.service.spec.ts:453-475`
- Test: `server/src/billing/lesson-billing.service.spec.ts:1353-1512`
- Modify: `docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md` (§4, §6, §9)

**Interfaces:**
- Consumes: `LessonCancellation` (mavjud), `tashkentDateStr`.
- Produces: `MonthlyChargeService.resolveExcludedDates(tx, groupId, _branchId, year, month): Promise<string[]>` — imzo o'zgarmaydi (5 chaqiruvchi + 2 skript pozitsion uzatadi), ma'nosi: **faqat bekor qilingan darslar**.

Nega: CEO 10-javob — bayram darsi yo'qolmaydi, shu oy ichida qayta o'tiladi (oy oxirida bo'lsa keyingi oyga suriladi, pulga tegilmaydi). Hozir bayram rejadan chiqariladi: 13 darslik oy 12 deb muzlatiladi, `perLessonCost` = 450 000/12, keyin ko'chirilgan dars 13- davomat sifatida ustozga oydan ORTIQCHA haq yozadi — 1-javobga zid. Bayram rejada qolsa ko'chirilgan dars asl kun o'rnini egallaydi (asl kunga davomat yo'q, yangi kunga bor), sanoq 13 da qoladi, narx to'g'ri. Dizayn hujjatidagi «`includedDates`» yechimi bekor — bu soddaroq va o'rta oyda qilingan ko'chirishlar uchun ham ishlaydi (`includedDates` faqat hisob yaratilishidan OLDIN ma'lum ko'chirishlarni ko'rardi).

- [ ] **Step 1: Bayram testini yangi qoidaga yozish (`monthly-charge.service.spec.ts:453-475`)**

`'bayram kunlarini rejadan chiqaradi va dars narxini oshiradi'` testini butunlay shunga almashtiring:

```ts
    it("bayram kuni rejadan CHIQMAYDI — bayram darsi shu oyda qayta o'tiladi (CEO 21.09.2026, 10-javob)", async () => {
      // 1-sentabr 2026 — seshanba, rejadagi kun. Bayram bo'lsa ham dars
      // yo'qolmaydi: shu oy ichida boshqa kunga ko'chirib o'tiladi. Shuning
      // uchun rejalashtirilgan dars soni 13 da qoladi va dars narxi
      // oshmaydi — aks holda ko'chirilgan (13-) dars ustozga oydan ORTIQCHA
      // haq yozardi (1-javob: ustoz oyligi dars soniga bog'liq emas).
      prismaMock.holiday.findMany.mockResolvedValueOnce([
        {
          date: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2026-09-01T00:00:00Z'),
        },
      ]);

      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment(),
        periodYear: 2026,
        periodMonth: 9,
        companyId: 1,
      });

      expect(charge?.plannedLessons).toBe(13);
      expect(charge?.perLessonCost).toBe(34_615); // 450 000 / 13
      expect(charge?.chargedAmount).toBe(450_000);
      // Bayram jadvali umuman so'ralmaydi — bekor qilingan dars yagona istisno.
      expect(prismaMock.holiday.findMany).not.toHaveBeenCalled();
    });

    it("bekor qilingan (ko'chirilmagan) dars rejadan CHIQADI — u haqiqatan yo'qolgan dars", async () => {
      prismaMock.lessonCancellation.findMany.mockResolvedValueOnce([
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
```

- [ ] **Step 2: Yurgizib yiqilishini ko'rish**

Run: `npx jest src/billing/monthly-charge.service.spec.ts -t "bayram|bekor qilingan" 2>&1 | tail -20`
Expected: birinchi FAIL (`plannedLessons` 12, `holiday.findMany` chaqirilgan); ikkinchi PASS.

- [ ] **Step 3: `resolveExcludedDates` — faqat bekor qilingan darslar**

`server/src/billing/monthly-charge.service.ts:13` dagi `import { buildHolidayDateSet } from '../holidays/holiday-date-set';` qatorini o'chiring (faylda boshqa ishlatilmaydi).

1070–1112 qatorlardagi izoh + metodni shunga almashtiring:

```ts
  /**
   * Rejadan CHIQADIGAN kunlar, 'YYYY-MM-DD' ro'yxati — faqat bekor qilingan
   * darslar (`LessonCancellation`).
   *
   * Bayramlar ATAYLAB kirmaydi (CEO, 21.09.2026, 10-javob): bayram kuniga
   * tushgan dars yo'qolmaydi — shu oy ichida boshqa kunga ko'chirib
   * o'tiladi (oy oxirida bo'lsa keyingi oyga suriladi, pulga tegilmaydi).
   * Demak oyda dars soni o'zgarmaydi va dars narxi ham. Bayramni chiqarib
   * tashlash 13 darslik oyni 12 deb muzlatardi; keyin ko'chirilgan dars
   * 13- davomat sifatida ustozga oydan ORTIQCHA haq yozardi — 1-javobga zid
   * (ustoz oyligi dars soniga bog'liq emas). Ko'chirilgan dars asl kunning
   * o'rnini egallaydi: asl kunga davomat yozilmaydi, yangi kunga yoziladi,
   * sanoq 13 da qoladi.
   *
   * Bekor qilingan dars — ko'chirilmagan dars, u haqiqatan yo'qolgan
   * (spec 5.5: o'quvchiga pul qaytmaydi, ustozga haq yozilmaydi), shuning
   * uchun rejadan chiqadi.
   *
   * PUBLIC ataylab: `LessonBillingService.fallbackMonthlyPerLessonCost`,
   * `scripts/migrate-to-monthly.ts` va `scripts/verify-monthly-migration.ts`
   * HAM shu metoddan o'qiydi — "qaysi kunlar hisobga kirmaydi" mantig'ining
   * ikkinchi nusxasi yozilmaydi (Task 6 buzilgan sabab shu edi).
   *
   * `_branchId` imzoda qoladi: chaqiruvchilar uzatadi, va filialga bog'liq
   * istisno kerak bo'lib qolsa shu yerga tushadi.
   */
  async resolveExcludedDates(
    tx: Prisma.TransactionClient,
    groupId: string,
    _branchId: number,
    year: number,
    month: number,
  ): Promise<string[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExclusive = new Date(Date.UTC(year, month, 1));

    const cancellations = await tx.lessonCancellation.findMany({
      where: {
        groupId,
        deletedAt: null,
        date: { gte: monthStart, lt: monthEndExclusive },
      },
      select: { date: true },
    });

    const excluded = new Set<string>();
    for (const c of cancellations) excluded.add(tashkentDateStr(c.date));
    return [...excluded];
  }
```

- [ ] **Step 4: Yurgizib o'tishini ko'rish**

Run: `npx jest src/billing/monthly-charge.service.spec.ts 2>&1 | tail -6`
Expected: hammasi PASS.

- [ ] **Step 5: `lesson-billing.service.spec.ts` paritet testini yangilash**

`describe('zaxira narx real oylik hisob bilan bir xil manbadan (bayramli oy)'` ichida:

`txLocal.holiday` izohini (≈1412–1414):
```ts
        // 2026-04-01 — chorshanba, guruhning dars kuni (mon/wed/fri) — shu
        // kunga bayram qo'yilgan. 10-javobdan keyin bayram rejadan
        // CHIQMAYDI: ikkala yo'l ham 13 ni ko'rishi va bir xil narx
        // berishi kerak. Bayram jadvali bu yerda ataylab qoldirilgan —
        // u E'TIBORSIZ qolishini ham shu test isbotlaydi.
```

Tasdiqni (≈1489–1490):
```ts
      // 450_000 / 13 — bayram rejadan chiqmaydi (10-javob), 13 dars.
      expect(realCharge?.perLessonCost).toBe(34_615);
      expect(fallbackPerLessonCost).toBe(realCharge?.perLessonCost);
```

- [ ] **Step 6: Yurgizib o'tishini ko'rish**

Run: `npx jest src/billing src/salary --silent 2>&1 | tail -6`
Expected: hammasi PASS.

- [ ] **Step 7: Dizayn hujjatini yangi yechimga moslash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov && python3 - <<'PY'
import io,re
p='docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md'
s=io.open(p,encoding='utf-8').read()
new_par = """**Ko'chirilgan dars — bayram rejadan CHIQMAYDI.** `resolveExcludedDates`
bayram kunlarini `plannedLessons` dan chiqarib tashlardi: 13 darslik oy 12
deb muzlatilar, keyin bayram darsi boshqa kunga ko'chirilib o'tilganda
(10-javob) o'sha davomat 13- dars sifatida §5.5 bo'yicha ustozga qo'shimcha
haq yozardi → 1-javobga zid. Yechim: bayram rejada qoladi, faqat bekor
qilingan (ko'chirilmagan) dars chiqadi. Ko'chirilgan dars asl kunning
o'rnini egallaydi — asl kunga davomat yozilmaydi, yangi kunga yoziladi,
sanoq 13 da qoladi. (Avval rejalashtirilgan `includedDates` yechimi bekor:
u faqat hisob yaratilishidan OLDIN ma'lum ko'chirishlarni ko'rardi, o'rta
oyda qilinganlarni emas.)"""
s,n=re.subn(r"\*\*Ko'chirilgan dars — `plannedLessons` ni buzadi\.\*\*.*?qo'shimcha haq yozilmaydi\.", new_par, s, flags=re.S)
assert n==1, "§4 paragrafi topilmadi"
s=s.replace("8. **`FIXED_PER_STUDENT` bo'luvchisi + `includedDates`** — 4-bo'limga qara. Kichik.",
            "8. **`FIXED_PER_STUDENT` bo'luvchisi + bayram rejadan chiqmaydi** — 4-bo'limga qara. Kichik.")
s=s.replace("| 3 Oydagi dars kunlari | ⚠️ kichik | `includedDates` qo'shiladi — ko'chirilgan dars sanoqni buzmasin (4-bo'lim) |",
            "| 3 Oydagi dars kunlari | ✅ turadi | Sof funksiya o'zgarmaydi; `resolveExcludedDates` bayramni chiqarmaydi (4-bo'lim) |")
s=s.replace("2. `includedDates` — ko'chirilgan dars ustozga qo'shimcha haq yozmasin (1, 10)",
            "2. Bayram rejadan chiqmaydi — ko'chirilgan dars ustozga qo'shimcha haq yozmasin (1, 10)")
io.open(p,'w',encoding='utf-8').write(s)
print("dizayn hujjati yangilandi")
PY
```

Expected: `dizayn hujjati yangilandi`. `assert` yiqilsa — §4 matni o'zgargan, qo'lda toping va almashtiring.

- [ ] **Step 8: Commit**

```bash
git add server/src/billing/monthly-charge.service.ts server/src/billing/monthly-charge.service.spec.ts server/src/billing/lesson-billing.service.spec.ts docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md
git commit -m "$(cat <<'EOF'
Bayram oydagi dars sonini kamaytirmaydi — bayram darsi qayta o'tiladi

CEO (21.09.2026, 10-javob): bayram tufayli o'tilmagan dars shu oy ichida
boshqa kunga ko'chiriladi; oy oxirida bo'lsa keyingi oyga suriladi,
pulga tegilmaydi. Demak bayram yo'qolgan dars emas.

resolveExcludedDates bayramni rejadan chiqarardi: 13 darslik oy 12 deb
muzlatilar, ko'chirilgan dars 13- davomat sifatida ustozga oydan ortiqcha
haq yozardi (1-javobga zid). Endi faqat bekor qilingan dars chiqadi —
ko'chirilgan dars asl kun o'rnini egallaydi, sanoq o'zgarmaydi.

Skriptlar (migrate/verify) va zaxira narx yo'li shu metoddan o'qiydi,
shuning uchun o'z-o'zidan moslashadi.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sozlamalar reyestri — `payment.debtWriteOffEnabled` va cutover'gacha `LESSON_PACK`

**Files:**
- Modify: `server/src/settings/settings.types.ts:25-34` (union + map), `:102-128` (definitions)
- Modify: `server/src/settings/dto/update-payment-settings.dto.ts`
- Modify: `server/src/settings/settings.controller.ts:66-83` (`edits`)
- Test: `server/src/settings/settings.types.spec.ts:10-50`
- Test: `server/src/settings/settings.controller.spec.ts:103-127`, `:184-194`
- Modify: `docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md` §5 (jadval)

**Interfaces:**
- Produces: `SettingKey` ga `'payment.debtWriteOffEnabled'` (boolean, default `false`, filial darajasida yozilishi mumkin); `UpdatePaymentSettingsDto.debtWriteOffEnabled?: boolean`; `PATCH /settings/payment { debtWriteOffEnabled }`. `payment.defaultModel` boshlang'ichi `LESSON_PACK`.
- Consumes: `parseBoolean` (mavjud).

Nega ikkinchisi: `Course.paymentModel` ustuni `DEFAULT 'LESSON_PACK'` — sxema chiqsa hech bir kurs oylikka o'tmaydi. Lekin `CoursesService.create` yangi kursga `payment.defaultModel` ni qo'yadi, uning boshlang'ichi `MONTHLY`. Ya'ni kod chiqqan kuni administrator yaratgan birinchi yangi kurs jimgina oylik bo'lib qoladi — shartnoma va cutover tayyor bo'lmasdan. Boshlang'ich `LESSON_PACK` bo'lsin; `--apply` kuni CEO Sozlamalar → To'lov dan `MONTHLY` ga o'tkazadi.

- [ ] **Step 1: Reyestr testlari (`settings.types.spec.ts`)**

`'covers exactly the four shipped payment keys'` testini shunga almashtiring:

```ts
  it('covers exactly the five shipped payment keys', () => {
    expect(SETTING_KEYS.sort()).toEqual(
      [
        'payment.chargeDayOfMonth',
        'payment.debtWriteOffEnabled',
        'payment.defaultModel',
        'payment.excusedCreditEnabled',
        'payment.excusedCreditMonthlyCap',
      ].sort(),
    );
  });
```

`describe('payment.defaultModel'` ichidagi `'defaults to MONTHLY'` testini:

```ts
    it("defaults to LESSON_PACK until the cutover — a course made after deploy must not silently go monthly", () => {
      expect(def.defaultValue).toBe(PaymentModel.LESSON_PACK);
    });
```

Fayl oxiridagi describe'lardan keyin yangi blok:

```ts
  describe('payment.debtWriteOffEnabled', () => {
    const def = getSettingDefinition('payment.debtWriteOffEnabled');

    it("defaults to false — CEO (21.09.2026, 9-javob): qarz kechirilmaydi", () => {
      expect(def.defaultValue).toBe(false);
    });

    it('accepts booleans', () => {
      expect(def.parse(true)).toBe(true);
      expect(def.parse(false)).toBe(false);
    });

    it('rejects non-booleans with an Uzbek message', () => {
      expect(() => def.parse('ha')).toThrow(BadRequestException);
      expect(() => def.parse(1)).toThrow(BadRequestException);
      expect(() => def.parse(null)).toThrow(BadRequestException);
    });

    it('may be written at branch level (not companyLevelOnly)', () => {
      expect(def.companyLevelOnly).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Yurgizib yiqilishini ko'rish**

Run: `npx jest src/settings/settings.types.spec.ts 2>&1 | tail -20`
Expected: FAIL — kalit ro'yxati 4 ta, `getSettingDefinition('payment.debtWriteOffEnabled')` TS xatosi, `defaultModel` hali `MONTHLY`.

- [ ] **Step 3: `settings.types.ts` — kalit, tur, ta'rif**

```ts
export type SettingKey =
  | 'payment.defaultModel'
  | 'payment.excusedCreditEnabled'
  | 'payment.excusedCreditMonthlyCap'
  | 'payment.chargeDayOfMonth'
  | 'payment.debtWriteOffEnabled';

export interface SettingValueMap {
  'payment.defaultModel': PaymentModel;
  'payment.excusedCreditEnabled': boolean;
  'payment.excusedCreditMonthlyCap': number | null;
  'payment.chargeDayOfMonth': number;
  'payment.debtWriteOffEnabled': boolean;
}
```

`SETTING_DEFINITIONS` da `payment.defaultModel`:

```ts
  'payment.defaultModel': {
    key: 'payment.defaultModel',
    // Cutover'gacha LESSON_PACK: `Course.paymentModel` ustuni ham shu
    // DEFAULT bilan — sxema chiqsa mavjud kurslar o'zgarmaydi. Bu sozlama
    // esa YANGI kursga qo'llanadi (`CoursesService.create`); MONTHLY bo'lsa
    // kod chiqqan kuni yaratilgan birinchi kurs jimgina oylik bo'lib
    // qolardi. `--apply` kuni CEO Sozlamalar → To'lov dan MONTHLY qiladi.
    defaultValue: PaymentModel.LESSON_PACK,
    parse: parsePaymentModel,
  },
```

`payment.chargeDayOfMonth` dan keyin:

```ts
  'payment.debtWriteOffEnabled': {
    key: 'payment.debtWriteOffEnabled',
    // CEO (21.09.2026, 9-javob): «Qarz kechirilishi bo'lmaydi» — qarz
    // butun tarixi bilan saqlanadi. Boshlang'ich `false`. O'chirib tashlash
    // o'rniga sozlama: prodda allaqachon yozilgan DEBT_WRITE_OFF qatorlari
    // bor va ularning tarixi «Kechirilganlar» tabida ko'rinib turishi
    // kerak. Iste'molchi — `StudentEnrollmentService` (eligibility + ikkala
    // yozish yo'li), o'quvchi guruhining `branchId`si bilan o'qiydi, shuning
    // uchun filial darajasida yozilishi ma'noli (companyLevelOnly EMAS).
    defaultValue: false,
    parse: (raw) => parseBoolean('payment.debtWriteOffEnabled', raw),
  },
```

- [ ] **Step 4: Yurgizib o'tishini ko'rish**

Run: `npx jest src/settings/settings.types.spec.ts 2>&1 | tail -6`
Expected: hammasi PASS.

- [ ] **Step 5: Controller testi (`settings.controller.spec.ts`)**

`beforeEach` dagi `settingsService` mockiga (103–118) yangi kalitni qo'shing:

```ts
      getMany: jest.fn().mockResolvedValue({
        'payment.defaultModel': 'LESSON_PACK',
        'payment.excusedCreditEnabled': true,
        'payment.excusedCreditMonthlyCap': null,
        'payment.chargeDayOfMonth': 1,
        'payment.debtWriteOffEnabled': false,
      }),
      set: jest.fn().mockResolvedValue(undefined),
      getBranchOverrides: jest.fn().mockResolvedValue({
        'payment.defaultModel': [],
        'payment.excusedCreditEnabled': [5],
        'payment.excusedCreditMonthlyCap': [],
        'payment.chargeDayOfMonth': [],
        'payment.debtWriteOffEnabled': [],
      }),
```

Fayl boshidagi role-guard describe'dagi `mockSettingsService.getMany` (14–19) ga ham `'payment.debtWriteOffEnabled': false,` qo'shing.

`'Branch Director is always locked to their own branch...'` testidan keyin:

```ts
  it('debtWriteOffEnabled is written through its registry key (branch-level for a Branch Director)', async () => {
    prisma.user.findFirst.mockResolvedValue(bdUser);
    await controller.updatePayment(
      { debtWriteOffEnabled: true } as any,
      2,
      1001,
    );
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.debtWriteOffEnabled',
      true,
      2,
      5,
    );
  });
```

- [ ] **Step 6: Yurgizib yiqilishini ko'rish**

Run: `npx jest src/settings/settings.controller.spec.ts -t "debtWriteOffEnabled" 2>&1 | tail -12`
Expected: FAIL — `set` chaqirilmagan (`edits` bo'sh → `BadRequestException('Kamida bitta sozlama yuborilishi kerak')`).

- [ ] **Step 7: DTO va controller**

`update-payment-settings.dto.ts` — `chargeDayOfMonth` dan keyin:

```ts
  @IsOptional()
  @IsBoolean()
  debtWriteOffEnabled?: boolean;
```

`settings.controller.ts` `updatePayment` da `chargeDayOfMonth` bloki ostiga:

```ts
    if (dto.debtWriteOffEnabled !== undefined) {
      edits.push(['payment.debtWriteOffEnabled', dto.debtWriteOffEnabled]);
    }
```

- [ ] **Step 8: Yurgizib o'tishini ko'rish**

Run: `npx jest src/settings 2>&1 | tail -6`
Expected: hammasi PASS.

- [ ] **Step 9: Dizayn hujjati §5 jadvalini moslash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov && python3 - <<'PY'
import io
p='docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md'
s=io.open(p,encoding='utf-8').read()
old="| `defaultModel` | yangi kurs uchun standart model | `MONTHLY` |"
new="| `defaultModel` | yangi kurs uchun standart model | `LESSON_PACK` cutover'gacha, keyin CEO `MONTHLY` qiladi |"
assert old in s; s=s.replace(old,new,1)
anchor="### Uzrli dars"
row="""### Qarz

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `debtWriteOffEnabled` | qarz kechirish amaliga ruxsat (9-javob: yo'q) | `false` |

"""
assert anchor in s; s=s.replace(anchor,row+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print("§5 yangilandi")
PY
```

- [ ] **Step 10: Commit**

```bash
git add server/src/settings docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md
git commit -m "$(cat <<'EOF'
Sozlamalar: payment.debtWriteOffEnabled (o'chiq) va cutover'gacha LESSON_PACK

CEO (21.09.2026, 9-javob): qarz hech qachon kechirilmaydi. Amal o'chirib
tashlanmaydi — prodda kechirilgan qarzlar bor, tarixi «Kechirilganlar»
tabida qolishi kerak — sozlama bilan yopiladi. Iste'molchisi keyingi
commitda (StudentEnrollmentService). Filial darajasida yoziladi.

payment.defaultModel boshlang'ichi MONTHLY → LESSON_PACK: Course.paymentModel
ustuni allaqachon LESSON_PACK default bilan, lekin yangi kurs shu sozlamani
oladi — kod chiqqan kuni yaratilgan kurs jimgina oylik bo'lib qolardi.
--apply kuni CEO panelda MONTHLY qiladi.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Qarz kechirish sozlama bilan yopiladi — server iste'molchisi va klient

**Files:**
- Modify: `server/src/billing/debt-write-off.service.ts:452`
- Modify: `server/src/students/student-enrollment.service.ts:51-58` (constructor), `:489-495` (removeFromGroup load), `:594-600` (write-off validation), `getDebtWriteOffEligibility`, `writeOffDroppedEnrollmentDebt`
- Modify: `server/src/students/students.module.ts:20-27`
- Test: `server/src/students/student-enrollment.service.spec.ts`
- Modify: `client/src/components/students/debt-write-off-types.ts:7`
- Modify: `client/src/components/students/write-off-debt-dialog.tsx:164-190`
- Modify: `client/src/components/settings/payment-settings-client.tsx`

**Interfaces:**
- Consumes: `SettingsService.get(companyId, 'payment.debtWriteOffEnabled', branchId): Promise<boolean>` (Task 3), `DebtWriteOffService.computeEligibility(enrollmentId, companyId)`.
- Produces: `GET .../debt-write-off-eligibility` sozlama o'chiq bo'lsa `{ ...eligibility, eligible: false, reason: 'DISABLED' }`; `POST .../write-off-cycle-debt` va `removeFromGroup({ writeOffCycleDebt: true })` → `ForbiddenException`. Klient reason union: `"NO_DEBT" | "NO_ABSENT_IN_CYCLE" | "DISABLED"`.

Klient mantig'i: `student-remove-from-group-dialog.tsx:98` `showWriteOffBlock = writeOffWired && !!eligibility?.eligible` — `eligible=false` blokni O'ZI yashiradi, o'zgarish kerak emas. Alohida `WriteOffDebtDialog` (profildagi yopilgan yozilishlar bo'limi) `IneligibleNotice` ko'rsatadi — unga `DISABLED` matni qo'shiladi.

- [ ] **Step 1: Server testlari (`student-enrollment.service.spec.ts`)**

Importlarga:

```ts
import { ForbiddenException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
```

(`BadRequestException, NotFoundException` allaqachon `@nestjs/common` dan import qilinadi — `ForbiddenException` ni o'sha qatorga qo'shing.)

`describe` boshida `let monthlyChargeMock: any;` yoniga:

```ts
  let settingsMock: any;
  let debtWriteOffMock: any;
```

Providers'da `DebtWriteOffService` qiymatini o'zgaruvchiga oling va `SettingsService` qo'shing:

```ts
        {
          provide: DebtWriteOffService,
          useValue: (debtWriteOffMock = {
            computeEligibility: jest.fn(),
            executeWriteOff: jest.fn().mockResolvedValue({
              transaction: { id: 'tx-1' },
              balanceBefore: -100_000,
              balanceAfter: 0,
            }),
            reverseWriteOff: jest.fn(),
          }),
        },
        {
          // Boshlang'ich: kechirish O'CHIQ (9-javob). Yoqadigan testlar
          // mockResolvedValue(true) bilan qayta belgilaydi.
          provide: SettingsService,
          useValue: (settingsMock = {
            get: jest.fn().mockResolvedValue(false),
          }),
        },
```

`describe('removeFromGroup'` `beforeEach` dagi `prisma.enrollment.findFirst` javobiga `group` qo'shing:

```ts
      prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enroll-1',
        studentId: 1,
        groupId: 'group-1',
        status: 'ACTIVE',
        group: { branchId: 1 },
      });
```

`describe('removeFromGroup'` ichiga (oxiriga) qo'shing:

```ts
    it("qarz kechirish O'CHIQ (boshlang'ich): writeOffCycleDebt=true rad etiladi, yozilish tegilmaydi", async () => {
      prisma.studentExitReason.findFirst.mockResolvedValueOnce({
        id: 'reason-1',
        name: 'Moliyaviy sabablar',
        companyId: 1001,
        appliesTo: ['GROUP_REMOVAL'],
      });

      await expect(
        service.removeFromGroup(1, 'enroll-1', 10001, 1001, {
          departureReasonId: 'reason-1',
          writeOffCycleDebt: true,
          writeOffReason: "Yo'qolgan o'quvchi",
          writeOffConfirmAmount: 100_000,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.enrollment.update).not.toHaveBeenCalled();
      expect(debtWriteOffMock.executeWriteOff).not.toHaveBeenCalled();
      // Sozlama o'quvchi GURUHINING filiali bo'yicha o'qiladi.
      expect(settingsMock.get).toHaveBeenCalledWith(
        1001,
        'payment.debtWriteOffEnabled',
        1,
      );
    });

    it("kechirish so'ralmasa sozlama umuman o'qilmaydi — oddiy chiqarish o'zgarmaydi", async () => {
      prisma.studentExitReason.findFirst.mockResolvedValueOnce({
        id: 'reason-1',
        name: 'Moliyaviy sabablar',
        companyId: 1001,
        appliesTo: ['GROUP_REMOVAL'],
      });

      await service.removeFromGroup(1, 'enroll-1', 10001, 1001, {
        departureReasonId: 'reason-1',
      });

      expect(prisma.enrollment.update).toHaveBeenCalled();
      expect(settingsMock.get).not.toHaveBeenCalled();
    });
```

Yangi describe'lar (fayl oxiriga, asosiy `describe` ichida):

```ts
  describe('getDebtWriteOffEligibility', () => {
    it("sozlama o'chiq bo'lsa eligible=false, reason=DISABLED — hisob ko'rinadi, amal yo'q", async () => {
      prisma.enrollment.findFirst.mockResolvedValue({
        studentId: 1,
        group: { branchId: 1 },
      });
      debtWriteOffMock.computeEligibility.mockResolvedValue({
        eligible: true,
        details: { currentBalance: -100_000 },
      });

      const res = await service.getDebtWriteOffEligibility(
        1,
        'enroll-1',
        1001,
        10001,
      );

      expect(res).toMatchObject({
        eligible: false,
        reason: 'DISABLED',
        details: { currentBalance: -100_000 },
      });
    });

    it("sozlama yoqiq bo'lsa DebtWriteOffService javobi o'zgarishsiz qaytadi", async () => {
      settingsMock.get.mockResolvedValue(true);
      prisma.enrollment.findFirst.mockResolvedValue({
        studentId: 1,
        group: { branchId: 1 },
      });
      debtWriteOffMock.computeEligibility.mockResolvedValue({
        eligible: true,
        details: { currentBalance: -100_000 },
      });

      const res = await service.getDebtWriteOffEligibility(
        1,
        'enroll-1',
        1001,
        10001,
      );

      expect(res).toEqual({
        eligible: true,
        details: { currentBalance: -100_000 },
      });
    });
  });

  describe('writeOffDroppedEnrollmentDebt', () => {
    beforeEach(() => {
      prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enroll-1',
        status: 'DROPPED',
        studentId: 1,
        group: { branchId: 1 },
      });
    });

    it("sozlama o'chiq bo'lsa ForbiddenException, executeWriteOff chaqirilmaydi", async () => {
      await expect(
        service.writeOffDroppedEnrollmentDebt(1, 'enroll-1', 10001, 1001, {
          reason: "Yo'qolgan o'quvchi",
          confirmAmount: 100_000,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(debtWriteOffMock.executeWriteOff).not.toHaveBeenCalled();
    });

    it("sozlama yoqiq bo'lsa kechirish avvalgidek o'tadi", async () => {
      settingsMock.get.mockResolvedValue(true);

      await service.writeOffDroppedEnrollmentDebt(1, 'enroll-1', 10001, 1001, {
        reason: "Yo'qolgan o'quvchi",
        confirmAmount: 100_000,
      });

      expect(debtWriteOffMock.executeWriteOff).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollmentId: 'enroll-1',
          companyId: 1001,
          performedById: 10001,
          reason: "Yo'qolgan o'quvchi",
          confirmAmount: 100_000,
        }),
      );
    });
  });
```

Agar `writeOffDroppedEnrollmentDebt` ichidagi `assertCallerMayWriteForStudent` qorovuli qo'shimcha Prisma mock talab qilsa (masalan `prisma.student.findFirst`), uni `removeFromGroup` describe'idagi qorovul mocklariga o'xshatib qo'shing — qorovul CEO uchun `user.findFirst` dan keyin to'xtaydi.

- [ ] **Step 2: Yurgizib yiqilishini ko'rish**

Run: `npx jest src/students/student-enrollment.service.spec.ts 2>&1 | tail -25`
Expected: DI xatosi (`SettingsService` in'ektsiya qilinmagan — Nest «can't resolve» yoki servis konstruktori qabul qilmaydi) yoki yangi testlar FAIL. Mavjud testlar yiqilmasligi kerak.

- [ ] **Step 3: `debt-write-off.service.ts:452` — reason turi**

```ts
export type DebtWriteOffEligibilityReason =
  | 'NO_DEBT'
  | 'NO_ABSENT_IN_CYCLE'
  | 'DISABLED';
```

- [ ] **Step 4: `StudentEnrollmentService` — in'ektsiya va uch yo'l**

Import:

```ts
import { ForbiddenException } from '@nestjs/common'; // mavjud @nestjs/common importiga qo'shing
import { SettingsService } from '../settings/settings.service';
```

Constructor:

```ts
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private enrollmentBillingService: EnrollmentBillingService,
    private debtWriteOffService: DebtWriteOffService,
    private monthlyChargeService: MonthlyChargeService,
    private eventEmitter: EventEmitter2,
    private settingsService: SettingsService,
  ) {}
```

Yordamchi (klass ichida, `getDebtWriteOffEligibility` dan oldin):

```ts
  /**
   * Qarz kechirish yoqilganmi — o'quvchi GURUHINING filiali bo'yicha
   * (`payment.debtWriteOffEnabled`, filial qiymati kompaniyadan ustun).
   * CEO (21.09.2026, 9-javob): boshlang'ich holatda O'CHIQ. Uch yo'l ham
   * shu yerdan o'qiydi: eligibility (klient blokni yashirsin), alohida
   * kechirish va chiqarish bilan birga kechirish.
   */
  private async assertDebtWriteOffEnabled(
    companyId: number,
    branchId: number,
  ): Promise<void> {
    const enabled = await this.settingsService.get(
      companyId,
      'payment.debtWriteOffEnabled',
      branchId,
    );
    if (!enabled) {
      throw new ForbiddenException(
        "Qarz kechirish bu filialda o'chirilgan (Sozlamalar → To'lov → «Qarz kechirishga ruxsat»)",
      );
    }
  }
```

`getDebtWriteOffEligibility` — `select` ga guruh filialini qo'shing va javobni o'zgartiring:

```ts
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, deletedAt: null, student: { companyId } },
      select: { studentId: true, group: { select: { branchId: true } } },
    });
    if (!enrollment) {
      throw new NotFoundException('Yozuv topilmadi');
    }
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      enrollment.studentId,
      companyId,
    );
    const eligibility = await this.debtWriteOffService.computeEligibility(
      enrollmentId,
      companyId,
    );
    const enabled = await this.settingsService.get(
      companyId,
      'payment.debtWriteOffEnabled',
      enrollment.group.branchId,
    );
    if (!enabled) {
      // Hisob (balans, sikl) ko'rinadi — amal yo'q. Klient `eligible=false`
      // ni ko'rib blokni yashiradi; `reason` nega ekanini aytadi.
      return { ...eligibility, eligible: false, reason: 'DISABLED' as const };
    }
    return eligibility;
```

`writeOffDroppedEnrollmentDebt` — `select` ga `group: { select: { branchId: true } }` qo'shing; `if (enrollment.status === 'ACTIVE') {...}` blokidan KEYIN, `assertCallerMayWriteForStudent` dan OLDIN:

```ts
    await this.assertDebtWriteOffEnabled(companyId, enrollment.group.branchId);
```

`removeFromGroup` — yozilishni yuklashda:

```ts
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        deletedAt: null,
        student: { companyId },
      },
      include: { group: { select: { branchId: true } } },
    });
```

Kechirish kiritmalarini tekshirish blokining boshiga:

```ts
    if (input.writeOffCycleDebt) {
      await this.assertDebtWriteOffEnabled(companyId, enrollment.group.branchId);
      if (!input.writeOffReason || input.writeOffReason.trim().length < 5) {
```

- [ ] **Step 5: `students.module.ts` — `SettingsModule`**

```ts
import { SettingsModule } from '../settings/settings.module';
// ...
  imports: [
    UploadModule,
    SmsModule,
    AttendanceModule,
    TransactionsModule,
    PaymentGatewaysModule,
    BillingModule,
    SettingsModule,
  ],
```

- [ ] **Step 6: Yurgizib o'tishini ko'rish + to'liq server**

```bash
npx jest src/students/student-enrollment.service.spec.ts 2>&1 | tail -6
npm run typecheck 2>&1 | tail -3
npm test -- --silent 2>&1 | tail -6
```

Expected: hammasi PASS, typecheck toza. `students.controller.spec.ts` yiqilsa — u `StudentEnrollmentService` ni mock qiladi, DI ga ta'sir qilmasligi kerak; yiqilsa provider ro'yxatiga `SettingsService` mock qo'shing.

- [ ] **Step 7: Klient — reason turi va matn**

`client/src/components/students/debt-write-off-types.ts:7`:

```ts
export type DebtWriteOffEligibilityReason =
  | "NO_DEBT"
  | "NO_ABSENT_IN_CYCLE"
  | "DISABLED";
```

`client/src/components/students/write-off-debt-dialog.tsx` `IneligibleNotice`:

```tsx
function IneligibleNotice({
  eligibility,
}: {
  eligibility: DebtWriteOffEligibility;
}) {
  const disabled = eligibility.reason === "DISABLED";
  const reasonMessage: Record<string, string> = {
    NO_DEBT: "Bu yozuv uchun balans manfiy emas — hisobdan chiqarishga hojat yo'q.",
    STUDENT_ATTENDED:
      "O'quvchi joriy siklda darslarga qatnashgan — bu yozuv qarzi haqiqiy qarz hisoblanadi.",
    NO_ABSENT_IN_CYCLE:
      "Joriy siklda 'ABSENT' (kelmagan) belgilangan davomat yo'q.",
    DISABLED:
      "Qarz kechirish bu filialda o'chirilgan — qarz butun tarixi bilan saqlanadi. Yoqish: Sozlamalar → To'lov → «Qarz kechirishga ruxsat».",
  };
  return (
    <div className="rounded-md border border-muted-foreground/30 bg-muted/40 p-3 text-sm">
      <p className="font-medium">
        {disabled
          ? "Qarz kechirish o'chirilgan"
          : "Hisobdan chiqarish sharti bajarilmadi"}
      </p>
      <p className="mt-1 text-muted-foreground">
        {eligibility.reason
          ? reasonMessage[eligibility.reason]
          : "Sharti bajarilmadi."}
      </p>
      <div className="mt-2 text-xs text-muted-foreground">
        Joriy balans: <strong>{formatBalance(eligibility.details.currentBalance)}</strong>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Klient — sozlamalar sahifasida Switch**

`payment-settings-client.tsx` `PaymentSettingsValues` ga:

```ts
  "payment.debtWriteOffEnabled": boolean;
```

JSX'da «Hisob-kitob kuni» blokidan KEYIN (yopuvchi `</div>` dan oldin, ya'ni `<div className="space-y-5">` ichida oxirgi bo'lim sifatida):

```tsx
        <Separator />

        {/* Qarz kechirish */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="pr-4">
              <p className="text-sm font-medium">Qarz kechirishga ruxsat</p>
              <p className="text-xs text-muted-foreground">
                O&apos;chiq bo&apos;lsa (standart) o&apos;quvchining qarzi hech
                qachon hisobdan chiqarilmaydi — guruhdan chiqarish oynasida va
                profildagi kechirish tugmasi ishlamaydi, server rad etadi. Qarz
                butun tarixi bilan saqlanadi. Yoqilsa, administrator sabab
                yozib va summani qayta kiritib kechira oladi.
              </p>
            </div>
            <Switch
              checked={settings["payment.debtWriteOffEnabled"]}
              disabled={!canEdit || saving}
              onCheckedChange={(checked) =>
                saveField({ debtWriteOffEnabled: checked })
              }
            />
          </div>
          {renderOverrideNote("payment.debtWriteOffEnabled")}
        </div>
```

- [ ] **Step 9: Klient tekshiruvi**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov/client
npm ci
npx tsc --noEmit 2>&1 | tail -5
npx eslint src/components/students/write-off-debt-dialog.tsx src/components/students/debt-write-off-types.ts src/components/settings/payment-settings-client.tsx 2>&1 | tail -5
npx vitest run 2>&1 | tail -5
npm run build 2>&1 | grep -E "settings/payment|Compiled|error|Error" | head -5
```

Expected: tsc bo'sh; eslint 0 xato; vitest hammasi PASS; build da `/settings/payment` qatori, xato yo'q.

- [ ] **Step 10: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov
git add server/src/billing/debt-write-off.service.ts server/src/students/student-enrollment.service.ts server/src/students/student-enrollment.service.spec.ts server/src/students/students.module.ts client/src/components/students/debt-write-off-types.ts client/src/components/students/write-off-debt-dialog.tsx client/src/components/settings/payment-settings-client.tsx
git commit -m "$(cat <<'EOF'
Qarz kechirish payment.debtWriteOffEnabled bilan yopildi (boshlang'ich: yo'q)

CEO (21.09.2026, 9-javob): qarz hech qachon kechirilmaydi, tarixi
saqlanadi. Uchala yo'l o'quvchi guruhining filiali bo'yicha sozlamani
o'qiydi: eligibility eligible=false, reason=DISABLED qaytaradi (klient
blokni o'zi yashiradi — showWriteOffBlock eligible ga bog'liq); alohida
kechirish va chiqarish-bilan-kechirish ForbiddenException.

«Kechirilganlar» tabi va prodda yozilgan DEBT_WRITE_OFF qatorlari
tegilmaydi — ular «qachon qancha qarz qolgan» tarixining bir qismi.
Sozlamalar → To'lov da «Qarz kechirishga ruxsat» tugmasi (CEO/BD).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: CEO tasdiqlagan kurs almashish misoli test bilan qotiriladi (13-javob)

**Files:**
- Test: `server/src/billing/monthly-charge.service.spec.ts` (yangi `describe`, `reverseChargeForDeparture` describe'idan keyin)

**Interfaces:**
- Consumes: `createChargeForEnrollment`, `reverseChargeForDeparture` (mavjud), `enrollment()` fixture, `prismaMock.enrollment.findUnique`.
- Produces: hech narsa — faqat test. Kod o'zgarmaydi: har guruh o'z `exactDays` idan `plannedLessons` hisoblaydi (`monthly-charge.service.ts:140-147`).

Raqamlar (prod, 21.09.2026): Standart 450 000, haftada 3 kun (du/chor/ju) → oktabr 2026 da 13 dars; Intensive 740 000, haftada 5 kun → 22 dars. O'quvchi 15-oktabrda o'tadi. Kod oy ulushini yaxlitlaydi (`proratedMonthlyAmount`), CEO ko'rgan misol dars boshiga yaxlitlagan — jami 611 331 vs 611 322, 9 so'm farq yaxlitlash tartibidan; usul bir xil.

- [ ] **Step 1: Testlarni yozish**

```ts
  describe("kurs almashish — har kurs o'z narxi va o'sha oydagi o'z dars soni bilan (CEO 21.09.2026, 13-javob)", () => {
    // Prod, 21.09.2026: Standart 450 000 (haftada 3 kun), Intensive 740 000
    // (haftada 5 kun). O'quvchi 15-oktabrda Standart → Intensive o'tadi.
    // Oktabr 2026: 1-oktabr payshanba. Du/chor/ju = 13 dars, du–ju = 22 dars.
    const MON_WED_FRI = ['friday', 'monday', 'wednesday'];
    const MON_TO_FRI = ['friday', 'monday', 'thursday', 'tuesday', 'wednesday'];

    it("yangi kurs (Intensive): 22 darslik oyning 12 tasi — 740 000 × 12/22, bo'luvchi Standartning 13 i EMAS", async () => {
      const charge = await service.createChargeForEnrollment(tx, {
        enrollment: enrollment({
          id: 'enr-intensive',
          startDate: new Date('2026-10-15T00:00:00Z'),
          group: {
            id: 'grp-intensive',
            branchId: 1,
            companyId: 1,
            statusEnum: 'ACTIVE',
            exactDays: MON_TO_FRI,
            course: {
              price: 740_000,
              paymentModel: 'MONTHLY',
              lessonPaymentCount: 20,
            },
          },
        }),
        periodYear: 2026,
        periodMonth: 10,
        companyId: 1,
      });

      expect(charge?.plannedLessons).toBe(22);
      // 15,16,19,20,21,22,23,26,27,28,29,30
      expect(charge?.coveredLessons).toBe(12);
      expect(charge?.perLessonCost).toBe(33_636); // 740 000 / 22
      expect(charge?.chargedAmount).toBe(403_636); // 740 000 × 12/22
      // Standartning 13 iga bo'linsa 500 000 × 12/13 kabi ma'nosiz raqam
      // chiqardi — CEO rad etgan variant (dizayn 21.09, §3 jadvali).
    });

    it("eski kurs (Standart): 14-oktabrdan keyingi 7 dars qaytadi — 13 darslik oyning O'Z narxida", async () => {
      // Ketish yo'li guruh jadvalini o'zi o'qiydi — du/chor/ju.
      prismaMock.enrollment.findUnique.mockResolvedValueOnce({
        studentId: 10453,
        group: { branchId: 1, exactDays: MON_WED_FRI },
      });
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue({
        id: 'chg-standart',
        groupId: 'grp-1',
        plannedLessons: 13,
        coveredLessons: 13,
        perLessonCost: 34_615, // 450 000 / 13
        chargedAmount: 450_000,
        transactionId: 'tx-1',
        status: 'CHARGED',
      });

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate: new Date('2026-10-14T00:00:00Z'),
        companyId: 1,
        reason: "Boshqa kursga o'tdi",
      });

      // Oktabr du/chor/ju: 2,5,7,9,12,14 | 16,19,21,23,26,28,30 → 14-dan keyin 7.
      expect(res?.refunded).toBe(242_305); // 7 × 34 615
      expect(prismaMock.enrollmentMonthlyCharge.update).toHaveBeenCalledWith({
        where: { id: 'chg-standart' },
        data: { coveredLessons: 6, chargedAmount: 207_695 },
      });
      // Oktabr jami: 207 695 (Standart) + 403 636 (Intensive) = 611 331.
      // CEO tasdiqlagan misol dars boshiga yaxlitlab 611 322 bergan — 9 so'm
      // farq yaxlitlash tartibidan (kod oy ulushini yaxlitlaydi, sikl narxi
      // qoldig'i muammosini qaytarmaslik uchun — monthly-price.ts sarlavhasi).
    });
  });
```

- [ ] **Step 2: Yurgizib o'tishini ko'rish**

Run: `npx jest src/billing/monthly-charge.service.spec.ts -t "kurs almashish" 2>&1 | tail -12`
Expected: ikkalasi PASS birinchi urinishda — kod allaqachon shunday. Yiqilsa — bu haqiqiy topilma: raqamlarni o'zgartirmang, farqni CEO ga ko'rsating.

- [ ] **Step 3: Commit**

```bash
git add server/src/billing/monthly-charge.service.spec.ts
git commit -m "$(cat <<'EOF'
Test: kurs almashish har kurs o'z narxi va o'z dars soni bilan (13-javob)

CEO 21.09.2026 da tasdiqlagan misol: Standart (13 dars, 450 000) →
Intensive (22 dars, 740 000), 15-oktabr. Kod allaqachon shunday ishlaydi —
har guruh o'z exactDays idan plannedLessons oladi. Test raqamlarni
qotiradi: 403 636 + 207 695. CEO misoli dars boshiga yaxlitlab 611 322
bergan, kod 611 331 — 9 so'm yaxlitlash farqi, usul bir xil.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Sinov hisoboti bugungi prod bazada — SXEMA CHIQQANDAN KEYIN

**Files:**
- Yuritiladi: `server/scripts/migrate-to-monthly.ts --dry-run --period=YYYY-MM`
- Chiqadi: `docs/migration-preview-<sana>.csv`
- Modify: `docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md` (yangi §11 «Sinov hisoboti»)

**Interfaces:**
- Consumes: prod `DATABASE_URL` (`railway run`), `EnrollmentMonthlyCharge` jadvali PRODDA (sxema chiqqan bo'lishi shart — `scopeWhere` unga murojaat qiladi), `Course.paymentModel` ustuni.
- Produces: CEO o'qiydigan CSV + konsol sarhisobi; hujjatda raqamlar.

**Shart:** Bu vazifa Task 1–5 dan keyin, `feat/oylik-tolov-tizimi` `main` ga birlashtirilib, sxema + kod prodga chiqqandan KEYIN yuradi. Chiqarish xavfsiz: `Course.paymentModel` DEFAULT `LESSON_PACK` (migratsiya SQL 8-qator), `payment.defaultModel` boshlang'ichi `LESSON_PACK` (Task 3) — hech bir kurs oylikka o'tmaydi, oy boshi croni `createChargeForEnrollment` da `paymentModel !== MONTHLY` ko'rib hech narsa yozmaydi. Birlashtirish alohida ish (508 commit).

Cutover oyi — CEO qarori. Bugun 21.09.2026; eng yaqin mantiqiy sana **01.10.2026** → `--period=2026-10`. Sentabr `LESSON_PACK` da qoladi.

- [ ] **Step 1: Railway ulanishini tekshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov/server
railway status
```

Expected: `Project: caring-courage`, `Environment: production`, `Service: caring-courage`. Boshqacha bo'lsa: `railway link` (interaktiv — `caring-courage` / `production` tanlang) va qayta tekshiring.

- [ ] **Step 2: Sxema prodda ekanini tasdiqlash (o'qish)**

```bash
cat > scripts/_probe-monthly-schema.ts <<'EOF'
/** FAQAT O'QISH — oylik jadval va ustunlar prodda bormi. */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('EnrollmentMonthlyCharge', 'Setting')`;
  const cols = await prisma.$queryRaw<{ column_name: string; column_default: string | null }[]>`
    SELECT column_name, column_default FROM information_schema.columns
    WHERE table_name = 'Course' AND column_name = 'paymentModel'`;
  console.log('Jadvallar:', rows.map((r) => r.table_name));
  console.log('Course.paymentModel:', cols);
  const monthly = await prisma.course.count({ where: { paymentModel: 'MONTHLY' } });
  console.log('MONTHLY kurslar soni (0 bo\'lishi kerak):', monthly);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
EOF
railway run --service caring-courage npx tsx scripts/_probe-monthly-schema.ts 2>&1 | grep -v "sslmode\|libpq\|trace-warnings\|^$"
```

Expected: `Jadvallar: [ 'EnrollmentMonthlyCharge', 'Setting' ]`, `column_default` ichida `'LESSON_PACK'`, `MONTHLY kurslar soni: 0`. Jadval yo'q bo'lsa — sxema hali chiqmagan, TO'XTANG. (`scripts/_*.ts` gitignore'da.)

- [ ] **Step 3: Sinov hisobotini yurgizish (faqat o'qish)**

```bash
railway run --service caring-courage npx tsx scripts/migrate-to-monthly.ts --dry-run --period=2026-10 2>&1 | grep -v "sslmode\|libpq\|trace-warnings" | tee /tmp/dry-run-2026-10.txt
ls -la ../docs/migration-preview-*.csv | tail -2
```

Expected: sarlavhada muhit **PROD** deb yozilgan (`dbEnvLabel`); sarhisob (o'quvchi soni, oldindan to'langan darslar, tushum, ustoz haqi farqi) va guruh kesimi jadvali; `docs/migration-preview-<bugun>.csv` yaratilgan. Konsolda `create`/`update` haqida hech narsa yo'q.

- [ ] **Step 4: Dizayn hujjatidagi 02.09 raqamlari bilan solishtirish**

`2026-09-02-oylik-tolov-tizimi-design.md` §2 jadvali (370 yozilish, 107 o'quvchida 444 dars ≈ 16 546 494 so'm) va §9 «Migratsiya oldidan majburiy hisobot» misollari (#031: 50 o'quvchi, 13 dars, 37 500 → 34 615, ustoz −7.7%) bilan. Kutilgan: raqamlar 19 kunda o'zgargan, lekin tartib bir xil (yuzlab o'quvchi, o'n millionlab so'm). Ustoz farqi endi 1-javob (FIXED_PER_STUDENT bo'luvchisi) va 2-vazifa (bayram) hisobga olingan holda chiqadi — 02.09 dagi `−7.7%` bilan bir xil bo'lishi SHART EMAS.

- [ ] **Step 5: Raqamlarni hujjatga yozish**

`docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md` oxiriga:

```markdown
## 11. Sinov hisoboti (prod, <sana>, `--period=2026-10`)

| Ko'rsatkich | 02.09.2026 (dizayn §2) | <sana> |
|---|---|---|
| Qamrovdagi yozilish | 370 | … |
| Oldindan to'langan darsi borlar | 107 o'quvchi / 444 dars / 16 546 494 | … |
| Oktabr uchun kutilgan tushum | — | … |
| Ustoz haqi farqi (jami) | ≈ −7.7 % (#031) | … |

CSV: `docs/migration-preview-<sana>.csv` — CEO ko'rib chiqadi. `--apply`
faqat shu fayl mavjud bo'lganda ishlaydi (skriptning o'z qorovuli).

**CEO tasdig'idan keyin:**
1. `railway run --service caring-courage npx tsx scripts/migrate-to-monthly.ts --apply --ha-men-tasdiqlayman --zaxira-olindi --limit=5 --period=2026-10` — 5 ta o'quvchi bilan sinov
2. `railway run --service caring-courage npx tsx scripts/verify-monthly-migration.ts --period=2026-10`
3. Limitsiz `--apply`, keyin yana `verify`
4. Sozlamalar → To'lov → «Yangi kurslar uchun standart to'lov modeli» → **Oylik** (Task 3 buni `LESSON_PACK` qilib qo'ygan)
```

`…` joylariga /tmp/dry-run-2026-10.txt dagi haqiqiy raqamlarni yozing.

- [ ] **Step 6: Commit va CEO ga topshirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/oylik-tolov
git add docs/superpowers/specs/2026-09-21-oylik-tolov-qarorlar-design.md
git commit -m "$(cat <<'EOF'
Sinov hisoboti: prod, --period=2026-10 — CEO tasdig'ini kutmoqda

Migratsiya oldidan majburiy hisobot (dizayn 02.09, §9) bugungi bazada.
CSV docs/ da; raqamlar dizayn hujjatining 11-bo'limida 02.09 bilan
yonma-yon. --apply CEO o'qib tasdiqlagandan keyin, avval --limit=5.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

CSV ni CEO ga bering (`docs/migration-preview-<sana>.csv`). CSV **git'ga tushmaydi** (`.gitignore`, commit `d186ec55`) — faylning o'zini yuboring.

---

## Reja tashqarisida (keyingi ishlar, tartib bilan)

1. **`feat/oylik-tolov-tizimi` → `main`** (508 commit orqada). Task 1–5 dan keyin, Task 6 dan oldin. Katta birlashtirish — alohida sessiya, konfliktlar kutiladi (`settings-nav.ts`, `breadcrumb-routes.ts`, `docs/adr/README.md`, `payments-debtors.service.ts`).
2. **Deploy** (Vercel + Railway, `/deploy` — Railway bu safar SHART, sxema migratsiyasi bor). Xatti-harakat o'zgarmaydi (hamma kurs `LESSON_PACK`).
3. Task 6.
4. Dizayn hujjati §9 dagi 2–4 bosqichlar (administrator dialoglari, filial darajasidagi sozlamalar, yangi ekranlar).
5. Shartnoma — yurist bilan (dasturdan tashqari, `--apply` dan oldin tayyor bo'lishi kerak).
