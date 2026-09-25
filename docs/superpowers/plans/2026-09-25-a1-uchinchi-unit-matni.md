# A1 — 3-unit «In der Stadt» matni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A1 ning 3-uniti to'liq matn bilan to'ladi (50 so'z, 5 qoida, 15 ibora, 6 dialog + 12 eshitish savoli, 50 gap), avtomatik va qo'lda tekshiruvdan o'tadi, CEO ko'rigidan keyin prod bazaga yuklanadi.

**Architecture:** Kod o'zgarmaydi. `server/content/daf/a1/u03/` ga beshta JSON fayl, `wortliste.json` ga 50 yozuv, `hilfswoerter.json` ga fe'l shakllari va qisqarishlar qo'shiladi. Mavjud qo'riqchilar (`unit-inhalt.file.spec.ts`, `daf:inhalt-check`) u03 ni `woerter.json` paydo bo'lishi bilan o'zi tekshiradi. Bazaga `daf:inhalt-seed -- --unit 3` tushiradi.

**Tech Stack:** JSON kontent fayllari, Jest (mavjud qo'riqchilar), ts-node skriptlari (`daf:inhalt-check`, `daf:inhalt-seed`), Prisma (seed).

**Dizayn:** `docs/superpowers/specs/2026-09-25-a1-uchinchi-unit-matni-design.md` — ziddiyat chiqsa dizayn ustun.

## Global Constraints

- Xarita (`kurs.json`) O'ZGARMAYDI.
- Ovoz, rasm, yangi format, ekran, native ilova — bu rejada YO'Q.
- Netzwerk yoki Goethe MATNI ko'chirilmaydi; Goethe dan faqat «so'z A1 ga kiradimi» fakti.
- Progressiya: gap, dialog, misol, ibora va savoldagi har so'z shu bo'limda yoki undan OLDIN o'rgatilgan (yoki `hilfswoerter.json` da, `abSection` bo'yicha ochilgan).
- Unit ichida takroriy `de` (so'z) va takroriy `funktionUz` (ibora) YO'Q.
- Barcha o'zbekcha matn lotin alifbosida; kirill/arab harfi yo'q.
- Ismlar faqat nemischa, faqat `stimmen.json` dagi 12 obraz.
- Xushmuomala qatorlar bitta shaklda: «Danke!», «Bitte!», «Entschuldigung, …».
- Raqam yozilmaydi (so'z bilan) — `tts` kerak emas.
- JSON formati mavjud fayllarniki: `u03/*.json` va `wortliste.json` — `json.dump(..., indent=1, ensure_ascii=False)`; `hilfswoerter.json` — `indent=2`. Fayl oxirida yangi qator.
- Commit xabarlari inglizcha, oxirida `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Har commit oldidan: `cd server && npm run daf:inhalt-check -- --unit 3` (Task 3 dan keyin toza bo'lishi shart) va `npx jest src/daf/inhalt`.
- Barcha buyruqlar worktree ichidan: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/a1-uchinchi-unit`.

---

## Fayl xaritasi

| Fayl | Nima | Task |
| --- | --- | --- |
| `server/content/daf/a1/wortliste.json` | +50 yozuv (u03 bo'limlariga biriktirish, 13 tasida `grund`) | 1 |
| `server/content/daf/a1/hilfswoerter.json` | +24 yordamchi so'z, `abSection` bilan | 1 |
| `server/content/daf/a1/u03/woerter.json` | 50 asosiy so'zning to'liq yozuvi | 1 |
| `server/content/daf/a1/u03/grammatik.json` | 5 qoida × 5 misol | 2 |
| `server/content/daf/a1/u03/redemittel.json` | 15 ibora | 2 |
| `server/content/daf/a1/u03/dialoge.json` | 6 dialog + 12 savol | 3 |
| `server/content/daf/a1/u03/saetze.json` | 50 gap | 4 |

Ma'lumotni faylga yozish uchun bir martalik yordamchi (repo'ga kirmaydi, scratchpad'da):

```python
# write_json.py — ishlatilishi: python3 write_json.py <yo'l> <indent> < data.json
import json, sys
path, indent = sys.argv[1], int(sys.argv[2])
data = json.load(sys.stdin)
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=indent)
    f.write("\n")
```

---

### Task 1: So'zlar va yordamchi so'zlar

**Files:**
- Modify: `server/content/daf/a1/wortliste.json` (`eintraege` oxiriga 50 yozuv)
- Modify: `server/content/daf/a1/hilfswoerter.json` (`eintraege` oxiriga 27 yozuv)
- Create: `server/content/daf/a1/u03/woerter.json`

**Interfaces:**
- Produces: u03 ning 50 asosiy so'zi (`sourceId` = `u03-sN-<slug>`, slug: kichik harf, ä→ae ö→oe ü→ue ß→ss, bo'sh joy → `-`) va yangi yordamchi shakllar. Keyingi tasklardagi har matn faqat shu so'zlar + u01/u02 + yordamchilardan tuziladi.

- [ ] **Step 1: Hozirgi holatni qayd etish (u03 hali yo'q)**

Run: `cd server && npm run daf:inhalt-check -- --unit 3`
Expected: FAIL — `u03: woerter.json yo'q`, `u03: grammatik.json yo'q`, `u03: dialoge.json yo'q`.

- [ ] **Step 2: `u03/woerter.json` ni yozish**

`{"unit": "u03", "woerter": [...]}` — quyidagi 50 yozuv shu tartibda (`core: true` hammasida; `artikel`/`plural` yo'q bo'lsa kalit YOZILMAYDI):

```json
[
{"sourceId":"u03-s1-bahnhof","section":"u03-s1","de":"Bahnhof","artikel":"der","plural":"Bahnhöfe","uz":"vokzal","core":true,"order":1},
{"sourceId":"u03-s1-platz","section":"u03-s1","de":"Platz","artikel":"der","plural":"Plätze","uz":"maydon","core":true,"order":2},
{"sourceId":"u03-s1-park","section":"u03-s1","de":"Park","artikel":"der","plural":"Parks","uz":"park","core":true,"order":3},
{"sourceId":"u03-s1-post","section":"u03-s1","de":"Post","artikel":"die","uz":"pochta","core":true,"order":4},
{"sourceId":"u03-s1-bank","section":"u03-s1","de":"Bank","artikel":"die","plural":"Banken","uz":"bank","core":true,"order":5},
{"sourceId":"u03-s1-polizei","section":"u03-s1","de":"Polizei","artikel":"die","uz":"politsiya","core":true,"order":6},
{"sourceId":"u03-s1-toilette","section":"u03-s1","de":"Toilette","artikel":"die","plural":"Toiletten","uz":"hojatxona","core":true,"order":7},
{"sourceId":"u03-s1-hotel","section":"u03-s1","de":"Hotel","artikel":"das","plural":"Hotels","uz":"mehmonxona","core":true,"order":8},
{"sourceId":"u03-s1-kino","section":"u03-s1","de":"Kino","artikel":"das","plural":"Kinos","uz":"kinoteatr","core":true,"order":9},
{"sourceId":"u03-s1-museum","section":"u03-s1","de":"Museum","artikel":"das","plural":"Museen","uz":"muzey","core":true,"order":10},
{"sourceId":"u03-s2-entschuldigung","section":"u03-s2","de":"Entschuldigung","uz":"kechirasiz","core":true,"order":1},
{"sourceId":"u03-s2-neben","section":"u03-s2","de":"neben","uz":"yonida","core":true,"order":2},
{"sourceId":"u03-s2-an","section":"u03-s2","de":"an","uz":"-da, oldida (joy predlogi)","core":true,"order":3},
{"sourceId":"u03-s2-zwischen","section":"u03-s2","de":"zwischen","uz":"orasida","core":true,"order":4},
{"sourceId":"u03-s2-links","section":"u03-s2","de":"links","uz":"chapda, chapga","core":true,"order":5},
{"sourceId":"u03-s2-rechts","section":"u03-s2","de":"rechts","uz":"o'ngda, o'ngga","core":true,"order":6},
{"sourceId":"u03-s2-dort","section":"u03-s2","de":"dort","uz":"u yerda","core":true,"order":7},
{"sourceId":"u03-s2-weit","section":"u03-s2","de":"weit","uz":"uzoq (masofa)","core":true,"order":8},
{"sourceId":"u03-s2-strasse","section":"u03-s2","de":"Straße","artikel":"die","plural":"Straßen","uz":"ko'cha","core":true,"order":9},
{"sourceId":"u03-s2-ecke","section":"u03-s2","de":"Ecke","artikel":"die","plural":"Ecken","uz":"burchak","core":true,"order":10},
{"sourceId":"u03-s3-gehen","section":"u03-s3","de":"gehen","uz":"yurmoq (piyoda bormoq)","core":true,"order":1},
{"sourceId":"u03-s3-geradeaus","section":"u03-s3","de":"geradeaus","uz":"to'g'riga","core":true,"order":2},
{"sourceId":"u03-s3-nehmen","section":"u03-s3","de":"nehmen","uz":"olmoq","core":true,"order":3},
{"sourceId":"u03-s3-dann","section":"u03-s3","de":"dann","uz":"keyin","core":true,"order":4},
{"sourceId":"u03-s3-erste","section":"u03-s3","de":"erste","uz":"birinchi","core":true,"order":5},
{"sourceId":"u03-s3-zweite","section":"u03-s3","de":"zweite","uz":"ikkinchi","core":true,"order":6},
{"sourceId":"u03-s3-ampel","section":"u03-s3","de":"Ampel","artikel":"die","plural":"Ampeln","uz":"svetofor","core":true,"order":7},
{"sourceId":"u03-s3-suchen","section":"u03-s3","de":"suchen","uz":"qidirmoq","core":true,"order":8},
{"sourceId":"u03-s3-finden","section":"u03-s3","de":"finden","uz":"topmoq","core":true,"order":9},
{"sourceId":"u03-s4-fahren","section":"u03-s4","de":"fahren","uz":"bormoq (transportda)","core":true,"order":1},
{"sourceId":"u03-s4-mit","section":"u03-s4","de":"mit","uz":"bilan","core":true,"order":2},
{"sourceId":"u03-s4-bus","section":"u03-s4","de":"Bus","artikel":"der","plural":"Busse","uz":"avtobus","core":true,"order":3},
{"sourceId":"u03-s4-u-bahn","section":"u03-s4","de":"U-Bahn","artikel":"die","plural":"U-Bahnen","uz":"metro","core":true,"order":4},
{"sourceId":"u03-s4-strassenbahn","section":"u03-s4","de":"Straßenbahn","artikel":"die","plural":"Straßenbahnen","uz":"tramvay","core":true,"order":5},
{"sourceId":"u03-s4-zug","section":"u03-s4","de":"Zug","artikel":"der","plural":"Züge","uz":"poyezd","core":true,"order":6},
{"sourceId":"u03-s4-auto","section":"u03-s4","de":"Auto","artikel":"das","plural":"Autos","uz":"mashina","core":true,"order":7},
{"sourceId":"u03-s4-fahrrad","section":"u03-s4","de":"Fahrrad","artikel":"das","plural":"Fahrräder","uz":"velosiped","core":true,"order":8},
{"sourceId":"u03-s4-taxi","section":"u03-s4","de":"Taxi","artikel":"das","plural":"Taxis","uz":"taksi","core":true,"order":9},
{"sourceId":"u03-s4-zu-fuss","section":"u03-s4","de":"zu Fuß","uz":"piyoda","core":true,"order":10},
{"sourceId":"u03-s4-haltestelle","section":"u03-s4","de":"Haltestelle","artikel":"die","plural":"Haltestellen","uz":"bekat","core":true,"order":11},
{"sourceId":"u03-s5-arbeit","section":"u03-s5","de":"Arbeit","artikel":"die","uz":"ish","core":true,"order":1},
{"sourceId":"u03-s5-weg","section":"u03-s5","de":"Weg","artikel":"der","plural":"Wege","uz":"yo'l","core":true,"order":2},
{"sourceId":"u03-s5-heute","section":"u03-s5","de":"heute","uz":"bugun","core":true,"order":3},
{"sourceId":"u03-s5-immer","section":"u03-s5","de":"immer","uz":"doim","core":true,"order":4},
{"sourceId":"u03-s5-oft","section":"u03-s5","de":"oft","uz":"tez-tez","core":true,"order":5},
{"sourceId":"u03-s5-manchmal","section":"u03-s5","de":"manchmal","uz":"ba'zan","core":true,"order":6},
{"sourceId":"u03-s5-dauern","section":"u03-s5","de":"dauern","uz":"davom etmoq (vaqt olmoq)","core":true,"order":7},
{"sourceId":"u03-s5-lange","section":"u03-s5","de":"lange","uz":"uzoq (vaqt)","core":true,"order":8},
{"sourceId":"u03-s5-minute","section":"u03-s5","de":"Minute","artikel":"die","plural":"Minuten","uz":"daqiqa","core":true,"order":9},
{"sourceId":"u03-s5-warten","section":"u03-s5","de":"warten","uz":"kutmoq","core":true,"order":10}
]
```

- [ ] **Step 3: `wortliste.json` ga 50 yozuv qo'shish**

Har so'z: `{"wort": <de>, "artikel": <artikel yoki null>, "section": <section>, "core": true}`, tartib Step 2 dagidek. Quyidagi 13 tasiga qo'shimcha `"grund"`:

| wort | grund |
| --- | --- |
| Park | Goethe A1 ro'yxatida bosh so'z sifatida yo'q (faqat misol gapda: 'Er sitzt im Park auf einer Bank'); shahardagi asosiy joy nomi |
| Museum | Goethe A1 ro'yxatida bosh so'z sifatida yo'q (faqat misol gapda: 'Ich gehe oft ins Museum'); xalqaro so'z, shahar joyi |
| Entschuldigung | Goethe PDF'da bosh so'z ('die Entschuldigung — Entschuldigung! – Bitte.'); ajratilgan goethe-a1.json nusxasida tushib qolgan |
| neben | Goethe ro'yxatida 'daneben' bor; bo'lim qoidasi (in/an/neben + Wo?) 'neben' ni talab qiladi |
| erste | Goethe PDF'ning 'Zahlen' guruhida ('das/der/die erste'); ajratilgan nusxada tushib qolgan |
| zweite | Goethe PDF'ning 'Zahlen' guruhida (tartib son); ajratilgan nusxada tushib qolgan |
| Ampel | Goethe A1 ro'yxatida yo'q; yo'l ko'rsatishning asosiy mo'ljali ('An der Ampel links'), A1 darsliklarida standart |
| U-Bahn | Goethe A1 ro'yxatida yo'q (S-Bahn va Straßenbahn bor); nemis shahrining asosiy transporti |
| zu Fuß | ibora — 'zu' va 'Fuß' Goethe ro'yxatida bor; 'Ich gehe zu Fuß.' Goethe misolida ham shunday |
| Arbeit | Goethe PDF'da bosh so'z ('die Arbeit — Mein Bruder sucht Arbeit.'); ajratilgan nusxada tushib qolgan |
| Weg | Goethe A1 ro'yxatida yo'q; bo'lim nomining o'zi ('Mein Weg zur Arbeit') |
| manchmal | Goethe A1 ro'yxatida yo'q; 'immer – oft – manchmal' chastota qatorini to'ldiradi |
| Minute | Goethe PDF'ning 'Uhrzeit' guruhida ('die Minute, -n'); ajratilgan nusxada tushib qolgan |

- [ ] **Step 4: `hilfswoerter.json` ga 24 yozuv qo'shish**

`eintraege` oxiriga, `indent=2`:

```json
[
{"wort":"gibt","grund":"'es gibt' qolipi — 'Gibt es hier ein Kino?' (u03-s1)","abSection":"u03-s1"},
{"wort":"dem","grund":"der/das ning qaratqich (Dativ) shakli — in/an/neben/mit dan keyin (u03-s2 qoidasi)","abSection":"u03-s2"},
{"wort":"im","grund":"in + dem qisqarishi (u03-s2 qoidasi)","abSection":"u03-s2"},
{"wort":"am","grund":"an + dem qisqarishi (u03-s2 qoidasi)","abSection":"u03-s2"},
{"wort":"zum","grund":"zu + dem qisqarishi (u03-s3 qoidasi)","abSection":"u03-s3"},
{"wort":"zur","grund":"zu + der qisqarishi (u03-s3 qoidasi)","abSection":"u03-s3"},
{"wort":"gehe","grund":"gehen fe'lining ich shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"gehst","grund":"gehen fe'lining du shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"nehme","grund":"nehmen fe'lining ich shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"nimmst","grund":"nehmen fe'lining du shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"nimmt","grund":"nehmen fe'lining er/sie shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"suche","grund":"suchen fe'lining ich shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"suchst","grund":"suchen fe'lining du shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"sucht","grund":"suchen fe'lining er/sie shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"finde","grund":"finden fe'lining ich shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"findest","grund":"finden fe'lining du shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"findet","grund":"finden fe'lining er/sie shakli (u03-s3)","abSection":"u03-s3"},
{"wort":"fahre","grund":"fahren fe'lining ich shakli (u03-s4)","abSection":"u03-s4"},
{"wort":"fährst","grund":"fahren fe'lining du shakli (u03-s4)","abSection":"u03-s4"},
{"wort":"fährt","grund":"fahren fe'lining er/sie shakli (u03-s4)","abSection":"u03-s4"},
{"wort":"dauert","grund":"dauern fe'lining er/sie/es shakli (u03-s5)","abSection":"u03-s5"},
{"wort":"warte","grund":"warten fe'lining ich shakli (u03-s5)","abSection":"u03-s5"},
{"wort":"wartest","grund":"warten fe'lining du shakli (u03-s5)","abSection":"u03-s5"},
{"wort":"wartet","grund":"warten fe'lining er/sie shakli (u03-s5)","abSection":"u03-s5"}
]
```

Jami 24 yozuv. Ro'yxatda hech bir unitning asosiy so'zi yo'q (`validateHilfswoerter`); `geht` allaqachon bor, qayta qo'shilmaydi.

- [ ] **Step 5: Tekshiruv — so'zlar toza, qolgani faqat yo'q fayllar**

Run: `cd server && npm run daf:inhalt-check -- --unit 3`
Expected: FAIL, lekin FAQAT ikki satr: `u03: grammatik.json yo'q`, `u03: dialoge.json yo'q`. Wortliste, 50 so'z va takror qoidasi xato bermaydi.

Run: `npx jest src/daf/inhalt/wortliste.validate.spec.ts src/daf/inhalt/unit-inhalt.validate.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/content/daf/a1/wortliste.json server/content/daf/a1/hilfswoerter.json server/content/daf/a1/u03/woerter.json
git commit -m "content: A1 unit 3 word list and helper forms"
```

(`unit-inhalt.file.spec.ts` bu commit'da qizil bo'ladi — u03 boshlangan, lekin beshta faylning uchtasi hali yo'q. Task 4 oxirida yashil bo'ladi; oraliq commitlar shu shox ichida qoladi.)

---

### Task 2: Grammatika va iboralar

**Files:**
- Create: `server/content/daf/a1/u03/grammatik.json`
- Create: `server/content/daf/a1/u03/redemittel.json`

**Interfaces:**
- Consumes: Task 1 so'zlari va yordamchilari.
- Produces: 5 qoida (`section` har bo'limga bitta), 15 ibora (`funktionUz` unit ichida noyob).

- [ ] **Step 1: `grammatik.json` — `{"unit": "u03", "regeln": [...]}`**

```json
[
{"section":"u03-s1","titelDe":"Bestimmter Artikel: der, die, das","titelUz":"Aniq artikl: der, die, das",
 "erklaerungUz":"Nemis tilida har bir otning o'z artikli bor: erkak jinsi — «der», ayol jinsi — «die», o'rta jins — «das». Artiklni so'zning ma'nosidan topib bo'lmaydi, shuning uchun so'zni doim artikli bilan birga yodlang: der Bahnhof, die Post, das Kino. Biror narsa birinchi marta tilga olinganda «ein/eine» ishlatiladi, keyin esa «der/die/das»: «Gibt es hier ein Kino? – Ja, das Kino ist neu.» Ko'plikda hamma so'z «die» oladi: die Hotels.",
 "beispiele":[
  {"de":"Das ist die Bank.","uz":"Bu bank."},
  {"de":"Der Bahnhof ist hier.","uz":"Vokzal shu yerda."},
  {"de":"Das Kino ist sehr neu.","uz":"Kinoteatr juda yangi."},
  {"de":"Der Park ist sehr groß.","uz":"Park juda katta."},
  {"de":"Gibt es hier ein Hotel?","uz":"Bu yerda mehmonxona bormi?"}]},
{"section":"u03-s2","titelDe":"Wo? — in, an, neben","titelUz":"Qayerda? — in, an, neben",
 "erklaerungUz":"«Wo?» (qayerda?) savoliga javob berganda «in», «an», «neben», «zwischen» dan keyin artikl o'zgaradi: der → dem, das → dem, die → der. «in» va «dem» qo'shilib «im», «an» va «dem» qo'shilib «am» bo'ladi: der Park → im Park, der Bahnhof → am Bahnhof, das Kino → neben dem Kino, die Bank → neben der Bank.",
 "beispiele":[
  {"de":"Die Post ist neben der Bank.","uz":"Pochta bank yonida."},
  {"de":"Das Hotel ist am Bahnhof.","uz":"Mehmonxona vokzal oldida."},
  {"de":"Die Polizei ist an der Ecke.","uz":"Politsiya ko'cha burchagida."},
  {"de":"Das Kino ist zwischen dem Park und der Post.","uz":"Kinoteatr park bilan pochta orasida."},
  {"de":"Die Toilette ist dort links.","uz":"Hojatxona ana u yerda, chap tomonda."}]},
{"section":"u03-s3","titelDe":"zum/zur und Imperativ (Sie)","titelUz":"zum/zur va buyruq shakli",
 "erklaerungUz":"Biror joyga yo'nalishni «zu» bilan aytamiz: zu + dem = «zum» (der va das so'zlari oldida), zu + der = «zur» (die so'zlari oldida): zum Bahnhof, zum Hotel, zur Post. Rasmiy («Sie») buyruq gapida fe'l gap boshiga chiqadi, undan keyin «Sie» keladi: «Gehen Sie geradeaus.» — «To'g'riga yuring.», «Nehmen Sie die erste Straße links.» — «Birinchi ko'chadan chapga kiring.»",
 "beispiele":[
  {"de":"Wie komme ich zum Bahnhof?","uz":"Vokzalga qanday boraman?"},
  {"de":"Wie komme ich zur Post?","uz":"Pochtaga qanday boraman?"},
  {"de":"Gehen Sie hier geradeaus.","uz":"Shu yerdan to'g'riga yuring."},
  {"de":"Nehmen Sie die zweite Straße rechts.","uz":"Ikkinchi ko'chadan o'ngga kiring."},
  {"de":"Gehen Sie bis zur Ampel.","uz":"Svetoforgacha yuring."}]},
{"section":"u03-s4","titelDe":"mit + Dativ","titelUz":"mit — transport bilan",
 "erklaerungUz":"Qanday transportda borishni «mit» bilan aytamiz. «mit» dan keyin ham artikl o'zgaradi: der → dem, das → dem, die → der: mit dem Bus, mit dem Auto, mit der U-Bahn. Piyoda borish esa boshqacha aytiladi: «zu Fuß» — bu yerda «mit» ishlatilmaydi. «fahren» fe'li «du» va «er/sie» da o'zgaradi: ich fahre, du fährst, er fährt.",
 "beispiele":[
  {"de":"Ich fahre mit dem Bus.","uz":"Men avtobusda boraman."},
  {"de":"Fährst du mit der U-Bahn?","uz":"Sen metroda borasanmi?"},
  {"de":"Anna fährt mit dem Fahrrad.","uz":"Anna velosipedda boradi."},
  {"de":"Wir fahren mit dem Zug.","uz":"Biz poyezdda boramiz."},
  {"de":"Lukas geht zu Fuß.","uz":"Lukas piyoda boradi."}]},
{"section":"u03-s5","titelDe":"Das Verb auf Platz 2","titelUz":"Fe'l doim ikkinchi o'rinda",
 "erklaerungUz":"Oddiy darak gapda fe'l doim IKKINCHI o'rinda turadi. Gap vaqt so'zi bilan boshlansa (heute, manchmal, dann), ega fe'ldan keyinga o'tadi: «Ich fahre heute mit dem Bus.» → «Heute fahre ich mit dem Bus.» Ikkala gap ham to'g'ri, faqat birinchi o'rinda nima turgani o'zgaradi.",
 "beispiele":[
  {"de":"Heute fahre ich mit dem Bus.","uz":"Bugun men avtobusda boraman."},
  {"de":"Manchmal gehe ich zu Fuß.","uz":"Ba'zan men piyoda boraman."},
  {"de":"Dann warte ich lange.","uz":"Keyin men uzoq kutaman."},
  {"de":"Der Weg dauert zwanzig Minuten.","uz":"Yo'l yigirma daqiqa oladi."},
  {"de":"Oft fährt Julia mit dem Fahrrad.","uz":"Julia tez-tez velosipedda boradi."}]}
]
```

- [ ] **Step 2: `redemittel.json` — `{"unit": "u03", "phrasen": [...]}`**

```json
[
{"section":"u03-s1","funktion":"einen Ort zeigen","funktionUz":"binoni ko'rsatib, nomini aytish","de":"Das ist der Bahnhof.","uz":"Bu vokzal."},
{"section":"u03-s1","funktion":"fragen, ob es etwas gibt","funktionUz":"biror joy bor-yo'qligini so'rash","de":"Gibt es hier ein Kino?","uz":"Bu yerda kinoteatr bormi?"},
{"section":"u03-s1","funktion":"einen Ort beschreiben","funktionUz":"binoning qandayligini aytish","de":"Das Museum ist sehr alt.","uz":"Muzey juda eski."},
{"section":"u03-s2","funktion":"nach dem Ort fragen","funktionUz":"joy qayerdaligini so'rash","de":"Entschuldigung, wo ist die Post?","uz":"Kechirasiz, pochta qayerda?"},
{"section":"u03-s2","funktion":"sagen, wo etwas ist","funktionUz":"joy nimaning yonida ekanini aytish","de":"Die Post ist neben der Bank.","uz":"Pochta bank yonida."},
{"section":"u03-s2","funktion":"nach der Entfernung fragen","funktionUz":"uzoq-yaqinligini so'rash","de":"Ist das weit?","uz":"Bu uzoqmi?"},
{"section":"u03-s3","funktion":"nach dem Weg fragen","funktionUz":"biror joyga qanday borishni so'rash","de":"Wie komme ich zum Bahnhof?","uz":"Vokzalga qanday boraman?"},
{"section":"u03-s3","funktion":"geradeaus schicken","funktionUz":"to'g'riga yurishni aytish","de":"Gehen Sie hier geradeaus.","uz":"Shu yerdan to'g'riga yuring."},
{"section":"u03-s3","funktion":"sagen, in welche Straße man geht","funktionUz":"qaysi ko'chaga kirishni aytish","de":"Nehmen Sie die erste Straße links.","uz":"Birinchi ko'chadan chapga kiring."},
{"section":"u03-s4","funktion":"nach dem Verkehrsmittel fragen","funktionUz":"avtobusda borish-bormasligini so'rash","de":"Fährst du mit dem Bus?","uz":"Avtobusda borasanmi?"},
{"section":"u03-s4","funktion":"das Verkehrsmittel nennen","funktionUz":"metroda borishini aytish","de":"Ich fahre mit der U-Bahn.","uz":"Men metroda boraman."},
{"section":"u03-s4","funktion":"sagen, dass man zu Fuß geht","funktionUz":"piyoda borishini aytish","de":"Ich gehe zu Fuß.","uz":"Men piyoda boraman."},
{"section":"u03-s5","funktion":"nach der Dauer fragen","funktionUz":"yo'l qancha vaqt olishini so'rash","de":"Wie lange dauert das?","uz":"Bu qancha vaqt oladi?"},
{"section":"u03-s5","funktion":"die Dauer nennen","funktionUz":"yo'l qancha vaqt olishini aytish","de":"Das dauert zwanzig Minuten.","uz":"Bu yigirma daqiqa oladi."},
{"section":"u03-s5","funktion":"über Gewohnheiten sprechen","funktionUz":"har kungi odatini aytish","de":"Ich fahre immer mit dem Fahrrad.","uz":"Men doim velosipedda boraman."}
]
```

- [ ] **Step 3: Tekshiruv**

Run: `cd server && npm run daf:inhalt-check -- --unit 3`
Expected: FAIL, FAQAT `u03: dialoge.json yo'q`.

- [ ] **Step 4: Commit**

```bash
git add server/content/daf/a1/u03/grammatik.json server/content/daf/a1/u03/redemittel.json
git commit -m "content: A1 unit 3 grammar rules and phrases"
```

---

### Task 3: Dialoglar va eshitish savollari

**Files:**
- Create: `server/content/daf/a1/u03/dialoge.json`

**Interfaces:**
- Consumes: Task 1 so'zlari; `stimmen.json` dagi obraz ismlari.
- Produces: 6 dialog (`id` `u03-d1`…`u03-d6`), har birida aniq 2 `fragen`.

- [ ] **Step 1: `dialoge.json` — `{"unit": "u03", "dialoge": [...]}`**

```json
[
{"id":"u03-d1","section":"u03-s1","titelDe":"Was ist das?","titelUz":"Bu nima?",
 "zeilen":[
  {"sprecher":"Jonas","de":"Mia, was ist das?","uz":"Mia, bu nima?"},
  {"sprecher":"Mia","de":"Das ist das Museum.","uz":"Bu muzey."},
  {"sprecher":"Jonas","de":"Ist das Museum neu?","uz":"Muzey yangimi?"},
  {"sprecher":"Mia","de":"Nein, das Museum ist sehr alt.","uz":"Yo'q, muzey juda eski."},
  {"sprecher":"Jonas","de":"Und das? Ist das die Polizei?","uz":"Anavi-chi? Politsiyami?"},
  {"sprecher":"Mia","de":"Ja, das ist die Polizei.","uz":"Ha, bu politsiya."}],
 "fragen":[
  {"frageDe":"Wie ist das Museum?","frageUz":"Muzey qanday?","richtig":"sehr alt","falsch":["sehr neu","sehr klein"]},
  {"frageDe":"Das ist das Museum. Und das?","frageUz":"Bu muzey. Anavi-chi?","richtig":"die Polizei","falsch":["die Post","die Bank"]}]},
{"id":"u03-d2","section":"u03-s1","titelDe":"Gibt es hier ein Kino?","titelUz":"Bu yerda kinoteatr bormi?",
 "zeilen":[
  {"sprecher":"Anna","de":"Markus, gibt es hier ein Kino?","uz":"Markus, bu yerda kinoteatr bormi?"},
  {"sprecher":"Markus","de":"Ja, das Kino ist neu.","uz":"Ha, kinoteatr yangi."},
  {"sprecher":"Anna","de":"Und ein Hotel? Meine Eltern kommen.","uz":"Mehmonxona-chi? Ota-onam kelishyapti."},
  {"sprecher":"Markus","de":"Ein Hotel gibt es auch. Es ist klein.","uz":"Mehmonxona ham bor. U kichkina."},
  {"sprecher":"Anna","de":"Danke!","uz":"Rahmat!"},
  {"sprecher":"Markus","de":"Bitte!","uz":"Arzimaydi!"}],
 "fragen":[
  {"frageDe":"Wie ist das Kino?","frageUz":"Kinoteatr qanday?","richtig":"neu","falsch":["alt","klein"]},
  {"frageDe":"Wer kommt?","frageUz":"Kim kelyapti?","richtig":"die Eltern","falsch":["die Kinder","die Kollegen"]}]},
{"id":"u03-d3","section":"u03-s2","titelDe":"Wo ist die Post?","titelUz":"Pochta qayerda?",
 "zeilen":[
  {"sprecher":"Claudia","de":"Entschuldigung, wo ist die Post?","uz":"Kechirasiz, pochta qayerda?"},
  {"sprecher":"Peter","de":"Die Post ist neben der Bank.","uz":"Pochta bankning yonida."},
  {"sprecher":"Claudia","de":"Neben der Bank? Und wo ist die Bank?","uz":"Bank yonidami? Bank qayerda?"},
  {"sprecher":"Peter","de":"Die Bank ist dort, an der Ecke.","uz":"Bank ana u yerda, burchakda."},
  {"sprecher":"Claudia","de":"Ist das weit?","uz":"Uzoqmi?"},
  {"sprecher":"Peter","de":"Nein, das ist nicht weit.","uz":"Yo'q, uzoq emas."},
  {"sprecher":"Claudia","de":"Danke!","uz":"Rahmat!"},
  {"sprecher":"Peter","de":"Bitte!","uz":"Arzimaydi!"}],
 "fragen":[
  {"frageDe":"Wo ist die Post?","frageUz":"Pochta qayerda?","richtig":"neben der Bank","falsch":["neben dem Kino","neben dem Hotel"]},
  {"frageDe":"Wo ist die Bank?","frageUz":"Bank qayerda?","richtig":"an der Ecke","falsch":["im Park","am Bahnhof"]}]},
{"id":"u03-d4","section":"u03-s3","titelDe":"Wie komme ich zum Bahnhof?","titelUz":"Vokzalga qanday boraman?",
 "zeilen":[
  {"sprecher":"Helga","de":"Entschuldigung, wie komme ich zum Bahnhof?","uz":"Kechirasiz, vokzalga qanday boraman?"},
  {"sprecher":"Thomas","de":"Gehen Sie hier geradeaus.","uz":"Shu yerdan to'g'riga yuring."},
  {"sprecher":"Helga","de":"Und dann?","uz":"Keyin-chi?"},
  {"sprecher":"Thomas","de":"An der Ampel gehen Sie links.","uz":"Svetoforda chapga buriling."},
  {"sprecher":"Helga","de":"An der Ampel links. Gut.","uz":"Svetoforda chapga. Yaxshi."},
  {"sprecher":"Thomas","de":"Dann nehmen Sie die zweite Straße rechts.","uz":"Keyin o'ngdagi ikkinchi ko'chaga kiring."},
  {"sprecher":"Helga","de":"Danke!","uz":"Rahmat!"},
  {"sprecher":"Thomas","de":"Bitte!","uz":"Arzimaydi!"}],
 "fragen":[
  {"frageDe":"Wo geht Helga links?","frageUz":"Helga qayerda chapga buriladi?","richtig":"an der Ampel","falsch":["an der Ecke","am Bahnhof"]},
  {"frageDe":"Was nimmt Helga dann?","frageUz":"Keyin Helga qaysi ko'chaga kiradi?","richtig":"die zweite Straße rechts","falsch":["die erste Straße rechts","die zweite Straße links"]}]},
{"id":"u03-d5","section":"u03-s4","titelDe":"Mit dem Bus oder mit der U-Bahn?","titelUz":"Avtobusdami yoki metrodami?",
 "zeilen":[
  {"sprecher":"Sabine","de":"Lukas, fährst du mit dem Bus?","uz":"Lukas, avtobusda borasanmi?"},
  {"sprecher":"Lukas","de":"Nein, ich fahre mit der U-Bahn.","uz":"Yo'q, metroda boraman."},
  {"sprecher":"Sabine","de":"Mit der U-Bahn? Wo ist die Haltestelle?","uz":"Metrodami? Bekat qayerda?"},
  {"sprecher":"Lukas","de":"Die Haltestelle ist neben dem Kino.","uz":"Bekat kinoteatr yonida."},
  {"sprecher":"Sabine","de":"Fährt die U-Bahn zum Museum?","uz":"Metro muzeygacha boradimi?"},
  {"sprecher":"Lukas","de":"Ja, die U-Bahn fährt zum Museum.","uz":"Ha, metro muzeygacha boradi."}],
 "fragen":[
  {"frageDe":"Wie fährt Lukas?","frageUz":"Lukas nimada boradi?","richtig":"mit der U-Bahn","falsch":["mit dem Bus","mit dem Taxi"]},
  {"frageDe":"Wo ist die Haltestelle?","frageUz":"Bekat qayerda?","richtig":"neben dem Kino","falsch":["neben der Post","an der Ecke"]}]},
{"id":"u03-d6","section":"u03-s5","titelDe":"Wie kommst du zur Arbeit?","titelUz":"Ishga qanday borasan?",
 "zeilen":[
  {"sprecher":"Walter","de":"Julia, wie kommst du zur Arbeit?","uz":"Julia, ishga qanday borasan?"},
  {"sprecher":"Julia","de":"Ich fahre immer mit dem Fahrrad.","uz":"Doim velosipedda boraman."},
  {"sprecher":"Walter","de":"Mit dem Fahrrad? Wie lange dauert das?","uz":"Velosipeddami? Qancha vaqt oladi?"},
  {"sprecher":"Julia","de":"Zwanzig Minuten.","uz":"Yigirma daqiqa."},
  {"sprecher":"Walter","de":"Fährst du manchmal mit dem Zug?","uz":"Ba'zan poyezdda ham borasanmi?"},
  {"sprecher":"Julia","de":"Ja, manchmal. Dann warte ich oft lange.","uz":"Ha, ba'zan. Unda ko'pincha uzoq kutaman."}],
 "fragen":[
  {"frageDe":"Wie fährt Julia zur Arbeit?","frageUz":"Julia ishga nimada boradi?","richtig":"mit dem Fahrrad","falsch":["mit dem Auto","mit dem Bus"]},
  {"frageDe":"Wie lange dauert der Weg mit dem Fahrrad?","frageUz":"Velosipedda yo'l qancha vaqt oladi?","richtig":"zwanzig Minuten","falsch":["zehn Minuten","dreißig Minuten"]}]}
]
```

- [ ] **Step 2: Tekshiruv — matn toza**

Run: `cd server && npm run daf:inhalt-check -- --unit 3`
Expected: PASS — `u03: matn toza.`

- [ ] **Step 3: Commit**

```bash
git add server/content/daf/a1/u03/dialoge.json
git commit -m "content: A1 unit 3 dialogs with listening questions"
```

---

### Task 4: Gaplar

**Files:**
- Create: `server/content/daf/a1/u03/saetze.json`

**Interfaces:**
- Consumes: Task 1 so'zlari va yordamchilari.
- Produces: 50 gap (`sourceId` `u03-sN-NN`), `origin: "GENERATED"`, `wordCount` haqiqiy son.

- [ ] **Step 1: `saetze.json` — `{"unit": "u03", "saetze": [...]}`**

Har yozuv: `{"sourceId", "section", "de", "uz", "wordCount", "origin": "GENERATED"}` + bo'lsa `"akzeptiert": [...]`. Jadval ustunlari shu tartibda (`wordCount` = `de` dan `.,!?` olib tashlab, bo'sh joy bo'yicha sanalgan son):

| sourceId | de | uz | akzeptiert |
| --- | --- | --- | --- |
| u03-s1-01 | Der Bahnhof ist sehr alt. | Vokzal juda eski. | — |
| u03-s1-02 | Die Post ist hier. | Pochta shu yerda. | Hier ist die Post. |
| u03-s1-03 | Gibt es hier eine Bank? | Bu yerda bank bormi? | — |
| u03-s1-04 | Ist das Kino neu? | Kinoteatr yangimi? | — |
| u03-s1-05 | Ist das die Polizei? | Bu politsiyami? | — |
| u03-s1-06 | Das Hotel ist klein. | Mehmonxona kichkina. | — |
| u03-s1-07 | Wo ist die Toilette? | Hojatxona qayerda? | — |
| u03-s1-08 | Der Platz ist sehr groß. | Maydon juda katta. | — |
| u03-s1-09 | Das Museum ist nicht neu. | Muzey yangi emas. | — |
| u03-s1-10 | Ist der Park groß? | Park kattami? | — |
| u03-s2-01 | Die Bank ist neben der Post. | Bank pochta yonida. | Neben der Post ist die Bank. |
| u03-s2-02 | Das Kino ist am Park. | Kinoteatr park oldida. | Am Park ist das Kino. |
| u03-s2-03 | Die Bank ist an der Ecke. | Bank ko'cha burchagida. | An der Ecke ist die Bank. |
| u03-s2-04 | Der Park ist links. | Park chap tomonda. | Links ist der Park. |
| u03-s2-05 | Die Toilette ist dort rechts. | Hojatxona ana u yerda, o'ng tomonda. | Dort rechts ist die Toilette. |
| u03-s2-06 | Ist die Post weit? | Pochta uzoqmi? | — |
| u03-s2-07 | Die Post ist zwischen zwei Banken. | Pochta ikkita bank orasida. | Zwischen zwei Banken ist die Post. |
| u03-s2-08 | Entschuldigung, wo ist hier eine Bank? | Kechirasiz, bu yerda bank qayerda? | — |
| u03-s2-09 | Das Hotel ist nicht weit. | Mehmonxona uzoq emas. | — |
| u03-s2-10 | Die Straße ist sehr klein. | Ko'cha juda kichkina. | — |
| u03-s3-01 | Wie komme ich zur Bank? | Bankka qanday boraman? | — |
| u03-s3-02 | Gehen Sie geradeaus. | To'g'riga yuring. | — |
| u03-s3-03 | Ich nehme die erste Straße rechts. | Men birinchi ko'chadan o'ngga buraman. | — |
| u03-s3-04 | Ich suche das Hotel. | Men mehmonxonani qidiryapman. | Das Hotel suche ich. |
| u03-s3-05 | Ich finde die Post nicht. | Men pochtani topa olmayapman. | Die Post finde ich nicht. |
| u03-s3-06 | Die Ampel ist dort. | Svetofor ana u yerda. | Dort ist die Ampel. |
| u03-s3-07 | Dann gehen Sie rechts. | Keyin o'ngga yuring. | Gehen Sie dann rechts. |
| u03-s3-08 | Suchst du das Kino? | Sen kinoteatrni qidiryapsanmi? | — |
| u03-s3-09 | Nimmst du die zweite Straße? | Sen ikkinchi ko'chaga kirasanmi? | — |
| u03-s3-10 | Gehen Sie hier links. | Shu yerdan chapga yuring. | — |
| u03-s4-01 | Wir fahren mit dem Auto. | Biz mashinada boramiz. | Mit dem Auto fahren wir. |
| u03-s4-02 | Fährt die Straßenbahn zum Bahnhof? | Tramvay vokzalgacha boradimi? | — |
| u03-s4-03 | Wo ist die Haltestelle? | Bekat qayerda? | — |
| u03-s4-04 | Mein Bruder fährt mit dem Taxi. | Akam taksida boradi. | Mit dem Taxi fährt mein Bruder. |
| u03-s4-05 | Gehst du zu Fuß? | Sen piyoda borasanmi? | — |
| u03-s4-06 | Mia fährt mit dem Zug. | Mia poyezdda boradi. | Mit dem Zug fährt Mia. |
| u03-s4-07 | Die Haltestelle ist dort links. | Bekat ana u yerda, chap tomonda. | Dort links ist die Haltestelle. |
| u03-s4-08 | Fahren Sie mit der U-Bahn. | Metroda boring. | — |
| u03-s4-09 | Das Fahrrad ist klein. | Velosiped kichkina. | — |
| u03-s4-10 | Der Bus ist nicht hier. | Avtobus shu yerda emas. | — |
| u03-s5-01 | Heute fahre ich mit dem Taxi. | Bugun men taksida boraman. | Ich fahre heute mit dem Taxi. · Mit dem Taxi fahre ich heute. |
| u03-s5-02 | Ich fahre immer mit der U-Bahn. | Men doim metroda boraman. | Mit der U-Bahn fahre ich immer. |
| u03-s5-03 | Manchmal fahre ich mit dem Fahrrad. | Ba'zan men velosipedda boraman. | Ich fahre manchmal mit dem Fahrrad. · Mit dem Fahrrad fahre ich manchmal. |
| u03-s5-04 | Der Weg zur Arbeit dauert lange. | Ishga boradigan yo'l uzoq vaqt oladi. | — |
| u03-s5-05 | Ich warte oft lange. | Men tez-tez uzoq kutaman. | Oft warte ich lange. |
| u03-s5-06 | Wie lange dauert der Weg? | Yo'l qancha vaqt oladi? | — |
| u03-s5-07 | Das dauert dreißig Minuten. | Bu o'ttiz daqiqa oladi. | — |
| u03-s5-08 | Wartest du hier? | Sen shu yerda kutyapsanmi? | — |
| u03-s5-09 | Heute gehe ich zu Fuß zur Arbeit. | Bugun men ishga piyoda boraman. | Ich gehe heute zu Fuß zur Arbeit. · Zur Arbeit gehe ich heute zu Fuß. |
| u03-s5-10 | Mein Vater fährt oft mit dem Zug. | Otam tez-tez poyezdda boradi. | Oft fährt mein Vater mit dem Zug. · Mit dem Zug fährt mein Vater oft. |

`·` — bir nechta muqobil (JSON da massiv elementlari).

Nega shunday (keyingi tahrirchi uchun): gaplarda `Nehmen Sie …` va `Gehen Sie … die … Straße` ishlatilmaydi, chunki `LUECKE` infinitiv shaklidagi `Nehmen` ni bo'shatsa `Gehen` ham to'g'ri javob bo'lib qoladi (Goethe misoli: «Gehen Sie die nächste Straße links.»). Shuning uchun gapda `nehme` / `nimmst` (bo'shatilmaydi), buyruq esa qoida misolida va iborada.

- [ ] **Step 2: Qo'riqchilar**

Run: `cd server && npm run daf:inhalt-check -- --unit 3`
Expected: `u03: matn toza.`

Run: `npx jest src/daf`
Expected: PASS (u03 ning `describe.each` bloklari endi ishlaydi: so'zlar, grammatika, dialoglar, gaplar).

Run: `npm run typecheck && npx eslint src`
Expected: ikkalasi ham exit 0 (kod o'zgarmagan — bu faqat shox sog'ligini tasdiqlaydi).

- [ ] **Step 3: Commit**

```bash
git add server/content/daf/a1/u03/saetze.json
git commit -m "content: A1 unit 3 practice sentences"
```

---

### Task 5: Ikkinchi to'g'ri javobni qo'lda tekshirish

**Files:**
- Modify (faqat topilma bo'lsa): `server/content/daf/a1/u03/*.json`
- Scratch (repo'ga kirmaydi): `<scratchpad>/luecke-audit.py`

- [ ] **Step 1: Dialog chalg'ituvchilari ro'yxati**

Skript `dialog-fragen.ts` qoidalarini takrorlaydi: nishon = birinchi satrdan boshqa, matni dialogda bir marta uchraydigan, boshqa satr ichida yotmagan satr; chalg'ituvchi = boshqa dialogning shu dialog satriga (normallashtirilgan holda) teng bo'lmagan satri.

```python
import json, re
D = json.load(open("server/content/daf/a1/u03/dialoge.json"))["dialoge"]
norm = lambda s: re.sub(r"[.,!?]", "", s).lower().strip()
for d in D:
    texts = [norm(z["de"]) for z in d["zeilen"]]
    own = set(texts)
    pool = sorted({z["de"] for o in D if o["id"] != d["id"] for z in o["zeilen"] if norm(z["de"]) not in own})
    for i, z in enumerate(d["zeilen"][1:], start=1):
        t = texts[i]
        if texts.count(t) > 1 or any(j != i and t in texts[j] for j in range(len(texts))):
            continue
        prev = d["zeilen"][i-1]["de"]; nxt = d["zeilen"][i+1]["de"] if i+1 < len(d["zeilen"]) else "—"
        print(f"\n{d['id']} #{i}  [{prev}] ___ [{nxt}]\n  TO'G'RI: {z['de']}")
        for p in pool: print("   ?", p)
```

Run: `python3 <scratchpad>/luecke-audit.py`
Har nishon uchun ro'yxatni ko'z bilan o'tish: oldingi va keyingi qator orasiga «?» bilan boshlangan birorta qator TO'G'RI javob bo'lib qolsa — o'sha satrni o'z mavzusiga bog'lab qayta yozish (dizayn 7-bo'lim, 2–3-qoida).

- [ ] **Step 2: Iboralar juftligi (REAKTION / ZUORDNEN)**

Run: `python3 -c "import json; [print(p['funktionUz'], '→', p['de']) for p in json.load(open('server/content/daf/a1/u03/redemittel.json'))['phrasen']]"`
Har vaziyat uchun: boshqa 14 iboradan birortasi ham shu vaziyatga to'g'ri kelmasligini tekshirish. Kelsa — `funktionUz` ni aniqlashtirish.

- [ ] **Step 3: Gap bo'shlig'i (LUECKE)**

Har gapda bo'shatilishi mumkin bo'lgan so'zlar = gapdagi u03 asosiy so'zlariga TOKEN sifatida teng so'zlar. Har biri uchun: o'zbekcha tarjima faqat shu so'zni qoldiradimi? (`yonida`→neben, `orasida`→zwischen, `doim/tez-tez/ba'zan`, `chapga/o'ngga`, `yuring`→gehen, `boring/boramiz`→fahren.)

- [ ] **Step 4: Topilma bo'lsa tuzatish, qo'riqchilarni qayta yuritish, commit**

Run: `cd server && npm run daf:inhalt-check -- --unit 3 && npx jest src/daf/inhalt`
Expected: toza / PASS.

```bash
git add server/content/daf/a1/u03
git commit -m "content: A1 unit 3 — remove second correct answers found in review"
```

---

### Task 6: Nemis tili ko'rigi (alohida agent)

- [ ] **Step 1: Agent yuborish** — `general-purpose`, model `opus`, faqat O'QIYDI, fayl o'zgartirmaydi. Topshiriq:

> You are a native-level German teacher (DaF, A1) reviewing a course unit for Uzbek-speaking adults. Read these files in `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/a1-uchinchi-unit/server/content/daf/a1/`: `u03/woerter.json`, `u03/grammatik.json`, `u03/redemittel.json`, `u03/dialoge.json`, `u03/saetze.json`; for context `kurs.json` (unit u03) and `u02/saetze.json` (house style). Report, as a numbered list with file + id + exact text + proposed fix:
> 1. Any German that is ungrammatical, unidiomatic, or wrong for A1 (articles, Dativ after in/an/neben/mit/zu, word order, capitalisation, punctuation).
> 2. For every sentence in `saetze.json`: every OTHER word order that uses exactly the same words and is correct German, missing from `akzeptiert`; and any `akzeptiert` entry that is not correct German.
> 3. `LUECKE` risk: the exercise blanks one word of the sentence that equals a unit-3 core word from `woerter.json`, shows the Uzbek translation (`uz`) as the only hint, and the learner TYPES the word. Flag any sentence where, given that hint, a different word would also be correct.
> 4. `DIALOG_LUECKE` risk: one line of a dialog (never the first) is blanked; the wrong options are lines from the OTHER five dialogs. Flag any line from another dialog that would ALSO be a correct fill for some blank.
> 5. `REAKTION`/`ZUORDNEN` risk in `redemittel.json`: the learner sees `funktionUz` (Uzbek situation) and picks the German phrase. Flag any situation that two phrases fit.
> 6. Listening questions (`fragen` in `dialoge.json`): each must be answerable from the dialog alone, with exactly one correct option.
> 7. Uzbek (`uz`) translations that are wrong, unnatural, or ambiguous (Latin script only).
> Do not rewrite files. Be concrete; skip praise.

- [ ] **Step 2: Topilmalarni saralash va tuzatish** — har topilma: qabul (tuzatiladi) yoki rad (sababi bilan). Progressiyani buzadigan tuzatish (yangi so'z) qabul qilinmaydi — o'rniga boshqa ifoda.

- [ ] **Step 3: Qo'riqchilar va commit**

Run: `cd server && npm run daf:inhalt-check -- --unit 3 && npx jest src/daf`
Expected: toza / PASS.

```bash
git add server/content/daf/a1/u03
git commit -m "content: A1 unit 3 — apply German language review"
```

---

### Task 7: Dev bazaga yuklab ko'rish

**Files:** yo'q (faqat dev baza).

- [ ] **Step 1: `.env` ni ulash** — worktree `server/.env` yo'q bo'lsa: `ln -s /Users/a1111/Desktop/daf-erp-system/server/.env server/.env` (dev baza, prod emas — `project_production_db_access`).

- [ ] **Step 2: Seed**

Run: `cd server && npm run daf:inhalt-seed -- --unit 3`
Expected: xatosiz tugaydi. Skelet yo'q bo'lsa (dev bazada u03 bo'limlari yo'q) — avval `npm run daf:a1-seed`.

- [ ] **Step 3: Qayta seed (idempotentlik)**

Run: `npm run daf:inhalt-seed -- --unit 3` (ikkinchi marta)
Expected: xatosiz; sonlar o'zgarmaydi.

- [ ] **Step 4: O'qib tekshirish** — read-only so'rov: u03 da `DafLexeme` 50, `DafGrammar` 5, `DafPhrase` 15, `DafDialog` 6, `DafHoerFrage` 12, `DafSentence` 50.

---

### Task 8: CEO ko'rigi sahifasi

- [ ] **Step 1:** `artifact-design` skill'ini yuklash.
- [ ] **Step 2:** Beshta JSON fayldan bitta HTML sahifa yasash (scratchpad'da): bo'limlar bo'yicha so'zlar jadvali (nemischa + o'zbekcha, Goethe da yo'qlari belgilangan), 5 qoida (izoh + misollar), 15 ibora (vaziyat → ibora), 6 dialog (qatorma-qator + tarjima + 2 savol, to'g'ri javob belgilangan), 50 gap (tarjima + boshqa to'g'ri tartiblar). Mobil kenglikda o'qiladigan.
- [ ] **Step 3:** Artifact sifatida chiqarish, havolani CEO ga berish, «yaxshi» yoki tuzatishlarni kutish. Tuzatish bo'lsa → faylga → Task 5–6 qo'riqchilari → sahifani yangilash.

---

### Task 9: Saytga chiqarish (CEO ruxsati bilan)

Har qadam oldidan CEO dan aniq «ha» olinadi (tashqi harakat).

- [ ] **Step 1:** `git push -u origin worktree-a1-uchinchi-unit`, PR ochish (inglizcha matn, oxirida `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
- [ ] **Step 2:** CI yashil → merge.
- [ ] **Step 3:** Prod skeletni o'qib tasdiqlash (u03: 5 bo'lim, 15 dars, 1 UNIT_TEST) — read-only.
- [ ] **Step 4:** Toza `origin/main` daraxtidan prod seed: `railway run npm run daf:inhalt-seed -- --unit 3`.
- [ ] **Step 5:** Prod o'qib tekshirish (Task 7 Step 4 dagi sonlar) va `student.dafzentrum.uz` → Ta'lim → 3-unit ochilishi.
- [ ] **Step 6:** Loyiha xotirasini yangilash (`project_a1_unit_qoshish_tartibi.md`, `project_a1_kurs_poydevor.md`, `MEMORY.md`).
