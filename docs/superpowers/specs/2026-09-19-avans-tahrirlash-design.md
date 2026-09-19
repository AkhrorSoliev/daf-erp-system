# Avansni tahrirlash va o'chirish — dizayn

Sana: 2026-09-19. Holat: CEO tasdiqlagan (suhbatda, oddiy tilda).
Bog'liq: `project_teacher_advance_in_salary_view` (avans ustuni),
`project_salary_month_settle` (oylik berilganini tasdiqlash),
`project_money_route_branch_audit` (pul route'lari filial qorovuli).

---

## 1. So'ralgan ish

CEO avans bergan, lekin u **noto'g'ri kunga** yoki **noto'g'ri summa** bilan
yozilgan. Savol: buni tuzatish mumkinmi?

Hozir saytdan **mumkin emas**. Avans — `TEACHER_ADVANCE` toifasidagi `Expense`
yozuvi, lekin:

- *Xarajatlar* sahifasida avans **umuman ko'rinmaydi** — u ataylab
  chiqarib tashlangan, chunki boshqaruv *Ish haqi* sahifasiga ko'chirilgan
  (`expenses.service.ts` → `categoryWhere`).
- *Ish haqi → Avanslar* tabidagi kun panelida faqat **«Bu kunga avans
  qo'shish»** tugmasi bor (`salary-advance-day-panel.tsx`).
- *Oyliklar* jadvalidagi «Avans» katagi ochadigan ro'yxat ham faqat o'qish
  uchun (`salary-advance-breakdown-drawer.tsx`).

Ya'ni tahrirlash/o'chirish **serverda bor**, lekin unga olib boradigan tugma
yo'q.

## 2. CEO qarorlari

1. **Oylikka allaqachon hisoblangan avans tegilmaydi.** Tugma o'chiq turadi va
   sabab yozilib ko'rsatiladi. Oylik chiqib bo'lgandan keyingi tuzatma
   (keyingi oylikdan ushlash / qo'shish) **bu ishning qamrovida emas** —
   alohida ish sifatida qoldirildi.
2. **Tahrirlanadigan maydonlar:** summa, sana, naqd/karta, izoh.
   **Xodim o'zgarmaydi.** Noto'g'ri odamga yozilgan bo'lsa — o'chirib, to'g'ri
   odamga yangisini yozish kerak. Sabab: pul bir xodimdan ikkinchisiga
   jimgina ko'chib qolmasin, tarixda ikkita aniq harakat qolsin.
3. **Mavjud `PATCH /expenses/:id` ishlatiladi**, yangi endpoint yozilmaydi.

## 3. Hozirgi holat — nima bor, nima yo'q

### Bor

| Narsa | Qayerda |
|---|---|
| `PATCH /expenses/:id`, `DELETE /expenses/:id` — `CEO` va `Branch Director` | `expenses.controller.ts` |
| Summa o'zgarganda daftar tuzatmasi: eski yozuv bekor qilinadi, yangisi yoziladi | `expenses.service.ts` → `update` |
| O'chirilganda daftar yozuvi bekor qilinadi, pul kassaga qaytadi | `expenses.service.ts` → `remove` |
| Har ikkala amalda `EntityHistory` yoziladi | o'sha joyda |
| Ikki tomonlama filial tekshiruvi (`assertBranchWritable`) | o'sha joyda |

### Yo'q (bu ishda yopiladi)

| Bo'shliq | Oqibati |
|---|---|
| `update` va `remove` da `settledBySalaryPaymentId` tekshirilmaydi | Oylikka hisoblangan avansning summasini o'zgartirsa, o'sha `SalaryPayment.amount` eski summa bo'yicha kamaytirilgan holicha qoladi — oylik varaqasi bilan haqiqat farq qiladi |
| `update` da `TEACHER_ADVANCE` shartlari qayta tekshirilmaydi (`create` da bor) | Avans toifasi almashib «oddiy xarajat»ga aylanishi yoki `relatedUserId` `null` bo'lib xodimdan uzilib qolishi mumkin |
| `expense-form-dialog.tsx` saqlashda doim `relatedUserId: null` yuboradi | O'sha oyna avansga hech qachon ochilmasligi kerak (hozir ochilmaydi, lekin qorovul buni **baland ovoz bilan** rad etsin) |
| `salary-breakdown.service.ts` settled avanslarni `deletedAt: null` filtrisiz o'qiydi | O'chirilgan avans oylik varaqasida baribir hisoblanib turadi |

## 4. Ko'rinish

### 4.1. Avanslar tabi — kun paneli

`salary-advance-day-panel.tsx`. Har bir avans qatorining o'ng tomonida ikkita
kichik tugma (`ghost`, `size-8`): **qalam** (`Pencil`) va **savat**
(`Trash2`). Faqat `canPay` bo'lganda chiqadi — bu allaqachon mavjud shart
(`salary-client.tsx`, rol 1 va 2).

```
┌──────────────────────────────────────────────┐
│ 15.09.2026                                   │
│ Jami 1 200 000 · 2 ta                        │
├──────────────────────────────────────────────┤
│ Anna Müller                    500 000  ✏ 🗑 │
│ O'qituvchi                                   │
│ [Naqd]  Avans  · Aziz S. bergan              │
├──────────────────────────────────────────────┤
│ Thomas Weber                   700 000  ⊘ ⊘ │
│ O'qituvchi                                   │
│ [Karta]  Avans  · Aziz S. bergan             │
│ Sentyabr oyligiga hisoblangan                │
├──────────────────────────────────────────────┤
│        [ Bu kunga avans qo'shish ]           │
└──────────────────────────────────────────────┘
```

**Oylikka hisoblangan avans:** ikkala tugma `disabled`, qator ostida kichik
kulrang matn — `«<Oy> oyligiga hisoblangan»`. Tugma ustida `title` bilan
to'liq sabab: `«Bu avans <Oy> oyligiga hisoblangan — o'zgartirib bo'lmaydi»`.
Sabab **doim ko'rinadi** (faqat hover'ga tashlab qo'yilmaydi), chunki o'chiq
tugma sababsiz bo'lsa buzuq tuyuladi.

### 4.2. «Avans» katagi ro'yxati

`salary-advance-breakdown-drawer.tsx`. Bu `<Table>` — jadvalga oxirgi ustun
qo'shiladi (sarlavhasiz, `w-20`), ichida o'sha ikkita tugma va o'sha
`disabled` qoidasi. Xato ko'pincha aynan shu ro'yxatda ko'zga tashlanadi,
shuning uchun CEO ni boshqa tabga yuborish noto'g'ri bo'lardi.

Bu komponent hozir `canPay` ni bilmaydi — `salary-monthly-view.tsx` dan
`canPay` prop bo'lib o'tadi (u yerda allaqachon bor).

### 4.3. Tahrirlash oynasi

`salary-add-advance-dialog.tsx` → `salary-advance-dialog.tsx` deb nomlanadi va
ikki rejimda ishlaydi (xuddi `expense-form-dialog.tsx` dagi `isEdit` kabi).
Yangi fayl ochilmaydi: maydonlar, summa formatlash, validatsiya bir xil —
ikkinchi nusxa muqarrar ravishda birinchisidan ajralib ketardi.

| | Qo'shish rejimi | Tahrirlash rejimi |
|---|---|---|
| Sarlavha | Avans qo'shish | Avansni tahrirlash |
| Xodim | tanlanadi | **ko'rinadi, o'zgarmaydi** — ism matn bo'lib chiqadi, tanlagich yo'q |
| Summa, sana, naqd/karta, izoh | bo'sh/standart | mavjud qiymat bilan to'ldirilgan |
| Saqlash | `POST /expenses` | `PATCH /expenses/:id` |

Tahrirlash rejimida `PATCH` tanasi **faqat to'rt maydon**: `amount`, `date`,
`paymentMethod`, `description`. `category`, `relatedUserId`, `branchId`
yuborilmaydi — yuborilmagan maydon o'zgarmaydi.

Sana maydoni ostida kichik izoh:
`«Sana o'zgarsa avans hisobotlarda yangi kunga ko'chadi, kassa oqimidagi
harakat esa kiritilgan kunida qoladi.»`

### 4.4. O'chirish tasdig'i

`AlertDialog` — `expenses-client.tsx` dagi shakl:

> **Avansni o'chirasizmi?**
> Anna Müller — 500 000 so'm, 15.09.2026. Pul kassaga qaytariladi va bu avans
> keyingi oylik hisobiga tushmaydi. Bu amalni qaytarib bo'lmaydi.

## 5. Server qoidalari

Hammasi `expenses.service.ts` ichida — daftar mantig'i (bekor qilish + qayta
yozish + kassa) bitta joyda qolishi uchun.

### 5.1. `update(id, dto, ...)` ga qo'shiladigan qorovullar

`existing` so'rovi `category`, `settledBySalaryPaymentId`, `relatedUserId` ni
ham o'qiydi (hozir `findFirst` hammasini oladi — `select` qo'shilmaydi).

1. **Hisoblangan avans qulflanadi.** `existing.category === TEACHER_ADVANCE &&
   existing.settledBySalaryPaymentId !== null` → `ConflictException`:
   `«Bu avans oylikka hisoblangan — o'zgartirib bo'lmaydi»`.
2. **Avans avansligicha qoladi.** `existing.category === TEACHER_ADVANCE` bo'lsa:
   - `dto.category` boshqa toifaga o'zgartirilsa → `BadRequestException`
   - `dto.relatedUserId` mavjuddan boshqa qiymatga (jumladan `null`) o'zgartirilsa
     → `BadRequestException`. Bu `expense-form-dialog.tsx` ning `relatedUserId:
     null` odatini baland ovoz bilan to'xtatadi.
3. **Avansga aylantirishda `create` bilan bir xil shart.** `dto.category ===
   TEACHER_ADVANCE` bo'lib `existing` avans bo'lmasa → `relatedUserId` shart va
   o'sha xodim shu kompaniyada bo'lishi tekshiriladi (`create` dagi blok
   xususiy metodga ajratiladi va ikkala joyda chaqiriladi).

### 5.2. `remove(id, ...)` ga qo'shiladigan qorovul

Xuddi 5.1.1 — hisoblangan avansni o'chirib bo'lmaydi, `ConflictException`.

### 5.3. Filial qoidasi — ochiq aytilgan nomuvofiqlik

Avans kalendari **oluvchi xodimning** filiali bo'yicha qamraladi
(`salary-advance-calendar.service.ts`: `relatedUser.branches.some({ branchId })`),
`assertBranchWritable` esa **`Expense.branchId`** bo'yicha tekshiradi. Demak
filial direktori ro'yxatda ko'rgan avansni tahrirlashda 403 olishi mumkin —
agar avans boshqa filial hisobiga yozilgan bo'lsa.

Bu **ataylab shunday qoldiriladi**: pul route'i fail-closed bo'lishi kerak
(`project_money_route_branch_audit`). Faqat xato matni tushunarli bo'lsin —
`getErrorMessage` serverning matnini ko'rsatadi, qo'shimcha ish kerak emas.
CEO hamma filialga kira oladi, shuning uchun uning uchun bu holat yuzaga
kelmaydi.

## 6. Serverdan qaytadigan yangi ma'lumot

UI tugmani o'chirish uchun avansning hisoblangan yoki hisoblanmaganini bilishi
kerak. Ikkala ro'yxat endpoint'iga bir xil ikki maydon qo'shiladi:

```ts
settled: boolean;              // settledBySalaryPaymentId !== null
settledPeriodEnd: string | null; // "YYYY-MM-DD", tugma izohidagi oy nomi uchun
```

- `salary-advance-calendar.service.ts` → `AdvanceCalendarRow`
  (`select` ga `settledBySalaryPaymentId` va
  `settledBySalaryPayment: { select: { periodEnd: true } }`)
- `salary-monthly.service.ts` → `getAdvancesForUser` (xuddi shunday)
- Mos ravishda `AdvanceRow` turlari: `salary-advances-tab.tsx` va
  `salary-advance-breakdown-drawer.tsx`

## 7. Pul mantig'i — nima o'zgaradi, nima yo'q

| Amal | Daftar (`Transaction`) | Kassa |
|---|---|---|
| Summa o'zgardi | eski yozuv bekor qilinadi, yangi summa bilan qayta yoziladi | farqga moslashadi |
| Sana / izoh / naqd-karta o'zgardi | tegilmaydi | tegilmaydi |
| O'chirildi | bekor qilinadi | pul qaytadi |

Bu mantiq **allaqachon yozilgan va ishlaydi** — yangi kod emas, faqat unga yo'l
ochilmoqda.

**Ochiq cheklov:** `CashMovement` da biznes sanasi yo'q, faqat `createdAt`
(`schema.prisma`). *Kassa oqimi* hisoboti shu `createdAt` bo'yicha filtrlaydi
(`reports-cash-flow.service.ts`). Demak avansning sanasini to'g'rilash uni
avans kalendari, ish haqi sahifasi va Telegram hisobotida yangi kunga
ko'chiradi, lekin *Kassa oqimi* da eski kunida qoldiradi. Bu bugungi
xatti-harakat — biz uni o'zgartirmayapmiz, faqat oynada ochiq yozib
qo'yamiz (4.3). `CashMovement` ga biznes sanasi qo'shish alohida, kattaroq ish.

## 8. Yo'l-yo'lakay tuzatish

`salary-breakdown.service.ts` dagi settled avanslar so'roviga `deletedAt: null`
qo'shiladi. Hozir o'chirilgan avans oylik varaqasida hisoblanib turadi; o'chirish
tugmasi paydo bo'lgach bu ko'rinadigan xatoga aylanadi. Bir qatorlik, shu ishning
ichida.

## 9. Sinov

### Server

`expenses.service.spec.ts`:

- hisoblanmagan avans summasi o'zgarganda eski daftar yozuvi bekor qilinib
  yangisi yoziladi
- hisoblanmagan avansning faqat sanasi o'zgarganda daftarga **tegilmaydi**
- `settledBySalaryPaymentId` to'la avansni `update` qilish → `Conflict`
- `settledBySalaryPaymentId` to'la avansni `remove` qilish → `Conflict`
- avans toifasini boshqa toifaga o'zgartirish → `BadRequest`
- avansga `relatedUserId: null` yuborish → `BadRequest`
- oddiy xarajat (avans emas) uchun eski xatti-harakat o'zgarmaganini tasdiqlash

`salary-advance-calendar.service.spec.ts` va `salary-monthly.service.spec.ts`:

- `settled` va `settledPeriodEnd` to'g'ri qaytishi (hisoblangan va
  hisoblanmagan ikkita avans bilan)

`salary-breakdown.service.spec.ts`:

- o'chirilgan settled avans varaqadagi `settledAdvancesTotal` ga tushmasligi

### Qo'lda (prodga chiqishdan oldin, dev bazada mazmunli ma'lumot bilan)

1. Hisoblanmagan avansning sanasini o'zgartirish → kalendarda yangi kunga
   ko'chishi
2. Summasini o'zgartirish → kassa balansi farqga mos o'zgarishi
3. O'chirish → keyingi `POST /salary/calculate` da ushlanmasligi
4. Hisoblangan avans qatorida tugmalar o'chiq va sabab ko'rinishi

## 10. Qamrovdan tashqarida

- **Oylik tuzatmasi** (oylik berilgandan keyin keyingi oylikdan ushlash yoki
  qo'shish). CEO bu ishni hozircha kerak emas deb qaror qildi. Eslatma: agar
  xodim **ko'p** olgan bo'lsa buni bugun ham avans yozib hal qilsa bo'ladi
  (`applyPendingAdvances` keyingi oylikdan avtomatik ushlaydi); **kam** olgan
  holat uchun tizimda hech qanday yo'l yo'q — `SalaryAccrual` majburiy
  ravishda o'quvchi va guruhga bog'langan.
- **Xodimni almashtirish** (CEO qarori, 2-band).
- **`CashMovement` ga biznes sanasi** qo'shish (7-band).
- **Xarajatlar sahifasida avansni ko'rsatish** — u ataylab yashirilgan, shunday
  qoladi.

## 11. Tegiladigan fayllar

### Server

- `server/src/expenses/expenses.service.ts` — 5.1 va 5.2 qorovullari,
  `create` dagi avans tekshiruvini xususiy metodga ajratish
- `server/src/salary/salary-advance-calendar.service.ts` — `settled`,
  `settledPeriodEnd`
- `server/src/salary/salary-monthly.service.ts` — `getAdvancesForUser` da
  o'sha ikki maydon
- `server/src/salary/salary-breakdown.service.ts` — `deletedAt: null` (8-band)

### Klient

- `salary-add-advance-dialog.tsx` → **`salary-advance-dialog.tsx`** deb
  nomlanadi, `SalaryAddAdvanceDialog` → `SalaryAdvanceDialog`. Import
  joylari: `salary-advances-tab.tsx`, `salary-monthly-view.tsx`
- `salary-advance-day-panel.tsx` — ikkita tugma, `disabled` holat, sabab matni
- `salary-advance-breakdown-drawer.tsx` — amallar ustuni, `canPay` prop
- `salary-advances-tab.tsx` — tahrirlash/o'chirish holati, `AdvanceRow` turi
- `salary-monthly-view.tsx` — drawer'ga `canPay` uzatish

### Sinovlar

- `server/src/expenses/expenses.service.spec.ts`
- `server/src/salary/salary-advance-calendar.service.spec.ts`
- `server/src/salary/salary-monthly.service.spec.ts`
- `server/src/salary/salary-breakdown.service.spec.ts`
