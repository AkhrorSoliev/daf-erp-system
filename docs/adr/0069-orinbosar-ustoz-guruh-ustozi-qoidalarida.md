# ADR-0069 — O'rinbosar ustoz guruh ustozi qoidalariga bo'ysunadi: o'qituvchi roli, guruh filiali, ish haqi stavkasi

**Holati:** Qabul qilindi
**Sana:** 2026-10-03
**Bog'liq:** `server/src/lesson-teacher-overrides/lesson-teacher-overrides.service.ts`, `server/src/groups/shared/teacher-assignment.ts`, `server/src/groups/groups-write.service.ts`, `server/src/common/auth/group-branch-scope.ts`, `server/src/common/auth/branch-route-policy.ts`, ADR-0003, ADR-0050

## Kontekst

O'rinbosar ustoz (`LessonTeacherOverride`) bir kunlik darsni boshqa ustozga
beradi. Bu faqat jadvaldagi ism emas: tayinlanganda yoki olib tashlanganda
o'sha kun darsining ish haqi yozuvlari (`SalaryAccrual`) eski ustozdan
qaytarilib, yangisiga yoziladi. Demak bu yozuv kim pul olishini hal qiladi.

Guruhning o'z ustozini tayinlashda (`GroupsWriteService.create` / `update`)
uchta qoida bor edi: tanlangan xodim o'qituvchi, guruh filialidan, ish haqi
stavkasi bor. O'rinbosarda esa faqat xodim mavjudligi tekshirilardi. Stavkasiz
ustoz o'rinbosar bo'lsa, `createAccrual` hech narsa yozmaydi va bu dars uchun
unga haq yo'qoladi; yopilgan davrga stavkani orqaga qo'yib bo'lmaydi.

Darsni bekor qilish va ko'chirish chaqiruvchini guruh filiali bo'yicha
tekshiradi (`assertCallerMayTouchGroup`). O'rinbosar ham o'sha darsning pulini
o'zgartiradi, shuning uchun u ham shu qoidaga kirishi kerak.

## Qaror

1. **O'rinbosarni tayinlash, olib tashlash va ro'yxatini ko'rish** guruh
   filiali bo'yicha cheklanadi — bekor qilish va ko'chirish bilan bitta
   qoida (`assertCallerMayTouchGroup`): sof o'qituvchi faqat o'z guruhini
   ko'radi, qolganlar faqat o'z filiali guruhini. Uchta route
   `branch-route-policy.ts` da darslar blokiga o'tkazildi.
2. **O'rinbosar uchun guruh ustozining qoidalari amal qiladi:**
   - **O'qituvchi roli bor** xodim bo'lishi kerak (guruh tahriri ham shuni
     talab qiladi). Darsni administrator o'tsa, unga avval O'qituvchi roli
     beriladi.
   - **Boshqa filialga biriktirilgan** ustoz rad etiladi; filiali hali
     biriktirilmagan ustoz o'tadi (guruh tahriri bilan bir xil).
   - **Faol ish haqi stavkasi bo'lishi** shart.
3. Filial va stavka tekshiruvi bitta joyda —
   `groups/shared/teacher-assignment.ts` (`assertTeachersInGroupBranch`,
   `assertTeachersHaveRate`). Guruh yaratish/tahriri va o'rinbosar shu
   funksiyalarni chaqiradi; ikkinchi nusxa yozilmaydi.

## Oqibatlar

- Stavkasi yo'q ustozni o'rinbosar qilib bo'lmaydi: avval stavka qo'yiladi.
  Bu yangi cheklov — ilgari tayinlash o'tardi, lekin ustozga haq yozilmasdi.
- Mavjud o'rinbosar yozuviga tegilmaydi. Faqat uni qayta saqlashda (sababini
  o'zgartirish ham) yangi qoidalar tekshiriladi.
- O'rinbosarni olib tashlash guruhning o'z ustozlariga qaytaradi; ular guruh
  tahririda tekshirilgan, shuning uchun olib tashlashda ustoz qoidalari
  qayta tekshirilmaydi, faqat chaqiruvchining filiali.

## Ko'rib chiqilgan va rad etilgan

- **Faqat chaqiruvchi filialini tekshirish, ustozni tekshirmaslik.** Stavkasiz
  o'rinbosarning haqi jimgina yo'qolishi ochiq qolardi.
- **Stavka o'rniga ogohlantirish.** Haq yozilmasligi orqaga tuzatilmaydi;
  tayinlash — buni to'xtatishning oxirgi joyi.
- **Boshqa filial ustozini o'rinbosar qilishga ruxsat berish.** Darsning haqi
  guruh filiali hisobiga yoziladi; boshqa filial ustozi bu filial oyligiga
  tushib qolardi (D6).
