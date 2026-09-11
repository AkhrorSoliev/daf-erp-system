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
- **Xato javob navbat oxiriga QAYTMAYDI.** Boshqa formatlarda xato savol
  boshqa formatda qaytadi; bu yerda muqobil format yo'q, xuddi o'sha
  savolni qayta berish esa javobni eslatib qo'yadi. O'rniga — javobdan
  keyin ochiladigan matn.

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
      "falsch": ["in Usbekistan", "hier"]
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
   (`hilfswoerter.json` EMAS — u yerda atoqli otlar ham bor, «Nodira»
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
o'zgarish ham faqat QO'SHADI — mavjud qatorga tegmaydi.

---

## 6. Dvigatel

- Yangi format `HOEREN_WAHL`, yangi `itemType: 'HOERFRAGE'`.
- Quruvchi — `uebung/hoer-fragen.ts` (sof funksiya): kumulyativ puldan
  `audioKey` si bor va savoli bor dialog tanlanadi, savol tasodifiy,
  variantlar aralashtiriladi.
- **`audioKey` yo'q dialogdan savol qurilmaydi** (so'z audiosidagi kabi):
  ovoz yasalmaguncha format o'z-o'zidan o'chiq turadi.
- Audio manzili umumiy `mediaUrl` qoidasi bilan (`R2_PUBLIC_URL`
  sozlanmasa — savol qurilmaydi, xom kalit sizmaydi).
- Moyillik: `UNIT_TEST` seansida oldinga suriladi (`kind-formate.ts`);
  boshqa seanslarda ham chiqishi mumkin, lekin seansda ko'pi bilan 1 ta.
- `pruefen`: `richtigeAntwort` ga `HOEREN_WAHL` holati — `DafHoerFrage`
  dan `richtig` o'qiladi. Javobda qo'shimcha `transkript` (satrlar:
  gapiruvchi, `de`, `uz`) — FAQAT shu format uchun va FAQAT javobdan keyin.
- To'g'ri javob mijozga savol bilan birga **yuborilmaydi** (D6/D7).
- `/media` sahifasi: `VORSCHAU_BAUER` (`Record<FrageFormat, ...>`) yangi
  formatni majburan talab qiladi; mijozdagi `FrageFormat` parity testi ham.

---

## 7. Ovoz yasash

### 7.1 Ovozlar

`content/daf/a1/stimmen.json` — gapiruvchi ismi → ElevenLabs ovozi.
12 ism (u01: Jonas, Mia, Walter, Claudia, Markus, Doniyor, Anna, Sabine,
Peter, Helga; u02: Timur, Nodira). Jinsi va yoshiga qarab tanlanadi va
**butun kurs davomida o'zgarmaydi**. Ro'yxatda yo'q gapiruvchi uchun
skript to'xtaydi (jimgina «standart ovoz» qo'yilmaydi).

### 7.2 Skript

`npm run daf:gen-dialog-audio -- --dialog u02-d1` (bitta) yoki
`--unit 2` (unitning hammasi). `text-to-dialogue/eleven-v3`,
`language_code: "de"`, satr matni `tts ?? de`. Natija R2 ga
**tasodifiy kalit** bilan yuklanadi (so'z audiosidagi qoida).

### 7.3 Manifest va eskirishdan himoya

`content/daf/a1/dialog-audio.json`:

```json
{ "u02-d1": { "key": "daf/audio/9f3c….mp3", "textHash": "…" } }
```

`textHash` — satrlarning `sprecher` + `tts ?? de` dan hisoblangan xesh.
Dialog matni keyin tahrirlansa, qo'riqchi **yiqiladi**: «audio eski
matnni aytyapti». Aks holda o'quvchi bir narsani eshitib, javobdan
keyin boshqa narsani o'qirdi. Seed `audioKey` ni manifestdan oladi
(baza — muhit, manba emas).

### 7.4 Narx va ruxsat

`get_pricing` (2026-09-11): **$0.10 / 1000 belgi**. 12 dialog = 1 592
belgi = **≈ $0.16**; qayta yasash zaxirasi bilan ≤ $0.30.

1. **Bitta** dialog (≈ $0.01) → CEO eshitadi (namuna sahifasi).
2. Tasdiqlansa — qolgan 11 ta (≈ $0.15).

Har bosqichdan oldin narx qayta tekshiriladi va summa aytiladi.

---

## 8. Ish tartibi

| # | Bosqich | Darvoza |
| --- | --- | --- |
| 1 | Migratsiya + seed + qo'riqchi qoidalari | testlar |
| 2 | 24 savol matni (u01, u02) | qo'riqchi o'tadi |
| 3 | Dvigatel: quruvchi, tekshiruv, transkript | testlar |
| 4 | Mijoz: pleyer (0.8×), savol ekrani, javobdan keyin matn; `/media` | testlar |
| 5 | Ovoz skripti + 1 dialog namunasi | **CEO eshitadi** |
| 6 | Qolgan 11 dialog, prodga chiqarish (deploy → `daf:inhalt-seed`) | **CEO ruxsati** |

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
