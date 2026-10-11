# ADR-0086 — Topshiriq fayllari: yopiq bucket, yuklash server orqali, rasm bilan tasdiqlash

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0074 (topshiriq alohida bo'lim), ADR-0078 (Telegram), ADR-0084 (takrorlanuvchi topshiriq), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §3.2, §3.5, §6.2, §9.4, §9.6; `server/src/tasks/task-file-rules.ts`, `task-files.service.ts`, `task-file-storage.ts`, `task-file-upload.interceptor.ts`; migratsiya `20261011200000_task_files`

## Kontekst

Spec fayllarni yopiq R2 bucket'da saqlashni va brauzer ularni to'g'ridan-to'g'ri (presigned PUT) yuklashini belgilagan. Brauzerdan to'g'ridan-to'g'ri yuklash uchun bucket'da CORS qoidasi kerak — bizdagi kalit uni o'rnata olmaydi, CEO Cloudflare panelida qo'lda qo'yishi kerak bo'lardi. Bundan tashqari, presign → yuklash → tasdiqlash uch qadamli yo'li, tasdiqlanmagan qatorlar va ularni 1 soatda tozalash, fayl turini yuklangandan keyin alohida o'qish kerak bo'lardi. Telegram'dan kelgan fayl esa baribir server orqali o'tadi.

## Qaror

1. Fayllar yopiq `R2_TASKS_BUCKET_NAME` (`daf-tasks`) bucket'da. Hech biri ochiq emas: fayl faqat 10 daqiqalik havola bilan ochiladi, havola har so'rovda topshiriqni ko'ra olish tekshiruvidan keyin beriladi (`GET /tasks/:id/files` hamma faylning havolasini birga qaytaradi).
2. Yuklash server orqali (`POST /tasks/:id/files`, multipart, 20 MB gacha) — spec §9.4 dan farqli. Server faylning turini nomidan emas, ichidagi baytlardan aniqlaydi (JPG, PNG, WebP, PDF, DOCX, XLSX, MP4 va MOV video, ogg/webm/m4a ovoz); boshqa tur bucket'ga yetib bormaydi. Sayt va Telegram bitta yo'ldan yuklaydi. Brauzer R2 havolalarini faqat rasm, pleyer va havola sifatida ochadi, shuning uchun CORS qoidasi kerak emas.
3. Fayl qo'shish huquqi — topshiriqning ijrochisi yoki beruvchisi (CEO, filial direktori ham): kuzatuvchi faylni ko'radi va yuklab oladi, lekin qo'sha olmaydi (403). Ko'rish va yuklab olish — topshiriqni ko'ra oladigan har kimga.
4. Fayl muhokamada bitta qator (`FILE` / `VOICE`), xabari izohnikidek: beruvchi va ijrochilarga (qo'shgan odamdan tashqari, kuzatuvchiga emas); qo'ng'iroqchada «Yangi fayl» / «Ovozli xabar», Telegram'da «Yangi fayl» / «Yangi ovozli xabar». O'chirish — faylni qo'shgan odam yoki beruvchi (CEO, filial direktori); yumshoq, muhokamada «faylni o'chirdi» qatori qoladi, fayl 30 kundan keyin 03:00 da bucket'dan o'chadi.
5. Ovozli xabar 3 daqiqagacha va 2 MB gacha (saytda yozish 48 kbit/s). Bu yerda hajm asosiy cheklov, chunki brauzer aytgan uzunlikka ishonib bo'lmaydi.
6. «Rasm bilan tasdiqlansin» topshiriq berishda qo'yiladi (keyin o'zgartirilmaydi; takrorlanuvchi topshiriqda yo'q, server 400 qaytaradi). Bunday topshiriq tekshiruvga faqat oxirgi qaytarishdan (yoki berilgandan) keyin ijrochi qo'shgan kamida bitta rasm bo'lsa o'tadi — beruvchining namuna rasmi va kuzatuvchining rasmi hisobga kirmaydi; o'ziga yozilgan topshiriq rasmsiz yopiladi.
7. Telegram'da topshiriq xabariga javob qilib yuborilgan rasm, hujjat, video va ovoz topshiriqqa qo'shiladi (izoh — izoh bo'lib). Rasm bilan tasdiqlanadigan topshiriqda yangi rasmi yo'q ijrochi «Bajardim» ni bossa, bot «Rasmni shu xabarga javob qilib yuboring» deydi; rasm kelgach topshiriq tekshiruvga o'tadi.
8. `R2_TASKS_BUCKET_NAME` bo'lmasa fayl funksiyalari o'chiq: tugmalar ko'rinmaydi, server 503 qaytaradi. U R2 kalitlarisiz berilsa — ishga tushishda xato (`env.validation.ts`).

## Spec'dan farqlar

- **Yuklash:** spec presigned PUT (`/files/presign` → PUT → `/complete`) edi; qurilgani — server orqali multer (`memoryStorage`, 20 MB, bitta fayl va ikkita matn maydoni `name`, `durationSec`). CORS yo'q; tasdiqlanmagan qator ham, uni 1 soatda tozalash ham yo'q, `@aws-sdk/s3-request-presigner` faqat o'qish havolasi uchun. Obyekt yozilib, qator yozilmay qolsa, obyekt o'chiriladi; o'chirib bo'lmasa jurnalga yoziladi.
- **`TaskFile.eventId` yo'q:** hodisa faylga ishora qiladi (`TaskEvent.fileId`), bitta yo'nalish yetadi.
- **Ochish:** spec `GET /files/:fileId/url` edi; qurilgani — ro'yxat javobidagi `url` (ko'rsatish) va `downloadUrl` (yuklab olish), har ikkisi 10 daqiqalik. Sayt ro'yxatni 8 daqiqada yangilaydi va hujjat yoki ovozni faqat yangi havola bilan ochadi.
- **Tur aniqlash:** MP4 dan tashqari MOV (`video/quicktime`) ham, ovoz sifatida `audio/mp4` (m4a/m4b brendli) ham qabul qilinadi; sayt tanlash oynasi MOV ni taklif qilmaydi, yozuvchi esa faqat webm/ogg yozadi. Android ovoz yozuvchilarining faqat-audio mp4 fayli `isom` / `mp42` brendi bilan keladi va videodan ajratilmaydi: u `video/mp4` (hujjat) bo'lib saqlanadi, ovoz bo'lmaydi (ajratish uchun `moov` ni o'qish kerak; `ftypMime` ichida `ponytail` izohi). HEIC/AVIF va theora ogg rad etiladi.
- **Katta tana tekshiruvdan oldin o'qiladi:** multer 20 MB gacha faylni xotiraga to'liq yuklaydi, fayllar o'chiq (503) yoki kuzatuvchi yuklayapti (403) tekshiruvlari esa undan keyin, servisda. Marshrut faqat xodimga ochiq (`@AnyStaff()`), shuning uchun bu begonaga emas, ichkaridagi xodimga 20 MB trafik xarajati, va qabul qilingan.
- **Env:** spec `env.validation.ts` 3-bosqichdan boshlab talab qiladi degan edi; qurilgani — majburiy emas: yo'q bo'lsa fayllar o'chiq (ishga tushishda «o'chiq» deb yoziladi), R2 kalitlarisiz berilsa xato.
- **Rasm bilan tasdiqlash takrorlanuvchi topshiriqda yo'q:** ADR-0084 buni 3-bosqichga qoldirgan edi; qurilgani — qoida `requiresPhoto` ni qabul qilmaydi (`task-recurrences.service.ts`), sayt belgisini yashiradi.
- **«Yangi rasm» faqat ijrochiniki:** spec «oxirgi qaytarishdan keyingi rasm» degan; qurilgani — o'sha rasm ijrochi (ASSIGNEE) qo'shgani, o'chirilmagan IMAGE bo'lishi kerak (`hasFreshPhoto`).
- **Telegram:** spec rasm, hujjat, ovoz degan; qurilgani — video ham; rasmning eng kattasi olinadi; stiker, musiqa va dumaloq video «Bu turdagi xabar qabul qilinmaydi» javobini oladi; «Qaytarish» so'roviga fayl yuborilsa rad etiladi (sabab faqat matn). Telegram faylni `getFile` bilan oladi, havola bot tokenini o'z ichiga oladi — u xotirada qoladi, jurnalga yozilmaydi.

## Ko'rib chiqilgan muqobillar

- Presigned PUT (spec): CORS uchun CEO'ning qo'lda qadami, uch qadamli yuklash, tasdiqlanmagan qatorlarni tozalash va turni keyin tekshirish kerak bo'lardi. Serverdan o'tishning narxi — har yuklashda bir so'rov davomida 20 MB gacha xotira — bizning hajmda sezilmaydi.
- `TaskFile.eventId` (spec): hodisa faylga ishora qiladi (`TaskEvent.fileId`), bitta yo'nalish yetadi.
- Kuzatuvchiga ham fayl qo'shishni ochish: kuzatuvchi topshiriqni bajarmaydi, fayl esa «rasm bilan tasdiqlash» isboti bo'la oladi; ochiq qoldirish ish ko'rinishini bulg'ardi. Kuzatuvchi izoh yoza oladi.

## Oqibatlari

- Kartada fayl soni, varaqda «Fayllar» bo'limi (rasmlar katta ko'rinishda, hujjatlar qator bo'lib; rasm bilan tasdiqlanadigan topshiriq tekshiruvda bo'lsa — varaq tepasida), muhokamada rasm, hujjat va ovoz pleyeri (1x / 1,5x).
- Server xotirasi va trafigi fayl hajmicha oshadi; ko'paysa — presigned PUT ga qaytish shu ADR'ni almashtiradi.
- Saqlanmay qolgan (qatori yozilmagan va o'chirib bo'lmagan) obyekt jurnalga yoziladi, avtomatik tozalanmaydi.
- Deploydan oldin CEO Cloudflare'da `daf-tasks` bucket'ini ochib, Railway'da `R2_TASKS_BUCKET_NAME` ni qo'yadi; shu paytgacha sayt va bot fayl imkoniyatlarisiz ishlaydi.
