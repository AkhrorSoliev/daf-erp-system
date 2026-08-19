# ADR-0002 — Noma'lum filial qamrovi hech narsani ko'rsatmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-07-29
**Bog'liq:** ADR-0001, ADR-0003, `server/src/salary/shared/payroll-branch-scope.ts`

## Kontekst

Oylik qamrovi kodida foydalanuvchining `mainBranch` maydoni bo'sh bo'lsa, filtr **umuman qo'yilmasdi**. Ya'ni «filial noma'lum» holati «filial filtri yo'q» ga aylanardi.

Natija: `mainBranch` NULL bo'lgan Filial direktori **barcha filiallarning** oyligini ko'ra olardi va `batchPay` bilan to'lay olardi. PRODda aynan shu holatda **ikkita Administrator** turgan edi.

Bir xil naqsh oylik, kassa hisoblari, qarzdorlar, outreach va qo'ng'iroq jurnalida takrorlangan edi.

## Qaror

Filial qamrovi **uch holatli** tur bilan ifodalanadi, ikki holatli emas:

```
{ kind: 'all' }                    // faqat CEO
{ kind: 'branch'; branchId: number }
{ kind: 'none' }                   // cheklangan, lekin filial noma'lum
```

`none` — bu qarorning butun mohiyati. U **hech narsani** ko'rsatmaydi va **hech narsani** to'lamaydi.

Pul yo'llari **fail-closed** bo'lishi shart: noma'lum qamrov — hech narsa, hammasi emas.

**Filiallar bo'ylab qonuniy o'tadigan yagona rol — CEO.** Administrator ilgari shu yerda turardi; bu ADR-0001 (D4/D6) ga zid edi: agar har bir filial o'z P&L'ini o'z tushumi, xarajati va oyligidan hisoblasa, unda filialga bog'lanmagan xodim modelda mavjud emas.

## Ko'rib chiqilgan muqobillar

**`mainBranch` NULL bo'lsa xato qaytarish.** Rad etildi: bu ishlab turgan foydalanuvchini butunlay bloklaydi. `none` esa tizimga kirishga ruxsat beradi, faqat bo'sh ro'yxat ko'rsatadi — muammo ko'rinadi, lekin xavfsiz.

**Har bir chaqiruv joyida `if (!branchId) return []` yozish.** Rad etildi: aynan shu takrorlanish nuqsonni beshta modulga tarqatgan edi. Qamrov bitta joyda hisoblanadi.

## Oqibatlari

**Yutuq:** noma'lum qamrov endi jimgina «hammasi» ga aylanmaydi. Nuqson bitta manbada tuzatilganda beshta modulda bir vaqtda yopildi.

**Narx:** `mainBranch` bo'sh xodim bo'sh ekran ko'radi. Bu ataylab — ma'lumot yetishmasligi ko'rinib turishi kerak.

**Endi taqiqlangan:** filial filtrini shartli qo'yish (`if (branchId) where.branchId = branchId`). Bu naqsh fail-open, va u qaytadi.
