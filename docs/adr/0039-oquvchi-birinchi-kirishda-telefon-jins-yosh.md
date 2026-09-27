# ADR-0039 — O'quvchi ilovaga kirishdan oldin telefonini SMS bilan tasdiqlaydi, jinsi va tug'ilgan sanasini beradi

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0031 (telefon — kirish kaliti), ADR-0032 (kirish raqami kartaga ergashadi), `server/src/students/shared/student-onboarding.ts`, `server/src/students/onboarding/`, `server/src/students/shared/mark-phone-verified.ts`, `server/src/students/phone-proof.single-source.spec.ts`, `client/src/components/student-portal/onboarding/`, `client/src/components/students/student-contact-badges.tsx`, `student-app/src/app/onboarding.tsx`

## Kontekst

Kartadagi raqamni xodim o'quvchining og'zidan eshitib yozadi. Raqam
o'quvchinikimi — hech kim tekshirmagan. Holbuki bu raqam kirish kaliti
(ADR-0031): parol SMS bilan shu raqamga tiklanadi, «Telegram orqali kirish»
hisobni shu raqam bo'yicha topadi. Jins va tug'ilgan sana ham ko'p kartada
bo'sh: ularni xodim to'ldirmasa, hech kim to'ldirmaydi.

CEO talabi (2026-09-27): o'quvchi web portalga ham, mobil ilovaga ham
kirganda uchta narsa majburiy — telefonni SMS orqali tasdiqlash, yosh va
jins. Parolini SMS orqali tiklagan o'quvchi raqamini allaqachon isbotlagan,
undan yana SMS so'ralmaydi.

## Qaror

1. **Tasdiq — bayroq emas, tasdiqlangan raqamning o'zi.** `Student` ga
   `verifiedPhone` va `phoneVerifiedAt` qo'shiladi. Raqam faqat
   `verifiedPhone = phone` bo'lganda tasdiqlangan hisoblanadi. Xodim raqamni
   o'zgartirsa (ADR-0032), yangi raqam o'z-o'zidan tasdiqlanmagan bo'ladi —
   hech kim bayroqni tushirishni eslab qolishi shart emas.
2. **Yosh tug'ilgan sana sifatida so'raladi** (`Student.dateOfBirth`, mavjud
   maydon). Yosh har yili o'zgaradi, sana — yo'q. Qabul qilinadigan yosh
   5–100 (yozilgan yilni ushlaydi, siyosat emas).
3. **Faqat bo'sh maydon so'raladi va yoziladi.** Xodim kiritgan jins yoki
   sana ustidan yozilmaydi; bu eshik — birinchi kirish uchun, kartaning
   ikkinchi muharriri emas.
4. **SMS'dan oldin «Bu sizning raqamingizmi?» deb so'raladi** (CEO,
   2026-09-27). «Ha» — kod kartadagi raqamga. «Yo'q» — o'quvchi o'zi
   ishlatadigan raqamni va **joriy parolini** kiritadi, kod yangi raqamga
   boradi; kod to'g'ri bo'lsa, yangi raqam eski raqam o'rniga kartaga va
   kirish hisobiga tasdiqlangan holda yoziladi (ADR-0032, `planPhoneChange`),
   eski raqam kalit bo'lmay qoladi. Parol ADR-0031 talabi: yangi raqamga SMS
   raqam egasini isbotlaydi, hisob egasini emas — parolsiz, ochiq qolgan
   qurilmani qo'lga kiritgan odam kirish raqamini o'ziga ko'chirib, keyin
   parolni SMS bilan tiklab olardi. Boshqa o'quvchining kirish raqami bo'lgan
   raqam qabul qilinmaydi. Bu eshik faqat telefon qadami ochiq paytda
   (raqam hali tasdiqlanmagan) ishlaydi; keyin raqamni xodim almashtiradi.
5. **SMS orqali parol tiklash raqamni tasdiqlaydi.** Kod shu raqamga borib
   qaytgan — isbot bir xil. Mavjud tiklashlar migratsiyada belgilanadi, lekin
   faqat kod qaysi raqamga ketgani aniq bo'lganda: hisobning 9 xonali kirish
   raqamlari faqat karta raqami va tiklashdan keyin karta raqami
   o'zgarmagan.
6. **Qoida bitta joyda** — `missingOnboardingSteps`; ikkala klient
   `GET /student-portal/onboarding` javobiga qarab darvoza qo'yadi va o'zi
   hech narsa hisoblamaydi.
7. **Telefon qadami kalit bilan yoqiladi** (`STUDENT_PHONE_VERIFICATION_ENABLED=true`
   va Eskiz hisobi sozlangan bo'lishi kerak). SMS matni Eskizda alohida
   moderatsiyadan o'tishi shart; tasdiqlanmagan matn yetib bormaydi va
   majburiy qadam hammani ilovadan tashqarida qoldiradi. Shuning uchun
   kalitsiz deploy «so'ralmaydi» holatiga tushadi, «qotib qoldi» holatiga
   emas. Jins va sana kalitsiz ham darhol majburiy.
8. **Faqat O'zbekiston raqami (9 xona) tasdiqlanadi.** Eskiz chet el
   raqamiga yubormaydi; bunday o'quvchidan SMS so'ralmaydi.
9. **Telegram raqamni tasdiqlamaydi** (CEO, 2026-09-27). Telegram orqali
   kirish (`phone_number_verified`) ham, botga ulashilgan kontakt ham karta
   raqamini tasdiqlamaydi: ular Telegram hisobining raqamini isbotlaydi,
   o'quvchi esa amalda boshqa raqamdan foydalanishi mumkin. Tasdiqni faqat
   ikki SMS yo'li yozadi — portal kodi va SMS orqali parol tiklash.
10. **Xodim kartasi ikkalasini alohida ko'rsatadi:** «Telefon tasdiqlangan»
    (SMS) va «Telegram botda ro'yxatdan o'tgan» (`telegramChatId` bog'langan,
    bot xabarlari shu yerga boradi). Biri ikkinchisini anglatmaydi. API
    tasdiqlangan raqamning o'zini emas, faqat hukmni beradi (`phoneVerified`).

**Taqiqlanadi:**
- tasdiqni `Student.phone` dan ajralgan bayroq (`isPhoneVerified: true`)
  sifatida saqlash;
- bu eshikdan kartadagi mavjud qiymatni qayta yozish;
- klientda «nima yetishmaydi» ni o'zicha hisoblash;
- karta raqamini Telegram asosida (kirish yoki bot kontakti) tasdiqlangan deb
  belgilash; `markPhoneVerified` ni SMS yo'llaridan boshqa joydan chaqirish.
  Buni `phone-proof.single-source.spec.ts` qorovuli ushlaydi;
- o'quvchining raqamini joriy parolsiz yoki `planPhoneChange` siz almashtirish
  (`own-password-attempt.routes.spec.ts`, `student-phone.single-source.spec.ts`).

## Ko'rib chiqilgan muqobillar

**Darvozani serverda qo'yish (qadamlar tugamaguncha boshqa student
endpointlari 403).** Rad etildi. Do'konlardagi eski mobil versiyalar bu
ekranni bilmaydi: ular ekran o'rniga hamma joyda xato ko'rsatardi. Bu talab
xavfsizlik chegarasi emas, ma'lumot talabi. Klient darvozasi har bir oddiy
foydalanuvchini to'xtatadi, mobil kod esa OTA bilan yangilanadi.

**Yoshni son sifatida so'rash.** Rad etildi — bir yildan keyin noto'g'ri
bo'ladi, `dateOfBirth` maydoni esa allaqachon bor.

**Parolni tiklash shablonini tasdiqlash uchun ham ishlatish.** Rad etildi.
Matn «parolini tiklash uchun» deydi; o'quvchini chalg'itadi va Eskiz
moderatsiyasining asosiy sharti — kodning maqsadi — buziladi.

**Tasdiqni `User` (hisob) da saqlash.** Rad etildi. Raqam kartaniki
(ADR-0032), jins va sana ham kartada; hammasi bitta yozuvda turadi.

**Telegram orqali kirish yoki bot kontaktini tasdiq deb hisoblash.** Rad
etildi (CEO, 2026-09-27). Har bir shunday o'quvchi uchun bitta SMS tejalardi,
lekin Telegram hisobidagi raqam o'quvchi ishlatadigan raqam bo'lmasligi
mumkin — ota-onaning, akasining yoki eski raqam. Tasdiq faqat kartadagi
raqamga borib qaytgan SMS kod bilan tan olinadi.

**Raqamni faqat xodim almashtirsin, o'quvchi administratorga murojaat
qilsin.** Birinchi variant shu edi; rad etildi (CEO, 2026-09-27): yoqilgan
kuni raqami noto'g'ri yozilgan har bir o'quvchi ilovadan tashqarida qolib,
administratorga navbatga turardi.

**«Yo'q» tarmog'ida parol so'ramaslik, faqat yangi raqamga SMS.** Tanlanmadi:
ADR-0031 aynan shu variantni ko'rib chiqqan — SMS raqam to'g'ri yozilganini
tasdiqlaydi, hisob egasi ekanini emas, va u parolning o'rniga emas, ustiga
qo'shiladi. Parol bilan kirgan o'quvchi uni hozirgina yozgan; Telegram bilan
kirgan o'quvchining kartadagi raqami esa Telegram raqamining o'zi.

**Darvoza so'rovi xato bersa ilovani yopish.** Rad etildi: bitta
muvaffaqiyatsiz so'rov butun ilovani olib qo'ymasligi kerak. Klientlar
javobsiz holatda ochiq qoladi (fail-open); javob kelishi bilan darvoza
yopiladi.

## Oqibatlari

**Yutuq:** har bir faol o'quvchining kirish raqami bir marta isbotlanadi,
kartalarda jins va tug'ilgan sana to'ladi. Raqami almashgan o'quvchi
keyingi kirishda yangi raqamini tasdiqlaydi.

**Narx:** har bir o'quvchi uchun bitta SMS (pul). Yoqilgan kuni hamma bir
vaqtda so'raydi: soatlik umumiy limit (`PHONE_VERIFY_SMS_GLOBAL_HOURLY_CAP`,
standart 300) balansni himoya qiladi, lekin shu soatda kutib qolganlar
bo'ladi. O'quvchiga kuniga 5 ta SMS, bitta yangi raqamga kuniga 3 ta.
Raqamini o'zi almashtirgan o'quvchi bundan keyin tizimga yangi raqam bilan
kiradi; eski raqam kartaning tarixida qoladi. Parolini bilmaydigan o'quvchi
«Yo'q» tarmog'idan o'ta olmaydi — avval parolni tiklaydi yoki xodim raqamni
almashtiradi.

**Endi taqiqlangan:** yuqoridagi taqiqlar.
