# A1 kursi — 12 unitlik mashq tizimi (dizayn)

**Sana:** 2026-09-03
**Bog'liq:** [ADR-0011](../../adr/0011-oquv-ozagi-standartga-boglanadi.md),
[Faza 2 dizayni](2026-08-27-daf-faza-2-design.md),
[Faza 3 dizayni](2026-08-28-daf-a1-mashq-tizimi-design.md)

Bu hujjat 2026-08-28 dagi Faza 3 dizaynining **o'rnini bosadi** — u yerdagi
20 bo'limli struktura, `tier` modeli va DiB audiosiga tayanish bekor
qilinadi. Sabablar 2-bo'limda.

---

## 1. Nima quriladi

A1 darajasi **12 unitga** bo'linadi. Har unit mavzuli **bo'limlarga**, har
bo'lim ikki darsga bo'linadi. Material bir marta yasaladi va odam ko'rigidan
o'tadi; savol esa o'quvchi darsni ochganda shu materialdan quriladi —
qaysi so'zda adashgan bo'lsa o'sha qaytadi, formati esa har safar boshqacha.

Bu rejada **1-unit oxirigacha** quriladi: matni, rasmi, ovozi va
o'ynaladigan ekrani bilan. Qolgan 11 unit uchun xarita tayyor turadi,
lekin kontenti keyin va alohida qaror bilan to'ldiriladi.

---

## 2. Nima uchun oldingi dizayn o'zgardi

| Oldin (2026-08-28) | Endi | Sabab |
| --- | --- | --- |
| 20 bo'lim, DiB boblaridan hosil qilingan | **12 unit**, Goethe A1 vaziyatlari bo'yicha | 12 — o'quv yilining tabiiy bo'linishi va A1 darsliklarining umumiy o'lchovi. 20 raqami manbaning lug'at bo'limlari sonidan chiqqan edi, o'quvchining ehtiyojidan emas |
| Dars = qiyinlik bosqichi (`tier` 1–5) | Unit → **mavzuli bo'lim** → ichida qiyinlik | Faqat qiyinlik bo'yicha bo'linish mavzuni yo'qotadi: bitta darsda «Tisch» ham «Krankenhaus» ham chiqadi. Mavzu ichida qiyinlik ko'tarilishi ikkalasini beradi |
| So'z audiosi — DiB yozuvlaridan **kesiladi** | **O'zimiz yasaymiz** (ElevenLabs) | Kesilgan oraliqlar turli o'quvchilardan olingan: bo'lim almashsa ovoz, tezlik va balandlik almashadi. Gaplar baribir TTS bo'ladi — aralashma quloqqa uriladi. O'z ovozimizda tezlikni A1 ga moslaymiz va litsenziya bizniki |
| Butun A1 ning media'si bitta yugurishda | **Faqat 1-unit** | Formatlar haqiqiy darsda tasdiqlanmasdan 12 unitlik media yasash — xato chiqsa 12 barobar qayta ish. CEO ruxsati ham aynan bitta unitga berilgan |

---

## 3. Struktura

```
A1
 └ Unit × 12                mavzu              ≤ 50 asosiy so'z
    └ Bo'lim × 5-6          kichik mavzu       8-12 so'z + 1 grammatika qoidasi
       ├ «Tanishuv» darsi        12 savol      tanib olish
       ├ «Ishlatish» darsi       12 savol      ishlab chiqarish
       └ O'tish sinovi            8 savol      shu bo'lim × oldingilari ARALASH
    └ «Kurz und klar»            15 savol      butun unit + Redemittel + dialog
```

Unitda ≈ 18 seans, seans 3–5 daqiqa. 12 unitda ≈ 216 seans ≈ 15 soat sof
mashq. Bu sinf darsining o'rnini bosmaydi — uy ishi va takror vazifasini
bajaradi.

**O'tish sinovi** alohida savol turi emas, **aralash tarkib**: yarmi endi
tugagan bo'limdan, yarmi undan oldingilardan. So'z shu joyda birinchi marta
o'z konteksti tashqarisida tekshiriladi.

### 3.1 So'z byudjeti

| Turi | Miqdor | Nima qilinadi |
| --- | --- | --- |
| **Asosiy (aktiv)** | unitga ≤ 50, jami ≈ 600 | so'raladi, statistikasi yig'iladi, qaytariladi |
| **Passiv** | cheklanmagan | dialog va matnda uchraydi, tarjimasi bor, **hech qachon so'ralmaydi** |

O'zak — Goethe A1 Wortliste (≈ 650 so'z), imtihon standarti. Tijorat
darsligining lug'at ro'yxati **ko'chirilmaydi** (ADR-0011).

Nega chegara kerak: A1 darsliklari bobiga 150–200 so'z beradi, ya'ni 12
bobda ≈ 1 800 so'z. Ularning ko'pi passiv. Aktiv-passiv farqini
belgilamasak, tizim o'quvchidan imtihon talab qilmaydigan narsani talab
qiladi.

### 3.2 12 unit

Sarlavhalar bizniki; mavzular ketma-ketligi Goethe A1 vaziyatlari bo'yicha.

| # | Unit | Mavzu | Bo'lim |
| --- | --- | --- | ---: |
| 1 | Hallo! | salomlashish, tanishuv, alifbo, 0–20 | 5 |
| 2 | Menschen um mich | oila, do'stlar, kasb, 20–100 | 5 |
| 3 | In der Stadt | shahar, yo'l so'rash, transport | 5 |
| 4 | Essen und Trinken | ovqat, do'kon, restoran, narx | 6 |
| 5 | Mein Tag | kun tartibi, soat, hafta kunlari | 5 |
| 6 | Freizeit | bo'sh vaqt, uchrashuv, ob-havo | 5 |
| 7 | Arbeit und Alltag | ish kuni, kasb, telefon | 6 |
| 8 | Gesundheit | tana, kasallik, shifokor | 5 |
| 9 | Meine Wohnung | uy, xonalar, mebel, ijara | 6 |
| 10 | Lernen und Beruf | o'qish, kurs, ariza | 5 |
| 11 | Kleidung und Einkauf | kiyim, o'lcham, rang, xarid | 5 |
| 12 | Reisen und Urlaub | sayohat, mehmonxona, xayrlashuv | 6 |

Jami **64 bo'lim**. Har bo'limning nomi, so'z ro'yxati va grammatikasi
`kurs.json` da kontent yasashdan **oldin** yoziladi va tasdiqlanadi.

---

## 4. Mashq formatlari

16 format, 4 oila. «Ovoz» ustuni ✓ bo'lganlar audio yasalgunga qadar
**o'chiq turadi** — ya'ni tizim ovozsiz ham to'liq sinaladi.

| # | Format | Ko'rsatiladi | Kutiladi | Material | Ovoz |
| --- | --- | --- | --- | --- | :---: |
| 1 | `WORT_UZ` | *der Tisch* | 4 o'zbekchadan biri | so'z | |
| 2 | `UZ_WORT` | stol | 4 nemischadan biri | so'z | |
| 3 | `PAAR` | 4 juft aralash | juftlash | so'z | |
| 4 | `ARTIKEL` | ___ Tisch | der / die / das | so'z | |
| 5 | `BILD_WORT` | *der Tisch* | 3 rasmdan biri | rasm | |
| 6 | `AUDIO_WORT` | 🔊 | 4 so'zdan biri | so'z audiosi | ✓ |
| 7 | `WORT_TIPPEN` | 🔊 | so'zni yozish | so'z audiosi | ✓ |
| 8 | `LUECKE` | Ich ___ Student. | to'ldirish | qoida + gap | |
| 9 | `SATZ_BAUEN` | o'zbekcha gap + so'z banki | gap tuzish | gap | |
| 10 | `WAHL` | du yoki Sie? | ikkitadan biri | qoida | |
| 11 | `REAKTION` | «Wie geht's?» | mos javobni tanlash | Redemittel | |
| 12 | `ZUORDNEN` | 6 savol / 6 javob | juftlash | Redemittel | |
| 13 | `DIALOG_LUECKE` | dialog, bir satr yo'q | yetishmagan satr | dialog | |
| 14 | `SATZ_UEBERSETZEN` | nemischa gap | 4 o'zbekchadan biri | gap | |
| 15 | `HOEREN_WAHL` | 🔊 dialog | to'g'ri javob | dialog audiosi | ✓ |
| 16 | `HOEREN_TABELLE` | 🔊 dialog | jadvalni to'ldirish | dialog audiosi | ✓ |

### 4.1 Javob qabul qilish

**O'zbekchani erkin yozdirish yo'q** — 14-format ham tanlash. O'zbekcha
javobning o'nlab to'g'ri shakli bor; to'g'ri javobni «xato» deb belgilash
o'quvchini eng tez qochiradigan narsa.

Yozish faqat nemischa, va unda ham kechiriladi: `ß`↔`ss`, `ä`↔`ae`,
katta-kichik harf, oxirgi tinish belgisi, ortiqcha bo'shliq. Bir necha
to'g'ri variant bo'lsa hammasi qabul qilinadi (`akzeptiert` ro'yxati).

### 4.2 Chalg'ituvchi variantlar

Chalg'ituvchilar **shu unitning o'z materialidan** olinadi. Butun
lug'atdan olinsa savol bilimni emas, taxminni tekshiradi: «Guten Morgen»
yonida «der Kühlschrank» tursa to'g'ri javob mavzusiga qarab ko'rinadi.

### 4.3 Xilma-xillik qoidalari

Quruvchida beshta qattiq qoida bor:

1. Bitta seansda bir format **3 martadan ko'p** ishlatilmaydi.
2. **Ketma-ket ikki savol** bir formatda bo'lmaydi.
3. Har seansda **kamida 5 xil** format bo'ladi.
4. Bir so'z bir seansda bir marta so'raladi — qaytish savoli bundan
   mustasno, va u **albatta boshqa formatda** keladi.
5. Ketma-ket ikki seansda aynan bir xil **(so'z + format)** juftligi
   takrorlanmaydi.

Har seans turining o'z «ta'mi» bor: «Tanishuv» tanib olishga (1, 3, 5, 6),
«Ishlatish» ishlab chiqarishga (2, 4, 7, 8, 9), «O'tish sinovi» aralash va
tezkor, «Kurz und klar» vaziyatga (11, 12, 13, 15, 16) suyanadi.

---

## 5. Xato so'zlar va qaytarish

Har javob yoziladi: **qaysi so'z, qaysi format, to'g'rimi, necha soniyada**.

**Seans ichida** — xato qilingan savol navbat oxiriga qaytadi, boshqa
formatda. Ikkinchi xatodan keyin to'g'ri javob ko'rsatiladi va dars davom
etadi. Cheksiz aylanish o'quvchini qamab qo'yadi.

**Kunlar bo'ylab** — Leitner qutisi:

```
kuch 0 → shu seans oxirida
kuch 1 → +1 kun     kuch 3 → +7 kun
kuch 2 → +3 kun     kuch 4 → +16 kun     kuch 5 → +35 kun
```

To'g'ri javob bir quti ko'taradi; xato javob **nolga tushiradi** va so'zni
ertangi Toshkent kuniga qo'yadi. Har seansning **oltidan bir qismi** muddati kelgan so'zlarga ajratiladi:
12 savollik darsda 2 ta, 8 savollik o'tish sinovida 1 ta, 15 savollik unit
yakunida 2 ta. Muddati kelgan so'z bo'lmasa (birinchi bo'lim, birinchi
dars) o'rniga yangi savol qo'yiladi. Holat **har javobdan keyin** yangilanadi —
dars tashlab ketilsa ham o'rganilgani yo'qolmaydi.

**Unit va guruh darajasida** — unit yakunida o'quvchining eng ko'p
adashgan so'zlari alohida blok bo'lib keladi; o'qituvchi paneliga guruhda
eng ko'p xato qilingan 10 so'z chiqadi.

Seriya, kunlik maqsad va reyting **bu rejada yo'q** (alohida reja).

---

## 6. Material va fayllar

```
server/content/daf/a1/
  kurs.json          12 unit × 64 bo'lim xaritasi
  wortliste.json     ~600 asosiy so'z → qaysi unit, qaysi bo'lim (faqat biriktirish)
  u01/woerter.json   o'sha unitning TO'LIQ yozuvi: de, tts, uz, artikel,
                     ko'plik, core (aktiv/passiv) — passiv so'zlar ham shu yerda
  u01/saetze.json    de, tts, uz
  u01/dialoge.json   satrma-satr: kim, de, tts, uz
  u01/grammatik.json qoida + misollar
  u01/redemittel.json vaziyat → ibora
```

Matn git'da, baytlar R2 da — Faza 1 dagi bo'linish o'zgarmaydi.

### 6.1 Ko'rinadigan matn va aytiladigan matn

Har so'z, gap va dialog satrida ikki maydon bo'lishi mumkin: `de` —
ekranda ko'rinadigani, `tts` — ovoz yasovchiga ketadigani.

```json
{ "de": "0176 / 23 45 89",
  "tts": "null eins sieben sechs, dreiundzwanzig, fünfundvierzig, neunundachtzig" }
```

Nega majburiy: yakka bosh harf va raqamlarni TTS **inglizcha** o'qiydi,
`language_code: "de"` bo'lsa ham (o'lchangan: `W J Z Y V` → «DJ ZY Phi»;
to'g'risi `Weh Jott Zett Ypsilon Fau`). 1-unitda alifbo, 0–20, telefon
raqami va e-mail bor — ya'ni bu qoida birinchi unitdayoq kerak bo'ladi.

### 6.2 Validator — qoidalar tekshiriladigan bo'ladi

`npm run daf:a1-check` quyidagini tekshiradi va biror shart buzilsa
**yiqiladi**:

| Qoida | Tekshiruv |
| --- | --- |
| Bo'lim hajmi | 8–12 asosiy so'z |
| Unit hajmi | ≤ 50 asosiy so'z |
| Takror yo'q | har so'z aynan bitta bo'limga tegishli |
| **Progressiya** | gapdagi har mazmunli so'z shu bo'limda yoki **oldin** o'rganilgan |
| Grammatika | har bo'limda ≥ 1 qoida + 4 misol |
| Gap zaxirasi | har bo'limda ≥ 6 gap |
| Javob kaliti | har material uchun javob bor va aniq |
| **Format qopqog'i** | bo'lim uchun 16 formatdan nechtasi qurila oladi; **8 dan kam bo'lsa yiqiladi** |

Oxirgi qoida «bu bo'lim zerikarli chiqadi» degan xatoni kontent
bosqichida, o'quvchi ko'rishidan oldin ushlaydi.

Progressiya qoidasining sababi o'lchangan: Faza 1b da javob kaliti
qo'riqchisi bo'lmagani uchun 256 mashq (20 %) sezilmay yo'qolgan edi.
Tekshirilmagan generatsiya jimgina buzadi.

---

## 7. Ma'lumot modeli

| Jadval | Holat | Nima |
| --- | --- | --- |
| `DafUnit` | bor | A1 uchun 12 qator |
| **`DafSection`** | **yangi** | 64 qator: unit, tartib, nom, grammatika |
| `DafLexeme` | kengayadi | `sectionId`, `core`, `artikel`, `plural`, `tts` |
| `DafSentence` | kengayadi | `sectionId`, `tts` |
| **`DafDialog` / `DafDialogLine`** | **yangi** | dialog, satr, gapiruvchi, audio kaliti |
| **`DafPhrase`** | **yangi** | Redemittel: vaziyat → ibora |
| `DafLesson` | kengayadi | `kind`: `SECTION_A`/`SECTION_B`/`BRIDGE`/`UNIT_TEST` |
| `DafAttempt` | kengayadi | `format` ustuni |
| `DafLexemeState` | kengayadi | `wrongCount`, `lastFormat` |

**Yangi jadval qo'shilmaydigan joy:** seriya, reyting va «oxirgi seansda
nima chiqqani» — hammasi `DafAttempt` dan hisoblanadi. Alohida sanagich
haqiqatdan uzilib qolishi mumkin.

**Savollar bazada saqlanmaydi** — har so'rovda quriladi. 64 bo'lim × 18
seans × 12 savol = 13 000 dan ortiq qator bo'lardi va material
o'zgarganda eskirardi.

### 7.1 Eski DiB kontenti

A1 ning eski 20 bo'limi **nafaqaga chiqariladi** (`retiredAt`,
o'chirilmaydi). A2 va B1 tegilmaydi. Yangi so'z ro'yxati tuzilganda DiB
zaxira sifatida ishlatiladi:

| DiB dan | Olinadimi | Nega |
| --- | --- | --- |
| O'zbekcha tarjimalar (1 843) | ✅ | tayyor va tekshirilgan, vaqt tejaydi |
| Video + transkript (198) | ✅ | `HOEREN_WAHL` uchun haqiqiy nutq |
| Audio oraliqlari (1 772) | ❌ | o'rniga o'z ovozimiz (2-bo'limga qarang) |
| 1 180 grammatika mashqi | ⚪️ | bo'limga mos tushsa — ilova, majburiy emas |

---

## 8. Ovoz

| Nima | Ovoz | Nega |
| --- | --- | --- |
| So'z | bitta aniq kattalar ovozi, sekin | talaffuz namunasi bitta bo'lishi kerak |
| Gap | o'sha bitta ovoz | so'z va gap bir xil eshitiladi |
| Dialog | obrazlar to'plami, `text-to-dialogue` bilan bitta so'rovda | suhbat tabiiy chiqadi |

**Qat'iy qoida:** bitta dialog ichida ikki tizim aralashmaydi (o'lchangan:
shovqin poli 24.7 dB, tezlik 81 so'z/daqiqa farq qiladi).

---

## 9. Media chegarasi va narx

| Nima | 1-unit | 2–12 unit |
| --- | --- | --- |
| Matn | ✅ | keyin |
| Rasm | ✅ ~25 ta | ❌ |
| Ovoz | ✅ ~5 000 belgi | ❌ |
| Audio formatlar (6, 7, 15, 16) | yonadi | o'chiq |

| Ish | Hajm | Narx |
| --- | --- | --- |
| So'z + gap ovozi (`tts/turbo-v2.5`, $0.05/1k) | ~3 200 belgi | ~$0.16 |
| Dialog (`text-to-dialogue/eleven-v3`, $0.10/1k) | ~1 800 belgi | ~$0.18 |
| Rasm (`flux/schnell`) | ~25 ta | ~$0.08 |
| Qayta yasashga zaxira | | ~$0.30 |
| **Jami** | | **≈ $0.72** |

**Ruxsat faqat 1-unitga berilgan.** Ikkinchi unitning media'si uchun
hajm va summa aytilib, alohida ruxsat so'raladi. Chaqirishdan oldin narx
`get_pricing` bilan qayta tasdiqlanadi.

Rasm qoidalari (Faza 3 dan meros, o'zgarmaydi): yozuv taqiqlanadi;
bayroqlar AI dan olinmaydi (tayyor aktivlar); har bo'limdan keyin odam
ko'radi.

---

## 10. Ekranlar

Pilot **veb portalda** quriladi (`/portal/lernen`) — Faza 2 ekranlari
turibdi, deploy tez, telefon brauzerida ochiladi.

| Yo'l | Nima |
| --- | --- |
| `/portal/lernen` | 12 unitlik yo'l, ochilgani va qulflangani |
| `/portal/lernen/units/[unitId]` | bo'limlar ro'yxati, har bo'limning holati |
| `/portal/lernen/lessons/[lessonId]` | seans (12 / 8 / 15 savol) va natija ekrani |

Native ilovaga ko'chirish **bu rejada yo'q** — formatlar qotgandan keyin,
alohida reja va alohida PR bilan (web/native paritet qoidasi).

---

## 11. Ish tartibi

| # | Bosqich | Natija | Darvoza |
| --- | --- | --- | --- |
| 0 | Xarita | `kurs.json` — 12 unit × 64 bo'lim | **CEO tasdiqlaydi** |
| 1 | Qoidalar + poydevor | validator, migratsiya, yangi jadvallar | testlar |
| 2 | 1-unit matni | so'z, gap, dialog, grammatika, Redemittel | validator o'tadi |
| 3 | Dvigatel | savol quruvchi (12 ovozsiz format), tekshirish, Leitner | testlar |
| 4 | Ekran | 1-unit o'ynaladigan bo'ladi | **CEO o'tib ko'radi** |
| 5 | Rasm | ~25 rasm, har biri ko'rikdan o'tadi | **CEO ko'radi** |
| 6 | Ovoz | ~5 000 belgi, 4 audio format yonadi | **CEO tinglaydi** |
| 7 | Qaror | qolgan 11 unit bo'yicha kelishuv | — |

---

## 12. Bu rejada QILINMAYDI

A2 va B1 · 2–12 unitlarning kontenti · seriya, kunlik maqsad, guruh
reytingi · o'qituvchi muallif paneli · AI baholovchi · native ilova ·
eski 1 180 DiB mashqini yangi bo'limlarga ko'chirish.

---

## 13. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Yasalgan gap A1 darajasidan chiqib ketadi | progressiya validatori; shartni buzgan gap rad etiladi va qayta so'raladi |
| Bo'limda material yetmay, seans bir xil bo'lib qoladi | format qopqog'i ≥ 8 qoidasi kontent bosqichida yiqitadi |
| Rasm uslubdan siljiydi yoki yozuv chiqadi | har rasm odam ko'rigidan o'tadi; qayta chizish sababi yozib boriladi |
| TTS harf va raqamni inglizcha o'qiydi | `tts` maydoni; 1-unitda alohida tinglab tekshiriladi |
| 1-unit tasdiqlangach 11 unit qo'lda yozilishi cho'ziladi | 0-bosqichdagi xarita va validator yozishni mexanik ishga aylantiradi |

---

## 14. Testlar

- **Validator:** har qoidaga bittadan yiqiladigan va o'tadigan holat.
- **Quruvchi:** 12 savol chiqishi; xilma-xillik beshta qoidasi; material
  yetmaganda bo'shliqni to'ldirish; qaytarish savollari soni.
- **Javob tekshirish:** `ß/ss`, `ä/ae`, katta-kichik harf, tinish belgisi,
  bir necha to'g'ri variant.
- **Leitner:** to'g'ri/xato javobdan keyin quti va muddat.
- **Seed:** idempotent; qayta yuritish takrorlamaydi.

---

## 15. ADR

`docs/adr/0014-a1-kursi-on-ikki-unitga-bolinadi.md` shu ishning PR'i
ichida yoziladi: struktura o'zgardi, DiB audiosidan voz kechildi va
tashqi ovoz xizmati tanlandi.
