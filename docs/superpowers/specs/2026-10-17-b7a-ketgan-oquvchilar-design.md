# B to'plami, 7a-qism: «Ketgan o'quvchilar» hisoboti

**Sana:** 2026-10-17
**Maket:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL (`v-dep`; CEO 27.09 tasdiqlagan, 17.10 dizayn ko'rib chiqildi)
**ADR:** 0097 (shu PR'da). 0035 ta'rifi o'zgarmaydi.
**Bog'liq:** ADR-0035 (ketgan ta'rifi), ADR-0002 (filial qamrovi), ADR-0044 (darajani tugatdi), `docs/superpowers/specs/2026-10-02-b1-umumiy-va-marketing-design.md`

7-qism to'rt hisobotdan iborat (Ketgan o'quvchilar, Markaz faoliyati, Davomat, Bot hisoboti). Ular bir-biriga bog'liq emas, shuning uchun har biri o'z spec, reja va PR bilan quriladi. Bu hujjat birinchisi.

## 1. Maqsad

Sahifa bitta savolga javob beradi: **kim, qachon, nega va qayerdan ketdi.** Hozirgi sahifada bu savolga javob beradigan raqamlar bir-biriga to'g'ri kelmaydi:

- Tepadagi «ketdi» soni ADR-0035 bo'yicha sanaladi, «Nega ketishdi» esa davrdagi `DROPPED` yozilishlarni sanaydi. Yig'indilar teng chiqmaydi. Guruhga ko'chganlar ham `DROPPED` bo'lib o'tadi.
- Kurs, ustoz filtri faqat sabablar va ustoz almashishiga ta'sir qiladi, tepadagi kartalar, ustunlar va ro'yxatga ta'sir qilmaydi.
- Ro'yxat davrga bog'liq emas (hamma ochiq epizodlar), shuning uchun uning soni tepadagi songa teng emas.
- Sahifada «koeffitsient», «LTV» kabi so'zlar va ma'nosiz kartalar bor (CEO 27.09: tushunarsiz).

Yangi sahifada **bitta ma'lumot to'plamidan** hamma blok hisoblanadi, shunda yig'indilar mos keladi va filtr hamma bloka ta'sir qiladi.

## 2. CEO qarorlari

Avvaldan (27.09, maket):
- «Boshqa guruhga ko'chdi» ketish emas (u allaqachon shunday: a'zolik yozilishlar birlashmasi bo'yicha o'qiladi, `departures.loader.ts`).
- Hisobotdan olib tashlanadi: «Yo'qotilgan daromad» (doim 0), «Ketganlar qarzi» kartasi (endi ro'yxatdagi «Qarzi» ustuni va Qarzdorlik → O'qimayotganlar), «koeffitsient», «LTV».
- «Har 100 o'quvchidan N tasi» — koeffitsient o'rniga.
- «Boshqa sabab» izohlari o'qiladi; chetlatilganning sababi uning kartasidan olinadi.

17.10.2026:
- **«Kursni tugatdi» o'zgarmaydi.** Darajani tugatib 21 kun ichida keyingi guruhga yozilmagan o'quvchi hozircha ketgan sanaladi (ADR-0035). Sabab: «tugatdi»ni haqiqiy deb bo'lmaydi, imtihondan o'tish va Teilnahmebestätigung berish tizimda hali yo'q. Ular qo'shilgach, shu ikki shartni bajarganlar «bitirgan» bo'ladi va ketganlarga kirmaydi (alohida ish). Maketdagi «kursni tugatish ketish emas» izohi shunga ko'ra o'chiriladi. «Kursni tugatdi» sabablar ro'yxatida o'z qatori bilan ko'rinadi.
- Dizayn: davr tugmalari Bu oy, O'tgan oy, 3 oy, 6 oy, Oraliq (hozirgi 12 oy olib tashlanadi). Boshlang'ich — «Bu oy», maketdagidek.

## 3. Bitta ma'lumot to'plami: `DepartureFacts`

Yangi modul `server/src/reports/departed/`. U `loadDepartures` (ADR-0035, o'zgarmaydi) epizodlarini oladi va har bir epizod uchun **faktlar** qo'shadi:

| Fakt | Manba |
| --- | --- |
| to'xtagan kun, to'xtash turi, holat (tasdiqlangan, kutilmoqda), qaytgan kun | epizod |
| oxirgi guruh | to'xtash paytida faol (yoki muzlatilgan) bo'lgan yozilishning guruhi; topilmasa o'quvchining eng oxirgi yozilishi |
| kurs, filial | shu guruhdan |
| ustoz(lar) **to'xtash paytidagi** | guruhning hozirgi ustozlari, `GroupTeacherHistory` bo'yicha orqaga qaytarilgan: to'xtashdan keyingi eng birinchi o'zgarishning `previousTeacherIds` qiymati; o'zgarish yo'q bo'lsa — hozirgi ustozlar |
| sabab, izoh | to'xtash qayerda yozilgan bo'lsa o'sha joydan: chetlatish va muzlatishda o'quvchi kartasi (`statusChangeReasonId`, `statusChangeReason`), guruhdan chiqishda yopilgan yozilish (`departureReasonId`, `statusChangeReason`). Bo'sh bo'lsa — «Sabab yozilmagan» |
| o'qigan oylar | o'quvchining birinchi yozilishidan to'xtagan kungacha (hozirgi `averageStudyMonths` mantig'i, har epizodga) |
| qarz | o'quvchining bugungi `balance` qiymati, faqat manfiy bo'lsa |

**Filtrlar** (kurs, ustoz; filial — sarlavhadagi filial tanlovi, `@BranchScope()`) epizodning **oxirgi guruhiga** qo'llanadi va hamma blok shu filtrlangan to'plamdan hisoblanadi. Ustoz filtri — to'xtash paytidagi ustozlar orasida bo'lishi.

**«Oy boshida»** maxrajini ham shu filtr bilan hisoblaymiz: davr boshida faol yozilishi bor o'quvchilar, ularning o'sha paytdagi guruhi filtrga mos kelsa.

Yagona yig'indi qoidasi: sabablar, ustunlar va ro'yxatdagi tasdiqlanganlar soni **tepadagi «ketdi» soniga teng**. Buni parite testi tekshiradi (§8).

## 4. Sahifa va ma'lumot

Tartib yuqoridan pastga, bir savol — bitta blok:

1. **Uch karta.**
   - «{Oy}da ketdi — N o'quvchi» + «{oldingi oy}da M edi». Oy tanlanganda oldingi kalendar oy; 3 oy, 6 oy, oraliq uchun xuddi shunday uzunlikdagi oldingi davr («oldingi 3 oyda M edi»). Oldingi davr ham shu filtr bilan.
   - «Har 100 o'quvchidan N tasi ketdi» = ketdi ÷ «oy boshida» × 100. 10 dan kichik bo'lsa bir xona kasr, aks holda butun. Ostida «davr boshida X o'quvchi o'qiyotgan edi».
   - «Ketguncha o'qidi — N oy, o'rtacha».
2. **«Hali qaytishi mumkin · bugungi holat»** (sariq blok). Hozir kutilayotgan (muddat tugamagan) epizodlar soni. U **davrga bog'liq emas**: bugungi holat. Matn: guruhdan chiqqaniga 21 kun yoki muzlatilganiga 60 kun to'lmagan; qaytmasa ketgan sanaladi. Tugma «Aloqa markaziga» mavjud `/outreach` sahifasiga olib boradi. Filtrlar bu blokka ham qo'llanadi. Soni 0 bo'lsa blok ko'rinmaydi.
3. **«Oylar bo'yicha»** — davr oxiridagi oydan orqaga 6 oy, ustunlar (davr uzunligiga bog'liq emas). Qaytish muddati hali tugamagan oylar (odatda oxirgi 2–3 oy) dastlabki hisoblanadi (ADR-0035: muzlatish 60 kun, guruhdan chiqish 21 kun kutiladi): ustun och rangda, ostida bir qatorli izoh.
4. **«Nega ketishdi»** — sabab bo'yicha ketganlar soni, kamayish tartibida; «Sabab yozilmagan» eng oxirida. «Boshqa sabab» qatori ostida «izohlarini o'qish» havolasi: ro'yxatni shu sabab bilan filtrlab, izoh ustunini ochadi. Matn: «Chetlatilgan o'quvchining sababi uning kartasidan olinadi.»
5. **«Qayerdan ketishdi»** — tugmalar Ustoz / Kurs / Guruh / Filial. Jadval: nom, Ketdi, Oy boshida, Ulushi (ketdi ÷ oy boshida). «Oy boshida» 5 dan kam bo'lsa ulush o'rniga «—» (kichik namuna foizi buzmasin). Ikki ustozli guruh ikkala ustozda sanaladi: jadval ostida «Jami (takrorlanmasdan): N» qatori. Ustoz uchun izoh: «o'quvchi ketgan paytdagi ustozi».
6. **«Ro'yxat»** — davrda boshlangan epizodlar. Filtrlar: qidiruv (ism, telefon, ID), sabab, holat (Hammasi / Ketgan / Hali qaytishi mumkin / Qaytgan), «Faqat qarzi borlar». Ustunlar: O'quvchi (ism, telefon; profilga havola), Oxirgi guruh (havola), Ketgan sana, O'qidi, Sabab (izoh yonida), Holat, Qarzi. Sahifalash 10–50, saralash — ketgan sana (yangi birinchi).
   - Holat: **Ketgan** (tasdiqlangan, qaytmagan), **Kutilmoqda** (muddat tugamagan), **Qaytgan** (tasdiqlangandan keyin qaytgan; u ham davrdagi ketishlar soniga kiradi).
   - Jadval ostida: «{N} ketgan, shundan {K} qaytgan · {P} kutilmoqda». N tepadagi songa teng.
   - «Qarzi» — bugungi manfiy balans; bossa Qarzdorlik sahifasida shu o'quvchi ochiladi. Musbat yoki 0 bo'lsa «—».
7. **«Ustoz almashgandan keyin»** — mavjud karta saqlanadi (`teacher-change-departures.ts`, 5 dars qoidasi), maket matni: «{Oy}da N ta guruhda ustoz almashdi. Keyingi 5 darsda shu guruhlardan M o'quvchi ketdi.» Kurs va ustoz filtri shu blokka ham qo'llanadi (guruhning kursi va hozirgi ustozlari bo'yicha).

Excel: «Excel» tugmasi (sarlavhada). Ikki varaq: «Ro'yxat» (filtrdagi **hamma** qator, 20 000 gacha; ID, telefon, filial, kurs, ustoz, izoh qo'shimcha ustunlar) va «Xulosa» (kartalar, sabablar, kesimlar). Format guruhlar hisobotidagi Excel kabi.

## 5. Server

Yangi `GET` yo'llar (`@Can('reports.students')`, `@BranchScope()`, bo'sh qamrov 403 — `listScope`):

- `GET /reports/departed-students/overview` — §4 ning 1–5 va 7 bloklari bitta javobda: `{ cards, pendingToday, months, reasons, cuts: { teacher, course, group, branch }, teacherChange }`. Bir so'rovda bitta `loadDepartures`.
  - So'rov: `startDate`, `endDate`, `courseId` (vergulli ro'yxat), `teacherIds`.
  - «Oldingi davr» soni uchun shu to'plam oldingi oraliq bilan qayta o'qiladi (yuklash bir marta, bo'lish ikki marta).
- `GET /reports/departed-students/list` — §4.6. So'rovga qo'shimcha: `q`, `reasonId` (`none` — sabab yozilmagan), `state`, `debtorsOnly`, `page`, `pageSize`.
- `GET /reports/departed-students/excel`.

Saqlanadi: `teacher-changes-list`, `departed-after-change`, `teacher-change-reasons` (ustoz almashish oynalari ishlatadi).

Olib tashlanadi: `summary`, `dynamics`, `by-status`, `reasons`, `by-reason`, `group-by`, `transfer-reasons`, `transferred-list` va ularning xizmatlari, DTO'lari va testlari. `ReportsMarketingService` o'rtacha o'qish muddatini `getDepartedStudentsSummary` orqali oladi: u yangi umumiy `averageStudyMonths` ga ko'chiriladi, marketing hisobi o'zgarmaydi (xuddi shu raqam).

Marshrut manifesti: yangi yo'llar `route-access.snapshot.json` va `branch-route-policy.ts` da (filial qamrovi servisda, `BRANCH_SCOPED_BY_SERVICE`), olib tashlanganlar `intentional-access-changes.ts` dan o'chiriladi.

Keshlanmaydi. `loadDepartures` hozir ham har so'rovda o'qiydi; sekin bo'lsa Redis kaliti (`departures:<company>:<kun>`) keyingi qadam (`// ponytail:` izohi).

## 6. Mijoz

Sahifa yo'li o'zgarmaydi: `/reports/departed-students`. Komponentlar `components/reports/departed-students/` da qayta quriladi: karta qatori, kutilayotganlar bloki, oylar ustunlari, sabablar, kesim jadvali, ro'yxat, filtr paneli (davr tugmalari, kurs, ustoz). Filial — sarlavhadagi tanlov. URL parametrlari saqlanadi (`preset`, `startDate`, `endDate`, `courseId`, `teacherIds`; yangi `cut`, `q`, `reason`, `state`, `debtors`, `page`, `pageSize`).

Eski komponentlar o'chadi: KPI kartalari, dinamika grafigi, holat grafigi, kesim grafigi, sabablar oynasi (sozlama tugmasi «Ketish sabablarini boshqarish» saqlanadi — u Sozlamalarga olib boradi), eski jadval. `dialog-pagination-footer.tsx` boshqa sahifalar ishlatgani uchun qoladi. Ustoz almashish oynalari saqlanadi.

Matnlar lotin yozuvida, inglizcha so'zsiz, «koeffitsient» va «LTV» yo'q. Telefonda: kartalar ustma-ust, jadvallar gorizontal aylanadi, summalar bir qatorda.

Hujjatlar: ADR-0097; foydalanuvchi qo'llanmasi (yangi sahifa `client/src/qollanma/kontent/hisobotlar/ketgan-oquvchilar.mdx`, bo'lim ro'yxatiga qo'shiladi) va `yangiliklar.ts` yozuvi; `server/CLAUDE.md` va `client/CLAUDE.md` dagi eski endpointlar o'rniga yangilari.

## 7. Chekka holatlar

- Epizodi bor, lekin oxirgi guruhi topilmaydigan o'quvchi (guruh o'chirilgan, yozilish yo'q): kurs, filial, ustoz bo'sh — «Noma'lum» qatorida; filtr yoqilganda bunday qator chiqmaydi.
- Davr boshi tizim boshlanish sanasidan (`systemStartDate`) oldin bo'lsa — ADR-0035 dagi pol (`floor`) qo'llanadi, «oy boshida» ham shu polga ko'tariladi.
- Bir o'quvchi davrda ikki marta ketsa (qaytib yana ketsa) — ADR-0035: ketganlar soni va ro'yxatda faqat birinchisi sanaladi (`departuresInRange`), kesimlarda ham.
- Sabab ro'yxatida o'chirilgan (arxivlangan) sabab: nomi saqlanadi, tarix buzilmaydi.
- Davr 12 oydan uzun oraliq: oylar bloki baribir 6 oy; ro'yxat va kesimlar to'liq davr.

## 8. Sinov

- **Parite testi:** soxta ma'lumotda `cards.departed` = Σ `reasons[].count` = har kesimning takrorlanmagan yig'indisi = ro'yxatdagi tasdiqlanganlar soni = `months` dagi davr ichidagi ustunlar yig'indisi.
- Filtr testi: kurs/ustoz tanlanganda hamma blok o'zgaradi, maxraj («oy boshida») ham.
- Ustoz to'xtash paytida: o'zgarishdan oldin ketgan o'quvchi eski ustozda, keyin ketgani yangisida.
- Sabab manbai: chetlatish — karta, guruhdan chiqish — yopilgan yozilish; bo'sh — «Sabab yozilmagan».
- Oldingi davr: oy, 3 oy va oraliq uchun to'g'ri chegaralar.
- Ulush: «oy boshida» < 5 bo'lsa «—».
- Marshrut va huquq testlari (`routeAccess`, `defaultRolesOf`), bo'sh qamrov 403.
- Mijoz: render testlari (`createElement` + `renderToStaticMarkup`), URL parametrlari, tor oynada ko'rinish.
- Brauzer tekshiruvi soxta API bilan; rasmlar CEO'ga PR'dan oldin.

## 9. Chiqarish

Migratsiya yo'q, skript yo'q. Server va mijoz **birga** chiqadi (eski mijoz olib tashlangan yo'llarni chaqiradi). Tartib: Vercel qurilishi domensiz → Railway → SUCCESS → domenlarni ko'chirish. 02:00, 03:10, 04:00 va 23:00 vaqtlarida chiqarilmaydi.

## 10. Bu qismda yo'q (keyinga)

- Imtihon va Teilnahmebestätigung bo'yicha «haqiqatan tugatdi» tekshiruvi — alohida funksiya; tayyor bo'lganda ketganlar ta'rifi yangi ADR bilan yangilanadi.
- Redis keshi.
- `/outreach` sahifasining o'zi (faqat havola).
