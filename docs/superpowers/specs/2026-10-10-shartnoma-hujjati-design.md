# Shartnoma hujjati — 1-bosqich: profildan chiqarish va qog'ozda imzolash

**Sana:** 2026-10-10
**Holat:** dizayn kelishildi (10.10), reja kutilmoqda
**Asos:** [2026-09-24 shartnoma spec'i](2026-09-24-shartnoma-tolov-qoidalari-design.md) — 2-bo'lim (shartnoma hujjati), 10-bo'lim (filial), 15-bo'limdagi 4-qism
**Matn:** [shartnoma-2026-yakuniy.docx](../../tolov-savollari/shartnoma-2026-yakuniy.docx) — 02.10 dagi yakuniy matn (1-versiya)

24.09 spec'ida kelishilgan narsalar bu yerda qayta muhokama qilinmaydi.
Bu hujjat 4-qismning birinchi bosqichini aniqlashtiradi: shartnoma
tizimda qanday tuziladi, chop etiladi va qog'ozda imzolangani
belgilanadi.

---

## 1. Bosqichlar

| # | Bosqich | Bu hujjatda |
|---|---|---|
| 1 | Profildan shartnoma: tuzish, PDF, «qog'ozda imzolandi», bekor qilish, filial maydonlari | **ha** |
| 2 | Botda «Roziman» (voyaga yetgan Buyurtmachi), marketing roziligi | yo'q |
| 3 | Qo'shimcha kelishuvlar; «tasdiqlamagan o'quvchi 2-darsga kirmaydi»; shartnomasiz o'quvchilar ro'yxati | yo'q |

---

## 2. Qarorlar (10.10)

1. **Admin tanlaydi:** har bir kursga alohida shartnoma yoki bir nechta
   kurs bitta shartnomada.
2. **Bitta kurs bekor bo'lsa, shartnoma faqat shu kurs bo'yicha bekor
   bo'ladi**, qolgan kurslar davom etadi. Pul 6.2-band bo'yicha shu
   kursdan hisoblanadi (tizim allaqachon shunday qiladi, ADR-0044).
3. **Filial sozlamasiga** uchta maydon qo'shiladi: shahar, vakil ismi,
   vakil lavozimi.
4. **Bo'sh joylarni admin tizimda to'ldira oladi.** Qo'lda faqat imzolar
   va marketing roziligi katakchalari qoladi (7-bo'lim).
5. **Matn:** 02.10 dagi yakuniy matn — 1-versiya. Yurist tuzatish
   kiritsa, 2-versiya qo'shiladi; eski shartnomalar o'z versiyasida
   qoladi.
6. **Muhr shartnoma tuzilgan paytda qo'yiladi** (24.09 spec'ining
   1-bo'lim, 3-bandi): o'sha paytdagi kurs ma'lumotlari shartnomada
   saqlanadi va keyin o'zgarmaydi.

---

## 3. Hozirgi holat (prod, 10.10)

- **Eski `Contract` jadvalida 0 ta yozuv.** Lekin uni pul kodi o'qiydi:
  har bir dars yechimida `group.contracts[0]?.id`, to'lovda
  `Contract.paidAmount`, qaytarishda status. Unga yozuv qo'shilsa, dars
  yechimlari va to'lovlar unga bog'lana boshlaydi. Shuning uchun **yangi
  alohida jadval** quriladi, eski jadvalga tegilmaydi.
- **477 ta faol yozilish, hammasi oylik (`MONTHLY`) kursda, 477 ta
  o'quvchi.** Bazada «bir o'quvchi — bitta faol yozilish» qoidasi bor
  (`unique_active_enrollment_per_student`, 07.04 dan). Demak hozir har
  bir shartnomaga bitta kurs tushadi. «Bitta shartnomada bir nechta
  kurs» rejimi parallel kurslarga ruxsat berilgan kuni o'z-o'zidan
  ishlaydi — model buni hozirdan ko'taradi.
- **Tug'ilgan sana 168/477 o'quvchida bor, pasport 0/477 da.**
- **Filialda** manzil bor; shahar, vakil ismi va lavozimi yo'q.

---

## 4. Admin nimani ko'radi

O'quvchi profilida yangi **«Shartnomalar»** tabi (CEO, filial direktori,
Administrator ko'radi). Ma'lumoti tab ochilgandagina yuklanadi.

**Ro'yxat.** Har bir shartnoma: raqami, sanasi, holati (*imzolanmagan* /
*imzolangan* / *bekor qilingan*) va kurslari. Har bir kurs yonida uning
hozirgi holati (8-bo'lim).

**Ogohlantirish.** Faol yoki muzlatilgan oylik kurs hech qaysi amaldagi
shartnomaga bog'lanmagan bo'lsa — sariq yozuv: «Shartnomasiz kurs:
<kurs>, <guruh>» va «Shartnoma tuzish» tugmasi.

**«Shartnoma tuzish» oynasi:**

1. **Kurslar.** O'quvchining faol va muzlatilgan oylik kurslari, har
   birida katak. Amaldagi shartnomaga bog'langan kurs belgilanmaydi,
   yonida «№ DAF-2026-00012 da bor». Kamida bitta kurs belgilanadi.
2. **Tug'ilgan sana.** Profilda bo'lmasa, oyna so'raydi (majburiy) va
   profilga yozadi. Undan Buyurtmachi kimligi aniqlanadi.
3. **Buyurtmachi.** Kim: *o'quvchining o'zi* (faqat 18 yoshdan
   kattalar) / *ota-ona* / *vasiy yoki homiy* / *boshqa* (matn bilan).
   Maydonlar: F.I.O., tug'ilgan sana, pasport, yashash manzili,
   telefon, Telegram, e-mail. Hammasi ixtiyoriy, F.I.O. dan tashqari.
4. **Har bir kurs uchun:** dastlabki to'lov summasi (oldindan
   qo'yiladi, o'zgartirsa bo'ladi), to'lov sanasi, chegirma sababi va
   muddati, «Kurs ichiga kiradigan narsa» (darslik, materiallar, ichki
   test, sertifikat).

**Oldindan qo'yiladigan qiymatlar.** Shu o'quvchining oldingi shartnomasi
bo'lsa — Buyurtmachi maydonlari undan. Bo'lmasa profildan: kattalarga —
o'quvchining ismi, tug'ilgan sanasi, pasporti, manzili, telefoni,
Telegrami; voyaga yetmaganga — ota-onaning ismi va telefoni.

**Filial maydonlari bo'sh bo'lsa, shartnoma tuzilmaydi:** «Filial
sozlamasida shahar, vakil ismi va lavozimi kiritilmagan». Sabab:
filial ma'lumoti shartnomaga muhrlanadi — bo'sh holda tuzilgan
shartnoma bo'sh qoladi.

**Har bir shartnomada:**
- **PDF** — chop etish uchun, yangi oynada ochiladi.
- **Tahrirlash** — faqat imzolanmagan shartnomada; 3- va 4-banddagi
  qo'shimcha maydonlar. Kurs ma'lumotlari o'zgarmaydi.
- **«Qog'ozda imzolandi»** — tasdiq so'raladi; keyin shartnoma
  qulflanadi.
- **«Bekor qilish»** — sabab majburiy.

---

## 5. Holatlar va ruxsatlar

| Amal | Kim | Qachon |
|---|---|---|
| Ko'rish, PDF | CEO, filial direktori, Administrator | har doim |
| Tuzish | CEO, filial direktori, Administrator | filial maydonlari to'la, kurs bog'lanmagan |
| Tahrirlash | CEO, filial direktori, Administrator | imzolanmagan, bekor qilinmagan |
| «Qog'ozda imzolandi» | CEO, filial direktori, Administrator | imzolanmagan, bekor qilinmagan |
| Bekor qilish (imzolanmagan) | CEO, filial direktori, Administrator | sabab bilan |
| Bekor qilish (imzolangan) | faqat CEO | sabab bilan |

Hamma amal o'quvchining filiali bo'yicha cheklanadi
(`assertCallerMayTouchStudent`): boshqa filial o'quvchisining
shartnomasiga tegib bo'lmaydi. Rol bazadan o'qiladi (ADR-0028).

Bekor qilinganda shartnomaning kurslari undan ajratiladi va
«shartnomasiz» bo'lib qoladi — yangi shartnoma tuzish mumkin. Bekor
qilingan shartnoma ro'yxatda qoladi: kurslari muhrdan (`fields`)
ko'rsatiladi, holatsiz; PDF'i «BEKOR QILINGAN» yozuvi bilan chiqadi.

Imzolangan deb xato belgilangan shartnoma: CEO bekor qiladi, admin
yangisini tuzadi. Imzoni qaytarish tugmasi yo'q.

---

## 6. Ma'lumotlar

**Yangi `ContractDocument` jadvali** (eski `Contract` dan farqlash uchun
shu nom):

| Maydon | Ma'nosi |
|---|---|
| `number` | `DAF-YYYY-NNNNN`, yil — Toshkent yili; yil ichida ketma-ket; unikal |
| `studentId`, `branchId`, `companyId` | kimniki; filial — o'quvchining filiali |
| `templateVersion` | matn versiyasi (hozir 1) |
| `contractDate` | tuzilgan kun (Toshkent sanasi, `@db.Date`) |
| `fields` (JSON) | PDF'ga tushadigan hamma qiymat — muhr |
| `createdById`, `createdAt` | kim tuzgan |
| `signedAt`, `signedById`, `signMethod` | imzo; `signMethod` hozir faqat `PAPER` (2-bosqichda `BOT`) |
| `cancelledAt`, `cancelledById`, `cancelReason` | bekor qilish |

**`Enrollment.contractDocumentId`** (ixtiyoriy). Bitta yozilish — ko'pi
bilan bitta amaldagi shartnoma; bitta shartnoma — bir nechta yozilish.

**`fields` tarkibi:**
- `branch`: shahar, manzil, vakil ismi, lavozimi;
- `student`: F.I.O., tug'ilgan sana, voyaga yetmaganmi;
- `customer`: kim (`SELF` / `PARENT` / `GUARDIAN` / `OTHER` + matn),
  F.I.O., tug'ilgan sana, pasport, manzil, telefon, Telegram, e-mail;
- `courses[]`: `enrollmentId`, kurs nomi, daraja, guruh, ustozlar,
  boshlanish sanasi, dars kunlari, vaqti, haftasiga necha marta,
  1 dars daqiqasi, oylik narx, chegirma foizi, chegirma sababi va
  muddati, dastlabki to'lov summasi va sanasi, kursga kiradigan narsalar.

Tahrirlash faqat `customer` va kursdagi qo'shimcha maydonlarni
o'zgartiradi (4-bo'lim, 3–4-bandlar). Kurs ma'lumotlari, filial va
o'quvchi qismi tuzilgandan keyin o'zgarmaydi.

**`Branch`ga uchta maydon:** `city`, `representativeName`,
`representativePosition`. Filial sozlamasi formasida tahrirlanadi,
tarixga odatdagidek yoziladi.

---

## 7. PDF: maydonlar qayerdan to'ladi

| Shartnomadagi joy | Manba |
|---|---|
| № | `number` |
| «___ shahri», sana | filial shahri; `contractDate` («10» oktabr 2026 yil) |
| Filial manzili, vakil / lavozimi | filial sozlamasi |
| STIR, litsenziya, rekvizitlar (11-bo'lim) | matnning o'zida (1-versiya) |
| BUYURTMACHI bloki | `customer` |
| TA'LIM OLUVCHI bloki | Buyurtmachi o'quvchining o'zi bo'lsa — «Buyurtmachining o'zi»; aks holda o'quvchi F.I.O. va tug'ilgan sanasi, «voyaga yetmagan» katagi yoshdan |
| Vakillik asosi | `customer` turi |
| Til va daraja | «Nemis tili» + guruh darajasi |
| Kurs turi | kurs nomi |
| Guruh / pedagog | guruh nomi; ustozlar ismlari |
| Kurs boshlanish sanasi | yozilish sanasi (`startDate`, bo'lmasa `createdAt`) |
| Dars jadvali | guruh kunlari (o'zbekcha nomlari) va vaqti |
| Haftasiga darslar soni | guruh kunlari soni |
| 1 dars = __ daqiqa | guruh, bo'lmasa kurs kartochkasi |
| Kurs haqi (oylik) | kurs narxi |
| Chegirma | o'quvchining chegirma foizi (oylik hisob o'qiydigani, `Student.discountPercent`); 0 bo'lsa «yo'q»; sabab va muddat — admin kiritgani |
| Dastlabki to'lov | narxdan chegirma ayrilgani (oylik hisobning o'z formulasi bilan), admin o'zgartirishi mumkin; sana — admin kiritgani |
| Kurs ichiga kiradigan narsa | admin belgilagan kataklar |
| 11-bo'lim, Buyurtmachi | `customer` |
| 11-bo'lim, «M.O'.F.I.O.» | vakil ismi |
| Imzo yonidagi sanalar | `contractDate` |
| Imzolar | **qo'lda** |
| Marketing roziligi katakchalari | **qo'lda** — bu Buyurtmachining o'z tanlovi va o'z imzosi bilan bo'ladi; 2-bosqichda botda alohida so'raladi |

**Bir nechta kurs** bo'lsa, 2.1 jadvali har bir kurs uchun alohida
qism bo'lib takrorlanadi.

**Bo'sh qiymat** (admin to'ldirmagan) PDF'da chiziq bo'lib chiqadi.

**Shakl:** A4, chap chekka 23 mm, o'ng 15,6 mm (Word fayl bilan bir xil),
shrift Inter — kvitansiyalardagi kabi. PDF saqlanmaydi, har safar
`fields` dan yasaladi (`pdfmake`, kvitansiya yo'li). Bekor qilingan
shartnomada sahifa bo'ylab «BEKOR QILINGAN».

**Matn versiyasi.** 1-versiya — kodda alohida faylda, `yakuniy.docx`
bilan so'zma-so'z bir xil. Matndagi raqamlar (40%, 10 bank kuni,
24 soat, 30 kun, 14 kun) hozircha matnning o'zida. To'lov sozlamalari
(24.09 spec'ining 11-bo'limi) tayyor bo'lgach, ular sozlamadan olinadi
— bu yangi versiya bo'ladi.

**Tekshiriladi (reja paytida):** prod'dagi hamma kurs nemis tili
ekanligi. Boshqa til chiqsa, kursga til maydoni kerak bo'ladi.

---

## 8. Kursning hayoti

Shartnomadagi kurs holati — bog'langan yozilishning hozirgi holati:

| Yozilish | Shartnomada |
|---|---|
| Faol | o'qimoqda |
| Muzlatilgan | muzlatilgan |
| Boshqa guruhga o'tgan | guruh almashgan (yangi guruh nomi bilan) |
| Chiqarilgan / chetlatilgan | shu kurs bo'yicha bekor |
| Tugallangan | yakunlangan |

- **Guruh almashganda** yangi yozilish o'sha shartnomaga bog'lanadi
  (`enrollToGroup` ning transfer shoxi, o'sha tranzaksiyada). PDF muhr
  bo'yicha eski guruhni ko'rsataveradi — imzolangan narsa shu. Qo'shimcha
  kelishuv 3-bosqichda.
- **Chiqib, keyin qaytib yozilsa** (yangi yozilish, transfer emas) —
  yangi yozilish shartnomasiz, yangi shartnoma tuziladi.
- **Shartnoma o'zi yopilmaydi.** Hamma kursi bekor yoki yakunlangan
  bo'lsa ham shartnoma «imzolangan» holatida qoladi; ro'yxat kurs
  holatlarini ko'rsatadi.

---

## 9. API

Hammasi `@Roles('CEO', 'Branch Director', 'Administrator')`,
o'quvchi filiali bo'yicha cheklangan, `branch-route-policy` da
`BRANCH_SCOPED_BY_ENTITY`.

| Yo'l | Vazifasi |
|---|---|
| `GET /contract-documents?studentId=` | shartnomalar + shartnomasiz kurslar |
| `GET /contract-documents/prefill?studentId=` | oyna uchun oldindan qo'yiladigan qiymatlar, filial maydonlari to'lami |
| `POST /contract-documents` | tuzish: kurslar, kerak bo'lsa tug'ilgan sana, Buyurtmachi, kurs qo'shimchalari |
| `PATCH /contract-documents/:id` | qo'shimcha maydonlarni tahrirlash |
| `POST /contract-documents/:id/sign` | «qog'ozda imzolandi» |
| `POST /contract-documents/:id/cancel` | bekor qilish, sabab bilan (imzolangan — faqat CEO) |
| `GET /contract-documents/:id/pdf` | PDF |

**Tuzish bitta Serializable tranzaksiyada:** kurslarni qayta tekshiradi
(o'quvchiniki, oylik, faol yoki muzlatilgan, bog'lanmagan), raqam
beradi, `fields` ni yig'adi, yozilishlarni bog'laydi, tug'ilgan sana
bo'sh bo'lsa profilga yozadi, tarixga yozadi. Ikki admin bir vaqtda bir
kursga tuzsa, ikkinchisi 409 oladi.

**Tug'ilgan sana** faqat profilda bo'sh bo'lsa yoziladi (ADR-0039 dagi
kabi: xodim kiritgan qiymat ustidan yozilmaydi).

---

## 10. Tarix

O'quvchi tarixiga (`EntityHistory`, `Student`):
- `SHARTNOMA_TUZILDI` — raqam, kurslar;
- `SHARTNOMA_TAHRIRLANDI` — raqam, o'zgargan maydonlar;
- `SHARTNOMA_IMZOLANDI` — raqam, «qog'ozda»;
- `SHARTNOMA_BEKOR_QILINDI` — raqam, sabab.

Tug'ilgan sana yozilsa — odatdagi o'quvchi tahriri yozuvi.

---

## 11. Test

- Yosh: Toshkent kalendari bo'yicha, 18 yosh to'lgan kun chegarasi.
- Raqam: yil ichida ketma-ket, yangi yil 00001 dan, bir vaqtda ikki
  so'rov — ikki xil raqam.
- `fields` yig'ish: kunlar soni, daqiqa (guruh → kurs), chegirma 0 va
  >0, dastlabki to'lov formulasi oylik hisob bilan bir xil, bo'sh
  qiymatlar.
- Holatlar: imzolangan — tahrir 400; imzolanganni CEO bo'lmagan bekor
  qiladi — 403; bekor qilinganda yozilishlar ajraladi; bog'langan
  kursga ikkinchi shartnoma — 409; filial maydonlari bo'sh — 400.
- Voyaga yetmagan uchun `SELF` — 400.
- Transfer: yangi yozilish o'sha shartnomaga bog'lanadi.
- Boshqa filial o'quvchisi — 403; controller rol testlari; route
  manifest.
- PDF: bitta va ikki kursli shartnoma bufer qaytaradi; bekor
  qilinganida yozuv bor.
- Matn: 1-versiya matni `yakuniy.docx` matni bilan bir xil (docx'dan
  olingan matn bilan solishtiruvchi test yoki bir martalik tekshiruv).

---

## 12. Bu bosqichda qilinmaydi

- Botda «Roziman», o'quvchi kabinetida shartnoma, marketing roziligini
  tizimda saqlash — 2-bosqich.
- Qo'shimcha kelishuvlar, «tasdiqlamagan 2-darsga kirmaydi», butun
  markaz bo'yicha shartnomasizlar ro'yxati — 3-bosqich.
- Raqamlarni To'lov sozlamalaridan olish — sozlamalar qismi bilan.
- 12 talik (`LESSON_PACK`) kurslar shartnomasi — 24.09 spec'i, 1.5.
- Imzolangan qog'oz nusxasining rasmini yuklash.
- Chegirma muddatini tizim o'zi kuzatmaydi: shartnomaga yozilgan muddat
  tugaganda admin profildagi chegirmani o'zi olib tashlaydi. Bu oylik
  hisob `Discount` jadvaliga ulanganda yopiladi (24.09 spec'i, 14-bo'lim,
  4-topilma).

---

## 13. ADR

Yangi ma'lumot modeli — ADR shu ishning PR'ida yoziladi: «Shartnoma
hujjati alohida `ContractDocument` jadvalida; eski `Contract` pul kodi
o'qigani uchun ishlatilmaydi; qiymatlar tuzilganda muhrlanadi; matn
versiyalanadi». Raqam PR paytida `docs/adr/README.md` bo'yicha
tekshiriladi.
