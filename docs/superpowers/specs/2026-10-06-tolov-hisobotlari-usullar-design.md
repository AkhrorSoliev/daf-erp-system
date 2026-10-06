# To'lov hisobotlari: to'lov usullari va «Bugun» filtri

Sana: 06.10.2026. Sahifa: `/reports/payment-reports`. CEO bilan kelishilgan.

## Muammo

1. Sahifa tanlangan davrda qancha pul kelganini ko'rsatadi, lekin qaysi usulda
   (naqd, Payme, Click, o'tkazma, Uzum) kelganini ko'rsatmaydi.
2. Filtrda yil, oy va «Boshi — Oxiri» bor. Bugungi yoki kechagi tushumni ko'rish
   uchun ikkita sanani qo'lda tanlash kerak.
3. Kartalar ostidagi «o'tgan oyga nisbatan» yozuvi har doim shunday chiqadi.
   Server esa tanlangan davrni undan oldingi xuddi shuncha uzun davr bilan
   solishtiradi: «Bugun» kechagi kun bilan, oktabr (31 kun) 31.08–30.09 bilan.
   Yozuv yolg'on gapiradi (hisobot-moslik auditi, H32).

## Qaror

### 1. «To'lov usullari» kartasi

- Bitta karta: har usul uchun summa, to'lovlar soni va ulushi (%), pastida
  «Jami» qatori.
- Manba — `Payment`, filtr «Jami to'lov summasi» bilan bir xil: `COMPLETED`,
  `createdAt` tanlangan Toshkent kunlari ichida, `branchIdWhere(scope)`. Shuning
  uchun «Jami» qatori o'sha kartadagi son bilan teng.
- 0 bo'lgan usul ko'rsatilmaydi. To'lov bo'lmasa: «Tanlangan davrda to'lov yo'q».
- Usullar summasi bo'yicha kamayish tartibida. Ulush serverda butun foizga
  yaxlitlanadi; yig'indisi 100 dan bir-ikki farq qilishi mumkin.
- Karta bosilsa oyna: oylar bo'yicha ustunli grafik, har ustun usullarga
  bo'lingan (3/6 oy, boshqa oynalardagi kabi).
- Usul nomlari bitta joydan: `PAYMENT_METHOD_LABELS`
  (`client/src/components/payments/overview/overview-math.ts`).
- Qaytarilgan to'lovlar usulga bo'linmaydi.

### 2. Filtrdagi tez tugmalar

- «Bugun», «Kecha», «Shu hafta» (dushanbadan bugungacha).
- Bosilganda «Boshi — Oxiri» o'sha kunlarga to'ladi; URL'dagi `startDate` /
  `endDate` o'zgaradi, yangi parametr yo'q.
- Oraliq tugmaning kunlariga teng bo'lsa, tugma tanlangan ko'rinadi.

### 3. Solishtirish yozuvi

- Server oldingi davrning Toshkent sanalarini qaytaradi:
  `comparedTo: { startDate, endDate }`.
- Karta «o'tgan oyga nisbatan» o'rniga sanani yozadi: bir kun bo'lsa
  «05.10 bilan solishtirganda», bir necha kun bo'lsa
  «29.09–05.10 bilan solishtirganda» (yil boshqa bo'lsa yil bilan).
- Solishtirish qoidasi o'zgarmaydi.

## Server javobi (`GET /reports/payment-reports`)

Yangi maydonlar:

```ts
methods: {
  current: { method: PaymentMethod; amount: number; count: number; share: number }[];
  trend: { month: string; byMethod: Partial<Record<PaymentMethod, number>> }[];
};
comparedTo: { startDate: string; endDate: string }; // YYYY-MM-DD, Toshkent
```

Rollar va filial doirasi o'zgarmaydi (CEO, Filial direktori, Administrator;
`@BranchScope()`).

## Testlar

- Server (`reports-payments.service.spec.ts`): usullar bo'yicha bo'linish,
  tartib, ulush, 0 yo'q; yangi so'rov ham filial predikatini olib yuradi;
  `comparedTo` sanalari (oy va bir kun).
- Client (vitest): tez tugmalar qaysi sanalarni qo'yadi (dushanba va yakshanba
  kuni «Shu hafta»), tanlangan tugmani aniqlash, solishtirish yozuvi.
