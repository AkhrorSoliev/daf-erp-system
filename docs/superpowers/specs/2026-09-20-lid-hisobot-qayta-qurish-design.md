# Lidlar hisoboti: qayta qurish

**Sana:** 20.09.2026
**Holati:** dizayn tasdiqlangan (CEO, «to'liq qayta qurish»), amalga oshirilmagan
**Shox:** `ux/lid-hisobot` (worktree `.worktrees/lid-hisobot-ux`)
**O'rnini bosadi:** `2026-09-13-lid-voronkasi-design.md` dagi **ko'rinish** qismini.
Bosqich ta'riflari, kogorta qoidasi, 10.09.2026 chegarasi va «to'lamaganlar»
ta'rifi o'sha hujjatdagidek qoladi.

## Nega qayta qurilyapti

CEO: «voronka grafigi o'zimiz yasaganimiz uchun UX bo'yicha yaxshi emas». Tahlil
(`frontend-design`, `impeccable critique` 21/40, `dataviz` validatori,
`web-design-guidelines` 19 topilma, brauzer skrinshotlari, prod raqamlari) buni
tasdiqladi va chuqurlashtirdi:

1. **Trapetsiya nisbatni buzadi.** Blok yuqorida o'z raqami, pastda keyingi bosqich
   raqami kengligida chiziladi (`lead-funnel-chart.tsx`, `bottom = width(next)`),
   yuza esa ikkalasining o'rtachasi. Prod (20.09): 146 → 55 haqiqatda 2,65 marta,
   grafikda 1,97; 47 → 13 haqiqatda 3,6, grafikda 2,3.
2. **8 % minimal kenglik** kichik bosqichni sun'iy kengaytiradi (13.09 da «2» «4» ga
   teng ko'ringan).
3. **Ranglar progressiya emas:** to'rt bosqich rangining yorug'ligi 0,53–0,55, validator
   ordinal tekshiruvida 3/3 FAIL. Oq raqamlar `opacity-90` ustida 3,7–4,3:1 (AA 4,5).
4. **Eng muhim ma'lumot eng mayda:** «36 kishi o'tmadi» o'ng chekkada `text-xs`
   kulrang; raqamlar goh blok ichida, goh tashqarida (`NUMBER_INSIDE_MIN`).
5. **Sahifa asosiy savolga javob bermaydi.** Manba bo'yicha taqsimot yo'q (prod:
   Telegram bot 39 → 7, Instagram 30 → 0), filial taqqoslash yo'q (Farg'ona 9,5 %,
   Namangan 3,3 %), o'tgan davr bilan taqqoslash yo'q, davr preset'lari yo'q.
6. Nuqsonlar: «Muzlatilgan» rangi chiqmaydi (`sky-500` faqat `.lumio` ichida
   aniqlangan, `amber-*` bilan bir xil sabab); telefonda avatar tugmasi raqamni
   yopadi (ilova bo'yicha umumiy, bu sahifaga tegishli emas); odamlar oynasi
   telefonda kesilishi mumkin; `aria-label` ichki raqamlarni yutadi.

Bosh sahifadagi ixcham qator (`home-lead-funnel-strip.tsx`) o'sha to'rt raqamni
grafiksiz to'g'riroq ko'rsatadi. Demak rasm hech narsa qo'shmayapti.

## Qaror

**Voronka rasmi olib tashlanadi.** O'rniga chapdan boshlanadigan chiziqli ro'yxat
(HTML/CSS, loyihaning «Ketgan o'quvchilar» hisobotidagi bar-list naqshi). Yangi
grafik kutubxonasi yo'q; recharts ham kerak emas (o'qlari, to'ri bo'lmagan 4 qator
uchun u ortiqcha). Uzunlik songa **aniq** mutanosib, minimal kenglik yo'q: raqam
doim chiziq yonida turadi, shuning uchun 13/146 ham o'qiladi.

Rang: bitta asosiy rang (`palette.series1`) barcha bosqichlarga, faqat «To'lov qildi»
urg'u rangida (`palette.series3`). Matn hech qachon seriya rangida emas.

## Sahifa tuzilishi

```
Lidlar hisoboti                          [Shu oy] [O'tgan oy] [Boshidan] [Oraliq]
Markazga kelgan odam to'lovgacha qaysi bosqichda tushib qolmoqda
10.09 – 30.09.2026 · davom etmoqda · Barcha filiallar · 146 kishi        (i)

┌ LIDDAN TO'LOVGACHA ┐ ┌ YANGI LIDLAR ┐ ┌ TO'LOV QILDI ┐ ┌ TO'LAMAGAN FAOL ┐
│ 9 %                │ │ 146          │ │ 13           │ │ 18              │
│ oldingi davr 6 %   │ │ oldingi 125  │ │ oldingi 8    │ │ ▸ ro'yxat       │
└────────────────────┘ └──────────────┘ └──────────────┘ └─────────────────┘

Lid voronkasi                                                             (i)
Lid              ████████████████████████████████████████  146    100 %
   ↓ 91 kishi guruhga yozilmadi                                    62 %
Guruhga yozildi  ███████████████                            55     38 %
   ↓ 8 kishi darsga kelmadi                                        15 %
Darsga keldi     █████████████                              47     32 %
   ↓ 34 kishi to'lov qilmadi          ← eng katta yo'qotish        72 %
To'lov qildi     ████                                       13      9 %
Bosqichni bosing: o'sha bosqichdagi odamlar ro'yxati ochiladi

┌ Manba bo'yicha                (i) ┐ ┌ Filial bo'yicha              (i) ┐
│ Telegram bot   39 →  7   18 % ███ │ │ Farg'ona    126 → 12   10 % ███  │
│ Tanishlar      59 →  3    5 % █   │ │ Namangan     30 →  1    3 % █    │
│ Instagram      30 →  0    0 %     │ │ Belgilanmagan 4 →  0    0 %      │
│ Telegram       14 →  1    7 % ██  │ └──────────────────────────────────┘
│ Manbasiz       14 →  2   14 % ███ │
└───────────────────────────────────┘

Darsga kelgan, lekin to'lamagan · 10.09.2026 dan beri · bugungi holat      (i)
┌ Faol      18 ▸ ┐ ┌ Muzlatilgan 7 ▸ ┐ ┌ Chetlatilgan 5 ▸ ┐ ┌ Boshqa 1 ▸ ┐
```

### 1. Sarlavha va davr

- Sarlavha, izoh o'zgarmaydi. Ostida **hisoblangan davr qatori**: server qaytargan
  `period` (`dd.MM – dd.MM.yyyy`), davr bugunni qamrasa «davom etmoqda» belgisi,
  tanlangan filial nomi (yoki «Barcha filiallar»), «N kishi kuzatildi», (i) tooltip
  bilan uchta izoh (kogorta qoidasi; davr tugamagani; 10.09 chegarasi). Hozirgi
  «Qanday o'qiladi» kartasi olib tashlanadi.
- **Preset'lar** (segmentli tugmalar, URL `?period=`):
  `shu-oy` (standart, URL'da yozilmaydi) · `otgan-oy` · `boshidan` · `oraliq`.
  `oraliq` tanlansa hozirgi ikkita `DatePicker` (juftlik qoidasi bilan) chiqadi,
  URL `?period=oraliq&startDate&endDate`. Preset bosilsa sanalar tozalanadi.
- Preset'ning hisoblangan oralig'i to'liq `FUNNEL_START_DATE` dan oldin bo'lsa
  (masalan sentyabr 2026 da «O'tgan oy» = avgust), tugma **ko'rsatilmaydi** (server
  bunday so'rovni 400 bilan rad etadi). Oktyabrdan «O'tgan oy» = 10.09–30.09.
- `resolveRange` mantiqi saqlanadi: buzilgan URL joriy oyga qaytadi; boshlanish
  chegaradan oldin bo'lsa suriladi.

### 2. KPI qatori (4 karta, `departed-students-kpi-cards.tsx` naqshi)

| Karta | Qiymat | Ostida |
|---|---|---|
| Liddan to'lovgacha | `paid / lead`, **butun foiz** | `oldingi davr N %` yoki «oldingi davr yo'q» |
| Yangi lidlar | `stages.lead` | `oldingi davr N` |
| To'lov qildi | `stages.paid` | `oldingi davr N` |
| To'lamagan faol | `unpaid.active` | «▸ ro'yxat» — bosilsa odamlar oynasi (`unpaid`, `status=active`) |

- **Oldingi davr** = tanlangan davr uzunligidagi, undan bevosita oldingi oraliq,
  `FUNNEL_START_DATE` bilan qirqilgan; butunlay chegaradan oldin bo'lsa `null` →
  «oldingi davr yo'q». Ma'nosi tooltip'da, sanalari bilan.
- Foizlar butun sonda (146 lidda 0,1 % aniqlik yolg'on). `formatPercent(v, {
  maximumFractionDigits: 0 })`.
- Tooltip: har kartada (i), matn oddiy tilda.

### 3. Voronka (chiziqli ro'yxat)

- `<ol>`; har bosqich `<button>` qator: chapda yorliq, o'rtada chiziq (uzunlik
  `count / lead`, minimal kenglik yo'q), o'ngda son va «lidlarning N %» (butun).
- Bosqichlar orasida **yo'qotish qatori**, `text-sm` (mayda emas):
  «↓ 91 kishi guruhga yozilmadi · 62 %» — `lostFromPrev` va **yo'qotish** foizi
  (`100 − pctOfPrev`). Bitta qatorda ikki xil populyatsiya aralashmaydi. Yo'qotish
  0 bo'lsa ham qator chiqadi («hammasi o'tdi»). Yo'qotish qatori bosilsa o'sha
  «o'tmaganlar» ro'yxati ochiladi (`mode=stuck`, oldingi bosqich).
- Eng katta yo'qotish (kishi soni bo'yicha) belgilanadi: «eng katta yo'qotish».
- Rang: chiziqlar `series1`, oxirgisi `series3`; hover: `ring`, opacity emas.
- «Lid» qatori ostida `doskadan N · to'g'ridan M` saqlanadi.
- `< sm`: yorliq chiziq ustida, son chiziq yonida; yo'qotish qatori ham chapga.
- `previous` bilan taqqoslash voronka qatorlarida ko'rsatilmaydi (faqat KPI'da),
  aks holda qatorda uchta raqam bo'lib ketadi.
- Bo'sh holat (lid = 0) va skeleton hozirgidek; skeleton chiziqlar shaklida.
- `aria-label` ishlatilmaydi: haqiqiy matn o'zi nom bo'ladi, bezaklar `aria-hidden`.

### 4. Manba bo'yicha (`ChartCard`)

- Qatorlar: manba nomi · `lead → paid` · foiz (butun) · foiz chizig'i (bitta rang).
  Tartib: lid soni bo'yicha kamayib. 5 tadan ko'p bo'lsa qolgani «Boshqalar (N ta
  manba)» qatoriga yig'iladi, bosilmaydi (loyiha qoidasi). Manbasi yo'q lidlar
  «Manbasiz» qatori.
- Qator bosilsa odamlar oynasi `stage=lead` bilan, `sourceId` filtri bilan ochiladi
  (Manbasiz → `sourceId=none`); oyna sarlavhasida manba nomi.
- Tooltip: «Foiz: shu manbadan kelganlarning necha foizi to'lov qildi».
- Bo'sh: «Bu davrda lid yo'q».

### 5. Filial bo'yicha (`ChartCard`)

- Faqat qamrovda **2 va undan ko'p** filial bo'lsa ko'rsatiladi (CEO «Barcha
  filiallar»). Bitta filial tanlanganda karta yo'q, manba kartasi to'liq kenglikda.
- Qatorlar: filial · `lead → paid` · foiz · chiziq. `branchId = null` lidlar
  «Belgilanmagan» qatori (faqat > 0 bo'lsa).
- v1 da qatorlar bosilmaydi (odamlar endpoint'i filialni sarlavha qamrovidan
  oladi; alohida filial filtri keyingi bosqich).

### 6. To'lamaganlar

- Karta o'rniga to'rtta bosiladigan **plitka**: Faol · Muzlatilgan · Chetlatilgan ·
  Boshqa (faqat > 0). Mini chiziq olib tashlanadi (6–40 kishi uchun grafik emas).
- Sarlavha qatori: «Darsga kelgan, lekin to'lamagan · 10.09.2026 dan beri · bugungi
  holat», (i) tooltip'da ta'rif.
- «Faol» eng shoshilinch: ogohlantirish rangida. **`amber-*` va `sky-*` admin
  panelda ishlamaydi** (`globals.css` `@theme` ularni `.lumio` ichidagi
  o'zgaruvchilarga bog'lagan). `orange-*` soya qilinmagan (tekshirildi), shu
  ishlatiladi: `text-orange-600 dark:text-orange-400`.
- Plitka bosilsa odamlar oynasi `stage=unpaid&status=<active|frozen|expelled|other>`.

### 7. Odamlar oynasi

- Mavjud oyna saqlanadi; qo'shiladi: manba filtri sarlavhada, holat filtri.
- Telefonda (`< sm`): jadval o'rniga kartochka ro'yxati (ism, telefon `tel:`, manba,
  holat, sana); oyna loyihaning «sarlavha + skroll tanasi + footer» naqshida
  (`max-h-[90dvh]`), sahifalash footer'i doim ko'rinadi.
- Ochiq bosqich URL'da: `?people=<stage>` (+ `&source=` / `&status=`), yopilganda
  o'chiriladi (loyiha qoidasi: drawer/dialog holati URL'da, yopilganda tozalanadi).
  Parametr nomlari server parametrlari bilan bir xil (`stage`, `sourceId` → `source`).

### 8. Bosh sahifa qatori

`home-lead-funnel-strip.tsx` o'zgarmaydi. Endpoint javobi faqat kengayadi.

## Backend

Sxema, migratsiya, ADR **yo'q**. Barcha o'zgarishlar qo'shimcha (mavjud maydonlar
o'zgarmaydi).

### `GET /reports/lead-funnel`

Javobga qo'shiladi:

```ts
previous: { period: { startDate; endDate }; stages: Record<FunnelStage, number> } | null;
bySource: { id: string | null; name: string | null; lead: number; enrolled: number;
            attended: number; paid: number }[];   // lead DESC; id=null = manbasiz
byBranch: { id: number | null; name: string | null; lead: number; paid: number }[];
```

- `previous`: `resolvePeriod` natijasidagi davr uzunligi (kun) olinib, undan
  bevosita oldingi oraliq; boshlanishi `FUNNEL_START_DATE` bilan qirqiladi;
  tugashi undan oldin bo'lsa `null`. Alohida `loadCohort` chaqiruvi.
- `bySource`, `byBranch`: `loadCohort` allaqachon yuklagan `persons` va `sets`
  ustida xotirada hisoblanadi. `FunnelPerson` ga `sourceId` va `branchId`
  qo'shiladi (`toPersons` da birinchi liddan olinadi, manba kabi). Filial
  taqsimoti `scope` ichida (`leadAttributionWhere` allaqachon qo'llangan).
- Sof hisob `lead-funnel.math.ts` da: `countBySource(persons, sets)`,
  `countByBranch(persons, sets)`, `previousPeriod(period)`.

### `GET /reports/lead-funnel/people`

DTO'ga qo'shiladi: `sourceId?: string` (`none` = manbasiz), `status?:
'active'|'frozen'|'expelled'|'other'` (faqat `stage=unpaid` bilan ma'noli; boshqa
bosqichda e'tiborsiz). Filtr `personsAtStage` natijasi ustida xotirada.
`FunnelPersonRow` ga `sourceId` qo'shiladi.

## Rang va mavzu

- Chiziqlar: `useChartTheme().palette.series1` / `series3` (yorug' va qorong'i
  rejim uchun allaqachon alohida qiymatlar). SVG emas, `div` — shuning uchun
  Tailwind sinflari ham mumkin, lekin palitra tokenlari afzal.
- Matn: faqat `foreground` / `muted-foreground`.
- Ogohlantirish (To'lamagan faol): `orange-600` / `orange-400` (qorong'i).

## Testlar

- Server: `lead-funnel.math.spec.ts` — `countBySource` (manbasiz guruh, ichma-ich
  bosqichlar), `countByBranch` (`null` filial), `previousPeriod` (qirqish, `null`);
  `reports-lead-funnel.service.spec.ts` — javob shakli, `sourceId=none`, `status`
  filtri; controller spec — DTO validatsiyasi (`status` faqat ruxsat etilgan
  qiymatlar). `npm test`, `npm run typecheck`, eslint.
- Client (vitest): `lead-funnel-math.test.ts` — preset → oraliq (`shu-oy`,
  `otgan-oy`, `boshidan`, chegara qirqishi, yashirish qoidasi), `previous` bilan
  taqqoslash matni, top-5 + Boshqalar yig'ish, yo'qotish foizi, eng katta yo'qotish.
  `npm test`, `npm run typecheck`, `npx eslint src`, `npm run build`.
- Brauzer (dev baza + mock javob): 1280/400, yorug'/qorong'i; chiziqlar songa
  mutanosib (146:55); yo'qotish qatori bosilsa `stuck` ro'yxat; manba qatori →
  filtrli ro'yxat; plitka → holat filtri; preset'lar URL'da; «O'tgan oy» sentyabrda
  ko'rinmaydi; telefonda oyna kesilmaydi.
- `dataviz` validatori: `series1` bitta rang, ordinal tekshiruv kerak emas;
  kontrast: raqamlar matn rangida, tekshiruv talab qilmaydi.

## Doiradan tashqarida

- Yo'qotish **sabablari** (nega guruhga yozilmadi) — alohida loyiha.
- Filial qatorini bosib ro'yxat ochish (odamlar endpoint'iga filial filtri).
- Excel eksport.
- `amber-*`/`sky-*` ildiz sababini `globals.css` da tuzatish (alohida PR, CEO bilan).
- Telefondagi avatar tugmasi kontentni yopishi (ilova bo'yicha umumiy).
- Breadcrumb'da «Lidlar» ikki sahifada bir xil — `routeLabels` segment bo'yicha,
  yo'l bo'yicha emas; alohida kichik ish.
