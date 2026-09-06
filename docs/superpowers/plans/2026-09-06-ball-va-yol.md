# Ball, daraja va o'quv yo'li

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi mashq qilganda ball topadi, darajasi o'sadi, seriyasi sanaladi va haftalik jadvalda o'z o'rnini ko'radi; o'quv yo'li esa Duolingo uslubidagi zigzagga qaytadi.

**Architecture:** Ball SERVERDA, javob kelgan paytda beriladi — mijozdan hech narsa so'ralmaydi. Qoida bitta: muddati kelgan so'zga to'g'ri javob 10 ball. Ball `DafAttempt` ning yangi ustunida yashaydi, ya'ni haftalik yig'indi ham, guruh bo'yicha ajratish ham mavjud jadvaldan chiqadi. Yo'lda har tugun bitta seans; unit nomi tugunlar orasida sarlavha.

**Tech Stack:** NestJS + Prisma (PostgreSQL/Neon), jest; Next.js App Router, React Query, Lumio, vitest.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-06-ball-va-yol-design.md`. Ziddiyat chiqsa dizayn ustun.
- **Ball hech qachon mijozdan so'ralmaydi.** Uni faqat server hisoblaydi va yozadi.
- **To'g'ri javob mijozga javobdan OLDIN yuborilmaydi.** Bu dvigatelning asosiy qoidasi va u o'zgarmaydi.
- `studentId` faqat tokendan olinadi (`@CurrentUser('studentId')`).
- Barcha yozuvlar va izohlar **lotin alifbosidagi o'zbekcha**. Kirill va arab harflari ishlatilmaydi. Izohlar NEGA ekanini tushuntiradi, nima qilinayotganini emas.
- Har yangi HTTP yo'l `server/src/common/auth/branch-route-policy.ts` da toifalanadi, aks holda build yiqiladi.
- Toshkent vaqti uchun **yangi kod yozilmaydi** — `server/src/attendance/shared/date-utils.ts` dagi `tashkentDateStr`, `tashkentDayRangeUtc`, `addDaysToDateStr` ishlatiladi.
- Mijozda **komponent render qilinmaydi**. Vitest faqat sof mantiqni sinaydi; `@testing-library` qo'shilmaydi.
- Ekran telefon, katta planshet va desktopda ishlaydi.
- `git reset --hard` ishlatilmaydi. Repo boshqa joyda saqlanmagan ish olib yuradi.
- **Dizayndan bitta ataylab chetlanish:** 10-bo'lim daraja chegaralarini
  mijozda sinashni aytadi. Bu rejada daraja SERVERDA hisoblanadi
  (`stufeFuer`) va mijozga tayyor holda keladi, ya'ni chegaralar server
  testida sinaladi. Sabab: chegara ikki joyda takrorlansa, ular albatta
  bir-biridan ajralib ketadi.
- Har server testidan oldin `cd server && npx prisma generate` — `node_modules` asosiy repo bilan umumiy.
- Commit oldidan: server uchun `npm test` va `npm run typecheck`; mijoz uchun `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/prisma/schema.prisma` | `DafAttempt.points` ustuni |
| `server/src/daf/uebung/punkte.ts` | Ball qoidasi, daraja narvoni, hafta boshi, seriya — sof funksiyalar |
| `server/src/daf/uebung/punkte.spec.ts` | Ularning testlari |
| `server/src/daf/shared/student-scope.ts` | `currentGroupId` — ikki servis uchun umumiy |
| `server/src/daf/uebung/uebung.service.ts` | `pruefen` ball beradi va filial/guruhni muhrlaydi; takrorlash seansi |
| `server/src/daf/fortschritt/fortschritt.service.ts` | Umumiy ball, daraja, seriya, haftalik ball va o'rin |
| `server/src/daf/fortschritt/reyting.service.ts` | Haftalik jadvallar (guruh, markaz) |
| `server/src/daf/daf-portal.controller.ts` | Uch yangi yo'l |
| `client/src/components/student-portal/lernen/types.ts` | Yangi javob tiplari |
| `client/src/components/student-portal/lernen/queries.ts` | Yangi so'rovlar |
| `client/src/components/student-portal/lernen/yol/yol-tuzilishi.ts` | Yo'lni tugunlarga yoyish — sof mantiq |
| `client/src/components/student-portal/lernen/yol/yol-tuzilishi.test.ts` | Uning testlari |
| `client/src/components/student-portal/lernen/yol/lernen-yol.tsx` | Zigzag yo'l |
| `client/src/components/student-portal/lernen/yol/yol-tepasi.tsx` | To'rtta belgi |
| `client/src/components/student-portal/lernen/reyting/reyting-ekrani.tsx` | Uch tabli reyting |
| `client/src/components/student-portal/lernen/lernen-levels-page.tsx` | Yo'l va tepa qismni yig'adi |
| `client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx` | Ball, seriya, o'rin o'zgarishi |
| `client/src/app/(student-portal)/portal/lernen/reyting/page.tsx` | Reyting marshruti |
| `client/src/app/(student-portal)/portal/lernen/wiederholung/page.tsx` | Takrorlash seansi marshruti |

---

## Task 1: Ball qoidasi va migratsiya

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_daf_attempt_points/migration.sql`
- Create: `server/src/daf/uebung/punkte.ts`
- Create: `server/src/daf/uebung/punkte.spec.ts`

**Interfaces:**
- Produces:
  - `PUNKTE_PRO_WORT = 10`
  - `punkteFuer(woerter: Array<{ faellig: boolean; richtig: boolean }>): number`
  - `STUFEN: ReadonlyArray<{ de: string; uz: string; ab: number }>`
  - `stufeFuer(gesamt: number): { jetzt: Stufe; naechste: Stufe | null }`
  - `wochenStartUtc(jetzt: Date): Date`
  - `serieAus(tage: string[], heute: string): number`
- Consumes: `tashkentDateStr`, `addDaysToDateStr`, `dayOfWeekForDateStr` from `server/src/attendance/shared/date-utils.ts`

- [ ] **Step 1: Sxemaga ustun qo'shing**

`DafAttempt` modeliga, `durationMs` dan keyin:

```prisma
  /// Shu javob uchun berilgan ball. Qoida bitta: muddati kelgan so'zga
  /// to'g'ri javob 10 ball. `PAAR` to'rt so'zni birdan tekshirgani uchun
  /// 40 ballgacha berishi mumkin. Ball MIJOZDAN so'ralmaydi — u reytingga
  /// tushadi, ya'ni soxtalashtirish arziydigan bo'lardi.
  points     Int     @default(0)
```

- [ ] **Step 2: Migratsiyani chiqaring**

**`npx prisma migrate dev` bu repoda ishlamaydi** — shadow DB eski
migratsiyada yiqiladi. Buning o'rniga:

```bash
cd server
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/diff.sql
cat /tmp/diff.sql
```

Chiqqan SQL da **faqat** `ALTER TABLE "DafAttempt" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;` qolishi kerak. Dev bazada eskidan qolgan drift bor (`Branch.workingDays`, `Transaction_reversedAt_idx` va boshqalar) — ular ham chiqadi va **hammasini o'chirib tashlang**, aks holda prodga chiqqanda begona o'zgarish ketadi. Boshqa hech narsa qolmasligi kerak.

Tozalangan SQL ni `server/prisma/migrations/20260906120000_daf_attempt_points/migration.sql` ga yozing, so'ng:

```bash
npx prisma db execute --file prisma/migrations/20260906120000_daf_attempt_points/migration.sql
npx prisma migrate resolve --applied 20260906120000_daf_attempt_points
npx prisma generate
```

- [ ] **Step 3: Yiqiladigan testni yozing**

`server/src/daf/uebung/punkte.spec.ts`:

```ts
import {
  PUNKTE_PRO_WORT,
  punkteFuer,
  serieAus,
  stufeFuer,
  wochenStartUtc,
} from './punkte';

describe('punkteFuer', () => {
  it("muddati kelgan so'zga to'g'ri javob 10 ball beradi", () => {
    expect(punkteFuer([{ faellig: true, richtig: true }])).toBe(10);
  });

  it("muddati KELMAGAN so'z nol beradi — darsni qayta o'tish yo'li shu", () => {
    expect(punkteFuer([{ faellig: false, richtig: true }])).toBe(0);
  });

  it('xato javob nol beradi', () => {
    expect(punkteFuer([{ faellig: true, richtig: false }])).toBe(0);
  });

  it("PAAR: to'rt so'zning har biri o'z ballini oladi", () => {
    expect(
      punkteFuer([
        { faellig: true, richtig: true },
        { faellig: true, richtig: true },
        { faellig: false, richtig: true },
        { faellig: true, richtig: false },
      ]),
    ).toBe(20);
  });

  it("so'z bo'lmagan savol (gap, ibora) nol beradi", () => {
    expect(punkteFuer([])).toBe(0);
  });

  it('PUNKTE_PRO_WORT 10 ga teng', () => {
    expect(PUNKTE_PRO_WORT).toBe(10);
  });
});

describe('stufeFuer', () => {
  it('nol ballda Anfanger', () => {
    expect(stufeFuer(0).jetzt.de).toBe('Anfänger');
    expect(stufeFuer(0).naechste?.ab).toBe(300);
  });

  it("chegaraning AYNAN ustidagi ball yangi darajani beradi", () => {
    expect(stufeFuer(299).jetzt.de).toBe('Anfänger');
    expect(stufeFuer(300).jetzt.de).toBe('Lerner');
  });

  it('eng yuqori darajadan keyin naechste null', () => {
    expect(stufeFuer(16_000).jetzt.de).toBe('Meister');
    expect(stufeFuer(16_000).naechste).toBeNull();
    expect(stufeFuer(999_999).jetzt.de).toBe('Meister');
  });

  it("har darajaning o'zbekchasi bor", () => {
    for (const g of [0, 300, 1500, 4000, 9000, 16000]) {
      expect(stufeFuer(g).jetzt.uz.length).toBeGreaterThan(0);
    }
  });
});

describe('wochenStartUtc', () => {
  it('dushanba Toshkent yarim tunini qaytaradi (UTC 19:00, yakshanba)', () => {
    // 2026-09-06 yakshanba, Toshkentda 12:00 (UTC 07:00).
    // O'sha haftaning dushanbasi — 2026-08-31.
    const start = wochenStartUtc(new Date('2026-09-06T07:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-30T19:00:00.000Z');
  });

  it("dushanba kuni ertalab O'SHA kunni qaytaradi, oldingi haftani emas", () => {
    // 2026-08-31 dushanba, Toshkentda 09:00 (UTC 04:00).
    const start = wochenStartUtc(new Date('2026-08-31T04:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-30T19:00:00.000Z');
  });

  it('yakshanba kechqurun Toshkentda hali eski hafta', () => {
    // Toshkentda 2026-09-06 (yakshanba) 23:00 = UTC 18:00.
    // UTC bo'yicha kun hali yakshanba, Toshkentda ham.
    const start = wochenStartUtc(new Date('2026-09-06T18:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-30T19:00:00.000Z');
  });
});

describe('serieAus', () => {
  it('bugun mashq qilingan bo`lsa seriya bugundan sanaladi', () => {
    expect(serieAus(['2026-09-06', '2026-09-05', '2026-09-04'], '2026-09-06')).toBe(3);
  });

  it('bugun hali mashq qilinmagan bo`lsa seriya SAQLANADI', () => {
    // Kun tugamagan — kecha bilan tugagan zanjir hali buzilmagan.
    expect(serieAus(['2026-09-05', '2026-09-04'], '2026-09-06')).toBe(2);
  });

  it('bir kun tashlansa nolga tushadi', () => {
    expect(serieAus(['2026-09-04', '2026-09-03'], '2026-09-06')).toBe(0);
  });

  it('hech qachon mashq qilmagan o`quvchida nol', () => {
    expect(serieAus([], '2026-09-06')).toBe(0);
  });

  it('takrorlangan sana zanjirni uzmaydi', () => {
    expect(
      serieAus(['2026-09-06', '2026-09-06', '2026-09-05'], '2026-09-06'),
    ).toBe(2);
  });
});
```

- [ ] **Step 4: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/uebung/punkte.spec.ts`
Expected: FAIL — `Cannot find module './punkte'`

- [ ] **Step 5: `punkte.ts` ni yozing**

```ts
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
} from '../../attendance/shared/date-utils';

/**
 * Bitta muddati kelgan so'zning bahosi.
 *
 * NEGA SO'Z UCHUN, SAVOL UCHUN EMAS. Leitner jadvali faqat so'zlarni
 * kuzatadi — gap va iborada "muddati keldi" degan tushuncha yo'q.
 * Ball savolga bog'lansa, gap tuzish savolini qayta-qayta yechib ball
 * yig'ish mumkin bo'lardi; so'zga bog'langanda esa qoida o'zi-o'zini
 * chegaralaydi, chunki javob berilgan so'z bugungi navbatdan chiqadi.
 */
export const PUNKTE_PRO_WORT = 10;

/**
 * Savolning bahosi — unga tegishli so'zlar bo'yicha.
 *
 * Ko'pchilik savol bitta so'zga tegishli, ya'ni ro'yxat bir elementli.
 * `PAAR` BUNDAN MUSTASNO: u to'rt so'zni birdan juftlaydi va server har
 * juftni alohida tekshiradi, shuning uchun to'rttasi ham shu yerga
 * tushadi va savol 40 ballgacha berishi mumkin.
 *
 * Gap va ibora savollarida ro'yxat BO'SH bo'ladi — natija nol.
 */
export function punkteFuer(
  woerter: Array<{ faellig: boolean; richtig: boolean }>,
): number {
  return woerter.reduce(
    (sum, w) => sum + (w.faellig && w.richtig ? PUNKTE_PRO_WORT : 0),
    0,
  );
}

export interface Stufe {
  de: string;
  uz: string;
  ab: number;
}

/**
 * Daraja narvoni — umumiy balldan kelib chiqadi va HECH QACHON nolga
 * tushmaydi. Haftalik jadval qisqa musobaqa, bu esa uzoq muddatli o'sish.
 *
 * Nomlari nemischa: maktab nemis tili o'rgatadi va o'quvchi yo'l-yo'lakay
 * oltita so'z oladi. `A1`/`A2`/`B1` dan ataylab boshqa oilaga tegishli —
 * ikkalasi bir ekranda turadi va chalkashmasligi kerak.
 */
export const STUFEN: ReadonlyArray<Stufe> = [
  { de: 'Anfänger', uz: 'Boshlovchi', ab: 0 },
  { de: 'Lerner', uz: "O'rganuvchi", ab: 300 },
  { de: 'Kenner', uz: 'Bilimdon', ab: 1_500 },
  { de: 'Könner', uz: 'Mohir', ab: 4_000 },
  { de: 'Profi', uz: 'Usta', ab: 9_000 },
  { de: 'Meister', uz: 'Ustoz', ab: 16_000 },
];

export function stufeFuer(gesamt: number): {
  jetzt: Stufe;
  naechste: Stufe | null;
} {
  let index = 0;
  for (let i = 0; i < STUFEN.length; i += 1) {
    if (gesamt >= STUFEN[i].ab) index = i;
  }
  return { jetzt: STUFEN[index], naechste: STUFEN[index + 1] ?? null };
}

/** Toshkent UTC+5, yozgi vaqt yo'q. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Joriy haftaning boshi — DUSHANBA, Toshkent yarim tuni, UTC lahzasi
 * sifatida.
 *
 * NEGA UTC EMAS. Dvigatelning `leitner.ts` fayli kunlarni UTC da sanaydi
 * va u yerda "Toshkentga o'tkazish keyingi rejaning ishi" deb yozib
 * qo'yilgan. Haftalik jadval uchun bu qarz shu yerda yopiladi: UTC bilan
 * hisoblansa jadval yakshanba kuni soat beshda yangilanardi va o'quvchi
 * uchun hafta noto'g'ri joyda uzilardi.
 */
export function wochenStartUtc(jetzt: Date): Date {
  const heute = tashkentDateStr(jetzt);
  const wochentag = dayOfWeekForDateStr(heute); // 0 = yakshanba
  const zurueck = wochentag === 0 ? 6 : wochentag - 1;
  const montag = addDaysToDateStr(heute, -zurueck);
  const [my, mm, md] = montag.split('-').map(Number);
  return new Date(Date.UTC(my, mm - 1, md) - TASHKENT_OFFSET_MS);
}

/**
 * Ketma-ket nechta kun mashq qilingan.
 *
 * `tage` — mashq qilingan Toshkent sanalari (`YYYY-MM-DD`), tartibi
 * ahamiyatsiz, takrorlanishi mumkin.
 *
 * BUGUN MASHQ QILINMAGAN BO'LSA SERIYA SAQLANADI: kun hali tugamagan,
 * ya'ni kechagi zanjir buzilmagan. Jazolamaslik dizayn qarori — o'quvchi
 * pul to'lab o'qiydi, uni ilova ichida ushlab turish kerak emas.
 */
export function serieAus(tage: string[], heute: string): number {
  const menge = new Set(tage);
  // Bugun bo'lmasa kechadan boshlanadi — yuqoridagi izohga qarang.
  let kursor = menge.has(heute) ? heute : addDaysToDateStr(heute, -1);
  let serie = 0;
  while (menge.has(kursor)) {
    serie += 1;
    kursor = addDaysToDateStr(kursor, -1);
  }
  return serie;
}
```

- [ ] **Step 6: Testlar o'tishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/punkte.spec.ts`
Expected: PASS.

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git status
git add server/prisma server/src/daf/uebung/punkte.ts server/src/daf/uebung/punkte.spec.ts
git commit -m "Ball qoidasi, daraja narvoni va hafta boshi"
```

---

## Task 2: `pruefen` ball beradi va filial/guruhni muhrlaydi

Hozir `pruefen` urinishni yozadi, lekin ballni ham, `branchId`/`groupId` ni
ham to'ldirmaydi. Ikkalasi ham reyting uchun shart: ball — jadvalning
o'zi, `groupId` — guruh bo'yicha ajratish.

**Files:**
- Create: `server/src/daf/shared/student-scope.ts`
- Modify: `server/src/daf/daf-attempt.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.spec.ts`

**Interfaces:**
- Consumes: 1-vazifadan `punkteFuer`
- Produces: `currentGroupId(prisma: PrismaService, studentId: number): Promise<string | null>`

- [ ] **Step 1: Yiqiladigan testni yozing**

`uebung.service.spec.ts` ga. Faylda `fakePrisma()` bor — o'shani ishlating
va unga `dafLexemeState.findMany` mavjudligiga ishonch hosil qiling.

```ts
describe('pruefen — ball', () => {
  const ctx = { studentId: 55, companyId: 1 };

  function fakeMitWort(state: { dueAt: Date; strength: number } | null) {
    const prisma = fakePrisma();
    prisma.dafLexeme.findUnique = jest.fn(async () => ({
      id: 5, de: 'das Haus', uz: 'uy', artikel: 'das', unitId: 1,
    }));
    prisma.dafLexemeState.findMany = jest.fn(async () => (state ? [{ lexemeId: 5, ...state }] : []));
    prisma.dafLexemeState.findUnique = jest.fn(async () => state);
    return prisma;
  }

  it("hech qachon so'ralmagan so'z — 10 ball", async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' }, ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(10);
  });

  it('muddati kelgan so`z — 10 ball', async () => {
    const prisma = fakeMitWort({ strength: 2, dueAt: new Date(Date.now() - 60_000) });
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' }, ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(10);
  });

  it("muddati KELMAGAN so'z — nol ball (darsni qayta o'tish)", async () => {
    const prisma = fakeMitWort({ strength: 2, dueAt: new Date(Date.now() + 3 * 86_400_000) });
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' }, ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(0);
  });

  it('xato javob — nol ball', async () => {
    const prisma = fakeMitWort(null);
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'notogri' }, ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(0);
  });

  it("gap savoli — nol ball (Leitner gapni kuzatmaydi)", async () => {
    const prisma = fakePrisma();
    prisma.dafSentence.findUnique = jest.fn(async () => ({ de: 'Ich bin da', uz: 'Men shu yerdaman' }));
    await new UebungService(prisma as any).pruefen(
      { itemType: 'SATZ', itemId: 9, format: 'SATZ_UEBERSETZEN', given: 'Men shu yerdaman' }, ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(0);
  });

  it('urinishga filial va guruh MUHRLANADI', async () => {
    const prisma = fakeMitWort(null);
    prisma.enrollment.findFirst = jest.fn(async () => ({ groupId: 'g-1' }));
    await new UebungService(prisma as any).pruefen(
      { itemType: 'WORT', itemId: 5, format: 'WORT_UZ', given: 'uy' }, ctx,
    );
    const data = prisma.dafAttempt.create.mock.calls[0][0].data;
    expect(data.groupId).toBe('g-1');
    expect(data).toHaveProperty('branchId');
  });
});
```

`fakePrisma()` ga kerak bo'lsa qo'shing:

```ts
    enrollment: { findFirst: jest.fn(async () => null) },
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/uebung/uebung.service.spec.ts -t "ball"`
Expected: FAIL — `points` maydoni yozilmagan (`undefined`).

- [ ] **Step 3: `currentGroupId` ni umumiy faylga chiqaring**

`daf-attempt.service.ts` da bu metod xususiy. `UebungService` ga ham
kerak, ya'ni **ko'chirilmaydi, ajratiladi**.

`server/src/daf/shared/student-scope.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';

/**
 * O'quvchining hozirgi guruhi — urinish yozuviga MUHRLANADI.
 *
 * Nega muhrlanadi: o'quvchi guruhini almashtirishi mumkin, va eski
 * guruhda topilgan ball o'sha guruhning haftalik jadvalida qolishi
 * kerak. Jonli bog'lanishdan o'qilsa, guruh o'zgargan kuni butun tarix
 * yangi guruhga ko'chib o'tardi.
 *
 * Bir nechta faol yozilish bo'lsa eng yangisi olinadi.
 */
export async function currentGroupId(
  prisma: PrismaService,
  studentId: number,
): Promise<string | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { groupId: true },
  });
  return enrollment?.groupId ?? null;
}
```

`daf-attempt.service.ts` dagi xususiy metodni o'chiring va ikkala
chaqiruvni shu funksiyaga o'tkazing (`currentGroupId(this.prisma, ctx.studentId)`).

- [ ] **Step 4: `pruefen` ning oxirini qayta yozing**

Hozirgi tartib: urinish yoziladi → holat yangilanadi. Ball uchun tartib
teskari bo'lishi kerak — **muddat holati YOZUVDAN OLDIN o'qiladi**, aks
holda `aktualisiereZustand` uni allaqachon kelajakka surib yuborgan
bo'ladi.

`pruefePaar`/`richtigeAntwort` dan keyingi qismni shunga o'zgartiring:

```ts
    // Ball uchun so'zning muddati YOZUVDAN OLDIN o'qiladi: pastdagi
    // `aktualisiereZustand` uni kelajakka surib yuboradi va keyin
    // "muddati kelganmidi" degan savolga javob berib bo'lmaydi.
    const betroffeneWortIds = paarNatijalari
      ? paarNatijalari.map((p) => p.lexemeId)
      : itemType === 'WORT'
        ? [itemId]
        : [];

    const jetzt = new Date();
    const zustaende = betroffeneWortIds.length
      ? ((await this.prisma.dafLexemeState.findMany({
          where: { studentId: ctx.studentId, lexemeId: { in: betroffeneWortIds } },
        } as any)) as Array<{ lexemeId: number; dueAt: Date }>)
      : [];
    const dueByWort = new Map(zustaende.map((z) => [z.lexemeId, z.dueAt]));

    // Holatsiz so'z — hech qachon so'ralmagan, ya'ni MUDDATI KELGAN.
    const istFaellig = (lexemeId: number): boolean => {
      const due = dueByWort.get(lexemeId);
      return due == null || due.getTime() <= jetzt.getTime();
    };

    const punkteEingabe = paarNatijalari
      ? paarNatijalari.map((p) => ({ faellig: istFaellig(p.lexemeId), richtig: p.ok }))
      : itemType === 'WORT'
        ? [{ faellig: istFaellig(itemId), richtig: isCorrect }]
        : [];
    const points = punkteFuer(punkteEingabe);

    const branchId = await tryResolveStudentBranchId(
      this.prisma,
      ctx.studentId,
      ctx.companyId,
    );
    const groupId = await currentGroupId(this.prisma, ctx.studentId);

    await this.prisma.dafAttempt.create({
      data: {
        studentId: ctx.studentId,
        companyId: ctx.companyId,
        branchId,
        groupId,
        lexemeId: itemType === 'WORT' ? itemId : null,
        isCorrect,
        given,
        durationMs: durationMs ?? null,
        points,
      },
    } as any);
```

Qolgan qism (`aktualisiereZustand` chaqiruvlari) **o'zgarmaydi** va shu
yozuvdan keyin qoladi.

Importlar: `punkteFuer` — `./punkte` dan, `currentGroupId` —
`../shared/student-scope` dan, `tryResolveStudentBranchId` —
`../../common/finance/resolve-branch` dan.

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/daf/
git commit -m "Javob kelganda ball beriladi, filial va guruh muhrlanadi"
```

---

## Task 3: Ilgarilash va reyting yo'llari

**Files:**
- Create: `server/src/daf/fortschritt/fortschritt.service.ts`
- Create: `server/src/daf/fortschritt/fortschritt.service.spec.ts`
- Modify: `server/src/daf/daf.module.ts`
- Modify: `server/src/daf/daf-portal.controller.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: 1-vazifadan `stufeFuer`, `wochenStartUtc`, `serieAus`, `Stufe`
- Produces:
  - `FortschrittService.uebersicht(studentId, companyId)` → `Fortschritt`
  - `FortschrittService.reyting(studentId, companyId, scope)` → `ReytingZeile[]`
  - `GET /student-portal/lernen/fortschritt`
  - `GET /student-portal/lernen/reyting?scope=gruppe|zentrum`

```ts
export interface Fortschritt {
  gesamt: number;
  stufe: { de: string; uz: string };
  naechsteStufe: { de: string; uz: string; ab: number } | null;
  serie: number;
  wochePunkte: number;
  wochePlatzGruppe: number | null;
  wochePlatzZentrum: number;
}

export interface ReytingZeile {
  studentId: number;
  name: string;
  punkte: number;
  platz: number;
  selbst: boolean;
}
```

- [ ] **Step 1: Yiqiladigan testni yozing**

`server/src/daf/fortschritt/fortschritt.service.spec.ts`:

```ts
import { FortschrittService } from './fortschritt.service';

function fakePrisma() {
  return {
    dafAttempt: {
      aggregate: jest.fn(async () => ({ _sum: { points: 0 } })),
      findMany: jest.fn(async () => []),
      groupBy: jest.fn(async () => []),
    },
    enrollment: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    student: { findMany: jest.fn(async () => []) },
  } as any;
}

describe('uebersicht', () => {
  it("umumiy balldan darajani chiqaradi", async () => {
    const prisma = fakePrisma();
    prisma.dafAttempt.aggregate = jest.fn(async () => ({ _sum: { points: 1_600 } }));
    const f = await new FortschrittService(prisma).uebersicht(55, 1);
    expect(f.gesamt).toBe(1_600);
    expect(f.stufe.de).toBe('Kenner');
    expect(f.naechsteStufe?.ab).toBe(4_000);
  });

  it('hech qachon mashq qilmagan o`quvchi yiqilmaydi', async () => {
    const f = await new FortschrittService(fakePrisma()).uebersicht(55, 1);
    expect(f.gesamt).toBe(0);
    expect(f.serie).toBe(0);
    expect(f.stufe.de).toBe('Anfänger');
    expect(f.wochePlatzGruppe).toBeNull();
  });

  it("guruhi yo'q o'quvchining guruh o'rni null, markaz o'rni bor", async () => {
    const prisma = fakePrisma();
    prisma.enrollment.findFirst = jest.fn(async () => null);
    prisma.dafAttempt.groupBy = jest.fn(async () => [
      { studentId: 55, _sum: { points: 40 } },
    ]);
    const f = await new FortschrittService(prisma).uebersicht(55, 1);
    expect(f.wochePlatzGruppe).toBeNull();
    expect(f.wochePlatzZentrum).toBe(1);
  });
});

describe('reyting', () => {
  it('ballga qarab kamayish tartibida saralaydi va o`rin qo`yadi', async () => {
    const prisma = fakePrisma();
    prisma.dafAttempt.groupBy = jest.fn(async () => [
      { studentId: 7, _sum: { points: 300 } },
      { studentId: 55, _sum: { points: 900 } },
    ]);
    prisma.student.findMany = jest.fn(async () => [
      { id: 7, firstName: 'Malika', lastName: 'Sodiqova' },
      { id: 55, firstName: 'Javohir', lastName: 'Toshev' },
    ]);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'zentrum');
    expect(r.map((z) => z.platz)).toEqual([1, 2]);
    expect(r[0].name).toBe('Javohir Toshev');
    expect(r[0].selbst).toBe(true);
    expect(r[1].punkte).toBe(300);
  });

  it("nol ballilar ham ko'rinadi", async () => {
    // Hafta boshida jadval bo'sh bo'lsa o'quvchi o'zini topa olmaydi va
    // tizimni buzuq deb o'ylaydi.
    const prisma = fakePrisma();
    prisma.enrollment.findFirst = jest.fn(async () => ({ groupId: 'g-1' }));
    prisma.enrollment.findMany = jest.fn(async () => [
      { studentId: 55 }, { studentId: 7 },
    ]);
    prisma.dafAttempt.groupBy = jest.fn(async () => []);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'gruppe');
    expect(r).toHaveLength(2);
    expect(r.every((z) => z.punkte === 0)).toBe(true);
  });

  it('teng ballda tartib BARQAROR (studentId bo`yicha)', async () => {
    const prisma = fakePrisma();
    prisma.dafAttempt.groupBy = jest.fn(async () => [
      { studentId: 9, _sum: { points: 100 } },
      { studentId: 4, _sum: { points: 100 } },
    ]);
    prisma.student.findMany = jest.fn(async () => [
      { id: 4, firstName: 'A', lastName: 'A' },
      { id: 9, firstName: 'B', lastName: 'B' },
    ]);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'zentrum');
    expect(r.map((z) => z.studentId)).toEqual([4, 9]);
  });

  it("guruhi yo'q o'quvchi guruh jadvalini so'rasa bo'sh ro'yxat", async () => {
    const prisma = fakePrisma();
    prisma.enrollment.findFirst = jest.fn(async () => null);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'gruppe');
    expect(r).toEqual([]);
  });

  it('markaz jadvali FILIALGA cheklanmaydi', async () => {
    const prisma = fakePrisma();
    await new FortschrittService(prisma).reyting(55, 1, 'zentrum');
    const where = prisma.dafAttempt.groupBy.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('branchId');
    expect(where.companyId).toBe(1);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/fortschritt/`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Servisni yozing**

Asosiy qarorlar izohda yozilishi shart:

```ts
/**
 * MARKAZ JADVALI FILIALGA CHEKLANMAYDI — bu ataylab qilingan istisno.
 *
 * Bu repoda deyarli hamma narsa filialga qulflangan
 * (`branch-route-policy` manifesti, `narrowPayrollScope` va boshqalar).
 * O'quvchilar reytingi shundan chiqariladi: CEO 2026-09-06 da reyting
 * butun markaz bo'yicha bo'lsin dedi. Natijasi ochiq: Namangandagi
 * o'quvchi Farg'onadagi o'quvchining to'liq ismini ko'radi.
 *
 * Buni "xato" deb tuzatmang — qaror hujjatda
 * (`docs/superpowers/specs/2026-09-06-ball-va-yol-design.md`, 6.1).
 */
```

Markaz jadvali **eng yaxshi 50 kishi + o'quvchining o'z qatori** bilan
cheklanadi: markazda yuzlab o'quvchi bor va hammasini yuborish sahifani
sekinlashtiradi. Guruh jadvali to'liq (guruh kichik).

Haftalik yig'indi: `dafAttempt.groupBy({ by: ['studentId'], where: { companyId, createdAt: { gte: wochenStartUtc(new Date()) } }, _sum: { points: true } })`.

Seriya: `dafAttempt.findMany({ where: { studentId }, select: { createdAt: true } })` → `tashkentDateStr` bilan sanaga aylantiriladi → `serieAus`.

**Seriya "mashq qilingan kun" bo'yicha sanaladi, "tugatilgan seans" emas.**
Sabab: `DafLessonProgress.completedAt` har o'tishda ustiga yoziladi, ya'ni
tarix qolmaydi; urinishlar esa qoladi. Bu yumshoqroq — seansni boshlab
tugatmagan o'quvchi ham seriyasini saqlaydi, va bu "jazolamaslik"
qaroriga mos.

- [ ] **Step 4: Yo'llarni qo'shing**

Kontrollerga ikki yo'l. `scope` — `@Query('scope')`, faqat `gruppe` yoki
`zentrum` qabul qilinadi, boshqasi `BadRequestException`.

Ikkalasi ham route siyosatida **`SELF`** toifasiga tushadi (javob
so'ragan o'quvchiga bog'liq). `reyting` yo'lining izohida markaz
jadvalining filialga cheklanmasligi va uning sababi yoziladi — aks holda
keyingi o'quvchi buni oqish deb hisoblab "tuzatib" qo'yadi.

`FortschrittService` ni `daf.module.ts` ga provider sifatida qo'shing.

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/
git commit -m "Ilgarilash va haftalik reyting yo'llari"
```

---

## Task 4: Takrorlash seansi

Hamma darsni tugatgan o'quvchi ball topa olmaydi va haftalik jadvaldan
yo'qoladi. Takrorlash seansi shu teshikni yopadi va u tuzilishi bo'yicha
har kuni yangi: muddati kelgan so'zlar to'plami har kuni o'zgaradi.

**Files:**
- Modify: `server/src/daf/uebung/uebung.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Produces:
  - `UebungService.wiederholung(studentId: number, rnd?: () => number): Promise<PublicFrage[]>`
  - `GET /student-portal/lernen/wiederholung/uebung`

- [ ] **Step 1: Yiqiladigan testni yozing**

```ts
describe('wiederholung', () => {
  function fakeMitDue(count: number) {
    const prisma = fakePrisma();
    const states = Array.from({ length: count }, (_, i) => ({
      lexemeId: i + 1, lastFormat: null, dueAt: new Date(Date.now() - 1000),
    }));
    prisma.dafLexemeState.findMany = jest.fn(async () => states);
    prisma.dafLexeme.findMany = jest.fn(async () =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1, de: `Wort${i + 1}`, uz: `soz${i + 1}`,
        artikel: null, anzeige: null, sectionId: null, core: true,
      })),
    );
    return prisma;
  }

  it("muddati kelgan so'z yo'q bo'lsa bo'sh ro'yxat — bu XATO EMAS", async () => {
    const prisma = fakePrisma();
    prisma.dafLexemeState.findMany = jest.fn(async () => []);
    await expect(new UebungService(prisma as any).wiederholung(55)).resolves.toEqual([]);
  });

  it("ko'pi bilan 12 savol qaytaradi", async () => {
    const fragen = await new UebungService(fakeMitDue(40) as any).wiederholung(55);
    expect(fragen.length).toBeLessThanOrEqual(12);
    expect(fragen.length).toBeGreaterThan(0);
  });

  it("faqat MUDDATI KELGAN so'zlarni so'raydi", async () => {
    const prisma = fakeMitDue(20);
    await new UebungService(prisma as any).wiederholung(55);
    const where = prisma.dafLexemeState.findMany.mock.calls[0][0].where;
    expect(where.studentId).toBe(55);
    expect(where.dueAt).toHaveProperty('lte');
  });

  it("bitta so'z ikki marta so'ralmaydi", async () => {
    const fragen = await new UebungService(fakeMitDue(30) as any).wiederholung(55);
    const ids = fragen.map((f) => `${f.itemType}:${f.itemId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("to'g'ri javobni YUBORMAYDI", async () => {
    const fragen = await new UebungService(fakeMitDue(20) as any).wiederholung(55);
    for (const f of fragen) {
      expect(Object.keys(f)).not.toContain('richtig');
      expect(Object.keys(f)).not.toContain('akzeptiert');
    }
  });

  it("savol qurib bo'lmaydigan so'zlar seansni yiqitmaydi", async () => {
    // Tarjimasi yo'q so'zdan savol qurilmaydi — u tashlab ketiladi,
    // ekzeptsiya tashlanmaydi.
    const prisma = fakeMitDue(5);
    prisma.dafLexeme.findMany = jest.fn(async () => [
      { id: 1, de: 'Wort1', uz: null, artikel: null, anzeige: null, sectionId: null, core: true },
    ]);
    await expect(new UebungService(prisma as any).wiederholung(55)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/uebung.service.spec.ts -t "wiederholung"`
Expected: FAIL — `wiederholung is not a function`

- [ ] **Step 3: `wiederholung` ni yozing**

Mavjud `baueWiederholung` seansning oltidan biri uchun qurilgan
(`Math.floor(SEANS_UZUNLIGI / WIEDERHOLUNG_ULUSH)`). **Uni takrorlamang** —
sonni parametrga chiqaring:

```ts
  private async baueWiederholung(
    studentId: number,
    coreWords: MaterialWort[],
    rnd: () => number,
    anzahl: number = Math.floor(SEANS_UZUNLIGI / WIEDERHOLUNG_ULUSH),
  ): Promise<Frage[]>
```

`seans` dagi chaqiruv o'zgarmaydi (sukut qiymati eski xatti-harakatni
saqlaydi).

Yangi metod:

```ts
  /**
   * Takrorlash seansi — muddati kelgan so'zlardan qurilgan to'liq seans.
   *
   * NEGA ALOHIDA SEANS. Ballning qoidasi bo'yicha darsni qayta o'tish
   * hech narsa bermaydi, ya'ni hamma darsni tugatgan o'quvchi haftalik
   * jadvaldan yo'qolardi. Bu seans o'sha teshikni yopadi va u tuzilishi
   * bo'yicha har kuni yangi: so'zga javob berilishi bilan u bugungi
   * navbatdan chiqadi (`leitner.ts`), ya'ni navbat faqat KAMAYADI va
   * uni o'ynab to'ldirib bo'lmaydi.
   *
   * CHALG'ITUVCHILAR o'quvchining O'ZI ko'rgan so'zlaridan olinadi —
   * bu seans hech qaysi darsga tegishli emas, ya'ni "shu bo'limning
   * so'zlari" degan manba yo'q. O'quvchi ko'rmagan so'zdan chalg'ituvchi
   * qo'yish bilimni emas, taxminni tekshirardi.
   *
   * Bo'sh ro'yxat XATO EMAS: bugun takrorlanadigan so'z yo'q, xolos.
   */
  async wiederholung(
    studentId: number,
    rnd: () => number = Math.random,
  ): Promise<PublicFrage[]> {
```

Ichida: o'quvchining barcha `dafLexemeState` so'zlarini o'qing (chalg'ituvchi
manbai), ularni `MaterialWort` ga aylantiring (`toWort`, tarjimasizlari
tushib qoladi), so'ng `baueWiederholung(studentId, alleWoerter, rnd, SEANS_UZUNLIGI)`
ni chaqiring va natijani `toPublic` bilan qaytaring.

- [ ] **Step 4: Yo'lni qo'shing**

```ts
  /**
   * Takrorlash seansi. Yo'l `lessons/` OSTIDA EMAS — bu seans hech qanday
   * darsga tegishli emas va `lessons/:id` uni son deb o'qishga urinardi.
   */
  @Get('wiederholung/uebung')
  getWiederholung(@CurrentUser('studentId') studentId: number) {
    return this.uebung.wiederholung(studentId);
  }
```

Route siyosatida `SELF` toifasiga (javob o'quvchining o'z holatiga
bog'liq).

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/
git commit -m "Takrorlash seansi: muddati kelgan so'zlardan to'liq seans"
```

---

## Task 5: Yo'l uchun bitta so'rov

Yo'l endi seanslarni o'zi ko'rsatadi, ya'ni unga har unitning seanslari
kerak. Har unit uchun alohida so'rov yuborilsa 12 ta so'rov ketardi.
`getLevels` javobiga bo'limlar qo'shiladi va yo'l **bitta** so'rovdan
quriladi.

**Files:**
- Modify: `server/src/daf/daf-portal-read.service.ts`
- Modify: `server/src/daf/daf-portal-read.service.spec.ts`

**Interfaces:**
- Produces: `getLevels(studentId)` javobidagi har unitga
  `sections: Array<{ id, order, code, titleUz, titleDe, lessons }>` va
  `finalTest` qo'shiladi — `getUnit` dagi bilan **aynan bir xil shakl**.

- [ ] **Step 1: Yiqiladigan testni yozing**

`daf-portal-read.service.spec.ts` ga:

```ts
describe('getLevels — yo`l uchun bo`limlar', () => {
  it('har unitga bo`limlarni va ularning seanslarini qo`shadi', async () => {
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      { id: 1, level: 'A1', order: 1, titleUz: 'Salom', titleDe: 'Hallo', _count: { lessons: 2 } },
    ]);
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      { id: 100, unitId: 1, order: 1, tier: null, kind: 'SECTION_A', sectionId: 10, titleDe: 'A', titleUz: 'A', _count: { lexemes: 0, exercises: 0 } },
      { id: 109, unitId: 1, order: 9, tier: null, kind: 'UNIT_TEST', sectionId: null, titleDe: 'T', titleUz: 'Sinov', _count: { lexemes: 0, exercises: 0 } },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const unit = levels.find((l) => l.level === 'A1')!.units[0] as any;
    expect(unit.sections[0].lessons.map((l: any) => l.id)).toEqual([100]);
    expect(unit.finalTest.id).toBe(109);
  });

  it('ilgarilash har seansga yopishtiriladi', async () => {
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      { id: 1, level: 'A1', order: 1, titleUz: 'Salom', titleDe: 'Hallo', _count: { lessons: 1 } },
    ]);
    prisma.dafSection.findMany = jest.fn(async () => [
      { id: 10, unitId: 1, order: 1, code: 'u01-s1', titleUz: 'Bir', titleDe: 'Eins' },
    ]);
    prisma.dafLesson.findMany = jest.fn(async () => [
      { id: 100, unitId: 1, order: 1, tier: null, kind: 'SECTION_A', sectionId: 10, titleDe: 'A', titleUz: 'A', _count: { lexemes: 0, exercises: 0 } },
    ]);
    prisma.dafLessonProgress.findMany = jest.fn(async () => [
      { lessonId: 100, completedAt: new Date('2026-09-01'), bestScore: 11, runs: 2 },
    ]);
    const levels = await svc(prisma).getLevels(55);
    const s = (levels.find((l) => l.level === 'A1')!.units[0] as any).sections[0].lessons[0];
    expect(s.bestScore).toBe(11);
    expect(s.completedAt).not.toBeNull();
  });

  it('kontenti yo`q daraja bo`sh units bilan qaytadi', async () => {
    const levels = await svc(fakePrisma()).getLevels(55);
    expect(levels.map((l) => l.level)).toEqual(['A1', 'A2', 'B1']);
    expect(levels.every((l) => Array.isArray(l.units))).toBe(true);
  });

  it('so`rovlar unit soniga qarab KO`PAYMAYDI', async () => {
    // N+1 bo'lsa 12 unitda 24 ta so'rov ketardi.
    const prisma = fakePrisma();
    prisma.dafUnit.findMany = jest.fn(async () => [
      { id: 1, level: 'A1', order: 1, titleUz: 'a', titleDe: 'a', _count: { lessons: 1 } },
      { id: 2, level: 'A1', order: 2, titleUz: 'b', titleDe: 'b', _count: { lessons: 1 } },
      { id: 3, level: 'A1', order: 3, titleUz: 'c', titleDe: 'c', _count: { lessons: 1 } },
    ]);
    await svc(prisma).getLevels(55);
    expect(prisma.dafSection.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dafLesson.findMany).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/daf-portal-read.service.spec.ts`
Expected: FAIL — `unit.sections` aniqlanmagan.

- [ ] **Step 3: `getLevels` ni kengaytiring**

Bo'limlar va darslar **bittadan** so'rov bilan olinadi — barcha unitlar
uchun bir yo'la (`where: { unitId: { in: unitIds } }`), so'ng xotirada
guruhlanadi. Unit ichida sikl bo'ylab so'rov yuborilmaydi.

`getUnit` da bu guruhlash allaqachon yozilgan. **Ikkinchi nusxasini
yozmang** — umumiy xususiy metodga ajrating (masalan
`gruppiereLektionen(sections, lessons, fortschritt)`) va ikkalasi ham
shuni chaqirsin. Takrorlangan mantiq ikki joyda ikki xil o'zgaradi.

`getUnit` ning javob shakli **o'zgarmaydi** — u hali ham unit sahifasini
(«bu unitda nimalar bor») ta'minlaydi.

- [ ] **Step 4: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/
git commit -m "Yo'l bitta so'rovdan quriladi: getLevels bo'limlarni qaytaradi"
```

---

## Task 6: Mijoz tomonining tiplari, so'rovlari va sof mantiqi

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts`
- Modify: `client/src/components/student-portal/lernen/queries.ts`
- Create: `client/src/components/student-portal/lernen/yol/yol-tuzilishi.ts`
- Create: `client/src/components/student-portal/lernen/yol/yol-tuzilishi.test.ts`

**Interfaces:**
- Consumes: 3 va 4-vazifalarning javob shakllari; 5-vazifadan `getLevels` javobidagi `sections`
- Produces:
  - Tiplar: `Fortschritt`, `ReytingZeile`, `YolTugun`
  - So'rovlar: `useFortschritt()`, `useReyting(scope)`, `useWiederholung()`
  - `yolTugunlari(levels: LernenLevel[]): YolTugun[]`
  - `qisqaRaqam(n: number): string`

- [ ] **Step 1: Yiqiladigan testni yozing**

`yol-tuzilishi.test.ts`. Yo'l tuzilishi — sof mantiq, ya'ni sinaladi.
Unit tarkibi `getLevels` javobining ichida keladi (5-vazifa), ya'ni
funksiya bitta argument oladi.

```ts
import { describe, expect, it } from "vitest";
import { qisqaRaqam, yolTugunlari } from "./yol-tuzilishi";

const seans = (id: number, done: boolean) => ({
  id, order: id, kind: "SECTION_A" as const, titleDe: "", titleUz: null,
  wordCount: 0, exerciseCount: 0,
  completedAt: done ? "2026-09-01T00:00:00.000Z" : null, bestScore: 0, runs: 0,
});

const bolim = (id: number, lessons: ReturnType<typeof seans>[]) => ({
  id, order: id, code: `u01-s${id}`, titleUz: `Bo'lim ${id}`, titleDe: `Teil ${id}`, lessons,
});

const unit = (id: number, sections: ReturnType<typeof bolim>[]) => ({
  id, order: id, titleUz: `Unit ${id}`, titleDe: `Einheit ${id}`,
  lessonCount: sections.flatMap((s) => s.lessons).length,
  doneCount: sections.flatMap((s) => s.lessons).filter((l) => l.completedAt).length,
  sections, finalTest: null,
});

const lvl = (level: string, units: ReturnType<typeof unit>[]) => ({ level, label: level, units });

describe("yolTugunlari", () => {
  it("unit sarlavhasidan keyin uning seanslari keladi", () => {
    const t = yolTugunlari([lvl("A1", [unit(1, [bolim(1, [seans(100, false), seans(101, false)])])])]);
    expect(t.map((x) => x.tur)).toEqual(["daraja", "unit", "seans", "seans"]);
  });

  it("birinchi tugallanmagan seans NAVBATDAGI, qolganlari qulf", () => {
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, true), seans(101, false), seans(102, false)])])]),
    ]);
    const seanslar = t.filter((x) => x.tur === "seans");
    expect(seanslar.map((s) => s.holat)).toEqual(["done", "active", "locked"]);
  });

  it("qulf BUTUN unit bo'ylab sanaladi, bo'lim ichida emas", () => {
    // Bo'lim ichida sanalsa har bo'limda bittadan "navbatdagi" yonardi.
    const t = yolTugunlari([
      lvl("A1", [unit(1, [
        bolim(1, [seans(100, true), seans(101, false)]),
        bolim(2, [seans(102, false), seans(103, false)]),
      ])]),
    ]);
    const aktiv = t.filter((x) => x.tur === "seans" && x.holat === "active");
    expect(aktiv).toHaveLength(1);
    expect(aktiv[0].id).toBe(101);
  });

  it("qulf UNITLAR bo'ylab ham davom etadi", () => {
    // 1-unit tugamagan bo'lsa 2-unitning birinchi seansi ham qulf.
    const t = yolTugunlari([
      lvl("A1", [
        unit(1, [bolim(1, [seans(100, false)])]),
        unit(2, [bolim(1, [seans(200, false)])]),
      ]),
    ]);
    const seanslar = t.filter((x) => x.tur === "seans");
    expect(seanslar.map((s) => s.holat)).toEqual(["active", "locked"]);
  });

  it("kontenti yo'q daraja qulflangan bitta tugun bo'ladi", () => {
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, false)])])]),
      lvl("A2", []),
    ]);
    const a2 = t.filter((x) => x.daraja === "A2");
    expect(a2.map((x) => x.tur)).toEqual(["daraja", "tez-orada"]);
  });

  it("bo'limi yo'q unit sarlavha bo'lib qoladi, seanssiz", () => {
    // Eski DiB unitlarida bo'lim yo'q — yo'l ular ustida yiqilmasin.
    const t = yolTugunlari([lvl("A1", [unit(1, [])])]);
    expect(t.map((x) => x.tur)).toEqual(["daraja", "unit"]);
  });

  it("bo'sh ro'yxat bo'sh yo'l", () => {
    expect(yolTugunlari([])).toEqual([]);
  });
});

describe("qisqaRaqam", () => {
  it("ming va undan kattasini qisqartiradi", () => {
    expect(qisqaRaqam(1_240)).toBe("1.2k");
    expect(qisqaRaqam(16_000)).toBe("16k");
  });

  it("mingdan kichigini o'zgartirmaydi", () => {
    expect(qisqaRaqam(0)).toBe("0");
    expect(qisqaRaqam(999)).toBe("999");
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/yol/yol-tuzilishi.test.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 3: `yol-tuzilishi.ts` ni yozing**

```ts
export type YolTugunTuri = "daraja" | "unit" | "seans" | "tez-orada";

export interface YolTugun {
  tur: YolTugunTuri;
  /** `seans` va `unit` uchun — bosilganda kerak bo'ladigan ID. */
  id: number | null;
  matn: string;
  ostyozuv: string | null;
  daraja: string;
  holat: "done" | "active" | "locked";
}
```

`yolTugunlari` darajalar bo'ylab yuradi va yassi ro'yxat quradi. Qulf
hisobi **butun yo'l bo'ylab** yuritiladi: hamma unitning hamma seansi
bitta ketma-ketlikka birlashtiriladi, birinchi `completedAt == null`
bo'lgani `active`, undan keyingilarining hammasi `locked`. Bo'lim ichida
yoki unit ichida alohida sanalsa, ekranda bir vaqtda bir necha
"navbatdagi" tugun yonardi.

`qisqaRaqam` — 1000 dan boshlab `k` bilan, bitta kasr xonasi bilan
(`1.2k`), butun bo'lsa kasrsiz (`16k`).

- [ ] **Step 4: Tiplarni va so'rovlarni qo'shing**

`types.ts` ga `Fortschritt` va `ReytingZeile` (3-vazifadagi shakl bilan
bir xil, `completedAt` kabi sanalar `string`).

`queries.ts` ga:

```ts
export function useFortschritt() {
  return useQuery<Fortschritt>({
    queryKey: ["lernen", "fortschritt"],
    queryFn: () => api.get(`${BASE}/fortschritt`).then((r) => r.data),
  });
}

export function useReyting(scope: "gruppe" | "zentrum") {
  return useQuery<ReytingZeile[]>({
    queryKey: ["lernen", "reyting", scope],
    queryFn: () => api.get(`${BASE}/reyting`, { params: { scope } }).then((r) => r.data),
  });
}

/**
 * Takrorlash seansining savollari.
 *
 * `staleTime: Infinity` va `refetchOnWindowFocus: false` — seans holati
 * mijozda yashaydi, qayta so'rash o'quvchining o'rnini yo'qotardi.
 */
export function useWiederholung() {
  return useQuery<PublicFrage[]>({
    queryKey: ["lernen", "wiederholung"],
    queryFn: () => api.get(`${BASE}/wiederholung/uebung`).then((r) => r.data),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}
```

`useAbschluss` ning `onSuccess` iga `["lernen", "fortschritt"]` va
`["lernen", "reyting"]` ni ham bekor qilishni qo'shing — aks holda seans
tugagach tepadagi ball eski qolib ketardi.

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Yo'l tuzilishining sof mantiqi, tiplar va so'rovlar"
```

---

## Task 7: Zigzag yo'l ekrani

**Files:**
- Create: `client/src/components/student-portal/lernen/yol/lernen-yol.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-levels-page.tsx`
- Create: `client/src/app/(student-portal)/portal/lernen/wiederholung/page.tsx`
- Modify: `client/src/components/student-portal/lernen/types.ts`

**Interfaces:**
- Consumes: 6-vazifadan `yolTugunlari`, `YolTugun`; 5-vazifadan `getLevels` javobi
- Produces: `<LernenYol>` — yo'lning o'zi, tepa qismisiz

- [ ] **Step 1: Yo'lni yozing**

Lumio'dagi `LessonNode` ishlatiladi — u allaqachon bor va uch holatni
(`locked` / `active` / `done`) hamda beshta rangni biladi. **Yangi tugun
komponenti yozilmaydi.**

Muhim: `LessonNode` ning `style` propi mutlaq koordinatalar uchun mo'ljallangan,
lekin zigzag **oqim bilan** quriladi — har qatorga bitta tugun, qatorning
tekislanishi navbat bilan o'zgaradi (markaz → o'ng → markaz → chap).
Sabab `lesson-path.tsx` izohida yozilgan: mutlaq koordinatalar 390px
telefon uchun edi va kengroq ekranda tugunlar tarqab ketardi.

Tugun turlari:

| `tur` | Ko'rinishi |
| --- | --- |
| `daraja` | Kichik yorliq: `A1`, `A2`, `B1` |
| `unit` | Rangli qator, unit nomi; **bosiladi** → `/portal/lernen/units/{id}` |
| `seans` | `LessonNode`; `active`/`done` bosiladi → `/portal/lernen/lessons/{id}` |
| `tez-orada` | Qulflangan tugun va ostida «Tez orada» |

Daraja rangi: A1 `coral`, A2 `teal`, B1 `grape`.

Yuqorida, unitlardan alohida — **Takrorlash** tugmasi. Bosilganda
`/portal/lernen/wiederholung` ga o'tadi.

- [ ] **Step 2: Takrorlash marshrutini yozing**

`wiederholung/page.tsx` mavjud `SeansEkrani` ni qayta ishlatadi. Uning
savollari boshqa so'rovdan kelgani uchun `SeansEkrani` ga ixtiyoriy prop
qo'shing — masalan `manba: "dars" | "takrorlash"` — va so'rov shu propga
qarab tanlansin. **`SeansEkrani` ning nusxasi olinmaydi**: seansni
yuritish mantiqi bitta joyda qolishi kerak.

Takrorlashda `abschluss` **yuborilmaydi** — u dars tugallanganini
belgilaydi, takrorlash esa hech qanday darsga tegishli emas. Natija
ekranida «Davom etish» yo'lga qaytaradi.

Savollar bo'sh kelsa: «Bugun takrorlanadigan so'z yo'q» + yo'lga qaytish
tugmasi. Bu xato holati emas, shuning uchun xato ko'rinishi ishlatilmaydi.

- [ ] **Step 3: Sahifani yig'ing**

`lernen-levels-page.tsx` dagi unit kartalari ro'yxati `<LernenYol>` bilan
almashtiriladi. Yuqoridagi `SKILLS` bloki (to'rt Goethe moduli) **o'z
holicha qoladi** — u boshqa masala.

Holatlar: yuklanmoqda → `<LoadingCards />`; xato → `<EmptyState>` va
«Qayta urinish»; bo'sh → «O'quv yo'li hali tayyor emas».

- [ ] **Step 4: Uch o'lchamni tekshiring**

Zigzagning kengligi cheklanadi (`max-w-md mx-auto`), telefonda ham,
desktopda ham bir xil ustun. Tugunlar orasidagi masofa `gap` bilan
beriladi, mutlaq joylashuv bilan emas.

**Brauzer tekshiruvi subagent tomonidan QILINMAYDI** — uning brauzeri
yo'q. Yozilgan Tailwind sinflarini o'qib, har chegarada nima chiqishini
hisobotda ayting va tekshirib bo'lmagan narsalarni ro'yxat qiling. Odam
keyin qarab chiqadi. **Qilinmagan tekshiruvni qilingan deb yozish
mumkin emas.**

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Zigzag o'quv yo'li: tugun = seans"
```

---

## Task 8: Yo'l tepasi va reyting ekrani

**Files:**
- Create: `client/src/components/student-portal/lernen/yol/yol-tepasi.tsx`
- Create: `client/src/components/student-portal/lernen/reyting/reyting-ekrani.tsx`
- Create: `client/src/app/(student-portal)/portal/lernen/reyting/page.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-levels-page.tsx`

**Interfaces:**
- Consumes: 6-vazifadan `useFortschritt`, `useReyting`, `qisqaRaqam`
- Produces: `<YolTepasi>`, `<ReytingEkrani>`

- [ ] **Step 1: Tepa qismni yozing**

To'rtta belgi bir qatorda: **daraja** (`Kenner`), **ball** (`1.2k`),
**seriya** (`14`), **o'rin** (`3`).

Telefonda joy tor: `qisqaRaqam` bilan qisqartiriladi va yozuvlar tushib
qoladi — faqat belgi va son qoladi. `sm` dan boshlab to'liq yozuv
ko'rinadi (`14 kun`, `3-o'rin`).

O'rin belgisini bosish `/portal/lernen/reyting` ga olib boradi. Qolgan
uchtasi bosilmaydi.

Ma'lumot yuklanmaguncha belgilar **skelet** holatida turadi, yo'q bo'lib
ketmaydi — aks holda sahifa yuklanganda tepa qism sakrab qolardi.

`useFortschritt` yiqilsa tepa qism **butunlay yashiriladi** va yo'l o'z
holicha ishlayveradi. Sabab: ball ekranning maqsadi emas, bezagi — u
kelmagani uchun o'quvchini mashqdan mahrum qilish noto'g'ri bo'lardi.

- [ ] **Step 2: Reyting ekranini yozing**

Uch tab: **Guruhim**, **Markaz**, **Darajam**. Lumio'da `SegmentedControl`
bor — shuni ishlating.

*Guruhim* va *Markaz* — jadval. Har qatorda o'rin, to'liq ism va ball.
O'quvchining o'z qatori ajratib ko'rsatiladi (`selbst: true`).

*Darajam* — jadval emas: umumiy ball, hozirgi daraja (nemischa + ostida
o'zbekcha), va keyingi darajagacha qancha qolgani `ProgressBar` bilan.
Eng yuqori darajada «Eng yuqori daraja» deb yoziladi.

Holatlar:

| Holat | Ko'rinishi |
| --- | --- |
| Guruhi yo'q o'quvchi *Guruhim* tabida | «Siz hali guruhga qo'shilmagansiz» |
| Jadval bo'sh | «Bu hafta hali hech kim ball to'plamagan» |
| Xato | «Reytingni ochib bo'lmadi» + «Qayta urinish» |

**Ismlar to'liq ko'rinadi va filiallar aralash** — bu CEO qarori, dizayn
6.1 da yozilgan. Uni «xato» deb qisqartirmang.

- [ ] **Step 3: Marshrutni qo'shing**

```tsx
import { ReytingEkrani } from "@/components/student-portal/lernen/reyting/reyting-ekrani";

export default function Page() {
  return <ReytingEkrani />;
}
```

Ekranning tepasida `StackHeader` bilan orqaga qaytish
(`backHref="/portal/lernen"`) — mavjud naqsh `lernen-unit-page.tsx` da.

- [ ] **Step 4: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Yo'l tepasidagi belgilar va reyting ekrani"
```

---

## Task 9: Seans oxirida ball, seriya va o'rin

**Files:**
- Modify: `client/src/components/student-portal/lernen/uebung/natija-ekrani.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`
- Create: `client/src/components/student-portal/lernen/uebung/natija-xabari.ts`
- Create: `client/src/components/student-portal/lernen/uebung/natija-xabari.test.ts`

**Interfaces:**
- Consumes: 6-vazifadan `useFortschritt`
- Produces: `orinXabari(oldin: number | null, keyin: number | null): string | null`

- [ ] **Step 1: Yiqiladigan testni yozing**

O'rin xabari — sof mantiq, ya'ni sinaladi.

```ts
import { describe, expect, it } from "vitest";
import { orinXabari } from "./natija-xabari";

describe("orinXabari", () => {
  it("ko'tarilganda nechta pog'ona ko'tarilganini aytadi", () => {
    expect(orinXabari(5, 3)).toBe("Guruhda 3-o'rin — 2 pog'ona ko'tarildingiz");
  });

  it("tushganda ham aytadi", () => {
    expect(orinXabari(3, 5)).toBe("Guruhda 5-o'rin — 2 pog'ona tushdingiz");
  });

  it("o'rin o'zgarmagan bo'lsa HECH NARSA aytmaydi", () => {
    // Har safar "3-o'rin" deb turaversa u shovqinga aylanadi va
    // o'quvchi e'tibor bermay qo'yadi.
    expect(orinXabari(3, 3)).toBeNull();
  });

  it("birinchi marta jadvalga tushganda o'rinni aytadi", () => {
    expect(orinXabari(null, 4)).toBe("Guruhda 4-o'rin");
  });

  it("o'rin noma'lum bo'lsa jim turadi", () => {
    expect(orinXabari(3, null)).toBeNull();
    expect(orinXabari(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/natija-xabari.test.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 3: `natija-xabari.ts` ni yozing**

```ts
/**
 * Seans oxirida o'rin haqidagi xabar — yoki jimlik.
 *
 * O'RIN FAQAT O'ZGARGANDA AYTILADI. Har seansdan keyin "3-o'rin" deb
 * turaversa, u shovqinga aylanadi va o'quvchi e'tibor bermay qo'yadi.
 * Ko'tarilgan yoki tushgan lahza esa aynan qaytib kelishga undaydi.
 */
export function orinXabari(
  oldin: number | null,
  keyin: number | null,
): string | null {
  if (keyin == null) return null;
  if (oldin == null) return `Guruhda ${keyin}-o'rin`;
  if (oldin === keyin) return null;
  const farq = Math.abs(oldin - keyin);
  const yonalish = keyin < oldin ? "ko'tarildingiz" : "tushdingiz";
  return `Guruhda ${keyin}-o'rin — ${farq} pog'ona ${yonalish}`;
}
```

- [ ] **Step 4: Natija ekraniga qo'shing**

Uchta yangi narsa, hozirgi «to'g'ri javoblar soni» va «xato qilingan
so'zlar» ro'yxatining orasiga:

- **Topilgan ball** — «+70 ball». Raqam noldan sanalib chiqadi
  (`requestAnimationFrame` bilan, ~600ms). `prefers-reduced-motion`
  yoqilgan bo'lsa darrov oxirgi qiymat ko'rsatiladi.
- **Seriya** — faqat bugungi **birinchi** seans bo'lsa. Buni server
  aytadi: `useFortschritt` dagi `serie` seansdan oldin va keyin
  solishtiriladi; oshgan bo'lsa ko'rsatiladi.
- **O'rin** — `orinXabari` qaytargan matn, `null` bo'lsa hech narsa.

**Ball qayerdan olinadi.** Mijoz ballni O'ZI HISOBLAMAYDI — bu butun
dizaynning asosi. Seans boshlanishida `useFortschritt` dagi `gesamt`
eslab qolinadi, seans tugagach so'rov qaytadan yuritiladi va **farq**
ko'rsatiladi. Shu bilan ekranda ko'rinadigan raqam ham serverning
raqami bo'lib qoladi.

Xato qilingan so'zlar ro'yxati **hozirgidek qoladi** — u pedagogik
jihatdan eng qimmatlisi va ball uni siqib chiqarmasligi kerak.

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Seans oxirida ball, seriya va o'rin o'zgarishi"
```
