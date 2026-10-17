# O'qituvchi kabineti (Telegram Mini App) — telefon uchun

**Sana:** 18.10.2026 · **Holat:** CEO tasdiqladi (suhbatda, namunalar bilan) · **ADR:** kerak emas (ma'lumot modeli, pul, filial qoidasi, server o'zgarmaydi).

Davomi: [2026-10-17-xodim-mini-app-profil-design.md](2026-10-17-xodim-mini-app-profil-design.md).

## Muammo

Telegramdagi «💼 Kabinet» ustozni profil va oylik raqamiga olib kirardi, kompyuter uchun yasalgan boshqaruv panelida:

1. Birinchi ko'rinadigan narsa guruhlar emas edi.
2. Telefonda guruhlar jadvali faqat nom va holatni ko'rsatardi; kun, vaqt, xona, o'quvchilar soni yashirin.
3. Jadval bitta kun, faqat sana tanlagich; hali boshlanmagan guruh ko'rinmasdi.
4. Guruh sahifasida 9 ta tab gorizontal aylanardi.
5. Davomat ichidagi qadamlar (kalendar → sana → ro'yxat) manzilda emas edi: telefonning «orqaga»si guruhdan butunlay chiqarib yuborardi. «Saqlash» tugmasi sahifa bilan birga suzardi.
6. Ustozga keraksiz narsalar: «+ Topshiriq» (server ustozga faqat o'ziga topshiriq berishga ruxsat beradi), «Bosh sahifa» havolasi (ustozda u jadvalning o'zi), filial tanlagichi (ustoz bitta filialda).

## Qaror

**Faqat ustoz (rollari faqat «O'qituvchi») va telefon enida.** Admin, CEO va kompyuterda hech narsa o'zgarmaydi.

| Qism | Qaror |
|---|---|
| Kirish | Botdagi «Kabinet» → `/groups` («Guruhlarim»). Bot ko'rsatgan sahifa (`next`) har doim ustun. |
| Pastki panel (global) | Guruhlar · Jadval · Topshiriq (menga berilgan soni belgi bo'lib) · Oylik · Profil |
| Guruh ichida | «‹ Guruhlar» · Davomat · Darslar · O'quvchilar · Yana (Materiallar, Imtihonlar, Statistika, Ilova faolligi) |
| Davomat ro'yxati | Panel yo'qoladi; «Orqaga» va «Saqlash · belgilangan/jami» paneli |
| ☰ yon menyu | Yo'q. «Qo'llanma» va «Texnik yordam» Profil sahifasida; «To'lanishi kerak» bloki «Oylik»ni ochadi |
| Guruhlar | Kartalar (kun, vaqt, xona, o'quvchilar, boshlanmagan guruhda boshlanish sanasi); hisoblagichlar va darajа/tur/xona filtrlari yo'q |
| Jadval | Faqat ro'yxat; «‹ ›» kun almashtirish; bugungi, davomati olinmagan darsda «Davomat olish»; pastda «Boshlanmagan guruhlarim» |
| Ortga qaytish | `?tab=` va `?sana=` manzilda: ro'yxat → kalendar → guruh → guruhlar. Telegramning «←» tugmasi shu qadamlarga ulanadi (besh asosiy sahifada yo'q) |
| Saqlanmagan belgilar | «Orqaga» va Telegram «←» avval so'raydi (`requestLeave`). Brauzerning xom «orqaga»sini to'xtatib bo'lmaydi |
| Sahifa xatosi | `(dashboard)/error.tsx`: sahifa yiqilsa ham panel va sarlavha qoladi |

## Chegaralar

- Server o'zgarmaydi; ustozga ko'rinmaydigan tugma xavfsizlik chorasi emas, server qoidalari (davomat oynasi: dars boshlanishidan 10 daqiqa oldin dars tugaguncha; ustoz faqat o'ziga topshiriq beradi) avvalgidek.
- Tekshirilmagan: `/tasks` sahifasining telefondagi qulayligi (u kanban doska); Telegram «←» faqat haqiqiy kabinetda (bot menyusi → `/tg`) sinaladi.

## Tekshiruv

`lib/teacher-nav.test.ts` (qaysi bo'lim, qaysi panel, qaysi sahifada «orqaga»), `lib/leave-guard.test.ts`, `lib/telegram-mini-app.test.ts` (kirish sahifasi), `lib/teacher-only.test.ts`, `groups-cards.test.ts`, `teacher-lesson-cards.test.ts`; telefon enida butun yo'l brauzerda: kirish → guruh → «Yana» → davomat → saqlanmagan so'rovi → saqlash → tizim «orqaga».
