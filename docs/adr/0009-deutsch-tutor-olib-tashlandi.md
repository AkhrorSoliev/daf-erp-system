# ADR-0009 — Deutsch Tutor noldan qayta quriladi, eski qatlam butunlay olib tashlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-08-19
**Bog'liq:** `client/src/lib/student-nav-items.ts`, `server/src/students/`, `prisma/schema.prisma`

## Kontekst

O'quvchi portalidagi «Deutsch Tutor» (`/portal/ai`) 2026-yil boshida yozilgan:
frontend'da 7 komponent (748 qator), backend'da controller + service + prompt +
testlar (1301 qator), Prisma'da `AiConversation` va `AiChatMessage` jadvallari,
o'quvchining yon panelidagi gradient karta va pastki menyudagi ko'tarilgan
markaziy tugma.

**Bu xususiyat hech qachon ishlamagan.** `AiService` `OPENAI_API_KEY` env
o'zgaruvchisini talab qiladi; u lokal `server/.env` da bor, lekin Railway
production muhitida umuman qo'yilmagan. Kalitsiz `ensureClient()` xato tashlaydi
va o'quvchi faqat «AI javob berishda xatolik yuz berdi» xabarini ko'radi.

Production bazasi buni tasdiqlaydi (2026-08-19 o'lchovi):

| Ko'rsatkich | Soni |
|---|---|
| Yaratilgan suhbatlar | 193 |
| O'quvchi xabarlari | 73 |
| **AI javoblari** | **0** |

Oxirgi urinish 2026-08-17. Ya'ni o'quvchilar kartani bosgan, savol yozgan va
193 marta javobsiz qolgan. Ishlamaydigan xususiyat menyuning eng ko'zga
tashlanadigan joyida turgan.

## Qaror

Deutsch Tutor **butunlay olib tashlanadi** — sahifa, komponentlar, controller,
service, prompt, `AiService`, `openai` paketi, ikkala Prisma jadvali va
`AiUseCaseType` enum'i. Bo'sh sahifa yoki «tez orada» placeholder qoldirilmaydi.

Xususiyat kelajakda **boshqa strukturada, noldan** quriladi va o'z ma'lumot
modelini o'zi olib keladi.

**Taqiqlanadi:** eski `AiConversation` / `AiChatMessage` shaklini yoki
`student-portal/ai-chat` API kontraktini «bor ekan, ishlataylik» deb qayta
tiklash. Yangi qurilish eski sxemaga moslashmaydi.

## Ko'rib chiqilgan muqobillar

**Railway'ga `OPENAI_API_KEY` qo'yib, borini ishlatib yuborish.** Eng arzon yo'l
va bir necha daqiqada natija berardi. Rad etildi: kod hech qachon jonli javob
bilan sinalmagan — 0 ta muvaffaqiyatli almashinuv bor, ya'ni streaming, xato
holatlari, kontekst kesish, sarlavha yaratish qismlarining birortasi ham
haqiqatda tekshirilmagan. Ishlamagan qatlamni yoqish sinovdan o'tgan tizim
bermaydi, faqat nosozlikni o'quvchiga ko'rsatadi.

**Sahifani bo'sh qoldirib, backend'ni saqlab turish.** Rad etildi: yangi
struktura boshqacha bo'lishi oldindan ma'lum, shuning uchun saqlangan backend
o'lik kodga aylanadi va har bir refaktorda «bu nima, tegsam bo'ladimi?» degan
savol tug'diradi.

**Jadvallarni saqlab, faqat kodni o'chirish.** Rad etildi: `AiConversation` da
193 ta bo'sh suhbatdan boshqa hech narsa yo'q, saqlashga arzigulik ma'lumot
emas. Bo'sh jadval keyingi dizaynni o'ziga tortadi — modelni ehtiyojga emas,
mavjud ustunlarga moslash xavfi paydo bo'ladi.

## Oqibatlari

**Yutuq:** o'quvchi ishlamaydigan tugmani bosmaydi. ~2000 qator kod va bitta
tashqi paket (`openai`) kamaydi. `branch-route-policy` da 5 ta route, filial
bo'shatish rejasida bitta model kamroq kuzatiladi. Yangi qurilish hech qanday
meros cheklovisiz boshlanadi.

**Narx:** eski implementatsiya faqat git tarixida qoladi. Qayta qurishda
prompt'lar, rejim tanlash oqimi va streaming SSE kontrakti noldan yoziladi.

**Endi taqiqlangan:** `/portal/ai` route'i va `student-portal/ai-chat` API
prefiksi bo'sh — yangi xususiyat ularni qayta ishlatishi mumkin, lekin eski
DTO/model shaklini emas.
