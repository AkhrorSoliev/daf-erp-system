# A1 4-unit «Essen und Trinken» matni — dizayn

**Sana:** 06.10.2026 · **Holat:** yozildi, CEO ko'rigini kutadi
**Asos:** ADR-0071 (so'z zaxirasi), 3-bosqich. So'z rejasi PR #664 bilan
birlashgan (`wortliste.json`). CEO 06.10: «So'z ro'yxati shu holicha olinadi.
Keraksiz so'z chiqsa, matnni ko'rganingizda olib tashlaymiz.»

## 1. Hajm

| Narsa | Soni |
|---|---|
| So'z (`u04/woerter.json`) | 188: 183 tasi mashqda so'raladi, 5 tasi faqat matnda (Verpackung, Maß, Vorliebe, Schweinefleisch, Alkohol) |
| Bo'lim | 6: s1 34 · s2 34 · s3 30 · s4 24 · s5 35 · s6 31 so'z |
| Grammatika qoidasi | 6 (har bo'limga bitta), 5–6 misoldan |
| Ibora | 20 (har bo'limga 3–4) |
| Dialog | 9 (s1, s5, s6 da ikkitadan), 66 satr, 18 eshitish savoli |
| Gap | 86 (har bo'limga 12–15), 3–7 so'zli, ko'pchiligida boshqa to'g'ri so'z tartiblari (`akzeptiert`) |
| Yordamchi so'z | +35 (fe'l shakllari: esse/isst, trinke, mag, möchte, hätte …; artikllar: keine, einen, keinen) — har biri o'z bo'limidan ochiladi |

So'zlarning o'zbekchasi 2-bosqich rejasidan (CEO ko'rgan sahifa) olindi. Ikki so'z
o'zgardi, chunki ma'nosi boshqa so'z bilan ustma-ust tushardi: einkaufen «xarid
qilmoq» (kaufen — «sotib olmoq»), Lokal «ovqatlanish joyi» (Restaurant — «restoran»).

## 2. Obrazlar va ovoz

Ismlar faqat mavjud 12 nemischa ismdan, yangi ovoz kerak emas. Jonas va Mia —
er-xotin, Lena — ularning kichik qizi (gapirmaydi), Helga — Mianing onasi,
Thomas va Julia — do'stlar, Sabine — kassir, Claudia — ofitsiant.

Bitta dialogda bir xil ovozli ikki kishi bo'lmaydi: erkaklar (Iapetus) bittadan,
Mia/Claudia/Sabine/Anna (Erinome) bittadan, Helga/Julia (Callirrhoe) bittadan.

| Dialog | Bo'lim | Kimlar | Mazmuni |
|---|---|---|---|
| d1 Haben wir Brot? | s1 | Jonas, Mia | Uyda nima bor, nima yo'q |
| d2 Eine Melone aus Usbekistan | s1 | Helga, Mia | Bozorda O'zbekiston qovuni va uzumi |
| d3 Was kostet die Melone? | s2 | Jonas, Sabine | Kassada narx so'rash |
| d4 Was isst du gern? | s3 | Thomas, Mia | Yoqtirgan ovqat; cho'chqa go'shtini yemaslik |
| d5 Guten Appetit! | s4 | Mia, Jonas | Nonushta, soat nechada |
| d6 Im Restaurant | s5 | Claudia, Thomas, Julia | Buyurtma berish |
| d7 Die Rechnung, bitte! | s5 | Jonas, Claudia, Helga | Hisob, choychaqa |
| d8 Ein Rezept aus Usbekistan | s6 | Helga, Mia | Osh uchun nima va qancha kerak |
| d9 Die Grillparty | s6 | Thomas, Mia | Halol go'sht; spirtli ichimlikni rad etish |

## 3. Qoidalar

- **Progressiya:** matndagi har so'z shu bo'limda yoki oldin o'rgatilgan, yoki
  yordamchi so'z sifatida o'z bo'limidan ochilgan. Masalan, «einen» faqat s6 dan
  (tushum kelishigi qoidasi), shuning uchun undan oldin erkak jinsli ot
  «den» yoki artiklsiz keladi.
- **CEO qarori (03.10):** cho'chqa go'shti va spirtli ichimlik faqat rad etish
  gapida: «Ich esse kein Schweinefleisch.», «Ich trinke keinen Alkohol.».
  Bier, Wein, Schinken umuman yo'q. Eshitish savolining javob variantlarida ham
  ular ishlatilmaydi.
- **Bo'sh joy (LUECKE):** o'zbekcha izoh faqat bitta nemischa so'zga mos kelishi
  kerak (Kellner/Kellnerin ni gapdagi artikl ajratadi).
- **Dialog bo'sh joyi:** chalg'ituvchi boshqa dialoglarning satrlaridan olinadi.
  Shuning uchun javob satri o'z mavzusini aytadi («Die Tomaten kosten zwei
  Euro.»), «Danke!» kabi yakka xushmuomala satr yo'q (u boshqa dialogda ikkinchi
  to'g'ri javob bo'lib qolardi).
- **Eshitish savoli:** bitta to'g'ri javob, «X oder Y?» savoli yo'q.
- Sonlar so'z bilan yoziladi (raqam yo'q, `tts` kerak emas); o'zbekcha faqat lotin.

## 4. Mashq tezligi

188 so'zli unitda bitta mashqni qurish 3 soniya protsessor vaqtini olardi (u03 —
0,14 s): chalg'ituvchilarni tartiblashda so'zlar orasidagi farq har taqqoslashda
qaytadan hisoblanardi. Tuzatildi (commit `db8cdc00`): u04 — 0,11 s, u03 —
0,01 s. Mashqlarning o'zi o'zgarmadi.

## 5. Tartib

1. Matn → avtomatik tekshiruv (`daf:inhalt-check --unit 4`, `jest src/daf`).
2. Ikki ko'rik: nemis va o'zbek tili; ikkinchi to'g'ri javob (bo'sh joy, dialog
   bo'sh joyi, ibora, eshitish savoli, so'z tartibi).
3. Dev bazaga seed, mashqni sinab ko'rish.
4. CEO uchun bitta sahifa (dialoglar oldinda), «yaxshi»dan keyin PR va merge.
5. Prodda `daf:inhalt-seed -- --unit 4` (server deployi tezlik tuzatishi bilan
   birga, seeddan OLDIN).
6. Ovoz (188 so'z, 9 dialog) va rasm — alohida ruxsat bilan, narxi aytiladi.
