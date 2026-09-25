# Guruhni o'chirish oynasi: nechta o'quvchi chiqariladi va sabab saqlanadi

**Sana:** 2026-09-26
**Holat:** Dizayn ma'qullangan (2026-09-26). Sabab bo'yicha A variant tanlandi:
ixtiyoriy qoladi va saqlanadi.
**Bog'liq:** PR #561 (guruh o'chirilganda yozilishlar yopiladi). Bu ish o'sha
tarmoq ustiga quriladi va u bilan birga saytga chiqadi.

## Muammo

PR #561 dan keyin guruhni o'chirish endi zararsiz "arxivga o'tkazish" emas:

- guruhdagi har bir ACTIVE va FROZEN yozilish DROPPED bo'ladi;
- ishlatilmagan darslar puli va oyning qolgan qismi balansga qaytadi;
- arxivdan tiklangan guruh bo'sh qaytadi, o'quvchilarni qo'lda qayta qo'shish kerak.

Oyna ([group-row-actions.tsx](../../../client/src/components/groups/group-row-actions.tsx))
esa faqat "«X» guruhini arxivga o'tkazilsinmi?" deydi. Ikki kamchilik bor:

1. **Son ko'rinmaydi.** Jadvaldagi `studentCount` faqat ACTIVE yozilishlarni
   sanaydi (`groupInclude._count`), `GET /groups/:id/students` ham shunday.
   Prodda o'chirilgan guruhlarda qolib ketgan yozilishlarning hammasi FROZEN edi
   (103 ta, ACTIVE 0 ta). Ya'ni aynan jadvalda ko'rinmaydigan o'quvchilar
   o'chirishdan zarar ko'radi.
2. **Sabab yo'qoladi.** Oynadagi "Sabab yozing (ixtiyoriy)..." maydoni serverga
   yuborilmaydi, server ham uni qabul qilmaydi.

## Yechim

### 1. Server: `GET /groups/:id/delete-preview`

- Javob: `{ active: number, frozen: number }`, ya'ni o'chirish yopadigan
  yozilishlar soni, holat bo'yicha.
- Sanash filtri o'chirishning o'z filtri: `liveEnrollmentsOfGroup(groupId)`.
  U `status-cascade.service.ts` da, `GROUP_DELETED_REASON` yonida turadi va
  `cascadeGroupDeletion` ham uni ishlatadi. Oynadagi son va yopiladigan
  yozilishlar soni bir manbadan olinadi.
- Ruxsat `DELETE /groups/:id` bilan bir xil: `@Roles('CEO', 'Branch Director',
  'Administrator')` va `assertCallerMayTouchGroup` (boshqa filial guruhi rad
  etiladi).
- Route manifesti (`branch-route-policy.ts`): `BRANCH_SCOPED_BY_ENTITY`,
  `GET /groups/:id/students` va `GET /groups/:id/status-history` qatorida.
- Guruh topilmasa yoki allaqachon o'chirilgan bo'lsa, 404 qaytadi.

### 2. Server: `DELETE /groups/:id` ixtiyoriy sabab oladi

- `DeleteGroupDto { reason?: string }`: `@IsOptional`, `@IsString`,
  `@MaxLength(500)`. So'rovda tana bo'lmasa ham ishlaydi (eski dastur versiyasi
  shunday yuboradi).
- Bo'sh yoki faqat bo'shliqdan iborat sabab "sabab yo'q" deb hisoblanadi.
- **Guruh tomonida:** `StatusHistory.reason` va `Group.statusChangeReason` ga
  sabab yoziladi, sabab bo'lmasa hozirgidek "O'chirildi". `EntityHistory` DELETE
  yozuviga `deletionReason` qo'shiladi, xuddi o'quvchini o'chirishdagidek.
- **O'quvchi tomonida:** "Guruh o'chirildi: <sabab>", sabab bo'lmasa hozirgidek
  "Guruh o'chirildi". Bu matn quyidagi joylarga yoziladi:
  - `Enrollment.statusChangeReason` (o'quvchi profilidagi yopilgan guruhlar,
    "Ketgan o'quvchilar" ro'yxati);
  - `EnrollmentStateLog.reason`;
  - o'quvchi va guruh tarixidagi `sabab`;
  - pul qaytarish yozuvlarining sababi.
- Javob xabari: o'quvchi chiqarilgan bo'lsa "Guruh o'chirildi, N ta o'quvchi
  guruhdan chiqarildi", aks holda hozirgidek "Guruh muvaffaqiyatli o'chirildi".
  Javob shakli o'zgarmaydi: `{ message }`.

### 3. Dastur: yangi oyna `group-delete-dialog.tsx`

- `group-row-actions.tsx` oynani o'zi chizmaydi, faqat chaqiradi.
- Oyna ochilganda `delete-preview` so'raladi. Javob kelguncha matn o'rnida
  skeleton turadi va "O'chirish" tugmasi bosilmaydi.
- Matn (2026-09-26 da ko'rsatilgan rasmdagidek):
  - sarlavha: "«<nom>» guruhini o'chirasizmi?";
  - o'quvchilar bo'lsa, qizil quti:
    - son qatori;
    - "Ular guruhdan chiqariladi, ishlatilmagan darslari puli balansiga qaytadi.";
    - "Guruhni arxivdan tiklasangiz ham o'quvchilar qaytmaydi.";
  - uning ostida maslahat: "O'quvchilar boshqa guruhda davom etishi kerak
    bo'lsa, avval ularni o'tkazing: o'quvchi sahifasi → «Guruhni o'zgartirish».";
  - guruh bo'sh bo'lsa: "Guruhda o'quvchi yo'q. Guruh arxivga o'tkaziladi."
- Son qatori alohida sof funksiyada (`group-delete-copy.ts`), to'rt holat bilan:
  - faqat faol: "Guruhda hali 5 ta o'quvchi bor.";
  - aralash: "Guruhda hali 7 ta o'quvchi bor (2 tasi muzlatilgan).";
  - faqat muzlatilgan: "Guruhda hali 3 ta muzlatilgan o'quvchi bor.";
  - bo'sh: qator yo'q.
- Son olinmasa (tarmoq xatosi, 404, server hali yangilanmagan) qizil qutida
  raqamsiz umumiy ogohlantirish chiqadi va o'chirish mumkin bo'lib qoladi.
- Sabab maydoni 500 belgigacha. Yozilgan bo'lsa `{ reason }` bo'lib yuboriladi.
- Muvaffaqiyat xabari serverdan kelgan `message`.

## Chegaralar (bu ishga kirmaydi)

- Arxivdagi "Qayta tiklash" oynasining matni o'zgarmaydi.
- O'quvchilarni guruhdan boshqa guruhga ommaviy o'tkazish tugmasi qo'shilmaydi.
- Sozlamalardagi sabablar ro'yxati (`StudentExitReason`) ishlatilmaydi: sabab
  erkin matn, guruh statusini o'zgartirishdagidek.
- Eski o'chirishlarni tuzatish skripti o'zgarmaydi: u hamon "Guruh o'chirildi"
  yozadi, chunki o'sha paytda sabab saqlanmagan.
- Ma'lumotlar modeli va pul hisobi o'zgarmaydi, shuning uchun ADR kerak emas.

## Saytga chiqarish tartibi

Avval server, keyin dastur. Teskari tartibda ham hech narsa buzilmaydi:

- yangi dastur + eski server: `delete-preview` 404 beradi va umumiy
  ogohlantirish chiqadi, sabab e'tiborsiz qoladi, o'chirish ishlaydi;
- eski dastur + yangi server: tanasiz `DELETE` ishlaydi, sabab "O'chirildi" /
  "Guruh o'chirildi".

Saytga chiqarish qo'lda qilinadi va bu ishning bir qismi emas.

## Tekshiruv

- **Server (jest):**
  - cascade: sababli va sababsiz matn, filtr bitta manbadan;
  - `delete`: sabab qayerga yozilishi, bo'sh sabab, javob xabari;
  - `delete-preview`: son, 404, boshqa filial rad etiladi;
  - controller: ruxsatlar, sabab uzatilishi;
  - `DeleteGroupDto` validatsiyasi;
  - route manifesti testi.
- **Server:** `npm test`, `npm run typecheck`, `npx eslint src`.
- **Dastur:** matn funksiyasi uchun vitest, `npx eslint src`, `npx tsc --noEmit`,
  `npm run build`.
