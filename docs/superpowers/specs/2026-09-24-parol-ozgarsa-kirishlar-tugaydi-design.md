# Parol o'zgarsa, boshqa kirishlar tugaydi

**Sana:** 2026-09-24
**Holat:** Dizayn ma'qullangan (CEO, 2026-09-24)
**Qamrov:** bitta PR (server + client) va ADR-0030

## Nima uchun

Parol o'zgarganda boshqa qurilmalardagi kirishlar tugamaydi. Kod o'qildi,
dalillar:

1. **Chipta almashtirish cheksiz.** `AuthService.refresh`
   ([auth.service.ts:322](../../../server/src/auth/auth.service.ts)) imzoni,
   chipta turini va hisob holatini tekshiradi, keyin yangi 24 soatlik yangilash
   chiptasini beradi. Parol haqida hech narsa so'ramaydi. Saytni kuniga bir
   marta ochib turgan odamning kirishi cheksiz davom etadi.
2. **Parol yoziladigan 7 yo'lning hammasi faqat xeshni yozadi**, boshqa
   hech narsa qilmaydi:

   | # | Yo'l | Joy |
   |---|---|---|
   | 1 | Xodim o'z parolini o'zgartiradi (`PATCH /users/password`) | `UsersService.changePassword` |
   | 2 | Rahbar xodimga parol qo'yadi (`PATCH /users/:id`); rollari olib tashlansa parol `null` bo'ladi | `UsersService.updateUser` |
   | 3 | Rahbar ustozga parol qo'yadi (`PATCH /teachers/:id`) | `TeachersService.update` |
   | 4 | O'quvchi o'z parolini o'zgartiradi (`PATCH /student-portal/password`) | `StudentPortalWriteService.changePassword` |
   | 5 | Admin o'quvchiga parol qo'yadi (`PATCH /students/:id`) | `StudentsWriteService.update` |
   | 6 | SMS orqali tiklash, hamma rollar | `PortalPasswordResetService.applyNewPassword` |
   | 7 | Telegram bot orqali tiklash | `resetPassword` (`telegram/flows/password-reset-flow.ts`) |

3. **`User` jadvalida parol qachon o'zgargani ham, versiya ham yo'q.**
4. **Yangilash chiptasi kirish chiptasi o'rnida ham ishlaydi.** `JwtStrategy`
   ([jwt.strategy.ts:23](../../../server/src/auth/strategies/jwt.strategy.ts))
   `type` ni tekshirmaydi, ya'ni rol talab qilmaydigan route'larda yangilash
   chiptasi ham qabul qilinadi.
   Shu sababli tekshiruvni faqat `refresh` ga qo'yish yetmaydi.
5. **Brauzer tomoni.** Yangilash chiptasi `js-cookie` bilan oddiy cookie'ga
   yoziladi ([use-auth.ts:52](../../../client/src/hooks/use-auth.ts)), uni
   sahifadagi har qanday skript o'qiy oladi. "Chiqish" cookie'ni faqat shu
   brauzerdan o'chiradi, serverga xabar bermaydi.
6. **Jurnal.** 7 yo'ldan faqat 3 tasi (4, 6, 7) `EntityHistory` ga yozadi.

**Prod (2026-09-24, faqat o'qildi):** parol bilan kira oladigan 31 xodim va
1048 o'quvchi bor. Jurnalda oyiga 28–36 ta parol o'zgarishi bor (sentyabr:
19 SMS, 8 Telegram, 1 o'quvchining o'zi). Xodim yozuvi bitta ham yo'q, chunki
xodim yo'llari jurnalga yozmaydi.

## Boshqaruvchi qarorlar

| Qaror | Tanlov | Sabab |
|---|---|---|
| Mexanizm | **Kirish raqami**: `User.sessionVersion`, har chiptada `sv` | Parolning qaysi yo'l bilan o'zgarganidan qat'i nazar hamma eski chiptani to'xtatadi; soniya aniqligi muammosi yo'q |
| Tezlik | **Darhol**: keyingi so'rovda (Redis); Redis ishlamasa ko'pi bilan 1 soat | CEO tanlovi (A). ADR-0028 bloklash uchun ham 1 soatni qabul qilmagan |
| Parolni o'zgartirgan qurilma | **Kirgan holicha qoladi**, javobda yangi chipta keladi | CEO tanlovi |
| "Boshqa qurilmalardan chiqish" | **Xodim profilida va o'quvchi portalida** bo'ladi | CEO tanlovi. Parolni o'zgartirmasdan begona kirishni tugatish mumkin bo'ladi |
| Eski chiptalar (deploydan oldingi) | `sv` yo'q bo'lsa **0** deb olinadi | Hamma hisob 0 dan boshlaydi, shuning uchun deploy kuni hech kim chiqmaydi. Birinchi parol o'zgarishida eski chipta to'xtaydi, bo'shliq qolmaydi |
| Jurnal | **7 yo'lning hammasi** yozadi | "Kim kimning parolini o'zgartirdi" savoliga javob kerak. ADR-0022 ham "har parol tiklash jurnalga" degan |

**Rad etilgan muqobillar:**

- **Har bir kirish bazada alohida yozuv (sessiya jadvali).** Qo'shimcha ravishda
  "Chiqish" ni serverda ham ishlatadi va "Faol qurilmalar" ro'yxatini beradi.
  Lekin kirish, chiptani yangilash va chiqish yo'llari qayta yoziladi, holbuki
  ular hozirgi muammoni yopish uchun kerak emas. Kirish raqami bu yo'lni
  to'smaydi: jadval keyin qurilsa ham, raqam "hammasini tugatish" dastagi
  bo'lib qoladi.
- **`passwordChangedAt` vaqt belgisi.** JWT `iat` soniyali. Parol o'zgargan
  soniyada berilgan yangi chipta (joriy qurilmaniki) o'z belgisidan "eski"
  bo'lib chiqadi, shuning uchun qo'shimcha da'vo baribir kerak bo'ladi.
- **Parol xeshidan barmoq izi (Django uslubi).** Migratsiya kerak emas, lekin
  eski chiptalarda barmoq izi yo'q. Ular yo hammani bir marta majburan
  chiqaradi (1048 o'quvchi, ko'plari parolini eslamaydi), yo 24 soatlik
  himoyasiz oyna qoldiradi. "Boshqa qurilmalardan chiqish" uchun baribir
  alohida raqam kerak bo'lardi.
- **Faqat `refresh` da tekshirish (B).** Kirib olgan odamga 1 soat qoladi.

## Qanday ishlaydi

### Ma'lumot

`User.sessionVersion Int @default(0)`. Postgres'da `ADD COLUMN ... NOT NULL
DEFAULT 0` jadvalni qayta yozmaydi. Ustun `EntityHistory` diff'idan
chiqariladi (`diff.util.ts`, `password` yonida), chunki u biznes ma'lumot emas.

### Chipta

`generateTokens` ikkala chiptaga `sv` qo'shadi:

- kirish: `{ sub, roles, companyId, studentId?, sv }`, 1 soat
- yangilash: `{ sub, type: 'refresh', sv }`, 24 soat

Chipta beradigan hamma yo'l (`login`, Telegram OAuth, ilovaning OTP so'rovi
`buildStudentSession`, `refresh`) bir xil `generateTokens` dan o'tadi, raqamni
esa bazadan o'qilgan `user` qatoridan oladi. `sv` yo'q chipta **0** deb
o'qiladi. `sv` bo'lsa, lekin manfiy bo'lmagan butun son bo'lmasa, chipta
yaroqsiz hisoblanadi. Bu da'volarni o'qish qoidasi bitta funksiyada.

Chipta muddatlari `auth/token-lifetimes.ts` ga ko'chiriladi (soniyada):
Redis kaliti muddati kirish chiptasi muddatidan hisoblanadi va bir manbadan
o'qishi kerak.

### Tekshiruv nuqtalari

1. **`refresh`** (baza, asosiy chegara): holat tekshiruvidan keyin
   `chipta sv !== user.sessionVersion` bo'lsa 401
   "Sessiya tugagan. Iltimos, qaytadan kiring." qaytadi.
2. **`JwtStrategy`**: `type === 'refresh'` bo'lgan chiptani rad etadi.
   Yangilash chiptasi endi `refresh` dan boshqa joyda ishlamaydi.
   Tasdiqlangan `request.user` ga `sessionVersion` qo'shiladi.
3. **`JwtAuthGuard`** (tez yo'l): blok tekshiruvidan keyin Redis'dagi
   `user:session-version:<id>` kaliti o'qiladi.
   - Kalit yo'q bo'lsa o'tkaziladi. Oxirgi o'zgarishdan beri 1 soatdan ko'p
     o'tgan bo'ladi, demak undan oldingi kirish chiptalarining muddati tugagan.
   - Chipta raqami keshdagidan kichik bo'lsa, **rad etishdan oldin baza bilan
     solishtiriladi**. Baza chiptani tasdiqlasa (kesh xato), kalit o'chiriladi
     va so'rov o'tadi. Bu ADR-0028 naqshi: kesh hech kimni o'zi
     chiqarib yubormaydi.
   - Rad etish **401**, 403 emas. Klient 401 da chiptani yangilashga urinadi,
     `refresh` rad etadi va kirish sahifasi ochiladi. 403 esa faqat "ruxsat
     yo'q" xabarini ko'rsatib, odamni o'sha sahifada qoldirardi.
   - Redis ishlamasa so'rov o'tadi va log yoziladi. Chegara `refresh` da
     qoladi, ya'ni ko'pi bilan 1 soat.

### Raqamni oshirish: yagona manba

`server/src/common/auth/session-version.ts` (ADR-0028 ning `blocked-user.ts`
fayli yonida, xuddi shu shaklda):

- `passwordWrite(hash | null)` → `{ password, sessionVersion: { increment: 1 } }`.
  Parol va raqam **bitta `update` da, bitta tranzaksiyada** yoziladi.
- `endSessionsWrite()` → `{ sessionVersion: { increment: 1 } }`, parolsiz
  (tugma uchun).
- `recordSessionsEnded(redis, userId, version)`: baza yozuvi **commit
  bo'lgandan keyin** kalitni `version` ga qo'yadi. Muddat = kirish chiptasi
  muddati + 5 daqiqa. Hech qachon xato otmaydi, faqat log yozadi.
- `tokenSessionVersion(payload)`: da'voni o'qish qoidasi.

7 yo'lning har biri `passwordWrite` ni ishlatadi, commit'dan keyin
`recordSessionsEnded` ni chaqiradi va jurnalga yozadi. Jurnal yozuvlari
mavjud shaklda: `{ parol: '***' } → { parol: <yorliq> }`, `changedById` =
amalni bajargan odam.

| # | Jurnal turi | Yorliq |
|---|---|---|
| 1 | `User` | `o'zgartirildi` (yangi) |
| 2 | `User` | `yangi parol o'rnatildi` yoki rollar olib tashlanganda `rollar olib tashlangani uchun o'chirildi` (yangi, faqat parol haqiqatan o'zgarganda) |
| 3 | `User` | `yangi parol o'rnatildi` (yangi) |
| 4 | `Student` | `o'zgartirildi` (bor) |
| 5 | `Student` | `yangi parol o'rnatildi` (yangi) |
| 6 | `Student` yoki `User` | `SMS orqali tiklandi` (bor) |
| 7 | `Student` | `Telegram bot orqali tiklandi` (bor) |

**Qorovul testi** (`password-write.single-source.spec.ts`, loyihadagi
`*.single-source.spec.ts` lar uslubida): `src/` dagi har bir faylni TypeScript
AST sifatida o'qiydi.
- `*.user.update(...)`, `updateMany`, `upsert` ning `update` qismi `data`
  obyektida `password` kaliti to'g'ridan-to'g'ri turgan bo'lsa, test yiqiladi.
- `<obj>.password = ...` o'zlashtirilsa ham yiqiladi. Eskiz `this.password`
  kabi aniq istisnolar sababi bilan ro'yxatda turadi.

Yangi hisob yaratish (`user.create`) ruxsat etilgan, chunki yangi hisobda
tugatiladigan kirish yo'q. Qorovul chegaralari testning izohida yoziladi:
boshqa model ichidagi ichma-ich yozuvni ko'rmaydi, chaqiruv ishlashini emas,
borligini tekshiradi.

### Joriy qurilma va tugma

- `AuthService.issueSession(userId)`: bazadan o'qiydi, bloklangan holatni rad
  etadi va `{ accessToken, refreshToken, user }` qaytaradi. `login`,
  `buildStudentSession` va `refresh` ning bir xil dumi
  (`studentId` + `generateTokens` + `formatUser`) bitta xususiy metodga
  chiqariladi, to'rttasi shu metodni ishlatadi.
- `PATCH /users/password` va `PATCH /student-portal/password` javobi:
  `{ message, accessToken, refreshToken, user }`. Controller parolni servisda
  o'zgartiradi, keyin `issueSession` ni chaqiradi. `UsersModule` va
  `StudentsModule` `AuthModule` ni import qiladi; `AuthModule` ularni import
  qilmaydi, shuning uchun aylana bog'lanish yo'q.
- **`POST /users/logout-others`**: `@Roles` yo'q, har qanday kirgan
  foydalanuvchi uchun, id faqat `@CurrentUser('id')` dan olinadi. Route
  manifestida `SELF` guruhiga qo'shiladi (`PATCH /users/password` yonida).
  `AuthService.logoutOtherSessions` raqamni oshiradi, Redis'ga yozadi,
  jurnalga `{ kirishlar: 'boshqa qurilmalardan chiqildi' }` yozadi va
  yangi sessiyani qaytaradi. Nega `/auth/` ostida emas: klient interceptori
  (`api.ts`) `/auth/` bilan boshlanadigan har bir URL'ni ochiq endpoint deb
  hisoblaydi va 401 da chiptani yangilamaydi. Tugma bosilgan paytda kirish
  chiptasi eskirgan bo'lsa, so'rov shunchaki yiqilardi.

### Klient

- `use-logout-others` hook'i: so'rovni yuboradi, javobdagi chiptani
  `setAuth` bilan saqlaydi. Uni ikkala ekran ishlatadi.
- `change-password-drawer.tsx` va `student-password-dialog.tsx`: javobda
  chipta bo'lsa `setAuth` qiladi. Xabar: "Parol o'zgartirildi. Boshqa
  qurilmalardagi kirishlar tugatildi."
- **Xodim:** `profile-details.tsx` da "Parolni o'zgartirish" yonida
  "Boshqa qurilmalardan chiqish" tugmasi turadi (mobil: `profile-client.tsx`
  amallar ro'yxati). Tasdiqlash oynasi: "Boshqa barcha qurilmalardagi
  kirishlar tugatiladi. Bu qurilmada qolasiz."
- **O'quvchi:** `student-settings-page.tsx`, "Xavfsizlik" bo'limida
  `ListRow` bo'ladi. Tasdiqlash oynasi xodimniki bilan bitta komponent
  (`shared/logout-others-dialog.tsx`), o'quvchida `lumio` ko'rinishida —
  portalning o'z "Chiqish" oynasi (`student-logout-button.tsx`) kabi.

### Chekka holatlar

- **Joriy qurilmadagi poyga.** Parol o'zgargan zahoti, yangi chipta saqlanib
  ulgurmasidan oldin, shu qurilmadan boshqa so'rov ketgan bo'lsa, u 401
  oladi. Interceptor cookie'dan yangilash chiptasini oladi: yangi chipta
  saqlangan bo'lsa ishlaydi, hali saqlanmagan bo'lsa odam kirish sahifasiga
  tushadi va yangi paroli bilan kiradi. Oyna millisekundlar. Qabul qilindi.
- **Eski klient** (backend chiqib, Vercel hali chiqmagan): javobdagi yangi
  chiptani saqlamaydi, shuning uchun parolni o'zgartirgan odam keyingi
  so'rovda kirish sahifasiga tushadi. Deploy tartibi: avval Railway, keyin
  Vercel.
- **Native ilova:** `refresh` rad etilsa `signOut` qiladi, o'zgarish kerak emas.
  Ilovada parol o'zgartirish yo'q.
- **30 kunlik ilova chiptasi** (2026-08-19 spec, qurilmagan) qurilsa, o'sha
  `generateTokens` dan o'tadi va raqam tekshiruvini o'zi oladi.

## Testlar (TDD, avval yiqiladigan test)

- `session-version.spec.ts`: yozish bo'laklari, da'voni o'qish (yo'q → 0,
  buzuq → yaroqsiz), Redis yozuvi muddat bilan, Redis xatosi yutiladi.
- `auth.service.spec.ts`: ikkala chiptada `sv`; `refresh` mos kelmagan `sv`
  ni rad etadi; `sv`siz chipta 0-raqamli hisobda o'tadi, 1-raqamlida rad
  etiladi; `issueSession`; `logoutOtherSessions`.
- `jwt.strategy.spec.ts` (yangi): `type: 'refresh'` rad etiladi,
  `sessionVersion` uzatiladi.
- `jwt-auth.guard.spec.ts`: kalit yo'q → o'tadi; eski chipta + baza tasdiqlaydi
  → 401; baza rad etadi → o'tadi va kalit o'chadi; Redis xatosi → o'tadi.
- 7 yo'lning har biri: raqam oshadi, Redis commit'dan keyin yoziladi, jurnal
  yoziladi.
- Controller'lar: yangi route `@Roles` siz, javobda chipta bor. Route manifest
  testi yangi route'ni ko'radi.
- `password-write.single-source.spec.ts` qorovuli.
- Klient: `vitest` (sof funksiyalar), `tsc`.
- Oxirida: `server/` da `npm test` va `npm run typecheck`, `client/` da
  `npm test` va `tsc`.

## Migratsiya va deploy

- Migratsiya `prisma migrate dev` siz qilinadi: `migrate diff` → drift
  qatorlari olib tashlanadi → `db execute` (dev) → `migrate resolve --applied`.
- Prod'da migratsiya `railway up` paytida `prisma migrate deploy` bilan
  o'zi qo'llanadi.
- Deploy tartibi: Railway, keyin Vercel. Deploy qo'lda qilinadi va alohida
  ruxsat bilan.

## Bu ish hal qilmaydi (alohida qaror)

1. "Chiqish" hanuz faqat brauzerni tozalaydi (sessiya jadvali kerak).
2. Kirishning eng uzun muddati yo'q.
3. Yangilash chiptasi skript o'qiy oladigan cookie'da turadi (httpOnly emas).
4. Parolga bog'liq bo'lmagan kirish yo'llari bu ishga kirmaydi (alohida
   vazifa).

## Parallel ishlar bilan to'qnashuv

Ochiq PR'lar (#516, #519, #523, #527 va ularning ustidagilar)
`users.service.ts`,
`teachers.service.ts` va `jwt-auth.guard.ts` ni o'zgartiradi. Bu shox `main`
dan o'sadi. Guard'dagi tekshiruv alohida metodda turadi, shuning uchun
to'qnashuvlar mexanik bo'ladi. ADR raqami 0030 (0026–0029 va 0031–0032 boshqa ishlarda band).
