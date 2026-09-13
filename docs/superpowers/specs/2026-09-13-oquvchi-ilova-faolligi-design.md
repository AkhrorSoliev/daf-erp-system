# O'quvchining ilova faolligi va mashq statistikasi

**Sana:** 13.09.2026
**Holati:** dizayn CEO tomonidan tasdiqlangan (13.09.2026, demo ko'rilgan, ochiq savollar yopilgan), amalga oshirilmagan
**Bog'liq:** ADR-0011 (o'quv o'zagi Goethe standartiga bog'lanadi), ADR-0016 (kun chegarasi
Toshkent bo'yicha), [Ball va yo'l dizayni](2026-09-06-ball-va-yol-design.md),
demo shoxi `demo/ilova-faolligi` (faqat frontend, soxta raqamlar)

---

## 1. Muammo

O'quvchi ilovasida (hozircha veb portal; Android va iOS keyin) ta'lim, radio va boshqa bo'limlar
bor. Lekin markaz **o'quvchi ilovadan qanchalik foydalanayotganini umuman bilmaydi**: kim kirgan,
qancha vaqt o'tirgan, mashqlarni qanchalik to'g'ri bajarayotgani hech bir ekranda yo'q.
O'qituvchi esa bu ma'lumotni o'z guruhi uchun ko'rishi kerak.

### Prod raqamlari (13.09.2026)

| Ko'rsatkich | Qiymat |
| --- | --- |
| Faol o'quvchi | 607 |
| Shundan ilova akkaunti borlari | 603 |
| DaF mashqiga javob bergan o'quvchi | 2 (jami 95 urinish, hammasi oxirgi 7 kunda) |
| Tugatilgan darslar | 3 (o'sha 2 o'quvchida) |
| Native ilova qurilmalari | 5 ta Android, hammasi v1.0.0, oxirgisi 06.07 — sinov telefonlari |
| Play Market / App Store | hech narsa joylanmagan |

Ikki xulosa:

1. **Hozir o'lchash boshlashning eng arzon payti.** Ma'lumot deyarli yo'q — yozuvni to'g'rilash hech
   narsani yo'qotmaydi. O'quvchilar ko'paygandan keyin qilinsa, o'sha paytgacha yig'ilgan
   ma'lumotdan bu statistikalarni chiqarib bo'lmaydi.
2. **Native ilova toza boshlanadi.** Birinchi do'kon relizida o'lchash bo'lsa, «eski versiyadagi»
   o'quvchi muammosi umuman tug'ilmaydi (8-bo'lim).

---

## 2. Nima quriladi

| Qism | Mazmuni |
| --- | --- |
| **A. Vaqt hisobi** | O'quvchi qaysi platformadan kirmasin, ilovada **faol** o'tkazgan vaqti va radio tinglagan vaqti yoziladi |
| **B. Mashq natijasi yozuvi** | Har urinish qaysi seans, savol, format va ko'nikmaga tegishli ekani saqlanadi; seans natijasi tarixi paydo bo'ladi |
| **C. Statistika** | Guruh sahifasida «Ilova faolligi» tabi (o'qituvchi + admin), o'quvchi yon oynasi, o'quvchi profilida «Ilova» tabi (admin) |
| **D. Native** | Android/iOS da xuddi shu qoida bilan o'lchash — **alohida spec**, birinchi do'kon relizidan oldin |

**Kim ko'radi:**

| Ekran | Rollar |
| --- | --- |
| Guruh sahifasi → «Ilova faolligi» tabi | CEO, Filial direktori, Administrator, O'qituvchi (faqat o'z guruhi) |
| O'quvchi yon oynasi (shu tabdan) | shu tabni ko'ra oladiganlar |
| O'quvchi profili → «Ilova» tabi | CEO, Filial direktori, Administrator |

O'qituvchi hozir o'quvchi profiliga umuman kira olmaydi (`GET /students/:id` rollarida `Teacher`
yo'q) va bu dizayn uni ochmaydi — o'qituvchi o'quvchilarini guruh sahifasi orqali ko'radi.

---

## 3. Ta'riflar — yagona manba

Bu bo'limdagi ta'riflar kodga shu so'zlar bilan ko'chadi. Ekran, API va hisobot boshqa ta'rif
ishlatmaydi.

| Atama | Ta'rif |
| --- | --- |
| **Faol vaqt** | Ilova ekranda ochiq **va** o'quvchi faol bo'lgan soniyalar. Veb: tab ko'rinib turibdi, oyna fokusda, oxirgi 2 daqiqada teginish/bosish/klaviatura/aylantirish bo'lgan **yoki** ta'lim audiosi ijro etilyapti. Native: `AppState === 'active'` va xuddi shu faollik sharti |
| **Radio vaqti** | Radio ovozi **haqiqatan yangragan** soniyalar: pleyer pauzada emas, ovozi o'chirilmagan, balandligi 0 emas. Ekran yopiq bo'lsa ham sanaladi. **Faol vaqtga qo'shilmaydi** va o'quvchini «faol» qilmaydi |
| **Shug'ullangan kun** | Toshkent kuni bo'yicha kamida **bitta mashq javobi** (`DafAttempt`, eski DiB yo'llari ham) **yoki** kamida **300 soniya radio** yozilgan kun. Faqat ilovani ochish, balans yoki jadvalga qarash **sanalmaydi**. Faol vaqtga tayanmaydi — faol vaqt ±2 daqiqa aniqlikdagi taxminiy o'lchov (CEO qarori, 13.09.2026, «C variant») |
| **Ilovaga kirgan** (davrda) | Davrda `activeSeconds ≥ 10` bo'lgan kamida bitta faollik seansi bor. Faqat «Ilovaga kirdi» kartasi uchun — shug'ullanganlikni emas, kirganlikni bildiradi |
| **Mashq kuni** | Toshkent kuni bo'yicha kamida bitta mashq javobi yozilgan kun |
| **Seriya** | Ketma-ket mashq kunlari. Bugun hali mashq qilinmagan bo'lsa uzilmaydi; bir kun butunlay tashlansa 0. **Mavjud** `FortschrittService.uebersicht().serie` — qayta hisoblanmaydi |
| **Savol** | Seansdagi bitta savol (`PublicFrage`). Juftlash savoli (4 yoki 6 juft) **bitta** savol. Xatodan keyin boshqa formatda qayta berilgan savol **yangi savol emas** — o'sha savolning 2-urinishi |
| **To'g'ri javob %** | Baholangan savollar bo'yicha **birinchi urinish** ballarining o'rtachasi × 100. Hozirgi formatlarda ball 0 yoki 1, ya'ni bu «birinchi urinishda to'g'ri topilgan savollar / javob berilgan savollar». Juftlash savoli barcha juftlar birinchi bosishda to'g'ri bo'lsagina 1. O'quvchi natija ekranidagi «12 dan nechtasi» (`seans-navbat.ts`, `togri / jami`) bilan **bir xil** ta'rif |
| **Tugatilgan dars (kurs progressi)** | `DafLessonProgress.completedAt` bor dars — har dars bir marta sanaladi |
| **Davrda tugatilgan darslar** | Davr ichida kamida bitta tugatilgan `LESSON` seansi bor **turli** darslar soni. Bitta darsni qayta ishlash qo'shimcha sanalmaydi; har bir ishlash seanslar tarixida ko'rinadi |
| **Kurs** | Bir darajaning yangi kursi: `DafUnit.code IS NOT NULL AND retiredAt IS NULL` bo'lgan bo'limlar va ularning darslari. Eski DiB bo'limlari (`code` bo'sh) kursga kirmaydi |
| **Joriy daraja** | 6.4-bo'limga qarang |
| **So'z holati** | `DafLexemeState.strength`: 3–5 «mustahkam», 1–2 «o'rganilmoqda», 0 «yangi yoki xato» |

---

## 4. A qism — vaqt hisobi

### 4.1 Nega vaqtni klient o'lchaydi

«Ekran ochiqmi» va «o'quvchi hozir tegyaptimi» degan savolga faqat klient javob bera oladi. Server
faqat so'rovlarni ko'radi, o'quvchi esa darsni o'qiyotganda serverga deyarli murojaat qilmaydi —
20 daqiqa o'qigan o'quvchi server loglarida 1 daqiqa bo'lib ko'rinardi.

Rad etilgan yo'llar:

| Yo'l | Nega yo'q |
| --- | --- |
| So'rov vaqtlaridan vaqt chiqarish | O'qish, tinglash va o'ylash vaqti ko'rinmaydi — noto'g'ri raqam yo'q raqamdan yomon |
| Faqat `auth/refresh` da kirishni yozish | «Kirdi» deydi, «qancha ishladi» demaydi |
| PostHog / Firebase Analytics | Ma'lumot bazadan tashqarida — profil, guruh va filial qamroviga bog'lab bo'lmaydi; pul va maxfiylik |
| Har daqiqa «+60» heartbeat | Fon tabida taymer sekinlashadi, uzilishda vaqt yo'qoladi yoki ikki marta sanaladi |

### 4.2 Seans va yuborish

- Klient **faollik seansi** uchun o'zi `sessionId` (uuid) yaratadi. Yangi seans boshlanadi:
  30 daqiqa faolsizlikdan keyin, Toshkent yarim tunida, chiqish (logout) va yangi kirishda.
- Klient har **60 soniyada** va sahifa yashirinayotganda/yopilayotganda **jami** qiymatlarni
  yuboradi — delta emas:

```ts
// POST /api/student-portal/activity   (@Roles('Student'))
interface ActivityHeartbeatDto {
  sessionId: string;                 // uuid v4
  platform: 'WEB' | 'ANDROID' | 'IOS';
  appVersion?: string;
  activeSeconds: number;             // seans boshidan jami
  radioSeconds: number;              // seans boshidan jami
  sections: { LERNEN?: number; OTHER?: number }; // faol vaqtning taqsimoti, jami
}
```

- Jami qiymat yuborilgani uchun takroriy so'rov, qayta urinish yoki bir vaqtda kelgan ikki so'rov
  vaqtni **ko'paytirmaydi** — server har maydonda `max(eski, yangi)` oladi.

### 4.3 Server qoidalari

1. `studentId` va `companyId` **tokendan** olinadi, so'rov tanasidan emas.
2. `sessionId` boshqa o'quvchiga tegishli bo'lsa — `403`.
3. Birinchi so'rovda server o'z vaqti bilan `firstSeenAt` va `day` (Toshkent kuni) ni muhrlaydi;
   `branchId` ham shu paytda muhrlanadi (`DafAttempt` dagi kabi, jonli bog'lanishdan o'qilmaydi).
4. **Soat bilan qirqish:** `activeSeconds` va `radioSeconds` ning har biri
   `(hozir − firstSeenAt) + 120 s` dan oshmaydi. Qo'lda soxta katta raqam yuborib bo'lmaydi —
   eng yomon holatda «ilova ochiq bo'lgan butun vaqt» sanaladi.
5. `sections` har kalit bo'yicha `max`, keyin yig'indisi `activeSeconds` dan oshsa mutanosib qirqiladi.
6. Seansning Toshkent kuni o'zgargan bo'lsa (klient yarim tunda seansni almashtirmagan), so'rov
   `409` bilan rad etiladi va klient yangi seans ochadi. Bitta seans hech qachon ikki kunga tushmaydi.

### 4.4 Ma'lumot modeli

```prisma
enum AppPlatform {
  WEB
  ANDROID
  IOS
}

/// Bitta faollik seansi. Klient jami qiymatlarni yuboradi, server `max` va soat bilan qirqadi.
model StudentAppSession {
  id            String      @id            // klient yaratgan uuid
  studentId     Int
  companyId     Int
  branchId      Int?                       // yozish paytida muhrlanadi
  platform      AppPlatform
  appVersion    String?
  day           DateTime    @db.Date       // Toshkent kuni, firstSeenAt dan
  firstSeenAt   DateTime
  lastSeenAt    DateTime
  activeSeconds Int         @default(0)
  radioSeconds  Int         @default(0)
  sections      Json        @default("{}")
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  student Student @relation(fields: [studentId], references: [id])

  @@index([studentId, day])
  @@index([companyId, day])
  @@index([branchId, day])
}
```

Hajm: bitta o'quvchiga kuniga bir necha qator. 600 o'quvchida yiliga bir necha yuz ming qator —
yig'ma jadval kerak emas.

### 4.5 Veb klient

- **`ActivityHost`** — portal qobig'ida (`student-portal-layout.tsx`) `RadioHost` yoniga bir marta
  qo'yiladigan boshsiz komponent. O'lchash mantig'i React'dan tashqarida, **sof modul**da
  (`activity-tracker.ts`) — vitest bilan sinaladi.
- Har soniyada: `Date.now()` farqi olinadi va **5 soniyadan oshsa qirqiladi** (kompyuter uxlab
  qolgan bo'lsa soxta vaqt qo'shilmasin). Shart bajarilsa faol vaqtga qo'shiladi; bo'lim
  `pathname` dan: `/portal/lernen*` → `LERNEN`, qolgani → `OTHER`.
- **Faollik hodisalari:** `pointerdown`, `keydown`, `touchstart`, `wheel`, `scroll` (passive).
- **Ta'lim audiosi:** `use-clip-player.ts` `new Audio()` yaratadi — u DOM'da yo'q, shuning uchun
  `querySelector('audio')` uni topmaydi. Ta'lim audio pleyerlari (`use-clip-player.ts`,
  `ovoz-tugmasi.tsx`) umumiy **media reyestri**ga ro'yxatdan o'tadi; tracker reyestrdagi biror
  element ijro etilayotganini tekshiradi. Radio elementi reyestrga **kirmaydi**.
- **Ikki tab:** faqat fokusdagi oyna sanaladi (`document.hasFocus()`), shuning uchun ikki tab
  vaqtni ikki marta sanamaydi. (Suhbatda serverda interval birlashmasi taklif qilingan edi —
  fokus sharti bu murakkablikni keraksiz qiladi.)
- **Radio:** `radio-store.ts` dagi yagona `<audio>` ning `currentTime` o'sishi o'lchanadi (soat
  emas). Brauzer JavaScript'ni uxlatsa ham uyg'onganda pozitsiya qancha siljigani ma'lum.
  Stansiya almashganda `currentTime` qaytadan boshlanadi — manfiy farq 0 deb olinadi; bir
  o'lchovdagi farq o'tgan soat vaqti + 1 s dan oshmaydi.
- **Yuborish:** `fetch(url, { keepalive: true, headers: { Authorization } })` — `sendBeacon`
  header qo'ya olmaydi. `401` bo'lsa jim o'tkaziladi: qiymat jami, keyingi yuborishda yetib boradi.
- **Yo'qolmaslik:** jami qiymatlar har 15 soniyada `localStorage` ga yoziladi (seans kaliti bilan);
  portal keyingi ochilganda yuborilmagan seans avval yuboriladi. Brauzer telefonda butunlay
  o'ldirilsa, oxirgi saqlashdan keyingi ≤ 15 s yo'qoladi.

---

## 5. B qism — mashq natijasi yozuvi

### 5.1 Hozirgi yozuvdagi bo'shliqlar

| Bo'shliq | Qayerda | Oqibati |
| --- | --- | --- |
| Urinish nima so'ralganini saqlamaydi: `exerciseId` hech qachon yozilmaydi, `lexemeId` faqat so'z savolida | `uebung.service.ts` `pruefen()`, `juft()` | Gap/ibora/dialog savolida urinish qatorida savolga ishora yo'q — «guruh qaysi mashqda qoqilyapti» ga javob yo'q |
| Urinish seansga va savolga bog'lanmagan | o'sha joy | «Birinchi urinish» ni ajratib bo'lmaydi |
| Juftlash har **bosishni** alohida qator yozadi; uning `durationMs` i savol boshidan beri o'tgan vaqt | `juft()`, `seans-ekrani.tsx` | Qatorlarni sanash ham, `durationMs` ni qo'shish ham noto'g'ri raqam beradi |
| Seans tarixi yo'q: `abschluss` `completedAt` ni ustiga yozadi, faqat eng yaxshi natija qoladi; takrorlash seansi hech qayerda qolmaydi | `abschluss()`, `seans-ekrani.tsx` | «Bu hafta nechta dars», «oxirgi natija» ni ko'rsatib bo'lmaydi |
| Format bazada yo'q | — | Ko'nikma bo'yicha ajratib bo'lmaydi |

### 5.2 Natija shartnomasi — mashq turlari ko'payishiga chidash uchun

Hozir `main` da 12 ta format bor, `feat/a1-hoeren` da yana ikkitasi (`HOEREN_WAHL`,
`HOERFRAGE`) qo'shilyapti. Statistika formatga bog'lansa, har yangi format statistika kodini
buzadi. Shuning uchun **har qanday format bitta shaklda natija yozadi**, statistika esa faqat shu
shaklni o'qiydi:

| Maydon | Ma'nosi |
| --- | --- |
| `score` | 0 dan 1 gacha. Hozirgi formatlar faqat 0 yoki 1. Kelajakdagi qisman baholanadigan formatlar (yozma ish, bir necha bo'shliq) oraliq qiymat beradi |
| `gradingStatus` | `GRADED` (baholandi), `PENDING` (o'qituvchi yoki AI keyin baholaydi), `UNGRADED` (faqat mashq) |
| `sessionId`, `questionIndex`, `attemptNo` | Qaysi seansdagi qaysi savolning nechanchi urinishi |
| `itemType`, `itemId` | Qaysi material (so'z, gap, ibora, dialog qatori) |
| `format` | Matn, enum emas — yangi format migratsiya talab qilmaydi |
| *(ko'nikma)* | Bazada **saqlanmaydi** — statistika o'qilganda `format` dan reyestr orqali hisoblanadi (5.4). Xarita o'zgarsa, eski natijalar ham yangi xarita bo'yicha ko'rinadi |

**Statistika formulalari faqat shu maydonlarni o'qiydi** va format nima ekanini bilmaydi.
`PENDING` natija baho qo'yilmaguncha foizga kirmaydi; `UNGRADED` faqat hajm va vaqtda ko'rinadi.
Baho kechiksa yozuv yangilanadi — statistika o'qilganda hisoblanadi, oldindan yig'ilgan hisoblagich
yo'q, qayta hisoblash kerak emas. O'quvchining asl javobi (`given`) saqlanishda davom etadi —
tekshirish qoidasi o'zgarsa, eski natijalarni skript bilan qayta baholash mumkin.

### 5.3 Ma'lumot modeli

```prisma
enum DafGradingStatus {
  GRADED
  PENDING
  UNGRADED
}

enum DafSessionKind {
  LESSON
  REVIEW
}

model DafAttempt {
  // ... mavjud maydonlar o'zgarmaydi (isCorrect, given, durationMs, points, companyId, branchId, groupId)
  sessionId     String?
  questionIndex Int?
  attemptNo     Int?              // 1 — asl savol, 2 — xatodan keyingi o'rinbosar
  lessonId      Int?              // takrorlash seansida bo'sh
  itemType      String?
  itemId        Int?
  format        String?          // ko'nikma bu yerda YO'Q — o'qishda reyestrdan (5.4)
  score         Float?
  gradingStatus DafGradingStatus  @default(GRADED)

  @@index([sessionId])
  @@index([studentId, sessionId])
}

/// Bitta mashq seansi. Klient uuid yaratadi; server birinchi urinishda yaratadi, tugaganda
/// natijani URINISHLARDAN o'zi hisoblaydi (klient aytgan `richtig` ga ishonmaydi).
model DafSession {
  id              String         @id
  studentId       Int
  companyId       Int
  branchId        Int?
  groupId         String?
  kind            DafSessionKind
  lessonId        Int?
  startedAt       DateTime       // birinchi urinish vaqti (server)
  finishedAt      DateTime?      // tugatilmagan seans — null
  questionCount   Int?
  firstTryCorrect Int?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([studentId, startedAt])
  @@index([groupId, startedAt])
  @@index([companyId, startedAt])
}
```

Barcha yangi maydonlar ixtiyoriy — migratsiya faqat qo'shadi, eski 95 urinish o'zgarmaydi.

### 5.4 Format → ko'nikma reyestri

Ko'nikma (`DafSkill`: WORTSCHATZ, GRAMMATIK, HOEREN, LESEN, SCHREIBEN, SPRECHEN — TypeScript
tipi, baza enum'i emas) **yozish paytida saqlanmaydi, o'qish paytida hisoblanadi**:
`server/src/daf/uebung/format-skill.ts` dagi reyestrdan. Sabab: xarita o'zgarsa (o'qituvchilar
«artikl baribir grammatika» desa) kodda bitta qator o'zgaradi va **eski natijalar ham** yangi
xarita bo'yicha ko'rinadi; muhrlangan bo'lsa tarix eski xarita bilan qolardi.

Reyestr ikki qismdan iborat:
- `Record<FrageFormat, DafSkill>` — jonli formatlar. `Record` tipi ro'yxatga kiritilmagan formatni
  **kompilyatsiya xatosi** qiladi; jest tip tekshirmagani uchun to'liqlikni alohida test tekshiradi.
- `Record<string, DafSkill>` — **nafaqadagi** formatlar. `format` bazada matn bo'lgani uchun
  o'chirilgan format tarixda qoladi; reyestrda uning ko'nikmasi ham qoladi, aks holda eski urinishlar
  «noma'lum»ga tushadi. Test: bazadagi har bir `distinct format` reyestrning birida bo'lishi kerak.

**Qoida (CEO tasdiqlagan, 13.09.2026):** ko'nikma o'quvchi mashqda **amalda nima qilayotganiga**
qarab belgilanadi, mashq kelajakda nimaga tayyorlashiga qarab emas. So'z yoki tayyor iborani
taniydi — Wortschatz; gap tuzilishi va qo'shimchalar — Grammatik; gap yoki suhbatni o'qib
tushunadi — Lesen; eshitadi — Hören; o'zi yozadi — Schreiben; o'zi gapiradi — Sprechen.

| Format | Ko'nikma | Izoh |
| --- | --- | --- |
| `WORT_UZ`, `UZ_WORT`, `PAAR` | WORTSCHATZ | |
| `ARTIKEL` | WORTSCHATZ | Artikl so'z bilan birga yodlanadi; xato — «so'zni to'liq bilmaydi» |
| `REAKTION`, `ZUORDNEN` | WORTSCHATZ | Tayyor iborani tanlash. Sprechen emas: o'quvchi gapirmaydi, «Gapirish 90%» chalg'itardi |
| `LUECKE`, `SATZ_BAUEN` | GRAMMATIK | |
| `SATZ_UEBERSETZEN`, `DIALOG_LUECKE` | LESEN | Gap yoki suhbatni butunligicha tushunish |
| `AUDIO_WORT`, `HOEREN_WAHL`, `HOERFRAGE` | HOEREN | |
| `WORT_TIPPEN` | SCHREIBEN | |
| — | SPRECHEN | Hozir format yo'q; ekranda «hali mashq yo'q» |

**Ma'lum cheklov:** bitta format har doim bitta ko'nikmani tekshiradi degan faraz mukammal emas
(`LUECKE` bo'shlig'iga qarab lug'at ham, grammatika ham bo'lishi mumkin). Foizlar tendensiyani
ko'rsatadi, tashxis emas.

**Keyingi qadam (bu dizaynda qilinmaydi):** ADR-0011 bo'yicha ko'nikma formatda emas, mashqning
o'zida bo'lishi kerak (mashq «A1 Hören 2-topshiriqqa tayyorlayman» deb e'lon qiladi). Hozir
lug'at mashqlari bazada saqlanmaydi (har safar lug'atdan yasaladi), ya'ni belgilash uchun
«mashqning o'zi» yo'q, va bu 1 000+ mashqni qo'lda belgilash — kontent ishi. Shuning uchun ustunlik
tartibi kelajakka ochiq qoldiriladi: **mashqda ko'nikma belgilangan bo'lsa — u; bo'lmasa — format
reyestri.** Statistika kodi bu o'tishda o'zgarmaydi.

Eski DiB yo'llari (`drill/check`, `attempts`) `sessionId` va `format` yozmaydi — ular savolga
asoslangan ko'rsatkichlardan chiqariladi, mashq kunida esa sanaladi (seriya hozir ham shunday).

### 5.5 Birinchi urinish qanday aniqlanadi

- Klient `uebung/check` va `uebung/juft` ga `sessionId`, `questionIndex` (asl savolning
  `PublicFrage.index` i) va `attemptNo` yuboradi. O'rinbosar savol (`ersatz`) asl savolning
  `questionIndex` i va `attemptNo: 2` bilan yuboriladi. Maydonlar DTO da ixtiyoriy — Vercel va
  Railway deployi orasidagi oynada eski klient buzilmasin.
- **Oddiy savol:** `attemptNo = 1` qatori — uning `score` i.
- **Juftlash savoli:** `attemptNo = 1` qatorlarining birortasi xato bo'lsa — 0; xato yo'q va
  to'g'ri qatorlar soni juftlar soniga yetgan bo'lsa — 1; aks holda savol hal bo'lmagan
  (seans tashlab ketilgan) va hisobga kirmaydi. `juft()` har juft qatoriga shu juftning o'z
  materialini (`PAAR` — so'z, `ZUORDNEN` — ibora) `itemType`/`itemId` sifatida yozadi.
- **Seans yakuni:** dars seansida mavjud `abschluss`, takrorlash seansida yangi
  `POST /student-portal/lernen/wiederholung/abschluss` (hozir takrorlash hech narsa yubormaydi).
  Server `DafSession.finishedAt`, `questionCount`, `firstTryCorrect` ni urinishlardan hisoblaydi.
  `DafLessonProgress` avvalgidek yangilanadi (yo'l ekrani uchun).

---

## 6. C qism — statistika

### 6.1 Endpointlar va qorovullar

| Endpoint | Rollar | Qorovul |
| --- | --- | --- |
| `GET /groups/:id/app-activity?period=7\|30` | CEO, BD, Admin, Teacher | `assertCallerMayTouchGroup` — o'qituvchi biriktirilgan (yoki o'rinbosar) bo'lishi, qolganlar filial bo'yicha |
| `GET /groups/:id/app-activity/students/:studentId?period=` | o'sha | o'sha + o'quvchi shu guruhning **faol** a'zosi |
| `GET /students/:id/app-activity?period=` | CEO, BD, Admin | `students` modulidagi `:id` route'lari bilan bir xil filial tekshiruvi |

Uchala endpoint **bitta servis metodini** chaqiradi (`AppActivityService`) — guruh yon oynasi va
profil tabi bir o'quvchi haqida hech qachon ikki xil raqam ko'rsatmaydi. Yangi route'lar
`branch-route-policy` manifestida toifalanadi (aks holda build yiqiladi), rol metadatasi va
qorovul uchun controller testlari yoziladi.

### 6.2 Davr va maxraj

- Davr: **oxirgi 7 kun** yoki **oxirgi 30 kun** — bugun (Toshkent) va undan oldingi 6/29 kun.
  Kalendar oy emas: har kuni solishtirsa bo'ladi, oyning 2-kuni «2/2» chiqmaydi.
- **Maxraj o'sadi, ortiqcha jazolamaydi:**

```
hisobBoshi = max(davrBoshi, o'quvchi akkaunti yaratilgan kun, kuzatuv boshlangan kun)
maxraj     = bugun − hisobBoshi + 1
```

  «Kuzatuv boshlangan kun» — kompaniyadagi eng birinchi `StudentAppSession.day` (radio shu
  kundan o'lchanadi). Surat ham faqat `[hisobBoshi, bugun]` oralig'idagi kunlarni sanaydi —
  kuzatuvdan oldingi mashq kunlari na suratga, na maxrajga kiradi. 4 kun oldin qo'shilgan
  o'quvchi «3/30» emas, «3/4» ko'rinadi; tooltip: «10.09 dan beri».
- Ilova akkaunti yo'q o'quvchi «kirmagan» emas, **«Akkaunt yo'q»** deb ko'rsatiladi.

### 6.3 Ko'rsatkichlar

| Ko'rsatkich | Formula | Manba |
| --- | --- | --- |
| Faol vaqt | davr kunlaridagi `activeSeconds` yig'indisi | `StudentAppSession` |
| Platforma bo'yicha | o'sha, `platform` bo'yicha | o'sha |
| Bo'lim bo'yicha | `sections` yig'indisi | o'sha |
| Radio | `radioSeconds` yig'indisi | o'sha |
| Shug'ullangan kunlar | kamida bitta urinish **yoki** kunlik `radioSeconds` yig'indisi ≥ 300 bo'lgan kunlar / maxraj (3 va 6.2-bo'limlar) | `DafAttempt` + `StudentAppSession` |
| Oxirgi faollik | `max(lastSeenAt)` va o'sha seansning platformasi | o'sha |
| To'g'ri javob %, savollar soni, xatolar | 3 va 5.5-bo'limlar | `DafAttempt` |
| Ko'nikma bo'yicha % | o'sha, `format` → reyestr (5.4) bo'yicha guruhlab | `DafAttempt` |
| Seanslar tarixi | davrdagi `finishedAt` bor seanslar, eng yangisi birinchi | `DafSession` |
| Davrda tugatilgan darslar | davrda `finishedAt` bor `LESSON` seanslarining **turli** `lessonId` lari soni (3-bo'lim) | `DafSession` |
| Kurs progressi | darajadagi tugatilgan darslar / darajadagi kurs darslari | `DafLessonProgress` + `DafLesson` + `DafUnit` |
| So'zlar | holatlar soni (3-bo'lim), darajalar bo'yicha | `DafLexemeState` |
| Eng qiyin so'zlar | `strength ≤ 2`, `wrongCount` kamayishi, teng bo'lsa `lastSeenAt` | `DafLexemeState` |
| Ball, daraja, seriya, bugun takrorlanadigan so'zlar | **mavjud** `FortschrittService.uebersicht` | — |
| Guruh qiynalayotgan so'z va gaplar | 6.5-bo'lim | `DafAttempt` |

Guruh kartalari: ilovaga kirganlar soni (3-bo'lim, «Ilovaga kirgan»), kirganlar orasida o'rtacha
faol vaqt, guruh to'g'ri javob % (barcha a'zolar savollari birga), davrdagi tugatilgan darslar,
radio jami va tinglaganlar soni.

**Guruh a'zolari** — hozirgi faol yozilishlar (`Enrollment.status = ACTIVE`). O'quvchining
statistikasi guruhga qo'shilishdan oldingi mashqlarini ham o'z ichiga oladi: bu uning o'qish
tarixi. (Haftalik reyting muhrlangan `groupId` ga tayanadi — u boshqa savolga javob beradi.)

### 6.4 Daraja: A1 dan A2 ga o'tsa

- Darajalar tartibi: `A1 < A2 < B1` (`DafLevel`). Guruhning darajasi `Group.level`.
- **Joriy daraja:** o'quvchining oxirgi `LESSON` seansidagi darsning darajasi. O'sha darajaning
  hamma darsi tugatilgan bo'lsa: keyingi darajada kurs bor — keyingi daraja («boshlanmagan»);
  kurs yo'q — o'sha daraja «tugatilgan» belgisi bilan qoladi. Hech qanday `LESSON` seansi
  bo'lmasa — guruh darajasi, u ham bo'lmasa A1.
- **Jadvalda:** daraja belgisi + shu darajadagi progress, masalan «A1 · 37/192 dars». Maxraj
  bazadan hisoblanadi, kodda raqam yozilmaydi (demodagi «64» qo'lda yozilgan edi). Dev bazada
  yangi kurs faqat A1 da (12 bo'lim, 192 dars); A2 va B1 da faqat eski DiB bo'limlari bor, ular
  kursga kirmaydi — bu darajalar «kurs hali yo'q» deb ko'rsatiladi.
- **Guruh bilan solishtirish:** joriy daraja guruh darajasidan past bo'lsa, «Guruhdan orqada»
  belgisi. O'qituvchi uchun eng foydali signallardan biri.
- **Yon oynada** barcha darajalar: tugatilgan (sana bilan), davom etayotgan (bo'limlar bo'yicha),
  boshlanmagan.
- Vaqt, to'g'ri javob % va so'zlar darajaga bog'lanmaydi — butun o'qish tarixini qamraydi;
  yon oynada darajalar bo'yicha ajratib ko'rsatiladi.

### 6.5 Guruh qiynalayotgan so'z va gaplar

Davrdagi guruh a'zolarining `attemptNo = 1` urinishlari `(itemType, itemId)` bo'yicha
guruhlanadi; xato foizi `1 − o'rtacha(score)`. **Kamida 3 xil o'quvchi** ishlagan elementlar
qoladi — bitta o'quvchining xatosi guruh signali emas. Eng yuqori 6 tasi ko'rsatiladi: nemischa
matn, tarjima, ko'nikma, format nomi (`media-fragen-panel.tsx` dagi `FORMAT_NOMLARI` bilan bir
xil), xato foizi, «nechta o'quvchidan».

### 6.6 Unumdorlik

Guruh endpointi **o'quvchilar soniga bog'liq bo'lmagan, o'zgarmas sondagi so'rov** bilan
ishlaydi (guruhlangan so'rovlar, o'quvchi bo'yicha sikl yo'q). Sabab: lokal dev bazada har so'rov
~190 ms, va N+1 shaklidagi mavjud `/groups/:id/students` 21 o'quvchida ~44 soniya oladi. Test
so'rovlar sonini qayd etadi.

---

## 7. Ekranlar

Asos — CEO ko'rgan demo (`demo/ilova-faolligi`). Demodan farqlar:

| Demoda | Qarorda | Sabab |
| --- | --- | --- |
| «168 element» | **«168 savol»** | O'quvchi natija ekrani savol bo'yicha sanaydi; «element» o'qituvchiga tushunarsiz edi |
| «Faol kunlar» — faol vaqt bo'yicha | **«Shug'ullangan kunlar»** — mashq javobi yoki ≥ 5 daqiqa radio (3-bo'lim) | 60 soniyalik vaqt chegarasi kompyuterda «ochib qo'yib ketish»ni sanardi, faqat radio tinglagan kunni esa sanamasdi |
| «Ilovadan foydalandi» kartasi | **«Ilovaga kirdi»** (davrda ≥ 10 s seans) | Karta kirganlikni bildiradi, shug'ullanganlikni emas |
| «Seriya» jadval ustuni | **faqat yon oynada** | Muntazamlikni «Shug'ullangan kunlar» ko'rsatadi; seriya o'quvchi motivatsiyasi uchun |
| «25/30» qat'iy maxraj | **o'suvchi maxraj** (6.2) | Yangi o'quvchi nohaq «sust» ko'rinardi |
| «Kurs (A1) · 37/64 seans» | **daraja belgisi + darajadagi darslar**, «Guruhdan orqada» belgisi (6.4) | A1 dan keyingi darajalar |
| Ustunchalar tooltip'siz | har ustunchada tooltip: sana (hafta kuni), shug'ullangan kunmi, savollar soni, faol vaqt, radio | CEO so'rovi |
| «Guruh qiynalayotgan elementlar» | «Guruh qiynalayotgan so'z va gaplar» | Tushunarliroq nom |
| `amber-*` ranglar | `yellow-*` | `globals.css` `@theme` `amber-50/100/500/600/700` ni faqat `.lumio` ichidagi o'zgaruvchilarga bog'lagan — admin panelda rangsiz chiqadi (alohida xato, 11-bo'lim) |

**Guruh sahifasi → «Ilova faolligi» tabi** (`?tab=ilova`, davr `?period=30` — URL'da saqlanadi,
standart qiymatlar URL'dan olib tashlanadi):

1. Sarlavha, davr tanlagich (7 kun / 30 kun).
2. 5 karta: Ilovaga kirdi · O'rtacha faol vaqt · To'g'ri javob · Tugatilgan darslar · Radio —
   har birida ta'rifni aytuvchi tooltip.
3. Jadval: `#` · O'quvchi (oxirgi faollik · platforma) · Faol vaqt · Shug'ullangan kunlar (son +
   kunlik ustunchalar) · To'g'ri javob (% · N savol) · Kurs (daraja · progress · «Guruhdan orqada») ·
   Radio (keng ekranda). Standart tartib — faol vaqt kamayishi; kirmaganlar va akkauntsizlar pastda.
   Kunlik ustunchada: balandlik — faol vaqt; **to'q rang — shug'ullangan kun**, och rang — faqat
   kirgan kun, bo'sh — kirmagan. Ustun sarlavhasi tooltip'i: «Shu kuni kamida bitta mashq qildi
   yoki kamida 5 daqiqa radio tingladi».
   **Sahifalanmaydi** — mavjud «O'quvchilar» tabi kabi (guruh odatda ≤ 25 o'quvchi, o'qituvchi
   butun guruhni bir qarashda solishtirishi kerak). Bu CLAUDE.md dagi sahifalash qoidasiga
   **ongli istisno**.
4. «Guruh qiynalayotgan so'z va gaplar» bloki.
5. «Raqamlar qanday hisoblanadi» — yig'iladigan izoh.
6. Yuklanishda skeleton; xatoda «Ma'lumotni yuklab bo'lmadi» + qayta urinish (bo'sh ro'yxat bilan
   aralashtirilmaydi — demoda xato jim yutilib, «Guruhda o'quvchi yo'q» chiqardi).

**O'quvchi yon oynasi** (qatorni bosganda): sarlavha (daraja, ball, seriya) · davr · ilovada vaqt
(faol / radio, platforma va bo'lim bo'yicha) · 30 kunlik xarita (rang — faol vaqt, shug'ullangan
kunlar belgilangan, tooltip bilan) · mashqlar
(to'g'ri %, savollar, xatolar, ko'nikma bo'yicha) · kurs progressi (darajalar bo'yicha) · so'zlar ·
eng qiyin so'zlar · seanslar tarixi (oxirgi 10 ta). Kirmagan o'quvchi uchun alohida holat.

**O'quvchi profili → «Ilova» tabi** (CEO, BD, Admin): yon oynadagi panelning o'zi, sahifa ichida.
Komponent bitta.

---

## 8. D qism — native (alohida spec)

- Xuddi shu endpoint va ta'riflar. Faollik: `AppState === 'active'` + ildiz `View` dagi teginish
  + ta'lim audiosi. Yangi native kutubxona kerak emas (`AppState` React Native ichida).
- Native ilovada hozir ta'lim ham, radio ham yo'q — ular native'ga kelganda o'lchash ham keladi.
- **Birinchi do'kon relizidan oldin** tayyor bo'lishi shart: ilovada OTA (`expo-updates`) ham,
  majburiy versiya tekshiruvi ham yo'q — relizdan keyin qo'shilgan o'lchash v1 dagi o'quvchilarda
  hech qachon ishlamaydi. Shu relizga majburiy yangilash kodi (standartda o'chiq) ham kiradi.
- CEO qarori (13.09.2026): avval veb to'liq ishlatiladi, keyin Android va iOS.

---

## 9. Bosqichlar

| # | PR | Ichida | Bog'liqlik |
| --- | --- | --- | --- |
| 1 | **Mashq yozuvini boyitish** | 5-bo'lim: migratsiya (`DafAttempt` maydonlari, `DafSession`, enumlar), format→ko'nikma reyestri, `pruefen`/`juft`/`abschluss`, takrorlash yakuni endpointi, portal klienti `sessionId`/`questionIndex`/`attemptNo` yuboradi. **ADR:** mashq natijasi umumiy shartnomaga va Goethe ko'nikmasi o'qiga yoziladi | — |
| 2 | **Vaqt hisobi (backend + veb)** | 4-bo'lim: `StudentAppSession`, `POST /student-portal/activity`, `ActivityHost`, media reyestri, radio o'lchovi. **ADR:** ilova faolligi klientda o'lchanadi, server jami qiymatni qirqadi | — (1 bilan parallel) |
| 3 | **Statistika va ekranlar** | 6–7-bo'limlar: `AppActivityService`, 3 endpoint, qorovullar, route manifesti, guruh tabi, yon oyna, profil tabi | 1 va 2 |
| 4 | **Native** | 8-bo'lim, alohida spec | 2, do'kon relizidan oldin |

1 va 2 imkon qadar tez deploy qilinadi — ma'lumot yig'ilishi deploy kunidan boshlanadi. Migratsiya
backenddan **oldin** qo'llanadi (`prisma migrate deploy`), backend Railway'ga qo'lda chiqariladi.
Demo shoxi (`demo/ilova-faolligi`) 3-PR tugagach o'chiriladi.

---

## 10. Sinash

**Server (jest):**
- Faollik: `max` qoidasi, soat bilan qirqish, `sections` yig'indisini qirqish, boshqa o'quvchining
  `sessionId` si (`403`), kun almashganda `409`, takroriy so'rov vaqtni oshirmasligi.
- Mashq: oddiy savolda birinchi urinish, o'rinbosar savol (`attemptNo = 2`) foizni o'zgartirmasligi,
  juftlash savoli (xato bosish bor / yo'q / hal bo'lmagan), `PENDING` va `UNGRADED` foizga kirmasligi,
  seans yakunida server hisobi, eski `sessionId` siz urinishlar chetda qolishi.
- Reyestr: har `FrageFormat` ko'nikmaga ega; bazadagi har bir `distinct format` (nafaqadagilar
  ham) reyestrda; xarita o'zgarganda eski urinishlar yangi ko'nikmada chiqadi.
- Maxraj: yangi akkaunt, kuzatuv boshlanishi, davr chegarasi (Toshkent yarim tuni).
- Shug'ullangan kun: faqat kirish (mashqsiz, radiosiz) sanalmaydi; bitta urinish sanaladi (eski
  DiB yo'lidagisi ham); radio bir kunda 299 s — yo'q, 300 s — ha (ikki seans yig'indisi ham);
  kuzatuvdan oldingi mashq kuni suratga kirmaydi; «Ilovaga kirdi» 9 s — yo'q, 10 s — ha.
- Daraja: A1 tugatilgan → A2 «boshlanmagan», guruhdan orqada, kurs yo'q daraja.
- Qorovul: biriktirilgan o'qituvchi ✓, boshqa guruh o'qituvchisi `403`, boshqa filial admini `403`,
  guruhda yo'q o'quvchi `404`; rol metadatasi testlari; route manifesti.
- Guruh endpointi so'rovlar soni o'quvchilar soniga bog'liq emasligi.

**Klient (vitest):** tracker holatlari (ko'rinish, fokus, 2 daqiqa faolsizlik, media ijrosi,
5 s qirqish, bo'lim xaritasi, yarim tunda seans almashishi), radio `currentTime` farqi
(stansiya almashishi, manfiy farq), `localStorage` dan yuborilmagan seansni tiklash, formatlash.

**Qo'lda:** lokal muhitda kichik guruhda (masalan, Toshkent `#001`, 10 o'quvchi) — katta guruh
lokal dev bazada juda sekin yuklanadi.

---

## 11. Bu dizaynda QILINMAYDI

- Native o'lchash (alohida spec) va majburiy yangilash oynasi.
- Qaysi ekranda qancha vaqt o'tgani (ekran bo'yicha analitika) — faqat `LERNEN` / `OTHER`.
- Kirmagan o'quvchilarga avtomatik eslatma, o'qituvchiga bildirishnoma.
- Excel eksport, filial yoki markaz bo'yicha umumiy hisobot, jadval ustunlari bo'yicha saralash.
- «Oy» (kalendar oy) davri — 13-bo'limdagi ochiq savol.
- Sprechen baholash mexanizmi; A2/B1 kursining o'zi.
- `globals.css` dagi `amber` xatosini tuzatish — alohida kichik PR.

---

## 12. Xavflar

| Xavf | Chora |
| --- | --- |
| O'quvchi o'z faol vaqtini soxta oshiradi | Soat bilan qirqish: ilova ochiq bo'lgan vaqtdan oshmaydi |
| O'quvchi `attemptNo: 1` deb yolg'on yuboradi | Faqat o'z to'g'ri javob foiziga ta'sir qiladi, ballga emas; mavjud `pruefen` izohidagi ochiq kelishuv bilan bir xil |
| Ikki tab yoki veb + telefon bir vaqtda | Vebda faqat fokusdagi oyna sanaladi; veb va telefon bir vaqtda — kam uchraydi, seans soat bilan qirqiladi |
| Statistika faqat deploy kunidan boshlanadi | O'suvchi maxraj; ekranda «kuzatuv DD.MM dan beri» |
| N+1 so'rovlar prodda sezilmay, dev da 40 s | O'zgarmas so'rovlar soni talabi va test (6.6) |
| Deploy oynasida eski klient yangi maydonlarni yubormaydi | DTO maydonlari ixtiyoriy; bunday urinishlar savol ko'rsatkichlaridan chetda |
| Yangi format ko'nikmasiz qo'shiladi | `Record<FrageFormat, DafSkill>` — kompilyatsiya xatosi + test |
| Format o'chirilsa, eski urinishlar «noma'lum» ko'nikmaga tushadi | Nafaqadagi formatlar reyestri + bazadagi `distinct format` testi |
| Tahrir paytida HMR ochiq sahifani chala kod bilan buzadi (demoda bo'lgan) | Tahrirlar har oraliq holati ishlaydigan tartibda kiritiladi |

---

## 13. Ochiq savollar — hammasi hal qilingan

1. ~~Ko'nikma xaritasi~~ **Hal qilindi (13.09.2026):** «amalda nima qilyapti» qoidasi va 5.4-jadval;
   ko'nikma o'qish paytida hisoblanadi, shuning uchun xarita keyin ham bepul o'zgaradi.
2. ~~«Oy» davri~~ **Hal qilindi (13.09.2026):** hozircha 7/30 kun yetadi; kalendar oy kerak bo'lsa alohida qo'shiladi.
3. ~~So'z holati chegarasi~~ **Hal qilindi (13.09.2026):** «mustahkam» — `strength ≥ 3` (3-bo'lim).
4. ~~Faol kun chegarasi: 60 soniya yetarlimi?~~ **Hal qilindi (13.09.2026):** vaqt chegarasi
   o'rniga «shug'ullangan kun» — mashq javobi yoki ≥ 5 daqiqa radio (3-bo'lim).
