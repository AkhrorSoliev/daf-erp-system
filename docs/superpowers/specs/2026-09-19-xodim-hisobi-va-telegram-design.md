# Xodim hisobi va Telegram bog'lanishi — dizayn

**Sana:** 2026-09-19 · **Holat:** CEO bilan kelishildi, 1-bosqich rejalashtirildi

## Muammo

Ikki holat CEO tomonidan aytildi:

1. O'quvchi bo'lib yurgan odam ustoz bo'ldi — bot uni xodim sifatida
   ro'yxatdan o'tkazmayapti.
2. Sinov uchun ustoz bo'lib o'tgan xodim hisobi o'chirilgan — odam qayta
   xodim bo'lib o'tolmayapti.

Tekshiruvda (kod + prod bazada faqat o'qish) yana shular topildi:

- Xodim havolasi (`employee_..._sig_...`) muddatsiz va bir martalik emas —
  kim ushlasa, o'sha filialda o'sha rol bilan o'tadi.
- Bot yuborilgan kontakt karta aynan shu odamniki ekanini tekshirmaydi
  (ro'yxatdan o'tish sahnalarida umuman yo'q; parol tiklashda `user_id`siz
  karta o'tib ketadi). Bu begonaning raqami bilan ro'yxatdan o'tish va
  begona o'quvchining hisobini o'ziga bog'lab parolini olish yo'lini ochadi.
- Prodda bitta raqamda ikkita admin hisobi turgan ikki holat bor
  (#10737/#10456, #10740/#10494). SMS tiklash va parol bilan kirish oxirgi
  o'zgargan hisobni tanlaydi, Telegram bilan kirish rad etadi.
- 4 o'quvchi kirish hisobisiz yaratilgan (#10628, #10593, #10577, #11070) —
  raqami boshqa o'quvchining kirish nomi bo'lgani uchun hisob ochilmagan.
- Xodim parolini SMS orqali tiklash jurnalga umuman yozilmaydi.
- Kod izohlari va `server/CLAUDE.md` «`User.login` unique emas» deydi; baza
  esa tirik qatorlar orasida unique qiladi (`User_login_key ... WHERE
  "deletedAt" IS NULL`, migratsiya `20260327021835`). Prisma sxemasi buni
  ifodalay olmaydi, shuning uchun hech kim ko'rmagan.

## Ildiz sabab

Ikki narsa:

1. **Kirish nomi = telefon** har uchala yaratish yo'lida (o'quvchi boti,
   xodim boti, admin «O'qituvchi qo'shish»), baza esa bitta nomga bitta tirik
   hisob beradi. O'quvchi hisobi turganda xodim hisobi bazada rad etiladi.
   Bot va admin paneldagi «raqam band» tekshiruvlari bu to'siqning ustidagi
   qo'shimcha to'siqlar (bot o'chirilganlarni ham sanaydi — bu aniq xato).
2. **Kimlik telefon raqamiga tayanadi**, telefon esa isbotlanmaydi va
   ko'pchilikda Telegram raqami bilan ishlatadigan raqami har xil.

## Tamoyil

**Bir odam — har roli uchun alohida hisob, bitta telefon. Xodim hisobini
javobgar odam ochadi. Telegram telefon raqamiga emas, hisobga bog'lanadi.**

Nega bitta hisob emas: o'quvchi parolini admin ham (o'quvchi profilida
o'zgartira oladi), ota-ona ham biladi — bitta hisob bo'lsa o'sha parol
ustoz/admin sahifasini ochib qo'yardi. Kirish sahifasi ham o'quvchi rolli
odamni o'quvchi sahifasiga yo'naltiradi. Tizim «hisob = bitta tur» deb
yozilgan; prodda ham bir odamda ham o'quvchi, ham xodim roli bo'lgan hisob 0
ta. Alohida hisob esa tizimning mavjud amaliyoti: kirish, SMS tiklash va
Telegram bilan kirish allaqachon portalga qarab hisob tanlaydi.

## Qaror — uch bosqich

Har bosqich alohida chiqariladi va o'zi mustaqil foyda beradi.

### 1-bosqich — Qoidalar (bu reja)

- **Bitta telefonga bitta ishlab turgan xodim hisobi.** O'quvchi hisobi va
  o'chirilgan hisob xalaqit bermaydi. Ishlab turgan xodim hisobi bo'lsa —
  yangi hisob ochilmaydi, admin o'sha hisobga rol qo'shadi. Qoida
  `UsersService.create` da turadi (admin formasi ham, bot ham shu yerdan
  o'tadi) va `TeachersService.create` da (u to'g'ridan yaratadi). Bot
  sahnasida esa erta tekshiruv — rasm yuklashdan oldin.
- **Kirish nomi:** telefon bo'sh bo'lsa telefon, band bo'lsa bo'sh. Kirish
  baribir telefon bo'yicha (`AuthService.buildAccountLookup` `phone` ni ham
  qaraydi). Bu qoida o'quvchi hisobi yaratishga ham qo'llanadi — o'quvchi
  hisobi endi hech qachon yarim yaratilmaydi.
- **Bot kontakt kimligini tekshiradi** — to'rt sahnada ham (xodim, o'quvchi,
  parol tiklash, mock imtihon): `contact.user_id` bor va yuboruvchi bilan
  teng bo'lishi shart. `user_id` yo'q — isbotlanmagan — rad.
- **Har parol tiklash jurnalga yoziladi** — o'quvchiniki `Student` da,
  xodimniki `User` da.
- Kod izohlari va `server/CLAUDE.md` haqiqatga moslanadi; ADR yoziladi.

Nima o'zgarmaydi: parol tiklash yo'llari (o'quvchi — bot/SMS/admin; xodim —
SMS/admin), havola mexanizmi, klient. Baza migratsiyasi yo'q.

### 2-bosqich — Hisobni admin ochadi, bot bog'laydi

- Xodim hisobi faqat admin panelida yaratiladi (forma bor). Bot orqali
  o'z-o'zidan ro'yxatdan o'tish yopiladi; eski havolaga «administratordan
  shaxsiy havola so'rang» deyiladi.
- Xodim profilida «Telegram havola» tugmasi **shaxsiy, bir martalik, 3
  kunlik** havola beradi (Redis'da `tg_invite:<token>` → userId). Odam
  ochadi → bot «Siz *Ism Familiya* sifatida bog'lanyapsiz, to'g'rimi?» →
  tasdiqlasa `User.telegramChatId` yoziladi, parol yaratilib himoyalangan
  xabarda yuboriladi (5 daqiqada o'chadi). **Telefon so'ralmaydi** — Telegram
  raqami boshqa bo'lsa ham ishlaydi.
- Telegramni almashtirish: admin profilda «Telegramni uzish», keyin yangi
  havola.
- Xodim parolni botdan tiklaydi — faqat bog'langan chat orqali; telefon
  yuborib yangi Telegramni bog'lab olish **yo'q**. Bir chatda ikki hisob
  (o'quvchi + xodim) bo'lsa bot qaysi birini so'raydi. Cheklov: 5 daqiqada
  bir, kuniga uch marta (mavjud `checkThrottle`, kalit `userId`).

### 3-bosqich — Sayqal va tozalash

- «Telegram bilan kirish» avval bog'langan Telegram bo'yicha, keyin raqam
  bo'yicha — raqami farqli odamlarda ham ishlaydi.
- Arxivdan tiklashda nom/raqam band bo'lsa tushunarli xabar.
- Prod tozalash (CEO bilan): ikkita admin-dublikatini bittaga qo'shish; 4
  o'quvchiga kirish hisobi ochish.

## Xavfsizlik tahlili

| Xavf | 1-bosqichdan keyin | 2-bosqichdan keyin |
|---|---|---|
| Begona raqam bilan ro'yxatdan o'tish | Yopiq (kontakt tekshiruvi) | Yopiq (telefon so'ralmaydi) |
| Begona o'quvchi hisobini bog'lab parol olish | Yopiq (kontakt tekshiruvi) | Yopiq |
| Havola tarqalishi | Ochiq (abadiy kalit) | Yopiq (bir martalik, 3 kun, bitta hisob) |
| Bitta raqamda ikki xodim hisobi | Yangi paydo bo'lmaydi | — |
| Xodim parol tiklashi izsiz | Yopiq (jurnal) | — |

Kontakt tekshiruvining narxi: Telegram raqami tizimdagi raqamidan farq
qiladigan, hali bog'lanmagan o'quvchi botdan parol tiklay olmaydi — SMS
ishlatadi (SMS tizimdagi raqamga boradi). Bot orqali o'tgan o'quvchilarda
raqam bir xil (kontakt tugmasidan olingan), ular ta'sirlanmaydi.

## Ko'rib chiqilgan va rad etilgan yo'llar

- **Bitta hisob, ko'p rol** — yuqorida (Tamoyil).
- **Telefon bo'yicha bog'lash** (admin telefon kiritadi, bot o'z kontaktini
  yuborsa moslashadi) — Telegram raqami bilan ishlatadigan raqam ko'pchilikda
  har xil; odam tiqilib qoladi. Shaxsiy havola buni hal qiladi.
- **Faqat botdagi to'siqni olib tashlash** — baza baribir rad etadi (kirish
  nomi unique), ya'ni belgini davolash.

## Rejadan tashqarida

- `teacher-registration.scene.ts` — `/start` unga yo'l bermaydi (havola
  nafaqada), o'lik kod. 2-bosqichda olib tashlanadi.
- Parol tiklash sahnasidagi o'ziga xos telefon normalizatsiyasi
  (`normalizeSharedPhone` emas) — chet el raqamlarini rad etadi; alohida.
- `UsersService.update` orqali mavjud xodimga boshqa xodimning telefonini
  yozish — 3-bosqichda.
