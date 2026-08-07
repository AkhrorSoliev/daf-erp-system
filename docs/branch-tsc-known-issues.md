# `tsc --noEmit` — ma'lum va qamrovdan tashqari xatolar

**Sana:** 2026-08-05 · **Tekshiruvchi:** `npx ts-node scripts/check-tsc-scope.ts`

`tsconfig.build.json` `**/*spec.ts` va `scripts/**/*` ni exclude qiladi, shuning uchun
`nest build` bu xatolardan mustaqil. Bu ro'yxat **filial ishining tip qarzini ko'rinadigan
va chegaralangan** holda ushlab turish uchun.

## Qoida

| Toifa | Ruxsat |
|---|---|
| **Production manba** (`src/**`, `*.spec.ts` emas) | **Hech qachon.** Ro'yxatga qo'shib ham bo'lmaydi — skript rad etadi |
| Boshqa fayl | Faqat quyida nomlangan bo'lsa |

Ro'yxatning **qisqarishi bepul**; **o'sishi** shu faylni tahrirlashni talab qiladi va
PR ko'rib chiqishida ko'rinadi.

## D toifa — filialga aloqasi yo'q (oldindan mavjud)

Bu fayllar filial ishidan oldin ham xato berardi. Ular **faqat raqam uchun
o'zgartirilmaydi** — aloqasiz faylga tegish alohida ishning predmeti.

- `server/src/attendance/attendance.service.spec.ts` — `SaveAttendanceDto` shakli + `possibly undefined`
- `server/src/payment-gateways/click/click.service.spec.ts` — `sign_string` fixture tipi
- `server/src/lesson-reschedules/lesson-reschedules.service.spec.ts`
- `server/src/telegram-groups/telegram-group-report-menu.service.spec.ts`
- `server/src/salary/salary-accrual.service.spec.ts`
- `server/src/salary/salary-calculation.service.spec.ts`
- `server/src/salary/salary-monthly-staff.service.spec.ts`

## B toifa — filial ishidan, 1-bosqichdan oldin — **YOPILDI (2026-08-05)**

Oldingi batch `branchIds` ni majburiy qilgan, spec'lar esa yangilanmagan. Hammasi
tuzatildi: hisobot spec'lari endi so'rov obyektiga `branchIds: null` uzatadi
(«barcha filiallar» — bu `undefined` jimgina aylanadigan qiymatning aynan o'zi,
ya'ni birorta ham tasdiq o'zgarmadi).

Ro'yxat **bo'sh**.

## C toifa — 2-bosqich (defaultlar olib tashlangandan keyin) — **YOPILDI (2026-08-05)**

Scope majburiy parametr bo'lgach, har bir xato scope uzatmaydigan chaqiruvchini
ko'rsatardi. Hammasi tuzatildi.

Bu **kosmetik emas edi**. Jest tip tekshirmaydi, ya'ni bu spec'lar ishlayverardi —
scope o'rniga `undefined` uzatib, `branchIdWhere` uni `{}` ga, ya'ni **FILTRSIZ**
holga keltirardi. Har biri scope'li chaqiruvni tekshiryapman deb, aslida tasodifan
scope'siz chaqiruvning xulqini tasdiqlab turgan edi.

Ikkita holat qo'lda ko'rib chiqildi va shuning uchun avtomatlashtirilmadi:
- **Bir nechta argument yetishmaganda** — `getSectionLeads('sec-1')` ga
  `(sectionId, companyId, scope)` kerak. `companyId` ni `null` bilan to'ldirish
  mavjud bo'lmagan kompaniya bo'yicha filtrlashga olib kelardi; u yetishmasa, bu
  buzuq test, defaultlanadigan scope emas.
- **Argument obyekt literali bo'lmaganda** — `reports-financial` da u umumiy
  `period` o'zgaruvchisi. Uch fixture yigirmata chaqiruvni qoplaydi.

Skript: `server/scripts/fix-spec-branch-scope-args.ts` (faqat bitta argument
yetishmagan holatni avtomatik tuzatadi; qolganini odamga ko'rsatadi).

Ro'yxat **bo'sh**.

## E toifa — `scripts/`

Bir martalik PROD diagnostika va backfill skriptlari. `tsconfig.build.json` dan
chiqarilgan; egaligi loyiha egasida, **tegilmaydi**.

- `server/scripts/audit-branch-batch0.ts`
- `server/scripts/audit-branch-isolation.ts`
- `server/scripts/audit-expense-cash-branch.ts`
- `server/scripts/backfill-cash-accounts.ts`
- `server/scripts/calculate-may.ts`
- `server/scripts/close-branchless-cash-accounts.ts`
- `server/scripts/generate-financial-excel.ts`
- `server/scripts/june-income-bases.ts`
- `server/scripts/may-profit.ts`
- `server/scripts/reopen-group-29.ts`
- `server/scripts/send-daily-report-now.ts`
- `server/scripts/verify-monthly-net-profit.ts`

## E toifa — `e90edfe` dan keyin eskirgan skriptlar (2026-08-06 da aniqlandi)

`e90edfe` («Split the monthly salary report by who funded each lesson») oylik
hisobot `totals` tuzilishini o'zgartirdi: `gap` o'rniga `centerFunded` /
`centerAdvanced` / `centerStillFronted` / `centerRecovered` keldi. Quyidagi bir
martalik skriptlar hali eski `totals.gap` ni o'qiydi.

Ular ilgari qorovulga ko'rinmasdi, chunki `tsc` inkremental keshi o'zgarmagan
fayllarni qayta tekshirmagan; `prisma generate` keshni bekor qilganda chiqdi.
**Bu 2026-08-06 dagi ish natijasi emas** — nuqson `e90edfe` dan beri mavjud va
faqat endi ko'rindi.

Tegilmaydi: bular allaqachon yurgizilgan bir martalik diagnostikalar, egaligi
loyiha egasida. Agar qaytadan kerak bo'lsa, `totals.gap` ni yangi maydonlarga
almashtirish kifoya.

- `server/scripts/audit-july-clean.ts`
- `server/scripts/audit-payment-destination.ts`
- `server/scripts/finalize-june-salary-display.ts`
- `server/scripts/probe-june-salary-card.ts`

Loyiha egasining hali commit qilinmagan, shu sabab bilan buzuq skriptlari
(repozitoriyada yo'q, lekin diskda bor):

- `server/scripts/audit-july-teacher-salaries.ts`
- `server/scripts/diag-gap-vs-collection.ts`
- `server/scripts/july-teacher-salary-report.ts`

## E toifa — qo'shimcha (Faza 7 dan keyin)

`@default(1001)` olib tashlangandan keyin `companyId` Prisma'da **majburiy** bo'ldi.
`src/` dagi 8 ta yozish yo'li va `prisma/seed.ts` tuzatildi; quyidagi bir martalik
skript esa **tegilmadi** (allaqachon yurgizilgan, egaligi loyiha egasida):

- `server/scripts/backfill-leads-board.ts`

---

# Route siyosati manifesti (Faza 2b, 2026-08-06)

`tsc` ning ushlaydigan narsasi — **chaqiruv scope'ni unutgani**. Ushlamaydigani —
**route umuman chaqirmagani**: to'g'ridan-to'g'ri Prisma so'rovi yozadigan yoki
kompaniya darajasidagi yordamchida to'xtaydigan yangi kontroller toza
kompilyatsiya bo'ladi va hamma filialga xizmat qiladi.

`src/common/auth/branch-route-policy.ts` shuni yopadi. `scripts/route-inventory.ts`
TypeScript AST orqali manbadagi **hamma** route'ni topadi (regex emas — bitta
o'tkazib yuborilgan route qamrovni «to'liq» deb ko'rsatardi, bu esa tekshiruvsiz
holatdan yomonroq), `branch-route-policy.spec.ts` esa manifestni haqiqat bilan
solishtiradi.

## Hozirgi holat

| | Soni | Qanday aniqlanadi |
|---|---|---|
| `BRANCH_SCOPED_BY_HEADER` | **95** | Dalil: handler `@BranchScope()` oladi |
| Qo'lda toifalangan | **157** | `TRUSTED_GATEWAY` · `PUBLIC` · `SELF` · `BY_ENTITY` · `BY_PAYROLL` · `COMPANY_WIDE` |
| `UNREVIEWED` | **114** | Hali o'ylanmagan — cheklangan, faqat kamayadi |
| **Jami** | **365** | |

## Nega qolgani «UNREVIEWED» deb qoldirildi

Bir o'tirishda 200 dan ortiq route'ni toifalash raqamni nolga tushirardi, lekin hech kim
o'ylab ko'rmagan ishonchli yorliqlar hosil qilardi. Noto'g'ri `COMPANY_WIDE` ni
o'ylangan `COMPANY_WIDE` dan ajratib bo'lmaydi — va u aynan o'zini ushlashi kerak
bo'lgan tekshiruvni o'chiradi. Ochiq tan olingan qarz yaxshiroq.

## Mexanizm

`UNREVIEWED_BUDGET` — **literal raqam**, `UNREVIEWED_ROUTES.length` emas. Aks holda
tekshiruv o'z-o'ziga havola bo'lardi: ro'yxat cheksiz o'sib, tasdiq har safar
o'taverardi. Ya'ni:

- yangi endpoint manifestga qo'shilmasa → test yiqiladi;
- yangi endpoint'ni `UNREVIEWED` ga «parking» qilib bo'lmaydi (budjet qotgan) →
  yozilayotgan paytda toifalanadi, ya'ni u nima qilishini biladigan yagona onda;
- o'chirilgan route manifestda qolsa → test yiqiladi;
- `@Public()` route ochiq siyosatlardan birida bo'lmasa → test yiqiladi.

Qamrovni kamaytirish oddiy ish: route'ni siyosat blokiga ko'chiring va
`UNREVIEWED_BUDGET` ni yangi uzunlikka tushiring.

**Bu uch qatlamdan ikkinchisi va ataylab eng zaifi:** uning vazifasi — hech narsa
**unutilmasligi**, hamma narsa **to'g'ri** bo'lishi emas. To'g'riligini faqat
salbiy integratsiya testlari isbotlaydi (`*.branch-isolation.spec.ts`).

## Audit natijasi (2026-08-06)

Pul va o'quvchi ma'lumotiga tegadigan 35 ta toifalanmagan route kodini o'qib
tekshirildi. **Uchta haqiqiy nuqson topildi** — hammasi tuzatildi:

| Nuqson | Nima bo'lardi |
|---|---|
| `POST /cash-accounts` chaqiruvchini tekshirmasdi | Farg'ona direktori Namangan kitoblariga kassa ocha olardi. Ishlata olmasdi (id bo'yicha amallar himoyalangan), lekin `resolveAccountId` filial+tur bo'yicha tanlagani uchun avtomatik qaytarish yoki oylik o'sha kassaga tushishi mumkin edi |
| `GET /refunds` filial scope'i **umuman yo'q** | Namangan direktori Farg'onaning **barcha** qaytarishlarini ko'rardi — o'quvchi ismi, summa, guruh |
| `payment-promises` (3 ta route) o'quvchi filialini tekshirmasdi | Id nomlash yetarli edi: begona filial qarzdorining va'da tarixini o'qish, unga yangi va'da yozish yoki bekor qilish |

Qolgan 32 tasi **to'g'ri himoyalangan** ekan — kassa hisoblari
(`resolveCallerReportBranchIds` + `assertCallerInBranch`), xarajatlar
(`assertBranchWritable` ikkala yo'nalishda), qarzdorlar, qarz kechirishlar.
Ular endi manifestda o'z mexanizmi bilan yozilgan, ya'ni keyingi o'quvchi
qaytadan tekshirmaydi.

## Audit 2-bosqich — dars route'lari (2026-08-06)

Davomatning o'zi **himoyalangan** edi (`verifyGroupAccess`, 9 ta route). Lekin
**aynan o'sha darslarni o'zgartiradigan uchta qo'shni modul** faqat `companyId`
ni tekshirardi:

| Modul | Nima qila olardi |
|---|---|
| `lesson-cancellations` | Boshqa filial darsini bekor qilish. Bu **billing'ni qaytaradi**: davomat EXCUSED ga aylanadi, `LESSON_CONSUMPTION` bekor qilinadi, prepaid darslar tiklanadi, ustozning `SalaryAccrual` i qaytariladi |
| `lesson-reschedules` | Boshqa filial darsining sanasi, xonasi va o'qituvchisini o'zgartirish |
| `planned-absences` | Boshqa filial guruhida o'quvchini oldindan belgilash (davomat formasini oldindan to'ldiradi) |

Sabab: qoida `attendance.controller.ts` ichida **xususiy** edi. Endi
`common/auth/group-branch-scope.ts` da — `assertCallerMayTouchGroup`, va
to'rtala modul ham shundan o'qiydi.

**Qoidaning ikki yarmi ataylab boshqacha:**
- **Sof o'qituvchi** — guruhga biriktirilganligi bo'yicha. Bu **kuchliroq** test:
  filialda bo'lish boshqa o'qituvchining jurnaliga huquq bermaydi.
- **Qolganlar** (Admin, BD, CEO) — **filial** bo'yicha. Admin o'z filialining
  hamma guruhi bilan ishlaydi, guruhma-guruh biriktirish uni o'z ishidan
  to'sib qo'yardi.

Ikkalasini «soddalashtirish» oson, shuning uchun `group-branch-scope.spec.ts`
har ikkalasini alohida qotiradi (jumladan: o'qituvchi **va** BD roli birga
bo'lgan holat — u sof o'qituvchi emas, ya'ni filial yo'lidan ketadi).

## Audit 3-bosqich — o'quvchi va guruh yozish yo'llari (2026-08-06)

Sakkizta id bo'yicha yozish yo'li **faqat `companyId`** ni tekshirardi:

| Route | Boshqa filialda nima qila olardi |
|---|---|
| `PATCH /students/:id` | O'quvchini tahrirlash **va uni o'z filialiga ko'chirish** (`branchIds` tanada) — balansi, ro'yxatlari va ustozining kelgusi accrual'lari bilan birga |
| `PATCH /students/:id/status` | EXPELLED/FROZEN **kaskad qiladi**: o'quvchining ro'yxatlari yopiladi, darslari va ustoz hisobi to'xtaydi |
| `DELETE /students/:id`, `POST /students` | Arxivlash / begona filialda yaratish |
| `POST /groups` | Guruh **umrbod bog'lanadigan** filialni tanlash |
| `PATCH /groups/:id`, `/status`, `DELETE` | Nomini, xonasini, o'qituvchisini o'zgartirish; CANCELLED **hamma ro'yxatni yopadi** |

`assertSingleValidBranch` allaqachon bor edi va **filial tekshiruviga o'xshaydi**
— bu nuqson omon qolganining bir sababi. Lekin u **maqsad filial haqiqiymi**
deb so'raydi, **chaqiruvchi haqlimi** deb emas.

Yordamchi: `assertCallerMayTouchStudent` — `assertCallerMayWriteForStudent` bilan
bitta amalga oshirish, ikkita nom. Xabar boshqacha ataylab: o'quvchini
chetlatish «pul yozish» emas, va shunday deb aytilgan admin bo'lmagan to'lovni
qidiradi.

## Audit 4-bosqich — o'quvchi profili, ro'yxatga olish, guruh ro'yxati (2026-08-06)

14 ta route. Uchta naqsh:

### 1. Ro'yxat qamrab olingan, u ochadigan sahifa yo'q

`findAll`/`findById` `ReportBranchIds` oladi. Orqasidagi **har bir tab**
`companyId` bilan javob berardi: balans, ledger xulosasi, darslar tarixi, SMS
jurnali, status izi. O'quvchi id'lari ketma-ket besh xonali son.

O'qishlar **scope filtri emas, chaqiruvchi qorovuli** oldi. Bitta yozuv haqidagi
so'rovga scope predikati bo'sh tab qaytaradi — bu «bu o'quvchida to'lov yo'q»
deb o'qiladi, ya'ni haqiqiy javob qiyofasidagi noto'g'ri javob.

### 2. Yo'ldagi `:id` e'tiborsiz qoldirilgan

Uchta route enrollment id bilan manzillanadi va `_studentId` ni **hech qachon
o'qimagan**. Yo'l parametrini tekshirish tuzoq bo'lardi: chaqiruvchi **o'zining**
o'quvchisi id'sini begona filial enrollment id'si bilan juftlab, tekshiruvdan
o'tib ketardi. Har biri enrollment'ning **o'z** o'quvchisiga bog'landi.

`write-off-cycle-debt` DEBT_WRITE_OFF yozadi — **pul**. Oldingi pul auditi
`/payments`, `/refunds`, `/transactions`, `/withdrawals` yo'llari bo'yicha
yurgan va bunga yetib bormagan. **Pul URL aytgan joyda emas.**

### 3. `@Roles` egalikni isbotlamaydi

`GET /groups/:id/students` telefon va balansni qaytaradi, `@Roles` ichida
Teacher bor va **yagona tekshiruv shu edi** — ya'ni istalgan o'qituvchi
kompaniyaning istalgan guruhini id bo'yicha o'qiy olardi.

### Qorovulning o'zi ham tuzatildi

`assertCallerMayTouchStudent` `common/auth/student-branch-scope.ts` ga ko'chdi
(guruh yordamchisi bilan simmetrik). Pul versiyasidan **uchta ataylab farq**:

| | Pul (`assertCallerMayWriteForStudent`) | Pul emas |
|---|---|---|
| Filialsiz o'quvchi | xom `Error` → **500** (atributsiz ledger qatori — favqulodda holat) | **403** rad etish |
| Mavjudlik | chaqiruvchilar o'zi 404 qiladi | oldin tekshiriladi → **404** |
| Xabar | «pul yozish huquqi» | «u bilan ishlash huquqi» |

Sababi: shunchaki ochilgan sahifada 500 noto'g'ri. Prod tekshirildi —
**824 tirik o'quvchi, 0 tasi filialsiz**, ya'ni bu chiziq allaqachon turibdi.

## Audit 5-bosqich — izohlar (2026-08-06)

`Comment.entityType` sxemada oddiy `String`, DTO esa **istalgan satrni**
qabul qilardi. Va **hech narsa tekshirilmasdi**: obyekt bormi, shu kompaniyanikimi,
shu chaqiruvchining filialidami — hech biri.

`GET /comments?entityType=Student&entityId=<istalgan id>` → o'sha o'quvchi haqida
xodimlar yozgan **barcha izoh**. PRODda 748 ta izoh: Student 487, Lead 232,
Group 29.

**Yechim: beshinchi filial qoidasi o'ylab topilmadi.** Har bir tur o'z
yozuvining qorovuliga uzatiladi (`assertCallerMayTouchStudent` /
`...Group` / `...User` / `assertCallerInBranch`). DTO endi **yopiq ro'yxatga**
tekshiradi — noma'lum tur endi thread yaratmaydi, 400 beradi.

**Lead — ataylab istisno.** `branchId = null` «hali biriktirilmagan» degani va
`leadBranchWhere` uni har filial ishlaydigan umumiy havza deb qaraydi. Bu yerda
rad etsak, **yangi so'rov haqidagi birinchi izohni yozib bo'lmasdi**. Arxivlangan
(LOST) lidga ham `deletedAt` filtri qo'yilmadi — arxiv sahifasining butun mazmuni
o'sha «nega yo'qotdik» izohlari.

`PATCH` / `DELETE /comments/:id` **muallif-yoki-CEO** — bu filialdan **qattiqroq**
(direktor o'z filialidagi hamkasbining izohini ham tahrirlay olmaydi), shuning
uchun filial tekshiruvi hech narsa qo'shmaydi.

### Yon topilma: `assigneeIds` umuman tekshirilmasdi

Har qanday butun son real `User.id` bo'lsa mas'ul bo'lib qolardi — **boshqa
kompaniyaniki ham**. Endi kompaniya + `deletedAt` tekshiriladi.

**Filial ataylab tekshirilmadi:** «mas'ul obyekt filialida bo'lsin» qoidasi
CEO'ga topshiriq berishni bloklardi (u dizayn bo'yicha filialsiz). PRODda 1 ta
topshiriq va 0 ta filiallararo biriktirma — ya'ni tuzatadigan narsa yo'q va
qaysi qoida to'g'riligiga dalil ham yo'q.

## Regressiya: PR #413 arxivlangan o'quvchilarni yopib qo'ygan edi

`assertCallerMayTouchStudent` mavjudlik tekshiruviga `deletedAt: null` qo'shgan
edim. PRODda **23 ta arxivlangan o'quvchi** bor va ularning profili ochiladi
(`findById` bu filtrni qo'ymaydi). Natijada ularning tablari 404 bergan.

Filtr olib tashlandi. Qorovul **filial savolini qo'shishi** kerak, boshqa
savolga jimgina javob berishi emas — orqasidagi o'qishlar bu masalada
o'zaro ham kelishmaydi (`getStatusHistory` arxivni ko'rsatadi, boshqa uchtasi
o'zi 404 qiladi). Regressiya testi qo'shildi.

## Audit 6-bosqich — o'qituvchilar, qidiruv, aloqa markazi (2026-08-06)

### 1. Bitta yozuvga ikkita eshik, biri qulflanmagan

O'qituvchi — bu `User`. `PATCH /users/:id` obyekt darajasidagi auditda
filialga bog'langan edi. Lekin **`/teachers/:id` xuddi shu qatorlarni
tahrirlaydi** va unga tegilmagan: faqat `companyId`.

`UpdateTeacherDto` **`password` va `login`** qabul qiladi. Ya'ni bir filial
direktori **ikkinchi filial o'qituvchisining parolini o'rnatib, uning nomidan
tizimga kira olardi**. PRODda 15 o'qituvchi: **10 Farg'ona, 5 Namangan** —
qulflanmagan eshik haqiqiy joyga olib borardi.

Qoida qayta yozilmadi: `assertCallerMayTouchTeacher` → o'sha
`assertCallerMayTouchUser`. Har bir qorovul metodning **o'z mavjudlik
tekshiruvidan keyin** turadi, shuning uchun eski id hamon 404 beradi.

### 2. Filial qoidasining uchta yashirin nusxasi

Qidiruv, aloqa markazi va qo'ng'iroqlar jurnali **filialga bog'langan edi** —
lekin har biri o'z nusxasi bilan, va har bir nusxa kanonik qoidadan farq qilardi:

| | Nuqson |
|---|---|
| Qidiruv | faqat `UserBranch` ni o'qirdi, `mainBranch` ni **e'tiborsiz qoldirardi** → faqat o'sha yerda yozilgan xodim uchun qidiruv **jimgina bo'sh** bo'lardi (latent: PRODdagi 20 ta CEO bo'lmagan xodimning hammasida `UserBranch` bor) |
| Uchalasi ham | **filial almashtirgichni** umuman ko'rmasdi — CEO Namanganni tanlasa ham ikkala filialni ko'rardi |

Ikkinchisi — **shu auditni boshlagan shikoyatning o'zi**, hech kim tekshirmagan
uchta sahifada.

Endi uchalasi `@BranchScope()` ning **yakuniy qiymatini** oladi va yashirin
resolverlar o'chirildi. Dekoratorning o'z hujjatida yozilgan: «servis ichida
scope'ni qayta hisoblamang — bir so'rovda ikkita scope bo'lgani uchun hisobot
muqovasida bir filial, jamida boshqasi chiqqan edi».

Manifest bu route'larni **e'lon qilmaydi**: `@BranchScope()` olgan handler
o'zini isbotlaydi, uni qayta e'lon qilish — hal bo'lgan faktga ikkinchi,
zaifroq da'vo qo'shish (manifest testi buni ushladi).

### 3. `POST /call-logs`

Qatorni **o'quvchi filialiga** yozardi — bu to'g'ri — lekin chaqiruvchi shu
o'quvchi bilan ishlay oladimi, deb so'ramasdi. `WILL_PAY` natijasi esa
`PaymentPromise` ochadi va **begona filialning qarzdorlar oqimiga** tushadi.

## Audit 7-bosqich — audit jurnali va xodim yozishlari (2026-08-07)

### 1. Audit jurnali to'liq ochiq edi

`GET /entity-history/:entityType/:entityId` — ikkala parametr ham URL'dan,
tekshiruv esa faqat `companyId`. PRODda **17 727 qator, 23 tur**, va yuk —
`oldValues`/`newValues`, ya'ni **o'zgargan har bir maydonning oldingi va
keyingi qiymati**.

| Tur | Qatorlar |
|---|---|
| Student | 9 031 |
| Group | 2 367 |
| GroupAttendance | 1 763 |
| Enrollment | 1 471 |
| Payment | 1 344 |
| Lead | 979 |

Parol o'zgarishi ham shu yerda alohida yozuv sifatida chiqadi.

**Yechim:** audit jurnali — yozuvlarning **ko'rinishi**, shuning uchun o'sha
yozuvlar qanday qo'riqlansa, shunday qo'riqlanadi. 24-chi filial qoidasi
o'ylab topilmadi.

**Null `branchId` uch xil ma'no bildiradi va ularni tenglashtirish ikki
tomonga ham xato bo'lardi:**

| Jadval | null nima degani | Qaror |
|---|---|---|
| Lead, MockExam, TelegramGroup, Course, Holiday | **biriktirilmagan havza** — har filial ishlaydi | ruxsat |
| Payment | **tarixiy, atributsiz qator**; `branchIdWhere` uni filial o'qishlaridan chiqaradi, invariant esa `Σ(filiallar) + taqsimlanmagan == kompaniya` | faqat **hamma filialni qamragan** chaqiruvchi |
| Expense, Room, LeadColumn | NOT NULL | savol yo'q |

Filial o'lchovi umuman yo'q beshta tur (`CustomForm`, `LeadSource`,
`MockExamSection`, `StudentExitReason`, `DepartureReason`) **nomma-nom**
sanaladi — «bu nima ekanini bilmayman» va «bunda filial yo'q» **bir xil javob
bermasligi kerak**. Tanilmagan tur rad etiladi, va test PRODdagi 23 turning
hammasi qamralganini tekshiradi.

### 2. `POST /users` — yana o'sha tuzoq

`assertRoleAndBranchRules` filiallarni **sanaydi** va kompaniyadan tashqaridagini
rad etadi. Bu **filial haqiqiymi** degan savol — `assertSingleValidBranch`
o'quvchilarda qo'ygan tuzoqning aynan o'zi.

Foydalanuvchi yaratish — bu **kirish huquqini berish**. Ya'ni Farg'ona direktori
**Namangan Branch Director'ini**, o'zi tanlagan parol bilan, ko'ra olmaydigan
filialda yarata olardi.

Avtorizatsiya **so'rov shakli tekshirilgandan keyin** turadi: `mainBranch`
`branchIds` ichida emasligi har kimda ham xato, va adminni «huquqingiz yo'q»
deb chalg'itmaslik kerak — uning qo'lida aslida xato yozuv bor.

### 3. `DELETE /users/:id`

Faqat `companyId`. Yonidagi `PATCH /users/:id` obyekt darajasidagi auditdan
beri qulflangan — arxivlash esa yo'q. Arxivlangan xodim akkauntini yo'qotadi.

### Qamrovdan tashqarida qoldirilgan, ataylab

`POST /users` da **rol eskalatsiyasi** faqat CEO uchun cheklangan
(`CEO_ROLE_ID`). Ya'ni Administrator **o'z filialida** Branch Director yarata
oladi. Bu haqiqiy muammo, lekin **filial auditining mavzusi emas** — kodda
allaqachon namuna bor (`GRANTABLE_ROLE_IDS`, telegram xodim havolalari uchun),
shuni bu yerga ham qo'llash alohida qaror.
