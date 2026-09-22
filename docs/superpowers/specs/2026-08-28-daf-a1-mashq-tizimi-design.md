# DaF o'quv tizimi — Faza 3 dizayni: A1 to'liq mahsulot

**Sana:** 2026-08-28
**Bog'liq:** [ADR-0011](../../adr/0011-oquv-ozagi-standartga-boglanadi.md),
[Faza 1 dizayni](2026-08-25-daf-learning-system-design.md),
[Faza 1b dizayni](2026-08-26-daf-faza-1b-design.md),
[Faza 2 dizayni](2026-08-27-daf-faza-2-design.md)

Faza 2 kontentni bazaga tushirdi va ekranga chiqardi. U ishlaydi, lekin
o'quvchi uni **zerikarli** deb topdi — va o'lchov buni tasdiqlaydi.

Faza 3 A1 darajasini **to'liq mahsulotga** aylantiradi: qayta bo'lingan
struktura, 12 xil mashq turi, unutilgan so'zning qaytishi, seriya, va
o'quvchining haqiqiy guruhi bilan bellashuv.

---

## 1. Nima ishlamayapti

### 1.1 Mashqlarning 91 % i ikkita matn turi

| Tur | Soni | Ulush |
| --- | ---: | ---: |
| GAP (bo'sh joyni to'ldir) | 824 | 70 % |
| MC (test) | 255 | 22 % |
| REORDER | 66 | 6 % |
| FREE_WRITE | 30 | 2 % |
| CLOZE | 5 | 0,4 % |

Eshitish mashqi **mashqlar jadvalida umuman yo'q**. Faza 2 da qurilgan
lug'at drill'i (`vocab-drill.ts`) yagona audio nuqta va u darsdan ajralib
turadi.

### 1.2 Bo'limlar teng emas

Bo'limlar manbaning 10 bobidan 1:1 ko'chirilgan, shuning uchun hajmi
o'nlab marta farq qiladi:

```
A1_1   1 bo'lim   ← 26 dars, 226 so'z   (bitta bo'limda!)
A1_2   3 bo'lim
A2_1   1 bo'lim
A2_2   4 bo'lim
B1     1 bo'lim
```

O'quvchi shikoyat qilgan «chalkash uzun ro'yxat» aynan shu 26 darsli
bo'lim.

### 1.3 R2 dagi 947 MB ning katta qismi ekranga chiqmaydi

| Aktiv | Soni | Faza 2 da ishlatiladimi |
| --- | ---: | --- |
| Audio | 751 | qisman (lug'at drill'i) |
| Video | 263 | **yo'q** |
| Transkript (satrma-satr dialog) | 198 | **yo'q** |
| Rasm | 71 | **yo'q** |
| PDF | 10 | **yo'q** |

### 1.4 Qaytish uchun sabab yo'q

Ko'rilgan so'z boshqa hech qachon qaytmaydi. Xato hech narsaga olib
kelmaydi. Seriya, kunlik maqsad, ilgarilash sanagichi — hech biri yo'q.
Ya'ni tizim o'rgatishi mumkin, lekin **ushlab qola olmaydi**.

---

## 2. Qabul qilingan qarorlar

| # | Qaror | Sabab |
| --- | --- | --- |
| **D1** | `DafLevel` uchtaga tushadi: `A1`, `A2`, `B1` | `A1_1`/`A1_2` bo'linishi manbaning yorlig'i edi, o'quvchining emas. Goethe imtihonlari ham A1/A2/B1 |
| **D2** | Faza 3 = **faqat A1**, lekin oxirigacha | Uchala darajani parallel qilsak, uchalasi yarim qoladi. A1 da o'quvchilarning ko'pchiligi |
| **D3** | Bo'lim ≈ 40 so'z, 5 ta dars. A1 ≈ **20 bo'lim** | Manbadagi 47 mavzuning hajmi 4 dan 60 so'zgacha — tenglashtirish shart |
| **D4** | Dars = **12 savol**, 3–5 daqiqa | Bir o'tirishda tugatish hissi; kuniga bir necha marta kirish mumkin |
| **D5** | `DafLesson.kind` o'rniga `tier` (1–5) | Endi dars *turi* emas, *darajasi* muhim: har bosqichda ham lug'at, ham grammatika, ham eshitish bor |
| **D6** | Savollar bazada saqlanmaydi, har so'rovda quriladi | 20×5×12 = 1 200 qator bo'lardi va lug'at o'zgarganda eskirardi |
| **D7** | Javob **bazadan o'qib** tekshiriladi, savolni qayta hosil qilmasdan | Qaytariladigan so'zlar har o'quvchida boshqacha, ya'ni urug' beqaror |
| **D8** | Gaplar **yasaladi**, manbadan olinmaydi | A1 dagi 252 qisqa gapning atigi 68 tasi (27 %) tanish so'zlardan tuzilgan |
| **D9** | Gap ovozi — **TTS**; haqiqiy video 5-bosqich sinovi uchun | A1 uchun toza va sekin talaffuz intervyu tezligidan afzal |
| **D10** | Rasm — **12 turdan faqat 2 tasida**, faqat aniq so'zlarga | Rasm bitta vazifani bajaradi: so'zni o'zbekcha orqali o'tmasdan ma'noga bog'lash |
| **D11** | Seriya va reyting **jadvalsiz**, `DafAttempt` dan hisoblanadi | Alohida sanagich haqiqatdan uzilib qolishi mumkin |
| **D12** | Qaytarish — Leitner qutisi, `DafLexemeState` jadvali | «Qaysi so'z qaytishi kerak» savoliga butun urinishlar tarixidan javob berish qimmat |
| **D13** | Xato javob **dars oxiriga qaytadi** (bir marta) | Dars o'quvchi bilmaguncha tugamaydi. Eng arzon va eng kuchli tuzatish |
| **D14** | Reyting — o'quvchining **haqiqiy guruhi** ichida | Ertaga darsda ko'radigan odam bilan bellashish begonadan kuchliroq |
| **D15** | **Yurak/jon yo'q** | Jazolash boshlovchini qo'rqitadi; xato qaytishi allaqachon yetarli turtki |

---

## 3. Struktura

```
Daraja  A1
  └── Bo'lim × 20        «Tanishuv», «Oila», «Xarid»…      ~40 so'z
        └── Dars × 5      qiyinlik bosqichi (tier 1–5)     ~8 yangi so'z
              └── Savol × 12   (10 yangi + 2 qaytarish)
```

### 3.1 Bo'lim chegaralari qo'lda yoziladi

Avtomatik bo'lish mavzuni o'rtasidan kesib yuboradi, avtomatik sarlavha esa
o'qib bo'lmaydigan narsa beradi. Shuning uchun A1 ning 20 bo'limi
**`server/content/daf/a1-units.json`** faylida qo'lda yoziladi:

```jsonc
{
  "level": "A1",
  "units": [
    {
      "order": 1,
      "titleUz": "Tanishuv",
      "titleDe": "Sich vorstellen",
      "sections": ["voc_01_01_begr", "voc_01_02_werbistdu"],
      "grammar": ["gr_01_pronouns", "gr_01_sein"]
    }
  ]
}
```

Fayl git'da yashaydi, seed uni o'qiydi. Qoidalar:

- har bo'lim **30–50 so'z** oralig'ida (maqsad 40);
- manbadagi mavzu tartibi saqlanadi — bir bo'lim faqat qo'shni
  bo'limlarni birlashtiradi, sakramaydi;
- 47 mavzuning **hammasi** aynan bitta bo'limga tegishli bo'lishi shart.
  Seed buni tekshiradi va tegmagan mavzu qolsa **yiqiladi**.

### 3.2 Grammatika dars emas, bo'limning qoidasi

Hozirgi 58 ta `GRAMMAR` darsi yo'qoladi. Grammatika sahifasi bo'limga
biriktiriladi va 3-bosqich oldidan **«qoida kartasi»** sifatida
ko'rsatiladi. Grammatikaning mashqlari `GAP_FILL` turiga oziq bo'ladi.

Sabab: grammatikani alohida dars qilish uni mashqdan uzib qo'yadi —
o'quvchi qoidani o'qiydi, keyin uni ishlatmaydi.

### 3.3 Yetib bo'lmaydigan 459 mashq ochiladi

Faza 2 da 1 180 mashqning **459 tasiga (39 %)** bo'lim yo'lidan yetib
bo'lmasdi: ularning grammatika sahifasiga hech bir bob ishora
qilmasdi. Endi grammatika bo'limga `a1-units.json` orqali **qo'lda**
biriktiriladi, ya'ni yetim sahifani ham kerakli bo'limga ulash mumkin.
A1 ga tegishlilari shu yo'l bilan ochiladi.

### 3.4 Javobsiz mashq `GAP_FILL` ga kirmaydi

`answerStatus = OPEN` bo'lgan **175 mashqning to'g'ri javobi manbaning
o'zida yo'q** (so'z tartiblash, gap birlashtirish — javob bitta emas).
Ularni avtomatik tekshirib bo'lmaydi, shuning uchun `GAP_FILL`
tanlovidan chetlatiladi. `PARTIAL` (10 ta) ham chetlatiladi: yarim
javob bilan tekshirish o'quvchini noto'g'ri jazolaydi.

Ya'ni `GAP_FILL` faqat `answerStatus = FROM_SOURCE` bo'lgan 995 mashqdan
oziqlanadi.

---

## 4. Ma'lumot modeli

### 4.1 O'zgarishlar

```prisma
enum DafLevel { A1  A2  B1 }        // A1_1, A1_2, A2_1, A2_2 olib tashlanadi

model DafLesson {
  tier  Int    // 1–5, bo'lim ichidagi qiyinlik bosqichi
  // kind DafLessonKind  — OLIB TASHLANADI
  @@unique([unitId, tier])
}
```

`DafLessonKind` enum'i butunlay o'chadi.

### 4.2 Yangi jadvallar

```prisma
/// Mashq uchun gap. Manbadan olinmaydi — bo'limning O'Z so'zlaridan
/// yasaladi, shuning uchun ichida notanish so'z bo'lmaydi.
model DafSentence {
  id        Int      @id @default(autoincrement())
  unitId    Int
  order     Int
  de        String
  uz        String
  /// R2 kaliti — TTS bilan yasalgan ovoz.
  audioKey  String?
  wordCount Int
  /// GENERATED — yasalgan; SOURCE — manbadagi toza 68 tadan biri.
  origin    DafSentenceOrigin
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  unit DafUnit @relation(fields: [unitId], references: [id])
  @@unique([unitId, order])
  @@index([unitId])
}

enum DafSentenceOrigin { GENERATED  SOURCE }

/// Bitta o'quvchining bitta so'z ustidagi holati — Leitner qutisi.
/// Butun urinishlar tarixidan hisoblash qimmat, shuning uchun saqlanadi.
model DafLexemeState {
  id           Int      @id @default(autoincrement())
  studentId    Int
  lexemeId     Int
  /// 0–5. 0 = yangi yoki xato qilingan, 5 = mustahkam.
  strength     Int      @default(0)
  dueAt        DateTime
  lastSeenAt   DateTime
  correctCount Int      @default(0)
  wrongCount   Int      @default(0)
  companyId    Int

  student Student   @relation(fields: [studentId], references: [id])
  lexeme  DafLexeme @relation(fields: [lexemeId], references: [id])
  @@unique([studentId, lexemeId])
  @@index([studentId, dueAt])
  @@index([companyId])
}

/// Yo'l ekrani uchun: qaysi dars tugallangan.
model DafLessonProgress {
  id          Int       @id @default(autoincrement())
  studentId   Int
  lessonId    Int
  completedAt DateTime?
  /// Eng yaxshi natija: 12 dan nechtasi birinchi urinishda to'g'ri.
  bestScore   Int       @default(0)
  runs        Int       @default(0)
  companyId   Int

  student Student   @relation(fields: [studentId], references: [id])
  lesson  DafLesson @relation(fields: [lessonId], references: [id])
  @@unique([studentId, lessonId])
  @@index([studentId])
  @@index([companyId])
}
```

`DafLexeme` ga qo'shiladi:

```prisma
  /// Rasm chizib bo'ladimi. `false` — abstrakt so'z (weil, Verantwortung).
  /// Rasmli savol turlari faqat `true` bo'lganlarga beriladi.
  picturable Boolean @default(false)
```

`imageKey` allaqachon mavjud — o'zgartirilmaydi.

Teskari bog'lanishlar ham qo'shiladi, aks holda Prisma sxemasi
tuzilmaydi: `DafLexeme.states DafLexemeState[]`,
`DafLesson.progress DafLessonProgress[]`,
`DafUnit.sentences DafSentence[]`, hamda `Student` modeliga
`dafLexemeStates` va `dafLessonProgress`.

### 4.3 Seriya va reyting uchun jadval YO'Q

`DafAttempt` allaqachon `studentId`, `groupId`, `isCorrect` va `createdAt`
ni yozadi. Demak:

- **seriya** = urinish bo'lgan Toshkent kunlarining ketma-ketligi;
- **kunlik maqsad** = bugungi `isCorrect = true` urinishlar soni;
- **guruh reytingi** = `groupId` bo'yicha haftalik to'g'ri javoblar yig'indisi;
- **bilingan so'z** = `DafLexemeState` da `strength >= 3` bo'lganlar soni.

Alohida sanagich saqlansa u haqiqatdan uzilib qolishi mumkin va kodbazadagi
«bitta manba» qoidasiga zid bo'lardi.

### 4.4 Migratsiya

Prod'da atigi **1 ta `DafAttempt`** bor (sinov qatori) va
`DafLessonProgress` hali mavjud emas — ya'ni saqlanadigan o'quvchi
ilgarilashi yo'q. Shunga qaramay enum PostgreSQL da o'rniga qo'yiladi,
o'chirib qayta yaratilmaydi:

```sql
CREATE TYPE "DafLevel_new" AS ENUM ('A1', 'A2', 'B1');
ALTER TABLE "DafUnit" ALTER COLUMN "level" TYPE "DafLevel_new"
  USING (CASE
    WHEN "level"::text IN ('A1_1','A1_2') THEN 'A1'
    WHEN "level"::text IN ('A2_1','A2_2') THEN 'A2'
    ELSE 'B1' END)::"DafLevel_new";
DROP TYPE "DafLevel";
ALTER TYPE "DafLevel_new" RENAME TO "DafLevel";
```

`@@unique([level, order])` migratsiyadan keyin buziladi (ikki bo'lim bir xil
`A1 #1` bo'lib qoladi), shuning uchun tartib bir migratsiya ichida:
avval enum ko'chiriladi, keyin `order` seed tomonidan qayta yoziladi.
Migratsiya `order` ni vaqtincha `id` ga tenglashtiradi.

---

## 5. Mashq turlari

12 tur. Har birining nima ko'rsatishi, nimani kutishi va nimadan qurilishi
aniq belgilangan.

| # | Kod | Ko'rsatiladi | Kutiladi | Manba |
| --- | --- | --- | --- | --- |
| 1 | `PICTURE_WORD` | so'z / ibora | 3 rasmdan biri | `imageKey`, `picturable = true` |
| 2 | `AUDIO_WORD` | so'z audiosi | 4 so'zdan biri | `audioStartMs/EndMs` |
| 3 | `WORD_UZ` | nemischa so'z | 4 o'zbekchadan biri | `de`, `uz` |
| 4 | `UZ_WORD` | o'zbekcha ma'no | 4 nemischadan biri | `de`, `uz` |
| 5 | `MATCH` | 4 juft aralash | hammasini juftlash | `de`, `uz` |
| 6 | `TYPE_WORD` | so'z audiosi | so'zni yozish | `audioStartMs/EndMs` |
| 7 | `BUILD_SENTENCE` | o'zbekcha gap | so'z bankidan nemischa gap | `DafSentence` |
| 8 | `TRANSLATE_SENTENCE` | nemischa gap | o'zbekcha yozish | `DafSentence` |
| 9 | `TYPE_SENTENCE` | gap audiosi | gapni yozish | `DafSentence.audioKey` |
| 10 | `PICTURE_LISTEN` | gap audiosi | 3 rasmdan biri | `DafSentence.audioKey` + `imageKey` |
| 11 | `GAP_FILL` | bo'sh joyli gap | to'ldirish / variant | `DafExercise` (1 180 ta) |
| 12 | `VIDEO_HEARD` | video | 4 gapdan qaysi biri aytildi | `DafUnit` videosi + transkript |

### 5.1 Chalg'ituvchi variantlar

Chalg'ituvchilar **shu bo'limning o'z materialidan** olinadi. Butun
lug'atdan olinsa savol bilimni emas, taxminni tekshiradi: «Guten Morgen»
yonida «der Kühlschrank» tursa to'g'ri javob mavzusiga qarab ko'rinib
qoladi. Bu qoida Faza 2 dan meros va o'zgarmaydi.

`VIDEO_HEARD` da esa chalg'ituvchilar **boshqa** videolarning
transkriptidan olinadi — aks holda javob shu videoning o'zidan ko'rinib
qolardi.

### 5.2 `VIDEO_HEARD` ga muallif kerak emas

Video o'ynaydi, keyin «qaysi gapni eshitdingiz?» — 4 variant, biri shu
video transkriptidan, uchtasi boshqasidan. Savol **avtomatik** quriladi.
Bu 263 videoni hech qanday qo'lda yozuvsiz ishga tushiradi.

---

## 6. Dars qurish

`DafLessonBuilder.build(lessonId, studentId)` → 12 savol.

### 6.1 Bosqich bo'yicha nisbat

Har darsda **10 yangi + 2 qaytarish**. Yangi 10 tasi bosqichga qarab:

| Bosqich | Nomi | Turlar |
| --- | --- | --- |
| 1 | Tanish | `PICTURE_WORD` 3 · `AUDIO_WORD` 3 · `WORD_UZ` 3 · `MATCH` 1 |
| 2 | Ma'no | `WORD_UZ` 3 · `UZ_WORD` 3 · `TYPE_WORD` 2 · `AUDIO_WORD` 1 · `MATCH` 1 |
| 3 | Gap | `BUILD_SENTENCE` 4 · `TRANSLATE_SENTENCE` 3 · `GAP_FILL` 2 · `UZ_WORD` 1 |
| 4 | Yozish | `TYPE_SENTENCE` 4 · `TYPE_WORD` 3 · `BUILD_SENTENCE` 2 · `PICTURE_LISTEN` 1 |
| 5 | Sinov | `TYPE_SENTENCE` 3 · `TRANSLATE_SENTENCE` 3 · `GAP_FILL` 2 · `VIDEO_HEARD` 2 |

Har darsda kamida 4 xil tur bor — bitta o'tirishda bir xil savol
takrorlanmaydi. Faza 2 dagi «1-dars faqat eshitish, 2-dars faqat ma'no»
yondashuvi ataylab rad etildi: u zerikishni boshqa niqobda qaytarardi.

### 6.2 Material yetmasa

Tur uchun material yo'q bo'lsa (masalan bo'limda rasm chizib bo'ladigan
so'z kam, yoki gap yasalmagan), quruvchi **o'sha bosqichning keyingi
turiga** o'tadi va bo'shliqni to'ldiradi. Savol soni har doim 12 bo'lib
qoladi. Bo'sh o'rin qoldirish yoki savolni takrorlash taqiqlanadi.

Tartib: `BUILD_SENTENCE` → `UZ_WORD`, `TYPE_SENTENCE` → `TYPE_WORD`,
`PICTURE_WORD` → `AUDIO_WORD`, `PICTURE_LISTEN` → `AUDIO_WORD`,
`VIDEO_HEARD` → `TRANSLATE_SENTENCE`, `GAP_FILL` → `WORD_UZ`.

### 6.3 Qaytarish savollari

`DafLexemeState` dan `dueAt <= now` bo'lgan, shu o'quvchining eng eski
2 ta so'zi olinadi. Turi bosqichga mos tanlanadi (1–2 bosqichda
`WORD_UZ`, 3–5 da `UZ_WORD`).

Muddati kelgan so'z yo'q bo'lsa (birinchi bo'lim, birinchi dars) —
qaytarish soni 0 ga tushadi va o'rniga yangi savol qo'yiladi.

### 6.4 Xato javob qaytadi

Noto'g'ri javob berilgan savol **navbat oxiriga** qo'yiladi. Bir savol
ko'pi bilan **bir marta** qaytariladi: ikkinchi xatodan keyin to'g'ri javob
ko'rsatiladi va dars davom etadi. Cheksiz aylanish o'quvchini qamab
qo'yardi.

---

## 7. Qaytarish jadvali (Leitner)

```
kuch 0 → shu sessiya oxirida
kuch 1 → +1 kun
kuch 2 → +3 kun
kuch 3 → +7 kun
kuch 4 → +16 kun
kuch 5 → +35 kun
```

- **To'g'ri javob:** `strength = min(5, strength + 1)`,
  `dueAt = now + interval(yangi strength)`.
- **Xato javob:** `strength = 0`, `dueAt` = ertangi Toshkent kunining
  boshi. Yumshoq tushirish (`strength - 1`) sinovda so'zni juda tez
  qaytardi — noldan boshlash ochiqroq va tushunarliroq.

Holat **har javobdan keyin** yangilanadi, dars oxirida emas: dars
tashlab ketilsa ham o'rganilgani yo'qolmaydi.

---

## 8. Javob tekshirish

`POST /student-portal/lernen/answer` bitta savolga javob oladi:

```ts
{ lessonId, kind, lexemeId?, sentenceId?, exerciseId?, given }
```

Server **savolni qayta hosil qilmaydi** — javobni to'g'ridan-to'g'ri
bazadan o'qib solishtiradi. Faza 2 dagi urug'langan qayta-hosil-qilish
usuli qaytarish qo'shilgach buziladi, chunki qaytadigan so'zlar har
o'quvchida boshqacha.

Qoidalar:

- to'g'ri javob **hech qachon** mijozga yuborilmaydi (javob berilgunga
  qadar);
- `lexemeId`/`sentenceId` shu darsning materialiga yoki o'quvchining
  qaytarish to'plamiga tegishli ekani tekshiriladi — begona id rad etiladi;
- matn javoblari solishtirilishi: bosh/kichik harf farqsiz, oxirgi
  tinish belgisi ixtiyoriy, ortiqcha bo'sh joylar qisqartiriladi.
  Umlaut **majburiy** (`Tschuss` ≠ `Tschüss`) — bu nemis tilining
  imlosi, kechirilsa o'rganilmaydi;
- har javob `DafAttempt` ga yoziladi va `DafLexemeState` yangilanadi.

---

## 9. Ushlab qolish

### 9.1 Seriya

Ketma-ket kunlar soni — o'quvchida kamida bitta `DafAttempt` bo'lgan
Toshkent kunlari. Bugun mashq qilinmagan bo'lsa seriya **hali
buzilmagan**: u kechagi kungacha sanaladi va kun tugaguncha
saqlanib turadi.

### 9.2 Kunlik maqsad

Bir kunda **20 ta to'g'ri javob**. Sozlanmaydi — tanlov ekrani qo'shish
boshlovchini birinchi kunidayoq qaror qabul qilishga majbur qilardi.

### 9.3 Eslatma

Kuniga bir marta, Toshkent vaqti bilan **19:00**, bugun mashq qilmagan va
seriyasi ≥ 1 bo'lgan o'quvchiga. Mavjud 4-kanalli bildirishnoma
tizimidan foydalaniladi (`NotificationType.SYSTEM`), yangi infratuzilma
qurilmaydi. Seriyasi 0 bo'lganga yuborilmaydi — u hali odat qurmagan va
eslatma spam bo'lib tuyuladi.

### 9.4 Ilgarilash

Yo'l ekranining tepasida: seriya, kunlik maqsad ko'rsatkichi, va
**bilingan so'z** soni (`strength >= 3`). Bo'lim tuguni tugagan darslar
soniga qarab to'ladi.

---

## 10. Ijtimoiy qism

### 10.1 Guruh reytingi

`GET /student-portal/lernen/reyting`.

Joriy hafta (dushanba–yakshanba, Toshkent) ichida o'quvchining **o'z
guruhi** bo'yicha to'g'ri javoblar yig'indisi. `DafAttempt.groupId`
allaqachon yoziladi.

- O'quvchi faqat **o'zi a'zo bo'lgan** guruhlarni ko'radi.
- Ism va o'rin ko'rsatiladi, boshqa hech narsa emas — balans, telefon,
  davomat kabi ma'lumotlar bu ekranga chiqmaydi.
- Guruhda 2 tadan kam faol o'quvchi bo'lsa reyting ko'rsatilmaydi
  (bir kishilik reyting turtki bermaydi).

### 10.2 Ustoz paneli

`GET /lehrer/lernen/guruh/:groupId` — ustoz o'zi o'qitadigan guruhlar
uchun: har o'quvchining shu haftadagi to'g'ri javoblari, seriyasi,
oxirgi mashq sanasi, tugallangan bo'limlar soni.

Qamrov qat'iy: ustoz **faqat o'zi o'qitadigan** guruhlarni ko'radi
(`Group.teachers` orqali). CEO/BD/Administrator uchun filial qamrovi
`resolveCallerBranchScope` bo'yicha. Bu — faqat o'qish, hech qanday
yozuv yo'q.

---

## 11. Kontent quvuri

Barcha natijalar **git'da matn** (JSON) + **R2 da baytlar** — Faza 1 dagi
bo'linish o'zgarmaydi.

### 11.1 `npm run daf:a1-units` — bo'limlarni qayta qurish

`content/daf/a1-units.json` ni o'qiydi, 20 bo'lim va 100 darsni yaratadi.
Tekshiruvlar: har mavzu aynan bir marta ishlatilgan; har bo'lim 30–50
so'z; har bo'limda 5 bosqich. Biror shart buzilsa **yiqiladi**.

### 11.2 `npm run daf:gen-sentences` — gaplarni yasash

Har bo'lim uchun ~30 gap. Model so'rovi bo'limning so'z ro'yxatini va
oldingi bo'limlarning so'zlarini oladi, uslub namunasi sifatida
manbadagi **68 ta toza gap** beriladi.

**Qattiq qoida — validator:** yasalgan gapdagi har bir mazmunli so'z shu
bo'limda yoki undan **oldingi** bo'limlarda o'rganilgan bo'lishi shart.
Ruxsat etilgan yordamchi so'zlar ro'yxati (artikl, olmosh, bog'lovchi)
alohida saqlanadi. Shartni buzgan gap **rad etiladi va qayta so'raladi**;
uch urinishdan keyin o'sha gap tashlab yuboriladi.

Bu qoida Faza 1b dagi javob kaliti qo'riqchisi bilan bir xil ruhda:
manba o'zi aytgan sonni tekshirmaganimiz uchun 256 mashq jimgina
yo'qolgan edi. Tekshirilmagan generatsiya ham shunday jimgina buzadi.

Natija: `content/daf/sentences.json`.

### 11.3 `npm run daf:gen-tts` — gap ovozi

`fal-ai/chatterbox/text-to-speech/multilingual`, nemis tili, sekin
talaffuz. Narx: 1 000 belgi uchun $0,025 → ~600 gap ≈ **$0,60**.
Natija R2 ga, kalit `DafSentence.audioKey` ga.

### 11.4 `npm run daf:gen-images -- --unit N` — rasmlar

`fal-ai/flux/schnell`, **bitta bo'lim uchun bir marta**, keyin odam
ko'rib tasdiqlaydi. Narx: 1 megapiksel uchun $0,003 → 1024×1024 rasm
≈ **0,3 sent**, A1 ning ~450 rasmi ≈ **$1,35**.

Uslub qat'iy (namunada tanlandi):

```
Soft rounded 3D illustration, claymation style: <sahna>.
Friendly pastel colors, gentle soft shadows, plain light neutral
background, subject fills most of the frame, centered.
No text, no letters, no words, no writing anywhere.
```

Uch qoida:

- **Yozuv taqiqlanadi.** Rasmdagi yozuv javobni oshkor qiladi va Flux
  harflarni buzib chizadi. So'rovda ham, hujjat tasvirlarida ham
  «bo'sh qog'oz» deb aniq ko'rsatiladi.
- **Bayroq sun'iy intellektdan olinmaydi.** A1 da 12 mamlakat bor;
  Flux bayroqlarni xato chizadi. Ular uchun tayyor bayroq aktivlari
  (`content/daf/flags/`) ishlatiladi.
- **Har bo'limdan keyin odam ko'radi.** Sinovda `unterschreiben` rasmi
  uslubdan siljib, boshqalarga qaraganda fotografikroq chiqdi.
  Avtomatik o'tkazib yuborish taqiqlanadi.

`picturable` bayrog'i shu skript ishga tushishidan oldin model bilan
belgilanadi va natija `content/daf/picturable.json` da saqlanadi —
ya'ni qaror bir marta qabul qilinadi va ko'rib chiqiladi, har safar
qayta o'ylanmaydi.

### 11.5 Xarajat jamlanmasi

| Ish | Miqdor | Narx |
| --- | ---: | ---: |
| Rasmlar | ~450 | $1,35 |
| Gap ovozi | ~600 | $0,60 |
| Gap yasash + tarjima | ~600 | < $1 |
| **Jami** | | **< $5** |

---

## 12. Ekranlar

| Yo'l | Nima |
| --- | --- |
| `/portal/lernen` | A1 yo'li: 20 bo'lim tuguni, tepada seriya + kunlik maqsad + bilingan so'z |
| `/portal/lernen/units/[unitId]` | Bo'limning 5 bosqichi va grammatika qoidasi kartasi |
| `/portal/lernen/lessons/[lessonId]` | Dars: 12 savol, ilgarilash chizig'i, javob izohi |
| `/portal/lernen/reyting` | Guruh reytingi, joriy hafta |
| `/lehrer/lernen/guruh/[groupId]` | Ustoz paneli (faqat o'qish) |

Mavjud Lumio dizayn tizimi ishlatiladi. Dars ekrani namunada
tasdiqlangan qolipda: yuqorida ilgarilash chizig'i, o'rtada savol,
pastda bitta katta tugma («Tekshirish» → «Davom etish»).

Yangi route'lar **ADR-0003 ga binoan** `branch-route-policy.ts` da
toifalanadi, aks holda build yiqiladi.

---

## 13. Nima QILINMAYDI

- **A2 va B1** — keyingi fazalar. B1 da kontent deyarli yo'q
  (7 mavzu, 178 so'z) va unga yangi manba kerak.
- **Gapirish mashqlari** (mikrofon, talaffuz baholash) — A1 uchun
  eshitish va yozish ustuvor deb kelishildi.
- **AI baholovchi** (Deutsch Tutor) — [ADR-0009](../../adr/0009-deutsch-tutor-olib-tashlandi.md) bo'yicha olib tashlangan, qaytarilmaydi.
- **Begonalar bilan liga** — guruh reytingi bundan kuchliroq va bizda
  ma'lumot bor.
- **Yurak / jon / to'lovli tiklash** — D15.
- **Native ilova pariteti** — web birinchi, keyin RN.
- **Rasmli mashq har turda** — faqat 2 turda (D10).

---

## 14. Xavflar

| Xavf | Ta'siri | Nima qilamiz |
| --- | --- | --- |
| Yasalgan gapda grammatik xato | O'quvchi noto'g'ri o'rganadi | Validator so'z boyligini tekshiradi; grammatikani ustoz namuna bo'yicha ko'radi; gap `origin = GENERATED` deb belgilanadi, ya'ni keyin topib tuzatish mumkin |
| Rasm uslubi siljishi | Ekran chalkash ko'rinadi | Har bo'limdan keyin odam ko'rigi (11.4) |
| Rasm ma'noni noto'g'ri beradi | Savol javobsiz qoladi | Faqat `picturable` so'zlar; ko'rikda tashlab yuborish mumkin |
| TTS talaffuzi noto'g'ri | O'quvchi xato eshitadi | Har bo'limdan 3 ta namuna tinglanadi; shubhali gap tashlanadi |
| `DafLexemeState` o'sishi | Jadval kattalashadi | 1 843 so'z × faol o'quvchi. 1 000 o'quvchida 1,8 mln qator — Postgres uchun kichik. Qator faqat **ishlatilgan** so'z uchun yaratiladi |
| Bo'lim chegarasi noqulay chiqishi | Mavzu ikkiga bo'linadi | Chegara qo'lda yoziladi va ko'rib chiqiladi (3.1) |
| Enum migratsiyasi | Bo'lim tartibi buziladi | Bir migratsiya ichida enum ko'chiriladi, `order` seed tomonidan qayta yoziladi (4.4) |

---

## 15. Testlar

| Nima | Qanday |
| --- | --- |
| Dars qurish | Har bosqich uchun tur nisbati; 12 savol; kamida 4 xil tur; material yetmaganda o'rin bosish tartibi |
| Qaytarish tanlovi | `dueAt <= now` bo'yicha eng eski 2 ta; muddati kelgan yo'q bo'lsa 0 ga tushishi |
| Leitner | Kuch va sana hisoblash; xatoda 0 ga tushishi; ertangi Toshkent kuni |
| Xato qaytishi | Savol navbat oxiriga tushishi; ikkinchi xatodan keyin qaytmasligi |
| Gap validatori | Notanish so'zli gap rad etilishi; yordamchi so'zlar o'tishi |
| Javob tekshirish | To'g'ri javob javobda bo'lmasligi; begona `lexemeId` rad etilishi; umlaut majburiyligi |
| Seriya | Ketma-ket kunlar; bugun mashq qilinmaganda buzilmasligi; Toshkent kuni |
| Reyting | Faqat o'z guruhi; 2 kishidan kam bo'lsa ko'rsatilmasligi |
| Ustoz paneli | Faqat o'zi o'qitadigan guruhlar; boshqa guruhga 403 |
| Seed | Tegmagan mavzu qolsa yiqilishi; bo'lim hajmi 30–50 |
| Route siyosati | Yangi route'lar toifalangani (ADR-0003) |

---

## 16. Ish tartibi

| Bosqich | Nima | Natija |
| --- | --- | --- |
| **1** | Model: enum, `tier`, 3 yangi jadval, migratsiya | Baza tayyor, eski struktura ko'chgan |
| **2** | `a1-units.json` + `daf:a1-units` | 20 bo'lim, 100 dars |
| **3** | Gaplar: yasash, validator, tarjima | `sentences.json`, bazada |
| **4** | Ovoz va rasmlar: TTS + Flux, bo'lim-bo'lim ko'rik bilan | R2 da aktivlar, bazada kalitlar |
| **5** | Dvigatel: dars quruvchi, 12 tur, javob tekshirish | API tayyor |
| **6** | Qaytarish: Leitner, xato qaytishi | O'rganish saqlanadi |
| **7** | Ekranlar: yo'l, bo'lim, dars | O'quvchi ishlatadi |
| **8** | Ushlab qolish: seriya, maqsad, eslatma, sanagichlar | Qaytish sababi bor |
| **9** | Ijtimoiy: guruh reytingi, ustoz paneli | Turtki to'liq |

Har bosqich alohida PR. 1–4 kontent, 5–6 dvigatel, 7–9 tajriba.

---

## 17. ADR

Bu ish ikkita qaytarish qiyin qarorni o'z ichiga oladi va ADR talab
qiladi ([ADR amaliyoti](../../adr/README.md)):

- **ma'lumot modeli o'zgaradi** — `DafLevel` uchtaga tushadi,
  `DafLessonKind` o'chadi;
- **tashqi xizmat tanlanadi** — rasm va ovoz uchun fal.ai.

`docs/adr/0012-mashq-kontenti-yasaladi.md` shu ishning PR'i ichida
yoziladi. Asosiy tezis: **mashq kontenti manbadan ko'chirilmaydi,
o'quvchining o'rgangan so'zlaridan yasaladi va mashina tekshiradi** —
chunki manbadagi gaplarning 73 % i o'quvchi bilmagan so'zni ichiga
oladi.
