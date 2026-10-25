# Ta'lim ko'rinishi — 1-bosqich «Asos» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi hisobida saqlanadigan «Ta'lim ko'rinishi» asosini qurish: tema reyestri + «Toza» tema (yangi 3D tugun, yopishqoq unit lavhasi, pastdan varaq), Dafi (2D ayiq boshi, 5 holat), Web Audio ovoz effektlari va Sozlamalardagi tanlash ekrani.

**Architecture:** Mantiq (`yol-tuzilishi`, qulf, ball) o'zgarmaydi; tema faqat ko'rinish qatlami (`LernenTema` shartnomasi). Tanlov serverda `Student.lernenTema` (xodimlar `uiSkin` namunasi), ovoz va «kam harakat» — qurilma sozlamasi (`localStorage`). `gsap` faqat Dafi ichida `import("gsap")` bilan lazy yuklanadi.

**Tech Stack:** NestJS + Prisma (server), Next.js 16 + React 19 + Tailwind 4 + `@tanstack/react-query` (client), `gsap`, Web Audio API, Jest (server), Vitest node-muhiti (client).

**Spec:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` · **Mockuplar:** `docs/superpowers/mockups/2026-10-24-lernen-dizayn/` (`dafi-head.js`, `sfx.js`, `duo.html` — bu rejadagi kodlar shulardan portlangan).

> **Qamrov:** bu reja faqat spec §12 ning **1-bosqichi**. Mashq/natija ekrani (2), O'rmon (3), Dengiz (4), Nemis sayohati (5) — keyingi rejalar. Shu rejaning oxirida ishlaydigan, deploy qilsa bo'ladigan natija: yo'l sahifasi yangi «Toza» ko'rinishda, Dafi bilan, ovozli; Sozlamalarda tanlov (hozircha faqat «Toza» tayyor).

## Global Constraints

Spec va repo qoidalaridan, har bir task uchun majburiy:

- Tema idlari: `toza`, `ormon`, `dengiz`, `alp`; sukut `toza`. Server `LERNEN_TEMA_IDLARI` hamma to'rttasini qabul qiladi; mijoz kartochkalarda faqat `tayyor: true` temalarni ko'rsatadi.
- Maydon `Student.lernenTema String?` — `User.uiSkin` ga TEGILMAYDI.
- Route: `PATCH /student-portal/lernen-tema`, `@StudentOnly()`, `@CurrentUser('studentId')`; `studentId` yo'q bo'lsa `NotFoundException('Talaba topilmadi')`.
- Qurilma kalitlari: `daf.lernen.tema` (kesh), `daf.lernen.ovoz`, `daf.lernen.harakat`. Hamma `localStorage` o'qish/yozish `try/catch` ichida; yo'q bo'lsa sahifa baribir to'g'ri chiziladi.
- `gsap` — `package.json` ga qo'shiladi, lekin faqat `import("gsap")` (dinamik) orqali; statik `import ... from "gsap"` TAQIQ.
- Ovoz: tashqi fayl yo'q (Web Audio sintezi); `AudioContext` faqat birinchi foydalanuvchi bosishidan keyin `resume()`; dars audiosi (`anyMediaPlaying()`) o'ynayotganda effektlar chalinmaydi.
- `prefers-reduced-motion` yoki qurilma «Kam harakat» sozlamasi bo'lsa: Dafi statik, ambient/animatsiya yo'q.
- Mijozda Prettier ishlatilmaydi (`client/`); serverda har tegilgan `.ts` ga `npx prettier --write`.
- UI matnlari — o'zbek (lotin), inglizcha so'z yo'q. O'quvchi portali tarjima qilinadi: yangi `t("…")`/`msg("…")` matnlari bor fayl `STRICT_FILES` ga (`client/src/i18n/i18n-coverage.test.ts`) qo'shiladi va matnlar `ru`/`de`/`en` lug'atlariga yoziladi.
- Mavjud `STRICT_FILES` dagi fayllarga (`lernen-yol.tsx`, `student-settings-page.tsx`) yangi `t("…")` matn QO'SHILMAYDI: yangi matnlar yangi fayllarda (`seans-varaq.tsx`, `lernen-korinish-tanlash.tsx`, `lib/lernen-temalar.ts`), ular `STRICT_FILES` ga kiradi. (`student-settings-page.tsx` ga faqat yangi komponent joylanadi, matn emas.)
- Fayl hajmi: yangi fayl 500 qatordan oshmasin; test fayllari yoniga qo'yiladi (`*.test.ts`, vitest) / (`*.spec.ts`, jest).
- Commit xabarlari va kod izohlari — INGLIZCHA; Co-Authored-By qatori: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Ish worktree'da: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/lernen-dizayn` (shox `feat/lernen-dizayn`). Bash buyruqlar shu papkadan; yangi worktree'da `server/` va `client/` ichida `npm install` kerak, `server/.env` ni asosiy checkout'dan symlink qiling.
- Testlar: client `cd client && npx vitest run <fayl>`; server `cd server && npx jest <fayl>`. Bir xil buyruqni kod o'zgarmasdan qayta ishlatmang.

## File Structure

**Server**
- `server/src/common/lernen-temalar.ts` (+`.spec.ts`) — id ro'yxati, sukut.
- `server/src/students/dto/update-lernen-tema.dto.ts` (+`.spec.ts`) — `{ tema }`.
- `server/prisma/schema.prisma` — `Student.lernenTema`.
- `server/prisma/migrations/20261025090000_student_lernen_tema/migration.sql`.
- `server/src/students/student-portal-write.service.ts` (+ yangi `student-portal-write.service.spec.ts`) — `updateLernenTema`.
- `server/src/students/student-portal.service.ts`, `student-portal.controller.ts` (+`.controller.spec.ts`) — fasad va route.
- `server/src/students/student-portal-read.service.ts` (+`.spec.ts`) — `getProfile` javobiga `lernenTema`.
- `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json` — yangi route yozuvlari.

**Client** (`client/src/…`)
- `lib/lernen-temalar.ts` (+test) — idlar, nomlar, `tayyor` bayrog'i; server bilan solishtiruvchi test.
- `components/student-portal/lernen/ovoz/` — `ovoz-qoidalari.ts`, `ovoz-sozlama.ts`, `ovoz-motor.ts`, `ovoz.ts` (+testlar).
- `components/student-portal/lernen/harakat/` — `kam-harakat.ts` (+test), `use-kam-harakat.ts`.
- `components/student-portal/lernen/dafi/` — `dafi-holat.ts` (+test), `dafi-svg.ts`, `dafi-rig.ts`, `dafi.tsx` (+test).
- `components/student-portal/lernen/tema/` — `tema-turlari.ts`, `tema-reyestri.ts` (+test), `tema-tanlash.ts` (+test), `use-lernen-tema.ts`, `toza/toza-tugun-model.ts` (+test), `toza/toza-tugun.tsx` (+test), `toza/toza-tema.ts`.
- `components/student-portal/lernen/yol/` — `joriy-unit.ts` (+test), `yopishqoq-unit-lavha.tsx`, `seans-varaq.tsx`; `lernen-yol.tsx` o'zgaradi.
- `components/student-portal/lernen-korinish-tanlash.tsx` — Sozlamalar kartochkasi; `student-settings-page.tsx` ga ulanadi; `lib/types.ts` (`StudentProfile.lernenTema`).
- `i18n/dictionaries/{ru,de,en}.ts`, `i18n/i18n-coverage.test.ts` (`STRICT_FILES`).

**Docs:** `docs/adr/0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md`, `docs/adr/README.md`, `client/CLAUDE.md`.

---

### Task 1: Server — tema idlari, DTO, ustun va migratsiya

**Files:**
- Create: `server/src/common/lernen-temalar.ts`, `server/src/common/lernen-temalar.spec.ts`
- Create: `server/src/students/dto/update-lernen-tema.dto.ts`, `server/src/students/dto/update-lernen-tema.dto.spec.ts`
- Modify: `server/prisma/schema.prisma` (model `Student`, `photo` dan keyin)
- Create: `server/prisma/migrations/20261025090000_student_lernen_tema/migration.sql`

**Interfaces:**
- Produces: `LERNEN_TEMA_IDLARI: readonly ['toza','ormon','dengiz','alp']`, `type LernenTemaId`, `DEFAULT_LERNEN_TEMA: LernenTemaId`; `UpdateLernenTemaDto { tema: string }`; Prisma maydoni `Student.lernenTema: string | null`.

- [ ] **Step 1: Write the failing tests**

`server/src/common/lernen-temalar.spec.ts`:

```ts
import { DEFAULT_LERNEN_TEMA, LERNEN_TEMA_IDLARI } from './lernen-temalar';

describe('lernen temalar', () => {
  it('lists the four looks, the default first', () => {
    expect([...LERNEN_TEMA_IDLARI]).toEqual(['toza', 'ormon', 'dengiz', 'alp']);
    expect(DEFAULT_LERNEN_TEMA).toBe('toza');
    expect(LERNEN_TEMA_IDLARI[0]).toBe(DEFAULT_LERNEN_TEMA);
  });
});
```

`server/src/students/dto/update-lernen-tema.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLernenTemaDto } from './update-lernen-tema.dto';

const check = (tema: unknown) =>
  validate(plainToInstance(UpdateLernenTemaDto, { tema }));

describe('UpdateLernenTemaDto', () => {
  it.each(['toza', 'ormon', 'dengiz', 'alp'])('accepts %s', async (tema) => {
    expect(await check(tema)).toHaveLength(0);
  });

  it.each(['', 'TOZA', 'neon', 'toza ', undefined, 5])(
    'refuses %p',
    async (tema) => {
      expect(await check(tema)).toHaveLength(1);
    },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/common/lernen-temalar.spec.ts src/students/dto/update-lernen-tema.dto.spec.ts`
Expected: FAIL — `Cannot find module './lernen-temalar'`.

- [ ] **Step 3: Write the implementation**

`server/src/common/lernen-temalar.ts`:

```ts
/**
 * The Ta'lim looks a student may pick (ADR-0125). `Student.lernenTema` holds
 * one of these ids; null means the default. `client/src/lib/lernen-temalar.ts`
 * mirrors this list and its test compares the two. These are NOT the staff
 * skins of ADR-0101 (`User.uiSkin`): the ids may look alike ("ormon"), the
 * lists and columns are separate.
 */
export const LERNEN_TEMA_IDLARI = ['toza', 'ormon', 'dengiz', 'alp'] as const;

export type LernenTemaId = (typeof LERNEN_TEMA_IDLARI)[number];

export const DEFAULT_LERNEN_TEMA: LernenTemaId = 'toza';
```

`server/src/students/dto/update-lernen-tema.dto.ts`:

```ts
import { IsIn } from 'class-validator';
import { LERNEN_TEMA_IDLARI } from '../../common/lernen-temalar';

/** The student's own Ta'lim look (ADR-0125): one of the known ids, nothing else. */
export class UpdateLernenTemaDto {
  @IsIn(LERNEN_TEMA_IDLARI, { message: "Noma'lum ko'rinish" })
  tema!: string;
}
```

`server/prisma/schema.prisma` — model `Student` ichida (anchor: `photo` va `comment` qatorlari, Student blokida):

```prisma
  photo                  String?
  // The Ta'lim look the student picked (ADR-0125): one of LERNEN_TEMA_IDLARI,
  // null = the default. Not User.uiSkin: that is the staff skin.
  lernenTema             String?
  comment                String?
```

`server/prisma/migrations/20261025090000_student_lernen_tema/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Student" ADD COLUMN "lernenTema" TEXT;
```

- [ ] **Step 4: Apply the migration to the dev database and regenerate the client**

Prisma `migrate dev` bu repoda buzuq (loyiha qoidasi); qo'lda qo'llanadi:

```bash
cd server
ln -sf /Users/a1111/Desktop/daf-erp-system/server/.env .env   # yangi worktree'da bir marta
npx prisma db execute --file prisma/migrations/20261025090000_student_lernen_tema/migration.sql
npx prisma migrate resolve --applied 20261025090000_student_lernen_tema
npx prisma generate
```
Expected: `Script executed successfully.` va `Migration ... marked as applied.`

- [ ] **Step 5: Run tests to verify they pass, then format**

Run: `cd server && npx jest src/common/lernen-temalar.spec.ts src/students/dto/update-lernen-tema.dto.spec.ts && npx prettier --write src/common/lernen-temalar.ts src/common/lernen-temalar.spec.ts src/students/dto/update-lernen-tema.dto.ts src/students/dto/update-lernen-tema.dto.spec.ts`
Expected: PASS (2 suites).

- [ ] **Step 6: Commit**

```bash
git add server/src/common/lernen-temalar.ts server/src/common/lernen-temalar.spec.ts server/src/students/dto/update-lernen-tema.dto.ts server/src/students/dto/update-lernen-tema.dto.spec.ts server/prisma/schema.prisma server/prisma/migrations/20261025090000_student_lernen_tema
git commit -m "feat(lernen): student lernenTema column, theme ids and DTO

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server — write service, route and profile read

**Files:**
- Modify: `server/src/students/student-portal-write.service.ts` (yangi metod, `updateName` dan keyin)
- Modify: `server/src/students/student-portal.service.ts` (fasad)
- Modify: `server/src/students/student-portal.controller.ts` (route, `updateName` dan keyin)
- Modify: `server/src/students/student-portal-read.service.ts` (`getProfile` select)
- Modify: `server/src/common/auth/branch-route-policy.ts` (routes ro'yxati, ~1371-qator)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (`"PATCH /student-portal/name"` dan oldin)
- Test: `server/src/students/student-portal.controller.spec.ts`, `server/src/students/student-portal-read.service.spec.ts`; Create: `server/src/students/student-portal-write.service.spec.ts`

**Interfaces:**
- Consumes: `UpdateLernenTemaDto`, `LernenTemaId` (Task 1).
- Produces: `StudentPortalWriteService.updateLernenTema(studentId: number, tema: string): Promise<{ lernenTema: string | null }>`; `PATCH /student-portal/lernen-tema` body `{ tema }` → `{ lernenTema }`; `GET /student-portal/profile` javobida `lernenTema: string | null`.

- [ ] **Step 1: Write the failing tests**

Yangi fayl `server/src/students/student-portal-write.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { StudentPortalWriteService } from './student-portal-write.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StudentPortalWriteService.updateLernenTema', () => {
  function build(count: number) {
    const prisma = {
      student: { updateMany: jest.fn().mockResolvedValue({ count }) },
    };
    const service = new StudentPortalWriteService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    return { prisma, service };
  }

  it("writes the id on the caller's own live card only", async () => {
    const { prisma, service } = build(1);
    const res = await service.updateLernenTema(10042, 'ormon');
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 10042, deletedAt: null },
      data: { lernenTema: 'ormon' },
    });
    expect(res).toEqual({ lernenTema: 'ormon' });
  });

  it('refuses an archived or missing card', async () => {
    const { service } = build(0);
    await expect(service.updateLernenTema(10042, 'ormon')).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

`student-portal-read.service.spec.ts` oxiriga yangi `describe` (fayl boshidagi importlar o'sha: `StudentPortalReadService`, `PrismaService`):

```ts
describe('StudentPortalReadService.getProfile — lernenTema', () => {
  it('selects the Ta\'lim look and returns it', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 10042,
      firstName: 'Ali',
      lastName: 'Valiyev',
      lernenTema: 'alp',
      enrollments: [],
      branches: [],
      dateOfBirth: null,
      userId: null,
    });
    const service = new StudentPortalReadService({
      student: { findFirst },
    } as unknown as PrismaService);

    const res = await service.getProfile(10042);

    expect(findFirst.mock.calls[0][0].select.lernenTema).toBe(true);
    expect(res.lernenTema).toBe('alp');
  });
});
```

`student-portal.controller.spec.ts`: `mockService` ga `updateLernenTema: jest.fn().mockResolvedValue({ lernenTema: 'toza' }),` qo'shing; `describe.each([...])` ro'yxatiga `'updateLernenTema',` qo'shing (`'updateName',` dan keyin); `changePassword()` describe'dan oldin yangi blok:

```ts
  describe('updateLernenTema()', () => {
    it('passes the validated id to the service for the caller student', async () => {
      await controller.updateLernenTema(10042, { tema: 'dengiz' });
      expect(mockService.updateLernenTema).toHaveBeenCalledWith(
        10042,
        'dengiz',
      );
    });

    it('refuses a token without a student card', () => {
      expect(() =>
        controller.updateLernenTema(undefined as unknown as number, {
          tema: 'toza',
        }),
      ).toThrow('Talaba topilmadi');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/students/student-portal-write.service.spec.ts src/students/student-portal-read.service.spec.ts src/students/student-portal.controller.spec.ts`
Expected: FAIL — `updateLernenTema is not a function` / `select.lernenTema` undefined.

- [ ] **Step 3: Implement**

`student-portal-write.service.ts` — `updateName` metodidan keyin:

```ts
  /**
   * The student's own Ta'lim look (ADR-0125). A personal setting: written for
   * the caller's live card only, not recorded in the entity history.
   */
  async updateLernenTema(studentId: number, tema: string) {
    const { count } = await this.prisma.student.updateMany({
      where: { id: studentId, deletedAt: null },
      data: { lernenTema: tema },
    });
    if (count === 0) throw new NotFoundException('Talaba topilmadi');
    return { lernenTema: tema };
  }
```

`student-portal.service.ts` — Writes bo'limida:

```ts
  updateLernenTema(studentId: number, tema: string) {
    return this.write.updateLernenTema(studentId, tema);
  }
```

`student-portal.controller.ts` — importga `import { UpdateLernenTemaDto } from './dto/update-lernen-tema.dto';` va `updateName` dan keyin:

```ts
  @Patch('lernen-tema')
  @StudentOnly()
  updateLernenTema(
    @CurrentUser('studentId') studentId: number,
    @Body() dto: UpdateLernenTemaDto,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.updateLernenTema(studentId, dto.tema);
  }
```

`student-portal-read.service.ts` — `getProfile` select'ida `photo: true,` dan keyin `lernenTema: true,` (javob `...rest` orqali chiqadi, boshqa o'zgarish kerak emas).

`branch-route-policy.ts` — o'quvchi portali `routes` ro'yxatida `'PATCH /student-portal/name',` dan keyin `'PATCH /student-portal/lernen-tema',`.

`route-access.snapshot.json` — `"PATCH /student-portal/name": [` yozuvidan oldin (alifbo tartibida «lernen-tema» «name» dan oldin):

```json
  "PATCH /student-portal/lernen-tema": [
    "Student"
  ],
```

- [ ] **Step 4: Run tests, typecheck and format**

Run: `cd server && npx jest src/students/student-portal-write.service.spec.ts src/students/student-portal-read.service.spec.ts src/students/student-portal.controller.spec.ts src/common/permissions src/common/auth && npm run typecheck && npx prettier --write src/students/student-portal-write.service.ts src/students/student-portal-write.service.spec.ts src/students/student-portal.service.ts src/students/student-portal.controller.ts src/students/student-portal.controller.spec.ts src/students/student-portal-read.service.ts src/students/student-portal-read.service.spec.ts src/common/auth/branch-route-policy.ts`
Expected: PASS; typecheck xatosiz (`permission-routes.spec` va `branch-route-policy` testlari ham yashil).

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(lernen): PATCH /student-portal/lernen-tema and lernenTema in the profile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — tema idlari (server nusxasi) va profil turi

**Files:**
- Create: `client/src/lib/lernen-temalar.ts`, `client/src/lib/lernen-temalar.test.ts`
- Modify: `client/src/components/student-portal/lib/types.ts` (`StudentProfile`)
- Modify: `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`), `client/src/i18n/dictionaries/{ru,de,en}.ts`

**Interfaces:**
- Produces: `LERNEN_TEMALAR` (tuple of `{ id, label, hint, swatch, tayyor }`), `type LernenTemaId`, `LERNEN_TEMA_IDLARI: readonly LernenTemaId[]`, `DEFAULT_LERNEN_TEMA`, `isLernenTema(v: unknown): v is LernenTemaId`, `lernenTemaOrDefault(v: unknown): LernenTemaId`, `TAYYOR_TEMALAR` (faqat `tayyor: true`). `StudentProfile.lernenTema?: string | null`.

- [ ] **Step 1: Write the failing test**

`client/src/lib/lernen-temalar.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LERNEN_TEMA,
  LERNEN_TEMALAR,
  LERNEN_TEMA_IDLARI,
  TAYYOR_TEMALAR,
  isLernenTema,
  lernenTemaOrDefault,
} from "./lernen-temalar";

describe("lernen temalar", () => {
  it("lists the four looks, the default first, each with a label, hint and swatch", () => {
    expect([...LERNEN_TEMA_IDLARI]).toEqual(["toza", "ormon", "dengiz", "alp"]);
    expect(DEFAULT_LERNEN_TEMA).toBe("toza");
    for (const t of LERNEN_TEMALAR) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.hint.length).toBeGreaterThan(0);
      expect(t.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("offers only the finished looks to pick from", () => {
    expect(TAYYOR_TEMALAR.map((t) => t.id)).toEqual(["toza"]);
  });

  it("knows an id and falls back to the default for anything else", () => {
    expect(isLernenTema("alp")).toBe(true);
    expect(isLernenTema("neon")).toBe(false);
    expect(isLernenTema(null)).toBe(false);
    expect(lernenTemaOrDefault("dengiz")).toBe("dengiz");
    expect(lernenTemaOrDefault(undefined)).toBe("toza");
    expect(lernenTemaOrDefault("neon")).toBe("toza");
  });

  it("lists exactly the ids the server accepts", () => {
    const server = readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "common", "lernen-temalar.ts"),
      "utf8",
    );
    const body = server.split("LERNEN_TEMA_IDLARI = [")[1].split("] as const")[0];
    const serverIds = [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(serverIds).toEqual([...LERNEN_TEMA_IDLARI]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/lernen-temalar.test.ts`
Expected: FAIL — `Failed to resolve import "./lernen-temalar"`.

- [ ] **Step 3: Implement**

`client/src/lib/lernen-temalar.ts`:

```ts
import { msg } from "@/i18n/msg";

/**
 * The Ta'lim looks a student can pick (ADR-0125). The ids mirror
 * `server/src/common/lernen-temalar.ts` (lernen-temalar.test.ts compares
 * them). `tayyor` says the look is built: only those are offered in
 * Sozlamalar. `swatch` is only the dot drawn on the card.
 */
export const LERNEN_TEMALAR = [
  { id: "toza", label: msg("Toza"), hint: msg("Oq fon, qalin yumshoq tugmalar"), swatch: "#ff6b4a", tayyor: true },
  { id: "ormon", label: msg("O'rmon"), hint: msg("Yumshoq qatlamli o'rmon"), swatch: "#2f6b4f", tayyor: false },
  { id: "dengiz", label: msg("Dengiz"), hint: msg("Suv osti dunyosi"), swatch: "#2b78a8", tayyor: false },
  { id: "alp", label: msg("Nemis sayohati"), hint: msg("Tongdan tungacha"), swatch: "#8b5cf6", tayyor: false },
] as const;

export type LernenTemaId = (typeof LERNEN_TEMALAR)[number]["id"];

export const LERNEN_TEMA_IDLARI: readonly LernenTemaId[] = LERNEN_TEMALAR.map((t) => t.id);

export const DEFAULT_LERNEN_TEMA: LernenTemaId = "toza";

export const TAYYOR_TEMALAR = LERNEN_TEMALAR.filter((t) => t.tayyor);

export function isLernenTema(value: unknown): value is LernenTemaId {
  return typeof value === "string" && (LERNEN_TEMA_IDLARI as readonly string[]).includes(value);
}

export function lernenTemaOrDefault(value: unknown): LernenTemaId {
  return isLernenTema(value) ? value : DEFAULT_LERNEN_TEMA;
}
```

`client/src/components/student-portal/lib/types.ts` — `StudentProfile` ichida `photo: string | null;` dan keyin:

```ts
  /** Ta'lim look the student picked (ADR-0125); null/absent = the default. */
  lernenTema?: string | null;
```

`client/src/i18n/i18n-coverage.test.ts` — `STRICT_FILES` ro'yxatida `"lib/ui-skins.ts",` dan keyin `"lib/lernen-temalar.ts",`.

Lug'atlar (`ru.ts`, `de.ts`, `en.ts`) — har birining oxirida `};\n\nexport default xx;` dan oldin (Edit: old_string `};\n\nexport default en;`, shu kabi ru/de) qo'shing:

`en.ts`:
```ts
  // Ta'lim looks (lernen-temalar.ts)
  "Toza": "Clean",
  "Oq fon, qalin yumshoq tugmalar": "White background, chunky soft buttons",
  "O'rmon": "Forest",
  "Yumshoq qatlamli o'rmon": "A soft layered forest",
  "Dengiz": "Sea",
  "Suv osti dunyosi": "An underwater world",
  "Nemis sayohati": "German journey",
  "Tongdan tungacha": "From dawn to night",
```
`ru.ts`:
```ts
  // Ta'lim looks (lernen-temalar.ts)
  "Toza": "Чистый",
  "Oq fon, qalin yumshoq tugmalar": "Белый фон, объёмные мягкие кнопки",
  "O'rmon": "Лес",
  "Yumshoq qatlamli o'rmon": "Мягкий многослойный лес",
  "Dengiz": "Море",
  "Suv osti dunyosi": "Подводный мир",
  "Nemis sayohati": "Путешествие по Германии",
  "Tongdan tungacha": "От рассвета до ночи",
```
`de.ts`:
```ts
  // Ta'lim looks (lernen-temalar.ts)
  "Toza": "Schlicht",
  "Oq fon, qalin yumshoq tugmalar": "Weißer Hintergrund, dicke weiche Buttons",
  "O'rmon": "Wald",
  "Yumshoq qatlamli o'rmon": "Ein weicher Wald in Schichten",
  "Dengiz": "Meer",
  "Suv osti dunyosi": "Eine Unterwasserwelt",
  "Nemis sayohati": "Deutschlandreise",
  "Tongdan tungacha": "Von der Dämmerung bis zur Nacht",
```
Agar bu kalitlardan birortasi lug'atda allaqachon bor bo'lsa (masalan «Toza»), qayta yozmang — `i18n-coverage` testi takroriy kalitni xato deb bildirmasa ham, bir xil kalit bir ma'no bilan qolsin (qoida: bir o'zbek matn = bir ma'no).

- [ ] **Step 4: Run tests**

Run: `cd client && npx vitest run src/lib/lernen-temalar.test.ts src/i18n/i18n-coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/lernen-temalar.ts client/src/lib/lernen-temalar.test.ts client/src/components/student-portal/lib/types.ts client/src/i18n
git commit -m "feat(lernen): client theme ids mirror the server list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — ovoz effektlari (Web Audio sintezi)

**Files:**
- Create: `client/src/components/student-portal/lernen/ovoz/ovoz-qoidalari.ts`, `ovoz-qoidalari.test.ts`
- Create: `…/ovoz/ovoz-sozlama.ts`, `ovoz-sozlama.test.ts`
- Create: `…/ovoz/ovoz-motor.ts`, `…/ovoz/ovoz.ts`

**Interfaces:**
- Produces: `type OvozHodisa = "bos" | "togri" | "xato" | "unitOchildi" | "mukofot" | "qulf"`; `ovozChalinsinmi(h: { yoqilgan: boolean; ijroEtilmoqda: boolean; hodisa: OvozHodisa }): boolean`; `ovozYoqilganmi(): boolean`, `ovozniSaqla(yoqilgan: boolean): void`, `OVOZ_KALITI`; `ovozChal(hodisa: OvozHodisa): void` (hech qachon throw qilmaydi); `ovozniUyg'ot(): void` (birinchi bosishda `resume()`).

- [ ] **Step 1: Write the failing tests**

`ovoz-qoidalari.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ovozChalinsinmi } from "./ovoz-qoidalari";

describe("ovozChalinsinmi", () => {
  it("plays when the student wants sound and no lesson audio is playing", () => {
    expect(ovozChalinsinmi({ yoqilgan: true, ijroEtilmoqda: false, hodisa: "bos" })).toBe(true);
  });
  it("stays silent when the student switched sound off", () => {
    expect(ovozChalinsinmi({ yoqilgan: false, ijroEtilmoqda: false, hodisa: "togri" })).toBe(false);
  });
  it("never talks over a lesson clip", () => {
    expect(ovozChalinsinmi({ yoqilgan: true, ijroEtilmoqda: true, hodisa: "bos" })).toBe(false);
  });
  it("lets the reward through even over a clip (the lesson is over)", () => {
    expect(ovozChalinsinmi({ yoqilgan: true, ijroEtilmoqda: true, hodisa: "mukofot" })).toBe(true);
  });
});
```

`ovoz-sozlama.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OVOZ_KALITI, ovozYoqilganmi, ovozniSaqla } from "./ovoz-sozlama";

// Vitest runs in node: give the module a tiny localStorage.
function qalbakiOmbor(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  };
}

describe("ovoz sozlamasi", () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = qalbakiOmbor(); });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it("is on by default", () => {
    expect(ovozYoqilganmi()).toBe(true);
  });
  it("remembers a choice", () => {
    ovozniSaqla(false);
    expect(localStorage.getItem(OVOZ_KALITI)).toBe("0");
    expect(ovozYoqilganmi()).toBe(false);
    ovozniSaqla(true);
    expect(ovozYoqilganmi()).toBe(true);
  });
  it("falls back to on when storage is unavailable", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(ovozYoqilganmi()).toBe(true);
    expect(() => ovozniSaqla(false)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/ovoz`
Expected: FAIL — modullar topilmadi.

- [ ] **Step 3: Implement the pure modules**

`ovoz-qoidalari.ts`:

```ts
export type OvozHodisa =
  | "bos"
  | "togri"
  | "xato"
  | "unitOchildi"
  | "mukofot"
  | "qulf";

/**
 * Whether an effect may sound. A lesson clip that is playing is never talked
 * over; the reward is the one exception, because the lesson is over by then.
 */
export function ovozChalinsinmi(h: {
  yoqilgan: boolean;
  ijroEtilmoqda: boolean;
  hodisa: OvozHodisa;
}): boolean {
  if (!h.yoqilgan) return false;
  if (h.ijroEtilmoqda && h.hodisa !== "mukofot") return false;
  return true;
}
```

`ovoz-sozlama.ts`:

```ts
/** Device setting (not the account): the student's choice for sound effects. */
export const OVOZ_KALITI = "daf.lernen.ovoz";

/** Sound is on until the student switches it off. Storage may be unavailable. */
export function ovozYoqilganmi(): boolean {
  try {
    return localStorage.getItem(OVOZ_KALITI) !== "0";
  } catch {
    return true;
  }
}

export function ovozniSaqla(yoqilgan: boolean): void {
  try {
    localStorage.setItem(OVOZ_KALITI, yoqilgan ? "1" : "0");
  } catch {
    /* private window or blocked storage: the choice just is not remembered */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/ovoz`
Expected: PASS.

- [ ] **Step 5: Port the synth engine and the public API**

`ovoz-motor.ts` — `docs/superpowers/mockups/2026-10-24-lernen-dizayn/sfx.js` ning to'liq porti (brauzer-faqat, testsiz: Web Audio node'da yo'q; mantiq `ovoz-qoidalari`da sinalgan):

```ts
/**
 * Web Audio synthesis of the Ta'lim effects (ADR-0125). Bright, soft, little
 * reverb: kalimba + plucked harp (Karplus-Strong) + glass bell (inharmonic
 * modes) + a filtered-noise "whoosh". Ported from the approved mockup
 * (docs/superpowers/mockups/2026-10-24-lernen-dizayn/sfx.js, "v4"). No audio
 * files: nothing to license or load.
 */
import type { OvozHodisa } from "./ovoz-qoidalari";

interface Zanjir {
  c: AudioContext;
  bus: GainNode;
  ks: Map<number, { buf: AudioBuffer; n: number }>;
}

let zanjir: Zanjir | null = null;

const N = {
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093, E7: 2637,
} as const;

const R = (a: number, b: number) => a + Math.random() * (b - a);

function qur(): Zanjir {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = new Ctor();
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -10;
  lim.knee.value = 12;
  lim.ratio.value = 6;
  lim.attack.value = 0.002;
  lim.release.value = 0.25;
  lim.connect(c.destination);
  // short, damped stereo reverb (1 s), pre-delay 30 ms; wet is small on purpose
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.0);
  const pre = Math.floor(sr * 0.03);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += (0.08 + 0.82 * (1 - x)) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - x, 2.6) * (i < pre + 400 ? (i - pre) / 400 : 1);
    }
  }
  const rev = c.createConvolver();
  rev.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.11;
  rev.connect(wet).connect(lim);
  const bus = c.createGain();
  bus.gain.value = 0.85;
  const hs = c.createBiquadFilter();
  hs.type = "highshelf";
  hs.frequency.value = 3500;
  hs.gain.value = 4;
  bus.connect(hs).connect(lim);
  const send = c.createGain();
  send.gain.value = 0.9;
  bus.connect(send).connect(rev);
  return { c, bus, ks: new Map() };
}

function olish(): Zanjir {
  if (!zanjir) zanjir = qur();
  return zanjir;
}

/** Resume the context from a user gesture (browsers keep it suspended before). */
export function motorniUygot(): void {
  const z = olish();
  if (z.c.state === "suspended") void z.c.resume();
}

function out(z: Zanjir, node: AudioNode, pan = 0) {
  const p = z.c.createStereoPanner();
  p.pan.value = pan;
  node.connect(p).connect(z.bus);
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tick(z: Zanjir, t: number, vol: number, freq: number, pan: number) {
  const c = z.c;
  const n = c.createBufferSource();
  const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.02), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  n.buffer = b;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.5;
  const g = c.createGain();
  g.gain.value = vol;
  n.connect(f).connect(g);
  out(z, g, pan);
  n.start(t);
}

function kalimba(z: Zanjir, f: number, t: number, vol = 0.3, pan = 0, d = 0.7) {
  const c = z.c;
  const g = c.createGain();
  env(g, t, 0.008, vol, d);
  out(z, g, pan);
  ([[1, 1, d], [5.4, 0.3, d * 0.2], [12.1, 0.05, d * 0.08]] as const).forEach(([r, a, dd]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.setValueAtTime(f * r * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(f * r, t + 0.04);
    og.gain.setValueAtTime(a, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dd);
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dd + 0.1);
  });
  tick(z, t, vol * 0.12, 4200, pan);
}

function glass(z: Zanjir, f: number, t: number, vol = 0.15, d = 2, pan = 0) {
  const c = z.c;
  const g = c.createGain();
  env(g, t, 0.012, vol, d);
  out(z, g, pan);
  ([[1, 1, 1], [2.756, 0.62, 0.7], [5.404, 0.36, 0.5], [8.933, 0.12, 0.28]] as const).forEach(([r, a, k]) =>
    ([-0.9, 0.9] as const).forEach((det) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.frequency.value = f * r + det * (r > 1 ? 1.6 : 1);
      og.gain.setValueAtTime(a * 0.5, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + d * k);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + d * k + 0.1);
    }),
  );
}

/** Karplus-Strong string: one buffer per pitch, cached. */
function harp(z: Zanjir, f: number, t: number, vol = 0.35, pan = 0, d = 1.1) {
  const c = z.c;
  const sr = c.sampleRate;
  const nn = Math.max(2, Math.round(sr / f));
  let ent = z.ks.get(nn);
  if (!ent) {
    const buf = c.createBuffer(1, sr * 2, sr);
    const d0 = buf.getChannelData(0);
    const ring = new Float32Array(nn);
    for (let i = 0; i < nn; i++) ring[i] = Math.random() * 2 - 1;
    for (let p = 0; p < 2; p++) for (let i = 0; i < nn; i++) ring[i] = (ring[i] + ring[(i + 1) % nn]) / 2;
    let idx = 0;
    for (let i = 0; i < d0.length; i++) {
      const nx = (idx + 1) % nn;
      d0[i] = ring[idx];
      ring[idx] = 0.9965 * (ring[idx] + ring[nx]) / 2;
      idx = nx;
    }
    ent = { buf, n: nn };
    z.ks.set(nn, ent);
  }
  const s = c.createBufferSource();
  const g = c.createGain();
  s.buffer = ent.buf;
  s.playbackRate.value = (f * ent.n) / sr;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(15000, f * 14);
  s.connect(lp).connect(g);
  env(g, t, 0.008, vol, d);
  out(z, g, pan);
  s.start(t);
  s.stop(t + d + 0.1);
}

function air(z: Zanjir, t: number, dur: number, from: number, to: number, vol = 0.1, p0 = -0.8, p1 = 0.8) {
  const c = z.c;
  const n = c.createBufferSource();
  const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = b;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 3;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = c.createStereoPanner();
  p.pan.setValueAtTime(p0, t);
  p.pan.linearRampToValueAtTime(p1, t + dur);
  n.connect(f).connect(g).connect(p).connect(z.bus);
  n.start(t);
}

function sub(z: Zanjir, t: number, vol = 0.15, f0 = 120, f1 = 42, d = 0.35) {
  const c = z.c;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
  o.connect(g).connect(z.bus);
  env(g, t, 0.004, vol, d);
  o.start(t);
  o.stop(t + d + 0.1);
}

const HODISALAR: Record<OvozHodisa, (z: Zanjir, t: number) => void> = {
  bos: (z, t) => {
    kalimba(z, N.G5, t, 0.26, 0, 0.25);
    glass(z, N.G6, t, 0.035, 0.5, 0);
  },
  togri: (z, t) => {
    kalimba(z, N.E5, t, 0.3, -0.15, 0.5);
    kalimba(z, N.G5, t + 0.07, 0.3, 0, 0.5);
    kalimba(z, N.C6, t + 0.14, 0.34, 0.15, 0.8);
    glass(z, N.C7, t + 0.14, 0.09, 1.5, 0.2);
    glass(z, N.G6, t + 0.18, 0.06, 1.4, -0.2);
  },
  xato: (z, t) => {
    // a soft, kind "oops": two falling kalimba notes, never a buzzer
    kalimba(z, N.E5 * 0.5, t, 0.26, -0.1, 0.45);
    kalimba(z, N.C5 * 0.5, t + 0.11, 0.26, 0.1, 0.7);
    glass(z, N.G5, t + 0.11, 0.02, 0.6, 0);
  },
  qulf: (z, t) => {
    kalimba(z, N.C5 * 0.5, t, 0.18, 0, 0.14);
    tick(z, t, 0.1, 1800, 0);
  },
  unitOchildi: (z, t) => {
    air(z, t, 0.6, 600, 7000, 0.09);
    sub(z, t + 0.42, 0.15);
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => harp(z, f, t + 0.3 + i * 0.06, 0.32, -0.6 + i * 0.24, 1.2));
    glass(z, N.C6, t + 0.66, 0.12, 2.4, -0.2);
    glass(z, N.G6, t + 0.68, 0.1, 2.4, 0.25);
    glass(z, N.E7, t + 0.72, 0.06, 2, 0);
  },
  mukofot: (z, t) => {
    sub(z, t, 0.17, 150, 48, 0.35);
    air(z, t, 0.55, 700, 7500, 0.09);
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7].forEach((f, i) => harp(z, f, t + 0.08 + i * 0.065, 0.3, -0.7 + i * 0.23, 1.4));
    const e = t + 0.62;
    [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => glass(z, f, e, 0.13, 3, -0.45 + i * 0.3));
    kalimba(z, N.G5, e, 0.24, -0.3, 0.9);
    kalimba(z, N.C6, e + 0.1, 0.26, 0, 0.9);
    kalimba(z, N.E6, e + 0.2, 0.28, 0.3, 1.2);
    sub(z, e, 0.12, 110, 50, 0.3);
    for (let i = 0; i < 9; i++) glass(z, R(1800, 3600), e + 0.2 + i * 0.085, R(0.025, 0.05), 0.9, R(-0.9, 0.9));
  },
};

export function motorChal(hodisa: OvozHodisa): void {
  const z = olish();
  if (z.c.state === "suspended") void z.c.resume();
  HODISALAR[hodisa](z, z.c.currentTime);
}
```

`ovoz.ts`:

```ts
import { anyMediaPlaying } from "../../lib/media-registry";
import { ovozChalinsinmi, type OvozHodisa } from "./ovoz-qoidalari";
import { ovozYoqilganmi } from "./ovoz-sozlama";

export type { OvozHodisa } from "./ovoz-qoidalari";

/**
 * Plays one Ta'lim effect. Never throws and never blocks: Web Audio can be
 * missing or silent (the Telegram Mini App WebView), and a sound must never
 * break a lesson.
 */
export function ovozChal(hodisa: OvozHodisa): void {
  try {
    if (typeof window === "undefined") return;
    if (!ovozChalinsinmi({ yoqilgan: ovozYoqilganmi(), ijroEtilmoqda: anyMediaPlaying(), hodisa })) return;
    void import("./ovoz-motor").then((m) => m.motorChal(hodisa)).catch(() => {});
  } catch {
    /* silent by design */
  }
}

/** Call from a first tap so the browser lets the context start. */
export function ovozniUygot(): void {
  try {
    if (typeof window === "undefined") return;
    void import("./ovoz-motor").then((m) => m.motorniUygot()).catch(() => {});
  } catch {
    /* silent by design */
  }
}
```

(`media-registry.ts` `lernen/ovoz/` dan `../../lib/media-registry` — ya'ni `student-portal/lib/media-registry`; yo'l: `lernen/ovoz/ovoz.ts` → `../../lib/media-registry`.)

- [ ] **Step 6: Typecheck and verify**

Run: `cd client && npx tsc --noEmit && npx vitest run src/components/student-portal/lernen/ovoz`
Expected: xatosiz; testlar PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/student-portal/lernen/ovoz
git commit -m "feat(lernen): synthesized Ta'lim sound effects with a device on/off setting

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — kam harakat va yengil rejim qarorlari

**Files:**
- Create: `client/src/components/student-portal/lernen/harakat/kam-harakat.ts`, `kam-harakat.test.ts`, `use-kam-harakat.ts`

**Interfaces:**
- Produces: `HARAKAT_KALITI`, `kamHarakatQarori(qurilma: boolean | null, tizim: boolean): boolean`, `yengilRejimmi(q: { yadro?: number; xotira?: number }): boolean`, `kamHarakatHozir(): boolean` (brauzerda o'qiydi), `harakatniSaqla(v: boolean): void`, `qurilmaHarakatSozlamasi(): boolean | null`, hook `useKamHarakat(): boolean`.

- [ ] **Step 1: Write the failing test**

`kam-harakat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { kamHarakatQarori, yengilRejimmi } from "./kam-harakat";

describe("kamHarakatQarori", () => {
  it("follows the system setting when the student made no choice", () => {
    expect(kamHarakatQarori(null, true)).toBe(true);
    expect(kamHarakatQarori(null, false)).toBe(false);
  });
  it("a device choice to reduce always wins", () => {
    expect(kamHarakatQarori(true, false)).toBe(true);
  });
  it("never turns motion back on against the system setting", () => {
    expect(kamHarakatQarori(false, true)).toBe(true);
  });
});

describe("yengilRejimmi", () => {
  it("is light on a weak device", () => {
    expect(yengilRejimmi({ yadro: 4 })).toBe(true);
    expect(yengilRejimmi({ xotira: 2 })).toBe(true);
  });
  it("is full on a normal device or when the browser says nothing", () => {
    expect(yengilRejimmi({ yadro: 8, xotira: 8 })).toBe(false);
    expect(yengilRejimmi({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/student-portal/lernen/harakat/kam-harakat.test.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Implement**

`kam-harakat.ts`:

```ts
/** Device setting: "reduce motion" chosen by the student (ADR-0125). */
export const HARAKAT_KALITI = "daf.lernen.harakat";

/** `true` = the student asked for less motion, `false` = chose full, `null` = never chose. */
export function qurilmaHarakatSozlamasi(): boolean | null {
  try {
    const v = localStorage.getItem(HARAKAT_KALITI);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function harakatniSaqla(kam: boolean): void {
  try {
    localStorage.setItem(HARAKAT_KALITI, kam ? "1" : "0");
  } catch {
    /* the choice is just not remembered */
  }
}

/**
 * Whether to reduce motion. The system setting can never be overridden to MORE
 * motion: a student who asked their phone for less must not get a parallax
 * because they once ticked the app's switch off.
 */
export function kamHarakatQarori(qurilma: boolean | null, tizim: boolean): boolean {
  return qurilma === true || tizim;
}

/** Weak-device fallback: fewer layers and ambient elements (spec §9). */
export function yengilRejimmi(q: { yadro?: number; xotira?: number }): boolean {
  return (q.yadro != null && q.yadro <= 4) || (q.xotira != null && q.xotira <= 2);
}

/** Reads the browser; safe to call during an effect, not during render on the server. */
export function kamHarakatHozir(): boolean {
  try {
    const tizim = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return kamHarakatQarori(qurilmaHarakatSozlamasi(), tizim);
  } catch {
    return false;
  }
}
```

`use-kam-harakat.ts`:

```ts
"use client";

import * as React from "react";
import { kamHarakatHozir } from "./kam-harakat";

/** `false` on the server and the first paint, then the real answer (no hydration mismatch). */
export function useKamHarakat(): boolean {
  const [kam, setKam] = React.useState(false);
  React.useEffect(() => {
    const yangila = () => setKam(kamHarakatHozir());
    yangila();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", yangila);
    window.addEventListener("storage", yangila);
    return () => {
      mq.removeEventListener("change", yangila);
      window.removeEventListener("storage", yangila);
    };
  }, []);
  return kam;
}
```

- [ ] **Step 4: Run tests, then commit**

Run: `cd client && npx vitest run src/components/student-portal/lernen/harakat && npx tsc --noEmit`
Expected: PASS.

```bash
git add client/src/components/student-portal/lernen/harakat
git commit -m "feat(lernen): reduced-motion and light-mode decisions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client — Dafi (2D ayiq boshi, 5 holat)

**Files:**
- Modify: `client/package.json`, `client/package-lock.json` (`gsap`)
- Create: `…/lernen/dafi/dafi-holat.ts`, `dafi-holat.test.ts`, `dafi-svg.ts`, `dafi-rig.ts`, `dafi.tsx`, `dafi.test.ts`

**Interfaces:**
- Consumes: `kamHarakatHozir()` (Task 5).
- Produces: `DAFI_HOLATLARI = ["tinch","salom","bayram","oylayapti","xato"]`, `type DafiHolat`, `RIG_HOLAT: Record<DafiHolat, "idle"|"wave"|"cheer"|"think"|"miss">`, `javobHolati(togri: boolean): DafiHolat`, `DAFI_OLCHAM = { sm: 70, md: 96, lg: 240 }`; `<Dafi holat? olcham? className? />`; `DAFI_SVG: string`; `class DafiRig { constructor(root, gsap, { reduce }); set(state); destroy() }`.

- [ ] **Step 1: Add the dependency**

Run: `cd client && npm install gsap`
Expected: `package.json` da `"gsap": "^3.…"` paydo bo'ladi. (Statik import yo'q — Global Constraints.)

- [ ] **Step 2: Write the failing tests**

`dafi-holat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DAFI_HOLATLARI, DAFI_OLCHAM, RIG_HOLAT, javobHolati } from "./dafi-holat";

describe("dafi holatlari", () => {
  it("has the five states of the spec and a rig state for each", () => {
    expect([...DAFI_HOLATLARI]).toEqual(["tinch", "salom", "bayram", "oylayapti", "xato"]);
    for (const h of DAFI_HOLATLARI) expect(RIG_HOLAT[h]).toBeTruthy();
  });
  it("a right answer cheers, a wrong one is the soft miss (never punishing)", () => {
    expect(javobHolati(true)).toBe("bayram");
    expect(javobHolati(false)).toBe("xato");
  });
  it("has three sizes", () => {
    expect(Object.keys(DAFI_OLCHAM)).toEqual(["sm", "md", "lg"]);
  });
});
```

`dafi.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dafi } from "./dafi";

describe("<Dafi />", () => {
  it("renders the bear head as inline SVG with its state, hidden from screen readers", () => {
    const html = renderToStaticMarkup(createElement(Dafi, { holat: "bayram", olcham: "md" }));
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });
  it("defaults to the calm state", () => {
    expect(renderToStaticMarkup(createElement(Dafi))).toContain('data-holat="tinch"');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/dafi`
Expected: FAIL — modullar topilmadi.

- [ ] **Step 4: Implement the pure model and the SVG**

`dafi-holat.ts`:

```ts
export const DAFI_HOLATLARI = ["tinch", "salom", "bayram", "oylayapti", "xato"] as const;
export type DafiHolat = (typeof DAFI_HOLATLARI)[number];

/** The rig's own state names (ported from the approved mockup). */
export const RIG_HOLAT: Record<DafiHolat, "idle" | "wave" | "cheer" | "think" | "miss"> = {
  tinch: "idle",
  salom: "wave",
  bayram: "cheer",
  oylayapti: "think",
  xato: "miss",
};

/** Width in px; the height follows (about 0.9 of it). */
export const DAFI_OLCHAM = { sm: 70, md: 96, lg: 240 } as const;
export type DafiOlcham = keyof typeof DAFI_OLCHAM;

/** A wrong answer is the soft "oops", never a buzzer or a frown. */
export function javobHolati(togri: boolean): DafiHolat {
  return togri ? "bayram" : "xato";
}
```

`dafi-svg.ts` — `docs/superpowers/mockups/2026-10-24-lernen-dizayn/dafi-head.js` dagi `ART` o'zgaruvchisi (backtick ichidagi SVG) AYNAN shu ko'rinishda `DAFI_SVG` sifatida eksport qilinadi; ranglar o'sha fayldagi `BODY/DARK/BELLY/INK` konstantalaridan:

```ts
const BODY = "#b07a4f";
const DARK = "#8f5d38";
const BELLY = "#f0cfa6";
const INK = "#2a1a14";

/**
 * Dafi's head as inline SVG (ADR-0125). Classes (.all, .earL, .eL, .mo, …) are
 * what `DafiRig` animates. Ported 1:1 from the approved mockup's `ART`.
 */
export const DAFI_SVG = `<svg viewBox="30 20 140 125" aria-hidden="true" style="overflow:visible;display:block;width:100%;height:100%">
<ellipse class="sh" cx="100" cy="140" rx="46" ry="6" fill="#000" opacity=".15"/>
<g class="fxl"></g>
<g class="all">
 <g class="earL"><circle cx="58" cy="46" r="21" fill="${BODY}"/><circle cx="58" cy="49" r="10.5" fill="#efc08f"/></g>
 <g class="earR"><circle cx="142" cy="46" r="21" fill="${BODY}"/><circle cx="142" cy="49" r="10.5" fill="#efc08f"/></g>
 <ellipse cx="100" cy="86" rx="55" ry="50" fill="${BODY}"/><ellipse cx="100" cy="124" rx="40" ry="9" fill="${DARK}" opacity=".35"/>
 <circle class="chL" cx="66" cy="102" r="9" fill="#ff8f7d" opacity=".55"/><circle class="chR" cx="134" cy="102" r="9" fill="#ff8f7d" opacity=".55"/>
 <ellipse cx="100" cy="103" rx="23" ry="18" fill="${BELLY}"/>
 <ellipse cx="100" cy="94" rx="9.5" ry="6.8" fill="${INK}"/><ellipse cx="97" cy="92" rx="3" ry="1.8" fill="#fff" opacity=".7"/>
 <path d="M100 100 V106" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
 <ellipse class="tg" cx="100" cy="116" rx="7" ry="4" fill="#ff8f8f" opacity="0"/>
 <path class="mo" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
 <g class="gz">
  <g class="eL"><ellipse cx="78" cy="80" rx="7.5" ry="9.5" fill="${INK}"/><circle cx="80.5" cy="76" r="2.8" fill="#fff"/></g>
  <g class="eR"><ellipse cx="122" cy="80" rx="7.5" ry="9.5" fill="${INK}"/><circle cx="124.5" cy="76" r="2.8" fill="#fff"/></g>
 </g>
 <g class="hL"><path d="M69 83 Q78 70 87 83" stroke="${INK}" fill="none" stroke-width="4" stroke-linecap="round"/></g>
 <g class="hR"><path d="M113 83 Q122 70 131 83" stroke="${INK}" fill="none" stroke-width="4" stroke-linecap="round"/></g>
 <path class="bL" d="M67 65 L89 61" stroke="#6e4326" stroke-width="4" stroke-linecap="round"/><path class="bR" d="M133 65 L111 61" stroke="#6e4326" stroke-width="4" stroke-linecap="round"/>
 <g class="fq"><circle cx="164" cy="34" r="16" fill="#fff" stroke="#e6dccf" stroke-width="2"/><text x="164" y="42" text-anchor="middle" font-family="Nunito,system-ui" font-weight="900" font-size="22" fill="#8b5cf6">?</text></g>
 <g class="fs"><path d="M148 52 Q157 66 148 75 Q139 66 148 52Z" fill="#7cc8ff"/></g>
 <g class="fst"><text x="30" y="46" font-size="20">⭐</text><text x="160" y="34" font-size="17">✨</text><text x="22" y="100" font-size="15">✨</text><text x="168" y="98" font-size="19">⭐</text></g>
</g></svg>`;
```

- [ ] **Step 5: Implement the rig and the component**

`dafi-rig.ts` — `dafi-head.js` ning TypeScript porti (`Head` klassi → `DafiRig`; GSAP tashqaridan beriladi; API: `set(state)`, `destroy()`). Mantiq o'zgarmaydi: `render()` har kadrda atributlarni yozadi, `step()` quloq prujinasi, `layers()` nafas/ko'z qisish/qarash/quloq, holatlar `wave/think/miss/cheer`:

```ts
import type { gsap as GsapNamed } from "gsap";

type Gsap = typeof GsapNamed;
type Rig = Record<string, number>;
export type RigState = "idle" | "wave" | "cheer" | "think" | "miss";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const tf = (x: number, y: number, t: string) => `translate(${x} ${y}) ${t} translate(${-x} ${-y})`;

const neytral = (): Rig => ({
  y: 0, sx: 1, sy: 1, rot: 0, eBL: 0, eBR: 0, happy: 0, winkR: 0, brw: 0,
  bLr: 0, bRr: 0, bLy: 0, bRy: 0, mw: 12, mc: 12, mo: 0, cheek: 0, stars: 0,
  q: 0, sw: 0, swy: 0, qy: 0, gxB: 0, gyB: 0,
});

export class DafiRig {
  private p: Record<string, SVGElement>;
  private r: Rig;
  private sp = { eL: { x: 0, v: 0 }, eR: { x: 0, v: 0 } };
  private prevY = 0;
  private prevR = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private gaze = { x: 0, y: 0 };
  private tl: gsap.core.Timeline | null = null;
  private idle: gsap.core.Tween[] = [];
  private tick = () => this.step();

  constructor(private root: HTMLElement, private gsap: Gsap, private opts: { reduce: boolean }) {
    const q = (s: string) => root.querySelector(s) as SVGElement;
    this.p = {
      sh: q(".sh"), all: q(".all"), eaL: q(".earL"), eaR: q(".earR"), eL: q(".eL"), eR: q(".eR"),
      gz: q(".gz"), hL: q(".hL"), hR: q(".hR"), bL: q(".bL"), bR: q(".bR"), mo: q(".mo"), tg: q(".tg"),
      chL: q(".chL"), chR: q(".chR"), fq: q(".fq"), fs: q(".fs"), fst: q(".fst"), fxl: q(".fxl"),
    };
    this.r = { ...neytral(), breath: 0, hidle: 0, blink: 0, gx: 0, gy: 0, eL: 0, eR: 0, starRot: 0 };
    gsap.ticker.add(this.tick);
    if (!opts.reduce) this.layers();
    this.render();
  }

  destroy() {
    this.gsap.ticker.remove(this.tick);
    this.gsap.killTweensOf(this.r);
    this.tl?.kill();
    this.timers.forEach(clearTimeout);
    this.idle.forEach((t) => t.kill());
  }

  private later(f: () => void, ms: number) {
    this.timers.push(setTimeout(f, ms));
  }

  /** Always-alive layer: breathing, blinking, wandering gaze, ear twitch. */
  private layers() {
    const { gsap, r } = this;
    this.idle = [
      gsap.to(r, { breath: 1, duration: 1.8, yoyo: true, repeat: -1, ease: "sine.inOut" }),
      gsap.to(r, { hidle: 1, duration: 2.6, yoyo: true, repeat: -1, ease: "sine.inOut" }),
    ];
    const blink = () => {
      if (!this.root.isConnected) return;
      gsap.to(r, { blink: 1, duration: 0.065, yoyo: true, repeat: Math.random() < 0.25 ? 3 : 1 });
      this.later(blink, 1800 + Math.random() * 3200);
    };
    this.later(blink, 900);
    const look = () => {
      this.gaze = { x: (Math.random() * 2 - 1) * 3.2, y: (Math.random() * 2 - 1) * 2 };
      this.later(look, 1400 + Math.random() * 2300);
    };
    look();
    const tw = () => {
      this.sp[Math.random() < 0.5 ? "eL" : "eR"].v += (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4);
      this.later(tw, 4500 + Math.random() * 5000);
    };
    this.later(tw, 2500);
  }

  private spr(s: { x: number; v: number }, t: number, k: number, d: number) {
    s.v += (t - s.x) * k;
    s.v *= d;
    s.x += s.v;
    return s.x;
  }

  private step() {
    const r = this.r;
    const vy = r.y - this.prevY;
    const vr = r.rot - this.prevR;
    this.prevY = r.y;
    this.prevR = r.rot;
    r.eL = this.spr(this.sp.eL, r.eBL - vy * 1.2 + vr * 1.4, 0.2, 0.82);
    r.eR = this.spr(this.sp.eR, r.eBR + vy * 1.2 + vr * 1.4, 0.2, 0.82);
    r.gx += (this.gaze.x + r.gxB - r.gx) * 0.18;
    r.gy += (this.gaze.y + r.gyB - r.gy) * 0.18;
    this.render();
  }

  private render() {
    const { r, p } = this;
    const br = r.breath;
    p.all.setAttribute("transform", tf(100, 135, `translate(0 ${r.y}) rotate(${r.rot + r.hidle * 1.2 - 0.6}) scale(${r.sx * (1 - 0.01 * br)} ${r.sy * (1 + 0.022 * br)})`));
    const sc = clamp(1 + r.y / 120, 0.4, 1.2);
    p.sh.setAttribute("transform", tf(100, 140, `scale(${sc} ${sc})`));
    p.sh.setAttribute("opacity", String(0.15 * sc));
    p.eaL.setAttribute("transform", tf(62, 64, `rotate(${r.eL})`));
    p.eaR.setAttribute("transform", tf(138, 64, `rotate(${r.eR})`));
    const bl = Math.max(r.blink, r.happy);
    p.eL.setAttribute("transform", tf(78, 80, `scale(1 ${1 - 0.93 * bl})`));
    p.eR.setAttribute("transform", tf(122, 80, `scale(1 ${1 - 0.93 * Math.max(bl, r.winkR)})`));
    p.eL.setAttribute("opacity", String(1 - r.happy));
    p.eR.setAttribute("opacity", String(1 - r.happy));
    p.gz.setAttribute("transform", `translate(${r.gx} ${r.gy})`);
    p.hL.setAttribute("opacity", String(r.happy));
    p.hR.setAttribute("opacity", String(r.happy));
    p.bL.setAttribute("opacity", String(r.brw));
    p.bR.setAttribute("opacity", String(r.brw));
    p.bL.setAttribute("transform", tf(78, 63, `translate(0 ${r.bLy}) rotate(${r.bLr})`));
    p.bR.setAttribute("transform", tf(122, 63, `translate(0 ${r.bRy}) rotate(${r.bRr})`));
    const L = 100 - r.mw;
    const R = 100 + r.mw;
    const y0 = 106;
    const open = r.mo > 0.04;
    p.mo.setAttribute("d", `M${L} ${y0} Q100 ${y0 + r.mc} ${R} ${y0}` + (open ? ` Q100 ${y0 + r.mc + r.mo * 40} ${L} ${y0}Z` : ""));
    p.mo.setAttribute("fill", open ? "#7a2a2a" : "none");
    p.tg.setAttribute("opacity", String(clamp(r.mo * 1.3 - 0.3, 0, 1)));
    p.tg.setAttribute("cy", String(106 + r.mc + r.mo * 22));
    const c = 1 + 0.28 * r.cheek;
    p.chL.setAttribute("transform", tf(66, 102, `scale(${c})`));
    p.chR.setAttribute("transform", tf(134, 102, `scale(${c})`));
    p.fq.setAttribute("opacity", String(r.q));
    p.fq.setAttribute("transform", `translate(0 ${r.qy})`);
    p.fs.setAttribute("opacity", String(r.sw));
    p.fs.setAttribute("transform", `translate(0 ${r.swy})`);
    p.fst.setAttribute("opacity", String(r.stars));
    p.fst.setAttribute("transform", tf(100, 80, `rotate(${r.starRot})`));
  }

  private dust() {
    const ns = "http://www.w3.org/2000/svg";
    ([-1, 1] as const).forEach((s) => {
      for (let i = 0; i < 3; i++) {
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", String(100 + s * (30 + i * 8)));
        c.setAttribute("cy", "136");
        c.setAttribute("r", String(4 + i));
        c.setAttribute("fill", "#fff");
        c.setAttribute("opacity", "0.85");
        this.p.fxl.appendChild(c);
        this.gsap.to(c, {
          attr: { cx: 100 + s * (58 + i * 16), cy: 128 - i * 5, r: 1 },
          opacity: 0, duration: 0.55 + i * 0.1, ease: "power2.out", onComplete: () => c.remove(),
        });
      }
    });
  }

  set(state: RigState) {
    const { gsap, r } = this;
    this.tl?.kill();
    gsap.killTweensOf(r, Object.keys(neytral()).join(","));
    const tl = (this.tl = gsap.timeline({ defaults: { overwrite: "auto" } }));
    tl.to(r, { ...neytral(), duration: 0.35, ease: "back.out(1.6)" }, 0);
    if (this.opts.reduce) return;
    if (state === "wave") this.wave(tl, 0.3);
    else if (state === "cheer") this.cheer(tl, 0.12);
    else if (state === "think") this.think(tl, 0.3);
    else if (state === "miss") this.miss(tl, 0.1);
  }

  private wave(tl: gsap.core.Timeline, t: number) {
    const r = this.r;
    tl.to(r, { mw: 17, mc: 10, mo: 0.5, cheek: 1, brw: 1, bLy: -3, bRy: -3, rot: 5, duration: 0.45, ease: "back.out(2)" }, t)
      .to(r, { rot: -4, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 }, t + 0.45)
      .to(r, { winkR: 1, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: 0.35 }, t + 0.9)
      .to(r, { winkR: 1, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: 0.35 }, t + 3.1);
  }

  private think(tl: gsap.core.Timeline, t: number) {
    const r = this.r;
    tl.to(r, { rot: -9, y: 1, gxB: 4, gyB: -4, brw: 1, bLr: -9, bLy: -5, mw: 8, mc: -1, mo: 0, q: 1, duration: 0.55, ease: "back.out(1.5)" }, t)
      .to(r, { qy: -7, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 }, t + 0.55)
      .to(r, { rot: -12, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 }, t + 0.6);
  }

  private miss(tl: gsap.core.Timeline, t: number) {
    const r = this.r;
    tl.to(r, { sy: 1.06, sx: 0.97, duration: 0.12, ease: "power2.out" }, t)
      .to(r, { sy: 1, sx: 1, rot: 6, eBL: -22, eBR: 22, brw: 1, bLr: -15, bRr: 15, mw: 5, mc: 2, mo: 0.5, gyB: 3, sw: 1, swy: -8, duration: 0.45, ease: "back.out(2.4)" }, t + 0.12)
      .to(r, { swy: 18, sw: 0, duration: 0.9, ease: "power1.in", repeat: -1, repeatDelay: 0.5 }, t + 0.5)
      .to(r, { rot: -5, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 5 }, t + 0.55);
  }

  /** Three bounces (anticipation, stretch, squash on landing, elastic return), then a wave. */
  private cheer(tl: gsap.core.Timeline, t0: number) {
    const r = this.r;
    let t = t0;
    const hop = (h: number, tilt: number) => {
      tl.to(r, { sy: 0.82, sx: 1.14, y: 3, mo: 0, happy: 0, duration: 0.17, ease: "power2.out" }, t);
      t += 0.17;
      tl.to(r, { y: -h, duration: 0.4, ease: "power2.out" }, t)
        .to(r, { sy: 1.12, sx: 0.93, rot: tilt, happy: 1, mw: 18, mc: 7, mo: 0.95, cheek: 1, stars: 1, brw: 0, duration: 0.3, ease: "back.out(2.2)" }, t);
      t += 0.4;
      tl.to(r, { y: 0, sy: 1.03, sx: 0.98, rot: -tilt * 0.4, duration: 0.34, ease: "power2.in" }, t);
      t += 0.34;
      tl.add(() => this.dust(), t).to(r, { sy: 0.76, sx: 1.2, rot: 0, duration: 0.08, ease: "power3.out" }, t);
      t += 0.08;
      tl.to(r, { sy: 1, sx: 1, duration: 0.7, ease: "elastic.out(1.1,.32)" }, t);
      t += 0.4;
    };
    tl.to(r, { starRot: 360, duration: 6, ease: "none", repeat: -1 }, t0);
    hop(30, -8);
    hop(40, 9);
    hop(52, -11);
    tl.add(() => this.set("wave"), t + 0.1);
  }
}
```

`dafi.tsx`:

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { kamHarakatHozir } from "../harakat/kam-harakat";
import { DAFI_OLCHAM, RIG_HOLAT, type DafiHolat, type DafiOlcham } from "./dafi-holat";
import { DAFI_SVG } from "./dafi-svg";
import type { DafiRig } from "./dafi-rig";

export interface DafiProps {
  holat?: DafiHolat;
  olcham?: DafiOlcham;
  className?: string;
}

/**
 * Dafi, the bear head (ADR-0125). The SVG is server-rendered so the first
 * paint already shows him; `gsap` and the rig load after mount and only
 * here (the portal bundle stays free of the animation library).
 */
export function Dafi({ holat = "tinch", olcham = "md", className }: DafiProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rig = React.useRef<DafiRig | null>(null);
  const hozirgi = React.useRef<DafiHolat>(holat);

  React.useEffect(() => {
    let tugadi = false;
    void Promise.all([import("gsap"), import("./dafi-rig")]).then(([{ gsap }, { DafiRig }]) => {
      if (tugadi || !ref.current) return;
      const r = new DafiRig(ref.current, gsap, { reduce: kamHarakatHozir() });
      rig.current = r;
      r.set(RIG_HOLAT[hozirgi.current]);
    });
    return () => {
      tugadi = true;
      rig.current?.destroy();
      rig.current = null;
    };
  }, []);

  React.useEffect(() => {
    hozirgi.current = holat;
    rig.current?.set(RIG_HOLAT[holat]);
  }, [holat]);

  const w = DAFI_OLCHAM[olcham];
  return (
    <div
      ref={ref}
      data-holat={holat}
      aria-hidden="true"
      className={cn("pointer-events-none inline-block shrink-0", className)}
      style={{ width: w, height: Math.round(w * 0.9) }}
      dangerouslySetInnerHTML={{ __html: DAFI_SVG }}
    />
  );
}
```

- [ ] **Step 6: Run tests, typecheck and lint**

Run: `cd client && npx vitest run src/components/student-portal/lernen/dafi && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/dafi src/components/student-portal/lernen/harakat src/components/student-portal/lernen/ovoz`
Expected: testlar PASS; tsc va eslint 0 xato (`✖ N problems (X errors…)` satrida X = 0).

- [ ] **Step 7: Commit**

```bash
git add client/package.json client/package-lock.json client/src/components/student-portal/lernen/dafi
git commit -m "feat(lernen): Dafi, the 2D bear head with five states (lazy gsap)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client — tema shartnomasi, reyestr va tanlov hook'i

**Files:**
- Create: `…/lernen/tema/tema-turlari.ts`, `tema-reyestri.ts`, `tema-reyestri.test.ts`, `tema-tanlash.ts`, `tema-tanlash.test.ts`, `use-lernen-tema.ts`, `toza/toza-tema.ts` (Task 8 komponentlariga havola qiladi — shu task'da faqat turlar va tanlov mantig'i; `toza-tema.ts` Task 8 oxirida yoziladi)

> Bu task `toza-tema.ts` ga bog'liq `tema-reyestri.ts` ni Task 8 da to'ldiradi. Tartib: Task 7 da `tema-turlari.ts`, `tema-tanlash.ts`, `use-lernen-tema.ts` va ularning testlari; `tema-reyestri.ts` va uning testi Task 8 ning oxirida (Step 9–10).

**Interfaces:**
- Consumes: `LernenTemaId`, `lernenTemaOrDefault`, `isLernenTema` (Task 3); `useStudentProfile` (`../../lib/queries`); `StudentProfile.lernenTema`.
- Produces: `TUGUN_TONLARI`, `type TugunTone`, `type TugunHolat`, `interface TugunBelgisiProps`, `interface LernenTema { id: LernenTemaId; TugunBelgisi: React.ComponentType<TugunBelgisiProps> }`; `TEMA_KESH_KALITI`, `joriyTemaId(profil: unknown, kesh: unknown): LernenTemaId`; `useLernenTema(): { id: LernenTemaId; tema: LernenTema; tanla: (id: LernenTemaId) => Promise<void> }`.

- [ ] **Step 1: Write the failing test for the choice logic**

`tema-tanlash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { joriyTemaId } from "./tema-tanlash";

describe("joriyTemaId", () => {
  it("the account wins over the device cache", () => {
    expect(joriyTemaId("alp", "toza")).toBe("alp");
  });
  it("uses the device cache until the profile has loaded", () => {
    expect(joriyTemaId(undefined, "dengiz")).toBe("dengiz");
  });
  it("a profile answer of null means the default, not the cache of another account", () => {
    expect(joriyTemaId(null, "dengiz")).toBe("toza");
  });
  it("falls back to the default for anything unknown", () => {
    expect(joriyTemaId("neon", "bad")).toBe("toza");
    expect(joriyTemaId(undefined, null)).toBe("toza");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/tema-tanlash.test.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Implement the types and the pure logic**

`tema-turlari.ts`:

```ts
import type * as React from "react";
import type { LernenTemaId } from "@/lib/lernen-temalar";

export const TUGUN_TONLARI = ["coral", "amber", "teal", "sky", "grape"] as const;
export type TugunTone = (typeof TUGUN_TONLARI)[number];
export type TugunHolat = "done" | "active" | "locked";

export interface TugunBelgisiProps {
  /** The section's own name; also the accessible name. */
  label: string;
  holat: TugunHolat;
  tone: TugunTone;
  /** Open the lesson sheet (not given for a node that cannot be opened). */
  onClick?: () => void;
  /** The student pressed a locked node: the caller plays the "locked" sound. */
  onBosilmagan?: () => void;
}

/**
 * What a theme supplies to the Ta'lim path (ADR-0125). A theme only DRAWS: the
 * path, locks, points and the exercise flow are the same in every theme.
 */
export interface LernenTema {
  id: LernenTemaId;
  TugunBelgisi: React.ComponentType<TugunBelgisiProps>;
}
```

`tema-tanlash.ts`:

```ts
import { DEFAULT_LERNEN_TEMA, isLernenTema, lernenTemaOrDefault, type LernenTemaId } from "@/lib/lernen-temalar";

/** Device cache of the account's choice, so the first paint is already right. */
export const TEMA_KESH_KALITI = "daf.lernen.tema";

/**
 * Which look to draw. The account is the truth: `undefined` means the profile
 * has not answered yet (use the device cache), `null` means it answered "no
 * choice" (the default — never another account's cached look).
 */
export function joriyTemaId(profil: unknown, kesh: unknown): LernenTemaId {
  if (profil === undefined) return isLernenTema(kesh) ? kesh : DEFAULT_LERNEN_TEMA;
  return lernenTemaOrDefault(profil);
}
```

- [ ] **Step 4: Run the test, then write the hook**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/tema-tanlash.test.ts`
Expected: PASS.

`use-lernen-tema.ts`:

```ts
"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/use-t";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import { useStudentProfile } from "../../lib/queries";
import type { StudentProfile } from "../../lib/types";
import { TEMA_KESH_KALITI, joriyTemaId } from "./tema-tanlash";
import { temaTop } from "./tema-reyestri";

function keshOqi(): string | null {
  try {
    return localStorage.getItem(TEMA_KESH_KALITI);
  } catch {
    return null;
  }
}

/**
 * The student's Ta'lim look (ADR-0125): the account's choice, cached on the
 * device. `tanla` changes it optimistically and puts the old look back if the
 * save fails.
 */
export function useLernenTema() {
  const t = useT();
  const qc = useQueryClient();
  const { data: profil } = useStudentProfile();
  const [kesh, setKesh] = React.useState<string | null>(null);

  React.useEffect(() => {
    setKesh(keshOqi());
  }, []);

  const id = joriyTemaId(profil ? (profil.lernenTema ?? null) : undefined, kesh);

  const tanla = React.useCallback(
    async (yangi: LernenTemaId) => {
      const eski = qc.getQueryData<StudentProfile>(["student-portal", "profile"]);
      const yoz = (v: LernenTemaId | null) => {
        qc.setQueryData<StudentProfile | undefined>(["student-portal", "profile"], (p) => (p ? { ...p, lernenTema: v } : p));
        try {
          if (v) localStorage.setItem(TEMA_KESH_KALITI, v);
          else localStorage.removeItem(TEMA_KESH_KALITI);
        } catch {
          /* cache only */
        }
        setKesh(v);
      };
      yoz(yangi);
      try {
        await api.patch("/student-portal/lernen-tema", { tema: yangi });
      } catch (e) {
        yoz((eski?.lernenTema as LernenTemaId | null | undefined) ?? null);
        toast.error(getErrorMessage(e, t("Ko'rinishni saqlab bo'lmadi, qayta urinib ko'ring")));
      }
    },
    [qc, t],
  );

  return { id, tema: temaTop(id), tanla };
}
```

(`temaTop` Task 8 da yoziladi; shu task'da hook'ni commit qilmang — Task 8 Step 10 da birga commit.)

- [ ] **Step 5: Commit the pure part now**

```bash
git add client/src/components/student-portal/lernen/tema/tema-turlari.ts client/src/components/student-portal/lernen/tema/tema-tanlash.ts client/src/components/student-portal/lernen/tema/tema-tanlash.test.ts
git commit -m "feat(lernen): theme contract and the pure look-choice rule

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — «Toza» tema: 3D tugun, reyestr va hook

**Files:**
- Create: `…/tema/toza/toza-tugun-model.ts`, `toza-tugun-model.test.ts`, `toza-tugun.tsx`, `toza-tugun.test.ts`, `toza-tema.ts`
- Create: `…/tema/tema-reyestri.ts`, `tema-reyestri.test.ts`
- Modify: (hook allaqachon yozilgan, Task 7) — commit shu task'da.

**Interfaces:**
- Consumes: `TugunBelgisiProps`, `TugunTone`, `TugunHolat` (Task 7).
- Produces: `tugunRangi(holat, tone): { yuz: string; lab: string }`, `belgiTuri(holat): "tekshirildi" | "yulduz" | "qulf"`; `<TozaTugun {...TugunBelgisiProps} />`; `tozaTema: LernenTema`; `temaTop(id: LernenTemaId): LernenTema` (tayyor bo'lmagan id uchun `tozaTema` qaytaradi).

- [ ] **Step 1: Write the failing tests**

`toza-tugun-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TUGUN_TONLARI } from "../tema-turlari";
import { belgiTuri, tugunRangi } from "./toza-tugun-model";

describe("toza tugun modeli", () => {
  it("shows a check for done, a star for the current one and a lock for the rest", () => {
    expect(belgiTuri("done")).toBe("tekshirildi");
    expect(belgiTuri("active")).toBe("yulduz");
    expect(belgiTuri("locked")).toBe("qulf");
  });

  it("a finished node is gold whatever its level colour is", () => {
    const ranglar = TUGUN_TONLARI.map((tone) => tugunRangi("done", tone).yuz);
    expect(new Set(ranglar).size).toBe(1);
  });

  it("the current node takes its level colour", () => {
    expect(tugunRangi("active", "coral").yuz).toBe("var(--coral-500)");
    expect(tugunRangi("active", "teal").yuz).toBe("var(--teal-500)");
    expect(tugunRangi("active", "grape").yuz).toBe("var(--grape-500)");
  });

  it("every state has a face and a darker lip", () => {
    for (const holat of ["done", "active", "locked"] as const) {
      for (const tone of TUGUN_TONLARI) {
        const r = tugunRangi(holat, tone);
        expect(r.yuz.length).toBeGreaterThan(0);
        expect(r.lab.length).toBeGreaterThan(0);
        expect(r.lab).not.toBe(r.yuz);
      }
    }
  });
});
```

`toza-tugun.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TozaTugun } from "./toza-tugun";

const render = (props: Parameters<typeof TozaTugun>[0]) => renderToStaticMarkup(createElement(TozaTugun, props));

describe("<TozaTugun />", () => {
  it("the current node can be pressed and is named by the section", () => {
    const html = render({ label: "Tanishuv", holat: "active", tone: "coral", onClick: () => {} });
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="Tanishuv"');
    expect(html).not.toContain("disabled");
  });
  it("a locked node stays pressable (it plays the locked sound) but says it is closed", () => {
    const html = render({ label: "Tanishuv", holat: "locked", tone: "coral", onBosilmagan: () => {} });
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/toza`
Expected: FAIL — modullar topilmadi.

- [ ] **Step 3: Implement the model and the component**

`toza-tugun-model.ts`:

```ts
import type { TugunHolat, TugunTone } from "../tema-turlari";

/** Face = the top of the chunky button, lip = its darker edge underneath. */
const TONA: Record<TugunTone, string> = {
  coral: "var(--coral-500)",
  amber: "var(--amber-500)",
  teal: "var(--teal-500)",
  sky: "var(--sky-500)",
  grape: "var(--grape-500)",
};

const lab = (yuz: string) => `color-mix(in srgb, ${yuz} 72%, black)`;

export function tugunRangi(holat: TugunHolat, tone: TugunTone): { yuz: string; lab: string } {
  if (holat === "locked") return { yuz: "var(--bg-sunk)", lab: "var(--line)" };
  const yuz = holat === "done" ? "var(--amber-500)" : TONA[tone];
  return { yuz, lab: lab(yuz) };
}

export function belgiTuri(holat: TugunHolat): "tekshirildi" | "yulduz" | "qulf" {
  return holat === "done" ? "tekshirildi" : holat === "active" ? "yulduz" : "qulf";
}
```

`toza-tugun.tsx`:

```tsx
"use client";

import * as React from "react";
import { Check, LockSimple, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { TugunBelgisiProps } from "../tema-turlari";
import { belgiTuri, tugunRangi } from "./toza-tugun-model";

/**
 * The «Toza» theme's path node: a round, chunky button with a darker lip that
 * sinks when pressed. The current node wears a ring and breathes. A locked node
 * is still a button (the student gets the soft "locked" answer), but it says
 * it is closed to screen readers.
 */
export function TozaTugun({ label, holat, tone, onClick, onBosilmagan }: TugunBelgisiProps) {
  const t = useT();
  const { yuz, lab } = tugunRangi(holat, tone);
  const locked = holat === "locked";
  const belgi = belgiTuri(holat);
  const Icon = belgi === "tekshirildi" ? Check : belgi === "yulduz" ? Star : LockSimple;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {holat === "active" ? (
          <span
            aria-hidden
            className="lumio-pulse-ring absolute -inset-2 rounded-full"
            style={{ boxShadow: `0 0 0 4px ${yuz}` }}
          />
        ) : null}
        <button
          type="button"
          onClick={locked ? onBosilmagan : onClick}
          aria-label={locked ? t("{label} — hali ochilmagan", { label }) : label}
          aria-disabled={locked || undefined}
          className={cn(
            "relative grid size-[76px] place-items-center rounded-full transition-transform",
            "active:translate-y-[5px]",
            locked ? "cursor-default" : "hover:-translate-y-0.5",
          )}
          style={{
            background: yuz,
            color: locked ? "var(--ink-400)" : "#fff",
            boxShadow: `0 7px 0 ${lab}, 0 14px 22px rgba(14,42,61,.14)`,
          }}
        >
          <Icon size={32} weight="fill" />
        </button>
      </div>
      <span className="max-w-[120px] truncate text-center text-xs font-bold text-ink-500">{label}</span>
    </div>
  );
}
```

(`t("{label} — hali ochilmagan", …)` matni `lesson-node.tsx` da allaqachon mavjud va lug'atlarda bor — yangi matn emas, shuning uchun `toza-tugun.tsx` ni `STRICT_FILES` ga qo'shish shart emas; lekin `useT` ishlatgani uchun qo'shilsa ham muammo yo'q.)

`toza-tema.ts`:

```ts
import type { LernenTema } from "../tema-turlari";
import { TozaTugun } from "./toza-tugun";

export const tozaTema: LernenTema = { id: "toza", TugunBelgisi: TozaTugun };
```

- [ ] **Step 4: Write the registry test and implementation**

`tema-reyestri.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LERNEN_TEMA_IDLARI, TAYYOR_TEMALAR } from "@/lib/lernen-temalar";
import { TEMALAR, temaTop } from "./tema-reyestri";

describe("tema reyestri", () => {
  it("has a theme for every look marked as finished", () => {
    for (const t of TAYYOR_TEMALAR) expect(TEMALAR[t.id]).toBeDefined();
  });
  it("draws the default for a look that is not built yet", () => {
    for (const id of LERNEN_TEMA_IDLARI) expect(temaTop(id).TugunBelgisi).toBeTruthy();
    expect(temaTop("alp").id).toBe("toza");
  });
});
```

`tema-reyestri.ts`:

```ts
import { DEFAULT_LERNEN_TEMA, type LernenTemaId } from "@/lib/lernen-temalar";
import type { LernenTema } from "./tema-turlari";
import { tozaTema } from "./toza/toza-tema";

/** Finished themes only; a look the student picked but that is not built draws the default. */
export const TEMALAR: Partial<Record<LernenTemaId, LernenTema>> = {
  toza: tozaTema,
};

export function temaTop(id: LernenTemaId): LernenTema {
  return TEMALAR[id] ?? (TEMALAR[DEFAULT_LERNEN_TEMA] as LernenTema);
}
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/tema`
Expected: PASS; 0 xato.

- [ ] **Step 6: Commit (hook bilan birga)**

```bash
git add client/src/components/student-portal/lernen/tema
git commit -m "feat(lernen): Toza theme node, registry and the useLernenTema hook

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — yopishqoq unit lavhasi va pastdan varaq

**Files:**
- Create: `…/lernen/yol/joriy-unit.ts`, `joriy-unit.test.ts`, `yopishqoq-unit-lavha.tsx`, `seans-varaq.tsx`
- Modify: `client/src/i18n/i18n-coverage.test.ts`, `client/src/i18n/dictionaries/{ru,de,en}.ts` (`seans-varaq.tsx` matnlari)

**Interfaces:**
- Consumes: `ovozChal` (Task 4); `BottomSheet`, `Button` (`../../lumio`).
- Produces: `joriyUnitIndeksi(tepalar: number[], chegara: number): number`; `useJoriyUnit(konteyner: React.RefObject<HTMLElement | null>): number`; `<YopishqoqUnitLavha matn: string; daraja: string />`; `<SeansVaraq tugun: { matn: string; ostyozuv: string | null } | null; onYopish: () => void; onBoshlash: () => void />`.

- [ ] **Step 1: Write the failing test**

`joriy-unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { joriyUnitIndeksi } from "./joriy-unit";

describe("joriyUnitIndeksi", () => {
  // tops are the units' distances from the viewport top, in px
  it("is the first unit while none has scrolled past the line", () => {
    expect(joriyUnitIndeksi([300, 900, 1500], 120)).toBe(0);
  });
  it("is the last unit whose top has passed the line", () => {
    expect(joriyUnitIndeksi([-700, 80, 760], 120)).toBe(1);
    expect(joriyUnitIndeksi([-1700, -900, 100], 120)).toBe(2);
  });
  it("is 0 for an empty list", () => {
    expect(joriyUnitIndeksi([], 120)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/student-portal/lernen/yol/joriy-unit.test.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Implement the pure rule and the hook**

`joriy-unit.ts`:

```ts
"use client";

import * as React from "react";

/** The unit whose header has scrolled up to (or past) the sticky line; the first one before any has. */
export function joriyUnitIndeksi(tepalar: number[], chegara: number): number {
  let idx = 0;
  tepalar.forEach((tepa, i) => {
    if (tepa <= chegara) idx = i;
  });
  return idx;
}

/** Sticky banner follows the scroll. One passive listener, work done inside a frame. */
export function useJoriyUnit(konteyner: React.RefObject<HTMLElement | null>, chegara = 120): number {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    let kadr = 0;
    const hisobla = () => {
      kadr = 0;
      const el = konteyner.current;
      if (!el) return;
      const tepalar = [...el.querySelectorAll<HTMLElement>("[data-yol-unit]")].map((u) => u.getBoundingClientRect().top);
      setIdx(joriyUnitIndeksi(tepalar, chegara));
    };
    const turtki = () => {
      if (!kadr) kadr = requestAnimationFrame(hisobla);
    };
    hisobla();
    window.addEventListener("scroll", turtki, { passive: true });
    window.addEventListener("resize", turtki);
    return () => {
      window.removeEventListener("scroll", turtki);
      window.removeEventListener("resize", turtki);
      if (kadr) cancelAnimationFrame(kadr);
    };
  }, [konteyner, chegara]);

  return idx;
}
```

- [ ] **Step 4: Run the test, then write the two components**

Run: `cd client && npx vitest run src/components/student-portal/lernen/yol/joriy-unit.test.ts`
Expected: PASS.

`yopishqoq-unit-lavha.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

/** Same level colours as the path (A1 coral, A2 teal, B1 grape). */
const FON: Record<string, string> = {
  A1: "bg-coral-500",
  A2: "bg-teal-500",
  B1: "bg-grape-500",
};

/**
 * The banner that sticks under the page header and shows which unit the student
 * is scrolling through; its colour follows the unit's level.
 */
export function YopishqoqUnitLavha({ matn, daraja }: { matn: string; daraja: string }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "sticky top-2 z-10 rounded-2xl px-4 py-3 font-display text-base font-extrabold text-white",
        "shadow-[0_5px_0_rgba(0,0,0,.22)] transition-colors duration-500",
        FON[daraja] ?? FON.A1,
      )}
    >
      {matn}
    </div>
  );
}
```

`seans-varaq.tsx`:

```tsx
"use client";

import { useT } from "@/i18n/use-t";
import { BottomSheet, Button } from "../../lumio";

export interface SeansVaraqProps {
  /** The pressed node; `null` keeps the sheet shut. */
  tugun: { matn: string; ostyozuv: string | null } | null;
  onYopish: () => void;
  onBoshlash: () => void;
}

/** The sheet that rises from the bottom when a path node is pressed. */
export function SeansVaraq({ tugun, onYopish, onBoshlash }: SeansVaraqProps) {
  const t = useT();
  return (
    <BottomSheet open={tugun != null} onOpenChange={(o) => !o && onYopish()} title={tugun?.matn}>
      {tugun?.ostyozuv ? <p className="mb-4 text-sm font-semibold text-ink-500">{tugun.ostyozuv}</p> : null}
      <Button className="w-full" onClick={onBoshlash}>
        {t("Boshlash")}
      </Button>
    </BottomSheet>
  );
}
```

- [ ] **Step 5: Register the new file for translation and add the texts**

`i18n-coverage.test.ts` `STRICT_FILES` da `"components/student-portal/lernen/yol/lernen-yol.tsx",` dan keyin: `"components/student-portal/lernen/yol/seans-varaq.tsx",`.

Lug'atlarga (`Edit`: old_string `};\n\nexport default en;`):
- `en.ts`: `  "Boshlash": "Start",`
- `ru.ts`: `  "Boshlash": "Начать",`
- `de.ts`: `  "Boshlash": "Starten",`
Agar `"Boshlash"` kaliti allaqachon bor bo'lsa — qayta yozmang.

- [ ] **Step 6: Run tests, typecheck, lint, commit**

Run: `cd client && npx vitest run src/components/student-portal/lernen/yol/joriy-unit.test.ts src/i18n/i18n-coverage.test.ts && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/yol`
Expected: PASS; 0 xato.

```bash
git add client/src/components/student-portal/lernen/yol client/src/i18n
git commit -m "feat(lernen): sticky unit banner and the lesson sheet

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Client — yo'l sahifasini yangi ko'rinishga ulash

**Files:**
- Modify: `client/src/components/student-portal/lernen/yol/lernen-yol.tsx` (SeansTuguni, LernenYol, importlar)

**Interfaces:**
- Consumes: `useLernenTema` (Task 7), `Dafi` (Task 6), `ovozChal`, `ovozniUygot` (Task 4), `YopishqoqUnitLavha`, `useJoriyUnit` (Task 9), `SeansVaraq` (Task 9), `LernenTema.TugunBelgisi` (Task 8).

> Qoida: bu faylda YANGI `t("…")` matni qo'shilmaydi (u `STRICT_FILES` da). Hamma yangi matn `seans-varaq.tsx` da. Mavjud `UnitQatori` va hamma yo'l mantig'i joyida qoladi.

- [ ] **Step 1: Update the imports**

`lernen-yol.tsx` boshida `import { LessonNode, type LessonNodeTone } from "../../lumio";` qatorini almashtiring va yangi importlarni qo'shing:

```tsx
import type { LessonNodeTone } from "../../lumio";
import { Dafi } from "../dafi/dafi";
import { ovozChal, ovozniUygot } from "../ovoz/ovoz";
import { useLernenTema } from "../tema/use-lernen-tema";
import { SeansVaraq } from "./seans-varaq";
import { YopishqoqUnitLavha } from "./yopishqoq-unit-lavha";
import { useJoriyUnit } from "./joriy-unit";
```

(`LessonNodeTone` turi `TugunTone` bilan bir xil to'plam — `DARAJA_TONE` o'zgarmaydi.)

- [ ] **Step 2: Replace `SeansTuguni`**

Eski `SeansTuguni` funksiyasi va uning izohini (fayldagi `/** \`seans\` va \`tez-orada\` — ikkalasi ham bir xil \`LessonNode\`. … */` dan `function SeansTuguni(...) { ... }` oxirigacha) shu bilan almashtiring:

```tsx
/**
 * `seans` va `tez-orada` — ikkalasi ham tema tugun belgisi bilan chiziladi.
 *
 * `tez-orada` uchun `id` yo'q (`yolTugunlari` uni har doim `null` qiladi) va
 * `holat` har doim `"locked"`. Joriy tugun yonida Dafi turadi: u zigzagning
 * bo'sh tomonida (chap tekislashda o'ng tomonda) chiziladi.
 */
function SeansTuguni({
  tugun,
  align,
  ostyozuvKorinsinmi,
  onClick,
  onQulf,
  ref,
}: {
  tugun: YolTugun;
  align: (typeof TEKISLASH)[number];
  ostyozuvKorinsinmi: boolean;
  onClick?: () => void;
  onQulf?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { tema } = useLernenTema();
  const Belgi = tema.TugunBelgisi;
  const dafiOngda = align === "justify-start";
  return (
    <div ref={ref} className={cn("flex", align)}>
      <div className="relative flex flex-col items-center gap-1.5">
        {ostyozuvKorinsinmi && tugun.ostyozuv ? (
          <p className="max-w-[132px] truncate text-center text-[11px] font-bold uppercase tracking-wide text-ink-400">
            {tugun.ostyozuv}
          </p>
        ) : null}
        {tugun.holat === "active" ? (
          <div className={cn("absolute top-3", dafiOngda ? "-right-[84px]" : "-left-[84px]")}>
            <Dafi holat="tinch" olcham="sm" />
          </div>
        ) : null}
        <Belgi
          label={tugun.matn}
          holat={tugun.holat}
          tone={DARAJA_TONE[tugun.daraja] ?? "coral"}
          onClick={onClick}
          onBosilmagan={onQulf}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the sheet, sticky banner and sounds into `LernenYol`**

`LernenYol` ichida: `const fortschritt = useFortschritt();` dan oldin qo'shing:

```tsx
  const konteyner = React.useRef<HTMLDivElement>(null);
  const joriyUnit = useJoriyUnit(konteyner);
  const unitlar = React.useMemo(() => tugunlar.filter((x) => x.tur === "unit"), [tugunlar]);
  const [varaq, setVaraq] = React.useState<YolTugun | null>(null);
```

Qaytariluvchi JSX'ning tashqi `<div className="mx-auto flex w-full max-w-md flex-col gap-5">` ni `ref={konteyner}` bilan oching va `<button …>Takrorlash</button>` dan keyin, tugunlar ro'yxati `<div className="flex flex-col gap-5">` dan OLDIN yopishqoq lavhani joylang:

```tsx
    <div ref={konteyner} className="mx-auto flex w-full max-w-md flex-col gap-5">
      {/* …Takrorlash tugmasi o'zgarmaydi… */}

      {unitlar.length > 0 ? (
        <YopishqoqUnitLavha
          matn={unitlar[Math.min(joriyUnit, unitlar.length - 1)].matn}
          daraja={unitlar[Math.min(joriyUnit, unitlar.length - 1)].daraja}
        />
      ) : null}
```

Unit qatori (`UnitQatori`) chaqiruvida `data-yol-unit` kerak. `UnitQatori` ning `<button …>` ga atribut qo'shing (`ref={ref}` yonida): `data-yol-unit=""`. (Yagona o'zgarish — `UnitQatori` ichida `<button ref={ref} type="button" data-yol-unit="" …>`.)

`SeansTuguni` chaqiruvida `onClick`/`onQulf` ni almashtiring:

```tsx
              onClick={
                tugun.tur === "seans" && tugun.holat !== "locked"
                  ? () => {
                      ovozniUygot();
                      ovozChal("bos");
                      setVaraq(tugun);
                    }
                  : undefined
              }
              onQulf={() => {
                ovozniUygot();
                ovozChal("qulf");
              }}
```

Qaytariluvchi JSX oxirida (tugunlar ro'yxatidan keyin, tashqi `</div>` dan oldin):

```tsx
      <SeansVaraq
        tugun={varaq}
        onYopish={() => setVaraq(null)}
        onBoshlash={() => {
          if (varaq?.id != null) {
            ovozChal("unitOchildi");
            router.push(`/portal/lernen/lessons/${varaq.id}`);
          }
          setVaraq(null);
        }}
      />
```

- [ ] **Step 4: Run the existing path tests, typecheck, lint**

Run: `cd client && npx vitest run src/components/student-portal/lernen src/components/student-portal/student-portal-nav.test.ts src/i18n && npx tsc --noEmit && npx eslint src/components/student-portal`
Expected: PASS; mavjud yo'l testlari (`yol-tuzilishi`, `yol-skroll`, `lernen-unit-page`) buzilmagan; 0 xato.

- [ ] **Step 5: Look at it in the browser**

Run (fonda): `cd client && npm run dev` (yoki loyihaning `restart` buyrug'i), keyin brauzerda `http://localhost:3000/portal/lernen` ni o'quvchi hisobi bilan oching.
Tekshirish: (1) tugunlar yumaloq 3D; (2) joriy tugun yonida Dafi nafas oladi; (3) skrollda yuqoridagi lavha nomi/rangi o'zgaradi; (4) joriy tugunni bossangiz «bos» ovozi va pastdan varaq; «Boshlash» → ovoz va dars ochiladi; (5) yopiq tugun «tuk» ovozi; (6) `prefers-reduced-motion` yoqilganda Dafi qimirlamaydi; (7) qorong'u rejimda o'qiladi. Muammo topsangiz — tuzating va shu qadamni takrorlang.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/yol
git commit -m "feat(lernen): draw the path with the theme node, Dafi, sticky banner and sounds

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Client — Sozlamalarda «Ta'lim ko'rinishi»

**Files:**
- Create: `client/src/components/student-portal/lernen-korinish-tanlash.tsx`
- Modify: `client/src/components/student-portal/student-settings-page.tsx` (faqat yangi komponentni joylash)
- Modify: `client/src/i18n/i18n-coverage.test.ts`, `client/src/i18n/dictionaries/{ru,de,en}.ts`

**Interfaces:**
- Consumes: `useLernenTema` (Task 7), `TAYYOR_TEMALAR` (Task 3), `ovozYoqilganmi`, `ovozniSaqla` (Task 4), `qurilmaHarakatSozlamasi`, `harakatniSaqla` (Task 5), `ovozChal`.
- Produces: `<LernenKorinishTanlash />`.

- [ ] **Step 1: Write the component**

`lernen-korinish-tanlash.tsx`:

```tsx
"use client";

import * as React from "react";
import { Check, SpeakerHigh, Wind } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { TAYYOR_TEMALAR } from "@/lib/lernen-temalar";
import { Card, ListRow, Section } from "./lumio";
import { useLernenTema } from "./lernen/tema/use-lernen-tema";
import { ovozChal, ovozniUygot } from "./lernen/ovoz/ovoz";
import { ovozYoqilganmi, ovozniSaqla } from "./lernen/ovoz/ovoz-sozlama";
import { harakatniSaqla, qurilmaHarakatSozlamasi } from "./lernen/harakat/kam-harakat";

/**
 * Settings → «Ta'lim ko'rinishi» (ADR-0125): the look is the account's choice;
 * sound and reduced motion are this device's. Only finished looks are offered.
 */
export function LernenKorinishTanlash() {
  const t = useT();
  const { id, tanla } = useLernenTema();
  const [ovoz, setOvoz] = React.useState(true);
  const [kam, setKam] = React.useState(false);

  React.useEffect(() => {
    setOvoz(ovozYoqilganmi());
    setKam(qurilmaHarakatSozlamasi() === true);
  }, []);

  return (
    <Section title={t("Ta'lim ko'rinishi")}>
      <Card pad="sm">
        <div role="radiogroup" aria-label={t("Ta'lim ko'rinishi")} className="grid gap-2">
          {TAYYOR_TEMALAR.map((tema) => {
            const tanlangan = tema.id === id;
            return (
              <button
                key={tema.id}
                type="button"
                role="radio"
                aria-checked={tanlangan}
                onClick={() => void tanla(tema.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors",
                  tanlangan ? "border-coral-500 bg-coral-100" : "border-line bg-surface",
                )}
              >
                <span aria-hidden className="size-8 shrink-0 rounded-full" style={{ background: tema.swatch }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-extrabold text-ink-900">{t(tema.label)}</span>
                  <span className="block text-xs font-semibold text-ink-500">{t(tema.hint)}</span>
                </span>
                {tanlangan ? <Check size={20} weight="bold" className="text-coral-600" /> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <ListRow
        icon={<SpeakerHigh weight="bold" />}
        iconTone="amber"
        label={t("Ovozlar")}
        subtitle={ovoz ? t("Yoqilgan") : t("O'chiq")}
        chevron={false}
        onClick={() => {
          const yangi = !ovoz;
          ovozniSaqla(yangi);
          setOvoz(yangi);
          if (yangi) {
            ovozniUygot();
            ovozChal("togri"); // a sample, so the student hears what they switched on
          }
        }}
      />
      <ListRow
        icon={<Wind weight="bold" />}
        iconTone="sky"
        label={t("Kam harakat")}
        subtitle={kam ? t("Yoqilgan") : t("O'chiq")}
        chevron={false}
        onClick={() => {
          const yangi = !kam;
          harakatniSaqla(yangi);
          setKam(yangi);
        }}
      />
    </Section>
  );
}
```

- [ ] **Step 2: Mount it in the settings page**

`student-settings-page.tsx` — import qatorlariga `import { LernenKorinishTanlash } from "./lernen-korinish-tanlash";` qo'shing va «Til» `Section` yopilgandan keyin (`</Section>` dan keyin, «Xavfsizlik» dan oldin):

```tsx
      <LernenKorinishTanlash />
```

(Matn yo'q — `student-settings-page.tsx` ning `STRICT_FILES` holati o'zgarmaydi.)

- [ ] **Step 3: Register the file and add the texts**

`i18n-coverage.test.ts` `STRICT_FILES` da `"components/student-portal/student-settings-page.tsx",` dan keyin: `"components/student-portal/lernen-korinish-tanlash.tsx",`.

Lug'atlar (`Edit`: old_string `};\n\nexport default en;`; ru va de uchun ham shunday). Mavjud kalitlarni (masalan «Yoqilgan») takrorlamang:

`en.ts`:
```ts
  // Ta'lim look picker (lernen-korinish-tanlash.tsx)
  "Ta'lim ko'rinishi": "Learning look",
  "Ovozlar": "Sounds",
  "Kam harakat": "Less motion",
  "Yoqilgan": "On",
  "O'chiq": "Off",
  "Ko'rinishni saqlab bo'lmadi, qayta urinib ko'ring": "Could not save the look, please try again",
```
`ru.ts`:
```ts
  // Ta'lim look picker (lernen-korinish-tanlash.tsx)
  "Ta'lim ko'rinishi": "Вид раздела «Обучение»",
  "Ovozlar": "Звуки",
  "Kam harakat": "Меньше движения",
  "Yoqilgan": "Включено",
  "O'chiq": "Выключено",
  "Ko'rinishni saqlab bo'lmadi, qayta urinib ko'ring": "Не удалось сохранить вид, попробуйте ещё раз",
```
`de.ts`:
```ts
  // Ta'lim look picker (lernen-korinish-tanlash.tsx)
  "Ta'lim ko'rinishi": "Lern-Ansicht",
  "Ovozlar": "Töne",
  "Kam harakat": "Weniger Bewegung",
  "Yoqilgan": "An",
  "O'chiq": "Aus",
  "Ko'rinishni saqlab bo'lmadi, qayta urinib ko'ring": "Die Ansicht konnte nicht gespeichert werden, bitte erneut versuchen",
```
(`use-lernen-tema.ts` dagi toast matni ham shu kalit; u fayl `STRICT_FILES` da emas, kalit lug'atda bor.)

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `cd client && npx vitest run src/i18n src/components/student-portal && npx tsc --noEmit && npx eslint src/components/student-portal src/i18n`
Expected: PASS (`i18n-coverage`: har bir yangi matn ru/de/en da bor, placeholder'lar teng); 0 xato.

- [ ] **Step 5: Look at it in the browser**

`/portal/settings` ni oching: «Ta'lim ko'rinishi» bo'limida «Toza» kartochkasi tanlangan; «Ovozlar» bosilsa belgi almashadi va yoqilganda namuna chaladi; «Kam harakat» yoqilsa `/portal/lernen` da Dafi qimirlamaydi. Sahifani yangilang — tanlov saqlanib qolgan. Tarmoq panelida `PATCH /student-portal/lernen-tema` 200 (yoki serverda ustun yo'q bo'lsa — Task 1 Step 4 ni tekshiring).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal client/src/i18n
git commit -m "feat(lernen): Ta'lim look picker with sound and reduced-motion switches in settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: ADR-0125, hujjatlar va yakuniy tekshiruv

**Files:**
- Create: `docs/adr/0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md`
- Modify: `docs/adr/README.md` (indeks jadvali oxiriga qator), `client/CLAUDE.md` («Student Portal» bo'limiga qisqa band)

- [ ] **Step 1: Check the ADR number is still free**

Run: `ls docs/adr | tail -3 && git fetch -q origin main && git ls-tree -r origin/main --name-only docs/adr | tail -3`
Expected: oxirgi raqam `0124`. Agar `main` da `0125` allaqachon bor bo'lsa — keyingi bo'sh raqamni oling va quyidagi fayl nomi, sarlavha, README qatori va spec havolasini shunga moslang (`git mv`).

- [ ] **Step 2: Write the ADR**

`docs/adr/0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md`:

```markdown
# ADR-0125 — Ta'lim ko'rinishini o'quvchi hisobida tanlaydi; temalar faqat ko'rinish qatlami

**Holati:** Qabul qilindi
**Sana:** 2026-10-24
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md`, `docs/superpowers/plans/2026-10-24-lernen-dizayn-asos.md`, ADR-0101 (xodim skinlari), ADR-0020 (faollik o'lchovi)

## Kontekst

`portal/lernen` (yo'l, unit, mashq, natija) oddiy va jonsiz edi: yo'lning ikki yoni bo'sh, animatsiya va interfeys ovozi yo'q. CEO o'quvchiga o'ziga yoqqan ko'rinishni tanlash imkonini berishni va Duolingo kabi harakat/ovozli, to'liq his beradigan dizaynni istadi (24.10.2026 sessiyasi, mockuplar `docs/superpowers/mockups/2026-10-24-lernen-dizayn/`).

## Qaror

1. **Tanlov hisobda saqlanadi:** `Student.lernenTema` (`String?`, null = `toza`), `PATCH /student-portal/lernen-tema` (`@StudentOnly()`). `User.uiSkin` (xodim skinlari, ADR-0101) bilan aralashtirilmaydi: ro'yxatlar va ustunlar alohida, `server/src/common/lernen-temalar.ts` ↔ `client/src/lib/lernen-temalar.ts` testi bilan bog'langan.
2. **Temalar faqat ko'rinish.** Yo'l tuzilishi, qulf, ball, mashq oqimi (`yol-tuzilishi`, `fortschritt`, `seans-navbat`) hamma temada bir xil; tema `LernenTema` shartnomasi orqali faqat chizadi (`TugunBelgisi`, keyingi bosqichlarda sahna/lavha/mukofot).
3. **Qurilma sozlamalari serverga yozilmaydi:** ovoz (`daf.lernen.ovoz`) va «kam harakat» (`daf.lernen.harakat`) — `localStorage`; hisob tanlovining keshi `daf.lernen.tema`. Tizim `prefers-reduced-motion` ni hech qachon bekor qila olmaymiz (ko'proq harakatga qaytarib bo'lmaydi).
4. **Ovoz tashqi faylsiz:** Web Audio sintezi (marimba/kalimba, arfa — Karplus-Strong, shisha qo'ng'iroq, havo shovqini). Litsenziya va yuklash yo'q; dars audiosi o'ynayotganda effekt chalinmaydi (mukofotdan tashqari).
5. **Animatsiya kutubxonasi — `gsap`, faqat lernen'da lazy** (`import("gsap")` Dafi ichida): asosiy portal paketiga kirmaydi. Dafi — 2D SVG bosh, 5 holat; xato holati yumshoq (jazolamaydi).

## Rad etilgan yo'llar

- **3D ayiqcha kodda** (Three.js, sferalar): CEO «hunuk» dedi; mo'ynali Pixar darajasiga yetmaydi.
- **AI bilan rasmdan 3D model + AI skelet** (Hunyuan 3D, Meshy; ~$1.7 sarflandi): yurish yaxshi, lekin qo'l ko'targanda qo'l yassi tasmaga aylanadi (AI og'irliklari xato), yuz animatsiyasi yo'q, fayl 25 MB. Tuzatish 3D rassomning ishi.
- **Pixar rasm + kodda harakat:** CEO 3D ni istadi; 3D bo'lmagach eng oddiy 2D bosh tanlandi.
- **`User.uiSkin` ni qayta ishlatish:** nomlar to'qnashadi (`ormon`), o'quvchi xodim skiniga kira olmaydi.
- **Tanlovni faqat qurilmada saqlash:** telefon va kompyuterda har xil ko'rinadi.

## Oqibatlar

- Yo'l sahifasi `useLernenTema()` ga bog'liq; profil javobiga `lernenTema` qo'shildi.
- Yangi tema qo'shish: reyestrga bir yozuv + `tayyor: true` + (server ro'yxatida id allaqachon bor) — migratsiya kerak emas.
- Telegram Mini App WebView'da Web Audio jim bo'lishi mumkin: `ovozChal` hech qachon xato bermaydi.
- Keyingi bosqichlar (mashq/natija ekrani, O'rmon, Dengiz, Nemis sayohati) shu shartnomaga qo'shiladi; rassom animatsiyasi (Rive) `Dafi` interfeysini o'zgartirmasdan almashtiriladi.
```

`docs/adr/README.md` — indeks jadvalining oxiriga (0124 qatoridan keyin):

```markdown
| [0125](0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md) | Ta'lim ko'rinishini o'quvchi hisobida tanlaydi (`Student.lernenTema`, 4 tema); temalar faqat ko'rinish qatlami, mantiq bitta; ovoz/kam harakat qurilmada (`localStorage`); Web Audio sintezi; `gsap` faqat lernen'da lazy; Dafi — 2D bosh; 3D va AI yo'llari rad etildi | Qabul qilindi | 2026-10-24 |
```

- [ ] **Step 3: Add the short note to `client/CLAUDE.md`**

«Student Portal» bo'limida («Key screen components» ro'yxatidan oldin) INGLIZCHA band qo'shing:

```markdown
**Ta'lim look (`student-portal/lernen/tema/`, ADR-0125).** The look of the Ta'lim path is the student's own choice, saved on the account (`Student.lernenTema`, `PATCH /student-portal/lernen-tema`, read back in `GET /student-portal/profile`) and cached on the device (`daf.lernen.tema`); `useLernenTema()` returns the theme and `tanla(id)`. A theme only DRAWS (`LernenTema.TugunBelgisi` today): the path, locks and points are shared and untouched. Only themes marked `tayyor` in `lib/lernen-temalar.ts` are offered in Sozlamalar → «Ta'lim ko'rinishi»; the id list is mirrored from `server/src/common/lernen-temalar.ts` (test compares them), and it is NOT `User.uiSkin`. Sound effects (`ovoz/`, Web Audio synthesis, no files) and «Kam harakat» are device settings (`daf.lernen.ovoz`, `daf.lernen.harakat`); `ovozChal(hodisa)` never throws and stays silent while a lesson clip plays. Dafi (`dafi/`) is the 2D bear head with five states; `gsap` is loaded only inside it, with `import("gsap")` — never a static import, or the whole portal pays for it. The system's reduced-motion setting can only add to the student's choice, never be overridden.
```

- [ ] **Step 4: Full verification**

Run, har biri alohida (kod o'zgarmaguncha qayta ishlatmang):

```bash
cd server && npm run typecheck && npm test
cd ../client && npx tsc --noEmit && npm test && npx eslint src && npm run build
```
Expected: server typecheck va butun test to'plami PASS (`permission-routes.spec`, `branch-route-policy` va yangi testlar ham); client `tsc` 0 xato; `npm test` (vitest) PASS (`i18n-coverage`, `globals-css`, `student-portal-*` jumladan); `eslint` natijasida `✖ N problems (0 errors, …)`; `npm run build` muvaffaqiyatli (Next.js `useSearchParams`/Suspense bilan bog'liq xato yo'q). Biror narsa qizil bo'lsa, tuzating va faqat shu buyruqni qayta ishlating.

- [ ] **Step 5: Commit**

```bash
git add docs/adr client/CLAUDE.md
git commit -m "docs(lernen): ADR-0125, README index and the client CLAUDE.md note

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (spec bo'limi → task):
- §3 qarorlar 1–6, §5 arxitektura (`tema/`, `dafi/`, `ovoz/`, `harakat/`) → Task 4–8; temaning shartnomasi → Task 7–8.
- §5 «gsap lazy» → Task 6 (dinamik import) + Global Constraints.
- §6 server: ustun, DTO, `PATCH`, profil → Task 1–2; klient hook + kesh + optimistik → Task 7; qurilma sozlamalari → Task 4–5.
- §7 tanlash ekrani (kartochkalar, Ovozlar, Kam harakat) → Task 11 (faqat tayyor temalar — §12 bilan mos).
- §8 «Toza» tema (3D tugun, halqa, yopishqoq lavha, varaq) → Task 8, 9, 10. «Tugunda progress halqa» sifatida hozir pulsatsiyalovchi halqa chiziladi (yo'lda bo'lim ichidagi % ma'lumoti yo'q — `percent` mavjud `LessonNode` da ham qat'iy 0/100 edi); haqiqiy bo'lim progressi keyingi bosqichda.
- §9 harakat/ovoz tamoyillari: ovoz xaritasi (`bos`, `qulf`, `unitOchildi` yo'lda; `togri`/`xato`/`mukofot` mashq ekrani 2-bosqichda), kam harakat, yengil rejim funksiyasi (`yengilRejimmi`) → Task 4–5. `yengilRejimmi` 1-bosqichda faqat tayyor funksiya (Toza temada kamaytiriladigan ambient yo'q; O'rmon/Dengiz/Alp bosqichlarida ishlatiladi) — spec §9 bilan mos, YAGNI chegarasida.
- §10 mavjud qoidalar: `.lumio` tokenlari (faqat `var(--…)` ishlatildi, global `@theme` ga tegilmadi), radio/insetlar tegilmadi, `loadState` tegilmadi, Mini App'da ovoz xatosiz (`ovozChal` try/catch).
- §11 testlar: vitest (reyestr, nusxa testi, ovoz qoidalari, Dafi holat, joriy unit, tanlov qoidasi), jest (DTO, service, controller, route-access) → har task'da; qo'lda tekshiruv → Task 10 Step 5, Task 11 Step 5.
- §13 ADR → Task 12.
- **Bo'shliq (ataylab keyingi rejaga):** mashq/natija ekrani, unit sahifasi, `togri/xato/mukofot` ovozlari ulanishi, O'rmon/Dengiz/Alp temalari (spec §12 bosqich 2–5).

**2. Placeholder scan:** «TBD/TODO/keyinroq» yo'q; har bir kod qadamida to'liq kod bor. Ikkita joyda mavjud faylga tayaniladi (aniq ko'rsatma bilan): Task 6 `DAFI_SVG` va Task 4 `ovoz-motor.ts` mockupdagi kodni porti (kod to'liq berilgan). Task 3/9/11 da «kalit allaqachon bo'lsa takrorlamang» — haqiqiy holatga javob (lug'at takroriy kalitni qabul qilmaydi).

**3. Type consistency:** `LernenTemaId` (server ro'yxati ↔ klient `LERNEN_TEMALAR`), `TugunBelgisiProps` (`label/holat/tone/onClick/onBosilmagan`) — Task 7 da aniqlangan, Task 8 (`TozaTugun`) va Task 10 (`SeansTuguni`) bir xil nomlar bilan ishlatadi. `OvozHodisa` qiymatlari (`bos|togri|xato|unitOchildi|mukofot|qulf`) Task 4 (`HODISALAR`) va Task 10–11 chaqiruvlarida bir xil. `DafiHolat`/`RIG_HOLAT`/`DAFI_OLCHAM` Task 6 da, `<Dafi holat olcham />` Task 10 da shu nomlar bilan. `useLernenTema(): { id, tema, tanla }` Task 7 da, Task 10 (`tema`) va Task 11 (`id`, `tanla`) da. `joriyTemaId(profil, kesh)` imzosi Task 7 test va hook'da bir xil. `kamHarakatHozir`, `qurilmaHarakatSozlamasi`, `harakatniSaqla` Task 5 da, Task 6 va 11 da.
