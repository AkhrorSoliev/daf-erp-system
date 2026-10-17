# ADR-0098 — «Ketgan o'quvchilar» hisoboti bitta fakt to'plamidan hisoblanadi; sabab epizodniki, ustoz to'xtash paytidagi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0035, ADR-0067, `server/src/reports/departed/`, `docs/superpowers/specs/2026-10-17-b7a-ketgan-oquvchilar-design.md`

## Kontekst

ADR-0035 «ketgan»ning ta'rifini bitta joyga (`departure-episodes.ts`,
`departures.loader.ts`) qo'ydi, lekin hisobot sahifasi uni sakkiz yo'l bilan
turlicha o'qirdi, va raqamlar bir-biriga to'g'ri kelmasdi:

- Tepadagi «ketdi» soni ADR-0035 bo'yicha sanalardi, «Nega ketishdi» esa davrdagi
  `DROPPED` yozilishlarni sanardi. Guruhga ko'chganlar ham, guruh yopilganda
  chiqarilganlar ham `DROPPED` bo'ladi, shuning uchun sabablar yig'indisi
  tepadagi songa teng chiqmasdi.
- Kurs va ustoz filtri faqat sabablar va ustoz almashishiga ta'sir qilardi;
  kartalar, ustunlar va ro'yxat o'zgarmasdi.
- Ro'yxat davrga bog'liq emasdi (hamma ochiq epizodlar), uning soni tepadagi
  songa teng emasdi.
- Sahifada «koeffitsient», «LTV» va doim 0 chiqadigan «Yo'qotilgan daromad»
  kabi tushunarsiz kartalar bor edi (CEO, 27.09).

## Qaror

- **Sahifa bitta fakt to'plamidan hisoblanadi.** `loadDepartureFacts`
  (`server/src/reports/departed/departure-facts.loader.ts`) ADR-0035 epizodlarini
  (`loadDepartures`) oladi va har epizod uchun faktlarni qo'shadi; kartalar,
  oylar, sabablar, kesimlar, ro'yxat va Excel shu to'plamning ustida turadi.
  Ketish ta'rifi o'zgarmaydi va hamon `departure-episodes.ts` da.
- **Sabab epizodga tegishli.** Chetlatilgan yoki muzlatilgan o'quvchining sababi
  — karta hali shu holatda turgan bo'lsa — o'quvchi kartasidan; guruhdan
  chiqqanniki — yopilgan yozilishdan (`departureReasonId`). Yozilmagan bo'lsa —
  «Sabab yozilmagan». Eski diagramma `DROPPED` yozilishlarni sanagani uchun
  tepadagi songa qo'shilmasdi; endi har epizodning bitta sababi bor, shuning
  uchun sabablar yig'indisi = «ketdi».
- **Ustoz — to'xtash paytidagi.** Guruhning hozirgi ustozlari `GroupTeacherHistory`
  bo'yicha orqaga qaytariladi: to'xtashdan keyingi eng birinchi o'zgarishning
  oldingi ustozlari; o'zgarish bo'lmasa — hozirgilar.
- **Kesim maxraji — «oy boshida».** Ulush = ketdi ÷ davr boshida o'qiyotgan
  o'quvchilar, shu filtr bilan. «Oy boshida» 5 dan kam bo'lsa ulush
  ko'rsatilmaydi («—»): kichik namuna foizni buzadi.
- **Ro'yxat — davrda boshlangan hamma ketishlar:** tasdiqlanganlar (qaytganlari
  «Qaytgan» belgisi bilan) va hali kutilayotganlar. Tasdiqlanganlar soni tepadagi
  «ketdi» ga teng.
- **Kurs va ustoz filtri hamma blokka qo'llanadi** (kartalar, oylar, sabablar,
  kesimlar, ro'yxat, Excel, maxraj), filial — sarlavhadagi tanlov.
- **«Kursni tugatdi» hozircha ketgan sanaladi** (CEO, 17.10.2026). Darajani
  tugatib 21 kun ichida keyingi guruhga yozilmagan o'quvchi ADR-0035 bo'yicha
  ketadi. «Tugatdi»ni haqiqiy deb bo'lmaydi: darajani tugatish imtihondan
  o'tish va Teilnahmebestätigung berish bilan isbotlanadi, tizimda esa bu hali
  yo'q. Ular qo'shilgach, shu ikki shartni bajarganlar «bitirgan» bo'ladi va
  ketganlarga kirmaydi — bu yangi ADR bilan qilinadi.
- **Tizim ishga tushgan sanadan oldingi davrlar ko'rsatilmaydi.** Oldingi davr
  (kartadagi «… edi») shu sanadan oldin boshlansa, soni ko'rsatilmaydi (0 emas,
  noma'lum: `previousDeparted` = `null`), oxiri shu sanadan oldin tugagan oylar
  ustunlar qatoriga kirmaydi (ADR-0005).
- **ADR-0067 uchun:** marketingning «o'rtacha o'qigan oy» raqami endi shu
  manbadan (`DepartedOverviewService.averageStudyMonths`) keladi; raqamning
  o'zi o'zgarmaydi. ADR-0067 matni tahrirlanmaydi.
- **Olib tashlangan yo'llar:** `summary`, `dynamics`, `by-status`, `reasons`,
  `by-reason`, `group-by`, `transfer-reasons`, `transferred-list` va ularning
  xizmatlari, DTO'lari, testlari. Yangilari: `GET /reports/departed-students/overview`,
  `/list`, `/excel` (`reports.students`, `@BranchScope()`). Ustoz almashish
  oynalari uchun `teacher-changes-list`, `departed-after-change`,
  `teacher-change-reasons` saqlanadi.

## Ma'lum cheklovlar

1. «Ustoz almashgandan keyin» kartasi va ikkala oynasi guruhning **hozirgi**
   ustozlari bo'yicha filtrlaydi, fakt to'plami esa **to'xtash paytidagi**
   ustoz bo'yicha. Ustoz filtri yoqilganda ikkisi biroz farq qilishi mumkin.
2. Ustoz almashishning ikkala oynasi (`teacher-changes-list`,
   `departed-after-change`) bir nechta filialga ega chaqiruvchini bitta
   filialga toraytiradi (`scoped()`); karta esa butun filial ro'yxatini oladi.
3. Qaytish muddati hali tugamagan oylar dastlabki (odatda oxirgi 2–3 oy): muzlatish
   60 kun, guruhdan chiqish 21 kun kutiladi (ADR-0035), shuning uchun ularning
   ustuni keyin o'zgarishi mumkin.
4. «Kursni tugatdi» o'quvchilar imtihon va Teilnahmebestätigung tizimda paydo
   bo'lguncha ketgan sanaladi (yuqoridagi «Qaror»).

## Ko'rib chiqilgan muqobillar

- **Har yo'l o'zicha hisoblasin (avvalgidek)** — raqamlar bir-biriga mos
  kelmasdi; aynan shu muammo edi.
- **Jadvalda saqlash** (`StudentDeparture` kabi) — ADR-0035 buni allaqachon
  rad etgan: migratsiya, eski ma'lumotni to'ldirish va ko'p yozish joyi; bittasi
  unutilsa son jimgina kamayadi. Keshlanmaydi; sekin bo'lsa Redis kaliti
  keyingi qadam.

## Oqibatlari

**Yutuq:** sahifadagi hamma raqam bitta to'plamdan: sabablar yig'indisi va
ro'yxatdagi tasdiqlanganlar soni tepadagi «ketdi» ga teng, davr oyining ustuni
ham (parite testi tekshiradi). Oylar bo'yicha ustunlar yig'indisi tepadagi songa
teng emas: ular oxirgi 6 oy, tepadagi son esa tanlangan davr, va ikki marta
ketgan o'quvchi ikki ustunda sanaladi, tepadagida bir marta. Ustoz kesimi ham
tepadagidan ko'p bo'lishi mumkin: ikki ustozli guruhdagi o'quvchi ikkala ustozda
sanaladi. Filtr hamma blokka ta'sir qiladi.

**Narx:** har so'rov fakt to'plamini qayta yuklaydi (bir so'rovda bitta
`loadDepartures`). Eski mijoz olib tashlangan yo'llarni chaqiradi, shuning
uchun server va mijoz **birga** chiqadi.

**Endi taqiqlangan:** «ketgan» sonini, sababini yoki ustozini hisobotning
boshqa joyida `loadDepartureFacts` dan tashqarida hisoblash.
