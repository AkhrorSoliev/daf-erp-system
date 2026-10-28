# 0138. Bugungi dars tugagan bo'lsa, o'quvchi unda bo'lganmi deb so'raladi

- Holati: Qabul qilindi
- Sana: 2026-10-28
- Bog'liq: [0137](0137-guruh-almashganda-kun-bir-marta-hisoblanadi.md) (o'tkazish kuni), [0062](0062-oylik-yozilish-sikl-emas-oy.md) (oylik hisob), [0080](0080-guruhga-qoshilish-tasdigi.md) (so'rovni tasdiqlash), `docs/superpowers/specs/2026-10-28-guruhga-qoshilish-bugungi-dars-design.md`

## Kontekst

Guruhga qo'shishda boshlanish sanasi bo'sh qolsa, bugungi kun yoziladi. Hisob (`chargeStartDate`) va davomat ro'yxati (`rosterOnDate`) boshlanish kunini o'z ichiga oladi. Bugungi dars tugab bo'lgan bo'lsa, o'quvchi kelmagan darsga pul to'lardi va «Dars bo'ldimi?» ro'yxatida chiqardi. Hech joyda bu so'ralmagan. Boshqa tomondan, o'quvchi darsda o'tirgan, admin uni dars tugagach qo'shgan bo'lishi mumkin (davomat qoidasi D1: bu to'g'rilash), shuning uchun jim «bugundan» ham, jim «keyingi darsdan» ham to'g'ri emas.

## Qaror

1. **Savol faqat uchala shart bajarilganda.** Boshlanish sanasi bugun (bo'sh yoki bugun tanlangan), guruhda bugun dars bor (jadval, ko'chirish, bekor qilish, filial bayrami `lessonsOn` bo'yicha) va u tugagan (`effectiveLessonTimes`, Toshkent soati). Qoida bitta sof funksiyada: `todayLessonQuestion` (`students/enroll-start-day.ts`).
2. **Javob.** «Ha» — sana bugun, o'zgarishsiz. «Yo'q» — sana guruhning keyingi dars kuni; bugungi dars hisoblanmaydi va davomatga tushmaydi.
3. **Jim standart yo'q.** Savol kerak bo'lsa-yu `attendedTodayLesson` kelmasa, `enrollToGroup` 400 qaytaradi (API'ni to'g'ridan chaqirish ham himoyalangan). Keyingi dars topilmasa «Yo'q» 400.
4. **To'rt kirish.** Admin qo'shish oynasi, lid aylantirish, Telegram so'rovini admin tasdiqlashi (`approve` → `registerStudentFromTelegram` ning `startDay`i) — uchalasida bitta komponent (`TodayLessonQuestion`) va bitta so'rov (`GET /students/groups/:groupId/enroll-today-lesson`); guruhdan guruhga o'tkazish ham `enrollToGroup` orqali shu qoidaga tushadi. O'quvchining o'ziga botda savol berilmaydi: u dars bo'lgan-bo'lmaganini aniq aytolmaydi, admin guruh davomatini ko'radi.
5. `enroll-preview` javobida `todayLesson` bor va `attendedTodayLesson` qabul qiladi, shuning uchun «To'lash kerak» tanlangan javobga mos hisoblanadi.

## Oqibatlari

- Eski mijoz (savolni bilmaydi) bugungi dars tugagan paytda sanasiz qo'shsa 400 oladi; yangi mijoz bilan birga chiqariladi.
- Kelmagan darsga pul yozilmaydi. Haqiqatan o'tirgan o'quvchi uchun «Ha» tanlanadi.
- Yozuvlar tarixiga javob alohida yozilmaydi: natija boshlanish sanasida ko'rinadi.
