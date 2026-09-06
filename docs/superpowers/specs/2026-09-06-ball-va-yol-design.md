# Ball, daraja va o'quv yo'li — dizayn

**Sana:** 2026-09-06
**Bog'liq:** [A1 kurs dizayni](2026-09-03-a1-kurs-design.md),
[mashq ekrani dizayni](2026-09-05-lernen-ekrani-design.md)

Mashq ekrani productionda. O'quvchi darsni o'tadi, xato so'zlari qaytadi,
natijasini ko'radi. Lekin ekranda **o'sish hissi yo'q**: ball yo'q, daraja
yo'q, boshqalar bilan taqqoslash yo'q, va yo'lning o'zi oddiy kartalar
ro'yxati.

Bu hujjat shuni to'g'rilaydi.

---

## 1. Nima quriladi

Ikkita bog'liq narsa, bitta rejada:

**Yo'l** — `/portal/lernen` Duolingo uslubidagi zigzagga qaytadi, har tugun
bitta seans. A2 va B1 qulflangan holda ko'rinadi.

**Ball tizimi** — har o'rgangan so'z uchun ball, undan daraja, haftalik
jadval va seriya.

Bittasini ikkinchisisiz qilib bo'lmaydi: ball aynan yo'l ekranining
tepasida yashaydi, ya'ni ekranga ikki marta tegmaslik uchun birga
qilinadi.

**Bu dizaynda YO'Q:** tanishtirish qadami (avatar + dialog). U alohida
qoladi, chunki 64 bo'limga kontent yozishni talab qiladi.

---

## 2. Yo'l: tugun = seans

Hozir yo'l 12 ta unit kartasidan iborat, unitni bosasiz — seanslar
ro'yxati chiqadi. Yangisida **har seans o'z tuguni**, unit nomi tugunlar
orasida sarlavha bo'lib turadi. Tugunni bosasiz — mashq **darrov**
boshlanadi.

**Nega:** Duolingoning asosiy hissi shu — bosdingiz va o'ynadingiz.
Bizdagi ikki bosqichli yo'l (unit → ro'yxat → seans) har safar bitta
ortiqcha qadam qo'shardi.

Tugun uch holatda: bajarilgan (✓), navbatdagi (to'ldirilgan, atrofida
halqa), qulflangan (bo'sh doira). Ketma-ketlik qat'iy — bu qoida
o'zgarmaydi, sababi kurs dizaynidagi progressiya qoidasi.

**Daraja rangi.** Har daraja o'z tusiga ega: A1 marjon, A2 ko'k-yashil,
B1 siyoh. Yo'l uzluksiz, ya'ni daraja o'zgarganini faqat rang va kichik
yorliq bildiradi. `LessonNode` komponentida bu allaqachon bor.

**A2 va B1.** Server `getLevels` da uchala darajani har doim qaytaradi,
kontenti bo'lmasa ham. Ular yo'lning oxirida qulflangan tugun va «tez
orada» yozuvi bilan turadi. Serverga ish yo'q.

**Unit sahifasi.** Yo'l endi seanslarni o'zi ko'rsatgani uchun
`/portal/lernen/units/[unitId]` navigatsiyadan chiqadi. **O'chirilmaydi:**
yo'ldagi unit sarlavhasi bosiladigan bo'ladi va o'sha sahifani «bu unitda
nimalar bor» degan qisqacha sifatida ochadi. Duolingoda bu «guidebook»
deb ataladi. Sahifa yozilgan va ko'rikdan o'tgan — uni tashlash bekorga
yo'qotish bo'lardi.

---

## 3. Ball: so'z uchun, savol uchun emas

Bitta qoida:

> **Muddati kelgan so'zga to'g'ri javob berilsa — 10 ball.**

«Muddati kelgan» ikki holatni qamraydi:

1. So'z hali hech qachon so'ralmagan (yangi material)
2. So'zning Leitner muddati yetib kelgan (takrorlash)

Boshqa hamma holatda **nol**.

**`PAAR` bundan mustasno emas, faqat ko'p so'zga tegishli.** Bitta `PAAR`
savoli to'rt so'zni juftlaydi va server har juftni alohida tekshiradi
(`pruefePaar`). Ball ham shunday: to'rt so'zning har biri o'z juftini
to'g'ri topgan VA muddati kelgan bo'lsa 10 ball beradi. Ya'ni bitta savol
40 ballgacha berishi mumkin — bu adolatli, chunki u to'rt so'zni birdan
tekshiradi.

### 3.1 Nega bu qoida yetarli

**Qayta o'tish ball bermaydi.** Darsni ikkinchi marta o'tsangiz, uning
so'zlari hali muddatiga yetmagan bo'ladi — hammasi nol. Oson darsni
takrorlab jadval tepasiga chiqib bo'lmaydi.

**Takrorlashni o'ynab ham bo'lmaydi.** So'zga javob berilishi bilan u
bugungi navbatdan chiqadi: to'g'ri javob uni +1/+3/+7/+16/+35 kunga
suradi, xato javob esa ertangi kunga qo'yadi (`leitner.ts`). Navbat
o'ynaganda faqat **kamayadi**. Bugungi ball shipi bir necha kun oldin
belgilanib bo'lgan.

**Gap va ibora savollari ball bermaydi.** Sabab texnik emas, mazmuniy:
Leitner jadvali faqat so'zlarni kuzatadi, va gapdagi so'zlar allaqachon
hisoblangan. Gap tuzish — mashq, yangi bilim emas.

Buning ko'rinadigan natijasi: seans balli o'zgarib turadi. 12 savolli
seans 120 ball emas, savollar tarkibiga qarab 40–100 ball beradi. Bu
ataylab — «12/12 = 120» soddaroq bo'lardi, lekin u holda gap savollarini
ham hisoblash kerak bo'lardi va qoida ikkiga bo'linardi.

### 3.2 Ball SERVERDA hisoblanadi

Ball mijozdan **so'ralmaydi**. `pruefen` javobni tekshirayotganda so'zning
Leitner holatini allaqachon o'qiydi — ya'ni «muddati kelganmidi» degan
savolga o'zi javob beradi va ballni o'sha yerda yozadi.

**Nega bu shart.** Ilgari seans natijasini mijoz aytardi va bu xavfsiz
edi: yolg'on aytishdan yutadigan narsa faqat keyingi darsning ochilishi
edi. Endi ball ommaviy jadvalga tushadi, ya'ni yolg'on **arziydigan**
bo'ladi. Brauzerning tarmoq oynasini biladigan bitta o'quvchi jadvalni
buzib qo'yishi mumkin.

`abschluss` yo'li qoladi, lekin endi u faqat darsni tugallangan deb
belgilaydi — ballga tegmaydi.

### 3.3 Ma'lumot qayerda saqlanadi

`DafAttempt` ga bitta ustun qo'shiladi: `points Int @default(0)`.

Yangi jadval kerak emas. `DafAttempt` da `createdAt` bor, ya'ni haftalik
yig'indi shundan chiqadi.

**Bitta qarzni yopish kerak.** Hozir `pruefen` urinishni yozayotganda
`branchId` va `groupId` ni **to'ldirmaydi** (faqat `companyId`). Guruh
jadvali aynan o'sha `groupId` ga tayanadi, shuning uchun ular yozilishi
kerak — sxemada maydonlar allaqachon bor va izohda «yozish paytida
muhrlanadi» deb turibdi.

---

## 4. Takrorlash seansi

Yangi seans turi: **«Takrorlash»** — o'quvchi o'rgangan hamma narsadan
muddati kelgan so'zlar bilan to'ldirilgan seans.

**Nega kerak.** Ballning farq qoidasi bilan hamma darsni tugatgan o'quvchi
boshqa ball topa olmaydi va haftalik jadvaldan yo'qoladi — jadval eng
kuchli o'quvchini jazolaydi. Takrorlash seansi shu teshikni yopadi, va
u **tuzilishi bo'yicha** har kuni yangi: muddati kelgan so'zlar to'plami
har kuni o'zgaradi.

Dvigatelda mashina bor: `baueWiederholung` muddati kelgan so'zlarni
tanlaydi, lekin hozir oddiy seansning atigi oltidan bir qismini
to'ldiradi. Takrorlash seansi uni **butun seans** uchun ishlatadi.

**Yo'li `lessons/:id` bilan to'qnashmasligi kerak.** Takrorlash seansi
hech qanday darsga tegishli emas, shuning uchun u `lessons/` ostida emas,
`wiederholung/` da yashaydi — aks holda `:id` uni son deb o'qishga urinardi.

**Yo'lda qayerda.** Yo'lning tepasida, unitlardan alohida — muddati
kelgan so'z bo'lsa faol, bo'lmasa xira va «bugun takrorlanadigan so'z
yo'q» deb yozilgan. Kun bo'yi bir necha marta ochilishi mumkin, lekin
navbat kamayib borgani uchun o'zi tugaydi.

**Muddati kelgan so'z yo'q bo'lsa** seans qurilmaydi. Bu xato emas —
normal holat, va ekranda shunday deyiladi.

---

## 5. Daraja

Umumiy balldan kelib chiqadi va **hech qachon nolga tushmaydi**. Bu
o'quvchining uzoq muddatli o'sishi; haftalik jadval esa qisqa musobaqa.

| Daraja | O'zbekcha | Ball |
| --- | --- | --- |
| Anfänger | Boshlovchi | 0 |
| Lerner | O'rganuvchi | 300 |
| Kenner | Bilimdon | 1 500 |
| Könner | Mohir | 4 000 |
| Profi | Usta | 9 000 |
| Meister | Ustoz | 16 000 |

Nomlari nemischa, ostida o'zbekchasi — maktab nemis tili o'rgatadi va
o'quvchi yo'l-yo'lakay oltita so'z oladi.

**Chegaralar qayerdan.** A1 da 592 asosiy so'z bor. Har so'z birinchi
o'rganilganda 10 ball, keyin Leitner narvoni bo'ylab besh marta qaytadi
— ya'ni bitta so'z umri davomida ≈60 ball beradi. Butun A1 ≈ 35 000 ball.
Birinchi daraja bir necha seansdan keyin ochiladi (o'quvchi tizim
ishlayotganini darrov ko'radi), oxirgisi A1 ning deyarli yarmini talab
qiladi.

**Daraja CEFR emas.** `A1`/`A2`/`B1` — kursning bosqichi, `Anfänger`…
`Meister` — o'quvchining mashq darajasi. Ikkalasi bir ekranda turadi,
shuning uchun nomlari ataylab boshqa oilaga tegishli.

---

## 6. Haftalik jadval

**Dushanba kuni Toshkent vaqti bilan** yangilanadi.

Ikkita jadval:

- **Guruhim** — o'quvchi guruhidoshlari orasida
- **Markaz** — butun markaz bo'yicha, **barcha filiallar aralash**

Uchinchi tab — **Darajam** — jadval emas, o'quvchining o'z o'sishi:
umumiy ball, daraja, keyingi darajagacha qancha qolgani.

### 6.1 Filiallar aro — ataylab qilingan istisno

Bu repoda deyarli hamma narsa filialga qulflangan (`branch-route-policy`
manifesti, `narrowPayrollScope`, va hokazo). O'quvchilar reytingi shundan
**ataylab chiqariladi**: CEO 2026-09-06 da aniq aytdi — reyting butun
markaz bo'yicha bo'lsin.

Natijasi ochiq aytiladi: Namangandagi o'quvchi Farg'onadagi o'quvchining
**to'liq ismi va familyasini** ko'radi. Bu ham CEO qarori.

Yo'l `SELF` toifasiga tushadi (javob so'ragan o'quvchiga bog'liq), lekin
uning ichida filial chegarasi qo'yilmaydi — buning sababi manifest
izohida yoziladi, aks holda keyingi o'quvchi buni xato deb «tuzatib»
qo'yadi.

### 6.2 Qoidalar

**Nol ballilar ham ko'rinadi.** Aks holda hafta boshida o'quvchi o'zini
jadvalda topa olmaydi va tizimni buzuq deb o'ylaydi.

**Guruh — ball topilgan paytdagi guruh.** O'quvchi bir vaqtda ikkita
guruhda bo'lishi mumkin va guruhi o'zgarishi mumkin. Ball yozuvidagi
`groupId` muhrlangani uchun eski guruhda topilgan ball o'sha guruhda
qoladi. Guruhi yo'q o'quvchi guruh jadvalida ko'rinmaydi, markaz
jadvalida ko'rinadi.

**Faqat o'quvchilar.** Xodim, o'qituvchi va CEO jadvalga tushmaydi.

**Teng ball** — oldin yetgani yuqorida turadi.

---

## 7. Seriya

Ketma-ket nechta kun kamida bitta seans tugatilgan. Bugun tugatilmasa
seriya saqlanadi (kun tugamagan); bir kun butunlay tashlansa nolga
tushadi.

**Jazo yo'q.** Duolingoda yurak, tosh va seriyani pulga sotib olish bor.
Bizda yo'q. Seriya shunchaki raqam: yo'qotsangiz, boshqa hech narsa
yo'qolmaydi.

**Nega jazolamaymiz.** Bizning o'quvchi pul to'lab o'qiydi va darsga
baribir keladi. Uni ilova ichida ushlab turish kerak emas — faqat uyda
mashq qilishni eslatib turish kerak. Bu ekran aynan uy ishi uchun
qurilgan.

Yangi ma'lumot kerak emas: seriya ball yozuvlarining sanalaridan
hisoblanadi.

---

## 8. Ekranlar

### 8.1 Yo'l tepasi

To'rtta belgi: **daraja** (Kenner), **ball** (1 240), **seriya** (14 kun),
**o'rin** (🏆 3).

Kubokni bosasiz — reyting ekrani, uch tab bilan (Guruhim / Markaz /
Darajam).

Telefonda to'rtta belgi tor joyga sig'ishi kerak — raqamlar qisqartiriladi
(1 240 → 1.2k) va yozuvlar tushib qoladi, faqat belgi va son qoladi.

### 8.2 Seans oxiri

Hozirgi ekranga uchta narsa qo'shiladi:

- **Topilgan ball** — «+70 ball», sanalib chiqadigan qilib
- **Seriya** — faqat bugungi birinchi seans bo'lsa
- **O'rin o'zgarishi** — faqat **o'zgargan bo'lsa**

Oxirgisi muhim: har safar «3-o'rin» deb turaversa, u shovqinga aylanadi.
Ko'tarilgan yoki tushgan payt esa qaytib kelishga undaydigan lahza.

Xato qilingan so'zlar ro'yxati **hozirgidek qoladi** — u pedagogik
jihatdan eng qimmatlisi va uni ball bilan almashtirmaymiz.

---

## 9. Serverga qo'shimchalar

| Yo'l | Nima qaytaradi | Toifa |
| --- | --- | --- |
| `GET /student-portal/lernen/fortschritt` | Umumiy ball, daraja, seriya, haftalik ball va o'rin | `SELF` |
| `GET /student-portal/lernen/reyting?scope=guruh\|markaz` | Haftalik jadval | `SELF` |
| `GET /student-portal/lernen/wiederholung/uebung` | Takrorlash seansining savollari | `SELF` |

Migratsiya: `DafAttempt.points` ustuni (`Int @default(0)`). Boshqa sxema
o'zgarishi yo'q.

---

## 10. Sinash

Uydagi qoida saqlanadi: **mantiq sinaladi, ko'rinish emas.**

Serverda jest bilan: ball qoidasi (muddati kelmagan so'z nol beradi,
kelgani 10 beradi, xato javob nol beradi), haftaning boshlanishi Toshkent
vaqtida, jadvalning tartibi va teng ball holati, guruhsiz o'quvchi.

Mijozda vitest bilan: daraja chegaralari (chegaraning aynan ustidagi ball
qaysi darajani beradi), seriyaning hisobi, raqamlarning qisqarishi.

---

## 11. Bu dizaynda QILINMAYDI

Tanishtirish qadami (avatar + dialog) · ligalar va bo'linmalar
(ko'tarilish/tushish) · yurak, tosh, kunlik vazifa · mukofot va nishonlar
· o'qituvchi uchun guruh statistikasi · reytingdan chiqish imkoniyati ·
2–12-unit kontenti.

---

## 12. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Ball mijozda hisoblansa, u soxtalashtiriladi | Serverda hisoblanadi; mijozdan hech narsa so'ralmaydi |
| Hamma darsni tugatgan o'quvchi jadvaldan yo'qoladi | Takrorlash seansi — har kuni yangilanadigan yagona manba |
| Umumiy reyting qotib qoladi | Jadval haftalik; daraja esa umumiy va o'sib boradi |
| Filiallar aro ism ko'rinishi shikoyat keltiradi | CEO qarori, hujjatda yozilgan; kerak bo'lsa qaytarish oson |
| Seriya yo'qolgani o'quvchini tashlab ketishga undaydi | Jazo yo'q — faqat raqam nolga tushadi |
| Haftaning boshi UTC da hisoblansa, yakshanba kuni yangilanadi | Toshkent vaqti; dvigateldagi UTC qarzi shu yerda yopiladi |
