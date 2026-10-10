# ADR-0081 — Filial chegarasi: bayram filialga tegishli, filialni faqat CEO ochadi, o'z oyligini o'zi to'lamaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0002, ADR-0034, ADR-0058, ADR-0079, `server/src/common/auth/branch-route-policy.ts`

## Kontekst

«Ruxsatlar» sahifasidan oldin har bir imkoniyat qaysi rolga berilishi mumkinligi ko'rib chiqildi (10.10.2026). Ko'rik bugungi saytda filial chegarasidan o'tadigan yo'llarni topdi: filial direktori yoki administrator boshqa filial o'quvchisining balansini tuzata olardi, boshqa filialning guruh jadvali, lid izohlari, oylik ro'yxati va ustoz stavkalarini ko'ra olardi. Har qanday bayram butun markazga yozilardi va boshqa filial guruhlarining tugash sanasini surardi. Filial direktori yangi filial ocha olardi va o'z oyligini o'zi «to'landi» deb belgilay olardi.

## Qaror

1. **Bayram filialga tegishli bo'lishi mumkin.** Butun markazga bayramni (`branchId` bo'sh) faqat CEO qo'yadi, tahrirlaydi, bekor qiladi va o'chiradi. Filial direktori va administrator bayramni faqat o'z filialiga qo'yadi. Bayram faqat o'zi tegishli filial guruhlariga ta'sir qiladi.
2. **Yangi filialni faqat CEO ochadi.** Filial direktori o'z filialini tahrirlaydi, yangisini ocha olmaydi.
3. **Hech kim (CEO'dan boshqa) o'z oyligini to'lamaydi va o'ziga avans yozmaydi.** Buni boshqa rahbar qiladi. Avans oluvchi xarajat yozilgan filialga biriktirilgan bo'lishi shart.
4. **Id bilan ochiladigan har bir yozuv yo'li chaqiruvchining filialini tekshiradi.** Mavjud yordamchilar ishlatiladi (`@BranchScope()`, `assertCallerInBranch`, `assertCallerMayTouchStudent`, `assertCallerMayTouchGroup`, `resolvePayrollBranchScope`). `branch-route-policy.ts` dagi «ko'rib chiqilmagan» ro'yxati 79 tadan 7 taga tushdi; qolgan 7 tasi faqat CEO'ga ochiq imkoniyatlarga tegishli (arxiv, to'lov tizimlari jurnali, Telegram guruhini uzish). Ustoz taymlayni (`GET /salary/timeline/:userId`) ham shu qoidada: uni faqat chaqiruvchi bilan bir filialdagi xodim bo'yicha ochish mumkin, stavka o'zgarishlarini esa faqat oylikni ko'ra oladiganlar (`salary.view`) ko'radi.

## Ko'rib chiqilgan muqobillar

- **Bayramni hozirgidek hamma butun markazga qo'yadi.** Rad etildi (CEO, 10.10): bir filial xodimi boshqa filial jadvalini, davomatini va oylik hisobini o'zgartirib qo'yardi.
- **Bo'shliqlarni «Ruxsatlar» sahifasi bilan birga yopish.** Rad etildi (CEO, 10.10): bo'shliqlar bugun ishlaydi, ular alohida va tezroq chiqadi.

## Oqibatlari

- Administrator butun markaz bayramini (Navro'z kabi) endi kirita olmaydi; uni CEO kiritadi.
- Bir nechta filialga biriktirilgan, CEO bo'lmagan xodim Excel hisobotini bitta filial bo'yicha oladi.
- «Ruxsatlar» sahifasida imkoniyatlarni yangi rolga ochish shu tekshiruvlarga tayanadi: qolgan 7 ta yo'lga tegishli imkoniyatlar faqat CEO'da qoladi.
