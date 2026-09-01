# Bosh sahifa (/) — boshqaruv paneliga aylantirish

**Sana:** 2026-09-01 · **Holat:** loyiha tasdiqlandi, amalga oshirilmagan

---

## Muammo

`/` sahifasi hozir **faqat kunlik dars jadvalini** ko'rsatadi
([client/src/components/dashboard-client.tsx](../../../client/src/components/dashboard-client.tsx)) —
xonalar bo'yicha Grid/Ro'yxat va 4 ta kichik sanagich. Backendda ham `dashboard` moduli
bitta endpointdan iborat: `GET /dashboard/today-schedule`.

CEO, filial direktori, administrator va o'qituvchi **bir xil** sahifani ko'radi. O'qituvchi
uchun bu to'g'ri — unga aynan jadval kerak. Rahbariyat uchun esa tizimga kirgan zahoti
markazning holati haqida hech narsa ko'rinmaydi: pul, o'quvchilar, davomat, e'tibor
talab qiladigan ishlar — hammasi boshqa sahifalarda ko'milgan.

## Maqsad

Bosh sahifa bitta savolga javob bersin: **bugun nimaga qarashim kerak?**
Ko'p grafik va trend emas — kam sonli, o'qishga oson ko'rsatkich va ustiga bosib
o'tish mumkin bo'lgan «e'tibor» ro'yxati.

**Aniq chegara:** bu sahifa hisobot sahifasi emas. Trend grafiklari, davr tanlagichlar
va batafsil jadvallar `/reports` va `/payments` da qoladi.

---

## Yechim — ikki faza

Sahifa **ikki bosqichda** quriladi. Har bosqich alohida yakunlanadi va ko'rib chiqiladi.

| Faza | Qamrov | Natija |
|---|---|---|
| **Faza 1** | Faqat frontend. Butun joylashuv, barcha komponentlar, rol mantiqi, `/schedule` ko'chishi — lekin raqamlar **fayl ichida qo'lda yozilgan** (fixture) | Localhostda haqiqiy ko'rinishni ko'rib, joylashuvni tuzatish mumkin. Backend hali yozilmagan |
| **Faza 2** | Backend `GET /dashboard/summary` + fixture'ni haqiqiy so'rovga almashtirish | Ishlaydigan sahifa |

Faza 1 da yozilgan komponentlar Faza 2 da **qayta yozilmaydi** — ular ma'lumotni
`props` orqali oladi, manbasi esa faqat bitta joyda (`home-overview.tsx`) almashadi.

---

## 1. Sahifa tuzilishi va rollar

Rol raqamlari: `1=CEO, 2=Filial direktori, 3=Administrator, 4=O'qituvchi, 5=Kassir`
(manba: [server/prisma/seed.ts](../../../server/prisma/seed.ts)).

| Rol | `/` da nima ko'radi |
|---|---|
| CEO (1), Filial direktori (2) | Pul + Odamlar + E'tibor + Keyingi darslar |
| Administrator (3) | Odamlar + E'tibor + Keyingi darslar (pul kartalari **yo'q**) |
| Kassir (5) | Odamlar + Top qarzdorlar + Keyingi darslar |
| O'qituvchi (4) | Hozirgi jadval sahifasi, o'zgarishsiz |

O'qituvchi «faqat 4-rol» degani — 1/2/3 rollaridan birortasi ham yo'q foydalanuvchi
(hozirgi `isTeacher` mantiqi saqlanadi).

To'liq jadval **`/schedule`** manziliga ko'chadi. Menyuga «Jadval» bandi qo'shiladi
(hamma rollarga ko'rinadi). O'qituvchi `/` ga kirganda **redirect bo'lmaydi** — `/` o'sha
jadval komponentini o'z ichida chizadi, shunda manzil ham, xatcho'plar ham buzilmaydi.

---

## 2. Sahifa mazmuni

### A. Pul — 4 ta karta *(rol 1, 2)*

| Karta | Qiymat | Manba maydoni |
|---|---|---|
| Bu oy tushum | kassa tushumi | `financial-overview.income.actual` |
| Oy oxiriga kutilyapti | oy oxirigi prognoz | `financial-overview.forecast.expectedMonthEnd` |
| Qarzdorlik | jami qarz + qarzdorlar soni | `payments/debtors/summary.totalDebt`, `.debtorCount` |
| Sof foyda | shu oyning sof foydasi | `financial-overview.netProfit` |

**Qoida:** yangi «yig'im foizi» kiritilmaydi. Tizimda yig'im foizining yagona ta'rifi bor
(Telegram hisoboti va `/payments/overview` uchun umumiy `collectionPct`); bosh sahifada
unga zid ikkinchi foiz paydo bo'lmasligi uchun 2-kartada foiz emas, **summa** ko'rsatiladi
(ost-satr: «hozirgacha yig'ilgan»).

**Qoida:** `netProfitBasis === 'cash'` bo'lsa karta sarlavhasi «Foyda (kassa asosida)» ga
o'zgaradi va tooltip sababni aytadi. Bu `/payments/overview` dagi mavjud xatti-harakatning
aynan o'zi — kassa raqami sof foydadan ancha yuqori chiqadi, shuning uchun uni «Sof foyda»
deb atash mumkin emas.

### B. Odamlar — 4 ta kichik sanagich *(rol 1, 2, 3, 5)*

| Sanagich | Manba |
|---|---|
| Aktiv o'quvchilar (+bu oy yangi / −ketgan) | `reports/kpis` |
| Aktiv guruhlar | `reports/kpis` |
| Bu oy o'rtacha davomat % | `reports/kpis` |
| Bugungi darslar | `dashboard/today-schedule` |

### C. «E'tibor talab qiladi» *(rol 1, 2, 3)* — chap ustun

Har qatorda: belgi · nomi · **soni** · o'ng tomonda o'q (bosilganda tegishli sahifa).

| Qator | Soni | O'tish |
|---|---|---|
| Bugun darsga kelmaganlar | `outreach/stats.todayAbsentees` | `/outreach` |
| Muddati o'tgan to'lov va'dalari | `debtors/summary.overduePromises` → javobda `brokenPromises` | `/outreach` |
| O'chirish navbati (3 marta ketma-ket) | `outreach/stats.removalQueue` | `/outreach` |
| Eng katta 5 qarzdor | `payments/debtors` (limit 5) | `/payments/debt` |

**Qoida:** soni `0` bo'lgan qator **umuman chizilmaydi**. Sahifa nollar bilan
to'ldirilmaydi. Hamma qator bo'sh bo'lsa, blok o'rniga bitta xabar chiqadi:
«Bugun e'tibor talab qiladigan narsa yo'q ✓».

Kassir (5) uchun bu blokdan faqat «Eng katta 5 qarzdor» qoladi — `outreach` endpointlari
kassirga ochiq emas.

### D. Keyingi darslar — o'ng ustun

Bugungi jadvaldan **hozirgi vaqtdan keyingi 5 ta dars**: vaqt · guruh · o'qituvchi · xona.
Pastida «To'liq jadval →» tugmasi (`/schedule`).

Filial tanlanmagan («Barcha filiallar») holatda bu blok o'rniga izoh chiqadi — jadval
bitta filialning xonalari va ish vaqtiga bog'liq, shuning uchun birlashtirilgan ko'rinishi
yo'q. Bu hozirgi `dashboard-client.tsx` xatti-harakatining o'zi. Qolgan bloklar
(pul, odamlar, e'tibor) «Barcha filiallar» da normal ishlaydi.

### Joylashuv

```
┌─────────────────────────────────────────────────────┐
│  Pul: 4 karta (1 qator, mobil: 2×2)                 │
├─────────────────────────────────────────────────────┤
│  Odamlar: 4 kichik sanagich (1 qator, mobil: 2×2)   │
├──────────────────────────┬──────────────────────────┤
│  E'tibor talab qiladi    │  Keyingi darslar         │
│  (chap, ~60%)            │  (o'ng, ~40%)            │
└──────────────────────────┴──────────────────────────┘
```

Mobil ekranda ustunlar bir-birining ostiga tushadi: Pul → Odamlar → E'tibor → Keyingi darslar.

---

## 3. Backend — `GET /dashboard/summary` *(Faza 2)*

Yangi `DashboardSummaryService`, `server/src/dashboard/` ichida.

### Javob shakli

```ts
{
  money: {
    monthIncome: number;
    expectedMonthEnd: number;
    netProfit: number;
    netProfitBasis: 'recognized' | 'cash';
    debt: { total: number; count: number };
  } | null;                    // rol 1,2 dan boshqasiga har doim null

  people: {
    activeStudents: number;
    newThisMonth: number;
    leftThisMonth: number;     // EXPELLED + DROPPED
    activeGroups: number;
    attendancePct: number;
    todayLessons: number;
  } | null;

  attention: {
    todayAbsentees: number;
    brokenPromises: number;
    removalQueue: number;
    topDebtors: { id: number; name: string; balance: number }[];
  } | null;                    // kassir (5) uchun faqat topDebtors to'ldiriladi,
                               // qolgan uch son 0 — outreach unga ochiq emas

  nextLessons: {
    id: string; startTime: string; groupName: string;
    teacherName: string | null; roomName: string | null; studentCount: number;
  }[] | null;                  // filial tanlanmagan bo'lsa null

  failed: string[];            // yiqilgan bo'limlar: ['money'] kabi
}
```

### Prinsiplar

1. **Yangi hisob-kitob mantiqi yozilmaydi.** Servis mavjud servislarni qayta chaqiradi:
   `ReportsService.getFinancialOverview` / `.getKpis`, `PaymentsService.getDebtorSummary`
   va qarzdorlar ro'yxati, `OutreachService.getStats`, `DashboardService.getTodaySchedule`.
   Shu sababli bosh sahifadagi raqam `/payments/overview` va `/outreach` dagi raqam bilan
   **bir xil** chiqadi. Raqamni bu yerda qaytadan hisoblash — ikkinchi haqiqat manbai
   yaratish demak, bu taqiqlanadi.
2. **Bo'lim yiqilsa sahifa yiqilmaydi.** Har bo'lim `Promise.allSettled` ichida; yiqilgani
   `null` bo'ladi, nomi `failed` ga tushadi, UI faqat o'sha blokni «ma'lumot olinmadi»
   holatida chizadi.
3. **Rol filtri bitta joyda** — servisning chiqish chetida, keshdan **keyin**.
4. **Kesh:** Redis, kalit `dashboard:summary:{companyId}:{branchKey}`, TTL 60 s.
   Kesh **rol filtridan oldin** yoziladi va o'qiladi, shuning uchun bir foydalanuvchining
   ruxsati boshqasiga sizib chiqmaydi. `branchKey` — `@BranchScope()` bergan filial
   ro'yxatidan tuzilgan barqaror satr.
5. **Filial qamrovi** mavjud `@BranchScope()` dekoratori orqali, `today-schedule` dagi
   `isEmptyScope` / `singleBranchId` naqshining o'zi. Bo'sh qamrov → `403`.

---

## 4. Tegiladigan fayllar

### Faza 1 — frontend

**Yangi:**
- `client/src/components/dashboard/home-overview.tsx` — bloklarni yig'uvchi, rol mantiqi, **ma'lumot manbai shu yerda** (Faza 1 da fixture, Faza 2 da `useQuery`)
- `client/src/components/dashboard/home-money-cards.tsx`
- `client/src/components/dashboard/home-people-stats.tsx`
- `client/src/components/dashboard/home-attention-list.tsx`
- `client/src/components/dashboard/home-next-lessons.tsx`
- `client/src/components/dashboard/home-skeleton.tsx`
- `client/src/components/dashboard/home-fixture.ts` — **soxta ma'lumot, Faza 2 da o'chiriladi**
- `client/src/components/dashboard/dashboard-summary-types.ts` — javob tiplari (ikkala faza uchun umumiy)
- `client/src/app/(dashboard)/schedule/page.tsx`
- `client/src/components/dashboard/schedule-client.tsx` — hozirgi `dashboard-client.tsx` mazmuni ko'chiriladi

**Tahrir:**
- `client/src/components/dashboard-client.tsx` → rol yo'naltirgichiga aylanadi (o'qituvchi → `ScheduleClient`, qolgani → `HomeOverview`)
- `client/src/lib/nav-items.ts` → «Jadval» bandi
- `client/src/lib/breadcrumb-routes.ts` → `/schedule`

### Faza 2 — backend

**Yangi:** `dashboard-summary.service.ts`, `dto/dashboard-summary-query.dto.ts`,
`dashboard-summary.service.spec.ts`
**Tahrir:** `dashboard.controller.ts` (+1 endpoint), `dashboard.module.ts` (Reports/Payments/Outreach import), controller spec
**Frontend tahrir:** `home-overview.tsx` fixture o'rniga `useQuery`; `home-fixture.ts` o'chiriladi

---

## 5. Sinovlar

**Faza 1 (vitest, frontend):**
- Rol 1 → pul kartalari chiziladi; rol 3 → chizilmaydi
- «E'tibor» blokida `0` bo'lgan qator chizilmaydi; hammasi `0` bo'lsa bo'sh holat xabari chiqadi
- Faqat 4-rol → `ScheduleClient` chiziladi, `HomeOverview` emas

**Faza 2 (jest, backend):**
- Rol filtri: `Administrator` uchun `money === null`; `Cashier` uchun `attention` faqat `topDebtors`
- Bo'sh filial qamrovi → `403`
- Bitta bo'lim `reject` bo'lsa: qolgan bo'limlar qaytadi, `failed` da o'sha bo'lim nomi turadi
- Kesh rol filtridan oldin: bir xil kesh yozuvi ikki xil roldan ikki xil natija beradi

---

## 6. Ochiq qoldirilgan qarorlar

Quyidagilar ushbu ishning qamroviga **kirmaydi**:

- Kartalarni bosganda ochiladigan grafik-oyna (`/payments/overview` dagi `KpiChartDialog` kabi)
- Sahifani sozlash — foydalanuvchi bloklarni yashirishi/joyini almashtirishi
- O'qituvchi uchun boyitilgan bosh sahifa (uning oyligi, guruhlari)
- `/reports` bosh sahifasini o'zgartirish
