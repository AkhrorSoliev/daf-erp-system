# Juftlashda jonli javob — dizayn

**Sana:** 2026-09-07
**Bog'liq:** [dialog va juftlash dizayni](2026-09-07-dialog-va-juftlash-design.md),
[ball va yo'l dizayni](2026-09-06-ball-va-yol-design.md)

CEO 1-unitni productionda sinab ko'rdi va ikkita narsani aytdi. Bu hujjat
ikkalasini yopadi.

---

## 1. Muammo

**Juftlash mashqi juftlash kabi his qilinmaydi.** Hozir o'quvchi to'rtta
(yoki `ZUORDNEN` da oltita) juftni yig'adi, so'ng «Tekshirish» bosadi va
faqat shundan keyin nima to'g'ri, nima xato ekanini biladi. Bu test
mantig'i. Juftlash mashqining butun mazmuni esa boshqacha: juft joyiga
tushganda **darrov** ma'lum bo'lishi kerak.

**Xato panelida javob xom holda chiqadi.** Seans ichida «Xato» deyilganda
to'g'ri javob shunday ko'rinadi:

```
wie=qanday|Guten Morgen=xayrli tong|tschüss=xayr (norasmiy)|bis bald=tez orada ko'rishamiz
```

Bu aynan o'sha nuqson bo'lib, u **seans oxiridagi** ro'yxatda 2026-09-07 da
tuzatilgan edi — lekin savol ichidagi panel qaralmagan. Ko'rik oxirgi
ekranni tekshirgan, tuzatuvchi esa yonidagi shu joyni ko'rmagan.

---

## 2. Jonli javob

Chapdagi tugma bosiladi, o'ngdagi bosiladi — juft hosil bo'ladi va **shu
zahoti** natijasi ko'rinadi:

- **To'g'ri** — ikkala tugma yashil bo'lib qotadi, boshqa bosilmaydi
- **Xato** — qizarib qaytadi, ikkalasi ham yana bo'sh bo'ladi

Hamma juft yashil bo'lgach savol tugaydi. **Alohida «Tekshirish» bosqichi
yo'q** — u endi ma'nosiz, chunki har juft allaqachon tekshirilgan.

### 2.1 To'g'ri javob baribir mijozga yuborilmaydi

Har juft bosilganda serverga kichik so'rov ketadi: «shu juft to'g'rimi?».
Server `ha` yoki `yo'q` deydi, javobning o'zini emas. Bitta so'rov o'rniga
to'rt-oltita bo'ladi, ular kichik.

Bu dvigatelning asosiy qoidasini buzmaydi: brauzer to'g'ri javobni hech
qachon bilmaydi.

---

## 3. Nima baholanadi

**Birinchi urinish baholanadi, tuzatish bepul.**

Bu yangi tushuncha emas. `bestScore` ning ta'rifi ham «birinchi urinishda
nechtasi to'g'ri», va `PAAR` javobi hozir ham juft-juft tekshirilib, har
so'z o'z ballini oladi.

### 3.1 Buni MIJOZ hisoblamaydi

Eng nozik joyi shu. «Men hammasini birinchi urinishda topdim» degan
xabarni mijozdan olsak, 2026-09-07 da yopilgan soxtalashtirish teshigi
qaytadan ochiladi.

Shuning uchun **har juft bosilishi haqiqiy javob sifatida yoziladi**:
server `DafAttempt` qatorini yozadi, muddati kelgan va to'g'ri bo'lsa
10 ball beradi, Leitner holatini yangilaydi.

Tuzatish shundan keyin **o'z-o'zidan** bepul bo'ladi va buning uchun
alohida kod kerak emas:

| Bosish | Leitner holati | Ball |
| --- | --- | --- |
| Birinchi marta, to'g'ri | muddati kelgan → oldinga suriladi | 10 |
| Birinchi marta, xato | nolga tushadi, ertangi kunga | 0 |
| Xatodan keyin tuzatish | muddati **kelmagan** (ertaga) | 0 |

Ya'ni mavjud qoidalarning o'zi kerakli natijani beradi. Mijozga ishonish
shart emas.

**Ko'rinadigan oqibati:** juftlash savolida endi bitta emas, to'rt-oltita
urinish yozuvi qoladi. Statistikada urinishlar soni ko'payadi. Bu aslida
rostroq — o'quvchi chindan to'rtta qaror qabul qilgan.

### 3.2 Savol keyinroq qaytadimi

Hozirgi qoida saqlanadi: **bitta juft ham birinchi urinishda xato bo'lsa,
savol seans oxirida boshqa formatda qaytadi.**

Buni mijoz aytadi va bu xavfsiz: yolg'on aytishdan yutadigan narsa yo'q —
o'quvchi faqat o'z takroridan mahrum bo'ladi. Ball allaqachon serverda
hisoblanib bo'lgan.

---

## 4. Xato paneli

To'g'ri javob endi xom satr emas, juftlar ro'yxati bo'lib chiqadi —
seans oxiridagi ro'yxatdagi kabi.

Bu faqat `PAAR` va `ZUORDNEN` ga tegishli. Qolgan sakkiz format bitta
satrlik javob qaytaradi va ular o'zgarmaydi.

**Aslida jonli javob bilan bu panel juftlashda deyarli ko'rinmaydi** —
savol hamma juft to'g'ri bo'lgandagina tugaydi. Lekin panel `pruefen`
yiqilgan yoki aloqa uzilgan holatlarda ham chiqadi, shuning uchun u
baribir o'qiladigan bo'lishi kerak.

---

## 5. Serverga qo'shimcha

```
POST /student-portal/lernen/uebung/juft
     { itemType, itemId, format, chap, ong }
  -> { isCorrect: boolean }
```

Toifasi `SELF` — javob o'quvchining o'z holatiga bog'liq va uning
statistikasiga yozadi.

`format` faqat `PAAR` yoki `ZUORDNEN` bo'lishi mumkin; boshqasi rad
etiladi, chunki qolgan formatlarda «juft» degan tushuncha yo'q.

Bu yo'l `pruefen` ning **o'rnini bosmaydi**, u bilan yonma-yon turadi:
juftlash formatlarida `pruefen` endi chaqirilmaydi (aks holda ball ikki
marta hisoblanardi), qolgan sakkiztasida esa avvalgidek qoladi.

---

## 6. Sinash

Serverda jest bilan: juft to'g'ri/xato aniqlanishi; muddati kelmagan
so'zga ball berilmasligi; xato bosilgandan keyin o'sha so'zning ikkinchi
bosilishi ball bermasligi (**ayni shu tuzatishning bepulligi — eng muhim
test**); `PAAR` va `ZUORDNEN` dan boshqa formatning rad etilishi;
`studentId` ning tanadan olinmasligi.

Mijozda vitest bilan: juft holatlarining o'tishi (bo'sh → kutilmoqda →
yashil / qizarib qaytish), va hamma juft yashil bo'lganda savol tugaganini
aniqlash.

---

## 7. Bu dizaynda QILINMAYDI

Variant tanlash formatlarida darrov qayta urinish — u yerda o'quvchi
to'rttasini ketma-ket bosib topib olardi · `SATZ_BAUEN` da jonli javob ·
ovozli formatlar · rasm · tanishtirish qadami.

---

## 8. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Har juft uchun so'rov — sekinlik | So'rov kichik; xato bo'lsa juft bo'sh qoladi va qayta bosiladi |
| Aloqa uzilsa juft osilib qoladi | Kutilayotgan juft belgilanadi; javob kelmasa bo'shatiladi va xabar beriladi |
| Ball ikki marta hisoblanishi | Juftlash formatlarida `pruefen` umuman chaqirilmaydi |
| Bosib topish | Ball bermaydi — birinchi bosish allaqachon baholangan |
| Urinish yozuvlari ko'payishi | Ataylab: to'rtta qaror to'rtta yozuv |
