# Google Play — Store Listing matnlari (DaF Student)

> Bu matnlarni Play Console → **Main store listing** va **App content** bo'limlariga ko'chiring.
> Aloqa ma'lumotlarini (e-pochta) DaFZentrum'ning haqiqiy ma'lumoti bilan tekshiring.

---

## App name (Ilova nomi) — ≤ 30 belgi
```
DaF Student
```

## Short description (Qisqa tavsif) — ≤ 80 belgi
```
DaFZentrum o'quvchilari uchun: jadval, davomat, to'lovlar va QR davomat
```

## Full description (To'liq tavsif) — ≤ 4000 belgi
```
DaF Student — DaFZentrum til markazi o'quvchilari uchun rasmiy mobil ilova. Darslaringiz, davomatingiz va to'lovlaringizni bir joyda, qulay tarzda kuzating.

ASOSIY IMKONIYATLAR:

• Dars jadvali — guruhingiz darslari, vaqti va xonasini real vaqtda ko'ring.

• Davomat — qatnashgan va qoldirgan darslaringiz tarixi hamda statistikasi.

• QR davomat — darsga kelganingizni QR kodni skanerlash orqali tezda belgilang.

• To'lovlar — joriy balansingiz va to'lovlar tarixini ko'ring, to'lovni ilova orqali amalga oshiring.

• Profil — shaxsiy ma'lumotlaringiz va profil rasmini boshqaring.

• Bildirishnomalar — markazdan muhim eslatma va yangiliklarni o'z vaqtida oling.

OSON KIRISH:
Telegram orqali bir bosishda yoki telefon raqami va parol bilan tizimga kiring.

QULAY DIZAYN:
Tungi va kunduzgi rejim, o'zbek tilidagi sodda interfeys.

DaF Student ilovasi faqat DaFZentrum o'quvchilari uchun mo'ljallangan. Tizimga kirish uchun markazda ro'yxatdan o'tgan bo'lishingiz kerak.
```

---

## App category
- **Category:** Education
- **Tags:** education, study, language learning

## Contact details (Play Console talab qiladi)
- **Email:** info@dafzentrum.uz  *(tekshiring/almashtiring)*
- **Website:** https://dafzentrum.uz  *(agar bo'lsa)*
- **Privacy policy URL:** *(privacy-policy.html ni hostlagandan keyingi URL)*

---

## App access (MUHIM — login talab qiladigan ilovalar uchun)

> ⛔ **BLOCKER:** Ilovaning BARCHA ekranlari login orqasida. Bu maydonlar bo'sh qolsa,
> Google reviewer hech narsaga kira olmaydi va submission **albatta rad etiladi**.
> Submission'dan oldin haqiqiy, muddati tugamaydigan demo o'quvchi akkauntini (namuna
> guruh/davomat/balans bilan) to'ldiring va `https://api.dafzentrum.uz/api` ga kirishini tekshiring.

Google reviewer ilovaga kira olishi uchun **test akkaunt** bering:
- Login turi: telefon raqami + parol
- Test telefon: `__________`  *(ishlaydigan demo o'quvchi akkaunti)*
- Test parol: `__________`
- Izoh: "Telegram OTP ham mavjud, lekin reviewer uchun telefon+parol akkaunti berildi (OTP'ni reviewer ishlata olmaydi)."

---

## Data safety — formada belgilanadigan ma'lumotlar
Ilova quyidagilarni **to'playdi** (hammasi shifrlangan, uchinchi tomonga sotilmaydi):

| Ma'lumot | Toifa | Collected | Shared | Sababi |
|---|---|---|---|---|
| Ism | Personal info | Ha | Yo'q | App functionality |
| Telefon raqami | Personal info | Ha | Yo'q | App functionality, Account management |
| Telegram identifikatori | Personal info (User IDs) | Ha | Yo'q | Account management |
| Tug'ilgan sana | Personal info | Ha | Yo'q | App functionality |
| Ota-ona/vasiy ismi va telefoni | Personal info | Ha | Yo'q | App functionality |
| Profil rasmi (Photos) | Photos and videos | Ha | Yo'q | App functionality |
| To'lov/balans | Financial info | Ha | Yo'q | App functionality |
| Davomat (App activity) | App activity | Ha | Yo'q | App functionality, Analytics |
| Push token (Device ID) | Device or other IDs | Ha | Yo'q | App functionality (bildirishnoma) |

> **Eslatma:** "E-pochta" QO'SHILMADI — ilova e-pochta to'plamaydi. "Ota-ona/vasiy" qatori
> API profil javobida shu maydonlar (parentPhone/parentName/extraPhone) kelgani uchun kiritildi.
> (Toza yechim — backend'da bu maydonlarni student-portal javobidan olib tashlash; shunda bu qatorni o'chirish mumkin.)

- **Data encrypted in transit:** Ha (HTTPS)
- **Users can request data deletion:** Ha (info@dafzentrum.uz orqali)
- **Push-bildirishnoma protsessori:** Expo (Expo Application Services / exp.host) push tokenni qabul qiladi; Android'da Google Firebase Cloud Messaging quyi transport. (Bu protsessorlar — "shared" emas, balki xizmat ko'rsatuvchi sifatida.)

## Content rating
- Ilova turi: **Education / Reference**
- Zo'ravonlik, kontent yoki foydalanuvchi muloqoti: yo'q
- Reklama: yo'q → "Does your app contain ads?" = **No**

## Target audience
- Asosiy yosh guruhi: **13+** (markaz o'quvchilari orasida 18 yoshgacha bo'lganlar bor — privacy policy 8-bo'limga mos; "18+ only" deb belgilamang).
- Bolalarga maxsus yo'naltirilmagan (Designed for Families EMAS).
- IARC content-rating savolnomasida: reklama = **Yo'q**, foydalanuvchi muloqoti/UGC = **Yo'q**.
