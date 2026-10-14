# Topshiriq xabari Telegram'da o'zi yangilanadi

**Sana:** 2026-10-14
**Holati:** CEO bilan kelishildi (14.10, «ha»)
**Bog'liq:** ADR-0078 (Topshiriqlar → Telegram — shu spec xabar yuborish
qoidasini o'zgartiradi), ADR-0045 (xodim Mini App'i), spec
`2026-10-07-topshiriqlar-design.md` §6.

## 1. Muammo

- Topshiriq bo'yicha har o'zgarishda yangi xabar boradi, eskilari esa turib
  qoladi. Bot faqat tugma bosilgan xabarni qayta chizadi. Shu topshiriqning
  boshqa odamlardagi nusxalari o'zgarmaydi: ikkinchi ijrochida, beruvchida va
  eski kartalarda «Bajardim» tugmasi ish bajarilgandan keyin ham turaveradi.
  Ish saytda bajarilsa, Telegram'dagi xabarlarning hech biri yangilanmaydi.
- «Ochish» tugmasi oddiy havola (`Markup.button.url`). Telegram uni brauzerda
  ochadi, u yerda xodim tizimga kirmagan, shuning uchun login so'raladi.

## 2. Qarorlar (CEO, 14.10 — qayta so'ralmaydi)

1. **Har odamga har topshiriq bo'yicha bitta «tirik» xabar.** Holat
   o'zgarganda yangi xabar yuborilmaydi: shu topshiriqning barcha tirik
   xabarlari tahrirlanadi va har biri o'z egasiga moslab yoziladi.
2. Tirik xabari hali yo'q odamga, unga xabar borishi kerak bo'lgan birinchi
   holatda yangi xabar boradi. Masalan, beruvchiga ish birinchi marta
   tekshiruvga kelganda, kuzatuvchiga ish bajarilganda yoki bekor qilinganda.
   Keyingi o'zgarishlarda uning xabari ham faqat tahrirlanadi.
3. Izoh, fayl, ovozli xabar, muddatdan 1 soat oldingi eslatma va «Muddati
   o'tdi» hozirgidek yangi xabar bo'lib boradi.
4. «Ochish» tugmasi xodim kabineti sifatida (Mini App) Telegram ichida ochiladi
   va darhol shu topshiriq kartasini ko'rsatadi.
5. Tahrir ovoz chiqarmaydi, bu kamchilik ataylab qabul qilindi. Saytdagi
   qo'ng'iroqcha avvalgidek xabar beradi.

## 3. Qanday ishlaydi

### 3.1 Ikki xil xabar

`TaskTelegramMessage.purpose` ga yangi qiymat qo'shiladi: **`CARD`**. Bu
topshiriqning tirik xabari.

- `CARD` — holat xabari. U ikki joyda paydo bo'ladi: §2.2 dagi birinchi xabar
  va «📋 Topshiriqlarim» ichidagi raqam ochgan karta. Har o'zgarishda
  tahrirlanadi.
- `NOTICE` — izoh, fayl, ovoz, eslatma va «Muddati o'tdi» xabarlari. Ular
  tahrirlanmaydi, chunki ichidagi matn (izoh, eslatma) yo'qolib qolardi.
  Ularga javob yozish hozirgidek ishlaydi.
- Deploydan oldin yuborilgan xabarlar `NOTICE` bo'lib qoladi va
  tahrirlanmaydi. Ochiq topshiriqda deploydan keyingi birinchi holat
  o'zgarishi odamga bitta yangi `CARD` xabar yuboradi (unda hali `CARD` yo'q).
  Eski xabarlarni ajratib bo'lmaydi: ular matn bo'yicha farqlanmaydi.
- Javoblar: `CARD` xabariga matn, rasm yoki fayl bilan javob berish xuddi
  `NOTICE` xabariga javob kabi muhokamaga tushadi (`TaskTelegramReplies`).

### 3.2 Hodisadan keyin nima bo'ladi

`task.*` hodisasi kelganda (commit'dan keyin) ikki ish qilinadi:

1. **Yangilash.** Shu topshiriqning barcha `CARD` qatorlari tahrirlanadi
   (`editMessageText`). Har qator o'z egasiga (`userId`) moslab chiziladi.
   Yangilash quyidagi hodisalarda bo'ladi: `ASSIGNED`, `UNASSIGNED`,
   `STATUS_CHANGED`, `REVIEW_REQUESTED`, `REVIEWED`, `CANCELLED`,
   `REASSIGNED`, `DUE_CHANGED`, `AUTO_CLOSED`. Tahrir tungi tinchlikni
   kutmaydi, chunki u ovoz chiqarmaydi.
2. **Birinchi xabar.** `planNotices` rejasida holat xabari olishi kerak
   bo'lgan, lekin hozirgi chatida bu topshiriq bo'yicha `CARD` xabari yo'q
   odamga bitta yangi `CARD` xabar yuboriladi. Holat xabarlari: `ASSIGNED`,
   `ADDED`, `MOVED`, `REVIEW`, `ACCEPTED`, `RETURNED`, `DONE`, `CANCELLED`.
   U tirik xabar sifatida chiziladi, ya'ni rejadagi kartaning matni emas,
   topshiriqning hozirgi holati yoziladi. Bu xabar hozirgidek tungi
   tinchlikka va qayta urinish qoidasiga bo'ysunadi (`TaskOutbox`
   `TELEGRAM`/`NOTICE`).
   - Olib tashlangan ijrochiga (`REMOVED`) yangi xabar bormaydi: uning tirik
     xabari «Topshiriqdan olib tashlandingiz» bo'lib tahrirlanadi va tugmalari
     olinadi. Tirik xabari bo'lmasa, Telegram'ga hech narsa bormaydi.
     Qo'ng'iroqcha esa avvalgidek xabar beradi.
   - Ertalabga qoldirilgan birinchi xabar yuborish paytida yana tekshiriladi.
     Odamda bu orada `CARD` paydo bo'lgan bo'lsa, yuborilmaydi. Topshiriq
     yopilgan va xabar `ASSIGNED`/`ADDED`/`MOVED` bo'lsa ham yuborilmaydi.
3. `COMMENT`, `REMINDER`, `OVERDUE` hozirgidek yangi `NOTICE` xabar bo'lib
   boradi.

Bu ikki ish bitta xizmatda bo'ladi: `TaskTelegramLive`
(`src/tasks/telegram/task-telegram-live.ts`). `TaskTelegramListener` va
`TaskTelegramOutbox` holat xabarlari uchun uni chaqiradi.

### 3.3 Tirik xabar matni (har odamga o'zi)

Kim nima qilgani `TaskEvent` qatorlaridan o'qiladi: oxirgi `STATUS` (to
`IN_PROGRESS` / `IN_REVIEW` / `DONE`), `RETURN`, `CANCELLED` va `AUTO_CLOSED`,
ularning `actorId`, `createdAt` va `text` (sabab) maydonlari bilan.
`loadTaskView` ularni `TgTaskView.history` sifatida qaytaradi. Renderer sof
funksiya: `renderLiveCard(view, viewerId, now)`
(`task-telegram-text.ts`).

| Holat | Ijrochi (o'zi qilgan) | Boshqa ijrochi | Beruvchi | Kuzatuvchi |
| --- | --- | --- | --- | --- |
| Yangi | **Yangi topshiriq · Yuqori** · Boshladim, Bajardim | xuddi shunday | — (xabari yo'q) | — |
| Jarayonda | **🔄 Jarayonda** · Siz boshladingiz · Bajardim | **🔄 Jarayonda** · Karimov B. boshladi · Bajardim | **🔄 Jarayonda** · Karimov B. boshladi | — |
| Qaytarildi | **↩️ Qaytarildi** · Soliyev A.: «sabab» · Bajardim | xuddi shunday | **↩️ Siz qaytardingiz**: «sabab» | — |
| Tekshiruvda | **⏳ Tekshiruvda** · Siz yubordingiz | **⏳ Tekshiruvda** · Karimov B. bajardi | **Tekshiruvga keldi** · Karimov B. bajardi · Qabul qilish, Qaytarish | — |
| Bajarildi | **✅ Bajarildi** · Siz bajardingiz, Soliyev A. qabul qildi | **✅ Bajarildi** · Karimov B. bajardi | **✅ Qabul qildingiz** · Ijrochi: Karimov B. | **✅ Bajarildi** · Karimov B. bajardi, Soliyev A. qabul qildi |
| Bekor qilindi | **❌ Bekor qilindi** · Soliyev A.: «sabab» | xuddi shunday | **❌ Siz bekor qildingiz** | xuddi ijrochidek |
| Olib tashlangan | **Topshiriqdan olib tashlandingiz** · Olib tashladi: Soliyev A. | | | |

- Sarlavhadan keyin topshiriq nomi yoziladi. Keyin kerakli qatorlar keladi:
  Bergan, Muddat, Bog'liq, Kichik qadamlar va «Rasm bilan tasdiqlanadi».
  Yopilgan topshiriqda faqat sarlavha, nom, «kim» qatori va vaqt
  («14.10, 15:30») qoladi.
- O'ziga yozilgan eslatmada (beruvchi yagona ijrochi) «Siz bajardingiz»
  yoziladi, «qabul qildi» qatori bo'lmaydi.
- Tizim topshirig'ida sarlavha «Tizim topshirig'i · …» bo'ladi va faqat
  «Ochish» tugmasi chiqadi (ADR-0083). Avtomatik yopilganda «✅ Yopildi ·
  Tizim» yoziladi.
- Tugmalar hozirgi `stateButtons` qoidasi bilan chiqadi, ostida doim «Ochish»
  turadi. Yopilgan topshiriqda faqat «Ochish» qoladi.
- Bot tugma bosilgan xabarni ham shu renderer bilan qayta chizadi
  (`TaskTelegramHandler.drawCard`). `keptHeadline` olib tashlanadi, chunki
  sarlavhani endi holat belgilaydi. «Topshiriqlarim» ochgan karta ham shu
  ko'rinishda bo'ladi.

### 3.4 Xatolar

- «message is not modified» — xato emas, e'tiborsiz qoldiriladi.
- «message to edit not found» yoki «message can't be edited» (odam xabarni
  o'chirgan) — shu `CARD` qatori o'chiriladi. Shundan keyin, rejaga ko'ra
  xabar kerak bo'lsa, birinchi xabar qoidasi yangisini yuboradi.
- Bot bloklangan yoki chat yo'q (permanent) — qator o'chiriladi.
- 429 — `retry_after` bir marta kutiladi (eng ko'pi 30 s), so'ng qolgan
  tahrirlar tashlab ketiladi va jurnalga yoziladi. Keyingi hodisa ularni
  baribir to'g'rilaydi.
- Bitta odamning xatosi boshqalarning tahririni to'xtatmaydi. `handle` hech
  qachon throw qilmaydi (ADR-0078 qoidasi).

### 3.5 «Ochish» — Mini App

- Tugma `Markup.button.webApp('Ochish', staffPageUrl(cabinetUrl,
  '/tasks?task=<id>'))` ko'rinishida bo'ladi. `cabinetUrl` — odam portalining
  manzili (`staffPortalFor` → `staffMiniAppUrl`). Topshiriq xabarlari faqat
  shaxsiy chatga boradi, `web_app` tugmasi ham faqat shu yerda ishlaydi.
- Mijoz: `staffCabinetPath` (`client/src/lib/telegram-mini-app.ts`) ruxsat
  ro'yxatiga qo'shimcha ravishda `/tasks?task=<uuid>` ni qabul qiladi
  (qat'iy regex, faqat uuid). Boshqa hech qanday `next` qabul qilinmaydi.
- `TELEGRAM_MINI_APP_URL` o'rnatilmagan bo'lsa, tugma bo'lmaydi
  (hozirgidek).

## 4. Nima o'zgarmaydi

Quyidagilar hozirgidek qoladi:
- qo'ng'iroqcha (`task-notify.listener.ts`) va 20:00 xabari;
- sayt va kim kimga xabar olishi (`planNotices`);
- izoh, eslatma va «Muddati o'tdi» xabarlari;
- tugmalarning amallari va ruxsatlari;
- javob yozish qoidalari.

## 5. Ma'lumot

- `enum TaskTelegramPurpose` ga `CARD` qo'shiladi. Migratsiya bitta
  `ALTER TYPE … ADD VALUE`. Yangi jadval yo'q.

## 6. Tekshiruv

- `renderLiveCard`: §3.3 jadvalining har katagi uchun sof test (matn va
  tugmalar).
- `TaskTelegramLive` uchun testlar:
  - barcha `CARD` qatorlari tahrirlanadi;
  - birinchi xabar qoidasi ishlaydi;
  - xabari bor odamga yangi xabar bormaydi;
  - tahrir xatolarida qatorlar o'chiriladi;
  - 429 kutiladi;
  - bitta odamning xatosi boshqalarnikini to'xtatmaydi.
- Listener, outbox va handler testlari yangi qoidaga moslanadi.
- Mijoz: `staffCabinetPath` testi (uuid qabul qilinadi; boshqa yo'l, tashqi
  manzil va noto'g'ri id rad etiladi).
- Throwaway PG: ikki ijrochili topshiriq. Birinchisi «Bajardim»ni bosadi,
  beruvchi qabul qiladi. Har bosqichda `CARD` qatorlari soni tekshiriladi
  (yangi xabar yo'q, faqat tahrir).
- ADR-0089 «Topshiriq xabari tirik karta» (ADR-0078 ning xabar yuborish
  qismini o'zgartiradi). Qo'llanmada topshiriqlar bo'limi hali yo'q, shuning
  uchun qo'llanma o'zgarmaydi.
