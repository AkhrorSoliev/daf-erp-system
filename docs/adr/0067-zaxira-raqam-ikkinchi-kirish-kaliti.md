# ADR-0067 — Zaxira raqam o'quvchining ikkinchi kirish kaliti; asosiy raqam ustun

**Holati:** Qabul qilindi
**Sana:** 2026-10-03
**Bog'liq:** ADR-0022, ADR-0031, ADR-0032, ADR-0033, ADR-0039, ADR-0040, ADR-0045, `server/src/auth/auth.service.ts` (`buildExtraPhoneLookup`), `server/src/students/shared/extra-phone-rule.ts`, `server/src/students/shared/phone-code.ts`, `server/src/students/extra-phone/`, `docs/superpowers/specs/2026-10-02-zaxira-raqam-kirish-design.md`

## Kontekst

Kirish faqat hisobdagi raqamni (`User.login` / `User.phone`) tanirdi.
O'quvchi kartasidagi zaxira raqam (`Student.extraPhone`) faqat qidiruvda
ishlatilardi; admin oynasida o'quvchi uchun bu maydon chizilmasdi ham
(prodda zaxira raqamli tirik o'quvchi 0 ta, 1089 dan). CEO (02.10.2026):
zaxira raqam bilan ham kirish mumkin bo'lsin, uni admin kiritadi, o'quvchi
o'zi ham profilidan qo'sha olsin, admin kartada barcha raqamlarni ko'rsin.

## Qaror

1. **Ikki bosqichli qidiruv.** Parol bilan kirish va saytdagi «Telegram orqali
   kirish» avval hisobning o'z raqamini (hozirgi shart), topilmasa — tirik
   kartaning zaxira raqamini qidiradi. Asosiy raqam har doim ustun: 1-bosqich
   hisob topsa, parol noto'g'ri bo'lsa ham 2-bosqichga o'tilmaydi.
   2-bosqich faqat o'quvchi rolidagi hisoblar uchun, o'quvchi portalida yoki
   portal cheklanmaganda (lokal, noma'lum Origin); `admin.` / `lehrer.` da yo'q.
2. **Bitta zaxira raqam — bitta o'quvchi.** Zaxira raqam o'z asosiy raqamiga,
   boshqa o'chirilmagan kartaning asosiy yoki zaxira raqamiga, boshqa tirik
   o'quvchi hisobining kirish raqamiga teng bo'lmaydi (`assertExtraPhoneFree`;
   xodim hisobi to'siq emas — ADR-0022). Admin tahriri va yaratishi 400 bilan
   rad etadi; lid aylantirish va arxivdan tiklash to'xtamaydi — band raqam
   ko'chmaydi / olib tashlanadi; olib tashlash kartaning tarixiga tiklash
   tranzaksiyasi ichida yoziladi. Asosiy raqam boshqa
   o'quvchining zaxira raqamiga o'zgarsa, saqlash to'xtatilmaydi — eski zaxira
   o'z-o'zidan kalit bo'lmay qoladi. ADR-0039 «Yo'q, boshqa raqam» yo'lida
   o'z zaxira raqamiga ko'chgan asosiy raqam zaxirani bo'shatadi.
3. **O'quvchi o'zi: joriy parol + yangi raqamga SMS kod** qo'shish va
   o'zgartirishda, **joriy parol** o'chirishda (ADR-0031). SMS — ADR-0039 kod
   mexanizmi va matni, alohida kod uyasi (`extra_phone:code:*`), umumiy
   cheklovlar. ADR-0039 telefon bosqichi o'chiq bo'lsa
   (`STUDENT_PHONE_VERIFICATION_ENABLED` o'chiq yoki Eskiz sozlanmagan — kodda
   `phoneVerificationEnabled`) bu eshik yopiq: zaxira raqami yo'q o'quvchining
   profili «Zaxira raqamni administrator qo'shadi» deb yozadi, raqami borida —
   kirish izohini.
   Zaxira raqamni tasdiqlash asosiy raqamni tasdiqlangan qilmaydi.
4. **O'zgarmaydi:** SMS bilan parol tiklash (faqat asosiy raqam), bot
   sahnalari, Telegram ichidagi kabinet va ilovaning bot orqali kirishi
   (ular bog'langan chat bo'yicha ishlaydi — ADR-0040/0045).

## Ko'rib chiqilgan muqobillar

**Faqat SMS kod, parolsiz** (CEO 02.10 tanlovi). Rad etildi 03.10: ADR-0031
aynan shu variantni rad etgan — ochiq qolgan qurilmada begona o'z raqamini
zaxira qilib qo'shib, keyin o'z Telegram'i orqali parolsiz kirardi.

**Faqat parol, SMS'siz.** Rad etildi (CEO, 03.10): raqam to'g'ri yozilganini
va o'sha odamniki ekanini kod isbotlaydi; eshik SMS yoqilguncha yopiq turadi.

**«Bitta raqam — bitta o'quvchi»ni asosiy raqam yozuvchilarida ham
tekshirish** (bot ro'yxati, mock, admin yaratish). Rad etildi: zaxira raqam
hech kimning ro'yxatdan o'tishiga to'sqinlik qilmasin; narxi — boshqa
o'quvchining zaxira raqami jim o'ladi.

**Bot va Mini App zaxira raqamni tanisin.** Keyinga: 1089 o'quvchidan 1013 tasi
botga asosiy raqami bilan bog'langan; chat bitta ustun, ikki raqam uni
«tortishishi» mumkin — alohida qaror.

## Oqibatlari

Admin kiritgan zaxira raqam darhol kalit: o'quvchi `student.` da parol yoki
Telegram tugmasi bilan kiradi. Admin xato yozgan raqam egasi Telegram orqali
kira oladi — asosiy raqamdagi xavf bilan bir xil. Liddagi «Zaxira raqam»
o'quvchiga ko'chganda kalit bo'ladi. O'quvchi «Parolni unutdingizmi?»ga
zaxira raqamini yozsa kod kelmaydi — profil qatori shuni aytadi.
Poyga: ikki yozuv bir vaqtda o'tsa ikki o'quvchida bir zaxira raqam qolishi
mumkin; Telegram yo'li baribir yopiq holatga o'tadi, parol yo'li o'sha
hisobning parolini talab qiladi.
