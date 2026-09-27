# ADR-0039 — Guruh holati bitta tranzaksiyada o'zgaradi: yo hammasi, yo hech narsa

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0036, `server/src/groups/groups-status.service.ts`, `server/src/common/status/status-cascade.service.ts` (`cascadeGroupStatusChange`), `server/src/common/entity-history/entity-history.service.ts` (`deferredEvents`), guruhni o'chirish tranzaksiyasi (`GroupsWriteService.delete`)

## Kontekst

`GroupsStatusService.changeStatus` guruhni `CANCELLED` yoki `COMPLETED` qilganda
avval `StatusHistory` ni yozar, guruhni yangilar, `EntityHistory` ni yozar va
shundan keyingina, tranzaksiyasiz, `StatusCascadeService.cascade('Group', ...)`
ni chaqirardi. Kaskad o'rtasida xato bo'lsa (baza uzilishi, deploy qayta ishga
tushishi) guruh yopiq, yozilishlar ochiq qolardi. Bitta yozilishning pul
qaytarishi yiqilsa, u faqat logga yozilardi va admin «muvaffaqiyatli» ko'rardi.

Yana ikki nuqson bor edi. O'tish tranzaksiyadan tashqarida o'qilgan holat
bo'yicha tekshirilardi: ikki admin bir vaqtda bossa, ruxsat etilmagan o'tish
yozilib qolishi mumkin edi. `recordStatusChange` esa `entity.status.changed`
ni darhol chiqarardi: tizim izohi va Telegram hisobotidagi qator bekor
bo'lgan o'zgarish uchun ham yozilardi.

Guruhni o'chirish allaqachon bitta Serializable tranzaksiya edi (maxWait 15 s,
timeout 60 s). Prod (2026-09-26, faqat o'qildi): 47 ta ishlayotgan guruh, bitta
guruhda ochiq yozilishlar eng ko'pi 23 (95% guruhda 20 tagacha); oxirgi 90
kunda guruh 18 marta yopilgan.

## Qaror

1. Guruh holatini o'zgartirish bitta Serializable tranzaksiya: guruh qayta
   o'qiladi va o'tish shu holat bo'yicha tekshiriladi, `StatusHistory`,
   guruhning `EntityHistory` si, yozilishlarni yopish (pul qaytarish, holat
   jurnali, tarix yozuvlari), avtomatik bitiruv va guruh qatori. maxWait 15 s,
   timeout 60 s — guruhni o'chirish bilan bir xil.
2. Tranzaksiya ichidagi `recordStatusChange` hodisasini `deferredEvents` ga
   qo'yadi; hodisalar faqat tranzaksiya tasdiqlangandan keyin chiqadi.
3. Yiqilsa, admin «Guruh holati o'zgarmadi, hech narsa saqlanmadi. Qayta urinib
   ko'ring.» ko'radi: `P2034` (yozuv to'qnashuvi) va `P2028` (tranzaksiya vaqti
   tugagan) — 409, qolgan xato — 500 va logga yoziladi. `HttpException` o'z
   matni bilan o'tadi.
4. Filial, kurs va o'quvchi kaskadlari o'zgarmaydi: har yozilishning pul qadami
   o'z tranzaksiyasida, xatosi logga yoziladi. `cascade()` endi `'Group'` ni
   qabul qilmaydi.

**Taqiqlanadi:**
- guruh yozilishlarini guruh holati o'zgarishidan alohida, tranzaksiyasiz
  yopish;
- tranzaksiya ichida `recordStatusChange` ni `deferredEvents` siz chaqirish:
  hodisa tranzaksiya bekor bo'lishidan oldin chiqib ketadi.

## Ko'rib chiqilgan muqobillar

- **Kaskadni tashqarida qoldirib, yiqilganda qayta urinish yoki tuzatuvchi
  cron.** Oraliq holat baribir hisobotlar va oyliklarga ko'rinadi, qaysi qadam
  o'tgani esa har safar alohida aniqlanishi kerak.
- **Filial va kurs kaskadlarini ham bitta tranzaksiyaga o'tkazish.** Filial
  yopilishi yuzlab yozilishni qamraydi: 60 s ga sig'masligi mumkin, bitta
  yomon yozilish butun filialni yopishni to'xtatadi. Guruh — 23 tagacha.
- **Hodisani darhol chiqarib, tinglovchilarni rollback'ga chidamli qilish.**
  Har tinglovchi buni o'zi eslashi kerak edi; bittasi unutsa, soxta izoh.
- **P2034 da avtomatik qayta urinish.** Guruh holati oyiga ~6 marta
  o'zgaradi, to'qnashuv ehtimoli juda kichik; admin qayta bosadi.

## Oqibatlari

**Yutuq:** yopilgan guruhda ochiq yozilish qolmaydi; bekor bo'lgan o'zgarish
uchun izoh ham, Telegram qatori ham yozilmaydi; bir vaqtdagi ikki o'zgarishdan
ikkinchisi to'g'ri xato oladi. Javobdagi o'quvchilar soni yopilgandan keyingi
holatni ko'rsatadi.

**Narx:**
- Bitta yozilishning pul qaytarishi yiqilsa, guruh holati umuman o'zgarmaydi.
  Admin qayta urinadi; xato takrorlansa, sababi logda.
- Tranzaksiya guruh o'quvchilarining balans qatorlarini 60 s gacha ushlab
  turishi mumkin: shu paytdagi davomat yoki to'lov kutadi yoki to'qnashuv
  bilan qaytadi.
