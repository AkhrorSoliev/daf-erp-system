# DaF Faza 1b — kontent yig'ishni tugatish

**Sana:** 2026-08-26
**Holati:** Kelishildi, amalga oshirish kutilmoqda
**Qamrov:** DiB grammatikasi, talaffuzi va PDF'lari; `wort.schule` rasmlari;
adapter interfeysining haqiqatan yozilishi.
**Bog'liq:** [o'zak dizayni](2026-08-25-daf-learning-system-design.md),
[Faza 1 rejasi](../plans/2026-08-25-daf-content-harvest.md),
[ADR-0011](../../adr/0011-oquv-ozagi-standartga-boglanadi.md),
`server/src/daf-content/`

## 1. Kontekst

Faza 1 tugadi va `main`ga qo'shildi (PR #461). U DiB'dan lug'at (1 843),
video (263), transkript (198) va bob→grammatika bog'lanishini olib keldi.

**Olib kelmagani:** DiB'ning 70 grammatika sahifasi, 61 talaffuz mp3'i va
10 Kurs-Paket PDF'i. ZUM adapteri yozildi, lekin hech qayerdan chaqirilmaydi
va `AssetRef` umuman ishlab chiqarmaydi. Spec 4-bo'limidagi
`DafSourceAdapter` interfeysi esa **kodda hech qachon yozilmagan**, natijada
ikki adapter bir-biridan uzoqlashib ketgan (kesh kaliti, test qamrovi).

**Nega bu Faza 2 dan oldin.** Faza 2 ning o'zagi — Prisma `Daf*` modellari,
ya'ni ma'lumot modelini **qotirish**. Model faqat DiB ko'rinib turgan holatda
qurilsa, biz ADR-0011 da qochgan xatoni orqa eshikdan qaytargan bo'lamiz.
Grammatika sahifalari va rasmlar modelga yangi talab qo'yadi — ular model
loyihalanishidan oldin ko'rinishi kerak.

## 2. Qabul qilingan qarorlar

| # | Qaror | Sabab |
|---|---|---|
| R1 | **ZUM Faza 1b dan chiqariladi**, Faza 2 ga qoldiriladi | Uning rasm korpusi bizga yaramaydi (3-bo'lim), mashqlari esa H5P konvertatsiyasini talab qiladi — bu o'zicha katta ish |
| R2 | Rasm manbasi **`wort.schule`** bo'ladi, ZUM emas | CC0, nemis lug'ati uchun maxsus qurilgan, rasmlari **aynan Goethe uslubida**, 28 KB (ZUM'da 598 KB) |
| R3 | **Rasm korpusi qurilmaydi** — bepul mos keladiganlari olinadi, qolgani mashq yozilganda yasaladi | Bizga korpus emas, mashq talab qilgan rasm kerak. 1 843 yozuvdan faqat 625 tasi bitta so'z; iboraga rasm tushmaydi |
| R4 | Grammatika sahifalari **bosma (`pr/`) versiyadan** o'qiladi | Ikki barobar kichik va tozaroq: navigatsiya chrome'i yo'q |
| R5 | 980 mashq gapi olinadi, **javob kaliti bo'sh qoladi** | Javob tasdiqlanishi kerak, tasdiq holati esa baza tushunchasi. JSON'da yasab keyin ko'chirish — o'sha ishni ikki marta qilish (Faza 1 dagi tarjima bilan bir xil mantiq) |
| R6 | `DafSourceAdapter` interfeysi **endi haqiqatan yoziladi**, kesh klienti umumlashtiriladi | Spec 4-bo'limi buni talab qilgan, lekin kodda yo'q edi. Umumiy kesh kaliti sifatida ZUM'ning sha1 usuli olinadi — DiB'niki to'qnashuvi mumkin |
| R7 | `wort.schule` **uchinchi adapter** sifatida quriladi | Ikki adapter interfeysni sinamaydi — uchinchisi sinaydi |
| R8 | PDF'lar **faqat R2'ga qo'yiladi**, matni chiqarilmaydi | Matn chiqarish OCR va qo'l ishini talab qiladi; fayl o'zi hozircha yetarli |
| R9 | Grammatika dialoglari `GrammarPage` **ichida qoladi**, alohida `Transcript` bo'lmaydi | Ular sahifaning qismi, mustaqil material emas |

## 3. Rasm masalasi — izlanish natijasi

Bu bo'lim qaror uchun emas, **yozib qoldirish uchun**: xulosa qimmatga
tushdi va keyin qayta izlanmasin.

**Goethe me'yori aniqlandi.** A2 Modellsatz PDF'idan rasmlar chiqarib
ko'rildi: ular **fotosurat emas**, balki **tekis chiziqli tasvir** — qora
kontur, tekis rang to'ldirish, sodda fon, bitta ikkilanishsiz ma'no.
O'lchami ~580–650 px. Bu tasodifiy uslub emas: imtihonda o'quvchi rasmni
shubhasiz tanishi kerak, aks holda topshiriq tilni emas, taxminni sinaydi.

**ZUM rasm manbasi sifatida yaramaydi.** 500 ta namuna ko'rildi — asosan
uyushma tadbirlarining suratlari, grammatika jadvallari va logotiplar.
O'rtacha 598 KB, 5 077 tasi ≈ 2.9 GB. ZUM mashqlaridagi lug'at tasvirlari
esa ZUM'niki emas: H5P metama'lumotida ularning manbasi `wort.schule`.

**`wort.schule` mos keladi.** CC0 — mualliflik ham talab qilinmaydi.
Har so'z uchun JSON endpointi bor (`/<so'z>.json`) va u rasm ustiga
`word_type`, `syllables`, `comparative`/`superlative`, `synonyms`,
`opposites`, `topics` ni ham beradi — bularning hammasi `DafLexeme` ga
kerak. Rasm 500×374, ~28 KB.

**Qamrov cheklangan.** O'lchandi: keng tarqalgan aniq so'zlarda **~56%**
(16 tadan 9), tasodifiy namunada ancha past. Ya'ni bu to'liq yechim emas,
lekin bepul va toza asos.

**Generatsiya haqida.** `fal-ai` MCP serveri sozlangan va sog'lom
(`claude mcp list` tasdiqlaydi). U **Faza 3/4 da** — mashq yozilayotganda,
aniq qaysi rasm kerakligi ma'lum bo'lganda ishlatiladi. Faza 1b da emas.

Sabab: imtihon rasmida noaniqlik topshiriqni buzadi, shuning uchun har bir
yasalgan rasm **odam ko'rigidan o'tishi shart** — xuddi tarjima kabi. Bu uni
mashq yozish jarayoniga bog'laydi. Oldindan korpus yasash esa ko'rilmagan
rasmlar uyumini tug'diradi.

## 4. Ma'lumot shakli

Mavjud `DafDataset` ga uchta to'plam qo'shiladi va `Lexeme` boyitiladi.

```
GrammarPage
  code            'vi_05'                    — Grimm Grammar sahifa kodi
  titleDe         'Haben'
  titleEn         'haben'
  level           CefrLevel                  — GRAMMAR_LEVEL xaritasidan
  explanation     string                     — inglizcha tushuntirish
  dialogue        DialogueLine[]
  audio           AssetRef[]                 — sahifada 4 ta
  exercises       GapExercise[]              — sahifada 14 ta

DialogueLine
  speaker         'Rotkäppchens Mutter'
  de              'Liebling, was hast du im Korb?'
  en              'Darling, what do you have in the basket?'

GapExercise
  id              'vi_05_01_fib_1'
  sentenceDe      'Schneewittchen ___ eine neue Karriere.'
  answer          null                       — R5: Faza 1b da BO'SH
  answerStatus    'MISSING'
  grammarCode     'vi_05'

PhoneticsItem
  id              'pho_01_01_abc'
  chapter         1
  titleDe/titleEn
  audio           AssetRef
```

`Lexeme` ga qo'shiladi (hammasi ixtiyoriy — `wort.schule` da yo'q so'zlar bor):

```
  image?          AssetRef                   — CC0
  syllables?      string
  comparative?    string
  superlative?    string
  synonyms?       string[]
  opposites?      string[]
  wsTopics?       string[]                   — wort.schule mavzulari
```

**Litsenziya aralashmasi.** Datasetda endi ikki litsenziya bo'ladi: DiB
CC BY 4.0, `wort.schule` CC0. `AssetRef` buni har aktiv darajasida ushlab
turadi, shuning uchun aralashib ketmaydi — lekin `DafDataset.license`
endi butun datasetni ta'riflamaydi va shuni hisobga olish kerak.

## 5. Adapter interfeysi

Spec 4-bo'limidagi kontrakt endi kodga tushadi:

```ts
interface DafSourceAdapter<Raw> {
  readonly source: SourceId;
  harvest(): AsyncIterable<Raw>;          // tarmoq faqat shu yerda
  map(raw: Raw): MappedUnit;              // sof funksiya, testlanadi
  assets(raw: Raw): AssetRef[];           // R2'ga ketadigan fayllar
}
```

Kesh klienti umumlashtiriladi: bitta `CachedHttpClient`, kalit sha1'dan
(ZUM usuli). DiB'ning hozirgi kaliti `/ ? &` ni bir xil `_` ga aylantiradi va
mavjud `_` ni ekranlamaydi — to'qnashuvi mumkin. Bu Faza 1 da kechiktirilgan
minor edi, shu yerda yopiladi.

Uch adapter shu interfeysga quriladi: `dib`, `wort-schule`, va `zum`
(mavjudi interfeysga keltiriladi, lekin **chaqirilmaydi** — R1).

## 6. Ma'lumot oqimi

```
  DiB (pr/*.html, pho.php, pdfs/*)      wort.schule (/<so'z>.json)
            │                                    │
            └──────────────┬─────────────────────┘
                           ▼
                 adapter.harvest() / map()        ← kesh, sof funksiya
                           ▼
              server/content/daf/dib.json  (kengaytirilgan)
                           │
                           └──► media-manifest.json ──► R2
```

Faza 1 dagi bilan bir xil tamoyil: yig'ish so'rov paytida hech qachon
bajarilmaydi; dataset git'da ko'riladi; media R2'da.

## 7. Nima QILINMAYDI

- **ZUM yig'ish** — R1. Adapteri interfeysga keltiriladi, lekin ishlatilmaydi.
- **Rasm generatsiyasi** — R3. `fal-ai` Faza 3/4 da.
- **PDF matnini chiqarish** — R8.
- **Javob kalitlari** — R5. Gaplar saqlanadi, kalit Faza 2/3 da.
- **O'zbekcha tarjima** — Faza 2 (o'zak spec 6-bo'limi).
- **`wort.schule` ning butun korpusini yig'ish** — faqat bizning
  leksemalarga mos keladiganlari.

## 8. Xavflar

| Xavf | Ta'sir | Yumshatish |
|---|---|---|
| `wort.schule` qamrovi kutilganidan past chiqishi | Rasmli mashqlar uchun asos kichik bo'ladi | O'lchandi: keng tarqalgan so'zlarda ~56%. Qolgani generatsiyaga qoladi (Faza 3/4), ya'ni bo'shliq rejalashtirilgan |
| Grammatika sahifalarining markupi bir xil emasligi | Parser ba'zi sahifada bo'sh qaytaradi | Faza 1 saboqi: yig'ish skripti sahifa sonini tekshiradi va 70 dan sezilarli kam chiqsa nolga teng bo'lmagan kod bilan tugaydi |
| Mashq gaplarining `___` joyi noaniq bo'lishi | Kalit to'ldirishda chalkashlik | `<input name="fib_N">` gapdagi aniq o'rinni beradi — joy markupdan olinadi, taxmin qilinmaydi |
| Ikki litsenziya aralashuvi | Atribut noto'g'ri chiqishi | Har `AssetRef` o'z litsenziyasini olib yuradi; `DafDataset.license` endi umumiy da'vo emas, shu spec'da yozildi |
| PDF'lar 91 MB qo'shishi | R2 hajmi o'sadi | Jami ~1.5 GB bo'ladi, bepul limitning 15% i. Xavf yo'q |

## 9. Ochiq qolgan savollar

1. **`wort.schule` bilan moslash qoidasi.** Bizning leksemalar artikl bilan
   keladi (`der Tisch`), `wort.schule` esa lemma bilan. Artiklni olib tashlash
   yetadimi, yoki ko'plik va qo'shma so'zlar uchun qo'shimcha qoida kerakmi —
   amalga oshirishda o'lchanadi.
2. **Mashq gapidagi javob kaliti kim tomonidan to'ldiriladi.** Faza 2/3 da
   hal qilinadi; hozir `answerStatus: 'MISSING'` bilan saqlanadi.
3. **Grammatika sahifalarining `zip/` arxivlari** (PDF + mp3, ~800 KB × 70)
   olinmaydi — audio alohida olinadi. Agar bosma PDF kerak bo'lsa, keyin.
