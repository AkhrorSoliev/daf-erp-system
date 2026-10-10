# ADR-0077 — Topshiriq xabarlari Telegram'ga darhol, tugmalar bilan ketadi; kechasi ertalabgacha kutadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0025 (20:00 yig'ma xabar — shu qaror uni topshiriqlar uchun qisman almashtiradi), ADR-0074 (topshiriq alohida bo'lim, `TasksService` yagona eshik), ADR-0045 (xodim botda: `User.telegramChatId`, `staffLinkedToChatWhere`, `staffPortalFor`), ADR-0076 (qo'ng'iroqcha — Telegram'ga tegmaydi), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §6, §9.3, `server/src/tasks/telegram/`, `server/src/tasks/task-quiet-hours.ts`, migratsiya `20261010160000_task_telegram`

## Kontekst

ADR-0025 bo'yicha topshiriq xabari Telegram'ga kechqurun 20:00 dagi yig'ma xabar
bilan borardi: ertalab berilgan ishni xodim kechqurun bilardi. 1-bosqichda
(ADR-0074) topshiriqlar yig'maga yozilmay qo'ydi va Telegram'ga umuman bormay
qoldi — xabar faqat saytdagi qo'ng'iroqchada. Ko'p xodim saytni kun bo'yi ochiq
tutmaydi, Telegram esa doim yonida.

## Qaror

1. **Topshiriq xabarlari darhol ketadi** — asosiy bot, `src/tasks/telegram/`.
   Kimga nima borishini qo'ng'iroqcha bilan bitta ro'yxat hal qiladi
   (`task-notify-plan.ts`, spec §6.1 jadvali). Qabul qiluvchi — Telegram'i
   bog'langan faol xodim hisobi (`status = ACTIVE`, `isActive`, tizimga kira
   oladigan holat), va shu chatga boshqa faol xodim hisobi bog'lanmagan
   (`staffChatOf`); bu yuborish paytida tekshiriladi, ikki hisob bitta chatda —
   ikkalasiga ham yuborilmaydi. Ijrochi tanlashdagi «Telegram ulanmagan» belgisi
   shu qoida bilan chiqadi. Kuzatuvchiga Telegram'ga faqat «Bajarildi» va
   «Bekor qilindi» ketadi; kuzatuvchilikdan olib tashlangan odamga Telegram'ga
   hech narsa yuborilmaydi (qo'ng'iroqcha bor). «Dars bo'ldimi?» Telegram'ga
   yuborilmaydi. Ishni qilgan odamning o'ziga xabar bormaydi.
2. **Tungi tinchlik.** 22:00–08:00 (Toshkent) oralig'ida tayyor bo'lgan xabar
   `TaskOutbox` ga (`TELEGRAM`) yoziladi va 08:00 da ketadi; «Shoshilinch»
   topshiriq xabari kechasi ham darhol. Muddatdan 1 soat oldingi eslatma va
   «Muddati o'tdi» ham shu qoida bilan, faqat topshiriq hali ochiq va odam hali
   unda bo'lsa. Eslatmaning surilgan vaqti muddatga yetsa yoki undan keyinga
   tushsa (masalan, muddat 08:00, eslatma 07:00 → 08:00 ga surildi), u
   yozilmaydi: «Muddati o'tdi» xabarining o'zi yetadi. Qayta urinish ham tungi
   tinchlikka tushmaydi («Shoshilinch» bundan mustasno).
3. **Tugmalar:** «Boshladim», «Bajardim», «Qabul qilish», «Qaytarish»,
   «Qadamlar», «Ochish». Bosilganda yangi xabar emas, o'sha xabar
   tahrirlanadi. Har amal `TasksService` orqali, saytdagi ruxsat va o'tish
   qoidalari bilan; tarixda «Telegram orqali» belgisi (`via TELEGRAM`).
   Topshiriqni endi ko'ra olmaydigan odamga — «Bu topshiriq sizda emas».
   Rasm bilan tasdiqlanadigan topshiriqda «Bajardim» yo'q: rasm yuklash fayllar
   bilan birga keladi (3-bosqich). «Qaytarish» bosilsa, bot topshiriq nomini aytib, sababni
   so'raydi va bosilgan xabarga javob qilib yuboradi.
4. **Botdagi o'rni.** Tugma va javob ishlovchisi `TelegramService.useBeforeScenes`
   orqali ulanadi: sessiya, `/start` tiklash va kanal darvozasidan keyin,
   sahnalardan darhol oldin. Shu sababli ochiq qolgan eski bot oqimi
   (ro'yxatdan o'tish, parolni tiklash...) topshiriq tugmasini yoki topshiriq
   xabariga javobni yutib yubormaydi. Qolgan hamma narsa o'z oqimiga o'tadi
   (`next()`); `/` buyrug'i bilan boshlangan javob ham.
5. **Javob:** topshiriq xabariga matn bilan javob — izoh; «Qaytarish» so'roviga
   javob — qaytarish sababi (ko'pi bilan 1000 belgi; bu qoida servisda turadi,
   sayt ham, bot ham undan o'tadi). Rasm, fayl va ovoz 3-bosqichgacha qabul
   qilinmaydi: bot «Hozircha faqat matnli javob qabul qilinadi» deydi,
   hech narsa saqlanmaydi. Qaysi xabar qaysi topshiriqniki — `TaskTelegramMessage`.
6. **«📋 Topshiriqlarim»** xodim menyusida: o'zi ijrochi bo'lgan ochiq
   topshiriqlar («Dars bo'ldimi?» yo'q), muddat bo'yicha, guruhlab, 10 tagacha.
7. **ADR-0025 ning «darhol qolganlar» ro'yxatiga topshiriq xabarlari
   qo'shiladi.** `direct-send.guard.spec.ts` ALLOWED ro'yxatida
   `src/tasks/telegram/`; yig'maga `TASK_*` yozilmasligini shu spec qulflaydi.
8. **Navbat va xatolar.** Har qator yuborishdan oldin "olinadi": deploy paytida
   eski va yangi nusxa birga ishlasa ham, bir xabar ikki marta ketmaydi (run
   o'lsa, qator 5 daqiqadan keyin qaytadi). 429 — `retry_after` kutiladi, urinish
   sanalmaydi; 403 / chat yo'q / bot o'chiq (token yo'q) / xabar noto'g'ri
   (bizning xato) — qator o'ladi, qayta urinilmaydi; vaqtinchalik xato — kutish
   60 soniyadan boshlanib har safar ikki baravar oshadi (60 s, 2 daqiqa,
   4 daqiqa), uch muvaffaqiyatsizlikdan keyin qator o'ladi. Hech qachon
   yuborib bo'lmaydigan qator (topshiriq yopilgan yoki o'chirilgan, odam endi
   unda emas, Telegram'i yo'q) yuborilmay yopiladi. Yuborilgan va o'lgan qatorlar
   30 kundan keyin har kecha 03:00 da o'chiriladi.

## Ko'rib chiqilgan muqobillar

- **20:00 yig'mada qoldirish.** Topshiriq — ish; uni kechqurun bilish kech.
  CEO rad etdi.
- **Kechasi ham darhol.** Tungi shovqin; faqat «Shoshilinch» uchun qoldirildi.
- **Har bosishda yangi xabar.** Chat tez to'lib ketadi, eski xabardagi
  tugmalar adashtiradi; maket tahrirlashni ko'rsatadi.
- **Alohida bot.** Xodimlar allaqachon asosiy botga bog'langan (ADR-0045);
  yangi bot yangi bog'lanishni talab qilardi.
- **Ishlovchini sahnalardan keyin ulash.** Ochiq sahna har yangilanishga o'zi
  javob beradi va hech qachon yopilmasligi mumkin; topshiriq tugmasi shunday
  chatda jim qolardi.

## Oqibatlari

- `TaskOutbox` ga `NOTICE` turi va `payload` ustuni qo'shildi; bitta odamga
  bitta topshiriq bo'yicha kechasi bir nechta xabar kutishi mumkin, shuning
  uchun `(taskId, userId, channel, kind)` noyob kaliti oddiy indeksga
  almashdi. Vaqt qatorlari (`REMINDER`, `OVERDUE`) esa bittadan qolishi kerak:
  ularga qisman noyob indeks (`TaskOutbox_time_row_key`) qo'lda yozilgan.
  Yangi `TaskTelegramMessage` jadvali.
- Vaqt qatorlarini qayta yozish (muddat, muhimlik yoki ijrochi o'zgarganda)
  faqat `REMINDER` va `OVERDUE` ga tegadi: ertalabga yoki qayta urinishga
  kutayotgan `NOTICE` qatorlari qoladi.
- Deploydan oldin yaratilgan topshiriqlarda Telegram eslatmalari yo'q: ular
  topshiriqning muddati yoki muhimligi (yoki ijrochilari) keyin o'zgarganda
  yoziladi. Yangi topshiriqlarda hammasi boshidan bor.
- Deploydan oldin yuborilgan xodim menyusida «📋 Topshiriqlarim» qatori yo'q;
  u xodim botga `/start` yuborgach chiqadi. Yangiliklar yozuvi va qo'llanma shuni
  aytadi.
- «Ochish» — portaldagi `/tasks?task=<id>` havolasi; brauzerda portalga kirish
  kerak bo'lishi mumkin. Telegram ichida parolsiz ochish uchun mijozdagi
  `/tg?next=` ro'yxatini kengaytirish kerak — keyinga.
- Kanal a'zoligi darvozasi (`TELEGRAM_REQUIRED_CHANNEL`) topshiriq
  tugmalariga ham tegishli — bot qolgan oqimlardagi kabi.
- `TasksModule` `TelegramModule` ni import qiladi, teskarisi yo'q: `src/telegram`
  `src/tasks` dan hech narsa olmaydi, xodim menyusi faqat `tk:list` satrini biladi.
