# Dialog va juftlash mashqlari

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mashq faqat variant tanlash va yozishdan iborat bo'lmasin — o'quvchi kontekstdan javob topadigan va vaziyatni nutq bilan juftlaydigan ikki format qo'shiladi.

**Architecture:** Ikkala format ham MAVJUD kontentdan quriladi — 1-unitning 6 dialogi va 18 iborasi bazada yotibdi va hozir deyarli ishlatilmayapti. Yangi material yozilmaydi, yangi ustun qo'shilmaydi. Uchinchi o'zgarish: seans turi (`DafLesson.kind`) o'z formatlarini afzal ko'radi, lekin xilma-xillik qoidalari ustun turadi.

**Tech Stack:** NestJS + Prisma (PostgreSQL), jest; Next.js, React Query, Lumio, vitest.

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-07-dialog-va-juftlash-design.md`. Ziddiyat chiqsa dizayn ustun.
- **To'g'ri javob mijozga javobdan OLDIN yuborilmaydi.** Bu dvigatelning asosiy qoidasi.
- **Ball faqat so'zga beriladi.** `ZUORDNEN` va `DIALOG_LUECKE` ball BERMAYDI — Leitner jadvali faqat so'zlarni kuzatadi, ibora va dialog satrida «muddati keldi» degan tushuncha yo'q. Bu qoida `punkteFuer` da allaqachon shunday ishlaydi (so'z bo'lmasa ro'yxat bo'sh, natija nol); yangi formatlar shu holicha qolishi KERAK.
- **Xilma-xillik qoidalari ustun.** `MIN_FORMATE = 5` va `FORMAT_MAX_PRO_SEANS = 3` o'zgarmaydi; seans turining moyilligi faqat TARTIBGA ta'sir qiladi.
- `studentId` faqat tokendan olinadi.
- Sxema o'zgarmaydi, migratsiya YO'Q. Kerak bo'lib qolsa — to'xtang va xabar qiling.
- Barcha yozuv va izohlar **lotin alifbosidagi o'zbekcha**. Kirill va arab harflari yo'q; commitdan oldin o'zgargan fayllaringizni kirill diapazoni bo'yicha grep qiling.
- Mijozda komponent render qilinmaydi — vitest faqat sof mantiqni sinaydi.
- Server testidan oldin `cd server && npx prisma generate`.
- Commit oldidan: server `npm test` + `npm run typecheck`; mijoz `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `git reset --hard` ishlatilmaydi.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/daf/uebung/frage.types.ts` | Ikki yangi format, `itemType` ga `DIALOGZEILE` |
| `server/src/daf/uebung/satz-fragen.ts` | `zuordnen` — ibora juftlash (mavjud `reaktion` yonida) |
| `server/src/daf/uebung/dialog-fragen.ts` | `dialogLuecke` — yangi fayl, yangi material turi |
| `server/src/daf/uebung/uebung.service.ts` | Dialog materialini yuklash, ikki formatni tekshirish |
| `server/src/daf/uebung/seans.ts` | Seans turining moyilligi |
| `server/src/daf/uebung/kind-formate.ts` | Seans turi → afzal formatlar (sof) |
| `server/src/daf/dto/uebung.dto.ts` | `FRAGE_FORMATLAR` va `itemType` ro'yxatlari |
| `client/src/components/student-portal/lernen/types.ts` | Mijoz tomonidagi bir xil ro'yxatlar |
| `client/src/components/student-portal/lernen/uebung/koersatma.ts` | Ikki yangi ko'rsatma, `harakat` xaritasi |
| `client/src/components/student-portal/lernen/uebung/dialog-blok.tsx` | Savol ustidagi suhbat |
| `client/src/components/student-portal/lernen/uebung/yigish.tsx` | Juft soni parametrga chiqadi |

---

## Task 1: `ZUORDNEN` — vaziyat va iborani juftlash

**Files:**
- Modify: `server/src/daf/uebung/frage.types.ts`
- Modify: `server/src/daf/uebung/satz-fragen.ts`
- Modify: `server/src/daf/uebung/satz-fragen.spec.ts`
- Modify: `server/src/daf/uebung/uebung.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.spec.ts`
- Modify: `server/src/daf/dto/uebung.dto.ts`

**Interfaces:**
- Consumes: mavjud `MaterialPhrase` (`id`, `funktionUz`, `de`, `uz`, `sectionCode`)
- Produces:
  - `FrageFormat` ga `'ZUORDNEN'`
  - `zuordnen(phrasen: MaterialPhrase[], rnd: () => number): Frage | null`
  - `UebungService` ichida `pruefeZuordnen(given: string, unitId: number)`

- [ ] **Step 1: Yiqiladigan testni yozing**

`satz-fragen.spec.ts` ga. Faylda `MaterialPhrase` yasaydigan yordamchi bor
bo'lsa o'shani ishlating; bo'lmasa quyidagini qo'shing.

```ts
const ph = (id: number, funktionUz: string, de: string): MaterialPhrase => ({
  id, funktionUz, de, uz: `${de} (uz)`, sectionCode: 'u01-s1',
});

// `rnd` ni `() => 0` qilmang: u chap-aylanma beradi, ayniqsatlik emas.
// Identik almashtirish uchun `() => 0.9999` ishlatiladi.
const rndId = () => 0.9999;

describe('zuordnen', () => {
  const olti = [
    ph(1, 'salomlashish', 'Hallo!'),
    ph(2, "o'zini tanishtirish", 'Ich bin Anna.'),
    ph(3, 'xayrlashish', 'Auf Wiedersehen!'),
    ph(4, 'rahmat aytish', 'Danke!'),
    ph(5, "so'rash", 'Wie heißen Sie?'),
    ph(6, 'javob berish', 'Ich heiße Timur.'),
  ];

  it('oltita juft quradi', () => {
    const f = zuordnen(olti, rndId)!;
    expect(f).not.toBeNull();
    expect(f.format).toBe('ZUORDNEN');
    expect(f.options).toHaveLength(12);
    expect(f.richtig.split('|')).toHaveLength(6);
  });

  it("chap ustun vaziyat, o'ng ustun ibora", () => {
    const f = zuordnen(olti, rndId)!;
    const chap = f.options.slice(0, 6);
    const ong = f.options.slice(6);
    expect(chap).toEqual(expect.arrayContaining(['salomlashish']));
    expect(ong).toEqual(expect.arrayContaining(['Hallo!']));
  });

  it("to'g'ri javob `vaziyat=ibora` shaklida", () => {
    const f = zuordnen(olti, rndId)!;
    for (const juft of f.richtig.split('|')) {
      const [v, i] = juft.split('=');
      expect(olti.some((p) => p.funktionUz === v && p.de === i)).toBe(true);
    }
  });

  it('oltitadan kam ibora bo`lsa null', () => {
    expect(zuordnen(olti.slice(0, 5), rndId)).toBeNull();
  });

  it('bir xil vaziyat ikki marta tushmaydi', () => {
    const takror = [...olti.slice(0, 5), ph(7, 'salomlashish', 'Hi!')];
    // Oltinchi noyob vaziyat topilmadi — savol qurilmaydi.
    expect(zuordnen(takror, rndId)).toBeNull();
  });

  it('oltita iborani BAND qiladi', () => {
    const f = zuordnen(olti, rndId)!;
    expect(f.belegteItems).toHaveLength(6);
    expect(new Set(f.belegteItems).size).toBe(6);
  });
});
```

`uebung.service.spec.ts` ga javob tekshiruvi:

```ts
describe('pruefen — ZUORDNEN', () => {
  const ctx = { studentId: 55, companyId: 1 };

  function fakeMitPhrasen() {
    const prisma = fakePrisma();
    prisma.dafPhrase.findMany = jest.fn(async () => [
      { id: 1, funktionUz: 'salomlashish', de: 'Hallo!', uz: 'Salom!' },
      { id: 2, funktionUz: "o'zini tanishtirish", de: 'Ich bin Anna.', uz: 'Men Annaman.' },
    ]);
    prisma.dafPhrase.findUnique = jest.fn(async () => ({
      de: 'Hallo!', uz: 'Salom!',
    }));
    return prisma;
  }

  it('oltita juft kelmasa BUTUNLAY xato', async () => {
    // Xuddi PAAR kabi: juft soni noto'g'ri bo'lsa javob shakli buzilgan.
    const prisma = fakeMitPhrasen();
    const r = await new UebungService(prisma as any).pruefen(
      { itemType: 'PHRASE', itemId: 1, format: 'ZUORDNEN', given: 'salomlashish=Hallo!' },
      ctx,
    );
    expect(r.isCorrect).toBe(false);
  });

  it('ZUORDNEN ball BERMAYDI — ibora Leitnerga kirmaydi', async () => {
    const prisma = fakeMitPhrasen();
    await new UebungService(prisma as any).pruefen(
      { itemType: 'PHRASE', itemId: 1, format: 'ZUORDNEN', given: 'salomlashish=Hallo!' },
      ctx,
    );
    expect(prisma.dafAttempt.create.mock.calls[0][0].data.points).toBe(0);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/uebung/satz-fragen.spec.ts`
Expected: FAIL — `zuordnen is not a function`

- [ ] **Step 3: `zuordnen` ni yozing**

`satz-fragen.ts` ga, mavjud `reaktion` yonida — u ham `MaterialPhrase`
ishlatadi va chalg'ituvchi intizomi bir xil.

```ts
/** `ZUORDNEN` da nechta juft ko'rsatiladi (kurs dizayni 4-jadval). */
const ZUORDNEN_JUFT = 6;

/**
 * Vaziyat va iborani juftlash.
 *
 * `PAAR` DAN FARQI: `PAAR` so'zni tarjimasi bilan juftlaydi — bu lug'at
 * mashqi. Bu esa VAZIYATNI NUTQ bilan juftlaydi: «xayrlashmoqchisiz —
 * nima deysiz?». Redemittel aynan shu uchun yozilgan, va shu paytgacha
 * faqat `REAKTION` uchun ishlatilardi.
 *
 * VAZIYAT NOYOB BO'LISHI SHART. Ikki ibora bir xil `funktionUz` bilan
 * kelsa, o'quvchining juftlashi to'g'ri bo'lsa ham "xato" deb baholanib
 * qolardi — chap ustunda bir xil ikki yozuv turib, qaysi biri qaysi
 * iboraga tegishli ekani noaniq bo'lardi.
 */
export function zuordnen(
  phrasen: MaterialPhrase[],
  rnd: () => number,
): Frage | null {
  const korilgan = new Set<string>();
  const tanlangan: MaterialPhrase[] = [];
  for (const p of mischen(phrasen, rnd)) {
    if (korilgan.has(p.funktionUz)) continue;
    korilgan.add(p.funktionUz);
    tanlangan.push(p);
    if (tanlangan.length === ZUORDNEN_JUFT) break;
  }
  if (tanlangan.length < ZUORDNEN_JUFT) return null;

  const chap = tanlangan.map((p) => p.funktionUz);
  const ong = mischen(tanlangan.map((p) => p.de), rnd);

  return {
    format: 'ZUORDNEN',
    itemType: 'PHRASE',
    itemId: tanlangan[0].id,
    prompt: 'Vaziyatni ibora bilan juftlang',
    hilfe: null,
    options: [...chap, ...ong],
    richtig: tanlangan.map((p) => `${p.funktionUz}=${p.de}`).join('|'),
    akzeptiert: [],
    // Oltitasi ham band: savol ularning hammasini javobi bilan ko'rsatadi,
    // shuning uchun hech biri shu seansda ikkinchi marta so'ralmaydi.
    belegteItems: tanlangan.map((p) => materialSchluessel('PHRASE', p.id)),
  };
}
```

- [ ] **Step 4: Javobni tekshirishni yozing**

`pruefen` da `ZUORDNEN` `PAAR` kabi ALOHIDA yo'ldan boradi va
`richtigeAntwort` ga yetib bormaydi — chunki oltita natijani bitta satrga
sig'dirib bo'lmaydi.

`pruefePaar` naqshini takrorlang, lekin so'z emas, ibora bo'yicha:
`given` ni `|` va `=` bilan bo'ling, aynan oltita juft bo'lishini talab
qiling, `dafPhrase.findMany({ where: { funktionUz: { in: ... }, unitId } })`
bilan o'qing va har juftni `istRichtig` bilan solishtiring.

**Ball berilmaydi:** `betroffeneWortIds` bo'sh qoladi (ibora so'z emas),
ya'ni `punkteFuer([])` noldan qaytadi. Bunga alohida kod kerak emas —
mavjud `itemType === 'WORT'` sharti buni o'zi ta'minlaydi. Leitner holati
ham yangilanmaydi.

- [ ] **Step 5: Nomzodlarga ulang**

`baueKandidaten` da iboralar allaqachon yuklanadi (`phrases`). O'sha
ro'yxatdan `zuordnen(phrases, rnd)` ni bir marta chaqiring va natija
`null` bo'lmasa nomzodlarga qo'shing — `paar` uchun qilingani kabi.

**Uch marta emas, bir marta:** `PAAR` uch marta chaqiriladi, chunki u
to'rt so'zdan iborat va turli to'rtlik chiqadi. `ZUORDNEN` oltita
iborani oladi va bo'limlarda ibora kam (har bo'limda kamida 3 ta), ya'ni
ikkinchi chaqiruv deyarli har doim bir xil to'plamni qaytaradi.

- [ ] **Step 6: Ro'yxatlarga qo'shing**

`FrageFormat` ga `'ZUORDNEN'`, `dto/uebung.dto.ts` dagi `FRAGE_FORMATLAR`
massiviga ham.

- [ ] **Step 7: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/daf/
git commit -m "ZUORDNEN: vaziyat va iborani juftlash"
```

---

## Task 2: `DIALOG_LUECKE` — dialogdan bir satr tushib qolgan

Bu vazifa yangi MATERIAL TURINI olib kiradi. Shu paytgacha savol so'z, gap
yoki iboraga tegishli edi; endi dialog satriga ham tegishli bo'ladi.

**Files:**
- Create: `server/src/daf/uebung/dialog-fragen.ts`
- Create: `server/src/daf/uebung/dialog-fragen.spec.ts`
- Modify: `server/src/daf/uebung/frage.types.ts`
- Modify: `server/src/daf/uebung/uebung.service.ts`
- Modify: `server/src/daf/uebung/uebung.service.spec.ts`
- Modify: `server/src/daf/dto/uebung.dto.ts`

**Interfaces:**
- Produces:
  - `Frage['itemType']` ga `'DIALOGZEILE'`
  - `FrageFormat` ga `'DIALOG_LUECKE'`
  - `MaterialDialog` va `MaterialDialogZeile` tiplari `frage.types.ts` da
  - `dialogLuecke(dialog: MaterialDialog, andere: MaterialDialogZeile[], rnd: () => number): Frage | null`

```ts
export interface MaterialDialogZeile {
  id: number;
  sprecher: string;
  de: string;
  uz: string;
}

export interface MaterialDialog {
  id: number;
  titelDe: string;
  zeilen: MaterialDialogZeile[];
  sectionCode: string;
}
```

- [ ] **Step 1: Yiqiladigan testni yozing**

`dialog-fragen.spec.ts`:

```ts
import { dialogLuecke } from './dialog-fragen';
import type { MaterialDialog, MaterialDialogZeile } from './frage.types';

const z = (id: number, sprecher: string, de: string): MaterialDialogZeile => ({
  id, sprecher, de, uz: `${de} (uz)`,
});

const dialog: MaterialDialog = {
  id: 1,
  titelDe: 'Bist du Mia?',
  sectionCode: 'u01-s1',
  zeilen: [
    z(10, 'Jonas', 'Hallo! Bist du Mia?'),
    z(11, 'Mia', 'Ja, ich bin Mia. Und du?'),
    z(12, 'Jonas', 'Ich bin Jonas.'),
    z(13, 'Mia', 'Freut mich!'),
  ],
};

const andere = [
  z(20, 'A', 'Guten Abend!'),
  z(21, 'B', 'Nein, danke.'),
  z(22, 'C', 'Ich wohne in Berlin.'),
  z(23, 'D', 'Wie heißen Sie?'),
];

// `() => 0` chap-aylanma beradi, ayniqsatlik EMAS.
const rndId = () => 0.9999;

describe('dialogLuecke', () => {
  it('savol quradi va to`rtta variant beradi', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    expect(f).not.toBeNull();
    expect(f.format).toBe('DIALOG_LUECKE');
    expect(f.itemType).toBe('DIALOGZEILE');
    expect(f.options).toHaveLength(4);
    expect(f.options).toContain(f.richtig);
  });

  it('BIRINCHI satrni olib tashlamaydi', () => {
    // Usiz suhbat kontekstsiz qoladi va topshiriq taxminga aylanadi.
    for (let i = 0; i < 30; i += 1) {
      const f = dialogLuecke(dialog, andere, () => i / 30)!;
      expect(f.richtig).not.toBe('Hallo! Bist du Mia?');
    }
  });

  it('savolning o`zligi — olib tashlangan SATR', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    const zeile = dialog.zeilen.find((x) => x.de === f.richtig)!;
    expect(f.itemId).toBe(zeile.id);
  });

  it('promptda suhbat bor va bo`sh joy belgilangan', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    expect(f.prompt).toContain('Jonas');
    expect(f.prompt).toContain('___');
    expect(f.prompt).not.toContain(f.richtig);
  });

  it('chalg`ituvchi shu dialogning satri BO`LMAYDI', () => {
    const f = dialogLuecke(dialog, andere, rndId)!;
    const oz = new Set(dialog.zeilen.map((x) => x.de));
    const chalgituvchi = f.options.filter((o) => o !== f.richtig);
    expect(chalgituvchi.filter((o) => oz.has(o))).toEqual([]);
  });

  it('to`rt satrdan kam dialogdan savol qurilmaydi', () => {
    const qisqa: MaterialDialog = { ...dialog, zeilen: dialog.zeilen.slice(0, 3) };
    expect(dialogLuecke(qisqa, andere, rndId)).toBeNull();
  });

  it('uchta chalg`ituvchi topilmasa null', () => {
    expect(dialogLuecke(dialog, andere.slice(0, 2), rndId)).toBeNull();
  });

  it('bir xil matnli chalg`ituvchi ikki marta tushmaydi', () => {
    const takror = [...andere, z(24, 'E', 'Guten Abend!')];
    const f = dialogLuecke(dialog, takror, rndId)!;
    expect(new Set(f.options).size).toBe(f.options.length);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx prisma generate && npx jest src/daf/uebung/dialog-fragen.spec.ts`
Expected: FAIL — `Cannot find module './dialog-fragen'`

- [ ] **Step 3: `dialog-fragen.ts` ni yozing**

Alohida fayl, chunki bu yangi material turi — `satz-fragen.ts` allaqachon
to'rtta funksiyani olib yuribdi va beshinchisi uni chalkashtirardi.

Mantiq:

1. Dialogda kamida 4 satr bo'lishi shart (`null` aks holda).
2. Olib tashlanadigan satr **birinchidan keyingilaridan** tanlanadi.
3. `prompt` — butun suhbat, har satr `Sprecher: matn` ko'rinishida, olib
   tashlangani o'rnida `___`.
4. Chalg'ituvchilar `andere` dan: shu dialogning satrlari **chiqarib
   tashlanadi**, `normalisieren` bilan takrorlar filtrlanadi, uchtasi
   olinadi. Uchtasi topilmasa `null`.
5. `itemType: 'DIALOGZEILE'`, `itemId` — olib tashlangan satrning `id`si.
6. `belegteItems` — bitta element (`materialSchluessel('DIALOGZEILE', id)`).

`normalisieren` `./antwort` dan olinadi — chalg'ituvchi to'g'ri javobdan
faqat tinish belgisi bilan farq qilsa, u ham «to'g'ri» bo'lib qolardi.

- [ ] **Step 4: `itemType` ni kengaytiring**

`frage.types.ts` da `itemType` endi to'rt qiymatli. Quyidagi joylar
YANGILANISHI SHART, aks holda tip xatosi yoki jimgina noto'g'ri
xatti-harakat chiqadi:

- `frage.types.ts` — `Frage['itemType']`
- `dto/uebung.dto.ts` — `CheckAntwortDto` va `ErsatzQueryDto` dagi `@IsIn` ro'yxatlari
- `uebung.service.ts` — `PruefenInput['itemType']`, `ladeMaterial`
- `client/src/components/student-portal/lernen/types.ts` — `MaterialTyp`

`ladeMaterial` ga `DIALOGZEILE` shoxi qo'shiladi:
`dafDialogLine.findUnique({ where: { id: itemId } })` → `{ de, uz }`.
`richtigeAntwort` da `DIALOG_LUECKE` — `WORT_UZ` kabi oddiy holat: to'g'ri
javob satrning `de` si.

- [ ] **Step 5: Dialog materialini yuklang**

`baueKandidaten` da bo'lim materiali o'qiladigan joyga qo'shing:

```ts
    const dialogRows = await this.prisma.dafDialog.findMany({
      where: { sectionId: { in: sectionIds } },
      include: { zeilen: { orderBy: { order: 'asc' } } },
    } as any);
```

Har dialog uchun bitta `dialogLuecke` nomzodi quriladi. `andere` —
BOSHQA dialoglarning barcha satrlari (shu dialogniki emas).

- [ ] **Step 6: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/ client/src/components/student-portal/lernen/types.ts
git commit -m "DIALOG_LUECKE: dialogdan tushib qolgan satrni topish"
```

---

## Task 3: Seans turining moyilligi

**Files:**
- Create: `server/src/daf/uebung/kind-formate.ts`
- Create: `server/src/daf/uebung/kind-formate.spec.ts`
- Modify: `server/src/daf/uebung/seans.ts`
- Modify: `server/src/daf/uebung/seans.spec.ts`
- Modify: `server/src/daf/uebung/uebung.service.ts`

**Interfaces:**
- Produces:
  - `bevorzugteFormate(kind: string | null): FrageFormat[]`
  - `baueSeans(kandidaten, anzahl, rnd, pflicht?, bevorzugt?)` — beshinchi ixtiyoriy parametr

- [ ] **Step 1: Yiqiladigan testni yozing**

`kind-formate.spec.ts`:

```ts
import { bevorzugteFormate } from './kind-formate';
import type { FrageFormat } from './frage.types';

describe('bevorzugteFormate', () => {
  it('Tanishuv tanib olishga suyanadi', () => {
    expect(bevorzugteFormate('SECTION_A')).toEqual(
      expect.arrayContaining(['WORT_UZ', 'PAAR', 'ZUORDNEN']),
    );
  });

  it('Ishlatish ishlab chiqarishga suyanadi', () => {
    expect(bevorzugteFormate('SECTION_B')).toEqual(
      expect.arrayContaining(['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN']),
    );
  });

  it("O'tish sinovida moyillik YO'Q — ataylab aralash", () => {
    expect(bevorzugteFormate('BRIDGE')).toEqual([]);
  });

  it('Yakuniy sinov vaziyatga suyanadi', () => {
    expect(bevorzugteFormate('UNIT_TEST')).toEqual(
      expect.arrayContaining(['REAKTION', 'ZUORDNEN', 'DIALOG_LUECKE']),
    );
  });

  it('har turning formatlari HAQIQATDA mavjud formatlardan', () => {
    // Xaritaga yozuv xatosi bilan mavjud bo'lmagan format tushsa, u
    // jimgina e'tiborsiz qolardi — moyillik ishlamay, hech kim
    // sezmasdi.
    const barchasi: FrageFormat[] = [
      'WORT_UZ', 'UZ_WORT', 'PAAR', 'ARTIKEL', 'LUECKE',
      'SATZ_BAUEN', 'SATZ_UEBERSETZEN', 'REAKTION',
      'ZUORDNEN', 'DIALOG_LUECKE',
    ];
    for (const kind of ['SECTION_A', 'SECTION_B', 'BRIDGE', 'UNIT_TEST']) {
      for (const f of bevorzugteFormate(kind)) {
        expect(barchasi).toContain(f);
      }
    }
  });

  it('eski DiB darsida (kind null) moyillik yo`q', () => {
    expect(bevorzugteFormate(null)).toEqual([]);
  });

  it('notanish kind moyillikni buzmaydi', () => {
    expect(bevorzugteFormate('BOSHQA')).toEqual([]);
  });
});
```

`seans.spec.ts` ga — moyillik xilma-xillikni buzmasligi:

```ts
describe('baueSeans — moyillik', () => {
  it('afzal formatlar oldinga suriladi', () => {
    const k = [
      ...Array.from({ length: 6 }, (_, i) => frage('SATZ_BAUEN', 'SATZ', 100 + i)),
      ...Array.from({ length: 6 }, (_, i) => frage('WORT_UZ', 'WORT', 200 + i)),
    ];
    const plan = baueSeans(k, 6, () => 0.9999, [], ['WORT_UZ']);
    const wortUz = plan.fragen.filter((f) => f.format === 'WORT_UZ').length;
    const boshqa = plan.fragen.length - wortUz;
    expect(wortUz).toBeGreaterThan(0);
    // Cap baribir ushlab turadi — moyillik uni bekor qilmaydi.
    expect(wortUz).toBeLessThanOrEqual(FORMAT_MAX_PRO_SEANS);
    expect(boshqa).toBeGreaterThan(0);
  });

  it('moyillik MIN_FORMATE ni buzmaydi', () => {
    // Nomzodlarda 6 xil format bor; moyillik faqat bittasini afzal
    // ko'rsatsa ham, seansda kamida MIN_FORMATE xil bo'lishi kerak.
    const formatlar: FrageFormat[] = [
      'WORT_UZ', 'UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN', 'SATZ_UEBERSETZEN',
    ];
    const k = formatlar.flatMap((f, i) =>
      Array.from({ length: 3 }, (_, j) => frage(f, 'WORT', i * 10 + j)),
    );
    const plan = baueSeans(k, 12, () => 0.9999, [], ['WORT_UZ']);
    const xil = new Set(plan.fragen.map((f) => f.format)).size;
    expect(xil).toBeGreaterThanOrEqual(MIN_FORMATE);
  });

  it('moyillik berilmasa xatti-harakat o`zgarmaydi', () => {
    const k = Array.from({ length: 10 }, (_, i) => frage('WORT_UZ', 'WORT', i));
    const a = baueSeans(k, 5, () => 0.5);
    const b = baueSeans(k, 5, () => 0.5, [], []);
    expect(a.fragen.map((f) => f.itemId)).toEqual(b.fragen.map((f) => f.itemId));
  });
});
```

`frage(...)` yordamchisi faylda bor; bo'lmasa `Frage` qaytaradigan
kichik funksiya yozing (`belegteItems` ni `materialSchluessel` bilan
to'ldiring).

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd server && npx jest src/daf/uebung/kind-formate.spec.ts src/daf/uebung/seans.spec.ts`
Expected: FAIL — modul yo'q, `baueSeans` beshinchi parametrni bilmaydi.

- [ ] **Step 3: `kind-formate.ts` ni yozing**

```ts
import type { FrageFormat } from './frage.types';

/**
 * Seans turining «ta'mi» — QAT'IY BO'LINISH EMAS, MOYILLIK.
 *
 * NEGA QAT'IY EMAS (arifmetika). Kurs dizayni 16 format uchun yozilgan.
 * Bugun 10 tasi bor, va «Tanishuv» ga tegishlisi uchtasi. Qat'iy
 * bo'linsa, seansda 3 xil format qolardi — `seans.ts` ning o'z qoidasi
 * esa kamida `MIN_FORMATE` (5) talab qiladi. Ikki qoida bir-birini
 * inkor qilardi.
 *
 * Shuning uchun bu ro'yxat faqat TARTIBGA ta'sir qiladi: mos formatlar
 * oldinga suriladi, yetmasa qolganidan olinadi. Formatlar 16 taga
 * yetganda moyillik o'z-o'zidan qat'iy bo'linishga aylanadi va bu kodni
 * o'zgartirish shart bo'lmaydi.
 *
 * `BRIDGE` da moyillik ATAYLAB yo'q: o'tish sinovi aralash bo'lishi
 * kerak (kurs dizayni 3-bo'lim).
 */
const XARITA: Record<string, FrageFormat[]> = {
  SECTION_A: ['WORT_UZ', 'PAAR', 'ZUORDNEN'],
  SECTION_B: ['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN'],
  BRIDGE: [],
  UNIT_TEST: ['REAKTION', 'ZUORDNEN', 'DIALOG_LUECKE', 'SATZ_UEBERSETZEN'],
};

export function bevorzugteFormate(kind: string | null): FrageFormat[] {
  if (!kind) return [];
  return XARITA[kind] ?? [];
}
```

- [ ] **Step 4: `baueSeans` ga ulang**

Beshinchi ixtiyoriy parametr `bevorzugt: FrageFormat[] = []`. Tasodifiy
aralashtirishdan **KEYIN** barqaror saralash qo'llanadi: afzal formatdagi
nomzodlar oldinga o'tadi, qolganlarining o'zaro tartibi o'zgarmaydi.

Joylashtirish sikli, cap, ketma-ketlik va `MIN_FORMATE` mantig'i
**umuman o'zgarmaydi** — moyillik faqat pooldagi tartibga ta'sir qiladi.
Shu sababli xilma-xillik kafolatlari saqlanadi.

`bevorzugt` bo'sh bo'lsa saralash o'tkazib yuboriladi va natija avvalgidek
bo'ladi (uchinchi test shuni qo'riqlaydi).

- [ ] **Step 5: Servisdan uzating**

`seans` da dars `kind` i allaqachon o'qiladi (`lesson.kind`). Uni
`bevorzugteFormate(lesson.kind)` orqali `baueSeans` ga beshinchi argument
qilib uzating.

`ersatz` va `wiederholung` da moyillik ISHLATILMAYDI: birinchisi bitta
almashtiruvchi savol beradi, ikkinchisi hech qanday darsga tegishli emas.

- [ ] **Step 6: Tasdiqlang va commit qiling**

Run: `cd server && npm test && npm run typecheck`
Expected: PASS.

```bash
git status
git add server/src/daf/
git commit -m "Seans turi o'z formatlarini afzal ko'radi"
```

---

## Task 4: Mijoz — ikki yangi formatni ko'rsatish

**Files:**
- Modify: `client/src/components/student-portal/lernen/types.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/koersatma.ts`
- Modify: `client/src/components/student-portal/lernen/uebung/koersatma.test.ts`
- Create: `client/src/components/student-portal/lernen/uebung/dialog-blok.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/yigish.tsx`
- Modify: `client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx`

**Interfaces:**
- Consumes: 1 va 2-vazifalardan `'ZUORDNEN'`, `'DIALOG_LUECKE'`, `'DIALOGZEILE'`
- Produces: `<DialogBlok>` — savol ustidagi suhbat

- [ ] **Step 1: Yiqiladigan testni yozing**

`koersatma.test.ts` dagi `HAMMASI` ro'yxatiga ikki yangi formatni qo'shing
va quyidagini qo'shing:

```ts
describe("yangi formatlar", () => {
  it("ikkalasiga ham ko'rsatma bor", () => {
    expect(koersatma("ZUORDNEN").length).toBeGreaterThan(0);
    expect(koersatma("DIALOG_LUECKE").length).toBeGreaterThan(0);
  });

  it("ZUORDNEN — yig'ish, DIALOG_LUECKE — tanlash", () => {
    // ZUORDNEN juftlaydi (PAAR kabi), DIALOG_LUECKE variant tanlaydi.
    expect(harakat("ZUORDNEN")).toBe("YIGISH");
    expect(harakat("DIALOG_LUECKE")).toBe("TANLASH");
  });
});
```

Mavjud «har sakkiz formatga matn beradi» testi endi o'nta formatni
tekshiradi — `HAMMASI` ro'yxatini yangilaganingizda u o'zi shunday
bo'ladi. Test nomini ham o'nga to'g'rilang, aks holda nom yolg'on
gapirib turadi.

- [ ] **Step 2: Test yiqilishini tasdiqlang**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/koersatma.test.ts`
Expected: FAIL — `MATN` da yangi formatlar yo'q.

- [ ] **Step 3: Ko'rsatmalarni qo'shing**

`koersatma.ts` dagi `MATN` ga:

```ts
  ZUORDNEN: "Vaziyatni mos ibora bilan juftlang",
  DIALOG_LUECKE: "Suhbatda nima aytilgan?",
```

`harakat` da: `ZUORDNEN` → `"YIGISH"`, `DIALOG_LUECKE` → `"TANLASH"`.

`FrageFormat` va `MaterialTyp` ro'yxatlarini `types.ts` da server bilan
bir xil qiling (`'ZUORDNEN'`, `'DIALOG_LUECKE'`, `'DIALOGZEILE'`).

- [ ] **Step 4: `Yigish` ni olti juftga tayyorlang**

Hozir `Yigish` `PAAR` uchun aynan **to'rt** juftga qulflangan, va
`seans-ekrani.tsx` dagi `tayyor` sharti ham `yigilgan.length === 4`.

Juft sonini formatdan chiqaring — `PAAR` uchun 4, `ZUORDNEN` uchun 6:

```ts
/**
 * Nechta juft to'liq javob hisoblanadi.
 *
 * Server ham shu sonni talab qiladi: juft soni noto'g'ri bo'lsa javob
 * shakli buzilgan hisoblanadi va BUTUNLAY xato bo'ladi. Shuning uchun
 * bu son ikki tomonda bir xil bo'lishi shart.
 */
export function juftSoni(format: "PAAR" | "ZUORDNEN"): number {
  return format === "ZUORDNEN" ? 6 : 4;
}
```

`Yigish` ning `format` propi endi `"SATZ_BAUEN" | "PAAR" | "ZUORDNEN"`.
Ikki ustunning mazmuni o'zgaradi (`PAAR`: nemischa/o'zbekcha,
`ZUORDNEN`: vaziyat/ibora), lekin **mexanikasi bir xil** — chapdagini,
keyin o'ngdagini bosib juftlash, qayta bosib bekor qilish. Javob satri
ham bir xil: `chap=o'ng|chap=o'ng|…`.

`juftSoni` ni sof funksiya sifatida sinang: `PAAR` → 4, `ZUORDNEN` → 6.

- [ ] **Step 5: `DialogBlok` ni yozing**

`DIALOG_LUECKE` da savol matnining o'rniga butun suhbat ko'rsatiladi.
Server `prompt` ni tayyor satr qilib yuboradi (`Sprecher: matn`, bo'sh
joyda `___`), ya'ni mijoz uni faqat **chiroyli chizadi**, qaytadan
qurmaydi.

```tsx
export interface DialogBlokProps {
  /** Serverdan kelgan tayyor suhbat matni, satrlar `\n` bilan ajratilgan. */
  matn: string;
}
```

Har satr `Sprecher: matn` shaklida keladi — birinchi ikki nuqtagacha
bo'lgan qismi gapiruvchi nomi. Nomi yarim qalin va xiraroq, matni oddiy.
`___` bo'lgan satr ajratib ko'rsatiladi (`bg-tint`, ramka), shunda
o'quvchi qayerni to'ldirayotganini darrov ko'radi.

Ikki nuqta topilmasa butun satr matn sifatida chiziladi — server shaklini
o'zgartirsa ekran buzilmasin.

- [ ] **Step 6: Seans ekraniga ulang**

`DIALOG_LUECKE` bo'lganda: `prompt` o'rniga `<DialogBlok matn={frage.prompt} />`,
ostida odatdagi `<Tanlash>`. Boshqa formatlar o'zgarmaydi.

`ZUORDNEN` bo'lganda `<Yigish format="ZUORDNEN" …>` va `tayyor` sharti
`yigilgan.length === juftSoni(frage.format)`.

- [ ] **Step 7: Uch o'lchamni o'qib chiqing**

Olti juft telefonda tor joyga tushadi. Ikki ustun `grid-cols-2` bo'lib
qoladi, matn `truncate` bilan qisqaradi.

**Brauzer tekshiruvi subagent tomonidan QILINMAYDI** — brauzeri yo'q.
Yozilgan Tailwind sinflarini o'qib, har chegarada nima chiqishini
hisobotda ayting va tekshirib bo'lmagan narsalarni ro'yxat qiling.
Qilinmagan tekshiruvni qilingan deb yozish mumkin emas.

- [ ] **Step 8: Tasdiqlang va commit qiling**

Run: `cd client && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

```bash
git status
git add client/src/
git commit -m "Dialog va juftlash mashqlarini ekranga chiqarish"
```
