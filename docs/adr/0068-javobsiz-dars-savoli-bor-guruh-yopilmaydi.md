# ADR-0068 — Javobsiz «Dars bo'ldimi?» savoli bor guruh yopilmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-03
**Bog'liq:** ADR-0054 («Dars bo'ldimi?»), ADR-0053 (bekor qilingan dars puli), ADR-0060 (sinov darsi javobni kutadi), ADR-0041 (guruh holati bir tranzaksiyada), `server/src/unmarked-lessons/unanswered-lessons.ts`, `server/src/common/status/status-cascade.service.ts` (`groupsCancelledBy`)

## Kontekst

ADR-0054 bo'yicha davomati olinmagan dars tugaganda «Dars bo'ldimi?» savoli
ochiladi va filial administratorlariga topshiriq beriladi. Savol faqat faol
guruhlarga ochiladi. Guruh o'chirilsa, uning ochiq topshiriqlari yopiladi.
Lekin guruh «Tugallangan» yoki «Bekor qilingan» bo'lganda savolga hech narsa
bo'lmasdi: topshiriq administratorlarda turaverardi.

02.10.2026 da Farg'ona #011 guruhining 02.10 darsi uchun savol soat 15:00 da
ochildi. 15:09 da guruh «Tugallangan» qilindi. Topshiriq 5 administratorning
/tasks sahifasida qoldi. CEO buni «yopilgan guruh topshiriqlarda chiqmoqda» deb
aytdi.

Savol bo'sh emas edi. Oylik to'lovda oy puli oldindan yoziladi: 6 o'quvchidan
02.10 darsi uchun 34 620 so'mdan, jami 207 720 so'm olingan. Guruhda 28.09 dan
keyin davomat yo'q, 30.09 darsi bekor qilingan. Dars bo'lmagan bo'lsa,
«Bo'lmadi → Bekor qilish» javobi bu pulni qaytaradi (ADR-0053). Topshiriqni
shunchaki yopsak, pul o'quvchilarga qaytmasdi.

## Qaror

1. Guruhni «Tugallangan» yoki «Bekor qilingan» qilishdan oldin uning barcha
   «Dars bo'ldimi?» savollariga javob berilgan bo'lishi kerak. Javobsiz savol
   bo'lsa, tizim rad etadi: «Avval «Dars bo'ldimi?» savoliga javob bering:
   02.10 (#011). Javob berilmagan darsi bor guruhni yopib bo'lmaydi.» Ko'pi
   bilan 5 ta dars nomlanadi, qolgani soni bilan aytiladi.
2. Filialni yopish (CLOSED, ARCHIVED) va kursni arxivlash ham guruhlarni bekor
   qiladi. Ularga ham shu tekshiruv qo'llanadi. Tekshiruv kaskad bekor
   qiladigan guruhlarning o'zini o'qiydi: ular bitta joyda aniqlanadi
   (`groupsCancelledBy`), kaskad ham shuni ishlatadi.
3. Guruhning o'z holati o'zgarganda tekshiruv o'sha Serializable tranzaksiya
   ichida o'qiladi (ADR-0041). Shu payt ochilgan savol tranzaksiya bilan
   to'qnashadi va ikkalasidan bittasi bekor bo'ladi. Filial va kurs yo'lida
   tranzaksiya yo'q, shuning uchun tekshiruv birinchi yozuvdan oldin qilinadi.
4. Vaqtincha to'xtatish tekshirilmaydi: guruhni «Pauza» qilish va filialni
   nofaol qilish. Guruh qaytishi mumkin, savol ochiq qoladi va unga javob berish
   mumkin.
5. Guruhni o'chirish o'zgarmaydi: ADR-0054 bo'yicha uning ochiq topshiriqlari
   yopiladi.

## Oqibatlar

- Administrator guruhni yopishdan oldin savolga javob beradi. «Bo'ldi» javobi
  davomatni yozadi. «Bo'lmadi» javobi darsni bekor qiladi va pulni qaytaradi.
  Shunda pul to'g'ri qoladi.
- #011 dagi 02.10 savoliga Farg'ona administratorlarining o'zi javob beradi
  (CEO qarori, 03.10.2026). Yopilgan guruhning savoliga javob berish ishlaydi:
  «Bo'ldi» ham, bekor qilish ham guruh holatini tekshirmaydi.
- Filial yopilayotganda tekshiruv bilan kaskad orasidagi bir necha soniyada
  ochilgan savol bekor qilingan guruhda qoladi. Filial juda kam yopiladi; bu
  ma'lum kamchilik.
- Holat oynasi server matnini ko'rsatadi, saytda o'zgarish yo'q.
