# Oylik tizim: moliya va hisobotlardagi xatolarni tuzatish (A to'plami)

Sana: 27.09.2026. Holat: CEO tasdiqladi («Ha, boshla»), 5-qism matni kutilmoqda.

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

CEO matnni tasdiqlagandan keyin. Kunlik 20:00 jamlanmaga (ADR-0025) yangi
toifa: 1-sanada oy hisobi, 2-darsdan bir kun oldin hali to'lamaganlarga
eslatma. Tafsilot tasdiqdan keyin shu yerga yoziladi.

## 4. Tegilmaydi

- Sahifalar tuzilmasi va dizayni (B to'plami).
- Lidlar hisoboti.
- 01.09.2026 dan oldingi oylarning hisob formulalari.

## 5. Tekshirish

Har qism: avtomatik testlar (yangi xatti-harakatga qizil→yashil),
typecheck, lint, build. Raqamli o'zgarishlar prod bazada faqat o'qish
so'rovi bilan oldin/keyin solishtiriladi va CEO ga oddiy tilda aytiladi.
