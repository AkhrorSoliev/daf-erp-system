# Zaxira raqam bilan kirish — dizayn

**Sana:** 2026-10-02 (qayta ko'rib chiqildi 2026-10-03) · **Holati:** CEO bilan kelishildi · **ADR:** 0067 (shu ish bilan bitta PR'da)

## Maqsad

O'quvchi kartasidagi zaxira raqam (`Student.extraPhone`) ham kirish kaliti
bo'ladi. Zaxira raqamni odatda admin kiritadi; o'quvchi ham o'z profilidan
qo'sha, o'zgartira va o'chira oladi. Admin o'quvchi kartasida o'quvchining
barcha raqamlarini ko'radi.

## Hozirgi holat (kod va prod bazasi o'qildi, 02–03.10.2026)

- Kirish faqat hisobdagi raqamni taniydi: `User.login` / `User.phone`.
  Parol bilan kirish (`findAccountByIdentifier`) va saytdagi «Telegram orqali
  kirish» (`findAccountsByIdentifier`) bitta shartdan foydalanadi —
  `AuthService.buildAccountLookup` (`server/src/auth/auth.service.ts`).
- SMS bilan parol tiklash alohida yo'l:
  `PortalPasswordResetService.resolveByPhone`.
- Bot (parol tiklash, «💳 To'lovlar», ro'yxatdan o'tish) o'quvchini kartadagi
  asosiy raqam (`Student.phone`) bo'yicha topib, chatni kartaga bog'laydi.
  Telegram ichidagi kabinet (ADR-0040) va ilovaning bot orqali kirishi
  o'quvchini o'sha bog'langan chat (`telegramChatId`) bo'yicha taniydi.
  Tirik 1089 o'quvchidan 1013 tasi botga bog'langan.
- `Student.extraPhone` faqat qidiruvda va formalarda takror lidni topishda
  ishlatiladi. Prodda zaxira raqamli tirik o'quvchi **0 ta**: admin oynasida
  o'quvchi uchun bu maydon **chizilmaydi** — forma qiymatni saqlaydi, lekin
  kiritish maydoni yo'q (`edit-student-additional-fields.tsx` da yo'q,
  `add-student-dialog.tsx` da ham yo'q). Lid oynasida bor («Qo'shimcha
  telefon»): 6 ta lidda zaxira raqam bor, aylantirilganda u kartaga ko'chadi.
- O'quvchi kartasi (`client/src/components/students/student-profile-card.tsx`)
  faqat asosiy raqamni ko'rsatadi. `Student.parentPhone` alohida maydon.
- Telefonni SMS bilan tasdiqlash (ADR-0039) prodda **o'chiq**:
  `STUDENT_PHONE_VERIFICATION_ENABLED` o'rnatilmagan. Uni yoqishdan oldin Eskiz
  `buildPhoneVerifyMessage` matnini tasdiqlashi kerak.
- Bir odam — har tur uchun alohida hisob, bitta raqam (ADR-0022). Qaysi hisob
  ochilishini domen hal qiladi (`portal-roles.config.ts`): `admin.` → CEO,
  filial direktori, administrator, kassir; `lehrer.` → o'qituvchi;
  `student.` → o'quvchi. Bu ish shu qoidani o'zgartirmaydi.

## CEO qarorlari (02–03.10.2026)

1. Zaxira raqam bilan kirish mumkin.
2. Bitta zaxira raqam ikki o'quvchida **turmaydi** — ota-ona raqami uchun
   alohida maydon bor.
3. O'quvchi profilidan raqam qo'shganda yoki o'zgartirganda **joriy parol va
   yangi raqamga kelgan SMS kod** so'raladi. Parol — ADR-0031 va ADR-0039
   talabi (raqam kirish kaliti; SMS raqamni isbotlaydi, hisob egasini emas).
   SMS — raqam to'g'ri va o'sha odamniki ekanini isbotlaydi (CEO, 03.10).
4. Zaxira raqam **parol bilan kirish** va saytdagi **«Telegram orqali kirish»**
   tugmasida ishlaydi. SMS bilan parol tiklash faqat asosiy raqamga boradi.
5. Admin o'quvchi kartasida barcha raqamlarni ko'radi. O'quvchilar ro'yxati
   jadvali o'zgarmaydi.
6. O'quvchi ilovasidagi profil qatori keyinroq qo'shiladi (alohida vazifa).
   Ilovada zaxira raqam bilan parol orqali kirish darhol ishlaydi.

## Dizayn

### 1. Kirish — ikki bosqichli qidiruv

Parol bilan kirish va saytdagi «Telegram orqali kirish» bitta qidiruvdan
o'tadi (`buildAccountLookup` atrofida, ikkalasi uchun bitta joy — Telegram
yo'li parol yo'lidan keng bo'lmasligi kerak):

1. **Asosiy raqam** — hozirgi shart, hech narsa o'zgarmaydi.
2. **Zaxira raqam** — faqat 1-bosqich hech kimni topmasa va portal o'quvchi
   rolini qabul qilsa (`allowedRoleIds` ichida 6 bor yoki cheklov yo'q —
   lokal). Shart: `student: { extraPhone: <normallangan raqam>, deletedAt:
   null }`, hisob tirik, holati `SIGN_IN_USER_STATUSES`, roli o'quvchi.

Asosiy raqam har doim ustun: 1-bosqich hisob topsa, parol noto'g'ri bo'lsa
ham 2-bosqichga o'tilmaydi. Birovning zaxira raqami boshqa o'quvchining
asosiy raqamini to'sa olmaydi. `admin.` va `lehrer.` da 2-bosqich ishlamaydi.

Telegram yo'lida `take: 2` va «bir nechta hisob → rad» qoidasi saqlanadi;
takrorlanmaslik qoidasi tufayli 2-bosqich ko'pi bilan bitta hisob beradi.

**O'zgarmaydi:** SMS bilan parol tiklash (`resolveByPhone`), bot sahnalari
(parol tiklash, «💳 To'lovlar», ro'yxatdan o'tish), Telegram ichidagi kabinet
va ilovaning bot orqali kirishi — ular asosiy raqam yoki bog'langan chat
bo'yicha ishlaydi.

### 2. Takrorlanmaslik qoidasi — bitta funksiya

`server/src/students/shared/` ichida bitta funksiya (masalan
`assertExtraPhoneFree(db, phone, student)`); zaxira raqam yoziladigan barcha
joy shundan o'tadi. Raqam 9 xonali o'zbek raqami (DTO allaqachon shuni
talab qiladi). Rad etiladi, agar raqam:

- shu o'quvchining asosiy raqamiga teng bo'lsa;
- boshqa o'chirilmagan o'quvchi kartasining (`deletedAt: null`, holati
  qanday bo'lsa ham) asosiy yoki zaxira raqamiga teng bo'lsa;
- boshqa tirik o'quvchi hisobining `login` / `phone`iga teng bo'lsa.

Xodim hisobidagi raqam to'siq emas — boshqa portal (ADR-0022).

| Joy | Band raqamda |
| --- | --- |
| Admin kartani tahrirlaydi (`StudentsWriteService.update`) | 400, xodimga o'quvchi ismi bilan: «Bu raqam boshqa o'quvchida bor: Ism Familiya» |
| Admin o'quvchi yaratadi (`StudentsWriteService.create`) | 400, xuddi shu xabar |
| Lid o'quvchiga aylanadi (`LeadsService.convert` → `create`) | Aylantirish to'xtamaydi; zaxira raqam ko'chirilmaydi, lidda qoladi |
| Karta arxivdan tiklanadi (`ArchiveRestoreService`) | Tiklash to'xtamaydi; zaxira raqam kartadan olib tashlanadi, tarixga yoziladi |
| O'quvchi o'zi qo'shadi (4-bo'lim) | «Bu raqamni qo'shib bo'lmaydi» — boshqa o'quvchi nomi ochilmaydi |

Bo'sh qiymat (`null`) har doim ruxsat — raqamni o'chirish.

Keyinchalik kimdir asosiy raqamini boshqa o'quvchining zaxira raqamiga
o'zgartirsa, saqlash to'xtatilmaydi: 1-bo'lim bo'yicha asosiy raqam yutadi,
eski zaxira raqam o'z-o'zidan kalit bo'lmay qoladi.

Asosiy raqam o'quvchining **o'z** zaxira raqamiga teng bo'lib qolsa:
admin tahririda 400 («Zaxira raqam asosiy raqam bilan bir xil bo'lmasin» —
admin bittasini o'zgartiradi); ADR-0039 «Yo'q, boshqa raqam» yo'lida
(`replaceCardNumber`) zaxira raqam asosiyga ko'chgan hisoblanadi — o'sha
tranzaksiyada bo'shatiladi va tarixga yoziladi.

### 3. Admin oynasi — zaxira raqamni kiritish

- O'quvchini tahrirlash oynasining «Qo'shimcha ma'lumotlar» paneliga
  «Zaxira raqam» bo'limi qo'shiladi (lid oynasidagi kabi, `PhoneInput`).
- Yangi o'quvchi qo'shish oynasida ixtiyoriy «Zaxira raqam» maydoni.
- Band raqamda server xabari toast bilan ko'rsatiladi.

### 4. O'quvchi profili (web portal)

Profil sahifasida «Zaxira raqam» qatori: raqam yoki «Qo'shilmagan».

- **SMS tasdiqlash yoqilgan bo'lsa** (`phoneVerificationEnabled`, ADR-0039
  kaliti): «Qo'shish» / «O'zgartirish» / «O'chirish» tugmalari.
- **O'chiq bo'lsa:** qator faqat ko'rsatadi va «Zaxira raqamni administrator
  qo'shadi» deb yozadi. Server javobi tugmalar ochiqligini aytadi; klient
  o'zi hisoblamaydi.

Qo'shish / o'zgartirish: o'quvchi raqamni va **joriy parolini** kiritadi →
kod yangi raqamga boradi → kod to'g'ri bo'lsa raqam saqlanadi.
O'chirish: **joriy parol** so'raladi (ADR-0031: o'z kirish kalitingiz faqat
joriy parol bilan o'zgaradi), SMS so'ralmaydi.

Server (`student-portal`, faqat o'z kartasi — id tokendan, `StudentCardGuard`):

- `POST /student-portal/extra-phone/send-code { phone, currentPassword }` —
  tartib: kalit yoqilganmi → raqam to'g'rimi va o'z asosiy raqami emasmi →
  parol → takrorlanmaslik → kod.
- `POST /student-portal/extra-phone/verify { code }` — kod to'g'ri bo'lsa
  qoidani **qayta** tekshiradi (oradagi poyga uchun) va `extraPhone` ni
  yozadi.
- `POST /student-portal/extra-phone/remove { currentPassword }` — raqamni
  o'chiradi.

`send-code` va `remove` `OwnPasswordAttemptGuard` bilan
(`own-password-attempt.routes.spec.ts` ro'yxatiga qo'shiladi). Uchala yo'l
yo'llar manifestida SELF.

SMS: ADR-0039 ning kod mexanizmi va matni qayta ishlatiladi
(`buildPhoneVerifyMessage`, cheklovlar: kod muddati, qayta yuborish oralig'i,
urinishlar, o'quvchiga kunlik va bitta raqamga kunlik chegara, umumiy soatlik
chegara, `SmsMessage` jurnali). Kod alohida saqlanadi: asosiy raqam kodi
zaxira raqamni yozmaydi va aksincha; cheklov hisoblagichlari umumiy. Alohida
Eskiz matni kerak emas, lekin ADR-0039 matni tasdiqlanib, kalit yoqilmaguncha
bu yo'l ham yopiq. Zaxira raqamni tasdiqlash asosiy raqamni tasdiqlangan
qilmaydi (`markPhoneVerified` chaqirilmaydi).

### 5. Admin kartasi — barcha raqamlar

`student-profile-card.tsx` da raqamlar ro'yxati, har biri nomi bilan:

- **Asosiy** — hozirgidek, SMS tasdiq belgisi bilan; kirish kaliti.
- **Zaxira** — kirish kaliti.
- **Ota-ona** — kirish kaliti emas.

Har biri `tel:` havolasi; bo'sh raqam ko'rsatilmaydi.

Ekranda bitta nom — **«Zaxira raqam»**: tarix yorlig'i (`extraPhone`) va lid
oynasidagi «Qo'shimcha telefon» ham shunday ataladi.

### 6. Tarix

O'quvchi o'zi qo'shgan, o'zgartirgan yoki o'chirgan zaxira raqam kartaning
tarixiga `EntityHistoryService.recordUpdate` bilan yoziladi: «Zaxira raqam:
eski → yangi», muallif — o'quvchi. Admin o'zgarishi hozirgidek yoziladi.
Arxivdan tiklashda olib tashlangan raqam ham yoziladi.

### 7. ADR-0067

«Zaxira raqam — o'quvchining ikkinchi kirish kaliti»: ikki bosqichli
qidiruv va asosiy raqam ustunligi; faqat o'quvchi portali, faqat parol va
saytdagi Telegram tugmasi; takrorlanmaslik; o'quvchi o'zi qo'shganda parol +
SMS, o'chirganda parol; SMS tiklash, bot va Telegram ichidagi kabinet
o'zgarmaydi. `docs/adr/README.md` ga qator; `server/CLAUDE.md` Authentication
bo'limiga qisqa band. Merge oldidan `origin/main` dagi oxirgi ADR raqami
qayta tekshiriladi.

## Kirmaydi (keyinga)

- **O'quvchi ilovasidagi «Zaxira raqam» qatori** — alohida vazifa; server
  yo'llari tayyor bo'ladi.
- Zaxira raqam yonida «SMS bilan tasdiqlangan» belgisi — yangi ustun kerak.
- Zaxira raqamga SMS bilan parol tiklash — CEO tanlamadi.
- Bot va Telegram ichidagi kabinetning zaxira raqamni tanishi — ular chat
  bo'yicha ishlaydi.
- O'quvchilar ro'yxati jadvalida ikkinchi raqam — CEO tanlamadi.

## Testlar

- Kirish: asosiy raqam bo'yicha topiladi; asosiy yo'q → zaxira bo'yicha;
  asosiy va zaxira ikki xil o'quvchida → asosiy yutadi (parol noto'g'ri
  bo'lsa ham zaxiraga o'tilmaydi); `admin.` / `lehrer.` da zaxira raqam
  ishlamaydi; o'chirilgan karta zaxirasi ishlamaydi; Telegram yo'li zaxira
  raqam bilan bitta hisob ochadi.
- Takrorlanmaslik funksiyasi: har bir rad sababi; bo'sh qiymat o'tadi; o'z
  raqamini qayta saqlash o'tadi.
- `create` / `update`: band raqam → 400. Lid aylantirish: band raqam
  ko'chirilmaydi, aylantirish o'tadi. Arxivdan tiklash: band raqam olib
  tashlanadi, tiklash o'tadi.
- O'quvchi yo'llari: kalit o'chiq → rad; noto'g'ri parol → rad va urinish
  sanaladi; kod yuboriladi; noto'g'ri kod yozmaydi; to'g'ri kod yozadi va
  tarixga qator qo'shadi; kod orasida raqam band bo'lib qolsa rad; asosiy
  raqam kodi zaxirani yozmaydi va aksincha; o'chirish parol bilan ishlaydi.
- Qorovul ro'yxatlari: `own-password-attempt.routes.spec.ts`, yo'llar
  manifesti, `phone-proof.single-source.spec.ts` o'tadi.
- Klient (vitest): kartada uchala raqam nomi bilan, bo'shi yashiriladi;
  admin formasida maydon chiziladi; profil qatori ikki holatda (kalit
  yoqilgan / o'chiq).

## Chiqarish

Server (Railway) va sayt (Vercel). Migratsiya yo'q — `extraPhone` ustuni
bor. Deploydan keyin darhol ishlaydi: admin zaxira raqam kiritadi, o'quvchi
u bilan `student.` da parol yoki Telegram tugmasi orqali kiradi, `admin.` da
kira olmaydi — haqiqiy saytda bitta sinov o'quvchida tekshiriladi.
O'quvchining o'zi qo'shishi ADR-0039 kaliti yoqilgan kuni ochiladi.
