# Muzlatilgan o'quvchining puli — dizayn

**Sana:** 2026-09-03
**Holat:** tasdiqlangan, kod yozilmagan
**Muallif:** brainstorming sessiyasi (CEO bilan)

## Muammo

CEO so'zi bilan: muzlatilgan o'quvchining o'tmagan darslari puli balansiga
qaytarilishi va **kutish rejimida** turishi kerak. O'quvchi xohlagan paytda
uni olib ketishi mumkin. Agar 1 oy davomida olib ketmasa, administrator
xabardor bo'lishi va pulni markaz hisobiga o'tkazishni ko'rib chiqishi kerak.

Bugungi holat:

| Model | Muzlatishda nima bo'ladi |
|---|---|
| `LESSON_PACK` | `refundPrepaidForFreeze` sarflanmagan prepaid'ni balansga qaytaradi — **ishlaydi** |
| `MONTHLY` | **Hech narsa.** Muzlatish oy hisobiga umuman tegmaydi: na yangi yozadi, na eskisini qaytaradi |

Ikkala modelda ham balansda qolgan pulni hech kim eslatmaydi — u u yerda
cheksiz turaveradi.

## Qarorlar

| # | Savol | Qaror |
|---|---|---|
| 1 | Muzlatishda pul qaytsinmi | **Ha, darhol.** Balansga qaytadi va kutish rejimida turadi |
| 2 | Kim ro'yxatga tushadi | **Barcha** muzlatilgan, balansi musbat o'quvchilar — to'lov turidan qat'i nazar |
| 3 | Ogohlantirish shakli | Xabar oqimi EMAS — **ish ro'yxati** (sahifa) |
| 4 | Ro'yxat qayerda | `/payments/debt` ga beshinchi tab |
| 5 | Ro'yxat qanday hisoblanadi | **Jonli**, sahifa ochilganda. Cron ham, yangi jadval ham yo'q |
| 6 | Chegara | **30 kun**, kodda. Sozlamaga chiqarilmaydi (talab bo'lmadi) |

## 1. Muzlatishda pul qaytadi

`StudentsStatusService` muzlatish yo'liga `MONTHLY` shoxi qo'shiladi.

Mavjud `MonthlyChargeService.reverseChargeForDeparture` AYNAN kerakli ishni
qiladi: «shu sanadan keyingi qoplangan darslar pulini qaytar va
`coveredLessons` ni kamaytir». Muzlatish — pul jihatidan chiqib ketish bilan
bir xil amal, faqat yozilish yopilmaydi. Shuning uchun yangi arifmetika
yozilmaydi, o'sha funksiya `departureDate = muzlatish sanasi` bilan
chaqiriladi.

```
Oktabr: 450 000, 14 dars, 32 143/dars
10-oktabrda muzlatildi — 6 dars o'tgan, 8 qolgan
→ balansga 8 x 32 143 = 257 144 qaytadi
```

**Bu alohida topilgan teshikni ham yopadi.** `a6f9aa4` ko'rigida shu
aniqlangan edi: muzlatilgan, keyin guruhdan chiqarilgan o'quvchining
muzlatilgan davri puli qaytmaydi, chunki `lessonsThroughDeparture` sof
kalendar bo'yicha sanaydi va muzlatishni ko'rmaydi. Endi muzlatishning o'zi
o'sha davrni qaytaradi.

**Ikki marta qaytmaydi:** funksiya idempotent — `remaining` jonli
`charge.coveredLessons` dan olinadi, kalendardan qayta hisoblanmaydi. Birinchi
chaqiruv (muzlatish) `coveredLessons` ni kamaytiradi; keyingi chaqiruv
(chiqarish) qaytariladigan narsa topmaydi.

`LESSON_PACK` yo'liga TEGILMAYDI — u allaqachon to'g'ri ishlaydi.

## 2. «Muzlatilgan puli» tabi

`/payments/debt` da hozir 4 ta tab bor (Qarzdorlar, Markaz qoplagani, Oylik
qarzdorlik, Kechirilganlar). Beshinchisi qo'shiladi. Hammasi bitta oilaga
tegishli: **markaz bilan o'quvchi o'rtasidagi hal qilinmagan pul**.

**Ro'yxatga tushish sharti** (uchalasi birga):
- `Student.status === FROZEN`
- `Student.balance > 0`
- `Student.statusChangedAt` 30 kundan eski

**Ustunlar:** o'quvchi (ism, ID) · muzlatilgan sana + necha kun bo'lgani ·
balansi · oxirgi to'lov sanasi · amallar.

**Amallar — ikkalasi ham mavjud oyna, yangi pul mantig'i YO'Q:**
- «Markaz hisobiga o'tkazish» → `withdrawal-dialog.tsx` (`BALANCE_WITHDRAWAL`)
- «O'quvchiga qaytarish» → mavjud qaytarish oqimi

**Ruxsat:** boshqa tablar bilan bir xil qamrov, filial bo'yicha cheklangan
(`ReportBranchIds`).

### Nega jonli hisoblanadi

Cron + jadval yo'li rad etildi. Sababi: cron ishlamay qolsa ro'yxat jimgina
bo'shab qoladi yoki eskiradi, va bugun muzlatilgan o'quvchi ertaga tungacha
ko'rinmaydi. Bitta so'rov bilan hisoblansa, javob doim bugungi va ishlamay
qolishi mumkin bo'lgan qism umuman yo'q.

`Student` jadvalida `status`, `balance`, `statusChangedAt` — uchalasi ham
indekslangan yoki kichik jadval ustunlari; 886 o'quvchida bu bitta arzon
so'rov.

## 3. Nima QILINMAYDI

- Yangi jadval yo'q
- Yangi cron yo'q
- Yangi bildirishnoma turi yo'q — ro'yxatning o'zi signal
- Yangi pul mantig'i yo'q — ikkala amal ham mavjud oynalar
- Sozlama tugmasi yo'q — 30 kun kodda
- `LESSON_PACK` muzlatish yo'liga tegilmaydi

## 4. Xatarlar

| Xatar | Yumshatish |
|---|---|
| Muzlatishda ikki marta pul qaytishi | `reverseChargeForDeparture` idempotent; test bilan mahkamlanadi |
| `statusChangedAt` muzlatish sanasi emasligi | U har status o'zgarishida yoziladi; o'quvchi muzlatilgan bo'lsa oxirgi o'zgarish — muzlatish. Qayta muzlatilsa sanagich qaytadan boshlanadi, bu to'g'ri |
| Ro'yxat sekin ishlashi | Bitta so'rov, 886 qatorlik jadval. O'lchanadi |
| Muzlatish tranzaksiyasi og'irlashishi | Pul qaytarish mavjud Serializable tranzaksiya ichida, xuddi `LESSON_PACK` yo'lidagi kabi |

## 5. Testlar

- Muzlatilgan oylik o'quvchining o'tmagan darslari puli balansga qaytadi
- Muzlatilgan, keyin chiqarilgan o'quvchiga ikki marta qaytmaydi
- `LESSON_PACK` muzlatish xatti-harakati o'zgarmaydi
- Ro'yxat uchala shartni ham qo'llaydi (muzlatilgan / balans > 0 / 30 kun)
- 29 kun bo'lgan o'quvchi ro'yxatda yo'q, 31 kun bo'lgani bor
- Filial qamrovi qo'llanadi
