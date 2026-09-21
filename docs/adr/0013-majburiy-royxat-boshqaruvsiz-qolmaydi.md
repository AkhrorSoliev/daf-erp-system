# ADR-0013 — Majburiy tanlov ro'yxati boshqaruv sahifasisiz qolmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-03
**Bog'liq:** `client/src/app/(dashboard)/settings/reasons/`, `client/src/components/settings/reason-list-manager.tsx`, commit `a851829`

## Kontekst

Tizimda uchta "sabab" ro'yxati bor: `StudentExitReason` (guruhdan chiqarish va
status o'zgarishi), `EnrollmentTransferReason` (guruh almashtirish),
`GroupTeacherChangeReason` (guruh ustozi almashishi). Uchalasi ham
`companyId` bo'yicha, filialga bog'lanmagan.

Ikkitasini tanlash **majburiy**: ustozi boshqa guruhga o'tkazishda
`StudentEnrollmentService.enroll` sababsiz `BadRequestException` beradi, dialog
esa tugmani bloklaydi.

Ammo bu ro'yxatlarni to'ldiradigan yagona UI hisobot sahifasidagi diagrammalar
ichiga qo'yilgan edi. `05c82f4` o'sha diagrammalarni olib tashladi, dialoglar
esa hech kim import qilmaydigan holga tushdi. `a851829` ularni "superseded"
deb o'chirdi — o'chirish qaroridan oldin git tarixi tekshirilgan, lekin
tekshiruv **importlar** bo'yicha edi: dialoglar haqiqatan o'lik ko'rinardi.

Natija prod bazada shunday ko'rindi: `EnrollmentTransferReason` — **0 ta
yozuv**, `GroupTeacherChangeReason` — **0 ta**, va ularni qo'shadigan hech
qanday sirt yo'q. Backend CRUD (`POST /enrollment-transfer-reasons`) tirik,
faqat unga boradigan tugma yo'q. Ya'ni **ustozi boshqa guruhga o'quvchi
ko'chirish butun tizimda bajarilmas bo'lib qolgan** edi, va buni hech qanday
test tutmadi.

Xatolik xabari holatni yanada chalg'itardi: "Sabab ro'yxati bo'sh.
Sozlamalardan qo'shing" — Sozlamalarda bunday sahifa umuman yo'q edi.

Xato hisobot sahifasi bilan boshqaruv sirtining bir joyga qo'yilishidan kelib
chiqqan. Hisobot o'zgaruvchan: diagramma qo'shiladi, olib tashlanadi, qayta
tartiblanadi. Sozlama esa o'zgarmas bo'lishi kerak — u yozuvni tahrirlashning
manzili.

## Qaror

**Foydalanuvchidan majburiy tanlov talab qiladigan har bir ro'yxat
Sozlamalarda o'z boshqaruv sahifasiga ega bo'lishi shart.** Uchala sabab
ro'yxati `/settings/reasons` ga ko'chdi.

**Boshqaruv sirti hisobot yoki tahlil sahifasining ichiga joylashtirilmaydi.**
Hisobotdan qulay havola bo'lishi mumkin — `DepartureReasonsDialog` shunday
qoldirildi — lekin u **yagona** yo'l bo'lmaydi. Havola yo'qolsa ham yozuv
tahrirlanadigan bo'lib qolishi kerak.

**Ro'yxatda yo'q sabab ishning o'zida qo'shiladi.** Guruh almashtirish oynasi
sababni faqat tanlatmaydi — "Sabab boshqa" tugmasi o'sha yerda yangi sabab
yozib, uni ro'yxatga qo'shib, darhol tanlaydi. Ro'yxat bo'sh bo'lsa maydon
o'zi ochiq turadi. Bu xavfsiz, chunki ikkala amal bir xil rollarga ochiq
(`CEO`, `Branch Director`, `Administrator`) — ko'chira olgan odam sabab ham
qo'sha oladi, ya'ni yangi ruxsat berilmayapti.

**Bo'sh ro'yxat haqidagi xabar aniq manzil ko'rsatadi.** "Sozlamalardan
qo'shing" emas, balki o'sha tabni ochadigan havola
(`/settings/reasons?tab=transfer`) — ro'yxatni to'p-to'g'ri boshqarish uchun,
inline qo'shishga qo'shimcha.

**Ro'yxat CRUD'i bitta komponentdan o'qiladi** — `ReasonListManager`. Uchala
ro'yxat server tomonda bir xil shaklda (`{ id, name }` + soft delete), farqi
faqat `StudentExitReason` dagi `appliesTo`. Har biriga alohida 300 qatorli
dialog yozish aynan shu nosozlikni tug'dirgan edi.

## Ko'rib chiqilgan muqobillar

**Faqat transfer sabablari uchun sahifa qo'shish.** Eng kichik o'zgarish,
blokerni yopardi. Rad etildi: `GroupTeacherChangeReason` ham xuddi shu
ahvolda — 0 ta yozuv, boshqaruvsiz — va uni qoldirish bir necha oydan keyin
xuddi shu savolni qaytarardi.

**Sababni erkin matn sifatida yozdirish** (guruhdan chiqarishdagi
`hasConfiguredReasons` fallback'i kabi). Rad etildi: `Enrollment.transferReasonId`
bo'sh qolardi, ketgan o'quvchilar hisobotidagi transfer tahlili esa aynan shu
maydonga tayanadi — bloker o'rniga jimgina buziladigan hisobot paydo bo'lardi.
Inline qo'shish bu muammoni tug'dirmaydi: u haqiqiy yozuv yaratib uni
tanlaydi, ya'ni hisobot uni boshqa har qanday sabab kabi guruhlay oladi.

**Sababni umuman majburiy qilmaslik.** Rad etildi: talab biznes qarori, u
ustoz almashinuvi o'quvchi ketishiga qanchalik sabab bo'layotganini o'lchash
uchun qo'yilgan. Boshqaruv sirtining yo'qligi talabni bekor qilish uchun asos
emas.

## Oqibatlari

**Yutuq:** majburiy maydonni to'ldirish yo'li endi hisobot sahifasining
tartibiga bog'liq emas. Hisobotdagi diagrammani olib tashlash boshqa hech
qachon ma'lumot kiritishni to'sib qo'ymaydi.

**Narx:** `DepartureReasonsDialog` endi ikkita joyda ko'rinadigan bitta
tahrirlagichni ko'rsatadi. Bu ataylab: hisobotni o'qiyotgan odam sababni
o'sha yerda tuzatishi qulay, lekin u yagona yo'l emas.

**Endi taqiqlangan:** yangi "tanlov ro'yxati" jadvali qo'shilganda uni
boshqaradigan sirtsiz qoldirish. Sirt Sozlamalarda bo'ladi, boshqa joyda
emas.

**Diqqat:** "hech kim import qilmayapti" — o'chirish uchun yetarli dalil emas.
`a851829` importlarni to'g'ri tekshirdi, lekin savol boshqa bo'lishi kerak
edi: **bu ekranni o'chirsam, foydalanuvchi shu ma'lumotni qanday kiritadi?**
