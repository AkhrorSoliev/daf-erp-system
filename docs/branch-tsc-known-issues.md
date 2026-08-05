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
| Qo'lda toifalangan | **63** | `TRUSTED_GATEWAY` · `PUBLIC` · `SELF` · `BY_ENTITY` · `BY_PAYROLL` · `COMPANY_WIDE` |
| `UNREVIEWED` | **207** | Hali o'ylanmagan — cheklangan, faqat kamayadi |
| **Jami** | **365** | |

## Nega 207 ta «UNREVIEWED» deb qoldirildi

Bir o'tirishda 207 ta route'ni toifalash raqamni nolga tushirardi, lekin hech kim
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
