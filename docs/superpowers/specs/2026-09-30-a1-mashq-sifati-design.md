# A1 mashqlari sifati — tuzatishlar (dizayn)

**Sana:** 2026-09-30
**Bog'liq:** [Rasmli mashqlar](2026-09-27-a1-rasmli-mashqlar-design.md),
[A1 kurs dizayni](2026-09-03-a1-kurs-design.md)

CEO 30.09: «barcha unitlarni o'rganib chiq. Mashqlar sifati
qiziqarliyligini tekshir.» Tekshiruv prod ma'lumotida (21–29.09, 20 o'quvchi)
qilindi. CEO to'rttasini ham tanladi: pulsiz tuzatishlar, 1-unitga rasmlar,
o'xshash variantlar, 12–99 sonlar.

---

## 1. Tekshiruv nimani ko'rsatdi

- 19 o'quvchidan 19 tasi 1-unitda; 1-unitda rasm yo'q, ya'ni rasmli
  mashqlarni hech kim ko'rmagan.
- Birinchi urinishdagi to'g'ri javob: eshitib so'z tanlash 98%, gap
  tarjimasini tanlash 97%, juftlash 95% — o'ta oson; gap tuzish 64%, bo'sh
  joyga so'z yozish 59% — og'ir.
- 4-unit (kontenti yo'q) ochiq: 3-unitni tugatgan o'quvchi 1–2 savolli,
  2–4 soniyali «darsga» tushadi.
- To'g'ri yoki deyarli to'g'ri javob xato deb belgilanadi: `tschüs` (to'g'ri
  yozuv), `bahnof`, `aufwidersehen`; ikki gapli jumlada so'roq/nuqta
  belgisi yo'qoladi («Bist du Thomas? Ja, das bin ich.» — eng ko'p xato
  qilingan savol).
- Alifbo bo'limida savol javobni aytadi («C» → «'C' harfi»).
- 12–19 va 21–99 sonlar o'rgatilmaydi (kurs rejasida «0–20»).

## 2. Nima quriladi

### 2.1 Bo'sh unit yopiq («Tez orada»)

- `getLevels`/`getUnit` har unitga `bereit: boolean` qo'shadi: unit
  bo'limlarida kamida bitta `core` so'z bor.
- Yo'l (`yolTugunlari`): `bereit === false` unitning seanslari qulf
  zanjiriga kirmaydi; sarlavhasi ostida bitta «Tez orada» tuguni.
  Unit sahifasi ham «Tez orada» ko'rsatadi.
- Himoya: `baueKandidaten` materiali bo'sh bo'lsa (so'z, gap, ibora,
  dialog yo'q) `null` qaytaradi — dars savol bermaydi.

### 2.2 To'g'ri javob jazolanmaydi

- **So'z variantlari:** `DafLexeme.akzeptiert String[]` (migratsiya,
  `DafSentence.akzeptiert` bilan bir xil). Kontentda
  `woerter.json → akzeptiert` (masalan `tschüss` → `["tschüs"]`). Yozish
  formatlari (`LUECKE`, `WORT_TIPPEN`, `BILD_TIPPEN`, `UZ_WORT`) qabul
  qiladi.
- **Bitta harf xatosi (Duolingo kabi):** `WORT_TIPPEN`, `BILD_TIPPEN`,
  `LUECKE` javobi to'g'ri hisoblanadi va javob paneli «Imlosiga e'tibor
  bering: Bahnhof» deydi (`PruefenErgebnis.tippfehler`). Qoida
  (`fastRichtig`, sof funksiya):
  - faqat bitta so'z bitta tahrirda farq qiladi (almashtirish, qo'shish,
    tushirish yoki qo'shni ikki harf o'rni almashishi);
  - artikl (der/die/das) aynan bo'lishi shart — artikl xatosi imlo emas;
  - so'z kamida 5 harfli (qisqa so'zda bitta harf boshqa so'z yasaydi:
    vier/hier);
  - kichik harfli so'zda (fe'l, sifat) oxirgi ikki harfdagi tahrir
    kechirilmaydi — u yerda grammatika turadi (`wohnen`/`wohne`);
  - faqat bo'shliq farqi (`aufwiedersehen`) ham imlo xatosi sifatida qabul.
- **Ikki gapli jumla (gap tuzish):** gap ichidagi `.`/`?`/`!` o'zidan
  oldingi so'z bilan qoladi («Thomas?»), gap oxiridagisi olib tashlanadi.
  Tekshiruv o'zgarmaydi (`normalisieren` tinishni olib tashlaydi).
- **Alifbo:** bitta harfli so'zga faqat eshitish formatlari
  (`AUDIO_WORT`, `WORT_TIPPEN`) quriladi; `WORT_UZ`, `UZ_WORT`, `PAAR`,
  `LUECKE` harfni so'ramaydi.

### 2.3 O'xshash variantlar

- So'z variantlari (`ablenker`) toifa bo'yicha tanlanadi: harf — harf bilan,
  son — son bilan, artiklli ot — ot bilan, fe'l (`uz` «-moq») — fe'l bilan,
  ko'p so'zli ibora — ibora bilan; toifada 3 ta yetmasa boshqalardan.
- Nemischa variantli formatlarda (`UZ_WORT`, `AUDIO_WORT`) yozilishi yaqin
  so'zlar oldinga suriladi (drei/dreißig, vier/vierzig). Tasodif qoladi:
  eng yaqin 6 tadan 3 tasi.
- **Hech qachon ikkinchi to'g'ri javob emas:** o'zbekchasi bir-birini
  o'z ichiga olgan so'z (qavsdagi izohdan tashqari so'zlar to'plami
  bo'yicha) variant bo'lmaydi: «o'qituvchi» / «o'qituvchi ayol»,
  «o'g'il» / «o'g'il bola», «-da» / «-da, oldida», «xayr» / «xayr».
- Rasm variantlari ham toifa bo'yicha (son rasmi — son rasmlari bilan).
- Gap tarjimasini tanlashda (`SATZ_UEBERSETZEN`) nemischa so'zlari eng ko'p
  mos kelgan gaplar variant bo'ladi (eng yaqin 5 tadan 3 tasi).

### 2.4 12–99 sonlar

- `u01-s4`: 12–20 so'zlari (zwölf … zwanzig), sonli gaplar, grammatika
  izohi (-zehn; sechzehn/siebzehn qisqaradi). Bo'lim nomi «Zahlen 0–20».
- `u02-s2`: qo'shma sonlar qoidasi (einundzwanzig = «bir va yigirma») +
  4 ta namuna so'z va gaplar.
- Yangi so'zlarning ovozi — pulli (Inworld), CEO ruxsati alohida.

### 2.5 1-unitga rasmlar

- **Raqam rasmlari (0–20), pulsiz:** kodda chiziladi — o'nlik ramka
  (2×5 katak), nuqtalar sanaladi. `bild-plan.json`da `szene` o'rniga
  `zahl: N`; `daf-gen-bilder` bunday yozuvni fal.ai'siz, Chrome headless
  bilan chizadi (narx 0).
- **fal.ai (pulli, ruxsat alohida):** Guten Morgen, danke, Deutschland,
  Usbekistan — 4 × $0.00315 ≈ $0.013. Ataylab chiqarilganlar: Frau/Herr
  (keyingi unitlarda ona/buvi rasmi bilan to'qnashadi), hallo/tschüss
  (ikkalasi ham qo'l silkitish), Guten Tag (ertalabki rasm ham «Guten Tag»).

### 2.6 Dars avval o'z bo'limini so'raydi

Ish davomida topildi: dars materiali kumulyativ (shu bo'limgacha hammasi) va
o'z bo'limiga ustunlik yo'q edi — sinov bazasida «Das Alphabet» darsi
birorta ham harf so'ramadi. `SECTION_A`/`SECTION_B` darsida o'z bo'limining
materiali (`eigeneSchluessel`) oldinga suriladi (`baueSeans` → `vorrang`);
cap, takrorlanmaslik va `MIN_FORMATE` o'zgarmaydi, yetmasa oldingi
bo'limlardan to'ldiriladi. `BRIDGE` ataylab aralash, `UNIT_TEST` butun unit.

### 2.7 Hajm qoidasi

Kurs rejasi: bo'limda 8–12 so'z, unitda 50 so'z. 13–19 va qo'shma sonlar
tanish so'zlardan yasaladi, shuning uchun `wortliste.json`da
`ausserhalbBudget: true` (sabab bilan) — hajmga kirmaydi. Sanoq bitta
funksiyada: `kernwoerterImBudget`.

## 3. Chegaralar

- Doimiy qahramonlar va voqea — alohida reja, bu ishga kirmaydi.
- Gap ovozi (eshitib gap tuzish) — alohida.
- Mavjud prod ma'lumoti o'zgarmaydi; kontent seed (`daf:inhalt-seed`)
  u01, u02 uchun deploydan keyin.

## 4. Sinov

- Sof funksiyalar (`fastRichtig`, toifa, variant tanlash, sonli rasm SVG,
  yo'l qulfi) — birlik testlari.
- `pruefen` (variant, imlo xatosi, artikl), `baueKandidaten` (bo'sh unit,
  harflar), `getLevels` (`bereit`) — servis testlari.
- Kontent: `daf:inhalt-check` va unit fayl testlari (har so'z ma'lum).
