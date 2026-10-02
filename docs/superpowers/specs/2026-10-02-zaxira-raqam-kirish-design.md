# Zaxira raqam bilan kirish — dizayn

**Sana:** 2026-10-02 · **Holati:** CEO bilan kelishildi · **ADR:** 0067 (shu ish bilan bitta PR'da)

## Maqsad

O'quvchi kartasidagi zaxira raqam (`Student.extraPhone`) ham kirish kaliti
bo'ladi. Zaxira raqamni admin kiritadi, o'quvchi esa o'z profilidan qo'sha,
o'zgartira va o'chira oladi. Admin o'quvchi kartasida o'quvchining barcha
raqamlarini ko'radi.

## Hozirgi holat (2026-10-02, kod va prod bazasi o'qildi)

- Kirish faqat hisobdagi raqamni taniydi: `User.login` / `User.phone`.
  Parol bilan kirish (`findAccountByIdentifier`) va «Telegram orqali kirish»
  (`findAccountsByIdentifier`) bitta shartdan foydalanadi —
  `AuthService.buildAccountLookup` (`server/src/auth/auth.service.ts`).
- SMS bilan parol tiklash alohida yo'l:
  `PortalPasswordResetService.resolveByPhone`.
- `Student.extraPhone` faqat qidiruvda va formalarda takror lidni topishda
  ishlatiladi. Prodda zaxira raqamli tirik o'quvchi **0 ta** (1089 dan).
  `Student.parentPhone` alohida maydon, u ham 0 ta.
- O'quvchi kartasi (`client/src/components/students/student-profile-card.tsx`)
  faqat asosiy raqamni ko'rsatadi. Zaxira va ota-ona raqami faqat tahrirlash
  oynasida ko'rinadi.
- Bir odam — har tur uchun alohida hisob, bitta raqam (ADR-0022). Qaysi hisob
  ochilishini domen hal qiladi (`portal-roles.config.ts`): `admin.` → CEO,
  filial direktori, administrator, kassir; `lehrer.` → o'qituvchi;
  `student.` → o'quvchi. Bu ish shu qoidani o'zgartirmaydi.

## CEO qarorlari (2026-10-02)

1. Zaxira raqam bilan kirish mumkin.
2. Bitta zaxira raqam ikki o'quvchida **turmaydi** — ota-ona raqami uchun
   alohida maydon bor.
3. O'quvchi profilidan raqam qo'shganda yoki o'zgartirganda **faqat SMS kod**
   so'raladi (parol so'ralmaydi).
4. Zaxira raqam **parol bilan kirish** va **Telegram orqali kirish**da
   ishlaydi. SMS bilan parol tiklash faqat asosiy raqamga boradi.
5. Admin o'quvchi kartasida barcha raqamlarni ko'radi. O'quvchilar
   ro'yxati jadvali o'zgarmaydi.
6. O'quvchi ilovasidagi profil qatori keyinroq qo'shiladi (vazifa sifatida
   yoziladi). Ilovada zaxira raqam bilan kirish darhol ishlaydi — ilova ham
   shu server orqali kiradi.

## Dizayn

### 1. Kirish — ikki bosqichli qidiruv

`buildAccountLookup` o'rniga qidiruv ikki bosqichda bo'ladi; ikkala kirish
yo'li (parol, Telegram) shu bitta joydan o'tadi:

1. **Asosiy raqam** — hozirgi shart, hech narsa o'zgarmaydi.
2. **Zaxira raqam** — faqat 1-bosqich hech kimni topmasa va portal o'quvchi
   rolini qabul qilsa (`allowedRoleIds` ichida 6 bor yoki cheklov yo'q —
   lokal). Shart: `student: { extraPhone: <normallangan raqam>, deletedAt:
   null }`, hisob tirik (`deletedAt: null`), holati
   `SIGN_IN_USER_STATUSES`, roli o'quvchi.

Asosiy raqam har doim ustun turadi: birovning zaxira raqami boshqa
o'quvchining asosiy raqamini to'sib qo'ya olmaydi. `admin.` va `lehrer.`
sahifalarida 2-bosqich umuman ishlamaydi.

Telegram yo'lida `take: 2` va «bir nechta hisob → rad» qoidasi saqlanadi;
takrorlanmaslik qoidasi tufayli 2-bosqich ko'pi bilan bitta hisob beradi.

`PortalPasswordResetService.resolveByPhone` o'zgarmaydi.

### 2. Takrorlanmaslik qoidasi — bitta funksiya

`server/src/students/shared/` ichida bitta funksiya (masalan
`assertExtraPhoneFree(tx, phone, studentId)`), zaxira raqam yoziladigan
barcha joy shundan o'tadi. Raqam `normalizeSharedPhone` bilan
normallanadi. Rad etiladi, agar raqam:

- shu o'quvchining asosiy raqamiga teng bo'lsa;
- boshqa o'chirilmagan o'quvchi kartasining (`deletedAt: null`, holati
  qanday bo'lsa ham) asosiy yoki zaxira raqamiga teng bo'lsa;
- boshqa tirik o'quvchi hisobining `login` / `phone`iga teng bo'lsa.

Xodim hisobidagi raqam to'siq emas — boshqa portal.

Yozish joylari:

| Joy | Band raqamda |
| --- | --- |
| Admin kartani tahrirlaydi (`StudentsWriteService.update`) | 400, xodimga o'quvchi ismi bilan: «Bu raqam boshqa o'quvchida bor: Ism Familiya» |
| Admin o'quvchi yaratadi (`StudentsWriteService.create`) | 400, xuddi shu xabar |
| Lid o'quvchiga aylanadi (`LeadsService` → `create`) | Aylantirish to'xtamaydi; zaxira raqam ko'chirilmaydi, lidda qoladi |
| O'quvchi o'zi qo'shadi (3-bo'lim) | «Bu raqamni qo'shib bo'lmaydi» — boshqa o'quvchi nomi ochilmaydi |

Bo'sh qiymat (`null`, `""`) har doim ruxsat — raqamni o'chirish.

Keyinchalik kimdir asosiy raqamini boshqa o'quvchining zaxira raqamiga
o'zgartirsa, saqlash to'xtatilmaydi: 1-bo'limdagi tartib bo'yicha asosiy
raqam yutadi, eski zaxira raqam o'z-o'zidan kalit bo'lmay qoladi.

### 3. O'quvchi profili (web portal)

Profil sahifasida «Zaxira raqam» qatori: raqam yoki «Qo'shilmagan»;
tugmalar «Qo'shish» / «O'zgartirish» / «O'chirish».

Server (`student-portal`, faqat o'z kartasi — id tokendan, `StudentCardGuard`):

- `POST /student-portal/extra-phone/send-code { phone }` — qoidani
  tekshiradi, yangi raqamga SMS kod yuboradi.
- `POST /student-portal/extra-phone/verify { code }` — kod to'g'ri bo'lsa
  qoidani **qayta** tekshiradi (oradagi poyga uchun) va `extraPhone` ni
  yozadi.
- `DELETE /student-portal/extra-phone` — raqamni o'chiradi, hech narsa
  so'ramaydi.

SMS kod mexanizmi va cheklovlari ADR-0039 onboarding'idan qayta ishlatiladi
(`StudentOnboardingService.issueCode`: kod muddati, qayta yuborish oralig'i,
urinishlar soni, kuniga yangi raqamlar chegarasi, `SmsMessage` jurnali).
SMS matni — o'sha `buildPhoneVerifyMessage`; Eskiz'da yangi matn
moderatsiyasi kerak emas. Saqlangan kod qaysi maqsad uchun ekanini biladi
(asosiy raqamni tasdiqlash yoki zaxira raqam), bir maqsadning kodi
ikkinchisini yozmaydi.

Zaxira raqamni SMS bilan tasdiqlash asosiy raqamni tasdiqlangan qilmaydi va
aksincha (`markPhoneVerified` chaqirilmaydi).

### 4. Admin kartasi — barcha raqamlar

`student-profile-card.tsx` da raqamlar ro'yxati, har biri nomi bilan:

- **Asosiy** — hozirgidek, SMS tasdiq belgisi bilan; kirish kaliti.
- **Zaxira** — kirish kaliti.
- **Ota-ona** — kirish kaliti emas.

Har biri `tel:` havolasi; bo'sh raqam ko'rsatilmaydi. Kartaga kerakli
maydonlar (`extraPhone`, `parentPhone`) `student-select.ts` da allaqachon
bor — profil so'rovi ularni qaytarishi tekshiriladi.

### 5. Tarix

O'quvchi o'zi qo'shgan, o'zgartirgan yoki o'chirgan zaxira raqam kartaning
tarixiga `EntityHistoryService.recordUpdate` bilan yoziladi (o'quvchi
ismini o'zgartirgandagi kabi): «Zaxira raqam: eski → yangi», muallif —
o'quvchi. Admin o'zgarishi hozirgidek yoziladi.

### 6. ADR-0067

«Zaxira raqam — o'quvchining ikkinchi kirish kaliti»: ikki bosqichli
qidiruv va asosiy raqam ustunligi, takrorlanmaslik, faqat o'quvchi portali,
SMS tiklash faqat asosiy raqamga, o'quvchi o'zi qo'shganda faqat SMS kod.
`docs/adr/README.md` ga qator; `server/CLAUDE.md` Authentication
bo'limiga bitta qator. Merge oldidan `origin/main` dagi oxirgi ADR raqami
qayta tekshiriladi.

## Kirmaydi (keyinga)

- **O'quvchi ilovasidagi «Zaxira raqam» qatori** — keyin qo'shiladi;
  alohida vazifa ochiladi. Server yo'llari tayyor bo'ladi.
- Zaxira raqam yonida «o'quvchi SMS bilan tasdiqlagan» belgisi — yangi
  ustun kerak; CEO so'rasa.
- Zaxira raqamga SMS bilan parol tiklash — CEO tanlamadi.
- O'quvchilar ro'yxati jadvalida ikkinchi raqam — CEO tanlamadi.

## Testlar

- `auth.service`: asosiy raqam bo'yicha topiladi; asosiy yo'q → zaxira
  bo'yicha topiladi; asosiy va zaxira ikki xil o'quvchida → asosiy yutadi;
  `admin.` / `lehrer.` da zaxira raqam ishlamaydi; o'chirilgan karta
  zaxirasi ishlamaydi; noto'g'ri parol → `null`.
- Telegram OAuth: zaxira raqam bilan bitta hisob ochiladi.
- Takrorlanmaslik funksiyasi: har bir rad etish sababi; bo'sh qiymat
  o'tadi; o'z raqamini qayta saqlash o'tadi.
- `StudentsWriteService.create/update`: band raqam → 400.
- Lid aylantirish: band zaxira raqam ko'chirilmaydi, aylantirish o'tadi.
- O'quvchi yo'llari: kod yuboriladi; noto'g'ri kod yozmaydi; to'g'ri kod
  yozadi va tarixga qator qo'shadi; kod orasida raqam band bo'lib qolsa
  rad; o'chirish ishlaydi; onboarding kodi zaxira raqamni yozmaydi.
- Klient: kartada uchala raqam nomi bilan, bo'shi yashiriladi; profil
  qatori holatlari (vitest).

## Chiqarish

Server (Railway) va sayt (Vercel). Migratsiya yo'q — `extraPhone` ustuni
bor. Deploydan keyin: haqiqiy saytda bitta sinov o'quvchiga zaxira raqam
qo'yib, `student.` dan kirish, `admin.` dan kirolmaslikni tekshirish.
