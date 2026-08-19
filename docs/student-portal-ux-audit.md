# O'quvchi portali — UX/UI auditi

**Sana:** 2026-08-19
**Qamrov:** `client/src/app/(student-portal)/portal/*` va `client/src/components/student-portal/*` (9 sahifa, ~2500 qator)
**Holat:** topilmalar ro'yxati — fazalarga bo'lingan, Faza 1 spec qilingan

Bu hujjat o'quvchi portalining butun UX/UI holatini qayd etadi. Har bir topilma
kod bilan tasdiqlangan. Fazalar bo'yicha tartib 8-bo'limda.

---

## 1. Umumiy qatlam — barcha sahifalarga tegishli

### U1. Ikki dizayn tizimi aralashgan

Portal `.lumio` scope ichida ishlaydi va o'zining primitivlari bor
(`client/src/components/student-portal/lumio/`). Lekin barcha modal va tooltip
admin shadcn to'plamidan olinadi va `className="lumio"` bilan yamaladi:

| Joy | Nima ishlatiladi |
|---|---|
| `student-settings-page.tsx` | `Dialog` + `DialogContent className="lumio sm:max-w-sm"` (2 marta) |
| `student-logout-button.tsx` | `AlertDialog` + `AlertDialogContent className="lumio"` |
| `lumio/side-rail.tsx` | `ThemeToggle` — lucide ikonkalari, `border-input` / `bg-accent` admin token'lari |

Ayni paytda Lumio'ning o'z `BottomSheet` komponenti bor
(`lumio/bottom-sheet.tsx`) — portalda **hech qayerda ishlatilmaydi**.

Natija: kartalar Lumio ko'rinishida, ular ochadigan oynalar esa admin
ko'rinishida.

### U2. Desktopda sahifalarning yarmi bo'sh

Kontent ustuni `lg:max-w-[980px]`
(`student-portal-layout.tsx:52`), lekin `lg:grid-cols-2` faqat ikki sahifada
ishlatiladi.

| Sahifa | Desktop tuzilishi |
|---|---|
| To'lovlar | 2 ustun ✅ |
| Jadval | dars kartalari 2 ustun ✅ |
| Asosiy | qisman (bugungi darslar + guruhlar 2 ustun) |
| Sozlamalar, Profil, Davomat, FAQ, Biz haqimizda | **bitta tor stack 980px ga cho'zilgan** ❌ |

Matn qatorlari o'qish uchun qulay chegaradan (~65–75 belgi) ancha uzun bo'lib
ketadi.

### U3. `backHref` nomuvofiq

| Sahifa | `backHref` |
|---|---|
| Sozlamalar, Profil, FAQ, Biz haqimizda | `/portal/more` |
| Davomat | `/portal` |

Davomatga «Ko'proq» dan ham kiriladi — u holda orqaga tugmasi foydalanuvchini
boshqa joyga tashlaydi. Desktopda esa `/portal/more` sahifasi rail'da umuman
yo'q, ya'ni foydalanuvchi hech qachon ko'rmagan ekranga tushadi.

### U4. Xato holati faqat Asosiy sahifada bor

`student-home-page.tsx` `isError` ni tekshiradi va «Qayta urinish» tugmasini
ko'rsatadi. Qolganlari tekshirmaydi:

```
schedule:   const { data: schedule = [], isLoading } = useQuery(...)
attendance: const { data, isLoading } = useQuery(...)
payments:   const { data, isLoading } = useQuery(...)
```

Tarmoq uzilganda o'quvchi «Bu hafta darslar yo'q» yoki bo'sh davomat ko'radi —
ya'ni **xatolik ma'lumot yo'qligi bo'lib ko'rinadi**.

### U5. `staleTime` yo'q

`lib/queries.ts` dagi `useStudentProfile` va sahifalardagi barcha `useQuery`
chaqiruvlari standart sozlama bilan ishlaydi. Sahifalar orasida yurganda har
safar qayta so'rov ketadi.

---

## 2. Asosiy (`/portal`)

| # | Topilma |
|---|---|
| H1 | `FadeIn` indekslari 0, 2, 3, 4 — `index={1}` tushib qolgan, animatsiya ritmida bo'shliq |
| H2 | Balans hero'sida «To'ldirish» tugmasi qarz holatida ham bir xil urg'uda |
| H3 | «Bugungi darslar» bo'sh bo'lsa `EmptyState` emas, oddiy `<p>` matn — portalning qolgan qismidan farq qiladi |
| H4 | Guruh kartasi karta ko'rinishida, lekin bosilmaydi — guruh tafsiloti ekrani yo'q |

---

## 3. Jadval (`/portal/schedule`)

### S1. ⚠️ Jadval haqiqiy darslarni ko'rsatmaydi — eng og'ir funksional bo'shliq

`student-schedule-view.tsx` jadvalni **faqat `exactDays` (haftaning takrorlanuvchi
kunlari) dan generatsiya qiladi**:

```ts
const classes = schedule.filter((s) =>
  s.exactDays.some((d) => WEEKDAY_INDEX[d.toLowerCase()] === dayIndex),
)
```

Serverda quyidagi modullar mavjud, lekin portal ulardan **hech birini
so'ramaydi**:

- `server/src/lesson-cancellations/` — bekor qilingan darslar
- `server/src/lesson-reschedules/` — ko'chirilgan darslar
- `server/src/holidays/` — bayramlar

Natija: **o'quvchi bekor qilingan darsga kelib qolishi mumkin**, ko'chirilgan
darsni esa ko'rmaydi.

### Qolgan topilmalar

| # | Topilma |
|---|---|
| S2 | Darsi yo'q kunlar butunlay yashiriladi (`.filter(({ classes }) => classes.length > 0)`) — hafta «teshik» bo'lib ko'rinadi, dam olish kuni tushunchasi yo'q |
| S3 | «Bugunga qaytish» tugmasi karta tashqarisida `-mt-1` bilan yopishtirilgan — tasodifiy joylashuv |
| S4 | Hafta o'tishida chegara yo'q — 2030-yilga ham, 2019-yilga ham cheksiz varaqlash mumkin |

---

## 4. To'lovlar (`/portal/payments`)

| # | Topilma |
|---|---|
| P1 | Summa maydoni xom `<input>` — Lumio `Field`/`Input` ishlatilmagan, `<label>` ham, `aria-label` ham yo'q. Ekran o'quvchi uchun nomsiz maydon |
| P2 | Tez summalar 100k–700k qat'iy. **Qarz miqdoriga moslashmaydi** — qarzi 1.2M bo'lsa foydalanuvchi qo'lda kiritishi kerak. «Qarzni yopish» tugmasi yo'q |
| P3 | Tranzaksiya tarixi filtrsiz va sahifalanmaydi — server nechta qaytarsa, hammasi bir ro'yxatda |
| P4 | Har qatorning pastidagi `balanceAfter` raqami izohsiz — foydalanuvchi u nima ekanini bilmaydi |
| P5 | Uzum Bank «Tez kunda» bloki har doim ko'rinadi — o'lik piksel |
| P6 | To'lov shlyuzidan qaytganda `toast.success("Balansingiz tekshirilmoqda...")` chiqadi. Natija hali noma'lum, lekin signal muvaffaqiyat rangida |

---

## 5. Davomat (`/portal/attendance`)

| # | Topilma |
|---|---|
| A1 | `EXCUSED` rangi **uch xil**: `Badge tone="sky"`, `ProgressBar` da `var(--ink-400)`, `StatCell` da `var(--ink-500)` |
| A2 | 75% / 50% chegaralari (`percentColor`) hech qayerda tushuntirilmagan — qizil ko'rgan o'quvchi nima qilishini bilmaydi |
| A3 | Yozuvlar oy bo'yicha guruhlanmaydi, filtr yo'q, chegara serverga bog'liq |
| A4 | `backHref="/portal"` — «Ko'proq» dan kirgan foydalanuvchi Asosiy sahifaga tushadi (U3 ning bir ko'rinishi) |

---

## 6. Ko'proq (`/portal/more`)

| # | Topilma |
|---|---|
| M1 | Menyu ro'yxati **dublikat**: `student-more-hub.tsx:14-20` dagi `MENU` massivi `lib/student-nav-items.ts` dagi `moreNavItems` bilan qo'lda takrorlangan. Yangi punkt ikki joyda qo'shilishi kerak — yagona manba buzilgan |
| M2 | Desktopda bu sahifa «yetim»: rail'da barcha punktlar bevosita bor, «Ko'proq» yo'q — lekin sahifa mavjud va boshqa ekranlarning orqaga tugmasi unga qaytaradi |

---

## 7. FAQ / Biz haqimizda / AI

| # | Topilma |
|---|---|
| F1 | FAQ akkordeon emas — 5 savol ochiq holda, ro'yxat o'sganda skanlash qiyinlashadi |
| F2 | **FAQ javoblari eskirgan yo'llarni ko'rsatadi:** «Ko'proq → To'lovlar bo'limiga kiring» — aslida To'lovlar pastki navigatsiyada alohida tab. «Galereya yoki kameradan rasm tanlang» — bu native ilova matni, webda kamera yo'q |
| F3 | `APP_VERSION = "1.0.0"` qo'lda yozilgan, `package.json` bilan bog'lanmagan |
| F4 | Aloqa telefoni va Telegram manzili kodda qattiq yozilgan |
| AI1 | AI sahifasi sarlavhasi nemischa («Dein KI-Assistent»), portalning qolgan qismi o'zbekcha |

---

## 8. Fazalar

| Faza | Mazmun | Topilmalar | Holat |
|---|---|---|---|
| **1** | Sozlamalar + Profil chegarasi, mavzu boshqaruvini birlashtirish | Q1–Q4 (pastdagi «Faza 1» bo'limi) | **BAJARILDI — 2026-08-19** (branch `feat/portal-settings-profile-rework`, deploy qilinmagan) |
| 2 | Umumiy qatlam: Lumio modal, xato holatlari, desktop kenglik, `backHref`, `staleTime` | U1, U2, U3, U4, U5 | kutmoqda |
| 3 | Jadval: bekor qilingan / ko'chirilgan darslar va bayramlar | S1, S2, S3, S4 | kutmoqda |
| 4 | To'lovlar: qarzga moslashgan summalar, tarix filtri, a11y | P1–P6 | kutmoqda |
| 5 | Davomat + Asosiy sahifa | A1–A4, H1–H4 | kutmoqda |
| 6 | FAQ/About kontenti, Ko'proq dublikati, AI tili | F1–F4, M1, M2, AI1 | kutmoqda |

---

## Faza 1 — Sozlamalar va Profil

Faza 1 alohida topilma raqamlari bilan emas, quyidagi to'rt muammo bilan
tavsiflanadi. To'liq dizayn:
`docs/superpowers/specs/2026-08-19-student-portal-settings-profile-design.md`.

**Q1. Mavzu boshqaruvi ikki joyda, ikki xil «til»da.**

| | Desktop rail footer | Sozlamalar sahifasi |
|---|---|---|
| Komponent | `ThemeToggle` (`components/theme-toggle.tsx`) | `SegmentedControl` (`lumio/segmented-control.tsx`) |
| Ikonka to'plami | lucide | Phosphor |
| Dizayn tizimi | shadcn/admin token'lari | Lumio token'lari |
| O'zaro ta'sir modeli | **aylanma**: yorug' → qorong'i → tizim | **3 tadan bittasini tanlash** |
| Yorlig'i | yo'q, faqat tooltip | matnli |

Bitta `next-themes` holati, ikkita mental model. Mobilda rail yo'q — ya'ni mavzu
faqat Sozlamalarda, ikki daraja chuqurda.

**Q2. Sozlamalar sahifasida bo'lim guruhlari yo'q.** Bir ekranda uch xil idiom:
`Card` + `<h2>` (Mavzu), `Card` + inline tugma (Rasm), ikkita yalang'och
`ListRow` (Ism, Parol). Native ilovada bo'lim sarlavhalari bor
(`student-app/src/app/settings.tsx` — «Mavzu», «Boshqa»), webda yo'q.

**Q3. Profil ↔ Sozlamalar chegarasi noaniq.**

| Amal | Profil | Sozlamalar |
|---|---|---|
| Rasm yuklash | ✅ | ✅ (takror) |
| Rasm o'chirish | ✅ | ❌ |
| Ism o'zgartirish | ❌ (faqat ko'rinadi) | ✅ |
| Telefon / Login / Telegram / Filial | ✅ ko'rish | ❌ |
| Parol | ❌ | ✅ |

**Q4. «Parolni o'zgartirish» qatorining subtitle'i yolg'on gapiradi** — «Login va
parol sozlamalari» deydi, lekin login u yerda na ko'rsatiladi, na o'zgartiriladi.
