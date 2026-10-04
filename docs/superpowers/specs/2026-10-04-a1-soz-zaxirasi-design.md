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
- `baueSeans` tartib kalitiga yangi pog'ona: **o'z bo'limi** (eng kuchli) →
  **ko'rilmagan so'z** → format moyilligi. So'zsiz savol (gap, ibora, dialog)
  ko'rilmagan so'z bilan teng turadi — gaplar va dialoglar orqaga surilmaydi,
  faqat KO'RILGAN so'zning savoli keyinga o'tadi.
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

### 2.3. So'z taqsimoti va byudjet (2-bosqich)

- Goethe so'zlari 100%: asosiy so'zlar har biri biror unit/bo'limning
  `core` so'zi; guruh so'zlari (hafta kunlari, oylar, ranglar, mamlakatlar)
  blok holida; kichik so'zlar (aber, oder…) grammatika va gaplar ichida
  (`hilfswoerter`).
- Netzwerk so'zlari: mintaqaviy (Avstriya/Shveytsariya), mashq kitobi va
  dars ichidagi grammatika atamalaridan tashqari hammasi.
- `wortliste` qoidasi o'zgaradi: bo'lim byudjeti 8–12 dan kattaroq oraliqqa
  (aniq son 2-bosqich rejasida, taqsimotdan keyin), unit cheki 50 dan
  yuqoriga. Repoga Goethe asosidagi qamrov tekshiruvi qo'shiladi: A1 oxiriga
  Goethe so'zi rejadan tushib qolsa, test o'tmaydi. Netzwerk qamrovi
  scratchpad'dagi skript bilan o'lchanadi.

### 2.4. Keyingi bosqichlar

3. 4-unit yangi tizimda (≈150 so'z), CEO ko'rigi bilan.
4. 5–12-unitlar, har biri CEO ko'rigi bilan.
5. 1–3-unitlarga yetishmayotgan so'zlar.
Ovoz va rasm har unit uchun alohida, narx aytilib so'raladi.

## 3. Sinov

- `seans.spec.ts`: ko'rilmagan so'z savoli ko'rilganidan oldin; so'zsiz savol
  ko'rilgan so'z savolidan oldin; o'z bo'limi ko'rilmaganlikdan kuchli.
- `uebung.service.spec.ts`: holati bor so'z keyingi seansda faqat boshqa
  so'zlar tugaganda chiqadi (haqiqiy servis, soxta prisma).
- `daf-portal-read.service.spec.ts`: `woerter` soni — core + tarjimali,
  o'quvchining holatlari bo'yicha.
- Mijoz: hisoblagich matni va «yangi so'z» qatori (vitest).
