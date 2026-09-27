# Oylik tizim: moliya va hisobotlardagi xatolarni tuzatish (A to'plami)

Sana: 27.09.2026. Holat: CEO tasdiqladi («Ha, boshla»); 5-qism matni ham tasdiqlandi.

## 1. Nega

01.09.2026 dan barcha kurslar oylik to'lovda (`Course.paymentModel = MONTHLY`,
o'tish 26.09 da bajarilgan). Moliya va Hisobotlar bo'limlari, to'lov oynalari va
Telegram xabarlarining bir qismi hali 12 talik paket mantig'ida ishlaydi:
noto'g'ri summa taklif qiladi, doim 0 yoki doim noto'g'ri raqam ko'rsatadi,
o'quvchiga qarz xabari yubormaydi. CEO: «bugundan hammasi to'g'ri ishlashi kerak».

To'liq tahlil (raqamlar bilan) repodan tashqarida saqlangan. Bu hujjat faqat
qarorlar va o'zgarishlar ro'yxati.

Oylik modelning ledgerdagi ko'rinishi (tahlilda tasdiqlangan):
- oy hisobi — `LESSON_DEDUCTION`, `metadata.mode = 'MONTHLY_PERIOD'`, bitta
  `EnrollmentMonthlyCharge` qatoriga bog'langan;
- oylik kursdagi davomat balansga tegmaydi va `LESSON_CONSUMPTION` yozmaydi;
- o'quvchi chiqqanda/muzlaganda o'tmagan darslar puli `ADJUSTMENT`
  (`metadata.kind = 'monthly-release'`) bilan qaytadi;
- uzrli dars keyingi oy hisobidan chegiriladi (tranzaksiya yo'q).

## 2. CEO qarorlari (27.09)

1. **Qarz — ikki alohida raqam, hech qayerda qo'shilmaydi.**
   - «O'qiyotganlar qarzi» — `Student.status = ACTIVE`. Ichida ikki qism:
     🟡 shu oy (qarzning shu oy hisobigacha bo'lgan qismi) va 🔴 eski qarz
     (qolgani). `shuOy = min(qarz, shu oyning CHARGED hisoblari yig'indisi)`.
   - «Ketganlar va muzlatilganlar qarzi» — qolgan barcha statuslar.
   - Joyi va ko'rinishi farq qiladi; Moliya, Bosh sahifa, Telegram, Excel
     hammasida shu ikki ta'rif.
2. **Pul qaytarish — shartnoma 6.2 (40% qoidasi).** Joriy oy darslarining
   40% dan ko'prog'i o'tgan bo'lsa, o'quvchi chiqqanda pul qaytarilmaydi.
   Batafsil: `2026-09-24-shartnoma-tolov-qoidalari-design.md` 7-bo'lim.
   O'qiyotgan (chiqmagan) o'quvchiga oyning bir qismi qaytarilmaydi.
3. **O'quvchiga oylik to'lov xabari — Telegram bot orqali.** Ikki xabar
   (1-sanada hisob, 2-darsdan bir kun oldin eslatma). Matn CEO tasdig'ini
   kutadi — 5-qism tasdiqdan keyin boshlanadi.
4. Sahifalar tuzilmasini qayta qurish (B to'plami) bu hujjatga kirmaydi — u
   alohida, CEO rasm ko'rib tasdiqlagandan keyin. Bu yerda faqat noto'g'ri
   raqam va noto'g'ri amallar.

## 3. Qismlar

Har qism — alohida PR, alohida reja, CEO ruxsati bilan saytga.

### A1. Pulga ta'sir qiladigan xatolar

1. **To'lov qayd qilish oynasi** (`payments-preview.service.ts`,
   `record-payment-dialog.tsx`). Hamma yozilishi MONTHLY bo'lgan o'quvchi
   uchun: «sikl», «12 dars», «narx ÷ lessonPaymentCount» yo'q. Ko'rsatiladi:
   hozirgi qarz, keyingi oy summasi (faol oylik yozilishlar narxi, o'quvchi
   chegirmasi bilan). Tez tugmalar: «Qarzni yopish», «Qarz + keyingi oy»,
   «1 oy», «2 oy». To'lov balansga tushadi va avval qarzni yopadi, qolgani
   keyingi oy hisobiga qoladi — oyna shuni yozadi. Paket (LESSON_PACK)
   yozilishi bor o'quvchida eski yo'l o'zgarmaydi.
2. **Muzlatish oynasining «qolgan darslar» yo'li** (`students-read.service.ts`
   prepaid preview, `enrollment-billing.service.ts` override,
   `change-status-dialog.tsx`). MONTHLY yozilishlar bu ro'yxatga kirmaydi va
   qo'lda son server tomonida rad etiladi. Oylik yozilish uchun oyna tizim
   o'zi qaytaradigan summani ko'rsatadi (`reverseChargeForDeparture` bilan
   bir xil hisob, yozmasdan).
3. **Qarz kechirish teskari yo'li.** Kechirishni bekor qilish qatori
   (`reversedTransactionId` bor) ro'yxatda ko'rsatilmaydi va uni «qaytarib
   olib» bo'lmaydi — aks holda o'chirilgan qarz kechirish qayta ishlaydi.
4. **Filial qamrovi.**
   - `/reports/payment-reports` filiallar taqsimoti chaqiruvchi qamrovidan
     chiqmaydi;
   - qaytarilgan pul summasi filial bo'yicha;
   - sof foyda keshi kaliti filial to'plamini o'z ichiga oladi (ko'p filialli
     direktor kompaniya umumiy yozuvini olmaydi);
   - `expectation-history` ko'p filialli qamrovda kompaniya seriyasiga
     tushmaydi (fail-closed);
   - ko'p filialli direktor to'lov hisobotlarida cheksiz «yuklanmoqda» o'rniga
     xato holatini ko'radi.

### A2. Noto'g'ri raqamlar

1. **«Bu oy hisoblandi»** — oylik oylar (01.09.2026 dan) uchun oyning asosiy
   raqami = shu oyning CHARGED `EnrollmentMonthlyCharge.chargedAmount`
   yig'indisi (filial bo'yicha). U «Oy oxiriga kutilyapti» bashoratini
   almashtiradi: Moliya sahifasi, Telegram 21:00, «Moliyaviy xulosa»,
   Excel, Bosh sahifa. Yig'im foizi = shu oy uchun yig'ilgan ÷ hisoblandi.
   Oylik tizimdan oldingi oylar eski formulada qoladi (tarix o'zgarmaydi).
2. **Telegram «💰 Moliyaviy xulosa»** kanonik servisdan o'qiydi (hozir xom
   servis `expected: 0` qaytaradi).
3. **Olib tashlanadigan raqamlar** (doim noto'g'ri yoki doim 0):
   - Moliya → «Hisoblangan darslar» va takror «Tushgan tushum»;
   - To'lov hisobotlari → «Vaqtida to'lovlar» (÷ 12);
   - To'lov hisobotlari → ustozlar jadvalidagi to'lov ustunlari (shartnoma
     orqali bog'lanadi, shartnoma yo'q);
   - Ketgan o'quvchilar → «Yo'qotilgan daromad»;
   - Excel → «Hisoblangan daromad (darslar)».
4. **Qarz ikki raqam** (2-bo'lim, 1-qaror) — barcha yuzalarda.
5. **Excel «Xulosa» 4-blok** — oylik oyda qarzdorlar bor bo'lsa «hammasi
   to'langan» demaydi: oy hisobi / shundan to'langan / to'lanmagan.
6. **Bosh sahifa davomat foizi** — Davomat sahifasi bilan bir xil (uzrli
   dars maxrajdan chiqadi).
7. **Bekor qilingan pul qaytarish sof foydada qaytarish bo'lib sanalmaydi.**
   `getPeriodOutflows` REFUND qatorlarini faqat `reversedAt: null` bilan
   filtrlaydi; bekor qilishning qarshi qatori (musbat REFUND) qoladi va
   `Math.abs` uni qaytarish qiladi. `reversedTransactionId: null` qo'shiladi,
   sof foyda keshi versiyasi oshiriladi.
8. **Ko'p filialli direktor tanlagan filialda xodimlar oyligi 0 bo'lmaydi.**
   Sof foydaning oylik oyog'i faqat asosiy filialni oladi
   (`narrowPayrollScope`); boshqa filial tanlanganda oylik «blocked» bo'lib,
   foyda ortiq ko'rinadi. Oylik oyog'i tanlangan filialga (direktor shifti
   ichida) qamrovlanadi.
9. **Bekor qilingan qarz kechirish boshqa hisobotlarda ham chiqarilmaydi.**
   A1 ro'yxat va Moliya kartasini tuzatdi; qolgan o'quvchilar kohortasi,
   oylik qarzdorlik tarixi va Telegram kunlik hisobotidagi `DEBT_WRITE_OFF`
   o'qishlariga ham `reversedTransactionId: null` qo'shiladi.
10. **A1 dan qolgan mayda ishlar:**
    - to'lov oynasidagi «keyingi oy» summasi to'xtatilgan (PAUSED) guruhdagi
      yozilishni ham qo'shadi, oylik hisob esa uni o'tkazib yuboradi;
    - `reports-payments.service.ts` dagi «sof foyda bilan bir xil manba»
      izohi 7-band tuzatilgach to'g'rilanadi, `Math.abs` o'rniga `0 - summa`;
    - ko'p filialli direktor to'lov hisobotlarida ustozlar jadvali uchun
      filial tanlashi kerak (kartalar ishlaydi);
    - kurs to'lov turini LESSON_PACK → MONTHLY almashtirish qolgan paket
      darslari hisoblagichini nolga tushirmaydi.

### A3. Matnlar va ish haqi

1. **Ish haqi** — oylik oylar uchun «O'quvchilar to'lagan / Markaz qo'shdi»
   bo'linmasi va «Markaz qo'shimchasi — undirish holati» kartasi
   ko'rsatilmaydi: bitta «Hisoblangan» raqami. Iyul–avgust tarixi o'zgarmaydi.
   Excel «Oyliklar», Telegram 21:00 va ustoz portali ham shunday.
2. «/tsikl», «/cycle», «(12/20 darsga taqsimlanadi)» → oylik ma'nosi.
3. Telegram davomat xabari: «Dars: N / 12» o'rniga shu oydagi dars soni.
4. Guruhga yozish oynasi: «Kurs narxi (12 dars)» → «Oylik narx», to'lanadigan
   summa oy o'rtasida proratsiya bilan.
5. Pul qaytarish oynasi: oylik o'quvchiga «oldindan to'langan darsi yo'q»
   degan yolg'on ogohlantirish o'rniga 2-qaror.
6. **Ekranda inglizcha so'z yo'q** (CEO, 27.09): foydalanuvchi ko'radigan
   matnda «prepaid», «cycle», «LTV», «CAC», «ROI», «Retention», «(present)»,
   «Ties», «Cash tie-out», «GL recon» kabi so'zlar o'zbekchaga almashtiriladi
   (sayt, Excel, Telegram, PDF). Muzlatish oynasi va qaytarish xatosidagi
   «prepaid» A1 da tuzatildi.

### A4. 40% qoidasi (shartnoma 6.2)

- Qo'llanadi: MONTHLY yozilish, chiqish sanasi 01.10.2026 yoki keyin.
  Sentabrda chiqqanlar eski tartibda.
- Admin chiqarishda sababni tanlaydi; oyna oqibatni oldindan ko'rsatadi:

  | Sabab | Natija |
  |---|---|
  | O'quvchi bekor qildi | o'tgan ulush ≤ 40% → o'tmagan darslar qaytadi; > 40% → qaytmaydi |
  | Markaz tashabbusi (intizom) | o'tmagan darslar qaytadi |
  | Sifatsizlik | shu oy to'liq qaytadi |
  | Kurs boshlanishidan oldin | to'liq qaytadi |

- Ulush = shu oyda o'quvchi uchun qoplangan darslardan chiqish kunigacha
  o'tganlari ÷ qoplangan darslar soni (oy o'rtasida qo'shilgan o'quvchida
  maxraj — uning o'z darslari). Misol: 13 darsdan 5 tasi (38%) — 8 dars
  qaytadi; 6 tasi (46%) — qaytmaydi.
- Chegara sozlamada: `payment.noRefundAfterPercent = 40`.
- Muzlatish va guruh almashtirish bu qoidaga kirmaydi (pul hisobda turadi).
- Oyna ko'rinishi qurishdan oldin CEO ga ko'rsatiladi.
- Qaror ADR sifatida yoziladi.

### A5. O'quvchiga oylik to'lov xabari

Matn CEO tomonidan 27.09 da tasdiqlandi. Kunlik 20:00 jamlanmaga
(ADR-0025) yangi toifa sifatida qo'shiladi.

**1-xabar — oy hisobi yozilgan kuni (odatda 1-sana), 20:00.** Har bir faol
oylik yozilish uchun bitta blok (bir nechta guruhi bo'lsa — har biri alohida).
Qatorlar faqat qiymati bo'lsa chiqadi (chegirma yo'q bo'lsa chegirma qatorlari
chiqmaydi; eski qarz yo'q bo'lsa «Sentabrdan qolgan qarz» chiqmaydi):

```
Hurmatli {ism}!

📅 <b>{Oy} oyi uchun to'lov</b>
Guruh: {guruh} ({kunlar})
Oylik narx: {oylik narx} ({dars soni} dars)
{O'tgan oy}dagi {N} ta sababli dars uchun chegirma: −{summa}
Chegirma bilan {oy} uchun: {summa}
{O'tgan oy}dan qolgan qarz: {summa}
Jami to'lash kerak: <b>{summa}</b>
Muddat: <b>{sana}</b> — oyning 2-darsigacha

To'lov: markazda, Payme yoki Click orqali.
🔗 Profilingiz: https://student.dafzentrum.uz
```

Balans oyni to'liq qoplagan bo'lsa (to'lash kerak = 0):

```
Hurmatli {ism}!

📅 <b>{Oy} oyi uchun to'lov</b>
Guruh: {guruh} ({kunlar})
Oylik narx {summa} balansingizdan yechildi.
Qolgan balans: <b>{summa}</b>
{Oy} uchun to'lov qilish shart emas.

Rahmat!
```

**2-xabar — oyning 2-darsidan bir kun oldin, 20:00, faqat hali to'lamaganlarga**
(balans < 0 bo'lsa). 1-va 2-dars ketma-ket kunlarda bo'lsa, 1-xabar bilan
bitta jamlanmaga tushadi.

```
Hurmatli {ism}!

⏰ <b>To'lov eslatmasi</b>
Ertaga ({sana}) {oy}ning 2-darsi bo'ladi.
To'lash kerak: <b>{summa}</b>

Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. Darslaringiz uzilib
qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.

To'lov: markazda, Payme yoki Click orqali.
Savollar bo'lsa, markaz administratoriga murojaat qiling.
🔗 Profilingiz: https://student.dafzentrum.uz
```

O'quvchiga ko'rinadigan matnda «uzrli» emas, «sababli» so'zi ishlatiladi
(CEO, 27.09).

## 4. Tegilmaydi

- Sahifalar tuzilmasi va dizayni (B to'plami).
- Lidlar hisoboti.
- 01.09.2026 dan oldingi oylarning hisob formulalari.

## 5. Tekshirish

Har qism: avtomatik testlar (yangi xatti-harakatga qizil→yashil),
typecheck, lint, build. Raqamli o'zgarishlar prod bazada faqat o'qish
so'rovi bilan oldin/keyin solishtiriladi va CEO ga oddiy tilda aytiladi.
