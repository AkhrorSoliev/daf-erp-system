# /media sahifasini qayta qurish — dizayn

Sana: 29.10.2026. Holat: CEO ma'qulladi (dizayn suhbatda), reja yozilmagan.
Oldingi dizayn: `2026-09-09-media-tuzilishi-design.md` — bu hujjat uni almashtiradi.

## 1. Muammo

CEO /media'ni **o'quvchi ko'zi bilan tekshirish** uchun ochadi: har bir seans va
mashqni o'quvchi qanday ko'rsa, shunday ko'rib-eshitib, xatoni topish. Hozirgi
sahifa bunga to'g'ri kelmaydi:

1. **Player.** Har karnay tugmasi (`OvozTugmasi`) o'z `<audio>`siga ega —
   ikkinchisi bosilsa birinchisi to'xtamaydi, ovozlar ustma-ust chiqadi. Tugma
   faqat boshidan qo'yadi: pauza, siljitish, vaqt yo'q. Dialogning to'liq audiosi
   ham shu kichik tugma bilan.
2. **Tuzilish o'quvchinikiga mos emas.** O'quvchi: unit → bo'lim → seans
   (Tanishuv · Ishlatish · O'tish sinovi · Yakuniy sinov) → mashqlar. /media:
   unit → bo'lim → «Material» / «Savollar», savollar 20 ta texnik format nomi
   (PAAR, LUECKE…) bo'yicha. «Shu seansda o'quvchi nimani ko'radi?» degan savolga
   javob yo'q.
3. **Chalkashlik.** Bosh sahifa — 5 raqamli ustunli qamrov jadvali, ma'nosi rangli
   nuqtalarda; ikki yorliqda «Ko'lam» tushuntirishi (ular boshqa-boshqa to'plamni
   sanaydi); obrazlar alohida sahifada.

## 2. Muhim fakt: seans qat'iy emas

Seans savollari bazada yozilmagan. `UebungService.seans()` har safar katta
to'plamdan (`baueKandidaten`) tasodifiy 12 tasini tanlaydi (`UNIT_TEST` — 15).
Seans turi faqat **qaysi formatlar oldinroq chiqishini** belgilaydi
(`uebung/kind-formate.ts`, `bevorzugteFormate`):

- `SECTION_A` (Tanishuv) va `SECTION_B` (Ishlatish) — **bir xil to'plam**,
  farqi faqat afzal formatlarda (har biri 8 tadan).
- `BRIDGE` (O'tish sinovi) — afzallik yo'q, aralash.
- `UNIT_TEST` (Yakuniy sinov) — butun unit, 6 ta afzal format.

Demak «seansning mashqlari» = **shu seansdan chiqishi mumkin bo'lgan barcha
savollar** + afzal formatlar belgisi. Tanishuv va Ishlatish ro'yxatlari ko'p
jihatdan bir xil bo'ladi — bu xato emas, dvigatelning o'zi shunday.

## 3. Qaror

### 3.1 Sahifa tuzilishi — daraxt + mazmun

Bitta sahifa `/media`, ikki ustun:

- **Chapda daraxt** (doim ko'rinadi): daraja → unit → bo'lim → seanslar; unit
  oxirida O'tish sinovi va Yakuniy sinov. Bo'lim yonida kamchilik sariq matnda
  («4 ovoz yo'q», «2 rasm yo'q») — qamrov raqamlari endi shu yerda, alohida
  jadval yo'q. Daraxt pastida «Obrazlar va fayllar» havolasi (`/media/assets`,
  o'zgarmaydi).
- **O'ngda mazmun:**
  - bo'lim tanlansa — **bo'lim materiali**: so'zlar (rasm bilan), gaplar,
    iboralar, dialoglar (qatorlari, savollari, to'liq audiosi);
  - seans tanlansa — **seans sahifasi** (3.2).
- **Telefonda** daraxt `Sheet` ichiga yashirinadi, tepada «Bo'limlar» tugmasi.
- **Manzil:** `?bolim=<sectionId>` yoki `?seans=<lessonId>` (bittasi). Hech biri
  bo'lmasa — birinchi unitning birinchi bo'limi. Yangilash va havola o'sha joyni
  ochadi (`router.replace`, `scroll: false`). Daraxtning qaysi uniti ochiq ekani
  tanlangan joydan kelib chiqadi, manzilga yozilmaydi.
- Eski `/media/sections/[id]` → `/media?bolim=[id]` ga server `redirect()`
  (tashqi havolalar buzilmasin). `?tab=` / `?format=` tashlab yuboriladi.
- Breadcrumb: `/media` bitta bo'lak; joriy unit › bo'lim mazmun sarlavhasida
  matn bilan.

### 3.2 Seans sahifasi

- Sarlavha: seans nomi (Tanishuv / Ishlatish / O'tish sinovi / Yakuniy sinov —
  o'quvchi ilovasidagi `seansNomi` bilan bir xil matn), unit › bo'lim.
- Izoh qatori: «Har safar shu savollardan 12 tasi tanlanadi · N ta savol · M xil
  mashq» (Yakuniy sinovda 15).
- Mashq turlari chiplari (`FORMAT_NOMLARI` — o'zbekcha nomlar, texnik kod
  ko'rinmaydi) soni bilan; bosilgan chip ro'yxatni o'sha turga suradi (filtr
  emas — sahifa hammasini ko'rsatadi, chip «ankor»). Afzal formatlar chipida
  «bu seansda ko'proq chiqadi» belgisi.
- Savollar mashq turi bo'yicha guruhlangan, har biri karta: savol (matn / audio /
  rasm / soat), variantlar, **to'g'ri javob yashil**. Hozirgi `SavolQatori`
  ko'rinishi asos qilib olinadi (barcha 20 format allaqachon chiziladi).
- **«O'quvchi kabi o'tib ko'rish»** tugmasi (3.4).

### 3.3 Umumiy player

- Sahifa pastida **bitta** player paneli, bitta `<audio>` elementi. Sahifadagi
  har bir karnay tugmasi o'z audiosini emas, shu playerni chaqiradi:
  `play(item)` — oldingisi o'z-o'zidan to'xtaydi.
- Panel: oldingisi · pauza/davom · keyingisi · nom va «2 / 18» · vaqt · siljitish
  chizig'i (`<input type="range">`) · tezlik 1× / 0,8× (`SuhbatPleyer` bilan bir
  xil ikki qiymat) · «Ketma-ket» rejimi.
- **Navbat** = joriy mazmundagi ovozli elementlar, ekrandagi tartibda (bo'limda:
  so'zlar → gaplar → iboralar → dialog qatorlari → to'liq dialog; seansda:
  savollar tartibida). Mazmun almashsa navbat ham almashadi, chalayotgan audio
  to'xtaydi.
- «Ketma-ket» yoqilganda audio tugashi bilan keyingisi boshlanadi — butun
  bo'limni birma-bir tinglab tekshirish uchun.
- Chalayotgan qator ro'yxatda ajratiladi (fon + «hozir chalyapti»), kerak bo'lsa
  ko'rinadigan joyga suriladi.
- Audio yuklanmasa — panelda «Ovoz yuklanmadi» + qayta urinish; navbat
  to'xtamaydi, keyingisiga o'tish mumkin.
- Panel hech narsa chalinmaganda ham ko'rinadi (bo'sh holat: «Eshitish uchun
  karnayni bosing»), mazmun pastki qismi panel ostida qolmasligi uchun
  joy ajratiladi.
- Klaviatura: `Space` — pauza/davom (matn maydonida emas), `←`/`→` — 5 soniya.
- Faqat /media uchun. O'quvchi ilovasidagi `OvozTugmasi` / `SuhbatPleyer`
  o'zgarmaydi.

### 3.4 «O'quvchi kabi o'tib ko'rish»

- O'quvchi ilovasining seans ekrani (`seans-ekrani.tsx`) ochiladi — xuddi
  o'quvchi ko'radigan ko'rinish, `.lumio` uslubi bilan, dialog/sahifa ichida.
- Savollar **yangi o'quvchiga** tanlangandek: hech qanday o'tgan urinish yo'q.
- **Hech narsa yozilmaydi:** `DafAttempt`, `DafSession`, `DafLessonProgress`,
  `DafLexemeState`, ball, reyting, faollik — hech biri. Bu talab testda
  tekshiriladi.
- Server: o'quvchi endpointlari (`/daf/portal/lessons/:id/uebung`,
  `/uebung/check`, `/uebung/juft`, `/abschluss`) `studentId`ni tokendan oladi va
  yozadi — ular ishlatilmaydi. Yangi, faqat o'qiydigan endpointlar
  `DafMediaController`da (`@Can('media.view')`):
  - `GET /daf/media/lessons/:id/sinov` — seansni tarixsiz quradi (dvigatelning
    o'sha `seans` yo'li, o'quvchi holati bo'sh);
  - `POST /daf/media/sinov/check`, `POST /daf/media/sinov/juft` — javobni toza
    funksiya bilan tekshiradi, hech narsa yozmaydi;
  - `GET /daf/media/lessons/:id/sinov/ersatz` — xatodan keyingi qo'shimcha
    savol, o'quvchi holatisiz.
- Mijoz: seans ekrani so'rovlarni qayerga yuborishni tashqaridan oladi (o'quvchi
  rejimi / sinov rejimi); o'quvchi rejimi o'zgarmaydi. Sinov rejimida «Ersatz»
  (xatodan keyingi qo'shimcha savol) va yakun ekrani ishlaydi, lekin yakun
  serverga yuborilmaydi — natija faqat ekranda.
- Tepada doimiy belgi: «Sinov rejimi — javoblar saqlanmaydi».

### 3.5 Ma'lumot (server)

- **Daraxt:** `GET /daf/media/coverage` kengaytiriladi — har bo'limga
  `lessons: { id, kind, order }[]`, har unitga `bridge` / `unitTest` seans id'lari.
  Bitta so'rov daraxtni ham, kamchilik belgilarini ham beradi.
- **Bo'lim materiali:** `GET /daf/media/sections/:id/inhalt` — o'zgarishsiz.
- **Seans savollari:** yangi `GET /daf/media/lessons/:id/fragen` — seans turidan
  qat'i nazar (BRIDGE, UNIT_TEST ham) shu seansning to'liq to'plami va
  `bevorzugt: FrageFormat[]`. To'plam **dvigatelning o'zi** (`baueKandidaten`)
  dan olinadi, alohida nusxa qoidadan emas — hozirgi
  `DafMediaFragenService` `baueKandidaten`ning qoidasini qayta yozgan
  («AYNAN bir xil qoida»), shunday nusxa vaqt o'tib farqlanadi. Ro'yxat «nima
  chiqishi mumkin» degan savolga javob, shuning uchun manba bitta bo'lishi shart.
- `GET /daf/media/sections/:id/fragen` endi chaqiruvchisiz qolsa — o'chiriladi
  (servis bilan birga).

## 4. Olib tashlanadi

- Qamrov jadvali (`media-coverage-section.tsx` jadvali, rangli nuqta legendasi).
- «Material» / «Savollar» yorliqlari va ikkala «Ko'lam» izohi.
- Format bo'yicha yon navigatsiya (`FormatYonRoyxati`) — o'rniga seans sahifasi.
- Ekranda texnik kodlar (PAAR, LUECKE, bo'lim kodi `A1-U02-S1`).
- /media ichida `OvozTugmasi` ishlatilishi (umumiy playerga almashadi).

## 5. Bu dizaynda QILINMAYDI

- Qidiruv maydoni (namunada bor edi; kerak bo'lsa keyin).
- Kontentni tahrirlash, audio qayta yaratish, «xato» belgisini qo'yish.
- O'quvchi ilovasi playerlari.
- Obrazlar sahifasini qayta qurish.
- Tarjima (i18n) — sahifa hozir ham faqat o'zbekcha.

## 6. Sinash

- Toza mantiq alohida fayllarda, vitest bilan (DOM'siz): daraxt qurish,
  manzil ↔ tanlov, navbat (keyingi/oldingi, ketma-ket, mazmun almashganda
  tozalash), seans izoh qatori.
- Server: `lessons/:id/fragen` ro'yxati `seans()` tanlaydigan har bir savolni
  o'z ichiga olishi (seedlangan `rnd` bilan bir necha seans → hammasi ro'yxatda);
  sinov endpointlari bazaga hech narsa yozmasligi (Prisma yozish chaqiruvlari
  yo'qligi); `@Can('media.view')` — `permission-routes` manifestiga yangi
  qatorlar.
- Brauzerda: ikki karnay ketma-ket — faqat ikkinchisi eshitiladi; siljitish;
  ketma-ket rejimi; telefon kengligida daraxt `Sheet`da; sinov rejimida seans
  oxirigacha o'tib, o'quvchi progressi o'zgarmaganini tekshirish.

## 7. Xavflar

- **Seans ekranini ikki rejimga ajratish** o'quvchi ilovasiga tegadi. O'quvchi
  rejimining xatti-harakati o'zgarmasligi kerak — mavjud testlar yashil qolishi
  va o'quvchi seansi qo'lda bir marta o'tib ko'rilishi shart.
- **Lumio uslubi admin sahifada:** `.lumio` klassi sinov oynasining ildiziga
  qo'yiladi (Radix portal tufayli — `DialogContent`ga, sahifaga emas).
- `baueKandidaten` hozir `private` va `studentId` talab qiladi — uni «tarixsiz»
  chaqirish uchun ochish o'quvchi yo'lini o'zgartirmasligi kerak.
