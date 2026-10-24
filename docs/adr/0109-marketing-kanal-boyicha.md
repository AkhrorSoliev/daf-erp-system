# ADR-0109: Marketing hisoboti kanal bo'yicha — xarajat kanalga bog'lanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** ADR-0067 (marketing ko'rsatkichlari birinchi to'lov bo'yicha), ADR-0094 (Xarajatlar sahifasi), lid manbalari (`LeadSource`)

## Kontekst

`/reports/marketing` hamma marketing xarajatini hamma yangi o'quvchiga bo'lib ko'rsatardi: «jalb qilish narxi», «samara» butun markaz bo'yicha. Biznes egasi esa kanal bo'yicha bilishi kerak: Instagramdan kelgan bitta o'quvchi qancha turdi, Telegram reklamasi o'zini oqladimi. «Manba bo'yicha» jadvali faqat lid va o'quvchi sonini ko'rsatardi — pul yo'q edi. Sabab: `Expense` xarajat qaysi kanal uchun ekanini bilmaydi (faqat `MARKETING` toifasi va matnli tavsif), shuning uchun sarfni kanalga bog'lab bo'lmasdi.

## Qaror

1. **Xarajat kanalga bog'lanadi:** `Expense.leadSourceId` (ixtiyoriy, `LeadSource` ga, `ON DELETE SET NULL`). Faqat `MARKETING` xarajati kanal ko'tara oladi: boshqa toifada kanal berilsa 400; toifa `MARKETING` dan boshqasiga o'zgarsa kanal olib tashlanadi. Kanal shu kompaniyaning o'chirilmagan lid manbasi bo'lishi shart. Bo'sh kanal = «Umumiy» (bitta kanal emas). Yangi kanal ro'yxati yo'q: lid manbalarining o'zi ishlatiladi, shunda lid ham, pul ham bitta ro'yxatga bog'lanadi.
2. **Kanal qatori — tanlangan oyda yozilgan lidlar kohorti** (lid funnelning o'z kohorti, `getSourceBreakdown`). Har qator: sarf (shu oyning shu kanalga yozilgan marketing xarajati), lid, o'quvchi bo'ldi (to'lov bosqichiga yetganlar), **1 o'quvchi narxi = sarf ÷ o'quvchi bo'ldi**, hozirgacha to'lagan (o'sha o'quvchilarning hamma `COMPLETED` to'lovlari yig'indisi), **samara = to'lagan ÷ sarf**. Sarfi nol kanalda narx va samara «—», lekin to'lagan pul ko'rinadi.
3. **«Hammasi» qatori** butun oyning sarfini oladi. Kanal ko'rsatilmagan sarf (`unassignedSpend`) «Hammasi»da bor, hech bir kanal qatorida yo'q va jadval ostida alohida aytiladi — kanal qatorlari yig'indisi «Hammasi»ga teng deb o'qilmasin. Lidi yo'q, lekin sarfi bor kanal ham qator oladi (lid 0).
4. **Sahifa tartibi:** kanallar jadvali tepada, «Jami (hamma kanal birga)» kartalari va «Marketing samarasi» ostida, «Oylar bo'yicha» o'zgarishsiz (butun markaz, eski oylar uchun).
5. **Hisob bitta joyda:** sof matematika `marketing.math.ts` (`sourceRows`), pul va sarfni `ReportsMarketingService` o'qiydi, mijoz hech narsa hisoblamaydi. `sourceBreakdown` har kanal qatoriga to'laganlarning `studentIds`ini qo'shdi (mijozga chiqmaydi).
6. **Migratsiya** `20261018100000_expense_lead_source` (ustun, FK, indeks; `IF NOT EXISTS`). Skript yo'q: eski xarajatlar «Umumiy» bo'lib qoladi, CEO kerak bo'lsa Xarajatlar sahifasida kanalni tahrirlab qo'yadi.

## Ko'rib chiqilgan muqobillar

- **Sarfni tavsif matni bo'yicha kanalga ajratish** («instagram» so'zi) — noaniq, xatoga to'la. Rad.
- **Sarfni lidlar soniga ulushlab bo'lish** — kanal narxini o'zi yaratib qo'yadi, haqiqiy sarfni ko'rsatmaydi. Rad.
- **Alohida «marketing kanali» ro'yxati** — lid manbalari bilan nomlar farq qilib, hisob buzilardi. Rad.
- **Manbani «pullik/bepul» deb belgilash, xarajatga tegmaslik** — Instagram va Telegram ajralmaydi. Rad.
- **Hamma narsani birinchi to'lov oyi bo'yicha qoldirish** (ADR-0067 kohorti) — lid manbasi to'lov oyiga emas, lid yozilgan oyga bog'langan; ikki kohortni aralashtirish raqamlarni mos kelmaydigan qilardi. Kohortlar farqi sahifada izohlanadi.

## Oqibatlari

- Kanal raqami vaqt o'tgan sari o'sadi: oktabrda yozilgan lid noyabrda to'lasa, oktabr qatoriga qo'shiladi («hozirgacha»).
- Kanal qatorining «o'quvchi bo'ldi» yig'indisi tepadagi «Yangi o'quvchilar»dan (birinchi to'lov oyi bo'yicha) farq qilishi mumkin.
- Sarf kanal bilan faqat bundan keyin yozilgan xarajatlarda bo'ladi; ilgari yozilganlar «Umumiy». Kanal qatorlarining sarfi kanal belgilanmaguncha kam ko'rinadi.

## Ma'lum cheklovlar

- Sarf lid kohortiga **manba nomi** bo'yicha ulanadi. Bir kompaniyada ikkita faol manba bir xil nom olsa, ularning sarfi qo'shiladi (`// ponytail:` — funnelga `sourceId` bering).
- Lid manbasi 10.09.2026 dan yoziladi: undan oldingi oylarda kanal jadvali yo'q.
- «Manba yozilmagan» lidlarning sarfi yo'q: sarf kanalsiz lidga bog'lanmaydi.
