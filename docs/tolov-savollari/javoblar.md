# To'lov tizimi — CEO javoblari

Manba: `docs/tolov-tizimi-savollari.pdf` (26 savol).
Javoblar suhbatda og'zaki olindi, sana: **2026-09-21**.
Holat: **26 / 26 — HAMMASI JAVOB BERILDI**.

> **24.09.2026 — yangi shartnoma ustuvor.** Bu javoblar yangi shartnomaga
> ([shartnoma-2026.docx](shartnoma-2026.docx)) moslashtirildi: 8 tasi
> o'zgardi, 3 tasiga shart qo'shildi (13, 17, 25), 14 tasi qoldi, 12 talik
> (23) keyin alohida ko'riladi. Zid kelgan
> joyda [2026-09-24-shartnoma-tolov-qoidalari-design.md](../superpowers/specs/2026-09-24-shartnoma-tolov-qoidalari-design.md)
> amal qiladi (uning ilovasida har bir javobning holati bor).

## Javob berilganlar

| # | Savol | Javob |
|---|---|---|
| 1 | Oyda dars soni o'zgarsa, ustoz oyligi o'zgarsinmi? | **Yo'q — ustoz ham bir xil oladi** |
| 2 | Ustoz davomatni kech kiritsa, haqi yozilaveradimi? | **Dars vaqtida olinishi shart. Kechiksa — sozlamadagi muhlat ichida (soat/kun) mumkin** |
| 3 | Ustoz oy o'rtasida ishdan ketsa? | **O'tgan darslariga qarab hisoblansin** |
| 4 | Yo'qolgan o'quvchining puli qancha kutsin? | **2 hafta** (sozlamadan o'zgartiriladi) |
| 5 | Pulni markaz hisobiga o'tkazishga kim qaror qilsin? | **Administrator ham** |
| 6 | Oy o'rtasida ketgan o'quvchiga pul qaytarilsinmi? | **Qat'iy qoida yo'q — administratorga ikki tanlov:** pul o'quvchigami yoki markazgami |
| 7 | Uzrli dars uchun nima berilsin? | **Keyingi oy to'lovi o'sha dars miqdorida kamaysin** (kredit) |
| 8 | Uzrli darslarga oylik chegara? | **Raqamli chegara yo'q — faqat shifokor ma'lumotnomasi bilan** |
| 9 | Undirib bo'lmagan qarz qachon kechirilsin? | **HECH QACHON. Qarz butun tarixi bilan saqlanadi** |
| 10 | Bayram tufayli dars bo'lmasa? | **Shu oy ichida qayta o'tiladi.** Bayram oy oxirida bo'lib, qayta dars keyingi oyga o'tib ketsa — bu holat ham hisobga olinsin |
| 12 | Oyda dars soni ko'p/kam bo'lsa, to'lov o'zgarsinmi? | **Yo'q — oylik narx qat'iy** (ikki marta tasdiqlandi) |
| 13 | Oy o'rtasida boshqa kursga o'tsa? | **Har kurs o'z narxi va o'sha oydagi o'z dars soniga bo'linadi** (misol tasdiqlandi) |
| 14 | Muzlatilganda puli nima bo'lsin? | **O'quvchi hisobida qoladi, belgilangan muddat kutiladi, keyin markazga o'tadi** |
| 15 | Muzlatishdan qaytgach? | **Faqat qolgan darslar uchun olinadi** |
| 11 | Ko'chirilgan darsga o'quvchi kela olmasa? | **Dars faqat hamma kela oladigan kunga ko'chirilsin** |
| 16 | Chegirmali o'quvchi uchun ustoz haqi kamaysinmi? | **Yo'q — to'liq narxdan hisoblansin, farqni markaz ko'taradi** |
| 17 | Butunlay bepul o'quvchi bo'lsinmi? | **Yo'q. Eng kam foiz o'quvchi profilida kiritiladi; imtiyozlilar alohida ro'yxatda ko'rinadi** |
| 18 | Uzrli dars qayta o'tilsinmi yoki puli qaytarilsinmi? | **Asosiysi — qayta o'tiladi. Imkoni bo'lmasa kredit. Ikkalasi sozlamadan tanlanadi** |
| 19 | Muzlatilganda muddat uzaysinmi yoki pul kutsinmi? | **Pul yo'li. Pul muzlatiladi → administrator sababli/sababsiz deb belgilaydi → sababli bo'lsa qaytariladi, sababsiz bo'lsa markazga o'tadi** |
| 20 | Kursni tashlaganda qancha ushlansin? | **Shartnomadagidek 50%** |
| 24 | 24 soat oldin xabar + ma'lumotnoma talab qilinsinmi? | **Ha — ikkalasi ham** (soat sozlamadan o'zgaradi) |
| 25 | Markaz aybi bilan dars o'tilmasa? | **Shartnomaga qo'shilsin: boshqa kunga ko'chiriladi** |
| 26 | Narx oshishidan 15 kun oldin xabar? | **Tizim narx o'zgarishini kelajak sanaga qo'yadigan bo'lsin** |
| 21 | To'lov muddati 1-kunmi yoki 10-kun? | **Qarz 1-kundan ko'rinsin** (10-kungacha ogohlantirilmaydi) |

## ⚠️ ASOSIY QOIDA (CEO, 21.09.2026)

> **Bu savollarning javoblari va ularga berilgan variantlarning hammasi
> sozlamaga chiqariladi. Kerakli boshqa variantlar ham qo'shiladi.
> Har bir markaz va HAR BIR FILIAL uchun alohida qiymat qo'yila oladi.**

Bu butun ishning shaklini o'zgartiradi:

- Dizaynda To'lov bo'limi uchun **6 ta sozlama** rejalashtirilgan edi.
  Endi **~25 ta** bo'ladi — deyarli har bir qaror bitta sozlama.
- Sozlamalar sahifasi hozir faqat **kompaniya darajasini** o'qiydi/yozadi;
  filial boshqacha qiymatga ega bo'lsa shunchaki sariq eslatma chiqaradi.
  Endi **filial darajasida tahrirlash** qo'shilishi kerak.
- `Setting` modeli buni allaqachon ko'taradi (`branchId` bor, qisman
  unique indeks bor) — ya'ni poydevor tayyor, ustki qism yozilmagan.
- **Nizo:** `payment.chargeDayOfMonth` hozir ataylab kompaniya darajasiga
  qulflangan, chunki oy boshi croni `branchId` bilan hech qachon
  o'qimaydi. Filialga chiqarish uchun cron ham o'zgartiriladi.

## Kodga ta'sir qiladigan tafsilotlar

### 13 — kurs almashish hisobi (tasdiqlangan misol)

Prod, 21.09.2026. Oktabr 2026: Standart guruhida 13 dars, Intensive
guruhida 22 dars. O'quvchi 15-oktabrda o'tadi.

| | Oyda jami | Tegishli | Bir dars | Jami |
|---|---|---|---|---|
| Standart (1–14) | 13 | 6 | 450 000 ÷ 13 = 34 615 | 207 690 |
| Intensive (15–31) | 22 | 12 | 740 000 ÷ 22 = 33 636 | 403 632 |
| **Oktabr** | | 18 | | **611 322** |

To'lagan 450 000 → qo'shimcha **161 322** undiriladi.

**Bo'luvchi — o'sha oyda guruhda HAQIQATAN nechta dars borligi** (13),
kursdagi `lessonPaymentCount` (12) emas. Aks holda qismlar qo'shilganda
oylik narx chiqmaydi. Arzonroq kursga o'tishda farq balansga qaytadi.

### 14/15 — muzlatish muddati YANGI SOZLAMA talab qiladi

1. Muzlatilganda o'tilmagan darslar puli o'quvchi hisobida qoladi
2. Sozlamadagi muddat kutiladi — **boshlang'ich qiymat: 2 hafta**
3. Muddat ichida qaytsa: faqat qolgan darslar uchun yechiladi
4. Qaytmasa: pul markaz hisobiga o'tadi

**MAJBURIY SHART (CEO):** muddat keyin o'zgartirilsa, allaqachon
muzlatilgan o'quvchilarga **eski muddat** amal qiladi. 2 hafta bilan
muzlatilgan odam, sozlama 10 kunga o'zgarsa ham, o'z 2 haftasini oladi.

→ Demak muddat muzlatish paytida o'quvchi yozuviga **muhrlanadi**
(stamp), sozlamadan jonli o'qilmaydi. Loyihadagi mavjud naqsh:
`SalaryAccrual` stavka versiyasini `lessonDate` bo'yicha muhrlagani kabi.

### 6 — bu yangi ish talab qiladi

Hozir o'quvchi chiqarilganda pul avtomatik qaytadi. Administrator uchun
«pul kimga?» degan dialog qo'shilishi kerak. 5-savol javobiga ko'ra
administrator ham bu tanlovni qila oladi.

### 10 — bayram darsi keyingi oyga o'tib ketsa

12- va 1-javoblarga ko'ra narx ikkala tomonda ham qat'iy (o'quvchi ham,
ustoz ham dars soniga bog'liq emas), shuning uchun dars keyingi oyga
surilsa pul masalasi chiqmaydi. **CEO tasdiqladi: dars surilsin, pulga
tegilmasin.**

### 2 — yangi sozlamalar: davomat muhlati

Davomat dars vaqtida olinishi kerak. Olinmasa — sozlamadagi muhlat
ichida (soat yoki kun) hali ham mumkin. Hozir tizimda ustoz uchun
«dars boshlanishidan 10 daqiqa oldin — dars tugagunicha» oynasi bor,
lekin u **kodga qotirilgan**. Sozlamaga chiqariladi.

### 17 — foiz global emas, o'quvchi profilida

Eng kam to'lov foizi bitta umumiy raqam emas: har o'quvchi uchun
profilida kiritiladi. Bundan tashqari **imtiyozli o'quvchilar alohida
ro'yxati** kerak — hozir bunday ro'yxat yo'q.

### 16 — bu mexanizm allaqachon bor

«To'liq narxdan, farqni markaz ko'taradi» — tizimdagi mavjud «markaz
qo'shimchasi» (center top-up) aynan shu. Yangi mantiq yozish shart emas,
oylik modelga ulash kifoya.

### 7 va 18 — ikkala yo'l ham qoladi

Asosiy yo'l: uzrli dars **qayta o'tiladi**, pulga tegilmaydi.
Qayta dars imkoni bo'lmasa: **keyingi oy to'lovi kamayadi** (kredit).
Ikkalasi ham sozlamadan tanlanadi, filial bo'yicha.

Demak `payment.excusedCreditEnabled` sozlama sifatida **qoladi**.
Dars «uzrli» deb tan olinishi uchun 8- va 24-javoblar amal qiladi:
shifokor ma'lumotnomasi + kamida 24 soat oldin xabar (soat sozlamadan).

### 26 — narx kelajak sanadan kuchga kiradi (YANGI ISH)

Hozir kurs narxi o'zgartirilsa o'sha zahoti kuchga kiradi. Endi narxga
«qachondan amal qiladi» sanasi qo'shiladi. Tizimda shunga o'xshash naqsh
allaqachon bor — `EmployeeSalaryConfigVersion` stavkani `effectiveFrom`
bilan saqlaydi. O'sha usul kurs narxiga ham qo'llanadi.

### 9 — qarz KECHIRILMAYDI (mavjud imkoniyatga zid)

CEO: «Qarz kechirilishi bo'lmaydi. Ketgan o'quvchi 1 yildan keyin qaytsa
ham uni qayta aniqlay olishimiz kerak. Qancha vaqt o'tsa ham qachon
qancha qarz qolib ketganini bilishimiz kerak.»

Ta'siri:

- Tizimda hozir `DEBT_WRITE_OFF` turi va `/payments/debt` sahifasida
  «Kechirilganlar» tabi bor. Yangi qoidaga ko'ra bu **ishlatilmaydi**.
  Mavjud yozuvlar bilan nima qilish alohida hal qilinadi.
- «Qachon qancha qarz qolgan» talabi allaqachon bor:
  `ReportsDebtHistoryService` qarzni paydo bo'lgan oyi bo'yicha
  ajratadi. Yangi mantiq shart emas.
- «1 yildan keyin qaytsa aniqlash» — o'quvchi arxivlansa ham yozuvi
  saqlanadi, ya'ni bu ham bor. Qidiruvda arxivdagilar chiqishi
  tekshirilishi kerak.

### 23 — IKKALA TO'LOV USULI HAM QOLADI

CEO: oyiga dars soni shartnomadagi 12 talik kabi qat'iy emas, oyga
qarab o'zgaradi. **Lekin eski 12 talik to'lov usuli tizimda saqlanadi.**

Dizaynda bu allaqachon bor: `Course.paymentModel` = `LESSON_PACK` yoki
`MONTHLY`, har kurs o'zinikini tanlaydi. Ya'ni qo'shimcha ish emas —
faqat eski usulni o'chirib tashlamaslik kerak.

### 22 — shartnoma narxlari

Shartnomaga bugungi haqiqiy narxlar yoziladi. Keyinchalik narx o'zgarsa
shartnomada ham yangilanadi.

### 19 — muzlatilgan pulning taqdirini ADMINISTRATOR hal qiladi

1. O'quvchi muzlatilganda o'tilmagan darslar puli **muzlatiladi**
   (o'quvchi ham ishlatolmaydi, markaz ham olmaydi)
2. Administrator **sababli** yoki **sababsiz** deb belgilaydi
3. **Sababli** → pul o'quvchiga qaytariladi. Boshqa guruhga o'tsa
   o'sha guruhda davom ettiradi
4. **Sababsiz** → pul **to'liq markaz hisobiga** o'tadi

**MAJBURIY TALAB (CEO):** administrator tanlashdan oldin **o'sha
tanlovning oqibatini ko'rib turishi** kerak — ya'ni dialogda
«sababli desangiz 277 000 o'quvchiga qaytadi / sababsiz desangiz
277 000 markazga o'tadi» deb yozilib turishi kerak.

Bu 6-javob bilan bir xil naqsh: administrator tanlaydi, va tanlovning
pul oqibati ekranda ko'rinib turadi.

**Ochiq tafsilot:** administrator «sababli» desa-yu, o'quvchi baribir
qaytmasa — 2 haftalik muhlat baribir ishlaydimi va pul markazga
o'tadimi? Hal qilinishi kerak.

## Hali javob berilmaganlar

Yo'q — hammasi javob berildi.
