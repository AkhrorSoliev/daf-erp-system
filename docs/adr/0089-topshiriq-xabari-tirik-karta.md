# ADR-0089 — Topshiriq xabari Telegram'da tirik karta: har odamga har topshiriq bo'yicha bitta xabar, holat o'zgarganda tahrirlanadi; «Ochish» Mini App'da

**Holati:** Qabul qilindi
**Sana:** 2026-10-15
**Bog'liq:** ADR-0078 (shu qaror uning xabar yuborish qismini almashtiradi: «har xabar yangi xabar» → «har odamga bitta tirik karta»; «Ochish» havolasi → Mini App; tungi tinchlik, navbat, javob va tugma qoidalari o'z kuchida), ADR-0045 (xodim Mini App'i, `staffMiniAppUrl`), ADR-0076 (qo'ng'iroqcha — o'zgarmaydi), ADR-0083 (tizim topshirig'i), dizayn `docs/superpowers/specs/2026-10-14-topshiriq-tirik-xabar-design.md`, `server/src/tasks/telegram/task-telegram-live.ts`, `task-telegram-text.ts` (`renderLiveCard`), `task-telegram.sender.ts`, migratsiya `20261015090000_task_telegram_card`, `client/src/lib/telegram-mini-app.ts` (`staffCabinetPath`)

## Kontekst

ADR-0078 bo'yicha topshiriqning har o'zgarishi Telegram'ga yangi xabar bo'lib
borardi, bot esa faqat tugma bosilgan xabarni qayta chizardi. Shu topshiriqning
boshqa odamlardagi nusxalari o'zgarmay qolardi: ikkinchi ijrochida, beruvchida
va eski xabarlarda «Bajardim» tugmasi ish bajarilgandan keyin ham turaverardi,
bosilsa «eskirgan» javobi kelardi. Ish saytda bajarilsa, Telegram'dagi xabarlarning
hech biri yangilanmasdi. Chat bir topshiriq bo'yicha 4–5 xabar bilan to'lardi.

«Ochish» tugmasi oddiy havola edi (`Markup.button.url`): Telegram uni tashqi
brauzerda ochadi, xodim u yerda tizimga kirmagan, login so'raladi. ADR-0078
buni «keyinga» deb qoldirgan edi.

## Qaror

1. **Har odamga har topshiriq bo'yicha bitta tirik xabar.** `TaskTelegramMessage.purpose`
   ga `CARD` qiymati qo'shildi. Holat xabarlari (`ASSIGNED`, `ADDED`, `MOVED`,
   `REVIEW`, `ACCEPTED`, `RETURNED`, `DONE`, `CANCELLED` — `STATUS_NOTICES`)
   endi yangi xabar yubormaydi: odamning shu chatida shu topshiriq bo'yicha
   `CARD` qatori bo'lsa, yuborish o'tkazib yuboriladi (`has card`); bo'lmasa
   bitta yangi `CARD` xabar boradi va u rejadagi xabarning matni emas,
   topshiriqning hozirgi holati bilan chiziladi (`renderLiveCard`). Kimga xabar
   kerakligini avvalgidek `planNotices` hal qiladi: beruvchi kartasini birinchi
   tekshiruvda, kuzatuvchi «Bajarildi» yoki «Bekor qilindi»da oladi.
2. **Har o'zgarishda barcha kartalar tahrirlanadi.** `TaskTelegramLive.refresh(taskId)`
   topshiriqning barcha `CARD` qatorlarini `editMessageText` bilan qayta chizadi,
   har birini o'z egasiga moslab (ijrochi «Siz bajardingiz», beruvchi «Qabul
   qildingiz», boshqalar «Karimov B. bajardi»). Listener uni `ASSIGNED`,
   `UNASSIGNED`, `STATUS_CHANGED`, `REVIEW_REQUESTED`, `REVIEWED`, `CANCELLED`,
   `REASSIGNED`, `DUE_CHANGED`, `AUTO_CLOSED` hodisalarida, xabarlardan OLDIN
   chaqiradi. Tahrir tungi tinchlikni kutmaydi — u ovoz chiqarmaydi. Olib
   tashlangan ijrochiga (`REMOVED`) yangi xabar bormaydi: kartasi «Topshiriqdan
   olib tashlandingiz» bo'lib tahrirlanadi, tugmalari olinadi.
3. **Kim nima qilgani `TaskEvent` dan o'qiladi.** `loadTaskView` oxirgi 10 ta
   `STATUS`/`RETURN`/`CANCELLED`/`AUTO_CLOSED` hodisasini `history` sifatida
   qaytaradi; karta sarlavhasi va «kim, qachon» qatori shundan chiziladi.
   Tugma bosilgan xabar ham shu renderer bilan qayta chiziladi — ADR-0078 dagi
   «eski birinchi qator sarlavha bo'lib qoladi» (`keptHeadline`) qoidasi bekor.
   «Topshiriqlarim» raqami ochgan karta ham `CARD` qatori bo'ladi.
4. **Tahrir xatolari.** «message is not modified» — xato emas. «message to edit
   not found» / «message can't be edited» (odam xabarni o'chirgan) yoki doimiy
   xato (bot bloklangan, chat yo'q) — shu `CARD` qatori o'chiriladi, keyingi
   holat xabari unga yangi karta yuboradi. 429 — `retry_after` bir marta kutiladi
   (ko'pi bilan 30 s), ikkinchi 429 da qolgan tahrirlar shu hodisada tashlab
   ketiladi va jurnalga yoziladi (keyingi hodisa ularni baribir to'g'rilaydi).
   Bitta odamning xatosi boshqalarnikini to'xtatmaydi; `refresh` hech qachon
   throw qilmaydi.
5. **Izoh, eslatma va «Muddati o'tdi» o'zgarmaydi** — ular avvalgidek yangi
   `NOTICE` xabar (ichidagi matn yo'qolmasligi uchun tahrirlanmaydi). `CARD`
   xabariga javob ham `NOTICE` ga javob kabi muhokamaga tushadi.
6. **«Ochish» — Mini App.** Tugma `Markup.button.webApp` bo'ldi; manzil —
   odamning portalidagi xodim kabineti (`staffMiniAppUrl`) `/tg?next=/tasks?task=<id>`
   bilan. Mijozda `staffCabinetPath` faqat `/tasks?task=<uuid>` ni (qat'iy regex)
   qo'shimcha qabul qiladi; boshqa `next` rad etiladi. `TELEGRAM_MINI_APP_URL`
   o'rnatilmagan bo'lsa, tugma yo'q (hozirgidek).

## Ko'rib chiqilgan muqobillar

- **Har o'zgarishda yangi xabar (ADR-0078).** Chat to'ladi, eski tugmalar
  adashtiradi; CEO 14.10 da rad etdi.
- **Faqat bosilgan xabarni tahrirlash.** Boshqa odamlarning kartalari
  o'zgarmaydi — asosiy shikoyat shu edi.
- **Eski xabarlarni ham tahrirlash.** Deploydan oldingi xabarlar `NOTICE` va
  matn bo'yicha farqlanmaydi (izohmi, holatmi — bilib bo'lmaydi); ular tegilmaydi.
- **Tahrirda ovoz (yangi xabar + eskisini o'chirish).** Shovqin qaytadi; ataylab
  qabul qilindi: tahrir jim, saytdagi qo'ng'iroqcha avvalgidek xabar beradi.
- **Ikki xabar poygasini qulflash.** Bir onda kelgan ikki hodisa ikkalasi ham
  «karta yo'q» ko'rib ikkita karta yuborishi mumkin; keyingi `refresh` ikkalasini
  ham to'g'ri tutadi. Qulf qo'yilmadi — poyga kam uchraydi, oqibati bezarar.

## Oqibatlari

- `TaskTelegramPurpose` ga `CARD` qo'shildi (`ALTER TYPE … ADD VALUE IF NOT
  EXISTS`); yangi jadval yo'q. Server va mijoz birga chiqadi: eski mijoz
  `/tasks?task=` ni `next` sifatida rad etadi va kabinetning bosh sahifasini ochadi.
- Deploydan oldin yuborilgan xabarlar `NOTICE` bo'lib qoladi va tahrirlanmaydi.
  Ochiq topshiriqda deploydan keyingi birinchi holat o'zgarishi odamga bitta
  yangi `CARD` yuboradi (unda hali karta yo'q); shundan keyin faqat tahrir.
- Tahrir ovozsiz: odam o'zgarishni faqat kartaga qarab yoki saytdagi
  qo'ng'iroqchadan biladi. Bu ataylab.
- Ertalabga qoldirilgan holat xabari yuborish paytida yana tekshiriladi: odamda
  bu orada `CARD` paydo bo'lgan bo'lsa, yoki topshiriq yopilib xabar
  `ASSIGNED`/`ADDED`/`MOVED` bo'lsa, yuborilmaydi (`skipReason`).
- `web_app` tugmasi faqat shaxsiy chatda ishlaydi; topshiriq xabarlari faqat
  shaxsiy chatga boradi, shuning uchun bu chegara sezilmaydi.
- Throwaway PG tekshiruvi (15.10): ikki ijrochi + kuzatuvchi; yaratish →
  A 1 / B 1 karta; A «Bajardim» → A, B kartalari tahrirlandi, beruvchi bitta
  yangi karta oldi; beruvchi qabul qildi → yangi xabar faqat kuzatuvchiga
  (birinchi kartasi), A, B va beruvchi kartalari tahrirlandi; `TaskOutbox` bo'sh.
