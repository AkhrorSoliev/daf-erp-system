# ADR-0083 — Avtomatik topshiriqlar: buzilgan va'da, qayta qo'ng'iroq, qo'ng'iroqsiz lid

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0074 (tizim topshirig'ini faqat manbasi yopadi), ADR-0054 («Dars bo'ldimi?»: zina va «birinchi bosgan oladi»), ADR-0072 (to'lov va'dasi va 09:00 tekshiruv; #683 — 09:00 ro'yxati, shu qaror uning oluvchilarini toraytiradi), ADR-0078 (Telegram), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §6.6, §7, `server/src/tasks/task-auto-rules.ts`, migratsiya `20261011090000_task_auto_lead_start`

## Kontekst

Uch ish hech kimning ro'yxatida yo'q edi: buzilgan to'lov va'dasidan keyingi qo'ng'iroq (administratorga ertalab bitta umumiy ro'yxat kelardi — kim qo'ng'iroq qilgani noma'lum), qo'ng'iroq natijasidagi «Keyingi bog'lanish sanasi» (hech qachon eslatilmasdi) va hech kim qo'ng'iroq qilmagan yangi lid.

## Qaror

1. Tizim uch turdagi topshiriqni o'zi beradi. Muallif — Tizim; tahrirlab, bekor qilib, qo'lda yopib bo'lmaydi; bitta manbaga bitta ochiq topshiriq (`sourceKey`, qisman unikal indeks `task_open_source_unique`); birinchi «Boshladim» bosgan administrator oladi, boshqalarniki yo'qoladi. Hamma qoida bitta faylda: `AUTO_RULES` (`task-auto-rules.ts`).

   | Tur | Qachon | Kimga | Muddat | O'zi yopiladi |
   | --- | --- | --- | --- | --- |
   | Buzilgan va'da | 09:00 tekshiruv va'dani buzganda, qarzi 1 000 so'mdan kam bo'lmagan har o'quvchiga bittadan (bir o'quvchida bir nechta va'da bo'lsa — oxirgisi gapiradi) | filial administratorlari (yo'q bo'lsa direktorlar, keyin CEO) | o'sha kuni 18:00 | to'lov qarzni 1 000 so'mdan pastga tushirsa (qisman to'lov yopmaydi) yoki o'quvchiga qo'ng'iroq yozilsa (natijasi qanday bo'lsa ham); qarz to'lovsiz yopilsa — soatlik tekshiruvda |
   | Qayta qo'ng'iroq | qo'ng'iroq «Keyingi bog'lanish sanasi» bilan yozilganda | qo'ng'iroqni yozgan xodim (u hali ishlayotgan bo'lsa) | o'sha sana 18:00; Telegram xabari o'sha kuni 08:00 da | o'quvchi har qanday to'lov qilsa yoki unga yangi qo'ng'iroq yozilsa (shu sanani so'ragan qo'ng'iroqning o'zi yopmaydi) |
   | Qo'ng'iroqsiz lid | har soat 08:00–18:00, dushanba–shanba: 24 soatdan beri qo'ng'iroq qilinmagan yangi lid | lid filiali administratorlari; filialsiz lid — kompaniyaning administratorlari (yo'q bo'lsa direktorlar, keyin CEO) | o'sha kuni 18:00 | lidga «qo'ng'iroq qilindi» belgisi qo'yilsa, lid holati o'zgarsa (o'quvchiga aylansa, yo'qotilsa) yoki u arxivlansa |

   Muhimlik: buzilgan va'da va qo'ng'iroqsiz lid — «Yuqori», qayta qo'ng'iroq — «O'rta». Topshiriq o'quvchiga yoki lidga bog'lanadi (`entityType`).
2. Muddat yakshanba yoki filial bayramiga tushsa yoki allaqachon o'tgan bo'lsa (masalan, 18:00 dagi tekshiruv) — keyingi ish kuni 18:00: topshiriq muddati o'tgan holda tug'ilmaydi (`systemDueAt`).
3. **Administratorlarga ertalabki «Bugun N ta to'lov va'dasi bajarilmadi» ro'yxati endi bormaydi** — ular har o'quvchi uchun topshiriq oladi (ikkalasi birga emas, spec §6.6). CEO ro'yxatni avvalgidek oladi.
4. Qo'ng'iroqsiz lid topshirig'i faqat shu qaror kuchga kirgandan keyin kelgan lidlarga beriladi: `Company.uncalledLeadTasksFrom` — migratsiya ishlagan payt (yangi kompaniyada — yaratilgan payt). Oldin kelib qo'ng'iroqsiz turgan lidlarga topshiriq berilmaydi. Har lidga umrida bir marta topshiriq beriladi: qo'ng'iroq belgisi olib tashlansa ham yangisi ochilmaydi.
5. Telegram'da bunday topshiriq «Tizim topshirig'i · <muhimlik>» sarlavhasi bilan va faqat «Ochish» tugmasi bilan keladi (ADR-0078; tizim topshirig'ida holat tugmalari yo'q). Qayta qo'ng'iroqning qo'ng'iroqchadagi xabari darhol, Telegram xabari esa o'sha kuni 08:00 da boradi. Topshiriq yopilsa, kutib turgan xabar ham o'chadi.
6. Kechki 21:00 hisobotida muddati o'tgan topshiriq bo'lsa, «Diqqat» belgilaridan yuqorida bitta qator: «📋 Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K» (M = 0 bo'lsa qator yo'q). U «Diqqat» belgisi emas, kunning rangini o'zgartirmaydi; hisobot qaysi filiallarni qamrasa, shularni sanaydi; hisoblash xato bersa, faqat shu qator tushib qoladi.
7. Yopilishni `TaskAutoCloseListener` (hodisalar bo'yicha) va soatlik tekshiruv (`TaskAutoLeadsService`) hal qiladi. Soatlik tekshiruv hodisa yetmaydigan hollarni yopadi: lid chaqirilgan, yangi emas yoki o'chirilgan (`LEAD_GONE`; bo'lim lidlari bilan arxivlansa hodisa chiqmaydi), o'quvchi arxivlangan (`STUDENT_GONE`) va qarz to'lovsiz yopilgan — qaytarilgan dars puli, qarzni kechirish yoki markaz qoplashi `payment.received` chiqarmaydi, shuning uchun o'quvchining qarzi 1 000 so'mdan pastga tushgan bo'lsa «Buzilgan va'da» topshirig'i yopiladi (`DEBT_CLEARED`). Shu tekshiruv bugun 09:00 hodisasi yaratolmagan «Buzilgan va'da» topshiriqlarini (o'quvchiga bittadan, bugun ochilgan, yopilgan yoki bekor qilingan bo'lsa tegmasdan) 10:00 dan qayta urinib yaratadi.

## Ko'rib chiqilgan muqobillar

- Administratorga ro'yxat ham, topshiriq ham — bir ish uchun ikki xabar; spec §6.6 rad etgan.
- Qisman to'lov ham buzilgan va'da topshirig'ini yopsin — qarz hali turibdi, ish bajarilmagan; shuning uchun yopish chegarasi 09:00 ro'yxati bilan bir xil: qarz 1 000 so'mdan pastga tushishi.
- Boshlanish sanasini kodga yozish — deploy kuni oldindan noma'lum; erta sana eski lidlarga topshiriq beradi.
- Boshlanish sanasini sozlamalar jadvaliga yozish — hech kim o'zgartirmaydigan kalit sozlamalar ro'yxatida turadi va alohida ma'lumot qadami kerak.
- 21:00 qatorini «Diqqat» belgisi qilish — muddati o'tgan topshiriq har kuni bo'ladi; belgi har kech kunni sariq qilib, haqiqiy muammoni yashirardi.

## Oqibatlari

- Administrator ertalab ro'yxat o'rniga topshiriqlarni ko'radi; qo'ng'iroqni topshiriq varag'idagi «Qo'ng'iroqni yozish» tugmasi bilan yozadi va topshiriq o'zi yopiladi.
- Qo'ng'iroq natijasidagi sana endi ishlaydi: o'sha kuni xodimga topshiriq turadi.
- Lid bo'limi butunlay arxivlansa hodisa chiqmaydi — topshiriq keyingi soatlik tekshiruvda yopiladi.
- Ham CEO, ham Administrator roli bor odam ertalabki ro'yxatni oladi (CEO sifatida) va administrator sifatida topshiriqlarni ham olishi mumkin — bir ish uchun ikki xabar. Shu holat uchun alohida qoida yozilmagan: bunday odam kam, ro'yxat esa CEO uchun asosiy ko'rinish bo'lib qoladi.
- Bir soatda bir kompaniyaga ko'pi bilan 200 ta lid topshirig'i ochiladi; ko'proq to'planib qolsa, qolgani keyingi soatda ochiladi.
