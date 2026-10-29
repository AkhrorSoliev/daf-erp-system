# /media qayta qurish — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /media sahifasini o'quvchi yo'li bo'yicha qayta qurish: chapda unit → bo'lim → seans daraxti, o'ngda bo'lim materiali yoki seans savollari, pastda bitta umumiy player, va hech narsa yozmaydigan «O'quvchi kabi o'tib ko'rish» rejimi.

**Architecture:** Server: `UebungService` o'quvchisiz (`studentId: null`) ishlay oladi — seans quradi, javob tekshiradi, hech narsa yozmaydi; `DafMediaController`ga seans savollari va sinov endpointlari qo'shiladi; `coverage` javobiga darslar (seanslar) qo'shiladi. Client: `/media` bitta sahifa — `?bolim=` / `?seans=` manzil holati, daraxt, ikki panel, zustand'dagi bitta player; o'quvchining `SeansEkrani` uchinchi manba — `korik` — bilan to'liq ekranli qatlamda ochiladi.

**Tech Stack:** NestJS + Prisma + Jest (server); Next.js + React Query + zustand + Vitest (client); i18n `t()` / `msg()`.

**Spec:** `docs/superpowers/specs/2026-10-29-media-qayta-qurish-design.md`

## Global Constraints

- Ishlash joyi: worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/media-qayta-qurish`, shox `feat/media-qayta-qurish`. Hech qachon asosiy katalogga `cd` qilma.
- Commit xabarlari, yangi kod izohlari — o'zbekcha (lotin). Commit oxirida: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server: har tegilgan `.ts` faylga `npx prettier --write`, keyin `npx eslint`. Client'da prettier ISHLATILMAYDI.
- Server test: `server/` ichidan `npx jest <path>`. Client test: `client/` ichidan `npx vitest run <path>`. Tillar: `client/` ichidan `npm run i18n:check`.
- Ekrandagi har matn `t("…")` (komponentda) yoki `msg("…")` (ro'yxat/konstanta) orqali; kontent (nemischa so'z, tarjima, bo'lim/unit nomi, server matni) `t()`dan O'TMAYDI.
- `t` effekt bog'liqliklariga qo'yilmaydi (til almashsa so'rov qayta ketmasin).
- Yangi fayl 500 qatordan oshmaydi.
- O'quvchi ilovasidagi `OvozTugmasi` va `SuhbatPleyer` O'ZGARMAYDI. `SeansEkrani`ning `dars` va `takrorlash` rejimlari xatti-harakati O'ZGARMAYDI.
- Sinov rejimi (`korik`) bazaga HECH NARSA yozmaydi va o'quvchi endpointlarini (`/student-portal/...`) chaqirmaydi (xodim uchun 403 → global toast).

---

## Fayl xaritasi

**Server**
- Modify `server/src/daf/uebung/uebung.service.ts` — `studentId: number | null`; `pruefen`/`juft` `ctx: PruefenContext | null`; yangi `vorschauKandidaten(lessonId)`.
- Modify `server/src/daf/uebung/uebung.service.spec.ts` — o'quvchisiz rejim testlari.
- Modify `server/src/daf/media/daf-media-fragen.service.ts` — eski nusxa qoida o'chadi; `lessonFragen(lessonId)` dvigateldan oladi.
- Modify `server/src/daf/media/daf-media-fragen.service.spec.ts` — yangi xatti-harakatga.
- Modify `server/src/daf/media/daf-media-coverage.service.ts` (+ `.spec.ts`) — `lessons`, `unitLessons`.
- Modify `server/src/daf/daf-media.controller.ts` (+ `.spec.ts`) — yangi 5 marshrut, `sections/:id/fragen` o'chadi.
- Modify `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/auth/branch-route-policy.ts` (va kerak bo'lsa `permission-allowed-roles.spec.ts`).

**Client** (`client/src/`)
- Modify `components/media/media-coverage-types.ts` — `MediaLesson`, `lessons`, `unitLessons`.
- Create `components/media/media-daraxt.ts` (+ `.test.ts`) — manzil ↔ tanlov, joy topish, kamchilik, seans nomlari (toza).
- Create `components/media/media-queries.ts` — React Query hooklari.
- Create `components/media/media-pleyer.ts` (+ `.test.ts`) — player holati (toza funksiyalar + zustand store + `useNavbat`, `useJoriyMi`).
- Create `components/media/media-pleyer-panel.tsx` — pastki player paneli, yagona `<audio>`.
- Create `components/media/media-ovoz-tugmasi.tsx` — qatordagi karnay tugmasi.
- Modify `components/media/media-inhalt-utils.ts` (+ test) — `bolimNavbati`.
- Modify `components/media/media-inhalt-panel.tsx` — umumiy player, «Ko'lam» yo'q, dialog qatorlari ovozi.
- Create `components/media/media-seans.ts` (+ `.test.ts`) — `kalitla`, `seansGuruhlari`, `seansNavbati`.
- Modify `components/media/media-fragen-panel.tsx` — faqat `SavolQatori` (umumiy player bilan) qoladi.
- Modify `components/media/media-fragen-types.ts` — `KalitliFrage`, `LessonFragen`.
- Create `components/media/media-seans-panel.tsx` — seans sahifasi.
- Create `components/media/media-daraxt-view.tsx` — daraxt komponenti.
- Modify `components/media/media-client.tsx` — yangi sahifa qobig'i.
- Create `components/media/media-sinov-qatlami.tsx` — sinov qatlami.
- Modify `app/(dashboard)/media/sections/[id]/page.tsx` — `redirect`.
- Delete `components/media/media-coverage-section.tsx`, `media-coverage-utils.ts`, `media-coverage-utils.test.ts`, `section-detail-client.tsx`, `section-detail-utils.ts`, `section-detail-utils.test.ts`.
- Modify `components/student-portal/lernen/queries.ts` — `korik` hooklari.
- Modify `components/student-portal/lernen/uebung/seans-ekrani.tsx` — `manba: "korik"`.
- Modify `components/student-portal/lernen/uebung/pastki-panel.tsx` — `sidebarMode: SidebarMode | null`.
- Modify `i18n/i18n-coverage.test.ts`, `i18n/dictionaries/{ru,de,en}.ts`.

---

### Task 0: Worktree tayyorlash

- [ ] **Step 1: Bog'liqliklarni o'rnatish**

```bash
npm --prefix server install
npm --prefix client install
```

- [ ] **Step 2: Prisma client**

```bash
cd server && npx prisma generate
```

- [ ] **Step 3: Boshlang'ich holat yashilligini tekshirish**

```bash
cd server && npx jest src/daf/uebung/uebung.service.spec.ts src/daf/media src/daf/daf-media.controller.spec.ts
cd client && npx vitest run src/components/media
```
Kutiladi: hammasi PASS. Qizil bo'lsa — to'xta va xabar ber (bu reja sababi emas).

---

### Task 1: `UebungService` o'quvchisiz rejim

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts` (`seans` ~346, `ersatz` ~427, `baueKandidaten` ~835, `pruefen` ~1430, `juft` ~1661)
- Test: `server/src/daf/uebung/uebung.service.spec.ts` (fayl oxiriga yangi `describe`)

**Interfaces:**
- Produces:
  - `seans(lessonId: number, studentId: number | null, rnd?: () => number): Promise<PublicFrage[]>`
  - `ersatz(lessonId: number, studentId: number | null, itemType, itemId, nichtFormat, rnd?): Promise<PublicFrage | null>`
  - `pruefen(input: PruefenInput, ctx: PruefenContext | null): Promise<PruefenErgebnis>` — `ctx === null` bo'lsa hech narsa yozmaydi.
  - `juft(input: JuftInput, ctx: PruefenContext | null): Promise<{ isCorrect: boolean }>` — xuddi shunday.
  - `vorschauKandidaten(lessonId: number): Promise<{ kind: string | null; laenge: number; fragen: Frage[] }>`

- [ ] **Step 1: Failing testlarni yozish** — `uebung.service.spec.ts` oxiriga:

```ts
describe("UebungService — /media ko'rigi (o'quvchisiz)", () => {
  it("seans(lessonId, null) o'quvchi holatini o'qimaydi", async () => {
    const prisma = fakePrisma();
    const fragen = await new UebungService(prisma as any).seans(
      100,
      null,
      mulberry32(1),
    );
    expect(fragen.length).toBeGreaterThan(0);
    expect(prisma.dafLexemeState.findMany).not.toHaveBeenCalled();
  });

  it('vorschauKandidaten seans tanlay oladigan har savolni o\'z ichiga oladi', async () => {
    const prisma = fakePrisma();
    const service = new UebungService(prisma as any);
    const { kind, laenge, fragen } = await service.vorschauKandidaten(100);
    expect(kind).toBe('SECTION_A');
    expect(laenge).toBe(12);
    // PAAR/ZUORDNEN to'rtlik/oltilikni tasodifiy tanlaydi — `itemId`
    // ularda to'plamning birinchi elementi, shuning uchun solishtirilmaydi.
    const juftsiz = (f: { format: string }) =>
      f.format !== 'PAAR' && f.format !== 'ZUORDNEN';
    const kalitlar = new Set(
      fragen
        .filter(juftsiz)
        .map((f) => `${f.format}:${f.itemType}:${f.itemId}`),
    );
    for (const seed of [1, 2, 3, 4, 5]) {
      const seans = await service.seans(100, null, mulberry32(seed));
      for (const f of seans.filter(juftsiz)) {
        expect(kalitlar).toContain(`${f.format}:${f.itemType}:${f.itemId}`);
      }
    }
  });

  it("pruefen(input, null) javobni tekshiradi, hech narsa yozmaydi", async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'salom' },
      null,
    );
    expect(r.isCorrect).toBe(true);
    expect(prisma.dafAttempt.create).not.toHaveBeenCalled();
    expect(prisma.dafLexemeState.upsert).not.toHaveBeenCalled();
    expect(prisma.dafSession.create).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("juft(input, null) juftni tekshiradi, hech narsa yozmaydi", async () => {
    const prisma = fakePrisma();
    prisma.dafLexeme.findUnique = jest.fn(async () => ({
      id: 5,
      de: 'das Haus',
      uz: 'uy',
      artikel: 'das',
      unitId: 1,
    })) as any;
    prisma.dafLexeme.findMany = jest.fn(async () => [
      { id: 5, de: 'das Haus', uz: 'uy' },
    ]) as any;
    const r = await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'uy' },
      null,
    );
    expect(r).toEqual({ isCorrect: true });
    expect(prisma.dafAttempt.create).not.toHaveBeenCalled();
    expect(prisma.dafLexemeState.upsert).not.toHaveBeenCalled();
    expect(prisma.dafSession.create).not.toHaveBeenCalled();
  });
});
```

Agar `pruefen` testida `isCorrect` false chiqsa: `ladeMaterial('WORT', 1)` `fakePrisma().dafLexeme.findUnique`dan `uz: 'salom'`ni oladi — `textAntwort('WORT_UZ', …)`ning `richtig` maydoni nima ekanini `richtige-antwort.ts`dan o'qib, `given`ni unga tenglashtir. Maqsad — yozuv yo'qligini tekshirish, javob mantiqini emas.

- [ ] **Step 2: Testlar yiqilishini ko'rish**

Run: `cd server && npx jest src/daf/uebung/uebung.service.spec.ts -t "o'quvchisiz"`
Kutiladi: FAIL — TypeScript `null` turini qabul qilmaydi / `vorschauKandidaten` yo'q.

- [ ] **Step 3: Imzolarni o'zgartirish**

`seans`, `ersatz`, `baueKandidaten` imzolarida `studentId: number,` → `studentId: number | null,`.

`baueKandidaten` ichida (~1074):

```ts
    const pflicht =
      studentId == null
        ? []
        : await this.baueWiederholung(
            studentId,
            coreWords,
            rnd,
            undefined,
            lessonUnit,
          );
```

va (~1089):

```ts
    const letzteZustaende =
      studentId != null && coreWordIds.length
        ? ((await this.prisma.dafLexemeState.findMany({
            where: { studentId, lexemeId: { in: coreWordIds } },
          } as any)) as Array<{ lexemeId: number; lastFormat: string | null }>)
        : [];
```

- [ ] **Step 4: `pruefen` yozuvlarini `ctx` ostiga olish**

Imzo: `async pruefen(input: PruefenInput, ctx: PruefenContext | null)`. `const betroffeneWoerter = …` dan boshlab `aktualisiereZustand`ning `else if (itemType === 'WORT') { … }` bloki oxirigacha (~1546–1600) hammasini bitta blokka o'ra:

```ts
    // `ctx` yo'q — /media sinov rejimi: javob tekshiriladi, hech narsa
    // yozilmaydi (urinish, seans, Leitner holati, ball).
    if (ctx) {
      const betroffeneWoerter = …;   // mavjud kod o'zgarishsiz
      …
      } else if (itemType === 'WORT') {
        await this.aktualisiereZustand(…);
      }
    }
```

Transkript (`HOEREN_WAHL`/`LESEN_WAHL`) qismi va `return`lar blokdan TASHQARIDA qoladi.

- [ ] **Step 5: `juft` yozuvlarini `ctx` ostiga olish**

Imzo: `async juft(input: JuftInput, ctx: PruefenContext | null)`. `let points = 0;` dan Leitner blokining oxirigacha (~1750–1802) `if (ctx) { … }` ichiga ol. `return { isCorrect };` tashqarida.

- [ ] **Step 6: `vorschauKandidaten` qo'shish** — `ersatz` metodidan keyin:

```ts
  /**
   * /media seans sahifasi uchun: shu darsdan dvigatel quradigan BARCHA
   * nomzodlar, o'quvchi tarixisiz. `seans()` aynan shu ro'yxatdan
   * tanlaydi — ro'yxatning alohida nusxa qoidasi yo'q.
   */
  async vorschauKandidaten(
    lessonId: number,
  ): Promise<{ kind: string | null; laenge: number; fragen: Frage[] }> {
    const natija = await this.baueKandidaten(lessonId, null, Math.random);
    if (!natija) return { kind: null, laenge: SEANS_UZUNLIGI, fragen: [] };
    return {
      kind: natija.kind,
      laenge:
        natija.kind === 'UNIT_TEST' ? UNIT_TEST_SAVOLLAR : SEANS_UZUNLIGI,
      fragen: natija.kandidaten,
    };
  }
```

- [ ] **Step 7: Testlar o'tishini ko'rish**

Run: `cd server && npx jest src/daf/uebung`
Kutiladi: PASS (eski testlar ham — o'quvchi yo'li o'zgarmagan).

- [ ] **Step 8: Format, lint, typecheck, commit**

```bash
cd server
npx prettier --write src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts
npx eslint src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts
npm run build
git add src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts
git commit -m "feat(daf): mashq dvigateli o'quvchisiz ishlaydi — /media ko'rigi uchun

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server — seans savollari, sinov endpointlari, coverage'da darslar

**Files:**
- Modify: `server/src/daf/media/daf-media-fragen.service.ts` (+ `.spec.ts`)
- Modify: `server/src/daf/media/daf-media-coverage.service.ts` (+ `.spec.ts`)
- Modify: `server/src/daf/daf-media.controller.ts` (+ `.spec.ts`)
- Modify: `server/src/common/permissions/route-access.snapshot.json`
- Modify: `server/src/common/auth/branch-route-policy.ts` (~847)

**Interfaces:**
- Consumes: `UebungService.vorschauKandidaten`, `seans(id, null)`, `ersatz(id, null, …)`, `pruefen(dto, null)`, `juft(dto, null)` (Task 1).
- Produces (HTTP, hammasi `@Can('media.view')`):
  - `GET /daf/media/lessons/:id/fragen` → `LessonFragen { kind: string | null; laenge: number; bevorzugt: FrageFormat[]; fragen: VorschauFrage[] }`
  - `GET /daf/media/lessons/:id/sinov` → `PublicFrage[]`
  - `GET /daf/media/lessons/:id/sinov/ersatz?itemType&itemId&nichtFormat` → `PublicFrage | null`
  - `POST /daf/media/sinov/check` (tana `CheckAntwortDto`) → `PruefenErgebnis`
  - `POST /daf/media/sinov/juft` (tana `JuftDto`) → `{ isCorrect }`
  - `GET /daf/media/coverage` — har bo'limda `lessons: MediaLesson[]`, har unitda `unitLessons: MediaLesson[]`; `MediaLesson = { id: number; kind: DafLessonKind; order: number }`.
  - `GET /daf/media/sections/:id/fragen` — O'CHIRILADI.

- [ ] **Step 1: Coverage uchun failing test** — `daf-media-coverage.service.spec.ts`dagi `buildPrismaMock`ga `lessons?: unknown[]` opsiyasi va `dafLesson: { findMany: jest.fn().mockResolvedValue(lessons) }` qo'sh (sukut `[]`). Yangi test:

```ts
  it("darslarni bo'limga, bo'limsizini unitga bog'laydi", async () => {
    const prisma = buildPrismaMock({
      units: [{ id: 1, level: 'A1', order: 1, code: 'u01', titleUz: 'Tanishuv' }],
      sections: [
        { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Salomlashish' },
      ],
      lessons: [
        { id: 101, unitId: 1, sectionId: 10, kind: 'SECTION_A', order: 1 },
        { id: 102, unitId: 1, sectionId: 10, kind: 'SECTION_B', order: 2 },
        { id: 199, unitId: 1, sectionId: null, kind: 'UNIT_TEST', order: 9 },
      ],
    });
    const { levels } = await new DafMediaCoverageService(prisma).coverage();
    const unit = levels[0].units[0];
    expect(unit.sections[0].lessons).toEqual([
      { id: 101, kind: 'SECTION_A', order: 1 },
      { id: 102, kind: 'SECTION_B', order: 2 },
    ]);
    expect(unit.unitLessons).toEqual([{ id: 199, kind: 'UNIT_TEST', order: 9 }]);
  });
```

Run: `cd server && npx jest src/daf/media/daf-media-coverage.service.spec.ts` → FAIL.

- [ ] **Step 2: Coverage'ni kengaytirish** — `daf-media-coverage.service.ts`:

Importga `DafLessonKind` qo'sh (`import { DafLessonKind, DafLevel } from '@prisma/client';`). Interfeyslar:

```ts
/** Seans — o'quvchi yo'lidagi bitta dars (Tanishuv, Ishlatish, …). */
export interface MediaLesson {
  id: number;
  kind: DafLessonKind;
  order: number;
}
```

`MediaSectionCoverage`ga `lessons: MediaLesson[];`, `MediaUnitCoverage`ga `unitLessons: MediaLesson[];`.

`Promise.all` ro'yxatiga (oxiriga) qo'sh va destrukturlashga `lessons` nomi bilan:

```ts
      this.prisma.dafLesson.findMany({
        where: { kind: { not: null } },
        orderBy: { order: 'asc' },
        select: { id: true, unitId: true, sectionId: true, kind: true, order: true },
      }),
```

Bo'limlarni qurishdan oldin:

```ts
    const lessonsBySection = new Map<number, MediaLesson[]>();
    const lessonsByUnit = new Map<number, MediaLesson[]>();
    for (const l of lessons) {
      if (l.kind === null) continue;
      const row: MediaLesson = { id: l.id, kind: l.kind, order: l.order };
      const map = l.sectionId === null ? lessonsByUnit : lessonsBySection;
      const key = l.sectionId ?? l.unitId;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
```

Bo'lim qatoriga `lessons: lessonsBySection.get(s.id) ?? [],`, unit qatoriga `unitLessons: lessonsByUnit.get(u.id) ?? [],`.

Run: `npx jest src/daf/media/daf-media-coverage.service.spec.ts` → PASS (eski testlar ham — ular `toEqual` bilan butun qatorni solishtirsa, kutilgan obyektga `lessons: []` / `unitLessons: []` qo'sh).

- [ ] **Step 3: `DafMediaFragenService` — nusxa qoida o'rniga dvigatel**

`daf-media-fragen.service.ts`ni quyidagiga almashtir (`VorschauFrage` va `toVorschau` saqlanadi; `fragen(sectionId)` va undagi hamma material yuklash/qurish kodi o'chadi):

```ts
import { Injectable } from '@nestjs/common';
import type { Frage, FrageFormat } from '../uebung/frage.types';
import { bevorzugteFormate } from '../uebung/kind-formate';
import { UebungService } from '../uebung/uebung.service';

/**
 * `GET /daf/media/lessons/:id/fragen` javobidagi savol — TO'G'RI JAVOB
 * BILAN. `/media` CEO/Filial direktori/Administrator bilan cheklangan.
 */
export interface VorschauFrage {
  // … mavjud maydonlar o'zgarishsiz …
}

export interface LessonFragen {
  kind: string | null;
  /** Bitta seansda nechta savol beriladi (12, yakuniy sinovda 15). */
  laenge: number;
  /** Shu seans turida oldinroq chiqadigan formatlar. */
  bevorzugt: FrageFormat[];
  fragen: VorschauFrage[];
}

function toVorschau(f: Frage): VorschauFrage {
  // … mavjud funksiya o'zgarishsiz …
}

/**
 * Seans sahifasining savollari — dvigatelning O'ZI quradigan nomzodlar
 * (`UebungService.vorschauKandidaten`). Avval bu xizmat dvigatel
 * qoidasining nusxasini saqlardi; nusxa vaqt o'tib farqlanadi.
 */
@Injectable()
export class DafMediaFragenService {
  constructor(private readonly uebung: UebungService) {}

  async lessonFragen(lessonId: number): Promise<LessonFragen> {
    const { kind, laenge, fragen } =
      await this.uebung.vorschauKandidaten(lessonId);
    return {
      kind,
      laenge,
      bevorzugt: bevorzugteFormate(kind),
      fragen: fragen.map(toVorschau),
    };
  }
}
```

`daf-media-fragen.service.spec.ts`ni quyidagiga almashtir:

```ts
import { DafMediaFragenService } from './daf-media-fragen.service';

describe('DafMediaFragenService.lessonFragen', () => {
  it("dvigatel nomzodlarini to'g'ri javobi va afzal formatlari bilan beradi", async () => {
    const uebung = {
      vorschauKandidaten: jest.fn().mockResolvedValue({
        kind: 'SECTION_A',
        laenge: 12,
        fragen: [
          {
            format: 'WORT_UZ',
            itemType: 'WORT',
            itemId: 1,
            prompt: 'hallo',
            hilfe: null,
            options: ['salom', 'rahmat'],
            richtig: 'salom',
            titel: null,
            audioUrl: null,
            belegteItems: ['WORT:1'],
          },
        ],
      }),
    };
    const r = await new DafMediaFragenService(uebung as any).lessonFragen(100);
    expect(uebung.vorschauKandidaten).toHaveBeenCalledWith(100);
    expect(r.kind).toBe('SECTION_A');
    expect(r.laenge).toBe(12);
    expect(r.bevorzugt).toContain('WORT_UZ');
    expect(r.fragen[0]).toMatchObject({ richtig: 'salom', bildUrl: null, uhrzeit: null });
    expect(r.fragen[0]).not.toHaveProperty('belegteItems');
  });
});
```

`grep -rn "DafMediaFragenService\|daf-media-fragen" server/src` — `frage-format-parity.spec.ts` uni ishlatsa, o'qib chiq: agar u eski nusxa qoidaning formatlar ro'yxatini tekshirgan bo'lsa, endi nusxa yo'q — o'sha tekshiruvni olib tashla, fayl bo'sh qolsa o'chir.

Run: `npx jest src/daf/media` → PASS.

- [ ] **Step 4: Controller — failing test** — `daf-media.controller.spec.ts`:
  - providers'ga `{ provide: UebungService, useValue: uebungService }` qo'sh, bunda:

```ts
  const uebungService = {
    seans: jest.fn().mockResolvedValue([]),
    ersatz: jest.fn().mockResolvedValue(null),
    pruefen: jest.fn().mockResolvedValue({ isCorrect: true, richtig: 'x' }),
    juft: jest.fn().mockResolvedValue({ isCorrect: true }),
  };
```
  - `fragenService`ni `{ lessonFragen: jest.fn().mockResolvedValue({ kind: null, laenge: 12, bevorzugt: [], fragen: [] }) }` ga almashtir.
  - marker testidagi metodlar ro'yxati: `['coverage', 'overview', 'inhalt', 'jang', 'lessonFragen', 'sinov', 'sinovErsatz', 'sinovCheck', 'sinovJuft']`.
  - eski `fragen()` delegatsiya testi o'rniga:

```ts
  it("sinov endpointlari o'quvchisiz (null) chaqiradi", async () => {
    await controller.sinov(100);
    expect(uebungService.seans).toHaveBeenCalledWith(100, null);
    await controller.sinovErsatz(100, {
      itemType: 'WORT',
      itemId: 1,
      nichtFormat: 'WORT_UZ',
    } as any);
    expect(uebungService.ersatz).toHaveBeenCalledWith(100, null, 'WORT', 1, 'WORT_UZ');
    await controller.sinovCheck({ itemType: 'WORT', itemId: 1, format: 'WORT_UZ', given: 'a' } as any);
    expect(uebungService.pruefen).toHaveBeenCalledWith(expect.objectContaining({ given: 'a' }), null);
    await controller.sinovJuft({ itemType: 'WORT', itemId: 1, format: 'PAAR', chap: 'a', ong: 'b' } as any);
    expect(uebungService.juft).toHaveBeenCalledWith(expect.objectContaining({ chap: 'a' }), null);
  });

  it('lessonFragen() DafMediaFragenService.lessonFragen()ga delegatsiya qiladi', async () => {
    await controller.lessonFragen(100);
    expect(fragenService.lessonFragen).toHaveBeenCalledWith(100);
  });
```

Run: `npx jest src/daf/daf-media.controller.spec.ts` → FAIL.

- [ ] **Step 5: Controller**

`daf-media.controller.ts`: importlarga `Body, Post, Query` (`@nestjs/common`), `UebungService` (`./uebung/uebung.service`), `CheckAntwortDto, ErsatzQueryDto, JuftDto` (`./dto/uebung.dto`), `type LessonFragen` qo'sh. Konstruktorga `private readonly uebung: UebungService`. `fragen()` metodini o'chir, o'rniga:

```ts
  /** Seansdan chiqishi mumkin bo'lgan BARCHA savollar — to'g'ri javobi bilan. */
  @Get('lessons/:id/fragen')
  lessonFragen(@Param('id', ParseIntPipe) id: number): Promise<LessonFragen> {
    return this.fragenService.lessonFragen(id);
  }

  /**
   * «O'quvchi kabi o'tib ko'rish»: o'quvchi seansining o'zi, lekin
   * o'quvchisiz — `null` bilan hech narsa o'qilmaydi va yozilmaydi.
   */
  @Get('lessons/:id/sinov')
  sinov(@Param('id', ParseIntPipe) id: number) {
    return this.uebung.seans(id, null);
  }

  @Get('lessons/:id/sinov/ersatz')
  sinovErsatz(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ErsatzQueryDto,
  ) {
    return this.uebung.ersatz(id, null, query.itemType, query.itemId, query.nichtFormat);
  }

  @Post('sinov/check')
  sinovCheck(@Body() dto: CheckAntwortDto) {
    return this.uebung.pruefen(dto, null);
  }

  @Post('sinov/juft')
  sinovJuft(@Body() dto: JuftDto) {
    return this.uebung.juft(dto, null);
  }
```

`ErsatzQueryDto` maydon nomlarini `server/src/daf/dto/uebung.dto.ts:144`dan tekshir — o'quvchi controlleri (`daf-portal.controller.ts:165`) bilan bir xil ishlat.

Run: `npx jest src/daf/daf-media.controller.spec.ts` → PASS.

- [ ] **Step 6: Marshrut manifestlari**

`route-access.snapshot.json`: `"GET /daf/media/sections/:id/fragen"` qatorini o'chir; alifbo tartibida qo'sh (har biri `["Administrator", "Branch Director", "CEO"]`):
`"GET /daf/media/lessons/:id/fragen"`, `"GET /daf/media/lessons/:id/sinov"`, `"GET /daf/media/lessons/:id/sinov/ersatz"`, `"POST /daf/media/sinov/check"`, `"POST /daf/media/sinov/juft"`.

`branch-route-policy.ts` (~847) `routes` ro'yxatida `'GET /daf/media/sections/:id/fragen'` o'rniga shu besh marshrutni qo'sh; `reason` matniga bitta gap qo'sh: `'The «o\'tib ko\'rish» routes build and check a session with no student: nothing is read from or written to any student or branch. '`.

Run:
```bash
npx jest src/common/permissions src/common/auth
```
Agar `permission-allowed-roles.spec.ts` `media.view`ning POST COMPANY_WIDE yozuvini rad etsa, `REVIEWED_COMPANY_WIDE_WRITES`ga qo'sh:
```ts
  'media.view':
    "POST /daf/media/sinov/check and /juft only check an answer for the /media preview; they write nothing.",
```
va qayta ishga tushir → PASS.

- [ ] **Step 7: Format, lint, build, commit**

```bash
npx prettier --write src/daf/media/daf-media-fragen.service.ts src/daf/media/daf-media-fragen.service.spec.ts src/daf/media/daf-media-coverage.service.ts src/daf/media/daf-media-coverage.service.spec.ts src/daf/daf-media.controller.ts src/daf/daf-media.controller.spec.ts src/common/auth/branch-route-policy.ts src/common/permissions/permission-allowed-roles.spec.ts
npx eslint src/daf src/common/auth/branch-route-policy.ts src/common/permissions --quiet
npm run build
npx jest src/daf src/common/permissions src/common/auth
git add -A src
git commit -m "feat(media): seans savollari, o'quvchisiz sinov endpointlari, qamrovda darslar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — ma'lumot qatlami va daraxt mantiqi

**Files:**
- Modify: `client/src/components/media/media-coverage-types.ts`
- Modify: `client/src/components/media/media-fragen-types.ts`
- Create: `client/src/components/media/media-queries.ts`
- Create: `client/src/components/media/media-daraxt.ts`
- Test: `client/src/components/media/media-daraxt.test.ts`

**Interfaces:**
- Consumes: Task 2 HTTP javoblari.
- Produces:
  - `type MediaLessonKind = "SECTION_A" | "SECTION_B" | "BRIDGE" | "UNIT_TEST"`; `interface MediaLesson { id; kind; order }`
  - `type Tanlov = { tur: "bolim"; id: number } | { tur: "seans"; id: number }`
  - `tanlovniOqi(get: (k: string) => string | null): Tanlov | null`
  - `tanlovParamlari(t: Tanlov): string` → `"bolim=12"` / `"seans=101"`
  - `boshlangichTanlov(levels: MediaLevelCoverage[]): Tanlov | null`
  - `bolimJoyi(levels, sectionId): { unit: MediaUnitCoverage; section: MediaSectionCoverage } | null`
  - `interface SeansJoyi { unit: MediaUnitCoverage; section: MediaSectionCoverage | null; lesson: MediaLesson }`
  - `seansJoyi(levels, lessonId): SeansJoyi | null`
  - `tanlovUnitId(levels, tanlov): number | null`
  - `kamchilik(section): { ovoz: number; rasm: number }`
  - `SEANS_NOMLARI: Record<MediaLessonKind, string>` (`msg()`)
  - `useMediaCoverage()`, `useSectionInhalt(sectionId)`, `useLessonFragen(lessonId)`
  - `interface LessonFragen { kind: MediaLessonKind | null; laenge: number; bevorzugt: FrageFormat[]; fragen: VorschauFrage[] }`, `interface KalitliFrage extends VorschauFrage { kalit: string }`

- [ ] **Step 1: Turlar**

`media-coverage-types.ts`ga:

```ts
/** Seans — o'quvchi yo'lidagi bitta dars. */
export type MediaLessonKind = "SECTION_A" | "SECTION_B" | "BRIDGE" | "UNIT_TEST";

export interface MediaLesson {
  id: number;
  kind: MediaLessonKind;
  order: number;
}
```

`MediaSectionCoverage`ga `lessons: MediaLesson[];`, `MediaUnitCoverage`ga `unitLessons: MediaLesson[];`.

`media-fragen-types.ts`ga:

```ts
import type { MediaLessonKind } from "./media-coverage-types";

/** `GET /daf/media/lessons/:id/fragen` javobi. */
export interface LessonFragen {
  kind: MediaLessonKind | null;
  /** Bitta seansda beriladigan savollar soni. */
  laenge: number;
  /** Shu seans turida oldinroq chiqadigan formatlar. */
  bevorzugt: FrageFormat[];
  fragen: VorschauFrage[];
}

/** Ekrandagi savol + player navbatidagi barqaror kaliti. */
export interface KalitliFrage extends VorschauFrage {
  kalit: string;
}
```

- [ ] **Step 2: Failing test** — `media-daraxt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MediaLevelCoverage, MediaSectionCoverage } from "./media-coverage-types";
import {
  boshlangichTanlov,
  bolimJoyi,
  kamchilik,
  seansJoyi,
  tanlovParamlari,
  tanlovUnitId,
  tanlovniOqi,
} from "./media-daraxt";

function bolim(id: number, lessons: MediaSectionCoverage["lessons"] = []): MediaSectionCoverage {
  return {
    sectionId: id,
    code: `s${id}`,
    order: id,
    titleUz: `B${id}`,
    words: { total: 10, withAudio: 7, pictureEligible: 4, withImage: 1 },
    sentences: { total: 5, withAudio: 5 },
    phrases: { total: 2, withAudio: 1 },
    dialogLines: { total: 4, withAudio: 3 },
    lessons,
  };
}

const levels: MediaLevelCoverage[] = [
  {
    level: "A1",
    units: [
      { unitId: 1, code: "u01", order: 1, titleUz: "Bo'sh", sections: [], unitLessons: [] },
      {
        unitId: 2,
        code: "u02",
        order: 2,
        titleUz: "Oila",
        sections: [bolim(20, [{ id: 201, kind: "SECTION_A", order: 1 }]), bolim(21)],
        unitLessons: [{ id: 299, kind: "UNIT_TEST", order: 9 }],
      },
    ],
  },
];

describe("tanlovniOqi", () => {
  const get = (q: Record<string, string>) => (k: string) => q[k] ?? null;
  it("bolim va seansni o'qiydi", () => {
    expect(tanlovniOqi(get({ bolim: "20" }))).toEqual({ tur: "bolim", id: 20 });
    expect(tanlovniOqi(get({ seans: "201" }))).toEqual({ tur: "seans", id: 201 });
  });
  it("seans bolimdan ustun, yaroqsiz qiymat — null", () => {
    expect(tanlovniOqi(get({ bolim: "20", seans: "201" }))).toEqual({ tur: "seans", id: 201 });
    expect(tanlovniOqi(get({ bolim: "abc" }))).toBeNull();
    expect(tanlovniOqi(get({}))).toBeNull();
  });
});

describe("tanlovParamlari", () => {
  it("bitta kalit yozadi", () => {
    expect(tanlovParamlari({ tur: "bolim", id: 20 })).toBe("bolim=20");
    expect(tanlovParamlari({ tur: "seans", id: 201 })).toBe("seans=201");
  });
});

describe("joylar", () => {
  it("boshlang'ich tanlov — bo'limi bor birinchi unitning birinchi bo'limi", () => {
    expect(boshlangichTanlov(levels)).toEqual({ tur: "bolim", id: 20 });
    expect(boshlangichTanlov([])).toBeNull();
  });
  it("bo'lim va seansni topadi, unit darajasidagi seansni ham", () => {
    expect(bolimJoyi(levels, 21)?.unit.unitId).toBe(2);
    expect(bolimJoyi(levels, 999)).toBeNull();
    expect(seansJoyi(levels, 201)?.section?.sectionId).toBe(20);
    const test = seansJoyi(levels, 299);
    expect(test?.section).toBeNull();
    expect(test?.lesson.kind).toBe("UNIT_TEST");
    expect(seansJoyi(levels, 999)).toBeNull();
  });
  it("tanlov unitini beradi", () => {
    expect(tanlovUnitId(levels, { tur: "bolim", id: 21 })).toBe(2);
    expect(tanlovUnitId(levels, { tur: "seans", id: 299 })).toBe(2);
    expect(tanlovUnitId(levels, null)).toBeNull();
  });
});

describe("kamchilik", () => {
  it("ovozsiz va rasmsiz elementlarni sanaydi", () => {
    // ovoz: so'z 3 + gap 0 + ibora 1 + dialog 1 = 5; rasm: 4 - 1 = 3
    expect(kamchilik(bolim(1))).toEqual({ ovoz: 5, rasm: 3 });
  });
});
```

Run: `cd client && npx vitest run src/components/media/media-daraxt.test.ts` → FAIL (modul yo'q).

- [ ] **Step 3: `media-daraxt.ts`**

```ts
import { msg } from "@/i18n/msg";
import type {
  MediaLesson,
  MediaLessonKind,
  MediaLevelCoverage,
  MediaSectionCoverage,
  MediaUnitCoverage,
} from "./media-coverage-types";

/** /media'da nima ochiq: bo'lim materiali yoki seans savollari. */
export type Tanlov = { tur: "bolim"; id: number } | { tur: "seans"; id: number };

/** O'quvchi ilovasidagi seans nomlari bilan bir xil. */
export const SEANS_NOMLARI: Record<MediaLessonKind, string> = {
  SECTION_A: msg("Tanishuv"),
  SECTION_B: msg("Ishlatish"),
  BRIDGE: msg("O'tish sinovi"),
  UNIT_TEST: msg("Yakuniy sinov"),
};

function butunSon(v: string | null): number | null {
  if (!v || !/^\d+$/.test(v)) return null;
  return Number(v);
}

/** Manzildan tanlov. `seans` ham, `bolim` ham bo'lsa — seans. */
export function tanlovniOqi(get: (k: string) => string | null): Tanlov | null {
  const seans = butunSon(get("seans"));
  if (seans !== null) return { tur: "seans", id: seans };
  const bolim = butunSon(get("bolim"));
  if (bolim !== null) return { tur: "bolim", id: bolim };
  return null;
}

export function tanlovParamlari(t: Tanlov): string {
  return `${t.tur}=${t.id}`;
}

function barchaUnitlar(levels: MediaLevelCoverage[]): MediaUnitCoverage[] {
  return levels.flatMap((l) => l.units);
}

export function boshlangichTanlov(levels: MediaLevelCoverage[]): Tanlov | null {
  const unit = barchaUnitlar(levels).find((u) => u.sections.length > 0);
  return unit ? { tur: "bolim", id: unit.sections[0].sectionId } : null;
}

export function bolimJoyi(
  levels: MediaLevelCoverage[],
  sectionId: number,
): { unit: MediaUnitCoverage; section: MediaSectionCoverage } | null {
  for (const unit of barchaUnitlar(levels)) {
    const section = unit.sections.find((s) => s.sectionId === sectionId);
    if (section) return { unit, section };
  }
  return null;
}

export interface SeansJoyi {
  unit: MediaUnitCoverage;
  /** `null` — unit darajasidagi seans (yakuniy sinov). */
  section: MediaSectionCoverage | null;
  lesson: MediaLesson;
}

export function seansJoyi(levels: MediaLevelCoverage[], lessonId: number): SeansJoyi | null {
  for (const unit of barchaUnitlar(levels)) {
    for (const section of unit.sections) {
      const lesson = section.lessons.find((l) => l.id === lessonId);
      if (lesson) return { unit, section, lesson };
    }
    const lesson = unit.unitLessons.find((l) => l.id === lessonId);
    if (lesson) return { unit, section: null, lesson };
  }
  return null;
}

export function tanlovUnitId(levels: MediaLevelCoverage[], tanlov: Tanlov | null): number | null {
  if (!tanlov) return null;
  const joy = tanlov.tur === "bolim" ? bolimJoyi(levels, tanlov.id) : seansJoyi(levels, tanlov.id);
  return joy?.unit.unitId ?? null;
}

/** Bo'limda nechta element ovozsiz va nechta rasm chiziladigan so'z rasmsiz. */
export function kamchilik(s: MediaSectionCoverage): { ovoz: number; rasm: number } {
  const yoq = (c: { total: number; withAudio: number }) => c.total - c.withAudio;
  return {
    ovoz: yoq(s.words) + yoq(s.sentences) + yoq(s.phrases) + yoq(s.dialogLines),
    rasm: s.words.pictureEligible - s.words.withImage,
  };
}
```

- [ ] **Step 4: `media-queries.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { MediaCoverageOverview } from "./media-coverage-types";
import type { LessonFragen } from "./media-fragen-types";
import type { SectionInhalt } from "./media-inhalt-types";

export function useMediaCoverage() {
  return useQuery({
    queryKey: ["media-coverage"],
    queryFn: () => api.get<MediaCoverageOverview>("/daf/media/coverage").then((r) => r.data),
  });
}

export function useSectionInhalt(sectionId: number) {
  return useQuery({
    queryKey: ["media-inhalt", sectionId],
    queryFn: () =>
      api.get<SectionInhalt>(`/daf/media/sections/${sectionId}/inhalt`).then((r) => r.data),
  });
}

/**
 * `staleTime: Infinity` — ro'yxat har so'rovda variantlarni boshqacha
 * aralashtiradi; qayta yuklansa sahifa ko'z oldida "o'zgarib" qolardi.
 */
export function useLessonFragen(lessonId: number) {
  return useQuery({
    queryKey: ["media-lesson-fragen", lessonId],
    queryFn: () =>
      api.get<LessonFragen>(`/daf/media/lessons/${lessonId}/fragen`).then((r) => r.data),
    staleTime: Infinity,
  });
}
```

- [ ] **Step 5: Test o'tishi**

Run: `npx vitest run src/components/media/media-daraxt.test.ts` → PASS.
Run: `npx tsc --noEmit -p .` — `media-coverage-section.tsx` va boshqa eski fayllar yangi majburiy maydonlar sabab yiqilishi mumkin; ular Task 7da o'chadi. Hozircha faqat yangi fayllarda xato yo'qligini tekshir.

- [ ] **Step 6: Commit**

```bash
git add src/components/media/media-coverage-types.ts src/components/media/media-fragen-types.ts src/components/media/media-queries.ts src/components/media/media-daraxt.ts src/components/media/media-daraxt.test.ts
git commit -m "feat(media): daraxt mantiqi, so'rovlar va turlar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — umumiy player

**Files:**
- Create: `client/src/components/media/media-pleyer.ts`
- Test: `client/src/components/media/media-pleyer.test.ts`
- Create: `client/src/components/media/media-pleyer-panel.tsx`
- Create: `client/src/components/media/media-ovoz-tugmasi.tsx`

**Interfaces:**
- Produces:
  - `interface PleyerElement { id: string; url: string; nom: string }`
  - `interface PleyerHolati { navbat: PleyerElement[]; joriyId: string | null; ketmaKet: boolean; tezlik: 1 | 0.8; ijroda: boolean; amal: { tur: "qoy" | "almashtir" | "toxtat"; n: number } }`
  - toza: `navbatniOrnat(h, navbat)`, `qoy(h, id)`, `almashtir(h)`, `siljit(h, qadam: 1 | -1)`, `tugadi(h)`, `toxtat(h)`
  - `useMediaPleyer` (zustand) — holat + `ornat(navbat)`, `qoyId(id)`, `almashtirish()`, `keyingi()`, `oldingi()`, `tugashi()`, `toxtatish()`, `setIjroda(b)`, `setKetmaKet(b)`, `setTezlik(t)`
  - `useNavbat(navbat: PleyerElement[])` — panel ochiq turganda navbatni o'rnatadi, yopilganda bo'shatadi
  - `useJoriyMi(id: string): boolean`
  - `<MediaOvozTugmasi id={string} />`, `<MediaPleyerPanel />`

- [ ] **Step 1: Failing test** — `media-pleyer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BOSH_HOLAT,
  almashtir,
  navbatniOrnat,
  qoy,
  siljit,
  toxtat,
  tugadi,
  type PleyerHolati,
} from "./media-pleyer";

const navbat = [
  { id: "a", url: "/a.mp3", nom: "A" },
  { id: "b", url: "/b.mp3", nom: "B" },
  { id: "c", url: "/c.mp3", nom: "C" },
];
const h0: PleyerHolati = navbatniOrnat(BOSH_HOLAT, navbat);

describe("media player holati", () => {
  it("qoy — tanlangan element joriy bo'ladi va buyruq beradi", () => {
    const h = qoy(h0, "b");
    expect(h.joriyId).toBe("b");
    expect(h.amal.tur).toBe("qoy");
    expect(h.amal.n).toBe(h0.amal.n + 1);
  });
  it("navbatda yo'q id — holat o'zgarmaydi", () => {
    expect(qoy(h0, "z")).toBe(h0);
  });
  it("siljit — oxiridan keyin to'xtaydi, boshidan oldin birinchida qoladi", () => {
    expect(siljit(qoy(h0, "c"), 1).joriyId).toBeNull();
    expect(siljit(qoy(h0, "a"), -1).joriyId).toBe("a");
    expect(siljit(qoy(h0, "a"), 1).joriyId).toBe("b");
  });
  it("tugadi — ketma-ket rejimida keyingisiga o'tadi, aks holda joyida", () => {
    const h = qoy(h0, "a");
    expect(tugadi({ ...h, ketmaKet: true }).joriyId).toBe("b");
    expect(tugadi(h).joriyId).toBe("a");
    expect(tugadi(h).amal).toBe(h.amal);
  });
  it("navbat o'zgarsa to'xtaydi; o'sha navbat qayta berilsa — holat o'zgarmaydi", () => {
    const h = qoy(h0, "b");
    expect(navbatniOrnat(h, [...navbat])).toBe(h);
    const yangi = navbatniOrnat(h, navbat.slice(0, 1));
    expect(yangi.joriyId).toBeNull();
    expect(yangi.amal.tur).toBe("toxtat");
  });
  it("almashtir va toxtat buyruq beradi", () => {
    expect(almashtir(qoy(h0, "a")).amal.tur).toBe("almashtir");
    expect(almashtir(h0)).toBe(h0);
    expect(toxtat(qoy(h0, "a")).joriyId).toBeNull();
  });
});
```

Run: `npx vitest run src/components/media/media-pleyer.test.ts` → FAIL.

- [ ] **Step 2: `media-pleyer.ts`**

```ts
import * as React from "react";
import { create } from "zustand";

/** Navbatdagi bitta ovoz: so'z, gap, dialog yoki savol. */
export interface PleyerElement {
  id: string;
  url: string;
  nom: string;
}

export interface PleyerHolati {
  navbat: PleyerElement[];
  joriyId: string | null;
  ketmaKet: boolean;
  tezlik: 1 | 0.8;
  /** `<audio>` hozir chalyaptimi — panel hodisalardan yozadi. */
  ijroda: boolean;
  /** Panelga buyruq; `n` har safar o'sadi, shu bilan bir xil buyruq ham qayta ishlaydi. */
  amal: { tur: "qoy" | "almashtir" | "toxtat"; n: number };
}

export const BOSH_HOLAT: PleyerHolati = {
  navbat: [],
  joriyId: null,
  ketmaKet: false,
  tezlik: 1,
  ijroda: false,
  amal: { tur: "toxtat", n: 0 },
};

const buyruq = (h: PleyerHolati, tur: PleyerHolati["amal"]["tur"]) => ({ tur, n: h.amal.n + 1 });

export function navbatniOrnat(h: PleyerHolati, navbat: PleyerElement[]): PleyerHolati {
  const bir = navbat.length === h.navbat.length && navbat.every((e, i) => e.id === h.navbat[i].id);
  if (bir) return h;
  return { ...h, navbat, joriyId: null, amal: buyruq(h, "toxtat") };
}

export function qoy(h: PleyerHolati, id: string): PleyerHolati {
  if (!h.navbat.some((e) => e.id === id)) return h;
  return { ...h, joriyId: id, amal: buyruq(h, "qoy") };
}

export function almashtir(h: PleyerHolati): PleyerHolati {
  return h.joriyId ? { ...h, amal: buyruq(h, "almashtir") } : h;
}

export function toxtat(h: PleyerHolati): PleyerHolati {
  return { ...h, joriyId: null, amal: buyruq(h, "toxtat") };
}

export function siljit(h: PleyerHolati, qadam: 1 | -1): PleyerHolati {
  const i = h.navbat.findIndex((e) => e.id === h.joriyId);
  if (i < 0) return h.navbat.length ? qoy(h, h.navbat[0].id) : h;
  const j = Math.max(0, i + qadam);
  return j >= h.navbat.length ? toxtat(h) : qoy(h, h.navbat[j].id);
}

export function tugadi(h: PleyerHolati): PleyerHolati {
  return h.ketmaKet ? siljit(h, 1) : h;
}

export function joriyElement(h: PleyerHolati): PleyerElement | null {
  return h.navbat.find((e) => e.id === h.joriyId) ?? null;
}

interface PleyerAmallari {
  ornat: (navbat: PleyerElement[]) => void;
  qoyId: (id: string) => void;
  almashtirish: () => void;
  keyingi: () => void;
  oldingi: () => void;
  tugashi: () => void;
  toxtatish: () => void;
  setIjroda: (b: boolean) => void;
  setKetmaKet: (b: boolean) => void;
  setTezlik: (t: 1 | 0.8) => void;
}

/** /media'dagi YAGONA player: bir vaqtda faqat bitta ovoz chaladi. */
export const useMediaPleyer = create<PleyerHolati & PleyerAmallari>((set) => ({
  ...BOSH_HOLAT,
  ornat: (navbat) => set((h) => navbatniOrnat(h, navbat)),
  qoyId: (id) => set((h) => qoy(h, id)),
  almashtirish: () => set((h) => almashtir(h)),
  keyingi: () => set((h) => siljit(h, 1)),
  oldingi: () => set((h) => siljit(h, -1)),
  tugashi: () => set((h) => tugadi(h)),
  toxtatish: () => set((h) => toxtat(h)),
  setIjroda: (ijroda) => set({ ijroda }),
  setKetmaKet: (ketmaKet) => set({ ketmaKet }),
  setTezlik: (tezlik) => set({ tezlik }),
}));

/** Panel ko'rinib turgan paytdagi navbat; panel yopilsa navbat bo'shaydi. */
export function useNavbat(navbat: PleyerElement[]) {
  const ornat = useMediaPleyer((s) => s.ornat);
  React.useEffect(() => {
    ornat(navbat);
  }, [navbat, ornat]);
  React.useEffect(() => () => ornat([]), [ornat]);
}

export function useJoriyMi(id: string): boolean {
  return useMediaPleyer((s) => s.joriyId === id);
}
```

Run: `npx vitest run src/components/media/media-pleyer.test.ts` → PASS.

- [ ] **Step 3: `media-ovoz-tugmasi.tsx`**

```tsx
"use client";

import { Pause, Volume2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useMediaPleyer } from "./media-pleyer";

/** Qatordagi karnay: umumiy playerni boshqaradi, o'z `<audio>`si yo'q. */
export function MediaOvozTugmasi({ id }: { id: string }) {
  const t = useT();
  const joriy = useMediaPleyer((s) => s.joriyId === id);
  const ijroda = useMediaPleyer((s) => s.joriyId === id && s.ijroda);
  const qoyId = useMediaPleyer((s) => s.qoyId);
  const almashtirish = useMediaPleyer((s) => s.almashtirish);
  return (
    <button
      type="button"
      data-pleyer-id={id}
      onClick={() => (joriy ? almashtirish() : qoyId(id))}
      aria-label={ijroda ? t("Pauza") : t("Eshitish")}
      aria-pressed={joriy}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
        joriy ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {ijroda ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}
```

- [ ] **Step 4: `media-pleyer-panel.tsx`**

```tsx
"use client";

import * as React from "react";
import { Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { formatVaqt } from "@/components/student-portal/lernen/uebung/pleyer-vaqt";
import { joriyElement, useMediaPleyer } from "./media-pleyer";

const TEZLIKLAR = [1, 0.8] as const;

function yozuvMaydonimi(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** /media pastidagi yagona player. Sahifadagi barcha karnaylar shu `<audio>`ni boshqaradi. */
export function MediaPleyerPanel() {
  const t = useT();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const h = useMediaPleyer(
    useShallow((s) => ({
      navbat: s.navbat,
      joriyId: s.joriyId,
      ketmaKet: s.ketmaKet,
      tezlik: s.tezlik,
      ijroda: s.ijroda,
      amal: s.amal,
      ornat: s.ornat,
      qoyId: s.qoyId,
      almashtirish: s.almashtirish,
      keyingi: s.keyingi,
      oldingi: s.oldingi,
      tugashi: s.tugashi,
      setIjroda: s.setIjroda,
      setKetmaKet: s.setKetmaKet,
      setTezlik: s.setTezlik,
    })),
  );
  const joriy = joriyElement(h);
  const [vaqt, setVaqt] = React.useState(0);
  const [davomiylik, setDavomiylik] = React.useState(0);
  const [xato, setXato] = React.useState(false);

  // Buyruqlar: `amal.n` o'zgarganda bajariladi.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (h.amal.tur === "toxtat") {
      a.pause();
      return;
    }
    if (h.amal.tur === "almashtir") {
      if (a.paused) void a.play().catch(() => setXato(true));
      else a.pause();
      return;
    }
    if (!joriy) return;
    setXato(false);
    if (a.src !== new URL(joriy.url, window.location.href).href) a.src = joriy.url;
    a.currentTime = 0;
    a.playbackRate = h.tezlik;
    void a.play().catch(() => setXato(true));
    document
      .querySelector(`[data-pleyer-id="${CSS.escape(joriy.id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Faqat yangi buyruq ishga tushiradi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.amal.n]);

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = h.tezlik;
  }, [h.tezlik]);

  // Klaviatura: bo'sh joy — pauza/davom, ←/→ — 5 soniya. Sinov qatlami ochiq bo'lsa ishlamaydi.
  React.useEffect(() => {
    const bos = (e: KeyboardEvent) => {
      const a = audioRef.current;
      if (!a || !useMediaPleyer.getState().joriyId) return;
      if (yozuvMaydonimi(e.target) || document.body.dataset.mediaSinov === "1") return;
      if (e.key === " ") {
        e.preventDefault();
        useMediaPleyer.getState().almashtirish();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        a.currentTime = Math.max(0, a.currentTime + (e.key === "ArrowRight" ? 5 : -5));
      }
    };
    window.addEventListener("keydown", bos);
    return () => window.removeEventListener("keydown", bos);
  }, []);

  const indeks = joriy ? h.navbat.findIndex((e) => e.id === joriy.id) : -1;

  return (
    <div className="sticky bottom-0 z-10 border-t bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => h.setIjroda(true)}
        onPause={() => h.setIjroda(false)}
        onEnded={() => {
          h.setIjroda(false);
          h.tugashi();
        }}
        onTimeUpdate={(e) => setVaqt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDavomiylik(e.currentTarget.duration)}
        onError={() => setXato(true)}
      />
      {!joriy ? (
        <p className="py-1.5 text-center text-sm text-muted-foreground">
          {t("Eshitish uchun karnayni bosing")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <div className="flex items-center gap-1">
            <button type="button" onClick={h.oldingi} aria-label={t("Oldingisi")} className="rounded-md p-2 hover:bg-muted">
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              onClick={h.almashtirish}
              aria-label={h.ijroda ? t("Pauza") : t("Eshitish")}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              {xato ? <RotateCcw className="size-4" /> : h.ijroda ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button type="button" onClick={h.keyingi} aria-label={t("Keyingisi")} className="rounded-md p-2 hover:bg-muted">
              <SkipForward className="size-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1 basis-40">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{joriy.nom}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {indeks + 1} / {h.navbat.length}
              </span>
            </div>
            {xato ? (
              <p className="text-xs text-destructive">{t("Ovoz yuklanmadi")}</p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{formatVaqt(vaqt)}</span>
                <input
                  type="range"
                  min={0}
                  max={davomiylik || 0}
                  step={0.1}
                  value={Math.min(vaqt, davomiylik || 0)}
                  onChange={(e) => {
                    const a = audioRef.current;
                    if (a) a.currentTime = Number(e.target.value);
                  }}
                  aria-label={t("Audio joyi")}
                  className="w-full accent-primary"
                />
                <span className="text-xs tabular-nums text-muted-foreground">{formatVaqt(davomiylik)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {TEZLIKLAR.map((tz) => (
              <button
                key={tz}
                type="button"
                onClick={() => h.setTezlik(tz)}
                aria-pressed={h.tezlik === tz}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs tabular-nums",
                  h.tezlik === tz ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {tz === 1 ? "1×" : "0,8×"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => h.setKetmaKet(!h.ketmaKet)}
              aria-pressed={h.ketmaKet}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                h.ketmaKet ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Repeat className="size-3.5" />
              {t("Ketma-ket")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

`zustand/react/shallow` importi ishlamasa (`ls client/node_modules/zustand/react`), `useShallow`ni `zustand/shallow`dan ol yoki har maydonni alohida selektor bilan o'qi.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit -p . 2>&1 | grep -E "media-pleyer|media-ovoz" || echo "toza"
npx eslint src/components/media/media-pleyer.ts src/components/media/media-pleyer-panel.tsx src/components/media/media-ovoz-tugmasi.tsx
git add src/components/media/media-pleyer*.ts* src/components/media/media-ovoz-tugmasi.tsx
git commit -m "feat(media): bitta umumiy player — pauza, siljitish, tezlik, ketma-ket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — bo'lim materiali paneli

**Files:**
- Modify: `client/src/components/media/media-inhalt-utils.ts` (+ `media-inhalt-utils.test.ts`)
- Modify: `client/src/components/media/media-inhalt-panel.tsx`

**Interfaces:**
- Consumes: `PleyerElement`, `useNavbat`, `useJoriyMi` (Task 4), `useSectionInhalt` (Task 3), `MediaOvozTugmasi`.
- Produces: `bolimNavbati(inhalt: SectionInhalt): PleyerElement[]`; id'lar: `w{id}`, `s{id}`, `p{id}`, `d{id}` (to'liq dialog), `z{id}` (dialog qatori). `<MediaInhaltPanel sectionId />` — eksport nomi o'zgarmaydi.

- [ ] **Step 1: Failing test** — `media-inhalt-utils.test.ts`ga:

```ts
describe("bolimNavbati", () => {
  it("ekrandagi tartibda, faqat ovozi borlarni beradi", () => {
    const navbat = bolimNavbati({
      sectionCode: "u01-s1",
      sectionTitleUz: "S",
      unitCode: "u01",
      unitTitleUz: "U",
      woerter: [
        { id: 1, de: "Haus", uz: "uy", artikel: "das", anzeige: null, core: true, picturable: true, audioUrl: "/w1", imageUrl: null },
        { id: 2, de: "ja", uz: "ha", artikel: null, anzeige: null, core: true, picturable: false, audioUrl: null, imageUrl: null },
      ],
      saetze: [{ id: 3, de: "Ich bin da.", uz: "Men shu yerdaman.", audioUrl: "/s3" }],
      phrasen: [{ id: 4, de: "Hallo!", uz: "Salom!", audioUrl: "/p4" }],
      dialoge: [{ id: 5, code: "d1", titelDe: "Im Café", titelUz: "Kafeda", audioUrl: "/d5", fragen: [] }],
      dialogZeilen: [{ id: 6, dialogId: 5, order: 1, sprecher: "A", de: "Hallo", uz: "Salom", audioUrl: "/z6" }],
    });
    expect(navbat.map((e) => e.id)).toEqual(["w1", "s3", "p4", "d5", "z6"]);
    expect(navbat[0].nom).toBe("das Haus");
    expect(navbat[4].nom).toBe("A: Hallo");
  });
});
```

(`wortMatni` artikl bilan nima qaytarishini `media-inhalt-utils.ts:10`dan tekshir — `nom` kutilgan qiymatini shunga moslashtir.)

Run: `npx vitest run src/components/media/media-inhalt-utils.test.ts` → FAIL.

- [ ] **Step 2: `bolimNavbati`** — `media-inhalt-utils.ts`ga:

```ts
import type { PleyerElement } from "./media-pleyer";

/** Bo'lim panelidagi ovozlar, ekrandagi tartibda — playerning navbati. */
export function bolimNavbati(inhalt: SectionInhalt): PleyerElement[] {
  const navbat: PleyerElement[] = [];
  const qosh = (id: string, url: string | null, nom: string) => {
    if (url) navbat.push({ id, url, nom });
  };
  for (const w of inhalt.woerter) qosh(`w${w.id}`, w.audioUrl, wortMatni(w));
  for (const s of inhalt.saetze) qosh(`s${s.id}`, s.audioUrl, s.de);
  for (const p of inhalt.phrasen) qosh(`p${p.id}`, p.audioUrl, p.de);
  for (const d of inhalt.dialoge ?? []) {
    qosh(`d${d.id}`, d.audioUrl, d.titelDe);
    for (const z of inhalt.dialogZeilen.filter((r) => r.dialogId === d.id)) {
      qosh(`z${z.id}`, z.audioUrl, `${z.sprecher}: ${z.de}`);
    }
  }
  return navbat;
}
```

Run → PASS.

- [ ] **Step 3: Panelni qayta yozish** — `media-inhalt-panel.tsx`:
  1. `OvozTugmasi` importi va `OvozHujayrasi` o'rniga:

```tsx
/** Audio ustuni: ovozi bor qatorda umumiy player tugmasi, yo'q bo'lsa chiziqcha. */
function OvozHujayrasi({ id, url }: { id: string; url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return <MediaOvozTugmasi id={id} />;
}

/** Hozir chalayotgan qatorni ajratadi. */
function OvozliQator({ id, children }: { id: string; children: React.ReactNode }) {
  const joriy = useJoriyMi(id);
  return <TableRow className={cn(joriy && "bg-primary/5")}>{children}</TableRow>;
}
```

  2. `WoerterBlock`: `<TableRow key={w.id}>` → `<OvozliQator key={w.id} id={`w${w.id}`}>`, `<OvozHujayrasi id={`w${w.id}`} url={w.audioUrl} />`.
  3. `ZeileBlock`ga `prefiks: "s" | "p"` prop qo'sh; qator `OvozliQator id={`${prefiks}${r.id}`}`; chaqiruvlar `prefiks="s"` (Gaplar), `prefiks="p"` (Iboralar).
  4. `DialogBlock`: sarlavhadagi `<OvozHujayrasi id={`d${d.id}`} url={d.audioUrl} />`; qatorlar jadvaliga oxirgi `<TableHead className="w-14">{t("Ovoz")}</TableHead>` va `<TableCell><OvozHujayrasi id={`z${r.id}`} url={r.audioUrl} /></TableCell>`, qator `OvozliQator id={`z${r.id}`}`.
  5. «Ko'lam» `<div className="rounded-md border border-dashed …">` blokini va unga tegishli izohni o'chir.
  6. `useQuery(...)` o'rniga `const { data, isLoading, isError, refetch } = useSectionInhalt(sectionId);`.
  7. Komponent ichida: `const navbat = React.useMemo(() => (data ? bolimNavbati(data) : []), [data]); useNavbat(navbat);`.
  8. Importlar: `React`, `cn`, `MediaOvozTugmasi`, `useJoriyMi`, `useNavbat`, `bolimNavbati`, `useSectionInhalt`; `useQuery` va `api` olib tashlanadi. `t("Ovoz")` lug'atda borligini tekshir (jadval sarlavhasida allaqachon ishlatiladi).
  9. Komponent sarlavhasini yangila: «Bo'lim tanlanganda /media'ning o'ng panelida ochiladi».

- [ ] **Step 4: Tekshirish + commit**

```bash
npx vitest run src/components/media
npx eslint src/components/media/media-inhalt-panel.tsx src/components/media/media-inhalt-utils.ts
git add src/components/media/media-inhalt-*.ts*
git commit -m "feat(media): bo'lim materiali umumiy player bilan, dialog qatorlari ovozi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client — seans sahifasi

**Files:**
- Create: `client/src/components/media/media-seans.ts`
- Test: `client/src/components/media/media-seans.test.ts`
- Modify: `client/src/components/media/media-fragen-panel.tsx`
- Create: `client/src/components/media/media-seans-panel.tsx`

**Interfaces:**
- Consumes: `formatlarBoyichaGuruhla` (`media-fragen-utils.ts`), `KalitliFrage`, `LessonFragen`, `useLessonFragen`, `SEANS_NOMLARI`, `useNavbat`, `MediaOvozTugmasi`, `FORMAT_NOMLARI` (`@/lib/daf-format-nomlari`).
- Produces:
  - `kalitla(fragen: VorschauFrage[]): KalitliFrage[]` (`kalit = "f" + indeks`)
  - `interface SeansGuruhi { format: FrageFormat; fragen: KalitliFrage[]; afzal: boolean }`
  - `seansGuruhlari(fragen: KalitliFrage[], bevorzugt: FrageFormat[]): SeansGuruhi[]` — afzal formatlar `bevorzugt` tartibida oldin, qolgani birinchi uchrashuv tartibida
  - `seansNavbati(guruhlar: SeansGuruhi[]): PleyerElement[]`
  - `SavolQatori({ f }: { f: KalitliFrage })` (`media-fragen-panel.tsx`dan eksport)
  - `<MediaSeansPanel lessonId joy onSinov />`, bunda `joy: SeansJoyi` (Task 3)
- Sinov tugmasi faqat `onSinov()` prop'ini chaqiradi; qatlam (Task 7) sahifa qobig'ida (Task 8) ulanadi.

- [ ] **Step 1: Failing test** — `media-seans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { VorschauFrage } from "./media-fragen-types";
import { kalitla, seansGuruhlari, seansNavbati } from "./media-seans";

function f(format: VorschauFrage["format"], itemId: number, audioUrl: string | null = null): VorschauFrage {
  return { format, itemType: "WORT", itemId, prompt: `p${itemId}`, hilfe: null, options: [], richtig: "r", audioUrl };
}

describe("media seans", () => {
  const fragen = kalitla([f("WORT_UZ", 1), f("ARTIKEL", 2), f("AUDIO_WORT", 3, "/a3"), f("WORT_UZ", 4)]);

  it("har savolga barqaror kalit beradi", () => {
    expect(fragen.map((x) => x.kalit)).toEqual(["f0", "f1", "f2", "f3"]);
  });

  it("afzal formatlar oldin, qolgani birinchi uchrashuv tartibida", () => {
    const g = seansGuruhlari(fragen, ["AUDIO_WORT", "ARTIKEL"]);
    expect(g.map((x) => [x.format, x.afzal])).toEqual([
      ["AUDIO_WORT", true],
      ["ARTIKEL", true],
      ["WORT_UZ", false],
    ]);
    expect(g[2].fragen.map((x) => x.itemId)).toEqual([1, 4]);
  });

  it("navbat — faqat ovozli savollar, guruhlar tartibida", () => {
    const g = seansGuruhlari(fragen, []);
    expect(seansNavbati(g)).toEqual([{ id: "f2", url: "/a3", nom: "p3" }]);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `media-seans.ts`**

```ts
import type { FrageFormat, KalitliFrage, VorschauFrage } from "./media-fragen-types";
import { formatlarBoyichaGuruhla } from "./media-fragen-utils";
import type { PleyerElement } from "./media-pleyer";

export function kalitla(fragen: VorschauFrage[]): KalitliFrage[] {
  return fragen.map((f, i) => ({ ...f, kalit: `f${i}` }));
}

export interface SeansGuruhi {
  format: FrageFormat;
  fragen: KalitliFrage[];
  /** Shu seans turida oldinroq chiqadi. */
  afzal: boolean;
}

export function seansGuruhlari(fragen: KalitliFrage[], bevorzugt: FrageFormat[]): SeansGuruhi[] {
  const guruhlar = formatlarBoyichaGuruhla(fragen) as Map<FrageFormat, KalitliFrage[]>;
  const afzallar = bevorzugt.filter((format) => guruhlar.has(format));
  const qolgan = [...guruhlar.keys()].filter((format) => !bevorzugt.includes(format));
  return [
    ...afzallar.map((format) => ({ format, fragen: guruhlar.get(format)!, afzal: true })),
    ...qolgan.map((format) => ({ format, fragen: guruhlar.get(format)!, afzal: false })),
  ];
}

export function seansNavbati(guruhlar: SeansGuruhi[]): PleyerElement[] {
  return guruhlar.flatMap((g) =>
    g.fragen.flatMap((f) => (f.audioUrl ? [{ id: f.kalit, url: f.audioUrl, nom: f.prompt || f.titel || "" }] : [])),
  );
}
```

(`formatlarBoyichaGuruhla` qaytargan Map element turini saqlasa, `as` kerak emas — generic qilib qo'yish mumkin: `export function formatlarBoyichaGuruhla<T extends VorschauFrage>(fragen: T[]): Map<FrageFormat, T[]>`. Shunday qil, `as`ni olib tashla.)

Run → PASS.

- [ ] **Step 3: `media-fragen-panel.tsx`ni kesish**
  - O'chir: `FormatGuruhi`, `FormatTugmasi`, `FormatYonRoyxati`, `MediaFragenPanel`, ularning importlari (`useQuery`, `api`, `useEffect`, `useMemo`, `boshlangichFormat`, `FORMAT_NOMLARI` — agar `SavolQatori` ishlatmasa).
  - `SavolQatori`ni `export function SavolQatori({ f }: { f: KalitliFrage })` qil.
  - Uchala joyda `<OvozTugmasi url={f.audioUrl} autoPlay={false} compact />` → `<MediaOvozTugmasi id={f.kalit} />`; `OvozTugmasi` importini olib tashla.
  - Ildiz `div`ga hozir chalayotganni ajratish: `const joriy = useJoriyMi(f.kalit);` va `className={cn("space-y-2 rounded-lg border p-3", joriy && "border-primary bg-primary/5")}`.

- [ ] **Step 4: `media-seans-panel.tsx`**

```tsx
"use client";

import * as React from "react";
import { Play, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import { FORMAT_NOMLARI } from "@/lib/daf-format-nomlari";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SavolQatori } from "./media-fragen-panel";
import { SEANS_NOMLARI, type SeansJoyi } from "./media-daraxt";
import { useNavbat } from "./media-pleyer";
import { useLessonFragen } from "./media-queries";
import { kalitla, seansGuruhlari, seansNavbati } from "./media-seans";

/**
 * Seans sahifasi: shu seansdan chiqishi mumkin bo'lgan BARCHA savollar,
 * to'g'ri javobi bilan. Seans har safar shulardan tasodifiy tanlaydi.
 */
export function MediaSeansPanel({
  lessonId,
  joy,
  onSinov,
}: {
  lessonId: number;
  joy: SeansJoyi;
  onSinov: () => void;
}) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useLessonFragen(lessonId);
  const fragen = React.useMemo(() => kalitla(data?.fragen ?? []), [data]);
  const guruhlar = React.useMemo(() => seansGuruhlari(fragen, data?.bevorzugt ?? []), [fragen, data]);
  const navbat = React.useMemo(() => seansNavbati(guruhlar), [guruhlar]);
  useNavbat(navbat);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">
            {joy.unit.titleUz}
            {joy.section ? ` › ${joy.section.titleUz}` : ""}
          </div>
          <h2 className="text-lg font-semibold">{t(SEANS_NOMLARI[joy.lesson.kind])}</h2>
          {data && (
            <p className="text-sm text-muted-foreground">
              {t("Har safar shu savollardan {n} tasi tanlanadi", { n: data.laenge })}
              {" · "}
              {t("{n} ta savol", { n: data.fragen.length })}
              {" · "}
              {t("{n} xil mashq", { n: guruhlar.length })}
            </p>
          )}
        </div>
        <Button onClick={onSinov} disabled={!data || data.fragen.length === 0}>
          <Play className="mr-1.5 size-4" />
          {t("O'quvchi kabi o'tib ko'rish")}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>{t("Seans savollari olinmadi")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="mr-1.5 size-3.5" />
              {t("Qayta urinib ko'rish")}
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.fragen.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t("Bu seans uchun hali savol yo'q — bo'limda material yetarli emas.")}
          </CardContent>
        </Card>
      )}

      {guruhlar.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {guruhlar.map((g) => (
            <button
              key={g.format}
              type="button"
              onClick={() =>
                document.getElementById(`mashq-${g.format}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            >
              {t(FORMAT_NOMLARI[g.format])} <span className="tabular-nums text-muted-foreground">{g.fragen.length}</span>
            </button>
          ))}
        </div>
      )}

      {guruhlar.map((g) => (
        <section key={g.format} id={`mashq-${g.format}`} className="scroll-mt-4 space-y-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {t(FORMAT_NOMLARI[g.format])}
            <span className="text-xs font-normal text-muted-foreground">{t("{n} ta savol", { n: g.fragen.length })}</span>
            {g.afzal && <Badge variant="secondary">{t("Bu seansda ko'proq chiqadi")}</Badge>}
          </h3>
          {(g.format === "PAAR" || g.format === "ZUORDNEN") && (
            <p className="text-xs text-muted-foreground">
              {t("Juftlash savollarida to'plam har safar boshqacha tanlanadi — bu yerda namunasi.")}
            </p>
          )}
          <div className="space-y-2">
            {g.fragen.map((f) => (
              <SavolQatori key={f.kalit} f={f} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

`FORMAT_NOMLARI` `msg()` matnlari ekanini tekshir (`lib/daf-format-nomlari.ts`). Agar oddiy satrlar bo'lsa `t()`siz chiz.

- [ ] **Step 5: Tekshirish + commit**

```bash
npx vitest run src/components/media
npx eslint src/components/media/media-seans*.ts* src/components/media/media-fragen-panel.tsx src/components/media/media-fragen-utils.ts
git add src/components/media/media-seans*.ts* src/components/media/media-fragen-panel.tsx src/components/media/media-fragen-utils.ts
git commit -m "feat(media): seans sahifasi — barcha savollar mashq turi bo'yicha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «O'quvchi kabi o'tib ko'rish» — `SeansEkrani` korik rejimi

**Files:**
- Modify: `client/src/components/student-portal/lernen/queries.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/pastki-panel.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`
- Create: `client/src/components/media/media-sinov-qatlami.tsx`

**Interfaces:**
- Consumes: HTTP `GET /daf/media/lessons/:id/sinov`, `…/sinov/ersatz`, `POST /daf/media/sinov/check`, `POST /daf/media/sinov/juft` (Task 2); `useMediaPleyer.toxtatish` (Task 4).
- Produces:
  - `useKorikSeans(lessonId: number)`, `useKorikPruefen()`, `useKorikJuft()`, `useKorikErsatz()` — mos o'quvchi hooklari bilan BIR XIL tur imzolari.
  - `SeansEkraniProps` += `{ manba: "korik"; lessonId: number; onChiqish: () => void }`
  - `PastkiPanel` `sidebarMode: SidebarMode | null` (`null` — chekinishsiz)
  - `<MediaSinovQatlami lessonId={number} onYop={() => void} />`

- [ ] **Step 1: `queries.ts` — korik hooklari** (fayl oxiriga). `BASE` o'rniga to'liq manzil ishlatiladi:

```ts
/**
 * /media «O'quvchi kabi o'tib ko'rish» — xodim uchun. O'quvchi hooklarining
 * egizaklari, lekin `/daf/media/...`ga boradi: server seansni o'quvchisiz
 * quradi va javobni HECH NARSA yozmasdan tekshiradi.
 */
const KORIK = "/daf/media";

export function useKorikSeans(lessonId: number) {
  return useQuery(
    queryOptions<PublicFrage[]>({
      queryKey: ["media-korik", lessonId],
      queryFn: () => api.get(`${KORIK}/lessons/${lessonId}/sinov`).then((r) => r.data),
      enabled: Number.isFinite(lessonId),
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: 0,
    }),
  );
}

export function useKorikPruefen() {
  return useMutation<PruefErgebnis, unknown, Parameters<ReturnType<typeof usePruefen>["mutate"]>[0]>({
    mutationFn: (body) => api.post(`${KORIK}/sinov/check`, body).then((r) => r.data),
  });
}

export function useKorikJuft() {
  return useMutation<JuftNatija, unknown, Parameters<ReturnType<typeof useJuftTekshir>["mutate"]>[0]>({
    mutationFn: (body) => api.post(`${KORIK}/sinov/juft`, body).then((r) => r.data),
  });
}

export function useKorikErsatz() {
  return useMutation<PublicFrage | null, unknown, Parameters<ReturnType<typeof useErsatz>["mutate"]>[0]>({
    mutationFn: ({ lessonId, itemType, itemId, nichtFormat }) =>
      api
        .get(`${KORIK}/lessons/${lessonId}/sinov/ersatz`, { params: { itemType, itemId, nichtFormat } })
        .then((r) => r.data || null),
  });
}
```

`Parameters<…>` shakli o'qishga og'ir bo'lsa — `usePruefen`dagi variables turini nomli turga (`PruefenSorovi`) chiqarib, ikkalasida ishlat. `JuftNatija`, `PruefErgebnis`, `PublicFrage` importlari faylda borligini tekshir.

- [ ] **Step 2: `PastkiPanel` — `null` rejimi**

```tsx
  sidebarMode: SidebarMode | null;
```
va `CONTENT_INSET[sidebarMode]` → `sidebarMode && CONTENT_INSET[sidebarMode]`. JSDoc'ga: «`null` — chap rels yo'q (admin /media sinov qatlami): panel butun kenglikda.» `pastki-panel.test.ts` bo'lsa, `null` holatiga bitta test qo'sh:

```ts
  it("null rejimida chekinish klassi yo'q", () => {
    // mavjud testdagi render usulini qo'lla; className'da "md:pl-" bo'lmasligi kerak
  });
```
— mavjud test faylining render yo'lini o'qib, xuddi shu usulda yoz (masalan `renderToStaticMarkup(<PastkiPanel sidebarMode={null}>x</PastkiPanel>)` va `expect(html).not.toContain("md:pl-")`).

- [ ] **Step 3: `SeansEkrani` — korik manbasi**

1. Tur:
```ts
export type SeansEkraniProps =
  | { manba?: "dars"; lessonId: number }
  | { manba: "takrorlash" }
  | { manba: "korik"; lessonId: number; onChiqish: () => void };
```
2. Diskriminatsiya (`darsMi` atrofida, ~114):
```ts
  const korikMi = props.manba === "korik";
  const darsMi = props.manba !== "takrorlash" && !korikMi;
  const lessonId = props.manba === "takrorlash" ? null : props.lessonId;
  const onChiqish = props.manba === "korik" ? props.onChiqish : null;
```
3. So'rovlar (~127–135) — hamma hooklar SHARTSIZ chaqiriladi, ishlatilishi tanlanadi:
```ts
  const darsSeans = useUebungSeans(darsMi ? (lessonId ?? NaN) : NaN);
  const korikSeans = useKorikSeans(korikMi ? (lessonId ?? NaN) : NaN);
  const takrorlashSeans = useWiederholung(!darsMi && !korikMi);
  const seans = korikMi ? korikSeans : darsMi ? darsSeans : takrorlashSeans;

  // Korikda o'quvchi endpointi chaqirilmaydi: xodimga 403 → global toast.
  const lesson = useLernenLesson(darsMi ? (lessonId ?? NaN) : NaN);
  const darsPruefen = usePruefen();
  const korikPruefen = useKorikPruefen();
  const pruefen = korikMi ? korikPruefen : darsPruefen;
  const darsJuft = useJuftTekshir();
  const korikJuft = useKorikJuft();
  const juftTekshir = korikMi ? korikJuft : darsJuft;
  const darsErsatz = useErsatz();
  const korikErsatz = useKorikErsatz();
  const ersatzSorov = korikMi ? korikErsatz : darsErsatz;
```
`useWiederholung(enabled)` imzosini tekshir — boolean qabul qilishi kerak (hozir `useWiederholung(!darsMi)`).

4. Yakun effekti (~490): `tugashDavomiyligi.current = …` qatoridan keyin, `invalidateQueries`dan oldin:
```ts
    // Korik: natija hech qayerga yuborilmaydi — faqat ekranda.
    if (korikMi) return;
```
5. Bo'sh seans (~746): `if (darsMi) { return <LernenLessonPage …/> }` dan keyin:
```tsx
    if (korikMi) {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 pt-10">
          <EmptyState
            icon={<Books size={28} weight="bold" />}
            title={t("Bu seans uchun savol qurilmadi")}
            action={
              <Button variant="secondary" onClick={() => onChiqish?.()}>
                {t("Yopish")}
              </Button>
            }
          />
        </div>
      );
    }
```
6. Natija (~813): `if (tugadimi(holat)) {` ichida, `NatijaEkrani`dan OLDIN (u `useLernenTema` → `useStudentProfile` orqali o'quvchi profilini so'raydi — xodimga 403):
```tsx
    if (korikMi) {
      return (
        <div className="mx-auto w-full max-w-md px-4 pt-16">
          <Card className="space-y-4 p-6 text-center">
            <p className="text-lg font-bold">{t("Sinov tugadi")}</p>
            <p className="text-3xl font-bold tabular-nums">
              {t("{togri} / {jami} to'g'ri", { togri: holat.togri, jami: holat.jami })}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => void qaytaOtish()}>
                {t("Qayta o'tish")}
              </Button>
              <Button className="flex-1" onClick={() => onChiqish?.()}>
                {t("Yopish")}
              </Button>
            </div>
          </Card>
        </div>
      );
    }
```
`Card`ni `../../lumio`dan import qil (NatijaEkrani ham shu yerdan oladi).
7. Chiqish tugmasi (~875): `onClick={() => (onChiqish ? onChiqish() : router.push(chiqishHref))}`.
8. `<RadioSessionToggle />` (~892): `{!korikMi && <RadioSessionToggle />}`.
9. `PastkiPanel` (~1027): `sidebarMode={korikMi ? null : sidebarMode}`.
10. `natijaniQaytaYubor`, `sinovMi`, `NatijaEkrani` — o'zgarishsiz (korikda yetib kelinmaydi).

- [ ] **Step 4: `media-sinov-qatlami.tsx`**

```tsx
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/context";
import { SeansEkrani } from "@/components/student-portal/lernen/uebung/seans-ekrani";
import { useMediaPleyer } from "./media-pleyer";

/**
 * «O'quvchi kabi o'tib ko'rish»: o'quvchining seans ekrani, butun ekran.
 * Radix `Dialog` EMAS — uning `transform`i seans ekranining `fixed`
 * pastki panelini dialog ichiga qamab qo'yadi. `body`ga portal, `.lumio`
 * shu ildizda (o'quvchi portali tokenlari).
 */
export function MediaSinovQatlami({ lessonId, onYop }: { lessonId: number; onYop: () => void }) {
  const t = useT();
  const [ildiz, setIldiz] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setIldiz(document.body);
    useMediaPleyer.getState().toxtatish();
    const body = document.body;
    const oldingiOverflow = body.style.overflow;
    body.dataset.mediaSinov = "1";
    body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onYop();
    };
    window.addEventListener("keydown", esc);
    return () => {
      delete body.dataset.mediaSinov;
      body.style.overflow = oldingiOverflow;
      window.removeEventListener("keydown", esc);
    };
  }, [onYop]);

  if (!ildiz) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Sinov rejimi")}
      className="lumio fixed inset-0 z-50 overflow-y-auto bg-background text-foreground antialiased"
    >
      <div className="sticky top-0 z-30 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
        {t("Sinov rejimi — javoblar saqlanmaydi")}
      </div>
      <SeansEkrani manba="korik" lessonId={lessonId} onChiqish={onYop} />
    </div>,
    ildiz,
  );
}
```

Qatlam effekti `onYop`ga bog'liq — chaqiruvchi uni `useCallback` bilan barqaror berishi SHART (Task 8 shunday qiladi), aks holda har renderda body holati qayta o'rnatiladi.

- [ ] **Step 5: Tekshirish**

```bash
npx tsc --noEmit -p .
npx vitest run src/components/student-portal/lernen src/components/media
npx eslint src/components/student-portal/lernen/queries.ts src/components/student-portal/lernen/uebung/seans-ekrani.tsx src/components/student-portal/lernen/uebung/pastki-panel.tsx src/components/media
```
Kutiladi: hammasi PASS; o'quvchi seansining mavjud testlari o'zgarishsiz yashil.

- [ ] **Step 6: Commit**

```bash
git add src/components/student-portal/lernen src/components/media/media-sinov-qatlami.tsx
git commit -m "feat(media): o'quvchi kabi o'tib ko'rish — yozmaydigan sinov rejimi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — sahifa qobig'i, daraxt, eski fayllarni olib tashlash

**Files:**
- Create: `client/src/components/media/media-daraxt-view.tsx`
- Modify: `client/src/components/media/media-client.tsx`
- Modify: `client/src/app/(dashboard)/media/sections/[id]/page.tsx`
- Delete: `media-coverage-section.tsx`, `media-coverage-utils.ts`, `media-coverage-utils.test.ts`, `section-detail-client.tsx`, `section-detail-utils.ts`, `section-detail-utils.test.ts`

**Interfaces:**
- Consumes: Task 3–7 hammasi (`MediaSinovQatlami` — Task 7).
- Produces: `<MediaDaraxt levels tanlov onTanla />`.

- [ ] **Step 1: `media-daraxt-view.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FolderArchive, Swords } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { MediaLesson, MediaLevelCoverage } from "./media-coverage-types";
import { SEANS_NOMLARI, kamchilik, tanlovUnitId, type Tanlov } from "./media-daraxt";

function SeansTugmasi({
  lesson,
  tanlangan,
  onTanla,
}: {
  lesson: MediaLesson;
  tanlangan: boolean;
  onTanla: (t: Tanlov) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-current={tanlangan || undefined}
      onClick={() => onTanla({ tur: "seans", id: lesson.id })}
      className={cn(
        "block w-full truncate rounded-md px-2 py-1 text-left text-sm",
        tanlangan ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {t(SEANS_NOMLARI[lesson.kind])}
    </button>
  );
}

/** Chap ustun: daraja → unit → bo'lim → seans. */
export function MediaDaraxt({
  levels,
  tanlov,
  onTanla,
}: {
  levels: MediaLevelCoverage[];
  tanlov: Tanlov | null;
  onTanla: (t: Tanlov) => void;
}) {
  const t = useT();
  const tanlanganUnit = tanlovUnitId(levels, tanlov);
  const [ochiq, setOchiq] = React.useState<Set<number>>(() => new Set(tanlanganUnit ? [tanlanganUnit] : []));

  // Tanlov boshqa unitga o'tsa (havola, yangilash), o'sha unit ochiladi.
  React.useEffect(() => {
    if (tanlanganUnit === null) return;
    setOchiq((oldin) => (oldin.has(tanlanganUnit) ? oldin : new Set(oldin).add(tanlanganUnit)));
  }, [tanlanganUnit]);

  const almashtir = (unitId: number) =>
    setOchiq((oldin) => {
      const keyin = new Set(oldin);
      if (keyin.has(unitId)) keyin.delete(unitId);
      else keyin.add(unitId);
      return keyin;
    });

  return (
    <nav aria-label={t("Bo'limlar")} className="space-y-3 text-sm">
      {levels.map((lvl) => (
        <div key={lvl.level} className="space-y-1">
          {levels.length > 1 && <div className="px-2 text-xs font-semibold text-muted-foreground">{lvl.level}</div>}
          {lvl.units.map((u) => {
            const unitOchiq = ochiq.has(u.unitId);
            const bosh = u.sections.length === 0;
            return (
              <div key={u.unitId}>
                <button
                  type="button"
                  disabled={bosh}
                  aria-expanded={unitOchiq}
                  onClick={() => almashtir(u.unitId)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  {unitOchiq ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                  <span className="truncate font-medium">{t("{n}-unit — {title}", { n: u.order, title: u.titleUz })}</span>
                </button>
                {unitOchiq && (
                  <div className="ml-3 space-y-0.5 border-l pl-2">
                    {u.sections.map((s) => {
                      const k = kamchilik(s);
                      const tanlangan = tanlov?.tur === "bolim" && tanlov.id === s.sectionId;
                      return (
                        <div key={s.sectionId}>
                          <button
                            type="button"
                            aria-current={tanlangan || undefined}
                            onClick={() => onTanla({ tur: "bolim", id: s.sectionId })}
                            className={cn(
                              "block w-full rounded-md px-2 py-1 text-left",
                              tanlangan ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                            )}
                          >
                            <span className="block truncate">{s.order}. {s.titleUz}</span>
                            {(k.ovoz > 0 || k.rasm > 0) && (
                              <span className="block text-xs text-amber-600 dark:text-amber-400">
                                {[
                                  k.ovoz > 0 ? t("{n} ovoz yo'q", { n: k.ovoz }) : null,
                                  k.rasm > 0 ? t("{n} rasm yo'q", { n: k.rasm }) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </button>
                          <div className="ml-2">
                            {s.lessons.map((l) => (
                              <SeansTugmasi
                                key={l.id}
                                lesson={l}
                                tanlangan={tanlov?.tur === "seans" && tanlov.id === l.id}
                                onTanla={onTanla}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {u.unitLessons.map((l) => (
                      <SeansTugmasi
                        key={l.id}
                        lesson={l}
                        tanlangan={tanlov?.tur === "seans" && tanlov.id === l.id}
                        onTanla={onTanla}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="space-y-1 border-t pt-3">
        <Link href="/media/jang" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
          <Swords className="size-4 text-muted-foreground" />
          {t("Jang savollari")}
        </Link>
        <Link href="/media/assets" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
          <FolderArchive className="size-4 text-muted-foreground" />
          {t("Media fayllari")}
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: `media-client.tsx`ni almashtirish**

```tsx
"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTree, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaDaraxt } from "./media-daraxt-view";
import { bolimJoyi, boshlangichTanlov, seansJoyi, tanlovParamlari, tanlovniOqi, type Tanlov } from "./media-daraxt";
import { MediaInhaltPanel } from "./media-inhalt-panel";
import { MediaPleyerPanel } from "./media-pleyer-panel";
import { useMediaCoverage } from "./media-queries";
import { MediaSeansPanel } from "./media-seans-panel";
import { MediaSinovQatlami } from "./media-sinov-qatlami";

/** /media — kursni o'quvchi yo'li bo'yicha ko'rib chiqish. */
export function MediaClient() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, refetch } = useMediaCoverage();
  const [sheet, setSheet] = React.useState(false);
  const [sinov, setSinov] = React.useState<number | null>(null);
  // Barqaror bo'lishi shart: qatlam effekti shunga bog'liq.
  const sinovniYop = React.useCallback(() => setSinov(null), []);

  const levels = data?.levels ?? [];
  const tanlov = tanlovniOqi((k) => searchParams.get(k)) ?? boshlangichTanlov(levels);

  const tanla = React.useCallback(
    (yangi: Tanlov) => {
      setSheet(false);
      router.replace(`${pathname}?${tanlovParamlari(yangi)}`, { scroll: false });
    },
    [pathname, router],
  );

  const daraxt = <MediaDaraxt levels={levels} tanlov={tanlov} onTanla={tanla} />;
  const bolim = tanlov?.tur === "bolim" ? bolimJoyi(levels, tanlov.id) : null;
  const seans = tanlov?.tur === "seans" ? seansJoyi(levels, tanlov.id) : null;
  const birinchi = boshlangichTanlov(levels);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row md:p-6">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-4 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-1">{!isLoading && daraxt}</div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("Media")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("Har bir bo'lim va seansni o'quvchi ko'zi bilan ko'rib chiqish.")}
              </p>
            </div>
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => setSheet(true)}>
              <ListTree className="mr-1.5 size-4" />
              {t("Bo'limlar")}
            </Button>
          </div>

          {isLoading && <Skeleton className="h-64 w-full rounded-lg" />}

          {!isLoading && isError && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
                <span>{t("Qamrov ma'lumoti olinmadi")}</span>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("Qayta urinib ko'rish")}
                </Button>
              </CardContent>
            </Card>
          )}

          {data && levels.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {t("Hali hech qanday unit yaratilmagan — kontentni bazaga yozadigan seed skriptini (`daf:seed`/`daf:inhalt-seed`) ishga tushiring.")}
              </CardContent>
            </Card>
          )}

          {bolim && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{bolim.unit.titleUz}</div>
              <h2 className="text-lg font-semibold">{bolim.section.titleUz}</h2>
              <MediaInhaltPanel key={bolim.section.sectionId} sectionId={bolim.section.sectionId} />
            </div>
          )}

          {seans && (
            <MediaSeansPanel
              key={seans.lesson.id}
              lessonId={seans.lesson.id}
              joy={seans}
              onSinov={() => setSinov(seans.lesson.id)}
            />
          )}

          {data && levels.length > 0 && tanlov && !bolim && !seans && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
                <span>{t("Bu bo'lim yoki seans topilmadi")}</span>
                {birinchi && (
                  <Button size="sm" onClick={() => tanla(birinchi)}>
                    {t("Birinchi bo'limni ochish")}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      <MediaPleyerPanel />

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="flex w-80 flex-col p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>{t("Bo'limlar")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3">{daraxt}</div>
        </SheetContent>
      </Sheet>

      {sinov !== null && <MediaSinovQatlami lessonId={sinov} onYop={sinovniYop} />}
    </div>
  );
}
```

`MediaInhaltPanel` ichida `p-4` paddingi bor edi — sahifada ortiqcha bo'lsa olib tashla. Eski seed matni lug'atdagi kalit bilan baytma-bayt bir xil ekanini `grep -n "seed skriptini" src/i18n/dictionaries/ru.ts` bilan tekshir (`media-coverage-section.tsx`dagi bilan aynan bir xil yoz).
- [ ] **Step 3: Eski manzilni yo'naltirish** — `app/(dashboard)/media/sections/[id]/page.tsx`ni o'qi (params turi qanday yozilganini ko'r) va almashtir:

```tsx
import { redirect } from "next/navigation";

/** Eski bo'lim sahifasi — endi /media ichida (`?bolim=`). Tashqi havolalar uchun qoldirilgan. */
export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/media?bolim=${encodeURIComponent(id)}`);
}
```

(Agar mavjud fayl `params`ni Promise sifatida emas, oddiy obyekt sifatida olsa — o'sha shaklni saqla.)

- [ ] **Step 4: Eski fayllarni o'chirish**

```bash
git rm src/components/media/media-coverage-section.tsx src/components/media/media-coverage-utils.ts src/components/media/media-coverage-utils.test.ts src/components/media/section-detail-client.tsx src/components/media/section-detail-utils.ts src/components/media/section-detail-utils.test.ts
grep -rn "media-coverage-section\|media-coverage-utils\|section-detail-client\|section-detail-utils\|MediaFragenPanel" src --include='*.ts' --include='*.tsx'
```
Kutiladi: faqat `i18n/i18n-coverage.test.ts` (Task 9da tuzatiladi). Boshqa joy chiqsa — o'sha importni olib tashla.

- [ ] **Step 5: Typecheck + testlar + commit**

```bash
npx tsc --noEmit -p .
npx vitest run src/components/media
npx eslint src/components/media "src/app/(dashboard)/media"
git add -A src/components/media "src/app/(dashboard)/media"
git commit -m "feat(media): yangi sahifa — daraxt, bo'lim va seans panellari, eski qamrov jadvali o'chirildi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tillar

**Files:**
- Modify: `client/src/i18n/i18n-coverage.test.ts`
- Modify: `client/src/i18n/dictionaries/ru.ts`, `de.ts`, `en.ts`

- [ ] **Step 1: `STRICT_FILES`**

O'chir: `"components/media/media-coverage-section.tsx"`, `"components/media/section-detail-client.tsx"`.
Qo'sh (media bloki ichida):
```ts
  "components/media/media-daraxt.ts",
  "components/media/media-daraxt-view.tsx",
  "components/media/media-pleyer-panel.tsx",
  "components/media/media-ovoz-tugmasi.tsx",
  "components/media/media-seans-panel.tsx",
  "components/media/media-sinov-qatlami.tsx",
```
`seans-ekrani.tsx` ro'yxatda bo'lmasa, uni ham qo'sh.

- [ ] **Step 2: Yetishmaganlarni ko'rish**

Run: `npm run i18n:check`
Kutiladi: FAIL — yetishmagan va eskirgan kalitlar ro'yxati.

- [ ] **Step 3: Tarjimalar** — FAQAT tekshiruv yetishmagan deb aytgan kalitlarni qo'sh (allaqachon bor kalitni qayta qo'shish TS xatosi). Lug'atlarda yangi `// Media — o'quvchi yo'li (2026-10-29)` bloki:

| Kalit | ru | de | en |
|---|---|---|---|
| `Har bir bo'lim va seansni o'quvchi ko'zi bilan ko'rib chiqish.` | Просмотр каждого раздела и сеанса глазами ученика. | Jeden Abschnitt und jede Sitzung aus Sicht der Lernenden prüfen. | Review every section and session as a student sees it. |
| `Bo'limlar` | Разделы | Abschnitte | Sections |
| `{n} ovoz yo'q` | нет аудио: {n} | {n} ohne Audio | {n} without audio |
| `{n} rasm yo'q` | нет картинок: {n} | {n} ohne Bild | {n} without image |
| `Bu bo'lim yoki seans topilmadi` | Раздел или сеанс не найден | Abschnitt oder Sitzung nicht gefunden | Section or session not found |
| `Birinchi bo'limni ochish` | Открыть первый раздел | Ersten Abschnitt öffnen | Open the first section |
| `Tanishuv` | Знакомство | Kennenlernen | Introduction |
| `Ishlatish` | Применение | Anwenden | Practice |
| `O'tish sinovi` | Промежуточный тест | Zwischentest | Bridge test |
| `Yakuniy sinov` | Итоговый тест | Abschlusstest | Final test |
| `O'quvchi kabi o'tib ko'rish` | Пройти как ученик | Wie Lernende durchgehen | Try it as a student |
| `Har safar shu savollardan {n} tasi tanlanadi` | Каждый раз выбирается {n} из этих вопросов | Jedes Mal werden {n} dieser Fragen gewählt | Each time {n} of these questions are picked |
| `{n} ta savol` | вопросов: {n} | {n} Fragen | {n} questions |
| `{n} xil mashq` | типов упражнений: {n} | {n} Übungsarten | {n} exercise types |
| `Bu seansda ko'proq chiqadi` | Чаще в этом сеансе | In dieser Sitzung häufiger | More frequent in this session |
| `Juftlash savollarida to'plam har safar boshqacha tanlanadi — bu yerda namunasi.` | В заданиях на сопоставление набор каждый раз другой — здесь пример. | Bei Zuordnungsaufgaben wird die Auswahl jedes Mal neu getroffen — hier ein Beispiel. | Matching questions pick a different set each time — this is a sample. |
| `Seans savollari olinmadi` | Не удалось загрузить вопросы сеанса | Fragen der Sitzung konnten nicht geladen werden | Couldn't load the session's questions |
| `Bu seans uchun hali savol yo'q — bo'limda material yetarli emas.` | Для этого сеанса пока нет вопросов — в разделе мало материала. | Für diese Sitzung gibt es noch keine Fragen — im Abschnitt fehlt Material. | No questions for this session yet — the section has too little material. |
| `Eshitish uchun karnayni bosing` | Нажмите на динамик, чтобы послушать | Zum Anhören auf den Lautsprecher tippen | Tap a speaker to listen |
| `Oldingisi` | Предыдущий | Vorheriges | Previous |
| `Keyingisi` | Следующий | Nächstes | Next |
| `Pauza` | Пауза | Pause | Pause |
| `Eshitish` | Слушать | Anhören | Listen |
| `Ovoz yuklanmadi` | Аудио не загрузилось | Audio wurde nicht geladen | Audio didn't load |
| `Audio joyi` | Позиция аудио | Audioposition | Audio position |
| `Ketma-ket` | Подряд | Nacheinander | In sequence |
| `Sinov rejimi` | Пробный режим | Testmodus | Preview mode |
| `Sinov rejimi — javoblar saqlanmaydi` | Пробный режим — ответы не сохраняются | Testmodus — Antworten werden nicht gespeichert | Preview mode — answers aren't saved |
| `Sinov tugadi` | Пробный проход завершён | Testdurchlauf beendet | Preview finished |
| `{togri} / {jami} to'g'ri` | верно: {togri} / {jami} | {togri} / {jami} richtig | {togri} / {jami} correct |
| `Qayta o'tish` | Пройти снова | Erneut durchgehen | Go through again |
| `Bu seans uchun savol qurilmadi` | Для этого сеанса не удалось собрать вопросы | Für diese Sitzung konnten keine Fragen erstellt werden | No questions could be built for this session |
| `Yopish` | Закрыть | Schließen | Close |
| `Ovoz` | Аудио | Audio | Audio |

Tekshiruv «eskirgan kalit» desa (masalan «Ko'lam» matnlari, `FormatYonRoyxati` matnlari) — o'sha kalitni uchala lug'atdan o'chir. `uz-cyrl.ts`ga faqat transliteratsiya xato chiqqan so'z bo'lsa qo'sh.

- [ ] **Step 4: Yashil**

Run: `npm run i18n:check` → PASS. Run: `npx tsc --noEmit -p .` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n
git commit -m "i18n(media): yangi /media matnlari ru/de/en

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Brauzerda tekshirish va yakuniy holat

- [ ] **Step 1: Dev serverlar** — worktree'ga `.claude/launch.json` nusxasini qo'y (asosiy katalogdagi bilan bir xil; `server`, `client`), `server/.env`ni asosiy katalogdan symlink qil (CLAUDE.local «Worktree Setup»), keyin `preview_start {name: "server"}` va `preview_start {name: "client"}`. `http://localhost:3000/login` — lokal test hisobi bilan kir (parolni chatda yozma; loyihaning seed/example fayllaridagi qiymatdan foydalan).

- [ ] **Step 2: Tekshiruv ro'yxati** (har birida `read_console_messages` xatosiz, `read_network_requests`da 4xx/5xx yo'q):
  1. `/media` — chapda daraxt, birinchi bo'lim ochiq, URL `?bolim=…`.
  2. Bo'limdagi ikki karnayni ketma-ket bos — faqat ikkinchisi eshitiladi (`javascript_tool`: `document.querySelectorAll('audio').length === 1`).
  3. Player: pauza/davom, siljitish chizig'i joyni o'zgartiradi, 0,8× tezlik, «Ketma-ket» — audio tugagach keyingisi boshlanadi va qator ajratiladi.
  4. Seansni bos — URL `?seans=…`, sarlavha seans nomi, chiplar, «Bu seansda ko'proq chiqadi» belgisi; chip bosilganda guruhga suriladi.
  5. «O'quvchi kabi o'tib ko'rish» — qatlam ochiladi, sariq «Sinov rejimi» yozuvi, javob berish ishlaydi; tarmoqda faqat `/daf/media/...` so'rovlari (`/student-portal/` YO'Q); oxirida «Sinov tugadi»; `Esc` yopadi.
  6. Sahifani yangilash — o'sha bo'lim/seans ochiladi. `/media/sections/<id>` → `/media?bolim=<id>`.
  7. `resize_window {preset: "mobile"}` — daraxt yashirin, «Bo'limlar» tugmasi `Sheet`ni ochadi; keyin `preset: "desktop"`.
  8. Til menyusida «Русский» — yangi matnlar tarjima qilingan.
  9. O'quvchi rejimi buzilmagani: lokal o'quvchi hisobi bilan `/portal/lernen`dagi bitta seansni oxirigacha o'tib ko'r (natija ekrani, pastki panel joyida).

- [ ] **Step 3: Isbot** — `/media` bo'lim va seans holatining skrinshoti, sinov qatlamining skrinshoti.

- [ ] **Step 4: Yakuniy to'liq tekshiruv**

```bash
cd server && npx jest src/daf src/common/permissions src/common/auth && npm run build
cd ../client && npx tsc --noEmit -p . && npx vitest run && npm run i18n:check && npx next build
```

- [ ] **Step 5: Spec holatini yangilash** — spec sarlavhasidagi «Holat» qatorini «Amalga oshirildi (`feat/media-qayta-qurish`), merge kutilmoqda» ga o'zgartir, commit qil. PR ochish va deploy — foydalanuvchi so'raganda.
