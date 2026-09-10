import { join } from 'path';
import { discoverStudentPopulationSites } from '../../../scripts/student-status-inventory';

/**
 * «Faol o'quvchi» ta'rifi har bir sanoqda ishlatilishini majburlaydi.
 *
 * NEGA TIP YETARLI EMAS: `activeStudentWhere()` — oddiy eksport qilingan
 * funksiya. Uni chaqirmagan kod ham muvaffaqiyatli kompilyatsiya bo'ladi,
 * testlardan ham o'tadi, sahifa ham ochiladi. Faqat son boshqacha chiqadi —
 * va buni hech kim sezmaydi, chunki ikkala son ikkita boshqa ekranda turadi.
 *
 * Shu bo'ldi ham. Ta'rif 2026-09-02 da bitta joyga yig'ilganda uchta chaqiruv
 * ko'chirildi, beshtasi eski shartini yozib qolaverdi. 2026-09-10 dagi prod
 * o'lchovi (Farg'ona filiali), hammasi «Faol o'quvchilar» deb nomlangan:
 *
 *   - bosh sahifa KPI ............................ 331
 *   - /students «Faol» kartochkasi ............... 486
 *   - Telegram kunlik hisoboti va /stats ......... 490
 *
 * Farq — 155 o'quvchi: statusi faol, lekin hozir hech qaysi faol guruhda
 * o'qimayapti.
 *
 * QOROVUL NIMANI KO'RMAYDI: shart o'zgaruvchiga bo'lak-bo'lak yig'ilsa
 * (`where.AND.push({ status: 'ACTIVE' })`) statik tahlil uni o'qiy olmaydi.
 * Shuning uchun obyekt literali sifatida yozilmagan har bir joy «o'qilmadi»
 * deb belgilanadi va shu manifestga tushadi — jimgina o'tkazib yuborilmaydi.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');

/**
 * Ta'rifni ATAYLAB ishlatmaydigan joylar.
 *
 * Bu ro'yxatga qo'shish — qaror, kelishuv emas. Har bir qatorda nima uchun
 * boshqacha sanalayotgani yozilishi shart, chunki keyingi o'quvchi «bu ham
 * xato bo'lsa kerak» deb tuzatib yuborishi mumkin.
 */
const EXEMPTIONS: { site: string; reason: string }[] = [
  {
    site: 'src/payment-gateways/gateway-events.service.ts::findAll',
    reason:
      "Ism/ID bo'yicha qidiruv — faollik haqida umuman da'vo qilmaydi. Shart " +
      "o'zgaruvchida qurilgani uchun «o'qilmadi» deb belgilangan.",
  },
  {
    site: 'src/payments/payments-debtors.service.ts::getDebtors',
    reason:
      "Qarzdorlar ro'yxati ataylab HAMMA holatni ko'rsatadi: muzlatilgan yoki " +
      "chetlatilgan o'quvchi ham pulni baribir qarz. Sababi `debtorWhere` " +
      "ustidagi izohda — faqat faollarni ko'rsatish bir ekranda 37 998 992 va " +
      '84 555 445 degan ikki songa olib kelgan edi.',
  },
  {
    site: 'src/reports/reports-balance-sheet.service.ts::getBalanceSheet',
    reason:
      "Balans hisobotidagi «Debitorlik» — faol o'quvchining MANFIY balansi. " +
      "Bu pul o'lchovi, o'quvchi sanog'i emas, va qarzdorlar ro'yxati bilan " +
      'aynan mos tushishi kerak.',
  },
  {
    site: 'src/reports/reports-balance-sheet.service.ts::getBalanceSheet#2',
    reason:
      "Xuddi shu, faqat MUSBAT balans — oldindan to'langan pul (kechiktirilgan " +
      "daromad). Debitorlik bilan bir juft, ta'rifi ham bir xil bo'lishi shart.",
  },
  {
    site: 'src/reports/reports-financial.service.ts::getFinancialOverview',
    reason:
      'Kutilayotgan qarz (D.2) — balans hisobotidagi «Debitorlik» bilan bir xil ' +
      "o'lchov. Ikkovi birga o'zgarishi kerak, alohida emas.",
  },
  {
    site: 'src/reports/reports-financial.service.ts::getFinancialOverview#2',
    reason:
      'Qarzdorlar soni — yuqoridagi qarz summasining sherigi. Summa faol ' +
      "o'quvchilarniki bo'lsa, sanoq ham o'shalarniki bo'lishi shart.",
  },
  {
    site: 'src/reports/reports-financial.service.ts::getFinancialOverview#3',
    reason:
      "HAL QILINMAGAN. Bu «Aktiv balans» kartochkasi — «Faol o'quvchilar " +
      "hisobidagi jami pul» deb yozilgan, ya'ni ta'rifga bo'ysunishi kerakdek " +
      "ko'rinadi. Lekin u balans hisobotidagi `accountsReceivable` ga bog'langan; " +
      "shartni o'zgartirish moliyaviy raqamni suradi. Alohida tekshiruvsiz " +
      'tegilmadi (2026-09-10 qarori).',
  },
  {
    site: 'src/reports/reports-payments.service.ts::getPerBranchSummary',
    reason:
      'Filiallar kesimidagi qarz summasi — yuqoridagi «Debitorlik» ning filial ' +
      "bo'yicha bo'lingani. Umumiy son bilan yig'indisi mos tushishi shart.",
  },
  {
    site: 'src/telegram-groups/daily-snapshot.service.ts::persistScope',
    reason:
      'Kunlik suratdagi qarz summasi va qarzdorlar soni — /payments dagi qarz ' +
      "kartochkasi bilan bir xil o'lchov.",
  },
  {
    site: 'src/telegram-groups/telegram-group-daily-report.service.ts::build#3',
    reason: "Kunlik hisobotdagi qarz bloki — surat bilan bir xil o'lchov.",
  },
  {
    site: 'src/telegram-groups/telegram-group-stats.service.ts::buildDebtorsBlock',
    reason:
      "/qarzdorlar buyrug'idagi jami qarz — qarz kartochkasi bilan bir xil.",
  },
  {
    site: 'src/telegram-groups/telegram-group-stats.service.ts::buildDebtorsBlock#2',
    reason:
      "/qarzdorlar buyrug'idagi eng katta qarzdorlar ro'yxati — summasi bilan " +
      'bir xil shartdan qurilishi shart.',
  },
  {
    site: 'src/telegram-groups/telegram-group-stats.service.ts::buildOverallStats#3',
    reason: "/stats dagi qarz bloki — qarz kartochkasi bilan bir xil o'lchov.",
  },
];

const sites = discoverStudentPopulationSites(SRC, REPO_ROOT);
const exemptKeys = EXEMPTIONS.map((e) => e.site);

describe("faol o'quvchi ta'rifi manifesti", () => {
  it("umuman joy topadi (jimgina nol mukammal qoplama haqida yolg'on gapiradi)", () => {
    // Buzilgan skaner hech nima topmaydi, quyidagi hamma tekshiruv bo'sh
    // to'plamda o'tadi va manifest to'liq qoplama haqida hisobot beradi.
    // Bu tekshiruvsiz qolgan hammasi ma'nosiz.
    expect(sites.length).toBeGreaterThan(15);
    expect(sites.filter((s) => s.usesCanonical).length).toBeGreaterThan(5);
  });

  it("har bir sanoq yo ta'rifni ishlatadi, yo manifestda oqlangan", () => {
    const unaccounted = sites
      .filter((s) => !s.usesCanonical && !exemptKeys.includes(s.key))
      .map((s) => `${s.key} (${s.file}:${s.line}, ${s.op})`);

    // Yangi joy shu yerda yiqiladi. Ikki yo'l bor: `...activeStudentWhere()`
    // ni yoyish, yoki yuqoridagi EXEMPTIONS ga sabab bilan qo'shish.
    expect(unaccounted).toEqual([]);
  });

  it("mavjud bo'lmagan joyni oqlamaydi", () => {
    // Chaqiruv o'chirilib manifest yangilanmasa, qator hech nima haqida
    // da'voga aylanadi va keyingi o'quvchi uni qoplangan deb sanaydi.
    const known = new Set(sites.map((s) => s.key));
    const stale = exemptKeys.filter((k) => !known.has(k));

    expect(stale).toEqual([]);
  });

  it("ta'rifni ishlatgan joy bir vaqtda oqlanmaydi", () => {
    // Ikkovi birga bo'lsa — sabab eskirgan: joy tuzatilgan, qator qolib
    // ketgan. Qator o'chirilishi kerak, aks holda u keyingi safar noto'g'ri
    // yozilgan chaqiruvni jimgina oqlaydi.
    const both = sites
      .filter((s) => s.usesCanonical && exemptKeys.includes(s.key))
      .map((s) => s.key);

    expect(both).toEqual([]);
  });

  it('bir joyni ikki marta oqlamaydi', () => {
    const seen = new Set<string>();
    const duplicated = exemptKeys.filter((k) => {
      if (seen.has(k)) return true;
      seen.add(k);
      return false;
    });

    expect(duplicated).toEqual([]);
  });

  it('har bir istisnoning sababi yozilgan', () => {
    // Sababsiz qator — «kimdir shunday qilgan» degani. Uni keyingi o'quvchi
    // na tasdiqlay oladi, na bekor qila oladi.
    const reasonless = EXEMPTIONS.filter(
      (e) => e.reason.trim().length < 40,
    ).map((e) => e.site);

    expect(reasonless).toEqual([]);
  });
});
