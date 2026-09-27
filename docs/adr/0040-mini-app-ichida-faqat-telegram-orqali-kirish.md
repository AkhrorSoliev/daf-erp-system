# ADR-0040 — Mini App ichida o'quvchi faqat Telegram orqali kiradi; bog'lanmagan akkauntga xabar ko'rsatiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0022 (kimlik — bog'lanish), ADR-0039 (Telegram raqamni tasdiqlamaydi; birinchi kirish qadamlari), ADR-0030 (sessiya versiyasi), ADR-0033 (hisob kartasi bilan yopiladi), `server/src/auth/telegram-webapp/`, `server/src/telegram/utils/mini-app.ts`, `client/src/components/telegram-mini-app/`, `client/src/middleware.ts`

## Kontekst

O'quvchi portali (`student.dafzentrum.uz/portal`) — telefonga moslangan web
ilova. Botning bosh menyusidagi «🎓 Platformaga kirish» tugmasi «tez kunda»
deb turardi. Telegram Mini App — bot ichida ochiladigan web sahifa; Telegram
unga `initData` beradi: foydalanuvchi, vaqt va bot tokeni bilan olingan
HMAC-SHA256 imzo.

O'quvchini Telegram akkauntiga `Student.telegramChatId` bog'laydi. Bot uni
faqat odam «📱 Telefon raqamni yuborish» bilan o'z Telegram raqamini yuborganda
va u kartadagi raqamga mos kelganda yozadi (ro'yxatdan o'tish, «Parolni
tiklash», «💳 To'lovlar», mock), va botning parol tiklashi shu bog'lanishga
ishonib yangi parolni chatga yuboradi. Bu bog'lanish karta raqamini
tasdiqlamaydi (ADR-0039) — faqat shu Telegram akkaunt shu kartaniki ekanini
bildiradi.
Bitta Telegram'ga bir nechta farzand bog'lanishi mumkin (ota-onaning raqami).
Admin panelda bog'lash yo'q.

## Qaror

1. Kirish nuqtasi — `student.dafzentrum.uz/tg`. U `initData` ni
   `POST /auth/telegram/webapp` ga yuboradi. Server imzoni asosiy bot tokeni
   bilan tekshiradi: `hash` dan boshqa barcha maydon, kalit bo'yicha saralangan,
   `\n` bilan; kalit — `HMAC_SHA256("WebAppData", token)`. Takrorlangan kalit
   rad etiladi, maydonlar imzodan keyin o'qiladi.
2. `auth_date` bir soatdan eski (yoki 60 soniyadan ko'proq kelajakda) bo'lsa —
   rad: «Mini App'ni yopib, qayta oching». `initData` bir martalik emas.
3. `user.id` → `Student.telegramChatId` (`deletedAt: null`):
   - hech kim — `not_registered` (200, xato emas), klient xabar ko'rsatadi;
   - hisobi bor bitta o'quvchi — sessiya;
   - bir nechta — `choose` (faqat ism va id); tanlangan `studentId` shu
     ro'yxatdan bo'lmasa 403;
   - hisobi yo'q — «Sizda ilova hisobi yo'q. Administrator bilan bog'laning.»

   Sessiyani `buildStudentSession` beradi — native ilova bilan bitta funksiya
   (rol 6, bloklangan hisob, ADR-0033).
4. Mini App ichida telefon/parol formasi yo'q. Kirish har doim sessiyasiz
   boshlanadi; `/login` ga tushgan Mini App oynasi (`sessionStorage` belgisi)
   `/tg` ga qaytariladi; «Chiqish» `/tg` da «Qayta kirish» ni kutadi.
5. Bog'lanmagan akkauntga xabar botdagi «💳 To'lovlar» yo'lini ko'rsatadi: u
   o'z raqamini yuborgan odamni hech narsaga tegmasdan bog'laydi.
6. Bot: `TELEGRAM_MINI_APP_URL` (https, ishga tushishda tekshiriladi)
   sozlansa, bosh menyu tugmasi shaxsiy chatda Mini App'ni ochadi, eski
   callback tugmaga Mini App tugmasi bilan javob beriladi, standart menyu
   tugmasi «Kabinet» bo'ladi. Manzil olib tashlansa menyu tugmasi o'zi
   qaytmaydi — BotFather'da qaytariladi (prod tokenli lokal server prod
   menyusini tozalamasin).
7. Kanal a'zoligi talabi Mini App'ga qo'llanmaydi — web portalga ham
   qo'llanmaydi.

**Taqiqlanadi:** Mini App ichida parol yoki telefon bilan zaxira kirish;
`telegramChatId` ni Mini App'dan yozish (bog'lash faqat botda, Telegram raqami
karta raqamiga mos kelganda); Mini App kirishini karta raqamining tasdig'i
deb hisoblash (ADR-0039); `initDataUnsafe` ga yoki imzosiz maydonga ishonish; bir nechta
bog'langan o'quvchidan birini serverning o'zi tanlashi.

## Ko'rib chiqilgan muqobillar

**Expo ilovasini webga eksport qilish.** Rad: `expo-secure-store`, kamera,
push va Skia webda almashtirilishi kerak, natija — bir ilovaning ikkinchi web
nusxasi. Web portalda funksiya ham ko'proq (Ta'lim, radio).

**Mini App ichida Telegram OAuth.** Rad: redirect oqimi va telefon bo'yicha
qidiruv (bir raqamda bir necha akkaunt — yopiq); `initData` tayyor imzo beradi.

**`initData` ni bir martalik qilish (Redis).** Rad: sahifa qayta yuklansa
kirish buzilardi. Satr faqat foydalanuvchi WebView'ida va bizning TLS
so'rovimizda bo'ladi; XSS bo'lsa tokenlar baribir cookie'da. O'rniga 1 soat.

**24 soatlik muddat (tma.js standarti).** Rad: bir o'tirishga («Chiqish» →
«Qayta kirish», sessiya tugashi) bir soat yetadi; sizib chiqqan satr refresh
token darajasidagi kalitga aylanmasin.

**Ota-ona uchun yopiq holat.** Rad: bog'lanishni ota-ona o'z raqami bilan
qilgan, botning «To'lovlar» i ham farzandni tanlatadi.

**Mini App ichida `requestContact` bilan bog'lash.** Hozircha yo'q: yangi
bog'lash eshigi alohida xavfsizlik tahlilini talab qiladi, buyurtma esa —
xabar.

## Oqibatlari

**Yutuq:** o'quvchi parolsiz, bir bosishda kiradi (birinchi kirish qadamlari —
ADR-0039 — Mini App'da ham so'raladi); kimlik modeli mavjud
eshiklardan kengaymaydi — botning parol tiklashi bilan bir xil ishonch.

**Narx:** Telegram Web (brauzer) Mini App'ni iframe ichida ochadi — u yerda
sessiya cookie'lari `/portal` ga yetib bormasligi mumkin. Kirishdan keyin tez
orada `/tg` ga qaytilsa, cheksiz aylanish o'rniga Telegram ilovasidan ochish
haqida xabar chiqadi; mobil va desktop ilovalarida bunday muammo yo'q. Payme/Click sahifalari WebView ichida
ochiladi — alohida sinash kerak. `telegramChatId` i bo'sh o'quvchilar avval
botda bog'lanishi kerak.
