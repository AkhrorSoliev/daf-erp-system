# 1-unit ovozi va rasmi — dizayn

**Sana:** 2026-09-08
**Bog'liq:** [A1 kurs dizayni](2026-09-03-a1-kurs-design.md) §4, §8, §9,
[mashq ekrani dizayni](2026-09-05-lernen-ekrani-design.md),
[ball va yo'l dizayni](2026-09-06-ball-va-yol-design.md)

A1 kursida o'quvchi nemischani **hech qachon eshitmaydi**. Bu hujjat shuni
tuzatadi va yo'l-yo'lakay rasm quvuridagi bitta teshikni yopadi.

---

## 1. Muammo

Goethening to'rt moduli bor: Lesen, Schreiben, Hören, Sprechen. Bizda
qurilgan 10 formatning hammasi **o'qishga** tegishli. Hören va Sprechen
umuman yo'q.

Format soni bu yerda o'lchov emas — 10 tadan 16 taga yetish o'z-o'zicha
hech narsani anglatmaydi. O'lchov qamrov: **o'quvchi nemischa nutqni
eshitmasa, A1 kursini o'taganini ayta olmaymiz.**

---

## 2. Qamrov

| Nima | 1-unitda | Nega |
| --- | --- | --- |
| So'z audiosi (53 ta) | ✅ | Hören ning poydevori |
| `AUDIO_WORT`, `WORT_TIPPEN` | ✅ | Mavjud komponentlarga ovoz qo'shiladi |
| Rasm (8–12 ta) | ✅ | **Sifat namunasi** — mashq uchun emas |
| «Harf chizilmaydi» qoidasi | ✅ | 1-unit ochgan teshik |
| Rasmli mashq formati | ❌ | 1-unitda 1–2 savol chiqadi — 2-unitga |
| Gap va dialog audiosi | ❌ | `HOEREN_*` bilan birga keyingi bosqichga |
| `HOEREN_WAHL`, `HOEREN_TABELLE` | ❌ | `HOEREN_TABELLE` butunlay yangi ekran turi |

**Nega faqat so'z darajasi.** Ikki audio format mavjud «Tanlash» va
«Yozish» komponentlariga ovoz tugmasi qo'shilishi bilan ishlaydi — yangi
ekran turi qurilmaydi. Dialog audiosiga pul sarflashdan oldin CEO ovozni
**haqiqiy mashqda** eshitadi. Xato tanlangan ovoz bilan 12 unitlik audio
yasash — 12 barobar qayta ishlash.

---

## 3. Kalit — bu dizaynning asosiy qarori

Mavjud rasm tizimi kalitni `sourceId` dan yasaydi (`media-keys.ts`):

```
u01-s1-hallo  →  daf/img/u01-s1-hallo.jpg
```

Rasm uchun bu **xavfsiz**, chunki `BILD_WORT` da so'z SAVOL, rasm esa
javob. URL da so'z turishi hech narsani ochmaydi.

**Audio buning teskarisi: so'z javobning o'zi.** `AUDIO_WORT` da ekranda
4 ta variant turadi va o'quvchi ovozni eshitib birini tanlaydi. Kalit
`daf/audio/u01-s1-hallo.mp3` bo'lsa, to'g'ri javob manzilning o'zida
yozilgan bo'ladi.

**Xesh ham yordam bermaydi.** Variantlar ko'rinib turgani uchun ularning
har birini xeshlab, URL bilan solishtirish yetarli. Ya'ni "yashirin nom"
aslida yashirmaydi.

**Qaror:** audio kaliti **tasodifiy** bo'ladi va so'z bilan hech qanday
hisoblanadigan bog'liqligi bo'lmaydi.

Bu dvigatelning boshidan beri amal qilib kelayotgan qoidasining davomi:
to'g'ri javob mijozga hech qachon yuborilmaydi (kurs dizayni D6/D7).
Ilgari bu qoida savol tanasiga tegishli edi; audio uni **manzilga** ham
kengaytiradi.

### 3.1 Tasodifiy kalit saqlanishi SHART

Tasodifiy kalit hisoblab topilmagani uchun uni saqlash kerak. Saqlanmasa,
skriptni qayta yugurtirish har safar yangi fayl yasab, eskisini R2 da
yetim qoldiradi va so'zning audiosi almashib turadi.

Kalit **alohida kontent manifestida** yashaydi —
`server/content/daf/a1/audio.json`, `sourceId → kalit` xaritasi
(`picturable.json` bilan aynan bir xil naqsh: qaror git'ga chiqadi, baza
esa muhit). Bazadagi `DafLexeme.audioKey` undan seed orqali to'ldiriladi.

**Nega bazada emas.** Seed kalitni o'chirmaydi (u `upsert` ning `data`
obyektida yo'q, ya'ni Prisma unga tegmaydi) — sabab boshqa va kuchliroq:
**baza muhit, manba emas.** R2 dagi fayllar abadiy turadi, baza esa qayta
quriladi — 2026-09-07 da prod'dagi mashq jadvallari butunlay tozalangan,
va deploy migratsiyasi `DafLesson` ni o'chiradi. Kalit faqat bazada
tursa, shunday holatdan keyin audio jimgina yo'qolardi: fayllar R2 da
turaveradi, lekin ularga hech kim ishora qilmaydi va 53 so'z qaytadan
yasalardi.

**Nega `woerter.json` ichida emas:** u qo'lda yozilgan kontent, bu esa
mashina yasagan natija. Ularni aralashtirish matnni tahrirlagan odamni
mashina yozgan qatorlar bilan to'qnashtiradi va farqlarni o'qib
bo'lmaydigan qiladi.

### 3.2 Yangi API yo'li QURILMAYDI

Audio R2 dan to'g'ridan-to'g'ri uzatiladi (`R2_PUBLIC_URL + '/' + kalit`),
xuddi rasm kabi. Ya'ni serverga yangi route qo'shilmaydi va
`branch-route-policy.ts` manifestiga yangi yozuv kerak emas.

Kalit tasodifiy bo'lgani uchun R2 ning ochiqligi javobni oshkor qilmaydi:
manzilni bilish uchun o'sha savolni allaqachon olgan bo'lish kerak.

---

## 4. Ovoz

### 4.1 Kutilmagan holat: `speech()` bor, lekin ishlatilmagan

`FalClient` da `speech()` metodi **allaqachon yozilgan**, lekin
kod bazasida **hech qayerda chaqirilmaydi**. U
`fal-ai/chatterbox/text-to-speech/multilingual` ni ishlatadi va **ovoz
tanlash parametri yo'q**.

Bu `personas.json` bilan ziddiyatda: u yerda 13 obraz **ElevenLabs**
ovozlari bilan yozilgan (Mia — Alice, Anna — Rachel, Sabine — Matilda…),
va CEO ning 2026-09-02 dagi qarori ham ElevenLabs.

**Lekin o'sha qarorning sababi dialogga tegishli edi:** ElevenLabs ning
`text-to-dialogue` butun suhbatni bitta so'rovda yasaydi, MiniMax'da esa
bunday endpoint yo'q. **Biz dialog qurmayapmiz.** Yakka so'z uchun savol
boshqacha: qaysi ovoz nemischani eng aniq talaffuz qiladi?

Yana bir ochiq narsa: `personas.json` dagi ElevenLabs ovozlari asli
**inglizcha** obrazlar (Rachel, Callum, George). Ular nemischada qanday
chiqishini **eshitmasdan bilib bo'lmaydi** — talaffuz namunasi uchun bu
hal qiluvchi.

### 4.2 Yechim: eshitib tanlash

Bitta bir xil to'plamdan — 5 ta so'z, ichida umlaut (`tschüss`), qo'shma
unli (`heißen`) va harf (`Z` → `Zett`) bo'lsin — **uch xil** variant
yasaladi:

1. Mavjud Chatterbox yo'li (`speech()`, o'zgartirishsiz)
2. ElevenLabs, ayol ovozi (Anna — *Rachel*)
3. ElevenLabs, ayol ovozi (Sabine — *Matilda*)

2 va 3 uchun `FalClient` ga **ovoz nomini qabul qiladigan yangi metod**
qo'shiladi (mavjud `speech()` ni o'zgartirmasdan: u Chatterbox'ga
bog'langan va namunada solishtiruv tomoni sifatida kerak).

CEO eshitib bittasini tanlaydi. Narxi ≈ $0.01.

**Namunalar tanlanmaguncha 53 so'z yasalmaydi.** Bu qadam ataylab
bloklovchi: noto'g'ri ovoz bilan yasalgan 53 fayl keyin qayta yasaladi va
o'quvchining quloqi ikki xil ovozga o'rganadi.

### 4.3 Bitta ovoz, o'zgarmaydi

Tanlangan ovoz `personas.json` ga o'xshab kontentda yozib qo'yiladi.
Talaffuz namunasi **bitta** bo'lishi kerak: bo'lim almashganda ovoz
almashsa, o'quvchi so'zni emas, ovozni o'rganadi (kurs dizayni §8).

---

## 5. Rasm

### 5.1 1-unitda rasm mashq uchun emas

1-unitning lug'ati — salomlashish, tanishuv, alifbo va sonlar. Loyihaning
o'z qoidasi (`isNeverPicturable`) so'zsiz rad etadi:

- **12 ta son** (`null`…`elf`) — `isNumeric`. Kodda yozilgan sabab kuchli:
  «ikkita olma chizib 2 ni ko'rsatish ishlamaydi — bu rasm "olma" so'ziga
  ham teng darajada to'g'ri keladi».
- **Deutschland, Usbekistan** — `isGeographicProperNoun`. Bayroqlar AI dan
  olinmaydi (kurs dizayni §9).

Qolganidan realistik ravishda 8–12 tasi rasmga tushadi: Frau, Herr, Stadt,
Land, wohnen, sprechen, kun vaqtlari.

`BILD_WORT` har savolga **bir xil bo'limdan 3 ta** rasm talab qiladi
(bitta javob + ikkita chalg'ituvchi). 8–12 rasm butun unit bo'yicha 1–2 ta
savol beradi. **Format shuning uchun 1-unitga qurilmaydi.**

Rasm 1-unitda **ikki narsa uchun** yasaladi: CEO sifatni o'z ko'zi bilan
ko'rsin (2-unitga o'nlab rasm buyurtirishdan oldin), va quyidagi qoida
teshigi yopilsin.

### 5.2 Qoida teshigi: harflar

`isNeverPicturable` **harfni to'smaydi**. Rasm uslubimiz esa matn, harf va
yozuvni qat'iy taqiqlaydi (Flux harflarni buzib chizadi, va yozuv javobni
oshkor qilardi) — ya'ni harfni rasm qilib bo'lmaydi, lekin buni aytadigan
qoida yo'q.

Sabab oddiy: eski DiB kontentida alifbo bo'limi bo'lmagan. **1-unit buni
birinchi marta ochyapti.**

Sonlar qoidasi bilan bir xil mulohaza asosida: yakka lotin harfi (bitta
belgi, `A`–`Z`) hech qachon `picturable` bo'lmaydi.

### 5.3 `picturable` skripti A1 ga moslanishi kerak

`daf-mark-picturable.ts` har lug'at yozuvidan `sourceId, de, **en**` ni
o'qiydi. A1 kontentida **inglizcha maydon yo'q** (`u01/woerter.json` da
faqat `de`, `uz`, `core`, `section`, `order`).

**Qaror: inglizcha qo'shilmaydi, so'rov `de` + `uz` ustiga quriladi.**

Inglizchani qo'shish 53 so'zni tarjima qilishni (yana bitta pullik
model chaqiruvi va yana bitta qo'lda tekshiriladigan kontent qatlami)
talab qilardi — bunday narsani rasm chizilishini hal qilish uchun
kiritish teskari tartib. Nemischa so'zning o'zi "buni chizib bo'ladimi"
degan savolga yetarli; o'zbekchasi esa ma'no noaniq bo'lganda kontekst
beradi.

Qaror `picturable.json` ga yoziladi va odam ko'rib chiqadi — mavjud
naqsh buzilmaydi.

---

## 6. Dvigatel

Ikki yangi format `FrageFormat` ga qo'shiladi:

| Format | Savol | Javob | Material |
| --- | --- | --- | --- |
| `AUDIO_WORT` | 🔊 | 4 ta yozma so'zdan biri | so'z audiosi |
| `WORT_TIPPEN` | 🔊 | so'zni yozish | so'z audiosi |

**Audiosi yo'q so'zga audio savol qurilmaydi.** Savol quruvchi
`audioKey != null` bo'lgan so'zlardangina tanlaydi. Bu formatlarni
«yoqish/o'chirish» bayrog'i kerak emas: audio bo'lmasa savol o'z-o'zidan
qurilmaydi.

**Ball qoidasi o'zgarmaydi.** Muddati kelgan so'zga birinchi urinishda
to'g'ri javob = 10 ball. Audio formatlar so'z ustida ishlaydi, ya'ni
Leitner narvoniga to'liq qo'shiladi.

**Javob tekshirish o'zgarmaydi.** `WORT_TIPPEN` javobini mavjud
`istRichtig` tekshiradi va u allaqachon kechirimli: `tschuess` ham
`tschüss` kabi to'g'ri hisoblanadi, chunki klaviaturada umlaut yo'q
bo'lishi imlo bilimi emas.

**Chalg'ituvchilar** mavjud qoidalar bilan quriladi — shu bo'lim yoki
undan oldingilardan. Alifbo bo'limida bu tabiiy ishlaydi: harf savolining
chalg'ituvchilari boshqa harflar bo'ladi.

### 6.1 Seans turining moyilligi

`bevorzugteFormate` ga qo'shiladi: `SECTION_A` (Tanishuv) — `AUDIO_WORT`
(tanib olish), `SECTION_B` (Ishlatish) — `WORT_TIPPEN` (ishlab chiqarish).
Moyillik qat'iy bo'linish emas; `MIN_FORMATE` va `FORMAT_MAX_PRO_SEANS`
ustun turadi.

---

## 7. Ekran

Savol chiqishi bilan ovoz **avtomatik yangraydi**, karnay tugmasi bilan
**cheksiz** qayta eshitiladi.

**Avtomatik qo'yish ishlaydi:** brauzer sahifa bilan muloqot bo'lmaguncha
ovozga ruxsat bermaydi, lekin o'quvchi seansni tugma bosib ochadi — ya'ni
birinchi savol chiqqanda muloqot allaqachon bo'lgan.

**Cheksiz qayta eshitish** — A1 darajasida takror eshitish o'rganishning
bir qismi, chegaralash jazoga aylanadi.

`AUDIO_WORT` mavjud **Tanlash** komponentidan, `WORT_TIPPEN` mavjud
**Yozish** komponentidan foydalanadi. Ularning ustiga ovoz tugmasi
qo'yiladi — yangi ekran turi qurilmaydi.

**Mijozda audio pleyer yo'q.** Student-app'da (React Native) Lumio
`AudioPlayer` bor, lekin u boshqa kod bazasi. Web portalda kichik ovoz
tugmasi yoziladi — to'liq pleyer emas: seyk bar, vaqt ko'rsatkichi va
pauza kerak emas, chunki so'z audiosi bir soniyalik.

**Ovoz yuklanmasa:** savol o'tkazib yuborilmaydi va o'quvchi jazolanmaydi
— tugma xato holatini ko'rsatadi va qayta urinish taklif qiladi.

---

## 8. Sinash

**Serverda (jest):**

- audio kaliti so'zdan hisoblanmasligi — bu qoidaning **tripwire** i:
  test kalitni so'z, `sourceId` va ularning xeshi bilan solishtiradi va
  hech biriga teng bo'lmasligini tasdiqlaydi
- `audioKey` yo'q so'zga `AUDIO_WORT`/`WORT_TIPPEN` savoli qurilmasligi
- `WORT_TIPPEN` javobida umlautsiz yozuv qabul qilinishi
- yakka harf hech qachon `picturable` bo'lmasligi (yangi qoida)
- son va geografik nom qoidasi buzilmagani (mavjud testlar)

**Mijozda (vitest, faqat sof mantiq):**

- savol formati audio bo'lganda ovoz manzili talab qilinishi
- manzil yo'q bo'lsa savol xato holatiga o'tishi

**Odam tekshiradi (avtomatlashtirib bo'lmaydi):**

- uch ovoz namunasini eshitib bittasini tanlash
- 53 so'z yasalgach, harf va umlautli so'zlarni tinglab tekshirish
  (`Z` → «Zett», `tschüss`)
- rasm sifati

---

## 9. Narx va ruxsat

| Ish | Hajm | Narx |
| --- | --- | --- |
| Ovoz namunalari (3 variant × 5 so'z) | ~180 belgi | ≈ $0.01 |
| So'z audiosi (53 ta) | 278 belgi | ≈ $0.014 |
| Rasm (8–12 ta) | | ≈ $0.03 |
| Qayta yasashga zaxira | | ≈ $0.03 |
| **Jami** | | **≈ $0.09** |

**Ruxsat FAQAT 1-unitga berilgan** (CEO, 2026-09-03). 2-unit media'si
uchun hajm va summa aytilib, **alohida ruxsat** so'raladi.

Har pullik chaqiruvdan oldin narx `get_pricing` bilan qayta tasdiqlanadi
va summa aytiladi.

---

## 10. Bu dizaynda QILINMAYDI

Gap audiosi · dialog audiosi · `HOEREN_WAHL` · `HOEREN_TABELLE` ·
rasmli mashq formati (`BILD_WORT` va «eshitib rasmni tanlash») ·
`WAHL` · Netzwerk lug'ati · tanishtirish qadami · 2–12-unit kontenti ·
Sprechen (o'quvchi gapiradigan mashq).

**«Eshitib rasmni tanlash» formati haqida:** bu dizaynda u qurilmaydi,
lekin u **kurs dizaynining haqiqiy kamchiligi**. 16 formatli jadvalda
rasm va audio hech qayerda birlashmaydi, holbuki aynan shu format
o'quvchini ovozdan to'g'ridan-to'g'ri ma'noga olib boradi — o'rtada na
nemischa yozuv, na o'zbekcha tarjima turadi. Qolgan formatlarning
hammasi tarjima orqali o'ylashga majbur qiladi. **2-unit dizayni bilan
birga qo'shilsin** — u yerda oila, kasb va ovqat o'nlab toza rasmli so'z
beradi.

---

## 11. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Audio manzili javobni oshkor qilishi | Tasodifiy kalit + testda tripwire (§3, §8) |
| Tanlangan ovoz nemischani buzib talaffuz qilishi | Namuna qadami bloklovchi: eshitmasdan 53 fayl yasalmaydi (§4.2) |
| Harf va raqamning inglizcha o'qilishi | `tts` maydoni allaqachon bor (`C` → `Tseh`); yasalgach odam tinglaydi |
| Skript qayta yugurtirilganda audio almashishi | Kalit kontent JSON'ida saqlanadi, mavjudi qayta yasalmaydi (§3.1) |
| Rasm quvuri A1 da ishlamasligi (`en` yo'q) | Reja hal qiladi; qaror `picturable.json` ga yoziladi, odam ko'radi (§5.3) |
| 1-unit rasmidan mashq chiqmasligi | Ataylab: rasm sifat namunasi, format 2-unitga (§5.1) |
| Ovoz yuklanmasa o'quvchi jazolanishi | Savol xato holatini ko'rsatadi, ball yo'qotilmaydi (§7) |
