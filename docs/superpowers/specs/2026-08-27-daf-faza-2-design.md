# DaF o'quv tizimi — Faza 2 dizayni: kontent bazaga va ekranga chiqadi

**Sana:** 2026-08-27
**Bog'liq:** [ADR-0011](../../adr/0011-oquv-ozagi-standartga-boglanadi.md),
[Faza 1 dizayni](2026-08-25-daf-learning-system-design.md),
[Faza 1b dizayni](2026-08-26-daf-faza-1b-design.md)

Faza 1 va 1b kontentni **fayllarga** yig'di: `server/content/daf/dib.json`
(1 180 mashq, 1 843 lug'at yozuvi, 92 grammatika sahifasi, 198 transkript)
va R2 dagi 1 095 media aktivi. Hech kim uni ko'ra olmaydi.

Faza 2 shu kontentni bazaga tushiradi, o'quvchi ekranida ko'rsatadi va
birinchi marta **mashq yechish** imkonini beradi.

## 1. Qamrov chegarasi

**Kiradi:** `Daf*` Prisma modellari, `dib.json` dan seed, o'zbekcha tarjima,
`/portal/lernen` bo'limi (daraja yo'li → bo'lim → lug'at, grammatika,
**ishlaydigan MC mashqi**), urinishlar jurnali.

**Kirmaydi:** qolgan mashq turlarining dvigateli (GAP, CLOZE, REORDER,
FREE_WRITE) — Faza 3. Hören mashqlari — Faza 3. Ball va reyting — Faza 3 dan
keyin. AI baholash — Faza 5.

## D1. Bitta mashq turi to'liq ishlaydi, qolganlari ko'rinadi

Reja bo'yicha mashq dvigateli Faza 3 edi. Lekin dvigatelsiz Faza 2 da
o'quvchi faqat **ko'radi**, ya'ni urinishlar jurnali yozadigan hech narsa
bo'lmaydi va tizim ishlayotganini Faza 3 gacha tekshirib bo'lmaydi.

Shuning uchun Faza 2 **MC (variant tanlash)** ni oxirigacha chiqaradi.
Tanlov ma'lumotdan kelib chiqadi, xohishdan emas: MC ning **255 tasidan
255 tasi javobli** — bu yagona tur bo'lib, hech qanday qo'shimcha ishsiz
avtomatik tekshiriladi.

Qolgan turlar bazaga tushadi va ekranda **ko'rinadi**, lekin javob
yuborilmaydi. Ular yashirilmaydi: kontent bor, dvigateli hali yo'q, va
buni o'quvchiga aytish uni yashirishdan yaxshiroq.

**Taqiqlanadi:** MC dvigatelini boshqa turlarga "vaqtincha" moslashtirish.
GAP javobini satr solishtirish bilan tekshirish katta va noto'g'ri
soddalashtirish — nemis tilida `die`/`Die`, `ist gekommen`/`gekommen ist`
va imlo xatosi masalasi bor, va ularning har biri alohida qaror.

## D2. O'q — daraja, manba emas

Navigatsiya **daraja yo'li**: A1.1 → A1.2 → A2.1 → A2.2 → B1. Har daraja
ichida **bo'limlar**, har bo'lim ichida lug'at, grammatika va mashqlar.

Bo'lim manbaning bobiga teng kelishi mumkin, lekin bu **tasodif emas,
majburiyat ham emas**: `DafUnit` o'zining darajasi va tartibi bilan
mavjud, va DiB bobi unga adapter orqali biriktiriladi. Ikkinchi manba
qo'shilganda uning boblari xuddi shu `DafUnit` larga taqsimlanadi —
yangi «ZUM bo'limi» tushunchasi paydo bo'lmaydi (ADR-0011).

## D3. Kontent umumiy, urinish esa filialga muhrlanadi

`Daf*` kontent jadvallarida **`companyId` yo'q**. Bu ataylab: kontent
COERLL ning CC BY 4.0 materiali, u markazga tegishli emas va filialdan
filialga farq qilmaydi. Har kompaniyaga nusxa ko'chirish 1 180 mashqni
takrorlab, tuzatishni esa nusxalar soniga ko'paytirardi.

`DafAttempt` esa **`companyId`, `branchId` va `groupId` ni yozish paytida
muhrlaydi** — jonli bog'lanishdan o'qimaydi. Sabab loyihada allaqachon
yozilgan: `SALARY_ACCRUAL` guruhning filialini muhrlaydi, chunki guruh
ko'chganda to'langan oylik tarixi qayta yozilmasligi kerak. Bu yerda ham
xuddi shunday — o'quvchi filialdan filialga ko'chganda uning o'tgan oydagi
ballari yangi filialga ko'chib o'tmasligi kerak.

## D4. Urinish — o'zgarmas hodisa, holat emas

`DafAttempt` har urinish uchun bitta qator: kim, qaysi mashq, qachon,
to'g'rimi, nima javob berdi, qancha vaqt ketdi. Qator **hech qachon
o'zgartirilmaydi va o'chirilmaydi**.

**Progress jadvali YO'Q.** «Bu mashq bajarildi» degan holat urinishlardan
hisoblanadi. Sabab: reyting, ball, streak va o'qituvchi paneli — hammasi
keyin quriladi, va ularning formulasi o'zgarganda **butun tarixni qayta
hisoblash** kerak bo'ladi. Holat sifatida saqlangan ball buni imkonsiz
qiladi: formula o'zgargan kuni eski ballar boshqa qoida bo'yicha
hisoblangan bo'lib qoladi.

**Xato javoblar ham yoziladi.** O'qituvchiga eng kerakli signal aynan shu —
«guruh qaysi mashqda qoqilyapti». Faqat to'g'ri javoblarni yozish bu
savolni javobsiz qoldiradi.

`durationMs` ham yoziladi: 2 soniyada «to'g'ri» qilgan o'quvchi o'ylamagan,
va bu keyin kerak bo'ladi.

## D5. Tarjima manbasi yozib boriladi

1 843 lug'at izohi, 92 grammatika izohi va 104 sarlavha o'zbekchaga
o'giriladi. Manba nemis + ingliz; tarjima **ikkalasidan** qilinadi —
inglizcha izohning o'zi allaqachon tarjima, faqat undan o'girish xatolarni
ko'paytiradi.

Har tarjima `translationSource` bilan keladi: `MODEL` yoki `TEACHER`.
Modelning tarjimasi **ko'rsatiladi** (izoh baho emas, uni yashirish
o'quvchini izohsiz qoldiradi), lekin o'qituvchi tuzatgani ustunlik qiladi
va tuzatilgani belgilanadi.

**Taqiqlanadi:** tarjimani manba matnining ustiga yozish. Nemischa va
inglizcha asl matn qoladi — tarjima qayta ko'rilganda solishtirish uchun
kerak bo'ladi.

## D6. Ochiq javobli mashqlar yashirilmaydi

1 306 javob o'rnidan 187 tasiga manba javob bermagan (`answerStatus: OPEN`).
Bunday mashq ekranda ko'rinadi va «bu topshiriqning bitta to'g'ri javobi
yo'q» deb belgilanadi.

**Taqiqlanadi:** ularni bo'sh satr bilan «javobli» qilib ko'rsatish yoki
ro'yxatdan olib tashlash. Birinchisi o'quvchining har javobini xato deb
belgilaydi, ikkinchisi kontentning 15 % ini yo'q qiladi.

## D7. Media bazada emas, R2 da

Audio, video, rasm va PDF baytlari bazaga tushmaydi. Jadvalda faqat R2
kaliti saqlanadi (`dib/audio/voc_01_01_begr.mp3`), to'liq manzil
`R2_PUBLIC_URL` bilan birlashtirib olinadi.

## D8. Seed qayta ishga tushirilishi mumkin

Seed **idempotent**: manba id'lari (`dib-voc-01-01`, `no_02_01_fib_1`)
barqaror, shuning uchun qayta yugurtirish yangilaydi, takrorlamaydi.
`dib.json` qayta yig'ilganda seed ham qayta yuritiladi.

**Urinishlar hech qachon o'chirilmaydi** — seed kontentni yangilaydi,
tarixga tegmaydi. Mashq manbadan yo'qolsa, u `retiredAt` bilan
belgilanadi, o'chirilmaydi: o'chirilgan mashqqa ishora qiluvchi urinish
tarixi ma'nosini yo'qotadi.

## D9. Bo'lim ichida DARS bo'ladi

Birinchi bo'limda 226 so'z va 108 mashq bor — bitta ekranga sig'maydigan
hajm, va o'quvchi qayerdan boshlashini bilmaydi.

Dars donadorligi o'ylab topilmaydi, u MANBADA bor: lug'at bo'limlari
(o'rtacha 16 so'z) va grammatika sahifalari. Ya'ni to'rt qavat:

```
DARAJA A1.1 → BO'LIM «Tanishuv va salomlashish» → DARS «Salomlashish» (16 so'z)
```

Dars ikki xil: `VOCAB` (so'zlar + audio) va `GRAMMAR` (izoh + mashqlar).
Tartib: lug'at darslari avval, keyin grammatika — so'zsiz grammatika
ma'nosiz.

**Taqiqlanadi:** darsni bo'lim ichida qo'lda kesish yoki «har 10 so'zdan
bitta dars» kabi sun'iy bo'lish. Manbaning o'z bo'linishi mazmunga
bog'langan; raqam bo'yicha kesish bir mavzuni ikkiga bo'lib yuboradi.

## D10. Ekranda to'rt yo'nalish KO'RINADI, lekin holati rost aytiladi

Goethe imtihonining to'rt moduli — Hören, Lesen, Schreiben, Sprechen —
o'quv yo'lining maqsadi. Bizda hozir ularning bittasi ham to'liq yo'q:
Hören uchun audio va transkript bor, savollar yo'q; Lesen matnlari ikkala
manbada ham yo'q; Schreiben va Sprechen AI baholashni talab qiladi
(Faza 5).

Bizda bor narsa — lug'at va grammatika. Goethe tizimida bu to'rt
yo'nalishning yonidagi beshinchi narsa emas, ularning POYDEVORI.

Shuning uchun ekran shunday: poydevor (ishlaydi) + to'rt yo'nalish
(«tez orada»). Ularni yashirish o'quvchini grammatika mashqlarini nima
uchun yechayotganidan bexabar qoldiradi; ishlaydigandek ko'rsatish esa
bosilganda bo'sh ekran beradi.

## D11. Ball Faza 3 dan keyin, va u SAQLANMAYDI

Hozir faqat MC ishlaydi — 1 180 mashqning 255 tasi. Ball berilsa, ko'proq
MC tushgan o'quvchi yutadi: bilimi uchun emas, unga qaysi mashq to'g'ri
kelgani uchun.

Ball qator sifatida saqlanmaydi, har safar urinishlar jurnalidan
hisoblanadi. Formula albatta o'zgaradi; saqlangan ball o'zgargan kuni eski
va yangi qoida bo'yicha hisoblangan ballar aralashib qoladi va ularni
solishtirib bo'lmaydi.

Uchta qoida hozirdan belgilanadi, chunki ular jurnalning shakliga bog'liq:

- **Bir mashq bir marta ball beradi** (birinchi to'g'ri javob). Aks holda
  bitta oson mashqni yigirma marta yechib reyting boshiga chiqsa bo'ladi.
- **Xato javob jarima emas.** Jarima o'quvchini urinishdan qaytaradi — til
  o'rganishda eng yomon natija.
- **Filial reytingi muhrlangan qiymatdan hisoblanadi** (D3).

## 2. Ma'lumot modeli

```
DafUnit        id, level, order, titleUz, titleDe, sourceChapter
DafLesson      id, unitId, order, kind (VOCAB|GRAMMAR), titleUz, titleDe,
               grammarId, translationSource
DafLexeme      id, unitId, lessonId, de, en, uz, translationSource,
               audioKey, imageKey
DafGrammar     id, unitId, code, titleUz, titleDe, explanationEn, explanationUz,
               translationSource, level
DafExercise    id, unitId, lessonId, grammarId, kind, prompt, options, answers,
               answerStatus, slots, sourceSetCode, retiredAt
DafAttempt     id, studentId, exerciseId, isCorrect, given, durationMs,
               companyId, branchId, groupId, createdAt
```

`DafAttempt` da FK `exerciseId` bor, lekin `branchId`/`groupId`
**muhrlangan qiymat** — jonli bog'lanish emas.

## 3. API

Hammasi `@Roles('Student')`, `@CurrentUser('studentId')` bilan — mavjud
`student-portal.controller.ts` naqshi:

```
GET  /student-portal/lernen/levels          daraja yo'li + har darajadagi bo'limlar
GET  /student-portal/lernen/units/:id       bo'lim: darslar ro'yxati
GET  /student-portal/lernen/lessons/:id     dars: lug'at yoki grammatika + mashqlar
GET  /student-portal/lernen/grammar         92 grammatika mavzusi (yetimlari ham)
POST /student-portal/lernen/attempts        urinish yozish, natija qaytarish
```

`grammar` so'nggi nuqtasi kamchilikni yopadi: mashqlarning 459 tasi
(39 %) hech qaysi bo'limga tegishli emas, chunki ularning grammatika
sahifasini hech qaysi bob o'z mavzusi deb ko'rsatmagan. Bo'lim ekrani
ularni ko'rsatmaydi; grammatika ro'yxati ko'rsatadi.

`POST attempts` javobni **serverda** tekshiradi. To'g'ri javob mijozga
hech qachon yuborilmaydi — aks holda uni brauzerda ko'rish mumkin bo'lardi
va reyting ma'nosini yo'qotardi.

## 4. Ekran

`/portal/lernen` — Lumio uslubida, mavjud `student-nav-items.ts` ga
«Ta'lim» qatori qo'shiladi.

1. **Daraja yo'li** — A1.1 dan B1 gacha, o'sish halqasi bilan
2. **Daraja** — poydevor (lug'at va grammatika, ishlaydi) + to'rt yo'nalish
   (Hören, Lesen, Schreiben, Sprechen — «tez orada», D10)
3. **Bo'lim** — darslar ro'yxati, har birida hajmi va holati
4. **Dars** — lug'at (audio bilan) yoki grammatika izohi, so'ng mashqlar
5. **Mashq** — MC: variant tanlanadi, javob serverga ketadi, natija darhol
   ko'rinadi. Boshqa turlar ko'rinadi, lekin «tez orada» deb belgilanadi

## 5. Tekshiruv

- Seed idempotent: ikki marta yuritilganda qatorlar soni o'zgarmaydi
- `POST attempts` javobni serverda tekshiradi, mijozga kalit yubormaydi
- Urinishda `branchId`/`groupId` muhrlanadi va keyingi ko'chish uni
  o'zgartirmaydi
- Boshqa o'quvchining `studentId` si bilan urinish yozib bo'lmaydi
- Ochiq (`OPEN`) mashqqa javob yuborish rad etiladi
