# A1 4-unit «Essen und Trinken» matni — dizayn

**Sana:** 06.10.2026, 2-variant 10.10.2026 · **Holat:** yozildi, CEO ko'rigini kutadi
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
| Dialog | 9 (s1, s5, s6 da ikkitadan), 72 satr, 18 eshitish savoli; har biri tugal hikoya, sahna izohi bilan (§2.1) |
| Gap | 149 (har bo'limga 21–30): mashqda so'raladigan har so'z kamida bitta gapda (183 tadan 182 tasi; drankommen faqat ajralgan shaklda — «Wer kommt dran?»). 3–7 so'zli, ko'pchiligida boshqa to'g'ri so'z tartiblari (`akzeptiert`) |
| Yordamchi so'z | +40 (hm, oh, mama, dran, koche; fe'l shakllari: esse/isst, trinke, mag, möchte, hätte …; artikllar: keine, einen, keinen) — har biri o'z bo'limidan ochiladi |

So'zlarning o'zbekchasi 2-bosqich rejasidan (CEO ko'rgan sahifa) olindi. Ikki so'z
o'zgardi, chunki ma'nosi boshqa so'z bilan ustma-ust tushardi: einkaufen «xarid
qilmoq» (kaufen — «sotib olmoq»), Lokal «ovqatlanish joyi» (Restaurant — «restoran»).

## 2. Obrazlar va ovoz

Ismlar faqat mavjud 12 nemischa ismdan, yangi ovoz kerak emas. Jonas va Mia —
er-xotin, Lena — ularning kichik qizi (gapirmaydi), Helga — Mianing onasi,
Thomas va Julia — do'stlar, Sabine — kassir, Claudia — ofitsiant.

Bitta dialogda bir xil ovozli ikki kishi bo'lmaydi: erkaklar (Iapetus) bittadan,
Mia/Claudia/Sabine/Anna (Erinome) bittadan, Helga/Julia (Callirrhoe) bittadan.

| Dialog | Bo'lim | Kimlar | Hikoya: boshi → muammo → yechim → oxiri |
|---|---|---|---|
| d1 Melonen aus Usbekistan | s1 | Helga, Mia | Bozorda qovun qidirishadi → yo'q → Mia chapda topadi → ikkita qovun, uzum |
| d2 Salat mit Käse | s1 | Jonas, Mia | Jonas salat qilyapti → pomidor yo'q → pishloq qo'shadi → pishloqli salat va non |
| d3 An der Kasse | s2 | Jonas, Sabine | Qovun narxi → qimmat → banan arzon → banan, non, sut, besh yevro |
| d4 Was essen wir heute? | s3 | Thomas, Mia | Qorin och → doner, lekin cho'chqa go'shti? → tovuqli → ikkita doner, suv |
| d5 Kein Brot zum Frühstück | s4 | Mia, Jonas | Nonushtaga nima bor (boshqa xonadan) → non yo'q → Mia novvoyxonaga → bulochka va qahva |
| d6 Im Restaurant | s5 | Claudia, Julia, Thomas | Menyu → Julia go'sht yemaydi → pomidor sho'rvasi → buyurtma «Kommt gleich!» |
| d7 Wer zahlt? | s5 | Jonas, Helga, Claudia | Hisob → ikkalasi to'lamoqchi → Jonas to'laydi, «Stimmt so!» → Helga: «ertaga men» |
| d8 Ein Rezept aus Usbekistan | s6 | Mia, Helga | Mia osh pishiradi → sabzi yo'q → Helga olib keladi → «sehr lecker» |
| d9 Die Grillparty | s6 | Thomas, Mia | Mangal → go'sht halolmi? → hammasi halol; spirtli ichimlikni rad etadi → tovuq mazali |

### 2.1. Dialog — tugal hikoya (CEO 06.10)

1-variantdagi dialoglar «Mia, bizda non bormi?» kabi to'g'ridan-to'g'ri savoldan
boshlanardi. CEO: «nimadan boshlanib nimadan tugaganini tushunib bo'lmayapti».
Endi har dialogning birinchi satrlarida vaziyat va maqsad eshitiladi, o'rtada
muammo va yechim, oxirida aniq yakun bor.

Yozma matnda sahna o'zbekcha izoh bilan beriladi (yangi nemischa so'z
qo'shmaydi): dialogning `sahnaUz`i (qayerda, kim bilan) va satrning `izohUz`i
(masalan «boshqa xonadan»). Ilova ularni bo'sh joy mashqida va eshitishdan
keyin ochiladigan matnda ko'rsatadi (`DafDialog.sahnaUz`, `DafDialogLine.izohUz`).
Izohda ikki nuqta bo'lmaydi: mijoz satrni birinchi ikki nuqtada bo'ladi.
Ovozda sahna effektlar bilan beriladi (eshik, muzlatkich, uzoqdan ovoz) —
`dialog-regie.json`dagi `szene` va har satrning `toene`si.

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
