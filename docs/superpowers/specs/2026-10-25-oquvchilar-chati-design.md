# O'quvchilar o'rtasidagi shaxsiy chat — dizayn

Sana: 2026-10-25. Holat: dizayn tasdiqlangan (CEO bilan savol-javob), amalga oshirish rejasi hali yo'q.

## Maqsad

Ikki o'quvchi o'rtasida Telegramdagi kabi shaxsiy yozishma: matn, rasm, ovozli xabar. Chat
o'quvchini doimiy mashq qilishga undaydi: yozish uchun qarzsiz bo'lish, ma'lumotni to'liq
kiritish, telefonni tasdiqlash va oxirgi 7 kunda belgilangan mashq va radio vaqtini bajarish kerak.

## Qamrov

Kiradi: shaxsiy (1–1) yozishma; `@username`; maxfiylik sozlamalari; bloklash; shikoyat; CEO
shikoyat ko'rishi va chatdan chiqarish; veb-portal, mobil ilova va Telegram Mini App; bildirishnoma
(qo'ng'iroqcha, push, Telegram tugma bilan).

Kirmaydi (keyingi bosqichlar): guruh yoki umumiy chat; «onlayn / oxirgi marta» belgisi; qo'ng'iroq;
jang, do'stlik, medal (dizaynda bor, so'ralmagan); xodimning yozishmani o'qishi (faqat shikoyat
orqali); telefon raqami bo'yicha qidirish.

## 1. Kim yoza oladi (`ChatAccessService`)

Bitta manba; veb, ilova va Mini App unga so'raydi, o'zlari hech narsa hisoblamaydi. Javob:
`{ canWrite, reasons[], progress, warning }`.

Yozish uchun to'rt shart ham bajarilishi kerak:

1. Qarz yo'q: `Student.balance >= 0`.
2. Ma'lumot to'liq: `missingOnboardingSteps` (jins, tug'ilgan sana, tasdiqlangan telefon) bo'sh.
3. Oxirgi 7 Toshkent kunida (bugun bilan) `StudentAppSession.activeSeconds` yig'indisi ≥ X daqiqa.
4. Shu oynada `StudentAppSession.radioSeconds` yig'indisi ≥ Y daqiqa.

X va Y — kompaniya sozlamasi, faqat CEO o'zgartiradi: `chat.weekMinutesActive` (boshlang'ich 60),
`chat.weekMinutesRadio` (boshlang'ich 30). Kun chegaralari `common/date/tashkent` orqali.

Shart bajarilmasa o'quvchi o'qiy oladi, yoza olmaydi; yozish paneli o'rniga nima yetmasligi va
progress ko'rsatiladi. Unga yozilgan xabarlar baribir yetib keladi. Ogohlantirish: eng eski kun
ertaga oynadan chiqqanda yig'indi X yoki Y dan pastga tushsa — «ertaga yozish yopiladi, bugun yana
N daqiqa kerak». Yangi o'quvchida tarix yo'q, shuning uchun 7 kun mashqdan keyin yozadi.

CEO o'quvchini chatdan chiqarishi mumkin (`Student.chatBannedAt`): o'qiydi, yozmaydi.

## 2. Ma'lumotlar

- `Student.username` — kichik harfda, 5–32 belgi, lotin harf, raqam, `_`; noyob (o'chirilgan
  kartalar hisobga olinmaydi, qisman indeks); o'zgartirilsa eskisi bo'shaydi; ixtiyoriy.
- `ChatConversation` — juftlik (kichik id, katta id), noyob.
- `ChatMessage` — yozishma, yuboruvchi, tur (`TEXT | IMAGE | VOICE`), matn, fayl kaliti, mime,
  hajm, ovoz uzunligi, `createdAt`, `deletedAt`, `mediaPurgedAt`.
- `ChatReadState` — har ishtirokchining oxirgi o'qigan xabari (o'qilmagan soni shundan).
- `ChatBlock` — kim kimni bloklagan.
- `ChatReport` — shikoyat: kim, kimdan, sabab, holat, shikoyat vaqtidagi oxirgi 50 xabar nusxasi.
- `ChatPrivacy` — bitta qator: kim menga yozadi (hamma / guruhdoshlar / hech kim), meni ism
  bo'yicha kim topadi (hamma / hech kim; `@username` baribir topadi), rasmimni kim ko'radi
  (hamma / guruhdoshlar / hech kim). Boshlang'ich: hamma.

Rasm manbasi: mavjud `Student.photo`. Telefon, qarz, balans boshqa o'quvchiga hech qachon
chiqmaydi (API qaytarmaydi).

Fayllar: alohida yopiq R2 ombori (`R2_CHAT_BUCKET_NAME`), vazifa fayllari naqshi (`TaskFileStorage`):
server orqali yuklanadi, tur baytlardan aniqlanadi, ko'rish — qisqa muddatli havola. Chegaralar:
rasm 5 MB (jpg, png, webp), ovoz 120 soniya va 2 MB, matn 2000 belgi. Kalit
`chat/<companyId>/<conversationId>/<uuid><ext>`.

Tozalash: har kecha 03:00 (Toshkent) — ikkala suhbatdosh ham 30 kun ilovaga kirmagan
yozishmalarning fayllari o'chiriladi, matn qoladi, `mediaPurgedAt` qo'yiladi, ekranda «Fayl
o'chirilgan». Shikoyat nusxasi (matn) tozalashga tushmaydi.

## 3. So'rovlar, real vaqt, bildirishnoma

O'quvchi so'rovlari (`@StudentOnly()` + `StudentCardGuard`): `GET /chat/access`;
`GET /chat/conversations`; `GET /chat/conversations/:id/messages` (kursor); `POST /chat/conversations`
(`@username` yoki o'quvchi id); `POST …/messages` (matn); `POST …/files` (rasm, ovoz); `PATCH …/read`;
`DELETE …/messages/:id` (faqat o'zinikini, yumshoq); `GET /chat/search?q=`; `PUT /chat/username`;
`GET|PATCH /chat/privacy`; `POST /chat/block`, `/unblock`; `POST /chat/report`.
CEO: `GET /chat/reports`, `PATCH /chat/reports/:id`, chatdan chiqarish/qaytarish (`@CeoOnly()`).
Boshqa o'quvchining yozishmasiga murojaat — 404.

Yuborish tekshiruvlari, shu tartibda: kirish sharti → chatdan chiqarilmaganlik → blok →
qabul qiluvchining «kim menga yozadi» sozlamasi → tezlik (daqiqasiga 30) → uzunlik/hajm. Birinchi
bajarilmagan shartning matni qaytadi.

Real vaqt: mavjud SSE oqimiga `chat.message`, `chat.read`, `chat.access`.

Bildirishnoma:
- Qo'ng'iroqcha + push: yangi `NotificationType.CHAT_MESSAGE` (axborot turi, `groupKey` yozishma
  bo'yicha — bir yozishmaning xabarlari bitta qatorga yig'iladi).
- Telegram: «Sizga *Ism* dan yangi xabar keldi» + `web_app` tugma (`/tg?next=/portal/chat/<id>`),
  xabar mazmuni Telegramga chiqmaydi. O'qilmaguncha shu yozishmadan ikkinchi Telegram xabar
  yuborilmaydi. 22:00–08:00 oralig'ida kelsa 08:00 gacha kutadi (vazifalardagi `TaskOutbox`
  naqshi). Chat uzilgan (`telegramDisconnectedAt`) o'quvchiga yuborilmaydi.
- ADR-0025 ning «darhol yuboriladigan» ro'yxatiga istisno → yangi ADR (shu PR'da),
  `direct-send.guard.spec.ts` yangilanadi.

## 4. Ekranlar

Lumio dizayni (`daf-design-system/components/chat/*`, `ui_kits/student-app/more-screens.jsx`):
qoladi — suhbatlar ro'yxati (`ConversationRow`), yozishma ekrani (`MessageBubble`, `ChatComposer`),
boshqa o'quvchi profili, shikoyat/bloklash menyusi. Olib tashlanadi — guruh chati, «Onlayn» nuqtasi,
qo'ng'iroq tugmasi, jang/do'st/medal/reyting. Qo'shiladi — ovoz yozish va ijro, rasm, qulflangan
holat va progress, ertangi qulflanish ogohlantirishi, yangi suhbat (qidirish) ekrani, maxfiylik va
`@username` sozlamasi, «yozish cheklangan» va «bloklangan» holatlari, shikoyat sababi, «Fayl
o'chirilgan». CEO: «Chat shikoyatlari» sahifasi, X/Y sozlamasi. Matnlar o'zbek lotin, ekranda
inglizcha so'z yo'q.

## 5. Sinov va ishga tushirish

Sinov: kirish qoidasi (har shart alohida, 7 kunlik oyna chegarasi, «ertaga yopiladi» hisobi);
yuborish tekshiruvlari tartibi; blok va maxfiylik; fayl turini baytdan aniqlash; tozalash
(ikkala tomon sharti); marshrut manifesti; boshqa yozishmaga 404; Telegram (bitta xabar, tungi
kutish); shikoyat nusxasi.

Ishga tushirish: kompaniya sozlamasi `chat.enabled`, boshlang'ich o'chiq; avval CEO ichki sinov,
keyin yoqiladi.

## Tekshirilishi kerak (amalga oshirishdan oldin)

1. Telefon tasdig'i `STUDENT_PHONE_VERIFICATION_ENABLED` o'chiq bo'lsa hech kim «tasdiqlangan»
   bo'lmaydi → 2-shart hech kimga bajarilmaydi. Prod holatini tekshirish; o'chiq bo'lsa shart
   qaror kerak (telefon sharti vaqtincha o'tkazib yuboriladimi).
2. `StudentAppSession` veb, ilova va Mini App'dan yoziladimi — yozilmasa o'sha platformada X/Y
   bajarib bo'lmaydi.
3. Prod'da `ChatReport` yig'ishdagi maxfiylik: nusxa faqat shikoyat qilingan yozishmadan, faqat CEO ko'radi.

## Xavflar

Xodim moderatsiyasi yo'q; o'quvchilar orasida bolalar bor — shuning uchun maxfiylik boshlang'ichi,
blok, shikoyat va CEO chiqarishi birinchi versiyada majburiy. Boshlang'ich «hamma yoza oladi»
xavfli bo'lsa, boshlang'ichni «guruhdoshlar» ga o'zgartirish bitta qiymat.
