# Media bo'limi tuzilishi — dizayn

**Sana:** 2026-09-09
**Bog'liq:** [media ro'yxati](2026-09-09-media-royxati-design.md)

---

## 1. Muammo

Media ro'yxati bugun prodga chiqdi va CEO uni ochib aytdi: **tushunarsiz,
uzun ro'yxatlardan iborat.**

Aybdor kod emas, tuzilish. Bitta sahifaga to'rt qavat yig'ilgan:

1. 13 obraz (rasm + ovoz kartalari)
2. 47 eski fayl, qidiruv qutisi bilan
3. Qamrov jadvali: 3 daraja → 18 unit → bo'limlar
4. Bo'lim ochilsa — material ro'yxati VA savollar ro'yxati

1-unitning 5-bo'limini ochsangiz, bitta sahifada obrazlar, 47 fayl,
18 unit va ostida **340 savol** turadi.

**Ildiz sabab: uch xil savol bitta sahifaga tiqilgan**, holbuki ular
butunlay boshqa o'qish talab qiladi.

| Savol | O'qish turi | Kerakli ko'rinish |
| --- | --- | --- |
| Nima yetishmayapti? | tez ko'z yugurtirish | zich jadval, hammasi bir ekranda |
| Ovozlar yaxshimi? | sekin, quloq bilan | bitta bo'lim, tinch ro'yxat |
| Savollar yaxshimi? | sekin, o'qib | bitta bo'lim, bitta format |
| Qanday fayllar bor? | kamdan-kam | alohida, kursga aloqasi yo'q |

---

## 2. Qaror: ikki daraja

**`/media`** — umumiy manzara. Unitlar; unit ochilsa bo'limlari
ko'rinadi, lekin **ichida og'ir narsa yo'q** — faqat qamrov raqamlari va
bo'lim nomi havola sifatida. Sahifa bitta savolga javob beradi.

**`/media/sections/[id]`** — bitta bo'lim. Ikki ichki bo'lim:
**Material** va **Savollar**.

**`/media/assets`** — eski 47 fayl va obrazlar shu yerga ko'chadi.

### 2.1 Nega uchinchi daraja emas

`/media/sections/[id]/savollar` alohida sahifa bo'lishi ham mumkin edi.
Qilinmaydi: sahifaning **mavzusi bitta** — shu bo'lim. Material va
savollar o'sha bir narsaning ikki ko'rinishi va ko'pincha ikkalasi
birga kerak bo'ladi («bu so'z g'alati eshitildi — savoli qanday
ekan?»). Alohida manzil har safar ortiqcha qaror va ortiqcha bosish
qo'shadi, tushunarlilikka hech narsa bermaydi.

### 2.2 Manzilda saqlanish shart

Loyiha qoidasi (`client/CLAUDE.md`): har ichki bo'lim manzilda
saqlanadi. Ya'ni `?tab=savollar&format=AUDIO_WORT`. Shundan kelib
chiqib «shu formatga qara» degan havolani yuborish mumkin — alohida
sahifadan olinadigan foydaning asosiy qismi shu yerda ham bor.

---

## 3. Bo'lim sahifasi

### 3.1 Material

Bo'limning so'zlari, gaplari, iboralari, dialog satrlari. Har birida
karnay tugmasi (avtomatik yangramaydi).

Bu ro'yxat qisqa: bo'limga ~10 so'z, ~7 gap, ~4 ibora, ~8 dialog
satri. Bo'linishga muhtoj emas.

### 3.2 Savollar — format navigatsiyaga aylanadi

Bitta bo'lim uchun 340 savol chiqishi mumkin. Ularni ketma-ket qo'yish
uyum yasaydi, holbuki CEO hech qachon «hamma savolni» o'qimaydi — u
«**bu format** yaxshimi?» deb keladi.

Shuning uchun formatlar **yon ro'yxat** bo'ladi, har birida soni, va
tanlangan formatning savollarigina ko'rsatiladi. 340 o'rniga ~30.

Boshlang'ich holat: eng ko'p savolli format tanlangan bo'ladi, chunki
bo'sh ekran bilan boshlash o'quvchini «endi nima bosaman?» degan
holatga qo'yadi.

### 3.3 Qamrov ikki xilligi ko'rinib tursin

Material bo'lim bo'yicha, savollar esa **kumulyativ** (shu bo'lim +
undan oldingilari, chunki chalg'ituvchi o'sha puldan olinadi). Bu farq
bugun yorliq bilan aytilgan va **saqlanadi** — yangi tuzilishda ham
har ikki tomon o'z qamrovini aytib tursin.

---

## 4. `/media` sahifasi

Qoladigan narsa: darajalar → unitlar → bo'limlar, qamrov raqamlari.

**O'zgarish:** bo'lim qatori endi ochilmaydi, **havola** bo'ladi.
Sahifa shu bilan qisqaradi va o'z vazifasiga qaytadi.

Obrazlar va 47 fayl bu yerdan **olib tashlanadi** — ular
`/media/assets` ga ko'chadi va `/media` dan havola beriladi.

---

## 5. Server o'zgarishi

**Yo'q.** Uch yo'l ham (`coverage`, `sections/:id/inhalt`,
`sections/:id/fragen`) shundayligicha ishlatiladi. Bu faqat mijoz
tomonidagi qayta tuzish.

Yagona qo'shimcha: bo'lim sahifasi sarlavhasi uchun bo'limning nomi va
uniti kerak. Bu `coverage` javobida bor, lekin butun daraxtni yuklab
undan bittasini olish isrof. **Qaror:** bo'lim sahifasi `inhalt`
javobiga bo'lim va unit nomini qo'shib olsin — bitta qo'shimcha maydon,
yangi yo'l emas.

---

## 6. Sinash

**Mijozda (vitest, sof mantiq):**

- manzil holati: `tab` va `format` o'qilishi va yozilishi, sukut
  qiymatlar manzilga yozilmasligi (loyiha qoidasi)
- boshlang'ich format tanlash: eng ko'p savolli format
- noto'g'ri `format` manzilda kelsa xatoga tushmaslik

**Serverda (jest):** bo'lim va unit nomi `inhalt` javobida.

**Odam tekshiradi:** sahifa chindan tushunarli bo'ldimi. Buni
avtomatlashtirib bo'lmaydi va bu dizaynning butun sababi.

---

## 7. Bu dizaynda QILINMAYDI

Qamrov jadvalining ko'rinishini qayta chizish · media tahrirlash ·
qidiruv · savollarni tahrirlash · statistika.

---

## 8. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Bo'lim sahifasi ham uyumga aylanishi | Format navigatsiya, bir vaqtda bitta format (§3.2) |
| Manzilsiz holat — havola yuborib bo'lmasligi | `?tab=` va `?format=` manzilda (§2.2) |
| Qamrov farqi yo'qolishi | Yorliqlar saqlanadi (§3.3) |
| Eski fayllar butunlay yo'qolib qolishi | `/media/assets` ga ko'chadi, `/media` dan havola (§4) |
