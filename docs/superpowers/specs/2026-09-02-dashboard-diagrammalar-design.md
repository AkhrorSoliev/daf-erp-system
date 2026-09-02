# Bosh sahifa — diagrammalar

**Sana:** 2026-09-02 · **Holat:** loyiha tasdiqlandi

---

## Maqsad

Bosh sahifadagi kartalar **bugungi holatni** ko'rsatadi. Ular ayta olmaydigan ikki narsa bor:

- **Yo'nalish** — o'syapmizmi yoki pasayyapmizmi?
- **Tarkib** — pul qayerga ketdi?

Diagramma faqat shu ikki savolga javob bergani uchun qo'shiladi. Bosh sahifa hisobot sahifasiga aylanmaydi.

## Tamoyil — ADR-0012 saqlanadi

Diagrammalar **hech narsani qaytadan hisoblamaydi**. Har bir seriya mavjud servisdan keladi, shuning uchun diagramma yonidagi karta bilan hech qachon ziddiyatga tushmaydi.

Diagrammalar **alohida so'rov** bilan yuklanadi (`GET /dashboard/charts`), `GET /dashboard/summary` dan keyin. Sabab: sahifaning o'zagi (kartalar, «E'tibor», jadval) hozir sovuq keshda ~7 s ochiladi; diagrammalarni o'sha so'rovga qo'shish uni yanada sekinlashtirardi. Ajratilgan holda o'zak avvalgi tezligida chiqadi, diagrammalar esa skeleton bilan o'rnini egallab, tayyor bo'lgach to'ladi.

---

## To'rtta diagramma

### A. Moliya trendi — 6 oy *(CEO, filial direktori)*

Ustunlar: **tushum** va **xarajat**. Ustidan chiziq: **sof foyda**.

Manba: `ReportsService.getFinancialTrendCanonical` — 6 oylik qator, sof foyda `net-profit-cache` orqali kunlik keshlangan.

Bosilganda → `/payments/overview`.

### B. Pul qayerga ketdi — bu oy *(CEO, filial direktori)*

Gorizontal bar-ro'yxat: **ustoz oyligi · xodim oyligi · operatsion xarajat · qaytarishlar · qolgani (sof foyda)**.

Manba: `ReportsService.getMonthlyNetProfit` qaytaradigan `NetProfit` obyekti —
`revenue − teacherSalary − adminSalary − operatingExpenses − refunds = netProfit`.

**Bu AYNAN «Sof foyda» kartasi ishlatadigan obyekt**, ya'ni diagramma kartaning raqamini tushuntiradi va undan uzoqlasha olmaydi.

**Nima uchun `getProfitLoss.byCategory` EMAS:** u operatsion xarajatlarni kategoriya bo'yicha beradi, lekin `TEACHER_ADVANCE` ni **chiqarib tashlaydi** va ustoz oyligini umuman qamramaydi. Faqat shundan chizilgan diagramma ijarani markazning eng katta xarajatidek ko'rsatardi, holbuki eng kattasi oylik.

Bar-ro'yxat (recharts emas) — CLAUDE.md uzun o'zbekcha nomlar uchun shuni talab qiladi: nom kesilmaydi, foiz va summa yonma-yon o'qiladi.

«Operatsion xarajat» ustiga bosilsa — `getProfitLoss.byCategory` bo'yicha kategoriyalarga ochiladi.

### C. O'quvchilar oqimi — 6 oy *(+ administrator)*

Ustunlar: **kelgan** (+) va **ketgan** (−). Chiziq: **sof o'zgarish**.

Manba: `ReportsService.getStudentFlow`, oyiga bitta chaqiruv. O'lchandi: 6 oy parallel — **2.86 s**, ya'ni alohida kesh shart emas; diagrammalar so'rovining 5 daqiqalik keshi yetarli.

**`inGroup` va `groupless` bu diagrammaga KIRMAYDI.** Ular oyga bog'liq emas — bugungi holatdan hisoblanadi va oltala oyda bir xil qiymat qaytaradi (372 va 147). Vaqt qatori sifatida ular yolg'on bo'lardi.

Bosilganda → `/reports/departed-students`.

### D. Davomat — oxirgi 12 hafta *(+ administrator)*

Chiziq: **haftalik davomat foizi**.

Manba: `ReportsService.getAttendanceAnalytics` (`bucket: 'week'`) — Redis'da keshlangan.

Bosilganda → `/reports/attendance`.

---

## Yo'l-yo'lakay tuzatiladigan nuqson

`getStudentFlow` «guruhda o'qiyotgan o'quvchi» ni **uchinchi xil** ta'riflaydi:

```ts
enrollments: { some: { status: 'ACTIVE' } }
```

Bunda ikkita shart yetishmaydi — yozuvning `deletedAt: null` i (o'chirilgan yozuvlar ham sanaladi) va guruhning holati. Natijada u **372** qaytaradi, kanonik ta'rif esa **365** — 7 ta o'quvchi farq, va `/reports/activity` sahifasi bosh sahifadan boshqa raqam ko'rsatadi.

`inGroup`, `groupless` va `dropped.stillInGroup` uchtasi ham `students/shared/active-student-where.ts` dagi umumiy shartga o'tkaziladi. Ta'rifning o'zi `CONTEXT.md` da yozilgan va 2026-09-02 da tasdiqlangan; bu uni oxirgi qarshi turgan joyga qo'llash.

---

## Joylashuv

```
kartalar → e'tibor + jadval → ┌──────────────┬──────────────┐
                              │ A moliya     │ B pul qayerga│  ← CEO / direktor
                              ├──────────────┼──────────────┤
                              │ C o'quvchilar│ D davomat    │  ← + administrator
                              └──────────────┴──────────────┘
```

Administrator faqat pastki qatorni ko'radi. **Kassirga diagramma yo'q** — `/reports/*` unga ochiq emas, shuning uchun manbalarning o'zi ham chaqirilmaydi. O'qituvchi bu endpointni umuman chaqirmaydi.

Mobilda to'rttasi ustma-ust tushadi, tartib o'zgarmaydi.

---

## Javob shakli

```ts
interface DashboardCharts {
  money: {
    trend: { month: string; income: number; expenses: number; profit: number }[];
    breakdown: {
      revenue: number;
      teacherSalary: number;
      adminSalary: number;
      operatingExpenses: number;
      refunds: number;
      netProfit: number;
    } | null;
  } | null;                       // rol 1, 2 dan boshqasiga null
  students: { month: string; arrived: number; left: number; net: number }[] | null;
  attendance: { label: string; rate: number }[] | null;
  failed: string[];               // yiqilgan diagrammalar
}
```

Har bir diagramma alohida yiqiladi — biri xato bersa qiymati `null` bo'ladi, nomi `failed` ga tushadi, UI faqat o'sha katakni «ma'lumot olinmadi» qilib chizadi. Yiqilgan javob keshlanmaydi.

Kesh: `dashboard:charts:{companyId}:{branchKey}:{tier}`, **TTL 300 s**. Sanagichlarnikidan uzunroq, chunki diagrammalar sekinroq o'zgaradi. Kesh kaliti rol darajasini o'z ichiga oladi.

---

## Chizish qoidalari (CLAUDE.md, majburiy)

- **SVG atributlarida `hsl(var(--…))` ishlatilmaydi** — u SVG'da jimgina ishlamaydi va sukut bo'yicha qora rang beradi. Faqat literal hex, rgba yoki `currentColor`.
- Recharts'ning standart `<Tooltip>` uslubi ishlatilmaydi — o'z mavzuli tooltip (`bg-popover text-popover-foreground`), nol qiymatli qatorlar filtrlanadi.
- 4–5 tadan ortiq kategoriya rangi yo'q.
- Bo'sh holat harakatga chorlaydi: «Ma'lumot yo'q» emas, «Bu davrda ... yo'q — davrni kengaytiring».
- Chizishdan oldin `dataviz` skill'i o'qiladi.

---

## Sinovlar

**Backend (jest):** rol filtri (administratorga `money === null`, kassirga hammasi `null`), bo'sh filial qamrovi → 403, bitta blok yiqilsa qolgani qaytishi va `failed` ga tushishi, yiqilgan javob keshlanmasligi, `getStudentFlow` ning uchta ta'rifi umumiy shartga o'tgani.

**Frontend (vitest, `environment: node`):** render testi yozib bo'lmaydi, shuning uchun rol mantiqi va seriyani chizishga tayyorlash sof funksiyalarda bo'ladi va o'shalar sinaladi.

---

## Qamrovga kirmaydi

- Davr tanlagich (6 oyni o'zgartirish) — bosh sahifa hisobot sahifasi emas
- Diagrammani rasm/Excel qilib yuklab olish — `/reports` da bor
- Foydalanuvchi diagrammalarni yashirishi yoki joyini almashtirishi
