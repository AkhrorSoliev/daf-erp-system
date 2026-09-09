# Lid qo'shimcha telefon raqami — dizayn

Sana: 2026-09-09

## Muammo

Lid qo'shish drawer'i faqat 5 ta maydonni oladi: Ism, Familya, Telefon,
Bo'lim, Manba. O'quvchi tahrirlash drawer'ida esa «Qo'shimcha ma'lumotlar»
paneli bor — ikonka bosilganda ixtiyoriy maydon ochiladi. Admin lid bilan
gaplashganda ikkinchi raqamni yozib qo'yadigan joy yo'q, shuning uchun u
izohga tushadi yoki umuman yo'qoladi.

## Qamrov

Faqat **qo'shimcha telefon raqami**. Boshqa maydonlar (o'quv joyi, manzil,
pasport, ota-ona) bu ishga kirmaydi.

`Lead` jadvalida `gender`, `telegram`, `parentName`, `parentPhone`
allaqachon bor, lekin ularni to'ldiradigan oyna yo'q. Ular shu holicha
qoladi — kelajakda kerak bo'lsa, xuddi shu panelga ikonka qo'shiladi.

## Qaror

### 1. Ma'lumotlar bazasi

`Lead` modeliga bitta ustun:

```prisma
extraPhone String?
```

Nullable — mavjud lidlarga tegmaydi, ma'lumot ko'chirish kerak emas.
Migratsiya `prisma migrate diff` + `db execute` + `migrate resolve` orqali
(bu repoda `migrate dev` ishlamaydi).

### 2. Backend — `server/src/leads/`

| Fayl | O'zgarish |
|---|---|
| `dto/create-lead.dto.ts` | `extraPhone?: string` — `@IsOptional()` + `@Matches(/^\d{9}$/)`, o'quvchi DTO'sidagi xabar bilan bir xil |
| `dto/update-lead.dto.ts` | xuddi shunday; bo'sh satr = tozalash (`sourceId` naqshi) |
| `leads.service.ts` `create()` | `extraPhone: dto.extraPhone || null` |
| `leads.service.ts` `update()` | `dto.extraPhone !== undefined` bo'lsa yozadi; `EntityHistory` old/new qiymatlariga qo'shiladi |
| `leads.service.ts` `findOne()` | select'ga `extraPhone` (detal drawer) |
| `leads.service.ts` `findAll()` | select'ga `extraPhone` (jadval ko'rinishi tahrirlash uchun uzatadi) + qidiruv `OR` iga `{ extraPhone: { contains: search } }` |
| `leads.service.ts` `convert()` | `extraPhone: lead.extraPhone ?? undefined` → `studentsService.create` |

`LEAD_CARD_SELECT` ga **qo'shilmaydi**: doska kartasida raqam ko'rinmaydi,
har bir karta payloadini shishirish keraksiz.

Telefon 9 xonali xom raqam sifatida saqlanadi (`+998` siz) — `Student.phone`
va `Lead.phone` bilan bir xil, `PhoneInput` shu formatda chiqaradi.

### 3. Frontend — `client/src/components/leads/`

**Yangi: `lead-additional-fields.tsx`**

O'quvchidagi `EditStudentAdditionalFields` naqshi, bitta maydon uchun:

- «+ QO'SHIMCHA MA'LUMOTLAR» sarlavhasi
- Telefon ikonkasi (tooltip: «Qo'shimcha telefon»)
- Bosilganda `PhoneInput` ochiladi; qayta bosilsa maydon tozalanadi va yopiladi
- Qiymat allaqachon bo'lsa (tahrirlash) panel ochiq holda ko'rinadi

Komponent `UseFormReturn` qabul qiladi, shuning uchun ikkala drawer bitta
komponentni ishlatadi — takror kod yo'q.

**O'zgaruvchi fayllar**

| Fayl | O'zgarish |
|---|---|
| `add-lead-drawer.tsx` | `AddLeadValues` ga `extraPhone`; manba maydonidan keyin panel; POST payloadiga `extraPhone: values.extraPhone \|\| undefined` |
| `edit-lead-drawer.tsx` | `EditLeadValues` ga `extraPhone`; `reset()` mavjud qiymat bilan; PATCH payloadiga qo'shiladi |
| `hooks/use-leads-ui.ts` | `EditLeadTarget` ga `extraPhone: string` |
| `leads-list.tsx` | `LeadListRow` ga `extraPhone`; `openEditLead` ga uzatiladi |
| `lead-detail-drawer.tsx` | detal tipiga `extraPhone`; «Telefon» qatoridan keyin «Qo'shimcha telefon» `DetailRow` — faqat qiymat bo'lsa; `openEditLead` ga uzatiladi |

### 4. Testlar

`leads.service.spec.ts` ga uchta holat:

1. `create()` — `extraPhone` berilganda bazaga yoziladi
2. `update()` — bo'sh satr yuborilganda `null` ga tushadi
3. `convert()` — lidning `extraPhone` i yangi o'quvchiga ko'chadi

### 5. Chiqarish tartibi

1. Alohida worktree'da ishlanadi (`feat/lid-qoshimcha-telefon`)
2. PR → ko'rik → merge
3. **Avval** prod migratsiyasi (`db execute` + `migrate resolve`)
4. Keyin backend: `railway up` (qo'lda, GitHub bilan bog'lanmagan)
5. Keyin frontend: Vercel

Migratsiya nullable ustun qo'shadi, shuning uchun eski backend bilan ham
xavfsiz — tartib buzilsa ham hech narsa sinmaydi.

## Rad etilgan variantlar

- **Doim ko'rinadigan ixtiyoriy maydon** — sodda, lekin formani uzaytiradi va
  o'quvchi oynasidagi naqshdan ajralib qoladi.
- **O'quvchidagi to'liq to'plam (o'quv joyi, manzil, pasport)** — `Lead` ga
  4 ta ustun qo'shishni talab qiladi, hozircha kerak emas (YAGNI).
