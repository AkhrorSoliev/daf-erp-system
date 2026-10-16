# ADR-0093 — Lidning bitta egasi bor: xodim band qiladi, muddatda harakat qilmasa lid qaytadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0079, ADR-0083, ADR-0087, `docs/superpowers/specs/2026-10-16-admin-kpi-design.md`, `server/src/leads/ownership/`, `client/src/components/leads/ownership/`

## Kontekst

Adminlar KPI'si (spec, 4 bosqich) natijaga to'lanadi va har natijaning bitta
egasi bo'lishi kerak. Lidda egasi yo'q edi: 16.09–15.10.2026 da 535 lidning
174 tasi bilan 2–3 admin ishlagan, 265 aylanishning 183 tasida admin
yozilmagan. Har ishlaganga to'lash bitta natija uchun 2–3 marta pul chiqarardi.

## Qaror

1. `Lead.ownerId` — hozirgi egasi; `ownedAt` — egalik boshlangani;
   `ownerActedAt` — egasining oxirgi harakati. Tarix — `LeadOwnershipLog`
   (CLAIM / ASSIGN / RELEASE / EXPIRE) va lidning «Tarix» qatori.
2. `leads.claim` (standart Administrator) lidni band qiladi va o'z lidini
   bo'shatadi; `leads.assign` (standart Direktor; CEO har doim) bo'sh yoki band
   lidni boshqa xodimga beradi yoki egasini olib tashlaydi. Direktor — o'z
   filiali ichida. Band lidni boshqa xodim ololmaydi.
3. Chegara xodimning O'ZI band qilishini to'xtatadi: harakatsiz band lidlari
   soni `leads.maxUntouched` (standart 10 ta) chegarasiga yetgan xodim yangisini
   o'zi band qila olmaydi; rahbarning berishi (`leads.assign`) bu chegaraga
   qaramaydi.
   Birinchi harakat `leads.firstActionHours` (standart 2) ish soatida,
   keyingisi `leads.followUpDays` (standart 3) ish kunida. Uchala son
   standart qiymat: CEO ularni sozlamalarda o'zgartiradi. Ish vaqti du–sha
   08:00–18:00, bayramlar hisoblanmaydi. Muddat saqlanmaydi, har safar
   hisoblanadi.
4. Harakat — faqat egasining qo'ng'iroq belgisi, lidga izohi, lidga topshirig'i.
   Kartochkani surish yoki lidni tahrirlash harakat emas.
5. Muddat o'tsa, 15 daqiqalik tekshiruv lidni egasiz qiladi (EXPIRE, tizim
   nomidan), sobiq egasiga xabar boradi.
6. Qo'lda lid qo'shgan xodim (`leads.claim` bilan) uning egasi bo'ladi va
   qo'shish birinchi harakat sanaladi. O'quvchiga aylangan lidning egasi qotadi;
   arxivdan tiklangan lid egasiz qaytadi, faqat o'quvchiga aylangan (CONVERTED)
   holda tiklangan lid egasini saqlaydi.
7. Lid boshqa filialning doskasiga ko'chirilsa, egasi shu ko'chirish bilan
   birga olinadi (RELEASE, sabab «Boshqa filialga o'tkazildi»): egasi lid
   filialida ishlashi shart. O'quvchiga aylangan lidning egasi bu holda ham
   o'zgarmaydi.

## Ko'rib chiqilgan muqobillar

- **Natijani bosqichlarga bo'lish** (qo'ng'iroq / sinov / to'lov) — har
  bosqichni aniq yozish va «kim qildi» bahsi kerak; rad etildi.
- **Filial fondini ballga bo'lish** — admin oldindan qancha olishini
  bilmaydi, lid talashish kuchayadi; rad etildi.
- **Muddatni ustunda saqlash** — sozlama o'zgarsa eski lidlar eski muddatda
  qolardi; hisoblash arzon, saqlanmaydi.

## Oqibatlari

- 2-bosqich KPI'ni o'quvchining birinchi to'lovida shu egasiga yozadi.
- Bot orqali kelgan va hech kim band qilmagan lid egasiz qoladi — KPI yo'q.
- `leads.assign` Administrator va Kassirga berilmaydi (UNTESTED qulfi).
