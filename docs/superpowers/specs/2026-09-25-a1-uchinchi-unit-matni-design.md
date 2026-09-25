# A1 — 3-unit «In der Stadt» matni (dizayn)

**Sana:** 2026-09-25
**Ustun hujjat:** [A1 kursi dizayni](2026-09-03-a1-kurs-design.md) — ziddiyat chiqsa u ustun.
**Tartib andozasi:** [2-unit matni rejasi](../plans/2026-09-10-a1-ikkinchi-unit-matni.md).
**Bog'liq:** ADR-0011 (o'zak standartga bog'lanadi), ADR-0014 (A1 12 unitga bo'linadi).

---

## 1. Nima quriladi

A1 ning 3-uniti («In der Stadt» — shahar, yo'l so'rash, transport) to'liq
matn bilan to'ladi va bazaga tushadi:

| Material | Hajm |
| --- | --- |
| Asosiy so'z | 50 (bo'limlarga 10 / 10 / 9 / 11 / 10) |
| Grammatika qoidasi | 5 (har bo'limga bitta, har birida ≥ 4 misol) |
| Ibora (Redemittel) | 15 (har bo'limga 3) |
| Dialog | 6, har birida 2 ta eshitish savoli (jami 12) |
| Mashq gapi | 50 (har bo'limga 10; qoida — ≥ 6) |

Xarita (`kurs.json`) O'ZGARMAYDI — bo'limlar 2026-09-03 da tasdiqlangan.
Ovoz va rasm bu ishda YO'Q (bir unitlik ruxsat qoidasi): ular alohida
ruxsat bilan, narxi aytilib qilinadi.

---

## 2. Tasdiqlangan qarorlar (CEO, 2026-09-25)

1. **So'zlar ro'yxati** — 3-bo'limdagi 50 so'z (quyida).
2. **Dialoglar** — 6-bo'limdagi matnlar.
3. **Yashirin qator mashqi (`DIALOG_LUECKE`) — A-variant:** kod o'zgarmaydi,
   xavf kontent qoidasi bilan yopiladi (7-bo'lim). B-variant (dialog satriga
   «chalg'ituvchi bo'lmasin» belgisi) rad etildi — hozircha kerak emas.
4. **Muhit:** voqealar Germaniyadagi shaharda. Obrazlar — kursdagi 12 ta
   mavjud nemischa ism, har biri bir martadan. Yangi ism yo'q, demak yangi
   ovoz tanlash ham yo'q.
5. **Tartib:** matn → nemis tili ko'rigi → avtomatik tekshiruv → CEO butun
   unitni bitta sahifada ko'radi → saytga chiqarish → ovoz alohida.

Manbalar bo'yicha: Goethe A1 rasmiy ro'yxati so'zning A1 ga kirishini
belgilaydi (50 tadan 43 tasi asl PDF da bor). Netzwerk neu A1 3-bobi
(«In Hamburg») faqat mavzu qamrovi o'lchovi — matni ham, so'z ro'yxati
ham ko'chirilmaydi.

---

## 3. So'zlar

`wortliste.json` ga 50 yozuv, `u03/woerter.json` ga to'liq yozuv (`de`,
`artikel`, `plural`, `uz`, `core: true`, `order`). O'zbekcha tarjima har
so'zda BITTA aniq ma'no; bir unitdagi ikki so'z bir xil `uz` olmaydi
(`weit` — «uzoq (masofa)», `lange` — «uzoq (vaqt)»; `gehen` — «bormoq
(piyoda)», `fahren` — «bormoq (transportda)»).

**u03-s1 «Orte in der Stadt»** — der Bahnhof · der Platz · der Park ☆ ·
die Post · die Bank · die Polizei · die Toilette · das Hotel · das Kino ·
das Museum ☆

**u03-s2 «Wo ist die Post?»** — Entschuldigung ◇ · neben ☆ · an · zwischen ·
links · rechts · dort · weit · die Straße · die Ecke

**u03-s3 «Wie komme ich zum Bahnhof?»** — gehen · geradeaus · nehmen · dann ·
erste ◇ · zweite ◇ · die Ampel ☆ · suchen · finden

**u03-s4 «Verkehrsmittel»** — fahren · mit · der Bus · die U-Bahn ☆ ·
die Straßenbahn · der Zug · das Auto · das Fahrrad · das Taxi · zu Fuß ◇ ·
die Haltestelle

**u03-s5 «Mein Weg zur Arbeit»** — die Arbeit ◇ · der Weg ☆ · heute · immer ·
oft · manchmal ☆ · dauern · lange · die Minute ◇ · warten

**`grund` majburiy bo'lgan 13 so'z** (`isWordInGoetheA1` ularni topmaydi):

| Belgi | So'z | Sabab (faylga yoziladigan mazmun) |
| --- | --- | --- |
| ☆ | Park | Goethe faqat misol gapda («im Park»); shaharning asosiy joyi |
| ☆ | Museum | Goethe faqat misol gapda («ins Museum»); xalqaro so'z |
| ☆ | neben | Goethe da «daneben» bor; bo'lim qoidasi (in/an/neben) «neben» ni talab qiladi |
| ☆ | Ampel | Goethe da yo'q; yo'l ko'rsatishning asosiy mo'ljali («An der Ampel links») |
| ☆ | U-Bahn | Goethe da yo'q (S-Bahn, Straßenbahn bor); nemis shahrining asosiy transporti |
| ☆ | Weg | Goethe da yo'q; bo'lim nomining o'zi («Mein Weg zur Arbeit») |
| ☆ | manchmal | Goethe da yo'q; «immer – oft – manchmal» chastota qatorini to'ldiradi |
| ◇ | Entschuldigung | Goethe PDF da bosh so'z; ajratilgan nusxada tushib qolgan |
| ◇ | erste, zweite | Goethe PDF «Zahlen» guruhida («das/der/die erste»); nusxada tushib qolgan |
| ◇ | zu Fuß | ibora — «zu» va «Fuß» Goethe da bor, «Ich gehe zu Fuß.» Goethe misoli |
| ◇ | Arbeit | Goethe PDF da bosh so'z («Mein Bruder sucht Arbeit.»); nusxada tushib qolgan |
| ◇ | Minute | Goethe PDF «Uhrzeit» guruhida; nusxada tushib qolgan |

`goethe-a1.json` ning o'zi bu ishda tuzatilmaydi — u PDF dan skript bilan
ajratiladi, qo'lda tahrir qilinsa skriptdan ajralib qoladi.

---

## 4. Grammatika (5 qoida)

| Bo'lim | Qoida | Mazmuni |
| --- | --- | --- |
| s1 | Bestimmter Artikel: der, die, das | Har otning o'z artikli bor; so'z artikli bilan yodlanadi. Birinchi marta aytilganda ein/eine, keyin der/die/das: «Gibt es hier ein Kino? – Ja, das Kino ist neu.» Ko'plikda hammasi «die». |
| s2 | Wo? — in, an, neben | «Wo?» javobida artikl o'zgaradi: der/das → dem, die → der. in + dem = im, an + dem = am: im Park, am Bahnhof, neben der Bank. |
| s3 | zum/zur und Imperativ (Sie) | zu + dem = zum (der/das), zu + der = zur (die): zum Bahnhof, zur Post. Rasmiy buyruqda fe'l oldinda, keyin Sie: «Gehen Sie geradeaus.» |
| s4 | mit + Dativ | mit dan keyin ham dem/der: mit dem Bus, mit der U-Bahn. Istisno: «zu Fuß» (mit siz). fahren: ich fahre, du fährst, er fährt. |
| s5 | Das Verb auf Platz 2 | Darak gapda fe'l doim ikkinchi o'rinda. Vaqt so'zi bilan boshlansa ega fe'ldan keyin keladi: «Ich fahre heute mit dem Bus.» → «Heute fahre ich mit dem Bus.» |

Misollardagi har so'z o'z bo'limigacha tanish (progressiya testi).

---

## 5. Iboralar (15)

REAKTION o'quvchiga `funktionUz` (vaziyat) ni ko'rsatib to'g'ri iborani
tanlatadi; ZUORDNEN 6 vaziyatni 6 ibora bilan juftlaydi. Shuning uchun
**har vaziyat ta'rifi unitdagi faqat O'Z iborasiga mos kelishi shart** —
aks holda ikkinchi to'g'ri javob paydo bo'ladi (masalan «joy qayerdaligini
so'rash» ham pochtaga, ham bekatga mos kelardi). Shu sabab unitda
«Wo ist …?» iborasi faqat bitta.

| Bo'lim | funktionUz | de |
| --- | --- | --- |
| s1 | binoni ko'rsatib, nomini aytish | Das ist der Bahnhof. |
| s1 | biror joy bor-yo'qligini so'rash | Gibt es hier ein Kino? |
| s1 | binoning qandayligini aytish | Das Museum ist sehr alt. |
| s2 | joy qayerdaligini so'rash | Entschuldigung, wo ist die Post? |
| s2 | joy nimaning yonida ekanini aytish | Die Post ist neben der Bank. |
| s2 | uzoq-yaqinligini so'rash | Ist das weit? |
| s3 | biror joyga qanday borishni so'rash | Wie komme ich zum Bahnhof? |
| s3 | to'g'riga yurishni aytish | Gehen Sie hier geradeaus. |
| s3 | qaysi ko'chaga kirishni aytish | Nehmen Sie die erste Straße links. |
| s4 | avtobusda borish-bormasligini so'rash | Fährst du mit dem Bus? |
| s4 | metroda borishini aytish | Ich fahre mit der U-Bahn. |
| s4 | piyoda borishini aytish | Ich gehe zu Fuß. |
| s5 | yo'l qancha vaqt olishini so'rash | Wie lange dauert das? |
| s5 | yo'l qancha vaqt olishini aytish | Das dauert zwanzig Minuten. |
| s5 | har kungi odatini aytish | Ich fahre immer mit dem Fahrrad. |

ZUORDNEN uchun kumulyativ 6 xil vaziyat 2-bo'limda yig'iladi (3 + 3).
Aniq matn nemis ko'rigida o'zgarishi mumkin; yuqoridagi moslik qoidasi
o'zgarmaydi.

---

## 6. Dialoglar (tasdiqlangan)

Har dialogda 2 ta eshitish savoli, har savolda 3 variant. «X oder Y?»
shaklidagi savol YOZILMAYDI (uchinchi variant savolda bo'lmay qoladi —
2-unitdagi ochiq kamchilik).

| Kod | Bo'lim | Sarlavha | Obrazlar |
| --- | --- | --- | --- |
| u03-d1 | s1 | Was ist das? | Jonas, Mia |
| u03-d2 | s1 | Gibt es hier ein Kino? | Anna, Markus |
| u03-d3 | s2 | Wo ist die Post? | Claudia, Peter |
| u03-d4 | s3 | Wie komme ich zum Bahnhof? | Helga, Thomas |
| u03-d5 | s4 | Mit dem Bus oder mit der U-Bahn? | Sabine, Lukas |
| u03-d6 | s5 | Wie kommst du zur Arbeit? | Walter, Julia |

**u03-d1** — Jonas: Mia, was ist das? · Mia: Das ist das Museum. · Jonas: Ist
das Museum neu? · Mia: Nein, das Museum ist sehr alt. · Jonas: Und das? Ist
das die Polizei? · Mia: Ja, das ist die Polizei.
Savollar: «Wie ist das Museum?» → sehr alt (sehr neu, sehr klein) ·
«Das ist das Museum. Und das?» → die Polizei (die Post, die Bank)

**u03-d2** — Anna: Markus, gibt es hier ein Kino? · Markus: Ja, das Kino ist
neu. · Anna: Und ein Hotel? Meine Eltern kommen. · Markus: Ein Hotel gibt es
auch. Es ist klein. · Anna: Danke! · Markus: Bitte!
Savollar: «Wie ist das Kino?» → neu (alt, klein) · «Wer kommt?» → die Eltern
(die Kinder, die Kollegen)

**u03-d3** — Claudia: Entschuldigung, wo ist die Post? · Peter: Die Post ist
neben der Bank. · Claudia: Neben der Bank? Und wo ist die Bank? · Peter: Die
Bank ist dort, an der Ecke. · Claudia: Ist das weit? · Peter: Nein, das ist
nicht weit. · Claudia: Danke! · Peter: Bitte!
Savollar: «Wo ist die Post?» → neben der Bank (neben dem Kino, neben dem
Hotel) · «Wo ist die Bank?» → an der Ecke (im Park, am Bahnhof)

**u03-d4** — Helga: Entschuldigung, wie komme ich zum Bahnhof? · Thomas: Gehen
Sie hier geradeaus. · Helga: Und dann? · Thomas: An der Ampel gehen Sie links.
· Helga: An der Ampel links. Gut. · Thomas: Dann nehmen Sie die zweite Straße
rechts. · Helga: Danke! · Thomas: Bitte!
Savollar: «Wo geht Helga links?» → an der Ampel (an der Ecke, am Bahnhof) ·
«Was nimmt Helga dann?» → die zweite Straße rechts (die erste Straße rechts,
die zweite Straße links)

**u03-d5** — Sabine: Lukas, fährst du mit dem Bus? · Lukas: Nein, ich fahre
mit der U-Bahn. · Sabine: Mit der U-Bahn? Wo ist die Haltestelle? · Lukas: Die
Haltestelle ist neben dem Kino. · Sabine: Fährt die U-Bahn zum Museum? ·
Lukas: Ja, die U-Bahn fährt zum Museum.
Savollar: «Wie fährt Lukas?» → mit der U-Bahn (mit dem Bus, mit dem Taxi) ·
«Wo ist die Haltestelle?» → neben dem Kino (neben der Post, an der Ecke)

**u03-d6** — Walter: Julia, wie kommst du zur Arbeit? · Julia: Ich fahre
immer mit dem Fahrrad. · Walter: Mit dem Fahrrad? Wie lange dauert das? ·
Julia: Zwanzig Minuten. · Walter: Fährst du manchmal mit dem Zug? · Julia: Ja,
manchmal. Dann warte ich oft lange.
Savollar: «Wie fährt Julia zur Arbeit?» → mit dem Fahrrad (mit dem Auto, mit
dem Bus) · «Wie lange dauert der Weg mit dem Fahrrad?» → zwanzig Minuten
(zehn Minuten, dreißig Minuten)

O'zbekcha tarjimalar CEO ga ko'rsatilgan shaklda yoziladi. Raqam
yozilmaydi (so'z bilan), demak `tts` maydoni kerak emas.

---

## 7. Ikkinchi to'g'ri javob chiqmasligi — kontent qoidalari

Mashq dvigateli chalg'ituvchini materialdan oladi, lekin uning MA'NOSINI
tekshira olmaydi. A-variant bo'yicha xavf kontentning o'zida yopiladi.

**Dialog (`DIALOG_LUECKE`)** — chalg'ituvchi shu unitning BOSHQA
dialoglaridan olinadi; shu dialogning satriga matni teng qator avtomatik
chetlanadi (`dialog-fragen.ts`).
1. Xushmuomala qatorlar butun unitda bitta shaklda: «Danke!», «Bitte!»,
   «Entschuldigung, …». «Vielen Dank!», «Danke schön!» kabi variantlar
   yozilmaydi — ular bir-birining o'rniga to'g'ri javob bo'lib qoladi.
2. Javob qatori o'z mavzusini nomlaydi («Die Bank ist dort, an der Ecke.»,
   «Die Haltestelle ist neben dem Kino.»), shunda boshqa dialogdan olingan
   qator oldingi/keyingi qator bilan bog'lanmaydi.
3. Savol qatori o'z mavzusini nomlaydi yoki oldingi qatorni takrorlaydi
   («Neben der Bank? Und wo ist die Bank?»).
4. **Qo'lda tekshiruv:** skript har dialogning nishon bo'la oladigan har
   qatori uchun boshqa dialoglardan olinadigan barcha chalg'ituvchilarni
   ro'yxat qilib chiqaradi; har juftni odam ko'radi. Hukm odamniki, skript
   faqat ro'yxat beradi (skript repo'ga kirmaydi).

**Gap (`LUECKE`)** — bo'limning asosiy so'zi olib tashlanadi, o'quvchi uni
YOZADI (variant yo'q), yordamga gapning o'zbekchasi ko'rsatiladi. Demak
**o'zbekcha tarjima bo'sh joyga faqat bitta so'zni qoldirishi shart**:
«yonida» → neben, «orasida» → zwischen, «burchakda» → an der Ecke,
«doim / tez-tez / ba'zan» → immer / oft / manchmal, «chapga / o'ngga» →
links / rechts. Bir gapda bitta asosiy so'z ikki marta ishlatilmaydi.

**Gap tuzish (`SATZ_BAUEN`)** — boshqa to'g'ri so'z tartiblari
`akzeptiert` ga yoziladi. 5-bo'limda bu ayniqsa muhim: «Heute fahre ich
mit dem Bus.» va «Ich fahre heute mit dem Bus.» ikkalasi ham to'g'ri.

**Tarjima (`SATZ_UEBERSETZEN`)** — ikki gapning o'zbekchasi bir-biriga
yaqin bo'lmasin (chalg'ituvchi boshqa gaplarning o'zbekchasidan olinadi).

---

## 8. Gaplar

- Har bo'limda ≥ 6 (mo'ljal 9), 3–7 so'z, `wordCount` haqiqiy son.
- QO'LDA yoziladi: hayotiy vaziyat, qolipsiz, bo'limning grammatikasi
  ishlatiladi. `daf:gen-saetze` (gpt-4o-mini) ISHLATILMAYDI — u01/u02
  gaplari shu generatordan chiqqani uchun ma'nosiz edi va qayta yozilgan.
- `origin: "GENERATED"` qiymati saqlanadi (enum da qo'lda yozilgan uchun
  alohida qiymat yo'q; u01/u02 ham shunday).
- Nemis tili ko'rigidan o'tadi (9-bo'lim).

---

## 9. Yordamchi so'zlar (`hilfswoerter.json`)

Har yozuvda `grund`, shakl o'z qoidasidan oldin ochilmasligi uchun
`abSection`:

| abSection | So'zlar | Sabab |
| --- | --- | --- |
| u03-s1 | gibt | «es gibt» qolipi |
| u03-s2 | dem, im, am | «Wo?» javobidagi qaratqich shakli va qisqarishlar |
| u03-s3 | zum, zur | zu + dem / zu + der |
| u03-s3 | gehe, gehst · nehme, nimmst, nimmt · suche, suchst, sucht · finde, findest, findet | fe'l shakllari («geht» ro'yxatda bor) |
| u03-s4 | fahre, fährst, fährt | fahren shakllari |
| u03-s5 | dauert · warte, wartest, wartet | fe'l shakllari |

Qoida o'zgarmaydi: ro'yxatda hech bir unitning ASOSIY so'zi turmaydi.

---

## 10. Tekshiruv va darvozalar

1. `npm run daf:inhalt-check -- --unit 3` — toza.
2. `npx jest src/daf` va `npm test` — hammasi o'tadi
   (`unit-inhalt.file.spec.ts` u03 ni `woerter.json` paydo bo'lishi bilan
   o'zi qo'riqlaydi).
3. `npm run typecheck` va `npx eslint src` — toza (kod o'zgarmasa ham).
4. **Nemis tili ko'rigi** — alohida agent: grammatika, tabiiylik,
   `akzeptiert` to'liqligi, LUECKE va REAKTION/ZUORDNEN da ikkinchi to'g'ri
   javob. Topilmalar tuzatiladi.
5. **7-bo'limdagi qo'lda tekshiruv** — dialog chalg'ituvchilari ro'yxati.
6. **CEO ko'rigi** — butun unit (so'z, qoida, ibora, dialog + savol, gap)
   bitta sahifada. «Yaxshi» demaguncha keyingi qadam yo'q.

---

## 11. Saytga chiqarish

Kod o'zgarmaydi — faqat `server/content/daf/a1/` dagi JSON fayllar. O'quvchi
portali va `/media` sahifasi unit matnini ish vaqtida fayldan emas, bazadan
o'qiydi (fayldan faqat `personas.json` va `generated-manifest.json`
o'qiladi, ular bu ishda o'zgarmaydi), shuning uchun:

1. PR merge (kodni birlashtirish).
2. Prod bazaga yuklash: toza `origin/main` dan
   `railway run npm run daf:inhalt-seed -- --unit 3` (idempotent). Server
   deploy SHART EMAS — 2026-09-13 dagi PR #490 ham faqat seed bilan chiqqan.
   Seeddan oldin prod da u03 skeleti borligi tekshiriladi (bor: 5 bo'lim,
   15 dars, 1 yakuniy sinov darsi).
3. Prod o'qib tekshiriladi: u03 da 50 so'z, 5 qoida, 15 ibora, 6 dialog,
   12 savol, gaplar soni fayl bilan teng.
4. Saytda (`student.dafzentrum.uz` → Ta'lim) 3-unit darsi ochib ko'riladi.

---

## 12. Bu ishda QILINMAYDI

Ovoz (so'z, gap, dialog) · rasm · yangi mashq formati · ekran o'zgarishi ·
native ilova · 4–12 unitlar · `goethe-a1.json` ni qayta ajratish · 2-unitdagi
«X oder Y?» savollarini tuzatish.
