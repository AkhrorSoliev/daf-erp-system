# ADR-0045 — Bot xodimni Telegram bog'lanishi bilan taniydi; xodim kabineti Mini App'da parolsiz ochiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-28
**Bog'liq:** ADR-0022 (bir odam — har rolga alohida hisob; 5-banddagi bog'lash shu ADR bilan hal bo'ldi), ADR-0028 (bloklangan xodim), ADR-0031 (telefon — kirish kaliti), ADR-0040 (o'quvchi Mini App'i), `server/src/common/auth/staff-telegram.ts`, `server/src/telegram/staff/`, `server/src/auth/telegram-webapp/`, `client/src/components/telegram-mini-app/`

## Kontekst

Botning bosh menyusi va doimiy «Kabinet» tugmasi faqat o'quvchi uchun yozilgan
edi. Botda ro'yxatdan o'tgan xodimning chati `User.telegramChatId` ga
yoziladi, lekin botning hamma funksiyasi chatni faqat `Student.telegramChatId`
dan qidirardi: ustoz botda o'quvchi menyusini ko'rardi, «Kabinet» o'quvchi
portalini ochib «ro'yxatdan o'tmagansiz» derdi. Ustozning raqami biror o'quvchi
kartasida bo'lsa, «💳 To'lovlar» chatni o'sha kartaga bog'lardi va «Kabinet»
o'sha o'quvchining kabinetini parolsiz ochardi.

Prod, 2026-09-28: 18 ta ustoz, 17 tasining Telegram'i bog'langan, 1 tasi
bog'lanmagan. Ustozlardan tashqari administrator, kassir va direktorlar ham
botdan foydalanadi.

Mavjud xodim hisobiga Telegram'ni bog'lash yo'li yo'q edi: bog'lanish faqat
xodim havolasi orqali ro'yxatdan o'tishda yoziladi, havola esa mavjud telefon
bilan ikkinchi xodim hisobini ochmaydi (ADR-0022), admin panelda bog'lash yo'q.

Web portallardagi «Telegram bilan kirish» (OAuth) xodimni Telegram tasdiqlagan
raqami hisobdagi telefonga teng bo'lsa parolsiz kiritadi.

## Qaror

1. **Xodim — `User.telegramChatId` orqali.** Bot, Mini App va bog'lash bitta
   shartdan o'qiydi (`common/auth/staff-telegram.ts`): o'chirilmagan, holati
   ACTIVE yoki INACTIVE (parol kirishidagi ro'yxatning o'zi —
   `SIGN_IN_USER_STATUSES`), xodim roli (1–5) bor hisob. Rolsiz xodim
   tanilmaydi — u tizimga kira olmaydi (ADR-0007). Parolsiz hisobni Mini App
   kiritmaydi — Telegram OAuth kabi. Bir chatga bir nechta shunday hisob
   bog'langan bo'lsa — yopiq holat: bot xodim menyusini bermaydi, Mini App
   rad etadi.
2. **Portal — rollar bo'yicha.** Admin rollaridan (1, 2, 3, 5) biri bo'lsa —
   `admin.`, faqat ustoz bo'lsa — `lehrer.`. Xodim kabineti — portalning o'zi,
   `/tg` sahifasi orqali Mini App bo'lib ochiladi. Manzil
   `TELEGRAM_MINI_APP_URL` dan: xostdagi `student.` o'rniga `lehrer.` yoki
   `admin.`. O'quvchi manzili sozlanmagan yoki `student.` xostida bo'lmasa —
   xodim kabineti o'chiq, bot avvalgidek ishlaydi.
3. **Bot.** `/start` da chat xodimniki bo'lsa — xodim salomi va menyusi
   (💼 Kabinet → o'z profili; 📅 Jadval; 👥 Guruhlar; ustozga 💰 Oyligim;
   chat o'quvchi kartasiga ham bog'langan bo'lsa 🎓 O'quvchi kabineti), va
   shu chatning doimiy «Kabinet» tugmasi xodim kabinetiga o'rnatiladi
   (`setChatMenuButton` + `chat_id`; Telegram chatnikini standartdan ustun
   qo'yadi). Xodimligi tugagan chat (hisob arxivlandi, bloklandi, boshqa
   chatga o'tdi) keyingi `/start` da o'quvchi tugmasiga qaytadi. Aniqlash har
   safar bazadan: keyinroq bog'langan xodimda ham darhol ishlaydi. Xodim
   ro'yxatdan o'tishi tugaganda menyu shu zahoti ko'rsatiladi.
4. **Mini App.** `POST /auth/telegram/webapp/staff`: `initData` imzosi
   (ADR-0040 tekshiruvi), portal rollari `Origin` dan, sessiyani parol
   kirishidagi `AuthService.login` beradi — portal darvozasi o'sha yerda.
   Mos hisob yo'q — `not_registered` (200). O'quvchi eshigi Telegram xodimniki
   bo'lsa `staff` qaytaradi: klient uni botga yo'naltiradi. Kirgandan keyin
   xodim o'z profilida ochiladi; bot tugmalaridagi `?next=` faqat ro'yxatdagi
   sahifalarni (profil, oylik, jadval, guruhlar, bosh sahifa) ochadi.
5. **Bog'lash.** `t.me/<bot>?start=xodim` yoki `/xodim`: odam o'z kontaktini
   yuboradi (`user_id` yuboruvchiga teng — ADR-0022, 3-band); raqam aynan
   bitta kira oladigan xodim hisobining telefoniga teng bo'lsa,
   `User.telegramChatId` shu chatga yoziladi. Raqam bir nechta hisobda — rad.
   Chat boshqa xodim hisobiga bog'langan bo'lsa, o'sha bog'lanish olinadi
   (bitta Telegram — bitta xodim hisobi); hisob boshqa chatga bog'langan
   bo'lsa, yangi chatga o'tadi va eski chatning tugmasi qaytariladi. Har
   o'zgarish `User` tarixiga yoziladi, bajaruvchi — xodimning o'zi. Raqam mos
   kelmasa, administrator hisobdagi telefonni Telegram raqamiga almashtiradi
   (ADR-0031 yo'li).

**Taqiqlanadi:** `telegramChatId` ni Mini App'dan yozish; bir nechta bog'langan
xodim hisobidan birini serverning o'zi tanlashi; Telegram eshiklari uchun parol
kirishidan farqli holat ro'yxati; `next` bilan ro'yxatdan tashqari manzilga
o'tish.

## Ko'rib chiqilgan muqobillar

**Admin paneldan shaxsiy bir martalik havola (ADR-0022, 5-band rejasi).**
Hozircha yo'q. Havola — egasiz kalit: uzatilsa, begona odam o'z Telegram'ini
xodim hisobiga bog'lab parolsiz kirardi, shuning uchun bir martalik saqlash,
rank tekshiruvi va admin UI kerak bo'lardi. Kontakt isboti — web OAuth kirishi
allaqachon ishonadigan isbotning o'zi, bitta bog'lanmagan ustozga yetadi.
Telegram raqami tizimdagidan farq qiladigan xodimlar ko'paysa, qaytib
ko'riladi.

**Bitta Mini App manzili, xodimni o'quvchi xostidan xodim xostiga o'tkazish.**
Rad: `initData` URL hash'ida keladi va boshqa xostga o'tganda yo'qoladi,
sessiya cookie'lari xostga bog'langan, portal darvozasi `Origin` bilan
ishlaydi.

**Faqat «faqat ustoz» hisoblari.** Rad: ustoz ham, administrator ham bo'lgan
hisobni chiqarib tashlash hech bir eshikni toraytirmaydi — web OAuth ularni
allaqachon parolsiz kiritadi. Boshqa xodimlar ham botdan foydalanadi.

**Har bir `/start` da «Kabinet» tugmasini qayta o'rnatish.** Rad: har bir
o'quvchining `/start`i Telegram so'roviga aylanardi. Tugma faqat biror hisob
hali shu chatni ko'rsatib turgan bo'lsa qaytariladi.

## Oqibatlari

**Yutuq:** ustoz va boshqa xodimlar botda o'z menyusini, «Kabinet»da o'z
portalini parolsiz ko'radi; bog'lanmagan xodim o'zini o'zi bog'laydi; o'quvchi
kabinetini ochgan xodim to'g'ri yo'lga yo'naltiriladi. Botda ro'yxatdan o'tgan
xodimga «allaqachon ro'yxatdan o'tgansiz» xabari endi o'z portalini ko'rsatadi
(avval ustozga ham `admin.` ko'rsatilardi).

**Narx:** Telegram hisobi qo'lga tushsa, xodim hisobi ham — web OAuth
kirishidagi xavfning o'zi. Telegram WebView fayl yuklab olmaydi (ADR-0040):
xodim portalidagi PDF/Excel tugmalari Mini App ichida ishlamasligi mumkin, web
portal o'zgarmaydi. Xodim portali telefon kengligida sinab borilishi kerak.
Oldin bog'langan xodimning doimiy «Kabinet» tugmasi u `/start` bosguncha
o'quvchinikida qoladi — o'quvchi eshigi uni `staff` javobi bilan botga
yo'naltiradi.
