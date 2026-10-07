# Topshiriqlar: alohida bo'lim, tekshiruv, Telegram tugmalari, avtomatika

**Sana:** 2026-10-07
**Holati:** CEO bilan kelishildi (6 bo'lim, 20 ekran — ko'rik sahifasi
https://claude.ai/artifact/THVfP3KSZ8DvRXxWc6PaEk, hammasi «Kerak»)
**Bog'liq:** ADR-0054 («Dars bo'ldimi?» tizim topshirig'i), ADR-0025 (Telegram
20:00 yig'ma xabari — shu spec uni topshiriqlar uchun o'zgartiradi), ADR-0072
(to'lov va'dasi), ADR-0028 (rollar bazadan o'qiladi), Ruxsatlar tizimi dizayni
(`2026-10-05-ruxsatlar-tizimi-design.md` — keyin shu qoidalarga ulanadi).

## 1. Muammo

Topshiriq bugun izohning bir turi: `Comment.isTask = true` + `CommentAssignee`.
Shu sababli:

- `/tasks` sahifasidan topshiriq berib bo'lmaydi — faqat o'quvchi, guruh, lid va
  xodim kartasidagi izoh formasi orqali, u ham faqat CEO va filial direktoriga
  ko'rinadi (server administratorga ham ruxsat beradi, ekran esa yo'q).
- Ijrochi ro'yxati qattiq yozilgan («Branch Director, Administrator»), muddat
  qattiq 18:00, muhokama yo'q, qadamlar yo'q, fayl yo'q, takrorlanish yo'q.
- Holat uchta (Kutilmoqda → Ko'rildi → Bajarildi) va har ijrochida alohida;
  beruvchi ishni tekshirib qabul qila olmaydi.
- Telegram'ga topshiriq xabari 20:00 dagi yig'ma xabar bilan boradi (ADR-0025);
  xodim kun bo'yi bilmaydi.
- Tizim beradigan yagona topshiriq — «Dars bo'ldimi?» — izoh jadvaliga
  to'g'ridan-to'g'ri yoziladi; qolgan «yashirin ishlar» (qayta qo'ng'iroq
  sanasi, buzilgan va'da, qo'ng'iroq qilinmagan lid) umuman topshiriq emas:
  `CallLog.followUpAt` hech qachon yopilmaydi va hech kimga eslatilmaydi.
- Qo'ng'iroqcha ishlamaydi: ishlab turgan tizimda ayrim xodimlarda 450–780 ta
  o'qilmagan xabar, administratorga kuniga ~10 xabar keladi, 86% i davomat
  eslatmasi, davomat olingandan keyin ham o'qilmagan bo'lib qolaveradi.

**Hajm (ishlab turgan tizim, 07.10.2026):** jami 34 topshiriq — 33 tasi «Dars
bo'ldimi?», 1 tasi qo'lda; 4 tasi ochiq. Ko'chirish kichik.

## 2. Qamrov

Bitta spec, besh bosqichda chiqadi (11-bo'lim). Hammasi bitta yangi modul
`server/src/tasks/` va `client/src/components/tasks/` atrofida.

**Kiradi:** topshiriq uchun alohida jadvallar; doska va ro'yxat; berish oynasi;
varaq (tavsif, qadamlar, fayllar, muhokama, tarix); Yangi → Jarayonda →
Tekshiruvda → Bajarildi; qabul qilish / qaytarish; «Har biriga alohida»;
kuzatuvchi; takrorlanish; rasm bilan tasdiqlash; ovozli xabar; Telegram darhol
xabar + tugmalar + javob + «Topshiriqlarim»; tungi tinchlik; «Barchasi» va
«Yuklama» bo'limlari; yuqori paneldagi «+ Topshiriq»; kartalardagi
«Topshiriqlar» bloki; 4 tur avtomatik topshiriq; ishdan ketgan xodimning
topshiriqlari; qo'ng'iroqchani qayta qurish; «Barcha bildirishnomalar» sahifasi;
eski topshiriqlarni ko'chirish.

**Keyinga:** taqvim ko'rinishi; yorliqlar va loyihalar; qadamga alohida mas'ul;
bir nechta topshiriqni birdan o'zgartirish; bosh sahifadagi «Bugungi
topshiriqlarim» bloki (bosh panel qayta qurilganda); andozalar (CEO rad etdi).

**Ataylab yo'q:** sozlanadigan ustun va maydonlar; vaqt hisobi; bog'liqliklar va
vaqt chizig'i; hujjat/chat/maqsadlar; «agar–unda» quruvchisi; oylik tasdiqlash va
imtihon natijasi uchun avtomatik topshiriq (CEO: hozircha kerak emas).

## 3. Topshiriq modeli va hayot yo'li

### 3.1 Maydonlar

| Maydon | Ma'nosi |
| --- | --- |
| Sarlavha (majburiy, 200 belgigacha), tavsif (5000 gacha) | matn |
| Holat | `NEW` Yangi · `IN_PROGRESS` Jarayonda · `IN_REVIEW` Tekshiruvda · `DONE` Bajarildi · `CANCELLED` Bekor qilingan |
| Muhimlik | `LOW` Past · `MEDIUM` O'rta (boshlang'ich) · `HIGH` Yuqori · `URGENT` Shoshilinch |
| Muddat `dueAt` | UTC instant; sana tanlanib soat tanlanmasa 18:00 Toshkent; soat 08:00–22:00 oralig'ida; qo'lda berilganda yakshanba va filialning bayram kuniga qo'yilmaydi (400); tizim topshirig'ining muddati shunday kunga tushsa, keyingi ish kuniga suriladi (`nextWorkingDay`) |
| Beruvchi `authorId` | `null` = Tizim |
| Tur `kind` | `MANUAL` · `LESSON_QUESTION` · `CALLBACK` · `BROKEN_PROMISE` · `UNCALLED_LEAD` |
| Bog'liq `entityType` / `entityId` | `COMMENTABLE_ENTITY_TYPES` dan (Student, Group, Lead, User); ixtiyoriy |
| Filial `branchId` | bog'langan narsaning filiali; bo'lmasa beruvchi tanlab turgan filial; CEO filialsiz bo'lsa va bog'liq yo'q — `null`; filialsiz lid — `null` |
| `requiresPhoto` | rasm bilan tasdiqlanadi |
| `batchId` | «Har biriga alohida» bilan berilgan nusxalar to'plami |
| `recurrenceId` | takrorlanish qoidasi |
| `sourceKey` | tizim topshirig'i manbasi (`unmarked:<id>`, `calllog:<id>`, `promise:<id>`, `lead:<id>`) |
| `claimedById` | birinchi javob bergan oldi (tizim topshiriqlari) |
| `returnedCount`, `lastReturnedAt` | qaytarilganlar soni |
| `closedAt`, `cancelledAt`, `cancelReason` | yopilish |

**Ishtirokchilar** (`TaskParticipant`): `userId`, `role` = `ASSIGNEE` ijrochi ·
`WATCHER` kuzatuvchi, `seenAt` (varaqni birinchi ochgan vaqt — «ko'rdi»
belgisi). Bir odam bitta topshiriqda bitta rol.

**Holat topshiriqniki, ijrochiniki emas.** Bir nechta ijrochi bo'lsa, holat
bitta: bittasi «Bajardim» desa, topshiriq tekshiruvga o'tadi. Har ijrochiga o'z
nusxasi kerak bo'lsa, «Har biriga alohida» belgilanadi: har ijrochi uchun
alohida `Task` yaratiladi, hammasi bitta `batchId` bilan.

### 3.2 O'tishlar

| Kim | Qayerdan → Qayerga | Shart |
| --- | --- | --- |
| Ijrochi | NEW → IN_PROGRESS | — |
| Ijrochi | NEW / IN_PROGRESS → IN_REVIEW | `requiresPhoto` bo'lsa, oxirgi qaytarishdan (yoki yaratilishdan) keyin kamida 1 rasm qo'shilgan bo'lishi shart (400) |
| Ijrochi | NEW / IN_PROGRESS → DONE | faqat o'ziga yozilgan topshiriqda (beruvchi = yagona ijrochi) |
| Beruvchi | IN_REVIEW → DONE | «Qabul qilish» |
| Beruvchi | IN_REVIEW → IN_PROGRESS | «Qaytarish», sabab majburiy (trim, bo'sh — 400); `returnedCount + 1` |
| Beruvchi | har qanday ochiq → CANCELLED | «Bekor qilish»; sabab ixtiyoriy |
| Hech kim | DONE / CANCELLED → ochiq | yo'q; kerak bo'lsa «Nusxa olish» |
| Tizim | ochiq → DONE | tizim topshiriqlari faqat manbasi hal bo'lganda (7-bo'lim) |

Tizim topshirig'ini (kind ≠ MANUAL) qo'lda tahrirlab, DONE/CANCELLED qilib
bo'lmaydi (400). Ijrochi uni IN_PROGRESS ga olishi mumkin («Boshladim» = oldi).

Ijrochi sarlavha, tavsif, muddat, ijrochilarni o'zgartira olmaydi — beruvchi,
o'z filialidagi topshiriqda filial direktori va CEO o'zgartiradi (5-bo'lim).

«Muddati o'tdi» — holat emas, hisoblanadi: `dueAt < now` va holat ochiq.

### 3.3 Qadamlar (`TaskStep`)

`title`, `position`, `doneAt`, `doneById`. Ijrochi ham, beruvchi ham qo'shadi
va belgilaydi; o'chirish va nomini o'zgartirish beruvchida. Hammasi
belgilanmasdan tekshiruvga yuborilsa, ekran bir marta so'raydi («3 ta qadam
belgilanmagan — baribir yuborasizmi?»); server to'smaydi.

### 3.4 Muhokama va tarix (`TaskEvent`)

Bitta oqim, bitta jadval: `type` = `COMMENT` · `VOICE` · `FILE` · `STATUS` ·
`RETURN` · `STEP` · `ASSIGNEE` · `CREATED` · `CANCELLED` · `AUTO_CLOSED` ·
`REASSIGNED`; `actorId` (`null` = Tizim), `text`, `fileId`, `meta` (eski/yangi
holat, qadam nomi, qaytarish sababi), `via` = `WEB` · `TELEGRAM`. Muhokama
varaqda vaqt tartibida ko'rsatiladi; `COMMENT`/`VOICE`/`FILE` — xabar, qolganlari
— kulrang tarix qatori.

Izoh ichida `@` bilan belgilash yo'q (keyinga).

### 3.5 Fayllar (`TaskFile`)

`taskId`, `eventId?`, `key`, `name`, `size`, `mime`, `kind` = `IMAGE` ·
`DOCUMENT` · `VOICE`, `uploadedById`, `via`, `deletedAt`, `deletedById`.

- Bitta fayl 20 MB gacha (Telegram cheklovi bilan bir xil). Ruxsat: jpg, png,
  webp, pdf, docx, xlsx, ogg/opus/webm (ovoz), mp4 (qisqa video). Kengaytma
  mime'dan olinadi, nomdan emas (`upload.constraints.ts` qoidasi).
- Ovozli xabar 3 daqiqagacha.
- Faylni qo'shgan odam yoki beruvchi o'chiradi; `deletedAt` qo'yiladi, obyekt
  30 kundan keyin tozalanadi; tarixda «faylni o'chirdi» qatori qoladi.
- Fayllar **yopiq** R2 bucket'da; serverdan o'tmaydi (9.4).

### 3.6 Takrorlanish (`TaskRecurrence`)

`freq` = `DAILY` · `WEEKLY` · `MONTHLY`, `weekdays[]` (WEEKLY), `dayOfMonth`
(MONTHLY, 1–28), `dueTime` (HH:mm), andoza maydonlari (sarlavha, tavsif,
muhimlik, ijrochilar, kuzatuvchilar, qadamlar, `requiresPhoto`, bog'liq),
`authorId`, `branchId`, `active`, `lastTaskId`, `nextRunDate`.

- Har kuni 07:00 Toshkent cron: `nextRunDate` bugun bo'lgan qoidalar uchun
  topshiriq yaratadi, `nextRunDate` ni keyingi kunga suradi.
- Kun yakshanba yoki filialning bayrami bo'lsa — keyingi ish kuniga suriladi.
- `lastTaskId` hali ochiq bo'lsa, yangisi yaratilmaydi (eskisi «Muddati o'tdi»
  bilan turaveradi); `nextRunDate` baribir suriladi.
- Qoidani beruvchi to'xtatadi/o'chiradi; yaratilgan topshiriqlar qoladi.
- Doska kartasida «Har dushanba» belgisi; qoida varaqdan tahrirlanadi.

## 4. Ekranlar

Ko'rik sahifasidagi 20 ekran — bu spec'ning rasmiy maketi. Qisqacha:

1. **Doska** `/tasks`: 4 ustun (Yangi, Jarayonda, Tekshiruvda, Bajarildi);
   kartada muhimlik, bog'liq, muddat (qizil = o'tgan), qadamlar `2/5`,
   izohlar soni, fayl soni, ijrochi avatarlari, «Tizim» belgisi, «Rasm bilan»,
   «Har dushanba». Har ustun 50 tadan, «yana» tugmasi; Bajarildi — oxirgi 14
   kun. Filtrlar: muddat, muhimlik, beruvchi; matn qidiruvi.
2. **Ro'yxat**: muddat bo'yicha guruhlar (Muddati o'tgan / Bugun / Ertaga / Shu
   hafta / Keyinroq / Tekshiruvda), guruh ichida muhimlik.
3. **Men bergan**: har kartada «ko'rdi / hali ko'rmadi»; `batchId` nusxalari
   bitta karta («3/5 bajardi», ichida har kimning holati); Tekshiruvda ustunida
   rasm, «Qabul qilish» / «Qaytarish». Bu bo'limda surish yo'q.
4. **Barchasi** (CEO, filial direktori): jadval + 4 raqam (ochiq, muddati o'tgan,
   tekshiruvda, bugun yopildi); filial, ijrochi, beruvchi, holat, muddat
   filtrlari; sahifalab.
5. **Yuklama** (CEO, filial direktori): xodim bo'yicha ochiq / muddati o'tgan /
   shu oy bajardi / o'z vaqtida %; oy va filial tanlanadi; qator bosilsa
   «Barchasi» o'sha ijrochiga saralanadi. «O'z vaqtida» = shu oy `DONE`
   bo'lganlardan `closedAt <= dueAt` bo'lganlarining ulushi; muddatsiz
   topshiriq sanalmaydi; tizim topshiriqlari ham kiradi. 21:00 Telegram
   hisobotiga bitta qator: «Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p
   kechikkan: <ism> — K» (hisobot filiali bo'yicha, M = 0 bo'lsa qator yo'q).
6. **Tezkor berish oynasi**: sarlavha, ijrochi (faqat ruxsat etilganlar, rol
   bo'yicha guruhlab, «Telegram ulanmagan» belgisi), muddat (sana + soat),
   muhimlik, bog'liq, «Har biriga alohida», «Batafsil» tugmasi.
7. **Batafsil**: + tavsif, qadamlar, fayllar, kuzatuvchi, takrorlanish, «Rasm
   bilan tasdiqlansin».
8. **Varaq — ijrochi**: o'ng paneldan (`/tasks?task=<id>`), holat tanlagich,
   xususiyatlar, tavsif, qadamlar, fayllar, muhokama, izoh maydoni (matn, fayl,
   mikrofon), pastda asosiy tugma («Tekshiruvga yuborish» / «Rasm qo'shib,
   tekshiruvga yuborish» / «Bajarildi»).
9. **Varaq — beruvchi tekshiradi**: rasm tepada, «Qabul qilish», «Qaytarish»
   (sabab majburiy), tarix.
10. **Tizim topshirig'i**: qulflangan maydonlar, manba kartasi (o'quvchi, qarz,
    telefon, oldingi qo'ng'iroq), ishni qiladigan tugma («Qo'ng'iroqni yozish»,
    «Javob berish», «Lidni ochish»).
11. **Kartadagi «Topshiriqlar» bloki** (o'quvchi, guruh, lid, xodim): ochiq
    topshiriqlar + «Topshiriq» tugmasi (bog'liq o'zi to'ladi); «Yopilganlar
    (N)». Izohlar bo'limida faqat oddiy izoh qoladi.
12. **Telefon**: ro'yxat birinchi, pastdagi yumaloq «+», varaq to'liq ekran,
    asosiy tugma pastda.
13–14. Qo'ng'iroqcha va Telegram — 8- va 6-bo'limlar.
15. **Ovozli xabar**: izoh maydonidagi mikrofon (uch holat: oddiy / yozilmoqda /
    yuborishga tayyor); muhokamada pleyer, 1x / 1,5x.
16. **Fayllar**: rasmlar thumbnail, hujjatlar qator (nomi, hajmi, kim, qachon),
    katta ko'rish oynasi (chap/o'ng), yuklab olish, o'chirish.
17. **Qadamlar**: kim va qachon belgilagani; yuborishda bir martalik so'rov;
    Telegram'da «Qadamlar» tugmasi.
18. **Rasm bilan yuborish oynasi**: rasm qo'shilmaguncha tugma o'chiq;
    telefonda kamera / galereya.
19. **Qo'ng'iroqcha — yangi**: «Kutilmoqda / Hammasi», tur filtrlari, guruhlangan
    qatorlar, har turning rangi, qatordagi tugma, nisbiy vaqt.
20. **Barcha bildirishnomalar** `/notifications`: chapda turlar, o'ngda kunlar
    bo'yicha ro'yxat, qidiruv.

Yon menyuda «Topshiriqlar N» — N = joriy xodimga berilgan ochiq topshiriqlar;
birortasining muddati o'tgan bo'lsa, son qizil. Yuqori panelda «+ Topshiriq»
har sahifada; o'quvchi/guruh/lid/xodim sahifasida bosilsa, bog'liq o'zi to'ladi.

Ekranda inglizcha so'z yo'q; matnlar shu spec va maketdagi kabi.

## 5. Ruxsatlar va filial

Qoidalar bitta faylda: `server/src/tasks/task-policy.ts` (sof funksiyalar,
test bilan). Keyin Ruxsatlar tizimi chiqqanda shu fayl kalitlarga ulanadi
(«Topshiriq berish», «Barcha topshiriqlarni ko'rish»).

### 5.1 Kim kimga beradi

Ijrochining **eng yuqori** roli (eng kichik `roleId`) hisobga olinadi:

| Beruvchi | Kimga (rol id) | Filial |
| --- | --- | --- |
| CEO (1) | 1–5 | istalgan |
| Filial direktori (2) | 2–5 | o'z filiali |
| Administrator (3) | 3–5 | o'z filiali |
| Ustoz (4), Kassir (5) | faqat o'ziga | — |

Kuzatuvchi — ijrochi sifatida berish mumkin bo'lgan har kim, yoki beruvchining
o'zi va undan yuqori roldagilar (masalan, administrator CEO'ni kuzatuvchi qila
oladi — u faqat ko'radi).

Beruvchi va ijrochining filiali: `resolveCallerBranchScope` (`UserBranch` +
`mainBranch`) kesishsa — mumkin. CEO filialsiz. Rollar **bazadan** o'qiladi
(`whereUserMayAct`, ADR-0028), tokendan emas. Ijrochi `deletedAt: null` va
`SIGN_IN_USER_STATUSES` ichida bo'lishi shart.

### 5.2 Kim nima ko'radi

- Ishtirokchi (ijrochi, kuzatuvchi) va beruvchi — o'z topshiriqlarini.
- Filial direktori — o'z filialidagi (`branchId ∈ scope`) hamma topshiriqni.
- CEO — hammasini.
- `branchId = null` bo'lgan topshiriq (filialsiz lid, CEO'ning filialsiz
  topshirig'i) — faqat ishtirokchilar va CEO.
- Bog'langan narsa (o'quvchi, guruh, lid, xodim) uchun yaratishda
  `assertCallerMayTouchCommentEntity` tekshiradi.

### 5.3 Kim nima qiladi

| Rol | Huquq |
| --- | --- |
| Ijrochi | holat (3.2), qadam belgilash/qo'shish, izoh, fayl |
| Kuzatuvchi | ko'rish, izoh |
| Beruvchi | hammasi + qabul/qaytarish/bekor + ijrochi, kuzatuvchi, muddat, matn, qadam o'chirish, takrorlanish |
| Filial direktori (o'z filiali), CEO | beruvchi huquqi har topshiriqda (masalan, ketgan xodimning topshirig'ini o'tkazish) |
| Tizim topshirig'i | matn, muddat, ijrochi qulflangan; faqat IN_PROGRESS ga olish, izoh va fayl |

Hamma tekshiruv serverda (`TaskPolicy` + guard); ekran faqat tugmani
yashiradi. Fayl havolasini olish ham «ko'ra oladi» tekshiruvidan o'tadi.

### 5.4 Ishdan ketgan xodim

`User` SUSPENDED / TERMINATED / ARCHIVED yoki `deletedAt` bo'lganda
(`entity.status.changed` + arxiv yo'li):
- `MANUAL` topshiriqlarda u yagona ijrochi bo'lsa — ijrochi beruvchiga
  o'tkaziladi (`REASSIGNED` hodisasi, beruvchiga xabar «ijrochisiz qoldi»);
  boshqa ijrochilar bo'lsa — faqat olib tashlanadi.
- Tizim topshiriqlarida — filialning faol administratorlariga (yo'q bo'lsa
  direktorlar, keyin CEO — `lessonTaskAssigneeIds` zinasi).
- Kuzatuvchilikdan olib tashlanadi. Telegram tugmalari ishlamaydi (6.5).

## 6. Telegram

### 6.1 Darhol, tugmalar bilan

Topshiriq xabarlari **ADR-0025 dan chiqariladi**: 20:00 yig'ma xabarga
`TASK_*` qatorlari endi qo'shilmaydi, xabar darhol (tungi tinchlik bilan)
boradi. Yuboruvchi — `src/tasks/telegram/` (asosiy bot); u
`direct-send.guard.spec.ts` ALLOWED ro'yxatiga va ADR-0025 ning o'zgarishi
sifatida yangi ADR'ga kiradi. Faqat `User.telegramChatId` bo'lgan xodimga.

| Hodisa | Kimga | Tugmalar |
| --- | --- | --- |
| Berildi; ijrochi qo'shildi | ijrochiga | Boshladim · Bajardim · Ochish (+ Qadamlar, qadam bo'lsa) |
| Ijrochidan olib tashlandi | o'sha xodimga | — |
| Tekshiruvga keldi | beruvchiga | Qabul qilish · Qaytarish · Ochish |
| Qabul qilindi / qaytarildi | ijrochiga | (qaytarilganda) Bajardim · Ochish |
| Yangi izoh / ovoz / fayl | ishtirokchilarga, yozgandan tashqari | Ochish |
| Muddatdan 1 soat oldin | ijrochiga (ochiq bo'lsa) | Bajardim · Ochish |
| Muddati o'tdi | ijrochi va beruvchiga, bir marta | Ochish |
| Bajarildi / bekor qilindi | kuzatuvchiga (faqat shu ikkisi) | Ochish |
| Tizim topshirig'i | ijrochilarga | Ochish |
| «Dars bo'ldimi?» | **yuborilmaydi** (dars tugash eslatmasi bor) | — |

«Boshladim» → IN_PROGRESS; «Bajardim» → IN_REVIEW (o'ziga yozilganda DONE);
`requiresPhoto` bo'lsa bot «Rasmni shu xabarga javob qilib yuboring» deydi va
rasm kelgach o'tkazadi. «Qaytarish» → bot sababni so'raydi, javob matni sabab.
Tugma bosilganda yangi xabar emas, **o'sha xabar tahrirlanadi**
(`editMessageText` + yangi tugmalar). «Ochish» — `/tasks?task=<id>` havolasi
(`admin.` yoki `lehrer.` portali — `staffPortalFor`).

Xabar matni: sarlavha qatori «Yangi topshiriq · Yuqori», sarlavha, Bergan,
Muddat, Bog'liq, Qadamlar `0/5`. Namunalar — maketning 14-ekrani.

### 6.2 Javob

Topshiriq xabariga **javob** (`reply_to_message`) sifatida kelgan:
- matn → `COMMENT`;
- rasm/hujjat (≤ 20 MB) → bot faylni oladi, yopiq xotiraga yuklaydi → `FILE`;
- ovoz → `VOICE` (ogg/opus, saytda tinglanadi).

Bot «Topshiriqqa qo'shildi» deb javob beradi. Javob xabarning qaysi
topshiriqqa tegishli ekani `TaskTelegramMessage(chatId, messageId → taskId,
purpose)` dan topiladi; `purpose` = `NOTICE` · `PHOTO_PROMPT` ·
`RETURN_PROMPT`. Javob bo'lmagan oddiy xabar — mavjud bot oqimlariga.

### 6.3 «Topshiriqlarim»

Xodim menyusiga (`staffMenuKeyboard`) yangi tugma. Javob: ochiq topshiriqlar
guruhlab (Muddati o'tgan / Bugun / Keyinroq), 10 tagacha raqamli tugma;
raqam bosilsa topshiriq o'z tugmalari bilan. «Qadamlar» tugmasi qadamlarni
ro'yxat tugmalari qilib chiqaradi (✓ bilan), bosish belgini almashtiradi.

### 6.4 Tungi tinchlik

22:00–08:00 Toshkent oralig'ida tayyor bo'lgan xabar 08:00 da ketadi;
`URGENT` muhimlikdagi topshiriq xabari darhol. Bu qoida navbatda (9.3).

### 6.5 Kimligini tekshirish

Tugma va javobda xodim `staffLinkedToChatWhere` orqali aniqlanadi; ikki faol
hisob bitta chatda — rad. Topshiriqda ishtirokchi/beruvchi ekani
`TaskPolicy` bilan tekshiriladi; ketgan xodimga `answerCbQuery('Bu
topshiriq sizda emas')`. Callback: `tk:<amal>:<taskId>`; qadam uchun
`tk:step:<stepId>`.

### 6.6 Buzilgan va'da

Administratorlarga hozir `PAYMENT_PROMISE_OVERDUE` xabari (darhol) boradi;
uning o'rniga `BROKEN_PROMISE` topshirig'i xabari boradi (ikkalasi birga
emas). CEO'ga boradigan xabar o'zgarmaydi.

## 7. Avtomatik topshiriqlar

Umumiy qoida: har manba uchun ko'pi bilan bitta ochiq topshiriq — qisman
unikal indeks `(sourceKey) WHERE status IN (NEW, IN_PROGRESS, IN_REVIEW)`;
takror ishga tushgan tekshiruv nusxa yaratmaydi. Muallif Tizim, tahrirlanmaydi,
faqat manba hal bo'lganda yopiladi (`AUTO_CLOSED`, `meta.reason`). Bir nechta
ijrochi bo'lsa «birinchi javob bergan oladi»: birinchi holat o'zgarishi
`claimedById` yozadi va boshqa ijrochilarni olib tashlaydi (Serializable,
`claimSystemTask` qoidasi saqlanadi). Qo'shish — `task-auto-rules.ts` dagi
bitta yozuv (kind, matn, ijrochi zinasi, muddat, yopuvchi hodisalar).

| Tur | Qachon yaratiladi | Ijrochi | Muddat | O'zi yopiladi |
| --- | --- | --- | --- | --- |
| `LESSON_QUESTION` | hozirgidek, `createLessonTask` → `Task` | filial administratorlari (zina) | keyingi ish kuni 10:00 | darsga javob (HELD/NOT_HELD/RESCHEDULED), guruh o'chirilsa — `closeTasksOfDeletedGroup` |
| `CALLBACK` | `CallLog` `followUpAt` bilan yozilganda, darhol (`call-log.created` hodisasi — yangi) | `calledById` | `followUpAt` kuni 18:00; Telegram xabari o'sha kuni 08:00 (`sendAfter`) | o'sha o'quvchiga yangi `CallLog` yoki `payment.received` |
| `BROKEN_PROMISE` | 09:00 cron va'dani BROKEN qilganda (`payment-promise.overdue`) | filial administratorlari, claim | o'sha kuni 18:00 | `payment.received` yoki yangi `CallLog` |
| `UNCALLED_LEAD` | soatlik cron 08–18 Du–Sh: `calledAt = null`, `statusEnum = NEW`, `createdAt < now − 24h`, `deletedAt = null` | filial administratorlari; `branchId = null` lid — kompaniyaning barcha administratorlari | yaratilgan kuni 18:00 | `PATCH /leads/:id/called` (`lead.called` hodisasi — yangi) yoki lid holati o'zgarsa (`entity.status.changed`, Lead) |

«Dars bo'ldimi?» ning qolgan qoidalari (ADR-0054, ADR-0060, ADR-0068,
`UnmarkedLesson.claimedById`, 400/409 javoblari) o'zgarmaydi; faqat
`UnmarkedLesson.taskCommentId` o'rniga `taskId` bo'ladi.

Yangi hodisalar: `call-log.created { callLog }`, `lead.called { leadId }`.
Hamma yopuvchi tinglovchi `TaskAutoCloseListener` da, bitta joyda.

## 8. Qo'ng'iroqcha (5-bosqich)

Prod raqamlari (14 kun): ~10 xabar/kun administratorga, 86% davomat; o'qilmagan
450–780. Sabab: eslatma ish bajarilganda yopilmaydi va son hammasini sanaydi.

- `Notification` ga ikkita maydon: `actionRequired Boolean @default(false)`,
  `resolvedAt DateTime?`, `groupKey String?`.
- **Son** = `actionRequired && resolvedAt == null && !isRead`.
- **O'zi yopiladi** (`resolvedAt`): davomat saqlansa — o'sha guruh va kunning
  `ATTENDANCE_*` xabarlari; topshiriq yopilsa — uning `TASK_*` xabarlari;
  va'da bajarilsa — `PAYMENT_PROMISE_OVERDUE`. Yopuvchi — `NotificationResolver`
  xizmati, hodisalarni tinglaydi.
- `actionRequired = true`: `ATTENDANCE_ADMIN_ALERT`, `ATTENDANCE_MISSING_*`,
  `ATTENDANCE_TEACHER_WARNING`, `LESSON_STARTED`, `TASK_ASSIGNED`,
  `TASK_REMINDER`, `TASK_REVIEW` (`NotificationType` ga 1-bosqichda qo'shiladi),
  `PAYMENT_PROMISE_OVERDUE`. Qolganlari ma'lumot.
- **Guruhlash**: `groupKey` (masalan `attendance:<day>`), mijoz bir kun ichida
  bir xil `groupKey` ni bitta qator qiladi («Davomat olinmagan · 3 guruh»,
  ichida har guruh va tugmasi).
- Panel: «Kutilmoqda» (actionRequired, yopilmagan) / «Hammasi»; tur filtrlari
  (Topshiriqlar, Davomat, To'lovlar, Tizim); har turning ikonkasi va rangi;
  nisbiy vaqt; qatorda tugma (Ochish / Ko'rish); «Hammasini o'qilgan qilish».
- `/notifications` sahifasi: kunlar bo'yicha, turlar chapda, qidiruv,
  sahifalab (`GET /notifications?type=&q=&cursor=`).
- **Bir martalik tozalash** (migratsiya skripti, `--apply` bilan): 7 kundan eski
  o'qilmagan xabarlar `isRead = true`; xabarlar o'chirilmaydi.
- Mijozdagi `AppNotification.type` birligi hamma turni qamraydi (hozir 4 ta).

## 9. Texnik tuzilma

### 9.1 Bitta eshik

`TasksService` — yaratish, holat, ishtirokchi, qadam, izoh, fayl uchun yagona
yo'l; sayt (`TasksController`), Telegram (`TaskTelegramHandler`) va avtomatika
(`TaskAutoService`) shu xizmatni chaqiradi. Ruxsat, filial, o'tish qoidalari
shu yerda bir marta. To'g'ridan-to'g'ri `prisma.task.*` yozish faqat
migratsiya skriptida (spec bilan qulflanadi: `task-write.single-source.spec.ts`).

### 9.2 Jadvallar

`Task`, `TaskParticipant` (`@@unique([taskId, userId])`), `TaskStep`,
`TaskEvent` (`@@index([taskId, createdAt])`), `TaskFile`, `TaskRecurrence`,
`TaskTelegramMessage` (`@@unique([chatId, messageId])`), `TaskOutbox`.
Indekslar: `Task(companyId, status, dueAt)`, `Task(branchId, status)`,
`TaskParticipant(userId, role)`, `Task(authorId, status)`, qisman unikal
`sourceKey` (7-bo'lim), `Task(batchId)`, `Task(entityType, entityId)`.
Hammasi `companyId` bilan. `UnmarkedLesson.taskId String? @unique` qo'shiladi,
`taskCommentId` ko'chirishdan keyin olib tashlanadi. `Comment.migratedTaskId
String?` — ko'chirilgan izoh-topshiriq belgisi.

### 9.3 Xabar navbati (`TaskOutbox`)

`channel` = `INAPP` (qo'ng'iroqcha + push; 1-bosqich) · `TELEGRAM`
(2-bosqich), `userId`, `taskId`, `kind`, `payload`, `sendAfter`, `attempts`,
`sentAt`, `lastError`. Har daqiqa cron: `sendAfter <= now`, `sentAt null`,
`attempts < 3`; Telegram yuborilgach `TaskTelegramMessage` yoziladi. Darhol
ketadigan xabarlar (berildi, izoh, tekshiruv) outbox'siz, hodisadan to'g'ri
ketadi; outbox faqat vaqtga bog'liq (eslatma, muddati o'tdi) va tungi
tinchlikka tushgan xabarlar uchun.
Tungi tinchlik `sendAfter` bilan: 22:00–08:00 → keyingi 08:00 (URGENT
bundan mustasno). Eslatma (`dueAt − 1h`) va «muddati o'tdi» (`dueAt`)
qatorlari yaratilishda yoziladi, muddat o'zgarsa qayta; yuborishdan oldin
topshiriq hali ochiqligi tekshiriladi. Deploy yoki qayta yoqishda yo'qolmaydi.
Telegram 429 — `retry_after`; 403 (bot bloklangan) — `attempts = 3`.
30 kundan eski yuborilgan qatorlar tozalanadi.

Qo'ng'iroqcha, SSE va push — hozirgi `NotificationEventsListener` orqali,
darhol (`TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, `TASK_REMINDER`,
`TASK_REVIEW`, `TASK_UPDATED`, `TASK_DELETED` → «bekor qilindi»); push `url` =
`/tasks?task=<id>`. Bildirishnoma kimga ketishini `TaskNotifyPlan` (sof
funksiya) hisoblaydi — Telegram va qo'ng'iroqcha bitta ro'yxatdan.

### 9.4 Fayl yo'li

- Yangi yopiq bucket: `R2_TASKS_BUCKET_NAME` (+ shu `R2_ENDPOINT`,
  kalitlar). `env.validation.ts` 3-bosqichdan boshlab talab qiladi; bo'lmasa
  fayl tugmalari ko'rinmaydi (`GET /tasks/config` → `filesEnabled`).
- Yuklash: `POST /tasks/:id/files/presign { name, mime, size }` → `{ fileId,
  uploadUrl }` (presigned PUT, 10 daqiqa, `ContentLength` cheklangan); mijoz
  PUT qiladi; `POST /tasks/:id/files/:fileId/complete` → server `HeadObject`
  bilan hajmni tasdiqlaydi, `TaskFile` faollashadi, `FILE`/`VOICE` hodisasi.
  Tasdiqlanmagan qatorlar 1 soatdan keyin tozalanadi.
- Ochish: `GET /tasks/:id/files/:fileId/url` → presigned GET, 10 daqiqa; faqat
  topshiriqni ko'ra oladiganga.
- Telegram'dan kelgan fayl — bot oladi (`getFile`, ≤ 20 MB) va serverdan
  `PutObject` qiladi; bu yagona istisno.
- Ovoz: saytda `MediaRecorder` (webm/opus), 3 daqiqa cheklov mijozda va
  serverda (`size`); Telegram'dan ogg/opus. Pleyer `<audio>`.
- `@aws-sdk/s3-request-presigner` qo'shiladi.

### 9.5 API

```
GET    /tasks?view=my|created|all&status=&assignee=&author=&branch=&due=&priority=&q=&cursor=
GET    /tasks/counts                      -> yon menyu soni, bo'lim sonlari
GET    /tasks/workload?month=&branch=     -> Yuklama (CEO, BD)
GET    /tasks/assignable?entityType=&entityId=  -> ijrochi ro'yxati (rol bo'yicha)
POST   /tasks                             -> {title, description?, assigneeIds, watcherIds?, dueAt?, priority?, entityType?, entityId?, requiresPhoto?, separateCopies?, steps?, recurrence?}
GET    /tasks/:id                         -> varaq (hodisalar sahifalab: ?before=)
PATCH  /tasks/:id                         -> matn, muddat, muhimlik, requiresPhoto
POST   /tasks/:id/status {status, reason?}
POST   /tasks/:id/review {action: ACCEPT|RETURN, reason?}
POST   /tasks/:id/cancel {reason?}
POST   /tasks/:id/duplicate
PUT    /tasks/:id/participants {assigneeIds, watcherIds}
POST   /tasks/:id/seen
POST   /tasks/:id/steps · PATCH /tasks/:id/steps/:stepId · DELETE ...
POST   /tasks/:id/events {text}           -> izoh
files: 9.4
GET    /tasks/recurrences · PATCH /tasks/recurrences/:id · DELETE ...
```
Hammasi `@Roles(...STAFF_ROLES)`; `TaskPolicy` ichida toraytiradi. SSE:
`task.updated { id }` ishtirokchilarga — mijoz faqat shu kartani qayta oladi.
Javoblar `{ data, nextCursor }`; ro'yxat jadvalida `select` tor.

### 9.6 Cronlar

| Vaqt | Nima |
| --- | --- |
| har daqiqa | `TaskOutbox` yuborish |
| 07:00 kunlik | takrorlanish |
| 08–18 soatlik, Du–Sh | `UNCALLED_LEAD` |
| 03:00 kunlik | tozalash: presign qoldiqlari, eski outbox, o'chirilgan fayllar (30 kun) |

Mavjud `TaskReminderService` (izoh topshiriqlari uchun) 1-bosqichda
o'chiriladi; eslatma outbox orqali (`INAPP` 1-bosqichdan, `TELEGRAM`
2-bosqichdan).

### 9.7 Eski kodning taqdiri (1-bosqich)

- `POST /comments` `isTask` qabul qilmaydi (400); `GET /comments/my-tasks`,
  `created-tasks`, `PATCH /comments/:id/assignee-status` o'chiriladi;
  `CommentForm` dagi topshiriq rejimi o'chiriladi; `use-tasks-board.ts` va
  `task-card.tsx` yangi modelga.
- Izoh ro'yxati `isTask = true` qatorlarni ko'rsatmaydi.
- `lesson-task.ts`, `claimSystemTask`, `closeLessonTask`,
  `closeTasksOfDeletedGroup`, `task-reminder.service.ts`, lid hover'dagi
  `isTask` — `Task` ga o'tadi.
- `CommentAssignee` jadvali 1-bosqichda qoladi (ko'chirish uchun), keyingi
  tozalash PR'ida o'chiriladi.

## 10. Ko'chirish

`scripts/migrate-comment-tasks.ts` — sukut bo'yicha sinov rejimi
(`default_transaction_read_only=on`, tekshiriladi), `--apply` bilan yozadi,
qayta yuritilsa `migratedTaskId` bo'lganlarni o'tkazib yuboradi.

- `Comment.isTask` → `Task`: `kind` = `isSystem ? LESSON_QUESTION : MANUAL`,
  `authorId`, `title` = content (birinchi 200 belgi), `description` = qolgani,
  `dueAt`, `priority`, `entityType/Id`, `branchId` (bog'liq narsadan),
  `companyId`, `createdAt` saqlanadi.
- Holat: barcha ijrochilar DONE → `DONE` (`closedAt` = oxirgi `doneAt`);
  birortasi SEEN → `IN_PROGRESS`; aks holda `NEW`. PENDING/SEEN/DONE aralash
  (prod: 0 ta) → `IN_PROGRESS`.
- `CommentAssignee` → `TaskParticipant(ASSIGNEE, seenAt)`; `LESSON_QUESTION`
  da `UnmarkedLesson.claimedById` saqlanadi, `UnmarkedLesson.taskId` to'ldiriladi.
- `Notification.commentId` → `taskId` (yangi ustun `Notification.taskId`).
- `TaskEvent` ga `CREATED` va holat qatorlari (`actorId` noma'lum — Tizim).
- Sinov rejimi har topshiriq uchun bir qator chiqaradi; `--apply` oxirida
  hisob: `Task` soni = `isTask` soni, ochiqlar soni mos.
- Deploy tartibi: migratsiya (jadvallar) → server → skript `--apply` → sayt.
  Skript bajarilguncha `/tasks` bo'sh ko'rinadi; shuning uchun `--apply`
  deploydan keyin darhol, ish vaqtidan tashqarida.

## 11. Bosqichlar

| # | Nima chiqadi | Oldindan kerak |
| --- | --- | --- |
| 1 Asos | jadvallar, migratsiya, ko'chirish; `TasksService` + `TaskPolicy`; doska, ro'yxat, berish (tezkor + batafsil, fayl va ovozsiz), varaq (tavsif, qadamlar, muhokama matn, tarix), holatlar va tekshiruv, «Har biriga alohida», kuzatuvchi; Men bergan, Barchasi, Yuklama; yuqori «+», kartalardagi blok; yon menyu soni, qidiruv, nusxa; qo'ng'iroqcha/push darhol (hozirgi panel) + `TaskOutbox` (`INAPP`: eslatma, muddati o'tdi); ketgan xodim; «Dars bo'ldimi?» ko'chishi; eski yo'llar o'chadi | — |
| 2 Telegram | darhol xabar + tugmalar, xabarni tahrirlash, matnli javob, «Topshiriqlarim», «Qadamlar», tungi tinchlik, outbox; digestdan chiqarish; ADR | 1 |
| 3 Fayl va ovoz | yopiq bucket, presign, fayllar, rasm bilan tasdiqlash, ovoz (sayt + Telegram), Telegram'dan rasm/hujjat | 1, 2; CEO Cloudflare'da bucket ochadi |
| 4 Avtomatika | CALLBACK, BROKEN_PROMISE, UNCALLED_LEAD, yopuvchi tinglovchi, takrorlanish, 21:00 qatori | 1, 2 |
| 5 Qo'ng'iroqcha | 8-bo'lim to'liq | 1 (boshqalariga bog'liq emas) |

Har bosqich alohida PR + deploy; chiqarishdan oldin CEO'ga ko'rsatiladi.
Server avval, sayt keyin.

## 12. ADR

PR'da raqamlanadi (hozir 0073 band):
- **ADR-A**: Topshiriq izoh emas, alohida bo'lim; holat topshiriqniki
  (Yangi → Jarayonda → Tekshiruvda → Bajarildi); tizim topshirig'ini faqat
  manbasi yopadi; berish zinasi yuqoridan pastga.
- **ADR-B**: ADR-0025 ning o'zgarishi — topshiriq xabarlari darhol, tugmalar
  bilan, tungi tinchlik 22–08; `TASK_*` yig'ma xabardan chiqadi. ADR-0025
  holati «Qisman almashtirildi — ADR-B».

## 13. Tekshiruv

- `task-policy.spec.ts`: zina jadvali to'liq (har beruvchi roli × har ijrochi
  roli × filial), kuzatuvchi, ko'rish.
- `task-transitions.spec.ts`: 3.2 jadvali to'liq, `requiresPhoto` sharti,
  tizim topshirig'i qulfi, o'ziga yozilgan yo'l.
- `task-write.single-source.spec.ts`: `prisma.task.create|update` faqat
  `tasks/` va migratsiya skriptida.
- `direct-send.guard.spec.ts`: `src/tasks/telegram/` ALLOWED da; digest
  listener `TASK_*` ni enqueue qilmaydi (spec).
- `task-outbox.spec.ts`: tungi tinchlik, URGENT, 429/403, eslatma faqat ochiq
  topshiriqqa.
- `task-auto.spec.ts`: har tur uchun yaratish, nusxa yaratmaslik, yopuvchi
  hodisa, claim.
- `migrate-comment-tasks.spec.ts`: holat xaritasi, qayta yuritish.
- Controller spec'lari: `@Roles` bor, Student yo'q.
- Mijoz: `task-entity-href`, ro'yxat guruhlash, `deriveOverdue` — vitest.
- `npm run typecheck`, `eslint src`, to'liq suite; har bosqich brauzerda
  CEO/BD/Admin/Ustoz rollarida tekshiriladi.

## 14. Ochiq savollar

Yo'q — hammasi 06–07.10 da kelishildi. Bosqich rejasida chiqadigan mayda
qarorlar (matn so'zlari, ranglar) maketga mos qilinadi.
