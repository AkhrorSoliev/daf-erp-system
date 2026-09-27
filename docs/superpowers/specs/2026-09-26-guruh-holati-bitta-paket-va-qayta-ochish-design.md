# Guruh holati bitta paketda o'zgaradi; yopilgan guruh o'quvchilari bilan qayta ochiladi

**Sana:** 2026-09-26
**Holat:** Dizayn ma'qullangan (2026-09-26). Qayta ochish «Tugallangan» va
«Bekor qilingan» guruhlarga tegishli; xato xabari aniq o'zbekcha bo'ladi.
**Bog'liq:** ADR-0036 (yopilgan guruhda muzlatilgan yozilish ham yopiladi, PR #568),
guruhni o'chirish tranzaksiyasi (PR #561), o'chirish oynasi (PR #566).
**PR'lar:** ikkita. 1-qism (bitta paket) alohida PR, 2-qism (qayta ochish) uning
ustiga keyingi PR.

## Muammo

1. **Holat o'zgarishi bo'lib-bo'lib yoziladi.** `GroupsStatusService.changeStatus`
   avval `StatusHistory` ni yozadi, guruhni yangilaydi, `EntityHistory` ni yozadi
   va shundan keyingina, hech qanday tranzaksiyasiz,
   `StatusCascadeService.cascade('Group', ...)` ni chaqiradi. Kaskad o'rtasida xato
   bo'lsa (baza uzilishi, deploy qayta ishga tushishi), guruh `CANCELLED` yoki
   `COMPLETED` bo'lib qoladi, yozilishlar esa ochiq. Bitta yozilishning pul
   qaytarishi yiqilsa, u faqat logga yoziladi (`runMoneyStep` ning tranzaksiyasiz
   shoxi) va admin «muvaffaqiyatli» ko'radi.
2. **Tekshiruv eskirgan holatga qaraydi.** O'tishning to'g'riligi tranzaksiyadan
   tashqarida o'qilgan `group.statusEnum` bo'yicha tekshiriladi. Ikki admin bir
   vaqtda turli holat bossa, ruxsat etilmagan o'tish (masalan `CANCELLED → COMPLETED`)
   yozilib qolishi mumkin.
3. **Hodisa tranzaksiyadan oldin chiqadi.** `recordStatusChange`
   `entity.status.changed` ni darhol chiqaradi. Tinglovchilar tizim izohi va
   Telegram hisobotiga qator yozadi. Tranzaksiya bekor bo'lsa, ular «guruh
   tugallandi» deb yozib qo'ygan bo'ladi.
4. **Adashib yopilgan guruhni qaytarib bo'lmaydi.** `COMPLETED` va `CANCELLED`
   oxirgi holat (`status-transitions.ts`). O'quvchilarni yangi guruhga qo'lda
   qayta qo'shish kerak, «Bitirgan» bo'lganlarni birma-bir qaytarish kerak.

## Prod ma'lumoti (faqat o'qildi, 2026-09-26, faqat sonlar)

- Ishlayotgan (ACTIVE/PAUSED/FORMING) guruhlar: 47. Bitta guruhdagi ochiq
  (ACTIVE + FROZEN) yozilishlar: eng ko'pi 23, 95% guruhda 20 tagacha, o'rtacha 12,2;
  muzlatilganlar eng ko'pi 11.
- Guruh yopilishlari (`StatusHistory`): `CANCELLED` 14 (oxirgi 90 kunda 10),
  `COMPLETED` 8 (oxirgi 90 kunda 8).
- Shu paytgacha yopilgan eng katta guruhda jami 42 ta yozilish qatori bor edi.

## Kelishilgan qarorlar

- Paket yiqilsa, admin ko'radi: «Guruh holati o'zgarmadi, hech narsa saqlanmadi.
  Qayta urinib ko'ring.» Oddiy xatolar (ruxsat etilmagan o'tish va hokazo) hozirgidek
  o'z matni bilan chiqadi.
- «Tugallangan» ham, «Bekor qilingan» ham «Faol»ga qaytariladi, o'quvchilari bilan.
- Qaytadi: yopilish paytida guruhda bo'lganlar. Qaytmaydi: boshqa guruhda o'qiyotgan,
  chetlatilgan, arxivlangan yoki keyin qo'lda «Bitirgan» qilingan o'quvchi.
- Pul: qayta ochilgan kundan keyingi darslar uchun yechiladi (pastda batafsil).
- Kiritilmaydi: Telegram hisobotida «guruh qayta ochildi» qatori; guruhning tugash
  sanasini avtomatik o'zgartirish.

## 1-qism: bitta paket (PR 1)

### `GroupsStatusService.changeStatus`

1. Tranzaksiyadan tashqarida, hozirgidek: guruhni `companyId` bilan o'qish (404)
   va `assertCallerMayTouchGroup` (filial). Tranzaksiya ochishdan oldin tez rad etadi.
2. `at = new Date()` — guruhning `statusChangedAt`, yozilishlarning
   `statusChangedAt`, holat jurnali va pul qadamlari uchun BITTA vaqt.
3. `prisma.$transaction(async (tx) => ...)`, `Serializable`, `maxWait 15 000`,
   `timeout 60 000` — guruhni o'chirish bilan bir xil byudjet. Ichida:
   - guruh `tx` da qayta o'qiladi; o'tish shu joriy holat bo'yicha tekshiriladi
     (2-muammo);
   - `StatusHistoryService.changeStatus({ ..., tx })` — tekshiruv va `StatusHistory`;
   - `tx.group.update(...)`, `statusChangedAt: at`;
   - `EntityHistoryService.recordStatusChange({ ..., tx, deferredEvents })`;
   - `StatusCascadeService.cascadeGroupStatusChange(tx, { groupId, status, userId, at, deferredEvents })`.
4. Tranzaksiya muvaffaqiyatli tugagach, `deferredEvents` dagi hodisalar chiqariladi.
   Yiqilsa — hech biri chiqmaydi.
5. Xato: `HttpException` o'zgarishsiz o'tadi. Qolgan har qanday xato (Prisma
   `P2034` yozuv to'qnashuvi, `P2028` vaqt tugashi, ulanish uzilishi, kutilmagan xato)
   logga yoziladi va adashtirmaydigan xabar bilan qaytadi: qayta urinish mumkin
   bo'lganlari `409`, qolganlari `500`, matn bir xil.

### `StatusHistoryService.changeStatus`

Ixtiyoriy `tx` oladi va yozuvni o'sha mijoz orqali yozadi. Boshqa 11 ta chaqiruvchi
o'zgarmaydi.

### `EntityHistoryService.recordStatusChange`

Ixtiyoriy `deferredEvents?: EntityStatusChangedEvent[]` oladi. Berilsa, hodisa
chiqarilmaydi, ro'yxatga qo'shiladi; chaqiruvchi tranzaksiyadan keyin
`emitStatusChanged(...)` bilan chiqaradi. Bu `carriedOverSink` bilan bir xil naqsh
(to'lov → oylik ko'chirish hodisasi). Berilmasa — hozirgidek darhol chiqaradi.

### `StatusCascadeService`

- Yangi `cascadeGroupStatusChange(tx, params)`: `cascade()` dagi `Group` shoxi shu
  yerga ko'chadi va to'liq `tx` da ishlaydi — `CANCELLED`: ACTIVE va FROZEN → DROPPED;
  `COMPLETED`: ACTIVE → COMPLETED, FROZEN → DROPPED (ADR-0036), keyin avtomatik
  bitiruv. Pul qadamlari chaqiruvchining tranzaksiyasida, yiqilishi hammasini bekor
  qiladi (`runMoneyStep` ning `tx` shoxi). Bitiruvning `StatusHistory`,
  `EntityHistory` va `student.update` i ham `tx` da; bitiruv hodisasi `deferredEvents`
  ga tushadi.
- Yozilish sababi o'zgarmaydi: `Cascade: Group #<id> → <HOLAT>`. Uni yagona funksiya
  `groupClosingReason(groupId, status)` yozadi — 2-qism aynan shu matn bo'yicha
  qidiradi.
- `cascade()` endi faqat `'Branch' | 'Course' | 'Student'` oladi (tur darajasida).
  Guruh yozilishlarini tranzaksiyasiz yopadigan yo'l qolmaydi. Filial, kurs va
  o'quvchi kaskadlari hozirgidek: har yozilishning pul qadami o'z tranzaksiyasida,
  xatosi logga yoziladi, yuzlab yozilishli partiya bitta xato uchun to'xtamaydi.

### Hujjatlar

- ADR-0041: guruh holati bitta tranzaksiya (guruh uchun fail-closed, filial/kurs/
  o'quvchi uchun partiya chidamliligi saqlanadi), hodisalar tranzaksiyadan keyin.
  Raqam birlashtirish paytida `origin/main` ga qarab qayta tekshiriladi.
- `server/CLAUDE.md`: «Enrollment Lifecycle Prepaid Refund» (guruh bekor qilish
  tranzaksiyali ro'yxatga o'tadi), «Write Hooks», «Entity History» (tranzaksiyadagi
  `recordStatusChange` hodisasini keyinga qoldiradi).

### Testlar (TDD)

- `groups.service.spec.ts`: bitta `Serializable` tranzaksiya va limitlar; `prisma`
  da (tranzaksiyadan tashqarida) hech narsa yozilmaydi; o'tish `tx` dagi holat bilan
  tekshiriladi; `at` guruh va kaskadda bir xil; kaskad yiqilsa so'rov yiqiladi va
  hodisa chiqmaydi; muvaffaqiyatda hodisa tranzaksiyadan keyin chiqadi; `P2034` va
  kutilmagan xato o'zbekcha xabarga aylanadi, `BadRequestException` o'zgarmaydi.
- `status-cascade.service.spec.ts`: `cascadeGroupStatusChange` — CANCELLED/COMPLETED
  natijalari chaqiruvchining `tx` ida; pul qadamlari `tx` bilan, o'z tranzaksiyasi
  yo'q; pul qadami yiqilsa xato yuqoriga chiqadi; tarix yozuvlari `tx` bilan; bitiruv
  `tx` da va hodisasi keyinga qoldirilgan; eski `cascade('Group', ...)` testlari yangi
  metodga ko'chadi.
- `status-history.service.spec.ts`, `entity-history.service.spec.ts`: `tx` va
  `deferredEvents` yo'llari.

## 2-qism: yopilgan guruhni qayta ochish (PR 2)

### Qoida

- O'tishlar: guruh `COMPLETED → ACTIVE` va `CANCELLED → ACTIVE` (server va
  `client/src/lib/status-config.ts`). Yozilish o'tishlari xaritasiga tegilmaydi:
  kaskad yozilishni to'g'ridan-to'g'ri yozadi, xaritani kengaytirish esa boshqa
  eshiklarni ham ochib yuborardi.
- Qayta ochib bo'lmaydi: guruh filiali `ACTIVE` emas yoki kursi `ARCHIVED` bo'lsa
  (`400`, aniq matn bilan).
- **Qaytadiganlar ro'yxati** (`planGroupReopen`, oldindan ko'rish va qayta ochish
  uchun YAGONA manba): guruhning `deletedAt: null` yozilishlari, holati `COMPLETED`
  yoki `DROPPED`, `statusChangeReason = groupClosingReason(guruh, guruhning joriy
  holati)` va `statusChangedAt >= group.statusChangedAt` (guruhniki bo'sh bo'lsa,
  vaqt sharti qo'llanmaydi). Bu eski yopilishlarni (kaskad `now` i guruhnikidan
  keyin), yangilarini (bitta `at`) va ADR-0036 tuzatish skripti yopgan qatorlarni
  (xuddi shu sabab, vaqt `>=`) qamraydi. Vaqt sharti guruh ikkinchi marta yopilganda
  birinchi yopilishdan qolgan qatorlarni chetda qoldiradi.
- Har o'quvchi uchun:
  - o'chirilgan, `EXPELLED`, `ARCHIVED` yoki `INACTIVE` → qaytmaydi («guruhni tark etgan»);
  - boshqa guruhda ochiq (ACTIVE yoki FROZEN) yozilishi bor → qaytmaydi («boshqa guruhda»);
  - `GRADUATED`: shu yopilishdagi avtomatik bitiruv bo'lsa (sabab
    `Avtomatik: guruh tugallanganligi sababli`, `statusChangedAt` yopilishdan keyin)
    → qaytadi va o'quvchi `ACTIVE` bo'ladi; aks holda qaytmaydi;
  - `FROZEN` → yozilish `FROZEN` bo'lib qaytadi;
  - `ACTIVE` → yozilish `ACTIVE` bo'lib qaytadi.
- Prodda `Enrollment_studentId_groupId_key` yo'q (2026-09-27, faqat o'qildi): 103 ta
  o'quvchi–guruh juftligida bir nechta tirik qator bor, eng ko'pi 5 ta. Qaytish
  yopilishning o'zi yopgan qatorni qayta ochadi. Bitta o'quvchining shu yopilishda
  bir nechta qatori yopilgan bo'lsa, faqat eng yangisi qaytadi, qolganlari yopiq
  qoladi: aks holda `unique_active_enrollment_per_student` buzilardi. Boshqa
  guruhdagi faol qatorni «boshqa guruhda» qoidasi oldindan chetlaydi.

### Yoziladigan narsalar (1-qismdagi o'sha tranzaksiyada)

- Yozilish: `status`, `statusChangedAt: at`, `statusChangedById`,
  `statusChangeReason: "Guruh qayta ochildi"`; holat jurnaliga bitta qator.
- Tarix: o'quvchiga `GURUHGA_QOSHILDI`, guruhga `OQUVCHI_QOSHILDI`, ikkalasida
  `sabab: "Guruh qayta ochildi"` — tarix oynasi bu kodlarni allaqachon taniydi.
- Bitiruvni qaytarish: `StatusHistory` (`GRADUATED → ACTIVE`, sabab
  `Avtomatik: guruh qayta ochildi`), `EntityHistory` (`status` kalitlari bilan —
  bu o'quvchining o'z holati), `student.update` (`ACTIVE`, `isActive: true`);
  hodisa tranzaksiyadan keyin.
- Pul (faqat `ACTIVE` bo'lib qaytgan, kursi `MONTHLY` yozilish):
  - qayta ochilgan oy uchun `CHARGED` hisob bor (guruh shu oyda yopilgan) →
    `restoreChargeForReturn` — qayta ochilgan kundan KEYINGI darslar qayta yechiladi,
    muzlatishdan qaytgandagi kabi;
  - hisob yo'q (guruh oldingi oyda yopilgan) → `createChargeForEnrollment` yangi
    ixtiyoriy `fromDate` bilan: joriy oy hisobi 1-sanadan emas, qayta ochilgan
    kundan keyingi kundan boshlanadi. Aks holda kunlik qorovul (04:00) butun oyni,
    guruh yopiq turgan kunlarni ham yechardi.
  - `LESSON_PACK` va `FROZEN` qaytganlar: hech narsa. Yopilishda qaytarilgan pul
    balansda turadi, keyingi darsda odatdagidek yechiladi.

### Oldindan ko'rish

- `GET /groups/:id/reopen-preview` → `{ returning: { active, frozen }, notReturning: { inOtherGroup, left } }`,
  `planGroupReopen` bilan sanaladi. Rollar guruh CRUD bilan bir xil, filial
  `assertCallerMayTouchGroup`, route manifestga yoziladi (ADR-0003).
- Oyna: guruh `COMPLETED`/`CANCELLED` va tanlangan holat «Faol» bo'lsa, oldindan
  ko'rsatadi: «18 ta o'quvchi qaytadi (2 tasi muzlatilgan). 2 tasi qaytmaydi:
  boshqa guruhda o'qiyapti.» Matn sof funksiyada (`group-reopen-copy.ts`) va
  vitest bilan tekshiriladi; so'rov yiqilsa, oyna son yo'q umumiy ogohlantirish
  ko'rsatadi.

### Hujjatlar

- ADR-0040: yopilgan guruh qayta ochiladi; qaytadiganlar yopilishning o'z belgisi
  (sabab + vaqt) bo'yicha topiladi, sxema o'zgarmaydi; pul qoidasi.
- `server/CLAUDE.md`: «Closing a group…» bandi yonida qayta ochish; «Write Hooks».

### Testlar (TDD)

- `planGroupReopen`: har bir holat va chekka holat (boshqa guruhda ACTIVE/FROZEN,
  chetlatilgan, arxiv, o'chirilgan, avtomatik va qo'lda bitirgan, muzlatilgan,
  ikkinchi yopilishdan qolgan qator, boshqa sabab bilan yopilgan qator).
- Qayta ochish: yozilishlar, jurnal, tarix, bitiruvni qaytarish `tx` da; pul — shu
  oyda yopilgan (`restoreChargeForReturn`), oldingi oyda yopilgan (`fromDate` =
  ertasi kun), `LESSON_PACK` va `FROZEN` da yo'q; filial/kurs to'sig'i.
- `monthly-charge.service.spec.ts`: `fromDate` qamrovni o'sha kundan boshlaydi.
- `status-transitions.spec.ts`, controller va route manifest testlari, client
  vitest (`group-reopen-copy`).

## Chegaralar (bu ishga kirmaydi)

- Filial yopilishi, kurs arxivlanishi va o'quvchi kaskadlari o'zgarmaydi.
- Filial yoki kurs kaskadi yopgan guruh qayta ochilsa, hech kim qaytmaydi (sabab
  boshqa); oldindan ko'rish buni «0 ta» deb ko'rsatadi. Filial/kurs to'sig'i odatiy
  holatni yopadi; prodda bunday guruh yo'q.
- Telegram hisobotida qayta ochish qatori yo'q. Shu kuni tugallanib qayta ochilgan
  guruhning «bitirdi» qatorlari 20:00 hisobotida qolishi mumkin.
- Guruhning tugash sanasi o'zgarmaydi: o'tib ketgan bo'lsa, davomat uchun uni
  tahrirlash kerak.
- Muzlatishdan keyingi oyda qaytgan o'quvchining oylik hisobi (butun oy yechilishi
  gumoni) — alohida vazifa sifatida belgilandi.

## Saytga chiqarish tartibi

Migratsiya yo'q. Avval server, keyin client: yangi client eski serverda «Faol»ni
tanlasa, server `400` bilan rad etadi — zararsiz. Deploy qo'lda, bu ish deploy
qilmaydi.

## Tekshiruv

Server: `npm test`, `npm run typecheck`, `npx eslint src`. Client: `npx vitest run`,
`npx tsc --noEmit`, `npx eslint src`, `npm run build`.
