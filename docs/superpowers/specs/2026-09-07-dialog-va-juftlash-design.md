# Dialog va juftlash mashqlari — dizayn

**Sana:** 2026-09-07
**Bog'liq:** [A1 kurs dizayni](2026-09-03-a1-kurs-design.md) §4,
[mashq ekrani dizayni](2026-09-05-lernen-ekrani-design.md)

O'quvchi mashqni «faqat test» deb ko'rmoqda. Bu dizayn shuni tuzatadi.

---

## 1. Muammo aslida nimada

Xilma-xillik qoidalari **ishlayapti**: `seans.ts` har seansda kamida 5 xil
format bo'lishini (`MIN_FORMATE = 5`) va bitta format uch martadan ko'p
ishlatilmasligini (`FORMAT_MAX_PRO_SEANS = 3`) majburlaydi. Ya'ni savollar
takrorlanmaydi.

Muammo boshqa joyda: **mavjud sakkiz formatning hammasi bir tabiatli.**

| Format | O'quvchi nima qiladi |
| --- | --- |
| `WORT_UZ`, `UZ_WORT`, `ARTIKEL`, `SATZ_UEBERSETZEN`, `REAKTION` | variant tanlaydi |
| `LUECKE` | so'z yozadi |
| `PAAR`, `SATZ_BAUEN` | bo'laklarni joylaydi |

Uchta harakat, va uchalasi ham yakka so'z yoki yakka gap ustida. **Bog'langan
nutq yo'q.** Shuning uchun mashq testga o'xshaydi — chunki u haqiqatan test.

Kurs dizayni 16 format ko'zlagan, 8 tasi qurilgan. Yetishmayotgan sakkiztadan
to'rttasi ovoz, bittasi rasm talab qiladi. **Uchtasi hech narsa talab
qilmaydi** va shu dizayn o'shalar haqida.

---

## 2. Nima quriladi

**Ikki yangi format**, ikkalasi ham mavjud kontentdan:

### 2.1 `DIALOG_LUECKE` — dialogdan bir satr tushib qolgan

Ekranda butun suhbat, bitta satr o'rnida bo'shliq. O'quvchi to'rt variantdan
yetishmaganini tanlaydi.

```
Jonas:  Hallo! Bist du Mia?
Mia:    ________________
Jonas:  Ich bin Jonas.

  ( ) Ja, ich bin Mia. Und du?      ( ) Nein, danke.
  ( ) Guten Abend!                  ( ) Ich wohne in Berlin.
```

**Nega bu boshqacha.** O'quvchi birinchi marta **kontekstdan** javob topadi,
so'zni yoki qoidani emas. Bu Goethe imtihonining o'qish qismiga eng yaqin
mashq.

**Material tayyor va ishlatilmayapti:** 1-unitda 6 dialog, 40 satr;
`DafDialog` va `DafDialogLine` bazada bor. Dvigatel ularni **hozir umuman
o'qimaydi**.

Chalg'ituvchilar boshqa dialoglarning satrlaridan olinadi — shu bo'lim yoki
undan oldingilardan, boshqa dvigatel qoidalari kabi. Bir xil satr chalg'ituvchi
bo'lib tushmasligi uchun matn bo'yicha solishtiriladi.

Olib tashlanadigan satr **birinchi satr bo'lmaydi**: usiz suhbat kontekstsiz
qoladi va topshiriq taxminga aylanadi.

### 2.2 `ZUORDNEN` — vaziyat va iborani juftlash

Chapda oltita vaziyat, o'ngda oltita ibora aralash. O'quvchi juftlaydi.

```
salomlashish            ·  ·   Auf Wiedersehen!
o'zini tanishtirish     ·  ·   Hallo!
xayrlashish             ·  ·   Ich bin Anna.
```

**Nega bu boshqacha.** `PAAR` so'zni tarjimasi bilan juftlaydi — lug'at
mashqi. Bu esa **vaziyatni nutq bilan** juftlaydi: «xayrlashmoqchisiz — nima
deysiz?». Redemittel aynan shu uchun yozilgan.

Material tayyor: 1-unitda 18 ibora, har birida `funktionUz` va `de`.
`DafPhrase` bazada bor va hozir faqat `REAKTION` uchun ishlatiladi.

**Oltita juft, to'rttasi emas** — `PAAR` bilan bir xil his qoldirmasligi
uchun, va kurs dizaynining §4 jadvali shuni belgilagan.

### 2.3 `WAHL` bu dizaynda YO'Q — sababi bor

Kurs dizayni uchinchi formatni ham ko'zlagan: `du` yoki `Sie`? Bu formallik
farqini o'rgatadigan eng to'g'ri mashq va u kerak.

Lekin **kontentda uni quradigan ma'lumot yo'q.** `Regel` tipida `section`,
`titelDe`, `titelUz`, `erklaerungUz` va `beispiele` bor — qarama-qarshi
juftlik (nima bilan nima solishtirilyapti) yozilmagan. Uni avtomatik chiqarib
bo'lmaydi: «Sie-Form, W-Frage» sarlavhasidan qaysi ikki shakl qarshi
qo'yilishini mashina bilmaydi.

Shuning uchun `WAHL` **kontent qadamiga** ko'chadi — o'sha yerda qoidalarga
yangi maydon qo'shiladi va matn yoziladi. Uni bu yerda «taxmin qilib» qurish
noto'g'ri mashq yasagan bo'lardi.

---

## 3. Seans turlarining ta'mi — moyillik, qat'iy bo'linish emas

Kurs dizayni §4.3 har seans turiga o'z formatlarini biriktirgan: «Tanishuv»
tanib olishga, «Ishlatish» ishlab chiqarishga. Dvigatel buni **hozir umuman
bajarmaydi** — `kind` maydoni format tanlashda ishlatilmaydi.

Bu tuzatiladi, lekin **qat'iy bo'linish sifatida emas**, va sababi arifmetik:

Bugungi 8 formatdan «Tanishuv» ga tegishlisi ikkita (`WORT_UZ`, `PAAR`). Bu
dizayn bilan o'nta bo'ladi, Tanishuvga uchtasi. Qat'iy bo'linsa, seansda 3
xil format qoladi — dvigatelning o'z qoidasi esa **kamida 5** talab qiladi
(`MIN_FORMATE`). Ikki qoida bir-birini inkor qiladi.

Shuning uchun: **seans turi o'z formatlarini afzal ko'radi, yetmasa
qolganidan oladi.**

Amalda: nomzodlar saralanganda turga mos formatlar oldinga suriladi. Xilma-xillik
qoidalari o'zgarmaydi va ustun turadi — ular qiziqarlilikning kafolati.

Formatlar 16 taga yetganda moyillik o'z-o'zidan qat'iy bo'linishga aylanadi,
chunki har turda yetarli format bo'ladi. Kodni o'zgartirish shart bo'lmaydi.

| Seans turi | Afzal ko'radigan formatlar |
| --- | --- |
| `SECTION_A` (Tanishuv) | `WORT_UZ`, `PAAR`, `ZUORDNEN` |
| `SECTION_B` (Ishlatish) | `UZ_WORT`, `ARTIKEL`, `LUECKE`, `SATZ_BAUEN` |
| `BRIDGE` (O'tish sinovi) | moyillik yo'q — ataylab aralash |
| `UNIT_TEST` (Yakuniy) | `REAKTION`, `ZUORDNEN`, `DIALOG_LUECKE`, `SATZ_UEBERSETZEN` |

---

## 4. Mijoz tomoni

`DIALOG_LUECKE` — mavjud **Tanlash** komponenti. Savol matnining ustida
suhbat ko'rsatiladi: gapiruvchi nomi, satrlar, bo'shliq o'rnida chiziq. Bu
yangi komponent emas, savol ustidagi qo'shimcha blok.

`ZUORDNEN` — mavjud **Yigish** komponenti, lekin u hozir `PAAR` uchun aynan
**to'rt** juftga qulflangan (`tayyor` sharti `yigilgan.length === 4`). Olti
juftni ham qabul qilishi uchun juft soni parametrga chiqariladi.

Javob shakli `PAAR` bilan **bir xil** bo'ladi — `chap=o'ng|chap=o'ng|…` —
shunda server tomonda ham, mijozda ham bitta parser xizmat qiladi. Farqi
faqat juft sonida.

---

## 5. Sinash

Serverda jest bilan: dialogdan birinchi satr olinmasligi; chalg'ituvchi
satrlar takrorlanmasligi; dialog 4 satrdan kam bo'lsa savol qurilmasligi;
ibora 6 tadan kam bo'lsa `ZUORDNEN` qurilmasligi; javobning har jufti
alohida tekshirilishi; seans turi mos formatlarni oldinga surishi, lekin
`MIN_FORMATE` buzilmasligi.

Mijozda vitest bilan: olti juftning yig'ilishi va javob satrining shakli.

---

## 6. Bu dizaynda QILINMAYDI

`WAHL` (kontent qadamida) · ovozli to'rt format · `BILD_WORT` · Netzwerk
lug'ati · tanishtirish qadami · 2–12-unit kontenti.

---

## 7. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Dialog savolining chalg'ituvchisi mazmunan ham to'g'ri chiqib qolishi | Chalg'ituvchi boshqa dialogdan olinadi; bir xil matn filtrlanadi |
| Olti juft telefon ekraniga sig'masligi | Ikki ustun, matn qisqartiriladi; brauzerda odam ko'radi |
| Moyillik xilma-xillikni bo'g'ib qo'yishi | `MIN_FORMATE` va `FORMAT_MAX_PRO_SEANS` ustun turadi, moyillik faqat tartibga ta'sir qiladi |
| `Yigish` ni o'zgartirish `PAAR` ni buzishi | Juft soni parametr; `PAAR` ning mavjud testlari o'zgarmaydi |
