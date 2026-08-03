# Avans kalendari — kunlik avans statistikasi

**Sana:** 2026-08-03
**Holat:** dizayn tasdiqlangan, kod yozilmagan

## Muammo

CEO oy davomida **qaysi kuni qancha avans berilganini** ko'ra olmaydi. Hozir avans ma'lumoti bor, lekin faqat **xodim kesimida**:

- `/payments/salary` jadvalidagi «Avans» ustuni — bitta xodimning oylik **jami**si
- Avans katagini bosganda ochiladigan drawer (`salary-advance-breakdown-drawer.tsx`) — o'sha bitta xodimning oy ichidagi avanslari (sana, summa, usul, izoh, kim bergan)

Ya'ni «15-iyulda kassadan qancha avans chiqdi?» degan savolga javob berish uchun har bir xodimning drawer'ini alohida ochib, sanalarni qo'lda solishtirish kerak.

**Maqsad: kassa nazorati.** Asosiy o'q — SANA, xodim emas.

## Qaror

`/payments/salary` sahifasiga ikkinchi tab qo'shiladi: **«Avanslar»** — oy kalendari ko'rinishida.

```
Oyliklar  |  Avanslar                        [Iyul 2026 ▾]
─────────────────────────────────────────────────────────
┌──────────┬──────────┬──────────┬─────────────────────┐
│ Jami     │ Berilgan │ Xodimlar │ Eng katta kun       │
│ 4 500 000│ 3 kunda  │ 6 ta     │ 15.07 — 2 200 000   │
└──────────┴──────────┴──────────┴─────────────────────┘

       Iyul 2026                    ┌─ 15.07.2026 ────────┐
Du  Se  Ch  Pa  Ju  Sh  Ya          │ Jami: 2 200 000     │
     1   2   3   4   5   6          │ 4 ta xodim          │
            ┃1.5M┃                  ├─────────────────────┤
 7   8   9  10  11  12  13          │ Aziz Karimov        │
┃0.8M┃                              │ O'qituvchi · Naqd   │
14 [15] 16  17  18  19  20          │           1 000 000 │
   ┃2.2M┃                           │ Malika Tosheva      │
                                    │ Administrator·Karta │
                                    │             600 000 │
                                    │ [+ Bu kunga avans]  │
                                    └─────────────────────┘
```

### Xulq-atvor

- Kun katagida — o'sha kunning **jami summasi**. Avans berilmagan kunlar bo'sh.
- Summa qancha katta — katak foni shuncha to'q (oydagi eng katta kunga nisbatan). Og'ir kunlar bir qarashda ko'rinadi.
- Kunni bosish — yon panelda (desktop, `lg:` dan yuqori) yoki kalendar tagida (mobil/planshet) o'sha kunning ro'yxati ochiladi: xodim ismi, lavozimi, summa, naqd/karta, izoh, kim bergan.
- Panel ichida «Bu kunga avans qo'shish» tugmasi (CEO / Filial direktori) — mavjud `SalaryAddAdvanceDialog` ochiladi, sana oldindan to'ldirilgan.
- Sahifa ochilganda hech qaysi kun tanlanmagan; panel o'rnida yo'naltiruvchi bo'sh holat: «Tafsilotni ko'rish uchun kalendardan kun tanlang».
- Oyda umuman avans bo'lmasa: «Bu oyda avans berilmagan» + (CEO/BD uchun) «Avans qo'shish» tugmasi.

### Qamrov

**Barcha xodimlar** — o'qituvchi, administrator, kassir, filial direktori. Avans dialogi hozir ham istalgan xodimni tanlashga ruxsat beradi (`TEACHER_ADVANCE` — bu kategoriya nomi, cheklov emas), kassadan chiqqan pul esa to'liq ko'rinishi kerak.

### Huquqlar

| Amal | Rol |
|---|---|
| Kalendarni ko'rish | CEO, Filial direktori, Administrator |
| Avans qo'shish | CEO, Filial direktori |

Ko'rish huquqi mavjud `GET /salary/monthly` va `GET /salary/advances/:userId` bilan bir xil — Administrator allaqachon «Avans» ustunini va drawer'ni ko'radi, shuning uchun yangi ma'lumot ochilmayapti. Qo'shish huquqi mavjud xarajat-yaratish endpoint'i bilan bir xil (CEO/BD).

## Backend

### Endpoint

```
GET /salary/advance-calendar?month=YYYY-MM
@Roles('CEO', 'Branch Director', 'Administrator')
```

Yo'l `advance-calendar` — `advances/calendar` EMAS. Mavjud `GET /salary/advances/:userId` marshruti bilan to'qnashmasligi uchun (`calendar` `:userId` sifatida o'qilib, `ParseIntPipe`da 400 bo'lardi).

### Javob

```ts
{
  month: "2026-07",
  floorMonth: "2026-05",
  days: [
    { date: "2026-07-15", total: 2_200_000, count: 4, cash: 1_400_000, card: 800_000 }
  ],
  totals: {
    total: 4_500_000,
    count: 9,
    daysWithAdvances: 3,
    employeeCount: 6,
    maxDay: { date: "2026-07-15", total: 2_200_000 } | null,
  },
  advances: [
    {
      id, date: "2026-07-15", amount, paymentMethod: "CASH" | "CARD", description,
      user: { id, firstName, lastName, roles: [{ id, name }] },
      createdBy: { id, firstName, lastName }, createdAt,
    }
  ],
}
```

**Bitta so'rov butun oyni qaytaradi.** Oyda odatda 10–40 ta avans bo'ladi, shuning uchun kunni bosganda qo'shimcha so'rov ketmaydi — panel xotiradagi ro'yxatdan filtrlaydi.

`days` massivida faqat avans **bor** kunlar bo'ladi; bo'sh kunlarni frontend kalendar setkasini yasashda o'zi to'ldiradi.

### Servis

Yangi fayl: `server/src/salary/salary-advance-calendar.service.ts`

1. Oy, oy chegaralari va filial qamrovi mavjud `resolveMonthlyScope`'dan olinadi — bu bilan tabning oy floor'i (`Company.systemStartDate`) va filial qoidalari «Oyliklar» tabi bilan bir xil bo'ladi.
2. `scope.blocked` (filialga bog'langan, lekin filiali yo'q chaqiruvchi) → bo'sh natija qaytariladi.
3. Bitta so'rov:

```ts
prisma.expense.findMany({
  where: {
    category: 'TEACHER_ADVANCE',
    companyId,
    deletedAt: null,
    relatedUserId: { not: null },
    date: { gte: scope.monthStart, lt: scope.nextMonthStart },
    // Filial qamrovi — OLUVCHI xodimning filiali bo'yicha, `getMonthly`dagi
    // xodim ro'yxati bilan bir xil predikat (`branches: { some: { branchId } }`).
    ...(scope.branchId !== undefined && {
      relatedUser: { branches: { some: { branchId: scope.branchId } } },
    }),
  },
  select: { id, amount, date, paymentMethod, description, createdAt,
            relatedUser: { select: { id, firstName, lastName,
                                     roles: { select: { role: { select: { id, name } } } } } },
            createdBy: { select: { id, firstName, lastName } } },
  orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
})
```

4. Kunlar bo'yicha guruhlash va jamlar xotirada hisoblanadi.

### Muhim texnik nuqtalar

- **`Expense.date` — `@db.Date` ustuni.** CLAUDE.md qoidasi: bunday ustunga siljitilmagan UTC chegaralar + `lt` ishlatiladi. `resolveMonthlyScope` qaytaradigan `monthStart` / `nextMonthStart` aynan shunday (`Date.UTC(y, m-1, 1)`) — o'zimiz yangi chegara yasamaymiz.
- **Kun kaliti serverda yasaladi**, `date` ning UTC sana qismlaridan (`getUTCFullYear/Month/Date`). Brauzer mintaqasidan kelib chiqadigan bir kunlik siljish shu bilan yopiladi.
- **Filial qamrovi — oluvchi xodimning filiali bo'yicha** (`resolvePayrollBranchScope`, `Expense.branchId` emas). Sabab: bir sahifadagi ikkala tab bir xil qamrovda bo'lishi kerak — «Oyliklar» jadvalidagi «Avans» ustuni ham oluvchi bo'yicha qamraladi. Ikki xil predikat ikki xil raqam beradi, bu loyihada bir necha marta takrorlangan xato sinfi.

  Amalda: `resolvePayrollBranchScope` uchun `UNSCOPED_ROLES = ['CEO', 'Administrator']` — ya'ni Administrator ham barcha filiallarni ko'radi, faqat Filial direktori o'z filiali bilan chegaralanadi. Bu «Oyliklar» tabidagi mavjud xulq; kalendar uni takrorlaydi, o'zgartirmaydi.
- **Lavozim** — `User`da `position` ustuni yo'q; u rollardan olinadi (`salary-monthly-staff.service.ts:208` shunday qiladi). Endpoint `roles` ni qaytaradi, yorliqni frontend yasaydi.

### Testlar

- `salary-advance-calendar.service.spec.ts` — kunlar bo'yicha guruhlash, naqd/karta ajratish, `maxDay`, noyob xodimlar soni, bo'sh oy, `blocked` qamrov, oy chegarasi (oyning 1- va oxirgi kuni kiradi, qo'shni oy kunlari kirmaydi).
- `salary.controller.spec.ts` — yangi endpoint uchun `@Roles` metadata mavjudligi va O'qituvchi/O'quvchi rad etilishi.

## Frontend

| Fayl | O'zgarish |
|---|---|
| `client/src/components/payments/salary-client.tsx` | `<Tabs>` qo'shiladi, `?tab=` URL'da saqlanadi |
| `client/src/components/payments/salary-advances-tab.tsx` | **yangi** — oy tanlagich + statistika kartalari + kalendar + kun paneli |
| `client/src/components/payments/salary-advance-calendar.tsx` | **yangi** — oy setkasi |
| `client/src/components/payments/salary-advance-day-panel.tsx` | **yangi** — tanlangan kun ro'yxati |
| `client/src/components/payments/salary-add-advance-dialog.tsx` | ixtiyoriy `defaultDate` prop |
| `client/src/components/payments/employee-advance-select.tsx` | `employeeRoleLabel` eksport qilinadi (takrorlamaslik uchun) |

### URL holati

- Tab: `?tab=avanslar`. Default (`oyliklar`) URL'ga **yozilmaydi** — loyiha qoidasi.
- Oy: mavjud `?month=` parametri ikkala tab uchun **umumiy**. Tabni almashtirganda tanlangan oy saqlanadi.
- Tanlangan kun URL'ga yozilmaydi — u vaqtinchalik UI holati (dialog ochiqligi kabi).

### Komponentlar

- Oy tanlagich: mavjud `<MonthPicker>` (`@/components/ui/month-picker`), `minMonth` = javobdagi `floorMonth`, `maxMonth` = joriy oy — «Oyliklar» tabidagi bilan bir xil.
- Kalendar setkasi qo'lda yasaladi (7 ustunli grid, hafta dushanbadan boshlanadi). shadcn `<Calendar>` ishlatilmaydi: unga katak ichiga summa va rang shkalasi joylash uchun ko'p kurash kerak, foydasi esa yo'q — bu tanlagich emas, ko'rsatkich.
- Kun paneli — `<Table>` emas, **ro'yxat**. Sabab: u tor panelda turadi va bir kunga odatda 1–5 qator to'g'ri keladi; `<Table>` bo'lganda loyiha qoidasi bo'yicha `#` ustuni va 10 qatorli sahifalash majburiy bo'lardi, bu bir kunlik ro'yxat uchun ortiqcha.
- Yuklanishda skeleton (kartalar + setka shaklini takrorlaydi), spinner emas.
- Summalar `formatPrice`, sanalar `dd.MM.yyyy`, butun matn o'zbekcha.
- Kun kataklari `<button>` — klaviatura bilan yurish va fokus holati ishlaydi. Avans yo'q kunlar `disabled`.

### Rang shkalasi

Katak foni — oydagi eng katta kunga nisbatan 4 pog'onali amber shkala (`bg-amber-50 → bg-amber-500/30`). SVG emas, oddiy HTML — CLAUDE.md dagi `hsl(var(--...))` SVG tuzog'i bu yerda tegishli emas. Rang **yagona signal emas**: summa har doim raqam bilan ham yozilgan (rang ko'rmaydiganlar uchun).

## Kelishilgan chekinishlar

**Kalendar barcha avanslarni ko'rsatadi, «Oyliklar» jadvalidagi «Avans» JAMI'si esa faqat oylik ro'yxatidagi xodimlarniki.** `getMonthly` avanslarni `relatedUserId: { in: ids }` bilan cheklaydi, bu yerda `ids` — darsi yoki oylik konfiguratsiyasi bor xodimlar. Konfiguratsiyasiz xodimga berilgan avans kalendarda ko'rinadi, jadval JAMI'sida ko'rinmaydi.

Kassa nazorati uchun to'g'risi — hammasini ko'rsatish. Ikki raqam farq qilganda kalendar tagida kichik izoh chiqadi:

> «2 ta avans (450 000) oylik ro'yxatidan tashqari xodimga berilgan — «Oyliklar» tabidagi JAMI'da ko'rinmaydi.»

Shunda farq yashirin qolmaydi va u o'zi signal bo'ladi.

## Nima qilinmaydi (YAGNI)

- **Excel eksporti** — avanslar allaqachon Excel «Xarajatlar» varag'ida sana + xodim ustuni bilan chiqadi.
- **Telegram hisobotiga qo'shimcha qator** — kunlik hisobotda MTD «Avans» qatori bor.
- **Avansni tahrirlash/o'chirish** — mavjud oqim o'zgarmaydi.
- **Kun × xodim matritsasi** — boshqa savolga (xodim intizomi) javob beradi; kerak bo'lsa alohida ish.
- **Ledger o'zgarishi yo'q.** Bu faqat o'qish; `Expense`, `SalaryPayment`, hisob-kitob mantig'i qo'l tegmaydi.
