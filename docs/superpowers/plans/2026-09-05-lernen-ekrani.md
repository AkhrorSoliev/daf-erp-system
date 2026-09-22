# A1 mashq ekrani

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi brauzerda A1 ning 1-unitini ochib, darsni boshidan oxirigacha o'tadi — savolga javob beradi, xato qilsa savol boshqa formatda qaytadi, oxirida natijani ko'radi.

**Architecture:** Seans holati MIJOZDA yashaydi: server 12 savolni beradi, mijoz ularni navbat bilan ko'rsatadi. Navbatni yuritish — navbat, qaytish, sanoq — sof modulda va vitest bilan sinaladi; komponentlar yupqa qoladi. Serverga ikkita kichik yo'l qo'shiladi: xato javob uchun almashtiruvchi savol, va seans tugaganini yozish.

**Tech Stack:** Next.js (App Router), React Query, Lumio komponentlari, vitest (mijoz), NestJS + jest (server).

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-05-lernen-ekrani-design.md`. Ziddiyat chiqsa dizayn ustun.
- **To'g'ri javob mijozga faqat javob berilgandan KEYIN keladi.** Savol ro'yxatida u yo'q va bo'lishi ham mumkin emas.
- `studentId` faqat tokendan olinadi, hech qachon so'rov tanasidan.
- Ekran **telefon, katta planshet va desktopda** ishlaydi — bitta ustun, uchta chegara. Desktopda `1`–`4` va `Enter` klaviaturasi.
- **Mantiq sinaladi, ko'rinish emas.** Mijozda vitest bor va mavjud 11 test sof mantiqni sinaydi; komponent render qilinmaydi. Shu qoida saqlanadi.
- Xato javob navbat oxiriga qaytadi, **boshqa formatda**, va ko'pi bilan **bir marta**.
- `4/12` sanog'i — javob berilganlar emas, **tugatilganlar** soni.
- Barcha yozuvlar lotin alifbosidagi o'zbekcha. Kirill yoki arab harflari ishlatilmaydi.
- Ish `feat/lernen-ekrani` shoxida, `.worktrees/lernen-ekrani` worktree'sida. `git reset --hard` ishlatilmaydi.
- **Har server testidan oldin `cd server && npx prisma generate`** — `node_modules` asosiy repo bilan umumiy va mijoz tez-tez eskiradi.
- Har commit oldidan tegishli to'plam o'tishi shart: server uchun `cd server && npm test` va `npm run typecheck`, mijoz uchun `cd client && npm test`.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/daf/uebung/uebung.service.ts` | Ikki yangi metod: almashtiruvchi savol va seans yakuni |
| `server/src/daf/dto/uebung.dto.ts` | `AbschlussDto` |
| `server/src/daf/daf-portal.controller.ts` | Ikki yangi yo'l |
| `server/src/common/auth/branch-route-policy.ts` | Yo'llarni toifalash |
| `server/src/daf/daf-portal-read.service.ts` | Yo'l va unit javoblariga ilgarilash qo'shiladi |
| `client/src/components/student-portal/lernen/seans-navbat.ts` | Seans navbatining sof mantig'i |
| `client/src/components/student-portal/lernen/seans-navbat.test.ts` | Uning testlari |
| `client/src/components/student-portal/lernen/fortschritt.ts` | Qulf va ilgarilashning sof mantig'i |
| `client/src/components/student-portal/lernen/fortschritt.test.ts` | Uning testlari |
| `client/src/components/student-portal/lernen/types.ts` | `PublicFrage`, `PruefErgebnis`, ilgarilash tiplari |
| `client/src/components/student-portal/lernen/queries.ts` | Uchta yangi so'rov |
| `client/src/components/student-portal/lernen/uebung/tanlash.tsx` | Variant tanlash komponenti |
| `client/src/components/student-portal/lernen/uebung/yozish.tsx` | Yozib javob berish komponenti |
| `client/src/components/student-portal/lernen/uebung/yigish.tsx` | Bo'laklardan yig'ish komponenti |
| `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx` | Seansning qobig'i va natija ekrani |
| `client/src/components/student-portal/lernen/lernen-levels-page.tsx` | Yo'l sahifasi — qayta yoziladi |
| `client/src/components/student-portal/lernen/lernen-unit-page.tsx` | Unit sahifasi — qayta yoziladi |
| `client/src/app/(student-portal)/portal/lernen/lessons/[lessonId]/page.tsx` | Seans ekraniga ulanadi |

---

## Task 1: Serverga ikki yo'l

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.spec.ts`
- Modify: `server/src/daf/dto/uebung.dto.ts`
- Modify: `server/src/daf/daf-portal.controller.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `UebungService` ning mavjud xususiy metodlari (material yuklash, nomzod qurish).
- Produces:
  - `UebungService.ersatz(lessonId: number, studentId: number, itemType: 'WORT' | 'SATZ' | 'PHRASE', itemId: number, nichtFormat: FrageFormat): Promise<PublicFrage | null>`
  - `UebungService.abschluss(lessonId: number, input: { richtig: number; gesamt: number; durationMs?: number }, ctx: { studentId: number; companyId: number }): Promise<{ bestScore: number; runs: number }>`
  - `GET /student-portal/lernen/lessons/:id/uebung/ersatz`
  - `POST /student-portal/lernen/lessons/:id/abschluss`

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/uebung/uebung.service.spec.ts` ga qo'shing. Faylda
`fakePrisma()` yordamchisi allaqachon bor — o'shani ishlating.

```ts
describe('UebungService.ersatz', () => {
  it('shu material haqida boshqa formatda savol beradi', async () => {
    const prisma = fakePrisma();
    const f = await new UebungService(prisma as any).ersatz(100, 55, 'WORT', 1, 'WORT_UZ');
    expect(f).not.toBeNull();
    expect(f!.itemId).toBe(1);
    expect(f!.format).not.toBe('WORT_UZ');
  });

  it('to`g`ri javobni YUBORMAYDI', async () => {
    const prisma = fakePrisma();
    const f = await new UebungService(prisma as any).ersatz(100, 55, 'WORT', 1, 'WORT_UZ');
    expect(Object.keys(f!)).not.toContain('richtig');
    expect(Object.keys(f!)).not.toContain('akzeptiert');
  });

  it('boshqa format qolmasa null qaytaradi', async () => {
    // Materialda bitta so'z bo'lsa chalg'ituvchi yetmaydi va hech qanday
    // format qurilmaydi — bu xato emas, tabiiy holat.
    const prisma = fakePrisma();
    prisma.dafLexeme.findMany = jest.fn(async () => [
      { id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, sectionId: 7 },
    ]);
    prisma.dafSentence.findMany = jest.fn(async () => []);
    prisma.dafPhrase.findMany = jest.fn(async () => []);
    const f = await new UebungService(prisma as any).ersatz(100, 55, 'WORT', 1, 'WORT_UZ');
    expect(f).toBeNull();
  });

  it('dars topilmasa xato tashlaydi', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findUnique = jest.fn(async () => null);
    await expect(
      new UebungService(prisma as any).ersatz(999, 55, 'WORT', 1, 'WORT_UZ'),
    ).rejects.toThrow();
  });
});

describe('UebungService.abschluss', () => {
  const ctx = { studentId: 55, companyId: 1 };

  it('birinchi yakunda ilgarilashni yozadi', async () => {
    const prisma = fakePrisma();
    await new UebungService(prisma as any).abschluss(
      100, { richtig: 10, gesamt: 12, durationMs: 200000 }, ctx,
    );
    const call = prisma.dafLessonProgress.upsert.mock.calls[0][0] as any;
    expect(call.create.studentId).toBe(55);
    expect(call.create.lessonId).toBe(100);
    expect(call.create.bestScore).toBe(10);
    expect(call.create.runs).toBe(1);
    expect(call.create.completedAt).toBeInstanceOf(Date);
  });

  it('eng yaxshi ballni saqlaydi, oxirgisini emas', async () => {
    const prisma = fakePrisma();
    prisma.dafLessonProgress.findUnique = jest.fn(async () => ({
      id: 1, studentId: 55, lessonId: 100, bestScore: 11, runs: 2, completedAt: new Date(),
    }));
    await new UebungService(prisma as any).abschluss(
      100, { richtig: 7, gesamt: 12 }, ctx,
    );
    const call = prisma.dafLessonProgress.upsert.mock.calls[0][0] as any;
    expect(call.update.bestScore).toBe(11);
    expect(call.update.runs).toBe(3);
  });

  it('gesamt noldan katta bo`lishini talab qiladi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).abschluss(100, { richtig: 0, gesamt: 0 }, ctx),
    ).rejects.toThrow();
  });

  it('richtig gesamtdan katta bo`lolmaydi', async () => {
    const prisma = fakePrisma();
    await expect(
      new UebungService(prisma as any).abschluss(100, { richtig: 13, gesamt: 12 }, ctx),
    ).rejects.toThrow();
  });
});
```

`fakePrisma()` ga `dafLessonProgress` qo'shing, agar yo'q bo'lsa:

```ts
    dafLessonProgress: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 1 })),
    },
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/uebung/uebung.service.spec.ts`
Expected: FAIL — `ersatz is not a function`

- [ ] **Step 3: `ersatz` ni yozing**

`UebungService` ga metod qo'shing. U `seans` bilan bir xil yo'ldan boradi —
darsni va materialni o'qiydi, nomzodlarni quradi — lekin oxirida seans
qurmaydi: berilgan material uchun qurilgan nomzodlardan `nichtFormat` ga
teng bo'lmaganini bittasini tanlaydi.

Muhim: material yuklash va nomzod qurish `seans` da allaqachon bor. Ularni
takrorlamang — xususiy metodga ajratib, ikkalasi ham shuni chaqirsin.
Takrorlangan mantiq ikki joyda ikki xil o'zgaradi.

Izohda **nega bu yo'l borligini** yozing: xato javob boshqa formatda
qaytadi, savolni esa mijoz qura olmaydi va to'g'ri javobni bilmaydi.

- [ ] **Step 4: `abschluss` ni yozing**

```ts
  /**
   * Seans tugaganini yozadi.
   *
   * NEGA MIJOZ AYTADI. Server seans tugaganini o'zi bilmaydi: u savollarni
   * saqlamaydi va nechta savol berilganini eslamaydi. Bu D6 qarorining
   * ("savollar saqlanmaydi") tabiiy narxi.
   *
   * NEGA BU YETARLI. Mijoz "tugadi" deb yolg'on ayta oladi, lekin bundan
   * yutadigan narsa yo'q — keyingi dars ochiladi, xolos. Haqiqiy o'lchov
   * `DafAttempt` da: kim nechta savolga qanday javob berganini mijoz
   * o'zgartira olmaydi.
   */
  async abschluss(
    lessonId: number,
    input: { richtig: number; gesamt: number; durationMs?: number },
    ctx: { studentId: number; companyId: number },
  ): Promise<{ bestScore: number; runs: number }> {
    if (input.gesamt <= 0) {
      throw new BadRequestException("Seansda savol bo'lmagan");
    }
    if (input.richtig < 0 || input.richtig > input.gesamt) {
      throw new BadRequestException("To'g'ri javob soni savol sonidan oshib ketdi");
    }

    const oldingi = await this.prisma.dafLessonProgress.findUnique({
      where: { studentId_lessonId: { studentId: ctx.studentId, lessonId } },
    });

    // Eng yaxshi ball SAQLANADI, oxirgisi emas: qayta o'tish natijani
    // pasaytirmasligi kerak, aks holda o'quvchi mashq qilishdan qo'rqadi.
    const bestScore = Math.max(oldingi?.bestScore ?? 0, input.richtig);
    const runs = (oldingi?.runs ?? 0) + 1;

    await this.prisma.dafLessonProgress.upsert({
      where: { studentId_lessonId: { studentId: ctx.studentId, lessonId } },
      create: {
        studentId: ctx.studentId,
        lessonId,
        companyId: ctx.companyId,
        completedAt: new Date(),
        bestScore,
        runs,
      },
      update: { completedAt: new Date(), bestScore, runs },
    });

    return { bestScore, runs };
  }
```

`DafLessonProgress` da `@@unique([studentId, lessonId])` ALLAQACHON BOR
(`server/prisma/schema.prisma:3303`) — **migratsiya kerak emas**. Sxemaga
tegmang. Agar tegishga ehtiyoj bordek tuyulsa, to'xtang va sababini
xabar qiling: bu vazifada sxema o'zgarishi kutilmaydi.

`bestScore` maydonining sxemadagi izohi «12 dan nechtasi BIRINCHI URINISHDA
to'g'ri bo'lgan» deydi. Ya'ni `richtig` — birinchi urinishda to'g'ri
bo'lganlar soni; qayta so'ralib to'g'ri javob berilgan savol bunga
kirmaydi. Buni mijoz hisoblaydi (5-vazifa), server esa qabul qiladi.

- [ ] **Step 5: DTO va yo'llarni qo'shing**

`server/src/daf/dto/uebung.dto.ts` ga:

```ts
/**
 * Seans yakuni.
 *
 * `studentId` maydoni ATAYLAB YO'Q — u tokendan olinadi.
 */
export class AbschlussDto {
  @IsInt()
  @Min(0)
  richtig!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  gesamt!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}
```

Kontrollerga ikki yo'l. `ersatz` da so'rov parametrlari `@Query` orqali
olinadi va tiplari tekshiriladi.

- [ ] **Step 6: Route siyosatiga kiriting**

`GET .../uebung/ersatz` — `COMPANY_WIDE` yozuviga (kurs kontenti, filialga
bog'liq emas), alifbo tartibini saqlab.
`POST .../abschluss` — `SELF` yozuviga: u o'quvchining o'z ma'lumotiga
yozadi, `@CurrentUser('studentId')` ga tayanadi.

- [ ] **Step 7: Tasdiqlang va commit qiling**

Run: `cd server && npx jest src/daf/ branch-route-policy`
Expected: PASS.

Run: `cd server && npm test && npm run typecheck`
Expected: PASS, xatosiz.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/lernen-ekrani
git add server/src/daf/ server/src/common/auth/branch-route-policy.ts server/prisma/
git commit -m "Mashq: almashtiruvchi savol va seans yakuni yo'llari"
```

---

## Task 2: Yo'l va unit javoblariga ilgarilash

Bugun `getLevels()` va `getUnit()` `studentId` ni umuman olmaydi va
`DafLessonProgress` ni o'qimaydi. Shu sababli yo'l sahifasi `4/18` ni,
unit sahifasi esa qaysi seans ochiqligini ko'rsata olmaydi. Bu vazifa
shuni yopadi. Unit javobi ustiga bo'lim guruhlarini ham qo'shadi —
dizayn bo'yicha bo'limning o'z sahifasi yo'q, u guruh sarlavhasi.

**Files:**
- Modify: `server/src/daf/daf-portal-read.service.ts`
- Modify: `server/src/daf/daf-portal-read.service.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts`

**Interfaces:**
- Produces:
  - `getLevels(studentId: number)` — har unitga `doneCount: number` qo'shiladi
  - `getUnit(unitId: number, studentId: number)` — javobga `sections` va
    `finalTest` qo'shiladi, har darsga `kind`, `completedAt`, `bestScore`,
    `runs` qo'shiladi
- Consumes: hech narsa (1-vazifadan mustaqil)

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/daf-portal-read.service.spec.ts` da mavjud fake prisma
naqshini ishlating.

```ts
describe('getLevels — ilgarilash', () => {
  it('har unitga tugallangan seans sonini qo`shadi', async () => {
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      { id: 1, level: 'A1', order: 1, titleUz: 'Salom', titleDe: 'Hallo', _count: { lessons: 18 } },
      { id: 2, level: 'A1', order: 2, titleUz: 'Oila', titleDe: 'Familie', _count: { lessons: 0 } },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      { lesson: { unitId: 1 } }, { lesson: { unitId: 1 } }, { lesson: { unitId: 1 } },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const a1 = levels.find((l) => l.level === 'A1')!;
    expect(a1.units[0].doneCount).toBe(3);
    expect(a1.units[0].lessonCount).toBe(18);
    expect(a1.units[1].doneCount).toBe(0);
  });

  it('faqat SHU o`quvchining ilgarilashini so`raydi', async () => {
    const prisma = fakePrisma();
    await svc(prisma).getLevels(55);
    const where = (prisma.dafLessonProgress.findMany.mock.calls[0][0] as any).where;
    expect(where.studentId).toBe(55);
    // Tugallanmagan qator "tugallangan" deb sanalmaydi.
    expect(where.completedAt).toEqual({ not: null });
  });
});

describe('getUnit — bo`limlar va ilgarilash', () => {
  it('darslarni bo`lim bo`yicha guruhlaydi, tartibda', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 20, order: 2, code: 'u01-s2', titleUz: 'Ikki', titleDe: 'Zwei' },
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      { id: 1, order: 1, tier: null, kind: 'SECTION_A', sectionId: 10, titleDe: 'A', titleUz: 'A', _count: { lexemes: 5, exercises: 0 } },
      { id: 2, order: 2, kind: 'SECTION_B', sectionId: 10, tier: null, titleDe: 'B', titleUz: 'B', _count: { lexemes: 0, exercises: 0 } },
      { id: 3, order: 3, kind: 'BRIDGE', sectionId: 20, tier: null, titleDe: 'C', titleUz: 'C', _count: { lexemes: 0, exercises: 0 } },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.sections.map((s: any) => s.order)).toEqual([1, 2]);
    expect(unit.sections[0].lessons.map((l: any) => l.id)).toEqual([1, 2]);
    expect(unit.sections[1].lessons.map((l: any) => l.id)).toEqual([3]);
  });

  it('yakuniy sinovni alohida chiqaradi, bo`limlar ichida emas', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      { id: 1, order: 1, kind: 'SECTION_A', sectionId: 10, tier: null, titleDe: 'A', titleUz: 'A', _count: { lexemes: 0, exercises: 0 } },
      { id: 9, order: 9, kind: 'UNIT_TEST', sectionId: null, tier: null, titleDe: 'Test', titleUz: 'Sinov', _count: { lexemes: 0, exercises: 0 } },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.finalTest.id).toBe(9);
    expect(unit.sections.flatMap((s: any) => s.lessons).map((l: any) => l.id)).toEqual([1]);
  });

  it('yakuniy sinov yo`q bo`lsa null', async () => {
    const prisma = fakePrisma();
    prisma.dafLesson.findMany = jest.fn(async () => []);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.finalTest).toBeNull();
  });

  it('bo`limi yo`q eski DiB darsi yo`qolmaydi', async () => {
    // Eski 20 ta DiB uniti nafaqaga chiqarilgan, lekin ularning darslari
    // hali ham `sectionId: null`. Guruhlash ularni tushirib qoldirmasligi
    // kerak — `lessons` yassi ro'yxati saqlanadi.
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => []);
    prisma.dafLesson.findMany = jest.fn(async () => [
      { id: 5, order: 1, kind: null, sectionId: null, tier: 2, titleDe: 'Alt', titleUz: null, _count: { lexemes: 3, exercises: 4 } },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    expect(unit.lessons.map((l: any) => l.id)).toEqual([5]);
    expect(unit.sections).toEqual([]);
    expect(unit.finalTest).toBeNull();
  });

  it('har darsga o`quvchining ilgarilashini yopishtiradi', async () => {
    const prisma = fakePrisma();
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      { id: 1, order: 1, kind: 'SECTION_A', sectionId: 10, tier: null, titleDe: 'A', titleUz: 'A', _count: { lexemes: 0, exercises: 0 } },
      { id: 2, order: 2, kind: 'SECTION_B', sectionId: 10, tier: null, titleDe: 'B', titleUz: 'B', _count: { lexemes: 0, exercises: 0 } },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      { lessonId: 1, completedAt: new Date('2026-09-01'), bestScore: 11, runs: 2 },
    ]);
    const unit = await svc(prisma).getUnit(1, 55);
    const [a, b] = unit.sections[0].lessons;
    expect(a.bestScore).toBe(11);
    expect(a.runs).toBe(2);
    expect(a.completedAt).not.toBeNull();
    expect(b.bestScore).toBe(0);
    expect(b.runs).toBe(0);
    expect(b.completedAt).toBeNull();
  });
});
```

`fakePrisma()` ga kerakli bo'lsa quyidagilarni qo'shing:

```ts
    dafSection: { findMany: jest.fn(async () => []) },
    dafLessonProgress: { findMany: jest.fn(async () => []) },
```

`svc(prisma)` — faylda mavjud yordamchi; bo'lmasa yozing:

```ts
const svc = (prisma: any) =>
  new DafPortalReadService(prisma, { get: () => null } as any);
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/daf-portal-read.service.spec.ts`
Expected: FAIL — `unit.sections` aniqlanmagan, `doneCount` yo'q.

- [ ] **Step 3: `getLevels` ga ilgarilash qo'shing**

Imzoni `getLevels(studentId: number)` ga o'zgartiring. Unitlar
o'qilgandan keyin bitta qo'shimcha so'rov:

```ts
    // Tugallangan seanslar SANALADI, ro'yxati kerak emas: yo'l kartasida
    // faqat `4/18` ko'rinadi. `completedAt: { not: null }` shart —
    // qator seans boshlanganda emas, TUGAGANDA yoziladi, lekin
    // kelajakda boshqa yozuvchi paydo bo'lsa yarim qator sanalmasin.
    const bajarilgan = await this.prisma.dafLessonProgress.findMany({
      where: { studentId, completedAt: { not: null } },
      select: { lesson: { select: { unitId: true } } },
    });
    const bajarilganSoni = new Map<number, number>();
    for (const p of bajarilgan) {
      const u = p.lesson.unitId;
      bajarilganSoni.set(u, (bajarilganSoni.get(u) ?? 0) + 1);
    }
```

`units` xaritalashida `doneCount: bajarilganSoni.get(u.id) ?? 0` qo'shing.

`LevelPathItem` interfeysiga `doneCount: number` qo'shing.

- [ ] **Step 4: `getUnit` ga bo'limlar va ilgarilash qo'shing**

Imzoni `getUnit(unitId: number, studentId: number)` ga o'zgartiring.

Darslar tanlovi `kind` va `sectionId` ni ham olsin. Keyin:

```ts
    const sections = await this.prisma.dafSection.findMany({
      where: { unitId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, code: true, titleUz: true, titleDe: true },
    });

    const fortschritt = await this.prisma.dafLessonProgress.findMany({
      where: { studentId, lesson: { unitId } },
      select: { lessonId: true, completedAt: true, bestScore: true, runs: true },
    });
    const byLesson = new Map(fortschritt.map((f) => [f.lessonId, f]));

    const toItem = (l: (typeof lessons)[number]) => {
      const f = byLesson.get(l.id);
      return {
        id: l.id,
        order: l.order,
        tier: l.tier,
        kind: l.kind,
        titleDe: l.titleDe,
        titleUz: l.titleUz,
        wordCount: l._count.lexemes,
        exerciseCount: l._count.exercises,
        // `Date` obyekti JSON'da ISO satrga aylanadi — mijoz tipi
        // (`LernenSeans.completedAt: string | null`) shuni kutadi.
        completedAt: f?.completedAt ?? null,
        bestScore: f?.bestScore ?? 0,
        runs: f?.runs ?? 0,
      };
    };

    const alle = lessons.map(toItem);

    // Yakuniy sinov bo'lim ichida emas — u butun unitni sinaydi va
    // dizaynda oxirida alohida turadi.
    const finalTest = alle.find((l) => l.kind === 'UNIT_TEST') ?? null;
```

Bo'lim guruhlari (tartib `sections` dan keladi, darsniki `order` dan):

```ts
    const bySection = new Map<number, typeof alle>();
    for (const item of alle) {
      const raw = lessons.find((l) => l.id === item.id)!;
      if (raw.sectionId == null || item.kind === 'UNIT_TEST') continue;
      const list = bySection.get(raw.sectionId) ?? [];
      list.push(item);
      bySection.set(raw.sectionId, list);
    }

    const sectionGruppen = sections.map((s) => ({
      id: s.id,
      order: s.order,
      code: s.code,
      titleUz: s.titleUz,
      titleDe: s.titleDe,
      lessons: bySection.get(s.id) ?? [],
    }));
```

Javobga `sections: sectionGruppen` va `finalTest` qo'shing.
**`lessons: alle` ni QOLDIRING** — eski DiB unitlarining darslarida
`sectionId` yo'q va ular faqat shu yassi ro'yxatda ko'rinadi. Uni
o'chirish o'sha unitlarni bo'shatib qo'yardi.

- [ ] **Step 5: Kontrollerni ulang**

```ts
  @Get('levels')
  getLevels(@CurrentUser('studentId') studentId: number) {
    return this.read.getLevels(studentId);
  }

  @Get('units/:id')
  getUnit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.read.getUnit(id, studentId);
  }
```

Bu ikki yo'l route siyosati manifestida allaqachon bor. Toifasi
`COMPANY_WIDE` dan **`SELF` ga o'zgaradi**: endi javob o'quvchiga bog'liq.
Manifestni yangilang va sababni izohda yozing.

- [ ] **Step 6: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS. `getLevels`/`getUnit` chaqiruvlari o'zgargani uchun boshqa
testlar yiqilsa, ularni yangi imzoga moslang.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/lernen-ekrani
git status   # hech narsa qolmaganini tekshiring
git add server/src/daf/ server/src/common/auth/branch-route-policy.ts
git commit -m "Yo'l va unit javoblari o'quvchining ilgarilashini qaytaradi"
```

---

## Task 3: Seans navbatining sof mantig'i

Seansning butun qarori — navbat, xato javobning qaytishi, `4/12` sanog'i,
ikkinchi xatodan keyin to'xtash — shu faylda yashaydi. Komponentlar
(5-vazifa) yupqa qoladi: holatni ko'rsatadi, qaror qabul qilmaydi.
Shuning uchun bu vazifada React yo'q, JSX yo'q, so'rov yo'q — sof
funksiyalar.

**Files:**
- Create: `client/src/components/student-portal/lernen/seans-navbat.ts`
- Create: `client/src/components/student-portal/lernen/seans-navbat.test.ts`
- Modify: `client/src/components/student-portal/lernen/types.ts`

**Interfaces:**
- Produces:
  - `types.ts` da: `FrageFormat`, `PublicFrage`, `PruefErgebnis`
  - `boshla(fragen: PublicFrage[]): SeansHolati`
  - `joriy(h: SeansHolati): PublicFrage | null`
  - `tugadimi(h: SeansHolati): boolean`
  - `javobBerildi(h, natija: PruefErgebnis): { holat: SeansHolati; ersatzSoralsinmi: boolean }`
  - `ersatzKeldi(h: SeansHolati, frage: PublicFrage | null): SeansHolati`
- Consumes: hech narsa

- [ ] **Step 1: Tiplarni qo'shing**

`client/src/components/student-portal/lernen/types.ts` ga qo'shing. Fayl
tepasidagi izoh («TO'G'RI JAVOB YO'Q») shu tiplarga ham tegishli.

```ts
export type FrageFormat =
  | "WORT_UZ"
  | "UZ_WORT"
  | "PAAR"
  | "ARTIKEL"
  | "LUECKE"
  | "SATZ_BAUEN"
  | "SATZ_UEBERSETZEN"
  | "REAKTION";

export type MaterialTyp = "WORT" | "SATZ" | "PHRASE";

/** Serverdan kelgan savol. To'g'ri javob bu yerda YO'Q. */
export interface PublicFrage {
  index: number;
  format: FrageFormat;
  itemType: MaterialTyp;
  itemId: number;
  prompt: string;
  hilfe: string | null;
  options: string[];
}

/** Javob tekshirilgandan KEYIN keladi — faqat shunda to'g'ri javob ma'lum. */
export interface PruefErgebnis {
  isCorrect: boolean;
  richtig: string;
}

export interface AbschlussErgebnis {
  bestScore: number;
  runs: number;
}
```

- [ ] **Step 2: Yiqiladigan testni yozing**

`client/src/components/student-portal/lernen/seans-navbat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PublicFrage } from "./types";
import {
  boshla,
  ersatzKeldi,
  javobBerildi,
  joriy,
  tugadimi,
} from "./seans-navbat";

function f(id: number, format: PublicFrage["format"] = "WORT_UZ"): PublicFrage {
  return {
    index: id,
    format,
    itemType: "WORT",
    itemId: id,
    prompt: `savol ${id}`,
    hilfe: null,
    options: ["a", "b", "c", "d"],
  };
}

const OK = { isCorrect: true, richtig: "a" };
const XATO = { isCorrect: false, richtig: "a" };

describe("boshla", () => {
  it("navbatni va sanoqni tayyorlaydi", () => {
    const h = boshla([f(1), f(2), f(3)]);
    expect(h.jami).toBe(3);
    expect(h.tugatilgan).toBe(0);
    expect(h.togri).toBe(0);
    expect(joriy(h)?.itemId).toBe(1);
    expect(tugadimi(h)).toBe(false);
  });

  it("bo`sh ro`yxat darhol tugagan seans", () => {
    const h = boshla([]);
    expect(tugadimi(h)).toBe(true);
    expect(h.jami).toBe(0);
  });
});

describe("to`g`ri javob", () => {
  it("savolni tugatadi va keyingisiga o`tadi", () => {
    const { holat, ersatzSoralsinmi } = javobBerildi(boshla([f(1), f(2)]), OK);
    expect(ersatzSoralsinmi).toBe(false);
    expect(holat.tugatilgan).toBe(1);
    expect(holat.togri).toBe(1);
    expect(joriy(holat)?.itemId).toBe(2);
  });
});

describe("birinchi xato javob", () => {
  it("almashtiruvchi savol so`ralishini bildiradi", () => {
    const { holat, ersatzSoralsinmi } = javobBerildi(boshla([f(1), f(2)]), XATO);
    expect(ersatzSoralsinmi).toBe(true);
    // TUGATILMAGAN: savol hali qaytishi kerak.
    expect(holat.tugatilgan).toBe(0);
    expect(holat.togri).toBe(0);
    expect(joriy(holat)?.itemId).toBe(2);
  });

  it("xatoni to`g`ri javobi bilan yozib qo`yadi", () => {
    const { holat } = javobBerildi(boshla([f(1)]), { isCorrect: false, richtig: "das Haus" });
    expect(holat.xatolar).toEqual([
      { itemType: "WORT", itemId: 1, prompt: "savol 1", richtig: "das Haus" },
    ]);
  });
});

describe("almashtiruvchi savol", () => {
  it("navbat OXIRIGA qo`yiladi, darhol takrorlanmaydi", () => {
    const { holat } = javobBerildi(boshla([f(1), f(2), f(3)]), XATO);
    const h = ersatzKeldi(holat, f(1, "UZ_WORT"));
    expect(h.navbat.map((q) => q.itemId)).toEqual([2, 3, 1]);
    expect(h.navbat[2].format).toBe("UZ_WORT");
  });

  it("null kelsa savol tugatilgan hisoblanadi", () => {
    // Material tugagan: boshqa format qurib bo`lmaydi. Bu xato emas —
    // dars davom etadi, so`z ertaga Leitner orqali qaytadi.
    const { holat } = javobBerildi(boshla([f(1)]), XATO);
    const h = ersatzKeldi(holat, null);
    expect(h.tugatilgan).toBe(1);
    expect(h.togri).toBe(0);
    expect(tugadimi(h)).toBe(true);
  });
});

describe("qaytgan savol", () => {
  it("to`g`ri javob bersa tugaydi, lekin BALLGA kirmaydi", () => {
    // `bestScore` ta'rifi: birinchi urinishda to'g'ri bo'lganlar soni.
    const a = javobBerildi(boshla([f(1)]), XATO).holat;
    const b = ersatzKeldi(a, f(1, "ARTIKEL"));
    const c = javobBerildi(b, OK).holat;
    expect(c.tugatilgan).toBe(1);
    expect(c.togri).toBe(0);
    expect(tugadimi(c)).toBe(true);
  });

  it("ikkinchi marta ham xato bo`lsa TO`XTAYDI — ikkinchi qaytish yo`q", () => {
    const a = javobBerildi(boshla([f(1)]), XATO).holat;
    const b = ersatzKeldi(a, f(1, "ARTIKEL"));
    const c = javobBerildi(b, XATO);
    expect(c.ersatzSoralsinmi).toBe(false);
    expect(c.holat.tugatilgan).toBe(1);
    expect(tugadimi(c.holat)).toBe(true);
  });

  it("xatoni ikki marta yozmaydi", () => {
    const a = javobBerildi(boshla([f(1)]), XATO).holat;
    const b = ersatzKeldi(a, f(1, "ARTIKEL"));
    const c = javobBerildi(b, XATO).holat;
    expect(c.xatolar).toHaveLength(1);
  });
});

describe("sanoq", () => {
  it("tugatilgan hech qachon jamidan oshmaydi", () => {
    let h = boshla([f(1), f(2)]);
    const r1 = javobBerildi(h, XATO);
    h = ersatzKeldi(r1.holat, f(1, "ARTIKEL"));
    h = javobBerildi(h, OK).holat; // 2-savol
    h = javobBerildi(h, OK).holat; // qaytgan 1-savol
    expect(h.tugatilgan).toBe(2);
    expect(h.jami).toBe(2);
    expect(tugadimi(h)).toBe(true);
  });

  it("kirish holatini o`zgartirmaydi", () => {
    const h = boshla([f(1), f(2)]);
    javobBerildi(h, OK);
    expect(h.tugatilgan).toBe(0);
    expect(h.navbat).toHaveLength(2);
  });
});

describe("bo`sh navbatda javob", () => {
  it("xato tashlaydi — bu chaqiruvchining xatosi", () => {
    expect(() => javobBerildi(boshla([]), OK)).toThrow();
  });
});
```

- [ ] **Step 3: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/seans-navbat.test.ts`
Expected: FAIL — modul topilmaydi.

- [ ] **Step 4: Modulni yozing**

```ts
import type { MaterialTyp, PruefErgebnis, PublicFrage } from "./types";

/** Natija ekranida ko'rsatiladigan xato. */
export interface SeansXato {
  itemType: MaterialTyp;
  itemId: number;
  prompt: string;
  richtig: string;
}

/**
 * Seansning butun holati. O'zgarmas (immutable): har funksiya YANGI
 * holat qaytaradi. Sabab — React holati sifatida ishlatiladi va joyida
 * o'zgartirilgan obyekt qayta chizilmaydi.
 */
export interface SeansHolati {
  /** Boshlang'ich savol soni. Almashtiruvchilar buni oshirmaydi. */
  jami: number;
  /** Qolgan savollar; birinchisi — joriy. */
  navbat: PublicFrage[];
  /** Endi hech qachon qaytmaydigan savollar soni. `4/12` ning `4`i. */
  tugatilgan: number;
  /** BIRINCHI urinishda to'g'ri bo'lganlar. `bestScore` shu. */
  togri: number;
  xatolar: SeansXato[];
  /** Qaytish huquqini ISHLATGAN material kalitlari (`WORT:5`). */
  qaytganlar: string[];
}

function kalit(f: PublicFrage): string {
  return `${f.itemType}:${f.itemId}`;
}

export function boshla(fragen: PublicFrage[]): SeansHolati {
  return {
    jami: fragen.length,
    navbat: [...fragen],
    tugatilgan: 0,
    togri: 0,
    xatolar: [],
    qaytganlar: [],
  };
}

export function joriy(h: SeansHolati): PublicFrage | null {
  return h.navbat[0] ?? null;
}

export function tugadimi(h: SeansHolati): boolean {
  return h.navbat.length === 0;
}

/**
 * Javob tekshirilgandan keyin chaqiriladi.
 *
 * `ersatzSoralsinmi: true` — chaqiruvchi serverdan boshqa formatdagi
 * savolni so'rab, natijani `ersatzKeldi` ga uzatishi SHART. Aks holda
 * `tugatilgan` hech qachon `jami` ga yetmaydi va seans tugamaydi.
 */
export function javobBerildi(
  h: SeansHolati,
  natija: PruefErgebnis,
): { holat: SeansHolati; ersatzSoralsinmi: boolean } {
  const frage = joriy(h);
  if (!frage) {
    throw new Error("Bo'sh navbatda javob berildi");
  }

  const qolgan = h.navbat.slice(1);
  const k = kalit(frage);
  const qaytganEdi = h.qaytganlar.includes(k);

  if (natija.isCorrect) {
    return {
      holat: {
        ...h,
        navbat: qolgan,
        tugatilgan: h.tugatilgan + 1,
        // Qaytgan savol to'g'ri bo'lsa ham ballga kirmaydi: `bestScore`
        // «birinchi urinishda nechtasi to'g'ri» degani.
        togri: qaytganEdi ? h.togri : h.togri + 1,
      },
      ersatzSoralsinmi: false,
    };
  }

  // Xato faqat BIRINCHI marta yoziladi — natija ekranida bir so'z ikki
  // marta chiqmasligi uchun.
  const xatolar = qaytganEdi
    ? h.xatolar
    : [
        ...h.xatolar,
        {
          itemType: frage.itemType,
          itemId: frage.itemId,
          prompt: frage.prompt,
          richtig: natija.richtig,
        },
      ];

  if (qaytganEdi) {
    // Ikkinchi xato: to'g'ri javob ko'rsatildi va dars davom etadi.
    // Cheksiz aylanish o'quvchini qamab qo'yardi.
    return {
      holat: { ...h, navbat: qolgan, tugatilgan: h.tugatilgan + 1, xatolar },
      ersatzSoralsinmi: false,
    };
  }

  return {
    holat: {
      ...h,
      navbat: qolgan,
      xatolar,
      qaytganlar: [...h.qaytganlar, k],
    },
    ersatzSoralsinmi: true,
  };
}

/**
 * Serverdan almashtiruvchi savol keldi (yoki kelmadi).
 *
 * `null` — bu material uchun boshqa format qurib bo'lmadi. Savol
 * tugatilgan hisoblanadi: so'z ertaga Leitner jadvali orqali qaytadi.
 */
export function ersatzKeldi(
  h: SeansHolati,
  frage: PublicFrage | null,
): SeansHolati {
  if (!frage) {
    return { ...h, tugatilgan: h.tugatilgan + 1 };
  }
  return { ...h, navbat: [...h.navbat, frage] };
}
```

- [ ] **Step 5: Testlar o'tishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/seans-navbat.test.ts`
Expected: PASS, 12 test.

Run: `cd client && npm test`
Expected: PASS, boshqa hech narsa yiqilmagan.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/lernen-ekrani
git status
git add client/src/components/student-portal/lernen/
git commit -m "Seans navbatining sof mantig'i"
```

---

## Task 4: So'rovlar va uchta javob komponenti

Sakkiz format uchta harakatga yig'iladi (dizayn §4.1): **Tanlash**,
**Yozish**, **Yig'ish**. Bu vazifa o'sha uchta komponentni va ular
ishlatadigan so'rovlarni yozadi. Komponentlar seansni bilmaydi — ular
faqat bitta savolni ko'rsatadi va tanlovni yuqoriga uzatadi. Seansni
5-vazifa yig'adi.

Uslub `mc-exercise.tsx` dan olinadi: `rounded-2xl border-2`, `bg-tint`,
`text-ink-800`, tanlangan `border-coral-500 bg-coral-500/10`, to'g'ri
`border-success`, xato `border-danger`.

**Files:**
- Modify: `client/src/components/student-portal/lernen/queries.ts`
- Create: `client/src/components/student-portal/lernen/uebung/tanlash.tsx`
- Create: `client/src/components/student-portal/lernen/uebung/yozish.tsx`
- Create: `client/src/components/student-portal/lernen/uebung/yigish.tsx`
- Create: `client/src/components/student-portal/lernen/uebung/koersatma.ts`
- Create: `client/src/components/student-portal/lernen/uebung/koersatma.test.ts`

**Interfaces:**
- Consumes: 3-vazifadan `PublicFrage`, `PruefErgebnis`, `AbschlussErgebnis`
- Produces:
  - `useUebungSeans(lessonId)`, `usePruefen()`, `useErsatz()`, `useAbschluss()`
  - `<Tanlash>`, `<Yozish>`, `<Yigish>` va `koersatma(format)`

- [ ] **Step 1: So'rovlarni qo'shing**

`queries.ts` ga (mavjud `BASE` va `api` naqshini saqlab):

```ts
/** Darsning 12 savoli. To'g'ri javoblar ichida YO'Q. */
export function useUebungSeans(lessonId: number) {
  return useQuery<PublicFrage[]>({
    queryKey: ["lernen", "uebung", lessonId],
    queryFn: () =>
      api.get(`${BASE}/lessons/${lessonId}/uebung`).then((r) => r.data),
    enabled: Number.isFinite(lessonId),
    // Seans holati mijozda; qayta so'rash yangi 12 savol keltirardi va
    // o'quvchining o'rnini yo'qotardi.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** Javobni tekshiradi. To'g'ri javob FAQAT shu javobda keladi. */
export function usePruefen() {
  return useMutation<
    PruefErgebnis,
    unknown,
    {
      itemType: MaterialTyp;
      itemId: number;
      format: FrageFormat;
      given: string;
      durationMs?: number;
    }
  >({
    mutationFn: (body) =>
      api.post(`${BASE}/uebung/check`, body).then((r) => r.data),
  });
}

/**
 * Xato javobdan keyingi almashtiruvchi savol — boshqa formatda.
 *
 * `useQuery` emas, `useMutation`: u imperativ chaqiriladi (javob
 * xato bo'lgan paytda), sahifa yuklanganda emas.
 */
export function useErsatz() {
  return useMutation<
    PublicFrage | null,
    unknown,
    { lessonId: number; itemType: MaterialTyp; itemId: number; nichtFormat: FrageFormat }
  >({
    mutationFn: ({ lessonId, itemType, itemId, nichtFormat }) =>
      api
        .get(`${BASE}/lessons/${lessonId}/uebung/ersatz`, {
          params: { itemType, itemId, nichtFormat },
        })
        .then((r) => r.data ?? null),
  });
}

/** Seans tugaganini yozadi va ilgarilash keshini bekor qiladi. */
export function useAbschluss() {
  const qc = useQueryClient();
  return useMutation<
    AbschlussErgebnis,
    unknown,
    { lessonId: number; richtig: number; gesamt: number; durationMs?: number }
  >({
    mutationFn: ({ lessonId, ...body }) =>
      api.post(`${BASE}/lessons/${lessonId}/abschluss`, body).then((r) => r.data),
    // Yo'l va unit sahifalari ilgarilashni ko'rsatadi — usiz o'quvchi
    // orqaga qaytganda keyingi dars hamon qulflangan bo'lib ko'rinardi.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lernen", "levels"] });
      void qc.invalidateQueries({ queryKey: ["lernen", "unit"] });
    },
  });
}
```

`useQueryClient` ni `@tanstack/react-query` dan import qiling va yangi
tiplarni `./types` importiga qo'shing.

- [ ] **Step 2: Ko'rsatma matni uchun yiqiladigan testni yozing**

Ko'rsatma serverdan kelmaydi — u formatdan chiqadi va interfeys matni
(dizayn §4.2). Sof funksiya, shuning uchun sinaladi.

`client/src/components/student-portal/lernen/uebung/koersatma.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { koersatma } from "./koersatma";
import type { FrageFormat } from "../types";

const HAMMASI: FrageFormat[] = [
  "WORT_UZ", "UZ_WORT", "PAAR", "ARTIKEL",
  "LUECKE", "SATZ_BAUEN", "SATZ_UEBERSETZEN", "REAKTION",
];

describe("koersatma", () => {
  it("har sakkiz formatga matn beradi", () => {
    for (const f of HAMMASI) {
      expect(koersatma(f).length).toBeGreaterThan(0);
    }
  });

  it("formatlarni farqlaydi", () => {
    expect(koersatma("WORT_UZ")).not.toBe(koersatma("UZ_WORT"));
    expect(koersatma("ARTIKEL")).not.toBe(koersatma("LUECKE"));
  });
});
```

- [ ] **Step 3: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/koersatma.test.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 4: `koersatma.ts` ni yozing**

```ts
import type { FrageFormat } from "../types";

/**
 * Savol ustidagi bir qatorlik ko'rsatma.
 *
 * Server buni yubormaydi: bu interfeys matni, kontent emas. Serverga
 * qo'yilsa, matnni o'zgartirish uchun backend deploy kerak bo'lardi.
 */
const MATN: Record<FrageFormat, string> = {
  WORT_UZ: "Bu so'z nimani anglatadi?",
  UZ_WORT: "Nemischasini tanlang",
  PAAR: "So'zlarni tarjimasi bilan juftlang",
  ARTIKEL: "Artiklni tanlang",
  LUECKE: "Bo'sh joyni to'ldiring",
  SATZ_BAUEN: "So'zlardan gap tuzing",
  SATZ_UEBERSETZEN: "Gapning tarjimasini tanlang",
  REAKTION: "Nima deb javob berasiz?",
};

export function koersatma(format: FrageFormat): string {
  return MATN[format];
}

/** Format qaysi komponent bilan ko'rsatiladi (dizayn §4.1). */
export function harakat(format: FrageFormat): "TANLASH" | "YOZISH" | "YIGISH" {
  if (format === "LUECKE") return "YOZISH";
  if (format === "SATZ_BAUEN" || format === "PAAR") return "YIGISH";
  return "TANLASH";
}
```

`harakat` uchun ham test qo'shing: sakkiz formatning har biri uchtadan
biriga tushishi, va `PAAR` ning `YIGISH` ekani.

- [ ] **Step 5: `tanlash.tsx` ni yozing**

```tsx
"use client";

import * as React from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

export interface TanlashProps {
  options: string[];
  tanlangan: string | null;
  onTanla: (v: string) => void;
  natija: PruefErgebnis | null;
}

/**
 * Variant tanlash: `WORT_UZ`, `UZ_WORT`, `ARTIKEL`, `SATZ_UEBERSETZEN`,
 * `REAKTION`.
 *
 * TO'G'RI JAVOB PROPS'DA YO'Q. U `natija` ichida, javob yuborilgandan
 * KEYIN keladi — `mc-exercise.tsx` dagi qoida shu yerda ham amal qiladi.
 */
export function Tanlash({ options, tanlangan, onTanla, natija }: TanlashProps) {
  // Qisqa variantlar planshet va desktopda ikki ustunda — artikl
  // savolida uchta so'z ekranning uchdan birini egallab turishi
  // bo'sh joyni behuda sarflardi.
  const qisqa = options.every((o) => o.length <= 14);

  return (
    <div className={cn("grid gap-2.5", qisqa ? "sm:grid-cols-2" : "grid-cols-1")}>
      {options.map((opt, i) => {
        const bosilgan = tanlangan === opt;
        const togri = natija != null && opt === natija.richtig;
        const xatoTanlov = natija != null && bosilgan && !natija.isCorrect;

        return (
          <button
            key={opt}
            type="button"
            disabled={natija != null}
            onClick={() => onTanla(opt)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl border-2 px-4 py-3.5 text-left font-semibold transition-colors",
              "border-transparent bg-tint text-ink-800",
              bosilgan && !natija && "border-coral-500 bg-coral-500/10",
              togri && "border-success bg-success/10 text-success",
              xatoTanlov && "border-danger bg-danger/10 text-danger",
              natija != null && "cursor-default",
            )}
          >
            {/* Klaviatura raqami faqat desktopda ko'rinadi — telefonda
                bosiladigan raqam yo'q va u faqat chalg'itardi. */}
            <span className="hidden w-5 shrink-0 text-center text-sm text-ink-400 lg:inline">
              {i + 1}
            </span>
            {togri ? (
              <CheckCircle size={20} weight="fill" />
            ) : xatoTanlov ? (
              <XCircle size={20} weight="fill" />
            ) : null}
            <span className="min-w-0 flex-1">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `yozish.tsx` ni yozing**

Faqat `LUECKE`. Kirish maydoni, `natija` kelgach o'chiriladi va ramkasi
rangga bo'yaladi. Nemis harflari uchun tugmalar qatori (`ä ö ü ß`) —
o'zbek klaviaturasida ular yo'q; bosilganda kursor o'rniga qo'shiladi.
Server `ä/ae` va `ß/ss` ni kechiradi, lekin to'g'ri yozish osonroq
bo'lishi kerak.

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

export interface YozishProps {
  qiymat: string;
  onYoz: (v: string) => void;
  natija: PruefErgebnis | null;
  /** Enter bosilganda — desktopda tekshirish/keyingi. */
  onEnter: () => void;
}

const UMLAUT = ["ä", "ö", "ü", "ß"];

export function Yozish({ qiymat, onYoz, natija, onEnter }: YozishProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  // Savol almashganda maydon o'zi fokuslanadi: aks holda o'quvchi har
  // savolda maydonni qo'li bilan bosishi kerak bo'lardi.
  React.useEffect(() => {
    if (!natija) ref.current?.focus();
  }, [natija]);

  return (
    <div className="space-y-3">
      <input
        ref={ref}
        value={qiymat}
        disabled={natija != null}
        onChange={(e) => onYoz(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Javobingiz"
        className={cn(
          "w-full rounded-2xl border-2 bg-tint px-4 py-3.5 text-lg font-semibold text-ink-900 outline-none",
          "border-transparent focus:border-coral-500",
          natija?.isCorrect && "border-success text-success",
          natija != null && !natija.isCorrect && "border-danger text-danger",
        )}
      />
      {natija == null ? (
        <div className="flex gap-2">
          {UMLAUT.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => {
                onYoz(qiymat + ch);
                ref.current?.focus();
              }}
              className="h-10 w-10 rounded-xl bg-tint font-semibold text-ink-700"
            >
              {ch}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: `yigish.tsx` ni yozing**

Ikki format, bitta komponent:

- `SATZ_BAUEN` — `options` gapning aralashtirilgan so'zlari. O'quvchi
  ularni bosib tartibga teradi; javob `tanlangan.join(" ")`.
- `PAAR` — `options` aynan sakkizta: **birinchi to'rttasi nemischa**
  (chap ustun, tartibi o'zgarmaydi), **oxirgi to'rttasi o'zbekcha**
  (aralashtirilgan). O'quvchi chapdagini, keyin o'ngdagini bosib
  juftlaydi; javob `de=uz|de=uz|de=uz|de=uz` ko'rinishida — bu shaklni
  server `pruefePaar` da shunday kutadi.

```tsx
export interface YigishProps {
  format: "SATZ_BAUEN" | "PAAR";
  options: string[];
  /**
   * `SATZ_BAUEN` — tanlangan so'zlar tartibi.
   * `PAAR` — juftlar, `de=uz` satrlari.
   */
  tanlangan: string[];
  onOzgar: (next: string[]) => void;
  natija: PruefErgebnis | null;
}
```

`SATZ_BAUEN`: tepada yig'ilgan gap (bosilsa so'z qaytadi), pastda qolgan
bo'laklar. Bir xil so'z gapda ikki marta uchrashi mumkin (`ich bin ...
ich`), shuning uchun **kalit sifatida so'zning o'zi emas, indeks
ishlatiladi** — aks holda React ikkinchisini birinchisi deb hisoblab,
noto'g'ri bo'lakni o'chirardi.

`PAAR`: ikki ustun. Chapdagi bosilganda «tanlangan» bo'ladi, o'ngdagi
bosilganda juft yopiladi va ikkalasi ham xira/belgilangan holatga
o'tadi. Juftni bosib bekor qilish mumkin. Barcha to'rt juft yopilmaguncha
javob to'liq emas — buni 5-vazifadagi «Tekshirish» tugmasi tekshiradi
(`tanlangan.length === 4`).

Natija kelganda: `PAAR` da server `richtig` ni `de=uz|…` ko'rinishida
qaytaradi; uni bo'lib, har juftni alohida yashil/qizil qilib ko'rsating.

- [ ] **Step 8: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit`
Expected: PASS, tip xatosi yo'q.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/lernen-ekrani
git status
git add client/src/components/student-portal/lernen/
git commit -m "Uchta javob komponenti va mashq so'rovlari"
```

---

## Task 5: Seans ekrani

Bu vazifa 3-vazifaning mantig'ini 4-vazifaning komponentlariga ulaydi:
bitta savol butun ekranda, tepada ilgarilash, pastda bitta katta tugma,
oxirida natija ekrani.

Mavjud `lernen-lesson-page.tsx` — Faza 2 ning eski dars sahifasi
(lug'at + `McExercise` ro'yxati). U **o'chirilmaydi**: eski DiB
darslarida hali ham mashqlar bor va yagona ko'rinishi shu. Yangi ekran
yonida turadi va marshrut qaysi birini ochishni tanlaydi.

**Files:**
- Create: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`
- Create: `client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx`
- Modify: `client/src/app/(student-portal)/portal/lernen/lessons/[lessonId]/page.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-lesson-page.tsx`

**Interfaces:**
- Consumes: 3-vazifadan `boshla`/`joriy`/`tugadimi`/`javobBerildi`/`ersatzKeldi`
  va `SeansHolati`/`SeansXato` tiplari,
  4-vazifadan `Tanlash`/`Yozish`/`Yigish`/`koersatma`/`harakat` va to'rt so'rov
- Produces: `<SeansEkrani lessonId={n} />`

- [ ] **Step 1: Marshrutni tanlang**

`lessons/[lessonId]/page.tsx` ni yangi ekranga ulang:

```tsx
import { SeansEkrani } from "@/components/student-portal/lernen/uebung/seans-ekrani";

export default async function Page({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <SeansEkrani lessonId={Number(lessonId)} />;
}
```

`SeansEkrani` ichida: seans so'rovi bo'sh massiv qaytarsa (yangi
dvigatel bu dars uchun savol qura olmadi — masalan eski DiB darsi),
**eski `LernenLessonPage` ga tushiladi**. Shu bilan Faza 2 ning
darslari ishlashda davom etadi va yangi kurs yangi ekranni oladi.

- [ ] **Step 2: `seans-ekrani.tsx` ni yozing**

Holat:

```tsx
const [holat, setHolat] = React.useState<SeansHolati | null>(null);
const [tanlangan, setTanlangan] = React.useState<string | null>(null);
const [yozilgan, setYozilgan] = React.useState("");
const [yigilgan, setYigilgan] = React.useState<string[]>([]);
const [natija, setNatija] = React.useState<PruefErgebnis | null>(null);
const [savolBoshi, setSavolBoshi] = React.useState(() => Date.now());
const [seansBoshi] = React.useState(() => Date.now());
```

Seans kelganda bir marta `setHolat(boshla(fragen))`.

Joriy savolning javobi (`given`) formatga qarab yig'iladi:

```tsx
const frage = holat ? joriy(holat) : null;
const rejim = frage ? harakat(frage.format) : null;

const given =
  rejim === "TANLASH" ? (tanlangan ?? "")
  : rejim === "YOZISH" ? yozilgan.trim()
  : frage?.format === "SATZ_BAUEN" ? yigilgan.join(" ")
  : yigilgan.join("|");   // PAAR: `de=uz|de=uz|…`

const tayyor =
  rejim === "TANLASH" ? tanlangan != null
  : rejim === "YOZISH" ? yozilgan.trim().length > 0
  : frage?.format === "PAAR" ? yigilgan.length === 4
  : yigilgan.length > 0;
```

«Tekshirish»:

```tsx
const tekshir = () => {
  if (!frage || !tayyor || natija || pruefen.isPending) return;
  pruefen.mutate(
    {
      itemType: frage.itemType,
      itemId: frage.itemId,
      format: frage.format,
      given,
      durationMs: Date.now() - savolBoshi,
    },
    { onSuccess: setNatija },
  );
};
```

«Keyingi» — bu yerda seans oldinga suriladi:

```tsx
const keyingi = async () => {
  if (!holat || !frage || !natija) return;
  const { holat: yangi, ersatzSoralsinmi } = javobBerildi(holat, natija);

  let keyingiHolat = yangi;
  if (ersatzSoralsinmi) {
    // So'rov yiqilsa `null` deb qaraladi: savol tugatilgan hisoblanadi
    // va seans tugaydi. Aks holda `tugatilgan` hech qachon `jami` ga
    // yetmay, o'quvchi natija ekranini ko'rmay qolardi.
    const ersatz = await ersatzSoro(frage).catch(() => null);
    keyingiHolat = ersatzKeldi(yangi, ersatz);
  }

  setHolat(keyingiHolat);
  setNatija(null);
  setTanlangan(null);
  setYozilgan("");
  setYigilgan([]);
  setSavolBoshi(Date.now());
};
```

Seans tugaganda (`tugadimi(holat)`) bir marta `abschluss` yuboriladi —
`React.useRef<boolean>` bilan qo'riqlanadi, aks holda qayta chizilishda
`runs` bir necha marta oshib ketardi:

```tsx
const yozildi = React.useRef(false);
React.useEffect(() => {
  if (!holat || !tugadimi(holat) || holat.jami === 0 || yozildi.current) return;
  yozildi.current = true;
  abschluss.mutate({
    lessonId,
    richtig: holat.togri,
    gesamt: holat.jami,
    durationMs: Date.now() - seansBoshi,
  });
}, [holat]);
```

Tuzilishi (dizayn §4.2):

```tsx
<div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-40 pt-4">
  {/* Tepa: chiqish, ilgarilash chizig'i, sanoq */}
  <header className="flex items-center gap-3">
    <button onClick={() => router.push(`/portal/lernen/units/${unitId}`)} …>
      <X size={22} />
    </button>
    {/* Lumio `ProgressBar` FOIZ oladi (0–100), kasr emas — `value`ga
        `tugatilgan`ni bersak, 12 dan 4 chizig'ning 4 % ini bo'yardi. */}
    <ProgressBar
      value={holat.jami ? (holat.tugatilgan / holat.jami) * 100 : 0}
      className="flex-1"
    />
    <span className="text-sm font-bold tabular-nums text-ink-500">
      {holat.tugatilgan}/{holat.jami}
    </span>
  </header>

  {/* O'rta: ko'rsatma, savol, yordam, javob */}
  <main className="flex flex-1 flex-col justify-center gap-4 py-6">
    <p className="text-sm font-semibold uppercase tracking-wide text-ink-400">
      {koersatma(frage.format)}
    </p>
    <p className="text-2xl font-bold text-ink-900 sm:text-3xl">{frage.prompt}</p>
    {frage.hilfe ? (
      <p className="text-sm text-ink-500">{frage.hilfe}</p>
    ) : null}
    {/* Tanlash | Yozish | Yigish */}
  </main>
</div>
```

Chiqish tugmasi `unitId` ni `useLernenLesson(lessonId)` dan oladi —
javobda `unit: { id, titleUz, level }` bor
(`daf-portal-read.service.ts:getLesson`). Hali yuklanmagan bo'lsa
`/portal/lernen` ga qaytariladi.

- [ ] **Step 3: Pastdagi panel va tugma**

Bitta yopishqoq panel — natija ham, tugma ham shu yerda:

```tsx
<div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
  <div className="mx-auto w-full max-w-2xl space-y-2.5">
    {natija ? (
      <div className={cn("rounded-2xl px-4 py-3", natija.isCorrect ? "bg-success/10" : "bg-danger/10")}>
        <p className={cn("font-bold", natija.isCorrect ? "text-success" : "text-danger")}>
          {natija.isCorrect ? "To'g'ri!" : "Xato"}
        </p>
        {!natija.isCorrect ? (
          <p className="mt-0.5 text-sm font-semibold text-ink-800">{natija.richtig}</p>
        ) : null}
      </div>
    ) : null}
    <Button className="w-full" onClick={natija ? keyingi : tekshir} disabled={…}>
      {natija ? "Keyingi" : pruefen.isPending ? "Tekshirilmoqda…" : "Tekshirish"}
    </Button>
  </div>
</div>
```

`env(safe-area-inset-bottom)` — iPhone'ning pastki chizig'i tugmani
kesib qo'ymasligi uchun. Sahifaning `pb-40` i shu panel balandligini
qoplaydi; usiz oxirgi variant panel ostida qolardi.

Klaviatura (dizayn §6, faqat desktop, lekin `window` hodisasi hamma
joyda tinglanadi — telefonda tashqi klaviatura ham ishlaydi):

```tsx
React.useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    // Yozish rejimida raqamlar javobning O'ZI — ularni tortib
    // olsak, o'quvchi «7» yoza olmasdi.
    if (e.key === "Enter") {
      e.preventDefault();
      natija ? void keyingi() : tekshir();
      return;
    }
    if (rejim !== "TANLASH" || natija) return;
    const n = Number(e.key);
    if (n >= 1 && n <= (frage?.options.length ?? 0)) {
      setTanlangan(frage!.options[n - 1]);
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [rejim, natija, frage, tanlangan, given, tayyor]);
```

- [ ] **Step 4: Yuklanish, bo'sh va xato holatlari (dizayn §7)**

| Holat | Ko'rinish |
| --- | --- |
| Yuklanmoqda | `<LoadingCards />` |
| Savol yo'q (`[]`) | Eski `LernenLessonPage` ga tushiladi |
| 404 | `<EmptyState>` «Bu dars topilmadi» + «Orqaga» |
| Boshqa xato | `<EmptyState>` «Mashqni ochib bo'lmadi» + «Qayta urinish» (`refetch`) |
| `pruefen` yiqildi | Tanlov SAQLANADI, panelda «Yuborib bo'lmadi. Qayta urinib ko'ring» va tugma «Tekshirish» bo'lib qoladi |

Oxirgi qator muhim: `setNatija` faqat `onSuccess` da chaqiriladi,
shuning uchun xatoda savol o'z holicha turadi va o'quvchi qaytadan
bosishi mumkin.

- [ ] **Step 5: `natija-ekrani.tsx` ni yozing**

```tsx
export interface NatijaEkraniProps {
  togri: number;
  jami: number;
  durationMs: number;
  xatolar: SeansXato[];
  unitId: number | null;
  onQayta: () => void;
}
```

Ko'rsatiladi: `togri`/`jami` katta raqamda, sarflangan vaqt
(`Math.round(durationMs / 1000)` daqiqa:soniya), so'ng xato qilingan
so'zlar ro'yxati — har biri `prompt` va `richtig` bilan. Xato bo'lmasa
ro'yxat o'rniga bir qatorlik tabrik.

Ikki tugma: «Davom etish» (`/portal/lernen/units/{unitId}`, `unitId`
yo'q bo'lsa `/portal/lernen`) va «Qayta o'tish» (`onQayta` — `holat` ni
qaytadan `boshla` qiladi va seansni `refetch` bilan yangilaydi;
`yozildi.current` ni `false` ga qaytaring, aks holda ikkinchi o'tish
yozilmasdi).

- [ ] **Step 6: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/lernen-ekrani
git status
git add client/src/
git commit -m "Seans ekrani: savol, natija paneli, yakun"
```

---

## Task 6: Yo'l va unit sahifalari

Oxirgi vazifa: o'quvchi 12 unitni ko'radi, unitni ochib bo'limlar ostidagi
seanslarni ko'radi, va birini bosib seansga kiradi. Qulf qoidasi shu yerda.

**Files:**
- Create: `client/src/components/student-portal/lernen/fortschritt.ts`
- Create: `client/src/components/student-portal/lernen/fortschritt.test.ts`
- Modify: `client/src/components/student-portal/lernen/types.ts`
- Modify: `client/src/components/student-portal/lernen/lernen-levels-page.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-unit-page.tsx`

**Interfaces:**
- Consumes: 2-vazifadan `doneCount`, `sections`, `finalTest`, `completedAt`
- Produces: `unitHolati`, `seansHolatlari`

- [ ] **Step 1: Tiplarni yangilang**

`types.ts` da `LernenUnitSummary` ga `doneCount: number` qo'shing va
unit javobiga:

```ts
export interface LernenSeans {
  id: number;
  order: number;
  kind: "SECTION_A" | "SECTION_B" | "BRIDGE" | "UNIT_TEST" | null;
  titleDe: string;
  titleUz: string | null;
  wordCount: number;
  exerciseCount: number;
  completedAt: string | null;
  bestScore: number;
  runs: number;
}

export interface LernenSectionGroup {
  id: number;
  order: number;
  code: string;
  titleUz: string;
  titleDe: string;
  lessons: LernenSeans[];
}
```

`types.ts` dagi `DafLessonKind` aliasi ESKIRGAN: u hali ham
`"VOCAB" | "GRAMMAR"` deydi, holbuki server enumi allaqachon
`SECTION_A | SECTION_B | BRIDGE | UNIT_TEST` (schema.prisma). Uni
to'g'rilang va `LernenLesson.kind` ni `DafLessonKind | null` qiling —
eski DiB darslarida u `null`.

`LernenUnit` ga `sections: LernenSectionGroup[]` va
`finalTest: LernenSeans | null` qo'shing. Mavjud `lessons` maydonini
`LernenSeans[]` ga o'tkazing — eski DiB darslari shu yerdan o'qiladi.

- [ ] **Step 2: Yiqiladigan testni yozing**

`client/src/components/student-portal/lernen/fortschritt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seansHolatlari, unitHolati } from "./fortschritt";

const s = (id: number, done: boolean) => ({
  id, order: id, kind: null, titleDe: "", titleUz: null,
  wordCount: 0, exerciseCount: 0,
  completedAt: done ? "2026-09-01T00:00:00.000Z" : null,
  bestScore: 0, runs: done ? 1 : 0,
});

describe("seansHolatlari", () => {
  it("birinchi tugallanmagan seans NAVBATDAGI, qolganlari QULF", () => {
    expect(seansHolatlari([s(1, true), s(2, false), s(3, false)]))
      .toEqual(["BAJARILGAN", "NAVBATDAGI", "QULF"]);
  });

  it("hech narsa bajarilmagan bo`lsa birinchisi ochiq", () => {
    expect(seansHolatlari([s(1, false), s(2, false)]))
      .toEqual(["NAVBATDAGI", "QULF"]);
  });

  it("hammasi bajarilgan bo`lsa qulf qolmaydi", () => {
    expect(seansHolatlari([s(1, true), s(2, true)]))
      .toEqual(["BAJARILGAN", "BAJARILGAN"]);
  });

  it("o`rtadagi seans o`tkazib yuborilgan bo`lsa ham NAVBATDAGI bitta", () => {
    // O'quvchi 3-ni qandaydir yo'l bilan bajargan bo'lsa (masalan
    // to'g'ridan-to'g'ri havola orqali), 2-si baribir keyingi qadam
    // bo'lib qoladi — ketma-ketlik buzilmaydi.
    expect(seansHolatlari([s(1, true), s(2, false), s(3, true)]))
      .toEqual(["BAJARILGAN", "NAVBATDAGI", "BAJARILGAN"]);
  });

  it("bo`sh ro`yxat bo`sh natija", () => {
    expect(seansHolatlari([])).toEqual([]);
  });
});

describe("unitHolati", () => {
  const u = (order: number, lessonCount: number, doneCount: number) => ({
    id: order, order, titleUz: "", titleDe: "", lessonCount, doneCount,
  });

  it("birinchi unit har doim ochiq", () => {
    expect(unitHolati([u(1, 18, 0)])).toEqual(["OCHIQ"]);
  });

  it("kontenti yo`q unit QULF va `tez orada`", () => {
    expect(unitHolati([u(1, 18, 18), u(2, 0, 0)]))
      .toEqual(["BAJARILGAN", "TAYYOR_EMAS"]);
  });

  it("oldingisi tugamaguncha keyingisi qulf", () => {
    expect(unitHolati([u(1, 18, 4), u(2, 18, 0)]))
      .toEqual(["OCHIQ", "QULF"]);
  });

  it("oldingisi tugagach keyingisi ochiladi", () => {
    expect(unitHolati([u(1, 18, 18), u(2, 18, 0)]))
      .toEqual(["BAJARILGAN", "OCHIQ"]);
  });

  it("kontenti yo`q unitdan keyingisi ham yopiq qoladi", () => {
    // Ataylab: 2-unit bo'sh bo'lsa 3-unit ham yopiq qoladi. Kontent
    // tartib bilan yoziladi, shuning uchun 2 bo'sh bo'lsa 3 ham bo'sh.
    expect(unitHolati([u(1, 18, 18), u(2, 0, 0), u(3, 0, 0)]))
      .toEqual(["BAJARILGAN", "TAYYOR_EMAS", "TAYYOR_EMAS"]);
  });
});
```

- [ ] **Step 3: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/fortschritt.test.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 4: `fortschritt.ts` ni yozing**

```ts
import type { LernenSeans, LernenUnitSummary } from "./types";

export type SeansHolatBelgisi = "BAJARILGAN" | "NAVBATDAGI" | "QULF";
export type UnitHolatBelgisi = "BAJARILGAN" | "OCHIQ" | "QULF" | "TAYYOR_EMAS";

/**
 * Qulf MIJOZDA hisoblanadi, serverda emas.
 *
 * Sabab: bu ko'rsatish qoidasi, xavfsizlik chegarasi emas. Server
 * allaqachon istalgan darsning savollarini beradi (dvigatel izohidagi
 * D7 ochiqligi) va bundan hech kim yutmaydi — o'quvchi faqat o'z
 * statistikasiga ta'sir qiladi. Qulfning maqsadi boshqa: material
 * progressiv, tartibni buzib kirgan o'quvchiga mashq «qiyin» emas,
 * «tushunarsiz» bo'ladi.
 */
export function seansHolatlari(lessons: LernenSeans[]): SeansHolatBelgisi[] {
  const birinchiOchiq = lessons.findIndex((l) => l.completedAt == null);
  return lessons.map((l, i) => {
    if (l.completedAt != null) return "BAJARILGAN";
    if (i === birinchiOchiq) return "NAVBATDAGI";
    return "QULF";
  });
}

/**
 * Unit ochiladi, agar oldingisi TO'LIQ tugallangan bo'lsa; birinchisi
 * har doim ochiq.
 *
 * Kontenti yo'q unit (`lessonCount === 0`) qulf bo'lib ko'rinadi va
 * tagida «tez orada» yoziladi: bo'sh unitni ochiq ko'rsatish «buzuq»
 * degan taassurot berardi.
 */
export function unitHolati(units: LernenUnitSummary[]): UnitHolatBelgisi[] {
  const out: UnitHolatBelgisi[] = [];
  let oldingiTugagan = true;

  for (const u of units) {
    if (u.lessonCount === 0) {
      out.push("TAYYOR_EMAS");
      oldingiTugagan = false;
      continue;
    }
    const tugagan = u.doneCount >= u.lessonCount;
    if (tugagan) out.push("BAJARILGAN");
    else if (oldingiTugagan) out.push("OCHIQ");
    else out.push("QULF");
    oldingiTugagan = tugagan;
  }

  return out;
}
```

- [ ] **Step 5: Yo'l sahifasini yangilang**

`lernen-levels-page.tsx` da A1 unitlari ro'yxati `unitHolati` bo'yicha
chiziladi. Har kartada: tartib raqami, `titleDe` (katta) va `titleUz`
(kichik), `<ProgressBar>` bilan `{doneCount}/{lessonCount} seans`.
`TAYYOR_EMAS` da ilgarilash o'rniga «Tez orada», `QULF` da qulf belgisi.
`BAJARILGAN` va `OCHIQ` bosiladi, qolgan ikkitasi bosilmaydi.

Sahifaning yuqorisidagi `SKILLS` bloki va Goethe modullari **o'z
holicha qoladi** — ular boshqa masala.

- [ ] **Step 6: Unit sahifasini yangilang**

`lernen-unit-page.tsx`:

- Har bo'lim guruh sarlavhasi: `{s.order}. {s.titleUz}` va ostida
  `{s.titleDe}` xiraroq. Bo'limning o'z sahifasi yo'q.
- Har seans qatori: `kind` ga qarab nom — `SECTION_A` → «Tanishuv»,
  `SECTION_B` → «Ishlatish», `BRIDGE` → «O'tish sinovi»,
  `UNIT_TEST` → «Yakuniy sinov», `null` → `titleUz ?? titleDe`.
- Holat belgisi: `BAJARILGAN` ✓ (`CheckCircle weight="fill"`),
  `NAVBATDAGI` to'ldirilgan doira, `QULF` bo'sh doira + xira matn.
- **Qulf hisoblash butun unit bo'yicha yuriladi**, bo'lim ichida emas:
  `[...sections.flatMap((s) => s.lessons), ...(finalTest ? [finalTest] : [])]`
  ni `seansHolatlari` ga bering, natijani `id` bo'yicha xaritaga soling.
  Aks holda har bo'lim o'z «navbatdagi»siga ega bo'lib, uchta seans
  bir vaqtda ochiq ko'rinardi.
- Yakuniy sinov bo'limlardan keyin alohida, ajratuvchi bilan.
- `sections` bo'sh va `lessons` ham bo'sh bo'lsa: `<EmptyState>` «Bu
  unitning mashqlari hali tayyor emas» + orqaga.
- `sections` bo'sh, `lessons` to'la bo'lsa (eski DiB uniti): darslar
  guruhsiz ro'yxat bo'lib chiqadi — bugungi ko'rinish saqlanadi.

- [ ] **Step 7: Uch o'lchamni tekshiring**

Ekranning o'zi bitta ustun; `max-w-2xl mx-auto px-4` uchala o'lchamda
ishlaydi. Qo'lda tekshiring:

Run: `cd client && npm run dev`, so'ng brauzerda `/portal/lernen`:
1. 390px (telefon) — variantlar bitta ustun, «Tekshirish» pastda,
   yozish maydoniga bosilganda klaviatura tugmani berkitmaydi.
2. 1024px (katta planshet) — ustun markazda, qisqa variantlar ikki
   ustunda.
3. 1440px (desktop) — `1`–`4` variantni tanlaydi, `Enter` tekshiradi va
   keyingisiga o'tadi.

Topilgan muammolarni shu qadamda tuzating.

- [ ] **Step 8: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/lernen-ekrani
git status
git add client/src/
git commit -m "Yo'l va unit sahifalari: ilgarilash, qulf, bo'lim guruhlari"
```
