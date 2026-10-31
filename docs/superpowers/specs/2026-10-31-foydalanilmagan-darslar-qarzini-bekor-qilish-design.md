# Guruhdan chiqqan o'quvchi: foydalanilmagan darslar qarzini bekor qilish

Sana: 2026-10-31. Holati: loyiha, CEO tasdig'ini kutadi.
Bog'liq: ADR-0047 (darsga qo'yish), ADR-0143 (kech to'lov → «Keldi»), ADR-0053 (bekor qilingan dars puli), shartnoma 3.2, 6.2. Spec: `docs/superpowers/specs/2026-10-31-kech-tolov-keldi-design.md`.

## 1. Muammo

Oylik hisobda butun oy oldindan yoziladi. O'quvchi 2-darsdan to'lamasa, davomatga qo'yilmaydi (ADR-0047) — bu kunlarda uning qatori bo'lmaydi. Agar u keyin to'lasa, bu kunlar «Keldi» bo'ladi (ADR-0143). Lekin agar u guruhdan chiqarilsa yoki chetlashtirilsa — bu kunlar hech qachon «Keldi» bo'lmaydi, chunki kech to'lov qoidasi faqat FAOL yozilishlarni tekshiradi.

Natija: o'quvchi hech qachon kirmaydigan, o'tirmagan darslari uchun qarzi abadiy qoladi. Misol — #10882: 31.10 da #054 guruhidan chiqarildi, oktabrning 16, 19, 21, 23, 26, 28, 30-kunlari — ustoz dars o'tgan, uning qatori yo'q, qarzi −233 330 bo'lib qoladi.

## 2. Qaror (CEO, 31.10.2026)

1. Avtomatik emas — **CEO qaror qiladi**. Har bir holatni ko'rib, qaysi kunlarni bekor qilishni o'zi tanlaydi.
2. Narxni CEO yozmaydi — **tizim hisoblaydi**. Qarz darslardan kelib chiqqan, narx ma'lum.
3. Yangi sahifa yoki tab kerak emas — **mavjud «To'lov» dropdown**iga bitta band qo'shiladi (`student-profile-card.tsx`).
4. Faqat guruhdan chiqarish (DROPPED) va chetlashtirish (EXPELLED)da ishlaydi. Pauzaga tegmaydi — pauzadagi o'quvchi qaytib kelishi mumkin, kech to'lov qoidasi o'zi tuzatadi.
5. O'quvchining shu yozilishidagi BARCHA oylik hisoblari tekshiriladi (faqat oxirgisi emas).

## 3. «Foydalanilmagan dars» ta'rifi

Kun quyidagilar bo'lsa foydalanilmagan hisoblanadi:
1. Oylik hisobda bor (`coveredDates`), hisobdan chiqarilmagan (`frozenOutDates`da yo'q).
2. Ustoz shu kuni guruhga davomat olgan (`heldDays` — ADR-0142 dagi bilan bir xil o'qish).
3. O'quvchida shu kunga hech qanday qator yo'q — na «Keldi», na «Kelmadi», na «Sababli», na kech to'lov bilan yozilgan «Keldi».
4. Kun chiqarilgan/chetlashtirilgan kundan oldin yoki teng (`statusChangedAt`).

Bu aynan `barredLessonDays` (ADR-0142) hisoblaydigan to'plam — yangi funksiya yozilmaydi, bor funksiya ishlatiladi.

Kelajakdagi (chiqarilgandan keyingi) kunlar bu yerga kirmaydi — ular allaqachon mavjud 6.2 qoidasi (`departureRelease`) orqali hal qilinadi, bu yerga tegishli emas.

## 4. Ekranda ko'rinishi

«To'lov» dropdown (profil kartasi): «To'lov qo'shish», «To'lov tarixi», «Pulni qaytarish», «Yechib olish» qatoriga yangi band — **«Foydalanilmagan darslar qarzini bekor qilish»**. Band faqat quyidagi holatda ko'rinadi: `debt.write-off` huquqi bor VA o'quvchida kamida bitta DROPPED/EXPELLED yozilish bor VA foydalanilmagan kun kamida bitta bor VA balans manfiy.

Bosilganda oyna ochiladi:
- Har bir foydalanilmagan kun — guruh nomi, sana, narx — belgilangan holatda (checkbox): «#054 · 16.10.2026 · 34 615 so'm» ✓
- Pastda: «Jami: X so'm» (belgilangan kunlar yig'indisi, qarzdan oshmaydi).
- Sabab maydoni (ixtiyoriy, tarixga yoziladi).
- «Bekor qilish» (yopadi) / «Tasdiqlash» (yozadi).

Agar jami tanlangan summa qarzdan katta bo'lsa (masalan #10882: 7 kun × narx > qolgan qarz), oynada ogohlantirish: «Siz tanlagan summa qarzdan katta. Faqat qarz miqdoricha bekor qilinadi (X so'm).» — balans musbat bo'lib qolmaydi.

## 5. Server

**O'qish:** `GET /students/:id/unused-barred-lessons` (`@Can('debt.write-off')`). O'quvchining DROPPED/EXPELLED yozilishlari, har birining CHARGED oylik hisoblari, har biridan `barredLessonDays` (yuqoridagi 4 shart, `to` = `statusChangedAt`+1 kun). Har kun uchun narx: `charge.perLessonCost` chegirma bilan (`applyDiscount`). Javob: `{ enrollmentId, groupName, date, amount }[]` va joriy balans.

**Yozish:** `POST /students/:id/unused-barred-lessons/write-off { dates: [{enrollmentId, date}], reason? }` (`@Can('debt.write-off')`, Serializable tranzaksiya). Server klient yuborgan narxga ishonmaydi — ro'yxatni qayta hisoblaydi, faqat so'ralgan `dates` shu ro'yxatda bor-yo'qligini tekshiradi. Har bir charge uchun:
- tanlangan kunlar yig'indisi, `charge.chargedAmount`dan oshmaydi (`cancelledLessonRelease`dagi bilan bir xil qulf);
- **jami** (barcha charge bo'yicha) o'quvchining joriy qarzidan (`-balance`, musbat bo'lsa 0) oshmaydi — bu yangi qulf, balans musbat bo'lib qolmasligi uchun;
- har charge uchun bitta ADJUSTMENT yozuvi (`metadata.kind: 'unused-departure-release'`, kunlar ro'yxati, sabab), `frozenOutDates` yangilanadi (`cancelledLessonRelease` naqshi — `billing/cancelled-lesson-release.ts`dagi kabi).
- O'quvchi tarixiga bitta yozuv: necha kun, qancha summa, kim bekor qildi.

Hech qanday davomat qatori yozilmaydi, ustoz haqiga tegilmaydi (bu kunlarda haq umuman yozilmagan edi).

## 6. Nima o'zgarmaydi

- ADR-0143 ning asosiy qoidasi: FAOL o'quvchida hech narsa hisobdan chiqarilmaydi. Bu faqat chiqarilgan/chetlashtirilganlarga tegishli.
- 6.2 qoidasi, kelajakdagi kunlar hisobi — o'zgarmaydi, bu alohida mexanizm.
- Avtomatik ishlamaydi — faqat CEO (yoki `debt.write-off` huquqi bor xodim) bosganda.

## 7. Sinov

- Unit: foydalanilmagan kunlar ro'yxati to'g'ri hisoblanadi (barredLessonDays qayta ishlatiladi); kech to'lov bilan «Keldi» bo'lgan kun ro'yxatga kirmaydi; kelajakdagi kun kirmaydi; FAOL yozilish kirmaydi.
- Unit: yozishda summa ikki joyda qulflanadi — charge miqdoridan va umumiy qarzdan oshmaydi.
- Throwaway bazada: #10882ga o'xshash holat — 7 kun tanlanganda, qarz −233 330dan X so'mga (qarzdan oshmaydigan) o'zgarishi, qolgan 0 yoki musbat bo'lmasligi.
