# A1 so'z zaxirasi — Goethe va Netzwerk so'zlari to'liq (dizayn)

**Sana:** 2026-10-04
**Bog'liq:** ADR-0011, ADR-0071, [A1 kurs dizayni](2026-09-03-a1-kurs-design.md),
[A1 mashq sifati](2026-09-30-a1-mashq-sifati-design.md),
[3-unit matni](2026-09-25-a1-uchinchi-unit-matni-design.md)

CEO 03.10, 4-unit ishi boshlanganda: «so'zlar va gaplar Goethe va Netzwerkdan
olingan tizim bo'yicha ketyaptimi? A1 oxirida shu ikkala kitob lug'ati
mashqlarda hammasi aks etgan bo'ladimi?» Javob: yo'q edi. CEO «Goethe +
Netzwerk tizimi»ni tanladi, keyin aniqlashtirdi: «Hammasi bo'lsa yaxshi emasmi?
Unitlar soni o'zgarmaydi, mashqlar soni ham. Faqat o'quvchi takrorlash qilaman
desa yana qila oladigan arxitektura qilishimiz kerak.» Hisoblagich namunasini
ko'rib «Ha, shu tartibda boshla» dedi.

## 1. O'lchov (03.10.2026)

| Ro'yxat | Jami | 1–3-unit o'rgatgan | Ochiq |
|---|---|---|---|
| Goethe A1 (rasmiy PDF dan qayta o'qilgan) | 812 | 169 | 643 = 460 asosiy + 91 guruh so'zi + 48 yasalgan + 44 kichik so'z |
| Netzwerk neu A1 (kapitelwortschatz, OCR) | 1844 | 188 | 1656, shundan 1132 tasi Goethe'da yo'q |

Hozirgi qoida (bo'limga 8–12, unitga 50 so'z) bilan qolgan 9 unitda 450 o'rin
bor — Goethe'ning o'zi ham sig'maydi. Netzwerk ro'yxati tijorat darsligidan
olingan: u faqat o'lchov uchun ishlatiladi, ochiq repoga va saytga
tushmaydi (ADR-0011). Repoga faqat bizning so'zlarimiz kiradi.

## 2. Qaror

**Unitlar soni (12), darslar soni (har bo'limda 2 dars + o'tish + yakuniy sinov)
va darsdagi savollar soni (12 / 15) o'zgarmaydi.** Bo'limning so'z zaxirasi
kattalashadi: Goethe va Netzwerkning o'sha mavzudagi hamma so'zi (bo'limga
taxminan 25–30). Dars bitta o'tishda zaxiraning bir qismini so'raydi;
o'quvchi darsni qayta o'tgan sari ko'rmagan so'zlari chiqadi.

### 2.1. Dars «ko'rilmagan so'zlar birinchi» (1-bosqich, kod)

- So'z **ko'rilgan** = o'quvchida shu so'z uchun `DafLexemeState` qatori bor
  (u so'zga birinchi javob berilganda yoziladi).
- `baueSeans` avvalgidek o'z bo'limini, keyin format moyilligini oldinga
  qo'yadi. Shundan keyin har bosqich ichida **so'z savollari** turgan
  o'rinlarga avval ko'rilmagan so'zlar, keyin ko'rilganlari qo'yiladi.
  Juft (`PAAR`) savolida bitta so'z ko'rilmagan bo'lsa ham u yangi.
- Gap, ibora va dialog savollari **o'z o'rnida qoladi**: seansdagi so'z va
  gap savollari nisbati avvalgidek. So'zlar yangi bo'lganda gaplar siqib
  chiqarilmaydi, hammasi ko'rilgach so'z mashqi yo'qolmaydi. (Birinchi
  variantda so'zsiz savol ko'rilmagan so'z bilan teng turardi; ko'rik
  ko'rsatdi: bo'lim so'zlari ko'rilgach, takror dars va yakuniy sinov
  deyarli faqat gap va dialogdan iborat bo'lib qolardi.)
- Bu faqat TARTIB: format chegarasi, ketma-ketlik, `MIN_FORMATE` va
  «bir material bir seansda bir marta» qoidalari o'zgarmaydi.
- O'tish darsi va yakuniy sinovda o'z bo'limi qoidasi yo'q — u yerda butun
  unitning ko'rilmagan so'zlari birinchi.

### 2.2. Hisoblagich (1-bosqich, kod)

- `GET /student-portal/lernen/units/:id` va yo'l (`…/levels`) har bo'limga
  `woerter: { jami, gesehen }` qaytaradi: jami = bo'limning so'raladigan
  so'zlari (`core`, tarjimasi bor), gesehen = ulardan o'quvchi ko'rganlari.
- Unit sahifasida bo'lim sarlavhasi yonida «So'zlar: 14 / 28» va ingichka
  chiziq; bajarilgan dars qatorida, ko'rilmagan so'z qolgan bo'lsa,
  «Yana mashq qilish · 14 yangi so'z». Hammasi ko'rilgach — yashil belgi.
- Dars birinchi o'tishdayoq «bajarildi» bo'ladi (hozirgidek), yo'l
  to'xtamaydi. Eski server `woerter` yubormasa, hisoblagich chizilmaydi.
- Darsni qayta ochish serverdan YANGI seans so'raydi: seans ekrandan
  chiqilganda keshda qolmaydi (`gcTime: 0`; takrorlash ham shunday).
  Darsni yarmida tashlab chiqish hisoblagichni eskirgan deb belgilaydi —
  har javob o'quvchining so'z holatini allaqachon yozgan.

### 2.3. So'z taqsimoti va byudjet (2-bosqich)

- Goethe so'zlari 100%: asosiy so'zlar har biri biror unit/bo'limning
  `core` so'zi; guruh so'zlari (hafta kunlari, oylar, ranglar, mamlakatlar)
  blok holida; kichik so'zlar (aber, oder…) grammatika va gaplar ichida
  (`hilfswoerter`).
- Netzwerk so'zlari: mintaqaviy (Avstriya/Shveytsariya) variantlari va
  grammatika atamalaridan tashqari hammasi. Ish daftari so'zlari ham kiradi:
  dastlab ularni chiqarish rejalashtirilgan edi, lekin ro'yxatda Teller,
  Messer, Nase, Zahn, Tür, Umzug kabi asosiy so'zlar chiqdi.
- Repoga Goethe asosidagi qamrov tekshiruvi qo'shiladi: A1 oxiriga Goethe
  so'zi rejadan tushib qolsa, test o'tmaydi. Netzwerk qamrovi
  scratchpad'dagi skript bilan o'lchanadi.

**Bajarildi (04.10):**

- **Goethe ro'yxati** rasmiy PDF'dan skript bilan qayta olindi
  (`daf:goethe-extract -- --tsv`): 812 so'z, shundan 53 yasalgan va 132 guruh
  so'zi. Eski nusxada tushib qolgan so'zlar (Tag, danke, Arbeit…) bor,
  ko'chirishdagi «axlat» yo'q. `dies-` kabi o'zak yozuv: kichik harflisi
  faqat qo'shimcha oladi (diesen, Diesel emas), kattasi qo'shma so'z
  boshlaydi (Lieblingsfilm).
- **Reja butun A1 ni tutadi** (`wortliste.json`, 1762 so'z): u01 121, u02
  128, u03 102, u04 177, u05 104, u06 169, u07 176, u08 136, u09 161, u10 156,
  u11 148, u12 184. Yozilgan unitlarga qo'shiladigan 189 so'z
  `nachtrag: true` (5-bosqichda matnga kiradi). Ibora Goethe bosh so'zini
  o'rgatsa — `deckt` («auf Wiederhören» → Wiederhören). CEO qarori bilan
  o'rgatilmaydigan Goethe so'zlari — `ausgenommen`, sababi bilan (Bier,
  Wein, Schinken). Yangi 100 ta yordamchi so'z `hilfswoerter.json`da.
- **Byudjet**: bo'limga 8–40, unitga 190 tagacha so'z (`kurs.validate.ts` —
  yagona manba, `wortliste.validate.ts` undan oladi). `kurs.json`dagi har
  bo'lim byudjeti rejadagi so'zlar soniga teng (test).
- **Yozilgan unit = rejasi**: asosiy so'zlar rejaga bo'limma-bo'lim aynan
  teng (`vergleicheMitPlan`), «unitda aniq 50 so'z» qoidasi o'rniga.
- **Qamrov testi** (`goetheOhnePlan`): har Goethe A1 so'zi rejada, yordamchi
  so'zlarda yoki `ausgenommen`da. Natija: 812 dan 812, shundan 3 tasi CEO
  qarori bilan chiqarilgan.
- **Netzwerk qamrovi** (scratchpad, repoga tushmaydi): 1844 dan ≈1756 (95%)
  rejada. Chetda: grammatika atamalari, Avstriya/Shveytsariya variantlari,
  alkogol so'zlari va bir so'zning ikkinchi yozilishi.
- **O'zimizning so'zlar**: osh retsepti uchun Karotte, Knoblauch,
  Rindfleisch, Lammfleisch, Topf; rad etish uchun Schweinefleisch, Alkohol
  (CEO 03.10). Goethe'ning «bar» so'zi (naqd pul) alkogol qoidasiga
  kirmaydi va o'rgatiladi.
- O'zbekcha tarjimalar repoga hali tushmaydi: ular unit yozilganda
  `woerter.json`ga kiradi; taqsimotdagi taxminiy tarjimalar unit yozuvchisi
  uchun scratchpad'da qoladi.

### 2.4. Keyingi bosqichlar

3. 4-unit yangi tizimda (≈150 so'z), CEO ko'rigi bilan.
4. 5–12-unitlar, har biri CEO ko'rigi bilan.
5. 1–3-unitlarga yetishmayotgan so'zlar.
Ovoz va rasm har unit uchun alohida, narx aytilib so'raladi.

## 3. Sinov

- `seans.spec.ts`: ko'rilmagan so'z savoli ko'rilganidan oldin; format
  moyilligidan ham kuchli; o'z bo'limi undan kuchli; hamma so'z ko'rilgach
  seans kalitsiz qurilgandek; gaplar ulushi o'zgarmaydi; `neuheit` (juft,
  bo'shliqli gap, oddiy gap).
- `uebung.service.spec.ts`: holati bor so'z keyingi seansda faqat boshqa
  so'zlar tugaganda chiqadi; o'tish darsi va yakuniy sinovda ham; so'z va
  gap savollari tartibi so'zlar ko'rilgan-ko'rilmaganiga qaramay bir xil
  (haqiqiy servis, soxta prisma).
- `daf-portal-read.service.spec.ts`: `woerter` soni — core + tarjimali,
  o'quvchining holatlari bo'yicha; yo'lda hamma unit uchun ikki so'rov.
- Mijoz: hisoblagich matni va «yangi so'z» qatori (faqat bo'lim darslarida);
  tark etilgan seans keshda qolmaydi, hisoblagich eskiradi (vitest).
