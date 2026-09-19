# ADR-0022: Bir odam — har rolga alohida hisob; kimlik telefon emas, bog'lanish

**Holat:** Qabul qilingan · **Sana:** 2026-09-19

## Kontekst

Bir odam o'quvchi ham, xodim ham bo'la oladi (o'quvchi ustoz bo'ldi; xodim
sinov uchun o'quvchi bo'lib ko'rdi). Uchala hisob yaratish yo'li (o'quvchi
boti, xodim boti, admin «O'qituvchi qo'shish») kirish nomiga telefonni
yozardi, baza esa tirik qatorlar orasida bitta nomga bitta hisob beradi
(`User_login_key ... WHERE "deletedAt" IS NULL`). Natijada o'quvchi hisobi
turganda xodim hisobi ochilmasdi; bot esa o'chirilgan hisoblarni ham «band»
deb sanardi. Kod izohlari «login unique emas» deb yozilgan edi — sxema qisman
indeksni ko'rsatmaydi.

Bundan tashqari bot yuborilgan kontakt kartaning kimniki ekanini
tekshirmasdi, xodim havolasi esa muddatsiz. Prodda bitta raqamda ikkita
admin hisobi (2 juft) va kirish hisobisiz 4 o'quvchi topildi.

## Qaror

1. **Bir odam — har roli uchun alohida hisob, bitta telefon.** O'quvchi
   hisobi xodim hisobi ochilishiga to'sqinlik qilmaydi; o'chirilgan hisob
   ham. Bitta telefonga ko'pi bilan **bitta ishlab turgan xodim** hisobi —
   ikkinchi rol mavjud hisobga qo'shiladi.
2. **Kirish nomi uydirilmaydi:** telefon bo'sh bo'lsa telefon, band bo'lsa
   bo'sh. Kirish telefon bo'yicha.
3. **Bot kontaktni faqat `user_id` yuboruvchi bilan teng bo'lganda qabul
   qiladi.** `user_id` yo'q — isbotlanmagan — rad.
4. **Har parol tiklash jurnalga yoziladi** — o'quvchiniki `Student`,
   xodimniki `User` da.
5. Keyingi bosqichlar (alohida ADR bilan): xodim hisobini faqat admin
   ochadi, bot shaxsiy bir martalik havola bilan Telegramni hisobga
   bog'laydi va parol beradi; «Telegram bilan kirish» bog'lanish bo'yicha.

## Sabab

Bitta hisobga ikki rol berish rad etildi: o'quvchi parolini admin ham
(o'quvchi profilida o'zgartiradi), ota-ona ham biladi — bitta hisob bo'lsa
o'sha parol ustoz/admin sahifasini ochib qo'yardi; kirish sahifasi ham
o'quvchi rolli odamni o'quvchi sahifasiga yo'naltiradi; tizim «hisob = bitta
tur» deb yozilgan va prodda bunday hisob 0 ta. Alohida hisob esa mavjud
amaliyot: kirish, SMS tiklash, Telegram OAuth allaqachon portalga qarab hisob
tanlaydi.

Telefon raqamiga tayanish rad etildi: ko'pchilikda Telegram raqami bilan
ishlatadigan raqami har xil.

## Oqibat

- Bir odamda ikkita parol bo'ladi (o'quvchi va xodim). Bot parol tiklashda
  keyingi bosqichda qaysi hisobni so'raydi.
- Telegram raqami tizimdagidan farqli, bog'lanmagan o'quvchi botdan parol
  tiklay olmaydi — SMS ishlatadi.
- Prodda mavjud ikki admin-dublikat va 4 hisobsiz o'quvchi qo'lda
  tartibga solinadi (3-bosqich).
- `teacher-registration.scene.ts` o'lik kod — keyingi bosqichda olib
  tashlanadi.
