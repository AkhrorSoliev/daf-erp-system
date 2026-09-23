# Sozlamalar — dropdown o'rniga alohida sahifa (1-bosqich)

**Sana:** 2026-09-23
**Holat:** dizayn tasdiqlangan, amalga oshirilmagan
**Backend o'zgarishi:** yo'q
**ADR:** kerak emas — ma'lumot modeli, pul, filial qoidasi o'zgarmaydi; bu
navigatsiya tuzilishi, uning qoidasi `client/CLAUDE.md` ga yoziladi

---

## 1. Muammo

Sidebar'dagi «Sozlamalar» — dropdown. Uning ichida CEO uchun 12 ta punkt bor
([client/src/lib/nav-items.ts](../../../client/src/lib/nav-items.ts) →
`children: settingsChildren`). Har bir yangi sozlama sahifasi (Sabablar,
Avtomatik pauza, DaF normasi, To'lov) shu ro'yxatni uzaytirdi, u ochilganda
sidebar'ning qolgan bandlarini pastga surib yuboradi.

`/settings` ning o'zi esa sahifa emas:

- desktopda darhol `/settings/courses` ga redirect qiladi
  ([client/src/app/(dashboard)/settings/page.tsx](<../../../client/src/app/(dashboard)/settings/page.tsx>));
- telefonda `SettingsLayoutShell` o'rniga `SettingsMobileMenu` ro'yxatini
  chizadi.

Ya'ni bo'limlar ro'yxati sahifa sifatida faqat telefonda bor, kompyuterda esa
faqat sidebar dropdown'ida.

## 2. Maqsad va chegara

Uzoq maqsad — bitta katta «Sozlamalar»: butun tizim shu yerdan boshqariladi.
Bu hujjat faqat **1-bosqichni** qamraydi — dropdown'ni sahifaga aylantirish.

1-bosqichdan keyin:

1. Sidebar'da «Sozlamalar» — oddiy havola, dropdown yo'q.
2. `/settings` — telefon va kompyuter uchun bitta sahifa: bo'limlar va ularning
   ichida punktlar ro'yxati.
3. Punktga bosilsa — hozir dropdown'dan ochiladigan sahifaning aynan o'zi
   ochiladi. Ichki sahifalar o'zgarmaydi.

1-bosqichga **kirmaydi**: ichki sahifalarni o'zgartirish; bo'limlarni qayta
guruhlash yoki nomlash; yangi sozlama qo'shish; boshqa joydagi sozlamalarni shu
yerga ko'chirish; «Moliya» va «Hisobotlar» dropdown'lari.

## 3. Ko'rinish

Ro'yxat ko'rinishi, har bir qatorda nom va qisqa izoh (CEO ko'rinishi):

```
Sozlamalar
Tizim sozlamalari va boshqaruv

ADMINISTRATSIYA
┌──────────────────────────────────────────────────────────┐
│ ▣  Kurslar                                             › │
│    Kurslarni boshqarish va yangi kurs qo'shish           │
├──────────────────────────────────────────────────────────┤
│ ▣  Xonalar                                             › │
│    Filiallardagi xonalarni boshqarish                    │
├──────────────────────────────────────────────────────────┤
│ ▣  Dam olish kunlari                                   › │
│    Rasmiy bayramlar va dam olish kunlari                 │
├──────────────────────────────────────────────────────────┤
│ …  Sabablar, Avtomatik pauza, Arxiv, DaF normasi         │
└──────────────────────────────────────────────────────────┘

CEO
┌──────────────────────────────────────────────────────────┐
│ ▣  Kompaniya ma'lumotlari                              › │
│    Kompaniya nomi, telefon va asosiy ma'lumotlar         │
├──────────────────────────────────────────────────────────┤
│ …  Xodimlar, Filiallar, Telegram guruhlar, To'lov        │
└──────────────────────────────────────────────────────────┘
```

- Sarlavha — «Sozlamalar», ostida «Tizim sozlamalari va boshqaruv» (hozirgi
  mobil sarlavha matni).
- Bo'lim nomi — kichik, katta harflarda, kulrang (hozirgi mobil menyu uslubi).
- Bo'lim ichida ramkali ro'yxat, qatorlar chiziq bilan ajratilgan.
- Qator: ikonka · nom · nom ostida izoh · `›`. Butun qator — bitta havola.
- Desktopda ro'yxat kengligi `max-w-3xl` (~768px) bilan cheklanadi — qator
  butun ekranga cho'zilmaydi. Telefonda izoh ikki qatorga o'tishi mumkin, u
  kesilmaydi.
- Bo'limlar tartibi va nomlari hozirgidek: «Administratsiya», «CEO».

### Izohlar

Har bir sahifaning hozirgi sarlavha matnidan qisqartirilgan:

| Punkt                  | Izoh                                                      |
| ---------------------- | --------------------------------------------------------- |
| Kurslar                | Kurslarni boshqarish va yangi kurs qo'shish               |
| Xonalar                | Filiallardagi xonalarni boshqarish                        |
| Dam olish kunlari      | Rasmiy bayramlar va dam olish kunlari                     |
| Sabablar               | Guruhdan chiqarish, o'tkazish va ustoz almashish sabablari |
| Avtomatik pauza        | Ketma-ket dars qoldirgan o'quvchini pauzaga o'tkazish     |
| Arxiv                  | O'chirilgan ma'lumotlar                                   |
| DaF normasi            | O'quvchi ilovada qancha ishlashi kerakligi                |
| Kompaniya ma'lumotlari | Kompaniya nomi, telefon va asosiy ma'lumotlar             |
| Xodimlar               | Xodimlarni boshqarish va rollarni belgilash               |
| Filiallar              | Filiallarni boshqarish va yangi filial qo'shish           |
| Telegram guruhlar      | Botga ulangan Telegram guruhlar                           |
| To'lov                 | Kurs to'lov modeli va hisob-kitob qoidalari               |

## 4. Qanday quriladi

Yondashuv: hozirgi mobil menyu hamma ekran uchun umumiy sahifaga aylanadi.
Ma'lumot manbai bitta — `settings-nav.ts`.

| Fayl                                                                                  | O'zgarish                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/src/lib/settings-nav.ts`                                                      | `SettingsNavItem` ga majburiy `description: string`; hech kim ishlatmaydigan `children` maydoni olib tashlanadi; yangi sof funksiya `getVisibleSettingsSections(roleIds)` |
| `client/src/lib/nav-items.ts`                                                         | «Sozlamalar» bandidan `children` va `settingsChildren` olib tashlanadi — `AppSidebar` uni oddiy havola sifatida chizadi                                                   |
| `client/src/components/settings/settings-mobile-menu.tsx` → `settings-menu.tsx`       | `SettingsMenu` — hamma ekran uchun; filtrni `getVisibleSettingsSections` dan oladi; qatorga izoh qo'shiladi                                                               |
| `client/src/app/(dashboard)/settings/page.tsx`                                        | Redirect o'chadi. Server Component: sarlavha + `<SettingsMenu />`                                                                                                        |
| `client/src/components/settings/settings-layout-shell.tsx`                            | «telefon + `/settings`» shoxi va unga tegishli importlar o'chadi; rol himoyalari o'zgarmaydi                                                                              |
| `client/CLAUDE.md`                                                                    | Qoida: yangi sozlama sahifasi `settings-nav.ts` ga izohi va `visibleForRoles` bilan qo'shiladi va `/settings` da o'zi chiqadi; sidebar'ga alohida band qo'shilmaydi        |

[client/src/components/app-sidebar.tsx](../../../client/src/components/app-sidebar.tsx)
ga tegilmaydi: `children` yo'q band u yerda allaqachon oddiy havola bo'lib
chiziladi va `pathname.startsWith("/settings")` bilan faol (active) bo'ladi —
ya'ni `/settings/courses` ichida ham «Sozlamalar» yonib turadi.

### `getVisibleSettingsSections(roleIds: number[])`

- Punkt: `visibleForRoles` yo'q bo'lsa — hammaga ko'rinadi; bor bo'lsa — kamida
  bitta rol mos kelsa.
- Punktlari qolmagan bo'lim natijaga kirmaydi.
- Sof funksiya — React va `useAuth` ga bog'liq emas, shuning uchun vitest'da
  to'g'ridan-to'g'ri tekshiriladi. Hozir bu filtr `SettingsMobileMenu` ichida
  yozilgan; u shu funksiyaga ko'chadi.

## 5. Rollar

Kim nimani ko'rishi **o'zgarmaydi** — `visibleForRoles` qiymatlari aynan
saqlanadi.

| Rol                  | Ko'radigan punktlar                                                       |
| -------------------- | ------------------------------------------------------------------------- |
| CEO (1)              | 12 ta — hammasi                                                           |
| Filial direktori (2) | 10 ta — Arxiv va DaF normasidan tashqari                                  |
| Administrator (3)    | 5 ta — Kurslar, Xonalar, Dam olish kunlari, Sabablar, Kompaniya ma'lumotlari |

Sidebar'dagi «Sozlamalar» bandi hozirgidek faqat 1, 2, 3 rollarga ko'rinadi.

`SettingsLayoutShell` dagi himoyalar o'zgarmaydi: faqat-o'qituvchi → `/`;
Administrator → Xodimlar va Filiallar yopiq; faqat CEO → Arxiv, DaF normasi;
CEO va filial direktori → To'lov. To'silgan foydalanuvchi `/settings` ga
qaytariladi — endi bu ro'yxat sahifasi (oldin desktopda Kurslarga tushib
qolardi).

## 6. Chekka holatlar

- **Sahifa qayta yuklanganda** `useAuth` foydalanuvchini cookie'dan
  `useEffect` ichida o'qiydi, shuning uchun birinchi render'da `user` —
  `null`. Shu lahzada `SettingsMenu` hech narsa chizmaydi; aks holda avval 3 ta
  ochiq punkt, keyin qolganlari chiqib, ro'yxat sakrardi. Sidebar orqali
  o'tilganda `user` allaqachon bor — kechikish yo'q.
- **Orqaga qaytish** uchun yangi kod kerak emas: desktopda breadcrumb'dagi
  «Sozlamalar» (`/settings`), telefonda `DashboardHeader` dagi «← Sozlamalar»
  — ikkalasi endi shu sahifaga olib boradi.
- **Global qidiruv** (`searchable-pages.ts` → «Sozlamalar» → `/settings`) ham
  endi shu sahifani ochadi.
- **Kassir (5)** «Sozlamalar»ni sidebar'da ko'rmaydi, lekin `/settings` ni
  qo'lda ochsa, shell uni to'smaydi (u faqat o'qituvchini to'sadi): hozir
  desktopda Kurslar sahifasiga, telefonda ro'yxatga tushadi, o'zgarishdan keyin
  ro'yxatda 3 ta ochiq punktni ko'radi. Yangi kirish yo'li ochilmayapti — bu
  eski holat, 1-bosqichda o'zgartirilmaydi (8-bo'limga qarang).

## 7. Tekshiruv

**Vitest** — `client/src/lib/settings-nav.test.ts`:

- CEO → 12 punkt, 2 bo'lim.
- Filial direktori → 10 punkt; Arxiv va DaF normasi yo'q.
- Administrator → «Administratsiya»da 4 ta (Kurslar, Xonalar, Dam olish
  kunlari, Sabablar), «CEO»da 1 ta (Kompaniya ma'lumotlari).
- Rolsiz (`[]`) → faqat 3 ta ochiq punkt, «CEO» bo'limi natijada yo'q.
- Bir nechta rol (`[3, 5]`) → rollar birlashmasi (Administrator bilan bir xil).
- Har bir punktda bo'sh bo'lmagan izoh bor.

**Vitest** — `client/src/lib/nav-items.test.ts`: `navItems` dagi «Sozlamalar»
bandida `children` yo'q — dropdown qaytib qo'shilmasin.

**Buyruqlar** (`client/` ichida): `npm test`, `npx eslint src`,
`npm run build`.

**Brauzerda**: desktop va telefon kengligida `/settings` — sidebar'da dropdown
yo'q, qatorga bosish sahifani ochadi, breadcrumb'dagi «Sozlamalar» ro'yxatga
qaytaradi.

## 8. Keyingi bosqichlar uchun

- Bo'limlarni qayta guruhlash va nomlash. «CEO» bo'limini Administrator ham
  ko'radi (Kompaniya ma'lumotlari) — nom chalg'itadi. Desktop foydalanuvchilari
  bo'lim nomlarini shu bosqichdan boshlab birinchi marta ko'radi.
- Boshqa joydagi sozlamalarni shu sahifaga ko'chirish (masalan,
  `/payments/salary/config` — «Oylik belgilash»).
- Sahifa ichida qidiruv — punktlar soni ko'payganda.
- Kassir va boshqa ruxsatsiz rollar uchun `/settings` ni butunlay yopish —
  RBAC qoidasiga ko'ra frontend va backend'da birga.
