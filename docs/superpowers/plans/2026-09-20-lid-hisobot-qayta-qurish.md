# Lidlar hisoboti qayta qurish — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/leads` sahifasida trapetsiya voronkani chiziqli ro'yxatga almashtirish, KPI qatori, davr preset'lari, manba va filial taqsimoti, to'lamaganlar plitkalari qo'shish.

**Architecture:** Server `ReportsLeadFunnelService` javobiga uchta qo'shimcha maydon (`previous`, `bySource`, `byBranch`) qo'shadi va odamlar ro'yxatiga `sourceId`/`status` filtrini qabul qiladi; hamma hisob `lead-funnel.math.ts` dagi sof funksiyalarda. Client'da sahifa URL filtrlari (`period`, `people`, `source`, `status`) bilan qayta yig'iladi; grafik HTML/CSS chiziqlar, yangi kutubxona yo'q. Sxema, migratsiya, ADR yo'q; javob faqat kengayadi (bosh sahifa qatori o'zgarmaydi).

**Tech Stack:** NestJS + Prisma (jest), Next.js + shadcn/ui + Tailwind + zustand (vitest, node env, komponent render yo'q).

**Spec:** `docs/superpowers/specs/2026-09-20-lid-hisobot-qayta-qurish-design.md`

## Global Constraints

- Ish joyi: `/Users/a1111/Desktop/daf-erp-system/.worktrees/lid-hisobot-ux`, shox `ux/lid-hisobot`. Asosiy katalogga tegilmaydi. `git add` faqat aniq fayl yo'llari bilan.
- Har commit oxirida bo'sh qator va `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- UI matni faqat lotin o'zbekchada. UI matnida em-dash yo'q (`·`, `:` yoki `,`); bo'sh katak uchun yolg'iz `—` mumkin.
- **Rang:** chiziqlar `useChartTheme().palette.series1`, «To'lov qildi» `series3`; matn faqat `foreground`/`muted-foreground`, hech qachon seriya rangida. Ogohlantirish (To'lamagan faol): `text-orange-600 dark:text-orange-400`. **`amber-*` va `sky-*` ishlatilmaydi** (admin panelda rangsiz).
- Rangli chap/o'ng chiziq (`border-l-*` > 1px) yo'q. Chiziqlarga `opacity` bilan hover yo'q.
- Foizlar butun sonda: `formatPercent(v, { maximumFractionDigits: 0 })`.
- Minimal kenglik yo'q: chiziq uzunligi `count / lead` ga aniq mos, son doim chiziq yonida.
- URL: `?period=shu-oy|otgan-oy|boshidan|oraliq` (standart `shu-oy` yozilmaydi), `oraliq` da `startDate`/`endDate`; ochiq ro'yxat `?people=<stage>&source=<id|none>&status=<active|frozen|expelled|other|stuck>` (`stuck` faqat oynaning boshlang'ich rejimi, serverga ketmaydi), yopilganda uchalasi o'chiriladi.
- `aria-label` bilan ichki matnni yashirmaslik; bezak ikonlar `aria-hidden`.
- Telefon: `+998 XX XXX XX XX` (`formatPhone`), sana `dd.MM.yyyy` (`displayDate`).
- Har jadvalda `#` ustuni `w-12 border-r`; sahifalash 10/20/30/40/50 (mavjud `DialogPaginationFooter`).
- Server buyruqlari `server/` ichidan: `npx jest <yo'l>`, oxirida `npm test`, `npm run typecheck`, `npx eslint <fayllar>`, `npx prettier --write <fayllar>`. Client `client/` ichidan: `npx vitest run <yo'l>`, `npm run typecheck`, `npx eslint <fayllar>`, oxirida `npm run build`.
- `server/node_modules` va `client/node_modules` worktree'da o'rnatilgan (Task 11 gacha `npm ci` kerak emas; server uchun `server/.env` symlink dev bazaga qaraydi).

---

## Fayllar xaritasi

Server (`server/src/reports/lead-funnel/`):

| Fayl | Vazifa |
| --- | --- |
| `lead-funnel.math.ts` | `sourceId`/`branchId`/`branchName` odamda; `stageDepth`, `countBySource`, `countByBranch`, `previousPeriod`, `matchesSource` |
| `lead-funnel.math.spec.ts` | Yangi sof funksiyalar testlari |
| `reports-lead-funnel.service.ts` | Javobga `previous`, `bySource`, `byBranch`; odamlarga `sourceId`/`status` filtri; `statusBucket` |
| `reports-lead-funnel.service.spec.ts` | Javob shakli va filtrlar |
| `lead-funnel-query.dto.ts` | `sourceId`, `status` |
| `reports-lead-funnel.controller.ts` | Yangi parametrlarni uzatadi |
| `reports-lead-funnel.controller.spec.ts` | Uzatish + DTO validatsiyasi |

Client (`client/src/components/reports/lead-funnel/`):

| Fayl | Vazifa |
| --- | --- |
| `lead-funnel-types.ts` | Yangi javob maydonlari, `UnpaidStatusBucket` |
| `lead-funnel-math.ts` | Preset'lar, `resolvePeriodFilter`, `collapseSources`, `biggestLossStage`, `conversionPct`, `wholePercent`, `LOSS_LABELS`, `peopleQueryParams` kengaytmasi |
| `lead-funnel-math.test.ts` | Yangi funksiyalar testlari |
| `lead-funnel-period-control.tsx` (yangi) | Preset tugmalari + `oraliq` uchun sanalar |
| `lead-funnel-kpi-row.tsx` (yangi) | 4 ta KPI karta |
| `lead-funnel-bars.tsx` (yangi) | Chiziqli voronka (eski `lead-funnel-chart.tsx` o'rniga) |
| `lead-funnel-breakdown-card.tsx` (yangi) | Manba/filial jadvali (bitta komponent) |
| `lead-funnel-unpaid-tiles.tsx` (yangi) | To'lamaganlar plitkalari (eski `lead-funnel-unpaid-card.tsx` o'rniga) |
| `lead-funnel-people-dialog.tsx` | Manba/holat filtri, telefon kartochkalari |
| `lead-funnel-client.tsx` | Sahifa yig'ilishi, URL filtrlari |
| `lead-funnel-chart.tsx`, `lead-funnel-unpaid-card.tsx` | **o'chiriladi** (Task 10) |

Hujjat: `client/CLAUDE.md`, `server/CLAUDE.md` (Task 11).

---

### Task 1: Server sof hisob — manba, filial, oldingi davr

**Files:**
- Modify: `server/src/reports/lead-funnel/lead-funnel.math.ts`
- Test: `server/src/reports/lead-funnel/lead-funnel.math.spec.ts`

**Interfaces:**
- Produces:
  - `CohortLead` va `FunnelPerson` ga `sourceId: string | null`, `branchId: number | null`, `branchName: string | null`
  - `stageDepth(person: FunnelPerson, sets: StageSets): number` (0–3, eksport)
  - `interface SourceBreakdownRow { id: string | null; name: string | null; lead: number; enrolled: number; attended: number; paid: number }`
  - `countBySource(persons, sets): SourceBreakdownRow[]` (lead DESC, keyin nom)
  - `interface BranchBreakdownRow { id: number | null; name: string | null; lead: number; paid: number }`
  - `countByBranch(persons, sets): BranchBreakdownRow[]`
  - `previousPeriod(period: { startDate; endDate }): { startDate; endDate } | null`
  - `matchesSource(person: FunnelPerson, sourceId: string | undefined): boolean` (`'none'` = manbasiz)
  - `NO_SOURCE = 'none'`

- [ ] **Step 1: Failing testlar**

`lead-funnel.math.spec.ts` ning import blokini quyidagiga almashtiring:

```ts
import {
  countBySource,
  countByBranch,
  countStages,
  FUNNEL_START_DATE,
  matchesSource,
  personsAtStage,
  previousPeriod,
  stageDepth,
  toPersons,
  type CohortLead,
  type FunnelPerson,
  type StageSets,
} from './lead-funnel.math';
```

(Agar faylda avvaldan boshqa nomlar import qilingan bo'lsa, ularni saqlab qoling; faqat yangi nomlarni qo'shing.) Mavjud `lead(...)`/yordamchi fabrikalar `CohortLead` ni qaytarsa, ularga `sourceId: null, branchId: null, branchName: null` maydonlarini qo'shing (tip xatosi bo'lmasin). Fayl oxiriga qo'shing:

```ts
function person(over: Partial<FunnelPerson>): FunnelPerson {
  return {
    key: over.key ?? `l:${over.leadId ?? 'x'}`,
    leadId: over.leadId ?? 'x',
    studentId: over.studentId ?? null,
    board: over.board ?? true,
    name: over.name ?? 'Test',
    phone: over.phone ?? '900000000',
    source: over.source ?? null,
    sourceId: over.sourceId ?? null,
    branchId: over.branchId ?? null,
    branchName: over.branchName ?? null,
    createdAt: over.createdAt ?? new Date('2026-09-12T05:00:00Z'),
  };
}

const SETS: StageSets = {
  enrolled: new Set([1, 2, 3]),
  attended: new Set([1, 2]),
  paid: new Set([1]),
};

describe('toPersons — manba va filial', () => {
  const base: CohortLead = {
    id: 'a',
    studentId: 5,
    board: true,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901',
    source: 'Instagram',
    sourceId: 'src-ig',
    branchId: null,
    branchName: null,
    createdAt: new Date('2026-09-12T05:00:00Z'),
  };

  it('manba id va filial birinchi liddan olinadi', () => {
    const [p] = toPersons([{ ...base, branchId: 1, branchName: "Farg'ona" }]);
    expect(p.sourceId).toBe('src-ig');
    expect(p.branchId).toBe(1);
    expect(p.branchName).toBe("Farg'ona");
  });

  it("birinchi lidda filial bo'lmasa, keyingi liddan to'ldiriladi", () => {
    const later: CohortLead = {
      ...base,
      id: 'b',
      branchId: 2,
      branchName: 'Namangan',
      createdAt: new Date('2026-09-13T05:00:00Z'),
    };
    const [p] = toPersons([base, later]);
    expect(p.leadId).toBe('a');
    expect(p.branchId).toBe(2);
    expect(p.branchName).toBe('Namangan');
  });
});

describe('stageDepth', () => {
  it("o'quvchisiz odam 0, to'lagan 3", () => {
    expect(stageDepth(person({ studentId: null }), SETS)).toBe(0);
    expect(stageDepth(person({ studentId: 3 }), SETS)).toBe(1);
    expect(stageDepth(person({ studentId: 2 }), SETS)).toBe(2);
    expect(stageDepth(person({ studentId: 1 }), SETS)).toBe(3);
  });
});

describe('countBySource', () => {
  const persons = [
    person({ leadId: 'a', studentId: 1, sourceId: 'tg', source: 'Telegram bot' }),
    person({ leadId: 'b', studentId: 2, sourceId: 'tg', source: 'Telegram bot' }),
    person({ leadId: 'c', studentId: null, sourceId: 'ig', source: 'Instagram' }),
    person({ leadId: 'd', studentId: 3, sourceId: 'ig', source: 'Instagram' }),
    person({ leadId: 'e', studentId: 9, sourceId: 'ig', source: 'Instagram' }),
    person({ leadId: 'f', studentId: null, sourceId: null, source: null }),
  ];

  it('manba bo\'yicha ichma-ich bosqichlar, lid soni bo\'yicha kamayib', () => {
    expect(countBySource(persons, SETS)).toEqual([
      { id: 'ig', name: 'Instagram', lead: 3, enrolled: 1, attended: 0, paid: 0 },
      { id: 'tg', name: 'Telegram bot', lead: 2, enrolled: 2, attended: 2, paid: 1 },
      { id: null, name: null, lead: 1, enrolled: 0, attended: 0, paid: 0 },
    ]);
  });

  it('teng lid sonida nom bo\'yicha', () => {
    const rows = countBySource(
      [
        person({ leadId: 'x', sourceId: 'b', source: 'Tanishlar' }),
        person({ leadId: 'y', sourceId: 'a', source: 'Instagram' }),
      ],
      SETS,
    );
    expect(rows.map((r) => r.name)).toEqual(['Instagram', 'Tanishlar']);
  });
});

describe('countByBranch', () => {
  it('filial bo\'yicha lid va to\'lov; filialsiz alohida', () => {
    const persons = [
      person({ leadId: 'a', studentId: 1, branchId: 1, branchName: "Farg'ona" }),
      person({ leadId: 'b', studentId: 2, branchId: 1, branchName: "Farg'ona" }),
      person({ leadId: 'c', studentId: null, branchId: 2, branchName: 'Namangan' }),
      person({ leadId: 'd', studentId: null }),
    ];
    expect(countByBranch(persons, SETS)).toEqual([
      { id: 1, name: "Farg'ona", lead: 2, paid: 1 },
      { id: 2, name: 'Namangan', lead: 1, paid: 0 },
      { id: null, name: null, lead: 1, paid: 0 },
    ]);
  });
});

describe('previousPeriod', () => {
  it('shu uzunlikdagi bevosita oldingi oraliq', () => {
    expect(
      previousPeriod({ startDate: '2026-10-01', endDate: '2026-10-31' }),
    ).toEqual({ startDate: '2026-09-10', endDate: '2026-09-30' });
  });

  it("to'liq chegaradan oldin bo'lsa null", () => {
    expect(
      previousPeriod({ startDate: FUNNEL_START_DATE, endDate: '2026-09-30' }),
    ).toBeNull();
  });

  it('bir kunlik davr', () => {
    expect(
      previousPeriod({ startDate: '2026-09-12', endDate: '2026-09-12' }),
    ).toEqual({ startDate: '2026-09-11', endDate: '2026-09-11' });
  });

  it('yil chegarasi orqali', () => {
    expect(
      previousPeriod({ startDate: '2027-01-01', endDate: '2027-01-31' }),
    ).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
  });
});

describe('matchesSource', () => {
  it("filtr yo'q — hammasi", () => {
    expect(matchesSource(person({ sourceId: 'ig' }), undefined)).toBe(true);
  });
  it("'none' — manbasizlar", () => {
    expect(matchesSource(person({ sourceId: null }), 'none')).toBe(true);
    expect(matchesSource(person({ sourceId: 'ig' }), 'none')).toBe(false);
  });
  it('id bo\'yicha', () => {
    expect(matchesSource(person({ sourceId: 'ig' }), 'ig')).toBe(true);
    expect(matchesSource(person({ sourceId: 'tg' }), 'ig')).toBe(false);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/reports/lead-funnel/lead-funnel.math.spec.ts`
Expected: FAIL (`countBySource is not a function` yoki tip xatosi)

- [ ] **Step 3: Implementatsiya**

`lead-funnel.math.ts`:

1. Fayl tepasiga import: `import { addDaysToDateStr, utcMidnightFromDateStr } from '../../common/date/tashkent';`
2. `CohortLead` ga qo'shing: `sourceId: string | null; branchId: number | null; branchName: string | null;`
3. `FunnelPerson` ga qo'shing: `sourceId: string | null; branchId: number | null; branchName: string | null;`
4. `toPersons` da yangi odam yaratishda `sourceId: l.sourceId, branchId: l.branchId, branchName: l.branchName,` qo'shing. Mavjud odamni yangilash blokini quyidagiga almashtiring:

```ts
    // Bitta odamning bir nechta lidi: doskadan bittasi bo'lsa ham odam doskadan
    // kelgan, va u BIRINCHI marta kelgan vaqti bilan sanaladi. Ism, telefon
    // va manba ham o'sha birinchi liddan — bir qatorda ikki xil lid aralashmasin.
    existing.board = existing.board || l.board;
    if (l.createdAt < existing.createdAt) {
      existing.createdAt = l.createdAt;
      existing.leadId = l.id;
      existing.name = `${l.firstName} ${l.lastName}`.trim();
      existing.phone = l.phone;
      existing.source = l.source ?? existing.source;
      existing.sourceId = l.sourceId ?? existing.sourceId;
      if (l.branchId != null) {
        existing.branchId = l.branchId;
        existing.branchName = l.branchName;
      }
    }
    // Filial lid ochiq formadan kelganda hali noma'lum bo'ladi va keyingi lidda
    // (yoki aylantirishda) paydo bo'ladi — birinchi lidda yo'q bo'lsa, borida olinadi.
    if (existing.branchId == null && l.branchId != null) {
      existing.branchId = l.branchId;
      existing.branchName = l.branchName;
    }
```

5. `depthOf` ni eksport qilib `stageDepth` deb nomlang (barcha ichki chaqiruvlarni yangilang):

```ts
export function stageDepth(person: FunnelPerson, sets: StageSets): number {
```

6. Fayl oxiriga qo'shing:

```ts
export const NO_SOURCE = 'none';

export interface SourceBreakdownRow {
  id: string | null;
  name: string | null;
  lead: number;
  enrolled: number;
  attended: number;
  paid: number;
}

export interface BranchBreakdownRow {
  id: number | null;
  name: string | null;
  lead: number;
  paid: number;
}

/**
 * Manba bo'yicha voronka. Har odam bitta manbada (birinchi lidiniki); manbasiz
 * odamlar `id: null` qatorida. Lid soni bo'yicha kamayib, teng bo'lsa nom
 * bo'yicha — «Instagram 30 → 0» ni «Telegram bot 39 → 7» yonida ko'rsatish shu
 * hisobotning asosiy maqsadi.
 */
export function countBySource(
  persons: FunnelPerson[],
  sets: StageSets,
): SourceBreakdownRow[] {
  const rows = new Map<string, SourceBreakdownRow>();
  for (const p of persons) {
    const key = p.sourceId ?? NO_SOURCE;
    let row = rows.get(key);
    if (!row) {
      row = {
        id: p.sourceId,
        name: p.sourceId ? p.source : null,
        lead: 0,
        enrolled: 0,
        attended: 0,
        paid: 0,
      };
      rows.set(key, row);
    }
    const depth = stageDepth(p, sets);
    row.lead++;
    if (depth >= 1) row.enrolled++;
    if (depth >= 2) row.attended++;
    if (depth >= 3) row.paid++;
  }
  return [...rows.values()].sort(
    (a, b) => b.lead - a.lead || (a.name ?? '').localeCompare(b.name ?? ''),
  );
}

/** Filial bo'yicha lid va to'lov. Filiali belgilanmagan odamlar `id: null`. */
export function countByBranch(
  persons: FunnelPerson[],
  sets: StageSets,
): BranchBreakdownRow[] {
  const rows = new Map<string, BranchBreakdownRow>();
  for (const p of persons) {
    const key = p.branchId == null ? 'none' : String(p.branchId);
    let row = rows.get(key);
    if (!row) {
      row = { id: p.branchId, name: p.branchName, lead: 0, paid: 0 };
      rows.set(key, row);
    }
    row.lead++;
    if (stageDepth(p, sets) >= 3) row.paid++;
  }
  return [...rows.values()].sort(
    (a, b) => b.lead - a.lead || (a.name ?? '').localeCompare(b.name ?? ''),
  );
}

function daysInclusive(startDate: string, endDate: string): number {
  const ms =
    utcMidnightFromDateStr(endDate).getTime() -
    utcMidnightFromDateStr(startDate).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Tanlangan davr uzunligidagi, undan bevosita oldingi oraliq — KPI
 * kartasidagi «oldingi davr N %» uchun. Boshlanishi voronka chegarasiga
 * qirqiladi; oraliq butunlay chegaradan oldin bo'lsa `null` («oldingi davr
 * yo'q»). Oktyabr uchun bu 10.09–30.09, sentyabr uchun `null`.
 */
export function previousPeriod(period: {
  startDate: string;
  endDate: string;
}): { startDate: string; endDate: string } | null {
  const endDate = addDaysToDateStr(period.startDate, -1);
  if (endDate < FUNNEL_START_DATE) return null;
  const days = daysInclusive(period.startDate, period.endDate);
  const rawStart = addDaysToDateStr(endDate, -(days - 1));
  return {
    startDate: rawStart > FUNNEL_START_DATE ? rawStart : FUNNEL_START_DATE,
    endDate,
  };
}

/** Odamlar ro'yxatidagi manba filtri; `'none'` — manbasi yo'qlar. */
export function matchesSource(
  person: FunnelPerson,
  sourceId: string | undefined,
): boolean {
  if (sourceId === undefined) return true;
  if (sourceId === NO_SOURCE) return person.sourceId == null;
  return person.sourceId === sourceId;
}
```

- [ ] **Step 4: O'tishini ko'rish**

Run: `cd server && npx jest src/reports/lead-funnel/lead-funnel.math.spec.ts`
Expected: PASS. Agar `reports-lead-funnel.service.spec.ts` yoki servis tip xatosi bersa (yangi majburiy maydonlar) — bu Task 2 da tuzatiladi; hozircha `npx jest` faqat shu faylga.

- [ ] **Step 5: Prettier + lint**

Run: `cd server && npx prettier --write src/reports/lead-funnel/lead-funnel.math.ts src/reports/lead-funnel/lead-funnel.math.spec.ts && npx eslint src/reports/lead-funnel/lead-funnel.math.ts src/reports/lead-funnel/lead-funnel.math.spec.ts`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/lead-funnel/lead-funnel.math.ts server/src/reports/lead-funnel/lead-funnel.math.spec.ts
git commit -m "Lid voronkasi hisobi: manba, filial va oldingi davr"
```

---

### Task 2: Servis — javobga taqsimotlar, ro'yxatga filtrlar

**Files:**
- Modify: `server/src/reports/lead-funnel/reports-lead-funnel.service.ts`
- Test: `server/src/reports/lead-funnel/reports-lead-funnel.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 eksportlari
- Produces:
  - `getFunnel` javobi: `{ period, stages, leadSplit, previous: { period; stages } | null, bySource: SourceBreakdownRow[], byBranch: BranchBreakdownRow[], unpaid }`
  - `FunnelPeopleInput` ga `sourceId?: string; status?: UnpaidStatusBucket`
  - `FunnelPersonRow` ga `sourceId: string | null`
  - `export type UnpaidStatusBucket = 'active' | 'frozen' | 'expelled' | 'other'`; `export const UNPAID_STATUS_BUCKETS`
  - `statusBucket(status: string | null): UnpaidStatusBucket`

- [ ] **Step 1: Failing testlar**

`reports-lead-funnel.service.spec.ts` da `prisma.lead.findMany` mock'idagi ikkala lidga qo'shing: birinchisiga `sourceId: 'src-ig', branchId: 1, branch: { id: 1, name: "Farg'ona" }`, ikkinchisiga `sourceId: 'src-tg', branchId: 2, branch: { id: 2, name: 'Namangan' }`. So'ng `describe` ichiga qo'shing:

```ts
  it("oldingi davr, manba va filial taqsimotini qaytaradi", async () => {
    const r = await service.getFunnel(
      COMPANY,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      null,
    );

    expect(r.previous).toEqual({
      period: { startDate: '2026-09-10', endDate: '2026-09-30' },
      stages: { lead: 2, enrolled: 1, attended: 1, paid: 0 },
    });
    expect(r.bySource).toEqual([
      { id: 'src-ig', name: 'Instagram', lead: 1, enrolled: 0, attended: 0, paid: 0 },
      { id: 'src-tg', name: 'Telegram bot', lead: 1, enrolled: 1, attended: 1, paid: 0 },
    ]);
    expect(r.byBranch).toEqual([
      { id: 1, name: "Farg'ona", lead: 1, paid: 0 },
      { id: 2, name: 'Namangan', lead: 1, paid: 0 },
    ]);
    // Oldingi davr uchun alohida kogorta so'rovi: jami 3 (joriy, oldingi, to'lamaganlar).
    expect(prisma.lead.findMany).toHaveBeenCalledTimes(3);
  });

  it("voronka boshlangan oyda oldingi davr yo'q", async () => {
    const r = await service.getFunnel(
      COMPANY,
      { startDate: '2026-09-10', endDate: '2026-09-30' },
      null,
    );
    expect(r.previous).toBeNull();
    expect(prisma.lead.findMany).toHaveBeenCalledTimes(2);
  });

  it("odamlar ro'yxati manba bo'yicha filtrlanadi", async () => {
    const ig = await service.getPeople(
      COMPANY,
      { stage: 'lead', mode: 'all', sourceId: 'src-ig', page: 1, pageSize: 10,
        startDate: '2026-10-01', endDate: '2026-10-31' },
      null,
    );
    expect(ig.total).toBe(1);
    expect(ig.data[0]).toMatchObject({ name: 'Ali Valiyev', sourceId: 'src-ig' });

    const none = await service.getPeople(
      COMPANY,
      { stage: 'lead', mode: 'all', sourceId: 'none', page: 1, pageSize: 10,
        startDate: '2026-10-01', endDate: '2026-10-31' },
      null,
    );
    expect(none.total).toBe(0);
  });

  it("to'lamaganlar holat bo'yicha filtrlanadi", async () => {
    const active = await service.getPeople(
      COMPANY,
      { stage: 'unpaid', mode: 'all', status: 'active', page: 1, pageSize: 10 },
      null,
    );
    expect(active.total).toBe(1);
    const frozen = await service.getPeople(
      COMPANY,
      { stage: 'unpaid', mode: 'all', status: 'frozen', page: 1, pageSize: 10 },
      null,
    );
    expect(frozen.total).toBe(0);
  });
```

Fayl oxiridagi `splitByStatus` testlari yoniga:

```ts
describe('statusBucket', () => {
  it('FROZEN va INACTIVE bitta guruh, noma\'lumlar "other"', () => {
    expect(statusBucket('ACTIVE')).toBe('active');
    expect(statusBucket('FROZEN')).toBe('frozen');
    expect(statusBucket('INACTIVE')).toBe('frozen');
    expect(statusBucket('EXPELLED')).toBe('expelled');
    expect(statusBucket('GRADUATED')).toBe('other');
    expect(statusBucket(null)).toBe('other');
  });
});
```

Importga `statusBucket` qo'shing.

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/reports/lead-funnel/reports-lead-funnel.service.spec.ts`
Expected: FAIL (`previous` undefined, `statusBucket` yo'q)

- [ ] **Step 3: Implementatsiya**

`reports-lead-funnel.service.ts`:

1. Importga qo'shing: `countBySource, countByBranch, matchesSource, previousPeriod` (`./lead-funnel.math` dan).
2. Tiplar:

```ts
export const UNPAID_STATUS_BUCKETS = [
  'active',
  'frozen',
  'expelled',
  'other',
] as const;
export type UnpaidStatusBucket = (typeof UNPAID_STATUS_BUCKETS)[number];

export interface FunnelPeopleInput extends FunnelPeriodInput {
  stage: FunnelPeopleStage;
  mode: FunnelMode;
  /** Manba id'si yoki `'none'` (manbasizlar); `unpaid` da e'tiborsiz. */
  sourceId?: string;
  /** Faqat `stage === 'unpaid'` da ma'noli. */
  status?: UnpaidStatusBucket;
  page: number;
  pageSize: number;
}
```

`FunnelPersonRow` ga `sourceId: string | null;` qo'shing.

3. `getFunnel`:

```ts
  async getFunnel(
    companyId: number,
    input: FunnelPeriodInput,
    scope: ReportBranchIds,
  ) {
    const period = resolvePeriod(input);
    const { persons, sets } = await this.loadCohort(companyId, period, scope);
    const unpaid = await this.loadUnpaid(companyId, scope);

    // KPI kartasidagi «oldingi davr N %» — alohida kogorta; sentyabrda `null`.
    const prevPeriod = previousPeriod(period);
    let previous: {
      period: { startDate: string; endDate: string };
      stages: Record<FunnelStage, number>;
    } | null = null;
    if (prevPeriod) {
      const prev = await this.loadCohort(companyId, prevPeriod, scope);
      previous = {
        period: prevPeriod,
        stages: countStages(prev.persons, prev.sets).stages,
      };
    }

    return {
      period,
      ...countStages(persons, sets),
      previous,
      bySource: countBySource(persons, sets),
      byBranch: countByBranch(persons, sets),
      unpaid: splitByStatus(
        unpaid.map((r) => ({ status: r.studentStatus ?? '' })),
      ),
    };
  }
```

4. `getPeople`: `unpaid` shoxida `const all = (await this.loadUnpaid(companyId, scope)).filter((r) => !input.status || statusBucket(r.studentStatus) === input.status);`. Boshqa shoxda: `const matched = personsAtStage(persons, sets, input.stage, input.mode).filter((p) => matchesSource(p, input.sourceId));`.

5. `loadCohort` da `select` ga `sourceId: true, branchId: true, branch: { select: { id: true, name: true } },` qo'shing; `toPersons` chaqiruvida har lidga `sourceId: l.sourceId, branchId: l.branchId, branchName: l.branch?.name ?? null,` qo'shing.

6. `withStudentStatus` natijasiga `sourceId: p.sourceId,` qo'shing.

7. `splitByStatus` ni `statusBucket` orqali yozing:

```ts
/**
 * Muzlatilgan va eski «INACTIVE» bitta guruh (klient ham ularni bir xil
 * «Muzlatilgan» deb ko'rsatadi). Qolgan holatlar — bitirgan, arxiv, mock —
 * `other`: aks holda bo'laklar yig'indisi jamiga teng bo'lmasdi.
 */
export function statusBucket(status: string | null): UnpaidStatusBucket {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'FROZEN':
    case 'INACTIVE':
      return 'frozen';
    case 'EXPELLED':
      return 'expelled';
    default:
      return 'other';
  }
}

export function splitByStatus(students: { status: string }[]) {
  const counts = { active: 0, frozen: 0, expelled: 0, other: 0 };
  for (const s of students) counts[statusBucket(s.status)]++;
  return { total: students.length, ...counts };
}
```

- [ ] **Step 4: O'tishini ko'rish**

Run: `cd server && npx jest src/reports/lead-funnel`
Expected: PASS (math + service; controller spec hozircha o'zgarmagan)

- [ ] **Step 5: Prettier + lint + typecheck**

Run: `cd server && npx prettier --write src/reports/lead-funnel/reports-lead-funnel.service.ts src/reports/lead-funnel/reports-lead-funnel.service.spec.ts && npx eslint src/reports/lead-funnel/reports-lead-funnel.service.ts src/reports/lead-funnel/reports-lead-funnel.service.spec.ts && npm run typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/lead-funnel/reports-lead-funnel.service.ts server/src/reports/lead-funnel/reports-lead-funnel.service.spec.ts
git commit -m "Lid voronkasi javobiga oldingi davr, manba va filial taqsimoti"
```

---

### Task 3: DTO va controller — `sourceId`, `status`

**Files:**
- Modify: `server/src/reports/lead-funnel/lead-funnel-query.dto.ts`
- Modify: `server/src/reports/lead-funnel/reports-lead-funnel.controller.ts`
- Test: `server/src/reports/lead-funnel/reports-lead-funnel.controller.spec.ts`

**Interfaces:**
- Consumes: `UNPAID_STATUS_BUCKETS`, `UnpaidStatusBucket` (Task 2)
- Produces: `GET /reports/lead-funnel/people?sourceId=<id|none>&status=<bucket>`

- [ ] **Step 1: Failing testlar**

`reports-lead-funnel.controller.spec.ts` importlariga qo'shing:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeadFunnelPeopleQueryDto } from './lead-funnel-query.dto';
```

`describe` ichiga qo'shing:

```ts
  it("'people' da manba va holat filtrini uzatadi", async () => {
    await controller.getPeople(
      { stage: 'unpaid', sourceId: 'none', status: 'active' } as never,
      1001,
      [7],
    );
    expect(service.getPeople).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({ stage: 'unpaid', sourceId: 'none', status: 'active' }),
      [7],
    );
  });

  describe('LeadFunnelPeopleQueryDto', () => {
    it("ruxsat etilgan holat qiymatlarini qabul qiladi", async () => {
      const dto = plainToInstance(LeadFunnelPeopleQueryDto, {
        stage: 'unpaid',
        status: 'frozen',
        sourceId: 'src-1',
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it("noma'lum holatni rad etadi", async () => {
      const dto = plainToInstance(LeadFunnelPeopleQueryDto, {
        stage: 'unpaid',
        status: 'paid',
      });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(['status']);
    });
  });
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `cd server && npx jest src/reports/lead-funnel/reports-lead-funnel.controller.spec.ts`
Expected: FAIL (`sourceId`/`status` uzatilmaydi; DTO validatsiyasi `status` ni whitelist'da bilmaydi)

- [ ] **Step 3: DTO va controller**

`lead-funnel-query.dto.ts`: importga `IsString, MaxLength` qo'shing va `import { UNPAID_STATUS_BUCKETS } from './reports-lead-funnel.service';`. `LeadFunnelPeopleQueryDto` ga:

```ts
  /** Manba id'si yoki `none` (manbasizlar). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceId?: string;

  /** To'lamaganlar ro'yxatini holat bo'yicha toraytirish. */
  @IsOptional()
  @IsIn(UNPAID_STATUS_BUCKETS)
  status?: (typeof UNPAID_STATUS_BUCKETS)[number];
```

(Agar servis → DTO import halqasi bo'lsa — `reports-lead-funnel.service.ts` DTO'ni import qilmaydi, halqa yo'q — baribir tekshiring: `UNPAID_STATUS_BUCKETS` ni `lead-funnel.math.ts` ga ko'chirib, ikkala fayl undan import qilsin.)

`reports-lead-funnel.controller.ts` `getPeople` da servisga uzatiladigan obyektga `sourceId: query.sourceId, status: query.status,` qo'shing.

- [ ] **Step 4: O'tishini ko'rish**

Run: `cd server && npx jest src/reports/lead-funnel src/common/auth/branch-route-policy.spec.ts`
Expected: PASS (route'lar o'zgarmagan, manifest testi ham o'tadi)

- [ ] **Step 5: Prettier + lint + typecheck**

Run: `cd server && npx prettier --write src/reports/lead-funnel/lead-funnel-query.dto.ts src/reports/lead-funnel/reports-lead-funnel.controller.ts src/reports/lead-funnel/reports-lead-funnel.controller.spec.ts && npx eslint src/reports/lead-funnel && npm run typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/lead-funnel/lead-funnel-query.dto.ts server/src/reports/lead-funnel/reports-lead-funnel.controller.ts server/src/reports/lead-funnel/reports-lead-funnel.controller.spec.ts
git commit -m "Lid voronkasi ro'yxatiga manba va holat filtri"
```

---

### Task 4: Client turlari va sof hisob

**Files:**
- Modify: `client/src/components/reports/lead-funnel/lead-funnel-types.ts`
- Modify: `client/src/components/reports/lead-funnel/lead-funnel-math.ts`
- Test: `client/src/components/reports/lead-funnel/lead-funnel-math.test.ts`

**Interfaces:**
- Produces (types):
  - `FunnelPeriod { startDate: string; endDate: string }`
  - `SourceBreakdownRow`, `BranchBreakdownRow` (server bilan bir xil), `UnpaidStatusBucket`
  - `LeadFunnelResponse` ga `previous: { period: FunnelPeriod; stages: Record<FunnelStage, number> } | null; bySource: SourceBreakdownRow[]; byBranch: BranchBreakdownRow[]`
  - `FunnelPerson` ga `sourceId: string | null`
- Produces (math):
  - `PERIOD_PRESETS`, `type PeriodPreset = 'shu-oy' | 'otgan-oy' | 'boshidan' | 'oraliq'`, `PRESET_LABELS`
  - `presetRange(preset: Exclude<PeriodPreset,'oraliq'>, now?): FunnelPeriod | null`
  - `visiblePresets(now?): PeriodPreset[]`
  - `resolvePeriodFilter(input: { period: string; startDate: string; endDate: string }, now?): { preset: PeriodPreset; startDate: string; endDate: string }`
  - `LOSS_LABELS: Record<Exclude<FunnelStage,'lead'>, string>`; `FunnelRow` ga `lostPct: number | null`
  - `biggestLossStage(rows: FunnelRow[]): FunnelStage | null`
  - `conversionPct(lead: number, paid: number): number | null` (butun)
  - `wholePercent(v: number | null): string`
  - `collapseSources(rows: SourceBreakdownRow[], top?): SourceListRow[]` (`SourceListRow = SourceBreakdownRow & { key: string; isRest: boolean }`)
  - `peopleQueryParams` ga `sourceId?: string; status?: string`
  - `PEOPLE_STAGES` (`['lead','enrolled','attended','paid','unpaid']`), `isPeopleStage(v: string): v is PeopleStage`

- [ ] **Step 1: Turlar**

`lead-funnel-types.ts` ni to'liq quyidagiga almashtiring:

```ts
export type FunnelStage = "lead" | "enrolled" | "attended" | "paid";
export type PeopleStage = FunnelStage | "unpaid";
export type PeopleMode = "all" | "stuck";
export type UnpaidStatusBucket = "active" | "frozen" | "expelled" | "other";

export interface FunnelPeriod {
  startDate: string;
  endDate: string;
}

export interface SourceBreakdownRow {
  id: string | null;
  name: string | null;
  lead: number;
  enrolled: number;
  attended: number;
  paid: number;
}

export interface BranchBreakdownRow {
  id: number | null;
  name: string | null;
  lead: number;
  paid: number;
}

export interface LeadFunnelResponse {
  period: FunnelPeriod;
  stages: Record<FunnelStage, number>;
  leadSplit: { board: number; direct: number };
  /** Shu uzunlikdagi oldingi davr; voronka boshlangan oyda `null`. */
  previous: { period: FunnelPeriod; stages: Record<FunnelStage, number> } | null;
  bySource: SourceBreakdownRow[];
  byBranch: BranchBreakdownRow[];
  unpaid: {
    total: number;
    active: number;
    frozen: number;
    expelled: number;
    /** Bitirgan, arxivlangan va h.k. — bo'laklar yig'indisi jamiga teng bo'lsin. */
    other: number;
  };
}

export interface FunnelPerson {
  key: string;
  name: string;
  phone: string | null;
  studentId: number | null;
  studentStatus: string | null;
  source: string | null;
  sourceId: string | null;
  createdAt: string;
}

export interface FunnelPeopleResponse {
  data: FunnelPerson[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Failing testlar**

`lead-funnel-math.test.ts` importini quyidagiga kengaytiring (mavjud nomlar qolsin):

```ts
import {
  biggestLossStage,
  buildFunnelRows,
  collapseSources,
  conversionPct,
  currentMonthRange,
  displayDate,
  isPeopleStage,
  peopleQueryParams,
  presetRange,
  rangeIncludesToday,
  resolvePeriodFilter,
  resolveRange,
  visiblePresets,
  wholePercent,
} from "./lead-funnel-math";
```

Fayl oxiriga qo'shing:

```ts
// 2026-09-20 15:00 Toshkent (UTC+5)
const SEP20 = new Date("2026-09-20T10:00:00Z");
const OCT15 = new Date("2026-10-15T10:00:00Z");

describe("presetRange", () => {
  it("shu oy — joriy Toshkent oyi, chegaraga qirqilgan", () => {
    expect(presetRange("shu-oy", SEP20)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("o'tgan oy sentyabrda yo'q (avgust chegaradan oldin)", () => {
    expect(presetRange("otgan-oy", SEP20)).toBeNull();
  });

  it("o'tgan oy oktyabrda 10.09 dan 30.09 gacha", () => {
    expect(presetRange("otgan-oy", OCT15)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("o'tgan oy yil boshida dekabrni oladi", () => {
    expect(presetRange("otgan-oy", new Date("2027-01-05T10:00:00Z"))).toEqual({
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
  });

  it("boshidan — chegaradan bugungacha", () => {
    expect(presetRange("boshidan", OCT15)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-10-15",
    });
  });
});

describe("visiblePresets", () => {
  it("sentyabrda o'tgan oy ko'rsatilmaydi", () => {
    expect(visiblePresets(SEP20)).toEqual(["shu-oy", "boshidan", "oraliq"]);
  });
  it("oktyabrdan to'rttasi ham", () => {
    expect(visiblePresets(OCT15)).toEqual(["shu-oy", "otgan-oy", "boshidan", "oraliq"]);
  });
});

describe("resolvePeriodFilter", () => {
  it("bo'sh URL — shu oy", () => {
    expect(resolvePeriodFilter({ period: "", startDate: "", endDate: "" }, SEP20)).toEqual({
      preset: "shu-oy",
      startDate: "2026-09-10",
      endDate: "2026-09-30",
    });
  });

  it("oraliq to'g'ri sanalar bilan", () => {
    expect(
      resolvePeriodFilter(
        { period: "oraliq", startDate: "2026-09-12", endDate: "2026-09-15" },
        SEP20,
      ),
    ).toEqual({ preset: "oraliq", startDate: "2026-09-12", endDate: "2026-09-15" });
  });

  it("oraliq buzilgan sanalar bilan — shu oyga qaytadi", () => {
    expect(
      resolvePeriodFilter({ period: "oraliq", startDate: "2026-09-15", endDate: "2026-09-12" }, SEP20)
        .preset,
    ).toBe("shu-oy");
  });

  it("ko'rinmaydigan preset — shu oyga qaytadi", () => {
    expect(
      resolvePeriodFilter({ period: "otgan-oy", startDate: "", endDate: "" }, SEP20).preset,
    ).toBe("shu-oy");
    expect(
      resolvePeriodFilter({ period: "nimadir", startDate: "", endDate: "" }, SEP20).preset,
    ).toBe("shu-oy");
  });

  it("boshidan", () => {
    expect(
      resolvePeriodFilter({ period: "boshidan", startDate: "", endDate: "" }, OCT15),
    ).toEqual({ preset: "boshidan", startDate: "2026-09-10", endDate: "2026-10-15" });
  });
});

describe("yo'qotish", () => {
  const rows = buildFunnelRows({ lead: 146, enrolled: 55, attended: 47, paid: 13 });

  it("yo'qotish foizi — o'tmaganlar ulushi, butun son", () => {
    expect(rows.map((r) => r.lostPct)).toEqual([null, 62, 15, 72]);
  });

  it("eng katta yo'qotish kishi soni bo'yicha", () => {
    expect(biggestLossStage(rows)).toBe("enrolled");
  });

  it("yo'qotish bo'lmasa null", () => {
    expect(
      biggestLossStage(buildFunnelRows({ lead: 3, enrolled: 3, attended: 3, paid: 3 })),
    ).toBeNull();
    expect(biggestLossStage([])).toBeNull();
  });
});

describe("conversionPct / wholePercent", () => {
  it("butun foiz, nolga bo'linmaydi", () => {
    expect(conversionPct(146, 13)).toBe(9);
    expect(conversionPct(0, 0)).toBeNull();
  });
  it("wholePercent kasrsiz", () => {
    expect(wholePercent(8.9)).toBe("9%");
    expect(wholePercent(null)).toBe("—");
  });
});

describe("collapseSources", () => {
  const row = (id: string, lead: number) => ({
    id,
    name: id,
    lead,
    enrolled: 0,
    attended: 0,
    paid: lead > 5 ? 1 : 0,
  });

  it("5 tagacha o'zgarmaydi, kalit id yoki 'none'", () => {
    const out = collapseSources([row("a", 9), { ...row("b", 1), id: null, name: null }]);
    expect(out.map((r) => [r.key, r.isRest])).toEqual([
      ["a", false],
      ["none", false],
    ]);
  });

  it("6 tadan boshlab qolgani «Boshqalar» ga yig'iladi", () => {
    const out = collapseSources([
      row("a", 9), row("b", 8), row("c", 7), row("d", 6), row("e", 5), row("f", 2), row("g", 1),
    ]);
    expect(out).toHaveLength(6);
    expect(out[5]).toMatchObject({
      key: "rest",
      isRest: true,
      name: "Boshqalar (2 ta manba)",
      lead: 3,
      paid: 0,
    });
  });
});

describe("peopleQueryParams — manba va holat", () => {
  it("manba faqat bosqichlarda, holat faqat unpaid da yuboriladi", () => {
    const range = { startDate: "2026-09-10", endDate: "2026-09-30" };
    expect(
      peopleQueryParams({ stage: "lead", mode: "all", page: 1, pageSize: 10, range, sourceId: "none", status: "active" }),
    ).toEqual({ stage: "lead", mode: "all", page: 1, pageSize: 10, startDate: "2026-09-10", endDate: "2026-09-30", sourceId: "none" });
    expect(
      peopleQueryParams({ stage: "unpaid", mode: "all", page: 1, pageSize: 10, range, sourceId: "x", status: "frozen" }),
    ).toEqual({ stage: "unpaid", mode: "all", page: 1, pageSize: 10, status: "frozen" });
  });
});

describe("isPeopleStage", () => {
  it("faqat ma'lum bosqichlar", () => {
    expect(isPeopleStage("unpaid")).toBe(true);
    expect(isPeopleStage("lead")).toBe(true);
    expect(isPeopleStage("x")).toBe(false);
    expect(isPeopleStage("")).toBe(false);
  });
});
```

- [ ] **Step 3: Yiqilishini ko'rish**

Run: `cd client && npx vitest run src/components/reports/lead-funnel/lead-funnel-math.test.ts`
Expected: FAIL (import xatolari)

- [ ] **Step 4: Implementatsiya**

`lead-funnel-math.ts`:

1. Import: `import { formatPercent } from "@/lib/format-utils";` va tiplarga `FunnelPeriod, SourceBreakdownRow` qo'shing.
2. `FunnelRow` ga qo'shing: `/** Oldingi bosqichdan o'tmaganlar ulushi, butun foiz; birinchi bosqichda null. */ lostPct: number | null;` va `buildFunnelRows` da `lostPct: prev === null || prev === 0 ? null : Math.round(((prev - count) / prev) * 100),`.
3. `STUCK_LABELS` yoniga:

```ts
/** Yo'qotish qatori: «↓ N kishi <shu bosqichga o'tmadi>». Kalit — o'tilmagan bosqich. */
export const LOSS_LABELS: Record<Exclude<FunnelStage, "lead">, string> = {
  enrolled: "guruhga yozilmadi",
  attended: "darsga kelmadi",
  paid: "to'lov qilmadi",
};

export const PEOPLE_STAGES: PeopleStage[] = [...FUNNEL_ORDER, "unpaid"];

export function isPeopleStage(value: string): value is PeopleStage {
  return (PEOPLE_STAGES as string[]).includes(value);
}
```

4. `peopleQueryParams` input tipiga `sourceId?: string; status?: string;` qo'shing va tanasini:

```ts
  if (input.stage !== "unpaid") {
    params.startDate = input.range.startDate;
    params.endDate = input.range.endDate;
    if (input.sourceId) params.sourceId = input.sourceId;
  } else if (input.status) {
    params.status = input.status;
  }
  return params;
```

5. Fayl oxiriga:

```ts
export const PERIOD_PRESETS = ["shu-oy", "otgan-oy", "boshidan", "oraliq"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export const DEFAULT_PRESET: PeriodPreset = "shu-oy";

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  "shu-oy": "Shu oy",
  "otgan-oy": "O'tgan oy",
  boshidan: "Boshidan",
  oraliq: "Oraliq",
};

/**
 * Preset'ning hisoblangan oralig'i. `null` — oraliq butunlay voronka
 * chegarasidan oldin (sentyabr 2026 da «O'tgan oy» = avgust): server bunday
 * so'rovni 400 bilan rad etadi, shuning uchun tugma ham ko'rsatilmaydi.
 */
export function presetRange(
  preset: Exclude<PeriodPreset, "oraliq">,
  now: Date = new Date(),
): FunnelPeriod | null {
  const today = tashkentNow(now).dateStr;
  switch (preset) {
    case "shu-oy":
      return currentMonthRange(now);
    case "otgan-oy": {
      const [y, m] = today.split("-").map(Number);
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const mm = String(pm).padStart(2, "0");
      const endDate = `${py}-${mm}-${String(lastDayOfMonth(py, pm)).padStart(2, "0")}`;
      if (endDate < FUNNEL_START_DATE) return null;
      return { startDate: later(`${py}-${mm}-01`, FUNNEL_START_DATE), endDate };
    }
    case "boshidan":
      return { startDate: FUNNEL_START_DATE, endDate: today };
  }
}

export function visiblePresets(now: Date = new Date()): PeriodPreset[] {
  return PERIOD_PRESETS.filter(
    (p) => p === "oraliq" || presetRange(p, now) !== null,
  );
}

/**
 * URL → davr. `oraliq` sanalari `resolveRange` orqali tekshiriladi (buzilgan
 * bo'lsa joriy oyga qaytadi); ko'rinmaydigan yoki noma'lum preset ham joriy
 * oyga qaytadi — yarim buzilgan havola jim boshqa davr ko'rsatmasin.
 */
export function resolvePeriodFilter(
  input: { period: string; startDate: string; endDate: string },
  now: Date = new Date(),
): { preset: PeriodPreset; startDate: string; endDate: string } {
  if (input.period === "oraliq") {
    const r = resolveRange(input.startDate || null, input.endDate || null, now);
    if (!r.isDefault) {
      return { preset: "oraliq", startDate: r.startDate, endDate: r.endDate };
    }
  } else if (
    input.period === "otgan-oy" ||
    input.period === "boshidan"
  ) {
    const range = presetRange(input.period, now);
    if (range) return { preset: input.period, ...range };
  }
  return { preset: DEFAULT_PRESET, ...currentMonthRange(now) };
}

/** Kishi soni bo'yicha eng katta yo'qotish bo'lgan bosqich (o'tilmagan bosqich). */
export function biggestLossStage(rows: FunnelRow[]): FunnelStage | null {
  let best: FunnelRow | null = null;
  for (const row of rows) {
    if (row.lostFromPrev !== null && row.lostFromPrev > 0) {
      if (!best || row.lostFromPrev > (best.lostFromPrev ?? 0)) best = row;
    }
  }
  return best?.stage ?? null;
}

/** Liddan to'lovgacha, butun foiz; lid 0 bo'lsa null. */
export function conversionPct(lead: number, paid: number): number | null {
  return lead > 0 ? Math.round((paid / lead) * 100) : null;
}

/** 146 lidda 0,1 % aniqlik yolg'on — shu hisobotda foizlar butun sonda. */
export function wholePercent(value: number | null): string {
  return formatPercent(value, { maximumFractionDigits: 0 });
}

export type SourceListRow = SourceBreakdownRow & { key: string; isRest: boolean };

export const TOP_SOURCES = 5;

/** Loyiha qoidasi: uzun dum «Boshqalar (N ta manba)» ga yig'iladi, u bosilmaydi. */
export function collapseSources(
  rows: SourceBreakdownRow[],
  top: number = TOP_SOURCES,
): SourceListRow[] {
  const toRow = (r: SourceBreakdownRow): SourceListRow => ({
    ...r,
    key: r.id ?? "none",
    isRest: false,
  });
  if (rows.length <= top) return rows.map(toRow);
  const head = rows.slice(0, top).map(toRow);
  const tail = rows.slice(top);
  const sum = (k: "lead" | "enrolled" | "attended" | "paid") =>
    tail.reduce((acc, r) => acc + r[k], 0);
  return [
    ...head,
    {
      id: null,
      name: `Boshqalar (${tail.length} ta manba)`,
      lead: sum("lead"),
      enrolled: sum("enrolled"),
      attended: sum("attended"),
      paid: sum("paid"),
      key: "rest",
      isRest: true,
    },
  ];
}
```

`FunnelPeriod` tipini `lead-funnel-types.ts` dan import qiling.

- [ ] **Step 5: O'tishini ko'rish**

Run: `cd client && npx vitest run src/components/reports/lead-funnel/lead-funnel-math.test.ts`
Expected: PASS (eski testlar ham). `lostPct` 62/15/72 kutilganini tekshiring: (146−55)/146 = 62 %, (55−47)/55 = 15 %, (47−13)/47 = 72 %.

- [ ] **Step 6: Typecheck**

Run: `cd client && npm run typecheck`
Expected: xato faqat `lead-funnel-chart.tsx`/`lead-funnel-client.tsx`/`home-lead-funnel-strip.tsx` da bo'lishi mumkin (agar `LeadFunnelResponse` yangi majburiy maydonlarini mock qilgan joy bo'lsa) — bo'lmasa 0. Xato bo'lsa faqat tip darajasida, Task 10 da yopiladi; hozir hech narsa render o'zgarmaydi. Xato bo'lsa hisobotga yozing.

- [ ] **Step 7: Lint + commit**

Run: `cd client && npx eslint src/components/reports/lead-funnel/lead-funnel-math.ts src/components/reports/lead-funnel/lead-funnel-math.test.ts src/components/reports/lead-funnel/lead-funnel-types.ts`

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-types.ts client/src/components/reports/lead-funnel/lead-funnel-math.ts client/src/components/reports/lead-funnel/lead-funnel-math.test.ts
git commit -m "Lidlar hisoboti: davr preset'lari, yo'qotish va manba hisobi"
```

---

### Task 5: Davr boshqaruvi komponenti

**Files:**
- Create: `client/src/components/reports/lead-funnel/lead-funnel-period-control.tsx`

**Interfaces:**
- Consumes: `PeriodPreset`, `PRESET_LABELS`, `visiblePresets`, `FUNNEL_START_DATE` (Task 4)
- Produces: `LeadFunnelPeriodControl({ preset, startDate, endDate, onPreset, onCustomRange })`

- [ ] **Step 1: Komponent**

```tsx
"use client";

import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import {
  FUNNEL_START_DATE,
  PRESET_LABELS,
  visiblePresets,
  type PeriodPreset,
} from "./lead-funnel-math";

/** "YYYY-MM-DD" → mahalliy yarim tun (kalendar shu kunni belgilasin). */
function toPickerDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface Props {
  preset: PeriodPreset;
  startDate: string;
  endDate: string;
  onPreset: (preset: Exclude<PeriodPreset, "oraliq">) => void;
  /** `oraliq` tanlanganda yoki sanalardan biri o'zgarganda. */
  onCustomRange: (range: { startDate: string; endDate: string }) => void;
}

/**
 * Segmentli preset'lar; kalendar faqat «Oraliq» da chiqadi. Sentyabr 2026 da
 * «O'tgan oy» ko'rinmaydi (avgust voronka chegarasidan oldin, server 400).
 */
export function LeadFunnelPeriodControl({
  preset,
  startDate,
  endDate,
  onPreset,
  onCustomRange,
}: Props) {
  const presets = visiblePresets();
  const start = toPickerDate(startDate);
  const end = toPickerDate(endDate);
  const floor = toPickerDate(FUNNEL_START_DATE);

  const setBound = (key: "startDate" | "endDate", d: Date | undefined) => {
    if (!d) return;
    const value = format(d, "yyyy-MM-dd");
    const next = { startDate, endDate, [key]: value };
    // Pickerlar bir-birini cheklaydi; bu URL'dan kelgan qiymat uchun zaxira.
    if (next.startDate > next.endDate) {
      if (key === "startDate") next.endDate = value;
      else next.startDate = value;
    }
    onCustomRange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Davr"
        className="inline-flex w-fit rounded-lg border bg-muted/40 p-0.5 text-sm"
      >
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() =>
              p === "oraliq" ? onCustomRange({ startDate, endDate }) : onPreset(p)
            }
            className="rounded-md px-3 py-1 transition-colors aria-pressed:bg-background aria-pressed:font-medium aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {preset === "oraliq" && (
        <div className="flex items-center gap-1">
          <DatePicker
            id="lead-funnel-start"
            value={start}
            onChange={(d) => setBound("startDate", d)}
            placeholder="Boshi"
            className="h-9 w-[140px]"
            minDate={floor}
            maxDate={end}
            defaultMonth={end}
          />
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            –
          </span>
          <DatePicker
            id="lead-funnel-end"
            value={end}
            onChange={(d) => setBound("endDate", d)}
            placeholder="Oxiri"
            className="h-9 w-[140px]"
            minDate={start}
            defaultMonth={start}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/reports/lead-funnel/lead-funnel-period-control.tsx`
Expected: 0 errors (`visiblePresets()` render vaqtida `new Date()` bilan chaqiriladi — Next SSR/CSR farqi yo'q, chunki sahifa `"use client"` va `Suspense` ichida; agar hydration ogohlantirishi bo'lsa `useMemo(() => visiblePresets(), [])` qiling)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-period-control.tsx
git commit -m "Lidlar hisoboti: davr preset'lari boshqaruvi"
```

---

### Task 6: KPI qatori

**Files:**
- Create: `client/src/components/reports/lead-funnel/lead-funnel-kpi-row.tsx`

**Interfaces:**
- Consumes: `LeadFunnelResponse` (Task 4), `conversionPct`, `wholePercent`, `displayDate`
- Produces: `LeadFunnelKpiRow({ data, onOpenUnpaidActive })`

- [ ] **Step 1: Komponent**

```tsx
"use client";

import {
  ChevronRight,
  Info,
  Percent,
  UserPlus,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { conversionPct, displayDate, wholePercent } from "./lead-funnel-math";
import type { LeadFunnelResponse } from "./lead-funnel-types";

interface CardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tooltip: string;
  valueClass?: string;
}

function KpiCard({ icon: Icon, label, value, sub, tooltip, valueClass }: CardProps) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Tushuntirish"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", valueClass)}>
        {value}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>
    </div>
  );
}

function previousSub(
  previous: LeadFunnelResponse["previous"],
  pick: (stages: Record<string, number>) => string,
): string {
  if (!previous) return "oldingi davr yo'q";
  return `oldingi davr ${pick(previous.stages)}`;
}

interface Props {
  data: LeadFunnelResponse;
  onOpenUnpaidActive: () => void;
}

/**
 * Dushanba ertalabki savolga 3 soniyada javob: qancha keldi, qanchasi to'ladi,
 * bu oldingi davrga nisbatan qanday. Taqqoslash faqat shu yerda — voronka
 * qatorlarida uchta raqam bo'lib ketmasin.
 */
export function LeadFunnelKpiRow({ data, onOpenUnpaidActive }: Props) {
  const conversion = conversionPct(data.stages.lead, data.stages.paid);
  const previousRange = data.previous
    ? `${displayDate(data.previous.period.startDate)} – ${displayDate(data.previous.period.endDate)}`
    : null;
  const comparisonNote = previousRange
    ? `Oldingi davr: ${previousRange} (tanlangan davr uzunligida, undan oldin).`
    : "Oldingi davr voronka boshlanishidan (10.09.2026) oldinga to'g'ri keladi, shuning uchun taqqoslash yo'q.";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={Percent}
        label="Liddan to'lovgacha"
        value={wholePercent(conversion)}
        sub={previousSub(data.previous, (s) => wholePercent(conversionPct(s.lead, s.paid)))}
        tooltip={`Davrda kelgan lidlarning necha foizi to'lov qilgani. ${comparisonNote}`}
      />
      <KpiCard
        icon={UserPlus}
        label="Yangi lidlar"
        value={formatNumber(data.stages.lead)}
        sub={previousSub(data.previous, (s) => formatNumber(s.lead))}
        tooltip={`Davrda kelgan odamlar: doskadan ${formatNumber(data.leadSplit.board)}, to'g'ridan ${formatNumber(data.leadSplit.direct)}. Bir odamning bir nechta lidi bitta hisoblanadi. ${comparisonNote}`}
      />
      <KpiCard
        icon={Wallet}
        label="To'lov qildi"
        value={formatNumber(data.stages.paid)}
        sub={previousSub(data.previous, (s) => formatNumber(s.paid))}
        tooltip={`Davrda kelib, keyin (davrdan keyin bo'lsa ham) to'lov qilganlar. ${comparisonNote}`}
      />
      <button
        type="button"
        onClick={onOpenUnpaidActive}
        className="group space-y-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <WalletCards className="size-4" aria-hidden="true" />
            To&apos;lamagan faol
          </span>
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="block text-2xl font-semibold text-orange-600 tabular-nums dark:text-orange-400">
          {formatNumber(data.unpaid.active)}
        </span>
        <span className="block text-xs text-muted-foreground">
          darsga kelgan, hali to&apos;lamagan, faol · ro&apos;yxat
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/reports/lead-funnel/lead-funnel-kpi-row.tsx`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-kpi-row.tsx
git commit -m "Lidlar hisoboti: KPI qatori oldingi davr bilan"
```

---

### Task 7: Chiziqli voronka

**Files:**
- Create: `client/src/components/reports/lead-funnel/lead-funnel-bars.tsx`

**Interfaces:**
- Consumes: `FunnelRow` (`lostPct` bilan), `LOSS_LABELS`, `FUNNEL_ORDER`, `wholePercent`, `useChartTheme`
- Produces: `LeadFunnelBars({ rows, leadSplit, biggestLoss, onStageClick, onLossClick })` — `onLossClick(stage)` da `stage` — **o'tilmagan** bosqichning oldingisi (`stuck` ro'yxat o'sha bosqichdan ochiladi)

- [ ] **Step 1: Komponent**

```tsx
"use client";

import { ArrowDown } from "lucide-react";
import { useChartTheme } from "@/components/dashboard/use-chart-theme";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  FUNNEL_ORDER,
  LOSS_LABELS,
  wholePercent,
  type FunnelRow,
} from "./lead-funnel-math";
import type { FunnelStage } from "./lead-funnel-types";

interface Props {
  rows: FunnelRow[];
  leadSplit: { board: number; direct: number };
  /** Kishi soni bo'yicha eng katta yo'qotish bo'lgan (o'tilmagan) bosqich. */
  biggestLoss: FunnelStage | null;
  onStageClick: (stage: FunnelStage) => void;
  /** Yo'qotish qatori: `stage` — odamlar to'xtab qolgan (oldingi) bosqich. */
  onLossClick: (stage: Exclude<FunnelStage, "paid">) => void;
}

/**
 * Chapdan boshlanadigan chiziqlar: uzunlik songa aniq mutanosib, minimal
 * kenglik yo'q, son doim chiziq yonida — shuning uchun 13/146 ham o'qiladi.
 * Trapetsiya nisbatni buzardi (yuza ikki bosqich o'rtachasi edi) va 8 %
 * floor kichik bosqichni shishirardi. Bitta rang; to'lov — urg'u rangi.
 */
export function LeadFunnelBars({
  rows,
  leadSplit,
  biggestLoss,
  onStageClick,
  onLossClick,
}: Props) {
  const { palette } = useChartTheme();

  return (
    <ol className="flex flex-col gap-1">
      {rows.map((row, i) => {
        const prevStage = i > 0 ? FUNNEL_ORDER[i - 1] : null;
        const lossKey = row.stage as Exclude<FunnelStage, "lead">;
        const isBiggest = biggestLoss === row.stage;
        return (
          <li key={row.stage} className="flex flex-col gap-1">
            {prevStage && row.lostFromPrev !== null && (
              <button
                type="button"
                onClick={() => onLossClick(prevStage as Exclude<FunnelStage, "paid">)}
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 py-1 text-left text-sm tabular-nums transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pl-[10.75rem]",
                  isBiggest ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {formatNumber(row.lostFromPrev)} kishi {LOSS_LABELS[lossKey]}
                </span>
                {row.lostPct !== null && (
                  <span className="text-muted-foreground">· {wholePercent(row.lostPct)}</span>
                )}
                {isBiggest && row.lostFromPrev > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                    eng katta yo&apos;qotish
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onStageClick(row.stage)}
              className="grid w-full items-center gap-x-3 gap-y-1 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[10rem_minmax(0,1fr)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.label}</span>
                {i === 0 && (leadSplit.board > 0 || leadSplit.direct > 0) && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    doskadan {formatNumber(leadSplit.board)} · to&apos;g&apos;ridan{" "}
                    {formatNumber(leadSplit.direct)}
                  </span>
                )}
              </span>

              <span className="flex items-center gap-3">
                <span
                  className="relative block h-7 flex-1 overflow-hidden rounded-md bg-muted/60"
                  aria-hidden="true"
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-md"
                    style={{
                      width: `${(row.widthRatio * 100).toFixed(2)}%`,
                      backgroundColor:
                        row.stage === "paid" ? palette.series3 : palette.series1,
                    }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums sm:w-28">
                  <span className="text-lg font-semibold">{formatNumber(row.count)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {row.pctOfFirst === null ? "—" : wholePercent(row.pctOfFirst)}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

Izoh: ikki ustunli grid — yorliq (10rem) va «chiziq + son» qatori. Yo'qotish qatorining chap bo'shlig'i `sm:pl-[10.75rem]` yorliq ustuni kengligiga mos.

- [ ] **Step 2: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/reports/lead-funnel/lead-funnel-bars.tsx`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-bars.tsx
git commit -m "Lidlar hisoboti: chiziqli voronka yo'qotish qatorlari bilan"
```

---

### Task 8: Taqsimot kartasi va to'lamaganlar plitkalari

**Files:**
- Create: `client/src/components/reports/lead-funnel/lead-funnel-breakdown-card.tsx`
- Create: `client/src/components/reports/lead-funnel/lead-funnel-unpaid-tiles.tsx`

**Interfaces:**
- Consumes: `ChartCard`, `conversionPct`, `wholePercent`, `useChartTheme`, `UnpaidStatusBucket`, `LeadFunnelResponse["unpaid"]`
- Produces:
  - `BreakdownRow { key: string; name: string; lead: number; paid: number; clickable: boolean }`
  - `LeadFunnelBreakdownCard({ title, tooltip, rows, emptyMessage, onRowClick? })`
  - `LeadFunnelUnpaidTiles({ unpaid, onOpen: (status: UnpaidStatusBucket) => void })`

- [ ] **Step 1: Taqsimot kartasi**

```tsx
"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { useChartTheme } from "@/components/dashboard/use-chart-theme";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { conversionPct, wholePercent } from "./lead-funnel-math";

export interface BreakdownRow {
  key: string;
  name: string;
  lead: number;
  paid: number;
  /** «Boshqalar» va filial qatorlari bosilmaydi. */
  clickable: boolean;
}

interface Props {
  title: string;
  tooltip: string;
  rows: BreakdownRow[];
  emptyMessage: string;
  onRowClick?: (key: string) => void;
}

/**
 * «Lid → to'lov» taqsimoti: manba yoki filial bo'yicha. Foiz chizig'i bitta
 * rangda — qatorlar bir-biri bilan taqqoslanadi, rang ma'no tashimaydi.
 */
export function LeadFunnelBreakdownCard({
  title,
  tooltip,
  rows,
  emptyMessage,
  onRowClick,
}: Props) {
  const { palette } = useChartTheme();

  return (
    <ChartCard
      title={title}
      tooltip={tooltip}
      isEmpty={rows.length === 0}
      emptyMessage={emptyMessage}
      bodyHeightClass="h-auto"
    >
      <ul className="flex flex-col">
        {rows.map((row) => {
          const pct = conversionPct(row.lead, row.paid);
          const content = (
            <>
              <span className="min-w-0 truncate text-sm">{row.name}</span>
              <span className="whitespace-nowrap text-sm tabular-nums">
                {formatNumber(row.lead)}
                <span className="text-muted-foreground"> → </span>
                {formatNumber(row.paid)}
              </span>
              <span className="w-12 text-right text-sm font-medium tabular-nums">
                {wholePercent(pct)}
              </span>
              <span
                className="relative block h-2 w-16 overflow-hidden rounded-full bg-muted/60 sm:w-24"
                aria-hidden="true"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pct ?? 0}%`,
                    backgroundColor: palette.series1,
                  }}
                />
              </span>
            </>
          );
          const className = cn(
            "grid w-full grid-cols-[minmax(0,1fr)_auto_3rem_auto] items-center gap-3 rounded-md px-1 py-1.5 text-left",
            row.clickable &&
              "transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          );
          return (
            <li key={row.key}>
              {row.clickable && onRowClick ? (
                <button type="button" onClick={() => onRowClick(row.key)} className={className}>
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
```

- [ ] **Step 2: To'lamaganlar plitkalari**

```tsx
"use client";

import { ChevronRight, Info } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { displayDate, FUNNEL_START_DATE } from "./lead-funnel-math";
import type { LeadFunnelResponse, UnpaidStatusBucket } from "./lead-funnel-types";

interface Props {
  unpaid: LeadFunnelResponse["unpaid"];
  onOpen: (status: UnpaidStatusBucket) => void;
}

const TILES: { status: UnpaidStatusBucket; label: string; urgent: boolean }[] = [
  { status: "active", label: "Faol", urgent: true },
  { status: "frozen", label: "Muzlatilgan", urgent: false },
  { status: "expelled", label: "Chetlatilgan", urgent: false },
  { status: "other", label: "Boshqa", urgent: false },
];

/**
 * Voronkaga 10.09.2026 dan beri kirgan, darsga kelgan, lekin hali to'lamagan
 * odamlar — BUGUNGI holat, tanlangan davrga bog'liq emas. 6–40 kishi uchun
 * grafik emas, raqamlar: har holat o'z ro'yxatini ochadi. «Faol» eng
 * shoshilinchi — darsga kelayotgan, lekin to'lamayotgan odam.
 */
export function LeadFunnelUnpaidTiles({ unpaid, onOpen }: Props) {
  const tiles = TILES.filter((t) => t.status !== "other" || unpaid.other > 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Darsga kelgan, lekin to&apos;lamagan</h3>
        <span className="text-xs text-muted-foreground">
          {displayDate(FUNNEL_START_DATE)} dan beri · bugungi holat ·{" "}
          <span className="tabular-nums">{formatNumber(unpaid.total)} kishi</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Tushuntirish"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Voronkaga kirgan, kamida bir darsga kelgan va hali birorta to&apos;lov
            qilmaganlar. Davr filtriga bog&apos;liq emas: boshlanishdan bugungacha,
            o&apos;quvchining hozirgi holati bo&apos;yicha.
          </TooltipContent>
        </Tooltip>
      </div>

      <div className={cn("grid gap-3", tiles.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3")}>
        {tiles.map((t) => {
          const value = unpaid[t.status];
          return (
            <button
              key={t.status}
              type="button"
              onClick={() => onOpen(t.status)}
              className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-muted-foreground">{t.label}</span>
                <span
                  className={cn(
                    "block text-2xl font-semibold tabular-nums",
                    t.urgent && value > 0 && "text-orange-600 dark:text-orange-400",
                  )}
                >
                  {formatNumber(value)}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/reports/lead-funnel/lead-funnel-breakdown-card.tsx src/components/reports/lead-funnel/lead-funnel-unpaid-tiles.tsx`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-breakdown-card.tsx client/src/components/reports/lead-funnel/lead-funnel-unpaid-tiles.tsx
git commit -m "Lidlar hisoboti: manba/filial kartasi va to'lamaganlar plitkalari"
```

---

### Task 9: Odamlar oynasi — filtrlar va telefon kartochkalari

**Files:**
- Modify: `client/src/components/reports/lead-funnel/lead-funnel-people-dialog.tsx`

**Interfaces:**
- Consumes: `peopleQueryParams` (`sourceId`, `status`), `FunnelPerson.sourceId`
- Produces: `LeadFunnelPeopleDialog({ stage, sourceId, sourceName, status, range, onOpenChange })` — `sourceId`/`status` bo'sh satr = filtr yo'q

- [ ] **Step 1: Props va sarlavha**

`LeadFunnelPeopleDialogProps` ni:

```tsx
interface LeadFunnelPeopleDialogProps {
  stage: PeopleStage | null;
  /** Manba id'si yoki `"none"`; bo'sh — filtr yo'q. */
  sourceId: string;
  /** Sarlavha uchun; `sourceId` bo'lsa-yu nom topilmasa "Manba" yoziladi. */
  sourceName: string | null;
  /** `unpaid` uchun holat; bo'sh — hammasi. */
  status: string;
  /** Yo'qotish qatoridan ochilganda `"stuck"` — «o'tmaganlar» rejimi darhol faol. */
  initialMode: PeopleMode;
  range: { startDate: string; endDate: string };
  onOpenChange: (open: boolean) => void;
}
```

`LeadFunnelPeopleDialog` tanasi:

```tsx
    <Dialog open={stage !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[min(960px,95vw)] !max-w-[min(960px,95vw)] flex-col gap-0 overflow-hidden p-0">
        {stage && (
          <PeopleBody
            key={`${stage}|${sourceId}|${status}|${initialMode}`}
            stage={stage}
            sourceId={sourceId}
            sourceName={sourceName}
            status={status}
            initialMode={initialMode}
            range={range}
          />
        )}
      </DialogContent>
    </Dialog>
```

`LeadFunnelPeopleDialog` destrukturasiga `initialMode` ni qo'shing. `PeopleBody` props'iga `sourceId: string; sourceName: string | null; status: string; initialMode: PeopleMode;` qo'shing; `useState<PeopleMode>(hasStuck ? initialMode : "all")`; `params = peopleQueryParams({ stage, mode, page, pageSize, range, sourceId: sourceId || undefined, status: status || undefined })`. (`status === "stuck"` `unpaid` bo'lmagan bosqichda `peopleQueryParams` tomonidan yuborilmaydi — Task 4.)

Sarlavha: `DialogHeader` ni `className="border-b px-6 py-4"` bilan; tavsifda manba/holat qo'shimchasi:

```tsx
const STATUS_LABELS: Record<string, string> = {
  active: "faol",
  frozen: "muzlatilgan",
  expelled: "chetlatilgan",
  other: "boshqa holatdagi",
};
```

```tsx
        <DialogDescription>
          {stage === "unpaid"
            ? `${displayDate(FUNNEL_START_DATE)} dan beri lid bo'lib kelgan, darsga kelgan, lekin hali to'lov qilmaganlar${status ? ` (${STATUS_LABELS[status] ?? status})` : ""}: bugungi holat.`
            : `${displayDate(range.startDate)} – ${displayDate(range.endDate)} oralig'ida kelgan lidlar${sourceId ? ` · manba: ${sourceId === "none" ? "manbasiz" : (sourceName ?? "Manba")}` : ""}.`}
        </DialogDescription>
```

- [ ] **Step 2: Tana: rejim tugmalari + jadval (sm+) + kartochkalar (< sm)**

`PeopleBody` return'ini quyidagi tuzilishga keltiring (mavjud jadval JSX'ini `hidden sm:block` o'ramiga ko'chiring):

```tsx
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
        {hasStuck && ( /* mavjud rejim tugmalari, o'zgarishsiz */ )}

        <div className="hidden min-h-0 flex-1 overflow-auto rounded-lg border sm:block">
          <Table> {/* mavjud jadval, o'zgarishsiz */} </Table>
        </div>

        <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border sm:hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <li key={`sk-${i}`} className="p-3">
                <Skeleton className="h-10 w-full" />
              </li>
            ))
          ) : isError ? (
            <li className="p-6 text-center text-sm text-destructive">
              Ro&apos;yxatni yuklab bo&apos;lmadi. Oynani yopib qayta oching.
            </li>
          ) : rows.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              Bu ro&apos;yxatda hech kim yo&apos;q.
            </li>
          ) : (
            rows.map((p, i) => (
              <li key={p.key} className="flex items-start gap-3 p-3">
                <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {(page - 1) * pageSize + i + 1}
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate font-medium">
                    {p.studentId ? (
                      <Link href={`/students/profile/${p.studentId}`} className="hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {p.phone ? (
                      <a href={`tel:+998${p.phone.replace(/\D/g, "").slice(-9)}`} className="tabular-nums hover:underline">
                        {formatPhone(p.phone)}
                      </a>
                    ) : (
                      <span>—</span>
                    )}
                    <span>{p.source ?? "Manbasiz"}</span>
                    <span className="tabular-nums">{displayDate(p.createdAt)}</span>
                  </span>
                </span>
                <span className="shrink-0">
                  {p.studentStatus ? (
                    <StatusBadge entityType="students" status={p.studentStatus} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Lid</span>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="border-t px-6 py-3">
        <DialogPaginationFooter ... (mavjud) />
      </div>
```

`DialogHeader` ham `px-6 py-4 border-b` bilan yuqorida turadi (DialogContent `p-0`). Bu loyihaning «sarlavha + skroll tanasi + footer» naqshi.

- [ ] **Step 3: Typecheck + lint**

Run: `cd client && npm run typecheck && npx eslint src/components/reports/lead-funnel/lead-funnel-people-dialog.tsx`
Expected: `lead-funnel-client.tsx` da props xatosi chiqadi (yangi majburiy props) — Task 10 da yopiladi; boshqa xato bo'lmasin.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-people-dialog.tsx
git commit -m "Lidlar hisoboti ro'yxati: manba/holat filtri va telefon kartochkalari"
```

---

### Task 10: Sahifani yig'ish, eski fayllarni o'chirish

**Files:**
- Modify: `client/src/components/reports/lead-funnel/lead-funnel-client.tsx` (to'liq qayta yoziladi)
- Delete: `client/src/components/reports/lead-funnel/lead-funnel-chart.tsx`, `client/src/components/reports/lead-funnel/lead-funnel-unpaid-card.tsx`

**Interfaces:**
- Consumes: Task 4–9 dagi hamma narsa; `useUrlFilters` (`@/hooks/use-url-filters`); `useBranchSwitcher`
- Produces: `/reports/leads` sahifasi; URL `period`, `startDate`, `endDate`, `people`, `source`, `status`

- [ ] **Step 1: Sahifa**

`lead-funnel-client.tsx` ni to'liq almashtiring:

```tsx
"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import api from "@/lib/api";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LeadFunnelBars } from "./lead-funnel-bars";
import {
  LeadFunnelBreakdownCard,
  type BreakdownRow,
} from "./lead-funnel-breakdown-card";
import { LeadFunnelKpiRow } from "./lead-funnel-kpi-row";
import {
  biggestLossStage,
  buildFunnelRows,
  collapseSources,
  displayDate,
  isPeopleStage,
  rangeIncludesToday,
  resolvePeriodFilter,
  type PeriodPreset,
} from "./lead-funnel-math";
import { LeadFunnelPeopleDialog } from "./lead-funnel-people-dialog";
import { LeadFunnelPeriodControl } from "./lead-funnel-period-control";
import type {
  FunnelStage,
  LeadFunnelResponse,
  UnpaidStatusBucket,
} from "./lead-funnel-types";
import { LeadFunnelUnpaidTiles } from "./lead-funnel-unpaid-tiles";

const FILTER_SCHEMA = {
  period: { type: "string" as const, defaultValue: "" },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  people: { type: "string" as const, defaultValue: "" },
  source: { type: "string" as const, defaultValue: "" },
  status: { type: "string" as const, defaultValue: "" },
};

const HOW_TO_READ =
  "Davrda kelgan lidlar olinadi va keyingi qadamlari davrdan keyin bo'lsa ham kuzatiladi. Bir odamning bir nechta lidi bitta hisoblanadi.\n\nVoronka 10.09.2026 dan sanaydi: shu kundan har bir yangi o'quvchi lid yozuvi qoldiradi. Undan oldingi sanani tanlab bo'lmaydi.";

const STILL_RUNNING =
  "Davr hali tugamagan: yaqinda kelganlar keyingi bosqichlarga ulgurmagan, shuning uchun foizlar keyinroq oshadi.";

export function LeadFunnelClient() {
  const { filters, setFilters } = useUrlFilters(FILTER_SCHEMA);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const period = useMemo(
    () =>
      resolvePeriodFilter({
        period: filters.period,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    [filters.period, filters.startDate, filters.endDate],
  );
  const range = { startDate: period.startDate, endDate: period.endDate };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["reports", "lead-funnel", selectedBranch?.id ?? "all", range.startDate, range.endDate],
    queryFn: () =>
      api
        .get<LeadFunnelResponse>("/reports/lead-funnel", { params: range })
        .then((r) => r.data),
    enabled: branchLoaded,
  });

  const rows = useMemo(() => (data ? buildFunnelRows(data.stages) : []), [data]);
  const biggestLoss = useMemo(() => biggestLossStage(rows), [rows]);
  const sourceRows = useMemo(() => collapseSources(data?.bySource ?? []), [data]);
  const byBranch = data?.byBranch ?? [];

  const setPreset = useCallback(
    (preset: Exclude<PeriodPreset, "oraliq">) =>
      setFilters({ period: preset === "shu-oy" ? "" : preset, startDate: "", endDate: "" }),
    [setFilters],
  );
  const setCustomRange = useCallback(
    (next: { startDate: string; endDate: string }) =>
      setFilters({ period: "oraliq", ...next }),
    [setFilters],
  );

  // Ochiq ro'yxat URL'da yashaydi (drawer/dialog qoidasi); yopilganda uchalasi o'chadi.
  const openPeople = useCallback(
    (stage: string, extra: { source?: string; status?: string } = {}) =>
      setFilters({ people: stage, source: extra.source ?? "", status: extra.status ?? "" }),
    [setFilters],
  );
  const closePeople = useCallback(
    () => setFilters({ people: "", source: "", status: "" }),
    [setFilters],
  );
  const openStage = isPeopleStage(filters.people) ? filters.people : null;
  const sourceName =
    data?.bySource.find((s) => (s.id ?? "none") === filters.source)?.name ?? null;

  const branchRows: BreakdownRow[] = byBranch.map((b) => ({
    key: b.id === null ? "none" : String(b.id),
    name: b.name ?? "Belgilanmagan",
    lead: b.lead,
    paid: b.paid,
    clickable: false,
  }));
  const sourceList: BreakdownRow[] = sourceRows.map((s) => ({
    key: s.key,
    name: s.isRest ? (s.name ?? "") : (s.name ?? "Manbasiz"),
    lead: s.lead,
    paid: s.paid,
    clickable: !s.isRest,
  }));
  const showBranches = byBranch.length >= 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">Lidlar hisoboti</h2>
          <p className="text-sm text-muted-foreground">
            Markazga kelgan odam to&apos;lovgacha qaysi bosqichda tushib qolmoqda
          </p>
        </div>
        <LeadFunnelPeriodControl
          preset={period.preset}
          startDate={period.startDate}
          endDate={period.endDate}
          onPreset={setPreset}
          onCustomRange={setCustomRange}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span>
          {displayDate(data?.period.startDate ?? range.startDate)} –{" "}
          {displayDate(data?.period.endDate ?? range.endDate)}
        </span>
        {rangeIncludesToday(range) && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">davom etmoqda</span>
        )}
        <span>· {selectedBranch?.name ?? "Barcha filiallar"}</span>
        {data && <span>· {formatNumber(data.stages.lead)} kishi kuzatildi</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Qanday o'qiladi"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm whitespace-pre-line">
            {rangeIncludesToday(range) ? `${STILL_RUNNING}\n\n${HOW_TO_READ}` : HOW_TO_READ}
          </TooltipContent>
        </Tooltip>
      </p>

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">Hisobotni yuklab bo&apos;lmadi.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : isPending || !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="space-y-2 rounded-xl border bg-card p-5">
            {[1, 0.4, 0.32, 0.09].map((w) => (
              <Skeleton key={w} className="h-7" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <LeadFunnelKpiRow
            data={data}
            onOpenUnpaidActive={() => openPeople("unpaid", { status: "active" })}
          />

          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="mb-3 font-semibold">Lid voronkasi</h3>
            {data.stages.lead === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Tanlangan davrda lid yo&apos;q: davrni kengaytirib ko&apos;ring.
              </p>
            ) : (
              <LeadFunnelBars
                rows={rows}
                leadSplit={data.leadSplit}
                biggestLoss={biggestLoss}
                onStageClick={(stage: FunnelStage) => openPeople(stage)}
                onLossClick={(stage) => openPeople(stage, { status: "stuck" })}
              />
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Bosqichni bosing: o&apos;sha bosqichdagi odamlar ro&apos;yxati ochiladi.
            </p>
          </section>

          <div className={showBranches ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
            <LeadFunnelBreakdownCard
              title="Manba bo'yicha"
              tooltip="Har manbadan kelganlarning necha foizi to'lov qildi. Qatorni bosing: o'sha manbadan kelganlar ro'yxati."
              rows={sourceList}
              emptyMessage="Bu davrda lid yo'q"
              onRowClick={(key) => openPeople("lead", { source: key })}
            />
            {showBranches && (
              <LeadFunnelBreakdownCard
                title="Filial bo'yicha"
                tooltip="Lid qaysi filialga tegishli bo'lsa, o'sha yerda sanaladi. «Belgilanmagan»: hali filialga biriktirilmagan lidlar."
                rows={branchRows}
                emptyMessage="Bu davrda lid yo'q"
              />
            )}
          </div>

          <LeadFunnelUnpaidTiles
            unpaid={data.unpaid}
            onOpen={(status: UnpaidStatusBucket) => openPeople("unpaid", { status })}
          />
        </>
      )}

      <LeadFunnelPeopleDialog
        stage={openStage}
        sourceId={filters.source}
        sourceName={sourceName}
        status={filters.status}
        initialMode={filters.status === "stuck" ? "stuck" : "all"}
        range={range}
        onOpenChange={(open) => !open && closePeople()}
      />
    </div>
  );
}
```

Yo'qotish qatori URL'da `status=stuck` bilan ochiladi; `unpaid` bo'lmagan bosqichda bu qiymat serverga ketmaydi (Task 4 `peopleQueryParams`), faqat oynaning boshlang'ich rejimini belgilaydi (Task 9 `initialMode`).

- [ ] **Step 2: Eski fayllarni o'chirish**

```bash
git rm client/src/components/reports/lead-funnel/lead-funnel-chart.tsx client/src/components/reports/lead-funnel/lead-funnel-unpaid-card.tsx
grep -rn "lead-funnel-chart\|lead-funnel-unpaid-card\|LeadFunnelChart\|LeadFunnelUnpaidCard" client/src || echo "havola qolmadi"
```

- [ ] **Step 3: Testlar, typecheck, lint, build**

Run: `cd client && npm test && npm run typecheck && npx eslint src/components/reports/lead-funnel src/components/dashboard/home-lead-funnel-strip.tsx && npm run build`
Expected: hammasi toza. `home-lead-funnel-strip.tsx` o'zgarmagan bo'lishi kerak (`git status` da yo'q).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/lead-funnel/lead-funnel-client.tsx client/src/components/reports/lead-funnel/lead-funnel-people-dialog.tsx
git commit -m "Lidlar hisoboti sahifasi qayta yig'ildi; trapetsiya voronka o'chirildi"
```

(`git rm` allaqachon indeksda.)

---

### Task 11: Hujjat, to'liq tekshiruv, brauzer

**Files:**
- Modify: `client/CLAUDE.md` (Lead Forms bo'limidan keyin yangi bo'lim)
- Modify: `server/CLAUDE.md` (Reports Module ro'yxatiga bitta band)

- [ ] **Step 1: Hujjat**

`client/CLAUDE.md` ga «### Lead Forms and Their Responses» bo'limidan keyin:

```markdown
### Lead Funnel Report (`/reports/leads`)

`reports/lead-funnel/lead-funnel-client.tsx`. Stages (Lid → Guruhga yozildi → Darsga keldi → To'lov qildi) are counted on the server from 10.09.2026; the page only renders.

- **The funnel is a left-aligned bar list (`lead-funnel-bars.tsx`), not a funnel picture.** The old trapezoid drew each block with the NEXT stage's width at its base, so its area was the mean of two stages (146 → 55 read as 2× instead of 2.65×), and an 8 % minimum width inflated small stages. Bars are exactly `count / lead` wide with no floor; the number always sits beside the bar. Do not bring back a funnel shape or a min-width.
- One hue (`palette.series1`) for every stage, `series3` only for «To'lov qildi». Text never takes a series color. The drop-off row between stages («↓ 91 kishi guruhga yozilmadi · 62 %») is `text-sm`, always rendered (even at 0), clickable into the `stuck` list; the biggest loss is labelled.
- Percentages in this report are **whole numbers** (`wholePercent`); 146 leads do not support a decimal.
- Period is a preset in the URL: `?period=otgan-oy|boshidan|oraliq` (`shu-oy` is the default and is omitted). «O'tgan oy» is hidden while the previous month ends before 10.09.2026 (`visiblePresets`). The custom range keeps the paired `DatePicker`s.
- The open people list lives in the URL (`?people=<stage>&source=<id|none>&status=<bucket|stuck>`) and is cleared on close.
- `amber-*` and `sky-*` render as no color in the admin panel (`globals.css` maps them to `.lumio` variables); the urgent tile uses `orange-600`/`orange-400`.
```

`server/CLAUDE.md` «Reports Module» endpoint ro'yxati yoniga:

```markdown
- **Lead funnel** (`GET /reports/lead-funnel`, CEO/BD/Admin): besides `stages`/`leadSplit`/`unpaid` it returns `previous` (the same-length period immediately before, clamped to `FUNNEL_START_DATE`, `null` before that), `bySource` and `byBranch` — all computed in memory over the cohort `loadCohort` already loads (`lead-funnel.math.ts`: `countBySource`, `countByBranch`, `previousPeriod`). `GET /reports/lead-funnel/people` accepts `sourceId` (`none` = no source) and, for `stage=unpaid`, `status` (`active|frozen|expelled|other`, `statusBucket`).
```

- [ ] **Step 2: Server to'liq**

Run: `cd server && npm test && npm run typecheck && npx eslint src/reports/lead-funnel`
Expected: PASS / 0 xato

- [ ] **Step 3: Client to'liq**

Run: `cd client && npm test && npx eslint src && npm run build`
Expected: vitest PASS; eslint `0 errors`; build toza

- [ ] **Step 4: Brauzer sinovi**

`server/.env` dev bazaga qaraydi. Port 3000 boshqa sessiyaniki: client `npx next dev -p 3001`, server `CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= npm run start:dev` (4000). `client/.env.local` = `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. Playwright: `NODE_PATH=/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/710f4a26-c611-4cc4-b9d2-cea3acdf55e5/scratchpad/node_modules`, `--disable-web-security`. Dev CEO: 900000000 / 123456. So'rovlar 20–160 s; timeout 180 s+.

Dev bazada voronka bo'sh — `page.route('**/api/reports/lead-funnel?*')` bilan mock: `stages 146/55/47/13, leadSplit 20/126, previous {period 10.09–30.09, stages 125/40/30/8}, bySource [Tanishlar 59/20/15/3, Telegram bot 39/20/17/7, Instagram 30/6/6/0, (null) 14/5/5/2, Telegram 14/4/4/1, Boshqa1 3/0/0/0, Boshqa2 2/0/0/0], byBranch [Farg'ona 126/12, Namangan 30/1], unpaid 30/18/7/5/0`. Ikkinchi mock: `byBranch` bitta qator (filial kartasi yashirinishi). `people` endpoint'ini 10 qatorli mock bilan.

Tekshiriladi (skrinshot bilan, 1280 va 400, yorug' va qorong'i):
1. Chiziqlar uzunligi 146:55:47:13 ga mos (DOM'da `style.width` 100/37.67/32.19/8.90 %).
2. Yo'qotish qatorlari: «91 kishi guruhga yozilmadi · 62 %», «8 kishi darsga kelmadi · 15 %», «34 kishi to'lov qilmadi · 72 %»; «eng katta yo'qotish» birinchisida.
3. KPI: «9%», «oldingi davr 6%»; «146 / oldingi davr 125»; To'lamagan faol 18 (orange).
4. Manba kartasi: 5 qator + «Boshqalar (2 ta manba)» (bosilmaydi); «Manbasiz» qatori bosilsa URL `?people=lead&source=none`, oyna tavsifida «manbasiz».
5. Filial kartasi 2 qatorda ko'rinadi, 1 qatorli mock'da yo'q.
6. Plitka «Muzlatilgan» bosilsa `?people=unpaid&status=frozen`; oynani yopganda uchala param o'chadi.
7. Yo'qotish qatori bosilsa oynada «Darsga kelmaganlar» rejimi faol (`status=stuck`).
8. Preset'lar: sentyabrda «O'tgan oy» yo'q; «Boshidan» → URL `?period=boshidan`; «Oraliq» → sanalar chiqadi, URL `period=oraliq&startDate&endDate`; «Shu oy» → URL toza.
9. 400px: chiziqlar to'liq kenglikda, yorliq tepada; oyna kartochka ro'yxati, footer ko'rinadi; sahifa gorizontal surilmaydi.
10. Qorong'i rejim: chiziqlar (`series1`/`series3` dark qiymatlari), orange raqam o'qiladi.
11. Bosh sahifa qatori (`/`) avvalgidek ishlaydi (mock bilan 146 › 55 › 47 › 13).

Natijalar va skrinshotlar `.superpowers/` ish katalogi yoki scratchpad'da; hisobotda har band PASS/FAIL.

- [ ] **Step 5: Serverlarni to'xtatish, commit**

Faqat o'zi ishga tushirgan jarayonlar; 3001/4000 bo'sh; `git status --short` faqat hujjat o'zgarishlarini ko'rsatsin.

```bash
git add client/CLAUDE.md server/CLAUDE.md
git commit -m "Lidlar hisoboti qayta qurilishi hujjatlashtirildi"
```
