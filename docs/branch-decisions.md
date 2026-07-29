# Filial modeli — CEO qarorlari

**Sana:** 2026-07-29 · **Kontekst:** filial #2 "Namangan filiali" ishga tushirilmoqda.
Bog'liq: [branch-readiness-issues.md](branch-readiness-issues.md) (106 muammo auditi), [branch-action-plan.md](branch-action-plan.md) (bajarish rejasi), [branch-finance-split-plan.md](branch-finance-split-plan.md) (eski, moliya bo'yicha reja).

Bu qarorlar **majburiy qoida** — kodni shu qoidalarga moslashtiramiz, teskarisi emas.

---

## D1 — Ustoz qo'shish filial bo'yicha

Ustoz ikki yo'l bilan qo'shiladi:
1. CEO admin panelda o'zi qo'shadi;
2. Telegram bot havolasi orqali ro'yxatdan o'tadi.

**Har bir filialning o'z havolasi bo'ladi**, va o'sha havola orqali kirgan ustoz avtomatik o'sha filialga tegishli bo'ladi.

## D2 — Filiallararo pul yo'q

Bir filialda to'langan pul **hech qachon** boshqa filialning qarzini yopmaydi, boshqa filialning darsini qoplamaydi va boshqa filialning kitobiga tushmaydi.

## D3 — Oylik darsning ortidan yuradi

Har bir darsning ustoz haqi **o'sha dars o'tilgan guruhning filialiga** yoziladi.

## D4 — Umumiy xarajat degan tushuncha yo'q

**Har bir xarajat aniq bitta filialga tegishli.** Kompaniya darajasidagi ("markaz") xarajat mavjud emas. Har bir filial o'z foydasini **o'z tushumi − o'z xarajati − o'z oyligi** formulasi bilan hisoblaydi.

## D5 — O'quvchi bir vaqtda faqat bitta filialda

O'quvchi **aynan bitta** filialga tegishli. Boshqa filialga o'tishi mumkin, lekin bir vaqtning o'zida ikki filialga tegishli bo'la olmaydi.

## D6 — Ustoz ham faqat bitta filialda

Ustoz **aynan bitta** filialga biriktiriladi va faqat o'sha filial guruhlarida dars beradi.

> **Natija:** D3 va D6 birga bo'lgani uchun ustozning butun oyligi bitta filial xarajati bo'ladi. Ya'ni bitta oylik to'lovini ikki filial o'rtasida bo'lish **kerak emas** — bu rejadagi eng og'ir texnik ishni (SalaryPayment ni filiallarga bo'lish) butunlay olib tashlaydi.

## D7 — O'quvchini filialdan filialga ko'chirish funksiyasi hozircha kerak emas

Ko'chirish oqimi qurilmaydi. Tizim faqat "bitta o'quvchi = bitta filial" qoidasini **majburiy qilib** turadi.

> **Natija:** balans/qarz/oldindan to'langan darslar ko'chishi bo'yicha qoida yozish shart emas. Kerak bo'lganda alohida ish sifatida qilinadi.

## D8 — Umumiy xarajatni CEO qo'lda bo'ladi

Ikkala filialga tegishli xarajat (masalan umumiy reklama) **ikki alohida qator** bo'lib kiritiladi, nisbatni CEO o'zi belgilaydi. Tizim faqat filialni majburiy qiladi, avtomatik bo'lish qilmaydi.

---

## Qaror qabul qilingandan keyin qolgan savollar

| # | Savol | Tavsiya |
|---|---|---|
| 1 | `Administrator` roli hozir kompaniya darajasida — filialga cheklansinmi? | Ha. D4 bo'yicha auditga yaroqli filial P&L uchun har bir xodim bitta filialda bo'lishi kerak (CEOdan tashqari) |
| 2 | «Markaz qo'shimchasi» Namangan uchun qachondan boshlansin? | Filial ochilish sanasidan. Birinchi oyda Namangan katta zarar ko'rsatadi — bu haqiqat, yashirilmasin |
| 3 | Hozir umumiy kassada turgan tarix (4 ta refund −1 107 000 so'm, 2 ta oylik to'lovi) qaysi filialga yozilsin? | Filial 1 — o'sha paytda boshqa filial mavjud emas edi |
| 4 | Gateway komissiyasi va SMS xarajati hozir hech qayerda xarajat sifatida yozilmaydi — filial foydasiga kirsinmi? | Kirsin, lekin keyingi bosqichda |
| 5 | Click/Payme merchant hisobi bitta qolsinmi? | Qolsin. Kitobda ajratish baribir to'g'ri ishlaydi; alohida hisob faqat bank tomonida ajratish kerak bo'lsa zarur |
