# B5 — «Guruhlar bo'yicha to'lov» hisoboti — dizayn

**Sana:** 2026-10-16
**Holati:** CEO tomonidan tasdiqlangan (16.10.2026: uch savolga javob va dizayn — §2)
**Maket:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — `v-grp` bo'limi va `gdrawer` oynasi (CEO 27.09 da tasdiqlagan)

**Tayanadi:** ADR-0058 (oy hisobi: hisoblandi / to'landi / qoldi, `reports/month-charges.ts`), ADR-0059 (qarz ikki raqam, qo'shilmaydi), ADR-0067 (B1), ADR-0072 (Qarzdorlik sahifasi va uning `groupIds` filtri), ADR-0079 (imkoniyatlar), ADR-0088 (B4: umumiy summa va usullar «To'lovlar» sahifasida).
**Qaror yozuvi:** yangi ADR — shu PR'da (§7.1). Raqami PR paytidagi keyingi bo'sh raqam (yozilish paytida 0092; `origin/main` dagi `docs/adr/README.md` tekshiriladi). Quyida «yangi ADR».

## 1. Nima uchun

B to'plami Moliya va Hisobotlarni tasdiqlangan maket asosida qayta quradi; 1–4 qismlar prodda. 5-qism — Hisobotlardagi «To'lov hisobotlari» o'rniga «Guruhlar bo'yicha to'lov».

Bugungi sahifa nima beradi va nimasi noto'g'ri:
- Kartalar (jami to'lov, usullar, filiallar, qaytarilgan to'lovlar) — bu raqamlar endi «To'lovlar» sahifasida (B4) va filial tepadagi tanlovda. Ikki joyda bir xil raqam — keraksiz.
- «O'qituvchilar» jadvali va ustozning guruhlari oynasi o'quvchining BUGUNGI butun manfiy balansini u o'qigan har bir guruhga yozadi: ikki guruhda o'qigan qarzdorning qarzi ikki marta sanaladi, ustozlar yig'indisi jamidan katta chiqadi. «Kutilgan summa» = o'quvchilar soni × kurs narxi — chegirma, oy o'rtasida qo'shilish, muzlatishni bilmaydi.
- Oy tanlanmaydi (davr filtri bor, lekin ustozlar jadvali uni e'tiborsiz qoldiradi), o'quvchi darajasiga tushib bo'lmaydi, Excel yo'q.

Yangi hisobot savolga to'g'ridan-to'g'ri javob beradi: «Shu oy qaysi guruh qancha to'ladi, qancha qoldi va kim to'lamagan?» — «Umumiy ma'lumotlar»dagi 1-qator raqamlarining o'zi, guruh, ustoz va kurs kesimida.

## 2. CEO qarorlari (16.10.2026)

1. Maketdagi `v-grp` ko'rinishi va `gdrawer` oynasi asos (27.09 da tasdiqlangan): oy tanlovi, Excel; tepada «Hisoblandi / To'landi / Qoldi» kartasi — «Umumiy ma'lumotlar»dagi 1-qator bilan bir xil raqamlar; «Guruhlar / Ustozlar / Kurslar» kesimi; qidiruv, saralash, «Faqat qarzi borlar»; guruh qatori bosilsa o'quvchilar oynasi. Hisobot sentabr 2026 dan boshlanadi (may–avgust oylik hisob yo'q).
2. Bir o'quvchi bir oyda ikki guruhda hisob olgan bo'lsa (oy o'rtasida guruh almashtirish), uning qoldig'i guruhlarga **hisob ulushida** bo'linadi. Guruhlar yig'indisi «Umumiy ma'lumotlar»dagi «Qoldi» bilan so'mma-so'm teng (§4.2).
3. «Ustozlar» kesimida guruh **hozirgi ustoz(lar)i**ga yoziladi. Ikki ustozli guruh ikkalasida ham ko'rinadi; jadval ostida shu haqda izoh (§3.5).
4. Excel: 1-varaq — ekrandagi jadval (joriy kesim va filtrlar, hamma sahifalar); 2-varaq — har bir o'quvchi (§5.4).
5. Eski sahifaning kartalari, «O'qituvchilar» jadvali va ularning uchta server manzili olib tashlanadi (§5.6). Sahifa havolasi (`/reports/payment-reports`) o'zgarmaydi; nomi «Guruhlar bo'yicha to'lov» bo'ladi.
6. Guruh oynasida guruhdan chiqqan yoki muzlatilgan o'quvchi ham qoladi (uning hisobi o'sha oyga kirgan), belgisi bilan; ism bosilsa o'quvchi profili ochiladi; pastda «Guruh sahifasi» va «Qarzdorlik» (shu guruh bo'yicha).

## 3. Sahifa — `/reports/payment-reports`

### 3.1 Menyu, kirish
- Hisobotlar → «Moliyaviy hisobotlar» bo'limidagi yagona band: «Guruhlar bo'yicha to'lov» (`reports-nav.ts`, `permission: "reports.payments"` — bugungidek: CEO, filial direktori, administrator). Havola o'zgarmaydi, eski xatchoplar ishlaydi.
- Breadcrumb `payment-reports` → «Guruhlar bo'yicha to'lov». Global qidiruvda (`searchable-pages.ts`) yangi band: «Guruhlar bo'yicha to'lov», kalit so'zlar: «guruh to'lovi», «qarzdor guruh», «ustoz bo'yicha to'lov», «to'lov hisoboti».
- Filial — tepadagi tanlovdan (`@BranchScope()`), sahifada filial filtri yo'q. Bir nechta filialga ega foydalanuvchi filial tanlamasa — hamma filiallari yig'indisi (B4 dagidek ro'yxat doirasi).

### 3.2 Sarlavha
«Guruhlar bo'yicha to'lov», oy tanlovi «‹ Oktabr 2026 ›» (`MonthStepper`, `?oy=YYYY-MM`; standart va eng kattasi — joriy Toshkent oyi, eng kichigi `2026-09`) va «Excel» tugmasi.

### 3.3 Yig'ma karta
- Sarlavha: «{Oy} oyi to'lovlari — guruhlar kesimida».
- Uch raqam: **Hisoblandi** («N guruh · M o'quvchi»), **To'landi** («X%»), **Qoldi** (qizil; «guruhlarning o'rtachasi Y%»).
- Chiplar: «To'liq to'lagan guruh N» (yashil nuqta: qoldig'i 0 guruhlar), «Yarmidan kami to'langan N» (qizil nuqta: to'langan foizi 50 dan kam guruhlar).
- Yashil qator: «Umumiy ma'lumotlardagi 1-qator bilan bir xil raqamlar».
- Karta filtrlarga bog'liq emas: kesim, qidiruv va «Faqat qarzi borlar» uni o'zgartirmaydi.

### 3.4 Filtrlar
- Kesim (segment): «Guruhlar» (standart) · «Ustozlar» · «Kurslar» — `?kesim=guruh|ustoz|kurs` (`guruh` URL'dan tushiriladi).
- Qidiruv: placeholder «Guruh, ustoz yoki kurs» — `?q=`. Guruhlar kesimida guruh nomi/raqami, ustoz ismi va kurs nomi bo'yicha; Ustozlar kesimida ustoz ismi; Kurslar kesimida kurs nomi.
- Saralash (`Select`): «Eng past foiz» (standart) · «Eng ko'p qoldi» · «Nomi» — `?tartib=foiz|qoldi|nomi`.
- «Faqat qarzi borlar» (checkbox) — `?qarzdor=1`: qoldig'i 0 dan katta qatorlar.
- Har qanday filtr o'zgarsa sahifa 1 ga qaytadi. Filtrlar serverda qo'llanadi (§5.2); mijoz hech narsa hisoblamaydi.

### 3.5 Jadval
- Ustunlar (`#` birinchi): Guruh (nomi qalin, ostida kurs nomi) · Ustoz (faqat Guruhlar kesimida; bir nechta bo'lsa vergul bilan) · O'quvchi · Hisoblandi · To'landi · Qoldi (0 dan katta bo'lsa qizil qalin, aks holda kulrang «0») · Foiz (rangli chiziq + «X%»: ≥ 90 yashil, ≥ 50 sariq, < 50 qizil) · To'lamagan (qoldig'i bor o'quvchilar soni; 0 kulrang).
- Ustozlar va Kurslar kesimida birinchi ustun — ustoz / kurs nomi, ostida «N guruh». Guruhsiz ustoz yo'q; ustozi yo'q guruh «Ustozsiz» qatoriga, kursi o'chirilgan guruh esa kurs nomi bilan (kurs `deletedAt` bo'lsa ham nomi o'qiladi).
- Belgilar: o'chirilgan guruh — «o'chirilgan» pill; yopilgan (COMPLETED / CANCELLED) — «yopilgan» pill. Oyda hisob yozilgan har bir guruh chiqadi, yopilgani ham.
- Ustozlar kesimida bir nechta ustozli guruh bo'lsa, jadval ostida kulrang izoh: «Ikki ustozli guruh har ikkala ustozda sanaladi — ustozlar yig'indisi jamidan katta bo'lishi mumkin.»
- Sahifalash — loyiha qoidasi bo'yicha: standart 10 qator, «10 / 20 / 30 / 40 / 50 ta» (`?sahifa=`, `?soni=`), «1–10 / 46».
- Guruhlar kesimida qator bosilsa (yoki Enter/Space) — o'quvchilar oynasi (`?guruh=<groupId>`). Ustozlar va Kurslar qatorlari bosilmaydi.
- Pastda kulrang izoh: «Qoldi — bugungi balans bo'yicha: o'quvchi keyinroq to'lasa, o'tgan oyning ham «Qoldi»si kamayadi.»

### 3.6 Guruh oynasi (o'ngdan, `Sheet`)
- Sarlavha: guruh nomi; ostida «{Kurs} · {Ustoz(lar)} · N o'quvchi».
- Jami qutisi: «To'landi X% · qoldi» va katta «Y so'm».
- «O'QUVCHILAR» ro'yxati: har qatorda ism (bosilsa `/students/profile/<id>`; arxivdagi o'quvchi — havolasiz), ID, belgi («guruhdan chiqqan» · «muzlatilgan» · «arxivda»), o'ngda holat pill — «to'ladi» (yashil) / «qisman» (sariq) / «to'lamagan» (qizil) — va summa: to'laganida «hisoblandi X», aks holda «qoldi Y». Tartib: to'lamagan, qisman, to'ladi; har biri ichida qoldig'i katta birinchi.
- Pastda: «Guruh sahifasi» (`/groups/<id>`; o'chirilgan guruhda yo'q) va «Qarzdorlik» (`/payments/debt?groupIds=<id>`; qoldiq 0 bo'lsa yo'q).
- Holatlar: yuklanmoqda — skelet; topilmadi (404: guruh shu oy/filialda hisob olmagan) — «Bu guruh tanlangan oyda topilmadi» + «Yopish»; xato — «Ma'lumotni yuklab bo'lmadi» + «Qayta urinish». Yopish `?guruh=` ni o'chiradi.

### 3.7 Bo'sh holat, yuklanish, xato
- Oyda hisob yo'q: «Bu oyda hisob yozilmagan» (kartada ham, jadvalda ham). Filtr natija bermasa: «Hech narsa topilmadi» + «Tozalash».
- Yuklanayotganda karta va jadval skeleti; javobsiz so'rov hech qachon bo'sh holatni chizmaydi; xato — «Ma'lumotni yuklab bo'lmadi» + «Qayta urinish».

## 4. Ma'lumot qoidalari

### 4.1 Bitta manba
Hamma raqam `reports/month-charges.ts` dan: oyning CHARGED `EnrollmentMonthlyCharge` qatorlari (filial — hisob qatorining `branchId` si) va o'quvchining bugungi balansi. O'quvchi bo'yicha qoldiq — ADR-0058 qoidasi: `min(max(0, qarz − keyingi oylar hisoblari), shu oy hisoblari)`; filial doirasidagi ulushi `round(qoldiq × doiradagi / hammasi)` — bugungi `splitMonthCharges` ning o'zi. Ikkinchi formula yozilmaydi.

### 4.2 Qoldiqni hisob qatorlariga bo'lish (yangi)
O'quvchining doiradagi ulushi uning shu oydagi doiradagi hisob qatorlariga `chargedAmount` ulushida bo'linadi; yaxlitlash qoldig'i eng katta kasr qismli qatorga beriladi (largest remainder), shuning uchun qatorlar yig'indisi o'quvchi ulushiga AYNAN teng. Shu bilan:
- Guruh qatorlari yig'indisi (filtrsiz) `charged`, `paid`, `unpaid` bo'yicha `getMonthCharges` bilan so'mma-so'm teng. `students` va `unpaidStudents` qatorlar yig'indisida teng emas (ikki guruhli o'quvchi ikkala qatorda); yig'ma kartada, har o'quvchi bir marta sanalganda, ular ham teng — test (§8).
- To'landi = hisoblandi − qoldi (har qatorda, guruhda, jamida) — pul emas, balansdan (ADR-0058 dagidek).

Bitta pure funksiya o'quvchi ulushini hisoblaydi va ikkalasi — `splitMonthCharges` (jamlar) va yangi `splitMonthChargesByCharge` (qator ulushlari) — undan foydalanadi.

### 4.3 Guruh, ustoz, kurs
- Guruh qatori = shu guruhning oydagi doiradagi hisob qatorlari. Bir o'quvchi bitta guruhda ikki hisob olgan bo'lsa (chiqib, qaytib kirgan) — bitta o'quvchi sifatida qo'shiladi.
- Foiz = to'landi ÷ hisoblandi (bir kasr; ekranda butun). «Guruhlarning o'rtachasi» = guruhlar foizlarining oddiy o'rtachasi.
- Ustoz = guruhning hozirgi `GroupTeacher` lari; kurs = guruhning hozirgi `courseId`. Ustoz/kurs qatori = uning guruhlari qatorlari yig'indisi (o'quvchi bir ustozning ikki guruhida bo'lsa — bir marta sanaladi).

### 4.4 O'quvchi holati va belgisi
- Holat: qoldiq 0 — «to'ladi»; 0 < qoldiq < hisoblandi — «qisman»; qoldiq = hisoblandi — «to'lamagan».
- Belgi: o'quvchi kartasi arxivda (`deletedAt`) — «arxivda»; aks holda hisob qatoridagi enrollment holati: FROZEN — «muzlatilgan»; DROPPED / TRANSFERRED / COMPLETED — «guruhdan chiqqan»; ACTIVE — belgisiz. Ikki hisob bo'lsa — eng so'nggi enrollment.

## 5. Server

### 5.1 Umumiy
- Yangi fayllar `server/src/reports/group-payments/` da: pure hisob (`group-payments.math.ts`), yuklovchi va servis, controller, DTO, Excel.
- Hamma route: `@Can('reports.payments')`, `@BranchScope()`, ro'yxat doirasi (bo'sh doira — 403 «Bu filial ma'lumotlarini ko'rish huquqingiz yo'q»). `branch-route-policy.ts` ga yozilmaydi; `route-access.snapshot.json` ga har biri uchun qator (standart rollar CEO, filial direktori, administrator).
- Oy: `YYYY-MM`, `2026-09` dan kichik — 400 «Bu hisobot sentabr 2026 dan boshlanadi»; joriy Toshkent oyidan katta — 400 «Kelajak oyni tanlab bo'lmaydi». Bo'sh — joriy oy.
- Kesh yo'q: oy ~500 hisob qatori; har so'rov to'g'ridan-to'g'ri o'qiydi.

### 5.2 `GET /reports/group-payments`
So'rov: `oy`, `kesim` (`guruh|ustoz|kurs`), `q`, `tartib` (`foiz|qoldi|nomi`), `qarzdor` (`1`), `sahifa`, `soni` (10–50). Javob:
```ts
{
  month: 'YYYY-MM',
  summary: { charged, paid, unpaid, paidPct, students, unpaidStudents,
             groups, fullyPaidGroups, underHalfGroups, avgGroupPct },
  rows: Array<{ id, name, sub, teachers?: string[], marks: ('ochirilgan'|'yopilgan')[],
                students, charged, paid, unpaid, paidPct, unpaidStudents }>,
  total: number,            // filtrdan keyingi qatorlar soni
  multiTeacherNote: boolean // Ustozlar kesimida bir nechta ustozli guruh bormi
}
```
`summary` filtrlarga bog'liq emas. `rows` — kesim, qidiruv, «qarzdor» va saralashdan keyin, sahifa bo'yicha kesilgan.

### 5.3 `GET /reports/group-payments/groups/:groupId?oy=`
Guruh oynasi: `{ group: { id, name, course, teachers, deleted, closed }, charged, paid, unpaid, paidPct, students: Array<{ id, firstName, lastName, phone, charged, paid, unpaid, status, mark }> }`. Guruh shu oy va doirada hisob olmagan bo'lsa — 404 «Bu guruh tanlangan oyda topilmadi».

### 5.4 `GET /reports/group-payments/excel`
`oy`, `kesim`, `q`, `tartib`, `qarzdor` (sahifasiz). Fayl nomi `guruhlar-tolovi-YYYY-MM.xlsx`.
- 1-varaq «Guruhlar» / «Ustozlar» / «Kurslar» — jadval ustunlari + jami qatori.
- 2-varaq «O'quvchilar»: Guruh, Ustoz, O'quvchi, ID, Telefon, Hisoblandi, To'landi, Qoldi, Holat, Belgi — oyning doiradagi hamma o'quvchi–guruh qatorlari; `qarzdor=1` bo'lsa faqat qoldig'i borlar.

### 5.5 Ruxsatlar
`reports.payments` imkoniyati o'zgarmaydi (yorlig'i: «Guruhlar bo'yicha to'lov hisoboti»). `permission-routes.spec.ts` uchta yangi route bilan o'tadi.

### 5.6 Olib tashlanadi
- `GET /reports/payment-reports`, `GET /reports/payment-reports/teachers`, `GET /reports/payment-reports/teachers/:teacherId/groups` — controller metodlari, `ReportsService` fasaddagi va `ReportsPaymentsService` / `ReportsTeacherPaymentsService` dagi ularning metodlari, faqat ular ishlatgan DTO va spec'lar. Excel ishlatadigan `getPaymentLineItems` va `getPerBranchSummary` qoladi.
- `route-access.snapshot.json` dagi uch qator; ularga tegishli `intentional-access-changes.ts` yozuvlari.
- Mijozda `components/reports/payment-reports/` hammasi.

## 6. Mijoz

### 6.1 Fayllar (`client/src/components/reports/group-payments/`)
`group-payments-url.ts` (URL ↔ filtrlar), `group-payments-queries.ts`, `group-payments-types.ts`, `group-payments-page.tsx`, `group-payments-summary.tsx`, `group-payments-filter-bar.tsx`, `group-payments-table.tsx`, `group-drawer.tsx`, `group-payments-format.ts` (pure: foiz rangi, belgi va holat yorliqlari). `app/(dashboard)/reports/payment-reports/page.tsx` yangi sahifani chizadi.

### 6.2 URL kalitlari
`oy`, `kesim`, `q`, `tartib`, `qarzdor`, `sahifa`, `soni`, `guruh` (ochiq oyna). Standart qiymatlar URL'dan tushiriladi (`useUrlFilters`).

### 6.3 Menyu va matnlar
`reports-nav.ts` band nomi, `reports-nav.test.ts` (bo'lim nomlari ro'yxati), `breadcrumb-routes.ts`, `searchable-pages.ts`. Hamma matn lotin o'zbekchasida; inglizcha so'z yo'q.

## 7. Hujjatlar

### 7.1 Yangi ADR
Sarlavha: «Guruhlar bo'yicha to'lov: oy hisobi guruhlarga hisob ulushida bo'linadi; ustoz — hozirgi». Qaror: §4.1–§4.3 (bitta manba, largest remainder, jamiga tenglik testi, hozirgi ustoz/kurs); eski uch endpoint olib tashlanadi (qarzni guruhlar orasida ikki marta sanardi). Taqiqlanadi: guruh/ustoz qarzini o'quvchining butun balansidan hisoblash; ikkinchi oy hisobi formulasi. Muqobillar: eski hisob avval yopiladi (FIFO, `replayDebtOrigin`) — aniqroq, lekin «Qoldi» bilan teng chiqmasligi mumkin (CEO tanlamadi); oyda ko'p dars bergan ustoz — o'tgan oylar uchun aniqroq, murakkab (CEO tanlamadi). Oqibatlar: o'tgan oyning «Qoldi»si to'lov kelganda kamayadi; ustoz almashgan guruh o'tgan oy uchun ham yangi ustozda.

### 7.2 Boshqalar
- `server/CLAUDE.md`: Reports Module — yangi route'lar, `/payment-reports` qatori almashtiriladi; «One month-end expectation» bo'limida `splitMonthChargesByCharge` eslatmasi.
- `client/CLAUDE.md`: Financial UI / hisobotlar jadvaliga qator.
- `docs/role-access.md`: «To'lov hisobotlari» → «Guruhlar bo'yicha to'lov».
- Qo'llanma: `kontent/hisobotlar/guruhlar-tolovi.mdx` + `sahifalar/hisobotlar.ts` reyestri (`rollar: [1, 2, 3]`, `yollar: ["/reports/payment-reports"]`, `adr: [yangi, "0058"]`) + `yangiliklar.ts` da yangilik: «Hisobotlarda «To'lov hisobotlari» o'rniga «Guruhlar bo'yicha to'lov»: oy tanlanadi, har guruh qancha to'lagani va qancha qolgani ko'rinadi, guruhni bosib kim to'lamaganini ko'rish mumkin. Raqamlar «Umumiy ma'lumotlar» bilan bir xil.» Haqiqiy ism va summa yo'q.

## 8. Testlar
- `group-payments.math.spec.ts`: largest remainder (yig'indi aniq, bir qator, nol qoldiq); ikki guruhli o'quvchi; bitta guruhda ikki hisob; keyingi oy hisoblari; boshqa filialdagi hisob; holat va belgi qoidalari; tasodifiy ma'lumotda Σ guruhlar = `splitMonthCharges` (charged, paid, unpaid, students, unpaidStudents).
- Servis: kesimlar, qidiruv, saralash, qarzdor, sahifa; filtr kartani o'zgartirmaydi; oy chegaralari (400); bo'sh doira (403); guruh oynasi 404; ustoz kesimi va `multiTeacherNote`.
- Controller: marker va standart rollar (`routeAccess`, `defaultRolesOf`); `permission-routes.spec.ts`; `reports-branch-scope-coverage` ruhida — doira bilan har so'rov filialni tashiydi.
- Excel: ikki varaq, ustunlar, jami, `qarzdor`.
- Mijoz (vitest, `.test.ts`): URL ↔ filtr, format funksiyalari, jadval va oyna statik render (ustunlar, belgilar, bo'sh/xato holatlar), `reports-nav.test.ts`.

## 9. Deploy tartibi
Migratsiya yo'q. Server va sayt BIRGA chiqadi: eski sayt sahifasi olib tashlangan endpointlarni chaqiradi, yangi sayt yangi endpointni. Skript yo'q.

## 10. Ma'lum cheklovlar
- «Qoldi» bugungi balansdan: o'tgan oyning qoldig'i keyingi to'lovlar bilan kamayadi (ADR-0058 dagidek).
- Ustoz va kurs — hozirgisi: ustoz almashgan guruh o'tgan oy uchun ham yangi ustozda ko'rinadi.
- Ikki guruhli o'quvchi qoldig'ining bo'linishi — kelishuv (hisob ulushi), qaysi guruh hisobini «oldin» yopgani emas.
- Oy davomida o'chirilgan kurs nomi o'chirilgan holida ham ko'rsatiladi.
