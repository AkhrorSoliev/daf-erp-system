# Arxiv: arxivdagi o'quvchi/guruhni ko'rish va arxivga kelish sababi

Sana: 2026-10-18. Sahifa: `/settings/archive`.

## Muammo

- Arxiv ro'yxatida qatorni bosib bo'lmaydi. Arxivdagi o'quvchi va guruh sahifalari 404 beradi (`deletedAt: null` filtri).
- Arxivga qanday sabab bilan tushgani ko'rinmaydi. Ma'lumot esa allaqachon bor: o'quvchi arxivlanganda sabab majburiy (`Student.statusChangeReason`), guruhda yoziladi (`Group.statusChangeReason`, yozilmasa «O'chirildi»).

## Qaror (CEO bilan kelishilgan, 18.10.2026)

- Faqat **O'quvchilar** va **Guruhlar** turlari uchun.
- «Kirib ko'rish» = yon oyna, faqat ko'rish. To'liq profil sahifasi emas.
- Sabab: faqat o'quvchi va guruh. Xodim, kurs, xona, filial, bayram uchun keyinroq (hozir ularda doim «O'chirildi», ustun foydasiz).
- To'lovlar ro'yxati yon oynaga kirmaydi (YAGNI). Balans ko'rsatiladi.

## Ro'yxat (`ArchiveList`)

- `students` va `groups` turlarida «Sabab» ustuni: `item.statusChangeReason`. Bo'sh bo'lsa «—». Guruhda aynan «O'chirildi» bo'lsa ham «—» (sabab yozilmagan).
- Qator bosiladi (`cursor-pointer`, klaviatura: Enter/Space). Tiklash tugmasi qatorni bosishni ishga tushirmaydi (`stopPropagation`).
- Ochiq yon oyna URLda: `?type=students&id=10482`. Yangilash/havola shu yozuvga qaytaradi (`useUrlFilters` sxemasiga `id`). Yopganda `id` olib tashlanadi.
- Boshqa turlar o'zgarmaydi.

## Yon oyna (`ArchiveDetailSheet`, yangi fayl)

`SheetContent p-0 flex flex-col`: sarlavha `border-b`, o'rtada yagona skroll qismi, faol tab URLda `?atab=` (standart «Ma'lumot» URLga yozilmaydi; oyna yopilganda `atab` ham o'chadi).

- Sarlavha: nom, «O'quvchi · ID · Arxivda» / «Guruh · Arxivda».
- Arxiv bloki (sariq): arxivlangan sana (`dd.MM.yyyy, HH:mm`), kim tomonidan, sabab, «Qayta tiklash» (mavjud `AlertDialog` oqimi, xato matni `getErrorMessage`).
- Tab «Ma'lumot»:
  - O'quvchi: telefon (`formatPhone`), filial, balans (`formatBalance`), «Guruhlari» (yozilishlar: guruh nomi, holat, sana oralig'i).
  - Guruh: kurs, filial, ustoz(lar), «O'quvchilari (N)» (ism, yozilish holati).
  - Ro'yxat 10 tadan ko'p bo'lsa «yana N ta» deb sanaladi, sahifalanmaydi (oyna ichida kichik qism).
- Tab «Tarix»: mavjud `EntityHistoryTable` (`entityType` `Student` / `Group`), faqat tab ochilganda yuklanadi.
- Yuklanish: skeleton. Xato: «Ma'lumotni yuklab bo'lmadi» + «Qayta urinish».
- Barcha matn o'zbekcha (lotin). Tugma/ikonlarga tooltip.

## Server

`GET /archive/:entityType/:id` (`findOne`) mavjud, `@Can('settings.archive')`. O'zgarish faqat `getInclude`:

- `students`: `enrollments` (barcha holat, `include group { id, name }`, tartib `createdAt desc`, `take` 50) va `deletedBy` (bor).
- `groups`: `teachers` (`GroupTeacher` → `teacher { id, firstName, lastName }`), `enrollments` (`include student { id, firstName, lastName }`, `take` 50, `_count` alohida emas: jami son ro'yxat uzunligidan, 50 dan oshsa `enrollmentsTotal`).
- Ro'yxat (`findAll`) ham shu `include`ni ishlatadi. Ro'yxatga og'ir bo'lmasligi uchun detal include'i alohida funksiya `getDetailInclude` bo'ladi, `findOne` shuni oladi; `findAll` eski `getInclude`da qoladi.
- Yangi endpoint yo'q, yangi ruxsat yo'q. `archiveScope` (kompaniya) o'zgarmaydi.

## Ochiq savol (rejada tekshiriladi)

`GET /entity-history/:type/:id` arxivdagi yozuv uchun ishlaydimi (ruxsat tekshiruvi `deletedAt: null` ga tayanmasligi kerak). Tayansa, faqat arxiv uchun ruxsat tuzatiladi, boshqa joy buzilmaydi.

## Test

- Server: `archive-read.service` spec: `findOne` students/groups `include`ni so'raydi; boshqa kompaniyaning yozuvi 404; arxivda bo'lmagan yozuv 404.
- Client (vitest, node muhit): sof yordamchi `archive-reason.ts` — `reasonOf(type, item)` (bo'sh, «O'chirildi», haqiqiy matn) va yozilish/ o'quvchilar ro'yxatini qisqartirish (`first N + qolgani`).
- Qo'lda tekshiruv: brauzerda real ma'lumot (dev baza aldaydi: arxivdagi o'quvchi/guruh seed'da bo'lmasa o'zim arxivlab ko'raman), skrinshot yuboraman.

## Hujjat

- `client/src/qollanma/yangiliklar.ts` yangilik, tegishli sahifa matni va `yangilangan` sanasi.
- ADR kerak emas: ma'lumot modeli, pul, filial qoidasi o'zgarmaydi.

## Chegaralar

- Ruxsat o'zgarmaydi: arxiv `settings.archive` (CEO) bilan ochiladi.
- Yon oyna hech narsa yozmaydi, faqat mavjud «Qayta tiklash» chaqiriladi.
- Lidlar arxivi (`LeadsArchive`) o'zgarmaydi.
