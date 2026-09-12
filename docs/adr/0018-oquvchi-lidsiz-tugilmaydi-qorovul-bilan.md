# 0018. O'quvchi lidsiz tug'ilmaydi — kafolat qorovul bilan beriladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-13
**Bog'liq:** [0017](0017-har-bir-oquvchi-lid-sifatida-tugiladi.md) ni to'ldiradi

## Kontekst

ADR-0017 «har bir o'quvchi lid sifatida tug'iladi» deb va'da berdi va kafolatni
`StudentsWriteService.create` ga **majburiy `origin` parametri** qo'yish bilan
berdi. Asos shunday yozilgan edi: «kelajakda o'quvchi yaratadigan uchinchi yo'l
yozilsa, kompilyator uni to'xtatadi».

Bu asos noto'g'ri edi. Majburiy parametr faqat o'sha funksiyani **chaqiradigan**
joylarni ushlaydi. Prodda esa o'quvchi qatorini yozadigan yana **ikkita** yo'l
allaqachon bor edi va ikkovi ham bazaga to'g'ridan yozardi:

- `telegram/scenes/student-registration-flow.ts` — bot orqali ro'yxatdan o'tish
- `mock-exams/mock-exam-participants.service.ts` — ishtirokchini o'quvchiga aylantirish

Kompilyator ularni ko'rmadi. Yakuniy ko'rik ham ko'rmadi — u «`create()` ning
boshqa chaqiruvchisi bormi?» degan savolga to'g'ri javob berdi, lekin savolning
o'zi tor edi.

**Oqibati o'lchandi.** 10.09.2026 deploydan keyin 16 ta o'quvchi qo'shildi,
shundan **13 tasi lidsiz** qoldi — hammasi Telegram boti orqali. Bazada
bo'limsiz lid soni **nol** edi, ya'ni tuzatish amalda umuman ishlamadi. Bu
faqat voronka diagrammasini qurishga tayyorgarlik ko'rilayotganda, prod
ma'lumoti tekshirilganda aniqlandi.

## Qaror

**Kafolat tip tizimida emas, matn darajasidagi qorovulda beriladi.**

`common/student-origin/student-origin.single-source.spec.ts` butun `src/` ni
o'qiydi va `student.create(` yozadigan har bir faylni topadi. Fayl ruxsat
etilgan ro'yxatda bo'lmasa — **build yiqiladi**. Ro'yxatdagi har bir fayl
`recordDirectOrigin` ni ham chaqirishi shart.

Loyihada bu amaliyot yangi emas: kun chegarasi (ADR-0016) va «faol o'quvchi»
ta'rifi (ADR-0015) ham aynan shunday qorovul bilan ushlab turiladi. Farqi
shundaki, u yerda qorovul birinchi urinishdayoq tanlangan edi.

**Uchala yo'l ham endi lid yozadi**, har biri o'z tranzaksiyasi ichida:
lid yozilmasa o'quvchi ham yozilmaydi.

**Xizmat global modulga ko'chdi.** `StudentLeadOriginService` endi
`common/student-origin/` da va `@Global()` — `EntityHistoryModule` bilan bir
xil sababdan: uni uchta boshqa-boshqa modul chaqiradi va ular bir-birini
import qiladi, ya'ni `StudentsModule` ichida qolsa modul halqasi yasalardi.

**O'zi ro'yxatdan o'tadigan yo'llarning manbasi avtomat belgilanadi.**
`/students` eshigida manbani admin tanlaydi; bot va mock imtihonda tanlaydigan
odam yo'q, lekin «qayerdan keldi» savoliga javob baribir bor. Shuning uchun
manba `null` qoldirilmaydi — «Telegram bot» va «Mock imtihon» nomli manba
topiladi, bo'lmasa yaratiladi. Admin ularni oddiy manba ro'yxatida qayta
nomlashi mumkin; qidiruv nomdan keyin id bo'yicha ketadi.

## Ko'rib chiqilgan muqobillar

**Uchala yo'lni `StudentsWriteService.create` orqali o'tkazish.** Eng toza
ko'rinadi, lekin bot va mock yo'llari butunlay boshqa shakl: bot rasm yuklaydi
va sessiya ma'lumotidan quradi, mock esa ishtirokchining `publicId` sini
o'quvchi id si sifatida majburlaydi. Ularni bitta funksiyaga tiqish katta va
xavfli refaktor bo'lardi — buzilganini deploydan keyin bilib olardik, xuddi
shu ADR yozilishiga sabab bo'lgan hol kabi.

**Prisma middleware bilan ushlash.** `student.create` ga ilinib lidni avtomat
yozish mumkin edi. Rad etildi: yozuv qaysi tranzaksiyada ekanini middleware
bilmaydi, ya'ni «lid yozilmasa o'quvchi ham yozilmaydi» kafolati yo'qoladi —
va sehrli yon ta'sir kodni o'qiganda ko'rinmaydi.

**Faqat hujjatga yozib qo'yish.** ADR-0017 aynan shuni qilgan edi (uning matni
«ikkita eshik» deb yozgan), va natija shu ADR.

## Oqibatlari

**Deploydan keyin lidsiz qolgan 13 o'quvchiga lid yoziladi** —
`scripts/backfill-missing-lead-origin.ts`, `--since` bilan aniq deploy vaqtidan.
Ular tuzatish ishlaganda lidga ega bo'lishi kerak edi. Bu ADR-0017 ning
«eski 892 o'quvchiga tegilmaydi» qaroriga zid emas: chegara — tuzatish sanasi,
va o'sha kuni tuzatishdan **oldin** kelganlar ham tegilmaydigan to'plamda
qoladi. Shuning uchun skript kun emas, soat qabul qiladi.

**Manba ro'yxatiga ikkita yangi qator qo'shiladi** («Telegram bot»,
«Mock imtihon») — birinchi marta o'sha yo'ldan o'quvchi kelganda.

**Voronka hisoboti endi haqiqiy qamrovga ega bo'ladi.** Bungacha u markazga
kelayotgan odamlarning katta qismini ko'rmasdi: prod ma'lumotida doskada
187 lid, markazda 956 o'quvchi bor edi.

**Qorovul qo'shimcha ish talab qiladi.** O'quvchi yaratadigan yangi yo'l
yozgan odam faylni ro'yxatga qo'shishi va lid yozuvini chaqirishi kerak. Bu
ataylab: unutish mumkin bo'lgan narsani build to'xtatadi.
