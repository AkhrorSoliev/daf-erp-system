# A1 5-unit «Mein Tag» matni — dizayn

**Sana:** 10.10.2026 · **Holat:** yozildi, CEO ko'rigini kutadi
**Asos:** ADR-0071 (so'z zaxirasi). So'z rejasi — `wortliste.json` (u05-s1 … u05-s5),
bo'limlar — `kurs.json`. Namuna — CEO 10.10 ma'qullagan 4-unit
(`2026-10-06-a1-u04-matni-design.md`): o'sha qoidalar, o'sha tekshiruvlar.

## 1. Hajm

| Narsa | Soni |
|---|---|
| So'z (`u05/woerter.json`) | 104: 100 tasi mashqda so'raladi, 4 tasi faqat matnda (halbe Stunde, Uni, wie lange, einkaufen gehen). Reja bilan aynan bir xil (`vergleicheMitPlan` toza) |
| Bo'lim | 5: s1 20 · s2 25 · s3 20 · s4 20 · s5 19 so'z |
| Grammatika qoidasi | 5 (har bo'limga bitta), har birida 5 misol: soatni aytish (rasmiy/norasmiy, «halb neun» = sakkiz yarim), am + hafta kuni / samstags, ajraladigan fe'llar, um va von … bis, müssen |
| Ibora | 19 (har bo'limga 3–4) |
| Dialog | 7 (s3 va s4 da ikkitadan), 56 satr, 14 eshitish savoli; har biri tugal hikoya, sahna izohi bilan |
| Gap | 103 (har bo'limga 20–22): mashqda so'raladigan 100 so'zning hammasi kamida bitta gapda. 3–7 so'zli, ko'pchiligida boshqa to'g'ri so'z tartiblari (`akzeptiert`) |
| Yordamchi so'z | +20 (fe'l shakllari: steht, stehe, stehst, hole, holst, sehe, sieht, fern, schlafe, schläft, beginnt, muss, musst, tut, leid, kümmere, kümmert, wasche, wäscht, bleibt) — har biri o'z bo'limidan ochiladi. Ikki eski yordamchi so'z oldinroq ochildi: «ab» u05-s4 → u05-s3 (abholen), «sich» u08-s3 → u05-s5 (sich kümmern) |

So'zlarning o'zbekchasi qisqa, faqat lotin. Ma'nosi yaqin so'zlar ajratildi:
Stunde «soat (60 daqiqa)» (Uhr — «soat»), Uhrzeit «soat vaqti», halb «yarim» /
halbe Stunde «yarim soat», Samstag «shanba» / Sonnabend «shanba (Germaniya
shimolida)», Kunde «mijoz (erkak)» / Kundin «mijoz (ayol)», enden «tugamoq» /
aus sein «o'chiq bo'lmoq; tugamoq», morgens «ertalablari» / nachts «tunda» /
Nacht «tun».

## 2. Obrazlar va dialoglar

Ismlar faqat mavjud nemischa ismlardan, yangi ovoz kerak emas. Jonas va Mia —
er-xotin, Lena — kichik qizi (gapirmaydi), Helga — Mianing onasi, Thomas va
Julia — do'stlar, Sabine — shifokor qabulxonasi, Anna — bank xodimi
(Thomas bilan «Sie»: Frau Weber / Herr Neumann).

Bitta dialogda bir xil ovozli ikki kishi yo'q, har dialogda ikki kishi
(uch kishilik dialog yo'q — ovoz arzonroq).

| Dialog | Bo'lim | Kimlar | Hikoya: boshi → muammo → yechim → oxiri |
|---|---|---|---|
| d1 Meine Uhr steht! | s1 | Jonas, Mia | Jonas «yetti yarim, vaqtim ko'p» deydi → aslida sakkizga o'n daqiqa, soati to'xtagan → avtobus soat sakkizda, bekat yaqin → Jonas bekatga yetib boradi |
| d2 Wann hast du Zeit? | s2 | Thomas, Julia | Keyingi hafta qahva ichmoqchi → dushanba–juma hammasi band (mashg'ulot, truba darsi, test, ish) → shanba ikkalasi bo'sh → shanba soat uchda kafeda |
| d3 Aufstehen, Jonas! | s3 | Mia, Jonas | Soat yetti, Jonas uxlayapti → odatda yetti yarimda turadi, lekin seshanba ish sakkizda → Mia mashinada olib boradi → sakkizga o'n daqiqada yetib kelishadi, Jonas Lenani o'zi olib kelishini aytadi |
| d4 Serie oder Nachrichten? | s3 | Mia, Helga | Soat sakkizda serial ham, yangiliklar ham → yangiliklar soat o'nda yana bor → avval serial → soat o'nda Helga uxlab qolgan, «Gute Nacht» |
| d5 Ist ein Termin frei? | s4 | Sabine, Helga | Helga qabulga yoziladi → dushanba soat to'qqiz — u yo'q, seshanba–chorshanba band → payshanba soat o'n bir, yarim soat, o'n daqiqa oldin kelish → «Ich bin pünktlich da!» |
| d6 Zu spät! | s4 | Thomas, Anna | Bankda soat o'nda uchrashuv, soat o'ndan chorak o'tgan → avtobus kelmayapti → taksi, lekin soat o'n birda keyingi mijoz → Thomas uzr so'raydi, «Wir beginnen gleich» |
| d7 Wer macht was? | s5 | Mia, Jonas | Shanba, uy ishlari → Jonas faqat televizor ko'rmoqchi, Mia hammasini yolg'iz qiladi → idish-tovoq Jonasga, xarid Miaga, Lena navbatma-navbat → Jonas idish yuvadi, «ertaga men Hausmann» |

Yozma matnda sahna `sahnaUz` va satr `izohUz` bilan beriladi («derazadan
qarab», «uyqu aralash», «telefonda, ko'chadan», «bankka hansirab kirib»),
ikki nuqtasiz.

### 2.1. Hayotiy ovoz (`dialog-regie.json`)

Har dialogda nemischa `szene`, har satrga bitta inglizcha ohang (`toene`) va
`hoerspiel`: fon shovqini (`atmo`, 15 s) va satrlar orasidagi effektlar
(`geraeusche`, ≤ 4 s). 4-unitdagi effektlar so'zma-so'z qayta ishlatildi (keshda
bor, bepul): oshxona foni (d1, d7), ertalabki xonadon (d3), ko'cha (d6),
qahva mashinasi, eshik yopilishi. Yangi effektlar (ovoz yasalganda bir marta
to'lanadi): kechki xonadon foni, mehmonxona foni (televizor), shifokor
qabulxonasi foni, avtobus kelishi, telefon jiringlashi (d2, d5, d6 — bitta
effekt), budilnik, dush, mashina eshigi va motor, xurrak, kalendar varag'i,
shisha eshik va qadamlar, idish yuvish. «Boshqa xonadan» (`fern`) satr yo'q.

## 3. Qoidalar

- **Progressiya:** matndagi har so'z shu bo'limda yoki oldin o'rgatilgan, yoki
  yordamchi so'z sifatida o'z bo'limidan ochilgan. Masalan, ajraladigan fe'l
  shakllari («stehe … auf», «hole … ab») faqat s3 dan, «muss/musst» — s5 dan;
  shuning uchun s1 da Jonas «Ich muss …» demaydi. Kelajak unitlarning asosiy
  so'zi yordamchi qilinmadi: «Dusche» (u09), «sehen» (keyinroq), «Deutsch»
  ishlatilmadi — matn qayta yozildi.
- **CEO qarori (03.10):** cho'chqa go'shti va spirtli ichimlik yo'q (bu unitda
  ovqat mavzusi yo'q).
- **Sonlar so'z bilan:** «halb acht», «zehn vor acht», «zwanzig Uhr dreißig» —
  raqam yo'q, `tts` kerak emas. 45 daqiqa «Viertel vor» bilan aytiladi
  («fünfundvierzig» hali o'rgatilmagan).
- **Bo'sh joy (LUECKE):** javob yoziladi, yordam faqat gapning o'zbekchasi.
  Shuning uchun ikkinchi to'g'ri so'z sig'adigan gap qayta yozildi:
  «Am Samstag haben wir Zeit» (Sonnabend ham to'g'ri bo'lardi) → «Am Montag
  und am Dienstag arbeite ich»; «Was tun wir jetzt?» (machen ham to'g'ri) →
  «Ich habe heute viel zu tun». Sonnabend faqat «Der Sonnabend ist der
  Samstag» gapida.
- **Dialog bo'sh joyi:** javob satri o'z mavzusini aytadi, yakka «Danke!»
  yoki «Tschüss!» satri yo'q, dialog ichida satr takrorlanmaydi.
- **Eshitish savoli:** bitta to'g'ri javob, to'g'ri javobning mazmunli so'zi
  dialogda aytiladi, noto'g'ri variantlar aniq noto'g'ri.
- O'zbekcha faqat lotin.

## 4. Tekshiruv

- `daf:inhalt-check --unit 5` — toza; skript tekshiruvi (`check.js`) —
  progressiya toza, qamrov 100/100; dialog bo'sh joylari ro'yxati ko'rib chiqildi.
- `jest src/daf scripts` — kontent testlari yashil.

## 5. Tartib

1. Matn → avtomatik tekshiruv → nemis va o'zbek tili ko'rigi.
2. Dev bazaga seed, mashqni sinab ko'rish.
3. CEO uchun bitta sahifa (dialoglar oldinda), «yaxshi»dan keyin PR va merge.
4. Prodda `daf:inhalt-seed -- --unit 5`.
5. Ovoz (104 so'z, 7 dialog, 103 gap) va rasm — alohida ruxsat bilan, narxi aytiladi.
