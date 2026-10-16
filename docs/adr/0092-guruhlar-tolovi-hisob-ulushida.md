# ADR-0092 — Guruhlar bo'yicha to'lov: oy hisobi guruhlarga hisob ulushida bo'linadi; ustoz — hozirgi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0058, ADR-0059, ADR-0067, ADR-0072, ADR-0079, ADR-0088, `server/src/reports/month-charges.ts`, `server/src/reports/group-payments/`, `client/src/components/reports/group-payments/`, `docs/superpowers/specs/2026-10-16-b5-guruh-tolov-design.md`, `docs/superpowers/plans/2026-10-16-b5-guruh-tolov.md`

## Kontekst

Hisobotlardagi «To'lov hisobotlari» sahifasining kartalari (jami to'lov, usullar, filiallar, qaytarilgan to'lovlar) endi «To'lovlar» sahifasida (ADR-0088). Uning «O'qituvchilar» jadvali va ustozning guruhlari oynasi o'quvchining bugungi butun manfiy balansini u o'qigan har bir guruhga yozardi: ikki guruhda o'qigan qarzdorning qarzi ikki marta sanalardi, ustozlar yig'indisi jamidan katta chiqardi. «Kutilgan summa» o'quvchilar soni × kurs narxi edi — chegirma, oy o'rtasida qo'shilish va muzlatishni bilmasdi. Oy tanlanmasdi, o'quvchi darajasiga tushib bo'lmasdi, Excel yo'q edi.

## Qaror

1. **Bitta manba.** Hisobotning hamma raqami `reports/month-charges.ts` dan: oyning CHARGED `EnrollmentMonthlyCharge` qatorlari (filial — hisob qatorining `branchId` si) va o'quvchining bugungi balansi. O'quvchi qoldig'i — ADR-0058 qoidasi, filial ulushi — `splitMonthCharges` dagi formula. U endi bitta pure funksiyada (`studentShares`): `splitMonthCharges` uni qo'shadi, `splitMonthChargesByCharge` uni bo'ladi.
2. **Hisob ulushida bo'linadi.** O'quvchining doiradagi ulushi uning shu oydagi doiradagi hisob qatorlariga `chargedAmount` ulushida bo'linadi; yaxlitlash qoldig'i eng katta kasr qismli qatorga beriladi (largest remainder; teng bo'lsa qator id si bo'yicha). Qatorlar yig'indisi o'quvchi ulushiga aynan teng.
3. **Jamiga tenglik testi.** Tasodifiy ma'lumotda guruhlar yig'indisi `splitMonthCharges` bilan so'mma-so'm teng: `charged`, `paid`, `unpaid`, `students`, `unpaidStudents` (`month-charges.spec.ts`, `group-payments.math.spec.ts`). To'landi = hisoblandi − qoldi (balansdan, pul emas).
4. **Ustoz va kurs — hozirgi.** Guruh hozirgi `GroupTeacher` lariga va hozirgi `courseId` siga yoziladi. Ikki ustozli guruh ikkalasida ham sanaladi (jadval ostida izoh); bir ustozning ikki guruhidagi o'quvchi bir marta sanaladi; ustozi yo'q guruh «Ustozsiz» qatorida.
5. **Eski uch endpoint olib tashlandi** — `GET /reports/payment-reports`, `/payment-reports/teachers`, `/payment-reports/teachers/:teacherId/groups`: qarzni guruhlar orasida ikki marta sanardi. Sahifa havolasi (`/reports/payment-reports`) va `reports.payments` imkoniyati qoladi (yorlig'i «Guruhlar bo'yicha to'lov hisoboti»). Yangi route'lar: `GET /reports/group-payments`, `/group-payments/groups/:groupId`, `/group-payments/excel` — `@BranchScope()`, ro'yxat doirasi, bo'sh doira — 403.
6. Hisobot sentabr 2026 dan (oylik hisob boshlangan oy) joriy Toshkent oyigacha; kesh yo'q.

## Taqiqlanadi

- Guruh yoki ustoz qarzini o'quvchining butun balansidan hisoblash.
- Oy hisobining ikkinchi formulasini yozish: guruh, ustoz va kurs raqamlari ham `month-charges.ts` dan o'qiladi.

## Muqobillar

- **Eski hisob avval yopiladi** (FIFO, `replayDebtOrigin`): qaysi guruh hisobi oldin to'langani aniqroq, lekin guruhlar yig'indisi «Umumiy ma'lumotlar»dagi «Qoldi» bilan teng chiqmasligi mumkin. CEO tanlamadi.
- **Oyda ko'p dars bergan ustoz:** o'tgan oylar uchun aniqroq, lekin murakkab. CEO tanlamadi.

## Oqibatlar

- «Qoldi» bugungi balansdan: o'tgan oyning «Qoldi»si keyingi to'lov kelganda kamayadi (ADR-0058 dagidek).
- Ustoz almashgan guruh o'tgan oy uchun ham yangi ustozda ko'rinadi; oy davomida o'chirilgan kurs nomi o'chirilgan holida ko'rsatiladi.
- Ikki guruhli o'quvchi qoldig'ining bo'linishi — kelishuv (hisob ulushi), qaysi guruh hisobini «oldin» yopgani emas.
- Server va sayt birga chiqadi: eski sayt sahifasi olib tashlangan endpointlarni chaqiradi.
