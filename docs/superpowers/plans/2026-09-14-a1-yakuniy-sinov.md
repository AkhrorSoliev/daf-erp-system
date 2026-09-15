# A1 yakuniy sinovi («Kurz und klar») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unit oxiridagi bo'sh «Yakuniy sinov» sahifasini butun unitdan 15 savollik mashqqa aylantirish; birinchi urinishda kamida 14 ta to'g'ri bo'lsa (90 %) keyingi unit ochiladi.

**Architecture:** Mavjud mashq dvigateli ishlatiladi: `UNIT_TEST` darsi uchun material unitning hamma bo'limidan olinadi va seans 15 savol bo'ladi. O'tish qarorini `abschluss` serverda shu seansning urinishlaridan (`seansniYakunla`) chiqaradi, `DafSession.passed` ga muhrlaydi va `DafLessonProgress.completedAt` ni faqat o'tganda yozadi. Mijoz natija ekrani server javobiga qarab uch holatdan birini ko'rsatadi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), jest/ts-jest; Next.js + react-query + vitest.

**Dizayn:** `docs/superpowers/specs/2026-09-14-a1-yakuniy-sinov-design.md`

## Global Constraints

- Ish joyi: `/Users/a1111/Desktop/daf-erp-system/.worktrees/a1-kichik-qarzlar`, shox `feat/a1-yakuniy-sinov`. `server/node_modules` — asosiy katalogga simvolik havola, qayta o'rnatilmaydi.
- Kod izohlari va UI matnlari — faqat lotin o'zbekcha (kirill yo'q), atrofdagi izohlar uslubida.
- O'tish qoidasi: `UNIT_TEST_SAVOLLAR = 15`, `OTISH_FOIZI = 90`, `otishUchunKerak() = 14`; faqat birinchi urinish, baholangan (`seansYigindisi`).
- `UNIT_TEST` uchun mijoz yuborgan `richtig` o'tish qaroriga TA'SIR QILMAYDI.
- `completedAt` faqat o'tganda yoziladi; bir marta yozilgach hech qachon o'chirilmaydi.
- Migratsiya faqat qo'shadi: `DafSession.passed BOOLEAN NULL`. `prisma migrate dev` ISHLATILMAYDI — `migrate diff` → toza SQL → `db execute` → `migrate resolve --applied`.
- Boshqa dars turlari (`SECTION_A`, `SECTION_B`, `BRIDGE`) va takrorlash seansining xatti-harakati o'zgarmaydi — regressiya testlari bilan.
- `HOEREN_WAHL` seansda 1 ta chegarasi, ball va Leitner qoidalari o'zgarmaydi.
- Tekshiruv: server `npx jest <spec>` + `npm run typecheck`; mijoz `npx vitest run <fayl>` + `npm run typecheck`; `npx eslint <o'zgargan fayllar>` 0 xato; `npx prettier --write` faqat o'zgargan `.ts/.tsx` fayllarga (kontent JSON ga emas).
- Commit xabari o'zbekcha, oxiri: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Deploy: backend (Railway) Vercel'dan OLDIN; CEO ruxsatisiz merge/deploy qilinmaydi.

---

### Task 1: O'tish qoidasi va yakuniy sinov yakuni (server)

**Files:**
- Create: `server/src/daf/uebung/yakuniy-sinov.ts`
- Create: `server/src/daf/uebung/yakuniy-sinov.spec.ts`
- Modify: `server/prisma/schema.prisma` (`model DafSession`, `firstTryCorrect` dan keyin)
- Create: `server/prisma/migrations/20260914120000_daf_session_passed/migration.sql`
- Modify: `server/src/daf/uebung/uebung.service.ts` (`abschluss` ~435-510, yangi xususiy metodlar)
- Test: `server/src/daf/uebung/uebung.service.spec.ts` (yangi `describe`)

**Interfaces:**
- Produces: `UNIT_TEST_SAVOLLAR: number` (15), `OTISH_FOIZI: number` (90), `otishUchunKerak(jami?: number): number`, `sinovdanOtdimi(n: { questionCount: number; firstTryCorrect: number }): boolean` — `yakuniy-sinov.ts`.
- Produces: `export interface YakuniySinovNatijasi { bestanden: boolean; avvalOtilgan: boolean; togri: number; jami: number; kerak: number }` va `export interface AbschlussNatija { bestScore: number; runs: number; sinov?: YakuniySinovNatijasi }` — `uebung.service.ts`; `abschluss` qaytaradigan tip `Promise<AbschlussNatija>`. JSON javob maydonlari mijozda (Task 3) aynan shu nomlar bilan o'qiladi.

- [ ] **Step 1: Qoida modulining testini yozing**

`server/src/daf/uebung/yakuniy-sinov.spec.ts`:

```ts
import {
  OTISH_FOIZI,
  UNIT_TEST_SAVOLLAR,
  otishUchunKerak,
  sinovdanOtdimi,
} from './yakuniy-sinov';

describe('yakuniy sinov qoidasi', () => {
  it('15 savolda kamida 14 ta to`g`ri kerak (90 %)', () => {
    expect(UNIT_TEST_SAVOLLAR).toBe(15);
    expect(OTISH_FOIZI).toBe(90);
    expect(otishUchunKerak()).toBe(14);
  });

  it('butun son foiz bilan hisoblanadi — suzuvchi nuqta bir ortiq talab qilmaydi', () => {
    // 0.9 × 10 suzuvchi nuqtada 9.000000000000002 — `Math.ceil` 10 berardi.
    expect(otishUchunKerak(10)).toBe(9);
    expect(otishUchunKerak(20)).toBe(18);
    expect(otishUchunKerak(12)).toBe(11);
  });

  it('14/15 — o`tdi, 13/15 — o`tmadi', () => {
    expect(sinovdanOtdimi({ questionCount: 15, firstTryCorrect: 14 })).toBe(true);
    expect(sinovdanOtdimi({ questionCount: 15, firstTryCorrect: 15 })).toBe(true);
    expect(sinovdanOtdimi({ questionCount: 15, firstTryCorrect: 13 })).toBe(false);
  });

  it('15 tadan kam savolga javob berilgan seans o`tmaydi (14/14 ham)', () => {
    expect(sinovdanOtdimi({ questionCount: 14, firstTryCorrect: 14 })).toBe(false);
    expect(sinovdanOtdimi({ questionCount: 3, firstTryCorrect: 3 })).toBe(false);
  });
});
```

- [ ] **Step 2: Test yiqilishini ko'ring**

Run: `cd server && npx jest src/daf/uebung/yakuniy-sinov.spec.ts`
Expected: FAIL — `Cannot find module './yakuniy-sinov'`.

- [ ] **Step 3: Modulni yozing**

`server/src/daf/uebung/yakuniy-sinov.ts`:

```ts
/**
 * Unit yakuniy sinovi («Kurz und klar») qoidalari — BITTA JOY.
 *
 * Dizayn: `docs/superpowers/specs/2026-09-14-a1-yakuniy-sinov-design.md`.
 * CEO qarori (2026-09-14): 15 savol, birinchi urinishda kamida 90 %
 * to'g'ri bo'lsa keyingi unit ochiladi.
 *
 * NEGA FOIZ BUTUN SON. `Math.ceil(0.9 * n)` suzuvchi nuqtada ba'zi `n`
 * uchun bir ortiq talab qiladi (0.9 × 10 = 9.000000000000002 → 10).
 * Butun sonli `n × 90 / 100` bu xatodan xoli.
 */
export const UNIT_TEST_SAVOLLAR = 15;
export const OTISH_FOIZI = 90;

/** O'tish uchun kerakli to'g'ri javoblar soni: 15 savolda 14 ta. */
export function otishUchunKerak(jami: number = UNIT_TEST_SAVOLLAR): number {
  return Math.ceil((jami * OTISH_FOIZI) / 100);
}

/**
 * Seans natijasidan o'tish qarori.
 *
 * `questionCount` urinishlardan hisoblanadi (birinchi urinish,
 * baholangan). To'liq 15 savolga javob berilmagan seans O'TMAYDI:
 * aks holda 3 ta oson savolga javob berib yakun yuborish 3/3 = 100 %
 * bo'lib qolardi.
 */
export function sinovdanOtdimi(natija: {
  questionCount: number;
  firstTryCorrect: number;
}): boolean {
  return (
    natija.questionCount >= UNIT_TEST_SAVOLLAR &&
    natija.firstTryCorrect >= otishUchunKerak()
  );
}
```

- [ ] **Step 4: Testni o'tkazing**

Run: `cd server && npx jest src/daf/uebung/yakuniy-sinov.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Sxema va migratsiya**

`server/prisma/schema.prisma`, `model DafSession` ichida `firstTryCorrect Int?` qatoridan keyin:

```prisma
  /// Yakuniy sinov (`UNIT_TEST` darsi) seansida o'tish qarori, yakunda
  /// muhrlanadi; boshqa seanslarda `null`. Keyin o'tish ulushi o'zgarsa
  /// ham «nechanchi urinishda o'tgan» tarixi o'sha kungi qoida bilan qoladi.
  passed          Boolean?
```

Keyin (dev bazasi, sirlarni chop etmasdan):

```bash
cd server
set -a; source /Users/a1111/Desktop/daf-erp-system/server/.env; set +a
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/passed-diff.sql
grep -n '"DafSession"' /tmp/passed-diff.sql
```

Expected: `ALTER TABLE "DafSession" ADD COLUMN     "passed" BOOLEAN;` qatori (fayldagi boshqa qatorlar — dev bazasining eski farqlari, ular olinmaydi). Faqat shu qatorni yozing:

`server/prisma/migrations/20260914120000_daf_session_passed/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "DafSession" ADD COLUMN     "passed" BOOLEAN;
```

```bash
npx prisma db execute --file prisma/migrations/20260914120000_daf_session_passed/migration.sql
npx prisma migrate resolve --applied 20260914120000_daf_session_passed
npx prisma generate
```

Expected: `Script executed successfully.`, `marked as applied`, `Generated Prisma Client`.

- [ ] **Step 6: `abschluss` ning yakuniy sinov testlarini yozing**

`server/src/daf/uebung/uebung.service.spec.ts` oxiriga:

```ts
describe('abschluss — yakuniy sinov (UNIT_TEST)', () => {
  const ctx = { studentId: 55, companyId: 1 };
  const UUID = '8b1e2c3d-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const satr = (questionIndex: number, score: number) => ({
    questionIndex,
    attemptNo: 1,
    format: 'WORT_UZ',
    score,
    gradingStatus: 'GRADED',
  });

  function prismaSinov(opts: {
    togri: number;
    jami: number;
    lessonId?: number;
    studentId?: number;
    passed?: boolean | null;
    oldingi?: { bestScore: number; runs: number; completedAt: Date | null };
  }) {
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => ({
      id: 300,
      unitId: 1,
      sectionId: null,
      kind: 'UNIT_TEST',
      section: null,
    })) as any;
    prisma.dafSession.findUnique = jest.fn(async () => ({
      id: UUID,
      studentId: opts.studentId ?? 55,
      lessonId: opts.lessonId ?? 300,
      finishedAt: null,
      questionCount: null,
      firstTryCorrect: null,
      passed: opts.passed ?? null,
    })) as any;
    prisma.dafAttempt.findMany = jest.fn(async () =>
      Array.from({ length: opts.jami }, (_, i) =>
        satr(i, i < opts.togri ? 1 : 0),
      ),
    ) as any;
    if (opts.oldingi) {
      prisma.dafLessonProgress.findUnique = jest.fn(
        async () => opts.oldingi,
      ) as any;
    }
    return prisma;
  }

  const yakun = (prisma: any, input: Record<string, unknown> = {}) =>
    new UebungService(prisma).abschluss(
      300,
      { richtig: 15, gesamt: 15, sessionId: UUID, ...input } as any,
      ctx,
    );

  const passedYozuvi = (prisma: any) =>
    (prisma.dafSession.update as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((a) => 'passed' in a.data);

  it('14/15 — o`tdi: completedAt yoziladi, passed muhrlanadi', async () => {
    const prisma = prismaSinov({ togri: 14, jami: 15 });
    const r = await yakun(prisma);
    expect(r.sinov).toEqual({
      bestanden: true,
      avvalOtilgan: false,
      togri: 14,
      jami: 15,
      kerak: 14,
    });
    const lp = (prisma.dafLessonProgress.upsert as jest.Mock).mock.calls[0][0];
    expect(lp.create.completedAt).toBeInstanceOf(Date);
    expect(lp.create.bestScore).toBe(14);
    expect(lp.create.runs).toBe(1);
    expect(passedYozuvi(prisma).data).toEqual({ passed: true });
  });

  it('13/15 — o`tmadi: completedAt null, passed false', async () => {
    const prisma = prismaSinov({ togri: 13, jami: 15 });
    const r = await yakun(prisma);
    expect(r.sinov?.bestanden).toBe(false);
    expect(r.sinov?.kerak).toBe(14);
    const lp = (prisma.dafLessonProgress.upsert as jest.Mock).mock.calls[0][0];
    expect(lp.create.completedAt).toBeNull();
    expect(lp.update.completedAt).toBeNull();
    expect(passedYozuvi(prisma).data).toEqual({ passed: false });
  });

  it('mijoz aytgan richtig hisobga olinmaydi — urinishlar hal qiladi', async () => {
    const prisma = prismaSinov({ togri: 10, jami: 15 });
    const r = await yakun(prisma, { richtig: 15 });
    expect(r.sinov?.bestanden).toBe(false);
    expect(r.bestScore).toBe(10);
  });

  it('15 tadan kam savolga javob — 14/14 ham o`tmaydi', async () => {
    const prisma = prismaSinov({ togri: 14, jami: 14 });
    const r = await yakun(prisma);
    expect(r.sinov?.bestanden).toBe(false);
  });

  it('sessionId yo`q — o`tmadi, seansga tegilmaydi', async () => {
    const prisma = prismaSinov({ togri: 15, jami: 15 });
    const r = await yakun(prisma, { sessionId: undefined });
    expect(r.sinov).toEqual({
      bestanden: false,
      avvalOtilgan: false,
      togri: 0,
      jami: 0,
      kerak: 14,
    });
    expect(prisma.dafSession.update).not.toHaveBeenCalled();
    const lp = (prisma.dafLessonProgress.upsert as jest.Mock).mock.calls[0][0];
    expect(lp.create.completedAt).toBeNull();
  });

  it('boshqa darsning seansi — o`tmadi', async () => {
    const prisma = prismaSinov({ togri: 15, jami: 15, lessonId: 301 });
    const r = await yakun(prisma);
    expect(r.sinov?.bestanden).toBe(false);
    expect(prisma.dafSession.update).not.toHaveBeenCalled();
  });

  it('boshqa o`quvchining seansi — o`tmadi', async () => {
    const prisma = prismaSinov({ togri: 15, jami: 15, studentId: 99 });
    const r = await yakun(prisma);
    expect(r.sinov?.bestanden).toBe(false);
    expect(prisma.dafSession.update).not.toHaveBeenCalled();
  });

  it('avval o`tgan, bu safar 12/15 — completedAt saqlanadi, avvalOtilgan true', async () => {
    const oldinOtgan = new Date('2026-09-10T10:00:00Z');
    const prisma = prismaSinov({
      togri: 12,
      jami: 15,
      oldingi: { bestScore: 14, runs: 2, completedAt: oldinOtgan },
    });
    const r = await yakun(prisma);
    expect(r.sinov).toMatchObject({ bestanden: false, avvalOtilgan: true });
    expect(r.bestScore).toBe(14);
    expect(r.runs).toBe(3);
    const lp = (prisma.dafLessonProgress.upsert as jest.Mock).mock.calls[0][0];
    expect(lp.update.completedAt).toBe(oldinOtgan);
  });

  it('muhrlangan passed qayta hisoblanmaydi (ikkinchi yuborilgan yakun)', async () => {
    const prisma = prismaSinov({ togri: 5, jami: 15, passed: true });
    const r = await yakun(prisma);
    expect(r.sinov?.bestanden).toBe(true);
    expect(passedYozuvi(prisma)).toBeUndefined();
  });

  it('oddiy dars (SECTION_A) — eski yo`l: sinov maydoni yo`q, completedAt har doim', async () => {
    const prisma = fakePrisma();
    const r = await new UebungService(prisma as any).abschluss(
      100,
      { richtig: 3, gesamt: 12 },
      ctx,
    );
    expect(r).toEqual({ bestScore: 3, runs: 1 });
    const lp = (prisma.dafLessonProgress.upsert as jest.Mock).mock.calls[0][0];
    expect(lp.create.completedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 7: Yiqilishini ko'ring**

Run: `cd server && npx jest src/daf/uebung/uebung.service.spec.ts -t "yakuniy sinov"`
Expected: FAIL — `r.sinov` undefined (o'tish qarori hali yo'q).

- [ ] **Step 8: `abschluss` ni yozing**

`uebung.service.ts` tepasidagi importlarga:

```ts
import { otishUchunKerak, sinovdanOtdimi } from './yakuniy-sinov';
```

`PruefenContext` interfeysidan keyin:

```ts
/** Yakuniy sinov yakunining natijasi — mijoz natija ekrani shuni ko'rsatadi. */
export interface YakuniySinovNatijasi {
  bestanden: boolean;
  /** Bu yakundan OLDIN darsda `completedAt` bor edi — keyingi unit ochiq. */
  avvalOtilgan: boolean;
  togri: number;
  jami: number;
  kerak: number;
}

export interface AbschlussNatija {
  bestScore: number;
  runs: number;
  /** Faqat `UNIT_TEST` darsida. */
  sinov?: YakuniySinovNatijasi;
}
```

`abschluss` imzosidagi qaytish tipini `Promise<AbschlussNatija>` ga almashtiring va ikkita tekshiruvdan (`gesamt <= 0`, `richtig > gesamt`) KEYIN, `oldingi` o'qilishidan OLDIN qo'shing:

```ts
    // Yakuniy sinov — o'tish qarori SERVERDA, shu seansning urinishlaridan
    // (dizayn 2026-09-14 §5). Oddiy darslar pastdagi o'zgarmagan yo'ldan.
    const dars = (await this.prisma.dafLesson.findUnique({
      where: { id: lessonId },
      select: { kind: true },
    } as any)) as { kind: string | null } | null;
    if (dars?.kind === 'UNIT_TEST') {
      return this.yakuniySinovAbschluss(lessonId, input.sessionId, ctx);
    }
```

`wiederholungAbschluss` metodidan oldin ikkita xususiy metod:

```ts
  /**
   * Yakuniy sinov yakuni. Oddiy `abschluss` dan uch farqi:
   * (1) o'tish qarori mijoz aytgan `richtig` dan EMAS, shu seansning
   *     urinishlaridan (`seansniYakunla`);
   * (2) `completedAt` FAQAT o'tganda yoziladi — yo'l keyingi unitni shu
   *     maydonga qarab ochadi; avval o'tilgan bo'lsa, keyingi past natija
   *     uni o'chirmaydi (CEO: ochilgan unit yopilmaydi);
   * (3) qaror `DafSession.passed` ga muhrlanadi.
   */
  private async yakuniySinovAbschluss(
    lessonId: number,
    sessionId: string | undefined,
    ctx: PruefenContext,
  ): Promise<AbschlussNatija> {
    const baho = await this.yakuniySinovniBaholash(lessonId, sessionId, ctx);
    const oldingi = (await this.prisma.dafLessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: ctx.studentId, lessonId } },
    } as any)) as {
      bestScore: number;
      runs: number;
      completedAt: Date | null;
    } | null;

    const avvalOtilgan = oldingi?.completedAt != null;
    const bestScore = Math.max(oldingi?.bestScore ?? 0, baho.togri);
    const runs = (oldingi?.runs ?? 0) + 1;
    const completedAt = avvalOtilgan
      ? (oldingi?.completedAt ?? null)
      : baho.bestanden
        ? new Date()
        : null;

    await this.prisma.dafLessonProgress.upsert({
      where: { studentId_lessonId: { studentId: ctx.studentId, lessonId } },
      create: {
        studentId: ctx.studentId,
        lessonId,
        companyId: ctx.companyId,
        completedAt,
        bestScore,
        runs,
      },
      update: { completedAt, bestScore, runs },
    } as any);

    return {
      bestScore,
      runs,
      sinov: {
        bestanden: baho.bestanden,
        avvalOtilgan,
        togri: baho.togri,
        jami: baho.jami,
        kerak: otishUchunKerak(),
      },
    };
  }

  /**
   * Seans shu o'quvchiga VA shu darsga tegishli bo'lsagina baholanadi —
   * aks holda boshqa darsning oson seansi bilan sinovdan o'tib bo'lardi.
   * Yaroqsiz seans xato tashlamaydi: natija «o'tmadi», o'quvchi qayta
   * topshiradi (dars progressi baribir yoziladi).
   */
  private async yakuniySinovniBaholash(
    lessonId: number,
    sessionId: string | undefined,
    ctx: PruefenContext,
  ): Promise<{ bestanden: boolean; togri: number; jami: number }> {
    const otmadi = { bestanden: false, togri: 0, jami: 0 };
    if (!sessionId) return otmadi;

    const seans = (await this.prisma.dafSession.findUnique({
      where: { id: sessionId },
      select: { studentId: true, lessonId: true, passed: true },
    } as any)) as {
      studentId: number;
      lessonId: number | null;
      passed: boolean | null;
    } | null;
    if (
      !seans ||
      seans.studentId !== ctx.studentId ||
      seans.lessonId !== lessonId
    ) {
      this.logger.warn(
        `Yakuniy sinov seansi yaroqsiz (lessonId=${lessonId}, ` +
          `studentId=${ctx.studentId}, sessionId=${sessionId})`,
      );
      return otmadi;
    }

    const { questionCount, firstTryCorrect } = await this.seansniYakunla(
      sessionId,
      ctx,
    );
    // Muhrlangan qaror QAYTA HISOBLANMAYDI — takror yuborilgan yakun yoki
    // keyin o'zgargan ulush o'sha kungi natijani o'zgartirmasin.
    const bestanden =
      seans.passed ?? sinovdanOtdimi({ questionCount, firstTryCorrect });
    if (seans.passed == null) {
      await this.prisma.dafSession.update({
        where: { id: sessionId },
        data: { passed: bestanden },
      } as any);
    }
    return { bestanden, togri: firstTryCorrect, jami: questionCount };
  }
```

- [ ] **Step 9: Testlar va tip tekshiruvi**

Run: `cd server && npx jest src/daf/uebung && npm run typecheck`
Expected: hamma DaF uebung testlari PASS (yangi 10 + eski `abschluss`/`seans yakuni` testlari o'zgarishsiz), typecheck toza.

- [ ] **Step 10: Lint, prettier, commit**

```bash
cd server
npx prettier --write src/daf/uebung/yakuniy-sinov.ts src/daf/uebung/yakuniy-sinov.spec.ts src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts
npx eslint src/daf/uebung/yakuniy-sinov.ts src/daf/uebung/uebung.service.ts
cd ..
git add server/src/daf/uebung/yakuniy-sinov.ts server/src/daf/uebung/yakuniy-sinov.spec.ts server/src/daf/uebung/uebung.service.ts server/src/daf/uebung/uebung.service.spec.ts server/prisma/schema.prisma server/prisma/migrations/20260914120000_daf_session_passed/migration.sql
git commit -m "Yakuniy sinov yakuni: 90% bilan o'tish serverda, completedAt faqat o'tganda

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: Yakuniy sinov seansi — butun unit materiali, 15 savol (server)

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts` (`baueKandidaten` ~685-730, `seans` ~361-367, import)
- Modify: `server/src/daf/uebung/kind-formate.ts` (`UNIT_TEST` yozuvi ustidagi izoh)
- Modify: `docs/superpowers/specs/2026-09-11-a1-hoeren-design.md` (§6 «Hozircha uxlab turadi» eslatmasi)
- Test: `server/src/daf/uebung/seans.spec.ts`, `server/src/daf/uebung/uebung.service.spec.ts`

**Interfaces:**
- Consumes: `UNIT_TEST_SAVOLLAR` (Task 1, `yakuniy-sinov.ts`).
- Produces: `UebungService.seans(lessonId)` `UNIT_TEST` darsi uchun savollar qaytaradi (ilgari `[]`); `ersatz` xuddi shu material yo'lidan foydalanadi.

- [ ] **Step 1: 15 savollik joylashtirish testini yozing**

`server/src/daf/uebung/seans.spec.ts`, `describe('baueSeans', …)` ichiga oxirgi test sifatida:

```ts
  it('15 savollik seans (yakuniy sinov) ham barcha qoidalar bilan to`ladi', () => {
    const s = baueSeans(kandidaten(), 15, rnd);
    expect(s.fragen).toHaveLength(15);
    const soni = new Map<FrageFormat, number>();
    for (const q of s.fragen) soni.set(q.format, (soni.get(q.format) ?? 0) + 1);
    for (const [fmt, n] of soni) expect(n).toBeLessThanOrEqual(capFuer(fmt));
    for (let i = 1; i < s.fragen.length; i += 1) {
      expect(s.fragen[i].format).not.toBe(s.fragen[i - 1].format);
    }
    expect(soni.size).toBeGreaterThanOrEqual(MIN_FORMATE);
  });
```

- [ ] **Step 2: Dvigatel testlarini yozing**

`server/src/daf/uebung/uebung.service.spec.ts` importlariga `import * as seansModul from './seans';` va fayl oxiriga:

```ts
describe('seans — yakuniy sinov (UNIT_TEST)', () => {
  const unitTestDars = () => ({
    id: 300,
    unitId: 1,
    sectionId: null,
    kind: 'UNIT_TEST',
    section: null,
  });
  afterEach(() => jest.restoreAllMocks());

  it('material unitning HAMMA bo`limidan olinadi (tartib cheklovisiz)', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => unitTestDars()) as any;
    const fragen = await new UebungService(prisma as any).seans(
      300,
      55,
      () => 0.5,
    );
    expect(prisma.dafSection.findMany).toHaveBeenCalledWith({
      where: { unitId: 1 },
    });
    expect(fragen.length).toBeGreaterThan(0);
  });

  it('yakuniy sinov 15 savolga, oddiy dars 12 savolga quriladi', async () => {
    const spy = jest.spyOn(seansModul, 'baueSeans');
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => unitTestDars()) as any;
    await new UebungService(prisma as any).seans(300, 55, () => 0.5);
    expect(spy.mock.calls[0][1]).toBe(15);

    spy.mockClear();
    await new UebungService(fakePrisma() as any).seans(100, 55, () => 0.5);
    expect(spy.mock.calls[0][1]).toBe(12);
  });

  it('bo`limsiz boshqa dars (eski DiB) — avvalgidek bo`sh', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => ({
      id: 400,
      unitId: 9,
      sectionId: null,
      kind: null,
      section: null,
    })) as any;
    const fragen = await new UebungService(prisma as any).seans(
      400,
      55,
      () => 0.5,
    );
    expect(fragen).toEqual([]);
    expect(prisma.dafSection.findMany).not.toHaveBeenCalled();
  });
});
```

(Agar `jest.spyOn` ESM eksportga tegolmasa — ts-jest odatda CJS chiqaradi va tegadi — `jest.mock('./seans', () => ({ ...jest.requireActual('./seans'), baueSeans: jest.fn(jest.requireActual('./seans').baueSeans) }))` bilan o'rab, ikkinchi argumentni xuddi shunday tekshiring.)

- [ ] **Step 3: Yiqilishini ko'ring**

Run: `cd server && npx jest src/daf/uebung/seans.spec.ts src/daf/uebung/uebung.service.spec.ts -t "yakuniy sinov"`
Expected: `seans` testlari FAIL (`UNIT_TEST` darsi `[]` qaytaradi, `baueSeans` chaqirilmaydi). `baueSeans` 15 testi hozirdan PASS bo'lishi mumkin — u joylashtiruvchining sig'imini tasdiqlaydi, yiqilsa bu haqiqiy muammo: to'xtang va xabar bering.

- [ ] **Step 4: `baueKandidaten` ni yozing**

`uebung.service.ts`, `baueKandidaten` ichida quyidagi blokni:

```ts
    if (!(lesson as any).section) {
      return null;
    }
    const section = (lesson as any).section as {
      id: number;
      order: number;
      unitId: number;
    };

    // Chalg'ituvchilar shu darsning bo'limi va undan OLDINGI bo'limlar
    // materialidan olinadi — o'quvchi hali o'qimagan mavzudan chalg'ituvchi
    // taxminni emas, bilimni tekshiradi.
    const sections = await this.prisma.dafSection.findMany({
      where: { unitId: section.unitId, order: { lte: section.order } },
    } as any);
```

shunga almashtiring:

```ts
    const section = (lesson as any).section as {
      id: number;
      order: number;
      unitId: number;
    } | null;
    const kind: string | null = (lesson as any).kind ?? null;

    // Chalg'ituvchilar shu darsning bo'limi va undan OLDINGI bo'limlar
    // materialidan olinadi — o'quvchi hali o'qimagan mavzudan chalg'ituvchi
    // taxminni emas, bilimni tekshiradi.
    //
    // YAKUNIY SINOV (`UNIT_TEST`) bo'limsiz seed qilinadi (`kurs-lessons.ts`)
    // va BUTUN unitni tekshiradi — material unitning HAMMA bo'limidan, ya'ni
    // oxirgi bo'limning kumulyativ puli bilan bir xil. Bo'limsiz boshqa dars
    // (eski DiB) — avvalgidek `null`, mijoz eski sahifaga tushadi.
    let bolimlarShart: { unitId: number; order?: { lte: number } };
    if (section) {
      bolimlarShart = { unitId: section.unitId, order: { lte: section.order } };
    } else if (kind === 'UNIT_TEST' && (lesson as any).unitId != null) {
      bolimlarShart = { unitId: (lesson as any).unitId as number };
    } else {
      return null;
    }
    const sections = await this.prisma.dafSection.findMany({
      where: bolimlarShart,
    } as any);
```

va metod oxiridagi `return { pflicht, kandidaten, kind: (lesson as any).kind ?? null };` ni `return { pflicht, kandidaten, kind };` ga almashtiring.

Muddati kelgan so'zlar ulushi (`baueWiederholung` sukut qiymati `Math.floor(SEANS_UZUNLIGI / WIEDERHOLUNG_ULUSH)` = 2) o'zgartirilmaydi: 15 savolda ham `Math.floor(15 / 6)` = 2 — kurs dizayni 5-bo'limi bilan bir xil.

- [ ] **Step 5: Seans uzunligi**

Import qatorini kengaytiring: `import { otishUchunKerak, sinovdanOtdimi, UNIT_TEST_SAVOLLAR } from './yakuniy-sinov';`

`seans()` ichida:

```ts
    const { fragen, nichtPlatziert } = baueSeans(
      kandidaten,
      SEANS_UZUNLIGI,
```

ni:

```ts
    // Yakuniy sinov 15 savol (kurs dizayni 3-bo'limi), qolgan darslar 12.
    const uzunlik = kind === 'UNIT_TEST' ? UNIT_TEST_SAVOLLAR : SEANS_UZUNLIGI;
    const { fragen, nichtPlatziert } = baueSeans(
      kandidaten,
      uzunlik,
```

ga almashtiring (`wiederholung()` dagi `SEANS_UZUNLIGI` ga TEGILMAYDI).

- [ ] **Step 6: Izoh va dizayn hujjati**

`server/src/daf/uebung/kind-formate.ts` — `UNIT_TEST: [` ustidagi «BUGUN O'LIK: …» bilan boshlanib «… shu zahoti kuchga kiradi.» bilan tugaydigan to'qqiz qatorli izohni shunga almashtiring:

```ts
  // Yakuniy sinov (2026-09-14 dan dvigatelda): vaziyatga suyangan formatlar
  // oldinga suriladi — kurs dizaynidagi «Kurz und klar». Material unitning
  // hamma bo'limidan, seans 15 savol (`yakuniy-sinov.ts`).
```

`docs/superpowers/specs/2026-09-11-a1-hoeren-design.md` — «**Hozircha uxlab turadi** (yakuniy ko'rik, 2026-09-13): …» bilan boshlanib «… ulash — alohida ish.» bilan tugaydigan bandni shunga almashtiring:

```markdown
  **2026-09-14 dan ishlaydi:** yakuniy sinov dvigatelga ulandi
  (`2026-09-14-a1-yakuniy-sinov-design.md`) — eshitish savoli `UNIT_TEST`
  seansida ham, `SECTION_A` / `SECTION_B` / `BRIDGE` da ham chiqadi
  (seansda ko'pi bilan 1 ta).
```

- [ ] **Step 7: Testlar va tip tekshiruvi**

Run: `cd server && npx jest src/daf && npm run typecheck`
Expected: hamma DaF testlari PASS, typecheck toza.

- [ ] **Step 8: Lint, prettier, commit**

```bash
cd server
npx prettier --write src/daf/uebung/uebung.service.ts src/daf/uebung/uebung.service.spec.ts src/daf/uebung/seans.spec.ts src/daf/uebung/kind-formate.ts
npx eslint src/daf/uebung/uebung.service.ts src/daf/uebung/kind-formate.ts
cd ..
git add server/src/daf/uebung/uebung.service.ts server/src/daf/uebung/uebung.service.spec.ts server/src/daf/uebung/seans.spec.ts server/src/daf/uebung/kind-formate.ts docs/superpowers/specs/2026-09-11-a1-hoeren-design.md
git commit -m "Yakuniy sinov seansi: butun unit materialidan 15 savol

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Natija ekrani — o'tdi / o'tmadi / avval o'tgan (mijoz)

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts` (`AbschlussErgebnis` ~73)
- Create: `client/src/components/student-portal/lernen/uebung/sinov-natijasi.ts`
- Create: `client/src/components/student-portal/lernen/uebung/sinov-natijasi.test.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`

**Interfaces:**
- Consumes: server `abschluss` javobi — `{ bestScore, runs, sinov?: { bestanden, avvalOtilgan, togri, jami, kerak } }` (Task 1).
- Produces: `sinovKorinishi(holat: SinovHolati): SinovKorinishi`, `type SinovHolati`; `NatijaEkrani` ga ixtiyoriy `sinov?: SinovHolati | null` va `onNatijaQaytaYubor?: () => void`.

- [ ] **Step 1: Tiplar**

`types.ts` dagi `AbschlussErgebnis` ni shunga almashtiring:

```ts
/** Yakuniy sinov (`UNIT_TEST`) yakunidagi server qarori. */
export interface YakuniySinovNatijasi {
  bestanden: boolean;
  /** Bu yakundan OLDIN sinovdan o'tilgan edi — keyingi unit ochiq. */
  avvalOtilgan: boolean;
  togri: number;
  jami: number;
  kerak: number;
}

export interface AbschlussErgebnis {
  bestScore: number;
  runs: number;
  /** Faqat yakuniy sinov darsida. */
  sinov?: YakuniySinovNatijasi;
}
```

- [ ] **Step 2: Ko'rinish funksiyasining testini yozing**

`sinov-natijasi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sinovKorinishi } from "./sinov-natijasi";

const natija = (o: Partial<{ bestanden: boolean; avvalOtilgan: boolean; togri: number }>) => ({
  bestanden: false,
  avvalOtilgan: false,
  togri: 12,
  jami: 15,
  kerak: 14,
  ...o,
});

describe("sinovKorinishi", () => {
  it("server javobi kutilmoqda — tugma yo'q, o'tdi/o'tmadi taxmin qilinmaydi", () => {
    expect(sinovKorinishi({ tur: "kutilmoqda" })).toEqual({
      sarlavha: "Natija tekshirilmoqda",
      matn: "Bir necha soniya kuting.",
      ohang: "neytral",
      asosiy: null,
    });
  });

  it("so'rov yiqildi — qayta yuborish", () => {
    const k = sinovKorinishi({ tur: "xato" });
    expect(k.asosiy).toBe("qayta-yubor");
    expect(k.ohang).toBe("xavf");
  });

  it("o'tdi — davom etish, keyingi unit ochildi", () => {
    expect(sinovKorinishi({ tur: "tayyor", natija: natija({ bestanden: true, togri: 14 }) })).toEqual({
      sarlavha: "Yakuniy sinovdan o'tdingiz!",
      matn: "14 / 15 — keyingi unit ochildi.",
      ohang: "muvaffaqiyat",
      asosiy: "davom",
    });
  });

  it("o'tmadi — qayta urinish, nechta kerakligi aytiladi", () => {
    expect(sinovKorinishi({ tur: "tayyor", natija: natija({}) })).toEqual({
      sarlavha: "Hali o'tmadingiz",
      matn: "12 / 15 — o'tish uchun kamida 14 ta to'g'ri javob kerak.",
      ohang: "xavf",
      asosiy: "qayta",
    });
  });

  it("avval o'tgan, bu safar past — unit ochiq, davom etish", () => {
    expect(sinovKorinishi({ tur: "tayyor", natija: natija({ avvalOtilgan: true }) })).toEqual({
      sarlavha: "Bu safar 12 / 15",
      matn: "Sinovdan avval o'tgansiz — keyingi unit ochiq.",
      ohang: "neytral",
      asosiy: "davom",
    });
  });
});
```

- [ ] **Step 3: Yiqilishini ko'ring**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/sinov-natijasi.test.ts`
Expected: FAIL — `Failed to resolve import "./sinov-natijasi"`.

- [ ] **Step 4: Funksiyani yozing**

`sinov-natijasi.ts`:

```ts
import type { YakuniySinovNatijasi } from "../types";

/**
 * Natija ekranidagi yakuniy sinov kartasining holati.
 *
 * O'tdi/o'tmadini FAQAT server aytadi (`abschluss` javobidagi `sinov`) —
 * mijoz o'z sanog'idan taxmin qilmaydi: server birinchi urinishlarni
 * urinish yozuvlaridan sanaydi va to'liq 15 savolni talab qiladi.
 */
export type SinovHolati =
  | { tur: "kutilmoqda" }
  | { tur: "xato" }
  | { tur: "tayyor"; natija: YakuniySinovNatijasi };

export interface SinovKorinishi {
  sarlavha: string;
  matn: string;
  ohang: "muvaffaqiyat" | "xavf" | "neytral";
  /** Asosiy tugma; `null` — javob kutilmoqda, tugmalar o'chiq. */
  asosiy: "davom" | "qayta" | "qayta-yubor" | null;
}

export function sinovKorinishi(holat: SinovHolati): SinovKorinishi {
  if (holat.tur === "kutilmoqda") {
    return {
      sarlavha: "Natija tekshirilmoqda",
      matn: "Bir necha soniya kuting.",
      ohang: "neytral",
      asosiy: null,
    };
  }
  if (holat.tur === "xato") {
    return {
      sarlavha: "Natijani tekshirib bo'lmadi",
      matn: "Internetni tekshirib, natijani qayta yuboring.",
      ohang: "xavf",
      asosiy: "qayta-yubor",
    };
  }
  const { bestanden, avvalOtilgan, togri, jami, kerak } = holat.natija;
  if (bestanden) {
    return {
      sarlavha: "Yakuniy sinovdan o'tdingiz!",
      matn: `${togri} / ${jami} — keyingi unit ochildi.`,
      ohang: "muvaffaqiyat",
      asosiy: "davom",
    };
  }
  if (avvalOtilgan) {
    return {
      sarlavha: `Bu safar ${togri} / ${jami}`,
      matn: "Sinovdan avval o'tgansiz — keyingi unit ochiq.",
      ohang: "neytral",
      asosiy: "davom",
    };
  }
  return {
    sarlavha: "Hali o'tmadingiz",
    matn: `${togri} / ${jami} — o'tish uchun kamida ${kerak} ta to'g'ri javob kerak.`,
    ohang: "xavf",
    asosiy: "qayta",
  };
}
```

- [ ] **Step 5: Testni o'tkazing**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/sinov-natijasi.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: `NatijaEkrani`**

Importlarga: `import { cn } from "@/lib/utils";` va `import { sinovKorinishi, type SinovHolati } from "./sinov-natijasi";`.

`NatijaEkraniProps` ga:

```ts
  /** Yakuniy sinov darsida — server qarori holati; oddiy darsda yo'q. */
  sinov?: SinovHolati | null;
  /** `sinov.tur === "xato"` bo'lganda natijani qayta yuborish. */
  onNatijaQaytaYubor?: () => void;
```

Komponent parametrlariga `sinov` va `onNatijaQaytaYubor` qo'shing, `davomHref` dan keyin:

```ts
  const korinish = sinov ? sinovKorinishi(sinov) : null;
```

Birinchi `Card` (kubok, `togri / jami`) dan KEYIN:

```tsx
        {korinish ? (
          <Card
            role="status"
            aria-live="polite"
            className={cn(
              "space-y-1 text-center",
              korinish.ohang === "muvaffaqiyat" && "bg-success/10",
              korinish.ohang === "xavf" && "bg-danger/10",
            )}
          >
            <p className="font-display text-xl font-bold text-ink-900">{korinish.sarlavha}</p>
            <p className="font-semibold text-ink-600">{korinish.matn}</p>
          </Card>
        ) : null}
```

Oxirgi tugmalar blokini (`<div className="flex gap-2">` … `</div>`) shunga almashtiring:

```tsx
        <div className="flex gap-2">
          {korinish?.asosiy === "qayta-yubor" ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={() => router.push(davomHref)}>
                Chiqish
              </Button>
              <Button className="flex-1" onClick={onNatijaQaytaYubor}>
                Qayta yuborish
              </Button>
            </>
          ) : korinish?.asosiy === "qayta" ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={() => router.push(davomHref)}>
                Yo&apos;lga qaytish
              </Button>
              <Button className="flex-1" onClick={onQayta}>
                Qayta urinish
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={onQayta}
                disabled={korinish?.asosiy === null}
              >
                {korinish ? "Qayta urinish" : "Qayta o'tish"}
              </Button>
              <Button
                className="flex-1"
                onClick={() => router.push(davomHref)}
                disabled={korinish?.asosiy === null}
              >
                Davom etish
              </Button>
            </>
          )}
        </div>
```

(Oddiy darsda `korinish` `null` → `asosiy === null` emas `undefined` — tugmalar yoqiq, matn «Qayta o'tish» — o'zgarishsiz.)

- [ ] **Step 7: `SeansEkrani`**

Importlarga: `import type { SinovHolati } from "./sinov-natijasi";`.

`yozildi` ref'idan keyin:

```ts
  // Oxirgi yuborilgan yakun — yakuniy sinov natijasini tekshirish yiqilsa,
  // «Qayta yuborish» aynan shu so'rovni takrorlaydi (yangi hisob-kitobsiz).
  const oxirgiYakun = React.useRef<Parameters<typeof abschluss.mutate>[0] | null>(null);
```

Effekt ichidagi `abschluss.mutate({ lessonId: darsLessonId, … }, { onError … })` chaqiruvini shunday o'zgartiring (tana va `onError` o'zgarmaydi, faqat so'rov ref'ga saqlanadi):

```ts
    const yakun = {
      lessonId: darsLessonId,
      richtig: holat.togri,
      gesamt: holat.jami,
      durationMs: tugashDavomiyligi.current,
      sessionId: holat.seansId,
    };
    oxirgiYakun.current = yakun;
    abschluss.mutate(yakun, {
      onError: (err) =>
        toast.error(getErrorMessage(err, "Natija saqlanmadi. Internetni tekshiring")),
    });
```

(`durationMs` ning tipi `number | null` bo'lsa, mavjud chaqiruvdagi bilan bir xil ifoda qoldiriladi.)

`qaytaOtish` ichida `yozildi.current = false;` qatoridan keyin: `abschluss.reset();` — oldingi urinishning natijasi yangi urinish ekraniga o'tib qolmasin.

`if (tugadimi(holat))` dan OLDIN:

```ts
  const natijaniQaytaYubor = () => {
    if (!oxirgiYakun.current) return;
    abschluss.mutate(oxirgiYakun.current, {
      onError: (err) =>
        toast.error(getErrorMessage(err, "Natija saqlanmadi. Internetni tekshiring")),
    });
  };

  // Dars turi `useLernenLesson` dan; javobning o'zi `sinov` olib kelsa ham
  // (masalan dars ma'lumoti hali yuklanmagan bo'lsa) sinov rejimi yoqiladi.
  const sinovMi =
    darsMi && (lesson.data?.kind === "UNIT_TEST" || abschluss.data?.sinov != null);
  const sinovHolati: SinovHolati | null = !sinovMi
    ? null
    : abschluss.isError
      ? { tur: "xato" }
      : abschluss.data?.sinov
        ? { tur: "tayyor", natija: abschluss.data.sinov }
        : abschluss.data
          ? null // eski server: `sinov` yo'q — oddiy natija ekrani
          : { tur: "kutilmoqda" };
```

`<NatijaEkrani … />` ga: `sinov={sinovHolati}` va `onNatijaQaytaYubor={natijaniQaytaYubor}`.

- [ ] **Step 8: Testlar, tip, lint**

Run: `cd client && npx vitest run && npm run typecheck && npx eslint src/components/student-portal/lernen`
Expected: hamma vitest PASS, typecheck toza, eslint 0 xato.

- [ ] **Step 9: Prettier va commit**

```bash
cd client
npx prettier --write src/components/student-portal/lernen/types.ts src/components/student-portal/lernen/uebung/sinov-natijasi.ts src/components/student-portal/lernen/uebung/sinov-natijasi.test.ts src/components/student-portal/lernen/uebung/natija-ekrani.tsx src/components/student-portal/lernen/uebung/seans-ekrani.tsx
cd ..
git add client/src/components/student-portal/lernen/types.ts client/src/components/student-portal/lernen/uebung/sinov-natijasi.ts client/src/components/student-portal/lernen/uebung/sinov-natijasi.test.ts client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx
git commit -m "Yakuniy sinov natija ekrani: o'tdi, o'tmadi, avval o'tgan

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Brauzer tekshiruvi va saytga chiqarish (controller)

Bu vazifani controller o'zi yuritadi (brauzer tekshiruvi — subagent, Playwright). Kod yozilmaydi.

- [ ] **Step 1: Butun shox ko'rigi** — `superpowers:requesting-code-review` (eng kuchli model), diapazon `origin/main..HEAD`, bu reja va dizayn bilan. Topilmalar bitta tuzatish to'lqinida yopiladi.

- [ ] **Step 2: Real brauzer (390×844 va 390×667), lokal server 4100 + client 3100, dev baza**
  - u01 yakuniy sinov darsi (`DafLesson.kind = 'UNIT_TEST'`, u01 unit) ochiladi → eski bo'sh sahifa EMAS, mashq ekrani; seans 15 savol (`holat.jami`), pastki menyu yo'q.
  - Natija ekranining to'rt holati: `…/abschluss` javobini `page.route` bilan almashtirib (server qoidasi Task 1 testlarida isbotlangan): kutilmoqda (javobni kechiktirib), o'tdi, o'tmadi, avval o'tgan + past, xato (500) → «Qayta yuborish» so'rovni takrorlaydi.
  - «Qayta urinish» yangi seans ochadi (yangi savollar, eski natija kartasi yo'qoladi).
  - Oddiy dars (`SECTION_A`) natija ekrani o'zgarmagan: «Qayta o'tish» / «Davom etish».
  - Konsolda xato yo'q, gorizontal skroll yo'q.

- [ ] **Step 3: PR va CI**

```bash
git push -u origin feat/a1-yakuniy-sinov
gh pr create --base main --head feat/a1-yakuniy-sinov --title "Yakuniy sinov: 15 savol, 90% bilan keyingi unit ochiladi" --body-file <tavsif>
gh pr checks <PR> --watch
```

CI yashil. (Server CI Toshkent 23:40–00:02 da `attendance.service.spec` bilan yiqilsa — vaqtga bog'liq begona test, 19:03 UTC dan keyin `gh run rerun <id> --failed`.)

- [ ] **Step 4: 🔒 DARVOZA — CEO ruxsati.** Ruxsatsiz merge/deploy qilinmaydi.

- [ ] **Step 5: Deploy (ruxsatdan keyin)**

```bash
gh pr merge <PR> --merge
git -C /Users/a1111/Desktop/daf-erp-system fetch origin
git -C /Users/a1111/Desktop/daf-erp-system worktree add --detach .worktrees/deploy-sinov origin/main
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/deploy-sinov
cp /Users/a1111/Desktop/daf-erp-system/server/railway.json server/
cp -R /Users/a1111/Desktop/daf-erp-system/client/.vercel client/
(cd server && npm ci && npm run build)                       # exit 0
railway link --project <proyekt-id> --environment production --service caring-courage   # id: ~/.railway/config.json — repoga yozilmaydi
(cd server && railway run npx prisma migrate status)         # faqat 20260914120000_daf_session_passed kutilmoqda
git -C . log --oneline <oxirgi deploy commiti>..origin/main   # boshqa chiqmagan ish yo'qligini tekshiring; bo'lsa CEO ga ayting
railway up server --path-as-root --detach                    # SUCCESS gacha kuting; migrate status → up to date
(cd client && vercel --prod --yes)
```

Seed kerak emas.

- [ ] **Step 6: Prod tekshiruvi (faqat o'qish)** — `DafSession.passed` ustuni bor; u01 va u02 `UNIT_TEST` darslarining id'lari topiladi va CEO ga u01 yakuniy sinovining to'g'ridan-to'g'ri havolasi beriladi (yo'l qulfi faqat interfeysda: `https://student.dafzentrum.uz/portal/lernen/lessons/<id>`); CEO telefonda: 15 savol, natija ekrani.

- [ ] **Step 7: Yakun** — deploy worktree o'chiriladi; xotira: `project_a1_hoeren.md` (yakuniy sinov PRODDA, ochiq ishlar ro'yxatidan olib tashlash), `project_a1_kurs_poydevor.md` (yakuniy sinov bo'sh emas), `project_student_app_usage_time.md` yoki ilova faolligi xotirasiga «Yakuniy sinovlar» bloki 3-bosqichga qo'shilgani.

---

## Self-Review

**Spec coverage:** §1 muammo → Task 2 (material) + Task 1 (`completedAt`); §2.1–2.2 (15 savol, 90 %) → Task 1 `yakuniy-sinov.ts`, Task 2 uzunlik; §2.3 cheklovsiz qayta topshirish → Task 3 «Qayta urinish» (`qaytaOtish` + `abschluss.reset`); §2.4 ochilgan unit yopilmaydi → Task 1 `avvalOtilgan`/`completedAt` saqlanishi + test; §2.5 server qarori → Task 1 `yakuniySinovniBaholash`; §2.6 ma'lumot muhrlanadi → Task 1 `DafSession.passed`; §3 o'quvchi tajribasi (to'rt holat) → Task 3; §4.1 material → Task 2 Step 4; §4.2 uzunlik va 2 ta muddati kelgan so'z → Task 2 Step 4–5; §4.3 moyillik izohi va eshitish dizayni → Task 2 Step 6; §4.4 o'zgarmaydigan qoidalar → Global Constraints + regressiya testlari; §5 → Task 1; §6 mijoz → Task 3; §7 qamrovdan tashqari — hech bir vazifa qurmaydi; §8 test → Task 1–3 testlari + Task 4 brauzer; §9 deploy → Task 4.

**Placeholder scan:** `<PR>`, `<tavsif>`, `<proyekt-id>`, `<oxirgi deploy commiti>`, `<id>` — faqat Task 4 dagi yuritish vaqtida ma'lum bo'ladigan qiymatlar (controller qadami); kod qadamlarida placeholder yo'q.

**Type consistency:** `YakuniySinovNatijasi { bestanden, avvalOtilgan, togri, jami, kerak }` server (Task 1) va mijoz (Task 3) da bir xil; `AbschlussNatija`/`AbschlussErgebnis.sinov?` mos; `UNIT_TEST_SAVOLLAR`/`otishUchunKerak`/`sinovdanOtdimi` Task 1 da ta'riflangan, Task 2 da ishlatiladi; `SinovHolati`/`sinovKorinishi` Task 3 ichida ta'riflangan va ishlatiladi.
