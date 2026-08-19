# ADR-0003 — Har bir route filial siyosati bo'yicha toifalanadi

**Holati:** Qabul qilindi
**Sana:** 2026-08-06
**Bog'liq:** ADR-0001, ADR-0002, `server/src/common/auth/branch-route-policy.ts`

## Kontekst

Filial qamrovi turlar bilan majburlangan edi: `ReportBranchIds` — majburiy parametr, shuning uchun qamrovni unutgan servis chaqiruvi **kompilyatsiya bo'lmaydi**. Bu «chaqiruv unutdi» holatini yopadi.

Lekin u **«route umuman chaqirmadi»** holatini yopa olmaydi. Prisma'ga to'g'ridan-to'g'ri murojaat qiladigan yangi kontroller, yoki kompaniya darajasidagi yordamchida to'xtab qolgan route — toza kompilyatsiya bo'ladi va **barcha filiallarga** xizmat qiladi.

## Qaror

Barcha HTTP route'lar **manifestda** toifalanadi (`BRANCH_SCOPED_BY_HEADER`, `COMPANY_WIDE`, `UNREVIEWED` va h.k.). Test manifestni koddan topilgan route'lar bilan solishtiradi, shuning uchun **yangi endpoint kimdir uni toifalamaguncha build'ni yiqitadi**.

**Halollik qoidasi:** `UNREVIEWED` — haqiqiy toifa va uning haqiqiy sanog'i bor. 243 route'ni bir o'tishda toifalab raqamni nolga tushirish — hech kim o'ylab ko'rmagan ishonchli yorliqlar yaratardi, va bu tan olingan qarzdan **yomonroq**: noto'g'ri `COMPANY_WIDE` ni o'ylangan `COMPANY_WIDE` dan ajratib bo'lmaydi, va u aynan xatoni tutadigan tekshiruvni o'chiradi.

`UNREVIEWED` byudjeti **faqat kamayishi** mumkin.

## Ko'rib chiqilgan muqobillar

**Faqat turlarga tayanish.** Yetarli emas — yuqoridagi kontekstga qarang.

**Har bir route uchun integratsiya testi.** Bu manifestdan kuchliroq, lekin 365 route uchun real emas. Shuning uchun **uch qatlam** ishlatiladi va bu manifest ataylab **eng zaifi**: uning vazifasi — hech narsa **unutilmasin**, hammasi to'g'ri bo'lsin emas. Uchinchi qatlam — salbiy integratsiya testlari (`payments.branch-isolation.spec.ts`, `leads.branch-isolation.spec.ts`, `branch-isolation.scenario.spec.ts`).

## Oqibatlari

**Yutuq:** yangi route jimgina barcha filiallarga ochiq qolib keta olmaydi — build to'xtaydi.

**Narx:** har bir yangi endpoint manifestga qator qo'shishni talab qiladi. Bu ataylab qo'yilgan ishqalanish.

**Endi taqiqlangan:** `UNREVIEWED` byudjetini oshirish. Va toifani «raqam chiroyli bo'lsin» deb qo'yish — toifalanmagan route toifalanganidan halolroq.
