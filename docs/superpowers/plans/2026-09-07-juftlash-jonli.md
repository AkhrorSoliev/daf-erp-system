# Juftlashda jonli javob

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Juftlash mashqida har juft joyiga tushganda darrov to'g'ri yoki xato ekani ko'rinadi, va «Tekshirish» bosqichi butunlay yo'qoladi.

**Architecture:** Har juft bosilganda serverga kichik so'rov ketadi va u HAQIQIY javob sifatida yoziladi — ball beriladi, Leitner holati yangilanadi. Shu sababli tuzatish o'z-o'zidan bepul bo'ladi: xato bosgan zahoti so'z ertangi kunga suriladi va ikkinchi urinish «muddati kelmagan» bo'lib qoladi. Mijozga ishonish shart emas.

**Tech Stack:** NestJS + Prisma (PostgreSQL), jest; Next.js, React Query, Lumio, vitest.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-07-juftlash-jonli-design.md`. Ziddiyat chiqsa dizayn ustun.
- **To'g'ri javob mijozga hech qachon yuborilmaydi.** Yangi yo'l faqat `ha`/`yo'q` qaytaradi.
- **Ball ikki marta hisoblanmasin.** Juftlash formatlarida `pruefen` endi CHAQIRILMAYDI — har juft o'zi baholanadi.
- `studentId` faqat tokendan (`@CurrentUser('studentId')`).
- Yangi yo'l `branch-route-policy.ts` da `SELF` toifasiga kiritiladi, aks holda build yiqiladi.
- Sxema o'zgarmaydi, migratsiya YO'Q. Kerak bo'lsa — to'xtang va xabar qiling.
- Barcha yozuv va izohlar **lotin alifbosidagi o'zbekcha**, NEGA ekanini tushuntiradi. Kirill/arab harfi yo'q; commitdan oldin o'zgargan fayllarni grep qiling.
- Mijozda komponent render qilinmaydi — vitest faqat sof mantiqni sinaydi.
- Server testidan oldin `cd server && npx prisma generate`.
- Testda `rnd = () => 0` ni ayniqsatlik deb ishlatmang — u chap-aylanma. `() => 0.9999` ishlating.
- Commit oldidan: server `npm test` + `npm run typecheck`; mijoz `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `git reset --hard` ishlatilmaydi.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/daf/dto/uebung.dto.ts` | `JuftDto` — bitta juft |
| `server/src/daf/uebung/uebung.service.ts` | `juft()` — bitta juftni tekshiradi, yozadi, ballaydi |
| `server/src/daf/daf-portal.controller.ts` | `POST .../uebung/juft` |
| `server/src/common/auth/branch-route-policy.ts` | Yo'lni toifalash |
| `client/.../lernen/types.ts` | `JuftNatija` tipi |
| `client/.../lernen/queries.ts` | `useJuftTekshir()` |
| `client/.../lernen/uebung/juft-holati.ts` | Juft holatlarining sof mantiqi |
| `client/.../lernen/uebung/juft-holati.test.ts` | Uning testlari |
| `client/.../lernen/uebung/yigish.tsx` | Jonli holatni ko'rsatadi |
| `client/.../lernen/uebung/seans-ekrani.tsx` | Juftlashda «Tekshirish» yo'q; xato paneli ro'yxat |

---

## Task 1: Bitta juftni tekshiradigan yo'l

**Files:**
- Modify: `server/src/daf/dto/uebung.dto.ts`
- Modify: `server/src/daf/uebung/uebung.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.spec.ts`
- Modify: `server/src/daf/daf-portal.controller.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: mavjud xususiy metodlar `ladeMaterial`, `punkteEingabeFuer`, `aktualisiereZustand`, va `punkteFuer` (`./punkte` dan)
- Produces:
  - `UebungService.juft(input: JuftInput, ctx: PruefenContext): Promise<{ isCorrect: boolean }>`
  - `POST /student-portal/lernen/uebung/juft`

```ts
export interface JuftInput {
  itemType: 'WORT' | 'PHRASE';
  itemId: number;
  format: 'PAAR' | 'ZUORDNEN';
  chap: string;
  ong: string;
}
```

- [ ] **Step 1: Yiqiladigan testni yozing**

`uebung.service.spec.ts` ga. Faylda `fakePrisma()` bor — o'shani ishlating.

```ts
describe('juft — bitta juftni tekshirish', () => {
  const ctx = { studentId: 55, companyId: 1 };

  function fakeWort(state: { dueAt: Date } | null) {
    const prisma = fakePrisma();
    // `ladeMaterial('WORT', 5)` shu qatorni qaytaradi.
    prisma.dafLexeme.findUnique = jest.fn(async () => ({
      id: 5, de: 'das Haus', uz: 'uy', artikel: 'das', unitId: 1,
    }));
    // Juft `de` bo'yicha, unitga cheklab qidiriladi.
    prisma.dafLexeme.findMany = jest.fn(async () => [
      { id: 5, de: 'das Haus', uz: 'uy' },
    ]);
    prisma.dafLexemeState.findMany = jest.fn(async () =>
      state ? [{ lexemeId: 5, dueAt: state.dueAt }] : [],
    );
    return prisma;
  }

  const kecha = () => new Date(Date.now() - 86_400_000);
  const ertaga = () => new Date(Date.now() + 86_400_000);

  it("to'g'ri juftni to'g'ri deb aytadi", async () => {
    const prisma = fakeWort(null);
    const r = await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'uy' },
      ctx,
    );
    expect(r).toEqual({ isCorrect: true });
  });

  it("xato juftni xato deb aytadi", async () => {
    const prisma = fakeWort(null);
    const r = await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'stol' },
      ctx,
    );
    expect(r).toEqual({ isCorrect: false });
  });

  it("TO'G'RI JAVOBNI YUBORMAYDI", async () => {
    // Butun dvigatelning asosiy qoidasi: brauzer javobni bilmaydi.
    const prisma = fakeWort(null);
    const r = await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'stol' },
      ctx,
    );
    expect(Object.keys(r)).toEqual(['isCorrect']);
  });

  it("muddati kelgan so'zga to'g'ri javob 10 ball beradi", async () => {
    const prisma = fakeWort({ dueAt: kecha() });
    await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'uy' },
      ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(10);
  });

  it('TUZATISH BEPUL — muddati kelmagan so`zga ball berilmaydi', async () => {
    // BU ENG MUHIM TEST. Xato bosgandan keyin so'z ertangi kunga
    // suriladi; ikkinchi (to'g'ri) bosish shu holatni ko'radi va ball
    // bermaydi. Dizaynning butun «tuzatish bepul» qoidasi shunga tayanadi
    // va uni ushlab turadigan alohida kod YO'Q — mavjud qoida bajaradi.
    const prisma = fakeWort({ dueAt: ertaga() });
    await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'uy' },
      ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(0);
  });

  it('xato javob Leitner holatini NOLGA tushiradi', async () => {
    const prisma = fakeWort({ dueAt: kecha() });
    await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'stol' },
      ctx,
    );
    const yozilgan = prisma.dafLexemeState.upsert.mock.calls[0][0];
    expect((yozilgan.update ?? yozilgan.create).strength).toBe(0);
  });

  it('ZUORDNEN ball bermaydi va Leitnerga tegmaydi', async () => {
    const prisma = fakePrisma();
    prisma.dafPhrase.findUnique = jest.fn(async () => ({
      de: 'Hallo!', uz: 'Salom!', unitId: 1,
    }));
    prisma.dafPhrase.findMany = jest.fn(async () => [
      { id: 1, funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!' },
    ]);
    const r = await new UebungService(prisma as any).juft(
      { itemType: 'PHRASE', itemId: 1, format: 'ZUORDNEN', chap: 'salomlashish', ong: 'Hallo!' },
      ctx,
    );
    expect(r.isCorrect).toBe(true);
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(0);
    expect(prisma.dafLexemeState.upsert).not.toHaveBeenCalled();
  });

  it('urinishga filial va guruh muhrlanadi', async () => {
    const prisma = fakeWort(null);
    prisma.enrollment.findFirst = jest.fn(async () => ({ groupId: 'g-1' }));
    await new UebungService(prisma as any).juft(
      { itemType: 'WORT', itemId: 5, format: 'PAAR', chap: 'das Haus', ong: 'uy' },
      ctx,
    );
    const data = prisma.dafAttempt.create.mock.calls[0][0].data;
    expect(data.groupId).toBe('g-1');
    expect(data).toHaveProperty('branchId');
  });

  it('material topilmasa xato tashlaydi', async () => {
    const prisma = fakePrisma();
    prisma.dafLexeme.findUnique = jest.fn(async () => null);
    await expect(
      new UebungService(prisma as any).juft(
        { itemType: 'WORT', itemId: 999, format: 'PAAR', chap: 'a', ong: 'b' },
        ctx,
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/uebung/uebung.service.spec.ts -t "juft —"`
Expected: FAIL — `juft is not a function`

- [ ] **Step 3: `juft()` ni yozing**

**Mavjud qismlarni QAYTA YOZMANG.** `pruefen` da hamma narsa bor va shu
metod ularni qayta ishlatadi:

- `ladeMaterial(itemType, itemId)` — materialni va `unitId` ni beradi
- `punkteEingabeFuer(studentId, woerter)` — muddati kelganini aniqlaydi
- `punkteFuer(...)` — `./punkte` dan
- `aktualisiereZustand(...)` — Leitner
- `tryResolveStudentBranchId`, `currentGroupId` — muhrlash

Mantiq:

1. `ladeMaterial` bilan materialni o'qing; topilmasa `NotFoundException`.
2. `material.unitId` bo'lmasa `BadRequestException` — qidiruv unitga cheklanishi shart (`pruefePaar`/`pruefeZuordnen` dagi qoidaning o'zi).
3. **`PAAR`:** `dafLexeme.findMany({ where: { de: chap, unitId } })` bilan so'zni toping; `istRichtig(ong, soz.uz)` bilan solishtiring. Baholanadigan so'z — **topilgan so'z**, `itemId` emas: `PAAR` savolining `itemId` si to'rtlikning birinchisi, bosilgan juft esa boshqasi bo'lishi mumkin.
4. **`ZUORDNEN`:** `dafPhrase.findMany({ where: { funktionUz: chap, unitId } })`; `istRichtig(ong, ibora.de)`. Ibora Leitnerda yo'q — ball ham, holat yangilanishi ham yo'q.
5. Ball: faqat `PAAR` uchun, `punkteEingabeFuer` + `punkteFuer` orqali.
6. `dafAttempt.create` — `points`, `branchId`, `groupId`, `lexemeId` (faqat `PAAR`), `given: chap + '=' + ong`.
7. Faqat `PAAR` uchun `aktualisiereZustand`.
8. `{ isCorrect }` qaytaring — boshqa hech narsa.

**Tartib muhim:** muddat holati `aktualisiereZustand` dan OLDIN o'qilishi
shart, aks holda «muddati kelganmidi» degan savolga javob bermay qoladi.
`pruefen` da shu tartib allaqachon bor — shu naqshga rioya qiling.

- [ ] **Step 4: DTO va yo'lni qo'shing**

```ts
/**
 * Bitta juft — jonli tekshiruv uchun.
 *
 * `studentId` maydoni ATAYLAB YO'Q: u tokendan olinadi. Javob ham faqat
 * `ha`/`yo'q` — to'g'ri javobning o'zi hech qachon qaytarilmaydi.
 */
export class JuftDto {
  @IsIn(['WORT', 'PHRASE'])
  itemType!: 'WORT' | 'PHRASE';

  @IsInt()
  itemId!: number;

  // Faqat juftlash formatlari: qolganlarida "juft" degan tushuncha yo'q.
  @IsIn(['PAAR', 'ZUORDNEN'])
  format!: 'PAAR' | 'ZUORDNEN';

  @IsString()
  @MaxLength(200)
  chap!: string;

  @IsString()
  @MaxLength(200)
  ong!: string;
}
```

Kontrollerga `POST 'uebung/juft'`, `@CurrentUser('studentId')` va
`@CurrentUser('companyId')` bilan. Route siyosatida `SELF`.

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/
git commit -m "Bitta juftni tekshiradigan yo'l"
```

---

## Task 2: Juft holatlarining sof mantiqi va so'rov

**Files:**
- Create: `client/src/components/student-portal/lernen/uebung/juft-holati.ts`
- Create: `client/src/components/student-portal/lernen/uebung/juft-holati.test.ts`
- Modify: `client/src/components/student-portal/lernen/types.ts`
- Modify: `client/src/components/student-portal/lernen/queries.ts`

**Interfaces:**
- Consumes: 1-vazifadan `POST .../uebung/juft`
- Produces:
  - `JuftNatija` tipi (`{ isCorrect: boolean }`)
  - `useJuftTekshir()`
  - `JonliJuft`, `boshlaJuftlar`, `juftQoshildi`, `juftJavobKeldi`, `hammasiTogri`

```ts
export type JuftHolat = "kutilmoqda" | "togri";

export interface JonliJuft {
  chapIdx: number;
  ongIdx: number;
  holat: JuftHolat;
}
```

**Nega `xato` holati yo'q.** Xato juft ekranda qolmaydi — u darhol
o'chiriladi va ikkala tugma bo'sh bo'ladi. Qizil chaqnash ko'rinish
masalasi (komponentda), holat emas.

- [ ] **Step 1: Yiqiladigan testni yozing**

`juft-holati.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  boshlaJuftlar,
  hammasiTogri,
  juftJavobKeldi,
  juftQoshildi,
  type JonliJuft,
} from "./juft-holati";

describe("juftQoshildi", () => {
  it("yangi juft kutilmoqda holatida qo'shiladi", () => {
    const j = juftQoshildi(boshlaJuftlar(), 0, 2);
    expect(j).toEqual([{ chapIdx: 0, ongIdx: 2, holat: "kutilmoqda" }]);
  });

  it("band chap yoki o'ng ustunni ikkinchi marta bog'lamaydi", () => {
    // Yashil juftning tugmasi boshqa bosilmaydi; band indeks kelsa
    // ro'yxat o'zgarmaydi.
    const bor: JonliJuft[] = [{ chapIdx: 0, ongIdx: 2, holat: "togri" }];
    expect(juftQoshildi(bor, 0, 3)).toEqual(bor);
    expect(juftQoshildi(bor, 1, 2)).toEqual(bor);
  });
});

describe("juftJavobKeldi", () => {
  const kutayotgan: JonliJuft[] = [{ chapIdx: 0, ongIdx: 2, holat: "kutilmoqda" }];

  it("to'g'ri javob juftni yashil qiladi", () => {
    expect(juftJavobKeldi(kutayotgan, 0, 2, true)).toEqual([
      { chapIdx: 0, ongIdx: 2, holat: "togri" },
    ]);
  });

  it("xato javob juftni butunlay olib tashlaydi", () => {
    // Ikkala tugma yana bo'sh bo'ladi va qayta bosilishi mumkin.
    expect(juftJavobKeldi(kutayotgan, 0, 2, false)).toEqual([]);
  });

  it("boshqa juftlarga tegmaydi", () => {
    const ikki: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 2, holat: "togri" },
      { chapIdx: 1, ongIdx: 3, holat: "kutilmoqda" },
    ];
    expect(juftJavobKeldi(ikki, 1, 3, false)).toEqual([ikki[0]]);
  });

  it("allaqachon yo'q juftga javob kelsa yiqilmaydi", () => {
    // Aloqa sekin bo'lsa javob kechikib kelishi mumkin.
    expect(juftJavobKeldi([], 0, 2, true)).toEqual([]);
  });
});

describe("hammasiTogri", () => {
  it("hamma juft yashil bo'lganda va soni yetganda rost", () => {
    const j: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 1, holat: "togri" },
      { chapIdx: 1, ongIdx: 0, holat: "togri" },
    ];
    expect(hammasiTogri(j, 2)).toBe(true);
  });

  it("bittasi hali kutilayotgan bo'lsa yolg'on", () => {
    const j: JonliJuft[] = [
      { chapIdx: 0, ongIdx: 1, holat: "togri" },
      { chapIdx: 1, ongIdx: 0, holat: "kutilmoqda" },
    ];
    expect(hammasiTogri(j, 2)).toBe(false);
  });

  it("soni yetmasa yolg'on", () => {
    expect(hammasiTogri([{ chapIdx: 0, ongIdx: 1, holat: "togri" }], 4)).toBe(false);
  });

  it("bo'sh ro'yxat yolg'on", () => {
    expect(hammasiTogri([], 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/juft-holati.test.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: `juft-holati.ts` ni yozing**

Sof funksiyalar, o'zgarmas ro'yxat qaytaradi (React holati sifatida
ishlatiladi, joyida o'zgartirilgan massiv qayta chizilmaydi).

`juftQoshildi(juftlar, chapIdx, ongIdx)` — indekslardan biri band bo'lsa
o'zgarishsiz qaytaradi, aks holda `kutilmoqda` juft qo'shadi.

`juftJavobKeldi(juftlar, chapIdx, ongIdx, isCorrect)` — mos juftni topib
`togri` qiladi yoki olib tashlaydi. Juft topilmasa o'zgarishsiz.

`hammasiTogri(juftlar, soni)` — `juftlar.length === soni` VA hammasi
`togri`.

`boshlaJuftlar()` — bo'sh ro'yxat qaytaradi. Alohida funksiya bo'lgani
uchun chaqiruvchi `[]` ni har renderda qayta yasab, keraksiz qayta
chizishni keltirib chiqarmaydi va boshlang'ich holat bitta joyda turadi.

- [ ] **Step 4: Tip va so'rovni qo'shing**

`types.ts` ga `export interface JuftNatija { isCorrect: boolean }`.

`queries.ts` ga:

```ts
/**
 * Bitta juftni tekshiradi — jonli javob uchun.
 *
 * `useMutation`, `useQuery` emas: bu imperativ hodisa (o'quvchi juftni
 * bosdi), sahifa yuklanishi emas. Keshga ham tushmaydi — bir xil juftni
 * ikkinchi marta bosish YANGI javob hisoblanadi va serverda yoziladi.
 */
export function useJuftTekshir() {
  return useMutation<
    JuftNatija,
    unknown,
    // `itemType` ATAYLAB `MaterialTyp` dan tor: server faqat shu ikkitasini
    // qabul qiladi (gap va dialog satrida "juft" degan tushuncha yo'q),
    // va tip buni chaqiruv joyidayoq ushlab qolishi kerak.
    { itemType: "WORT" | "PHRASE"; itemId: number; format: "PAAR" | "ZUORDNEN"; chap: string; ong: string }
  >({
    mutationFn: (body) => api.post(`${BASE}/uebung/juft`, body).then((r) => r.data),
  });
}
```

- [ ] **Step 5: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Juft holatlarining sof mantiqi va tekshiruv so'rovi"
```

---

## Task 3: Ekranda jonli javob

**Files:**
- Modify: `client/src/components/student-portal/lernen/uebung/yigish.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`

**Interfaces:**
- Consumes: 2-vazifadan `JonliJuft`, `boshlaJuftlar`, `juftQoshildi`, `juftJavobKeldi`, `hammasiTogri`, `useJuftTekshir`; mavjud `juftSoni`

- [ ] **Step 1: `Juftlash` ni jonli qiling**

Hozir `Juftlash` `IndexJuft[]` ni yuritadi va tugmani bosish faqat
mahalliy holatni o'zgartiradi. Endi juft hosil bo'lganda tashqariga
xabar beriladi va javob kutiladi.

Yangi prop: `onJuft(chapIdx: number, ongIdx: number): void` — juft hosil
bo'lganda chaqiriladi. Juftlarning holati endi tashqaridan `juftlar:
JonliJuft[]` sifatida keladi; komponent ularni faqat chizadi.

**Nega holat tashqariga chiqadi.** So'rovni yuborish va javobni kutish
seans ekranining ishi; komponent yupqa qolishi kerak — bu shu loyihaning
o'zgarmas qoidasi.

Ko'rinish:

| Holat | Ikkala tugma |
| --- | --- |
| Bo'sh | odatdagi |
| Kutilmoqda | xira, bosilmaydi |
| To'g'ri | yashil, bosilmaydi |
| Xato | qizil chaqnaydi, so'ng bo'sh bo'ladi |

Xato chaqnashi uchun juft o'chirilgandan keyin qisqa vaqt (≈500ms) qizil
ko'rsatiladi. Buni `seans-ekrani` boshqaradi (qaysi indekslar endigina
xato bo'lgani), komponent esa `xatoIdxlar` propidan o'qiydi.

`prefers-reduced-motion` yoqilgan bo'lsa chaqnash bo'lmaydi — rang
darhol qaytadi.

- [ ] **Step 2: Seans ekranini ulang**

Juftlash formatlarida (`PAAR`, `ZUORDNEN`):

- `onJuft` kelganda `juftQoshildi` bilan `kutilmoqda` qo'shiladi va
  `useJuftTekshir` chaqiriladi
- Javob kelganda `juftJavobKeldi` qo'llanadi
- **Xato bo'lsa** o'sha indekslar qisqa vaqt `xatoIdxlar` da turadi
- `hammasiTogri(juftlar, juftSoni(format))` rost bo'lganda savol tugaydi

**`pruefen` juftlash formatlarida CHAQIRILMAYDI.** Har juft allaqachon
serverda baholangan; ikkinchi marta yuborilsa ball ikki karra hisoblanardi.

Savol tugaganda `javobBerildi` ga beriladigan natija: `isCorrect` —
**hamma juft birinchi urinishda to'g'ri bo'lganmi**. Buni mijoz sanaydi
(nechta xato javob kelgani), va bu xavfsiz: u faqat savolning keyinroq
qaytishiga ta'sir qiladi. Ball allaqachon serverda hisoblangan va mijoz
unga tegmaydi.

`richtig` maydoni bu holatda kerak emas — juftlash savoli to'g'ri
javobsiz tugaydi, chunki o'quvchi uni ekranda yig'ib bo'lgan. Bo'sh satr
beriladi.

- [ ] **Step 3: Tugmani moslang**

Juftlash formatlarida pastdagi tugma **faqat «Keyingi»** bo'ladi va u
hamma juft yashil bo'lgandagina faollashadi. «Tekshirish» bosqichi yo'q.

Qolgan sakkiz formatda tugma avvalgidek ikki bosqichli qoladi.

- [ ] **Step 4: Xato panelini o'qiladigan qiling**

`natija.richtig` xom satr sifatida chiqadigan joyda (`Xato` paneli)
`PAAR` va `ZUORDNEN` uchun juftlar **ro'yxat** bo'lib chiqsin — seans
oxiridagi ro'yxatdagi kabi.

Bu panel jonli javob bilan juftlashda deyarli ko'rinmaydi, lekin so'rov
yiqilgan holatda chiqadi va o'qiladigan bo'lishi kerak.

- [ ] **Step 5: Aloqa uzilishini hisobga oling**

`useJuftTekshir` yiqilsa: `kutilmoqda` juft **olib tashlanadi** (ikkala
tugma bo'sh bo'ladi) va qisqa xabar ko'rsatiladi. O'quvchi qayta bosadi.

Juft osilib qolishi eng yomon holat bo'lardi — savol hech qachon
tugamasdi.

- [ ] **Step 6: Uch o'lchamni o'qib chiqing**

**Brauzer tekshiruvi subagent tomonidan QILINMAYDI** — brauzeri yo'q.
Yozilgan Tailwind sinflarini o'qib, har chegarada nima chiqishini
hisobotda ayting va tekshirib bo'lmagan narsalarni ro'yxat qiling.
Qilinmagan tekshiruvni qilingan deb yozish mumkin emas.

- [ ] **Step 7: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Juftlashda jonli javob: har juft darrov tekshiriladi"
```
