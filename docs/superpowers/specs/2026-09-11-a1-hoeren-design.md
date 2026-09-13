# A1 — eshitish mashqi (`HOEREN_WAHL`) — dizayn

**Sana:** 2026-09-11
**Bog'liq:** [A1 kurs dizayni](2026-09-03-a1-kurs-design.md) §4, §8, §9,
[1-unit ovozi va rasmi](2026-09-08-a1-ovoz-va-rasm-design.md),
[mashq ekrani](2026-09-05-lernen-ekrani-design.md)

---

## 1. Muammo

Goethe A1 imtihonining to'rt qismidan biri — **Hören**. Bizda eshitish
faqat alohida so'z darajasida bor (`AUDIO_WORT`, `WORT_TIPPEN`, faqat
1-unitda). O'quvchi hech qachon **nemischa suhbatni** eshitmaydi va uni
tushunganini ko'rsatmaydi. Dialoglar (1 va 2-unitda 12 ta) faqat o'qish
materiali bo'lib turibdi.

## 2. Qarorlar (CEO bilan kelishilgan, 2026-09-11)

| # | Savol | Qaror | Nega |
| --- | --- | --- | --- |
| Q1 | Eshitgandan keyin nima so'raladi? | **Tushunish savoli** («Ayolning ismi nima?») | Goethe aynan shuni tekshiradi. «Qaysi gapni eshitding?» faqat tanishni tekshiradi |
| Q2 | Jadval mashqi (`HOEREN_TABELLE`) ham hozirmi? | **Keyinroq** | Yangi ekran turi; ovoz tanlovi haqiqiy mashqda tasdiqlanmasdan qurilsa, ovoz yoqmaganda ikkalasi ham qayta ishlanadi |
| Q3 | Sekin eshitish qanday? | **Pleyerda 0.8× tugmasi** | `text-to-dialogue/eleven-v3` da tezlik parametri yo'q. Audio tabiiy tezlikda (imtihondagidek), tanlov o'quvchida, pul ketmaydi |
| Q4 | Savollar qayerda saqlanadi? | **Dialog faylining ichida** | Savol o'z suhbatisiz ma'nosiz; bittasi o'zgarsa ikkinchisi ko'z oldida |
| Q5 | Ovoz qanday tasdiqlanadi? | **Avval 1 dialog, CEO eshitadi, keyin 11 tasi** | Xato ovoz bilan 12 dialog yasash — 12 barobar qayta ish |

---

## 3. O'quvchi nimani ko'radi

```
┌─────────────────────────────────┐
│  Suhbatni tinglang              │
│                                 │
│   ▶  ━━━━━━●──────  0:18 / 0:42 │
│      [ 1× ]  [ 🐢 0.8× ]        │
│                                 │
│  Wo wohnen die Eltern?          │
│  (Ota-onasi qayerda yashaydi?)  │
│                                 │
│   ○ in Usbekistan               │
│   ○ in Deutschland              │
│   ○ hier                        │
│                                 │
│         [ Tekshirish ]          │
└─────────────────────────────────┘
```

- **Suhbat matni savol paytida KO'RSATILMAYDI** — aks holda bu o'qish
  mashqi bo'lib qoladi. Javobdan keyin matn (gapiruvchi ismi bilan,
  o'zbekcha tarjimasi bilan) ochiladi: o'quvchi nimani eshitmaganini
  ko'radi. Bu mashqning asosiy o'rganish lahzasi.
- Savol **nemischa**, tagida o'zbekcha tarjima. Savol va variantlardagi
  har so'z shu bo'limgacha o'rgatilgan (progressiya qoidasi).
- **3 variant, bittasi to'g'ri.** Chalg'ituvchilarni odam yozadi va
  ularning har biri suhbatdan aniq kelib chiqib xato — to'g'ri javob
  hech qachon jazolanmaydi.
- **To'liq pleyer:** o'ynatish/pauza, vaqt chizig'i, `1×` / `0.8×`.
  Mavjud `OvozTugmasi` bir soniyalik so'z uchun qurilgan («TO'LIQ PLEYER
  EMAS») — suhbat uchun yangi komponent kerak.
- Cheksiz qayta eshitish. Avtomatik boshlanadi (o'quvchi seansni tugma
  bosib ochgan, brauzer ruxsat beradi; bermasa — tugma qoladi).
- **Ball bermaydi** — ball faqat so'zga (mavjud qoida, `punkte.ts`).
- **Seansda ko'pi bilan 1 ta** eshitish savoli: har biri 30–60 soniya.
- **Xato javob navbat oxiriga QAYTMAYDI — va buning uchun yangi kod
  yozilmaydi.** Mijoz birinchi xatoda serverdan boshqa formatdagi
  almashtiruvchi savol so'raydi (`ersatz`); server o'sha
  `itemType:itemId` ni boshqa formatda topolmasa `null` qaytaradi va
  mijoz savolni tugatilgan hisoblaydi (`seans-navbat.ts`, `ersatzKeldi`).
  Eshitish savolining boshqa formati yo'q — demak xatti-harakat mavjud
  yo'ldan o'zi kelib chiqadi. Test shu `null` yo'lini eshitish savoli
  uchun ham tasdiqlaydi. O'rniga o'quvchi javobdan keyin ochiladigan
  matnni ko'radi.

---

## 4. Kontent

### 4.1 Fayl shakli

Savollar `uNN/dialoge.json` dagi har dialogning ichida:

```json
{
  "id": "u02-d2",
  "section": "u02-s1",
  "titelDe": "Meine Schwester",
  "titelUz": "Mening opam",
  "zeilen": [ ... ],
  "fragen": [
    {
      "frageDe": "Wo wohnen die Eltern?",
      "frageUz": "Ota-onasi qayerda yashaydi?",
      "richtig": "in Deutschland",
      "falsch": ["in Usbekistan", "in Usbekistan und in Deutschland"]
    }
  ]
}
```

Barqaror kalit — `u02-d2-f1` (dialog kaliti + tartib raqami), seed shu
bo'yicha yangilaydi.

### 4.2 Qo'riqchi qoidalari (`unit-inhalt.file.spec.ts`)

1. Har dialogda **aniq 2** savol.
2. Har savolda 3 variant, `normalisieren` bo'yicha **hammasi har xil**
   (to'g'ri javob chalg'ituvchilar orasida takrorlanmaydi).
3. `frageDe`, `richtig`, `falsch` dagi har so'z shu bo'limgacha tanish —
   gap va dialog bilan **bir xil** `progression.ts` funksiyasi.
4. `frageUz` bo'sh emas va lotin alifbosida.
5. **To'g'ri javob suhbatda aytilgan bo'lishi kerak** — buni mashina
   to'liq tekshira olmaydi (ma'no), shuning uchun odam ko'radi (`/media`).
   Mashina faqat eng qo'pol holatni ushlaydi: `richtig` ning kamida
   bitta so'zi suhbat satrlarida (`normalisieren` bo'yicha) uchrashi
   SHART. Hisobga olinmaydigan so'zlar — artikl, shaxs olmoshi, `sein`
   shakllari va bog'lovchilar: ular kodda yopiq kichik ro'yxat
   (`hilfswoerter.json` EMAS — u yerda atoqli otlar ham bor, «Lena»
   esa aynan tekshirilishi kerak bo'lgan javob). Bu «suhbatda umuman
   yo'q narsani so'rash»ni to'xtatadi. `richtig` faqat shunday
   so'zlardan iborat bo'lsa (masalan `ja`), qoida qo'llanmaydi — faqat
   odam ko'rigi qoladi.

### 4.3 Hajm

1 va 2-unitning 12 dialogi × 2 = **24 savol**, hammasi qo'lda.

---

## 5. Ma'lumot modeli

| Jadval | O'zgarish | Nega |
| --- | --- | --- |
| `DafDialog` | `audioKey String?` qo'shiladi | Model butun suhbatni **bitta** fayl qilib beradi, satrma-satr vaqt belgisi yo'q |
| `DafHoerFrage` | **yangi**: `id`, `code @unique`, `dialogId`, `order`, `frageDe`, `frageUz`, `richtig`, `falsch String[]` | Javob tekshiruvi materialni `itemType`+`itemId` bo'yicha o'qiydi (D7) — savolga o'z `id` si kerak |

`DafDialogLine.audioKey` (satr darajasida, bugun ishlatilmaydi) tegilmaydi.

Migratsiya `prisma migrate dev` bilan emas — bu yerda u ishlamaydi;
`migrate diff` + `db execute` + `migrate resolve` tartibida. Ikkala
o'zgarish ham faqat QO'SHADI — mavjud qatorga tegmaydi. Prodga
migratsiya fayli commit bilan boradi va `start:prod` uni o'zi qo'llaydi
(`prisma migrate deploy`); undan keyin seed.

### 5.1 Seed (`inhalt-seed.service.ts`) — uchta o'zgarish

1. **Dialog upsert `audioKey` ni manifestdan yozadi** — har safar,
   `create` da ham, `update` da ham. Manifestda yozuv bo'lmasa `null`
   yoziladi: manifest — yagona manba, baza — muhit. Bugungi upsert
   `audioKey` ga umuman tegmaydi, ya'ni manifest → baza yo'li YO'Q.
2. **Fayldan yo'qolgan dialogni o'chirishda avval uning savollari
   o'chiriladi**, keyin satrlari, keyin o'zi — `DafHoerFrage` ham satr
   kabi `ON DELETE RESTRICT` FK bilan bog'lanadi. Bu bosqich yozilmasa
   seed «faqat qo'shadi» degan gapga qaramay YIQILADI.
3. Savollar `code` bo'yicha upsert; faylda endi yo'q tartib raqamlari
   (`order > fragen.length`) satrlardagi qoida bilan o'chiriladi.

---

## 6. Dvigatel

- Yangi format `HOEREN_WAHL`, yangi `itemType: 'HOERFRAGE'`.
- **`itemType` ro'yxati kompilyator qo'riqlaydigan shaklga o'tadi.**
  Formatlar `Record<FrageFormat, true>` bilan majburlangan, `itemType`
  esa `CheckAntwortDto` va `ErsatzDto` da QO'LDA yozilgan massiv
  (`@IsIn(['WORT', 'SATZ', 'PHRASE', 'DIALOGZEILE'])`). Unutilsa har
  eshitish javobi 400 bilan qaytadi — aynan `AUDIO_WORT` bilan bo'lgan
  xato. `ItemType` alohida tipga chiqariladi va `Record<ItemType, true>`
  dan massiv hosil qilinadi; `PruefenInput`, `ersatz()`, `ladeMaterial`
  va mijozdagi `MaterialTyp` shu tipdan yuradi.
- Quruvchi — `uebung/hoer-fragen.ts` (sof funksiya): kumulyativ puldan
  `audioKey` si bor va savoli bor dialog tanlanadi, savol tasodifiy,
  variantlar aralashtiriladi. `MaterialDialog` ga `audioKey` va
  `fragen` qo'shiladi.
- **`PublicFrage` ga yangi maydon kerak EMAS:** `frageUz` → `hilfe`
  (izohida allaqachon «o'zbekcha tarjima» deyilgan), audio →
  `audioUrl`, `prompt` → `frageDe`. **`titel` yuborilmaydi** (yakuniy
  ko'rik, 2026-09-13): dialog nomi 24 savoldan 5 tasida javobni ochib
  beradi («Zwei Kinder» → «zwei Kinder», «Null bis elf» → «elf»), mijoz
  esa bu formatda uni ko'rsatmaydi — natija ekrani `prompt` ni oladi.
- **Bir suhbat bir seansda ikki marta chiqmaydi.** Eshitish savolining
  `belegteItems` i suhbatning HAMMA satrini (`DIALOGZEILE:id`) band
  qiladi. `DIALOG_LUECKE` ham shunday qilishga o'tadi — bugun u faqat
  olib tashlangan satrni band qiladi (`dialog-fragen.ts`), ya'ni
  (a) eshitish savoli bilan o'sha suhbatning matnli savoli bitta
  seansga tushib, o'quvchi avval matnni O'QIB, keyin «eshitib» javob
  berishi mumkin edi; (b) allaqachon mavjud teshik: bitta suhbatning
  ikki xil bo'sh joyi bir seansda chiqsa, ikkinchisi birinchisining
  javobini ko'rsatib turadi. Seans quruvchisining 4-qoidasi
  (`belegteItems` kesishmasin) ikkalasini bir yo'la yopadi.
- **Seansda ko'pi bilan 1 ta:** `seans.ts` ga format bo'yicha chegara
  (`FORMAT_MAX_PRO_SEANS` umumiy 3 bo'lib qoladi, `HOEREN_WAHL: 1`
  ustidan yoziladi), testi bilan.
- **`audioKey` yo'q dialogdan savol qurilmaydi** (so'z audiosidagi kabi):
  ovoz yasalmaguncha format o'z-o'zidan o'chiq turadi.
- Audio manzili umumiy `mediaUrl` qoidasi bilan (`R2_PUBLIC_URL`
  sozlanmasa — savol qurilmaydi, xom kalit sizmaydi).
- Moyillik: `UNIT_TEST` seansida oldinga suriladi (`kind-formate.ts`).
  **Hozircha uxlab turadi** (yakuniy ko'rik, 2026-09-13): `UNIT_TEST`
  darsi bo'limsiz seed qilinadi, dvigatel bo'limsiz darsga savol
  qurmaydi va mijoz eski dars sahifasiga tushadi — bu shoxdan oldin bor
  holat. Moyillik qat'iy bo'linish emas, shuning uchun eshitish savoli
  amalda `SECTION_A` / `SECTION_B` / `BRIDGE` seanslarida chiqadi (u01-s1
  va u02-s1 da taxminan har ikkinchi seansda). Yakuniy sinovni dvigatelga
  ulash — alohida ish.
- `pruefen`: `richtigeAntwort` ga `HOEREN_WAHL` holati — `DafHoerFrage`
  dan `richtig` o'qiladi (`akzeptiert` bo'sh — variantlar aynan).
  `PruefenErgebnis` ga ixtiyoriy `transkript` (satrlar: gapiruvchi,
  `de`, `uz`) qo'shiladi — FAQAT shu formatda to'ldiriladi, mijozdagi
  `PruefErgebnis` tipi ham. Ball yo'q, Leitner yo'q: `betroffeneWoerter`
  bo'sh (`itemType !== 'WORT'`), mavjud qoida.
- To'g'ri javob mijozga savol bilan birga **yuborilmaydi** (D6/D7).
- `/media` sahifasi: `VORSCHAU_BAUER` (`Record<FrageFormat, ...>`) yangi
  formatni majburan talab qiladi; mijozdagi `FrageFormat` parity testi
  ham. Material ro'yxatida (`inhalt`) har dialog o'z karnay tugmasi va
  savollari (javobi bilan) bilan ko'rinadi — CEO ovozni va savolni
  shu yerda ko'rib chiqadi.

---

## 7. Ovoz yasash

### 7.1 Ovozlar

`content/daf/a1/stimmen.json` — gapiruvchi ismi → ElevenLabs ovozi.
12 ism (u01: Jonas, Mia, Walter, Claudia, Markus, Lukas, Anna, Sabine,
Peter, Helga; u02: Thomas, Lena). **Ismlar doim nemischa** (CEO qarori,
2026-09-12): namunani eshitgach Doniyor→Lukas, Timur→Thomas,
Nodira→Lena, Karimova→Neumann almashtirildi. Ovozni CEO eshitib
tanlaydi (Anna — Matilda, Jonas — Liam; Aria «tabiiy emas» deb rad
etildi). Jinsi va yoshiga qarab tanlanadi va
**butun kurs davomida o'zgarmaydi**. Ro'yxatda yo'q gapiruvchi uchun
skript to'xtaydi (jimgina «standart ovoz» qo'yilmaydi).

### 7.2 Skript

`npm run daf:gen-dialog-audio -- --dialog u02-d2` (bitta) yoki
`--unit 2` (unitning hammasi). `text-to-dialogue/eleven-v3`,
`language_code: "de"`, `stability: 0.5` (sinovdan keyin O'ZGARMAYDI —
aks holda 12 dialog bir-biridan farq qilib eshitiladi), satr matni
`tts ?? de`. Natija R2 ga **tasodifiy kalit** bilan yuklanadi (so'z
audiosidagi qoida). Skript qisman yiqilsa R2 da yetim fayl qolishi
mumkin — so'z audiosidagi ochiq qarz, bu yerda ham shunday; manifestga
faqat muvaffaqiyatli yuklangan kalit yoziladi.

**Namuna dialogi — `u02-d2`** («Meine Schwester»). Rejada o'zbek
ismlarining talaffuzini sinash kerak edi; namuna o'rniga ikki qarorga olib
keldi: ismlar nemischa bo'ldi (7.1) va ayol ovozlari qayta tanlandi.
To'liq 12 suhbatni eshitgach yana ikkitasi: (1) harflab aytish
(`u01-d6`) satrda haqiqiy harflar bilan yoziladi, talaffuzi `tts` da
(«Weh. Eh. Beh. Eh. Err.»); (2) har faylning boshiga 0.7 s va oxiriga
1 s jimlik qo'shiladi (`audio-polster.ts`, ffmpeg) — aks holda nutq
birinchi soniyadayoq boshlanib, oxiri uzilib qolardi. Namunalar `/media`
da va CEO uchun alohida eshitish sahifasida eshitildi.

### 7.3 Manifest va eskirishdan himoya

`content/daf/a1/dialog-audio.json`:

```json
{ "u02-d2": { "key": "daf/audio/9f3c….mp3", "textHash": "…", "polster": "700/1000" } }
```

`textHash` — satrlarning `sprecher` + `tts ?? de` dan hisoblangan xesh.
Dialog matni keyin tahrirlansa, qo'riqchi **yiqiladi**: «audio eski
matnni aytyapti». Aks holda o'quvchi bir narsani eshitib, javobdan
keyin boshqa narsani o'qirdi. Seed `audioKey` ni manifestdan oladi
(baza — muhit, manba emas).

### 7.4 Narx va ruxsat

`get_pricing` (2026-09-11): **$0.10 / 1000 belgi**. 12 dialog = 1 592
belgi = **≈ $0.16**; qayta yasash zaxirasi bilan ≤ $0.30.

1. **Bitta** dialog (`u02-d2`, ≈ $0.01) → CEO `/media` da eshitadi.
2. Tasdiqlansa — qolgan 11 ta (≈ $0.15).

Amalda (2026-09-12): namuna $0.015 + uch ayol ovozi taqqoslash $0.044 +
yangi ovozlar bilan 12 dialog $0.159 + `u01-d6` qayta yozish $0.013 ≈
**$0.23**. Jimlik mavjud fayllarga bepul (ffmpeg) qo'shildi.

Har bosqichdan oldin narx qayta tekshiriladi va summa aytiladi.

---

## 8. Ish tartibi

| # | Bosqich | Darvoza |
| --- | --- | --- |
| 1 | Migratsiya + seed + qo'riqchi qoidalari | testlar |
| 2 | 24 savol matni (u01, u02) | qo'riqchi o'tadi |
| 3 | Dvigatel: quruvchi, tekshiruv, transkript | testlar |
| 4 | Mijoz: pleyer (0.8×), savol ekrani, javobdan keyin matn; `/media` da dialog karnayi va savollar | testlar |
| 5 | Ovoz skripti + 1 dialog namunasi | **CEO eshitadi** |
| 6 | Qolgan 11 dialog, prodga chiqarish (deploy → migratsiya o'zi qo'llanadi → `daf:inhalt-seed` u01 va u02) | **CEO ruxsati** |

## 9. Bu bosqichda QILINMAYDI

`HOEREN_TABELLE` · gap audiosi · 3–12 unit · telefon ilovasi ·
satr darajasidagi audio (`DafDialogLine.audioKey`) · eshitish uchun ball.

## 10. Xavflar

| Xavf | Yopilishi |
| --- | --- |
| Savolga suhbatda javob yo'q | 4.2-qoida 5 (qo'pol tekshiruv) + `/media` da odam ko'rigi |
| Matn o'zgarib, audio eskirib qoladi | `textHash` qo'riqchisi |
| Gapiruvchiga ovoz biriktirilmagan | skript to'xtaydi |
| Ovoz yoqmaydi | 1 dialogdan keyin to'xtash darvozasi |
| Seans uzayib ketadi | seansda ko'pi bilan 1 ta eshitish savoli |
| Javob brauzerga sizadi | javob faqat serverda; matn faqat javobdan keyin; kalit tasodifiy |
| O'quvchi suhbat matnini o'sha seansda o'qib bo'lgan | ikkala dialog formati suhbatning hamma satrini band qiladi |
| TTS o'zbek ismini xato o'qiydi | namuna dialogida ism bor; yechim satrning `tts` maydoni |
| `itemType` DTO'da unutiladi (har javob 400) | `Record<ItemType, true>` — kompilyator yiqitadi |
| Seed yangi jadval tufayli yiqiladi | fayldan yo'qolgan dialogning savollari satrlaridan OLDIN o'chiriladi |
