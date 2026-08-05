# Multi-branch architecture — design

**Sana:** 2026-08-05
**Kontekst:** filial #2 (Namangan) ishga tushirilmoqda; filial #1 (Farg'ona) da real ma'lumot bor.
**Bog'liq:** [branch-decisions.md](../../branch-decisions.md) (D1–D8), [branch-readiness-issues.md](../../branch-readiness-issues.md) (P1–P106), [branch-action-plan.md](../../branch-action-plan.md) (Batch 0–7 bajarilgan).

Bu hujjat qolgan ishni ta'riflaydi. Batch 0–7 da bajarilgan ishlar qayta ko'rib chiqilmaydi — ular kod bo'yicha tekshirildi va o'z joyida.

---

## 1. Muammo

Filial izolyatsiyasi **yozish tomonida** deyarli yopilgan (ledger, kassa, oylik, guruh/o'quvchi invariantlari), lekin **o'qish tomonida** ochiq: server chaqiruvchining filialini shift (ceiling) sifatida qo'llamaydi. Klient `?branch_id=` yuboradi, server uni so'zsiz qabul qiladi — ya'ni filial cheklovi **klient xotirasiga** tayanadi, bu esa xavfsizlik chegarasi emas.

Tasdiqlangan uchta sinf:

**A — Filialga bog'langan foydalanuvchi boshqa filial ma'lumotini o'qiy oladi**
- `GET /students`, `/groups`, `/teachers`, `/users`, `/rooms`, `/courses`, `/dashboard/today-schedule` — `branch_id` **kengaytiruvchi** filtr. Berilmasa butun kompaniya; `?branch_id=1` yuborilsa begona filial.
- Hisobot endpointlarining ~25 tasi `query.branchId` ni xom holda ishlatadi (`resolveScope` faqat 5 joyda).
- JWT da filial da'vosi yo'q; yagona guard yo'q.

**B — Pul noto'g'ri filialga yozilishi mumkin**
- Qo'lda to'lov: klient `branchId: selectedBranch?.id` (header switcher) yuboradi, servis uni shartnomasiz holatda **tekshirmasdan** qabul qiladi. Shartnomalar amalda ishlatilmaydi → himoya yo'q.
- Xarajat create/update/delete: `dto.branchId` mavjudligi ham, kompaniyaga tegishliligi ham, chaqiruvchi huquqi ham tekshirilmaydi.

**C — Sxemada tenancy yo'q**
- `Lead`, `LeadColumn`, `LeadSection`, `LeadSource` — na `companyId`, na `branchId`.
- `MockExam`, `MockExamSection`, `MockExamParticipant` — bir xil.
- `Holiday` — butun BAZA bo'yicha global.
- `Payment.branchId` / `Transaction.branchId` / `CashMovement.branchId` — nullable va FK emas; `Course.branchId` nullable.

**D — Filial ochish oqimi bo'sh**
- `BranchesService.create` ish vaqtini **jimgina tashlab yuboradi** (DTO qabul qiladi, `data` blokiga kirmaydi); kassa yaratmaydi; `nextId` ni `companyId`siz va tranzaksiyadan tashqarida hisoblaydi.
- Telegram guruh tasdiqlashda filial tanlanmaydi; `branchId: null` guruh **har qanday** filial hodisasini oladi.

---

## 2. Arxitektura qarori

### 2.1 Yagona filial scope'i — `BranchScopeGuard`

**Rad etilgan variant:** axios interceptor'ida har bir so'rovga `?branch_id=` qo'shish. Global `ValidationPipe` `forbidNonWhitelisted: true` bilan ishlaydi, ya'ni DTO'sida `branch_id` e'lon qilinmagan **har bir endpoint 400 qaytara boshlaydi** (~100 DTO). POST/PATCH tanasiga ham yeta olmaydi.

**Tanlangan variant:** `X-Branch-Id` sarlavhasi + server tomonidagi guard.

```
klient                          server
──────                          ──────
X-Branch-Id: 2        ─────►    BranchScopeGuard
(yoki ?branch_id=2)             │
                                ├─ ceiling  = resolveCallerBranchScope(user)
                                │              CEO → null (hammasi)
                                │              boshqa → [UserBranch ∪ mainBranch]
                                │              bo'sh → []  (HECH NARSA)
                                │
                                ├─ requested = X-Branch-Id ?? query.branch_id ?? query.branchId
                                │
                                └─ req.branchScope = resolveReportBranchIds(ceiling, requested)
```

Qoidalar (mavjud `common/finance/report-branch-scope.ts` dagi bilan **bir xil** — takrorlanmaydi, qayta ishlatiladi):

- `null` = filtr yo'q. Faqat CEO va u filial tanlamagan bo'lsa.
- `[]` = **hech narsa**, hech qachon "hammasi" emas. Fail-closed.
- Chaqiruvchining scope'i — **shift (ceiling)**; so'ralgan filial uning **ichida toraytiradi**. Shiftdan tashqaridagi so'rov `[]` beradi, chaqiruvchining butun scope'iga qaytmaydi.

Sarlavha **DTO validatsiyasidan o'tmaydi**, shuning uchun bitta ham endpoint buzilmaydi. Mavjud `?branch_id=` parametrlari **o'zgarishsiz ishlaydi** — sarlavha faqat parametr berilmaganda ishlaydigan zaxira.

**Klient hech qachon kengaytira olmaydi.** Xavfsizlik klient nima yuborishini eslab qolishiga bog'liq emas.

**Nega JWT da emas:** token 1 soat yashaydi. Xodimning filiali o'zgarsa, eski token bir soatgacha **kengroq** scope bilan ishlab turardi. Guard bazadan o'qiydi va natijani `request` ga yozadi (so'rov davomida memoizatsiya) — hisobot endpointlari uchun bu so'rovlar sonini **kamaytiradi**, chunki ular hozir baribir o'sha so'rovni qilishadi.

### 2.2 Scope qayerga qo'llanadi

Ikki oila, ikki naqsh:

**Ro'yxat/o'qish** — `branchScope` ni `where` predikatiga aylantirish. To'rtta shakl (uchtasi mavjud, biri yangi):

| Model oilasi | Helper | Predikat |
|---|---|---|
| Payment, Expense, Transaction, CashMovement, Group, Room | `branchIdWhere` | `branchId: { in: ids }` |
| Student | `studentBranchWhere` | `branches: { some: { branchId: { in: ids } } }` |
| User (xodim) | `userBranchWhere` | `OR: [mainBranch in, branches.some]` |
| Attendance, Enrollment, SalaryAccrual (**yangi**) | `groupBranchWhere` | `group: { branchId: { in: ids } }` |

**Id bo'yicha yozish** — yozuvning filialini chaqiruvchi bilan solishtirish: `assertCallerInBranch` (mavjud naqsh, Batch 7 dan).

### 2.3 Pul yozuvlari — filial **o'quvchidan**, klientdan emas

`CreatePaymentDto.branchId` **maslahat** bo'lib qoladi:

```
resolved = resolveStudentBranchId(student)     // fail-closed, hech qachon null
if (dto.branchId && dto.branchId !== resolved) → 400
```

Klient uni yuborishda davom etadi — endi u **moslik tekshiruvi**, manba emas. Bu D2 ("filiallararo pul yo'q") ni yozish paytida majburiy qiladi.

Xarajatda: `dto.branchId` mavjudligi + kompaniyaga tegishliligi + `assertCallerInBranch` tekshiriladi (create, update, delete).

### 2.4 Ikkilamchi modullarning tenancy'si

| Model | Qaror | Sabab |
|---|---|---|
| `LeadColumn` | `companyId` + **`branchId`** | ⚠️ **2026-08-05 da o'zgartirildi — pastdagi izohga qarang** |
| `LeadSection` | `companyId`, filial **ustundan** | Bo'limning filiali — ustuniniki. Uchta nusxa saqlash o'rniga bitta egasi |
| `LeadSource` | `companyId` | «Instagram», «Telegram» — kanal filialga bog'liq emas |
| `Lead` | `companyId` + `branchId` | Filial **bo'lim ustunidan** olinadi (mijoz yuborgan qiymat emas) |
| `Holiday` | `companyId` + `branchId?` | `branchId = null` — kompaniya bo'yicha bayram (odatiy holat). Non-null — bitta filialning yopilishi |
| `MockExamSection`, `MockExamParticipant` | `companyId` | |
| `MockExam` | `companyId` + `branchId` | Imtihon aniq bir joyda o'tadi |

`branchId` **nullable qo'shiladi → backfill → NOT NULL** (`Holiday` dan tashqari, u ataylab nullable qoladi).

#### ⚠️ Bekor qilingan qaror: «doska tuzilishi kompaniya darajasida» (2026-08-05)

Dastlab `LeadColumn` va `LeadSection` kompaniya darajasida qoldirilgan edi — asos:
«filialga ko'paytirish butun doskani ikki nusxa qiladi va hech nima demaydi».

**PROD ma'lumoti bu asosni yiqitdi.** Bo'limlar quyidagicha nomlangan:

```
Individual · Evro · A1 SPSH 15:00 Eldor · Kids · A1 DCHJ 10:00 Saida
B1 DCHJ 8:00 · A1 SPSH 13:00 neu · A1 DCHJ 17:00 neu · A1 Intensiv
```

Ya'ni daraja + kunlar + soat + **o'qituvchi ismi**. Bu abstrakt voronka bosqichi
emas — **shakllanayotgan guruh**. Eldorning Farg'onadagi 15:00 darsi Namanganda
hech nimani anglatmaydi, va umumiy doska ikkala filialni bir-birining jadvalini
o'qishga majbur qilardi. Mahsulot egasi 2026-08-05 da ustunlarni ham filialga
bog'lashni tanladi.

**Filial faqat `LeadColumn` da turadi.** Bo'limning filiali — ustuniniki, lidniki —
bo'limi ustuniniki. Uni uchala jadvalga denormalizatsiya qilish sinxron saqlanishi
kerak bo'lgan yana ikkita nusxa yaratardi va `moveSection` ularni ajratib yuborishi
mumkin edi. Bitta egasi, va bo'lim ustun almashtira oladigan yagona joyda —
`move` da — bir xil filial tekshiruvi.

**Kutilmagan foyda:** ommaviy forma bo'limga yo'naltiradi, ya'ni formadan kelgan lid
endi «filialsiz umumiy havza» ga emas, to'g'ridan-to'g'ri o'z filialiga tushadi.
`leadBranchWhere` ning `OR branchId IS NULL` tarmog'i shu sababli endi amalda ishga
tushmaydi — u faqat ma'lumot nuqsoni yuz bersa, qatorni **butunlay yashirish o'rniga
ko'rsatish** uchun zaxira bo'lib qoladi.

**Har bir filialga «Yangi Lidlar» tizim ustuni majburiy** (`systemKey='NEW'`): u
lidning voronka bosqichini tiklaydi, va ustunsiz filialda bo'lim, bo'limsiz lid
bo'lmaydi — doska boshi berk ko'cha bo'lardi. Migratsiya mavjud filiallarga,
`BranchesService.create` esa yangilariga yozadi (kassa hisoblari bilan bir xil
tranzaksiyada).

### 2.5 Moliyaviy FK va NOT NULL — alohida, darvozali qadam

`Payment.branchId` / `Transaction.branchId` ni NOT NULL qilish PROD ma'lumotiga bog'liq. Batch 2 da `Transaction` backfill qilingan (8 966 → filial 1), lekin `CashMovement` ning eski qatorlari **ataylab** null qoldirilgan (filial-1 tomoni qoplama o'tkazma orqali ko'rsatilgan — belgilash ikki karra sanashga olib kelardi).

Shu sababli:
1. **FK qo'shiladi** (nullable holicha) — mavjud bo'lmagan filial raqamini yozib bo'lmaydi.
2. **NOT NULL alohida migratsiya** bo'ladi va faqat pre-flight skript PRODda 0 ta null ko'rsatgandan keyin qo'llanadi. Skript yoziladi, migratsiya **ko'r-ko'rona qo'llanmaydi**.

### 2.6 Filial ochish (onboarding)

`BranchesService.create` bitta tranzaksiyada:
- `startOfWorkingDay` / `endOfWorkingDay` ni **yozadi** (hozir jimgina tashlanadi);
- CASH + BANK kassalarini yaratadi (`backfill-cash-accounts.ts` bilan bir xil shakl, idempotent);
- `nextId` ni `companyId` bo'yicha va **tranzaksiya ichida** hisoblaydi.

`GET /branches/:id/readiness` — tekshiruv ro'yxati: kassa (CASH+BANK), ≥1 xona, ≥1 kurs, ish vaqti, ≥1 Administrator, stavkasiz ustoz yo'qligi. Yangi filial qo'lda baza tuzatishisiz ishlashi kerak — yoki **aniq, bajariladigan xato** berishi kerak.

### 2.7 Klient

- `api.ts` interceptor'i `X-Branch-Id` yuboradi (`"all"` bo'lsa yubormaydi).
- `use-branch-switcher.ts` ga **«Barcha filiallar»** (`id: null`) varianti; CEO uchun **default**. Non-CEO da bu variant yo'q.
- `localStorage` dagi tanlov ruxsat etilgan ro'yxatga solishtiriladi; mos kelmasa tashlanadi.
- `GET /branches` **filialga kesiladi** — switcher endi klient filtriga emas, serverga tayanadi.

---

## 3. Nima o'zgarmaydi

- Yozish tomonidagi mavjud invariantlar (D5/D6, guruh filiali qotgan, ledger filial tashiydi) — tegilmaydi.
- `report-branch-scope.ts` mantiqi — qayta ishlatiladi, dublikat qilinmaydi.
- Batch 0–5 dagi backfill natijalari — qayta yurgizilmaydi.
- Oylik modeli, top-up, foyda kartasi — tegilmaydi.

---

## 4. Xavflar

| Xavf | Yumshatish |
|---|---|
| Global guard barcha endpointlarga ta'sir qiladi | Guard faqat `req.branchScope` ni **hisoblab qo'yadi**; hech narsani bloklamaydi. Har bir servis uni ongli ravishda qo'llaydi. Qo'llamagan endpoint bugungidek ishlayveradi |
| CEO default'i «Barcha filiallar» ga o'zgarishi mavjud xulqni o'zgartiradi | Ataylab (CEO qarori). CEO hozir doim `data[0]` = Farg'ona ko'rardi — bu ham noto'g'ri edi, shunchaki jim edi |
| `Lead`/`MockExam`/`Holiday` migratsiyalari mavjud ma'lumotga tegadi | Har biri: nullable qo'shish → backfill skripti (`--dry-run` bilan) → NOT NULL. Zaxira JSON yoziladi |
| Administrator ni filialga cheklash ish oqimini buzishi mumkin | `scoped = !CEO && !Administrator` naqshi olib tashlanadi. Ko'p filialli Administrator `UserBranch` ga bir nechta qator qo'yish orqali qo'llab-quvvatlanadi |

---

## 5. Tekshirish

Har bir qadamdan keyin `cd server && npm test` (asos: 191 suite / 2418 test, hammasi PASS) va `cd client && npm run build`.

Yangi testlar majburiy:
- filialga bog'langan foydalanuvchi begona filial students/groups/payments/reports ni **ola olmaydi**;
- `branch_id` shiftdan tashqarida bo'lsa **bo'sh** natija, kompaniya bo'yicha emas;
- to'lov filiali o'quvchi filialiga mos kelmasa **400**;
- tranzaksiya filiali to'lov filiali bilan **bir xil**;
- bo'sh filial (Namangan) **bo'sh holat** qaytaradi, Farg'ona ma'lumotini emas;
- CEO ruxsat etilgan barcha-filial ko'rinishini oladi;
- yangi filial yaratish kassa + ish vaqtini **hosil qiladi**;
- `Σ(filiallar) == jami` (mavjud `audit-branch-scope-sum.ts` invarianti).
