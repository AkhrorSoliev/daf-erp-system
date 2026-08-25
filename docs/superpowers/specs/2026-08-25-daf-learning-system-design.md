# DaF Learning System — o'zak dizayni

**Sana:** 2026-08-25
**Holati:** Kelishildi, amalga oshirish kutilmoqda
**Qamrov:** o'zak ma'lumot modeli, mashq taksonomiyasi, manba adapteri kontrakti.
UI va mashq dvigatelining ichki qurilishi **alohida spec**larga chiqariladi.
**Bog'liq:** [ADR-0009](../../adr/0009-deutsch-tutor-olib-tashlandi.md),
[ADR-0010](../../adr/0010-videothek-daraja-pleylistdan.md),
[Videothek dizayni](2026-08-24-videothek-design.md),
`server/prisma/schema.prisma`, `client/src/components/student-portal/`,
`daf-design-system/components/learning/`

## 1. Kontekst

O'quvchi portalida hozir ikkita nemis tili materiali bor va **ikkalasi ham
iste'mol qilinadi, ishlanmaydi**: Radio (26 efir) va Videothek (900+ YouTube
video). O'quvchi ko'radi va tinglaydi, lekin hech narsa yechmaydi, hech narsa
topshirmaydi va tizim uning nimani bilganini bilmaydi.

Talab: portalga **haqiqiy o'quv dasturi** qo'shish — Goethe imtihoniga
yo'naltirilgan, mashqli, progress hisoblanadigan.

Ikkita mavjud ADR kontekst beradi, lekin **ikkalasi ham bu ishni
chegaralamaydi**.

**ADR-0009 (Deutsch Tutor).** `/portal/ai` qatlami olib tashlangan edi —
maqsad uni keyinroq **noldan, kuchliroq qilib qayta qurish**. ADR'ning o'zi
shuni yozgan: «xususiyat kelajakda boshqa strukturada, noldan quriladi va o'z
ma'lumot modelini o'zi olib keladi». Bu dizayn aynan o'sha qayta qurishning
uyasi (3.6 va 6-bo'lim). Eski `AiConversation` / `AiChatMessage` shakli
tiklanmaydi — o'sha taqiq kuchida.

**ADR-0010 (Videothek).** YouTube katalogi sinov sifatida qurilgan va
kelajakda butunlay olib tashlanishi mumkin. Undagi transkript va media saqlash
bo'yicha taqiqlar **YouTube manbasiga tegishli** — sababi ToS va subtitr
matnining yo'qligi. Bu dizaynning manbalari boshqa: DiB CC BY 4.0 litsenziyali,
268 transkripti tayyor, darajasi bob tartibidan aniqlanadi. Shuning uchun o'sha
taqiqlar bu yerga ko'chirilmaydi.

### 1.1 Mavjud media bo'limi bilan munosabat

Radio (passiv fon) o'z holicha qoladi. Videothek — sinov; bu modul jonli
kontent bilan to'lgach, uning o'rnini bosishi yoki butunlay olib tashlanishi
mumkin. Bu qaror **shu spec doirasida qabul qilinmaydi** — Faza 2 da kontent
haqiqiy hajmda ko'ringanda ko'riladi.

### 1.2 Manbalar

Ikkalasining ham litsenziyasi tekshirildi — **ikkalasi ham CC BY 4.0**,
ShareAlike sharti yo'q, tijorat va o'zgartirish ochiq.

| Manba | Nima beradi | Hajm | Litsenziya |
|---|---|---|---|
| **Deutsch im Blick** (UT Austin / COERLL) | 268 video + DE/EN transkript, 1 948 lug'at + 94 mp3, 70 grammatika sahifasi, 61 talaffuz mp3, 10 PDF | ≈1.36 GB media | CC BY 4.0 ✔ |
| **ZUM Deutsch Lernen** (MediaWiki) | 759 H5P mashq, 5 077 rasm (ko'pi CC0), A1/A2/B1 toifalari, Handlungsfelder, o'qish strategiyalari | matn + rasm | CC BY 4.0 ✔ |
| Wikinews DE | gazeta matnlari (A2/B1 `Lesen` uchun) | 14 240 maqola | CC BY 2.5 ✔ |
| Wiktionary DE | artikl, ko'plik, IPA | — | CC BY-SA |
| Netzwerk neu (Klett) | **faqat struktura o'lchovi** | — | © barcha huquqlar himoyalangan |

Qamrov bahosi *(o'lchov emas, baholash)*: A1 ≈ 80%, A2 ≈ 65%, B1 ≈ 30%.

## 2. Qabul qilingan qarorlar

| # | Qaror | Sabab |
|---|---|---|
| Q1 | O'zak **Goethe/GER standartiga** quriladi, manbaga emas. Har manba **adapter** orqali o'zakka moslashtiriladi | Kitob-markazli model yangi manba qo'shilganda sxemani buzadi. Standart o'zak: «DiB bo'yicha o'qish» — shunchaki bitta yo'nalish, «mavzu bo'yicha mashq» — shunchaki rejim |
| Q2 | **Formula:** har kontent va mashq `Daraja + Ko'nikma + Mavzu + CanDo` bilan belgilanadi va `Wortschatz / Grammatik / Redemittel` uchligidan kamida bittasiga bog'lanadi | Netzwerk'ning o'zagi — shu uchlikni bog'lash (*Vernetzung*). Bog'lanmagan kontent qidiruvda ham, progressda ham ishtirok eta olmaydi |
| Q3 | Mashq turlari **ikki qatlam**: `PRUEFUNG` (imtihon formati) va `UEBUNG` (unga olib boradigan mashg'ulot). Uchinchi xili yo'q | Siz belgilagan tamoyil: fokus imtihonda. Hech qaysi imtihon formatiga xizmat qilmagan mashq tizimga kirmaydi |
| Q4 | `CanDo` **ikki pog'onali**: GER deskriptori (ota) → o'rgatiladigan mayda qadam (bola) | Darsliklar GER deskriptorini maydalaydi. Ikki pog'ona bo'lsa, Netzwerk ma'lumoti kelganda tayyor uyaga tushadi, qayta qurilmaydi |
| Q5 | **`Redemittel` — birinchi darajali entity**, `Lexeme` va `GrammarPoint` bilan teng | Funksional ibora na so'z, na grammatika. `SPEAK_CARD` va `WRITE_GUIDED` to'g'ridan-to'g'ri shunga tayanadi |
| Q6 | **Media → Cloudflare R2**, kontent va progress → mavjud Postgres/NestJS. Workers/D1 ishlatilmaydi | R2 bepul limiti 10 GB, egress bepul — bizga 1.36 GB kerak (14%). Progressni D1'ga olsak, bitta o'quvchining holati ikki bazaga bo'linadi va hech qachon mos turmaydi |
| Q7 | Daraja **deterministik** aniqlanadi: bob tartibi + bobga biriktirilgan grammatika. Leksik profil faqat **chetga chiqqanni belgilaydi**, qaror qilmaydi | Qayta ishlab chiqsa bir xil natija beradi va tushuntirib bo'ladi. Sof LLM taxmini takrorlanmaydi va himoya qilinmaydi |
| Q8 | Kontent — **o'zgarmas seed** (manbadan quyiladi), o'quvchi ma'lumoti undan **butunlay ajratilgan** | Manbani qayta yig'ish o'quvchining progressini yo'q qilmasligi kerak |
| Q9 | Atribut **majburiy va avtomatik**: har aktiv o'z litsenziyasi, muallifi va manbasini olib yuradi | CC BY huquqiy majburiyat. H5P metama'lumoti buni har element uchun allaqachon yozib qo'ygan — quvurga kiritiladi, keyinga qoldirilmaydi |
| Q10 | Modul **kontent bo'lmasa menyuda ko'rinmaydi** | R2 sozlanmagan yoki seed quyilmagan bo'lsa, o'quvchi bosadigan-u javob olmaydigan tugma ko'rmasligi kerak. Videothek'da ham shu naqsh: katalog bo'sh bo'lsa tab chiqmaydi |
| Q11 | Netzwerk/Klett va boshqa tijorat darsliklari — **faqat struktura o'lchovi**, kontent ko'chirilmaydi | Format mualliflik huquqi bilan himoyalanmaydi, aniq matn himoyalanadi |
| Q12 | `B1` tizimda mavjud, lekin **bo'sh**. Modul halol **«A1–A2»** deb chiqariladi | Manbalarda B1 xomashyosi ≈30%. «A1–B1» deb e'lon qilish o'quvchini aldash bo'lardi |
| Q13 | Erkin javoblarni **boshidanoq AI baholaydi** | O'qituvchi baholashi miqyoslanmaydi va kechikkan javob mashqning ma'nosini yo'qotadi (3.6) |
| Q14 | O'qituvchi to'liq emas, **namuna tekshiruvi** qiladi (~5%) | AI bahosini o'lchashning yagona yo'li, narxi yigirmadan bir qismi (3.6) |
| Q15 | Baholash **uch qatlamda**: LanguageTool (bepul) → arzon model + rubrika → chegaraviy holatda kuchliroq model | 30 so'zlik ishni kuchli modelga berish — eng qimmat va eng kam ishonchli yo'l (3.7) |
| Q16 | Model **reytingdan emas, o'z ma'lumotimizdagi o'lchovdan** tanlanadi. Boshlang'ich: `claude-haiku-4-5` | Umumiy benchmark boshqa vazifani o'lchaydi. Kerakli savol — imtihonchi ballga moslik (3.9) |
| Q17 | **Rubrika yozilmaydi** — Goethe'ning rasmiy `Bewertungskriterien` i olinadi; rasmiy ball qo'yilgan ~11 namuna few-shot va regressiya testi bo'ladi | Kalibrlash to'plamini kutish shart emas, u 5% tekshiruvdan o'sadi (3.9) |

## 3. Ma'lumot modeli

Prisma modellari `Daf` prefiksi bilan. Sabab: `Level`, `Topic`, `Skill` kabi
nomlar ERP sxemasida juda umumiy — to'qnashuv va chalkashlik xavfi bor.

### 3.1 O'zak — manbadan mustaqil

```
DafLevel        A1 · A1.1 · A1.2 · A2 · A2.1 · A2.2 · B1        (GER)
DafSkill        HOEREN · LESEN · SCHREIBEN · SPRECHEN
                · MEDIATION · ONLINE_INTERAKTION                 (GER CV 2020)
DafTopic        Person · Wohnen · Essen/Trinken · Reisen ...      (Goethe Themen)
                └ ierarxik: Person → Name, Adresse, Alter ...
DafCanDo        parentId? → ikki pog'ona (Q4)
                level · skill · topic · textDe · textUz · order
DafGrammarPoint level · nomi · Grimm Grammar sahifasiga havola
DafRedemittel   funksiya (sich entschuldigen) + iboralar ro'yxati + level
DafStrategy     o'qish/tinglash/imtihon taktikasi + level
DafLexeme       lemma · artikl · ko'plik · POS · IPA · level
                · topicIds[] · de/en/uz · audioKey
DafPhonetics    tovush/juftlik + audioKey + level
```

`DafLevel`, `DafSkill` — enum. Qolganlari jadval.

### 3.2 Kontent — manbadan keladi

```
DafSource       DIB · ZUM · WIKINEWS · INTERNAL
                nomi · url · litsenziya · atribut matni · versiya
DafUnit         manbaning bobi/sahifasi
                sourceId · tashqi id · nomi
                → level, topicIds[], canDoIds[], grammarPointIds[]
DafResource     VIDEO · AUDIO · TEXT · IMAGE · PDF
                mediaKey (R2) · davomiyligi · litsenziya · muallif · manba url
                → unitId, topicIds[], level, skill
DafTranscript   resourceId · til (de/en/uz) · segmentlar[]
                (segment: matn + boshlanish vaqti? — vaqt ixtiyoriy)
DafExercise     layer: PRUEFUNG | UEBUNG
                format (3.4) · payload (JSON) · javob kaliti
                → level, skill, topicIds[], canDoIds[],
                  grammarPointIds[], redemittelIds[], lexemeIds[]
                audience: GLOBAL | GROUP    (guruhga yo'naltirish)
                sourceId? · authorUserId? · status: DRAFT|REVIEW|PUBLISHED
DafLesson       dars — bosqichlar ketma-ketligi (3.5)
```

### 3.3 O'quvchi

```
DafAttempt      studentId · exerciseId · javob · ball · vaqt · urinish raqami
                gradedBy: AUTO | AI | TEACHER      ← 3.6
                feedback? · gradedAt? · gradedByUserId?
DafProgress     studentId · canDoId → foiz          («maqsadga qancha qoldi»)
DafSrsCard      studentId · lexemeId · interval · keyingi sana · osonlik
```

`DafProgress` `canDo` bo'yicha yig'iladi, mashq bo'yicha emas — o'quvchi
«3-mashqni yechdim» emas, «*o'zimni tanishtira olaman* — 80%» deb ko'radi.
O'qituvchi uchun esa **ko'nikma kesimida** (`DafSkill`) yig'indi chiqadi.

### 3.4 Mashq formatlari

**1-qatlam — `PRUEFUNG`** (Goethe A1/A2/B1 Modellsatz'laridan olingan):

| Format | Nima | Imtihonda qayerda |
|---|---|---|
| `MC_TEXT_3` | a/b/c matn tanlovi | A1 H · A2 L,H · B1 L,H |
| `TRUE_FALSE` | Richtig/Falsch | A1 L,H · A2 L · B1 L,H |
| `YES_NO` | Ja/Nein | A2 H |
| `MC_IMAGE` | a/b/c rasm tanlovi | A2 H |
| `MATCH_OPTIONS` | ro'yxat ↔ variantlar, ortiqcha variant + «yechim yo'q» | A2 L,H · B1 L,H |
| `AB_CHOICE` | ikki e'londan qaysi mos | A1 L |
| `FORM_FILL` | anketa to'ldirish | A1 S |
| `WRITE_GUIDED` | N so'z + 3 nuqta + salom/xayr | A1,A2,B1 S |
| `SPEAK_CARD` | karta-turtki bo'yicha gapirish | A1,A2 Sp |
| `SPEAK_PLAN` | juftlikda birga rejalashtirish | A2,B1 Sp |
| `SPEAK_PRESENT` | mavzu taqdimoti | B1 Sp |

**2-qatlam — `UEBUNG`.** Har biri majburiy ravishda kamida bitta `PRUEFUNG`
formatiga bog'lanadi (`servesFormat`):

| Format | Nimaga tayyorlaydi |
|---|---|
| `GAP_DROPDOWN` | `MC_TEXT_3` |
| `GAP_TEXT` | `FORM_FILL`, `WRITE_GUIDED` |
| `ORDER_WORDS` | `WRITE_GUIDED` (nemis so'z tartibi) |
| `PAIR_MATCH` | `MATCH_OPTIONS` |
| `MARK_WORDS` | `TRUE_FALSE`, `MC_TEXT_3` |
| `FLASHCARD_SRS` | butun leksik baza |
| `DICTATION` | `HOEREN` + imlo |
| `LISTEN_REPEAT` | `SPEAK_CARD` |
| `VIDEO_EMBEDDED_Q` | `HOEREN` (video ichida savol) |

Ro'yxat H5P ochiq standartining tur nomlariga ataylab yaqin olingan — ZUM'ning
759 mashqi shu turlarda yozilgan, ya'ni moslashtirish tarjima emas, xaritalash
bo'ladi.

### 3.5 Dars ritmi

Netzwerk neu ning bob formulasi **2+4+2+1+1** dan olingan bosqichlar:

```
EINSTIEG            mavzuni jonlantirish + kalit leksika
HAUPTTEIL           struktura + Redemittel + fonetika
STRATEGIE_LANDESKUNDE   strategiya + D-A-CH madaniyati
FILM                hikoya (DiB'ning Würzburg qahramonlari)
KURZ_UND_KLAR       Rückschau: Redemittel + grammatika xulosasi
```

Har 3 darsdan keyin `PLATTFORM` — takrorlash. Intervalli takrorlash tuzilmaga
qurilgan, `DafSrsCard` esa leksika darajasida alohida ishlaydi.

### 3.6 Baholovchi qatlam — kim tekshiradi

3.4 dagi formatlar baholanishi bo'yicha **ikkiga bo'linadi**, va bu ajratma
tizimning qamrovini belgilaydi:

| Baholovchi | Formatlar | Holati |
|---|---|---|
| `AUTO` | `MC_TEXT_3`, `TRUE_FALSE`, `YES_NO`, `MC_IMAGE`, `MATCH_OPTIONS`, `AB_CHOICE`, `FORM_FILL` va butun `UEBUNG` qatlami | Javob kaliti bilan tekshiriladi. Kod yozilsa bo'ldi |
| `AI` yoki `TEACHER` | `WRITE_GUIDED`, `SPEAK_CARD`, `SPEAK_PLAN`, `SPEAK_PRESENT` | **Javob kaliti yo'q** — erkin matn va nutq |

Ikkinchi qator — Goethe imtihonining **Schreiben va Sprechen modullari**, ya'ni
ballning taxminan yarmi. Ular baholovchisiz mashq bo'la olmaydi: o'quvchi
yozadi, hech kim javob bermaydi.

Shuning uchun **baholovchi tizimning ixtiyoriy bezagi emas, yarmini
ishlatadigan qismi.**

**Q13 — asosiy baholovchi boshidanoq `AI`.** O'qituvchi baholashi
miqyoslanmaydi: bitta o'qituvchi 200 o'quvchining haftalik yozma ishini
o'qib chiqa olmaydi, va javob bir necha kunga kechiksa mashqning ma'nosi
yo'qoladi. AI darhol javob beradi.

**Q14 — o'qituvchi to'liq baholamaydi, `namuna tekshiruvi` qiladi.** Har
baholangan ishning kichik ulushi (boshlanish uchun ~5%) o'qituvchi navbatiga
tushadi. Bu AI bahosini o'lchash uchun yagona yo'l va u to'liq baholashning
yigirmadan bir qismini oladi.

O'lchovsiz qoldirmaslik shart. ADR-0009 ning haqiqiy saboqi kalit yo'qligi
emas — **hech kim uning ishlamayotganini ko'rsatadigan raqamga qaramagani**.
193 ta bo'sh suhbat oylab turgan. `gradedBy` saqlanishi va namuna tekshiruvi
shuning takrorlanmasligi uchun.

### 3.7 Baholash uch qatlamda

Erkin javobni bitta kuchli modelga berish — eng qimmat va eng kam ishonchli
yo'l. A1 yozma ishi 30 ta so'z, uchta nuqta, salom va xayr: bu o'ylash masalasi
emas, **tekshirish ro'yxati**. Shuning uchun ish uch qatlamga bo'linadi.

| Qatlam | Nima qiladi | Vosita | Narx |
|---|---|---|---|
| **0** | Imlo, grammatika, artikl, so'z tartibi | **LanguageTool**, o'z serverimizda (LGPL 2.1) | **bepul** |
| **1** | Rubrika mezonlari: Leitpunktlar yoritilganmi, Anrede/Gruß bormi, registr to'g'rimi | arzon model + Goethe rubrikasi + namunalar | tokenga qarab |
| **2** | Faqat chegaraviy holat (ball o'tish chegarasiga yaqin) | kuchliroq model, ~15% holat | kam |

LanguageTool qoidalar dvigateli — bir xil xatoga har doim bir xil javob beradi,
tushuntirib bo'ladi va hech qachon o'ylab topmaydi. A1/A2 bahosining katta
qismi aynan shu. Uni LLM'ga berish — qimmatroq va ishonchsizroq.

### 3.8 Nutqni baholash — ikki yo'l

`SPEAK_*` **audio** ishlab chiqaradi. Matnga o'girib baholash mumkin, lekin u
faqat yarmi: talaffuz matnda qolmaydi. «Ich möchte» ni noto'g'ri talaffuz
qilgan o'quvchining transkripti baribir to'g'ri chiqadi.

Bitta yozuvdan ikkita parallel yo'l:

| Yo'l | Nima baholanadi | Vosita |
|---|---|---|
| **A — talaffuz** | tovush aniqligi, ravonlik | Azure Speech pronunciation assessment |
| **B — mazmun** | Leitpunktlar, tuzilish, Redemittel, grammatika | Whisper → matn → 3.7 dagi qatlamlar |

**Tasdiqlangan cheklov:** Azure'ning **prosody** (ohang, ritm, urg'u) bahosi
faqat `en-US` uchun mavjud; `de-DE` da **accuracy va fluency** ishlaydi,
prosody yo'q. Goethe esa A2 Sprechen'da `Satzmelodie` va `Wortakzent` ni
baholaydi — ya'ni bu mezon avtomatik qoplanmaydi va o'qituvchi namuna
tekshiruviga qoladi.

Azure narxi tasdiqlanmadi (sahifa mintaqaga qarab dinamik) — ishlatishdan
oldin aniqlanadi. Shuning uchun **Yo'l B birinchi ishga tushadi**, Yo'l A esa
narx aniqlangach. O'quvchiga «bu yerda talaffuz baholanmaydi» deb ochiq
aytiladi — yarim ishlaydigan narsa hech narsadan yaxshi, lekin faqat chegarasi
oshkora bo'lsa.

### 3.9 Rubrika va kalibrlash

**Rubrika yozilmaydi — Goethe uni chop etgan.** Modellsatz va Übungssatz
hujjatlarida rasmiy `Bewertungskriterien Schreiben` va
`Bewertungskriterien Sprechen` to'liq berilgan:

- **A1** — har mazmun nuqtasi uchun 3 / 1,5 / 0 ball, ustiga
  `Kommunikative Gestaltung` uchun 1 / 0,5 / 0
- **A2 va B1** — A–E bandlari: `Aufgabenerfüllung` (Sprachfunktion, Register,
  Textumfang) va `Sprache` (Spektrum va Beherrschung: Kohärenz, Wortschatz,
  Strukturen); Sprechen'da qo'shimcha `Aussprache`

**Kalibrlash to'plami ham qisman tayyor.** Goethe rasmiy **ball qo'yilgan
o'quvchi ishlarini** chop etgan — A1 uchun uchta to'plamda ~11 ta namuna, har
biri real matn + rasmiy ball + mezonlar bo'yicha taqsimot
(masalan `10 Punkte (3 – 3 – 3 – 1)`, `6,5 Punkte (3 – 1,5 – 1,5 – 0,5)`).
A2 va B1 da `Leistungsbeispiele` bor, lekin **ball qo'yilmagan** — ular daraja
langari sifatida ishlaydi, ball haqiqati sifatida emas.

Bu namunalar **ikki vazifani** bajaradi:

1. **Prompt ichida namuna** (few-shot) — rasmiy baholangan ish modelga
   ekspert qanday baholashini ko'rsatadi. Arzon modelni imtihonchiga
   o'xshatadigan asosiy narsa shu.
2. **Regressiya testi** — prompt yoki model o'zgarganda o'sha ~11 ta ish qayta
   baholanadi; rasmiy balldan chetlashsa, o'zgarish qabul qilinmaydi.

**Q16 — model reytingdan emas, o'lchovdan tanlanadi.** Umumiy nemis tili
benchmarki (Artificial Analysis'da eng yuqorisi Gemini 3.1 Pro va Claude Opus
4.6) boshqa vazifani o'lchaydi. Bizga kerakli savol: *«bu model imtihonchi
qo'ygan ballga qanchalik mos ball qo'yadi?»* — buni faqat o'z ma'lumotimizda
o'lchaymiz.

Kalibrlash to'plami **kutilmaydi, o'sadi**: ~11 ta rasmiy namuna bilan
boshlanadi, keyin 5% namuna tekshiruvi (Q14) uni har oy to'ldiradi.

**Sintetik namuna ball haqiqati sifatida ishlatilmaydi** — LLM xato yozib,
keyin o'sha xatoni o'zi baholasa, bu doiraviy bo'ladi. Sintetik matn faqat
turg'unlikni sinash uchun.

### 3.10 Provayder va model

| Qaror | Qiymat |
|---|---|
| Provayder | **Anthropic (Claude)** — bitta integratsiya, tekshirilgan hujjat bilan |
| Model | **`claude-haiku-4-5`** asos, chegaraviy holatda `claude-sonnet-5` |
| SDK | `@anthropic-ai/sdk` (loyiha TypeScript) |
| Chiqish shakli | `output_config.format` — strukturali JSON |
| Kesh | rubrika + namunalar `system` da, `cache_control` bilan |
| Kalit joyi | **Railway server env** (`ANTHROPIC_API_KEY`) |

Narx, 8 000 baholash/oy (500 o'quvchi × 16):

| Tuzilma | Oyiga |
|---|---|
| `claude-opus-5` yolg'iz | $148.00 |
| **`claude-haiku-4-5` yolg'iz** | **$29.60** |
| Haiku + 15% Sonnet 5 (kaskad) | $38.48 |
| Batch API bilan (−50%) | yarmi |

Qatlam 0 (LanguageTool) xatolarni oldindan topgani uchun chiqish tokeni ham
qisqaradi — bu jadvalda hisobga olinmagan.

Boshqa provayderlar (Gemini Flash Lite ≈ $2.6/oy, DeepSeek ≈ $2.5/oy) yana
arzonroq, lekin **ikkinchi integratsiya** degani. $27 farq uchun bu xavf
arzimaydi; o'lchov (Q16) ko'rsatsa, ko'chiriladi.

Strukturali chiqish shu yerda hal qiluvchi: baho `{ball, mezonlar, izoh}`
shaklida sxema bo'yicha tekshirilib qaytadi. Bahoni erkin matndan parse qilish
— jimgina buziladigan joy.

**Bu spec AI baholovchining ichki qurilishini belgilamaydi** — u ADR-0009 talab
qilganidek o'z spec'i va o'z ma'lumot modeli bilan keladi. Bu yerda faqat
**uyasi** ochiladi: `gradedBy`, `feedback`, `gradedAt`.

## 4. Adapter kontrakti

Har manba uchun bitta adapter. Adapter **faqat o'zak tushunadigan shaklda**
qaytaradi — manbaning o'z atamalari (`Kapitel`, `Webquest`, `Handlungsfeld`)
o'zakka o'tmaydi.

```ts
interface DafSourceAdapter {
  readonly source: DafSourceId;

  /** Manbadan xom yozuvlarni oqim sifatida beradi. Tarmoq shu yerda. */
  harvest(): AsyncIterable<RawRecord>;

  /** Xom yozuvni o'zak shakliga o'giradi. Sof funksiya — tarmoq yo'q. */
  map(raw: RawRecord): MappedUnit;

  /** Media fayllar ro'yxati: manba URL → R2 kaliti + litsenziya. */
  assets(raw: RawRecord): AssetRef[];
}
```

`harvest` va `map` ajratilgani ataylab: xaritalash sof funksiya bo'lsa, uni
tarmoqsiz test qilish mumkin va manba o'chib qolganda ham qayta ishga tushadi.

**DiB adapteri** — `toc.php` dan bob → grammatika bog'lanishi, `voc.php` dan
leksema jadvali, `vidt.php` dan DE/EN transkript, `pho.php` dan talaffuz.
**ZUM adapteri** — MediaWiki API dan toifalar (daraja va mavzuni tekin beradi),
sahifa ichidagi H5P JSON dan mashq (≈55 KB), `.h5p` eksport emas (≈10 MB, ichida
asosan kutubxonalar).

## 5. Ma'lumot oqimi

```
  DiB (coerll.utexas.edu)        ZUM (MediaWiki API)
         │                              │
         └──────────┬───────────────────┘
                    ▼
            adapter.harvest()          ← qo'lda, bir marta (repo skripti)
                    ▼
            adapter.map()              ← sof funksiya, testlanadi
                    ▼
        versiyalangan JSON dataset     ← repo'da, git'da ko'riladi
             │              │
             │              └────► media fayllar ──► Cloudflare R2
             ▼
        seed → Postgres (Daf* jadvallari)
                    ▼
        NestJS API ──► portal (faqat bazadan o'qiydi)
```

Yig'ish **so'rov paytida hech qachon** bajarilmaydi. Portal tashqi manbaga
bormaydi — ADR-0010 dagi bilan bir xil tamoyil.

## 6. Fazalar

Bu spec **Faza 1 ni to'liq** qamraydi va **barcha fazalar tayanadigan o'zak modelini** belgilaydi.
Faza 2–6 shu modeldan foydalanadi, lekin har biri o'z spec'ini oladi.

| Faza | Natija | Alohida spec |
|---|---|---|
| **1** | Dataset + media R2'da: adapterlar, daraja yorliqlash, tarjima (tasdiqlanmagan holatda) | yo'q — shu hujjat |
| **2** | Ko'rinadigan kutubxona: `Daf*` modellar, seed, API, portal bo'limi. Mashqsiz | kerak |
| **3** | Mashq dvigateli — 3.4 dagi formatlar. Yopiq formatlar `AUTO`, **`WRITE_GUIDED` esa `AI`** (Schreiben ishlaydi) | kerak |
| **4** | Admin muallif UI + guruhga yo'naltirish + tarjima tasdig'i + **o'qituvchi namuna tekshiruvi navbati** | kerak |
| **5** | **Deutsch Tutor to'liq qaytishi** — tushuntiruvchi suhbat, `SPEAK_*` uchun STT | kerak |
| **6** | `student-app` pariteti | kerak |

`WRITE_GUIDED` Faza 3 ga kiritildi: baholovchisiz u mashq bo'la olmaydi, ya'ni
AI ni kechiktirsak, Schreiben moduli bo'sh qoladi. `SPEAK_*` esa Faza 5 da —
u qo'shimcha bo'g'inni (STT) talab qiladi va cheklovi bor (3.8).

## 7. Nima QILINMAYDI

- **Litsenziyasi tekshirilmagan media saqlash.** Faqat CC litsenziyali va
  litsenziyasi yozib qo'yilgan aktivlar R2'ga chiqadi. YouTube kontenti bu
  shartga tushmaydi va bu modulga manba bo'lmaydi.
- **Tijorat darslik kontentini ko'chirish.** Netzwerk, Hueber, Cornelsen —
  struktura o'lchovi, manba emas.
- **Cloudflare Workers / D1.** Q6.
- **LLM bilan daraja yorliqlash.** Q7 — deterministik, keyin o'qituvchi tasdig'i.
- **Tasdiqlanmagan tarjimani o'quvchiga ko'rsatish.** O'qituvchi tasdig'igacha
  yozuv `REVIEW` holatida turadi va portalda chiqmaydi.
- **DiB'ning Webquest'lari.** 2005-yilgi tashqi havolalar, aksari o'lgan.
- **`B1` ni to'ldirilgandek ko'rsatish.** Q12.
- **AI baholovchining ichki qurilishi.** 3.6 faqat uyasini ochadi; dvigatel
  o'z spec'i bilan keladi.

## 8. Xavflar

| Xavf | Ta'sir | Yumshatish |
|---|---|---|
| **`Lesen` matnlari ikkala manbada ham yo'q** | A1/A2 imtihonining ≈1/3 qismi qoplanmaydi | Matn turlari aniq belgilangan (e'lon, taxta, qisqa e-mail) — qisqa matnlar, o'zimiz yozamiz. Wikinews A2/B1 gazeta matnini beradi |
| R2 sozlanmay qolishi | O'quvchi bosadigan-u ishlamaydigan tugma ko'radi | Q10 — kontent bo'lmasa modul menyuda ko'rinmaydi. Seed va R2 tekshiruvi deploy oldidan |
| ZUM sifati bir tekis emas (hamjamiyat wiki'si) | Sifatsiz mashq o'quvchiga chiqadi | Barcha import `REVIEW` holatida keladi; o'qituvchi tasdig'isiz `PUBLISHED` bo'lmaydi |
| ZUM konteksti **DaZ** (Germaniyadagi muhojirlar) | Ba'zi material bizning o'quvchiga mos emas | Handlungsfeld darajasida filtr; `REVIEW` bosqichida ajratiladi |
| Fayl litsenziyalari aralash (CC0/BY/BY-SA) | Atribut yoki ShareAlike buzilishi | Q9 — har aktiv litsenziyasi bilan keladi; `BY-SA` aktivlar alohida belgilanadi |
| DiB videolari 2005–2009 yillarniki | O'quvchi eskiligini sezadi | Til jihatidan yaroqli. Kutish darajasi oldindan to'g'rilanadi, yashirilmaydi |
| **AI bahosi noto'g'ri bo'lishi** | O'quvchi xato bahoga ishonib, xato o'rganadi | Q14 — namuna tekshiruvi; `gradedBy` saqlanadi. Farq kattaligi o'lchanadi, ko'rsatkich chiqariladi |
| **`ANTHROPIC_API_KEY` Railway'da qo'yilmasligi** | ADR-0009 ning aynan takrori | Kalit yo'q bo'lsa `WRITE_GUIDED` mashqlari **umuman ko'rsatilmaydi** (Q10). Deploy oldidan tekshiruv |
| Baholash narxi kutilganidan oshishi | Oylik xarajat | Q15 — Qatlam 0 bepul; rubrika va namunalar keshlanadi; shoshilinch bo'lmagan baholash Batch API'ga (−50%) chiqariladi |
| Tarjima hajmi (1 948 + grammatika) | O'qituvchi vaqti — real to'siq | Fazaga kiritiladi; `REVIEW` navbati ustuvorlik bilan (avval A1 leksikasi) |

## 9. Ochiq qolgan savollar

1. **Netzwerk «Das kann ich» / «Kurz und klar» sahifalari** — `DafCanDo` ning
   tartibi va `DafRedemittel` ro'yxati uchun. Kutilmaydi: `CanDo` GER Companion
   Volume'dan quyiladi, Netzwerk kelganda **tartib aniqlashtiriladi** (`order`
   ustuni — ma'lumot o'zgarishi, sxema emas).
2. **Markazning o'z `Lesen` materiallari** — bo'lsa, eng qimmat manba.
3. **Transkript vaqt belgisi.** DiB transkriptlari vaqtga bog'lanmagan.
   Karaoke uslubidagi pleer kerak bo'lsa, forced alignment (Whisper) — alohida
   ish, Faza 1 ga kirmaydi.
4. **Azure pronunciation assessment narxi** — sahifa mintaqaga qarab dinamik
   chiqaradi, tasdiqlanmadi. Yo'l A (3.8) shu aniqlangunicha boshlanmaydi.
5. **A2/B1 uchun ball qo'yilgan namunalar.** Goethe A2 va B1 da
   `Leistungsbeispiele` ni ballsiz beradi. Qo'shimcha manba (telc, ÖSD, DTZ)
   qidiriladi; topilmasa, o'sha darajalarning kalibrlashi to'liq 5% namuna
   tekshiruvidan yig'iladi.

## 10. ADR

**ADR-0011** yoziladi: *«O'quv o'zagi standartga bog'lanadi, manbaga emas»* —
Q1, Q3, Q4 va Q7 ni rasmiylashtiradi. Bu eng qimmat qaytariladigan qaror:
o'zak bir marta manbaning shakliga qurilsa, har yangi kitob uni buzadi.
