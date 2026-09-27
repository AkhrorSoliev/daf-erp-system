# A1 kursi — rasmli mashqlar va artikl ranglari (dizayn)

**Sana:** 2026-09-27
**Bog'liq:** [A1 kurs dizayni](2026-09-03-a1-kurs-design.md),
[1-unit ovozi va rasmi](2026-09-08-a1-ovoz-va-rasm-design.md),
[Faza 3 dizayni](2026-08-28-daf-a1-mashq-tizimi-design.md)

CEO 26.09 da so'radi: «Nega rasm bilan ishlash mashqlari yo'q? Duolingo'ga
o'xshash, undan kreativroq bo'lishi kerak edi». Tekshiruv (26.09) ko'rsatdi:
rasmli mashq ikkala rejada ham bor edi, 08.09 da «2-unitga» qoldirildi,
2- va 3-unit qo'shilganda esdan chiqdi. Kodda 16 formatdan 13 tasi ishlaydi,
rasmlisi 0 ta; A1 uchun birorta rasm yasalmagan. CEO 27.09 da rejani
tasdiqladi va rasm uslubini tanladi: **B — tekis uslub**.

---

## 1. Nima quriladi

| # | Nima | Kod | O'quvchi ko'radi | Kutiladi |
| --- | --- | --- | --- | --- |
| 1 | Rasmni tanlash | `BILD_WORT` | so'z (artikli bilan) + uning ovozi | 4 rasmdan to'g'risi |
| 2 | Eshitib rasmni tanlash | `AUDIO_BILD` | faqat ovoz, yozuv yo'q | 4 rasmdan to'g'risi |
| 3 | Rasmga qarab yozish | `BILD_TIPPEN` | bitta rasm | so'zni artikli bilan yozish |
| 4 | Artikl ranglari | — | der ko'k, die qizil, das yashil | — |

1–3 — yangi `FrageFormat`lar: 16 formatli jadvaldagi `BILD_WORT`
qurilmay qolgan edi; «eshitib rasmni tanlash» 08.09 dizayni o'zi «haqiqiy
kamchilik» deb yozgan format; `BILD_TIPPEN` yangi. 4 — mijozdagi ko'rinish
qoidasi, format emas.

**Rasm yasalmaguncha 1–3 o'z-o'zidan o'chiq.** `audioWort` bilan bir xil
qoida: rasmi yo'q so'zga savol qurilmaydi. Kod rasmlardan oldin chiqa
oladi — o'quvchi hech narsa ko'rmaydi, faqat artikl ranglari yonadi.

## 2. Nega shunday (tanlangan yondashuv)

- **Tanlandi: mavjud dvigatelga so'z formati sifatida qo'shish** —
  `audioWort`/`wortTippen` naqshi. Seans qoidalari (xilma-xillik, cap,
  qaytarish), ball (so'z uchun), Leitner va javobni bazadan qayta hisoblash
  (D7) o'zgarmasdan ishlaydi.
- **Rad etildi: alohida «rasmli dars» turi.** Seans xilma-xilligi
  qoidasiga zid (bir darsda bitta mashq turi — zerikishning o'zi) va
  ish hajmi ikki barobar.
- **Rad etildi: eski DiB rasm quvuri (`daf-gen-images.ts`).** U kalitni
  `sourceId`dan yasaydi (`daf/img/u03-s1-bahnhof.jpg`) va `imageKey`ni
  bazaga to'g'ridan-to'g'ri yozadi. Birinchisi javobni oshkor qiladi
  (5-bo'lim), ikkinchisi prodga seed orqali takrorlanmaydi.

## 3. O'quvchi ekrani

**`BILD_WORT`** — tepada so'z (`der Bahnhof`, artikl rangida), ovozi bo'lsa
o'zi yangraydi (`AUDIO_WORT`dagi kabi tugma). Pastda 2×2 rasm. Tanlanadi →
«Tekshirish». Natijada to'g'ri rasm yashil, xato tanlangan qizil.

**`AUDIO_BILD`** — so'z yozilmaydi (`prompt` bo'sh, xuddi `AUDIO_WORT` kabi —
so'z ko'rinsa savol eshitishni emas, o'qishni tekshirardi). Ovoz o'zi
yangraydi, qayta eshitish tugmasi bor. Pastda 2×2 rasm. Javobdan keyin
so'z ko'rsatiladi: «To'g'ri javob: der Bahnhof».

**`BILD_TIPPEN`** — bitta katta rasm, ostida yozish maydoni (`WORT_TIPPEN`
maydoni). Ko'rsatma: «Rasmda nima? Artikli bilan yozing.» Natijada to'g'ri
yozuv artikl rangida ko'rsatiladi.

Rasmlar kvadrat, burchaklari yumaloq; kichik ekranda ham 2×2 sig'adi.
Variant rasmlarining `alt` matni javobni aytmaydi («1-variant» … «4-variant»),
aks holda ekran o'quvchi dasturi javobni o'qib berardi.

**Natija ekrani** (xatolar ro'yxati): rasmli savolda manzil emas, so'z va
rasmning kichik nusxasi ko'rsatiladi.

## 4. Qayerda chiqadi

| Seans | Moyillik (`kind-formate.ts`) |
| --- | --- |
| «Tanishuv» (`SECTION_A`) | `BILD_WORT`, `AUDIO_BILD` qo'shiladi |
| «Ishlatish» (`SECTION_B`) | `BILD_TIPPEN` qo'shiladi |
| O'tish sinovi (`BRIDGE`) | moyilliksiz, aralash — uchalasi ham chiqa oladi |
| Yakuniy sinov (`UNIT_TEST`) | o'zgarmaydi (vaziyat formatlari) |
| Takrorlash seansi | `WORT_FORMATE`ga qo'shiladi: muddati kelgan so'z rasm orqali ham qaytadi |

Cap: umumiy `FORMAT_MAX_PRO_SEANS` (3). Seans qoidalari o'zgarmaydi.

## 5. Rasm kaliti tasodifiy — javob manzildan ko'rinmasin

`audio-keys.ts`dagi izoh «rasm kaliti `sourceId`dan yasaladi va bu xavfsiz,
chunki `BILD_WORT`da so'z savol, rasm javob» deydi. **Bu noto'g'ri:**
`BILD_WORT`da 4 ta VARIANT rasm. Har birining manzilida o'z so'zi tursa
(`…/u03-s1-bahnhof.jpg`), ekrandagi «der Bahnhof» qaysi variant ekanini
manzil aytib beradi. `AUDIO_BILD`da ham shunday.

Qaror: rasm kaliti audio kabi **sof tasodif** — `daf/bild/<32 hex>.jpg`
(`neuerBildSchluessel()`), manifestda saqlanadi. Izoh tuzatiladi.

## 6. Kontent: reja va manifest

Audio va dialog quvuri bilan bir xil ikki fayl:

- **`content/daf/a1/bild-plan.json`** — odam yozadi, ko'rib chiqiladi:
  ```json
  { "u03-s4-fahrrad": { "szene": "a single bicycle seen from the side", "tippen": true } }
  ```
  `szene` — nima chiziladi (inglizcha, model uchun). `tippen` — rasm so'zni
  **yakka o'zi aniq** bildiradimi: velosiped, avtobus — ha; buvi, shifokor,
  «charchagan» — yo'q (rasmga qarab boshqa to'g'ri so'z ham yozish mumkin:
  «die Frau»). To'g'ri javob jazolanmasin qoidasi shu bilan saqlanadi.
- **`content/daf/a1/bilder.json`** — skript yozadi: `sourceId → kalit`.

**Seed** `imageKey`ni manifestdan, `bildTippen`ni rejadan oladi (audio
kabi). Kontent tekshiruvi: rejadagi har `sourceId` mavjud so'z; manifest
faqat rejadagi so'zlar uchun; `tippen: true` faqat artiklli otda (aks holda
javob — artiklsiz so'z, bu ham mumkin, lekin A1 da fe'l/sifat rasmi
noaniq, shuning uchun qo'riqchi rad etadi).

## 7. Rasm yasash — `scripts/daf-gen-bilder.ts`

- `--unit N` majburiy, `--dry-run` (narx, hech narsa yubormaydi),
  `--ersetzen <sourceId,…>` (ko'rikda rad etilgan rasmni qayta chizish).
- Model: `fal-ai/flux/schnell`, 1024×1024 ($0.003/MP ≈ $0.0031 rasm).
  Uslub — CEO tanlagan B (namunadagi aynan shu so'rov):
  «Flat vector illustration with bold simple shapes, clean thick outlines
  and bright friendly colors: <szene>. Minimal detail, plain light
  background, subject centered and filling most of the frame. No text,
  no letters, no words, no writing, no signs anywhere.»
- Seed `sourceId`dan barqaror (`seedFor`) — qayta yurish bir xil rasm beradi.
- Rasm 512×512 JPEG ga kichraytiriladi (ffmpeg): ekranda ~150 px, to'rtta
  1024 px rasm bitta savolda telefon internetini behuda yeydi.
- Har rasm: yasaladi → kichraytiriladi → R2 ga YANGI tasodifiy kalit bilan →
  DARHOL manifestga yoziladi (dialog skripti F2 qoidasi: o'rtada yiqilsa
  pullik yasalgan rasm yo'qolmaydi).
- Byudjet qorovuli: bir yurishda rasm soni × narx chegaradan oshsa, hech
  narsa yuborilmaydi.
- Ko'rik: skript tugagach har rasm CEO ko'rik sahifasida; yozuv tushgan
  yoki noto'g'ri chiqqani `--ersetzen` bilan qayta chiziladi (seed +1).

## 8. Javob tekshirish

- `BILD_WORT` / `AUDIO_BILD`: variantlar — rasm manzillari. To'g'ri javob
  bazadan qayta hisoblanadi (D7): `mediaUrl(lexeme.imageKey)`. Solishtirish
  **aniq tenglik** (manzil — matn emas, `normalisieren` kerak emas).
- `BILD_TIPPEN`: to'g'ri javob `artikel + de` («das Auto»). Artikl
  **majburiy** — ko'rsatma shuni so'raydi. `normalisieren` kechirimi amal
  qiladi (`ä`↔`ae`, `ß`↔`ss`, katta-kichik harf).
- Uchala format ham `itemType: 'WORT'` — ball, Leitner va `lastFormat`
  mavjud yo'ldan o'tadi. `pruefen` javobi rasmli formatlarda so'zni ham
  qaytaradi (`loesungWort`) — `AUDIO_BILD`dan keyin o'quvchi nima
  eshitganini bilsin.
- Ko'nikma xaritasi (`format-skill.ts`): `BILD_WORT` → `WORTSCHATZ`,
  `AUDIO_BILD` → `HOEREN`, `BILD_TIPPEN` → `SCHREIBEN`.

## 9. Artikl ranglari

der — ko'k, die — qizil, das — yashil. Ikkala mavzuda (yorug'/qorong'i)
o'qiladigan kontrast bilan, token orqali. Rang **qo'shimcha** belgi:
artikl matni doim yoziladi (rangni ajrata olmaydigan o'quvchi ham tushunadi).

Qayerda: so'z formatlarining ekrandagi so'zi (`WORT_UZ`, `BILD_WORT`
prompti), `ARTIKEL` variant tugmalari, to'g'ri javob paneli, natija ekrani
va unit so'zlar ro'yxati. Faqat ko'plikdagi otlarda (`die Eltern`)
kontentda artikl yo'q — ular rangsiz qoladi (ko'plik uchun alohida rang
bu rejada yo'q).

## 10. Boshqa joylar

- **`/media` sahifasi** (CEO/BD/Admin): `VORSCHAU_BAUER` — `Record<FrageFormat>`,
  ya'ni kompilyator yangi formatni talab qiladi; rasmli variantlar kichik
  rasm bo'lib ko'rsatiladi. Mijozdagi format ro'yxati parity testi bilan
  serverniki bilan solishtiriladi.
- **Telefon ilovasi**da DaF mashqlari yo'q (faqat veb portal) — parity ishi
  kerak emas.
- **Migratsiya:** `DafLexeme.bildTippen Boolean @default(false)`.
  `imageKey` allaqachon bor. `picturable` (eski DiB ma'nosi — «chizib
  bo'ladimi») ataylab qayta ishlatilmaydi: boshqa ma'no, boshqa ustun.

## 11. Bu rejada QILINMAYDI

Xarita, soat, katta rasmda topish, qahramonlar va hikoya, gapni eshitib
tuzish (gap ovozi), gapirish, ko'plik uchun alohida rang, 4–12 unit rasmlari.

## 12. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Rasmga yozuv tushadi (namunada A uslubida bo'ldi) | so'rovda taqiq + har rasm odam ko'rigidan o'tadi, `--ersetzen` |
| Rasm boshqa so'zni bildiradi | `szene` odam yozadi; ko'rikda tekshiriladi; `tippen` noaniqlarda `false` |
| Javob manzildan sizadi | tasodifiy kalit (5-bo'lim), `alt` javobsiz |
| Telefon internetida sekin | 512 px JPEG, `loading` faqat ko'rsatilgan savolda |
| Rasm yetmagan bo'lim | quruvchi `null` qaytaradi, seans boshqa formatdan to'ladi (mavjud qoida) |

## 13. Testlar

- Quruvchilar: 4 variant, chalg'ituvchilar rasmli va takrorlanmas;
  rasm/ovoz/`tippen` yetmasa `null`; `AUDIO_BILD` promptida so'z yo'q;
  `BILD_TIPPEN` to'g'ri javobi artiklli.
- `pruefen`: har format uchun to'g'ri/xato, manzil aniq tenglik, begona
  manzil xato, rasmsiz so'zga 400.
- Seans moyilligi, `format-skill`, `/media` quruvchilari, mijoz parity.
- Kontent: reja/manifest qo'riqchisi; skript: byudjet, F2 (har rasmdan
  keyin manifest), tasodifiy kalit, `--ersetzen`.
- Mijoz: ko'rsatma matnlari, artikl rangi yordamchisi, natija ekrani.

## 14. Ish tartibi

| # | Nima | Darvoza |
| --- | --- | --- |
| 1 | Kod: formatlar, tekshirish, ekran, ranglar, `/media`, migratsiya, skript | testlar |
| 2 | `bild-plan.json` (1–3 unit, ~60 so'z) | CEO ro'yxatni ko'radi |
| 3 | Rasmlar ($0.20 atrofida) | **CEO alohida ruxsati**, keyin har rasmni ko'radi |
| 4 | Deploy (server + migratsiya + mijoz) va prod seed u01–u03 | **CEO «yaxshi»** |
