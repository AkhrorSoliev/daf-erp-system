# Media ro'yxati — amalga oshirish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/media` sahifasida bo'lim ochilganda ichidagi BUTUN material
(eshitib ko'rish mumkin) va qurilishi mumkin bo'lgan BUTUN savollar
ro'yxati (javoblari bilan) ko'rinsin.

**Architecture:** Ikkita yangi `GET` yo'li, ikkalasi ham bo'lim
identifikatori bo'yicha. Birinchisi materialni bazadan yig'adi.
Ikkinchisi dvigatelning **haqiqiy quruvchilarini** chaqiradi — savollar
hech qayerda saqlanmagani uchun (kurs dizayni D6/D7) ularni qurishdan
boshqa yo'l yo'q, va nusxa yozish taqiqlanadi.

**Tech Stack:** NestJS + Prisma 7, Next.js App Router, jest (server),
vitest (mijoz, faqat sof mantiq).

## Global Constraints

- Barcha sharh va foydalanuvchiga ko'rinadigan matn **lotin alifbosidagi
  o'zbekcha**. Kirill va arab harfi taqiqlanadi — commitdan oldin grep.
- Sharh **NEGA** ekanini tushuntiradi.
- Mijozda testlar **faqat sof mantiq** — vitest, render yo'q,
  `@testing-library` qo'shilmaydi.
- `npm test` tip tekshirmaydi — `npm run typecheck` alohida.
- **Sxema o'zgarmaydi. Pullik chaqiruv yo'q. Skript ishga tushirilmaydi
  va import qilinmaydi.**
- Birinchi server testidan oldin `cd server && npx prisma generate`.
- Yangi route qo'shilsa `server/src/common/auth/branch-route-policy.ts`
  ga toifalanishi SHART, aks holda build yiqiladi. Mavjud
  `GET /daf/media/coverage` yozuvining yoniga qo'shiladi — bir xil
  sabab (`Daf*` jadvallarida `companyId` yo'q).
- `/media` yo'llari `@Roles('CEO', 'Branch Director', 'Administrator')`
  ostida — javoblarni ko'rsatish shu sababdan xavfsiz.

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
| --- | --- |
| `server/src/daf/media/daf-media-inhalt.service.ts` | **Yangi.** Bo'lim materiali (so'z/gap/ibora/dialog + audio manzili) |
| `server/src/daf/media/daf-media-fragen.service.ts` | **Yangi.** Bo'lim uchun qurilishi mumkin bo'lgan savollar |
| `server/src/daf/daf-media.controller.ts` | Mavjud. Ikkita `@Get` qo'shiladi |
| `server/src/common/auth/branch-route-policy.ts` | Mavjud. Ikkita route toifalanadi |
| `client/src/components/media/media-inhalt-panel.tsx` | **Yangi.** Material ro'yxati |
| `client/src/components/media/media-fragen-panel.tsx` | **Yangi.** Savollar ro'yxati |
| `client/src/components/media/media-coverage-section.tsx` | Mavjud. Bo'lim ochilganda ikki panelni chaqiradi |

---

## Task 1: Server — bo'lim materiali

**Files:**
- Create: `server/src/daf/media/daf-media-inhalt.service.ts`
- Test: `server/src/daf/media/daf-media-inhalt.service.spec.ts`
- Modify: `server/src/daf/daf-media.controller.ts`, `server/src/daf/daf.module.ts`, `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Produces: `DafMediaInhaltService.inhalt(sectionId: number): Promise<SectionInhalt>` bilan
  `SectionInhalt = { woerter: InhaltWort[]; saetze: InhaltZeile[]; phrasen: InhaltZeile[]; dialogZeilen: InhaltDialogZeile[] }`
- Route: `GET /daf/media/sections/:id/inhalt`

- [ ] **Step 1: Failing testni yozing**

```ts
import { DafMediaInhaltService } from './daf-media-inhalt.service';

const config = { get: (k: string) => (k === 'R2_PUBLIC_URL' ? 'https://r2.example' : undefined) };

function fakePrisma(rows: any) {
  return {
    dafLexeme: { findMany: jest.fn(async () => rows.woerter ?? []) },
    dafSentence: { findMany: jest.fn(async () => rows.saetze ?? []) },
    dafPhrase: { findMany: jest.fn(async () => rows.phrasen ?? []) },
    dafDialogLine: { findMany: jest.fn(async () => rows.zeilen ?? []) },
  };
}

describe('DafMediaInhaltService', () => {
  it('audio kalitini TO`LIQ manzilga aylantiradi', async () => {
    // Xom kalit `<audio src>` ga tushsa portal manziliga nisbatan
    // yechiladi va 404 beradi — 2026-09-08 dagi Critical aynan shu edi.
    const p = fakePrisma({
      woerter: [{ id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, audioKey: 'daf/audio/x.mp3', imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    expect(r.woerter[0].audioUrl).toBe('https://r2.example/daf/audio/x.mp3');
  });

  it('audiosi yo`q so`zda audioUrl null', async () => {
    const p = fakePrisma({
      woerter: [{ id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, audioKey: null, imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    expect(r.woerter[0].audioUrl).toBeNull();
  });

  it('PASSIV so`z ham ro`yxatda bo`ladi', async () => {
    // Dvigatel `core: false` so'zni so'ramaydi, lekin u kontentning bir
    // qismi. CEO «nega bu so'zdan savol yo'q?» deb so'raganda javob shu
    // yerda ko'rinishi kerak, shuning uchun ro'yxatdan CHIQARILMAYDI —
    // faqat belgilanadi.
    const p = fakePrisma({
      woerter: [{ id: 2, de: 'und', uz: 'va', artikel: null, anzeige: null, core: false, audioKey: null, imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    expect(r.woerter).toHaveLength(1);
    expect(r.woerter[0].core).toBe(false);
  });

  it('R2_PUBLIC_URL sozlanmagan bo`lsa audioUrl null, kalit sizib chiqmaydi', async () => {
    const p = fakePrisma({
      woerter: [{ id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, audioKey: 'daf/audio/x.mp3', imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, { get: () => undefined } as any).inhalt(7);
    expect(r.woerter[0].audioUrl).toBeNull();
  });

  it('faqat SO`RALGAN bo`limning materiali olinadi', async () => {
    const p = fakePrisma({});
    await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    for (const t of [p.dafLexeme, p.dafSentence, p.dafPhrase]) {
      expect((t.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({ sectionId: 7 });
    }
  });
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx prisma generate && npx jest src/daf/media/daf-media-inhalt.service.spec.ts
```
Kutilgan: `Cannot find module './daf-media-inhalt.service'`

- [ ] **Step 3: Amalga oshiring**

Xizmatni yozing. Manzil qurish `daf-media-coverage.service.ts` dagi
bilan **bir xil** bo'lsin (`base.replace(/\/$/, '') + '/' + key`) — uchta
joyda uch xil qilish aynan shu sinf xatoni qaytaradi.

Dialog satrlari `sectionId` tashimaydi — ular `DafDialog` orqali
bog'lanadi, shuning uchun ular uchun `where: { dialog: { sectionId } }`
ishlatiladi.

Kontrollerga qo'shing:

```ts
  @Get('sections/:id/inhalt')
  inhalt(@Param('id', ParseIntPipe) id: number): Promise<SectionInhalt> {
    return this.inhaltService.inhalt(id);
  }
```

`branch-route-policy.ts` da `GET /daf/media/coverage` turgan
`COMPANY_WIDE` bloki ro'yxatiga `GET /daf/media/sections/:id/inhalt`
qo'shing.

- [ ] **Step 4: Testni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/media/
```
Kutilgan: PASS

- [ ] **Step 5: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src
git commit -m "Media: bo'lim materiali yo'li"
```

---

## Task 2: Server — bo'lim savollari

**Files:**
- Create: `server/src/daf/media/daf-media-fragen.service.ts`
- Test: `server/src/daf/media/daf-media-fragen.service.spec.ts`
- Modify: `server/src/daf/daf-media.controller.ts`, `server/src/daf/daf.module.ts`, `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: 12 ta quruvchi (`wortUz`, `uzWort`, `paar`, `artikel`, `audioWort`, `wortTippen` — `wort-fragen.ts`; `luecke`, `satzBauen`, `satzUebersetzen`, `reaktion`, `zuordnen` — `satz-fragen.ts`; `dialogLuecke` — `dialog-fragen.ts`), va `Frage` tipi (`frage.types.ts`)
- Produces: `DafMediaFragenService.fragen(sectionId: number): Promise<VorschauFrage[]>`
- Route: `GET /daf/media/sections/:id/fragen`

**BU VAZIFANING O'ZAGI:** savollar bazada YO'Q. Ular materialdan qayta
quriladi. Quruvchilarning nusxasini yozish **TAQIQLANADI** — nusxa
dvigateldan ajralib ketadi va sahifa o'quvchi ko'rmaydigan savolni
ko'rsatib turadi.

- [ ] **Step 1: Failing testni yozing**

```ts
import type { FrageFormat } from '../uebung/frage.types';
import { DafMediaFragenService, VORSCHAU_BAUER } from './daf-media-fragen.service';

describe('VORSCHAU_BAUER', () => {
  /**
   * ENG MUHIM TEKSHIRUV, VA U TEST EMAS — TIP.
   *
   * `VORSCHAU_BAUER` `Record<FrageFormat, ...>` deb e'lon qilinadi, ya'ni
   * 13-format qo'shilib bu yerga yozilmasa TypeScript build'ni yiqitadi.
   * Testga ishonib bo'lmasdi: yangi format qo'shgan odam testni ham
   * o'zgartirmaydi va sahifa jimgina "hammasi shu" deb turaverardi.
   *
   * Quyidagi test faqat ro'yxat BO'SH EMASLIGINI va har kalit haqiqiy
   * qiymat tashishini tekshiradi — to'liqlikni kompilyator ta'minlaydi.
   */
  it('har format uchun yozuv bor va bo`sh emas', () => {
    const kalitlar = Object.keys(VORSCHAU_BAUER) as FrageFormat[];
    expect(kalitlar.length).toBeGreaterThanOrEqual(12);
    for (const k of kalitlar) expect(VORSCHAU_BAUER[k]).toBeDefined();
  });
});

describe('DafMediaFragenService', () => {
  it('savol JAVOBI bilan qaytadi', async () => {
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima')] });
    const r = await svc.fragen(7);
    const wu = r.find((f) => f.format === 'WORT_UZ')!;
    expect(wu.richtig).toBe('salom');
    expect(wu.options).toContain('salom');
  });

  it('PASSIV so`zdan savol qurilmaydi', async () => {
    // Dvigatel `core: false` so'zni so'ramaydi ham, chalg'ituvchi ham
    // qilmaydi. Oldindan ko'rish shu qoidani AYNAN takrorlashi kerak,
    // aks holda sahifa mavjud bo'lmagan savolni ko'rsatardi.
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima'), { ...w(5, 'und', 'va'), core: false }] });
    const r = await svc.fragen(7);
    expect(r.some((f) => f.richtig === 'va')).toBe(false);
  });

  it('audiosi yo`q so`zdan AUDIO_WORT chiqmaydi', async () => {
    const svc = yasa({ woerter: [1, 2, 3, 4].map((i) => ({ ...w(i, `w${i}`, `u${i}`), audioKey: null })) });
    const r = await svc.fragen(7);
    expect(r.some((f) => f.format === 'AUDIO_WORT')).toBe(false);
  });

  it('BARQAROR: ikki chaqiruv bir xil natija beradi', async () => {
    // Quruvchilar variantlarni aralashtiradi. Urug' barqaror bo'lmasa
    // sahifa har yangilanganda boshqa savol ko'rsatardi va CEO ko'rgan
    // narsasini ikkinchi marta topa olmasdi.
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima')] });
    expect(JSON.stringify(await svc.fragen(7))).toBe(JSON.stringify(await svc.fragen(7)));
  });

  it('BOSHQA bo`lim boshqa urug` oladi', async () => {
    // Aks holda hamma bo'lim bir xil tartibda chiqib, tasodifiylik
    // yo'qolardi.
    const svc = yasa({ woerter: [w(1, 'hallo', 'salom'), w(2, 'danke', 'rahmat'), w(3, 'wer', 'kim'), w(4, 'was', 'nima')] });
    expect(JSON.stringify(await svc.fragen(7))).not.toBe(JSON.stringify(await svc.fragen(8)));
  });
});
```

`yasa` va `w` — shu faylda yoziladigan yordamchilar: `w(id, de, uz)`
`core: true`, `audioKey: 'daf/audio/<id>.mp3'` bilan so'z qaytaradi;
`yasa(rows)` esa `fakePrisma` ustidan xizmat quradi.

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd server && npx jest src/daf/media/daf-media-fragen.service.spec.ts
```
Kutilgan: `Cannot find module './daf-media-fragen.service'`

- [ ] **Step 3: Amalga oshiring**

```ts
/**
 * Format → o'sha formatni quradigan chaqiruv.
 *
 * `Record<FrageFormat, ...>` ATAYLAB: yangi format qo'shilib bu yerga
 * yozilmasa TypeScript build'ni yiqitadi. Testga tayanib bo'lmasdi —
 * yangi format qo'shgan odam testni ham yangilamaydi va sahifa jimgina
 * "hammasi shu" deb turaverardi.
 */
export const VORSCHAU_BAUER: Record<FrageFormat, (m: Material, rnd: () => number) => Frage[]> = {
  WORT_UZ: (m, r) => m.woerter.map((w) => wortUz(w, m.woerter, r)).filter(nichtNull),
  // ... qolgan o'n bir format
};
```

Material yuklash `uebung.service.ts` dagi `baueKandidaten` bilan bir
xil qoidalarga bo'ysunadi: **`core: true` VA tarjimasi bor** so'zlargina
olinadi.

Barqaror urug': `sectionId` dan hosil qilingan sanoq (masalan
`mulberry32(sectionId)`), tasodifiy emas.

Kontrollerga `@Get('sections/:id/fragen')` qo'shing va route'ni
manifestga yozing.

- [ ] **Step 4: Testlarni yuritib, o'tishini ko'ring**

```
cd server && npx jest src/daf/media/
```

- [ ] **Step 5: Tip qorovulini ISBOTLANG**

`FrageFormat` ga vaqtinchalik 13-a'zo qo'shing, `npm run typecheck`
yuriting va `VORSCHAU_BAUER` da kalit yetishmasligi haqidagi xatoni
ko'ring. Keyin qaytaring va toza ekanini tasdiqlang. Ikkala natijani
hisobotga yozing — bu yerda dalil RED test emas, **kompilyator xatosi**.

- [ ] **Step 6: To'liq darvozalar va commit**

```bash
cd server && npm test && npm run typecheck
git add server/src
git commit -m "Media: bo'lim savollari oldindan ko'rish yo'li"
```

---

## Task 3: Mijoz — material paneli

**Files:**
- Create: `client/src/components/media/media-inhalt-panel.tsx`
- Create: `client/src/components/media/media-inhalt-types.ts`
- Modify: `client/src/components/media/media-coverage-section.tsx`

**Interfaces:**
- Consumes: `GET /daf/media/sections/:id/inhalt` (Task 1)

- [ ] **Step 1: Panelni yozing**

Bo'lim ochilganda so'raladi (yopiq bo'lim hech narsa yuklamaydi).
Yuklanayotganda **skeleton**, spinner emas (`client/CLAUDE.md`).

So'z qatori: nemischasi (artikli bilan), tarjimasi, va audiosi bo'lsa
karnay tugmasi. Passiv so'z belgilanadi.

**Ovoz tugmasi mavjud `OvozTugmasi` dan foydalanadi, LEKIN avtomatik
qo'ymaydi.** Mashq ekranida avtomatik qo'yish o'rinli; ro'yxatda esa
sahifa ochilishi bilan 53 fayl birdan yangrardi. Komponentga shu
maqsadda bayroq qo'shing yoki ro'yxat uchun sodda tugma yozing —
qaysi biri kamroq murakkablik keltirsa.

Bo'sh bo'lim: «Bu bo'limda hali material yo'q» — harakatga chorlovchi
matn bilan (`client/CLAUDE.md`).

- [ ] **Step 2: Sof mantiqni testga chiqaring**

Render qilinmaydi, shuning uchun testga arziydigan qaror funksiyaga
chiqariladi — masalan so'zning ko'rsatiladigan matni (artikl + so'z +
raqam) va uning holati (audio bor / yo'q / passiv).

```ts
it('artikl so`z bilan birga ko`rsatiladi', () => {
  expect(wortMatni({ de: 'Tisch', artikel: 'der', anzeige: null })).toBe('der Tisch');
});
it('raqam so`z yonida ko`rsatiladi', () => {
  expect(wortMatni({ de: 'sieben', artikel: null, anzeige: '7' })).toBe('sieben (7)');
});
```

- [ ] **Step 3: Darvozalar va commit**

```bash
cd client && npm test && npx tsc --noEmit && npm run lint && npm run build
git add client/src
git commit -m "Media: material paneli"
```

---

## Task 4: Mijoz — savollar paneli

**Files:**
- Create: `client/src/components/media/media-fragen-panel.tsx`
- Create: `client/src/components/media/media-fragen-utils.ts`
- Test: `client/src/components/media/media-fragen-utils.test.ts`
- Modify: `client/src/components/media/media-coverage-section.tsx`

**Interfaces:**
- Consumes: `GET /daf/media/sections/:id/fragen` (Task 2)

- [ ] **Step 1: Failing testni yozing**

```ts
import { vorschauShakli } from "./media-fragen-utils";

describe("vorschauShakli", () => {
  it("audio formatlarda karnay ko`rsatiladi", () => {
    // `prompt` audio formatlarda ATAYLAB bo'sh — so'z javobning o'zi.
    // Panel matn o'rniga ovozni ko'rsatishi kerak, aks holda savol
    // bo'sh qator bo'lib chiqardi.
    expect(vorschauShakli("AUDIO_WORT")).toBe("OVOZ");
    expect(vorschauShakli("WORT_TIPPEN")).toBe("OVOZ");
  });
  it("juftlash formatlarida juftlar ro`yxati", () => {
    expect(vorschauShakli("PAAR")).toBe("JUFT");
    expect(vorschauShakli("ZUORDNEN")).toBe("JUFT");
  });
  it("dialogda butun suhbat", () => {
    expect(vorschauShakli("DIALOG_LUECKE")).toBe("DIALOG");
  });
  it("qolganida oddiy matn", () => {
    expect(vorschauShakli("WORT_UZ")).toBe("MATN");
    expect(vorschauShakli("LUECKE")).toBe("MATN");
  });
});
```

- [ ] **Step 2: Testni yuritib, yiqilishini ko'ring**

```
cd client && npx vitest run src/components/media/media-fragen-utils.test.ts
```

- [ ] **Step 3: Panelni yozing**

Har savol: format nomi (o'zbekcha), savol shakli (yuqoridagi to'rt
holatga qarab), variantlar, va **to'g'ri javob ajratilgan holda**
(masalan yashil belgi bilan).

Formatlar bo'yicha guruhlanadi — CEO «`AUDIO_WORT` qanday chiqadi?»
degan savolga tez javob topsin.

- [ ] **Step 4: Darvozalar va commit**

```bash
cd client && npm test && npx tsc --noEmit && npm run lint && npm run build
git add client/src
git commit -m "Media: savollar paneli"
```

---

## Self-review natijasi

**Spec qamrovi.** §2 uch qatlam → 1, 2, 3, 4-vazifalar; §3.1 nusxa
yozilmaydi → Task 2 Step 3; §3.2 build yiqilishi → Task 2 Step 5;
§3.3 o'quvchisiz → Task 2 (xizmat `studentId` olmaydi); §4 material →
Task 1, 3; §5 savollar → Task 2, 4; §5.2 barqaror urug' → Task 2
testlari; §6 bo'lim ochilganda → Task 3, 4.

**Qoplanmagan:** §7 dagi «odam tekshiradi» (53 audio talaffuzi) —
ataylab vazifa emas, sahifa aynan shuning uchun quriladi.

**Tip mosligi.** `SectionInhalt` 1-vazifada e'lon qilinadi, 3-vazifada
ishlatiladi. `VORSCHAU_BAUER` va `VorschauFrage` 2-vazifada, 4-vazifada.
`audioUrl` (to'liq manzil) va `audioKey` (R2 kaliti) ataylab boshqa
nomda — 2026-09-08 dagi Critical aynan shu ikkisini chalkashtirgan edi.
