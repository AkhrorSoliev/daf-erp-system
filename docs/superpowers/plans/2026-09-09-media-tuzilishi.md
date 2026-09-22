# Media tuzilishi — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/media` bitta uzun sahifadan ikki darajali tuzilishga o'tsin —
umumiy manzara alohida, bitta bo'limning tafsiloti alohida sahifada.

**Architecture:** Faqat mijoz tomonidagi qayta tuzish. Uch server yo'li
o'zgarmaydi; yagona server o'zgarishi — `inhalt` javobiga bo'lim va unit
nomini qo'shish (sahifa sarlavhasi uchun).

**Tech Stack:** Next.js App Router, React Query yo'q (mavjud `api` klienti),
vitest (mijoz, faqat sof mantiq), jest (server).

## Global Constraints

- Barcha sharh va matn **lotin alifbosidagi o'zbekcha**. Kirill/arab taqiq.
- Sharh **NEGA** ekanini tushuntiradi.
- Mijozda testlar **faqat sof mantiq** — render yo'q, `@testing-library` yo'q.
- **Sxema o'zgarmaydi. Pullik chaqiruv yo'q. `server/scripts/` dagi skript
  ishga tushirilmaydi va import qilinmaydi.**
- `client/CLAUDE.md` amal qiladi. Ayniqsa: **ichki bo'lim holati manzilda
  saqlanadi** (`?tab=`), sukut qiymat manzilga **yozilmaydi**, yuklanishda
  skeleton (spinner emas), bo'sh holat harakatga chorlaydi.
- Server darvozalari: `npm test`, `npm run typecheck`. Mijoz: `npm test`,
  `npx tsc --noEmit`, `npm run lint` (0 xato), `npm run build`.

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
| --- | --- |
| `server/src/daf/media/daf-media-inhalt.service.ts` | Mavjud. Javobga bo'lim/unit nomi |
| `client/src/app/(dashboard)/media/sections/[id]/page.tsx` | **Yangi.** Bo'lim sahifasi |
| `client/src/components/media/section-detail-client.tsx` | **Yangi.** Ikki ichki bo'lim + manzil holati |
| `client/src/components/media/section-detail-utils.ts` | **Yangi.** Sof mantiq (tab/format tanlash) |
| `client/src/app/(dashboard)/media/assets/page.tsx` | **Yangi.** Eski fayllar va obrazlar |
| `client/src/components/media/media-client.tsx` | Mavjud. Obraz/fayl bloklari ko'chadi |
| `client/src/components/media/media-coverage-section.tsx` | Mavjud. Bo'lim qatori havolaga aylanadi |
| `client/src/components/media/media-fragen-panel.tsx` | Mavjud. Format navigatsiyasi qo'shiladi |

---

## Task 1: Server — bo'lim sarlavhasi uchun nom

**Files:**
- Modify: `server/src/daf/media/daf-media-inhalt.service.ts`
- Test: `server/src/daf/media/daf-media-inhalt.service.spec.ts`

**Interfaces:**
- Produces: `SectionInhalt` ga `sectionCode: string`, `sectionTitleUz: string`, `unitTitleUz: string`, `unitCode: string | null`

**Nega:** bo'lim sahifasi sarlavhasida «1-unit «Salom!» → 1-bo'lim «Salom
va xayr»» yozilishi kerak. Bu ma'lumot `coverage` javobida bor, lekin
bitta bo'lim uchun butun daraxtni yuklash isrof.

- [ ] **Step 1: Failing testni yozing**

```ts
it('bo`lim va unit nomini qaytaradi', async () => {
  const p = fakePrisma({});
  p.dafSection = {
    findUnique: jest.fn(async () => ({
      code: 'u01-s1',
      titleUz: 'Salom va xayr',
      unit: { code: 'u01', titleUz: 'Salom!' },
    })),
  } as any;
  const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
  expect(r.sectionCode).toBe('u01-s1');
  expect(r.sectionTitleUz).toBe('Salom va xayr');
  expect(r.unitTitleUz).toBe('Salom!');
});

it('bo`lim topilmasa 404', async () => {
  // Sahifa mavjud bo'lmagan bo'limni ochsa, bo'sh ro'yxat emas, aniq
  // xato ko'rsatilishi kerak — aks holda "material hali yo'q" deb
  // o'qilib, odam kutib qoladi.
  const p = fakePrisma({});
  p.dafSection = { findUnique: jest.fn(async () => null) } as any;
  await expect(
    new DafMediaInhaltService(p as any, config as any).inhalt(999),
  ).rejects.toThrow(NotFoundException);
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx prisma generate && npx jest src/daf/media/daf-media-inhalt.service.spec.ts
```

- [ ] **Step 3: Amalga oshiring**

`inhalt()` boshida bo'limni `include: { unit: true }` bilan o'qing,
topilmasa `NotFoundException` tashlang, natijaga to'rt maydonni qo'shing.

**Diqqat:** `fragen` yo'li allaqachon topilmagan bo'lim uchun 404
qaytaradi. Ikkalasi bir xil bo'lsin — bugungi holat («inhalt bo'sh
qaytaradi, fragen 404 beradi») ko'rikda kuzatuv sifatida yozilgan edi.

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

- [ ] **Step 5: Darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src && git commit -m "Media: inhalt javobida bo'lim va unit nomi"
```

---

## Task 2: Mijoz — bo'lim sahifasi

**Files:**
- Create: `client/src/app/(dashboard)/media/sections/[id]/page.tsx`
- Create: `client/src/components/media/section-detail-client.tsx`
- Create: `client/src/components/media/section-detail-utils.ts`
- Test: `client/src/components/media/section-detail-utils.test.ts`
- Modify: `client/src/components/media/media-fragen-panel.tsx` (format navigatsiyasi)
- Modify: `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: `GET /daf/media/sections/:id/inhalt` (Task 1 kengaytirgan), `.../fragen`
- Produces: `tanlangantTab(param)`, `boshlangichFormat(fragen, param)`

**Bu vazifaning o'zagi:** 340 ta savolni bitta ro'yxatda ko'rsatmaslik.
Format **navigatsiyaga** aylanadi.

- [ ] **Step 1: Failing testni yozing**

```ts
import { tanlanganTab, boshlangichFormat } from "./section-detail-utils";

describe("tanlanganTab", () => {
  it("sukut — material", () => {
    expect(tanlanganTab(null)).toBe("material");
  });
  it("manzildagi qiymat o`qiladi", () => {
    expect(tanlanganTab("savollar")).toBe("savollar");
  });
  it("notanish qiymat sukutga tushadi", () => {
    // Manzil qo'lda tahrirlanishi mumkin; sahifa oq ekran bermasin.
    expect(tanlanganTab("xxx")).toBe("material");
  });
});

describe("boshlangichFormat", () => {
  const f = [
    { format: "WORT_UZ" }, { format: "WORT_UZ" }, { format: "WORT_UZ" },
    { format: "ARTIKEL" },
  ] as any;

  it("manzilda format bo`lsa o`sha", () => {
    expect(boshlangichFormat(f, "ARTIKEL")).toBe("ARTIKEL");
  });

  it("manzilda yo`q bo`lsa ENG KO`P savolli format", () => {
    // Bo'sh ekran bilan boshlash odamni "endi nima bosaman?" holatiga
    // qo'yadi. Eng katta guruh — eng foydali boshlang'ich.
    expect(boshlangichFormat(f, null)).toBe("WORT_UZ");
  });

  it("manzildagi format bu bo`limda yo`q bo`lsa ENG KO`P savollisiga tushadi", () => {
    // Havola boshqa bo'limdan ko'chirilgan bo'lishi mumkin.
    expect(boshlangichFormat(f, "DIALOG_LUECKE")).toBe("WORT_UZ");
  });

  it("savol umuman bo`lmasa null", () => {
    expect(boshlangichFormat([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd client && npx vitest run src/components/media/section-detail-utils.test.ts
```

- [ ] **Step 3: Sahifani yozing**

Sarlavha: unit nomi → bo'lim nomi (Task 1 dan). Orqaga havola `/media` ga.

Ikki ichki bo'lim `<Tabs value={...} onValueChange={...}>` bilan —
**`defaultValue` ISHLATILMAYDI** (`client/CLAUDE.md`). Manzilga
`?tab=savollar` yoziladi; **sukut (`material`) manzilga yozilmaydi**.

Savollar tomonida formatlar yon ro'yxat: har birida nomi va soni,
tanlangani ajratilgan. Tanlov `?format=` ga yoziladi, sukut yozilmaydi.

Ikkala tomon ham o'z qamrovini aytib tursin (mavjud yorliqlar
saqlanadi): material — faqat shu bo'lim; savollar — shu bo'lim va
undan oldingilari.

`breadcrumb-routes.ts` ga `/media` uchun yozuv qo'shing.

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

- [ ] **Step 5: Darvozalar va commit**

```bash
cd client && npm test && npx tsc --noEmit && npm run lint && npm run build
git add client/src && git commit -m "Media: bo'lim sahifasi va format navigatsiyasi"
```

---

## Task 3: Mijoz — `/media` yengillashadi, `/media/assets` ajraladi

**Files:**
- Create: `client/src/app/(dashboard)/media/assets/page.tsx`
- Create: `client/src/components/media/assets-client.tsx`
- Modify: `client/src/components/media/media-client.tsx`
- Modify: `client/src/components/media/media-coverage-section.tsx`
- Modify: `client/src/lib/breadcrumb-routes.ts`

- [ ] **Step 1: Obraz va fayl bloklarini ko'chiring**

`media-client.tsx` dagi obrazlar (`PersonaCard`) va `AssetList` bloklari
`assets-client.tsx` ga **ko'chiriladi, qayta yozilmaydi**. `/media` da
ularning o'rniga bitta havola qoladi.

Nega ko'chirish: ular kurs kontenti emas, eski quvurning natijasi.
Kurs qamrovi ustida turishi o'qiyotgan odamni chalg'itadi.

- [ ] **Step 2: Bo'lim qatorini havolaga aylantiring**

`media-coverage-section.tsx` da `SectionRow` endi ochilmaydi —
`/media/sections/<id>` ga havola bo'ladi. `MediaInhaltPanel` va
`MediaFragenPanel` chaqiruvlari **olib tashlanadi** (ular endi bo'lim
sahifasida).

Unit darajasidagi ochilish **qoladi**: unit ochilsa bo'limlari
ko'rinadi, lekin ichida og'ir narsa yo'q.

- [ ] **Step 3: Darvozalar va commit**

```bash
cd client && npm test && npx tsc --noEmit && npm run lint && npm run build
git add client/src && git commit -m "Media: umumiy sahifa yengillashdi, fayllar ajraldi"
```

---

## Self-review natijasi

**Spec qamrovi.** §2 ikki daraja → 2, 3-vazifalar; §2.2 manzilda
saqlash → Task 2 testlari; §3.1 material → mavjud panel qayta
ishlatiladi; §3.2 format navigatsiyasi → Task 2; §3.3 qamrov
yorliqlari → Task 2 Step 3; §4 `/media` yengillashishi → Task 3;
§5 server → Task 1.

**Qoplanmagan:** §6 dagi «odam tekshiradi» (sahifa tushunarli bo'ldimi)
— ataylab vazifa emas, bu butun ishning sababi.

**Tip mosligi.** `SectionInhalt` Task 1 da kengayadi, Task 2 da
ishlatiladi. `tanlanganTab`/`boshlangichFormat` Task 2 da e'lon
qilinadi va o'sha yerda ishlatiladi.
