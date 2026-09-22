# A1 mashq ekrani — dizayn

**Sana:** 2026-09-05
**Bog'liq:** [A1 kurs dizayni](2026-09-03-a1-kurs-design.md),
[mashq dvigateli rejasi](../plans/2026-09-04-mashq-dvigateli.md)

Dvigatel tayyor: dars so'ralganda 12 tagacha savol quriladi, javob serverda
tekshiriladi, xato qilingan so'z qaytarish jadvaliga tushadi. Lekin buni
ko'rsatadigan ekran yo'q — o'quvchi hali hech narsani ko'rmaydi.

Bu hujjat o'sha ekranni belgilaydi.

---

## 1. Nima quriladi

Uchta ekran, veb portalda:

```
/portal/lernen                  12 unitlik yo'l
/portal/lernen/units/[unitId]   bo'limlar va ularning seanslari
/portal/lernen/lessons/[id]     seans — bitta savol, butun ekran
```

Poydevor mavjud: Lumio komponentlari, React Query, va Faza 2 dagi mashq
namunasi (`mc-exercise.tsx`) — unda to'g'ri javob hech qachon mijozga
berilmaydi, tekshiruv serverda. Shu naqsh saqlanadi.

**Uch o'lchamda ishlashi shart** (CEO, 2026-09-04): telefon, katta planshet
va desktop. Bu keyinga qoldirilmaydi.

---

## 2. Seans holati mijozda yashaydi

Server 12 savolni beradi, mijoz ularni birma-bir ko'rsatadi va har javobni
serverga yuboradi. Bazada seans qatori ochilmaydi.

**Nega:** kurs dizaynining D6 qarori savollar saqlanmasligini, har so'rovda
qurilishini talab qiladi. Serverda seans holati buni buzardi.

**Narxi ochiq aytiladi:** sahifa yangilansa o'quvchi yangi 12 savol oladi.
Lekin javob berganlari allaqachon bazaga yozilgan — Leitner jadvali ham,
statistika ham to'g'ri qoladi. Yo'qoladigan narsa faqat `4/12` sanog'i.
Brauzer xotirasida o'rinni saqlash keyin, kerak bo'lsa, qo'shiladi.

---

## 3. Yo'l va unit

### 3.1 Yo'l sahifasi

12 unit ketma-ket. Har kartada tartib raqami, nemischa va o'zbekcha nomi,
mavzusi va ilgarilash (`4/18 seans`). Uch holat: tugallangan, ochiq,
qulflangan.

Unit ochiladi, agar oldingisi tugallangan bo'lsa; birinchisi har doim ochiq.

**Kontenti yo'q unit qulf bo'lib ko'rinadi** va tagida «tez orada» yoziladi.
Hozircha bu 2–12-unitlar. Sabab: bo'sh unitni ochiq ko'rsatish «buzuq» degan
taassurot beradi, qulf esa «hali yozilmagan» deydi.

### 3.2 Unit sahifasi

Bo'limlar tartib bilan, har biri sarlavha ostida uchta seans — *Tanishuv*,
*Ishlatish*, *O'tish sinovi*. Oxirgi bo'limdan keyin unitning **yakuniy
sinovi** alohida turadi.

Bo'limning o'z sahifasi YO'Q: u guruh sarlavhasi. Sabab — darsga yetish
uchun bosish soni kamayadi, unit esa bir qarashda ko'rinadi.

Seans holati belgisi: bajarilgan (✓), navbatdagi (to'ldirilgan doira),
qulflangan (bo'sh doira). Ketma-ketlik qat'iy.

**Nega qulflash:** material progressiv — 3-bo'limning gaplari 1 va
2-bo'limning so'zlaridan tuzilgan (progressiya qoidasi, kurs dizayni §6.2).
Tartibni buzib kirgan o'quvchiga mashq «qiyin» emas, «tushunarsiz» bo'ladi.

Ilgarilash `DafLessonProgress` dan o'qiladi. Jadval mavjud (`completedAt`,
`bestScore`, `runs`), lekin **hozircha unga hech kim yozmaydi** — dvigatel
faqat urinishni va so'z holatini yozadi. Shu sababli §5 da ikkinchi
qo'shimcha bor: seans tugaganda uni yozadigan yo'l. Usiz ilgarilash abadiy
nol bo'lib qolar va keyingi dars hech qachon ochilmasdi.

---

## 4. Seans ekrani

### 4.1 Sakkiz format — uchta harakat

| Harakat | Formatlar | O'quvchi nima qiladi |
| --- | --- | --- |
| **Tanlash** | `WORT_UZ`, `UZ_WORT`, `ARTIKEL`, `SATZ_UEBERSETZEN`, `REAKTION` | variantni bosadi |
| **Yozish** | `LUECKE` | klaviaturadan yozadi |
| **Yig'ish** | `SATZ_BAUEN`, `PAAR` | bo'laklarni joyiga qo'yadi |

Ya'ni sakkizta emas, **uchta komponent**. Format faqat sarlavhani va
bo'laklarning ko'rinishini o'zgartiradi.

### 4.2 Tuzilishi

Tepada chiqish (✕), ilgarilash chizig'i va `4/12`. Pastda bitta katta tugma:
avval «Tekshirish», javobdan keyin «Keyingi». O'rtada savol.

Savol ustida bir qatorlik **ko'rsatma** («Bu so'z nimani anglatadi?»).
Server uni yubormaydi — u formatdan kelib chiqadi va mijozda yoziladi,
chunki bu interfeys matni, kontent emas.

Savol ostida, bor bo'lsa, **yordam qatori** (`hilfe`) — kichikroq va xiraroq.
U endi faqat bitta narsani anglatadi: o'zbekcha ishora. `LUECKE` da gapning
tarjimasi, `ARTIKEL` da so'zning ma'nosi.

### 4.3 Javob va natija

Variant bosilganda belgilanadi, hech narsa yuborilmaydi — fikrni o'zgartirish
mumkin. «Tekshirish» bosilgach server javob beradi va pastdan **natija
paneli** ko'tariladi: to'g'ri bo'lsa yashil va qisqa, xato bo'lsa qizil va
to'g'ri javob yozilgan. Panelda «Keyingi».

To'g'ri javob faqat shu paytda ko'rsatiladi, chunki serverdan u faqat
shunda keladi.

### 4.4 Xato javob qaytadi

Xato qilingan savol darhol takrorlanmaydi — navbat oxiriga qo'yiladi va
**boshqa formatda** qaytadi.

Bir savol ko'pi bilan **bir marta** qaytadi. Ikkinchi xatodan keyin to'g'ri
javob ko'rsatiladi va dars davom etadi: cheksiz aylanish o'quvchini qamab
qo'yadi.

Shuning uchun `4/12` — javob berilganlar emas, **tugatilganlar** soni.
Qaytishi kerak bo'lgan savol hali tugallanmagan.

### 4.5 Dars tugagach

Natija ekrani: nechta to'g'ri, qancha vaqt ketgan, va **xato qilingan
so'zlar** tarjimasi bilan. Ikki tugma: «Davom etish» (unit sahifasiga) va
«Qayta o'tish».

---

## 5. Serverga ikkita qo'shimcha

### 5.1 Xato javob uchun almashtiruvchi savol

```
GET /student-portal/lernen/lessons/:id/uebung/ersatz
    ?itemType=WORT&itemId=5&nichtFormat=WORT_UZ
```

Shu material haqida bitta savol qaytaradi, berilgan formatdan boshqasida.
Mos format qolmasa `null` — mijoz savolni takrorlamaydi va dars davom etadi.

Yo'l route siyosati manifestiga kiritiladi, `COMPANY_WIDE` toifasiga —
seans yo'li kabi.

**Nega serverda:** savolni mijoz qura olmaydi va to'g'ri javobni bilmaydi.
Bu qoida butun dvigatelning asosi.

### 5.2 Seans tugaganini yozish

```
POST /student-portal/lernen/lessons/:id/abschluss
     { richtig: 10, gesamt: 12, durationMs: 214000 }
```

`DafLessonProgress` ni yangilaydi: `completedAt`, `bestScore` (eng yaxshisi
saqlanadi, oxirgisi emas) va `runs` bittaga oshadi. `studentId` tokendan
olinadi.

**Nega mijoz aytadi:** server seans tugaganini o'zi bilmaydi — u savollarni
saqlamaydi va nechta savol berilganini eslamaydi. Bu D6 qarorining tabiiy
narxi.

**Nega bu ishonchli:** mijoz «tugadi» deb yolg'on ayta oladi, lekin bundan
yutadigan narsa yo'q — keyingi dars ochiladi, xolos. Haqiqiy o'lchov
`DafAttempt` da: kim nechta savolga qanday javob bergani o'sha yerda,
va uni mijoz o'zgartira olmaydi. Ballni ishonchli qilish kerak bo'lsa,
u urinishlardan hisoblanadi — lekin bu hozir kerak emas.

Bu yo'l `SELF` toifasiga tushadi: u o'quvchining o'z ma'lumotiga yozadi.

---

## 6. Uch o'lchamda

Ekran bitta ustun bo'lib qoladi; kengligi va bo'shliqlari o'zgaradi.

**Telefon** — ustun to'liq kenglikda. Javob tugmalari pastda, bosh barmoq
yetadigan zonada. «Tekshirish» pastga yopishadi va klaviatura ochilganda
uning ustida qoladi. Variantlar bitta ustunda.

**Katta planshet** — ustun markazda, kengligi cheklangan. Chetdagi bo'shliq
ataylab: savol markazda turgani diqqatni ushlaydi. Qisqa variantlar ikki
ustunda.

**Desktop** — planshet bilan bir xil ustun, ustiga klaviatura: `1`–`4`
variantni tanlaydi, `Enter` tekshiradi va keyingisiga o'tadi.

Bu uchtasi alohida ekran emas — bitta tartib, uchta chegara.

---

## 7. Bo'sh va xato holatlar

Hech qayerda «bo'sh ekran» qolmaydi:

| Holat | Nima ko'rinadi |
| --- | --- |
| Unit hali to'ldirilmagan (server bo'sh ro'yxat qaytaradi) | «Bu unitning mashqlari hali tayyor emas» + orqaga |
| Eski dars, yangi tuzilmaga tegishli emas (404) | Xuddi shu ko'rinish, boshqa matn |
| Aloqa uzildi | Tanlangan variant saqlanadi + «Qayta urinish» |

---

## 8. Sinash

Uydagi qoida: **mantiq sinaladi, ko'rinish emas.** Mijozda vitest bor va
mavjud 11 test sof mantiqni sinaydi, komponent render qilinmaydi.

Seansning yuritilishi — navbat, xato javobning qaytishi, `4/12` sanog'i,
ikkinchi xatodan keyin to'xtash — alohida **sof modulga** chiqariladi va
vitest bilan sinaladi. Komponentlar yupqa qoladi: holatni ko'rsatadi,
qaror qabul qilmaydi.

Serverdagi yangi yo'l odatdagidek jest bilan sinaladi.

---

## 9. Bu dizaynda QILINMAYDI

Native ilova · rasm va ovoz talab qiladigan formatlar · seriya, kunlik
maqsad va guruh reytingi · o'qituvchi paneli · seansni yarmidan davom
ettirish (brauzer xotirasi) · 2–12-unitlarning kontenti.

---

## 10. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Sahifa yangilanganda seans boshidan boshlanadi | Javoblar allaqachon yozilgan; yo'qoladigani faqat sanoq. Kerak bo'lsa brauzer xotirasi keyin qo'shiladi |
| Klaviatura ochilganda tugma berkilib qoladi | Tugma klaviatura ustida turadi; telefonda alohida tekshiriladi |
| `ersatz` yo'li bo'sh qaytaversa, xato javob hech qachon qaytmaydi | Bu xato emas: material tugagan. Dars davom etadi, so'z ertaga Leitner orqali qaytadi |
| Mijoz «tugadi» deb yolg'on aytadi | Faqat keyingi dars ochiladi. Haqiqiy o'lchov `DafAttempt` da va u o'zgartirilmaydi |
| Seans tugamay yopiladi — ilgarilash yozilmaydi | Ataylab: tugallanmagan dars tugallangan emas. Javoblar esa baribir yozilgan |
| Uchta komponent sakkiz formatni ko'tara olmasligi | Har komponent faqat bo'laklarning ko'rinishini o'zgartiradi; mantiq bitta |
