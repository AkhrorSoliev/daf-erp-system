# Guruhga qo'shilish: «bugungi darsda bo'ldimi?» savoli

2026-10-28. Holat: loyiha, tasdiq kutadi.

## Muammo

Guruhga qo'shishda boshlanish sanasi bo'sh qolsa, bugungi kun yoziladi. Hisob
va davomat ro'yxati boshlanish kunini ham o'z ichiga oladi
(`charge-start-date.ts`, `roster-on-date.ts`). Bugungi dars tugab bo'lgan
bo'lsa, o'quvchi kelmagan darsga pul to'laydi va «Dars bo'ldimi?» ro'yxatida
chiqadi. Hech joyda bu so'ralmaydi.

CEO misoli (davomat qoidasi, D1): o'quvchi darsda o'tirgan, admin uni dars
tugagach qo'shgan. Bu to'g'rilash, shuning uchun bugungi kun ba'zan to'g'ri.
Demak jim «bugundan» emas, savol kerak.

## Qoida

Savol faqat uchala shart bajarilsa chiqadi:
1. Boshlanish sanasi bugun (sana bo'sh yoki bugungi sana tanlangan).
2. Guruhda bugun dars bor (jadval, ko'chirish, bayram, bekor qilish hisobga
   olinadi: `lessonsOn`, `ended-lessons.ts`).
3. Bugungi dars tugagan (`lessonHasEnded`, haqiqiy vaqt: `effectiveLessonTimes`).

Javob:
- **Ha, bo'ldi** → boshlanish sanasi bugun. Hozirgi xatti-harakat.
- **Yo'q, bo'lmadi** → boshlanish sanasi guruhning keyingi dars kuni.
  Bugungi dars hisoblanmaydi, davomatga tushmaydi.

Shartlardan biri bajarilmasa savol yo'q, xatti-harakat o'zgarmaydi.

## Server

- Yangi sof funksiya `todayLessonQuestion({ group, reschedules, cancellations,
  holidays, now })` → `{ needed: false } | { needed: true, lessonStart,
  lessonEnd, nextLessonDate }`. Mavjud `lessonsOn` va `lessonHasEnded`dan
  foydalanadi, yangi jadval hisobi yozilmaydi. Fayl:
  `server/src/students/enroll-start-day.ts`.
- `GET /students/:id/enroll-preview` javobiga `todayLesson` qo'shiladi (shu
  funksiyaning natijasi). Boshqa maydonlar o'zgarmaydi.
- `enrollToGroup` options: `attendedTodayLesson?: boolean`. Qoida:
  - savol kerak emas → maydon e'tiborga olinmaydi;
  - savol kerak va maydon yo'q → 400 «Bugungi dars o'tib bo'lgan: o'quvchi unda
    bo'lganmi, ko'rsating». Jim standart yo'q (API'ni to'g'ridan chaqirish ham
    himoyalangan);
  - `false` → `startDate = nextLessonDate`.
- `EnrollToGroupDto` va lid aylantirish DTO'siga `attendedTodayLesson?`
  (`@IsOptional @IsBoolean`) qo'shiladi. `startDate` izohi koddagiga moslab
  tuzatiladi (server jadvalga mosligini tekshirmaydi).
- Tarixga `GURUHGA_QOSHILDI` yozuvida `bugungiDars: bo'lgan | bo'lmagan`
  maydoni yoziladi (savol berilgan bo'lsa).
- Keyingi dars topilmasa (guruh tugayapti) → `nextLessonDate = null`, javob
  «Yo'q» tanlansa 400 «Guruhning keyingi darsi yo'q».

## Joylar (4 yo'l)

| Yo'l | Hozir | Yangi |
|---|---|---|
| Admin qo'shish oynasi | sana tanlanadi | preview `todayLesson.needed` bo'lsa Ha/Yo'q savoli; tanlanmaguncha «Qo'shish» o'chiq |
| Lid → o'quvchi (guruh bilan) | `dto.startDate` ixtiyoriy | xuddi shu savol, xuddi shu komponent |
| Telegram o'z-o'zidan ro'yxat | so'rov yaratadi, sana yozilmaydi | o'zgarmaydi: tasdiq admin qo'lida |
| Admin tasdig'i (ADR-0080) | `registerStudentFromTelegram`, sana = bugun | tasdiq oynasida shu savol; javob `registerStudentFromTelegram`ga o'tadi |

Qaror: Telegramda o'quvchining o'ziga savol berilmaydi. U bu dars bo'lgan-
bo'lmaganini aniq aytolmaydi, admin esa guruh davomatini ko'rib turadi
(qarorni qayta so'rash kerak emas, sabab shu).

## Client

Bitta komponent `TodayLessonQuestion` (`client/src/components/students/`),
`EnrollPreviewBlock` ichidan va ikkala boshqa oynadan ishlatiladi. Matn:

> Bugungi dars (18:00 – 19:30) o'tib bo'ldi. O'quvchi unda bo'ldimi?
> ( ) Ha, bo'ldi — bugundan hisoblanadi
> ( ) Yo'q — {30.10} dan boshlanadi, bugungi dars hisoblanmaydi

Narx oldindan ko'rish (`enroll-preview`) tanlangan javob bilan qayta hisoblanadi
(«Yo'q» bo'lsa `startDate=nextLessonDate` yuboriladi).

## Test

- `todayLessonQuestion`: dars yo'q / hali boshlanmagan / davom etyapti /
  tugagan / bekor qilingan / ko'chirilgan / bayram / sana bugun emas / keyingi
  dars yo'q.
- `enrollToGroup`: javobsiz 400, `false` sanani siljitadi, `true` o'zgartirmaydi,
  savol kerak emasda maydon e'tiborsiz.
- Oylik hisob: «Yo'q» bo'lsa bugungi dars `coveredDates`da yo'q.
- Client: savol faqat `needed` bo'lganda chiqadi, tanlovsiz tugma o'chiq.

## Qamrab olinmagan

- Mavjud o'quvchini guruhdan guruhga ko'chirish (transfer): u ham `enrollToGroup`
  orqali o'tadi va shu qoidaga tushadi, alohida ish qilinmaydi.
- Bot orqali o'quvchiga savol berish.
