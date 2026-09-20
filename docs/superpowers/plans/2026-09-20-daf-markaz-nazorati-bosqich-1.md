# DaF ilovasi markaz nazorati — 1-bosqich: norma, «Umumiy holat», «O'quvchilar»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yon menyuda «DaF ilovasi» bo'limi: CEO / Filial direktori / Administrator markaz (yoki o'z filiali) bo'yicha ilova faolligini bitta sahifada ko'radi va «kim ishlamayapti» ro'yxatini oladi; norma `/settings/daf` da sozlanadi.

**Architecture:** Norma va holat — bitta toza modul `server/src/app-activity/norma/norma.ts`. Xom SQL (`center/center-app-activity.queries.ts`) faqat (o'quvchi, kun) bo'yicha **mexanik yig'indi** qaytaradi; «bu kun faolmi», «bu o'quvchi qizilmi», saralash va sahifalash — TypeScript da (`markaz-surati.ts`, `markaz-royxat.ts`, servis). Filial cheklovi mavjud `@BranchScope()` dekoratori orqali (manifestga yozuv kerak emas). Klient mavjud `components/groups/app-activity/*` komponentlarini qayta ishlatadi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL/Neon, `range_agg` — PG 14+), jest; Next.js (App Router) + shadcn/ui + @tanstack/react-query v5 + recharts, vitest.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-20-daf-markaz-nazorati-design.md` (2- va 3-o'qish tahrirlari bilan). Ziddiyat chiqsa dizayn ustun.
- Ish **faqat** `/Users/a1111/Desktop/daf-erp-system/.worktrees/daf-markaz-nazorati` worktree'sida, shox `feat/daf-markaz-nazorati`. Asosiy checkoutda hech narsa o'zgartirilmaydi va commit qilinmaydi.
- Rollar: CEO=1, Branch Director=2, Administrator=3, Teacher=4, Cashier=5, Student=6. Server dekoratori: `@Roles('CEO', 'Branch Director', 'Administrator')`.
- **Biznes qoidasi SQL ga kirmaydi.** «Faol kun», holat rangi, saralash tartibi FAQAT `norma.ts` va `markaz-royxat.ts` da. SQL (o'quvchi, kun) bo'yicha son qaytaradi, boshqa hech narsa.
- O'quvchilar populyatsiyasi FAQAT Prisma `student.findMany` + `where` obyekt literalida `...activeStudentWhere()` bilan (`active-student-policy.spec.ts` shuni tekshiradi). `"Student"` jadvaliga xom SQL yozilmaydi.
- Har xom so'rov `"companyId" = ${companyId}` shartini oladi va `ids` bo'sh bo'lsa **chaqirilmaydi** (`Prisma.join([])` xato beradi).
- Kun chegarasi: TS da `common/date/tashkent` yordamchilari; SQL da Toshkent kuni `timestamp(3)` ustunlarda `+ 5 soat` bilan (`TASHKENT_OFFSET_MS` dan), `@db.Date` ustunda to'g'ridan-to'g'ri.
- `amber-*` sinflar ishlatilmaydi (admin mavzusida rangsiz). Holat ranglari: `green-*`, `yellow-*`, `red-*`, `muted`.
- **Mingdan oshishi mumkin bo'lgan har bir son `formatNumber()` (`@/lib/format-utils`) orqali chiqariladi** —
  `uz-UZ` bo'shliqli ajratgich bilan (`42 300`, `1 840`). Bu `client/CLAUDE.md` talabi. Foizlarga va 7 dan
  kichik kun sonlariga kerak emas.
- Barcha UI matni va yangi izohlar **lotin alifbosidagi o'zbekcha**, izohlar NEGA ekanini tushuntiradi. Test nomlari o'zbekcha.
- Kodda haqiqiy ism, telefon yoki prod ID yo'q; misollar uydirma (`Nodira Yusupova`, `901112233`, `10001`).
- Buyruqlar: server — `cd server && npx jest <yo'l>`, `npm run typecheck`; klient — `cd client && npx vitest run <yo'l>`, `npm run typecheck`.
- **Faqat SERVERDA, har vazifa oxirida, commitdan oldin:** `cd server && npx prettier --write <yangi fayllar>`,
  so'ng `npx eslint <fayllar>` toza ekanini tasdiqlang. Server eslint konfiguratsiyasida `prettier/prettier`
  XATO darajasida va CI shunda yiqiladi; rejadagi kod bloklari esa prettier formatida yozilmagan.
- **KLIENTDA prettier YURITILMAYDI.** Klient eslint konfiguratsiyasida prettier yo'q, `origin/main` dagi
  fayllar ham prettier formatida emas. `nav-items.ts` kabi umumiy faylni formatlash 40 qator aloqasiz
  o'zgarish yasaydi va repodagi o'nlab shox bilan birlashtirish nizosi chiqaradi. Klientda faqat
  `npx eslint <fayllar>` yuritiladi.
- **Mavjud faylni tahrirlaganda o'zgarish faqat qo'shimcha bo'ladi:** tegmagan qatorlar qayta formatlanmaydi,
  qayta tartiblanmaydi. `npm run lint` (`--fix` bilan, butun repo) hech qachon ISHLATILMAYDI.
- Prisma migratsiyasi: `prisma migrate dev` bu loyihada **ishlamaydi** — `migrate diff` → tozalash → `db execute` → `migrate resolve` (2-vazifa).
- `git reset --hard` va yalang'och `git stash` ishlatilmaydi.
- Commit xabari o'zbekcha, oxirida bo'sh qatordan keyin `Co-Authored-By:` qatori. **Qaysi model nomi
  yozilishini o'z sessiyangizdagi tizim eslatmasi belgilaydi** — quyidagi vazifa matnlaridagi
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` shunchaki namuna; commit'ni
  yozayotgan model o'z eslatmasidagi qatorni ishlatadi va bu chetlanish emas.

---

## File Structure

### Server (`server/src/`)

| Fayl | Vazifasi |
| --- | --- |
| `prisma/schema.prisma` (Company) | To'rt norma ustuni |
| `prisma/migrations/20260920120000_company_daf_norma/migration.sql` | Migratsiya |
| `company/dto/update-company.dto.ts` | To'rt maydon + chegaralar |
| `company/company.service.ts` | `sariq < haftalik` o'zaro tekshiruvi |
| `company/company.service.spec.ts` (yangi) | Tekshiruv testi |
| `app-activity/norma/norma.ts` | `Norma`, `Holat`, `faolKunmi`, `kerakliKunlar`, `holat`, `HOLAT_TARTIBI`, `normaniOqi` — toza |
| `app-activity/norma/norma.spec.ts` | Birlik testlari |
| `app-activity/center/center-app-activity.types.ts` | Javob shartnomasi + ichki `OquvchiHisobi` |
| `app-activity/center/markaz-surati.ts` | Kunlik qatorlar → bitta o'quvchi surati (toza) |
| `app-activity/center/markaz-surati.spec.ts` | Testlar |
| `app-activity/center/markaz-royxat.ts` | Filtr, saralash, sahifalash, filtr variantlari (toza) |
| `app-activity/center/markaz-royxat.spec.ts` | Testlar |
| `app-activity/center/center-app-activity.queries.ts` | To'rt xom SQL yig'indi |
| `app-activity/center/center-app-activity.service.ts` | Populyatsiya + yig'indi + qaror; `umumiy`, `oquvchilar`, `telefonlar` |
| `app-activity/center/center-app-activity.service.spec.ts` | Prisma mock bilan orkestratsiya testi |
| `app-activity/center/center-app-activity.controller.ts` | `GET /app-activity/center/{summary,students,students/phones}` |
| `app-activity/center/center-app-activity.controller.spec.ts` | Rollar + scope uzatilishi |
| `app-activity/dto/center-students-query.dto.ts` | So'rov DTO + `sorovniOqi` |
| `app-activity/app-activity.module.ts` | Kontroller + ikki provider |
| `scripts/check-pg-version.ts` (yangi) | 0-bosqich: PG versiyasi va `range_agg` |
| `scripts/check-daf-markaz.ts` (yangi) | SQL yig'indi vs `kunlikYigindi()` solishtiruvi |

### Klient (`client/src/`)

| Fayl | Vazifasi |
| --- | --- |
| `lib/daf-nav.ts` + `lib/daf-nav.test.ts` | Bo'lim sahifalari va rol qorovuli |
| `lib/nav-items.ts` | «DaF ilovasi» ota-element |
| `lib/settings-nav.ts` | «DaF normasi» → `/settings/daf` (CEO) |
| `lib/breadcrumb-routes.ts` | `daf`, `oquvchilar` nomlari |
| `components/settings/settings-layout-shell.tsx` | `/settings/daf` faqat CEO |
| `components/settings/daf-norma-settings-client.tsx` | Norma formasi |
| `app/(dashboard)/settings/daf/page.tsx` | Sahifa |
| `app/(dashboard)/daf/layout.tsx` (12), `daf/page.tsx` (14), `daf/oquvchilar/page.tsx` (15) | Yo'llar — har sahifa o'z komponenti bilan bir vazifada |
| `components/daf-center/daf-layout-shell.tsx` | Rol qorovuli |
| `components/daf-center/types.ts` | Server shartnomasi 1:1 |
| `components/daf-center/oquvchilar-filtr.ts` + `.test.ts` | URL ↔ filtr (toza) |
| `components/daf-center/use-daf-center.ts` | react-query hook'lari |
| `components/daf-center/holat-badge.tsx` | Rangli holat belgisi |
| `components/daf-center/daf-umumiy-client.tsx` | «Umumiy holat» sahifasi |
| `components/daf-center/daf-kpi-cards.tsx` | Oltita karta |
| `components/daf-center/daf-voronka.tsx` | Voronka, bosiladigan yo'qotishlar |
| `components/daf-center/daf-trend-chart.tsx` | 30 kunlik ikki chiziq |
| `components/daf-center/daf-filiallar-table.tsx` | Filiallar jadvali (CEO) |
| `components/daf-center/daf-explainer.tsx` | «Raqamlar qanday hisoblanadi» — markazning O'Z qoidalari |
| `components/daf-center/daf-oquvchilar-client.tsx` | «O'quvchilar» sahifasi |
| `components/daf-center/daf-oquvchilar-filter-bar.tsx` | Filtrlar |
| `components/daf-center/daf-qidiruvli-select.tsx` | Uzun ro'yxat uchun qidiruvli bitta tanlovli tanlagich |
| `components/daf-center/daf-oquvchilar-table.tsx` | Jadval, saralanadigan sarlavhalar |
| `components/daf-center/daf-oquvchi-sheet.tsx` | Yon oyna (mavjud `StudentActivityPanel`) |
| `components/daf-center/daf-royxat-nusxalash.tsx` | «Ro'yxatni nusxalash» |
| `components/groups/app-activity/activity-ui.tsx` | `DayBars`/`KunTooltipIchi` ga `shugullanganMatni` prop |

### Hujjatlar

| Fayl | Vazifasi |
| --- | --- |
| `docs/adr/0024-daf-faollik-normasi-yigindi-sql-qaror-ts.md` | ADR |
| `docs/adr/README.md` | Indeks qatori |
| `CONTEXT.md` | «Faol kun (DaF)» atamasi |

---

## Task 1: Muhit va 0-bosqich — PG versiyasi, `range_agg`

**Files:**
- Create: `server/scripts/check-pg-version.ts`

- [ ] **Step 1: `.env` fayllarini worktree'ga nusxalash (gitignore'da, commit bo'lmaydi)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/daf-markaz-nazorati
cp /Users/a1111/Desktop/daf-erp-system/server/.env server/.env
cp /Users/a1111/Desktop/daf-erp-system/client/.env.local client/.env.local
git status --short
```
Expected: `git status` bo'sh (ikkala fayl ignore qilinadi).

- [ ] **Step 2: Bog'liqliklar (worktree'da `node_modules` yo'q)**

```bash
cd server && npm ci && npx prisma generate && cd ..
cd client && npm ci && cd ..
```

- [ ] **Step 3: Boshlang'ich testlar yashil ekanini tasdiqlash**

```bash
cd server && npx jest src/app-activity src/common/auth/branch-route-policy.spec.ts src/students/shared
```
Expected: hammasi PASS (bu keyingi vazifalarda «men buzdimmi» degan savolga asos).

- [ ] **Step 4: `check-pg-version.ts` yozish**

```ts
/**
 * check-pg-version — READ-ONLY: PostgreSQL versiyasi va `range_agg` mavjudligi
 * (DaF markaz dizayni 9.3, 0-bosqich). Markaz so'rovi kunlik seanslarni
 * `tsrange` birlashmasi bilan qirqadi — bu PG 14+ da bor.
 *
 * Usage: npx ts-node --transpile-only scripts/check-pg-version.ts              (dev, server/.env)
 *        railway run npx ts-node --transpile-only scripts/check-pg-version.ts  (prod)
 */
import { PrismaClient } from '@prisma/client';
import { printHeader, run } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  printHeader('PostgreSQL versiyasi va range_agg');
  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  console.log(`  ${version}`);

  // Ikki kesishgan oraliq: 10:00–11:00 va 10:30–12:00 → birlashma 2 soat = 7200 s.
  // Bu aynan markaz so'rovidagi ifoda — u yerda ishlasa, bu yerda ham ishlaydi.
  const [{ soniya }] = await prisma.$queryRaw<{ soniya: number }[]>`
    SELECT FLOOR(COALESCE(SUM(EXTRACT(EPOCH FROM (upper(x) - lower(x)))), 0))::int AS soniya
    FROM unnest((
      SELECT range_agg(r) FROM (VALUES
        (tsrange('2026-01-01 10:00', '2026-01-01 11:00')),
        (tsrange('2026-01-01 10:30', '2026-01-01 12:00'))
      ) AS v(r)
    )) AS x
  `;
  const ok = soniya === 7200;
  console.log(`  range_agg birlashma: ${soniya} s ${ok ? '✓' : '✗ (7200 kutilgan)'}`);
  if (!ok) process.exitCode = 1;
}

run(main);
```

- [ ] **Step 5: Dev bazada yuritish**

```bash
cd server && npx ts-node --transpile-only scripts/check-pg-version.ts
```
Expected: `PostgreSQL 1x.x ...` va `range_agg birlashma: 7200 s ✓`. Agar `range_agg` yo'q desa (PG < 14) — **to'xtang** va foydalanuvchiga ayting: 8-vazifadagi SQL «gaps and islands» ga qayta yozilishi kerak.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/check-pg-version.ts
git commit -m "$(cat <<'MSG'
check-pg-version: PG versiyasi va range_agg tekshiruvi

DaF markaz so'rovi kunlik seanslarni tsrange birlashmasi bilan qirqadi
(PG 14+). Kod yozishdan oldin bazada bor-yo'qligini bir buyruq bilan
ko'rish uchun.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: Company normasi — Prisma ustunlari va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma` (`model Company`, `systemStartDate` dan keyin)
- Create: `server/prisma/migrations/20260920120000_company_daf_norma/migration.sql`

**Interfaces:**
- Produces: `Company.dafKunlikDaqiqa`, `dafKunlikSavol`, `dafHaftalikKun`, `dafSariqKun` (`Int`, standart 10 / 12 / 4 / 2) — 3-, 4-, 10-vazifalar o'qiydi.

- [ ] **Step 1: Sxemaga to'rt ustun qo'shish**

`model Company` ichida `systemStartDate DateTime?` qatoridan keyin:

```prisma
  // DaF ilovasi faollik normasi (dizayn 2026-09-20, 3.4-bo'lim). Sozlamalarda
  // o'zgartiriladi; holat rangi FAQAT `app-activity/norma/norma.ts` da chiqadi —
  // bu ustunlar raqam, qoida emas.
  dafKunlikDaqiqa Int @default(10)
  dafKunlikSavol  Int @default(12)
  dafHaftalikKun  Int @default(4)
  dafSariqKun     Int @default(2)
```

- [ ] **Step 2: Diff olish va faqat o'zimizniki qolganini tekshirish**

```bash
cd server
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/daf-norma-diff.sql
cat /tmp/daf-norma-diff.sql
```
Expected: ichida `ALTER TABLE "Company" ADD COLUMN "dafKunlikDaqiqa" ...` va yana uchta ustun. Dev bazadagi eski drift qatorlari (masalan `Branch.workingDays`, `Transaction_reversedAt_idx`) ham chiqishi mumkin — **ular migratsiyaga kirmaydi**.

- [ ] **Step 3: Tozalangan migratsiyani yozish**

`server/prisma/migrations/20260920120000_company_daf_norma/migration.sql`:

```sql
-- DaF ilovasi faollik normasi (dizayn 2026-09-20, 4-bo'lim).
-- Standart 10 daqiqa / 12 savol / haftada 4 kun (yashil) / 2 kun (sariq).
ALTER TABLE "Company"
  ADD COLUMN "dafKunlikDaqiqa" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "dafKunlikSavol" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "dafHaftalikKun" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "dafSariqKun" INTEGER NOT NULL DEFAULT 2;
```

- [ ] **Step 4: Dev bazaga qo'llash, yozib qo'yish, klient generatsiya**

```bash
npx prisma db execute --file prisma/migrations/20260920120000_company_daf_norma/migration.sql
npx prisma migrate resolve --applied 20260920120000_company_daf_norma
npx prisma generate
npm run typecheck
```
Expected: uchala buyruq xatosiz; typecheck toza.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260920120000_company_daf_norma/migration.sql
git commit -m "$(cat <<'MSG'
Company: DaF faollik normasi uchun to'rt ustun

Kunlik daqiqa, kunlik savol, haftalik faol kun (yashil) va sariq
chegarasi. Sozlamalardan o'zgartiriladi — kodga yozilsa hamma qizil yoki
hamma yashil chiqib qolgan normani tuzatish deploy talab qilardi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: `norma.ts` — faol kun va holat (TDD)

**Files:**
- Create: `server/src/app-activity/norma/norma.ts`
- Test: `server/src/app-activity/norma/norma.spec.ts`

**Interfaces:**
- Produces:
  - `interface Norma { kunlikDaqiqa: number; kunlikSavol: number; haftalikKun: number; sariqKun: number }`
  - `const STANDART_NORMA: Norma`
  - `type Holat = 'AKKAUNT_YOQ' | 'HECH_KIRMAGAN' | 'QIZIL' | 'SARIQ' | 'YASHIL'`; `const HOLATLAR: readonly Holat[]`
  - `const HOLAT_TARTIBI: Record<Holat, number>` (HECH_KIRMAGAN 0 → AKKAUNT_YOQ 4)
  - `normaniOqi(company: { dafKunlikDaqiqa; dafKunlikSavol; dafHaftalikKun; dafSariqKun }): Norma`
  - `faolKunmi(lernenSoniya: number, savollar: number, norma: Norma): boolean`
  - `kerakliKunlar(maxraj: number, norma: Norma): { kerakliKun: number; sariqKerak: number }`
  - `holat(input: { akkaunt: boolean; hechKirmagan: boolean; faolKun: number; maxraj: number }, norma: Norma): Holat`

- [ ] **Step 1: Testni yozish**

`server/src/app-activity/norma/norma.spec.ts`:

```ts
import {
  faolKunmi,
  HOLAT_TARTIBI,
  holat,
  kerakliKunlar,
  normaniOqi,
  STANDART_NORMA,
} from './norma';

describe('faolKunmi — kun faolmi (dizayn 3.3)', () => {
  const n = STANDART_NORMA; // 10 daqiqa / 12 savol

  it("vaqt yetsa savol bo'lmasa ham faol", () => {
    expect(faolKunmi(600, 0, n)).toBe(true);
  });

  it("savol yetsa vaqt kam bo'lsa ham faol — tez o'quvchi jazolanmaydi", () => {
    expect(faolKunmi(0, 12, n)).toBe(true);
  });

  it('ikkalasi ham chegaradan bir kam — faol emas', () => {
    expect(faolKunmi(599, 11, n)).toBe(false);
  });

  it("chegaraning o'zi yetadi (>=)", () => {
    expect(faolKunmi(600, 11, n)).toBe(true);
    expect(faolKunmi(599, 12, n)).toBe(true);
  });
});

describe('kerakliKunlar — norma davrga mutanosib (dizayn 3.4)', () => {
  const n = STANDART_NORMA; // 4 / 2

  it('7 kunlik maxraj — normaning o\'zi', () => {
    expect(kerakliKunlar(7, n)).toEqual({ kerakliKun: 4, sariqKerak: 2 });
  });

  it("30 kunlik to'liq maxraj — 4 → 17, 2 → 9", () => {
    expect(kerakliKunlar(30, n)).toEqual({ kerakliKun: 17, sariqKerak: 9 });
  });

  it('3 kunlik maxraj — 2 va 1', () => {
    expect(kerakliKunlar(3, n)).toEqual({ kerakliKun: 2, sariqKerak: 1 });
  });

  it("maxraj 1 bo'lsa eng kami 1 — 0 bo'lib qolmaydi", () => {
    expect(kerakliKunlar(1, n)).toEqual({ kerakliKun: 1, sariqKerak: 1 });
  });

  it('maxraj 0 yoki manfiy kelsa 1 deb olinadi', () => {
    expect(kerakliKunlar(0, n)).toEqual({ kerakliKun: 1, sariqKerak: 1 });
  });
});

describe('holat — belgi (dizayn 3.4)', () => {
  const n = STANDART_NORMA;
  const bor = { akkaunt: true, hechKirmagan: false, maxraj: 7 };

  it("akkaunt yo'q — faol kun qanchaligi muhim emas", () => {
    expect(holat({ ...bor, akkaunt: false, faolKun: 7 }, n)).toBe('AKKAUNT_YOQ');
  });

  it('hech qachon kirmagan — normadan oldin tekshiriladi', () => {
    expect(holat({ ...bor, hechKirmagan: true, faolKun: 0 }, n)).toBe('HECH_KIRMAGAN');
  });

  it('chegaralar: 0,1 qizil; 2,3 sariq; 4+ yashil', () => {
    expect(holat({ ...bor, faolKun: 0 }, n)).toBe('QIZIL');
    expect(holat({ ...bor, faolKun: 1 }, n)).toBe('QIZIL');
    expect(holat({ ...bor, faolKun: 2 }, n)).toBe('SARIQ');
    expect(holat({ ...bor, faolKun: 3 }, n)).toBe('SARIQ');
    expect(holat({ ...bor, faolKun: 4 }, n)).toBe('YASHIL');
    expect(holat({ ...bor, faolKun: 7 }, n)).toBe('YASHIL');
  });

  it("30 kunlik maxrajda 17 yashil, 16 sariq", () => {
    expect(holat({ ...bor, maxraj: 30, faolKun: 17 }, n)).toBe('YASHIL');
    expect(holat({ ...bor, maxraj: 30, faolKun: 16 }, n)).toBe('SARIQ');
  });

  it("standart saralash tartibi: hech kirmagan → qizil → sariq → yashil → akkaunt yo'q", () => {
    expect(HOLAT_TARTIBI.HECH_KIRMAGAN).toBeLessThan(HOLAT_TARTIBI.QIZIL);
    expect(HOLAT_TARTIBI.QIZIL).toBeLessThan(HOLAT_TARTIBI.SARIQ);
    expect(HOLAT_TARTIBI.SARIQ).toBeLessThan(HOLAT_TARTIBI.YASHIL);
    expect(HOLAT_TARTIBI.YASHIL).toBeLessThan(HOLAT_TARTIBI.AKKAUNT_YOQ);
  });
});

describe('normaniOqi — Company ustunlaridan', () => {
  it('nomlarni tarjima qiladi', () => {
    expect(
      normaniOqi({ dafKunlikDaqiqa: 15, dafKunlikSavol: 20, dafHaftalikKun: 5, dafSariqKun: 3 }),
    ).toEqual({ kunlikDaqiqa: 15, kunlikSavol: 20, haftalikKun: 5, sariqKun: 3 });
  });
});
```

- [ ] **Step 2: Test yiqilishini ko'rish**

```bash
cd server && npx jest src/app-activity/norma
```
Expected: FAIL — `Cannot find module './norma'`.

- [ ] **Step 3: `norma.ts` yozish**

```ts
/**
 * DaF faollik normasi va o'quvchi holati — YAGONA manba (dizayn 3.3–3.4).
 *
 * SQL faqat mexanik yig'indi qaytaradi (kunlik LERNEN soniyasi, tugatilgan
 * seanslardagi savollar); «bu kun faolmi» va «bu o'quvchi qizilmi» degan
 * qaror FAQAT shu yerda. ADR-0015 dagi saboq: qoida ikki joyda bo'lsa, ikki
 * ekran ikki xil son ko'rsatadi va buni hech kim sezmaydi — chunki ikki son
 * ikki boshqa ekranda turadi.
 */
export interface Norma {
  /** Kunlik eng kam LERNEN vaqti, daqiqa. Radio va boshqa bo'limlar kirmaydi. */
  kunlikDaqiqa: number;
  /** Kunlik eng kam savol — tugatilgan seanslarda. Vaqt YOKI savol, bittasi yetadi. */
  kunlikSavol: number;
  /** Haftada eng kam faol kun — yashil chegarasi. */
  haftalikKun: number;
  /** Sariq chegarasi, haftada faol kun. Har doim `< haftalikKun`. */
  sariqKun: number;
}

/** Boshlang'ich qiymatlar — taxminiy; haqiqiysi `Company` ustunlarida. */
export const STANDART_NORMA: Norma = {
  kunlikDaqiqa: 10,
  kunlikSavol: 12,
  haftalikKun: 4,
  sariqKun: 2,
};

export type Holat =
  | 'AKKAUNT_YOQ'
  | 'HECH_KIRMAGAN'
  | 'QIZIL'
  | 'SARIQ'
  | 'YASHIL';

export const HOLATLAR: readonly Holat[] = [
  'HECH_KIRMAGAN',
  'QIZIL',
  'SARIQ',
  'YASHIL',
  'AKKAUNT_YOQ',
];

/**
 * Standart saralash — eng muammolisi yuqorida (dizayn 6.2). Akkauntsiz oxirida:
 * u bilan ish boshqa (akkaunt ochish), ilovaga undash emas.
 */
export const HOLAT_TARTIBI: Record<Holat, number> = {
  HECH_KIRMAGAN: 0,
  QIZIL: 1,
  SARIQ: 2,
  YASHIL: 3,
  AKKAUNT_YOQ: 4,
};

export function normaniOqi(company: {
  dafKunlikDaqiqa: number;
  dafKunlikSavol: number;
  dafHaftalikKun: number;
  dafSariqKun: number;
}): Norma {
  return {
    kunlikDaqiqa: company.dafKunlikDaqiqa,
    kunlikSavol: company.dafKunlikSavol,
    haftalikKun: company.dafHaftalikKun,
    sariqKun: company.dafSariqKun,
  };
}

/**
 * Faol kun: LERNEN vaqti normaga yetdi YOKI tugatilgan seanslarda savol
 * normaga yetdi. «Yoki» — tez o'quvchi 6 daqiqada ishini qiladi, takrorlash
 * seansi esa darsni tugatmaydi; ikkalasi ham jazolanmasligi kerak.
 */
export function faolKunmi(
  lernenSoniya: number,
  savollar: number,
  norma: Norma,
): boolean {
  return (
    lernenSoniya >= norma.kunlikDaqiqa * 60 || savollar >= norma.kunlikSavol
  );
}

/**
 * Norma davrga mutanosib: 7 kunda 4 → 30 kunda 17. Maxraj o'suvchi (yangi
 * akkaunt to'liq davr uchun javobgar emas), shuning uchun eng kami 1 — aks
 * holda ikki kunlik o'quvchi 0 kun bilan yashil bo'lib qolardi.
 */
export function kerakliKunlar(
  maxraj: number,
  norma: Norma,
): { kerakliKun: number; sariqKerak: number } {
  const m = Math.max(1, maxraj);
  return {
    kerakliKun: Math.max(1, Math.round((norma.haftalikKun * m) / 7)),
    sariqKerak: Math.max(1, Math.round((norma.sariqKun * m) / 7)),
  };
}

export function holat(
  input: {
    akkaunt: boolean;
    hechKirmagan: boolean;
    faolKun: number;
    maxraj: number;
  },
  norma: Norma,
): Holat {
  if (!input.akkaunt) return 'AKKAUNT_YOQ';
  if (input.hechKirmagan) return 'HECH_KIRMAGAN';
  const { kerakliKun, sariqKerak } = kerakliKunlar(input.maxraj, norma);
  if (input.faolKun >= kerakliKun) return 'YASHIL';
  if (input.faolKun >= sariqKerak) return 'SARIQ';
  return 'QIZIL';
}
```

- [ ] **Step 4: Test o'tishini ko'rish**

```bash
cd server && npx jest src/app-activity/norma
```
Expected: PASS (15 test).

- [ ] **Step 5: Commit**

```bash
git add src/app-activity/norma
git commit -m "$(cat <<'MSG'
DaF normasi: faol kun va holat — bitta toza modul

«Faol kun» = LERNEN >= N daqiqa YOKI tugatilgan seanslarda >= K savol;
holat = maxrajga mutanosib chegaralar. SQL ga kirmaydi — ADR-0015 dagi
kabi qoida ikki joyda yashab ketmasin.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: Company DTO va servis tekshiruvi (TDD)

**Files:**
- Modify: `server/src/company/dto/update-company.dto.ts`
- Modify: `server/src/company/company.service.ts` (`update`)
- Create: `server/src/company/company.service.spec.ts`

**Interfaces:**
- Consumes: 2-vazifa ustunlari.
- Produces: `PATCH /api/company/:id` to'rt maydonni qabul qiladi; `sariq >= haftalik` → 400. `GET /api/company/:id` javobida to'rt maydon o'z-o'zidan bor (Prisma to'liq qatorni qaytaradi).

- [ ] **Step 1: Servis testini yozish**

`server/src/company/company.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { CompanyService } from './company.service';

describe('CompanyService.update — DaF normasi tekshiruvi', () => {
  const mavjud = { id: 1001, dafHaftalikKun: 4, dafSariqKun: 2 };
  const prisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue(mavjud),
      update: jest.fn().mockResolvedValue(mavjud),
    },
  };
  const service = new CompanyService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("sariq chegarasi haftalikka teng bo'lsa — 400", async () => {
    await expect(service.update(1001, { dafSariqKun: 4 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it("haftalik norma sariqqa tushib qolsa ham — 400 (mavjud sariq 2, yangi haftalik 2)", async () => {
    await expect(service.update(1001, { dafHaftalikKun: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("ikkalasi birga to'g'ri kelsa saqlanadi", async () => {
    await service.update(1001, { dafHaftalikKun: 5, dafSariqKun: 3 });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 1001 },
      data: { dafHaftalikKun: 5, dafSariqKun: 3 },
    });
  });

  it("normaga tegmaydigan o'zgarish tekshiruvsiz o'tadi", async () => {
    await service.update(1001, { name: 'Sprachzentrum' });
    expect(prisma.company.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test yiqilishini ko'rish**

```bash
cd server && npx jest src/company/company.service.spec.ts
```
Expected: FAIL — DTO da `dafSariqKun` yo'q (tip xatosi) yoki `BadRequestException` tashlanmaydi.

- [ ] **Step 3: DTO ga to'rt maydon**

`server/src/company/dto/update-company.dto.ts` — importni kengaytirib, sinf oxiriga:

```ts
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
```

```ts
  // DaF faollik normasi (dizayn 3.4). Chegaralar: daqiqa 1..1440, savol 1..500,
  // kunlar 1..7. `sariq < haftalik` o'zaro sharti servisda — DTO bitta maydonni
  // ko'radi, ikkisini birga emas.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  dafKunlikDaqiqa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  dafKunlikSavol?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dafHaftalikKun?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dafSariqKun?: number;
```

- [ ] **Step 4: Servisda o'zaro tekshiruv**

`server/src/company/company.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```

`update` metodi:

```ts
  async update(id: number, dto: UpdateCompanyDto) {
    const mavjud = await this.findOne(id);

    // Sariq chegarasi yashil chegaradan kichik bo'lishi shart — teng bo'lsa
    // sariq oraliq yo'qoladi va «qisman» degan holat hech qachon chiqmaydi.
    // Ikki maydon alohida kelishi mumkin, shuning uchun mavjud qiymat bilan
    // birga tekshiriladi.
    const sariq = dto.dafSariqKun ?? mavjud.dafSariqKun;
    const haftalik = dto.dafHaftalikKun ?? mavjud.dafHaftalikKun;
    if (sariq >= haftalik) {
      throw new BadRequestException(
        "Sariq chegarasi haftalik normadan kichik bo'lishi kerak",
      );
    }

    return this.prisma.company.update({
      where: { id },
      data: dto,
    });
  }
```

- [ ] **Step 5: Testlar**

```bash
cd server && npx jest src/company && npm run typecheck
```
Expected: `company.service.spec.ts` va mavjud `company.controller.spec.ts` PASS; typecheck toza.

- [ ] **Step 6: Commit**

```bash
git add src/company
git commit -m "$(cat <<'MSG'
Company PATCH: DaF normasi maydonlari va sariq < haftalik sharti

Yangi manzil ochilmaydi — mavjud GET/PATCH /company/:id ishlatiladi
(yangi yo'l @Get(':id') bilan to'qnashardi).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: `/settings/daf` — norma sahifasi (klient)

**Files:**
- Create: `client/src/components/settings/daf-norma-settings-client.tsx`
- Create: `client/src/app/(dashboard)/settings/daf/page.tsx`
- Modify: `client/src/lib/settings-nav.ts` («Administratsiya» bo'limi)
- Modify: `client/src/components/settings/settings-layout-shell.tsx` (`isCeoRestricted`)
- Modify: `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: `GET /company/:id` (to'rt maydon), `PATCH /company/:id` (4-vazifa).
- Produces: `/settings/daf` sahifasi, faqat CEO (1).

- [ ] **Step 1: Sahifa komponenti**

`client/src/components/settings/daf-norma-settings-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "./settings-page-header";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/get-error-message";
import api from "@/lib/api";

/** Server: `Company.daf*` ustunlari (dizayn 3.4). */
interface DafNorma {
  kunlikDaqiqa: number;
  kunlikSavol: number;
  haftalikKun: number;
  sariqKun: number;
}

interface CompanyNorma {
  id: number;
  dafKunlikDaqiqa: number;
  dafKunlikSavol: number;
  dafHaftalikKun: number;
  dafSariqKun: number;
}

/** DTO chegaralari bilan bir xil — server ham tekshiradi, bu darhol javob uchun. */
const CHEGARA: Record<keyof DafNorma, { min: number; max: number }> = {
  kunlikDaqiqa: { min: 1, max: 1440 },
  kunlikSavol: { min: 1, max: 500 },
  haftalikKun: { min: 1, max: 7 },
  sariqKun: { min: 1, max: 7 },
};

function NumberField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: keyof DafNorma;
  label: string;
  hint: string;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const { min, max } = CHEGARA[id];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        className="max-w-28"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function DafNormaSettingsClient() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  // Yozish serverda ham faqat CEO (`PATCH /company/:id`) — bu qulf tugmani
  // bosib, keyin 403 olishning oldini oladi.
  const canEdit = !!user?.roles?.some((r) => r.id === 1);
  const companyId = user?.companyId;

  // Qoralama faqat foydalanuvchi tahrirlagandan keyin paydo bo'ladi; shu
  // paytgacha serverdagi qiymat ko'rsatiladi (absence-pause sahifasidagi naqsh).
  const [draft, setDraft] = useState<DafNorma | null>(null);

  const { data, isLoading } = useQuery<DafNorma>({
    queryKey: ["company-daf-norma", companyId],
    enabled: companyId !== undefined,
    queryFn: async () => {
      const res = await api.get<CompanyNorma>(`/company/${companyId}`);
      return {
        kunlikDaqiqa: res.data.dafKunlikDaqiqa,
        kunlikSavol: res.data.dafKunlikSavol,
        haftalikKun: res.data.dafHaftalikKun,
        sariqKun: res.data.dafSariqKun,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (next: DafNorma) => {
      await api.patch(`/company/${companyId}`, {
        dafKunlikDaqiqa: next.kunlikDaqiqa,
        dafKunlikSavol: next.kunlikSavol,
        dafHaftalikKun: next.haftalikKun,
        dafSariqKun: next.sariqKun,
      });
    },
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["company-daf-norma"] });
      // Markaz sahifalari normani o'z javobida oladi — ular ham yangilansin.
      queryClient.invalidateQueries({ queryKey: ["daf-center"] });
      toast.success("Norma saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  const form = draft ?? data ?? null;

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const chegaradanTashqari = (Object.keys(CHEGARA) as (keyof DafNorma)[]).some(
    (k) => form[k] < CHEGARA[k].min || form[k] > CHEGARA[k].max,
  );
  // Teng bo'lsa sariq oraliq yo'qoladi. Server ham tekshiradi.
  const sariqNotogri = form.sariqKun >= form.haftalikKun;
  const locked = !canEdit || save.isPending;
  const set = (k: keyof DafNorma) => (n: number) => setDraft({ ...form, [k]: n });
  // Sariq oralig'i faqat norma to'g'ri bo'lganda ma'noga ega: sariq yashildan
  // katta bo'lsa `4–3 kun` kabi teskari oraliq chiqardi. Bunday paytda butun
  // tushuntirish o'rniga bitta yo'naltiruvchi qator ko'rsatiladi.
  const sariqOraliq =
    form.sariqKun === form.haftalikKun - 1
      ? `${form.sariqKun} kun`
      : `${form.sariqKun}–${form.haftalikKun - 1} kun`;

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="DaF normasi"
        description="O'quvchi ilovada qancha ishlashi kerak — «DaF ilovasi» bo'limidagi ranglar shu normadan chiqadi"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="kunlikDaqiqa"
          label="Kunlik eng kam vaqt (daqiqa)"
          hint="Faqat o'quv bo'limidagi vaqt sanaladi; radio va boshqa bo'limlar kirmaydi"
          value={form.kunlikDaqiqa}
          disabled={locked}
          onChange={set("kunlikDaqiqa")}
        />
        <NumberField
          id="kunlikSavol"
          label="Kunlik eng kam savol"
          hint="Tugatilgan seanslardagi savollar. Vaqt YOKI savol — bittasi yetsa kun faol"
          value={form.kunlikSavol}
          disabled={locked}
          onChange={set("kunlikSavol")}
        />
        <NumberField
          id="haftalikKun"
          label="Haftada eng kam faol kun (yashil)"
          hint="7 kundan nechtasi faol bo'lsa norma bajarilgan hisoblanadi"
          value={form.haftalikKun}
          disabled={locked}
          onChange={set("haftalikKun")}
        />
        <NumberField
          id="sariqKun"
          label="Sariq chegarasi (kun)"
          hint="Shundan kam bo'lsa qizil; yashil chegaradan kichik bo'lishi shart"
          value={form.sariqKun}
          disabled={locked}
          onChange={set("sariqKun")}
        />
      </div>

      {sariqNotogri && (
        <p className="text-sm text-destructive">
          Sariq chegarasi haftalik normadan kichik bo&apos;lishi kerak
        </p>
      )}
      {chegaradanTashqari && (
        <p className="text-sm text-destructive">Qiymat ruxsat etilgan oraliqdan tashqarida</p>
      )}

      <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
        {sariqNotogri ? (
          <>Sariq chegarasi to&apos;g&apos;rilangach, normaning izohi shu yerda ko&apos;rinadi.</>
        ) : (
          <>
            Hozirgi norma: o&apos;quvchi kuniga kamida <b>{form.kunlikDaqiqa} daqiqa</b> o&apos;quv
            bo&apos;limida ishlashi yoki <b>{form.kunlikSavol} ta</b> savolga javob berishi kerak.
            Haftada shunday <b>{form.haftalikKun} kun</b> bo&apos;lsa — yashil, <b>{sariqOraliq}</b>{" "}
            bo&apos;lsa — sariq, kamroq bo&apos;lsa — qizil. Norma o&apos;zgartirilsa o&apos;tmish ham
            yangi norma bilan hisoblanadi.
          </>
        )}
      </p>

      {canEdit && (
        <div className="flex justify-end">
          <Button
            disabled={locked || sariqNotogri || chegaradanTashqari || draft === null}
            onClick={() => save.mutate(form)}
          >
            {save.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Saqlanmoqda...
              </>
            ) : (
              "Saqlash"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Sahifa fayli**

`client/src/app/(dashboard)/settings/daf/page.tsx`:

```tsx
import { DafNormaSettingsClient } from "@/components/settings/daf-norma-settings-client";

export default function DafNormaSettingsPage() {
  return <DafNormaSettingsClient />;
}
```

- [ ] **Step 3: Menyu, qorovul, breadcrumb**

`client/src/lib/settings-nav.ts` — importga `Smartphone` qo'shing va «Administratsiya» bo'limida `Sabablar` dan keyin:

```ts
      { title: "DaF normasi", url: "/settings/daf", icon: Smartphone, visibleForRoles: [1] },
```

`client/src/components/settings/settings-layout-shell.tsx` — `isCeoRestricted` qatori:

```ts
  // Arxiv va DaF normasi backend'da faqat CEO uchun — CEO bo'lmaganlar linkni
  // ko'rmaydi va sahifaga kirsa 403 oladi, shuning uchun bu yerda ham to'siladi.
  const isCeoRestricted =
    pathname.startsWith("/settings/archive") || pathname.startsWith("/settings/daf");
```

`client/src/lib/breadcrumb-routes.ts` — `holidays: "Dam olish kunlari",` dan keyin:

```ts
  daf: "DaF ilovasi",
  // `/daf/oquvchilar` 15-vazifada paydo bo'ladi; yorliq shu yerda turadi, chunki
  // breadcrumb jadvali bitta fayl va uni ikki marta ochish keraksiz.
  oquvchilar: "O'quvchilar",
```

- [ ] **Step 4: Tekshirish**

```bash
cd client && npm run typecheck && npx eslint src/components/settings/daf-norma-settings-client.tsx src/lib/settings-nav.ts src/components/settings/settings-layout-shell.tsx
```
Expected: toza. Qo'lda: `npm run dev` ochib, CEO bilan `/settings/daf` — to'rt maydon, saqlash ishlaydi; sariqni 4 qilsangiz qizil xabar va tugma o'chadi. Administrator bilan `/settings/daf` → `/settings` ga qaytaradi.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/daf-norma-settings-client.tsx "src/app/(dashboard)/settings/daf/page.tsx" src/lib/settings-nav.ts src/components/settings/settings-layout-shell.tsx src/lib/breadcrumb-routes.ts
git commit -m "$(cat <<'MSG'
Sozlamalar: DaF normasi sahifasi (faqat CEO)

To'rt raqam va jonli tushuntirish — CEO normani real taqsimotga qarab
o'zgartira oladi, deploy kutmaydi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: Markaz turlari va `markaz-surati.ts` (TDD)

**Files:**
- Create: `server/src/app-activity/center/center-app-activity.types.ts`
- Create: `server/src/app-activity/center/markaz-surati.ts`
- Test: `server/src/app-activity/center/markaz-surati.spec.ts`

**Interfaces:**
- Consumes: `Norma`, `Holat` (3-vazifa); `DavrOynasi`, `davrOynasi` (`../stats/davr`); `KunSurati` (`../stats/davr-surati`); `faolKunmi`.
- Produces:
  - `interface KunlikSeans { studentId; sana; faolSoniya; radioSoniya; lernenSoniya; kirdi }` — 8-vazifa SQL qaytaradigan qator
  - `interface KunlikSavol { studentId; sana; savollar; togri }`
  - `oquvchiSurati(oyna: DavrOynasi, seanslar: KunlikSeans[], savollar: KunlikSavol[], norma: Norma): OquvchiSurati`
  - `OquvchiSurati { kunlar: KunSurati[]; faolKun; lernenSoniya; faolSoniya; kirdi; savollar; togri }`
  - Javob shartnomasi turlari (pastda) — 10-, 11-, 13-vazifalar.

- [ ] **Step 1: Turlar fayli**

`server/src/app-activity/center/center-app-activity.types.ts`:

```ts
import { OxirgiFaollik } from '../app-activity-stats.types';
import { Holat, Norma } from '../norma/norma';
import { Daraja, JoriyDaraja } from '../stats/daraja';
import { Davr } from '../stats/davr';
import { KunSurati } from '../stats/davr-surati';

/**
 * Markaz sahifalari javob shartnomasi (dizayn 5–6). Klient
 * `components/daf-center/types.ts` aynan shu nomlar bilan.
 */

/** «Ro'yxatni nusxalash» chegarasi (dizayn 6.4). */
export const TELEFON_CHEGARASI = 2000;

export interface GuruhAzoligi {
  id: string;
  nomi: string;
  daraja: Daraja | null;
  /** Yozuv boshlanishi (ISO) — bir nechta guruhda eng ertasi ko'rsatiladi. */
  boshlanish: string;
  oqituvchilar: { id: number; ism: string }[];
}

/**
 * Servisning ICHKI qatori — populyatsiya + yig'indi + qaror. Filtr, saralash
 * va sahifalash shu ustida ishlaydi (`markaz-royxat.ts`), tashqariga
 * `MarkazOquvchiQatori` chiqadi.
 */
export interface OquvchiHisobi {
  studentId: number;
  ism: string;
  photo: string | null;
  telefon: string;
  otaOnaTelefoni: string | null;
  akkaunt: boolean;
  hechKirmagan: boolean;
  /** Tanlangan davr ichida kamida bitta seansda >= 10 s. */
  kirdi: boolean;
  holat: Holat;
  faolKun: number;
  maxraj: number;
  hisobBoshi: string;
  kerakliKun: number;
  sariqKerak: number;
  /** Tanlangan davr kunlari; `shugullangan` = faol kun (norma bo'yicha). */
  kunlar: KunSurati[];
  /** Har doim oxirgi 30 kun — trend uchun. */
  kun30: KunSurati[];
  lernenSoniya: number;
  savollar: number;
  togri: number;
  foiz: number | null;
  tugatilganDarslar: number;
  oxirgiFaollik: OxirgiFaollik | null;
  guruhlar: GuruhAzoligi[];
  filial: { id: number; nomi: string } | null;
}

export interface MarkazOquvchiQatori {
  studentId: number;
  ism: string;
  photo: string | null;
  guruh: { id: string; nomi: string; daraja: Daraja | null } | null;
  oqituvchi: { id: number; ism: string } | null;
  filial: { id: number; nomi: string } | null;
  akkaunt: boolean;
  hechKirmagan: boolean;
  kirdi: boolean;
  holat: Holat;
  faolKun: number;
  maxraj: number;
  hisobBoshi: string;
  kerakliKun: number;
  sariqKerak: number;
  kunlar: KunSurati[];
  lernenSoniya: number;
  /** `lernenSoniya / maxraj` — kuniga o'rtacha. */
  ortachaKunlikSoniya: number;
  savollar: number;
  togri: number;
  foiz: number | null;
  oxirgiFaollik: OxirgiFaollik | null;
  kurs: JoriyDaraja | null;
}

export interface MarkazKartalari {
  oquvchilar: number;
  akkauntlar: number;
  /** Butun tarixda kamida bir marta kirgan. */
  birMartaKirganlar: number;
  /** Tanlangan davr ichida kirgan. */
  davrdaKirganlar: number;
  yashillar: number;
  /** Davrda kirganlar orasida, `faolKun / maxraj × 7`, 1 kasr. */
  ortachaFaolKunHaftada: number | null;
  /** Davrda kirganlar orasida, `lernenSoniya / maxraj`. */
  ortachaKunlikSoniya: number | null;
  savollar: number;
  togri: number;
  foiz: number | null;
  tugatilganDarslar: number;
}

export interface MarkazVoronka {
  faolOquvchi: number;
  akkauntiBor: number;
  birMartaKirgan: number;
  davrdaKirgan: number;
  normaniBajargan: number;
}

export interface MarkazTrendKuni {
  sana: string;
  kirganlar: number;
  faollar: number;
}

export interface MarkazFilialQatori {
  branchId: number;
  nomi: string;
  oquvchilar: number;
  qamrovFoiz: number | null;
  normaFoiz: number | null;
  ortachaFaolKunHaftada: number | null;
  foiz: number | null;
  tugatilganDarslar: number;
}

export interface MarkazUmumiy {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  norma: Norma;
  kartalar: MarkazKartalari;
  voronka: MarkazVoronka;
  /** Har doim 30 kun. */
  trend: MarkazTrendKuni[];
  /** Faqat scope `null` (hamma filial) bo'lganda; aks holda `[]`. */
  filiallar: MarkazFilialQatori[];
}

export interface MarkazFiltrVariantlari {
  guruhlar: { id: string; nomi: string }[];
  oqituvchilar: { id: number; ism: string }[];
  darajalar: Daraja[];
}

export interface MarkazOquvchilar {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  norma: Norma;
  jami: number;
  sahifa: number;
  sahifaHajmi: number;
  qatorlar: MarkazOquvchiQatori[];
  filtrVariantlari: MarkazFiltrVariantlari;
  /** Scope `null` — «Filial» ustuni ko'rsatiladi. */
  filialUstuni: boolean;
}

export interface MarkazTelefonQatori {
  ism: string;
  guruh: string | null;
  telefon: string;
  otaOnaTelefoni: string | null;
}

export interface MarkazTelefonlar {
  jami: number;
  qisqartirildi: boolean;
  qatorlar: MarkazTelefonQatori[];
}
```

- [ ] **Step 2: Testni yozish**

`server/src/app-activity/center/markaz-surati.spec.ts`:

```ts
import { STANDART_NORMA } from '../norma/norma';
import { davrOynasi } from '../stats/davr';
import { KunlikSavol, KunlikSeans, oquvchiSurati } from './markaz-surati';

// 2026-09-20, 14:00 Toshkent → bugun '2026-09-20', 7 kunlik davr 14..20.
const NOW = new Date('2026-09-20T09:00:00Z');
const AKKAUNT = new Date('2026-08-01T00:00:00Z');

const seans = (sana: string, lernen: number, kirdi = true): KunlikSeans => ({
  studentId: 10001,
  sana,
  faolSoniya: lernen + 60,
  radioSoniya: 0,
  lernenSoniya: lernen,
  kirdi,
});
const savol = (sana: string, savollar: number, togri: number): KunlikSavol => ({
  studentId: 10001,
  sana,
  savollar,
  togri,
});

describe('oquvchiSurati — kunlik qatorlardan bitta o\'quvchi surati (dizayn 3.3)', () => {
  const oyna = davrOynasi(7, NOW, AKKAUNT, '2026-09-13');

  it('davrning 7 kuni tartib bilan chiqadi, hammasi kuzatilgan', () => {
    const s = oquvchiSurati(oyna, [], [], STANDART_NORMA);
    expect(s.kunlar.map((k) => k.sana)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
    expect(s.kunlar.every((k) => k.kuzatilgan)).toBe(true);
    expect(s.faolKun).toBe(0);
    expect(s.kirdi).toBe(false);
  });

  it("vaqt yetgan kun ham, savol yetgan kun ham faol; ikkalasi kam bo'lsa faol emas", () => {
    const s = oquvchiSurati(
      oyna,
      [seans('2026-09-14', 600), seans('2026-09-15', 120), seans('2026-09-16', 599)],
      [savol('2026-09-15', 12, 10), savol('2026-09-16', 11, 11)],
      STANDART_NORMA,
    );
    const faol = Object.fromEntries(s.kunlar.map((k) => [k.sana, k.shugullangan]));
    expect(faol['2026-09-14']).toBe(true);  // vaqt
    expect(faol['2026-09-15']).toBe(true);  // savol
    expect(faol['2026-09-16']).toBe(false); // ikkalasi ham bir kam
    expect(s.faolKun).toBe(2);
  });

  it("yig'indilar: LERNEN soniya, savol, to'g'ri, kirdi", () => {
    const s = oquvchiSurati(
      oyna,
      [seans('2026-09-14', 600), seans('2026-09-18', 300, false)],
      [savol('2026-09-14', 12, 9), savol('2026-09-18', 5, 5)],
      STANDART_NORMA,
    );
    expect(s.lernenSoniya).toBe(900);
    expect(s.faolSoniya).toBe(1020);
    expect(s.savollar).toBe(17);
    expect(s.togri).toBe(14);
    expect(s.kirdi).toBe(true);
    expect(s.kunlar.find((k) => k.sana === '2026-09-18')?.kirdi).toBe(false);
    expect(s.kunlar.find((k) => k.sana === '2026-09-14')?.savollar).toBe(12);
  });

  it("hisob boshidan oldingi kun kuzatilmagan — faol kunga ham, yig'indiga ham kirmaydi", () => {
    // Akkaunt 17-sentabrda ochilgan: 14..16 kuzatilmagan, maxraj 4.
    const kech = davrOynasi(7, NOW, new Date('2026-09-17T05:00:00Z'), '2026-09-13');
    expect(kech.maxraj).toBe(4);
    const s = oquvchiSurati(
      kech,
      [seans('2026-09-15', 900), seans('2026-09-18', 900)],
      [],
      STANDART_NORMA,
    );
    expect(s.kunlar.find((k) => k.sana === '2026-09-15')?.kuzatilgan).toBe(false);
    expect(s.kunlar.find((k) => k.sana === '2026-09-15')?.shugullangan).toBe(false);
    expect(s.faolKun).toBe(1);
    expect(s.lernenSoniya).toBe(900);
  });

  it("davrdan tashqari sana kelsa e'tiborsiz qoladi", () => {
    const s = oquvchiSurati(oyna, [seans('2026-09-01', 900)], [], STANDART_NORMA);
    expect(s.faolKun).toBe(0);
    expect(s.lernenSoniya).toBe(0);
  });
});
```

- [ ] **Step 3: Yiqilishini ko'rish**

```bash
cd server && npx jest src/app-activity/center/markaz-surati
```
Expected: FAIL — `Cannot find module './markaz-surati'`.

- [ ] **Step 4: `markaz-surati.ts`**

```ts
import { faolKunmi, Norma } from '../norma/norma';
import { DavrOynasi } from '../stats/davr';
import { KunSurati } from '../stats/davr-surati';

/**
 * SQL dan kelgan bir (o'quvchi, Toshkent kuni) seans qatori. Qirqish qoidasi
 * `kunlikYigindi()` bilan bir xil — SQL uni takrorlaydi (queries.ts),
 * `scripts/check-daf-markaz.ts` ikkisini solishtiradi.
 */
export interface KunlikSeans {
  studentId: number;
  /** `YYYY-MM-DD`, Toshkent kuni. */
  sana: string;
  faolSoniya: number;
  radioSoniya: number;
  lernenSoniya: number;
  kirdi: boolean;
}

/** Tugatilgan seanslardagi savollar, (o'quvchi, kun) bo'yicha. */
export interface KunlikSavol {
  studentId: number;
  sana: string;
  savollar: number;
  togri: number;
}

export interface OquvchiSurati {
  /** Davr kunlari tartib bilan; `shugullangan` bu yerda = faol kun (norma). */
  kunlar: KunSurati[];
  faolKun: number;
  lernenSoniya: number;
  faolSoniya: number;
  /** Davr ichida kamida bitta kunda kirdi. */
  kirdi: boolean;
  savollar: number;
  togri: number;
}

/**
 * Bitta o'quvchining davr surati — `davrSurati()` ning markaz varianti: kirish
 * seans satrlari emas, SQL allaqachon kunga yig'gan qatorlar. Hisob boshidan
 * oldingi kunlar (`kuzatilgan = false`) maxrajga kirmagani kabi yig'indiga ham
 * kirmaydi — aks holda «kuniga o'rtacha» maxrajdan katta chiqib qolardi.
 */
export function oquvchiSurati(
  oyna: DavrOynasi,
  seanslar: KunlikSeans[],
  savollar: KunlikSavol[],
  norma: Norma,
): OquvchiSurati {
  const seansMap = new Map(seanslar.map((s) => [s.sana, s]));
  const savolMap = new Map(savollar.map((s) => [s.sana, s]));

  let faolKun = 0;
  let lernenSoniya = 0;
  let faolSoniya = 0;
  let savolJami = 0;
  let togri = 0;
  let kirdi = false;

  const kunlar = oyna.kunlar.map((sana): KunSurati => {
    const s = seansMap.get(sana);
    const q = savolMap.get(sana);
    const kuzatilgan = sana >= oyna.hisobBoshi;
    const faol =
      kuzatilgan &&
      faolKunmi(s?.lernenSoniya ?? 0, q?.savollar ?? 0, norma);
    if (kuzatilgan) {
      if (faol) faolKun += 1;
      lernenSoniya += s?.lernenSoniya ?? 0;
      faolSoniya += s?.faolSoniya ?? 0;
      savolJami += q?.savollar ?? 0;
      togri += q?.togri ?? 0;
      if (s?.kirdi) kirdi = true;
    }
    return {
      sana,
      faolSoniya: s?.faolSoniya ?? 0,
      radioSoniya: s?.radioSoniya ?? 0,
      savollar: q?.savollar ?? 0,
      shugullangan: faol,
      kirdi: s?.kirdi ?? false,
      kuzatilgan,
    };
  });

  return { kunlar, faolKun, lernenSoniya, faolSoniya, kirdi, savollar: savolJami, togri };
}
```

- [ ] **Step 5: Test o'tishi**

```bash
cd server && npx jest src/app-activity/center/markaz-surati && npm run typecheck
```
Expected: PASS (5 test), typecheck toza.

- [ ] **Step 6: Commit**

```bash
git add src/app-activity/center/center-app-activity.types.ts src/app-activity/center/markaz-surati.ts src/app-activity/center/markaz-surati.spec.ts
git commit -m "$(cat <<'MSG'
DaF markaz: javob shartnomasi va kunlik qatorlardan o'quvchi surati

SQL kunga yig'gan qatorlarni bitta o'quvchi suratiga aylantiradigan toza
funksiya; faol kun qarori norma.ts dan.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 7: `markaz-royxat.ts` — filtr, saralash, sahifalash (TDD)

**Files:**
- Create: `server/src/app-activity/center/markaz-royxat.ts`
- Test: `server/src/app-activity/center/markaz-royxat.spec.ts`

**Interfaces:**
- Consumes: `OquvchiHisobi`, `GuruhAzoligi`, `MarkazFiltrVariantlari` (6-vazifa); `Holat`, `HOLAT_TARTIBI` (3-vazifa); `Daraja`, `DARAJALAR` (`../stats/daraja`).
- Produces:
  - `const SARALASHLAR = ['holat','faolKun','vaqt','foiz','oxirgi','ism','guruh'] as const`; `type Saralash`; `type Yonalish = 'asc' | 'desc'`
  - `const SAHIFA_HAJMI = 50`
  - `interface RoyxatFiltri { status?: Holat[]; kirgan?: boolean; groupId?: string; teacherId?: number; level?: Daraja; q?: string }`
  - `interface OquvchilarSorovi extends RoyxatFiltri { davr: Davr; sort: Saralash; dir: Yonalish; page: number; pageSize: number }`
  - `filtrla(hisoblar, f): OquvchiHisobi[]`, `sarala(hisoblar, sort, dir): OquvchiHisobi[]`, `sahifala<T>(royxat, sahifa, hajm): { jami; sahifa; qatorlar }`, `filtrVariantlari(hisoblar): MarkazFiltrVariantlari`, `korsatiladiganGuruh(h, groupId?): GuruhAzoligi | null`

- [ ] **Step 1: Test**

`server/src/app-activity/center/markaz-royxat.spec.ts`:

```ts
import { GuruhAzoligi, OquvchiHisobi } from './center-app-activity.types';
import {
  filtrla,
  filtrVariantlari,
  korsatiladiganGuruh,
  sahifala,
  sarala,
} from './markaz-royxat';

const guruh = (
  id: string,
  nomi: string,
  daraja: 'A1' | 'A2' | 'B1' | null,
  oqituvchiId = 20001,
  boshlanish = '2026-09-01T00:00:00.000Z',
): GuruhAzoligi => ({
  id,
  nomi,
  daraja,
  boshlanish,
  oqituvchilar: [{ id: oqituvchiId, ism: `O'qituvchi ${oqituvchiId}` }],
});

function hisob(qism: Partial<OquvchiHisobi>): OquvchiHisobi {
  return {
    studentId: 10001,
    ism: 'Nodira Yusupova',
    photo: null,
    telefon: '901112233',
    otaOnaTelefoni: null,
    akkaunt: true,
    hechKirmagan: false,
    kirdi: true,
    holat: 'YASHIL',
    faolKun: 5,
    maxraj: 7,
    hisobBoshi: '2026-09-14',
    kerakliKun: 4,
    sariqKerak: 2,
    kunlar: [],
    kun30: [],
    lernenSoniya: 3600,
    savollar: 40,
    togri: 30,
    foiz: 75,
    tugatilganDarslar: 2,
    oxirgiFaollik: { vaqt: '2026-09-20T05:00:00.000Z', platforma: 'WEB' },
    guruhlar: [guruh('g-a1', 'A1-07', 'A1')],
    filial: { id: 1, nomi: 'Filial A' },
    ...qism,
  };
}

const HECH = hisob({ studentId: 1, ism: 'Bekzod', holat: 'HECH_KIRMAGAN', kirdi: false, faolKun: 0, oxirgiFaollik: null });
const QIZIL_ESKI = hisob({ studentId: 2, ism: 'Aziza', holat: 'QIZIL', kirdi: false, faolKun: 0, oxirgiFaollik: { vaqt: '2026-08-01T05:00:00.000Z', platforma: 'WEB' } });
const QIZIL_YANGI = hisob({ studentId: 3, ism: 'Dilnoza', holat: 'QIZIL', kirdi: true, faolKun: 1, oxirgiFaollik: { vaqt: '2026-09-19T05:00:00.000Z', platforma: 'WEB' } });
const SARIQ = hisob({ studentId: 4, ism: 'Sardor', holat: 'SARIQ', faolKun: 3, foiz: null, savollar: 0, togri: 0 });
const YASHIL = hisob({ studentId: 5, ism: 'Malika', holat: 'YASHIL', faolKun: 6, lernenSoniya: 7200, guruhlar: [guruh('g-a2', 'A2-01', 'A2', 20002)], telefon: '935556677', otaOnaTelefoni: '901234567' });
const AKKAUNTSIZ = hisob({ studentId: 6, ism: 'Zafar', akkaunt: false, holat: 'AKKAUNT_YOQ', kirdi: false, faolKun: 0, oxirgiFaollik: null });
const HAMMA = [YASHIL, AKKAUNTSIZ, SARIQ, QIZIL_YANGI, HECH, QIZIL_ESKI];

describe('sarala — standart tartib (dizayn 6.2)', () => {
  it("holat: hech kirmagan → qizil (eng eski kirish oldin) → sariq → yashil → akkaunt yo'q", () => {
    expect(sarala(HAMMA, 'holat', 'asc').map((h) => h.ism)).toEqual([
      'Bekzod', 'Aziza', 'Dilnoza', 'Sardor', 'Malika', 'Zafar',
    ]);
  });

  it('desc tartibni teskari qiladi', () => {
    expect(sarala(HAMMA, 'holat', 'desc')[0].ism).toBe('Zafar');
  });

  it("vaqt bo'yicha desc — eng ko'p LERNEN yuqorida", () => {
    expect(sarala(HAMMA, 'vaqt', 'desc')[0].ism).toBe('Malika');
  });

  it("foiz: null eng pastda (asc da boshida) — Sardor", () => {
    expect(sarala(HAMMA, 'foiz', 'asc')[0].ism).toBe('Sardor');
  });

  it("oxirgi: hech qachon kirmaganlar eng yuqorida, keyin eng eskisi", () => {
    const tartib = sarala(HAMMA, 'oxirgi', 'asc').map((h) => h.ism);
    expect(tartib.slice(0, 2).sort()).toEqual(['Bekzod', 'Zafar']);
    expect(tartib[2]).toBe('Aziza');
  });

  it("ism bo'yicha asc — alifbo tartibi", () => {
    expect(sarala(HAMMA, 'ism', 'asc').map((h) => h.ism)).toEqual([
      'Aziza', 'Bekzod', 'Dilnoza', 'Malika', 'Sardor', 'Zafar',
    ]);
  });

  it("faolKun bo'yicha asc — eng kam faol kun yuqorida, teng bo'lsa ism", () => {
    expect(sarala(HAMMA, 'faolKun', 'asc').map((h) => h.ism)).toEqual([
      'Aziza', 'Bekzod', 'Zafar', 'Dilnoza', 'Sardor', 'Malika',
    ]);
  });

  it("guruh bo'yicha desc — oxirgi guruh nomi yuqorida", () => {
    // Faqat Malika A2-01 da, qolganlari A1-07 da — desc uni birinchi qo'yadi.
    expect(sarala(HAMMA, 'guruh', 'desc')[0].ism).toBe('Malika');
  });

  it("kirishni o'zgartirmaydi", () => {
    const nusxa = [...HAMMA];
    sarala(HAMMA, 'ism', 'asc');
    expect(HAMMA).toEqual(nusxa);
  });
});

describe('filtrla (dizayn 6.1)', () => {
  it('holat ro\'yxati — bir nechtasi birga', () => {
    expect(filtrla(HAMMA, { status: ['QIZIL', 'SARIQ'] }).map((h) => h.studentId).sort()).toEqual([2, 3, 4]);
  });

  it("kirgan=false — davrda kirmaganlar (hech kirmagan, eski qizil, akkauntsiz)", () => {
    expect(filtrla(HAMMA, { kirgan: false }).map((h) => h.studentId).sort()).toEqual([1, 2, 6]);
  });

  it("guruh, o'qituvchi, daraja — istalgan faol guruh mos kelsa", () => {
    expect(filtrla(HAMMA, { groupId: 'g-a2' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { teacherId: 20002 }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { level: 'A2' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { level: 'B1' })).toEqual([]);
  });

  it("qidiruv: ism bo'yicha katta-kichik harfsiz, telefon bo'yicha raqamlar", () => {
    expect(filtrla(HAMMA, { q: 'mali' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { q: '93 555' }).map((h) => h.ism)).toEqual(['Malika']);
    expect(filtrla(HAMMA, { q: '9012345' }).map((h) => h.ism)).toEqual(['Malika']); // ota-ona telefoni
  });

  it("ikki xonali raqam telefonga mos deb olinmaydi", () => {
    // '90' hamma telefonda bor — ism bo'yicha ham mos kelmasa bo'sh.
    expect(filtrla(HAMMA, { q: '90' })).toEqual([]);
  });

  it("bo'sh filtr hammani qaytaradi", () => {
    expect(filtrla(HAMMA, {})).toHaveLength(6);
  });
});

describe('sahifala', () => {
  it('50 talik sahifa, raqam chegaradan oshsa oxirgisiga qirqiladi', () => {
    const royxat = Array.from({ length: 120 }, (_, i) => i);
    expect(sahifala(royxat, 1, 50).qatorlar).toHaveLength(50);
    expect(sahifala(royxat, 3, 50).qatorlar).toHaveLength(20);
    expect(sahifala(royxat, 9, 50)).toMatchObject({ jami: 120, sahifa: 3 });
    expect(sahifala([], 1, 50)).toEqual({ jami: 0, sahifa: 1, qatorlar: [] });
  });
});

describe('filtrVariantlari va korsatiladiganGuruh', () => {
  it("guruhlar va o'qituvchilar takrorsiz, ism bo'yicha; darajalar mavjudlari", () => {
    const v = filtrVariantlari(HAMMA);
    expect(v.guruhlar).toEqual([{ id: 'g-a1', nomi: 'A1-07' }, { id: 'g-a2', nomi: 'A2-01' }]);
    expect(v.oqituvchilar.map((o) => o.id)).toEqual([20001, 20002]);
    expect(v.darajalar).toEqual(['A1', 'A2']);
  });

  it("filtr guruhi bo'lsa o'sha, bo'lmasa ro'yxatdagi BIRINCHISI", () => {
    // Nomi bo'yicha 'A' oldinda, sanasi bo'yicha 'B' oldinda — ya'ni ikkala
    // muqobil tartib ham tekshirilyapti. Funksiya o'zi SARALAMAYDI: u massiv
    // tartibiga ishonadi, servis esa eng erta boshlanganini birinchi qo'yadi.
    const ikki = hisob({
      guruhlar: [
        guruh('g-1', 'B', 'A1', 20001, '2026-08-01T00:00:00.000Z'),
        guruh('g-2', 'A', 'A2', 20002, '2026-09-15T00:00:00.000Z'),
      ],
    });
    expect(korsatiladiganGuruh(ikki, 'g-2')?.id).toBe('g-2');
    expect(korsatiladiganGuruh(ikki)?.id).toBe('g-1');
    expect(korsatiladiganGuruh(hisob({ guruhlar: [] }))).toBeNull();
  });

  it("mos kelmaydigan groupId berilsa birinchi guruh qaytadi, null emas", () => {
    const ikki = hisob({ guruhlar: [guruh('g-1', 'A', 'A1'), guruh('g-2', 'B', 'A2', 20002)] });
    expect(korsatiladiganGuruh(ikki, 'boshqa-guruh')?.id).toBe('g-1');
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

```bash
cd server && npx jest src/app-activity/center/markaz-royxat
```
Expected: FAIL — modul yo'q.

- [ ] **Step 3: `markaz-royxat.ts`**

```ts
import { Holat, HOLAT_TARTIBI } from '../norma/norma';
import { Daraja, DARAJALAR } from '../stats/daraja';
import { Davr } from '../stats/davr';
import {
  GuruhAzoligi,
  MarkazFiltrVariantlari,
  OquvchiHisobi,
} from './center-app-activity.types';

/**
 * O'quvchilar ro'yxati ustidagi toza amallar (dizayn 6.1–6.2, 9.3). Hammasi
 * TypeScript da: holat normadan chiqadi, norma SQL ga kirmasin. Populyatsiya
 * ≤ bir necha ming qator — bu ish uchun bemalol yetadi.
 */

export const SARALASHLAR = [
  'holat',
  'faolKun',
  'vaqt',
  'foiz',
  'oxirgi',
  'ism',
  'guruh',
] as const;
export type Saralash = (typeof SARALASHLAR)[number];
export type Yonalish = 'asc' | 'desc';

export const SAHIFA_HAJMI = 50;

export interface RoyxatFiltri {
  status?: Holat[];
  /** `true` — davr ichida kirganlar; `false` — kirmaganlar; yo'q — hammasi. */
  kirgan?: boolean;
  groupId?: string;
  teacherId?: number;
  level?: Daraja;
  /** Ism yoki telefon bo'yicha. */
  q?: string;
}

export interface OquvchilarSorovi extends RoyxatFiltri {
  davr: Davr;
  sort: Saralash;
  dir: Yonalish;
  page: number;
  pageSize: number;
}

const raqamlar = (s: string) => s.replace(/\D/g, '');

/**
 * Telefon mosligi uchun kamida 3 raqam — «90» hamma raqamda bor, u qidiruv
 * emas.
 */
const TELEFON_QIDIRUV_MIN = 3;

export function filtrla(
  hisoblar: OquvchiHisobi[],
  f: RoyxatFiltri,
): OquvchiHisobi[] {
  const q = (f.q ?? '').trim().toLowerCase();
  const qRaqam = raqamlar(q);
  return hisoblar.filter((h) => {
    if (f.status && f.status.length > 0 && !f.status.includes(h.holat))
      return false;
    if (f.kirgan !== undefined && h.kirdi !== f.kirgan) return false;
    if (f.groupId && !h.guruhlar.some((g) => g.id === f.groupId)) return false;
    if (
      f.teacherId !== undefined &&
      !h.guruhlar.some((g) => g.oqituvchilar.some((o) => o.id === f.teacherId))
    )
      return false;
    if (f.level && !h.guruhlar.some((g) => g.daraja === f.level)) return false;
    if (q) {
      const ismMos = h.ism.toLowerCase().includes(q);
      const telMos =
        qRaqam.length >= TELEFON_QIDIRUV_MIN &&
        (raqamlar(h.telefon).includes(qRaqam) ||
          (h.otaOnaTelefoni !== null &&
            raqamlar(h.otaOnaTelefoni).includes(qRaqam)));
      if (!ismMos && !telMos) return false;
    }
    return true;
  });
}

/** Oxirgi kirish: hech qachon (null) eng oldin, keyin eng eskisi. */
function oxirgiTartib(a: OquvchiHisobi, b: OquvchiHisobi): number {
  const vaqt = (h: OquvchiHisobi) =>
    h.oxirgiFaollik ? Date.parse(h.oxirgiFaollik.vaqt) : -Infinity;
  const av = vaqt(a);
  const bv = vaqt(b);
  if (av === bv) return 0;
  return av < bv ? -1 : 1;
}

type Taqqos = (a: OquvchiHisobi, b: OquvchiHisobi) => number;

const ASOSIY: Record<Saralash, Taqqos> = {
  // Eng muammolisi yuqorida; teng holatda eng uzoq kirmagan oldin.
  holat: (a, b) =>
    HOLAT_TARTIBI[a.holat] - HOLAT_TARTIBI[b.holat] || oxirgiTartib(a, b),
  faolKun: (a, b) => a.faolKun - b.faolKun,
  vaqt: (a, b) => a.lernenSoniya - b.lernenSoniya,
  // Foiz yo'q (savol yo'q) — 0 % dan ham past deb olinadi.
  foiz: (a, b) => (a.foiz ?? -1) - (b.foiz ?? -1),
  oxirgi: oxirgiTartib,
  ism: (a, b) => a.ism.localeCompare(b.ism),
  guruh: (a, b) =>
    (a.guruhlar[0]?.nomi ?? '').localeCompare(b.guruhlar[0]?.nomi ?? ''),
};

export function sarala(
  hisoblar: OquvchiHisobi[],
  sort: Saralash,
  dir: Yonalish,
): OquvchiHisobi[] {
  const yon = dir === 'desc' ? -1 : 1;
  const asosiy = ASOSIY[sort];
  return [...hisoblar].sort(
    (a, b) => yon * asosiy(a, b) || a.ism.localeCompare(b.ism),
  );
}

export function sahifala<T>(
  royxat: T[],
  sahifa: number,
  hajm: number,
): { jami: number; sahifa: number; qatorlar: T[] } {
  const jami = royxat.length;
  const oxirgi = Math.max(1, Math.ceil(jami / hajm));
  const s = Math.min(Math.max(1, sahifa), oxirgi);
  return { jami, sahifa: s, qatorlar: royxat.slice((s - 1) * hajm, s * hajm) };
}

/** Filtr tanlagichlari populyatsiyadan — variantlar ma'lumot bilan doim mos. */
export function filtrVariantlari(
  hisoblar: OquvchiHisobi[],
): MarkazFiltrVariantlari {
  const guruhlar = new Map<string, string>();
  const oqituvchilar = new Map<number, string>();
  const darajalar = new Set<Daraja>();
  for (const h of hisoblar) {
    for (const g of h.guruhlar) {
      guruhlar.set(g.id, g.nomi);
      if (g.daraja) darajalar.add(g.daraja);
      for (const o of g.oqituvchilar) oqituvchilar.set(o.id, o.ism);
    }
  }
  return {
    guruhlar: [...guruhlar]
      .map(([id, nomi]) => ({ id, nomi }))
      .sort((a, b) => a.nomi.localeCompare(b.nomi)),
    oqituvchilar: [...oqituvchilar]
      .map(([id, ism]) => ({ id, ism }))
      .sort((a, b) => a.ism.localeCompare(b.ism)),
    darajalar: DARAJALAR.filter((d) => darajalar.has(d)),
  };
}

/**
 * Qatorda ko'rinadigan guruh (dizayn 3.6): filtr guruhi bo'lsa o'sha, bo'lmasa
 * eng erta boshlangan faol yozuv (servis `guruhlar` ni shu tartibda beradi).
 */
export function korsatiladiganGuruh(
  h: OquvchiHisobi,
  groupId?: string,
): GuruhAzoligi | null {
  if (groupId) {
    const mos = h.guruhlar.find((g) => g.id === groupId);
    if (mos) return mos;
  }
  return h.guruhlar[0] ?? null;
}
```

- [ ] **Step 4: Test o'tishi**

```bash
cd server && npx jest src/app-activity/center/markaz-royxat && npm run typecheck
```
Expected: PASS (18 test).

- [ ] **Step 5: Commit**

```bash
git add src/app-activity/center/markaz-royxat.ts src/app-activity/center/markaz-royxat.spec.ts
git commit -m "$(cat <<'MSG'
DaF markaz: ro'yxat filtri, saralash va sahifalash — toza funksiyalar

Standart tartib «eng muammolisi yuqorida»; telefon qidiruvi kamida uch
raqamdan.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 8: `center-app-activity.queries.ts` — to'rt xom SQL yig'indi

**Files:**
- Create: `server/src/app-activity/center/center-app-activity.queries.ts`

**Interfaces:**
- Consumes: `KunlikSeans`, `KunlikSavol` (6-vazifa); `KIRDI_CHEGARASI_S` (`../stats/kunlik-faollik`); `SOAT_ZAXIRASI_S` (`../heartbeat-merge`); `TASHKENT_OFFSET_MS` (`../../common/date/tashkent`).
- Produces (`@Injectable() class CenterAppActivityQueries`):
  - `kunlikSeanslar(companyId: number, ids: number[], davrBoshi: string, bugun: string): Promise<KunlikSeans[]>`
  - `kunlikSavollar(companyId: number, ids: number[], dan: Date): Promise<KunlikSavol[]>`
  - `umumanKirganlar(companyId: number, ids: number[]): Promise<Set<number>>`
  - `tugatilganDarsSoni(companyId: number, ids: number[], dan: Date): Promise<Map<number, number>>`

Birlik testi yo'q — xom SQL mock bilan sinalmaydi. Sintaksis va semantika 9-vazifadagi skript bilan dev (keyin prod) bazada tekshiriladi.

- [ ] **Step 1: Faylni yozish**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TASHKENT_OFFSET_MS } from '../../common/date/tashkent';
import { PrismaService } from '../../prisma/prisma.service';
import { SOAT_ZAXIRASI_S } from '../heartbeat-merge';
import { KIRDI_CHEGARASI_S } from '../stats/kunlik-faollik';
import { KunlikSavol, KunlikSeans } from './markaz-surati';

/**
 * Markaz bo'yicha xom SQL yig'indilar (dizayn 9.3). FAQAT mexanik yig'indi —
 * norma, holat va tartib bu yerda yo'q (`norma.ts`, `markaz-royxat.ts`).
 *
 * Chaqiruvchi `ids` ni `activeStudentWhere()` + filial qamrovi bilan oldindan
 * filtrlaydi (Prisma orqali, ADR-0015); har so'rov qo'shimcha `companyId`
 * shartini oladi. `ids` bo'sh bo'lsa chaqirilmaydi — `Prisma.join([])` xato
 * beradi; servis buni oldin tekshiradi.
 *
 * Toshkent kuni: `StudentAppSession.day` allaqachon Toshkent kuni (DATE).
 * `DafSession.startedAt` va `DafLessonProgress.completedAt` — `timestamp(3)`,
 * vaqt mintaqasisiz UTC; unga +5 soat qo'shib `::date` olish deterministik
 * (ADR-0016, `tashkent.ts`: UTC+5, DST yo'q).
 */
@Injectable()
export class CenterAppActivityQueries {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * (o'quvchi, kun) bo'yicha seans yig'indisi — `kunlikYigindi()` ni aynan
   * takrorlaydi: kunlik faol vaqt shu kun seanslarining
   * `[firstSeenAt, lastSeenAt + 120 s]` oraliqlari birlashmasidan oshmaydi,
   * LERNEN shu nisbatda qisqaradi, radio ham birlashmadan oshmaydi, kirdi =
   * kamida bitta seansda >= 10 s. `range_agg` — PostgreSQL 14+
   * (`scripts/check-pg-version.ts`).
   */
  async kunlikSeanslar(
    companyId: number,
    ids: number[],
    davrBoshi: string,
    bugun: string,
  ): Promise<KunlikSeans[]> {
    return this.prisma.$queryRaw<KunlikSeans[]>`
      WITH s AS (
        SELECT "studentId", "day", "activeSeconds", "radioSeconds",
          COALESCE(FLOOR((sections->>'LERNEN')::numeric), 0)::int AS lernen,
          tsrange("firstSeenAt", "lastSeenAt" + ${SOAT_ZAXIRASI_S} * interval '1 second') AS r
        FROM "StudentAppSession"
        WHERE "companyId" = ${companyId}
          AND "studentId" IN (${Prisma.join(ids)})
          AND "day" BETWEEN ${davrBoshi}::date AND ${bugun}::date
      ),
      k AS (
        SELECT "studentId", "day",
          SUM("activeSeconds")::int AS faol_xom,
          SUM("radioSeconds")::int AS radio_xom,
          SUM(lernen)::int AS lernen_xom,
          BOOL_OR("activeSeconds" >= ${KIRDI_CHEGARASI_S}) AS kirdi,
          range_agg(r) AS birlashma
        FROM s
        GROUP BY "studentId", "day"
      ),
      u AS (
        SELECT k.*,
          (SELECT FLOOR(COALESCE(SUM(EXTRACT(EPOCH FROM (upper(x) - lower(x)))), 0))::int
             FROM unnest(k.birlashma) AS x) AS birlashma_s
        FROM k
      )
      SELECT "studentId",
        to_char("day", 'YYYY-MM-DD') AS sana,
        LEAST(faol_xom, birlashma_s) AS "faolSoniya",
        LEAST(radio_xom, birlashma_s) AS "radioSoniya",
        CASE WHEN faol_xom > 0
          THEN ROUND(lernen_xom * LEAST(faol_xom, birlashma_s)::numeric / faol_xom)::int
          ELSE 0 END AS "lernenSoniya",
        kirdi
      FROM u
    `;
  }

  /**
   * Tugatilgan seanslardagi savollar, (o'quvchi, Toshkent kuni) bo'yicha.
   * Kun — seans BOSHLANGAN kun. `questionCount`/`firstTryCorrect` seans
   * yakunida `seansYigindisi()` bilan yoziladi (ADR-0019) — urinish qoidasi
   * bu yerda qaytadan yozilmaydi.
   */
  async kunlikSavollar(
    companyId: number,
    ids: number[],
    dan: Date,
  ): Promise<KunlikSavol[]> {
    const siljish = TASHKENT_OFFSET_MS / 1000;
    return this.prisma.$queryRaw<KunlikSavol[]>`
      SELECT "studentId",
        to_char(("startedAt" + ${siljish} * interval '1 second')::date, 'YYYY-MM-DD') AS sana,
        SUM(COALESCE("questionCount", 0))::int AS savollar,
        SUM(COALESCE("firstTryCorrect", 0))::int AS togri
      FROM "DafSession"
      WHERE "companyId" = ${companyId}
        AND "studentId" IN (${Prisma.join(ids)})
        AND "finishedAt" IS NOT NULL
        AND "startedAt" >= ${dan}
      GROUP BY "studentId", 2
    `;
  }

  /**
   * Butun tarixda kamida bitta seansda >= 10 s bo'lganlar — «hech qachon
   * kirmagan» (dizayn 3.2) ning teskarisi. Davrga bog'liq emas.
   */
  async umumanKirganlar(companyId: number, ids: number[]): Promise<Set<number>> {
    const rows = await this.prisma.$queryRaw<{ studentId: number }[]>`
      SELECT DISTINCT "studentId"
      FROM "StudentAppSession"
      WHERE "companyId" = ${companyId}
        AND "studentId" IN (${Prisma.join(ids)})
        AND "activeSeconds" >= ${KIRDI_CHEGARASI_S}
    `;
    return new Set(rows.map((r) => r.studentId));
  }

  /**
   * Davrda tugatilgan (yoki qayta tugatilgan — `completedAt` yangilanadi)
   * darslar soni. Nafaqaga chiqarilgan unitlar chiqarib tashlanadi — mavjud
   * `tugatilganDarslar` bilan bir xil shart.
   */
  async tugatilganDarsSoni(
    companyId: number,
    ids: number[],
    dan: Date,
  ): Promise<Map<number, number>> {
    const rows = await this.prisma.$queryRaw<{ studentId: number; soni: number }[]>`
      SELECT p."studentId", COUNT(*)::int AS soni
      FROM "DafLessonProgress" p
      JOIN "DafLesson" l ON l.id = p."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE p."companyId" = ${companyId}
        AND p."studentId" IN (${Prisma.join(ids)})
        AND p."completedAt" >= ${dan}
        AND u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY p."studentId"
    `;
    return new Map(rows.map((r) => [r.studentId, r.soni]));
  }
}
```

- [ ] **Step 2: Tip tekshiruvi**

```bash
cd server && npm run typecheck
```
Expected: toza. (`SOAT_ZAXIRASI_S` `heartbeat-merge.ts` dan eksport qilinganini tasdiqlang: `grep -n "export const SOAT_ZAXIRASI_S" src/app-activity/heartbeat-merge.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/app-activity/center/center-app-activity.queries.ts
git commit -m "$(cat <<'MSG'
DaF markaz: to'rt xom SQL yig'indi

Kunlik seanslar range_agg bilan kunlikYigindi() qoidasida qirqiladi;
savollar tugatilgan seanslardan; hech qachon kirmaganlar; tugatilgan
darslar. Qaror yo'q — faqat sonlar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 9: `check-daf-markaz.ts` — SQL vs TypeScript solishtiruvi

**Files:**
- Create: `server/scripts/check-daf-markaz.ts`

**Interfaces:**
- Consumes: `CenterAppActivityQueries` (8-vazifa), `kunlikYigindi`, `seansSatri`, `mashqNatijasi`.

- [ ] **Step 1: Skript**

```ts
/**
 * check-daf-markaz — READ-ONLY: markaz SQL yig'indisi guruh tabi ishlatadigan
 * TypeScript qoidasi bilan bir xil raqam beradimi (dizayn 9.4).
 *
 * Har (o'quvchi, kun) uchun: faolSoniya, radioSoniya, lernenSoniya, kirdi —
 * SQL `kunlikSeanslar` vs TS `kunlikYigindi()`. Farq (±1 s dan katta) = XATO,
 * exit code 1. Savollar: SQL (tugatilgan seanslar) vs TS `mashqNatijasi`
 * (urinishlar) — faqat KO'RSATILADI, qamrov farqi kutilgan (dizayn 3.5).
 *
 * Usage: npx ts-node --transpile-only scripts/check-daf-markaz.ts [n]            (dev, server/.env)
 *        railway run npx ts-node --transpile-only scripts/check-daf-markaz.ts 30  (prod)
 *
 * Bu faylni hech narsa import qilmaydi — `run(main)` yuklanishda ishga tushadi.
 */
import { PrismaClient } from '@prisma/client';
import { CenterAppActivityQueries } from '../src/app-activity/center/center-app-activity.queries';
import {
  kunlikYigindi,
  seansSatri,
} from '../src/app-activity/stats/kunlik-faollik';
import {
  mashqNatijasi,
  MashqUrinishi,
} from '../src/app-activity/stats/mashq-natijasi';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../src/common/date/tashkent';
import { parseArgs, printHeader, printTable, run, section } from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const { positional } = parseArgs();
  const n = Number(positional[0] ?? 30);
  const bugun = tashkentDateStr(new Date());
  const davrBoshi = addDaysToDateStr(bugun, -29);
  printHeader(`DaF markaz: SQL vs TS — ${n} o'quvchi, ${davrBoshi}..${bugun}`);

  // Faqat davrda seansi bor o'quvchilar — aks holda bo'sh qatorlar solishtiriladi.
  const nomzodlar = await prisma.$queryRaw<{ studentId: number; companyId: number }[]>`
    SELECT "studentId", "companyId" FROM (
      SELECT DISTINCT "studentId", "companyId" FROM "StudentAppSession"
      WHERE "day" >= ${davrBoshi}::date
    ) t ORDER BY random() LIMIT ${n}
  `;
  if (nomzodlar.length === 0) {
    console.log("  Davrda seans yo'q — solishtiradigan narsa yo'q.");
    return;
  }
  const companyId = nomzodlar[0].companyId;
  const ids = nomzodlar
    .filter((r) => r.companyId === companyId)
    .map((r) => r.studentId);

  const queries = new CenterAppActivityQueries(prisma as never);
  const [sqlSeanslar, sqlSavollar, seanslar, urinishlar] = await Promise.all([
    queries.kunlikSeanslar(companyId, ids, davrBoshi, bugun),
    queries.kunlikSavollar(companyId, ids, tashkentDayStartUtc(davrBoshi)),
    prisma.studentAppSession.findMany({
      where: {
        studentId: { in: ids },
        // SQL tomoni ham `companyId` bo'yicha cheklangan (`queries.ts`). Ikki
        // tomon AYNAN bir xil qatorlarni ko'rmasa, skript o'zi yolg'on farq
        // yasaydi va prod yurishida «SQL buzilgan» deb noto'g'ri xabar beradi.
        companyId,
        day: {
          gte: utcMidnightFromDateStr(davrBoshi),
          lte: utcMidnightFromDateStr(bugun),
        },
      },
      select: {
        studentId: true,
        day: true,
        firstSeenAt: true,
        lastSeenAt: true,
        activeSeconds: true,
        radioSeconds: true,
        platform: true,
        sections: true,
      },
    }),
    prisma.dafAttempt.findMany({
      where: {
        studentId: { in: ids },
        companyId,
        createdAt: { gte: tashkentDayStartUtc(davrBoshi) },
      },
      select: {
        studentId: true,
        createdAt: true,
        sessionId: true,
        questionIndex: true,
        attemptNo: true,
        format: true,
        score: true,
        gradingStatus: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // TS tomoni — guruh tabi aynan shu yo'ldan yuradi.
  const ts = new Map<string, { faol: number; radio: number; lernen: number; kirdi: boolean }>();
  for (const id of ids) {
    const yig = kunlikYigindi(
      seanslar.filter((s) => s.studentId === id).map(seansSatri),
    );
    for (const [sana, k] of yig) {
      ts.set(`${id}:${sana}`, {
        faol: k.faolSoniya,
        radio: k.radioSoniya,
        lernen: k.bolim.LERNEN,
        kirdi: k.kirdi,
      });
    }
  }
  const sql = new Map(sqlSeanslar.map((r) => [`${r.studentId}:${r.sana}`, r]));

  section('Kunlik seanslar: SQL vs kunlikYigindi()');
  // ±1 s — FLOOR/ROUND farqi; undan kattasi qoida farqi.
  const yaqin = (x: number, y: number) => Math.abs(x - y) <= 1;
  const farqlar: (string | number)[][] = [];
  const kalitlar = new Set([...ts.keys(), ...sql.keys()]);
  for (const kalit of kalitlar) {
    const a = ts.get(kalit);
    const b = sql.get(kalit);
    if (!a || !b) {
      farqlar.push([kalit, a ? 'faqat TS' : 'faqat SQL', '', '', '']);
      continue;
    }
    if (
      !yaqin(a.faol, b.faolSoniya) ||
      !yaqin(a.radio, b.radioSoniya) ||
      !yaqin(a.lernen, b.lernenSoniya) ||
      a.kirdi !== b.kirdi
    ) {
      farqlar.push([
        kalit,
        `${a.faol}/${b.faolSoniya}`,
        `${a.radio}/${b.radioSoniya}`,
        `${a.lernen}/${b.lernenSoniya}`,
        `${a.kirdi}/${b.kirdi}`,
      ]);
    }
  }
  console.log(`  Solishtirildi: ${kalitlar.size} (o'quvchi, kun) qatori`);
  printTable(
    ["o'quvchi:kun", 'faol TS/SQL', 'radio TS/SQL', 'LERNEN TS/SQL', 'kirdi TS/SQL'],
    farqlar,
  );

  section("Savollar: SQL (tugatilgan seanslar) vs TS (urinishlar) — faqat ma'lumot");
  const savolQatorlari: (string | number)[][] = [];
  for (const id of ids) {
    const sqlJami = sqlSavollar
      .filter((r) => r.studentId === id)
      .reduce((j, r) => j + r.savollar, 0);
    const tsJami = mashqNatijasi(
      urinishlar.filter((u) => u.studentId === id) as MashqUrinishi[],
    ).savollar;
    savolQatorlari.push([id, tsJami, sqlJami, tsJami - sqlJami]);
  }
  printTable(["o'quvchi", 'urinishlardan', 'seanslardan', 'farq'], savolQatorlari, [
    'r', 'r', 'r', 'r',
  ]);

  if (farqlar.length === 0) {
    console.log('\n  ✓ Kunlik vaqt va kirish: SQL va TS bir xil.');
  } else {
    console.log(`\n  ✗ ${farqlar.length} ta farq — dizayn 9.4 buzilgan, SQL ni tekshiring.`);
    process.exitCode = 1;
  }
}

run(main);
```

- [ ] **Step 2: Dev bazada yuritish (sintaksis tekshiruvi)**

```bash
cd server && npx ts-node --transpile-only scripts/check-daf-markaz.ts 10
```
Expected: SQL xatosiz ishlaydi. Dev bazada seans kam — «Davrda seans yo'q» yoki bir necha qator chiqishi normal (memory: dev bazadagi bo'sh natija dalil emas — haqiqiy tekshiruv prod nusxasida, 17-vazifa). SQL sintaksis xatosi bo'lsa — 8-vazifaga qaytib tuzating.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-daf-markaz.ts
git commit -m "$(cat <<'MSG'
check-daf-markaz: markaz SQL yig'indisini kunlikYigindi() bilan solishtiradi

Kunlik qirqish qoidasi ikki joyda (TS va SQL) — bu skript ikkisini bir
xil kirish ustida yuritib, farqni chiqaradi. Relizdan oldin prodda bir
marta, keyin shubha tug'ilganda.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 10: `CenterAppActivityService` (TDD, Prisma mock)

**Files:**
- Create: `server/src/app-activity/center/center-app-activity.service.ts`
- Test: `server/src/app-activity/center/center-app-activity.service.spec.ts`

**Interfaces:**
- Consumes: 3-, 6-, 7-, 8-vazifalar; `AppActivityStatsQueries.{kuzatuvBoshi, oxirgiFaolliklar, kursJamisi, tugatilganDarslar, oxirgiDarsDarajalari}`; `activeStudentWhere`, `ACTIVE_ENROLLMENT_WHERE`; `studentBranchWhere`, `isEmptyScope`, `ReportBranchIds`; `davrOynasi`; `guruhDarajasi`, `joriyDaraja`; `foizi`; `guruhla`.
- Produces (`@Injectable() class CenterAppActivityService`):
  - `umumiy(companyId: number, scope: ReportBranchIds, davr: Davr, now: Date): Promise<MarkazUmumiy>`
  - `oquvchilar(companyId: number, scope: ReportBranchIds, sorov: OquvchilarSorovi, now: Date): Promise<MarkazOquvchilar>`
  - `telefonlar(companyId: number, scope: ReportBranchIds, sorov: OquvchilarSorovi, now: Date): Promise<MarkazTelefonlar>`

- [ ] **Step 1: Test**

`server/src/app-activity/center/center-app-activity.service.spec.ts`:

```ts
import { CenterAppActivityService } from './center-app-activity.service';
import { OquvchilarSorovi } from './markaz-royxat';

// 2026-09-20, 14:00 Toshkent → bugun '2026-09-20'; 7 kun = 14..20; 30 kun = 22.08..20.09.
const NOW = new Date('2026-09-20T09:00:00Z');

const GURUH = {
  id: 'g-a1',
  name: 'A1-07',
  level: 'A1',
  teachers: [{ teacher: { id: 20001, firstName: 'Sardor', lastName: 'Karimov' } }],
};
const FILIAL = { branch: { id: 1, name: 'Filial A' } };
const yozuv = { startDate: new Date('2026-09-01T00:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z'), group: GURUH };

const OQUVCHILAR = [
  {
    id: 10001, firstName: 'Nodira', lastName: 'Yusupova', photo: null, phone: '901112233', parentPhone: null,
    createdAt: new Date('2026-06-01T00:00:00Z'), user: { createdAt: new Date('2026-08-01T00:00:00Z') },
    branches: [FILIAL], enrollments: [yozuv],
  },
  {
    id: 10002, firstName: 'Bekzod', lastName: 'Rasulov', photo: null, phone: '902223344', parentPhone: '905556677',
    createdAt: new Date('2026-06-01T00:00:00Z'), user: { createdAt: new Date('2026-09-01T00:00:00Z') },
    branches: [FILIAL], enrollments: [yozuv],
  },
  {
    id: 10003, firstName: 'Zafar', lastName: 'Toshev', photo: null, phone: '903334455', parentPhone: null,
    createdAt: new Date('2026-06-01T00:00:00Z'), user: null,
    branches: [FILIAL], enrollments: [yozuv],
  },
];

const seans = (sana: string) => ({
  studentId: 10001, sana, faolSoniya: 700, radioSoniya: 0, lernenSoniya: 600, kirdi: true,
});

function qur() {
  const prisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue({
        dafKunlikDaqiqa: 10, dafKunlikSavol: 12, dafHaftalikKun: 4, dafSariqKun: 2,
      }),
    },
    student: { findMany: jest.fn().mockResolvedValue(OQUVCHILAR) },
  };
  const queries = {
    kunlikSeanslar: jest.fn().mockResolvedValue([
      seans('2026-09-14'), seans('2026-09-15'), seans('2026-09-16'), seans('2026-09-17'),
    ]),
    kunlikSavollar: jest.fn().mockResolvedValue([
      { studentId: 10001, sana: '2026-09-14', savollar: 12, togri: 9 },
    ]),
    umumanKirganlar: jest.fn().mockResolvedValue(new Set([10001])),
    tugatilganDarsSoni: jest.fn().mockResolvedValue(new Map([[10001, 2]])),
  };
  const umumiyQueries = {
    kuzatuvBoshi: jest.fn().mockResolvedValue('2026-09-13'),
    oxirgiFaolliklar: jest.fn().mockResolvedValue(
      new Map([[10001, { vaqt: '2026-09-17T06:00:00.000Z', platforma: 'WEB' }]]),
    ),
    kursJamisi: jest.fn().mockResolvedValue({ A1: 24 }),
    tugatilganDarslar: jest.fn().mockResolvedValue(new Map([[10001, { A1: 2 }]])),
    oxirgiDarsDarajalari: jest.fn().mockResolvedValue(new Map([[10001, 'A1']])),
  };
  const service = new CenterAppActivityService(
    prisma as never, queries as never, umumiyQueries as never,
  );
  return { prisma, queries, umumiyQueries, service };
}

const SOROV: OquvchilarSorovi = { davr: 7, sort: 'holat', dir: 'asc', page: 1, pageSize: 50 };

describe('CenterAppActivityService.umumiy', () => {
  it('kartalar, voronka, trend va filiallar bitta o\'tishda (dizayn 5)', async () => {
    const { service, prisma } = qur();
    const r = await service.umumiy(1001, null, 7, NOW);

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 1001, deletedAt: null, status: 'ACTIVE' }),
      }),
    );
    expect(r.norma).toEqual({ kunlikDaqiqa: 10, kunlikSavol: 12, haftalikKun: 4, sariqKun: 2 });
    expect(r.kartalar).toEqual({
      oquvchilar: 3,
      akkauntlar: 2,
      birMartaKirganlar: 1,
      davrdaKirganlar: 1,
      yashillar: 1,
      ortachaFaolKunHaftada: 4,
      ortachaKunlikSoniya: 343, // 2400 / 7
      savollar: 12,
      togri: 9,
      foiz: 75,
      tugatilganDarslar: 2,
    });
    expect(r.voronka).toEqual({
      faolOquvchi: 3, akkauntiBor: 2, birMartaKirgan: 1, davrdaKirgan: 1, normaniBajargan: 1,
    });
    expect(r.trend).toHaveLength(30);
    expect(r.trend[0].sana).toBe('2026-08-22');
    expect(r.trend.find((t) => t.sana === '2026-09-14')).toEqual({
      sana: '2026-09-14', kirganlar: 1, faollar: 1,
    });
    expect(r.trend.find((t) => t.sana === '2026-09-19')).toEqual({
      sana: '2026-09-19', kirganlar: 0, faollar: 0,
    });
    expect(r.filiallar).toEqual([
      expect.objectContaining({
        branchId: 1, nomi: 'Filial A', oquvchilar: 3, qamrovFoiz: 33, normaFoiz: 33,
        ortachaFaolKunHaftada: 4, foiz: 75, tugatilganDarslar: 2,
      }),
    ]);
  });

  it("filial tanlangan bo'lsa filiallar jadvali bo'sh va where filial shartini oladi", async () => {
    const { service, prisma } = qur();
    const r = await service.umumiy(1001, [1], 7, NOW);
    expect(r.filiallar).toEqual([]);
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branches: { some: { branchId: { in: [1] } } } }),
      }),
    );
  });

  it("bo'sh qamrov ([]) — hech qaysi so'rov ketmaydi, natija bo'sh (fail-closed)", async () => {
    const { service, prisma, queries } = qur();
    const r = await service.umumiy(1001, [], 7, NOW);
    // Normani o'qish ham so'rov — «bazaga so'rov ketmaydi» shu demak.
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(queries.kunlikSeanslar).not.toHaveBeenCalled();
    expect(r.kartalar.oquvchilar).toBe(0);
    expect(r.voronka.faolOquvchi).toBe(0);
    expect(r.trend).toHaveLength(30);
  });

  it("30 kunlik davrda tugatilgan darslar 30 kun boshidan so'raladi", async () => {
    const { service, queries } = qur();
    await service.umumiy(1001, null, 30, NOW);
    const dan: Date = queries.tugatilganDarsSoni.mock.calls[0][2];
    // 2026-08-22 Toshkent 00:00 = 2026-08-21T19:00:00Z
    expect(dan.toISOString()).toBe('2026-08-21T19:00:00.000Z');
  });
});

describe('CenterAppActivityService.oquvchilar', () => {
  it('standart tartib: hech kirmagan → yashil → akkaunt yo\'q; kurs faqat sahifadagilar uchun', async () => {
    const { service, umumiyQueries } = qur();
    const r = await service.oquvchilar(1001, null, SOROV, NOW);

    expect(r.jami).toBe(3);
    expect(r.qatorlar.map((q) => [q.studentId, q.holat])).toEqual([
      [10002, 'HECH_KIRMAGAN'],
      [10001, 'YASHIL'],
      [10003, 'AKKAUNT_YOQ'],
    ]);
    const nodira = r.qatorlar[1];
    expect(nodira).toMatchObject({
      ism: 'Nodira Yusupova',
      guruh: { id: 'g-a1', nomi: 'A1-07', daraja: 'A1' },
      oqituvchi: { id: 20001, ism: 'Sardor Karimov' },
      filial: { id: 1, nomi: 'Filial A' },
      kirdi: true, faolKun: 4, maxraj: 7, kerakliKun: 4, sariqKerak: 2,
      lernenSoniya: 2400, ortachaKunlikSoniya: 343, savollar: 12, togri: 9, foiz: 75,
      kurs: { daraja: 'A1', tugatilgan: 2, jami: 24 },
    });
    expect(nodira.kunlar).toHaveLength(7);
    expect(nodira.kunlar[0]).toMatchObject({ sana: '2026-09-14', shugullangan: true, kirdi: true });

    expect(r.filtrVariantlari).toEqual({
      guruhlar: [{ id: 'g-a1', nomi: 'A1-07' }],
      oqituvchilar: [{ id: 20001, ism: 'Sardor Karimov' }],
      darajalar: ['A1'],
    });
    expect(r.filialUstuni).toBe(true);
    expect(umumiyQueries.tugatilganDarslar).toHaveBeenCalledWith([10002, 10001, 10003]);
  });

  it('holat filtri va sahifalash', async () => {
    const { service, umumiyQueries } = qur();
    const r = await service.oquvchilar(1001, null, { ...SOROV, status: ['YASHIL'] }, NOW);
    expect(r.jami).toBe(1);
    expect(r.qatorlar[0].studentId).toBe(10001);

    const s = await service.oquvchilar(1001, null, { ...SOROV, pageSize: 1, page: 2 }, NOW);
    expect(s).toMatchObject({ jami: 3, sahifa: 2, sahifaHajmi: 1 });
    expect(s.qatorlar.map((q) => q.studentId)).toEqual([10001]);
    expect(umumiyQueries.tugatilganDarslar).toHaveBeenLastCalledWith([10001]);
  });

  it("bo'sh qamrov — bo'sh ro'yxat, hech qaysi so'rov chaqirilmaydi", async () => {
    const { service, prisma, umumiyQueries } = qur();
    const r = await service.oquvchilar(1001, [], SOROV, NOW);
    expect(r).toMatchObject({ jami: 0, qatorlar: [], filialUstuni: false });
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(umumiyQueries.kursJamisi).not.toHaveBeenCalled();
  });
});

describe('CenterAppActivityService.telefonlar', () => {
  it("joriy filtr bo'yicha hamma qator, ism/guruh/telefonlar bilan", async () => {
    const { service } = qur();
    const r = await service.telefonlar(1001, null, { ...SOROV, status: ['HECH_KIRMAGAN'] }, NOW);
    expect(r).toEqual({
      jami: 1,
      qisqartirildi: false,
      qatorlar: [
        { ism: 'Bekzod Rasulov', guruh: 'A1-07', telefon: '902223344', otaOnaTelefoni: '905556677' },
      ],
    });
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

```bash
cd server && npx jest src/app-activity/center/center-app-activity.service
```
Expected: FAIL — modul yo'q.

- [ ] **Step 3: Servis**

`server/src/app-activity/center/center-app-activity.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { tashkentDayStartUtc } from '../../common/date/tashkent';
import {
  isEmptyScope,
  ReportBranchIds,
  studentBranchWhere,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
} from '../../students/shared/active-student-where';
import { AppActivityStatsQueries } from '../app-activity-stats.queries';
import {
  holat,
  kerakliKunlar,
  Norma,
  normaniOqi,
  STANDART_NORMA,
} from '../norma/norma';
import { guruhDarajasi, JoriyDaraja, joriyDaraja } from '../stats/daraja';
import { Davr, davrOynasi } from '../stats/davr';
import { guruhla } from '../stats/kunlik-faollik';
import { foizi } from '../stats/mashq-natijasi';
import { CenterAppActivityQueries } from './center-app-activity.queries';
import {
  GuruhAzoligi,
  MarkazFilialQatori,
  MarkazOquvchilar,
  MarkazOquvchiQatori,
  MarkazTelefonlar,
  MarkazUmumiy,
  OquvchiHisobi,
  TELEFON_CHEGARASI,
} from './center-app-activity.types';
import {
  filtrla,
  filtrVariantlari,
  korsatiladiganGuruh,
  OquvchilarSorovi,
  sahifala,
  sarala,
} from './markaz-royxat';
import { oquvchiSurati } from './markaz-surati';

/** Trend va xarita har doim 30 kun (dizayn 5.3). */
const XARITA_KUNLARI = 30;

interface Yigindi {
  norma: Norma;
  bugun: string;
  kuzatuvBoshi: string | null;
  kunlar30: string[];
  hisoblar: OquvchiHisobi[];
}

/**
 * Markaz bo'yicha ilova faolligi (dizayn 9.3). So'rovlar soni o'quvchilar
 * sonidan qat'i nazar doimiy: norma, populyatsiya (Prisma —
 * `activeStudentWhere()`, ADR-0015), kuzatuv boshi, to'rt xom yig'indi,
 * oxirgi faollik — keyin hamma qaror TypeScript da. Kurs ustuni faqat
 * sahifadagi qatorlar uchun (uch qo'shimcha so'rov).
 *
 * Filial: `scope` `@BranchScope()` dan keladi (sarlavhadagi tanlov ∩ ruxsat).
 * `[]` — hech narsa (fail-closed, ADR-0002): bazaga so'rov ketmaydi.
 */
@Injectable()
export class CenterAppActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queries: CenterAppActivityQueries,
    private readonly umumiyQueries: AppActivityStatsQueries,
  ) {}

  async umumiy(
    companyId: number,
    scope: ReportBranchIds,
    davr: Davr,
    now: Date,
  ): Promise<MarkazUmumiy> {
    const y = await this.yig(companyId, scope, davr, now);
    const kirganlar = y.hisoblar.filter((h) => h.kirdi);
    const savollar = jam(y.hisoblar, (h) => h.savollar);
    const togri = jam(y.hisoblar, (h) => h.togri);
    const kartalar = {
      oquvchilar: y.hisoblar.length,
      akkauntlar: y.hisoblar.filter((h) => h.akkaunt).length,
      birMartaKirganlar: y.hisoblar.filter((h) => h.akkaunt && !h.hechKirmagan).length,
      davrdaKirganlar: kirganlar.length,
      yashillar: y.hisoblar.filter((h) => h.holat === 'YASHIL').length,
      // O'rtachalar davrda kirganlar orasida — nollar o'rtachani yutmasin
      // (guruh tabi ham shunday, dizayn 5.1).
      ortachaFaolKunHaftada: ortacha(kirganlar, (h) => (h.faolKun / h.maxraj) * 7, 1),
      ortachaKunlikSoniya: ortacha(kirganlar, (h) => h.lernenSoniya / h.maxraj, 0),
      savollar,
      togri,
      foiz: foizi(togri, savollar),
      tugatilganDarslar: jam(y.hisoblar, (h) => h.tugatilganDarslar),
    };
    return {
      davr,
      bugun: y.bugun,
      kuzatuvBoshi: y.kuzatuvBoshi,
      norma: y.norma,
      kartalar,
      voronka: {
        faolOquvchi: kartalar.oquvchilar,
        akkauntiBor: kartalar.akkauntlar,
        birMartaKirgan: kartalar.birMartaKirganlar,
        davrdaKirgan: kartalar.davrdaKirganlar,
        normaniBajargan: kartalar.yashillar,
      },
      // Hamma o'quvchining kun30 bir xil 30 sanani qamraydi (davrOynasi kunlari
      // faqat `now` ga bog'liq), shuning uchun indeks bo'yicha yig'sa bo'ladi.
      trend: y.kunlar30.map((sana, i) => ({
        sana,
        kirganlar: y.hisoblar.filter((h) => h.kun30[i]?.kirdi).length,
        faollar: y.hisoblar.filter((h) => h.kun30[i]?.shugullangan).length,
      })),
      filiallar: scope === null ? filialQatorlari(y.hisoblar) : [],
    };
  }

  async oquvchilar(
    companyId: number,
    scope: ReportBranchIds,
    sorov: OquvchilarSorovi,
    now: Date,
  ): Promise<MarkazOquvchilar> {
    const y = await this.yig(companyId, scope, sorov.davr, now);
    const tanlangan = sarala(filtrla(y.hisoblar, sorov), sorov.sort, sorov.dir);
    const s = sahifala(tanlangan, sorov.page, sorov.pageSize);
    const kurslar = await this.kurslar(s.qatorlar, sorov.groupId);
    return {
      davr: sorov.davr,
      bugun: y.bugun,
      kuzatuvBoshi: y.kuzatuvBoshi,
      norma: y.norma,
      jami: s.jami,
      sahifa: s.sahifa,
      sahifaHajmi: sorov.pageSize,
      qatorlar: s.qatorlar.map((h) =>
        qator(h, sorov.groupId, kurslar.get(h.studentId) ?? null),
      ),
      filtrVariantlari: filtrVariantlari(y.hisoblar),
      filialUstuni: scope === null,
    };
  }

  async telefonlar(
    companyId: number,
    scope: ReportBranchIds,
    sorov: OquvchilarSorovi,
    now: Date,
  ): Promise<MarkazTelefonlar> {
    const y = await this.yig(companyId, scope, sorov.davr, now);
    const tanlangan = sarala(filtrla(y.hisoblar, sorov), sorov.sort, sorov.dir);
    return {
      jami: tanlangan.length,
      qisqartirildi: tanlangan.length > TELEFON_CHEGARASI,
      qatorlar: tanlangan.slice(0, TELEFON_CHEGARASI).map((h) => ({
        ism: h.ism,
        guruh: korsatiladiganGuruh(h, sorov.groupId)?.nomi ?? null,
        telefon: h.telefon,
        otaOnaTelefoni: h.otaOnaTelefoni,
      })),
    };
  }

  /** Kurs ustuni — guruh tabi bilan bir xil manba, faqat sahifadagi o'quvchilar. */
  private async kurslar(
    qatorlar: OquvchiHisobi[],
    groupId?: string,
  ): Promise<Map<number, JoriyDaraja>> {
    if (qatorlar.length === 0) return new Map();
    const ids = qatorlar.map((h) => h.studentId);
    const [jami, tugatilganlar, oxirgiDarajalar] = await Promise.all([
      this.umumiyQueries.kursJamisi(),
      this.umumiyQueries.tugatilganDarslar(ids),
      this.umumiyQueries.oxirgiDarsDarajalari(ids),
    ]);
    return new Map(
      qatorlar.map((h) => [
        h.studentId,
        joriyDaraja({
          oxirgiDarsDarajasi: oxirgiDarajalar.get(h.studentId) ?? null,
          guruhDarajasi: korsatiladiganGuruh(h, groupId)?.daraja ?? null,
          tugatilgan: tugatilganlar.get(h.studentId) ?? {},
          jami,
        }),
      ]),
    );
  }

  private async yig(
    companyId: number,
    scope: ReportBranchIds,
    davr: Davr,
    now: Date,
  ): Promise<Yigindi> {
    const bosh30 = davrOynasi(XARITA_KUNLARI, now, now, null);
    const boshDavr = davrOynasi(davr, now, now, null);

    // Bo'sh qamrov tekshiruvi normani o'qishdan ham OLDIN turadi (ADR-0002).
    // O'qiladigan narsa filialga bog'liq bo'lmagan kompaniya sozlamasi, ya'ni
    // hech narsa sizmaydi — lekin bu klassning o'z shartnomasi «bazaga so'rov
    // ketmaydi» deydi, va yarim bajarilgan va'da keyingi o'quvchini adashtiradi.
    // Javobda standart norma qaytadi: ekranda rang beradigan o'quvchi yo'q.
    if (isEmptyScope(scope)) {
      return {
        norma: STANDART_NORMA,
        bugun: bosh30.bugun,
        kuzatuvBoshi: null,
        kunlar30: bosh30.kunlar,
        hisoblar: [],
      };
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        dafKunlikDaqiqa: true,
        dafKunlikSavol: true,
        dafHaftalikKun: true,
        dafSariqKun: true,
      },
    });
    const norma = company ? normaniOqi(company) : STANDART_NORMA;
    const bosh: Yigindi = {
      norma,
      bugun: bosh30.bugun,
      kuzatuvBoshi: null,
      kunlar30: bosh30.kunlar,
      hisoblar: [],
    };

    const [oquvchilar, kuzatuvBoshi] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...activeStudentWhere(),
          ...studentBranchWhere(scope),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photo: true,
          phone: true,
          parentPhone: true,
          createdAt: true,
          user: { select: { createdAt: true } },
          branches: {
            select: { branch: { select: { id: true, name: true } } },
            take: 1,
          },
          enrollments: {
            where: ACTIVE_ENROLLMENT_WHERE,
            select: {
              startDate: true,
              createdAt: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                  teachers: {
                    select: {
                      teacher: {
                        select: { id: true, firstName: true, lastName: true },
                      },
                    },
                    orderBy: { teacherId: 'asc' },
                  },
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
      this.umumiyQueries.kuzatuvBoshi(companyId),
    ]);
    if (oquvchilar.length === 0) return { ...bosh, kuzatuvBoshi };
    const ids = oquvchilar.map((s) => s.id);

    const [seanslar, savollar, umumanKirganlar, darslar, oxirgilar] =
      await Promise.all([
        this.queries.kunlikSeanslar(companyId, ids, bosh30.davrBoshi, bosh30.bugun),
        this.queries.kunlikSavollar(companyId, ids, tashkentDayStartUtc(bosh30.davrBoshi)),
        this.queries.umumanKirganlar(companyId, ids),
        this.queries.tugatilganDarsSoni(companyId, ids, tashkentDayStartUtc(boshDavr.davrBoshi)),
        this.umumiyQueries.oxirgiFaolliklar(ids),
      ]);
    const seansMap = guruhla(seanslar, (r) => r.studentId);
    const savolMap = guruhla(savollar, (r) => r.studentId);

    const hisoblar = oquvchilar.map((s): OquvchiHisobi => {
      const akkaunt = s.user !== null;
      const akkauntKuni = s.user?.createdAt ?? s.createdAt;
      const oyna = davrOynasi(davr, now, akkauntKuni, kuzatuvBoshi);
      const surat = oquvchiSurati(oyna, seansMap.get(s.id) ?? [], savolMap.get(s.id) ?? [], norma);
      const surat30 =
        davr === XARITA_KUNLARI
          ? surat
          : oquvchiSurati(
              davrOynasi(XARITA_KUNLARI, now, akkauntKuni, kuzatuvBoshi),
              seansMap.get(s.id) ?? [],
              savolMap.get(s.id) ?? [],
              norma,
            );
      const hechKirmagan = akkaunt && !umumanKirganlar.has(s.id);
      return {
        studentId: s.id,
        ism: `${s.firstName} ${s.lastName}`.trim(),
        photo: s.photo,
        telefon: s.phone,
        otaOnaTelefoni: s.parentPhone,
        akkaunt,
        hechKirmagan,
        kirdi: surat.kirdi,
        holat: holat({ akkaunt, hechKirmagan, faolKun: surat.faolKun, maxraj: oyna.maxraj }, norma),
        faolKun: surat.faolKun,
        maxraj: oyna.maxraj,
        hisobBoshi: oyna.hisobBoshi,
        ...kerakliKunlar(oyna.maxraj, norma),
        kunlar: surat.kunlar,
        kun30: surat30.kunlar,
        lernenSoniya: surat.lernenSoniya,
        savollar: surat.savollar,
        togri: surat.togri,
        foiz: foizi(surat.togri, surat.savollar),
        tugatilganDarslar: darslar.get(s.id) ?? 0,
        oxirgiFaollik: oxirgilar.get(s.id) ?? null,
        guruhlar: s.enrollments
          .map(
            (e): GuruhAzoligi => ({
              id: e.group.id,
              nomi: e.group.name,
              daraja: guruhDarajasi(e.group.level),
              boshlanish: (e.startDate ?? e.createdAt).toISOString(),
              oqituvchilar: e.group.teachers.map((t) => ({
                id: t.teacher.id,
                ism: `${t.teacher.firstName} ${t.teacher.lastName}`.trim(),
              })),
            }),
          )
          .sort((a, b) => a.boshlanish.localeCompare(b.boshlanish)),
        filial: s.branches[0]
          ? { id: s.branches[0].branch.id, nomi: s.branches[0].branch.name }
          : null,
      };
    });

    return { norma, bugun: bosh30.bugun, kuzatuvBoshi, kunlar30: bosh30.kunlar, hisoblar };
  }
}

function jam<T>(r: T[], f: (x: T) => number): number {
  return r.reduce((j, x) => j + f(x), 0);
}

function ortacha<T>(r: T[], f: (x: T) => number, kasr: number): number | null {
  if (r.length === 0) return null;
  const k = 10 ** kasr;
  return Math.round((jam(r, f) / r.length) * k) / k;
}

function qator(
  h: OquvchiHisobi,
  groupId: string | undefined,
  kurs: JoriyDaraja | null,
): MarkazOquvchiQatori {
  const g = korsatiladiganGuruh(h, groupId);
  return {
    studentId: h.studentId,
    ism: h.ism,
    photo: h.photo,
    guruh: g ? { id: g.id, nomi: g.nomi, daraja: g.daraja } : null,
    oqituvchi: g?.oqituvchilar[0] ?? null,
    filial: h.filial,
    akkaunt: h.akkaunt,
    hechKirmagan: h.hechKirmagan,
    kirdi: h.kirdi,
    holat: h.holat,
    faolKun: h.faolKun,
    maxraj: h.maxraj,
    hisobBoshi: h.hisobBoshi,
    kerakliKun: h.kerakliKun,
    sariqKerak: h.sariqKerak,
    kunlar: h.kunlar,
    lernenSoniya: h.lernenSoniya,
    ortachaKunlikSoniya: Math.round(h.lernenSoniya / h.maxraj),
    savollar: h.savollar,
    togri: h.togri,
    foiz: h.foiz,
    oxirgiFaollik: h.oxirgiFaollik,
    kurs,
  };
}

/** Filiallar jadvali (dizayn 5.4) — o'quvchining `StudentBranch` filiali bo'yicha. */
function filialQatorlari(hisoblar: OquvchiHisobi[]): MarkazFilialQatori[] {
  const guruhlar = new Map<number, { nomi: string; royxat: OquvchiHisobi[] }>();
  for (const h of hisoblar) {
    const kalit = h.filial?.id ?? 0;
    const g = guruhlar.get(kalit) ?? { nomi: h.filial?.nomi ?? 'Filialsiz', royxat: [] };
    g.royxat.push(h);
    guruhlar.set(kalit, g);
  }
  return [...guruhlar]
    .map(([branchId, g]): MarkazFilialQatori => {
      const kirganlar = g.royxat.filter((h) => h.kirdi);
      const savollar = jam(g.royxat, (h) => h.savollar);
      const togri = jam(g.royxat, (h) => h.togri);
      return {
        branchId,
        nomi: g.nomi,
        oquvchilar: g.royxat.length,
        qamrovFoiz: foizi(g.royxat.filter((h) => h.akkaunt && !h.hechKirmagan).length, g.royxat.length),
        normaFoiz: foizi(g.royxat.filter((h) => h.holat === 'YASHIL').length, g.royxat.length),
        ortachaFaolKunHaftada: ortacha(kirganlar, (h) => (h.faolKun / h.maxraj) * 7, 1),
        foiz: foizi(togri, savollar),
        tugatilganDarslar: jam(g.royxat, (h) => h.tugatilganDarslar),
      };
    })
    .sort((a, b) => b.oquvchilar - a.oquvchilar);
}
```

- [ ] **Step 4: Test o'tishi**

```bash
cd server && npx jest src/app-activity/center && npm run typecheck && npx jest src/students/shared/active-student-policy.spec.ts
```
Expected: hammasi PASS. `active-student-policy.spec.ts` yangi `student.findMany` ni `activeStudentWhere()` bilan ko'rib, manifestga tushirmaydi.

- [ ] **Step 5: Commit**

```bash
git add src/app-activity/center/center-app-activity.service.ts src/app-activity/center/center-app-activity.service.spec.ts
git commit -m "$(cat <<'MSG'
DaF markaz servisi: populyatsiya + yig'indi + qaror, so'rovlar soni doimiy

Prisma activeStudentWhere() + filial qamrovi → to'rt xom yig'indi → holat,
saralash, sahifalash TypeScript da. Kurs ustuni faqat sahifadagi 50 kishi
uchun. Bo'sh qamrovda bazaga so'rov ketmaydi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 11: Kontroller, DTO, modul (TDD)

**Files:**
- Create: `server/src/app-activity/dto/center-students-query.dto.ts`
- Create: `server/src/app-activity/dto/center-students-query.dto.spec.ts`
- Create: `server/src/app-activity/center/center-app-activity.controller.ts`
- Create: `server/src/app-activity/center/center-app-activity.controller.spec.ts`
- Modify: `server/src/app-activity/app-activity.module.ts`

**Interfaces:**
- Consumes: `CenterAppActivityService` (10), `OquvchilarSorovi`, `SAHIFA_HAJMI`, `SARALASHLAR` (7), `HOLATLAR` (3), `DARAJALAR`, `davrniOqi`, `toStringArray`, `BranchScope`, `CurrentUser`, `Roles`, `RolesGuard`, `ReportBranchIds`.
- Produces: `GET /api/app-activity/center/summary?period=`, `GET /api/app-activity/center/students?...`, `GET /api/app-activity/center/students/phones?...` — rollar CEO, Branch Director, Administrator; filial `@BranchScope()`.

- [ ] **Step 1: DTO testi**

`server/src/app-activity/dto/center-students-query.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CenterStudentsQueryDto, sorovniOqi } from './center-students-query.dto';

async function tekshir(query: Record<string, unknown>) {
  const dto = plainToInstance(CenterStudentsQueryDto, query);
  return { dto, xatolar: await validate(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

describe('CenterStudentsQueryDto', () => {
  it("vergul bilan bir nechta holat massivga aylanadi", async () => {
    const { dto, xatolar } = await tekshir({ status: 'QIZIL,SARIQ', kirgan: 'yoq', page: '2' });
    expect(xatolar).toEqual([]);
    expect(dto.status).toEqual(['QIZIL', 'SARIQ']);
    expect(dto.page).toBe(2);
  });

  it("noma'lum holat, davr yoki katta sahifa hajmi rad etiladi", async () => {
    expect((await tekshir({ status: 'BINAFSHA' })).xatolar).not.toEqual([]);
    expect((await tekshir({ period: '15' })).xatolar).not.toEqual([]);
    expect((await tekshir({ pageSize: '500' })).xatolar).not.toEqual([]);
    expect((await tekshir({ sort: 'telefon' })).xatolar).not.toEqual([]);
  });

  it("bo'sh so'rov standartlarga tushadi", async () => {
    const { dto } = await tekshir({});
    expect(sorovniOqi(dto)).toEqual({
      davr: 7,
      status: undefined,
      kirgan: undefined,
      groupId: undefined,
      teacherId: undefined,
      level: undefined,
      q: undefined,
      sort: 'holat',
      dir: 'asc',
      page: 1,
      pageSize: 50,
    });
  });

  it("kirgan 'ha'/'yoq' mantiqiy qiymatga aylanadi", async () => {
    expect(sorovniOqi((await tekshir({ kirgan: 'ha' })).dto).kirgan).toBe(true);
    expect(sorovniOqi((await tekshir({ kirgan: 'yoq' })).dto).kirgan).toBe(false);
  });
});
```

- [ ] **Step 2: DTO**

`server/src/app-activity/dto/center-students-query.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toStringArray } from '../../common/dto/to-array';
import {
  OquvchilarSorovi,
  SAHIFA_HAJMI,
  SARALASHLAR,
  Saralash,
  Yonalish,
} from '../center/markaz-royxat';
import { Holat, HOLATLAR } from '../norma/norma';
import { Daraja, DARAJALAR } from '../stats/daraja';
import { davrniOqi } from '../stats/davr';

/** `GET /app-activity/center/students` va `/students/phones` (dizayn 6.1). */
export class CenterStudentsQueryDto {
  @IsOptional()
  @IsIn(['7', '30'])
  period?: string;

  /** `?status=QIZIL,SARIQ` — bir nechtasi birga (server/CLAUDE.md ko'p qiymatli filtr). */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(HOLATLAR, { each: true })
  status?: Holat[];

  @IsOptional()
  @IsIn(['ha', 'yoq'])
  kirgan?: 'ha' | 'yoq';

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsIn(DARAJALAR)
  level?: Daraja;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(SARALASHLAR)
  sort?: Saralash;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: Yonalish;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export function sorovniOqi(q: CenterStudentsQueryDto): OquvchilarSorovi {
  return {
    davr: davrniOqi(q.period),
    status: q.status,
    kirgan: q.kirgan === undefined ? undefined : q.kirgan === 'ha',
    groupId: q.groupId,
    teacherId: q.teacherId,
    level: q.level,
    q: q.q,
    sort: q.sort ?? 'holat',
    dir: q.dir ?? 'asc',
    page: q.page ?? 1,
    pageSize: q.pageSize ?? SAHIFA_HAJMI,
  };
}
```

- [ ] **Step 3: DTO testi o'tishi**

```bash
cd server && npx jest src/app-activity/dto/center-students-query
```
Expected: PASS (4 test).

- [ ] **Step 4: Kontroller testi**

`server/src/app-activity/center/center-app-activity.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CenterAppActivityController } from './center-app-activity.controller';

function mockExecutionContext(handler: unknown, roles: string[]) {
  return {
    getHandler: () => handler,
    getClass: () => CenterAppActivityController,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as never;
}

describe('CenterAppActivityController', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const markaz = {
    umumiy: jest.fn().mockResolvedValue({ ok: 1 }),
    oquvchilar: jest.fn().mockResolvedValue({ ok: 2 }),
    telefonlar: jest.fn().mockResolvedValue({ ok: 3 }),
  };
  const controller = new CenterAppActivityController(markaz as never);

  beforeEach(() => jest.clearAllMocks());

  it("sinf darajasida rollar: CEO, Branch Director, Administrator — o'qituvchi yo'q", () => {
    expect(reflector.get<string[]>(ROLES_KEY, CenterAppActivityController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
    for (const metod of ['umumiy', 'oquvchilar', 'telefonlar'] as const) {
      expect(guard.canActivate(mockExecutionContext(controller[metod], ['Administrator']))).toBe(true);
      expect(() =>
        guard.canActivate(mockExecutionContext(controller[metod], ['Teacher'])),
      ).toThrow(ForbiddenException);
    }
  });

  it("umumiy: davr va scope servisga o'zgarishsiz o'tadi", async () => {
    const res = await controller.umumiy({ period: '30' }, 1001, null);
    expect(markaz.umumiy).toHaveBeenCalledWith(1001, null, 30, expect.any(Date));
    expect(res).toEqual({ ok: 1 });
  });

  it("oquvchilar: DTO so'rovga o'giriladi, scope [] ham o'tadi (servis bo'sh qaytaradi)", async () => {
    await controller.oquvchilar({ status: ['QIZIL', 'SARIQ'], kirgan: 'yoq', page: 2 }, 1001, []);
    expect(markaz.oquvchilar).toHaveBeenCalledWith(
      1001,
      [],
      expect.objectContaining({
        davr: 7, status: ['QIZIL', 'SARIQ'], kirgan: false, page: 2, pageSize: 50, sort: 'holat', dir: 'asc',
      }),
      expect.any(Date),
    );
  });

  it("telefonlar: o'sha filtr bilan", async () => {
    await controller.telefonlar({ groupId: '5f2f9d1c-3b2e-4c1a-9c0e-1a2b3c4d5e6f' }, 1001, [1]);
    expect(markaz.telefonlar).toHaveBeenCalledWith(
      1001,
      [1],
      expect.objectContaining({ groupId: '5f2f9d1c-3b2e-4c1a-9c0e-1a2b3c4d5e6f' }),
      expect.any(Date),
    );
  });
});
```

- [ ] **Step 5: Kontroller**

`server/src/app-activity/center/center-app-activity.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BranchScope, CurrentUser, Roles } from '../../common/decorators';
import { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AppActivityQueryDto } from '../dto/app-activity-query.dto';
import {
  CenterStudentsQueryDto,
  sorovniOqi,
} from '../dto/center-students-query.dto';
import { davrniOqi } from '../stats/davr';
import { CenterAppActivityService } from './center-app-activity.service';

/**
 * «DaF ilovasi» bo'limi — markaz bo'yicha ilova faolligi (dizayn 9.1).
 *
 * Filial: `@BranchScope()` — sarlavhadagi tanlov ∩ ruxsat, guard hisoblaydi.
 * Shuning uchun bu route'lar `branch-route-policy.ts` manifestiga
 * YOZILMAYDI: dekorator manbada o'zi dalil, manifest testi qayta e'lonni rad
 * etadi. O'qituvchi bu bo'limni ko'rmaydi — u guruh tabidan foydalanadi.
 */
@Controller('app-activity/center')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class CenterAppActivityController {
  constructor(private readonly markaz: CenterAppActivityService) {}

  @Get('summary')
  umumiy(
    @Query() query: AppActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.markaz.umumiy(companyId, scope, davrniOqi(query.period), new Date());
  }

  @Get('students')
  oquvchilar(
    @Query() query: CenterStudentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.markaz.oquvchilar(companyId, scope, sorovniOqi(query), new Date());
  }

  @Get('students/phones')
  telefonlar(
    @Query() query: CenterStudentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.markaz.telefonlar(companyId, scope, sorovniOqi(query), new Date());
  }
}
```

- [ ] **Step 6: Modulga ulash**

`server/src/app-activity/app-activity.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DafModule } from '../daf/daf.module';
import { StudentActivityController } from './student-activity.controller';
import { GroupAppActivityController } from './group-app-activity.controller';
import { StudentAppActivityController } from './student-app-activity.controller';
import { AppActivityWriteService } from './app-activity-write.service';
import { AppActivityStatsQueries } from './app-activity-stats.queries';
import { AppActivityStatsService } from './app-activity-stats.service';
import { CenterAppActivityController } from './center/center-app-activity.controller';
import { CenterAppActivityQueries } from './center/center-app-activity.queries';
import { CenterAppActivityService } from './center/center-app-activity.service';

@Module({
  imports: [DafModule],
  controllers: [
    StudentActivityController,
    GroupAppActivityController,
    StudentAppActivityController,
    CenterAppActivityController,
  ],
  providers: [
    AppActivityWriteService,
    AppActivityStatsService,
    AppActivityStatsQueries,
    CenterAppActivityQueries,
    CenterAppActivityService,
  ],
  exports: [AppActivityWriteService],
})
export class AppActivityModule {}
```

- [ ] **Step 7: Testlar — kontroller, manifest, butun app-activity**

```bash
cd server && npx jest src/app-activity src/common/auth/branch-route-policy.spec.ts && npm run typecheck && npm run lint
```
Expected: PASS. `branch-route-policy.spec.ts` yangi uchta route'ni `@BranchScope()` dalili bilan o'zi qamraydi («classifies every route exactly once» o'tadi). Agar u «missing» desa — kontrollerda `@BranchScope()` unutilgan.

- [ ] **Step 8: Serverni ishga tushirib qo'lda bir marta**

```bash
cd server && npm run start:dev
```
Boshqa terminalda (CEO tokeni bilan):
```bash
curl -s -H "Authorization: Bearer <token>" "http://localhost:3001/api/app-activity/center/summary?period=7" | head -c 600
```
Expected: JSON, `norma` va `kartalar` bor. Dev bazada sonlar kichik/nol bo'lishi normal.

- [ ] **Step 9: Commit**

```bash
git add src/app-activity/dto/center-students-query.dto.ts src/app-activity/dto/center-students-query.dto.spec.ts src/app-activity/center/center-app-activity.controller.ts src/app-activity/center/center-app-activity.controller.spec.ts src/app-activity/app-activity.module.ts
git commit -m "$(cat <<'MSG'
DaF markaz: uch GET manzil — summary, students, students/phones

Rollar CEO / Filial direktori / Administrator; filial @BranchScope()
orqali, manifestga yozuv kerak emas. O'qituvchi ko'rmaydi.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 12: Klient — bo'lim menyusi, rol qorovuli, yo'llar

**Files:**
- Create: `client/src/lib/daf-nav.ts`, `client/src/lib/daf-nav.test.ts`
- Modify: `client/src/lib/nav-items.ts`
- Create: `client/src/components/daf-center/daf-layout-shell.tsx`
- Create: `client/src/app/(dashboard)/daf/layout.tsx`

**Interfaces:**
- Produces: `dafNavItems`, `canEnterDaf(roleIds)`, `canOpenDafPath(roleIds, pathname)`, `DafLayoutShell`.
- **Sahifa fayllari bu vazifada yaratilmaydi** — `/daf/page.tsx` 14-vazifada, `/daf/oquvchilar/page.tsx` 15-vazifada, o'z klient komponenti bilan birga. Shuning uchun bu vazifadan keyin menyu havolasi 404 beradi; bu kutilgan va 14-vazifada yopiladi. Vaqtinchalik «tez orada» komponentlari yozilmaydi.

- [ ] **Step 1: Test**

`client/src/lib/daf-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canEnterDaf, canOpenDafPath } from "./daf-nav";

describe("DaF ilovasi bo'limiga kirish", () => {
  it("CEO, filial direktori va administrator ikkala sahifani ochadi", () => {
    for (const role of [1, 2, 3]) {
      expect(canEnterDaf([role])).toBe(true);
      expect(canOpenDafPath([role], "/daf")).toBe(true);
      expect(canOpenDafPath([role], "/daf/oquvchilar")).toBe(true);
      expect(canOpenDafPath([role], "/daf/oquvchilar/")).toBe(true);
    }
  });

  it("o'qituvchi va kassir kira olmaydi", () => {
    expect(canEnterDaf([4])).toBe(false);
    expect(canEnterDaf([5])).toBe(false);
    expect(canOpenDafPath([4], "/daf")).toBe(false);
    expect(canOpenDafPath([5], "/daf/oquvchilar")).toBe(false);
  });

  it("menyuda yo'q yangi yo'l faqat CEO ga qoladi", () => {
    expect(canOpenDafPath([3], "/daf/kontent")).toBe(false);
    expect(canOpenDafPath([1], "/daf/kontent")).toBe(true);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

```bash
cd client && npx vitest run src/lib/daf-nav.test.ts
```
Expected: FAIL — modul yo'q.

- [ ] **Step 3: `daf-nav.ts`**

```ts
import { Gauge, Users, type LucideIcon } from "lucide-react";

export interface DafNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** When set, only users with at least one matching role ID see the item. */
  visibleForRoles?: number[];
}

/** Bo'lim egalari — CEO, Filial direktori, Administrator. O'qituvchi o'z guruhining «Ilova faolligi» tabidan ko'radi. */
const CEO_BD_ADMIN = [1, 2, 3];

export const dafNavItems: DafNavItem[] = [
  { title: "Umumiy holat", url: "/daf", icon: Gauge, visibleForRoles: CEO_BD_ADMIN },
  { title: "O'quvchilar", url: "/daf/oquvchilar", icon: Users, visibleForRoles: CEO_BD_ADMIN },
];

const hasAny = (roleIds: number[], allowed: number[]) => allowed.some((id) => roleIds.includes(id));

export function canEnterDaf(roleIds: number[]): boolean {
  return dafNavItems.some((i) => !i.visibleForRoles || hasAny(roleIds, i.visibleForRoles));
}

/**
 * Bu sahifani ocha oladimi. Menyuda yo'q yangi yo'l (kelajakdagi /daf/kontent
 * kabi) faqat CEO ga qoladi — yangi sahifa o'z-o'zidan adminga ochilib
 * ketmasin (`reports-nav.ts` dagi qoida).
 */
export function canOpenDafPath(roleIds: number[], pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const item = dafNavItems.find(
    (i) => path === i.url || (i.url !== "/daf" && path.startsWith(`${i.url}/`)),
  );
  if (!item) return roleIds.includes(1);
  return !item.visibleForRoles || hasAny(roleIds, item.visibleForRoles);
}
```

- [ ] **Step 4: Test o'tishi**

```bash
cd client && npx vitest run src/lib/daf-nav.test.ts src/lib/reports-nav.test.ts
```
Expected: PASS.

- [ ] **Step 5: Yon menyu**

`client/src/lib/nav-items.ts` — lucide importiga `Smartphone`, keyin `import { dafNavItems } from "./daf-nav";`. `Media` qatoridan keyin:

```ts
  // DaF ilovasi nazorati — markaz bo'yicha faollik. O'qituvchi bu bo'limni
  // ko'rmaydi: u o'z guruhidagi «Ilova faolligi» tabidan foydalanadi.
  {
    title: "DaF ilovasi",
    url: "/daf",
    icon: Smartphone,
    visibleForRoles: [1, 2, 3],
    children: dafNavItems,
  },
```

- [ ] **Step 6: Layout qorovuli**

`client/src/components/daf-center/daf-layout-shell.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canOpenDafPath } from "@/lib/daf-nav";

/**
 * Bo'lim sahifalari uchun rol qorovuli (`reports-layout-shell.tsx` naqshi).
 * Backend ham rad etadi (`@Roles`), bu faqat sahifa ochilib keyin 403
 * ko'rmaslik uchun. Mobil menyu yo'q — `/daf` ildizi o'zi sahifa.
 */
export function DafLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const ruxsat = canOpenDafPath(user?.roles.map((r) => r.id) ?? [], pathname);

  useEffect(() => {
    if (user && !ruxsat) router.replace("/");
  }, [user, ruxsat, router]);

  if (user && !ruxsat) return null;
  return <div className="space-y-4">{children}</div>;
}
```

`client/src/app/(dashboard)/daf/layout.tsx`:

```tsx
import { DafLayoutShell } from "@/components/daf-center/daf-layout-shell";

export default function DafLayout({ children }: { children: React.ReactNode }) {
  return <DafLayoutShell>{children}</DafLayoutShell>;
}
```

- [ ] **Step 7: Tekshirish**

```bash
cd client && npm run typecheck && npx eslint src/lib/daf-nav.ts src/lib/nav-items.ts src/components/daf-center "src/app/(dashboard)/daf"
```
Expected: toza. Qo'lda: CEO bilan yon menyuda «DaF ilovasi» ochiladi va ikki bolasi ko'rinadi. Havolani bosganda 404 — sahifa fayllari 14- va 15-vazifalarda qo'shiladi; bu kutilgan holat.

- [ ] **Step 8: Commit**

```bash
git add src/lib/daf-nav.ts src/lib/daf-nav.test.ts src/lib/nav-items.ts src/components/daf-center "src/app/(dashboard)/daf"
git commit -m "$(cat <<'MSG'
Yon menyu: «DaF ilovasi» bo'limi, rol qorovuli va yo'llar

Umumiy holat va O'quvchilar — CEO, filial direktori, administrator.
Menyuda yo'q yangi yo'l faqat CEO ga qoladi. Sahifa fayllari keyingi
ikki vazifada, o'z komponenti bilan birga.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 13: Klient — turlar, URL filtri, hook'lar, holat belgisi, `DayBars` yorlig'i

**Files:**
- Create: `client/src/components/daf-center/types.ts`
- Create: `client/src/components/daf-center/oquvchilar-filtr.ts`, `oquvchilar-filtr.test.ts`
- Create: `client/src/components/daf-center/use-daf-center.ts`
- Create: `client/src/components/daf-center/holat-badge.tsx`
- Modify: `client/src/components/groups/app-activity/activity-ui.tsx` (`KunTooltipIchi`, `DayBars`)

**Interfaces:**
- Consumes: 6-vazifa server turlari (1:1), `api` (`@/lib/api`).
- Produces:
  - `types.ts`: server bilan bir xil nomlar + `HOLATLAR`, `SARALASHLAR`
  - `OquvchilarFiltri`, `STANDART_FILTR`, `filtrniUrldanOqi(sp: URLSearchParams)`, `filtrniUrlgaYoz(f): string`, `sorovParametrlari(f): Record<string, string | number | undefined>`
  - `useMarkazUmumiy(davr)`, `useMarkazOquvchilar(filtr)`, `markazTelefonlarniOl(filtr): Promise<MarkazTelefonlar>`
  - `HolatBadge({ holat })`, `HOLAT_MATNI`
  - `DayBars({ kunlar, className, shugullanganMatni? })`

- [ ] **Step 1: Turlar**

`client/src/components/daf-center/types.ts`:

```ts
// Server: server/src/app-activity/center/center-app-activity.types.ts va
// server/src/app-activity/norma/norma.ts — nomlar aynan shu.
import type {
  Daraja,
  Davr,
  JoriyDaraja,
  KunSurati,
  OxirgiFaollik,
} from "@/components/groups/app-activity/types";

export type { Daraja, Davr, JoriyDaraja, KunSurati, OxirgiFaollik };

export type Holat = "AKKAUNT_YOQ" | "HECH_KIRMAGAN" | "QIZIL" | "SARIQ" | "YASHIL";
/** Standart saralash tartibida. */
export const HOLATLAR: Holat[] = ["HECH_KIRMAGAN", "QIZIL", "SARIQ", "YASHIL", "AKKAUNT_YOQ"];

export const SARALASHLAR = ["holat", "faolKun", "vaqt", "foiz", "oxirgi", "ism", "guruh"] as const;
export type Saralash = (typeof SARALASHLAR)[number];
export type Yonalish = "asc" | "desc";

export interface Norma {
  kunlikDaqiqa: number;
  kunlikSavol: number;
  haftalikKun: number;
  sariqKun: number;
}

export interface MarkazOquvchiQatori {
  studentId: number;
  ism: string;
  photo: string | null;
  guruh: { id: string; nomi: string; daraja: Daraja | null } | null;
  oqituvchi: { id: number; ism: string } | null;
  filial: { id: number; nomi: string } | null;
  akkaunt: boolean;
  hechKirmagan: boolean;
  kirdi: boolean;
  holat: Holat;
  faolKun: number;
  maxraj: number;
  hisobBoshi: string;
  kerakliKun: number;
  sariqKerak: number;
  kunlar: KunSurati[];
  lernenSoniya: number;
  ortachaKunlikSoniya: number;
  savollar: number;
  togri: number;
  foiz: number | null;
  oxirgiFaollik: OxirgiFaollik | null;
  kurs: JoriyDaraja | null;
}

export interface MarkazKartalari {
  oquvchilar: number;
  akkauntlar: number;
  birMartaKirganlar: number;
  davrdaKirganlar: number;
  yashillar: number;
  ortachaFaolKunHaftada: number | null;
  ortachaKunlikSoniya: number | null;
  savollar: number;
  togri: number;
  foiz: number | null;
  tugatilganDarslar: number;
}

export interface MarkazVoronka {
  faolOquvchi: number;
  akkauntiBor: number;
  birMartaKirgan: number;
  davrdaKirgan: number;
  normaniBajargan: number;
}

export interface MarkazTrendKuni {
  sana: string;
  kirganlar: number;
  faollar: number;
}

export interface MarkazFilialQatori {
  branchId: number;
  nomi: string;
  oquvchilar: number;
  qamrovFoiz: number | null;
  normaFoiz: number | null;
  ortachaFaolKunHaftada: number | null;
  foiz: number | null;
  tugatilganDarslar: number;
}

export interface MarkazUmumiy {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  norma: Norma;
  kartalar: MarkazKartalari;
  voronka: MarkazVoronka;
  trend: MarkazTrendKuni[];
  filiallar: MarkazFilialQatori[];
}

export interface MarkazFiltrVariantlari {
  guruhlar: { id: string; nomi: string }[];
  oqituvchilar: { id: number; ism: string }[];
  darajalar: Daraja[];
}

export interface MarkazOquvchilar {
  davr: Davr;
  bugun: string;
  kuzatuvBoshi: string | null;
  norma: Norma;
  jami: number;
  sahifa: number;
  sahifaHajmi: number;
  qatorlar: MarkazOquvchiQatori[];
  filtrVariantlari: MarkazFiltrVariantlari;
  filialUstuni: boolean;
}

export interface MarkazTelefonQatori {
  ism: string;
  guruh: string | null;
  telefon: string;
  otaOnaTelefoni: string | null;
}

export interface MarkazTelefonlar {
  jami: number;
  qisqartirildi: boolean;
  qatorlar: MarkazTelefonQatori[];
}
```

- [ ] **Step 2: URL filtri testi**

`client/src/components/daf-center/oquvchilar-filtr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  filtrniUrldanOqi,
  filtrniUrlgaYoz,
  sorovParametrlari,
  STANDART_FILTR,
  type OquvchilarFiltri,
} from "./oquvchilar-filtr";

describe("o'quvchilar filtri ↔ URL", () => {
  it("bo'sh URL standart filtr, standart filtr bo'sh URL", () => {
    expect(filtrniUrldanOqi(new URLSearchParams(""))).toEqual(STANDART_FILTR);
    expect(filtrniUrlgaYoz(STANDART_FILTR)).toBe("");
  });

  it("aylanma sayohat: filtr → URL → filtr", () => {
    const f: OquvchilarFiltri = {
      ...STANDART_FILTR,
      davr: 30,
      status: ["QIZIL", "SARIQ"],
      kirgan: "yoq",
      groupId: "g-1",
      teacherId: 20001,
      level: "A2",
      q: "nodira",
      sort: "vaqt",
      dir: "desc",
      page: 3,
    };
    const url = filtrniUrlgaYoz(f);
    expect(url).toContain("status=QIZIL%2CSARIQ");
    expect(filtrniUrldanOqi(new URLSearchParams(url))).toEqual(f);
  });

  it("noto'g'ri qiymatlar standartga tushadi", () => {
    const f = filtrniUrldanOqi(new URLSearchParams("period=15&status=BINAFSHA,QIZIL&sort=telefon&page=abc&teacherId=x"));
    expect(f.davr).toBe(7);
    expect(f.status).toEqual(["QIZIL"]);
    expect(f.sort).toBe("holat");
    expect(f.page).toBe(1);
    expect(f.teacherId).toBeNull();
  });

  it("so'rov parametrlari: bo'shlar tashlanadi, holatlar vergul bilan", () => {
    expect(sorovParametrlari(STANDART_FILTR)).toEqual({
      period: 7, status: undefined, kirgan: undefined, groupId: undefined, teacherId: undefined,
      level: undefined, q: undefined, sort: "holat", dir: "asc", page: 1, pageSize: 50,
    });
    expect(sorovParametrlari({ ...STANDART_FILTR, status: ["QIZIL", "SARIQ"], q: "  ali " }).status).toBe("QIZIL,SARIQ");
    expect(sorovParametrlari({ ...STANDART_FILTR, q: "  ali " }).q).toBe("ali");
  });
});
```

- [ ] **Step 3: Yiqilishini ko'rish**

```bash
cd client && npx vitest run src/components/daf-center/oquvchilar-filtr.test.ts
```
Expected: FAIL — modul yo'q.

- [ ] **Step 4: `oquvchilar-filtr.ts`**

```ts
import {
  HOLATLAR,
  SARALASHLAR,
  type Daraja,
  type Davr,
  type Holat,
  type Saralash,
  type Yonalish,
} from "./types";

/** Sahifa holati — hammasi URL da (dizayn 6.1), havola bilan ulashiladi. */
export interface OquvchilarFiltri {
  davr: Davr;
  status: Holat[];
  kirgan: "ha" | "yoq" | null;
  groupId: string | null;
  teacherId: number | null;
  level: Daraja | null;
  q: string;
  sort: Saralash;
  dir: Yonalish;
  page: number;
}

export const SAHIFA_HAJMI = 50;

export const STANDART_FILTR: OquvchilarFiltri = {
  davr: 7,
  status: [],
  kirgan: null,
  groupId: null,
  teacherId: null,
  level: null,
  q: "",
  sort: "holat",
  dir: "asc",
  page: 1,
};

const DARAJALAR: Daraja[] = ["A1", "A2", "B1"];

export function filtrniUrldanOqi(sp: URLSearchParams): OquvchilarFiltri {
  const status = (sp.get("status") ?? "")
    .split(",")
    .filter((s): s is Holat => (HOLATLAR as string[]).includes(s));
  const kirgan = sp.get("kirgan");
  const level = sp.get("level");
  const sort = sp.get("sort");
  const dir = sp.get("dir");
  const page = Number(sp.get("page"));
  const teacherId = Number(sp.get("teacherId"));
  return {
    davr: sp.get("period") === "30" ? 30 : 7,
    status,
    kirgan: kirgan === "ha" || kirgan === "yoq" ? kirgan : null,
    groupId: sp.get("groupId") || null,
    teacherId: Number.isInteger(teacherId) && teacherId > 0 ? teacherId : null,
    level: DARAJALAR.includes(level as Daraja) ? (level as Daraja) : null,
    q: sp.get("q") ?? "",
    sort: (SARALASHLAR as readonly string[]).includes(sort ?? "") ? (sort as Saralash) : "holat",
    dir: dir === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Standartdan farq qilgan maydonlar bilan `?...`; hammasi standart bo'lsa `""`. */
export function filtrniUrlgaYoz(f: OquvchilarFiltri): string {
  const p = new URLSearchParams();
  if (f.davr !== 7) p.set("period", String(f.davr));
  if (f.status.length > 0) p.set("status", f.status.join(","));
  if (f.kirgan) p.set("kirgan", f.kirgan);
  if (f.groupId) p.set("groupId", f.groupId);
  if (f.teacherId !== null) p.set("teacherId", String(f.teacherId));
  if (f.level) p.set("level", f.level);
  if (f.q) p.set("q", f.q);
  if (f.sort !== "holat") p.set("sort", f.sort);
  if (f.dir !== "asc") p.set("dir", f.dir);
  if (f.page > 1) p.set("page", String(f.page));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** `GET /app-activity/center/students` uchun parametrlar (`CenterStudentsQueryDto`). */
export function sorovParametrlari(f: OquvchilarFiltri): Record<string, string | number | undefined> {
  const q = f.q.trim();
  return {
    period: f.davr,
    status: f.status.length > 0 ? f.status.join(",") : undefined,
    kirgan: f.kirgan ?? undefined,
    groupId: f.groupId ?? undefined,
    teacherId: f.teacherId ?? undefined,
    level: f.level ?? undefined,
    q: q || undefined,
    sort: f.sort,
    dir: f.dir,
    page: f.page,
    pageSize: SAHIFA_HAJMI,
  };
}
```

- [ ] **Step 5: Test o'tishi**

```bash
cd client && npx vitest run src/components/daf-center/oquvchilar-filtr.test.ts
```
Expected: PASS (4 test).

- [ ] **Step 6: Hook'lar**

`client/src/components/daf-center/use-daf-center.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { sorovParametrlari, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Davr, MarkazOquvchilar, MarkazTelefonlar, MarkazUmumiy } from "./types";

// Kalit prefiksi "daf-center" — norma saqlanganda sozlamalar sahifasi shu
// prefiks bilan invalidatsiya qiladi. Filial almashsa `BranchQuerySync`
// butun keshni tozalaydi, shuning uchun filial kalitda yo'q.
export function useMarkazUmumiy(davr: Davr) {
  return useQuery<MarkazUmumiy>({
    queryKey: ["daf-center", "summary", davr],
    queryFn: () =>
      api
        .get<MarkazUmumiy>("/app-activity/center/summary", { params: { period: davr } })
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useMarkazOquvchilar(filtr: OquvchilarFiltri) {
  const params = sorovParametrlari(filtr);
  return useQuery<MarkazOquvchilar>({
    queryKey: ["daf-center", "students", params],
    queryFn: () =>
      api.get<MarkazOquvchilar>("/app-activity/center/students", { params }).then((r) => r.data),
    staleTime: 60_000,
    // Sahifa yoki filtr o'zgarganda jadval bo'shab qolmasin — eski qatorlar
    // yangisi kelguncha turadi.
    placeholderData: (oldingi) => oldingi,
  });
}

/** «Ro'yxatni nusxalash» — bir martalik, kesh kerak emas. */
export async function markazTelefonlarniOl(filtr: OquvchilarFiltri): Promise<MarkazTelefonlar> {
  // Sahifalash parametrlari ketmaydi — butun filtr natijasi kerak (dizayn 6.4).
  const params = { ...sorovParametrlari(filtr) };
  delete params.page;
  delete params.pageSize;
  const r = await api.get<MarkazTelefonlar>("/app-activity/center/students/phones", { params });
  return r.data;
}
```

- [ ] **Step 7: Holat belgisi**

`client/src/components/daf-center/holat-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { Holat } from "./types";

export const HOLAT_MATNI: Record<Holat, string> = {
  AKKAUNT_YOQ: "Akkaunt yo'q",
  HECH_KIRMAGAN: "Hech kirmagan",
  QIZIL: "Norma bajarilmayapti",
  SARIQ: "Qisman",
  YASHIL: "Normada",
};

/** `amber-*` YO'Q — admin mavzusida rangsiz (`activity-format.ts` izohi). */
const NUQTA: Record<Holat, string> = {
  AKKAUNT_YOQ: "bg-muted-foreground/40",
  HECH_KIRMAGAN: "bg-foreground/70",
  QIZIL: "bg-red-500",
  SARIQ: "bg-yellow-400",
  YASHIL: "bg-green-500",
};

const MATN: Record<Holat, string> = {
  AKKAUNT_YOQ: "text-muted-foreground",
  HECH_KIRMAGAN: "text-foreground",
  QIZIL: "text-red-600 dark:text-red-400",
  SARIQ: "text-yellow-600 dark:text-yellow-400",
  YASHIL: "text-green-600 dark:text-green-400",
};

export function HolatBadge({ holat, className }: { holat: Holat; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", MATN[holat], className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", NUQTA[holat])} />
      {HOLAT_MATNI[holat]}
    </span>
  );
}
```

- [ ] **Step 8: `DayBars` yorlig'i**

`client/src/components/groups/app-activity/activity-ui.tsx` — `KunTooltipIchi` va `DayBars`:

```tsx
/**
 * Bir kunning tooltip matni — `DayBars` va `XaritaBolimi` heatmapida bitta manba.
 * `shugullanganMatni` — markaz sahifasida `shugullangan` = norma bo'yicha faol
 * kun, guruh tabida esa «mashq yoki 5 daqiqa radio»; bir xil so'z ikki ma'noda
 * turmasin.
 */
export function KunTooltipIchi({
  kun,
  shugullanganMatni = "Shug'ullangan kun",
}: {
  kun: KunSurati;
  shugullanganMatni?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{formatKunYorligi(kun.sana)}</span>
      {!kun.kuzatilgan ? (
        <span>Kuzatuv boshlanmagan</span>
      ) : (
        <>
          <span>{kun.shugullangan ? shugullanganMatni : kun.kirdi ? "Faqat kirgan" : "Kirmagan"}</span>
          {kun.savollar > 0 && <span>Savollar: {kun.savollar}</span>}
          {kun.faolSoniya > 0 && <span>Faol: {formatDavomiylik(kun.faolSoniya)}</span>}
          {kun.radioSoniya > 0 && <span>Radio: {formatDavomiylik(kun.radioSoniya)}</span>}
        </>
      )}
    </div>
  );
}

export function DayBars({
  kunlar,
  className,
  shugullanganMatni,
}: {
  kunlar: KunSurati[];
  className?: string;
  shugullanganMatni?: string;
}) {
```
va ichidagi `<KunTooltipIchi kun={kun} />` → `<KunTooltipIchi kun={kun} shugullanganMatni={shugullanganMatni} />`. Qolgan tana o'zgarmaydi.

- [ ] **Step 9: Tekshirish**

```bash
cd client && npm run typecheck && npx eslint src/components/daf-center src/components/groups/app-activity/activity-ui.tsx && npx vitest run src/components/daf-center src/lib/daf-nav.test.ts
```
Expected: toza, testlar PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/daf-center/types.ts src/components/daf-center/oquvchilar-filtr.ts src/components/daf-center/oquvchilar-filtr.test.ts src/components/daf-center/use-daf-center.ts src/components/daf-center/holat-badge.tsx src/components/groups/app-activity/activity-ui.tsx
git commit -m "$(cat <<'MSG'
DaF markaz klienti: turlar, URL filtri, hook'lar, holat belgisi

DayBars tooltip yorlig'i parametr bo'ldi — markazda «shug'ullangan» norma
bo'yicha faol kun, guruh tabida boshqa ma'no.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 14: «Umumiy holat» sahifasi

**Files:**
- Create: `client/src/components/daf-center/daf-umumiy-client.tsx`
- Create: `client/src/components/daf-center/daf-kpi-cards.tsx`, `daf-voronka.tsx`, `daf-trend-chart.tsx`, `daf-filiallar-table.tsx`
- Create: `client/src/app/(dashboard)/daf/page.tsx`

**Interfaces:**
- Consumes: `useMarkazUmumiy`, `MarkazUmumiy` va bo'laklari (13), `PeriodToggle`, `KpiCard`, `ActivityError`, `usePeriodParam` (`activity-ui`), `formatDavomiylik`, `foizRangi`, `formatKunOy` (`activity-format`), `ActivityExplainer`, `ChartCard`, `useBranchSwitcher`, `filtrniUrlgaYoz`, `STANDART_FILTR`.

- [ ] **Step 1: KPI kartalar**

`client/src/components/daf-center/daf-kpi-cards.tsx`:

```tsx
"use client";

import { BookOpenCheck, CalendarCheck, CheckCircle2, Clock, Target, Users } from "lucide-react";
import { KpiCard } from "@/components/groups/app-activity/activity-ui";
import { formatDavomiylik, foizRangi } from "@/components/groups/app-activity/activity-format";
import type { MarkazKartalari, Norma } from "./types";

const foiz = (qism: number, jami: number) => (jami === 0 ? null : Math.round((qism * 100) / jami));
/** 2.7 → «2,7» — o'zbekcha kasr belgisi. */
const kasr = (n: number) => String(n).replace(".", ",");

export function DafKpiCards({ k, norma }: { k: MarkazKartalari; norma: Norma }) {
  const akkauntsiz = k.oquvchilar - k.akkauntlar;
  const hechKirmagan = k.akkauntlar - k.birMartaKirganlar;
  const normaFoiz = foiz(k.yashillar, k.oquvchilar);
  const farq = k.ortachaFaolKunHaftada === null ? null : k.ortachaFaolKunHaftada - norma.haftalikKun;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={Users}
        label="Qamrov"
        value={`${k.birMartaKirganlar} / ${k.oquvchilar}`}
        hint={`${akkauntsiz} tasida akkaunt yo'q, ${hechKirmagan} tasi hech qachon kirmagan`}
        tooltip="Faol o'quvchilardan nechtasi ilovaga hech bo'lmasa bir marta kirgan (butun tarix bo'yicha)."
      />
      <KpiCard
        icon={CheckCircle2}
        label="Normani bajarmoqda"
        value={normaFoiz === null ? "—" : `${normaFoiz}%`}
        valueClassName={foizRangi(normaFoiz)}
        hint={`${k.yashillar} o'quvchi · haftada ${norma.haftalikKun} faol kun`}
        tooltip={`Yashil holatdagilar: davrda kamida ${norma.haftalikKun} kun (7 kunga nisbatan) faol bo'lganlar. Faol kun — kuniga ${norma.kunlikDaqiqa} daqiqa o'quv bo'limida yoki ${norma.kunlikSavol} ta savol.`}
      />
      <KpiCard
        icon={CalendarCheck}
        label="O'rtacha faol kun"
        value={k.ortachaFaolKunHaftada === null ? "—" : kasr(k.ortachaFaolKunHaftada)}
        hint={
          farq === null
            ? "haftasiga"
            : farq >= 0
              ? `haftasiga · normadan ${kasr(Math.round(farq * 10) / 10)} kun ko'p`
              : `haftasiga · normadan ${kasr(Math.round(-farq * 10) / 10)} kun kam`
        }
        tooltip="Davrda kirganlar orasida, haftaga keltirilgan. Yangi akkauntlar o'z kuzatilgan kunlariga nisbatan sanaladi."
      />
      <KpiCard
        icon={Clock}
        label="O'rtacha vaqt"
        value={k.ortachaKunlikSoniya === null ? "—" : formatDavomiylik(k.ortachaKunlikSoniya)}
        hint="kuniga, o'quv bo'limida · kirganlar orasida"
        tooltip="Faqat LERNEN bo'limidagi faol vaqt. Radio va boshqa bo'limlar kirmaydi."
      />
      <KpiCard
        icon={Target}
        label="To'g'ri javob"
        value={k.foiz === null ? "—" : `${k.foiz}%`}
        valueClassName={foizRangi(k.foiz)}
        hint={`tugatilgan seanslar bo'yicha · ${k.savollar} savol`}
        tooltip="Birinchi urinishda to'g'ri topilgan savollar ulushi — tugatilgan seanslar bo'yicha. Tashlab ketilgan seans kirmaydi, shuning uchun guruh tabidan 1–2 % farq qilishi mumkin."
      />
      <KpiCard
        icon={BookOpenCheck}
        label="Tugatilgan darslar"
        value={String(k.tugatilganDarslar)}
        hint="davr ichida"
        tooltip="Davrda oxirigacha ishlangan darslar. Qayta tugatilgan dars ham sanaladi."
      />
    </div>
  );
}
```

- [ ] **Step 2: Voronka**

`client/src/components/daf-center/daf-voronka.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { filtrniUrlgaYoz, STANDART_FILTR, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Davr, MarkazVoronka } from "./types";

interface Pogona {
  nomi: string;
  son: number;
  /** Oldingi pog'onaga nisbatan yo'qotish izohi va o'sha ro'yxatga havola. */
  yoqotish: { izoh: string; filtr: Partial<OquvchilarFiltri> } | null;
}

/** Yo'qotish havolalari — dizayn 5.2 jadvali. */
function pogonalar(v: MarkazVoronka): Pogona[] {
  return [
    { nomi: "Faol o'quvchi", son: v.faolOquvchi, yoqotish: null },
    { nomi: "Akkaunti bor", son: v.akkauntiBor, yoqotish: { izoh: "akkaunt yo'q", filtr: { status: ["AKKAUNT_YOQ"] } } },
    {
      nomi: "Bir marta bo'lsa ham kirgan",
      son: v.birMartaKirgan,
      yoqotish: { izoh: "hech qachon kirmagan", filtr: { status: ["HECH_KIRMAGAN"] } },
    },
    {
      nomi: "Davr ichida kirgan",
      son: v.davrdaKirgan,
      yoqotish: { izoh: "kirgan edi, bu davrda yo'q", filtr: { status: ["QIZIL", "SARIQ", "YASHIL"], kirgan: "yoq" } },
    },
    {
      nomi: "Normani bajargan",
      son: v.normaniBajargan,
      yoqotish: { izoh: "kirgan, lekin norma yo'q", filtr: { status: ["QIZIL", "SARIQ"], kirgan: "ha" } },
    },
  ];
}

export function DafVoronka({ voronka, davr }: { voronka: MarkazVoronka; davr: Davr }) {
  const qator = pogonalar(voronka);
  const max = Math.max(1, voronka.faolOquvchi);
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-base font-semibold">Qayerda yo&apos;qotyapmiz</h3>
      <p className="text-xs text-muted-foreground">
        Har pog&apos;onadagi yo&apos;qotish bosiladi — o&apos;sha o&apos;quvchilar ro&apos;yxati ochiladi
      </p>
      <ol className="mt-4 space-y-2">
        {qator.map((p, i) => {
          const oldingi = i > 0 ? qator[i - 1].son : null;
          const farq = oldingi === null ? 0 : oldingi - p.son;
          return (
            <li key={p.nomi} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{p.nomi}</span>
                  <span className="font-semibold tabular-nums">{p.son}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.son / max) * 100}%` }} />
                </div>
              </div>
              <div className="w-36 text-right text-xs">
                {p.yoqotish && farq > 0 ? (
                  <Link
                    href={`/daf/oquvchilar${filtrniUrlgaYoz({ ...STANDART_FILTR, davr, ...p.yoqotish.filtr })}`}
                    className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
                  >
                    −{farq} · {p.yoqotish.izoh}
                    <ChevronRight className="size-3" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{p.yoqotish ? "yo'qotish yo'q" : ""}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Trend**

`client/src/components/daf-center/daf-trend-chart.tsx`:

```tsx
"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { formatKunYorligi, formatKunOy } from "@/components/groups/app-activity/activity-format";
import type { MarkazTrendKuni } from "./types";

// Literal ranglar — SVG `hsl(var(--x))` ni ishonchli o'qimaydi (departed-students grafiklari kabi).
const KIRGAN = "#94a3b8"; // slate-400
const FAOL = "#2563eb"; // blue-600

export function DafTrendChart({ trend }: { trend: MarkazTrendKuni[] }) {
  const rows = trend.map((t) => ({ ...t, label: formatKunOy(t.sana) }));
  const bosh = rows.every((r) => r.kirganlar === 0 && r.faollar === 0);
  return (
    <ChartCard
      title="Kunlik faollik — 30 kun"
      subtitle="Och chiziq — ilovani ochganlar, to'q chiziq — faol kun bo'lganlar"
      tooltip={"Ikki chiziq orasidagi bo'shliq — «ochdi, lekin ishlamadi».\nDavr 7 kun tanlansa ham grafik 30 kun ko'rsatadi: tendensiya 7 kunda ko'rinmaydi."}
      isEmpty={bosh}
      emptyMessage="Bu davrda ilova faolligi yo'q"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            labelFormatter={(_, payload) => {
              const kun = payload?.[0]?.payload as MarkazTrendKuni | undefined;
              return kun ? formatKunYorligi(kun.sana) : "";
            }}
            formatter={(value, name) => [String(value), name === "kirganlar" ? "Kirgan" : "Faol kun"]}
          />
          <Line type="monotone" dataKey="kirganlar" stroke={KIRGAN} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="faollar" stroke={FAOL} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
```

- [ ] **Step 4: Filiallar jadvali**

`client/src/components/daf-center/daf-filiallar-table.tsx`:

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { foizRangi } from "@/components/groups/app-activity/activity-format";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { cn } from "@/lib/utils";
import type { MarkazFilialQatori } from "./types";

const foizMatn = (n: number | null) => (n === null ? "—" : `${n}%`);
const kasr = (n: number | null) => (n === null ? "—" : String(n).replace(".", ","));

/**
 * Faqat CEO «Barcha filiallar» tanlaganda keladi (server `filiallar: []`
 * aks holda). Qatorga bosilsa global tanlagichda o'sha filial tanlanadi —
 * `BranchScopedMain` sahifani o'zi qayta yuklaydi.
 */
export function DafFiliallarTable({ qatorlar }: { qatorlar: MarkazFilialQatori[] }) {
  const branches = useBranchSwitcher((s) => s.branches);
  const selectBranch = useBranchSwitcher((s) => s.selectBranch);

  return (
    <div className="rounded-xl border bg-card">
      <div className="px-4 pt-4">
        <h3 className="text-base font-semibold">Filiallar</h3>
        <p className="text-xs text-muted-foreground">Qatorga bosilsa o&apos;sha filial tanlanadi</p>
      </div>
      <div className="overflow-x-auto p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filial</TableHead>
              <TableHead className="text-right">O&apos;quvchi</TableHead>
              <TableHead className="text-right">Qamrov</TableHead>
              <TableHead className="text-right">Norma</TableHead>
              <TableHead className="text-right">O&apos;rt. faol kun</TableHead>
              <TableHead className="text-right">To&apos;g&apos;ri javob</TableHead>
              <TableHead className="text-right">Tugatilgan dars</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qatorlar.map((q) => {
              const filial = branches.find((b) => b.id === q.branchId) ?? null;
              return (
                <TableRow
                  key={q.branchId}
                  className={cn(filial && "cursor-pointer hover:bg-muted/50")}
                  onClick={() => filial && selectBranch(filial)}
                >
                  <TableCell className="font-medium">{q.nomi}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.oquvchilar}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", foizRangi(q.qamrovFoiz))}>{foizMatn(q.qamrovFoiz)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", foizRangi(q.normaFoiz))}>{foizMatn(q.normaFoiz)}</TableCell>
                  <TableCell className="text-right tabular-nums">{kasr(q.ortachaFaolKunHaftada)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", foizRangi(q.foiz))}>{foizMatn(q.foiz)}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.tugatilganDarslar}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4b: «Raqamlar qanday hisoblanadi» — markazning o'z tushuntirishi**

Guruh tabidagi `ActivityExplainer` bu yerda ISHLATILMAYDI: u «shug'ullangan kun» ni «mashq yoki
5 daqiqa radio» deb tushuntiradi, markazda esa radio umuman sanalmaydi (dizayn 3.3-a). Bitta so'z
ikki ma'noda tursa, qoidani bilmoqchi bo'lgan odam aynan shu yerdan noto'g'ri javob oladi.

`client/src/components/daf-center/daf-explainer.tsx`:

```tsx
"use client";

import { formatKunOy } from "@/components/groups/app-activity/activity-format";
import type { Norma } from "./types";

/**
 * Bu sahifadagi raqamlar qanday hisoblanishi. Guruh tabidagi `ActivityExplainer`
 * bu yerda QAYTA ISHLATILMAYDI — u «shug'ullangan kun» ni «mashq yoki 5 daqiqa
 * radio» deb ta'riflaydi, markazda esa radio sanalmaydi (dizayn 3.3-a). Matn
 * normadan o'qiladi, shuning uchun CEO sozlamani o'zgartirsa shu yerda ham
 * darhol yangi raqam turadi.
 */
export function DafExplainer({
  norma,
  kuzatuvBoshi,
}: {
  norma: Norma;
  kuzatuvBoshi: string | null;
}) {
  return (
    <details className="rounded-xl border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Raqamlar qanday hisoblanadi</summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>
          <b className="text-foreground">Faol kun</b> — o&apos;quvchi o&apos;sha kuni o&apos;quv
          bo&apos;limida kamida <b className="text-foreground">{norma.kunlikDaqiqa} daqiqa</b>{" "}
          ishlagan yoki tugatilgan seanslarda kamida{" "}
          <b className="text-foreground">{norma.kunlikSavol} ta</b> savolga javob bergan kun. Radio
          tinglash bunga kirmaydi.
        </p>
        <p>
          <b className="text-foreground">Holat</b> — haftada{" "}
          <b className="text-foreground">{norma.haftalikKun} kun</b> faol bo&apos;lsa yashil,{" "}
          <b className="text-foreground">{norma.sariqKun} kundan</b> boshlab sariq, kamroq
          bo&apos;lsa qizil. 30 kunlik davrda talab shunga mutanosib o&apos;sadi. Normani CEO
          sozlamalarda o&apos;zgartiradi.
        </p>
        <p>
          <b className="text-foreground">Ikki xil «kirgan»</b> — «bir marta bo&apos;lsa ham kirgan»
          butun tarix bo&apos;yicha, «davr ichida kirgan» esa faqat tanlangan davr bo&apos;yicha.
          Ilgari kirib, keyin tashlab ketgan o&apos;quvchi «hech qachon kirmagan» emas.
        </p>
        <p>
          <b className="text-foreground">O&apos;rtachalar</b> davrda kirganlar orasida hisoblanadi,{" "}
          <b className="text-foreground">foizlar</b> esa barcha faol o&apos;quvchiga nisbatan —
          akkaunti yo&apos;qlar ham maxrajda turadi.
        </p>
        <p>
          <b className="text-foreground">To&apos;g&apos;ri javob</b> — tugatilgan seanslar
          bo&apos;yicha. Guruh sahifasidagi foiz urinishlardan hisoblanadi, shuning uchun 1–2 foiz
          farq qilishi mumkin.
        </p>
        <p>
          {kuzatuvBoshi
            ? `Kuzatuv ${formatKunOy(kuzatuvBoshi)} dan boshlangan — undan oldingi kunlar hech kimga hisoblanmaydi.`
            : "Ilova faolligi hali qayd etilmagan."}
        </p>
      </div>
    </details>
  );
}
```

- [ ] **Step 5: Sahifa**

`client/src/app/(dashboard)/daf/page.tsx`:

```tsx
import { Suspense } from "react";
import { DafUmumiyClient } from "@/components/daf-center/daf-umumiy-client";

export default function DafUmumiyPage() {
  // `useSearchParams` Suspense chegarasisiz build'ni yiqitadi.
  return (
    <Suspense fallback={null}>
      <DafUmumiyClient />
    </Suspense>
  );
}
```

`client/src/components/daf-center/daf-umumiy-client.tsx`:

```tsx
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError, PeriodToggle, usePeriodParam } from "@/components/groups/app-activity/activity-ui";
import { DafExplainer } from "./daf-explainer";
import { DafFiliallarTable } from "./daf-filiallar-table";
import { DafKpiCards } from "./daf-kpi-cards";
import { DafTrendChart } from "./daf-trend-chart";
import { DafVoronka } from "./daf-voronka";
import { useMarkazUmumiy } from "./use-daf-center";

function SahifaSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export function DafUmumiyClient() {
  const [davr, setDavr] = usePeriodParam();
  const { data, isLoading, isError, refetch } = useMarkazUmumiy(davr);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight">DaF ilovasi — umumiy holat</h1>
          <p className="text-sm text-muted-foreground">
            Filial yuqoridagi tanlagichdan; veb, Android va iOS bir xil qoida bilan sanaladi
          </p>
        </div>
        <PeriodToggle value={davr} onChange={setDavr} />
      </div>

      {isLoading ? (
        <SahifaSkeleton />
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : data.kartalar.oquvchilar === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">Tanlangan filialda faol o&apos;quvchi yo&apos;q</p>
        </div>
      ) : (
        <>
          <DafKpiCards k={data.kartalar} norma={data.norma} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DafVoronka voronka={data.voronka} davr={davr} />
            <DafTrendChart trend={data.trend} />
          </div>
          {data.filiallar.length > 0 && <DafFiliallarTable qatorlar={data.filiallar} />}
          <DafExplainer norma={data.norma} kuzatuvBoshi={data.kuzatuvBoshi} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Tekshirish**

```bash
cd client && npm run typecheck && npx eslint src/components/daf-center
```
Expected: toza. Qo'lda (`npm run dev`, server ham ishlab tursin): `/daf` — kartalar, voronka, trend, (CEO + «Barcha filiallar» da) filiallar jadvali; davr 7↔30; voronkadagi yo'qotish havolasi `/daf/oquvchilar?status=...` ga olib o'tadi (u sahifa 15-vazifagacha 404 — kutilgan). Dev bazada sonlar nol yoki kichik — bu normal.

- [ ] **Step 7: Commit**

```bash
git add src/components/daf-center "src/app/(dashboard)/daf/page.tsx"
git commit -m "$(cat <<'MSG'
DaF ilovasi: «Umumiy holat» sahifasi

Oltita karta, bosiladigan voronka, 30 kunlik ikki chiziqli trend,
CEO uchun filiallar jadvali. Filial — global tanlagichdan.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 15: «O'quvchilar» sahifasi

**Files:**
- Create: `client/src/components/daf-center/daf-oquvchilar-client.tsx`
- Create: `client/src/components/daf-center/daf-qidiruvli-select.tsx`, `daf-oquvchilar-filter-bar.tsx`, `daf-oquvchilar-table.tsx`, `daf-oquvchi-sheet.tsx`, `daf-royxat-nusxalash.tsx`
- Create: `client/src/app/(dashboard)/daf/oquvchilar/page.tsx`

**Interfaces:**
- Consumes: `useMarkazOquvchilar`, `markazTelefonlarniOl`, `OquvchilarFiltri`, `filtrniUrldanOqi`, `filtrniUrlgaYoz`, `STANDART_FILTR`, `SAHIFA_HAJMI`, `HolatBadge`, `HOLAT_MATNI`, `HOLATLAR`, `SARALASHLAR`, `DayBars`, `ProgressLine`, `PeriodToggle`, `ActivityError`, `StudentActivityPanel`, `oxirgiFaollikMatni`, `formatDavomiylik`, `formatKunOy`, `formatOxirgiFaollik`, `foizRangi`, `formatPhone`, `MultiSelectCombobox` (`options`, `selected`, `onChange`, `placeholder`, `countSuffix`), `Select*`, `Input`, `Button`, `Avatar*`, `Badge`, `Table*`, `Sheet*`, `Tooltip*`.

- [ ] **Step 1: Filtr paneli**

**Ikki qaror (CEO, 20.09.2026):**

1. **Sahifada 50 qator, tanlagichsiz.** `client/CLAUDE.md` har jadvalga 10/20/30/40/50
   tanlagichini talab qiladi, lekin bu ish ro'yxati: 400 o'quvchi 50 talikda 8 sahifa, 10 talikda
   40 sahifa bo'ladi va qo'ng'iroq ro'yxatini ko'rib chiqish cho'ziladi. Guruh roster jadvali ham
   xuddi shu sababdan ongli istisno. Istisno `daf-oquvchilar-client.tsx` boshida izoh bilan
   yozib qo'yiladi, roster faylidagi kabi.
2. **Guruh va o'qituvchi tanlagichlari qidiruvli.** `client/CLAUDE.md` «Searchable Select» bo'limi
   aynan shu ikki ro'yxatni nomma-nom sanaydi; CEO hamma filialni ko'rganda ular 40–50 tagacha
   yetadi. Daraja uchta variantdan iborat — oddiy `<Select>` qoladi.

`client/src/components/daf-center/daf-oquvchilar-filter-bar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodToggle } from "@/components/groups/app-activity/activity-ui";
import { HOLAT_MATNI } from "./holat-badge";
import { STANDART_FILTR, type OquvchilarFiltri } from "./oquvchilar-filtr";
import { HOLATLAR, type Daraja, type Holat, type MarkazFiltrVariantlari } from "./types";

const HAMMASI = "all";

export function DafOquvchilarFilterBar({
  filtr,
  variantlar,
  onChange,
}: {
  filtr: OquvchilarFiltri;
  variantlar: MarkazFiltrVariantlari | undefined;
  onChange: (next: OquvchilarFiltri) => void;
}) {
  // Qidiruv: har tugmada URL yozilmasin — 300 ms kutib, keyin bitta marta.
  const [q, setQ] = useState(filtr.q);
  useEffect(() => setQ(filtr.q), [filtr.q]);
  useEffect(() => {
    if (q === filtr.q) return;
    const t = setTimeout(() => onChange({ ...filtr, q, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [q, filtr, onChange]);

  const oz = (qism: Partial<OquvchilarFiltri>) => onChange({ ...filtr, ...qism, page: 1 });
  const filtrBor =
    filtr.status.length > 0 || filtr.kirgan !== null || filtr.groupId !== null ||
    filtr.teacherId !== null || filtr.level !== null || filtr.q !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodToggle value={filtr.davr} onChange={(davr) => oz({ davr })} />

      <MultiSelectCombobox
        options={HOLATLAR.map((h) => ({ value: h, label: HOLAT_MATNI[h] }))}
        selected={filtr.status}
        onChange={(next) => oz({ status: next as Holat[] })}
        placeholder="Barcha holatlar"
        countSuffix="holat"
        className="w-48"
      />

      <Select value={filtr.kirgan ?? HAMMASI} onValueChange={(v) => oz({ kirgan: v === HAMMASI ? null : (v as "ha" | "yoq") })}>
        <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HAMMASI}>Kirish: hammasi</SelectItem>
          <SelectItem value="ha">Davrda kirgan</SelectItem>
          <SelectItem value="yoq">Davrda kirmagan</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filtr.groupId ?? HAMMASI} onValueChange={(v) => oz({ groupId: v === HAMMASI ? null : v })}>
        <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Barcha guruhlar" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HAMMASI}>Barcha guruhlar</SelectItem>
          {(variantlar?.guruhlar ?? []).map((g) => (
            <SelectItem key={g.id} value={g.id}>{g.nomi}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filtr.teacherId === null ? HAMMASI : String(filtr.teacherId)} onValueChange={(v) => oz({ teacherId: v === HAMMASI ? null : Number(v) })}>
        <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Barcha o'qituvchilar" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HAMMASI}>Barcha o&apos;qituvchilar</SelectItem>
          {(variantlar?.oqituvchilar ?? []).map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>{o.ism}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filtr.level ?? HAMMASI} onValueChange={(v) => oz({ level: v === HAMMASI ? null : (v as Daraja) })}>
        <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Daraja" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={HAMMASI}>Barcha darajalar</SelectItem>
          {(variantlar?.darajalar ?? []).map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        {/* `maxLength` server DTO si bilan bir xil: 100 dan oshsa so'rov 400 bilan rad etiladi. */}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ism yoki telefon"
          maxLength={100}
          className="h-9 w-52 pl-8"
        />
      </div>

      {filtrBor && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...STANDART_FILTR, davr: filtr.davr, sort: filtr.sort, dir: filtr.dir })}>
          <X className="mr-1 size-4" /> Tozalash
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Jadval**

`client/src/components/daf-center/daf-oquvchilar-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DayBars, ProgressLine } from "@/components/groups/app-activity/activity-ui";
import { formatDavomiylik, formatKunOy, formatOxirgiFaollik, foizRangi } from "@/components/groups/app-activity/activity-format";
import { cn } from "@/lib/utils";
import { HolatBadge } from "./holat-badge";
import type { MarkazOquvchiQatori, Saralash, Yonalish } from "./types";

function boshHarflar(ism: string): string {
  const q = ism.trim().split(/\s+/).filter(Boolean);
  if (q.length === 0) return "?";
  if (q.length === 1) return q[0].slice(0, 2).toUpperCase();
  return `${q[0][0]}${q[q.length - 1][0]}`.toUpperCase();
}

function SortHead({
  kalit,
  matn,
  sort,
  dir,
  onSort,
  className,
}: {
  kalit: Saralash;
  matn: string;
  sort: Saralash;
  dir: Yonalish;
  onSort: (kalit: Saralash) => void;
  className?: string;
}) {
  const faol = sort === kalit;
  const Icon = !faol ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onSort(kalit)} className={cn("inline-flex items-center gap-1 hover:text-foreground", faol && "text-foreground")}>
        {matn}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

export function DafOquvchilarTable({
  qatorlar,
  sahifa,
  sahifaHajmi,
  filialUstuni,
  sort,
  dir,
  onSort,
  onSelect,
  selectedId,
}: {
  qatorlar: MarkazOquvchiQatori[];
  sahifa: number;
  sahifaHajmi: number;
  filialUstuni: boolean;
  sort: Saralash;
  dir: Yonalish;
  onSort: (kalit: Saralash) => void;
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  const [now] = useState(() => new Date());
  const s = { sort, dir, onSort };

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <SortHead kalit="ism" matn="O'quvchi" className="min-w-44" {...s} />
            <SortHead kalit="guruh" matn="Guruh" className="min-w-36" {...s} />
            {filialUstuni && <TableHead className="hidden lg:table-cell">Filial</TableHead>}
            <SortHead kalit="holat" matn="Holat" className="min-w-40" {...s} />
            <SortHead kalit="faolKun" matn="Faol kun" className="min-w-40" {...s} />
            <SortHead kalit="vaqt" matn="Vaqt" className="min-w-24 text-right" {...s} />
            <SortHead kalit="foiz" matn="To'g'ri javob" className="min-w-28 text-right" {...s} />
            <TableHead className="hidden min-w-40 xl:table-cell">Kurs</TableHead>
            <SortHead kalit="oxirgi" matn="Oxirgi kirish" className="min-w-32" {...s} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {qatorlar.map((row, i) => (
            <TableRow
              key={row.studentId}
              className={cn("cursor-pointer hover:bg-muted/50", selectedId === row.studentId && "bg-muted")}
              onClick={() => onSelect(row.studentId)}
            >
              <TableCell className="border-r text-muted-foreground">{(sahifa - 1) * sahifaHajmi + i + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={row.photo ?? undefined} alt="" />
                    <AvatarFallback className="text-xs">{boshHarflar(row.ism)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.ism}</div>
                    {!row.akkaunt && <div className="text-xs text-muted-foreground">Akkaunt yo&apos;q</div>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {row.guruh ? (
                  <div className="min-w-0">
                    <div className="truncate text-sm">{row.guruh.nomi}</div>
                    {row.oqituvchi && <div className="truncate text-xs text-muted-foreground">{row.oqituvchi.ism}</div>}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              {filialUstuni && (
                <TableCell className="hidden text-sm lg:table-cell">{row.filial?.nomi ?? "—"}</TableCell>
              )}
              <TableCell><HolatBadge holat={row.holat} /></TableCell>
              <TableCell>
                {row.akkaunt ? (
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-12 cursor-default text-sm tabular-nums">{row.faolKun}/{row.maxraj}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatKunOy(row.hisobBoshi)} dan beri · yashil uchun {row.kerakliKun}, sariq uchun {row.sariqKerak} kun kerak
                      </TooltipContent>
                    </Tooltip>
                    <DayBars kunlar={row.kunlar} className="hidden sm:flex" shugullanganMatni="Faol kun (norma)" />
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.akkaunt && row.lernenSoniya > 0 ? (
                  <div className="flex flex-col items-end">
                    <span className="font-medium">{formatDavomiylik(row.ortachaKunlikSoniya)}</span>
                    <span className="text-xs text-muted-foreground">kuniga</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.akkaunt && row.foiz !== null ? (
                  <div className="flex flex-col items-end">
                    <span className={cn("font-medium tabular-nums", foizRangi(row.foiz))}>{row.foiz}%</span>
                    <span className="text-xs text-muted-foreground">{row.savollar} savol</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {row.akkaunt && row.kurs ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{row.kurs.daraja}</Badge>
                    {row.kurs.holat === "KURS_YOQ" ? (
                      <span className="text-xs text-muted-foreground">Kurs hali yo&apos;q</span>
                    ) : (
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-xs tabular-nums text-muted-foreground">{row.kurs.tugatilgan}/{row.kurs.jami} dars</div>
                        <ProgressLine value={row.kurs.tugatilgan} total={row.kurs.jami} />
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className={cn("text-sm", !row.oxirgiFaollik && row.akkaunt && "text-red-600 dark:text-red-400")}>
                {row.akkaunt ? formatOxirgiFaollik(row.oxirgiFaollik?.vaqt ?? null, now) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Yon oyna va nusxalash tugmasi**

`client/src/components/daf-center/daf-oquvchi-sheet.tsx`:

```tsx
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { oxirgiFaollikMatni, StudentActivityPanel } from "@/components/groups/app-activity/student-activity-panel";
import type { Davr } from "./types";

/**
 * Mavjud o'quvchi paneli — profil sahifasidagi «Ilova» tabi bilan bir xil
 * manzil (`/students/:id/app-activity`). Yangi komponent yozilmaydi (dizayn 6.3).
 */
export function DafOquvchiSheet({
  studentId,
  davr,
  onDavrChange,
  onClose,
}: {
  studentId: number | null;
  davr: Davr;
  onDavrChange: (d: Davr) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {studentId !== null && (
          <StudentActivityPanel
            url={`/students/${studentId}/app-activity`}
            davr={davr}
            onDavrChange={onDavrChange}
            bodyClassName="flex-1 overflow-y-auto px-6 py-5"
            renderHeader={(data, meta) => (
              <SheetHeader className="border-b px-6 py-4">
                {data ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-11">
                        <AvatarImage src={data.photo ?? undefined} alt="" />
                        <AvatarFallback>{data.ism.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <SheetTitle className="truncate">{data.ism}</SheetTitle>
                        <SheetDescription>Oxirgi faollik: {oxirgiFaollikMatni(data)}</SheetDescription>
                      </div>
                    </div>
                    {data.akkaunt && meta}
                  </>
                ) : (
                  <>
                    <SheetTitle className="sr-only">O&apos;quvchi faolligi</SheetTitle>
                    <Skeleton className="h-11 w-56" />
                  </>
                )}
              </SheetHeader>
            )}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
```

`client/src/components/daf-center/daf-royxat-nusxalash.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format-utils";
import type { OquvchilarFiltri } from "./oquvchilar-filtr";
import { markazTelefonlarniOl } from "./use-daf-center";

/**
 * Joriy filtr bo'yicha HAMMA o'quvchi (joriy sahifa emas) — har o'quvchi bir
 * qator: ism, guruh, telefon, ota-ona telefoni (dizayn 6.4). Administrator
 * kimga qo'ng'iroq qilayotganini bilishi kerak, shuning uchun yalang'och
 * raqamlar emas.
 */
export function DafRoyxatNusxalash({ filtr, jami }: { filtr: OquvchilarFiltri; jami: number }) {
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  async function nusxala() {
    setYuklanmoqda(true);
    try {
      const t = await markazTelefonlarniOl(filtr);
      const matn = t.qatorlar
        .map((q) =>
          [
            q.ism,
            q.guruh ?? "guruhsiz",
            formatPhone(q.telefon),
            q.otaOnaTelefoni ? `ota-onasi: ${formatPhone(q.otaOnaTelefoni)}` : null,
          ]
            .filter(Boolean)
            .join(" — "),
        )
        .join("\n");
      await navigator.clipboard.writeText(matn);
      toast.success(
        t.qisqartirildi
          ? `${t.qatorlar.length} qator nusxalandi — ro'yxat qisqartirildi (jami ${t.jami})`
          : `${t.qatorlar.length} qator nusxalandi`,
      );
    } catch {
      toast.error("Nusxalab bo'lmadi");
    } finally {
      setYuklanmoqda(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={jami === 0 || yuklanmoqda} onClick={nusxala}>
      {yuklanmoqda ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Copy className="mr-1.5 size-4" />}
      Ro&apos;yxatni nusxalash
    </Button>
  );
}
```

- [ ] **Step 4: Sahifa**

`client/src/app/(dashboard)/daf/oquvchilar/page.tsx`:

```tsx
import { Suspense } from "react";
import { DafOquvchilarClient } from "@/components/daf-center/daf-oquvchilar-client";

export default function DafOquvchilarPage() {
  // `useSearchParams` Suspense chegarasisiz build'ni yiqitadi.
  return (
    <Suspense fallback={null}>
      <DafOquvchilarClient />
    </Suspense>
  );
}
```

`client/src/components/daf-center/daf-oquvchilar-client.tsx`:

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError } from "@/components/groups/app-activity/activity-ui";
import { DafOquvchiSheet } from "./daf-oquvchi-sheet";
import { DafOquvchilarFilterBar } from "./daf-oquvchilar-filter-bar";
import { DafOquvchilarTable } from "./daf-oquvchilar-table";
import { DafRoyxatNusxalash } from "./daf-royxat-nusxalash";
import { filtrniUrldanOqi, filtrniUrlgaYoz, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Saralash } from "./types";
import { useMarkazOquvchilar } from "./use-daf-center";

export function DafOquvchilarClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Holat URL da (dizayn 6.1) — havola bilan ulashiladi, voronka shu yerga olib keladi.
  const filtr = useMemo(() => filtrniUrldanOqi(new URLSearchParams(searchParams.toString())), [searchParams]);
  const setFiltr = useCallback(
    (next: OquvchilarFiltri) => router.replace(`${pathname}${filtrniUrlgaYoz(next)}`, { scroll: false }),
    [router, pathname],
  );

  const { data, isLoading, isError, isFetching, refetch } = useMarkazOquvchilar(filtr);
  const [tanlangan, setTanlangan] = useState<number | null>(null);

  const sarala = (kalit: Saralash) =>
    setFiltr({
      ...filtr,
      sort: kalit,
      dir: filtr.sort === kalit && filtr.dir === "asc" ? "desc" : "asc",
      page: 1,
    });

  const oxirgiSahifa = data ? Math.max(1, Math.ceil(data.jami / data.sahifaHajmi)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">DaF ilovasi — o&apos;quvchilar</h1>
        <p className="text-sm text-muted-foreground">
          Kim ishlamayapti — eng muammolisi yuqorida. Qatorga bosing: o&apos;quvchining to&apos;liq surati
        </p>
      </div>

      <DafOquvchilarFilterBar filtr={filtr} variantlar={data?.filtrVariantlari} onChange={setFiltr} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{data.jami}</span> ta o&apos;quvchi topildi
              {isFetching && " · yangilanmoqda…"}
            </p>
            <DafRoyxatNusxalash filtr={filtr} jami={data.jami} />
          </div>

          {data.qatorlar.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border">
              <p className="text-sm text-muted-foreground">Bu filtrga mos o&apos;quvchi yo&apos;q</p>
            </div>
          ) : (
            <DafOquvchilarTable
              qatorlar={data.qatorlar}
              sahifa={data.sahifa}
              sahifaHajmi={data.sahifaHajmi}
              filialUstuni={data.filialUstuni}
              sort={filtr.sort}
              dir={filtr.dir}
              onSort={sarala}
              onSelect={setTanlangan}
              selectedId={tanlangan}
            />
          )}

          {oxirgiSahifa > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={data.sahifa <= 1} onClick={() => setFiltr({ ...filtr, page: data.sahifa - 1 })}>
                <ChevronLeft className="mr-1 size-4" /> Oldingi
              </Button>
              <span className="text-sm tabular-nums">{data.sahifa} / {oxirgiSahifa}</span>
              <Button variant="outline" size="sm" disabled={data.sahifa >= oxirgiSahifa} onClick={() => setFiltr({ ...filtr, page: data.sahifa + 1 })}>
                Keyingi <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <DafOquvchiSheet
        studentId={tanlangan}
        davr={filtr.davr}
        onDavrChange={(davr) => setFiltr({ ...filtr, davr, page: 1 })}
        onClose={() => setTanlangan(null)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Tekshirish**

```bash
cd client && npm run typecheck && npm run lint && npx vitest run
```
Expected: toza, testlar PASS. Qo'lda: `/daf/oquvchilar` — ro'yxat, filtrlar URL ga yoziladi (sahifani yangilasa qoladi), ustun sarlavhasi saralaydi, qatorga bosilsa yon oyna, «Ro'yxatni nusxalash» buferga «Ism — guruh — +998 …» qatorlarini qo'yadi, voronkadan kelgan havola filtrni to'g'ri qo'yadi.

- [ ] **Step 6: Commit**

```bash
git add src/components/daf-center "src/app/(dashboard)/daf/oquvchilar/page.tsx"
git commit -m "$(cat <<'MSG'
DaF ilovasi: «O'quvchilar» sahifasi

Filtrlar URL da, saralanadigan jadval, 50 talik sahifalash, mavjud
o'quvchi yon oynasi, joriy filtr bo'yicha ro'yxatni nusxalash.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 16: ADR-0024, indeks, CONTEXT.md

**Files:**
- Create: `docs/adr/0024-daf-faollik-normasi-yigindi-sql-qaror-ts.md`
- Modify: `docs/adr/README.md` (jadval oxiriga qator)
- Modify: `CONTEXT.md` («O'quv jarayoni» bo'limi, `**Enrollment**` paragrafidan keyin)

- [ ] **Step 1: ADR**

`docs/adr/0024-daf-faollik-normasi-yigindi-sql-qaror-ts.md`:

```markdown
# ADR-0024 — DaF faollik normasi sozlamada; yig'indi SQL da, qaror TypeScript da

**Holati:** Qabul qilindi
**Sana:** 2026-09-20
**Bog'liq:** ADR-0002 (fail-closed qamrov), ADR-0015 (faol o'quvchi ta'rifi manifest), ADR-0019 (mashq natijasi umumiy shartnoma), ADR-0020 (ilova faolligi klientda o'lchanadi), `server/src/app-activity/norma/norma.ts`, `server/src/app-activity/center/`, [dizayn](../superpowers/specs/2026-09-20-daf-markaz-nazorati-design.md)

## Kontekst

O'quvchi ilovasidagi faollik 13.09.2026 dan o'lchanadi (ADR-0020), lekin u faqat
bitta guruh tabi va bitta o'quvchi paneli kesimida ko'rinardi. Markaz darajasida
«kim ishlamayapti», «qaysi filial orqada» degan savollarga javob yo'q edi, va
chuqurroq muammo — **«yaxshi ishlayapti» degani nima ekani hech qayerda yozilmagan
edi**: ekranlar xom raqam ko'rsatardi (14 daqiqa, 76 %), lekin bu ko'p yoki
ozligini aytmasdi.

Markaz sahifasi 1000+ o'quvchi uchun hisoblanadi. Guruh tabi har o'quvchining
seanslarini serverga tortib TypeScript da yig'adi (`kunlikYigindi`,
`savolNatijalari`); markaz uchun bu yo'l yuz minglab qator degani. Yig'indini
bazada olish kerak — va shu yerda savol tug'iladi: **qoida qayerda yashaydi?**

ADR-0015 ning saboqi: `activeStudentWhere()` bitta faylga yig'ilgan bo'lsa ham,
uni chaqirmagan uch joy eski shartini yozib qolaverdi va uchta ekran uch xil
«faol o'quvchi» soni ko'rsatdi. Bu yerda xavf undan katta: qoida SQL da ham,
TypeScript da ham bo'lsa, ikkisi bir-biridan bexabar o'zgaradi.

Uchinchi kuzatuv: «to'g'ri javob %» qoidasi (ADR-0019, `savolNatijalari`)
oddiy emas — juftlash formatida 4/6 juft hammasi to'g'ri bo'lishi kerak,
o'rinbosar urinish sanalmaydi, tugallanmagan savol chetda. Uni SQL da
qaytadan yozish shartnomaning ikkinchi nusxasi bo'lardi. Lekin `DafSession`
seans yakunida **o'sha qoida bilan** hisoblangan `questionCount` /
`firstTryCorrect` ni saqlaydi.

## Qaror

**1. Norma — `Company` ustunlari, kod emas.** `dafKunlikDaqiqa`,
`dafKunlikSavol`, `dafHaftalikKun`, `dafSariqKun`. CEO `/settings/daf` da
o'zgartiradi. Boshlang'ich 10 / 12 / 4 / 2 — taxminiy; real taqsimot ko'rilib
sozlanadi, deploy kutmaydi. Norma o'zgarsa o'tmish ham yangi norma bilan
hisoblanadi: norma tarixiy fakt emas, bugungi nazorat mezoni.

**2. «Faol kun» = LERNEN ≥ N daqiqa YOKI tugatilgan seanslarda ≥ K savol.**
Dars tugatish shart emas — takrorlash (Wiederholung) seansi darsni tugatmaydi,
lekin u ilovadagi eng muhim kunlik ish. Faqat `LERNEN` bo'limi vaqti sanaladi;
radio va boshqa bo'limlar normani bajarmaydi. Holat rangi maxrajga mutanosib
chegaralar bilan: `kerakliKun = max(1, round(haftalikKun × maxraj / 7))`.

**3. Yig'indi SQL da, qaror TypeScript da.** SQL (o'quvchi, kun) bo'yicha
faqat mexanik son qaytaradi: qirqilgan faol soniya, LERNEN soniya, kirdi,
savollar. «Bu kun faolmi», «bu o'quvchi qizilmi», saralash tartibi — faqat
`norma.ts` va `markaz-royxat.ts` da. Shuning uchun saralash va sahifalash
bazada emas, serverda: holat normadan chiqadi, norma SQL ga kirmasin.
Populyatsiya (≤ bir necha ming) buni ko'taradi; 3 000 faol o'quvchi yoki 2 s
dan uzoq so'rovda kunlik qoida parametrli SQL ga tushiriladi — chegaralar
baribir `norma.ts` dan parametr bo'lib boradi.

**4. To'g'ri javob % markazda tugatilgan seanslardan.**
`Σ firstTryCorrect / Σ questionCount` — seans yakunida `seansYigindisi()`
bilan yozilgan sonlar. Urinish qoidasi SQL da qaytadan yozilmaydi. Guruh tabi
urinishlardan hisoblaydi (tugallanmagan seanslar ham kiradi) — 1–2 % farq
kutilgan va ekranda «tugatilgan seanslar bo'yicha» deb yoziladi.

**5. Populyatsiya faqat Prisma + `activeStudentWhere()`.** `"Student"`
jadvaliga xom SQL yozilmaydi — ADR-0015 skaneri xom SQL ni ko'rmaydi. Filial
cheklovi `@BranchScope()` (sarlavhadagi tanlov ∩ ruxsat); `[]` bo'lsa bazaga
so'rov ketmaydi (ADR-0002).

## Ko'rib chiqilgan muqobillar

- **Holatni SQL da hisoblash, saralash bazada.** Tezroq, lekin norma va
  chegara formulasi SQL da ham, TypeScript da ham bo'lardi — ADR-0015 dagi
  holatning o'zi. Rad etildi.
- **Urinishlarni serverga tortib `savolNatijalari()` dan o'tkazish.** Qoida
  bitta joyda qolardi, lekin 1000 o'quvchining 30 kunlik urinishlari — yuz
  minglab qator har sahifa ochilishida. Rad etildi.
- **«Yoki bitta darsni tugatgan» sharti** (birinchi o'qishdagi variant).
  Takrorlash seansini ko'rmaydi: kuniga 5 daqiqada 15 so'zni takrorlagan
  intizomli o'quvchi qizil chiqardi. Rad etildi.
- **Kunlik agregat jadvali (cron bilan to'ldiriladigan).** Bir soatgacha
  eskirish va yana bir «haqiqat manbai» — norma o'zgarganda qayta to'ldirish
  kerak. Hozir keraksiz; hajm oshsa 3-banddagi parametrli SQL avval ko'riladi.
- **Norma kodda konstanta.** Har sozlash deploy — birinchi hafta CEO normani
  bir necha marta o'zgartirishi aniq. Rad etildi.

## Oqibatlari

**Yaxshi:**
- Bitta savolga bitta javob: «faol kun» va «holat» qayerda ko'rinsa ham
  `norma.ts` dan chiqadi. Guruh tabi holat ko'rsatadigan bo'lsa — shu fayldan.
- Norma bugundan sozlanadi; birinchi haftadagi «hamma qizil / hamma yashil»
  xavfi kod o'zgarishisiz yopiladi.
- Markaz so'rovlari soni o'quvchilar sonidan qat'i nazar doimiy (7 ta).
- Yangi filial route'lari manifestga yozilmaydi — dekorator manbada dalil.

**Narxi:**
- Kunlik **qirqish** qoidasi (mexanik, biznes emas) ikki joyda: `kunlikYigindi()`
  (TS, guruh tabi) va `kunlikSeanslar` SQL (markaz). `scripts/check-daf-markaz.ts`
  ikkisini bir xil kirish ustida yuritib farqni chiqaradi — relizdan oldin va
  shubha tug'ilganda.
- Har so'rovda ≤ o'quvchi × 30 kunlik qator serverga keladi (1000 o'quvchida
  ~1 MB). CEO sahifasi uchun yetadi; chegara va keyingi qadam 3-bandda.
- Markaz «to'g'ri javob %» guruh tabidan 1–2 % farq qiladi — qamrov farqi,
  ekranda yozilgan.
- Norma o'zgarganda o'tmishdagi ranglar ham o'zgaradi — bu ataylab, lekin
  «o'tgan hafta yashil edi» degan taqqoslash ma'nosini yo'qotadi.
```

- [ ] **Step 2: Indeks qatori**

`docs/adr/README.md` — jadvalning `0023` qatoridan keyin:

```markdown
| [0024](0024-daf-faollik-normasi-yigindi-sql-qaror-ts.md) | DaF faollik normasi sozlamada; yig'indi SQL da, qaror TypeScript da | Qabul qilindi | 2026-09-20 |
```

- [ ] **Step 3: CONTEXT.md atamasi**

`CONTEXT.md`, «O'quv jarayoni» bo'limida `**Enrollment**` paragrafi (va uning `prisma/schema.prisma` manba qatori) dan keyin:

```markdown
**Faol kun (DaF)** — o'quvchi o'sha Toshkent kunida ilovaning o'quv (`LERNEN`)
bo'limida normadagi daqiqadan kam bo'lmagan vaqt o'tkazgan **yoki** tugatilgan
seanslarda normadagi sondan kam bo'lmagan savolga javob bergan kun. Norma
`Company` da sozlanadi (`dafKunlikDaqiqa`, `dafKunlikSavol`, `dafHaftalikKun`,
`dafSariqKun`, `/settings/daf`). Holat (qizil / sariq / yashil) maxrajga
mutanosib chegaradan chiqadi va **faqat** `norma.ts` da hisoblanadi — SQL
faqat sonlarni yig'adi (ADR-0024).
`app-activity/norma/norma.ts`
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0024-daf-faollik-normasi-yigindi-sql-qaror-ts.md docs/adr/README.md CONTEXT.md
git commit -m "$(cat <<'MSG'
ADR-0024: DaF faollik normasi sozlamada; yig'indi SQL da, qaror TypeScript da

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Task 17: Yakuniy tekshiruv va PR

**Files:** yo'q (tekshiruv va PR).

- [ ] **Step 1: Server — to'liq**

```bash
cd server && npx prisma generate && npm run typecheck && npm run lint && npm test
```
Expected: hammasi yashil. Ayniqsa: `branch-route-policy.spec.ts` (uch yangi route `@BranchScope()` dalili bilan), `active-student-policy.spec.ts` (yangi `student.findMany` manifestga tushmagan), `tashkent.single-source.spec.ts` (yangi kodda taqiqlangan sana ifodasi yo'q).

- [ ] **Step 2: Klient — to'liq**

```bash
cd client && npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: build muvaffaqiyatli; `/daf`, `/daf/oquvchilar`, `/settings/daf` marshrutlari build chiqishida ko'rinadi.

- [ ] **Step 3: Prod nusxasida raqamlarni solishtirish (dizayn 12, «qo'lda tekshirish»)**

Prod bazasi faqat o'qish uchun, `railway run` orqali (memory: `caring-courage` loyihasi):

```bash
cd server
railway run npx ts-node --transpile-only scripts/check-pg-version.ts
railway run npx ts-node --transpile-only scripts/check-daf-markaz.ts 30
```
Expected: `range_agg ✓`; `Kunlik vaqt va kirish: SQL va TS bir xil` (exit 0). Savollar jadvalida farq bo'lishi normal (qamrov farqi) — farq **manfiy** bo'lmasligi kerak (seanslardan urinishlardan ko'proq savol chiqishi mumkin emas); manfiy chiqsa `kunlikSavollar` kun chegarasini tekshiring.

Agar `check-daf-markaz` farq chiqarsa — **PR ochilmaydi**, 8-vazifadagi SQL tuzatiladi.

- [ ] **Step 4: Qo'lda sinov ro'yxati (lokal server + klient, dev baza)**

- [ ] CEO: yon menyuda «DaF ilovasi» → ikki bola; `/daf` ochiladi; davr 7↔30 URL da; filial tanlagichi o'zgarsa sahifa qayta yuklanadi va «Filiallar» jadvali yo'qoladi.
- [ ] CEO: voronkadagi yo'qotish havolasi `/daf/oquvchilar?status=...` ga olib o'tadi va filtr paneli shu holatni ko'rsatadi.
- [ ] Administrator: `/daf` ochiladi, faqat o'z filiali; `/settings/daf` → `/settings` ga qaytaradi.
- [ ] O'qituvchi: menyuda bo'lim yo'q; `/daf` → bosh sahifa; `GET /api/app-activity/center/summary` → 403.
- [ ] `/settings/daf`: sariqni haftalikka teng qilsangiz tugma o'chadi; saqlagach `/daf` da tooltip'lar yangi normani ko'rsatadi (60 s keshdan keyin yoki sahifani yangilab).
- [ ] `/daf/oquvchilar`: saralash, sahifalash, qidiruv (ism va telefon), «Ro'yxatni nusxalash» buferga qatorlar qo'yadi, qatorga bosilsa yon oyna ochiladi.

- [ ] **Step 5: Shoxni yakunlash**

`superpowers:finishing-a-development-branch` ko'nikmasini chaqiring. PR tavsifi o'zbekcha, quyidagi mazmunda va oxirida `🤖 Generated with [Claude Code](https://claude.com/claude-code)`:

```markdown
## DaF ilovasi — markaz nazorati, 1-bosqich

Yon menyuda yangi «DaF ilovasi» bo'limi: **Umumiy holat** (kartalar, voronka, 30 kunlik trend, filiallar) va **O'quvchilar** (kim ishlamayapti — filtr, saralash, sahifalash, ro'yxatni nusxalash). Norma `/settings/daf` da (faqat CEO).

**Dizayn:** `docs/superpowers/specs/2026-09-20-daf-markaz-nazorati-design.md`
**ADR:** 0024 — norma sozlamada; yig'indi SQL da, qaror TypeScript da

### Nima o'zgardi
- `Company` ga to'rt norma ustuni (migratsiya `20260920120000_company_daf_norma`)
- `app-activity/norma/norma.ts` — faol kun va holat, yagona manba
- `app-activity/center/*` — uch GET manzil, `@BranchScope()` bilan
- Klient: `/daf`, `/daf/oquvchilar`, `/settings/daf`
- `scripts/check-pg-version.ts`, `scripts/check-daf-markaz.ts` — o'qish uchun tekshiruv skriptlari

### Deploydan keyin
1. Railway: `prisma migrate deploy` (start:prod o'zi bajaradi)
2. `railway run npx ts-node --transpile-only scripts/check-daf-markaz.ts 30` — farq yo'qligini tasdiqlash
3. CEO `/settings/daf` da normani real taqsimotga qarab sozlaydi

### Keyingi bosqichlar (alohida PR)
- 2: «Guruh va o'qituvchi» sahifasi
- 3: «Kontent» sahifasi
```

Merge va deploy **qo'lda** (memory: Railway/Vercel GitHub ga ulanmagan). Deploy qilinguncha memory'da «kodda, deploy qilinmagan» deb yoziladi.

---

## Self-review (reja yozuvchisi bajargan)

**Spec qamrovi (1-bosqich):**

| Spec bo'limi | Vazifa |
| --- | --- |
| 2 — menyu, rollar, filial | 12 (menyu, qorovul), 11 (`@Roles`, `@BranchScope`) |
| 3.1 — maxraj `activeStudentWhere()` | 10 |
| 3.2 — hech qachon kirmagan / davrda kirgan | 8 (`umumanKirganlar`), 6 (`kirdi`), 3 (`holat`) |
| 3.3 — faol kun (LERNEN yoki savol, qirqish) | 3 (`faolKunmi`), 6, 8 (`range_agg`) |
| 3.4 — norma, mutanosib chegara, holat | 2, 3, 4, 5 |
| 3.5 — foiz tugatilgan seanslardan, oxirgi kirish, kurs | 8 (`kunlikSavollar`), 10 (`oxirgiFaolliklar`, `kurslar`) |
| 3.6 — bir o'quvchi bir qator, guruh/o'qituvchi tanlovi | 7 (`korsatiladiganGuruh`), 10 |
| 4 — sozlama saqlash va ekran | 2, 4, 5 |
| 5 — Umumiy holat: kartalar, voronka, trend, filiallar | 10 (`umumiy`), 14 |
| 6 — O'quvchilar: filtrlar, jadval, yon oyna, nusxalash | 7, 10, 11, 13, 15 |
| 9.1–9.2 — manzillar, filial | 11 |
| 9.3 — yetti so'rov, TS da qaror | 8, 10 |
| 9.4 — solishtiruvchi skript | 9, 17 |
| 10 — klient fayllari, qayta ishlatish, `amber` yo'q | 12–15 |
| 11 — 0-bosqich `SELECT version()` | 1 |
| 12 — testlar | 3, 4, 6, 7, 10, 11, 12, 13; qo'lda — 17 |
| ADR-0024, CONTEXT | 16 |

7- va 8-sahifalar (guruh/o'qituvchi, kontent) — 2- va 3-bosqich, bu rejaga kirmaydi (spec 11).

**Tip izchilligi:** `KunlikSeans`/`KunlikSavol` (6) ↔ `kunlikSeanslar`/`kunlikSavollar` (8) ↔ servis (10); `OquvchilarSorovi`/`SAHIFA_HAJMI` (7) ↔ `sorovniOqi` (11) ↔ klient `sorovParametrlari` (13, `pageSize: 50`); `Holat`/`HOLATLAR` (3) ↔ DTO (11) ↔ klient `types.ts` (13); `MarkazOquvchilar.filialUstuni`, `sahifaHajmi` (6) ↔ jadval (15); `DayBars.shugullanganMatni` (13) ↔ jadval (15); `useBranchSwitcher().selectBranch(BranchItem)` (14) mavjud imzo.

**Placeholder:** yo'q — har qadamda kod yoki buyruq bor. Sahifa fayli har doim o'z klient
komponenti bilan bitta vazifada yaratiladi, shuning uchun vaqtinchalik «tez orada» komponentlari
ham yo'q; 12-vazifadan keyin menyu havolasi 14-vazifagacha 404 beradi va bu vazifa matnida
yozilgan.
