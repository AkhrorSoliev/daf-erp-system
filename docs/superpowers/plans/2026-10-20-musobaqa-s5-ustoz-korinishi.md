# Musobaqa S5 — ustoz ko'rinishi («Musobaqa» tabi): implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guruh sahifasida yangi «Musobaqa» tabi: ustoz (va admin/CEO) guruhning markaz bo'yicha haftalik o'rnini, oxirgi 8 hafta tarixini, har o'quvchining ball/seriya/maqsad/liga/nishon holatini va «shu hafta mashq qilmadi» ro'yxatini ko'radi. Faqat o'qiydi, migratsiya yo'q.

**Architecture:** Yangi `server/src/daf/ustoz/` papkasi: sof qoidalar (`musobaqa-ustoz-qoidalari.ts`), ikki raw SQL (`musobaqa-ustoz.sql.ts`), yig'uvchi servis (`musobaqa-ustoz.service.ts`) va `GET /groups/:id/musobaqa` kontrolleri (`assertCallerMayTouchGroup` bilan). Guruh o'rni joriy haftada S3 `guruhlarYigindisi` + `guruhlarniSarala`dan, o'tgan haftada `DafGroupWeek`dan olinadi. Mijozda `client/src/components/groups/musobaqa/` va `group-detail-tabs.tsx` ga bitta tab.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL, tagged `$queryRaw` + `Prisma.sql`), jest (server), Next.js + React Query + vitest (client), ts-node skriptlar.

**Spec:** [`docs/superpowers/specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md`](../specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md)

## Global Constraints

- Huquq: `@Can('groups.view')` (standart rollar Administrator, Branch Director, CEO, Teacher — ilova faolligi bilan bir xil) VA `assertCallerMayTouchGroup(prisma, userId, roles, groupId, RAD_XABARI)` servisdan OLDIN. Marshrut `branch-route-policy.ts` da `BRANCH_SCOPED_BY_ENTITY` bandiga (ilova faolligi bandi yonida) va `route-access.snapshot.json` ga qo'shiladi.
- Faqat o'qiydi: `src/daf/ustoz/` ichida `create|update|upsert|delete|$executeRaw|INSERT|UPDATE|DELETE` yo'q. Migratsiya yo'q, yangi jadval yo'q.
- A'zolar to'plami S3 `guruhlarYigindisi` bilan AYNAN bir xil: `Enrollment.status = 'ACTIVE'`, takrorsiz o'quvchi; `Student.deletedAt` bo'yicha FILTR YO'Q (parity). Guruh bali = `DafStudentDay.points` yig'indisi, `groupKey = groupId`, hafta ichida; jami ball = barcha `groupKey`lar.
- «Mashq qilmadi» = tanlangan haftada `jamiBall === 0` (guruh bali EMAS).
- Hafta: dushanba `'YYYY-MM-DD'` (Asia/Tashkent, `wochenStartTag`). Ruxsat etilgan: joriy hafta + oldingi 8 hafta (`haftalarRoyxati`). Boshqasi → `400` («Hafta noto'g'ri…»). `?hafta=` yo'q = joriy.
- Seriya = `serieAus(tage, bugun)` (S2 qoidasi; `tage` = `attempts > 0` kunlar), FAQAT joriy haftada, oxirgi 400 kundan (`KUN_OYNASI`). Bugungi maqsad = `bugunBali` / `MAQSAD_BALL[maqsadDarajasi(dailyGoal)]`, FAQAT joriy haftada; o'quvchi ekranidagi «bosh» qoidasi QO'LLANMAYDI. O'tgan haftada `seriya`, `bugunBali`, `maqsadBali` = `null`.
- Liga nomi `darajaNomi(tier ?? 0)`; nishonlar = `DafStudentBadge` soni; akkaunt = `Student.user !== null`. Ism — `reytingIsmi`. Telefon, to'lov, Telegram holati javobda YO'Q.
- Raw SQL faqat `db.$queryRaw<T>(Prisma.sql\`/* belgi */ …\`)`; `*Unsafe` taqiqlangan. Ro'yxat — `Prisma.join(ids)` (bo'sh ro'yxat uchun so'rov chaqirilmaydi). Sana `'YYYY-MM-DD'` + `::date`; «hozir» uchun `tashkentDateStr`/`wochenStartTag`, hech qachon `toISOString()` (faqat `@db.Date` yarim tun qiymatini `YYYY-MM-DD` ga o'girishda `.toISOString().slice(0, 10)` ruxsat).
- `fortschritt.service.ts` ga TEGILMAYDI. Mavjud `app-activity` kontrolleri va servisiga TEGILMAYDI.
- Mijoz: ekrandagi matn faqat lotin o'zbekcha, `t()` orqali, inglizcha so'z yo'q; tugmalar ≥ 44 px; jadval sarlavhalari `scope="col"`; ranglar mavjud tokenlar; «Mashq qilmadi» matni neytral (qizil rang va tahdid yo'q — loyiha qoidasi: jazo yo'q). **Client fayllariga prettier ISHLATILMAYDI.** Yangi fayllar `i18n-coverage.test.ts` `STRICT_FILES` ga QO'SHILMAYDI (tarjima keyingi ish).
- Kommit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Server fayllari: `npx prettier --write` → `npx eslint --quiet` → `npx jest <yo'l>` (`server/` ichidan). Tip tekshiruvi: `npm run build`.
- Yuklama/parity skriptlari faqat lokal `daf_s1_yuklama` bazasida (`scripts/load/local-db-guard.ts`, `assertLocalDb()`); hech bir skript Telegram'ga yubormaydi.
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/musobaqa-s5`. Hamma buyruq shu ildizdan (yoki `server/`, `client/` ichidan). Asosiy katalogda commit qilinmaydi.
- Yangi fayl 500 qatordan oshmaydi.

## Fayl xaritasi

| Fayl | Nima | Vazifa |
| --- | --- | --- |
| `server/src/daf/ustoz/musobaqa-ustoz.types.ts` | javob va xom qator turlari | 1 |
| `server/src/daf/ustoz/musobaqa-ustoz-qoidalari.ts` (+spec) | `haftalarRoyxati`, `haftaniTanla`, `mashqQilmaganlar`, `oquvchiQatorlari` | 1 |
| `server/src/daf/ustoz/musobaqa-ustoz.sql.ts` | `azolarBallari`, `azolarKunlari` | 2 |
| `server/src/daf/ustoz/musobaqa-ustoz.service.ts` (+spec) | `MusobaqaUstozService.guruhKorinishi` | 3 |
| `server/src/daf/ustoz/musobaqa-ustoz.controller.ts` (+spec), `server/src/daf/dto/musobaqa-query.dto.ts` (+spec), `server/src/daf/ustoz/musobaqa-ustoz.read-only.spec.ts` | kontroller, DTO, faqat-o'qish qorovuli | 4 |
| `server/src/daf/daf.module.ts`, `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json` | ulash | 4 |
| `server/scripts/load/daf-yuklama-s5-ustoz.ts` | parity + p95 | 5 |
| `client/src/components/groups/musobaqa/types.ts`, `use-musobaqa.ts`, `musobaqa-format.ts` (+test) | tur, so'rov, sof formatlar | 6 |
| `client/src/components/groups/musobaqa/group-musobaqa-tab.tsx`, `guruh-orni-karta.tsx`, `oquvchilar-jadvali.tsx`, `mashq-qilmadi.tsx`, `client/src/components/groups/group-detail-tabs.tsx` | ekran va tab | 7 |
| — | brauzer tekshiruvi | 8 |
| `docs/adr/0118-…md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/src/qollanma/yangiliklar.ts`, spec §2/§11 | hujjat | 9 |

---

### Task 1: Turlar va sof qoidalar

**Files:**
- Create: `server/src/daf/ustoz/musobaqa-ustoz.types.ts`
- Create: `server/src/daf/ustoz/musobaqa-ustoz-qoidalari.ts`
- Test: `server/src/daf/ustoz/musobaqa-ustoz-qoidalari.spec.ts`

**Interfaces:**
- Produces (Task 2–4, 5 ishlatadi):
  - `type GuruhHolati = 'JADVALDA' | 'KAM_AZO' | 'FAOL_EMAS' | 'YOZUV_YOQ'`
  - `interface MusobaqaGuruh { holat: GuruhHolati; orin: number | null; guruhSoni: number | null; baho: number | null; azolar: number; ball: number; minAzolar: number }`
  - `interface MusobaqaTarixQatori { haftaBoshi: string; orin: number | null; baho: number | null }`
  - `interface MusobaqaOquvchi { studentId: number; ism: string; akkaunt: boolean; guruhBali: number; jamiBall: number; faolKunlar: number; seriya: number | null; bugunBali: number | null; maqsadBali: number | null; liga: string; nishonlar: number; oxirgiMashq: string | null }`
  - `interface MusobaqaJavob { bugun: string; haftaBoshi: string; joriy: boolean; haftalar: string[]; guruh: MusobaqaGuruh; tarix: MusobaqaTarixQatori[]; oquvchilar: MusobaqaOquvchi[] }`
  - xom qatorlar: `AzoMalumoti { studentId: number; ism: string; akkaunt: boolean; tier: number; dailyGoal: string | null; nishonlar: number }`, `AzoBalli { studentId: number; guruhBali: number; jamiBall: number; faolKunlar: number }`, `AzoKunlari { studentId: number; tage: string[]; bugunBali: number }`
  - `TARIX_HAFTALARI = 8`, `KUN_OYNASI = 400`
  - `haftalarRoyxati(joriyHafta: string): string[]` — joriy + oldingi 8 dushanba, yangidan eskiga (9 ta)
  - `haftaniTanla(param: string | undefined, joriyHafta: string): string | null` — `undefined` → joriy; ro'yxatda yo'q → `null`
  - `mashqQilmaganlar<T extends { jamiBall: number }>(qatorlar: readonly T[]): T[]`
  - `oquvchiQatorlari(input: { azolar: AzoMalumoti[]; ballar: AzoBalli[]; kunlar: AzoKunlari[]; joriy: boolean; bugun: string }): MusobaqaOquvchi[]` — jami ball ↓, ism ↑, `studentId` ↑

- [ ] **Step 1: Turlar faylini yozish**

`server/src/daf/ustoz/musobaqa-ustoz.types.ts`:

```ts
/**
 * `GET /groups/:id/musobaqa` javobi va xom qatorlar (spec S5 §5). Mijoz
 * turlari (`client/.../groups/musobaqa/types.ts`) shuni qo'lda aks ettiradi.
 */
export type GuruhHolati = 'JADVALDA' | 'KAM_AZO' | 'FAOL_EMAS' | 'YOZUV_YOQ';

export interface MusobaqaGuruh {
  holat: GuruhHolati;
  orin: number | null;
  /** Jadvaldagi (yoki o'sha hafta joylashgan) guruhlar soni. */
  guruhSoni: number | null;
  baho: number | null;
  azolar: number;
  ball: number;
  minAzolar: number;
}

export interface MusobaqaTarixQatori {
  haftaBoshi: string;
  orin: number | null;
  baho: number | null;
}

export interface MusobaqaOquvchi {
  studentId: number;
  ism: string;
  akkaunt: boolean;
  guruhBali: number;
  jamiBall: number;
  faolKunlar: number;
  seriya: number | null;
  bugunBali: number | null;
  maqsadBali: number | null;
  liga: string;
  nishonlar: number;
  oxirgiMashq: string | null;
}

export interface MusobaqaJavob {
  /** Toshkent kuni — mijoz «3 kun oldin» ni shundan sanaydi. */
  bugun: string;
  haftaBoshi: string;
  joriy: boolean;
  haftalar: string[];
  guruh: MusobaqaGuruh;
  tarix: MusobaqaTarixQatori[];
  oquvchilar: MusobaqaOquvchi[];
}

export interface AzoMalumoti {
  studentId: number;
  ism: string;
  akkaunt: boolean;
  tier: number;
  dailyGoal: string | null;
  nishonlar: number;
}

export interface AzoBalli {
  studentId: number;
  guruhBali: number;
  jamiBall: number;
  faolKunlar: number;
}

export interface AzoKunlari {
  studentId: number;
  /** `attempts > 0` bo'lgan kunlar, `YYYY-MM-DD`. */
  tage: string[];
  bugunBali: number;
}
```

- [ ] **Step 2: Failing test**

`server/src/daf/ustoz/musobaqa-ustoz-qoidalari.spec.ts`:

```ts
import {
  haftalarRoyxati,
  haftaniTanla,
  mashqQilmaganlar,
  oquvchiQatorlari,
} from './musobaqa-ustoz-qoidalari';
import type { AzoMalumoti } from './musobaqa-ustoz.types';

const JORIY = '2026-10-19'; // dushanba

describe('haftalarRoyxati', () => {
  it('joriy hafta + oldingi 8 dushanba, yangidan eskiga', () => {
    const r = haftalarRoyxati(JORIY);
    expect(r).toHaveLength(9);
    expect(r[0]).toBe('2026-10-19');
    expect(r[1]).toBe('2026-10-12');
    expect(r[8]).toBe('2026-08-24');
  });
});

describe('haftaniTanla', () => {
  it.each([
    [undefined, '2026-10-19'],
    ['2026-10-19', '2026-10-19'],
    ['2026-08-24', '2026-08-24'],
  ])('%s → %s', (param, kutilgan) => {
    expect(haftaniTanla(param, JORIY)).toBe(kutilgan);
  });

  it.each([
    ['2026-10-20'], // dushanba emas
    ['2026-10-26'], // kelajak
    ['2026-08-17'], // 9 hafta oldin — chegaradan tashqari
    ['bugun'],
  ])('%s → null', (param) => {
    expect(haftaniTanla(param, JORIY)).toBeNull();
  });
});

describe('mashqQilmaganlar', () => {
  it('faqat jami ball 0 bo‘lganlar', () => {
    const r = mashqQilmaganlar([
      { id: 1, jamiBall: 0 },
      { id: 2, jamiBall: 5 },
    ]);
    expect(r.map((x) => x.id)).toEqual([1]);
  });
});

describe('oquvchiQatorlari', () => {
  const azo = (id: number, ism: string, o: Partial<AzoMalumoti> = {}): AzoMalumoti => ({
    studentId: id,
    ism,
    akkaunt: true,
    tier: 0,
    dailyGoal: null,
    nishonlar: 0,
    ...o,
  });

  it('joriy hafta: seriya, bugungi ball, maqsad; jami ball ↓ keyin ism ↑', () => {
    const r = oquvchiQatorlari({
      azolar: [
        azo(1, 'Vali Aliyev'),
        azo(2, 'Anvar Karimov', { tier: 2, dailyGoal: 'JIDDIY', nishonlar: 3 }),
        azo(3, 'Bobur Aliyev'),
      ],
      ballar: [
        { studentId: 1, guruhBali: 50, jamiBall: 80, faolKunlar: 2 },
        { studentId: 2, guruhBali: 10, jamiBall: 80, faolKunlar: 1 },
      ],
      kunlar: [
        { studentId: 1, tage: ['2026-10-17', '2026-10-18', '2026-10-19'], bugunBali: 30 },
        { studentId: 2, tage: ['2026-10-10'], bugunBali: 0 },
      ],
      joriy: true,
      bugun: '2026-10-19',
    });
    expect(r.map((x) => x.studentId)).toEqual([2, 1, 3]); // teng 80: Anvar < Vali
    const vali = r.find((x) => x.studentId === 1)!;
    expect(vali).toMatchObject({
      guruhBali: 50,
      jamiBall: 80,
      faolKunlar: 2,
      seriya: 3,
      bugunBali: 30,
      maqsadBali: 80, // tanlov yo'q = O'rta
      liga: 'Bronza',
      oxirgiMashq: '2026-10-19',
    });
    const anvar = r.find((x) => x.studentId === 2)!;
    expect(anvar).toMatchObject({
      maqsadBali: 160,
      liga: 'Oltin',
      nishonlar: 3,
      seriya: 0,
      oxirgiMashq: '2026-10-10',
    });
  });

  it('qatori yo‘q o‘quvchi nollar bilan, oxirgi mashq null', () => {
    const [q] = oquvchiQatorlari({
      azolar: [azo(7, 'Yangi Kelgan')],
      ballar: [],
      kunlar: [],
      joriy: true,
      bugun: '2026-10-19',
    });
    expect(q).toMatchObject({
      guruhBali: 0,
      jamiBall: 0,
      faolKunlar: 0,
      seriya: 0,
      bugunBali: 0,
      oxirgiMashq: null,
    });
  });

  it('o‘tgan hafta: seriya, bugungi ball va maqsad null', () => {
    const [q] = oquvchiQatorlari({
      azolar: [azo(1, 'Vali Aliyev')],
      ballar: [{ studentId: 1, guruhBali: 5, jamiBall: 5, faolKunlar: 1 }],
      kunlar: [{ studentId: 1, tage: ['2026-10-18'], bugunBali: 0 }],
      joriy: false,
      bugun: '2026-10-19',
    });
    expect(q).toMatchObject({
      seriya: null,
      bugunBali: null,
      maqsadBali: null,
      oxirgiMashq: '2026-10-18',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (`server/` ichidan): `npx jest src/daf/ustoz/musobaqa-ustoz-qoidalari.spec.ts`
Expected: FAIL — `Cannot find module './musobaqa-ustoz-qoidalari'`.

- [ ] **Step 4: Implement**

`server/src/daf/ustoz/musobaqa-ustoz-qoidalari.ts`:

```ts
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { darajaNomi } from '../liga/liga-qoidalari';
import { MAQSAD_BALL, maqsadDarajasi, serieAus } from '../uebung/punkte';
import type {
  AzoBalli,
  AzoKunlari,
  AzoMalumoti,
  MusobaqaOquvchi,
} from './musobaqa-ustoz.types';

/** Tarix: joriy haftadan oldingi shuncha hafta (spec S5 §4). */
export const TARIX_HAFTALARI = 8;
/** Seriya uchun kunlar oynasi. ponytail: 400 kundan uzun seriya kesiladi (loyiha 2026-09 da boshlangan). */
export const KUN_OYNASI = 400;

/** Joriy hafta + oldingi 8 dushanba, yangidan eskiga. */
export function haftalarRoyxati(joriyHafta: string): string[] {
  return Array.from({ length: TARIX_HAFTALARI + 1 }, (_, i) =>
    addDaysToDateStr(joriyHafta, -7 * i),
  );
}

/** `undefined` = joriy hafta. Ro'yxatda yo'q (dushanba emas, kelajak, 8 haftadan eski) = `null`. */
export function haftaniTanla(
  param: string | undefined,
  joriyHafta: string,
): string | null {
  const hafta = param ?? joriyHafta;
  return haftalarRoyxati(joriyHafta).includes(hafta) ? hafta : null;
}

/** Spec S5 §4: shu guruh bali EMAS, jami ball — boshqa guruhda mashq qilgan «qilmadi»ga tushmasin. */
export function mashqQilmaganlar<T extends { jamiBall: number }>(
  qatorlar: readonly T[],
): T[] {
  return qatorlar.filter((q) => q.jamiBall === 0);
}

export function oquvchiQatorlari(input: {
  azolar: AzoMalumoti[];
  ballar: AzoBalli[];
  kunlar: AzoKunlari[];
  joriy: boolean;
  bugun: string;
}): MusobaqaOquvchi[] {
  const ballar = new Map(input.ballar.map((b) => [b.studentId, b]));
  const kunlar = new Map(input.kunlar.map((k) => [k.studentId, k]));
  return input.azolar
    .map((a): MusobaqaOquvchi => {
      const b = ballar.get(a.studentId);
      const k = kunlar.get(a.studentId);
      const tage = k?.tage ?? [];
      return {
        studentId: a.studentId,
        ism: a.ism,
        akkaunt: a.akkaunt,
        guruhBali: b?.guruhBali ?? 0,
        jamiBall: b?.jamiBall ?? 0,
        faolKunlar: b?.faolKunlar ?? 0,
        seriya: input.joriy ? serieAus(tage, input.bugun) : null,
        bugunBali: input.joriy ? (k?.bugunBali ?? 0) : null,
        maqsadBali: input.joriy
          ? MAQSAD_BALL[maqsadDarajasi(a.dailyGoal)]
          : null,
        liga: darajaNomi(a.tier),
        nishonlar: a.nishonlar,
        oxirgiMashq: tage.length ? tage.reduce((x, y) => (x > y ? x : y)) : null,
      };
    })
    .sort(
      (x, y) =>
        y.jamiBall - x.jamiBall ||
        x.ism.localeCompare(y.ism) ||
        x.studentId - y.studentId,
    );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/daf/ustoz/musobaqa-ustoz-qoidalari.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format, lint, commit**

```bash
cd server && npx prettier --write src/daf/ustoz && npx eslint --quiet src/daf/ustoz && cd ..
git add server/src/daf/ustoz
git commit -m "feat(daf): S5 teacher view — response types and pure rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Raw SQL — a'zolar ballari va kunlari

**Files:**
- Create: `server/src/daf/ustoz/musobaqa-ustoz.sql.ts`
- Create (vaqtincha, commit QILINMAYDI): `server/scripts/_probe-ustoz-sql.ts`

**Interfaces:**
- Consumes: `AzoBalli`, `AzoKunlari` (Task 1), `KUN_OYNASI`.
- Produces:
  - `azolarBallari(db: Pick<Prisma.TransactionClient,'$queryRaw'>, companyId: number, groupId: string, studentIds: number[], haftaBoshi: string): Promise<AzoBalli[]>` — bog'langan qiymatlar tartibi `[groupId, companyId, ...studentIds, haftaBoshi, keyingi]` (soxta baza shunga tayanadi)
  - `azolarKunlari(db, companyId: number, studentIds: number[], bugun: string): Promise<AzoKunlari[]>` — `[companyId, ...studentIds, bugun(guruh ichida emas, FILTER), boshi, bugun]`; aniq tartib kodga qarang

- [ ] **Step 1: SQL faylini yozish**

`server/src/daf/ustoz/musobaqa-ustoz.sql.ts`:

```ts
import { Prisma } from '@prisma/client';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { KUN_OYNASI } from './musobaqa-ustoz-qoidalari';
import type { AzoBalli, AzoKunlari } from './musobaqa-ustoz.types';

type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Tanlangan hafta ballari, har a'zo uchun (spec S5 §3, §5 so'rov 2). Guruh bali
 * S3 guruhlar jadvali bilan BIR XIL qoida (`groupKey = groupId`), jami ball —
 * barcha guruhlar. Qatori yo'q o'quvchi javobda yo'q (qoidalar nol qo'yadi).
 * `studentIds` bo'sh bo'lmasligi chaqiruvchining ishi. Bog'langan qiymatlar
 * tartibi `[groupId, companyId, ...studentIds, haftaBoshi, keyingi]`.
 */
export function azolarBallari(
  db: Db,
  companyId: number,
  groupId: string,
  studentIds: number[],
  haftaBoshi: string,
): Promise<AzoBalli[]> {
  const keyingi = addDaysToDateStr(haftaBoshi, 7);
  return db.$queryRaw<AzoBalli[]>(Prisma.sql`/* musobaqa-ustoz-ballar */
    SELECT x."studentId",
           COALESCE(SUM(x.points) FILTER (WHERE x."groupKey" = ${groupId}), 0)::int AS "guruhBali",
           COALESCE(SUM(x.points), 0)::int AS "jamiBall",
           (COUNT(DISTINCT x.day) FILTER (WHERE x.attempts > 0))::int AS "faolKunlar"
    FROM "DafStudentDay" x
    WHERE x."companyId" = ${companyId}
      AND x."studentId" IN (${Prisma.join(studentIds)})
      AND x.day >= ${haftaBoshi}::date AND x.day < ${keyingi}::date
    GROUP BY x."studentId"`);
}

/**
 * Seriya va «oxirgi mashq» uchun kunlar (oxirgi `KUN_OYNASI` kun) va bugungi
 * ball. `attempts > 0` kunlar `fortschritt`dagi `tage` bilan bir xil manba.
 * Bog'langan qiymatlar tartibi `[bugun, companyId, ...studentIds, boshi, bugun]`.
 */
export function azolarKunlari(
  db: Db,
  companyId: number,
  studentIds: number[],
  bugun: string,
): Promise<AzoKunlari[]> {
  const boshi = addDaysToDateStr(bugun, -KUN_OYNASI);
  return db.$queryRaw<AzoKunlari[]>(Prisma.sql`/* musobaqa-ustoz-kunlar */
    SELECT x."studentId",
           COALESCE(
             ARRAY_AGG(DISTINCT to_char(x.day, 'YYYY-MM-DD')) FILTER (WHERE x.attempts > 0),
             ARRAY[]::text[]
           ) AS tage,
           COALESCE(SUM(x.points) FILTER (WHERE x.day = ${bugun}::date), 0)::int AS "bugunBali"
    FROM "DafStudentDay" x
    WHERE x."companyId" = ${companyId}
      AND x."studentId" IN (${Prisma.join(studentIds)})
      AND x.day >= ${boshi}::date AND x.day <= ${bugun}::date
    GROUP BY x."studentId"`);
}
```

- [ ] **Step 2: Haqiqiy Postgres'da tekshirish (vaqtinchalik skript)**

Lokal `daf_s1_yuklama` bazasi kerak (`scripts/load/local-db-guard.ts`, `reference_throwaway_local_db` xotira fayli: `/Users/a1111/.claude/projects/-Users-a1111-Desktop-daf-erp-system/memory/reference_throwaway_local_db.md`). Baza yo'q yoki bo'sh bo'lsa — BLOCKED deb xabar ber (yaratma).

`server/scripts/_probe-ustoz-sql.ts`:

```ts
import { run } from './lib/check-cli';
import { assertLocalDb } from './load/local-db-guard';
import { azolarBallari, azolarKunlari } from '../src/daf/ustoz/musobaqa-ustoz.sql';
import { tashkentDateStr } from '../src/common/date/tashkent';
import { wochenStartTag } from '../src/daf/uebung/punkte';

assertLocalDb();

run(async (prisma) => {
  const g = await prisma.enrollment.findFirst({
    where: { status: 'ACTIVE' },
    select: { groupId: true, group: { select: { companyId: true } } },
  });
  if (!g) throw new Error('baza bo‘sh');
  const az = await prisma.enrollment.findMany({
    where: { groupId: g.groupId, status: 'ACTIVE' },
    distinct: ['studentId'],
    select: { studentId: true },
  });
  const ids = az.map((a) => a.studentId);
  const jetzt = new Date();
  const hafta = wochenStartTag(jetzt);
  const [b, k] = await Promise.all([
    azolarBallari(prisma, g.group.companyId, g.groupId, ids, hafta),
    azolarKunlari(prisma, g.group.companyId, ids, tashkentDateStr(jetzt)),
  ]);
  console.log('a‘zolar', ids.length, 'ballar', b.slice(0, 3), 'kunlar', k.slice(0, 2));
  if (!k.every((r) => Array.isArray(r.tage))) throw new Error('tage massiv emas');
});
```

Run: `cd server && npx tsx scripts/_probe-ustoz-sql.ts` (lokal `.env` bazasiga qarab; `run` pattern uchun `scripts/lib/check-cli.ts` ni o'qi).
Expected: xatosiz; `tage` — satr massivi; sonlar `number`. Keyin fayl O'CHIRILADI (`rm server/scripts/_probe-ustoz-sql.ts`).

- [ ] **Step 3: Format, lint, commit**

```bash
cd server && npx prettier --write src/daf/ustoz && npx eslint --quiet src/daf/ustoz && npm run build && cd ..
git add server/src/daf/ustoz
git commit -m "feat(daf): S5 teacher view — member points and days SQL

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`git status` da `_probe-ustoz-sql.ts` yo'qligini tekshir.)

---

### Task 3: Yig'uvchi servis

**Files:**
- Create: `server/src/daf/ustoz/musobaqa-ustoz.service.ts`
- Test: `server/src/daf/ustoz/musobaqa-ustoz.service.spec.ts`

**Interfaces:**
- Consumes: Task 1–2 funksiyalari; S3 `guruhlarYigindisi` (`../liga/guruhlar-jadvali`), `guruhlarniSarala`, `bahoKorinishi`, `GURUH_MIN_AZO` (`../liga/liga-qoidalari`); `reytingIsmi`; `PrismaService`.
- Produces: `@Injectable() class MusobaqaUstozService { constructor(prisma: PrismaService); guruhKorinishi(groupId: string, companyId: number, haftaParam: string | undefined, jetzt: Date): Promise<MusobaqaJavob> }`. Noto'g'ri hafta → `BadRequestException("Hafta noto'g'ri: joriy hafta yoki oldingi 8 hafta dushanbasi tanlanadi")`.

- [ ] **Step 1: Failing test**

`server/src/daf/ustoz/musobaqa-ustoz.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { MusobaqaUstozService } from './musobaqa-ustoz.service';

// 2026-10-21 (chorshanba) 10:00 Toshkent → joriy hafta dushanbasi 2026-10-19.
const JETZT = new Date('2026-10-21T05:00:00Z');
const G = 'g1';

function yasa(
  o: {
    azolar?: unknown[];
    ballar?: unknown[];
    kunlar?: unknown[];
    guruhlar?: unknown[];
    haftaQatori?: unknown;
    haftaSoni?: number;
    tarixQatorlari?: unknown[];
  } = {},
) {
  const prisma = {
    enrollment: { findMany: jest.fn().mockResolvedValue(o.azolar ?? []) },
    dafGroupWeek: {
      findFirst: jest.fn().mockResolvedValue(o.haftaQatori ?? null),
      count: jest.fn().mockResolvedValue(o.haftaSoni ?? 0),
      findMany: jest.fn().mockResolvedValue(o.tarixQatorlari ?? []),
    },
    $queryRaw: jest.fn(async (q: { strings: readonly string[] }) => {
      const t = q.strings[0];
      if (t.includes('musobaqa-ustoz-ballar')) return o.ballar ?? [];
      if (t.includes('musobaqa-ustoz-kunlar')) return o.kunlar ?? [];
      if (t.includes('guruhlar-yigindisi')) return o.guruhlar ?? [];
      return [];
    }),
  };
  return { prisma, servis: new MusobaqaUstozService(prisma as never) };
}

const azo = (id: number, f: string, l: string, tier = 0) => ({
  student: {
    id,
    firstName: f,
    lastName: l,
    user: { id: id * 10 },
    dafLeague: { tier },
    dafSetting: null,
    _count: { dafBadges: 2 },
  },
});

describe('MusobaqaUstozService.guruhKorinishi', () => {
  it('joriy hafta: o‘rin S3 jadvalidan, jadvalga kirgan guruh', async () => {
    const { servis } = yasa({
      azolar: [azo(1, 'Vali', 'Aliyev'), azo(2, 'Anvar', 'Karimov')],
      ballar: [{ studentId: 1, guruhBali: 60, jamiBall: 60, faolKunlar: 2 }],
      kunlar: [{ studentId: 1, tage: ['2026-10-20', '2026-10-21'], bugunBali: 20 }],
      guruhlar: [
        { groupId: G, name: 'A1', azolar: 4, ball: 200 }, // baho 50
        { groupId: 'g2', name: 'B', azolar: 3, ball: 300 }, // baho 100 → 1-o‘rin
        { groupId: 'g3', name: 'C', azolar: 2, ball: 999 }, // 3 dan kam — jadvalda yo‘q
      ],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r).toMatchObject({
      bugun: '2026-10-21',
      haftaBoshi: '2026-10-19',
      joriy: true,
    });
    expect(r.haftalar).toHaveLength(9);
    expect(r.guruh).toEqual({
      holat: 'JADVALDA',
      orin: 2,
      guruhSoni: 2,
      baho: 50,
      azolar: 4,
      ball: 200,
      minAzolar: 3,
    });
    expect(r.oquvchilar[0]).toMatchObject({
      studentId: 1,
      ism: 'Vali Aliyev',
      akkaunt: true,
      seriya: 2,
      bugunBali: 20,
      maqsadBali: 80,
      nishonlar: 2,
      liga: 'Bronza',
    });
  });

  it('3 dan kam a‘zo: KAM_AZO, o‘rin yo‘q', async () => {
    const { servis } = yasa({
      guruhlar: [{ groupId: G, name: 'A1', azolar: 2, ball: 40 }],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.guruh).toMatchObject({
      holat: 'KAM_AZO',
      orin: null,
      guruhSoni: 0,
      baho: 20,
      azolar: 2,
      ball: 40,
    });
  });

  it('faol bo‘lmagan guruh (S3 qatorida yo‘q): FAOL_EMAS', async () => {
    const { servis } = yasa({ guruhlar: [] });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.guruh).toMatchObject({ holat: 'FAOL_EMAS', orin: null, azolar: 0 });
  });

  it('o‘tgan hafta: DafGroupWeek qatoridan, seriya/maqsad null', async () => {
    const { servis, prisma } = yasa({
      azolar: [azo(1, 'Vali', 'Aliyev')],
      ballar: [{ studentId: 1, guruhBali: 5, jamiBall: 5, faolKunlar: 1 }],
      kunlar: [{ studentId: 1, tage: ['2026-10-14'], bugunBali: 0 }],
      haftaQatori: { place: 4, average: 12.34, members: 5, points: 62 },
      haftaSoni: 30,
    });
    const r = await servis.guruhKorinishi(G, 1, '2026-10-12', JETZT);
    expect(r.joriy).toBe(false);
    expect(r.guruh).toEqual({
      holat: 'JADVALDA',
      orin: 4,
      guruhSoni: 30,
      baho: 12.3,
      azolar: 5,
      ball: 62,
      minAzolar: 3,
    });
    expect(r.oquvchilar[0]).toMatchObject({
      seriya: null,
      bugunBali: null,
      maqsadBali: null,
    });
    // S3 markaz so'rovi o'tgan hafta uchun CHAQIRILMAYDI
    const tegs = prisma.$queryRaw.mock.calls.map(
      (c: [{ strings: readonly string[] }]) => c[0].strings[0],
    );
    expect(tegs.some((t: string) => t.includes('guruhlar-yigindisi'))).toBe(false);
  });

  it('o‘tgan hafta, qator yo‘q: YOZUV_YOQ', async () => {
    const { servis } = yasa({});
    const r = await servis.guruhKorinishi(G, 1, '2026-10-12', JETZT);
    expect(r.guruh).toMatchObject({ holat: 'YOZUV_YOQ', orin: null, baho: null });
  });

  it('tarix: 8 hafta, qatori yo‘q hafta null', async () => {
    const { servis } = yasa({
      tarixQatorlari: [
        { weekStart: new Date('2026-10-12T00:00:00Z'), place: 7, average: 33.33 },
      ],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.tarix).toHaveLength(8);
    expect(r.tarix[0]).toEqual({ haftaBoshi: '2026-10-12', orin: 7, baho: 33.3 });
    expect(r.tarix[1]).toEqual({ haftaBoshi: '2026-10-05', orin: null, baho: null });
  });

  it('a‘zosiz guruh: SQL chaqirilmaydi (bo‘sh IN)', async () => {
    const { servis, prisma } = yasa({
      guruhlar: [{ groupId: G, name: 'A1', azolar: 0, ball: 0 }],
    });
    const r = await servis.guruhKorinishi(G, 1, undefined, JETZT);
    expect(r.oquvchilar).toEqual([]);
    const tegs = prisma.$queryRaw.mock.calls.map(
      (c: [{ strings: readonly string[] }]) => c[0].strings[0],
    );
    expect(tegs.some((t: string) => t.includes('musobaqa-ustoz'))).toBe(false);
  });

  it('noto‘g‘ri hafta: 400', async () => {
    const { servis } = yasa({});
    await expect(
      servis.guruhKorinishi(G, 1, '2026-10-20', JETZT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a‘zolar so‘rovi kompaniya bilan cheklangan', async () => {
    const { servis, prisma } = yasa({ guruhlar: [] });
    await servis.guruhKorinishi(G, 7, undefined, JETZT);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: G, status: 'ACTIVE', group: { companyId: 7 } },
      }),
    );
  });
});
```

(Soxta bazada `guruhlarYigindisi` natijasi tegishli `Prisma.sql` obyektining `strings[0]` ida `/* guruhlar-yigindisi */` izohi bilan aniqlanadi — S3 SQL shu izohdan boshlanadi.)

- [ ] **Step 2: Run to verify fail**

Run: `npx jest src/daf/ustoz/musobaqa-ustoz.service.spec.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 3: Implement**

`server/src/daf/ustoz/musobaqa-ustoz.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { wochenStartTag } from '../uebung/punkte';
import { reytingIsmi } from '../shared/reyting-ismi';
import { guruhlarYigindisi } from '../liga/guruhlar-jadvali';
import {
  GURUH_MIN_AZO,
  bahoKorinishi,
  guruhlarniSarala,
} from '../liga/liga-qoidalari';
import {
  haftalarRoyxati,
  haftaniTanla,
  oquvchiQatorlari,
} from './musobaqa-ustoz-qoidalari';
import { azolarBallari, azolarKunlari } from './musobaqa-ustoz.sql';
import type {
  AzoMalumoti,
  MusobaqaGuruh,
  MusobaqaJavob,
  MusobaqaTarixQatori,
} from './musobaqa-ustoz.types';

/** `@db.Date` yarim tun (UTC) qiymatini `YYYY-MM-DD` ga — bu «hozir» emas, sana ustuni. */
const sanaMatni = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Guruh sahifasidagi «Musobaqa» tabi (spec S5). FAQAT O'QIYDI. Huquqni
 * kontroller (`assertCallerMayTouchGroup`) hal qiladi; bu yerda `companyId`
 * a'zolar so'rovida ham qo'llanadi.
 */
@Injectable()
export class MusobaqaUstozService {
  constructor(private readonly prisma: PrismaService) {}

  async guruhKorinishi(
    groupId: string,
    companyId: number,
    haftaParam: string | undefined,
    jetzt: Date,
  ): Promise<MusobaqaJavob> {
    const bugun = tashkentDateStr(jetzt);
    const joriyHafta = wochenStartTag(jetzt);
    const hafta = haftaniTanla(haftaParam, joriyHafta);
    if (hafta === null) {
      throw new BadRequestException(
        "Hafta noto'g'ri: joriy hafta yoki oldingi 8 hafta dushanbasi tanlanadi",
      );
    }
    const joriy = hafta === joriyHafta;
    const haftalar = haftalarRoyxati(joriyHafta);

    const azolar = await this.azolar(groupId, companyId);
    const ids = azolar.map((a) => a.studentId);
    const [ballar, kunlar, guruh, tarix] = await Promise.all([
      ids.length
        ? azolarBallari(this.prisma, companyId, groupId, ids, hafta)
        : [],
      ids.length ? azolarKunlari(this.prisma, companyId, ids, bugun) : [],
      joriy
        ? this.joriyKarta(groupId, companyId, hafta)
        : this.otganKarta(groupId, companyId, hafta),
      this.tarix(groupId, companyId, haftalar.slice(1)),
    ]);
    return {
      bugun,
      haftaBoshi: hafta,
      joriy,
      haftalar,
      guruh,
      tarix,
      oquvchilar: oquvchiQatorlari({ azolar, ballar, kunlar, joriy, bugun }),
    };
  }

  /** S3 `guruhlarYigindisi` a'zolari bilan bir xil to'plam: ACTIVE yozilish, takrorsiz. */
  private async azolar(
    groupId: string,
    companyId: number,
  ): Promise<AzoMalumoti[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE', group: { companyId } },
      distinct: ['studentId'],
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            user: { select: { id: true } },
            dafLeague: { select: { tier: true } },
            dafSetting: { select: { dailyGoal: true } },
            _count: { select: { dafBadges: true } },
          },
        },
      },
    });
    return rows.map(({ student: s }) => ({
      studentId: s.id,
      ism: reytingIsmi(s),
      akkaunt: s.user !== null,
      tier: s.dafLeague?.tier ?? 0,
      dailyGoal: s.dafSetting?.dailyGoal ?? null,
      nishonlar: s._count.dafBadges,
    }));
  }

  /** Jonli: markaz bo'yicha hamma faol guruh (31 ms) — o'rin S3 jadvali bilan bir manbadan. */
  private async joriyKarta(
    groupId: string,
    companyId: number,
    hafta: string,
  ): Promise<MusobaqaGuruh> {
    const rows = await guruhlarYigindisi(this.prisma, companyId, hafta);
    const oz = rows.find((r) => r.groupId === groupId);
    if (!oz) {
      return {
        holat: 'FAOL_EMAS',
        orin: null,
        guruhSoni: null,
        baho: null,
        azolar: 0,
        ball: 0,
        minAzolar: GURUH_MIN_AZO,
      };
    }
    const jadval = guruhlarniSarala(rows);
    const orin = jadval.find((g) => g.groupId === groupId)?.place ?? null;
    return {
      holat: orin === null ? 'KAM_AZO' : 'JADVALDA',
      orin,
      guruhSoni: jadval.length,
      baho: oz.azolar > 0 ? bahoKorinishi(oz.ball / oz.azolar) : null,
      azolar: oz.azolar,
      ball: oz.ball,
      minAzolar: GURUH_MIN_AZO,
    };
  }

  private async otganKarta(
    groupId: string,
    companyId: number,
    hafta: string,
  ): Promise<MusobaqaGuruh> {
    const weekStart = utcMidnightFromDateStr(hafta);
    const [qator, soni] = await Promise.all([
      this.prisma.dafGroupWeek.findFirst({
        where: { companyId, groupId, weekStart },
        select: { place: true, average: true, members: true, points: true },
      }),
      this.prisma.dafGroupWeek.count({ where: { companyId, weekStart } }),
    ]);
    if (!qator) {
      return {
        holat: 'YOZUV_YOQ',
        orin: null,
        guruhSoni: null,
        baho: null,
        azolar: 0,
        ball: 0,
        minAzolar: GURUH_MIN_AZO,
      };
    }
    return {
      holat: 'JADVALDA',
      orin: qator.place,
      guruhSoni: soni,
      baho: bahoKorinishi(qator.average),
      azolar: qator.members,
      ball: qator.points,
      minAzolar: GURUH_MIN_AZO,
    };
  }

  private async tarix(
    groupId: string,
    companyId: number,
    haftalar: string[],
  ): Promise<MusobaqaTarixQatori[]> {
    const rows = await this.prisma.dafGroupWeek.findMany({
      where: {
        companyId,
        groupId,
        weekStart: { in: haftalar.map((h) => utcMidnightFromDateStr(h)) },
      },
      select: { weekStart: true, place: true, average: true },
    });
    const byWeek = new Map(rows.map((r) => [sanaMatni(r.weekStart), r]));
    return haftalar.map((h) => {
      const r = byWeek.get(h);
      return {
        haftaBoshi: h,
        orin: r?.place ?? null,
        baho: r ? bahoKorinishi(r.average) : null,
      };
    });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/daf/ustoz`
Expected: PASS (Task 1 + 3 spec'lari).

- [ ] **Step 5: Format, lint, typecheck, commit**

```bash
cd server && npx prettier --write src/daf/ustoz && npx eslint --quiet src/daf/ustoz && npm run build && cd ..
git add server/src/daf/ustoz
git commit -m "feat(daf): S5 teacher view — group competition service

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kontroller, DTO, modul, manifest, faqat-o'qish qorovuli

**Files:**
- Create: `server/src/daf/dto/musobaqa-query.dto.ts`, `server/src/daf/dto/musobaqa-query.dto.spec.ts`
- Create: `server/src/daf/ustoz/musobaqa-ustoz.controller.ts`, `server/src/daf/ustoz/musobaqa-ustoz.controller.spec.ts`
- Create: `server/src/daf/ustoz/musobaqa-ustoz.read-only.spec.ts`
- Modify: `server/src/daf/daf.module.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (ilova faolligi bandi, ~574-576)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (alifbo tartibida, `"GET /groups/:id/delete-preview"` dan keyin yoki `musobaqa`ga mos joyga)

**Interfaces:**
- Consumes: `MusobaqaUstozService.guruhKorinishi`; `assertCallerMayTouchGroup`; `@Can`, `@CurrentUser`.
- Produces: `GET /groups/:id/musobaqa?hafta=YYYY-MM-DD`.

- [ ] **Step 1: DTO va uning testi**

Mavjud `server/src/daf/dto/` ichidagi DTO spec uslubini ko'r (masalan `eslatmalar.dto.spec.ts`) va shu uslubda yoz.

`server/src/daf/dto/musobaqa-query.dto.ts`:

```ts
import { IsOptional, Matches } from 'class-validator';

export class MusobaqaQueryDto {
  /** Dushanba `YYYY-MM-DD`; yo'q = joriy hafta. Chegarani servis tekshiradi. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "hafta YYYY-MM-DD ko'rinishida bo'lishi kerak",
  })
  hafta?: string;
}
```

Test: `validate(plainToInstance(MusobaqaQueryDto, { hafta: '2026-10-19' }))` → 0 xato; `{}` → 0 xato; `{ hafta: '19.10.2026' }` → 1 xato; `{ hafta: '2026-10-19; DROP' }` → 1 xato. (Test uslubi: yaqin DTO spec'dagi `validate` importlariga qarab.)

- [ ] **Step 2: Kontroller testi (failing)**

`server/src/daf/ustoz/musobaqa-ustoz.controller.spec.ts` (`group-app-activity.controller.spec.ts` shaklida):

```ts
import { ForbiddenException } from '@nestjs/common';
import * as groupScope from '../../common/auth/group-branch-scope';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { MusobaqaUstozController } from './musobaqa-ustoz.controller';

jest.mock('../../common/auth/group-branch-scope');

describe('MusobaqaUstozController', () => {
  const prisma = {};
  const servis = {
    guruhKorinishi: jest.fn().mockResolvedValue({ ok: 1 }),
  };
  const controller = new MusobaqaUstozController(prisma as never, servis as never);

  beforeEach(() => jest.clearAllMocks());

  it('groups.view qobiliyati, standart rollar CEO, Branch Director, Administrator, Teacher', () => {
    expect(routeAccess(MusobaqaUstozController, 'guruh')).toEqual({
      kind: 'can',
      keys: ['groups.view'],
    });
    expect(defaultRolesOf(MusobaqaUstozController, 'guruh')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Teacher',
    ]);
  });

  it('qorovul chaqiriladi, keyin servis; hafta uzatiladi', async () => {
    const res = await controller.guruh('g1', { hafta: '2026-10-12' }, 5, ['Teacher'], 1);
    expect(groupScope.assertCallerMayTouchGroup).toHaveBeenCalledWith(
      prisma,
      5,
      ['Teacher'],
      'g1',
      expect.any(String),
    );
    expect(servis.guruhKorinishi).toHaveBeenCalledWith(
      'g1',
      1,
      '2026-10-12',
      expect.any(Date),
    );
    expect(res).toEqual({ ok: 1 });
  });

  it('qorovul rad etsa servis chaqirilmaydi', async () => {
    (groupScope.assertCallerMayTouchGroup as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException('rad'),
    );
    await expect(controller.guruh('g1', {}, 5, ['Teacher'], 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(servis.guruhKorinishi).not.toHaveBeenCalled();
  });
});
```

Run: `npx jest src/daf/ustoz/musobaqa-ustoz.controller.spec.ts` → FAIL (modul yo'q).

- [ ] **Step 3: Kontrollerni yozish**

`server/src/daf/ustoz/musobaqa-ustoz.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { assertCallerMayTouchGroup } from '../../common/auth/group-branch-scope';
import { CurrentUser } from '../../common/decorators';
import { Can } from '../../common/permissions/access.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { MusobaqaQueryDto } from '../dto/musobaqa-query.dto';
import { MusobaqaUstozService } from './musobaqa-ustoz.service';

const RAD_XABARI =
  "Bu guruh boshqa filialga tegishli — musobaqa natijalarini ko'rish huquqingiz yo'q";

/**
 * Guruh sahifasi → «Musobaqa» tabi (spec S5). Sof ustoz faqat o'z guruhini,
 * qolganlar o'z filialini ko'radi (`assertCallerMayTouchGroup`). Hech narsa
 * yozmaydi.
 */
@Controller('groups')
export class MusobaqaUstozController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servis: MusobaqaUstozService,
  ) {}

  @Get(':id/musobaqa')
  @Can('groups.view')
  async guruh(
    @Param('id') id: string,
    @Query() query: MusobaqaQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchGroup(this.prisma, userId, roles, id, RAD_XABARI);
    return this.servis.guruhKorinishi(id, companyId, query.hafta, new Date());
  }
}
```

- [ ] **Step 4: Modul, manifest, surat**

`server/src/daf/daf.module.ts`: importlarga `MusobaqaUstozController` va `MusobaqaUstozService` qo'shing; `controllers: [DafPortalController, DafMediaController, MusobaqaUstozController]`; `providers`ga `MusobaqaUstozService`.

`server/src/common/auth/branch-route-policy.ts`: ilova faolligi bandining `routes` ro'yxatiga `'GET /groups/:id/musobaqa',` qo'shing va shu bandning `reason` matniga gap qo'shing: `" «Musobaqa» tabi (S5, ADR-0118) shu qorovulni qayta ishlatadi."`

`server/src/common/permissions/route-access.snapshot.json`: `"GET /groups/:id/musobaqa": ["Administrator", "Branch Director", "CEO", "Teacher"]` — fayldagi mavjud yozuvlarning formatida (har rol alohida qatorda) va alifbo tartibida joyga qo'ying. Skriptni QAYTA ISHGA TUSHIRMANG (`--force` taqiqlangan; fayl qo'lda to'ldiriladi — S4 `8b9e31ce` shunday qilgan).

- [ ] **Step 5: Faqat-o'qish qorovuli**

`server/src/daf/ustoz/musobaqa-ustoz.read-only.spec.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * S5 ustoz ko'rinishi hech narsa YOZMAYDI (spec S5 §1, ADR-0118). Bu papkaga
 * yozuvchi chaqiruv kirib qolsa test yiqiladi.
 */
const YOZUVCHI =
  /\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(|\$executeRaw|\bINSERT\b|\bUPDATE\b|\bDELETE\b/;

describe('S5 ustoz ko‘rinishi faqat o‘qiydi', () => {
  const papka = __dirname;
  const fayllar = readdirSync(papka).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  );
  it('papkada kamida servis, sql, qoidalar va kontroller bor', () => {
    expect(fayllar.length).toBeGreaterThanOrEqual(5);
  });
  it.each(fayllar)('%s yozuvchi chaqiruv yo‘q', (f) => {
    const src = readFileSync(join(papka, f), 'utf8')
      // izohlarni olib tashla: izohdagi so'z yolg'on signal bermasin
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(YOZUVCHI);
  });
});
```

(Fayllar soni: types, qoidalari, sql, service, controller = 5.)

- [ ] **Step 6: Hammasini yurgizish**

```bash
cd server && npx prettier --write src/daf/ustoz src/daf/dto src/daf/daf.module.ts src/common/auth/branch-route-policy.ts
npx eslint --quiet src/daf src/common/auth/branch-route-policy.ts
npx jest src/daf/ustoz src/daf/dto src/common/auth src/common/permissions
npm run build
```
Expected: hammasi PASS (`branch-route-policy.spec`, `permission-routes.spec` ham — yangi marshrut manifest va suratda bor).

- [ ] **Step 7: Commit**

```bash
cd .. && git add server/src
git commit -m "feat(daf): S5 teacher view — GET /groups/:id/musobaqa behind the group guard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Parity va yuklama (haqiqiy Postgres)

**Files:**
- Create: `server/scripts/load/daf-yuklama-s5-ustoz.ts`
- Modify: `docs/superpowers/specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md` (§11 to'ldiriladi)

**Interfaces:** Consumes `MusobaqaUstozService`, `guruhlarYigindisi`, `guruhlarniSarala`, `serieAus`. Lokal `daf_s1_yuklama` bazasi (12 000 o'quvchi, 520 guruh; S1–S4 yuklama sinovlaridan qolgan). Bazada ma'lumot yo'q bo'lsa — `scripts/load/daf-yuklama-seed.ts` boshidagi izohlarga qarab tiklash yo'li bor; tiklab bo'lmasa BLOCKED deb xabar ber.

- [ ] **Step 1: Skriptni yozish**

`server/scripts/load/daf-yuklama-s5-ustoz.ts` (naqsh — `daf-yuklama-s4-paritet.ts` va `daf-yuklama-s4-olchov.ts`; `run`, `assertLocalDb`, `pct`):

```ts
/**
 * LOCAL ONLY. S5 teacher view (spec S5 §7): parity of `MusobaqaUstozService`
 * against a brute force over `DafStudentDay`/`Enrollment` for up to 200
 * groups (current week and last week), and `guruh.ball` against the S3
 * `guruhlarYigindisi`; then 50 parallel requests × ROUNDS over random groups:
 * p50 / p95 (limit 200 ms). Exit 1 on any difference or when the limit is
 * crossed. Sends nothing anywhere.
 */
import { loadavg } from 'os';
import { run } from '../lib/check-cli';
import { assertLocalDb } from './local-db-guard';
import { tashkentDateStr } from '../../src/common/date/tashkent';
import { addDaysToDateStr } from '../../src/attendance/shared/date-utils';
import { serieAus, wochenStartTag } from '../../src/daf/uebung/punkte';
import { guruhlarYigindisi } from '../../src/daf/liga/guruhlar-jadvali';
import { MusobaqaUstozService } from '../../src/daf/ustoz/musobaqa-ustoz.service';

assertLocalDb();

const NAMUNA = 200;
const PARALLEL = 50;
const ROUNDS = 10;
const CHEGARA_MS = 200;
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

run(async (prisma) => {
  const db = prisma as any;
  const servis = new MusobaqaUstozService(prisma as never);
  const jetzt = new Date();
  const bugun = tashkentDateStr(jetzt);
  const joriy = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(joriy, -7);
  const xatolar: string[] = [];

  const guruhlar: { groupId: string; companyId: number }[] =
    await db.$queryRaw`SELECT g.id AS "groupId", g."companyId"
      FROM "Group" g WHERE g."statusEnum" = 'ACTIVE' AND g."deletedAt" IS NULL
      ORDER BY random() LIMIT ${NAMUNA}`;
  if (guruhlar.length === 0) throw new Error('faol guruh yo‘q — baza bo‘sh');

  let tekshirilgan = 0;
  for (const { groupId, companyId } of guruhlar) {
    const s3 = await guruhlarYigindisi(prisma, companyId, joriy);
    const azolar = await prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE' },
      distinct: ['studentId'],
      select: { studentId: true },
    });
    const ids = azolar.map((a) => a.studentId);
    for (const hafta of [joriy, otgan]) {
      const keyingi = addDaysToDateStr(hafta, 7);
      const r = await servis.guruhKorinishi(groupId, companyId, hafta, jetzt);
      const kunlar = ids.length
        ? await prisma.dafStudentDay.findMany({
            where: { studentId: { in: ids }, day: { gte: new Date(`${addDaysToDateStr(bugun, -400)}T00:00:00Z`) } },
            select: { studentId: true, day: true, groupKey: true, points: true, attempts: true },
          })
        : [];
      const kunStr = (d: Date) => d.toISOString().slice(0, 10);
      let jamiGuruh = 0;
      for (const id of ids) {
        const q = r.oquvchilar.find((x) => x.studentId === id);
        if (!q) { xatolar.push(`${groupId}/${hafta}: ${id} qatorda yo‘q`); continue; }
        const mine = kunlar.filter((k) => k.studentId === id);
        const haftada = mine.filter((k) => kunStr(k.day) >= hafta && kunStr(k.day) < keyingi);
        const guruhBali = haftada.filter((k) => k.groupKey === groupId).reduce((s, k) => s + k.points, 0);
        const jami = haftada.reduce((s, k) => s + k.points, 0);
        const faolKun = new Set(haftada.filter((k) => k.attempts > 0).map((k) => kunStr(k.day))).size;
        const tage = [...new Set(mine.filter((k) => k.attempts > 0).map((k) => kunStr(k.day)))];
        jamiGuruh += guruhBali;
        const kutilgan = { guruhBali, jamiBall: jami, faolKunlar: faolKun,
          seriya: hafta === joriy ? serieAus(tage, bugun) : null };
        const bor = { guruhBali: q.guruhBali, jamiBall: q.jamiBall, faolKunlar: q.faolKunlar, seriya: q.seriya };
        if (JSON.stringify(kutilgan) !== JSON.stringify(bor))
          xatolar.push(`${groupId}/${hafta}/${id}: ${JSON.stringify(bor)} ≠ ${JSON.stringify(kutilgan)}`);
      }
      if (r.oquvchilar.length !== ids.length)
        xatolar.push(`${groupId}/${hafta}: a'zolar ${r.oquvchilar.length} ≠ ${ids.length}`);
      if (hafta === joriy) {
        const oz = s3.find((x) => x.groupId === groupId);
        if (oz && oz.ball !== jamiGuruh)
          xatolar.push(`${groupId}: S3 ball ${oz.ball} ≠ a'zolar yig'indisi ${jamiGuruh}`);
        if (oz && oz.ball !== r.guruh.ball)
          xatolar.push(`${groupId}: karta ball ${r.guruh.ball} ≠ S3 ${oz.ball}`);
      }
      tekshirilgan++;
    }
  }

  // --- yuklama: 50 parallel × ROUNDS ---
  const t0load = loadavg()[0];
  const vaqtlar: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        const g = guruhlar[Math.floor(Math.random() * guruhlar.length)];
        const t = performance.now();
        await servis.guruhKorinishi(g.groupId, g.companyId, undefined, new Date());
        vaqtlar.push(performance.now() - t);
      }),
    );
  }
  const p50 = pct(vaqtlar, 50);
  const p95 = pct(vaqtlar, 95);
  console.log(`parity: ${tekshirilgan} guruh-hafta, farq ${xatolar.length}`);
  console.log(`yuklama: p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (limit ${CHEGARA_MS}), loadavg ${t0load.toFixed(1)}`);
  if (xatolar.length) { console.error(xatolar.slice(0, 20).join('\n')); process.exit(1); }
  if (p95 > CHEGARA_MS) { console.error('p95 chegaradan oshdi'); process.exit(1); }
});
```

(Skriptdagi aniq import yo'llari va `run` imzosi `daf-yuklama-s4-paritet.ts` bilan bir xil bo'lishi kerak — tafovut bo'lsa o'sha fayldagiga moslang. Test ma'lumoti sifatida o'tgan hafta `DafGroupWeek` qatorlari yoki bo'lmasligi mumkin: parity faqat o'quvchi darajasini tekshiradi; karta o'tgan haftada tekshirilmaydi.)

- [ ] **Step 2: Yurgizish (ikki marta: tinch va band mashina)**

Run: `cd server && npx tsx scripts/load/daf-yuklama-s5-ustoz.ts` (tinch), keyin bir vaqtda og'ir jarayon bilan (`loadavg` ≥ 8) yana bir marta.
Expected: `farq 0`, `p95 < 200 ms` ikkalasida. Farq chiqsa — ISH TO'XTAYDI: sababni top (SQL yoki qoida), tuzat, qayta yur; chegaradan oshsa — BLOCKED deb xabar ber.

- [ ] **Step 3: Spec §11 ni to'ldirish**

`docs/superpowers/specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md` §11 «(Bajarilgach to'ldiriladi.)» o'rniga haqiqiy raqamlar: tekshirilgan guruh-hafta soni, farq, p50/p95 (tinch va band), `loadavg`.

- [ ] **Step 4: Format, commit**

```bash
cd server && npx prettier --write scripts/load/daf-yuklama-s5-ustoz.ts && npx eslint --quiet scripts/load/daf-yuklama-s5-ustoz.ts; cd ..
git add server/scripts/load/daf-yuklama-s5-ustoz.ts docs/superpowers/specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md
git commit -m "test(daf): S5 teacher view parity and load script, measured numbers in the spec

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mijoz turlari, so'rov va sof formatlar

**Files:**
- Create: `client/src/components/groups/musobaqa/types.ts`
- Create: `client/src/components/groups/musobaqa/use-musobaqa.ts`
- Create: `client/src/components/groups/musobaqa/musobaqa-format.ts`
- Test: `client/src/components/groups/musobaqa/musobaqa-format.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: Task 1 dagi `GuruhHolati`, `MusobaqaGuruh`, `MusobaqaTarixQatori`, `MusobaqaOquvchi`, `MusobaqaJavob` ning aynan nusxasi (`export type`/`interface`, server fayliga izoh havolasi).
  - `use-musobaqa.ts`: `useMusobaqa(groupId: string, hafta: string | null): UseQueryResult<MusobaqaJavob>`
  - `musobaqa-format.ts`:
    - `haftaYorligi(haftaBoshi: string): string` → `"13.10 – 19.10"`
    - `kunFarqi(sana: string, bugun: string): number` (kunlar, `bugun - sana`)
    - `oxirgiMashqMatni(sana: string | null, bugun: string, t?: Translate): string` → `"hech qachon"` / `"bugun"` / `"kecha"` / `"{n} kun oldin"`
    - `kartaIzohi(g: MusobaqaGuruh, t?: Translate): string | null` — `KAM_AZO`/`FAOL_EMAS`/`YOZUV_YOQ` uchun matn, `JADVALDA` uchun `null`
    - `maqsadFoizi(bugunBali: number | null, maqsadBali: number | null): number | null` (0–100, 100 dan oshmaydi)

- [ ] **Step 1: Failing test**

`client/src/components/groups/musobaqa/musobaqa-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  haftaYorligi,
  kartaIzohi,
  kunFarqi,
  maqsadFoizi,
  oxirgiMashqMatni,
} from "./musobaqa-format";
import type { MusobaqaGuruh } from "./types";

describe("haftaYorligi", () => {
  it("dushanba–yakshanba, kun.oy", () => {
    expect(haftaYorligi("2026-10-19")).toBe("19.10 – 25.10");
  });
  it("oy almashganda", () => {
    expect(haftaYorligi("2026-10-26")).toBe("26.10 – 01.11");
  });
});

describe("kunFarqi", () => {
  it("sanalar satrdan, vaqt mintaqasiga bog'liq emas", () => {
    expect(kunFarqi("2026-10-17", "2026-10-19")).toBe(2);
    expect(kunFarqi("2026-09-30", "2026-10-01")).toBe(1);
  });
});

describe("oxirgiMashqMatni", () => {
  it.each([
    [null, "hech qachon"],
    ["2026-10-21", "bugun"],
    ["2026-10-20", "kecha"],
    ["2026-10-17", "4 kun oldin"],
  ])("%s → %s", (sana, kutilgan) => {
    expect(oxirgiMashqMatni(sana, "2026-10-21")).toBe(kutilgan);
  });
});

describe("kartaIzohi", () => {
  const g = (holat: MusobaqaGuruh["holat"], azolar = 2): MusobaqaGuruh => ({
    holat, orin: null, guruhSoni: null, baho: null, azolar, ball: 0, minAzolar: 3,
  });
  it("jadvalda — izoh yo'q", () => {
    expect(kartaIzohi(g("JADVALDA"))).toBeNull();
  });
  it("kam a'zo", () => {
    expect(kartaIzohi(g("KAM_AZO", 2))).toBe("Jadvalga kirish uchun kamida 3 a'zo kerak (hozir 2)");
  });
  it("faol emas / yozuv yo'q", () => {
    expect(kartaIzohi(g("FAOL_EMAS"))).toBe("Guruh faol emas — musobaqada qatnashmaydi");
    expect(kartaIzohi(g("YOZUV_YOQ"))).toBe("Bu haftada guruh jadvalda bo'lmagan");
  });
});

describe("maqsadFoizi", () => {
  it("0–100, null bo'lsa null", () => {
    expect(maqsadFoizi(40, 80)).toBe(50);
    expect(maqsadFoizi(200, 80)).toBe(100);
    expect(maqsadFoizi(null, 80)).toBeNull();
    expect(maqsadFoizi(10, null)).toBeNull();
    expect(maqsadFoizi(10, 0)).toBeNull();
  });
});
```

Run (`client/` ichidan): `npx vitest run src/components/groups/musobaqa`
Expected: FAIL — modul yo'q.

- [ ] **Step 2: Turlar va hook**

`types.ts`:

```ts
// Server: server/src/daf/ustoz/musobaqa-ustoz.types.ts — maydon nomlari aynan shu.
export type GuruhHolati = "JADVALDA" | "KAM_AZO" | "FAOL_EMAS" | "YOZUV_YOQ";

export interface MusobaqaGuruh {
  holat: GuruhHolati;
  orin: number | null;
  guruhSoni: number | null;
  baho: number | null;
  azolar: number;
  ball: number;
  minAzolar: number;
}

export interface MusobaqaTarixQatori {
  haftaBoshi: string;
  orin: number | null;
  baho: number | null;
}

export interface MusobaqaOquvchi {
  studentId: number;
  ism: string;
  akkaunt: boolean;
  guruhBali: number;
  jamiBall: number;
  faolKunlar: number;
  seriya: number | null;
  bugunBali: number | null;
  maqsadBali: number | null;
  liga: string;
  nishonlar: number;
  oxirgiMashq: string | null;
}

export interface MusobaqaJavob {
  bugun: string;
  haftaBoshi: string;
  joriy: boolean;
  haftalar: string[];
  guruh: MusobaqaGuruh;
  tarix: MusobaqaTarixQatori[];
  oquvchilar: MusobaqaOquvchi[];
}
```

`use-musobaqa.ts`:

```ts
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { MusobaqaJavob } from "./types";

/** `hafta === null` — joriy hafta (serverda standart). Hafta almashganda eski ma'lumot ko'rinib turadi. */
export function useMusobaqa(groupId: string, hafta: string | null) {
  return useQuery<MusobaqaJavob>({
    queryKey: ["group-musobaqa", groupId, hafta],
    queryFn: () =>
      api
        .get<MusobaqaJavob>(`/groups/${groupId}/musobaqa`, { params: hafta ? { hafta } : {} })
        .then((r) => r.data),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 3: Formatlar**

`musobaqa-format.ts`:

```ts
import { interpolate } from "@/i18n/translate";
import { formatKunOy, type Translate } from "../app-activity/activity-format";
import type { MusobaqaGuruh } from "./types";

const SAY_UZBEK: Translate = interpolate;

const KUN_MS = 24 * 60 * 60 * 1000;
const utcKun = (sana: string) => Date.UTC(+sana.slice(0, 4), +sana.slice(5, 7) - 1, +sana.slice(8, 10));

function kunQosh(sana: string, n: number): string {
  const d = new Date(utcKun(sana) + n * KUN_MS);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** `2026-10-19` → `19.10 – 25.10` (dushanba–yakshanba). Satrdan hisoblanadi — brauzer vaqt mintaqasi aralashmaydi. */
export function haftaYorligi(haftaBoshi: string): string {
  return `${formatKunOy(haftaBoshi)} – ${formatKunOy(kunQosh(haftaBoshi, 6))}`;
}

export function kunFarqi(sana: string, bugun: string): number {
  return Math.round((utcKun(bugun) - utcKun(sana)) / KUN_MS);
}

export function oxirgiMashqMatni(sana: string | null, bugun: string, t: Translate = SAY_UZBEK): string {
  if (sana === null) return t("hech qachon");
  const n = kunFarqi(sana, bugun);
  if (n <= 0) return t("bugun");
  if (n === 1) return t("kecha");
  return t("{n} kun oldin", { n });
}

export function kartaIzohi(g: MusobaqaGuruh, t: Translate = SAY_UZBEK): string | null {
  switch (g.holat) {
    case "KAM_AZO":
      return t("Jadvalga kirish uchun kamida {min} a'zo kerak (hozir {n})", { min: g.minAzolar, n: g.azolar });
    case "FAOL_EMAS":
      return t("Guruh faol emas — musobaqada qatnashmaydi");
    case "YOZUV_YOQ":
      return t("Bu haftada guruh jadvalda bo'lmagan");
    default:
      return null;
  }
}

export function maqsadFoizi(bugunBali: number | null, maqsadBali: number | null): number | null {
  if (bugunBali === null || maqsadBali === null || maqsadBali <= 0) return null;
  return Math.min(100, Math.round((bugunBali / maqsadBali) * 100));
}
```

(`formatKunOy` va `Translate` — `app-activity/activity-format.ts` da eksport qilingan; `interpolate` — `@/i18n/translate` dan, xuddi `activity-format.ts` dagidek. `{n}` o'zgaruvchili kalit `interpolate` bilan ishlashini shu fayldagi `formatDavomiylik` namunasidan tekshiring.)

- [ ] **Step 4: Run — pass; tsc; lint; commit**

```bash
cd client && npx vitest run src/components/groups/musobaqa && npx tsc --noEmit -p . && npx eslint src/components/groups/musobaqa; cd ..
git add client/src/components/groups/musobaqa
git commit -m "feat(groups): S5 competition tab — client types, query and pure formats

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Client uchun `prettier` ISHLATILMAYDI.)

---

### Task 7: Ekran va tab

**Files:**
- Create: `client/src/components/groups/musobaqa/group-musobaqa-tab.tsx`
- Create: `client/src/components/groups/musobaqa/guruh-orni-karta.tsx`
- Create: `client/src/components/groups/musobaqa/oquvchilar-jadvali.tsx`
- Create: `client/src/components/groups/musobaqa/mashq-qilmadi.tsx`
- Modify: `client/src/components/groups/group-detail-tabs.tsx`

**Interfaces:**
- Consumes: `useMusobaqa`, formatlar (Task 6); `ActivityError`, `KpiCard` (`../app-activity/activity-ui`); `Skeleton`, `Table*`, `Badge`, `cn`; `useT`.
- Produces: `GroupMusobaqaTab({ groupId }: { groupId: string })`; tab qiymati `"musobaqa"`.

Dizayn qoidalari (spec §6): jadval 390 px da gorizontal aylanadi, ism ustuni sticky; tanlagich — native `<select>` (klaviatura bilan boshqariladi, `<label>` bilan); tarix chiplari `<button>`, balandligi ≥ 44 px; «Mashq qilmadi» matni neytral: sarlavha «Shu hafta mashq qilmaganlar», rang `text-foreground`/`text-muted-foreground` (qizil/tahdid yo'q); maqsad ustuni `ProgressLine` (`../app-activity/activity-ui`); jadval sarlavhalari `scope="col"`; o'tgan haftada «Seriya» va «Bugungi maqsad» ustunlari ko'rsatilmaydi.

- [ ] **Step 1: `guruh-orni-karta.tsx`**

```tsx
"use client";

import { Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiCard } from "../app-activity/activity-ui";
import { useT } from "@/i18n/context";
import { haftaYorligi, kartaIzohi } from "./musobaqa-format";
import type { MusobaqaJavob } from "./types";

export function GuruhOrniKarta({
  data,
  onHafta,
}: {
  data: MusobaqaJavob;
  /** `null` — joriy hafta. */
  onHafta: (hafta: string | null) => void;
}) {
  const t = useT();
  const g = data.guruh;
  const izoh = kartaIzohi(g, t);
  const joriyHafta = data.haftalar[0];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          icon={Trophy}
          label={t("Markazdagi o'rin")}
          value={g.orin !== null && g.guruhSoni !== null ? `${g.orin} / ${g.guruhSoni}` : "—"}
          hint={izoh ?? undefined}
        />
        <KpiCard
          icon={Users}
          label={t("O'rtacha ball")}
          value={g.baho !== null ? String(g.baho) : "—"}
          hint={t("{n} a'zo, jami {ball} ball", { n: g.azolar, ball: g.ball })}
        />
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs">{t("Oxirgi haftalar (o'rin)")}</p>
        <div className="flex gap-2 overflow-x-auto pb-1" role="list">
          {data.tarix.map((q) => {
            const tanlangan = q.haftaBoshi === data.haftaBoshi;
            return (
              <button
                key={q.haftaBoshi}
                type="button"
                role="listitem"
                onClick={() => onHafta(q.haftaBoshi === joriyHafta ? null : q.haftaBoshi)}
                aria-pressed={tanlangan}
                className={cn(
                  "min-h-11 min-w-20 shrink-0 rounded-md border px-3 py-1 text-center text-sm",
                  tanlangan ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                <span className="text-muted-foreground block text-xs">{haftaYorligi(q.haftaBoshi).split(" ")[0]}</span>
                <span className="font-medium">{q.orin !== null ? q.orin : "—"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

(`KpiCard` ning `hint` prop'i `string | undefined` ekanligini `activity-ui.tsx:50` dan tekshiring; boshqacha bo'lsa moslang. `haftaYorligi(...).split(" ")[0]` — chipdagi qisqa yorliq: dushanba `dd.mm`.)

- [ ] **Step 2: `oquvchilar-jadvali.tsx`**

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ProgressLine } from "../app-activity/activity-ui";
import { useT } from "@/i18n/context";
import { maqsadFoizi, oxirgiMashqMatni } from "./musobaqa-format";
import type { MusobaqaJavob } from "./types";

// Sahifalanmaydi: guruh ≤ ~30 o'quvchi, ustoz hammani bir qarashda ko'radi (CLAUDE.md sahifalash qoidasiga ongli istisno).
export function OquvchilarJadvali({ data }: { data: MusobaqaJavob }) {
  const t = useT();
  const joriy = data.joriy;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="bg-background sticky left-0 min-w-44">{t("O'quvchi")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Shu guruh bali")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Jami ball")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Faol kunlar")}</TableHead>
            {joriy && <TableHead scope="col" className="min-w-20 text-right">{t("Seriya")}</TableHead>}
            {joriy && <TableHead scope="col" className="min-w-36">{t("Bugungi maqsad")}</TableHead>}
            <TableHead scope="col" className="min-w-24">{t("Liga")}</TableHead>
            <TableHead scope="col" className="min-w-24 text-right">{t("Nishonlar")}</TableHead>
            <TableHead scope="col" className="min-w-32">{t("Oxirgi mashq")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.oquvchilar.map((q) => {
            const foiz = maqsadFoizi(q.bugunBali, q.maqsadBali);
            return (
              <TableRow key={q.studentId}>
                <TableCell className="bg-background sticky left-0 font-medium">
                  {q.ism}
                  {!q.akkaunt && <span className="text-muted-foreground ml-2 text-xs">{t("Akkaunt yo'q")}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{q.guruhBali}</TableCell>
                <TableCell className={cn("text-right tabular-nums", q.jamiBall === 0 && "text-muted-foreground")}>
                  {q.jamiBall}
                </TableCell>
                <TableCell className="text-right tabular-nums">{q.faolKunlar} / 7</TableCell>
                {joriy && <TableCell className="text-right tabular-nums">{q.seriya ?? "—"}</TableCell>}
                {joriy && (
                  <TableCell>
                    {foiz === null ? (
                      "—"
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs tabular-nums">
                          {q.bugunBali} / {q.maqsadBali}
                        </span>
                        <ProgressLine value={q.bugunBali ?? 0} total={q.maqsadBali ?? 0} />
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell>{q.liga}</TableCell>
                <TableCell className="text-right tabular-nums">{q.nishonlar}</TableCell>
                <TableCell className="text-muted-foreground">{oxirgiMashqMatni(q.oxirgiMashq, data.bugun, t)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

(`TableHead` `scope` prop'ini qabul qilishini tekshiring — shadcn `TableHead` `th` props'ni uzatadi.)

- [ ] **Step 3: `mashq-qilmadi.tsx`**

```tsx
"use client";

import { useT } from "@/i18n/context";
import { oxirgiMashqMatni } from "./musobaqa-format";
import type { MusobaqaJavob } from "./types";

/** Neytral ro'yxat: ustoz o'zi bog'lanishi uchun. Tizim hech kimga xabar yubormaydi, qizil rang va tahdid yo'q. */
export function MashqQilmadi({ data }: { data: MusobaqaJavob }) {
  const t = useT();
  const qilmaganlar = data.oquvchilar.filter((q) => q.jamiBall === 0);
  if (data.oquvchilar.length === 0) return null;
  if (qilmaganlar.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border px-4 py-3 text-sm">
        {t("Hamma shu hafta mashq qildi")}
      </p>
    );
  }
  return (
    <section className="rounded-md border px-4 py-3" aria-labelledby="mashq-qilmadi-sarlavha">
      <h4 id="mashq-qilmadi-sarlavha" className="text-sm font-semibold">
        {t("Shu hafta mashq qilmaganlar")} ({qilmaganlar.length})
      </h4>
      <ul className="mt-2 divide-y">
        {qilmaganlar.map((q) => (
          <li key={q.studentId} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5 text-sm">
            <span>
              {q.ism}
              {!q.akkaunt && <span className="text-muted-foreground ml-2 text-xs">{t("Akkaunt yo'q")}</span>}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("Oxirgi mashq")}: {oxirgiMashqMatni(q.oxirgiMashq, data.bugun, t)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: `group-musobaqa-tab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError } from "../app-activity/activity-ui";
import { useT } from "@/i18n/context";
import { GuruhOrniKarta } from "./guruh-orni-karta";
import { haftaYorligi } from "./musobaqa-format";
import { MashqQilmadi } from "./mashq-qilmadi";
import { OquvchilarJadvali } from "./oquvchilar-jadvali";
import { useMusobaqa } from "./use-musobaqa";

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function GroupMusobaqaTab({ groupId }: { groupId: string }) {
  const t = useT();
  const [hafta, setHafta] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useMusobaqa(groupId, hafta);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("Guruhning musobaqadagi natijasi")}</h3>
          <p className="text-sm text-muted-foreground">{t("Hozirgi a'zolar bo'yicha, hafta dushanbadan yakshanbagacha")}</p>
        </div>
        {data && (
          <div className="flex flex-col gap-1">
            <label htmlFor="musobaqa-hafta" className="text-muted-foreground text-xs">
              {t("Hafta")}
            </label>
            <select
              id="musobaqa-hafta"
              value={data.haftaBoshi}
              onChange={(e) => setHafta(e.target.value === data.haftalar[0] ? null : e.target.value)}
              className="min-h-11 rounded-md border bg-background px-3 text-sm"
            >
              {data.haftalar.map((h, i) => (
                <option key={h} value={h}>
                  {haftaYorligi(h)}
                  {i === 0 ? ` (${t("joriy")})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : (
        <>
          <GuruhOrniKarta data={data} onHafta={setHafta} />
          {data.oquvchilar.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border">
              <p className="text-sm text-muted-foreground">{t("Guruhda faol o'quvchi yo'q")}</p>
            </div>
          ) : (
            <>
              <MashqQilmadi data={data} />
              <OquvchilarJadvali data={data} />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Tabni ulash — `group-detail-tabs.tsx`**

`ilova` tabi qanday ulangan bo'lsa AYNAN shunday `musobaqa` ni qo'shing (`grep -n "ilova" client/src/components/groups/group-detail-tabs.tsx` — 4 joy):
1. `const [musobaqaVisible, setMusobaqaVisible] = useState(false); const musobaqaShown = useRef(false);` (`ilovaVisible` yonida, ~69-70).
2. URL `tab` shoxida (~125): `else if (tab === "musobaqa" && !musobaqaShown.current) { musobaqaShown.current = true; setMusobaqaVisible(true); }`.
3. `onValueChange` yordamchisida (~158): `if (value === "musobaqa" && !musobaqaShown.current) { musobaqaShown.current = true; setMusobaqaVisible(true); }`.
4. `<TabsTrigger value="musobaqa">{t("Musobaqa")}</TabsTrigger>` (`ilova` trigger'idan keyin, ~187) va `<TabsContent value="musobaqa">{musobaqaVisible && <GroupMusobaqaTab groupId={group.id} />}</TabsContent>` (`ilova` content'idan keyin, ~237); importga `import { GroupMusobaqaTab } from "./musobaqa/group-musobaqa-tab";`.

Tab yorlig'i tor ekranda sig'ishini brauzer tekshiruvida (Task 8) ko'ring.

- [ ] **Step 6: Tekshirish va commit**

```bash
cd client && npx tsc --noEmit -p . && npx eslint src/components/groups && npx vitest run src/components/groups src/i18n && npx next build 2>&1 | tail -5; cd ..
git add client/src/components/groups
git commit -m "feat(groups): S5 competition tab — group place, student table and not-practised list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: tsc/eslint toza; vitest (shu jumladan `i18n-coverage.test.ts`) PASS; `next build` muvaffaqiyatli. `i18n` testi yangi `t()` matnlari uchun yiqilsa (fayllar `STRICT_FILES` da emas, shuning uchun yiqilmasligi kerak) — sababini aniqlab xabar ber, `STRICT_FILES` ga qo'shib tarjima yozma.

---

### Task 8: Brauzer tekshiruvi (vaqtinchalik lokal baza)

**Files:** o'zgarish yo'q (faqat tekshiruv; topilgan xato bo'lsa tuzatish alohida commit).

`reference_throwaway_local_db`, `reference_local_role_browser_check`, `reference_local_dev_backend_slow`, `reference_mock_api_browser_check` xotira fayllarini o'qing: `/Users/a1111/.claude/projects/-Users-a1111-Desktop-daf-erp-system/memory/`. Lokal backend `CRONS_ENABLED=false` va bo'sh `TELEGRAM_BOT_TOKEN=` bilan.

- [ ] **Step 1: Ma'lumot** — vaqtinchalik bazada 1 ustoz (Teacher roli), unga biriktirilgan guruh, 6 o'quvchi: 3 tasi bu hafta ball bilan (biri ikkita guruhda), 1 tasi bu hafta 0 ball lekin o'tgan hafta ball bilan, 1 tasi akkauntsiz va hech qachon mashq qilmagan, 1 tasi liga Kumush + nishonli. `DafGroupWeek` ga o'tgan 3 hafta uchun qator.

- [ ] **Step 2: Brauzer** — ustoz roli bilan guruh sahifasi → «Musobaqa» tabi. Tekshirish: (a) karta o'rin va a'zolar; (b) jadval tartibi (jami ball ↓), seriya/maqsad ustunlari; (c) «Mashq qilmaganlar» ro'yxati — boshqa guruhda mashq qilgan o'quvchi UNDA YO'Q; (d) tarix chipini bosish → o'tgan hafta: seriya va maqsad ustunlari yo'qoladi, tanlagich qiymati o'zgaradi; (e) tanlagichdan «joriy» ga qaytish; (f) 390 / 360 / 320 px: gorizontal aylanish, ism sticky, tab yorlig'i sig'adi, chiplar ≥ 44 px; (g) yorug' va qorong'i; (h) klaviatura bilan tanlagich; (i) boshqa ustozning guruhi URL'i → 403 xabari (tab xato holatini ko'rsatadi, sahifa qulamaydi); (j) konsolda xato yo'q.

- [ ] **Step 3: Natija** — skrinshotlar `scratchpad/s5shots/` ga; topilgan kamchiliklarni tuzating (alohida commit), qayta tekshiring. Hisobotga: nima ko'rildi, nima o'zgardi.

---

### Task 9: Hujjat

**Files:**
- Create: `docs/adr/0118-daf-ustoz-musobaqa-korinishi-faqat-oqiydi.md`
- Modify: `docs/adr/README.md` (indeks qatori)
- Modify: `server/CLAUDE.md` (DaF bo'limiga bullet, ingliz tilida)
- Modify: `client/src/qollanma/yangiliklar.ts` (yangi yozuv tepaga)
- Modify: `docs/superpowers/specs/2026-10-20-musobaqa-s5-ustoz-korinishi-design.md` (§2: tarix «chiziq» o'rniga chiplar; §5 javobga `bugun`)

- [ ] **Step 1: ADR-0118** — `docs/adr/0117-…md` shaklida (sarlavha, Holat, Kontekst, Qaror, Oqibatlar, Cheklovlar), o'zbekcha. Qaror: (1) ustoz ko'rinishi yangi jadval yozmaydi, hamma narsa S1–S3 hisoblaridan o'qiladi; (2) guruh o'rni joriy haftada S3 `guruhlarYigindisi` bilan bir manbadan, o'tgan haftada `DafGroupWeek`dan; (3) «mashq qilmadi» jami ball bo'yicha; (4) seriya/maqsad faqat joriy haftada va o'quvchi ekranidagi «bosh» qoidasisiz; (5) huquq ilova faolligi bilan bir xil (`groups.view` + `assertCallerMayTouchGroup`); (6) o'qish-faqat qorovuli. Raqamlar — Task 5 natijalari (spec §11). Cheklovlar: 400 kunlik seriya oynasi; markaz so'rovi (≈31 ms) har ochilishda; ustozga Telegram xabar yo'q; hozirgi a'zolar bo'yicha (eski haftada tarkib boshqacha bo'lgan); `guruhlar` sekinlashsa kuzatish (S3 limiti).

`docs/adr/README.md` ga 0118 qatorini 0117 qatori shaklida qo'shing (mavjud qatorlar formatini ko'ring).

- [ ] **Step 2: `server/CLAUDE.md`** — DaF bo'limidagi S4 bulletlaridan keyin ingliz tilida: `src/daf/ustoz/` is read-only (guarded by `musobaqa-ustoz.read-only.spec.ts`); the group card reuses `guruhlarYigindisi`/`guruhlarniSarala` (S3) for the current week and `DafGroupWeek` for past weeks; «not practised» uses total points across groups; `GET /groups/:id/musobaqa` follows the `app-activity` group guard (`assertCallerMayTouchGroup`).

- [ ] **Step 3: Yangilik** — `yangiliklar.ts` tepasiga:

```ts
  {
    sana: "2026-10-20",
    sarlavha: "Guruh sahifasida «Musobaqa» tabi",
    matn: "Guruh sahifasida yangi «Musobaqa» tabi bor. Tepada guruhning markaz bo'yicha shu haftadagi o'rni va o'rtacha bali, oxirgi 8 haftaning o'rinlari (bosilsa o'sha haftaga o'tadi). Pastda har o'quvchining haftalik bali, faol kunlari, seriyasi, bugungi maqsad bajarilishi, ligasi va nishonlari. «Shu hafta mashq qilmaganlar» ro'yxati o'quvchiga o'zingiz bog'lanishingiz uchun; tizim hech kimga xabar yubormaydi. Ustoz faqat o'z guruhini ko'radi.",
    rollar: [1, 2, 3, 4],
  },
```

(Rollar identifikatorlari — oldingi yozuvlardagi `[1, 2, 3, 4]` bilan bir xil.)

- [ ] **Step 4: Spec tuzatishlari** — §2 «Kichik chiziq (sparkline) o'rin bo'yicha, kam bo'lsa — jadval» jumlasini «Sakkiz ta bosiladigan chip (dushanba sanasi va o'rin)» ga; §5 javob ro'yxatiga `bugun` (Toshkent kuni) qo'shing.

- [ ] **Step 5: Tekshirish va commit**

```bash
cd client && npx tsc --noEmit -p . && npx vitest run src/qollanma; cd ..
git add docs server/CLAUDE.md client/src/qollanma/yangiliklar.ts
git commit -m "docs: ADR-0118 teacher competition view, news entry, server guide

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

`client/src/qollanma` testlari yangilik yozuvi shaklini tekshiradi (sana tartibi, rollar) — yiqilsa, yozuvni moslang.
