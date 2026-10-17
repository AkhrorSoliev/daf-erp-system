# ADR-0100 — Teilnahmebestätigung: qatnashganlik hujjati davomat va ilova bo'yicha, natija muhrlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0044 (darajani tugatgan o'quvchi), ADR-0054 (davomat), ADR-0028 (huquq bazadan o'qiladi), ADR-0079 (imkoniyat, rol emas), ADR-0096 (muhrlangan natija), `docs/superpowers/specs/2026-10-17-teilnahmebestaetigung-design.md`, `server/src/participation-certificates/`

## Kontekst

O'quvchi darajani (A1, A2, B1…) tugatgach markaz unga qatnashganlik hujjati — Teilnahmebestätigung — beradi. Tizimda na hujjat, na uni berish qoidasi bor edi; ADR-0044 faqat «Darajani tugatdi» deb pul qoidasini aytadi. Hujjat «qatnashdi» deydi, «o'tdi» demaydi: imtihon yoki mock natijasi uni shartlamaydi, aks holda u sertifikatga aylanib ketadi. Daraja tugaganini tizim o'zi bilmaydi (ADR-0044), shuning uchun uni administrator tasdiqlaydi.

## Qaror

1. Shart: davomat ≥ 80% (sababli kelmagan va bekor bo'lgan darslar maxrajdan chiqariladi; oldindan aytilgan «sababsiz» kelmagan) VA ilova sharti (hujjat kunida ochiq darslarning belgilangan foizi; kontenti yo'q darajada shart o'chiq). Chegaralar `Setting` jadvalida (`participation.minAttendancePercent`, `participation.minAppPercent.A1|A2|B1`), faqat CEO yozadi.
2. Hisob bitta sof funksiyada (`participation-rules.ts`); foiz butun sonlar bilan solishtiriladi, 79,9 80 ga yetmaydi.
3. Hujjat berilganda hisob `ParticipationCertificate.snapshot` ga MUHRLANADI; PDF faqat shundan chiziladi. Keyingi davomat tuzatishi berilgan hujjatni o'zgartirmaydi. Raqam `TB-YYYY-NNNN`: Toshkent yili va kompaniya bo'yicha ketma-ketlik (`@@unique([companyId, year, seq])`); berish o'quvchi tarixiga `QATNASHISH_HUJJATI_BERILDI` bilan, hujjat bilan bitta tranzaksiyada yoziladi.
4. Imtihon, mock, kech qolish va ilova faol vaqti SHART EMAS: hujjatda ma'lumot sifatida chiqadi (faol vaqt daraja bo'yicha ajratib bo'lmagani uchun chiqmaydi).
5. Administrator tugma bilan beradi; shart bajarilmasa faqat CEO sabab yozib istisno beradi (rol bazadan o'qiladi).
6. Hujjat DaF Sprachzentrum nomidan; filial, rahbar imzosi va muhr yozilmaydi. QR ochiq `/t/<uuid>` sahifaga olib boradi (ketma-ket raqam emas, taxmin qilib bo'lmaydigan UUID); sahifa filial, tug'ilgan sana va foizlarni ko'rsatmaydi.
7. Yangi imkoniyat kaliti yo'q: `students.details` (o'qish), `students.manage` (berish), sozlamalar `@CeoOnly()`. Yo'llar: `GET /students/:id/participation-certificates/preview`, `POST /students/:id/participation-certificates`, `GET /participation-certificates/:id/pdf`, `GET|PATCH /participation-certificates/settings`, ochiq `GET /participation-certificates/:id/verify`.
8. Shrift: IBM Plex Serif + IBM Plex Sans (OFL), 4 fayl `server/assets/fonts/`.
9. CEO javoblari (2026-10-17), qoida o'zgarmaydi: mock natijasi faqat natijasi e'lon qilingan imtihondan (`ANNOUNCED`, yoki undan keyingi `ARCHIVED`) va CEO ning doimiy «natijalar auditoriyasi» qoidasi bo'yicha (`RESULTS_AUDIENCE`, 25.09: faqat to'lagan yoki to'lovi 0 bo'lgan qatnashchi natija oladi) olinadi, chunki muhrlangan hujjatda hali o'zgarishi mumkin ball turmasligi kerak; «Abschlusstests» qatori kamida bitta yakuniy sinov topshirilganda chiqadi; istisno bilan berilgan hujjatda tasdiq jumlasidan «regelmäßig» tushadi, boshqa belgi qo'shilmaydi; hujjat ekranda o'zbekcha «Qatnashganlik hujjati» deb ataladi (nemischa nom faqat PDF ichida); daraja uchun hujjat allaqachon berilgan bo'lsa yangisini berishdan oldin tasdiq so'raladi va u yangi raqam oladi.

## Ko'rib chiqilgan muqobillar

- Imtihon va mockni shart qilish: hujjat «o'tdi» ma'nosiga o'tib ketadi, daraja imtihoni balli saqlanmaydi.
- Chegara jadvali: `Setting` tizimi bor, yangi jadval keraksiz.
- Hujjatni har safar jonli ma'lumotdan chizish: keyin tuzatilgan davomat berilgan hujjatni o'zgartirardi.

## Oqibatlari

Yutuq: bir qoida, tekshiriladigan hujjat, o'zgarmas raqamlar. Narx: ilova sharti hozir faqat A1 ning ochiq darslarida ma'noli; ilovadan foydalanuvchi kam bo'lgani uchun CEO chegarani tushirishi yoki istisno berishi mumkin. Bekor qilish yo'li (`revokedAt` ustuni bor) hali yo'q.
