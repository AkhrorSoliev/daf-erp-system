# Yagona qarzdorlik boshqaruv sahifasi

**Sana:** 2026-08-12
**Holat:** dizayn tasdiqlashga tayyor

## Muammo

Qarz bo'yicha ish **beshta** joyga tarqalgan. Bir savolga javob olish uchun admin
sahifadan sahifaga yuradi, va hech bir joyda «bu odam bo'yicha hammasi» ko'rinmaydi.

| Joy | Fayl hajmi | Endpoint | Rollar |
|---|---|---|---|
| `/payments/debtors` | 326 + 150 (row) | `GET /payments/debtors`, `/debtors/summary` | CEO · BD · Admin · Kassir |
| `/payments/debt-history` | ~1 250 (5 fayl) | `GET /reports/monthly-debt-recovery/history`, `/:monthKey/aging`, `/detail`, `/excel` | CEO · BD |
| `/payments/debt-write-offs` | 560 | `GET /transactions/debt-write-offs`, `GET /reports/debt-write-offs-summary`, `POST /billing/debt-write-offs/:id/reverse` | CEO · BD (reverse: CEO) |
| `/outreach` → «To'lov va'dalari» | 240 | `GET/POST /payment-promises`, `PATCH /:id/cancel` | CEO · BD · Admin · Kassir |
| Oylik sahifasidagi «Markaz qo'shimchasi» dialogi | 400 | `GET /salary/monthly/center-topup` | CEO · BD · Admin |

## Asosiy g'oya: ko'chirish emas, qisqartirish

Beshtasini bitta sahifaga **yig'ish** — bu sahifani beshta bo'limga aylantiradi va
hech narsani yaxshilamaydi. Kodni o'qib chiqqanda uchtasi umuman alohida bo'lishi
shart emasligi ma'lum bo'ldi:

- **To'lov va'dasi** — o'quvchining xususiyati, alohida ro'yxat emas.
  `getDebtors` **hozirning o'zida** har qatorda `promise` va `lastCall` qaytaradi
  (`payments-debtors.service.ts`). Ya'ni birlashtirish uchun backend ishi yo'q.
- **Eng uzoq qarzdorlar** — o'sha ro'yxatning saralanishi.
- **Markaz qoplagani** — o'quvchining xususiyati (lekin oyga bog'langan — pastga qarang).

Shunday qilib beshta yuza **uchta ko'rinishga** tushadi:

```
Qarzdorlar ──┐
Va'dalar ────┼──→  «Qarzdorlar» — ustun va filtr sifatida
Eng uzoq ────┘

Oylik dinamika  ──→  «Dinamika»       (boshqa savol: qarz o'sdimi?)
Kechirilganlar  ──→  «Kechirilganlar» (bular endi qarzdor emas)
```

## Sahifa tuzilishi

**Marshrut:** `/payments/debt`. Eski uchta marshrut shu yerga yo'naltiriladi.

**Sahifa darvozasi:** `CEO · BD · Administrator · Kassir` — hozirgi
`/payments/debtors` bilan bir xil, ya'ni hech kim bugungi huquqidan ayrilmaydi.

**Tepada 3 ta karta** (har biri bosiladi va tegishli filtrni qo'yadi):

```
Jami qarz        Qarzdorlar     Va'dalar
83 750 000       551 ta         34 ochiq · 12 buzilgan
```

Uchalasi ham **«hozir»** holatini o'lchaydi. «Markaz qoplagani» ataylab bu
qatorda YO'Q: u oyga bog'langan (iyul / avgust), va oylik raqamni «hozirgi»
raqamlar qatoriga qo'yish — aynan D3 da tasvirlangan chalkashlik. U o'z
panelida, o'z oy tanlagichi bilan turadi.

**«Qarzdorlar» ko'rinishi** — sahifaning o'zi, ochilishi bilan chiqadi:

| # | O'quvchi | Guruh | Qarzi | Qachondan beri | Va'da | Oxirgi qo'ng'iroq | Amal |
|---|---|---|---|---|---|---|---|

Filtrlar: qidiruv · filial · holat · qarz yoshi · va'da holati
Saralash: qarz · qarz yoshi · ism
`⋮`: To'lov kiritish · Qo'ng'iroq natijasi · Va'da olish · Qarzni kechirish

**«Dinamika»** — hozirgi `debt-history` mazmuni (oyma-oy qarz, undirish %, kogorta dialogi).

**«Kechirilganlar»** — hozirgi `debt-write-offs` mazmuni.

**«Markaz qoplagani»** — alohida panel (sabab pastda).

## Qarorlar va ularning narxi

### D1. Rol shartlari yo'q (CEO qarori, 2026-08-12)

Sahifa ichida rolga qarab tab yashirilmaydi. Buning uchun uchta **o'qish**
endpointi kengaytiriladi `/payments/debtors` bilan bir xil ro'yxatgacha
(CEO · BD · Administrator · Kassir):

- `GET /reports/monthly-debt-recovery/history` · `/:monthKey/aging` · `/:monthKey/detail` · `/excel`
- `GET /transactions/debt-write-offs`
- `GET /reports/debt-write-offs-summary`

**Natijasi:** `CLAUDE.md` dagi «moliyaviy hisobotlar faqat CEO/BD» qoidasi
o'zgaradi va Administrator/Kassir kompaniya darajasidagi qarz tahlilini ko'radi.
Bu qasddan qilingan qaror, tasodif emas — hujjatga ham yoziladi.

**Istisno:** `POST /billing/debt-write-offs/:id/reverse` **CEO'da qoladi**. Bu
o'qish emas, moliyaviy tuzatishni bekor qiladigan **yozuv**. Tugma darajasidagi
ruxsat butun tizimda bor va u sahifani murakkablashtirmaydi.

### D2. «Qachondan beri» — kunlik keshlanadi

Aniq qiymat `ReportsDebtHistoryService.replay()` ichidagi `debtSince` dan keladi va
u **butun kompaniya ledgerini** qayta o'ynatadi. Har so'rovda ishlatib bo'lmaydi.

Yechim: `net-profit-cache.ts` va `expectation-cache.ts` bilan bir xil naqsh —
`debt-age-cache.ts`, kalit `(companyId, branchScope)`, TTL Toshkent yarim tunigacha.
Birinchi so'rov hisoblaydi, qolganlari tekin. Redis yiqilsa — hisoblashga tushadi,
xatoga emas.

### D3. «Markaz qoplagani» — alohida panel, ustun emas

Bu raqam **oyga bog'langan** (iyul / avgust), qarzdorlar ro'yxati esa «hozir».
Ustun qilib qo'ysak, ro'yxatga oy tanlagich kerak bo'ladi va «Qarzi» ustuni
«hozir», yonidagi ustun «iyulda» degan ma'noni beradi — bu aynan hozirgina
tuzatgan chalkashlik. Shuning uchun u o'z paneli (oy tanlagichi bilan) bo'ladi.

Oylik sahifasidagi dialog **o'chirilmaydi** — u yerda kontekst boshqa (ustoz
oyligini ko'rib turib «bu pul kimdan?» deb so'rash). U yangi sahifaga havola qiladi.

### D4. Filial qamrovi

Qarzdorlar va Markaz qoplagani — tepadagi filial almashtirgichga bo'ysunadi.
Dinamika hozir kompaniya bo'yicha; **shu holicha qoladi** va sarlavhasida
«butun kompaniya» deb yoziladi. Bitta sahifada ikki xil qamrov bo'lsa, u ochiq
aytilishi shart, aks holda ikkita raqam bir-biriga zid ko'rinadi.

### D5. `/outreach` dan va'dalar olinadi

Xavf: `/outreach` — adminning **kunlik** ish oqimi (davomat, qo'ng'iroq). Va'dalarni
olib ketish uning ishini ikkiga bo'ladi.

Yumshatish: `/outreach` da «Muddati o'tgan va'dalar: 12» degan bandcha qoladi va u
`/payments/debt?promise=overdue` ga olib boradi. Ro'yxat ko'chadi, signal qoladi.

## Komponent arxitekturasi

`vercel-composition-patterns` bo'yicha asosiy xavf — beshta yuzani bitta
komponentga `showHistory` / `isAdmin` kabi **boolean proplar** bilan tiqish.
To'g'ri shakl: umumiy holat bitta providerda, har ko'rinish o'z komponentida.
`CLAUDE.md`: bitta fayl 100–300 qator, qat'iy chegara 500.

```
client/src/app/(dashboard)/payments/debt/page.tsx        server component
client/src/components/payments/debt/
  debt-page-client.tsx        URL holati (tab/filtr/sahifa) + tab qobig'i   ~150
  debt-filters-provider.tsx   umumiy filtr konteksti {state, actions, meta} ~120
  debt-summary-cards.tsx      4 ta karta, bosiladi                          ~120
  debtors-view.tsx            filtr paneli + jadval + sahifalash            ~200
  debtor-table.tsx            faqat jadval                                  ~220
  debtor-row-actions.tsx      ⋮ menyusi                                     ~120
  promise-dialog.tsx          va'da olish                                   ~150
  center-topup-panel.tsx      oy tanlagichli panel                          ~180
  dynamics-view.tsx           mavjud debt-history komponentlarini o'raydi   ~80
  write-offs-view.tsx         ko'chirilgan write-offs (bo'lingan holda)     ~250
```

Mavjud `debt-history/*` komponentlari shu papka ostiga ko'chiriladi — qayta
yozilmaydi.

## UI qoidalari (`web-interface-guidelines`)

Sahifa qurilishida majburiy:

- Tab · filtr · sahifa raqami **URL da** saqlanadi (loyihada allaqachon qoida).
  Tab parametri `?tab=`, filtrlar o'z nomlari bilan, standart qiymatlar URL ga yozilmaydi.
- Raqam ustunlarida `tabular-nums`; matn ustunlarida `truncate` + `min-w-0`.
- Har interaktiv element `focus-visible:ring-*`; `outline-none` yolg'iz ishlatilmaydi.
- Bo'sh holat «keyin nima qilish» ni aytadi («Qarzdor yo'q — filtrni kengaytiring»).
- Yuklanish matnlari `…` bilan; skeleton, spinner emas (loyiha qoidasi).
- Dialoglarda `overscroll-behavior: contain`, `max-h-[90dvh]`, sarlavha/futer qotgan.
- Jadval 50+ qator bo'lsa — sahifalash (10/20/30/40/50, loyiha qoidasi) yetarli,
  virtualizatsiya kerak emas.
- Xabar/toast lar `aria-live="polite"`.

## Fazalar

Har faza mustaqil deploy qilinadi va o'zidan oldingisini buzmaydi.

**Faza 0 — tayyorgarlik**
Marshrut skeleti `/payments/debt`, tab qobig'i, filtr provideri, URL holati.
Eski sahifalar tegilmaydi. Deploy qilinsa ham hech narsa o'zgarmaydi.

**Faza 1 — «Qarzdorlar» ko'rinishi + va'dalar birlashtirilgan**
Jadval, filtrlar, 4 ta karta, `⋮` amallar (to'lov · qo'ng'iroq · va'da).
Backend ishi yo'q — `getDebtors` allaqachon `promise` va `lastCall` beradi.
`/payments/debtors` yangi sahifaga yo'naltiriladi.

**Faza 2 — «Qachondan beri»**
`debt-age-cache.ts` + `GET /payments/debtors` javobiga `debtSince` qo'shiladi.
Ustun va «qarz yoshi» filtri. Testlar: kesh, TTL, Redis yiqilgan holat.

**Faza 3 — «Dinamika» ko'rinishi**
`debt-history` komponentlari ko'chiriladi, endpointlarga Administrator/Kassir
qo'shiladi + kontroller guard testlari yangilanadi.
`/payments/debt-history` yo'naltiriladi.

**Faza 4 — «Kechirilganlar» ko'rinishi**
`debt-write-offs` ko'chiriladi va 560 qatorli fayl bo'linadi. Rollar kengaytiriladi
(`reverse` CEO'da qoladi). `/payments/debt-write-offs` yo'naltiriladi.

**Faza 5 — «Markaz qoplagani» paneli**
Oy tanlagichli panel. Oylik sahifasidagi dialog qoladi va shu yerga havola qiladi.

**Faza 6 — `/outreach` dan va'dalar olinadi**
Tab o'chiriladi, o'rniga «Muddati o'tgan va'dalar: N» bandchasi.

**Faza 7 — tozalash va sayqal**
Navigatsiya, `breadcrumb-routes.ts`, `CLAUDE.md` (rollar matritsasi + yangi sahifa),
`web-interface-guidelines` bo'yicha ko'rib chiqish, `npm test` + `npm run build`.

## Xavflar

| Xavf | Yumshatish |
|---|---|
| Adminlar kompaniya moliyaviy tahlilini ko'radi (D1) | Qasddan qilingan qaror, hujjatlashtirilgan; `reverse` CEO'da qoldi |
| Sahifa baribir uzun bo'lib ketadi | Har ko'rinish alohida tab; kartalar ostida faqat bitta jadval; 500 qatorli fayl chegarasi |
| `/outreach` adminining ishi bo'linadi | Bandcha + havola qoladi (D5) |
| Kesh eskiradi (D2) | TTL Toshkent yarim tuni; to'lov kiritilganda `debtors` keshi bekor qilinadi |
| Route manifest build'ni yiqitadi | Har yangi/o'zgargan endpoint `branch-route-policy.ts` ga toifalanadi |

## Qamrovdan tashqarida

- Markaz qo'shimchasi bayrog'ining o'chmaslik nuqsoni (alohida ish, ledgerga tegadi).
- Excel eksporti — hozirgi `debt-history` dagi tugma o'z ko'rinishi bilan ko'chadi, yangisi yozilmaydi.
- Qarzdorlarga ommaviy SMS/xabar yuborish — alohida so'rov.
