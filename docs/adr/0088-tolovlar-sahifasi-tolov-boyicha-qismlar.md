# ADR-0088 — To'lovlar sahifasi: «Nimaga ketdi» kassa dvigatelining o'zidan har to'lov bo'yicha; guruh — to'lov kunidagi; kvitansiya raqami to'lov yozilganda; bekor qilish sababi majburiy; tuzatish ustun bilan bog'lanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0016, ADR-0021, ADR-0065, ADR-0067, ADR-0072, ADR-0079, ADR-0081, `server/src/common/finance/income-attribution.ts`, `server/src/payments/list/`, `server/src/receipts/receipt-code.ts`, `server/src/receipts/receipt-code.listener.ts`, `server/src/payments/payments-write.service.ts`, `server/scripts/backfill-payment-receipt-codes.ts`, `server/scripts/link-payment-corrections.ts`, `client/src/components/payments/list/`, `docs/superpowers/specs/2026-10-11-b4-tolovlar-design.md`, `docs/superpowers/plans/2026-10-11-b4-tolovlar.md`

## Kontekst

B to'plamining 4-qismi — yangi «To'lovlar» sahifasi (`/payments/list`). U Hisobotlardagi «O'quvchi to'lovi»ni almashtiradi. Eski ro'yxatda yetti muammo bor edi:

- Ro'yxat faqat CEO va filial direktoriga ochiq edi. Administrator va kassir pulni har kuni qabul qiladi, lekin uni ko'rmasdi.
- Davr tugmalari, qidiruv va jami summa yo'q edi; «Bonus» ustuni doim bo'sh turardi.
- Bekor qilingan to'lovlar umuman ko'rinmasdi; tuzatilgan to'lovning aslini topib bo'lmasdi, chunki eski va yangi to'lovni faqat izoh matni bog'lardi.
- To'lov qatoridan hech narsa ochilmasdi: pul nimaga ketgani, to'lov paytidagi balans, kvitansiya — hammasi boshqa sahifalarda edi.
- To'lovni bekor qilish serverda bor edi, ekranda tugmasi yo'q edi; sabab ixtiyoriy edi.
- Kvitansiyaning tizim raqami (`R-2026-…`) PDF birinchi marta ochilganda yaratilardi, shuning uchun raqam bo'yicha qidirib bo'lmasdi. Yil jarayon vaqt zonasi bo'yicha olinardi (Railway'da UTC), keyingi raqam esa kompaniya bo'yicha eng kattasidan — `receiptCode` esa butun jadval bo'yicha unique edi.
- «Guruh» ustuni o'quvchining HOZIRGI guruhini ko'rsatardi: o'tgan oydagi to'lov bugungi guruh bilan chiqardi.

Yangi sahifadagi har qator uchun «pul nimaga ketdi» ham ko'rsatilishi kerak. Bu raqam «Umumiy ma'lumotlar»dagi «Kassaga tushdi» kartasi bilan bir xil bo'lishi shart: ikki joyda ikki xil hisob bo'lsa, CEO qaysi biriga ishonishini bilmaydi (ADR-0067).

## Qaror (CEO, 11.10.2026)

1. **Har to'lovning qismlari kassa dvigatelining o'zidan olinadi.** Qayta o'ynash halqasi `getIncomeMonthAttribution`dan sof funksiyaga ko'chdi: `attributeIncome` (`common/finance/income-attribution.ts`). U davr yig'indisini ham, har to'lov bo'yicha qismlarni ham (`byPayment`: shu oy / oldindan / eski qarz, oyma-oy) bitta o'tishda qaytaradi; `loadAttributionRows` kerakli qatorlarni o'qiydi. `getIncomeMonthAttribution` shu ikkalasini chaqiradi va javobi bir so'm ham o'zgarmaydi; yangi sahifa ham shularni chaqiradi — ikkinchi dvigatel yo'q. Tenglik testi bilan qotirilgan: bir chaqiruvda Σ `byPayment` = `currentMonth`, `advance`, `late[]` (oyma-oy); shuning uchun «Bu oy»da filtrsiz jadval qatorlarining qismlari yig'indisi kartaning uch raqamiga teng. Qismlar tanlangan davr OXIRIGA nisbatan hisoblanadi (ADR-0067), shuning uchun bitta to'lov yorlig'i davrga qarab o'zgaradi: «Bu hafta»da «Oldindan (balansda)», «Bu oy»da «Oktabr to'lovi». Yorliq qoidasi serverda (`payments/list/part-labels.ts`): davr bitta oy ichida bo'lsa «{Oy} to'lovi», aks holda «Shu davr to'lovi»; davr oyning oxirgi kunida tugasa «{Keyingi oy} uchun oldindan», aks holda «Oldindan (balansda)»; eski qarz — «{Oy} qarzi». Dvigatel har HTTP so'rovda bir marta chaqiriladi va natija so'rov ichida qayta ishlatiladi; kesh qo'yilmaydi.
2. **«Guruh» — to'lov kunidagi guruh.** To'lovning Toshkent kunida biror lahzada ACTIVE bo'lgan yozilishlar (`payments/list/payment-day-groups.ts`: `activeOnDay`, `groupIdsOnDay`). Holat `EnrollmentStateLog`dan o'qiladi va logning ikki uchi ketganlar o'quvchisidagi kabi to'ldiriladi: `supplyOpeningRow` ham, `supplyClosingRow` ham. O'chirilgan guruh `deletedAt` lahzasida yopiladi: u o'chirilishdan oldingi kunlardagi to'lovda ko'rinadi, keyin ko'rinmaydi. O'chirilgan guruh qatorda, oynada va Excel'da ko'rinadi, lekin filtr variantlariga kirmaydi. Bir nechta guruh bo'lsa — hammasi. Guruh, ustoz va kurs filtrlari shu qoida bo'yicha; ustoz va kurs — guruhning hozirgisi. Arxivlangan o'quvchi ham ro'yxatga kiradi, chunki dvigatel uning to'lovini ham «Kassaga tushdi»ga qo'shadi; aks holda karta va qatorlar qo'shilmasdi. «Oxirgi to'lovlar» («Umumiy ma'lumotlar») hozirgi guruhda qoladi.
3. **Kvitansiyaning tizim raqami to'lov yozilganda beriladi.** `ReceiptCodeListener` `payment.received` hodisasini tinglab, commit'dan keyin `allocatePaymentReceiptCode`ni chaqiradi (`receipts/receipt-code.ts`). Raqam pul tranzaksiyasining ICHIDA berilmaydi: bir vaqtdagi ikki to'lov raqam uchun to'qnashsa, to'lovning o'zi (yoki Payme/Click javobi) rad etilib qolardi. Yil — to'lov `createdAt`ining TOSHKENT yili; keyingi raqam — shu yilning (`R-{yil}-`) butun jadval bo'yicha eng katta kodidan keyingisi (unique ham global); o'zining Serializable tranzaksiyasida, to'qnashuvda 3 martagacha qayta uriniladi. PDF yo'li (`ensurePaymentReceiptCode`) zaxira bo'lib qoladi va shu funksiyani chaqiradi. Qaytarish hujjati (`Q-…`) ham Toshkent yiliga va global raqamga o'tdi; uning berilish vaqti (PDF ochilganda) o'zgarmadi. Eski to'lovlarga raqamni bir martalik skript beradi.
4. **Odam bekor qilganda sabab majburiy.** `POST /payments/:id/reverse` tanasi `ReversePaymentDto { reason }` (bo'sh bo'lmasin, 500 belgigacha) va xizmatda ham: chaqiruvchi odam (`performedById`) bo'lsa va sabab bo'sh bo'lsa — 400 «Bekor qilish sababini yozing». Tizim chaqiruvlari (Payme `CancelTransaction`) istisno va o'z sababi bilan ishlaydi. Qoida o'zgarmadi: pul darslarga sarflangan bo'lsa bekor qilib bo'lmaydi; faqat matn o'zbekchalandi: «To'lov allaqachon darslarga sarflangan — bekor qilib bo'lmaydi. Pulni o'quvchiga «Pul qaytarish» orqali qaytaring.» Bekor qilish tugmasi endi to'lov oynasida, faqat `money.undo` egasiga (sukut bo'yicha CEO). Payme bekor qilishining sababi (`reversalReason`) «Payme to'lovni bekor qildi» deb o'qiladi.
5. **Tuzatish yagona ustun bilan bog'lanadi.** `Payment.correctsPaymentId` (unique, o'z-o'ziga relation) — YANGI to'lovda eski to'lovning id'si. `PaymentsWriteService.create` ichki `options.correctsPaymentId` oladi (DTO'da yo'q, tashqaridan yuborib bo'lmaydi); `correctAmount`ning qayta yozuvi uni beradi va bog'lanish yangi to'lov bilan bitta tranzaksiyada yoziladi. Eski tuzatishlarni `scripts/link-payment-corrections.ts` bir marta bog'laydi; bog'lab bo'lmaganlari oddiy «bekor qilingan» bo'lib qoladi. Izoh matnidan taxmin qilish YO'Q.
6. **Ikki endpoint olib tashlandi, ikki eski manzil yo'naltiriladi.** `GET /reports/student-payments` va `GET /payments/pending-students` o'chirildi (`GET /reports/student-payments/filter-options` qoldi — «Ketgan o'quvchilar» o'qiydi). `/reports/student-payments` → `/payments/list` (sana va filtrlar tarjima qilinadi), `/payments/pending` → `/payments/debt`: «Kutilyotgan to'lovlar» aslida qarzdorlar ro'yxati edi, shuning uchun «To'lovlar»ga emas, «Qarzdorlik»ka olib boradi.

Sahifaning o'qishlari `payments.view` (sukut bo'yicha CEO, filial direktori, administrator, kassir); yig'ma karta `reports.finance` (CEO, filial direktori); «Tuzatish» `payments.correct`; «Bekor qilish» `money.undo`. Besh yangi yo'l (`/payments/list/rows`, `rows/:id`, `summary`, `excel`, `filter-options`) `@BranchScope()` bilan: filial — tepadagi tanlovdan, bo'sh qamrov hech narsa o'qimaydi (ADR-0081).

## Taqiqlanadi

- «Nimaga ketdi» qismlarini `attributeIncome`dan boshqa joyda hisoblash — mijozda ham, ikkinchi qayta o'ynashda ham. `ledger-replay.ts` (profildagi «To'lovlar qayerga ketdi») bilan birlashtirilmaydi: u boshqa savolga javob beradi.
- Tuzatishni izoh matnidan o'qish yoki taxmin qilish; bog'lanish faqat `correctsPaymentId` ustunidan.
- Kvitansiya raqamini pul tranzaksiyasi ichida berish.
- `new Date().getFullYear()` bilan kvitansiya yilini olish; yil faqat Toshkent bo'yicha.
- Summa va jamilarga REVERSED to'lovni qo'shish; har qanday jami faqat COMPLETED'ni sanaydi.

## Ko'rib chiqilgan muqobillar

- **Qismlarni to'lov KUNIDAGI holat bo'yicha** hisoblash. CEO rad etdi: qatorlar yig'indisi «Kassaga tushdi» kartasi bilan qo'shilmasdi.
- **Kodni pul tranzaksiyasi ichida berish.** To'qnashuv to'lovni rad ettirardi; raqam bir necha millisekund keyin berilishi arzonroq.
- **Postgres sequence.** Yillik qayta boshlanish yo'qoladi (Toshkent yili bo'yicha har yangi yilda 00001 dan).
- **Tuzatishni matndan o'qish.** Izoh tahrirlanadi, matn o'zgaradi; ishonchsiz.
- **Natijani keshlash.** Qismlarni nafaqat to'lov, balki har ledger qatori (oy hisobi, tuzatish yozuvi, pul qaytarish, dars puli qaytishi) o'zgartiradi; `payment.received` / `payment.reversed` bo'yicha tozalanadigan kesh eskirgan bo'linishni ko'rsatardi. Sekinlik o'lchansa — kalitga kompaniyaning eng oxirgi `Transaction` yozuvi qo'shilgan Redis keshi (kod izohida `ponytail:`).

## Oqibatlar

- Bitta to'lovning yorlig'i tanlangan davrga qarab o'zgarishi mumkin; oyna buni «Tanlangan davr … oxiriga ko'ra» deb yozadi, qo'llanma misol bilan tushuntiradi.
- Dvigatel ledger'dagi PAYMENT qatorini davr va filial bo'yicha sanaydi, ro'yxat esa `Payment` qatorini. Ikkisi farq qilsa (ledger yozuvi `paymentId`siz, yozuvlar kun chegarasining ikki tomonida, ledger filiali to'lov filialidan boshqa) qator «—» ko'rsatadi va karta bilan qatorlar farqi o'sha summaga teng. Buni G1 auditi (`scripts/audit-finance-reconciliation.ts`) ushlaydi.
- Kvitansiya raqami bir necha millisekund kechikib beriladi; tinglovchi yiqilsa raqam PDF ochilganda yoki skript qayta ishga tushganda beriladi, shu orada qidiruv uni topmaydi.
- Kodlar xronologik emas: eski to'lovlarga skript ularni mavjud kodlardan keyin beradi, PDF orqali ochilish tartibida berilganlar o'z joyida qoladi.
- Bog'lanmagan eski tuzatishlar oddiy «bekor qilingan» bo'lib ko'rinadi (sababi bilan).
- Arxivlangan o'quvchi qatorida guruh odatda «—» (kartasi bilan arxivlangan yozilishlar sanalmaydi) va profilga havola yo'q.
- «Qabul qildi» yorlig'idagi rol bugungi rol: keyin lavozimi o'zgargan xodim yangi roli bilan ko'rinadi.
- Ustoz va kurs filtrlari guruhning hozirgi ustozi va kursi bo'yicha; to'lov kunidagi ustoz (`GroupTeacherHistory`) o'qilmaydi.
- **Deploy:** migratsiya (`correctsPaymentId`, `Transaction_paymentId_idx` — qo'shimcha, eski server bilan xavfsiz) birinchi; keyin server va mijoz BIRGA, chunki yangi server eski mijozning ikki sahifasi o'qiydigan ikki yo'lni olib tashlaydi; oxirida ikki skript — avval quruq, keyin `--apply --expect=<N>`: `backfill-payment-receipt-codes.ts`, `link-payment-corrections.ts`.
