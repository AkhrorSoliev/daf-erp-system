# 0020. Ilova faolligi klientda o'lchanadi, server jami qiymatni qirqadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-13
**Bog'liq:** [0019](0019-mashq-natijasi-umumiy-shartnoma.md),
[dizayn hujjati](../superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md) (3 va 4-bo'limlar)

## Kontekst

Markaz o'quvchi ilovada qancha vaqt o'tkazganini — veb, Android yoki iOS dan
kirishidan qat'iy nazar — bilishi kerak. Server faqat so'rovlarni ko'radi: o'quvchi
darsni o'qiyotganda yoki tinglayotganda deyarli so'rov yubormaydi, shuning uchun
server loglaridan chiqarilgan vaqt haqiqatdan bir necha barobar kam bo'lardi.
Tashqi analitika (PostHog, Firebase) ma'lumotni bazadan tashqariga olib chiqadi va
uni guruh, filial va profilga bog'lab bo'lmaydi.

## Qaror

1. **Faol vaqtni klient o'lchaydi, bitta qoida bilan:** ekran ko'rinib turibdi, oyna
   fokusda va oxirgi 2 daqiqada teginish/bosish/klaviatura/aylantirish bo'lgan yoki
   ta'lim audiosi o'ynayapti. Radio vaqti alohida — pleyer pozitsiyasi o'sishidan,
   ekran yopiq bo'lsa ham sanaladi va faol vaqtga qo'shilmaydi.
2. **Klient seans uuid'i bilan JAMI qiymat yuboradi** (`POST /student-portal/activity`),
   delta emas. Server har maydonda `max` oladi — takroriy so'rov vaqtni ko'paytirmaydi.
3. **Server qirqadi va tekshiradi:** qiymat `firstSeenAt` dan o'tgan vaqt + 120 s dan
   oshmaydi; begona seans — 403; seansning Toshkent kuni bugun emas — 409; qator
   yangilashda `FOR UPDATE` bilan qulflanadi; filial birinchi yozuvda muhrlanadi.
4. **Bitta seans — bitta qator** (`StudentAppSession`), vaqt «ta'lim / boshqa»
   bo'limlariga ajratiladi.

## Oqibatlar

- Hisob faqat deploy kunidan boshlanadi; o'tmishni tiklab bo'lmaydi.
- Token muddati o'tsa, yuborish keyingi token yangilanishigacha kechikadi — qiymat
  jami bo'lgani uchun yo'qolmaydi. Brauzer butunlay yopilsa, oxirgi saqlashdan keyingi
  ≤ 15 s yo'qolishi mumkin; yarim tunda yopilgan seansning oxirgi ≤ 60 s i 409 bilan
  rad etilishi mumkin.
- **Yangi ta'lim audio pleyeri `registerMedia` qilishi SHART**, aks holda o'quvchi
  audio tinglab turganda «faol emas» deb sanaladi.
- Native ilova (Android/iOS) aynan shu qoida va shu endpoint bilan o'lchashi kerak va
  bu birinchi do'kon relizidan oldin tayyor bo'lishi kerak (dizayn 8-bo'lim).
