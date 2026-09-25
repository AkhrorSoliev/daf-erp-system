# ADR-0031 — O'z kirish kalitingiz faqat joriy parol bilan o'zgaradi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0008 (chaqiruvchisi yo'q yozuv), ADR-0022 (bir odam — har rolga alohida hisob), ADR-0027 (daraja qoidasi), `server/src/common/auth/phone-account-rules.ts`, `server/src/common/auth/own-sign-in-keys.ts`, `server/src/common/guards/own-password-attempt.guard.ts`

## Kontekst

Hisobning kirish kalitlari — telefon, login va parol. Telefon ham kalit:
«Telegram orqali kirish» va SMS orqali parol tiklash hisobni telefon raqami
bo'yicha topadi, qidiruv (`AuthService.buildAccountLookup`) esa raqamni
`login` ustunida ham izlaydi.

Kalitni o'zgartiradigan eshiklar bitta qoidaga bo'ysunmasdi: parolni
o'zgartirish joriy parolni so'rardi, telefonni o'zgartirish va xodim formasi
orqali o'zini tahrirlash esa so'ramasdi. Telefon almashganda `login` eski
raqamda qolishi mumkin edi. ADR-0022 ning «bitta telefonga bitta ishlab turgan
xodim» qoidasi faqat yaratishda tekshirilardi.

Prod (2026-09-24): 6 oyda o'z raqamini 3 kishi almashtirgan, hammasi odatiy;
xodim formasi orqali o'zini tahrirlash hech bo'lmagan.

## Qaror

1. **O'z kirish kalitingiz faqat joriy parol so'raydigan eshikdan o'zgaradi.**
   Parol — `PATCH /users/password`, telefon — `PATCH /users/phone`
   (`currentPassword` majburiy, faqat xodim rollari). `PATCH /users/profile`
   kalitga tegmaydi: `UpdateProfileDto` da telefon yo'q. O'z loginingizni
   hech bir eshik o'zgartirmaydi — u telefon bilan birga ko'chadi (3-band).
   O'quvchi o'z raqamini o'zi almashtirmaydi — hozirgidek xodim almashtiradi.
2. **Boshqa eshik o'zingizning kalitingizni yozmaydi.** `PATCH /users/:id` va
   `PATCH /teachers/:id` da chaqiruvchi o'zi bo'lsa, telefon, login yoki parol
   o'zgarishi 403 bilan rad etiladi. Forma qayta yuborgan o'zgarmagan qiymat
   o'zgarish hisoblanmaydi. Chaqiruvchi noma'lum bo'lsa — rad (ADR-0008).
   Boshqa xodimga yozish bu qarorga kirmaydi (ADR-0027).
3. **Telefon almashsa, eski raqam kalit bo'lmay qoladi.** Eski telefonni
   ushlab turgan `login` (`998…` ko'rinishida ham) yangisiga ko'chadi; yangi
   raqam boshqa tirik hisobning logini bo'lsa — `null` (ADR-0022). «Bitta
   telefonga bitta ishlab turgan xodim» ham shu yerda tekshiriladi. Ikkalasi
   bitta funksiyada — `planPhoneChange`; telefon yozadigan har bir eshik uni
   chaqiradi.
4. **Joriy parolni tekshirish urinishlar soni bilan cheklanadi:** bitta
   hisobga 15 daqiqada 5 ta urinish, joriy parolni so'raydigan barcha eshiklar
   uchun umumiy (`OwnPasswordAttemptGuard`). Cheklovsiz tekshiruvni taxmin
   bilan o'tib bo'ladi.

**Taqiqlanadi:**
- chaqiruvchining o'z telefoni, logini yoki parolini joriy parolsiz yozadigan
  yo'l;
- `UpdateProfileDto` ga kalit maydonini (telefon, login, parol) qaytarish;
- telefonni `planPhoneChange` dan o'tkazmasdan yozish;
- joriy parolni so'raydigan yangi eshikni `OwnPasswordAttemptGuard` siz ochish.

## Ko'rib chiqilgan muqobillar

**Yangi raqamga SMS kod.** Rad etildi: kod yangi raqamga boradi, ya'ni raqamni
kiritayotgan odamning o'ziga. U raqam to'g'ri yozilganini tasdiqlaydi, hisob
egasi ekanini emas. Xato raqamdan himoya sifatida keyin parolning USTIGA
qo'shilishi mumkin (Eskizda yangi matn tasdiqlanishi kerak), o'rniga emas.
Tanlov CEO bilan 2026-09-24 da kelishildi.

**Eski raqamga SMS kod.** Rad etildi: raqam ko'pincha eski SIM yo'qolgani
uchun almashtiriladi.

**Faqat rahbar almashtiradi.** Rad etildi: CEO ustida hech kim yo'q; oddiy
almashtirish rahbarga ish qo'shadi.

**Parolni `PATCH /users/profile` ichida so'rash.** Rad etildi: ism va rasm
bilan bitta DTO da turgan kalit keyingi o'zgarishda tekshiruvsiz qolishi
oson. Parol kabi alohida eshik himoyani tuzilishning o'zi bilan beradi.

**Xodim formasida o'zingiz uchun ham joriy parol so'rash.** Rad etildi: ikki
eshik — ikki tekshiruv; prodda forma orqali o'zini tahrirlash bo'lmagan.

## Oqibatlari

**Yutuq:** kirish kalitini faqat hisob egasi, joriy paroli bilan o'zgartiradi;
eski parolni so'rash aylanib o'tilmaydi; almashtirilgan raqam kalit bo'lib
qolmaydi.

**Narx:** raqam almashtirishda parol kiritiladi. CEO ham o'z telefoni va
parolini faqat Profilda o'zgartiradi, o'z loginini esa umuman o'zgartirmaydi.
Parolini unutgan xodim avval parolni tiklaydi yoki raqamini rahbar
almashtiradi. 15 daqiqada 5 marta xato qilgan kishi kutadi.

**Bu qaror yopmaydi:** boshqa xodimning hisobiga yozish (ADR-0027), sessiyalar
muddati va o'quvchining kirish raqami alohida qarorlarda. Parol brauzerda
saqlangan bo'lsa, joriy parolni so'rash himoya qilmaydi. Mavjud ma'lumotni
yangi qoidaga keltirish — bir martalik tuzatish, alohida ruxsat bilan.
