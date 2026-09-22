# Telegram «Tushum tarkibi» — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 21:00 Telegram hisoboti va «Moliyaviy xulosa» kartochkasi tushgan pulni
«shu oy uchun» / «eski qarzlar uchun» ga ajratib, qarz qismini oylar bo'yicha ko'rsatsin.

**Architecture:** Yangi hisob-kitob yo'q. Ikkala sirt ham mavjud
`getIncomeMonthAttribution` natijasini ishlatadi (kunlik hisobot uni allaqachon
chaqiradi). Matn bitta umumiy yordamchi funksiyada yasaladi, shuning uchun ikki
sirt bir xil ko'rinadi. Bosma «Tushum (haqiqiy)» raqami ham o'sha obyektdan
olinadi — shunda qatorlar doim qo'shiladi.

**Tech Stack:** NestJS + TypeScript, Jest, Telegram HTML parse_mode.

**Spec:** `docs/superpowers/specs/2026-09-19-telegram-tushum-tarkibi-design.md`

## Global Constraints

- Matn **lotin o'zbekchada**, mavjud xabar uslubida (`•` bilan boshlanadigan qator,
  raqam `<b>…</b>` ichida, summa `formatSum` orqali).
- Yangi Prisma so'rovi, migratsiya, env o'zgaruvchisi **yo'q**.
- Kunlik hisobotda `getIncomeMonthAttribution` **bittadan ortiq marta chaqirilmaydi**.
- Har qanday xatoda xabar baribir chiqadi (taqsimot qatorlari tushib qoladi).
- `DailyFinancialSnapshot.mtdIncome` eski `payment.aggregate` asosida qoladi.
- Testlar `server/` ichidan: `npx jest <path>`.

---

### Task 1: Umumiy matn yordamchisi

**Files:**
- Create: `server/src/telegram-groups/utils/income-split.util.ts`
- Test: `server/src/telegram-groups/utils/income-split.util.spec.ts`

**Interfaces:**
- Consumes: `formatSum` (`./format.util`).
- Produces: `buildIncomeSplitLines(split: IncomeSplitInput): string[]` va
  `IncomeSplitInput = { total: number; currentMonth: number; lateTotal: number;
  late: Array<{ label: string; amount: number }> }`. 2 va 3-task shuni chaqiradi.

- [ ] **Step 1: Write the failing test**

`server/src/telegram-groups/utils/income-split.util.spec.ts`:

```ts
import { buildIncomeSplitLines } from './income-split.util';

/** Tests read the message the way a human does: NBSP-free. */
const plain = (lines: string[]) => lines.map((l) => l.replace(/ /g, ' '));

describe('buildIncomeSplitLines', () => {
  it('splits the income into this-month vs old-debt, oldest months listed too', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 42_500_000,
        currentMonth: 31_200_000,
        lateTotal: 11_300_000,
        late: [
          { label: 'Avgust 2026', amount: 7_900_000 },
          { label: 'Iyul 2026', amount: 2_600_000 },
          { label: 'Iyun 2026', amount: 800_000 },
        ],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>31 200 000 so'm</b> (73%)",
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      "      Avgust 2026 — <b>7 900 000 so'm</b>",
      "      Iyul 2026 — <b>2 600 000 so'm</b>",
      "      Iyun 2026 — <b>800 000 so'm</b>",
    ]);
  });

  it('keeps the two percentages at exactly 100', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 3,
        currentMonth: 1,
        lateTotal: 2,
        late: [{ label: 'Iyul 2026', amount: 2 }],
      }),
    );
    // 33% + 67%, not 33% + 67%-by-luck: the late share is derived from 100.
    expect(lines[0]).toContain('(33%)');
    expect(lines[1]).toContain('(67%)');
  });

  it('says so in one line when no old debt was settled', () => {
    const lines = buildIncomeSplitLines({
      total: 5_000_000,
      currentMonth: 5_000_000,
      lateTotal: 0,
      late: [],
    });
    expect(lines).toEqual([
      "   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q",
    ]);
  });

  it('prints nothing when there is no income to split', () => {
    expect(
      buildIncomeSplitLines({
        total: 0,
        currentMonth: 0,
        lateTotal: 0,
        late: [],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/telegram-groups/utils/income-split.util.spec.ts`
Expected: FAIL — `Cannot find module './income-split.util'`.

- [ ] **Step 3: Write minimal implementation**

`server/src/telegram-groups/utils/income-split.util.ts`:

```ts
import { formatSum } from './format.util';

export interface IncomeSplitInput {
  /** The period's whole cash-in — `currentMonth + lateTotal` by construction. */
  total: number;
  /** Paid for the period's OWN month(s). */
  currentMonth: number;
  /** Paid against debt carried in from earlier months. */
  lateTotal: number;
  /** Which earlier months that debt belonged to, most recent first. */
  late: Array<{ label: string; amount: number }>;
}

/**
 * The «Tushum tarkibi» lines printed under an income figure — the same split
 * the /payments/overview "Tushumlar" drill-down shows, rendered for Telegram.
 *
 * Lives here rather than in either caller because BOTH money surfaces (the
 * 21:00 daily report and the «Moliyaviy xulosa» card) print it; two copies of
 * the wording is how the two surfaces start disagreeing.
 *
 * The caller must pass the figures from ONE `getIncomeMonthAttribution` result
 * and print them under the `total` of that same result — the lines are a
 * decomposition of that number, so a headline from anywhere else can fail to
 * add up.
 */
export function buildIncomeSplitLines(split: IncomeSplitInput): string[] {
  if (!(split.total > 0)) return [];
  if (split.lateTotal <= 0 || split.late.length === 0) {
    return ["   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q"];
  }
  // Derive the late share from 100 instead of rounding it on its own: two
  // independently-rounded percentages can print 32% + 67% under a heading that
  // claims they are the whole.
  const currentPct = Math.round((split.currentMonth / split.total) * 100);
  const latePct = 100 - currentPct;
  return [
    `   Shu oy uchun: <b>${formatSum(split.currentMonth)}</b> (${currentPct}%)`,
    `   Eski qarzlar uchun: <b>${formatSum(split.lateTotal)}</b> (${latePct}%)`,
    ...split.late.map((m) => `      ${m.label} — <b>${formatSum(m.amount)}</b>`),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/telegram-groups/utils/income-split.util.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram-groups/utils/income-split.util.ts \
        server/src/telegram-groups/utils/income-split.util.spec.ts
git commit -m "Tushum tarkibi qatorlarini yasaydigan umumiy yordamchi"
```

---

### Task 2: Kunlik hisobotga qo'shish

**Files:**
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts`
  (`computeCollection` → `computeIncomeAttribution`, `📅 Oy boshidan` bloki, sinf sarlavhasidagi izoh)
- Test: `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`

**Interfaces:**
- Consumes: `buildIncomeSplitLines` (Task 1).
- Produces: xabarda `• Tushum (haqiqiy)` qatoridan keyin taqsimot qatorlari.

- [ ] **Step 1: Write the failing test**

`telegram-group-daily-report.service.spec.ts` ichiga qo'shiladi (mavjud
`describe` ichida). `attributionMock` — to'liq shakl, chunki real xizmat ham
shu maydonlarni qaytaradi:

```ts
  function fullAttribution(overrides: Partial<any> = {}) {
    return {
      total: 42_500_000,
      currentMonth: 31_200_000,
      lateTotal: 11_300_000,
      late: [
        { monthKey: '2026-06', label: 'Iyun 2026', amount: 7_900_000 },
        { monthKey: '2026-05', label: 'May 2026', amount: 3_400_000 },
      ],
      lessonsValue: 40_000_000,
      collectionPct: 78,
      ...overrides,
    };
  }

  it('breaks the month income into this-month vs each older month', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockResolvedValue(fullAttribution()),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/ /g, ' ');

    // The headline comes from the SAME object as the split, so the three
    // figures printed here always add up.
    expect(message).toContain("• Tushum (haqiqiy): <b>42 500 000 so'm</b>");
    expect(message).toContain("   Shu oy uchun: <b>31 200 000 so'm</b> (73%)");
    expect(message).toContain(
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
    );
    // EVERY older month is listed (CEO decision), newest first.
    expect(message).toContain("      Iyun 2026 — <b>7 900 000 so'm</b>");
    expect(message).toContain("      May 2026 — <b>3 400 000 so'm</b>");
    expect(message.indexOf('Iyun 2026')).toBeLessThan(
      message.indexOf('May 2026'),
    );
  });

  it('adds the split up to the printed income figure', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockResolvedValue(fullAttribution()),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/ /g, ' ');
    const money = (label: string) => {
      const m = message.match(new RegExp(`${label}: <b>([\\d ]+) so'm</b>`));
      return Number(m![1].replace(/ /g, ''));
    };
    const monthSum = [...message.matchAll(/ — <b>([\d ]+) so'm<\/b>/g)].reduce(
      (s, m) => s + Number(m[1].replace(/ /g, '')),
      0,
    );

    expect(money('Shu oy uchun') + monthSum).toBe(money('Tushum \\(haqiqiy\\)'));
  });

  it('says there is no old debt in one line when none was settled', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockResolvedValue(
        fullAttribution({
          total: 31_200_000,
          lateTotal: 0,
          late: [],
        }),
      ),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message } = await service.build(1001, null);

    expect(message).toContain(
      "Hammasi shu oy uchun — eski qarz uchun to'lov yo'q",
    );
    expect(message).not.toContain('Eski qarzlar uchun');
  });

  it('keeps the income line on its old basis when attribution fails', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest.fn().mockRejectedValue(new Error('boom')),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/ /g, ' ');

    // state.mtdIncome — the pre-existing aggregate, unchanged.
    expect(message).toContain("• Tushum (haqiqiy): <b>280 000 000 so'm</b>");
    expect(message).not.toContain('Shu oy uchun');
    expect(message).not.toContain('Eski qarzlar uchun');
  });
```

Mavjud `prints the shared collection ratio…` testidagi mock to'liq shaklga
keltiriladi (aks holda u `total: undefined` bilan ishlaydi va nima sinalayotgani
noaniq bo'ladi):

```ts
    const getIncomeMonthAttribution = jest.fn().mockResolvedValue({
      total: 142_000_000,
      currentMonth: 142_000_000,
      lateTotal: 0,
      late: [],
      lessonsValue: 173_783_991,
      collectionPct: 82,
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts`
Expected: FAIL — yangi 4 ta test yiqiladi («Shu oy uchun» qatori yo'q, «Tushum
(haqiqiy)» hali `state.mtdIncome` = 280 000 000 ni chiqaradi).

- [ ] **Step 3: Write minimal implementation**

1. Import qo'shiladi:

```ts
import { buildIncomeSplitLines } from './utils/income-split.util';
```

2. `computeCollection` → `computeIncomeAttribution` (nomi endi bitta koeffitsiyent
   emas, butun taqsimotni qaytaradi) va `collectionPct === null` bo'lganda ham
   obyekt qaytaradi:

```ts
  private async computeIncomeAttribution(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<{
    total: number;
    currentMonth: number;
    lateTotal: number;
    late: Array<{ label: string; amount: number }>;
    lessonsValue: number;
    pct: number | null;
  } | null> {
    try {
      const attribution = await this.reports.getIncomeMonthAttribution(
        companyId,
        {
          branchIds,
          startDate: firstOfThisMonthDate().toISOString().slice(0, 10),
          endDate: tashkentTodayDate().toISOString().slice(0, 10),
        },
      );
      // A month with no lessons held yet has no collection RATIO, but its cash
      // still has a composition — returning null here would drop the split too.
      return {
        total: attribution.total,
        currentMonth: attribution.currentMonth,
        lateTotal: attribution.lateTotal,
        late: attribution.late,
        lessonsValue: attribution.lessonsValue,
        pct: attribution.collectionPct,
      };
    } catch (e) {
      this.logger.warn(
        `Income attribution failed for company ${companyId}: ${e}`,
      );
      return null;
    }
  }
```

   Chaqiruv joyi (`Promise.all` ichida) va `const [expectedValue, salary,
   canonicalNet, collection]` destrukturizatsiyasi shunga moslanadi:
   `this.computeIncomeAttribution(companyId, branchIds)`, o'zgaruvchi nomi
   `attribution`.

3. «Oy boshidan» bloki:

```ts
    // Income headline + its composition, from ONE attribution result. The
    // aggregate below (`mtdIncome`) starts at Tashkent midnight while the
    // attribution window starts at UTC midnight — five hours apart — so
    // printing one and splitting the other can fail to add up (a payment made
    // between 00:00 and 05:00 on the 1st falls in the gap). The snapshot keeps
    // the aggregate: `DailySnapshotCron` writes the same row on that basis.
    const incomeHeadline = attribution ? attribution.total : mtdIncome;
    lines.push(`• Tushum (haqiqiy): <b>${formatSum(incomeHeadline)}</b>`);
    if (attribution) {
      for (const line of buildIncomeSplitLines(attribution)) lines.push(line);
    }
```

   Quyidagi `collection` ishlatilgan uchta joy `attribution` ga o'zgaradi:
   `if (attribution && attribution.lessonsValue > 0)` (Shu oyning darslari /
   Shundan yig'ildi), `attribution.currentMonth` (yig'ilgan summa) va
   `monthPlanPct` hisobi (`attribution.currentMonth / expectedValue`).

4. Sinf sarlavhasidagi izohga bitta qator qo'shiladi:
   `📅 Oy boshidan — MTD income (+ shu oy / eski qarz taqsimoti) / expense / net …`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts`
Expected: PASS — eski testlar ham (`Tushum (haqiqiy): 280 000 000` — o'sha testda
`getIncomeMonthAttribution` mock qilinmagan, ya'ni chaqiruv xato beradi va eski
manba ishlaydi).

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram-groups/telegram-group-daily-report.service.ts \
        server/src/telegram-groups/telegram-group-daily-report.service.spec.ts
git commit -m "Kunlik hisobotda tushum qaysi oylarga tegishli ekani ko'rsatiladi"
```

---

### Task 3: «Moliyaviy xulosa» kartochkasiga qo'shish

**Files:**
- Modify: `server/src/telegram-groups/telegram-group-report-menu.service.ts` (`sendFinancialCard`)
- Test: `server/src/telegram-groups/telegram-group-report-menu.service.spec.ts`

**Interfaces:**
- Consumes: `buildIncomeSplitLines` (Task 1),
  `this.reportsFinancial.getIncomeMonthAttribution(companyId, { branchIds })`.
- Produces: kartochkada «Tushum (haqiqiy)» dan keyin o'sha qatorlar.

- [ ] **Step 1: Write the failing test**

`telegram-group-report-menu.service.spec.ts`:

```ts
  it('sendFinancialCard shows which months the cash belongs to', async () => {
    const { service, reportsFinancial } = makeDeps();
    const ctx = makeCtx();
    reportsFinancial.getIncomeMonthAttribution = jest.fn().mockResolvedValue({
      total: 280_000_000,
      currentMonth: 210_000_000,
      lateTotal: 70_000_000,
      late: [
        { monthKey: '2026-06', label: 'Iyun 2026', amount: 50_000_000 },
        { monthKey: '2026-05', label: 'May 2026', amount: 20_000_000 },
      ],
      lessonsValue: 1,
      collectionPct: 1,
    });

    await service.sendFinancialCard(ctx);

    const text = (ctx.reply.mock.calls[0][0] as string).replace(/ /g, ' ');
    expect(text).toContain("• Tushum (haqiqiy): <b>280 000 000 so'm</b>");
    expect(text).toContain("   Shu oy uchun: <b>210 000 000 so'm</b> (75%)");
    expect(text).toContain("   Eski qarzlar uchun: <b>70 000 000 so'm</b> (25%)");
    expect(text).toContain("      Iyun 2026 — <b>50 000 000 so'm</b>");
    expect(text).toContain("      May 2026 — <b>20 000 000 so'm</b>");
    // Same window as the income figure it decomposes: the whole current month.
    expect(reportsFinancial.getIncomeMonthAttribution).toHaveBeenCalledWith(
      1001,
      { branchIds: null },
    );
  });

  it('sendFinancialCard survives an attribution failure', async () => {
    const { service, reportsFinancial } = makeDeps();
    const ctx = makeCtx();
    reportsFinancial.getIncomeMonthAttribution = jest
      .fn()
      .mockRejectedValue(new Error('boom'));

    await service.sendFinancialCard(ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Tushum (haqiqiy)');
    expect(text).not.toContain('Shu oy uchun');
  });
```

`makeDeps()` `{ service, prisma, reportsExcel, reportsFinancial }` qaytaradi
(`ctx` alohida `makeCtx()` bilan yasaladi) — fayl shu uslubda yozilgan,
o'zgartirish kerak emas.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/telegram-groups/telegram-group-report-menu.service.spec.ts`
Expected: FAIL — «Shu oy uchun» qatori yo'q.

- [ ] **Step 3: Write minimal implementation**

`sendFinancialCard` ichida, `getFinancialOverview` dan keyin:

```ts
      // Same period as `getFinancialOverview` above (both default to the whole
      // current month), so the split is a decomposition of the very figure the
      // card prints — not a second answer from a different window.
      const attribution = await this.incomeSplit(group.companyId, branchIds);
```

va `lines` massivida:

```ts
        `• Tushum (haqiqiy): <b>${formatSum(attribution?.total ?? o.income.actual)}</b>`,
        ...(attribution ? buildIncomeSplitLines(attribution) : []),
```

Yangi private metod (sinf oxiriga, `canonicalNetProfit` yonida):

```ts
  /**
   * The «Tushum tarkibi» figures for the card's month — the same service the
   * /payments/overview drill-down and the 21:00 report read. Returns null on
   * failure so a broken split never costs the whole card.
   */
  private async incomeSplit(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<{
    total: number;
    currentMonth: number;
    lateTotal: number;
    late: Array<{ label: string; amount: number }>;
  } | null> {
    try {
      const a = await this.reportsFinancial.getIncomeMonthAttribution(
        companyId,
        { branchIds },
      );
      return {
        total: a.total,
        currentMonth: a.currentMonth,
        lateTotal: a.lateTotal,
        late: a.late,
      };
    } catch (err: any) {
      this.logger.warn(`Income split failed: ${err?.message ?? err}`);
      return null;
    }
  }
```

Import: `import { buildIncomeSplitLines } from './utils/income-split.util';`
(`formatSum` allaqachon import qilingan; `ReportBranchIds` tipi ham — bo'lmasa
`../common/finance/report-branch-scope` dan qo'shiladi).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/telegram-groups/telegram-group-report-menu.service.spec.ts`
Expected: PASS — yangi 2 test + eski 20 ta test.

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram-groups/telegram-group-report-menu.service.ts \
        server/src/telegram-groups/telegram-group-report-menu.service.spec.ts
git commit -m "Moliyaviy xulosa kartochkasida tushum tarkibi ko'rsatiladi"
```

---

### Task 4: Yakuniy tekshiruv

**Files:** o'zgarish yo'q (faqat tekshiruv + hujjat).

- [ ] **Step 1: Butun telegram-groups va reports testlari**

Run: `cd server && npx jest src/telegram-groups src/reports`
Expected: PASS, 0 failure.

- [ ] **Step 2: Tip tekshiruvi**

Run: `cd server && npm run typecheck`
Expected: xatosiz tugaydi.

- [ ] **Step 3: Xabar namunasini ko'z bilan ko'rish**

Test ichidagi `console.log(message)` emas — `npx jest -t 'breaks the month income'`
testidan chiqqan matnni vaqtincha chop etib, «📅 Oy boshidan» bloki dizayn
hujjatidagi 3.1-bo'limga mos kelishini tasdiqlash, so'ng `console.log` ni olib tashlash.

- [ ] **Step 4: Commit (agar o'zgarish bo'lsa) va PR**

```bash
git push -u origin feat/telegram-tushum-tarkibi
gh pr create --title "Telegram hisobotida tushum qaysi oylarga tegishli ekani" --body "..."
```
