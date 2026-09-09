# Media bo'limi: material va savollar ro'yxati — dizayn

**Sana:** 2026-09-09
**Bog'liq:** [1-unit ovozi va rasmi](2026-09-08-a1-ovoz-va-rasm-design.md),
[A1 kurs dizayni](2026-09-03-a1-kurs-design.md) §4

---

## 1. Muammo

`/media` sahifasiga kecha bazadan o'zi to'ladigan **qamrov jadvali**
qo'shildi: unit → bo'lim → «53 so'z, 53 audio, 0 rasm».

CEO buni ko'rib aytdi: bu yetarli emas. Yasalgan ovozlarning **hammasini
eshitib** ko'rish, mashqlarning **hammasini** va **javoblarini** ko'rish
kerak.

Talab o'rinli. Jadval «nechta» degan savolga javob beradi, CEO esa
«**nima**» deb so'rayapti. 53 ta fayl yasaldi va ularni ilova ichida
birorta ham eshitib bo'lmaydi.

---

## 2. Uch qatlam

| Qatlam | Savol | Holat |
| --- | --- | --- |
| Qamrov jadvali | nima yetishmayapti? | bor |
| **Material ro'yxati** | qanday so'z bor, qanday eshitiladi? | quriladi |
| **Savollar ro'yxati** | qanday savol chiqadi, javobi nima? | quriladi |

Qamrov jadvali tepada qoladi va o'zgarmaydi. Bo'lim ochilganda ostidan
qolgan ikki qatlam chiqadi.

---

## 3. Savollar hech qayerda SAQLANMAYDI

Bu dizaynning eng muhim fakti va u kurs dvigatelining ataylab qilingan
qarori (kurs dizayni D6/D7): **savol bazada yo'q.** Dvigatel uni har
so'rovda materialdan qayta quradi, javobni ham qayta hisoblaydi.

Demak «hamma savollarni ko'rsatish» degani jadvalni o'qish emas —
**o'sha quruvchilarni chaqirib** natijani ko'rsatish.

### 3.1 Haqiqiy quruvchilar chaqiriladi, qayta yozilmaydi

O'n ikki quruvchi (`wortUz`, `uzWort`, `paar`, `artikel`, `audioWort`,
`wortTippen`, `luecke`, `satzBauen`, `satzUebersetzen`, `reaktion`,
`zuordnen`, `dialogLuecke`) — sof funksiyalar: material va tasodif
manbasini oladi, `Frage` qaytaradi. `Frage` ichida `richtig` (to'g'ri
javob) allaqachon bor.

Ularni qayta yozish **taqiqlanadi**. Oldindan ko'rish o'z nusxasini
yasasa, u dvigateldan asta-sekin ajralib ketadi va sahifa o'quvchi
ko'rmaydigan savolni ko'rsatib turadi — bu sahifani yolg'onchi qiladi,
foydasizdan ham yomonroq.

### 3.2 Format qo'shilsa build YIQILISHI shart

Eng jiddiy xavf: kelajakda 13-format qo'shiladi, bu yerdagi ro'yxatga
yozilmaydi, va sahifa **jimgina** uni ko'rsatmay qo'yadi. «Hammasi shu»
deb turadi, aslida emas.

Shuning uchun quruvchilar ro'yxati `Record<FrageFormat, ...>` dan
quriladi — kalit tushib qolsa TypeScript build'ni yiqitadi. Bu naqsh
2026-09-08 da `FRAGE_FORMATLAR` uchun aynan shu sababdan tanlangan va
o'sha yerda ishlagan: testni emas, **kompilyatorni** qorovul qilish.

### 3.3 Oldindan ko'rish O'QUVCHIGA BOG'LIQ EMAS

`baueKandidaten` `studentId` oladi, lekin u ikki narsa uchun kerak:
qaytarish savollari (`pflicht`) va «ketma-ket ikki seansda bir xil
so'z+format takrorlanmasin» qoidasi. **Savolning QURILISHI** o'quvchiga
umuman bog'liq emas.

Shuning uchun oldindan ko'rish o'quvchisiz ishlaydi va butun
**qurilishi mumkin bo'lgan** to'plamni ko'rsatadi — seansga tushadigan
12 tasini emas. Bu to'g'ri: CEO kontentni tekshiryapti, bitta
o'quvchining seansini emas.

**Bo'lim bo'yicha, dars bo'yicha emas.** Har bo'limda 2-3 dars bor
(Tanishuv, Ishlatish, o'tish sinovi), lekin ular orasidagi farq faqat
**tartibda** (`bevorzugteFormate` moyillikni beradi). Qurilishi mumkin
bo'lgan savollar to'plami bir xil, shuning uchun ro'yxat bo'limga
biriktiriladi.

---

## 4. Material ro'yxati

Bo'lim ochilganda ichidagi hamma narsa ko'rinadi:

- **so'zlar** — nemischasi, tarjimasi, artikli; audiosi bo'lsa
  **karnay tugmasi**; rasmi bo'lsa rasmi
- **gaplar**, **iboralar**, **dialog satrlari** — matni va audiosi

Audio tugmasi 1-unit ovozi bilan bir xil komponent bo'ladi
(`ovoz-tugmasi.tsx`), lekin **avtomatik yangramaydi**: mashq ekranida
avtomatik qo'yish o'rinli, ro'yxatda esa sahifa ochilishi bilan 53 ta
fayl birdan yangrardi.

**Passiv so'zlar ham ko'rsatiladi.** Dvigatel `core: false` so'zni
so'ramaydi va chalg'ituvchi ham qilmaydi, lekin u kontentning bir qismi
va CEO uni ko'rishi kerak — «nega bu so'zdan savol yo'q?» degan savolga
javob shu yerda.

---

## 5. Savollar ro'yxati

Har savol uchun ko'rsatiladi: **format**, **savol matni**, **variantlar**
(bo'lsa), va **to'g'ri javob** ajratilgan holda.

Audio formatlarda savol matni bo'sh bo'ladi (ataylab — so'z javobning
o'zi), shuning uchun ularda **karnay tugmasi** savol o'rnida turadi:
CEO eshitib, javobni yonida ko'radi.

`PAAR` va `ZUORDNEN` juftlar ro'yxati sifatida, `DIALOG_LUECKE` esa
butun suhbat bilan ko'rsatiladi — seans ekranidagi kabi.

### 5.1 Javoblar ko'rinishi xavfsiz

`/media` yo'li CEO, filial direktori va administratorga ochiq
(`@Roles`), o'quvchi u yerga kira olmaydi. Ya'ni «to'g'ri javob
mijozga yuborilmaydi» qoidasi buzilmaydi — bu boshqa auditoriya.

### 5.2 Tasodifiylik

Quruvchilar tasodif manbasini oladi (variantlar aralashadi, `PAAR`
to'rtlikni tanlaydi). Oldindan ko'rish **barqaror urug'** ishlatadi,
ya'ni sahifa har yangilanganda savollar sakramaydi. Aks holda CEO
ko'rgan narsasini ikkinchi marta topa olmasdi.

---

## 6. Hajm va yuklash

1-unitda 53 so'z bor va ulardan har biri bir necha formatda savol
beradi — bo'lim bo'yicha yuzga yaqin savol chiqadi.

Shuning uchun **bo'lim ochilganda so'raladi**, hammasi birdan emas.
Yopiq bo'lim hech narsa yuklamaydi.

---

## 7. Sinash

**Serverda (jest):**

- har format uchun quruvchi chaqirilishi va `richtig` maydoni
  qaytishi
- **format qo'shilsa build yiqilishi** — `Record<FrageFormat, ...>`
  to'liqligi (kompilyator xatosi bilan isbotlanadi, test bilan emas)
- passiv (`core: false`) so'z material ro'yxatida BOR, savollar
  ro'yxatida YO'Q
- material yetmasa quruvchi `null` qaytarishi va ro'yxatga
  tushmasligi
- barqaror urug': ikki chaqiruv bir xil natija berishi

**Mijozda (vitest, sof mantiq):**

- savolni ko'rsatish uchun shakl tanlash (audio / juftlash / oddiy)
- bo'sh bo'limning holati

**Odam tekshiradi:** 53 ta audio chindan eshitiladimi va talaffuz
to'g'rimi — buni avtomatlashtirib bo'lmaydi, va sahifa aynan shuning
uchun quriladi.

---

## 8. Bu dizaynda QILINMAYDI

Media tahrirlash (o'chirish, qayta yasash, yuklash) — sahifa faqat
KO'RSATADI · audio qayta yasash tugmasi · savolni tahrirlash ·
o'quvchining haqiqiy seansini ko'rish · statistika (qaysi savol ko'p
xato qilinadi).

---

## 9. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Oldindan ko'rish dvigateldan ajralib ketishi | Haqiqiy quruvchilar chaqiriladi, nusxa yozilmaydi (§3.1) |
| Yangi format jimgina tushib qolishi | `Record<FrageFormat, ...>` — build yiqiladi (§3.2) |
| Sahifa ochilishi bilan 53 audio yangrashi | Ro'yxatda avtomatik qo'yish YO'Q (§4) |
| Yuzlab savol bir yo'la yuklanishi | Bo'lim ochilganda so'raladi (§6) |
| Har yangilashda boshqa savol chiqishi | Barqaror urug' (§5.2) |
| Javob o'quvchiga ko'rinishi | `/media` faqat CEO/BD/Admin (§5.1) |
