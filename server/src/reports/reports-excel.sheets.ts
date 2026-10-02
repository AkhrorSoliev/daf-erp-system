/**
 * Formal-statement + framing sheet builders for the "Moliyaviy hisobot"
 * workbook: Muqova / Foyda va zarar / Balans / To'lov usullari / Izoh.
 * «Asosiy xulosa» lives in reports-excel.summary-sheet.ts; the line-item +
 * reconciliation builders live in reports-excel.detail-sheets.ts. Data params
 * are loosely typed (`any`) — the shapes come straight from the ReportsService
 * facade and are only read here.
 */
import { Workbook } from 'exceljs';
import {
  NAVY,
  SUBTLE,
  GREEN,
  RED,
  SOM,
  PCT,
  NUM,
  REVENUE_LABELS,
  EXPENSE_LABELS,
  METHOD_LABELS,
  NetProfit,
  sheetTitle,
  sectionHeader,
  tableHeader,
  totalsRow,
  kvRow,
  sheetNotes,
} from './reports-excel.helpers';

// ---- Sheet 1: Muqova ----
export function coverSheet(
  wb: Workbook,
  companyName: string,
  branchLabel: string,
  period: string,
  companyWide: boolean,
  generatedAt: string,
) {
  const ws = wb.addWorksheet('Muqova');
  ws.columns = [{ width: 30 }, { width: 60 }];
  const t = ws.addRow([companyName]);
  t.font = { bold: true, size: 18, color: { argb: NAVY } };
  t.alignment = { horizontal: 'center' };
  ws.mergeCells(t.number, 1, t.number, 2);
  const s = ws.addRow(['Moliyaviy hisobot']);
  s.font = { bold: true, size: 13 };
  s.alignment = { horizontal: 'center' };
  ws.mergeCells(s.number, 1, s.number, 2);
  ws.addRow([]);

  const info = (k: string, v: string) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    return r;
  };
  info('Hisobot davri:', period);
  info('Filial:', branchLabel);
  info('Valyuta:', "Barcha summalar — so'm");
  info('Yaratilgan:', generatedAt);

  sectionHeader(ws, 'Mundarija', 2);
  const toc = [
    [
      'Asosiy xulosa',
      'Sodda tilda umumiy natija va joriy-vs-o‘tgan taqqoslash',
    ],
    ['Sof foyda', 'Aniq natija: tushum − hisoblangan oylik − xarajat − refund'],
    ['Foyda va zarar', 'Daromad − tannarx − xarajat = foyda + marja'],
    ['Pul oqimi', 'Kassa kirim/chiqim va davr oxiri qoldig‘i'],
    ['Balans', 'Aktiv, passiv, kapital (joriy holat)'],
    ['To‘lovlar', 'Davrdagi har bir qabul qilingan to‘lov'],
    ['Xarajatlar', 'Davrdagi har bir xarajat'],
    ['Oyliklar', 'Ustozlar oyligi (davrda to‘langan)'],
    ['Qarzdorlar', 'Qarzdor o‘quvchilar ro‘yxati'],
    ['Oylik dinamika', 'So‘nggi 6 oy: tushum/chiqim/foyda'],
    ['Oylik qarzdorlik', 'Har oy qancha qarz bilan yopilgani + undirish'],
    ...(companyWide
      ? [['Filial kesimida', 'Filiallar bo‘yicha tushum/chiqim/foyda/qarz']]
      : []),
    ['To‘lov usullari', 'To‘lov usuli va daromad turi bo‘yicha'],
    ['Tekshiruv', 'Reconciliation (MOS/XATO) va aylanmalar'],
    ['Izoh / Lug‘at', 'Atamalarning sodda izohi'],
  ];
  toc.forEach(([name, desc], i) => {
    const r = ws.addRow([`${i + 2}. ${name}`, desc]);
    r.getCell(2).font = { color: { argb: SUBTLE } };
  });
}

// ---- Sheet 3: Sof foyda (the single, clear "aniq sof foyda") ----
/**
 * The headline the CEO asked for: ONE authoritative net-profit figure that
 * subtracts EVERY real outflow — teacher salary on the HISOBLANGAN (deserved)
 * basis (not the ~0 cash-paid figure that made the legacy "Sof foyda" look 4×
 * too high), operating expenses, and student refunds. Write-offs + gateway fees
 * are shown as a memo, not subtracted. `np` is pre-assembled by `buildNetProfit`
 * from data already in the workbook, so this sheet is pure presentation.
 */
export function netProfitSheet(wb: Workbook, np: NetProfit, period: string) {
  const ws = wb.addWorksheet('Sof foyda');
  ws.columns = [{ width: 44 }, { width: 22 }, { width: 56 }];
  sheetTitle(ws, 'Sof foyda — aniq natija', period, 3);

  const teacherLabel =
    np.teacherSalaryBasis === 'naqd'
      ? "Ustoz oyligi (naqd to'langan)"
      : np.teacherSalaryHasTopup
        ? 'Ustoz oyligi (hisoblangan + markaz qo‘shimchasi)'
        : 'Ustoz oyligi (hisoblangan — o‘quvchilar to‘lagani)';
  const teacherNote =
    np.teacherSalaryBasis === 'naqd'
      ? 'Bu davrda ustozlarga real to‘langan oylik (dars ma‘lumoti yo‘q oyda shu ishlatiladi).'
      : np.teacherSalaryHasTopup
        ? 'Shu oy darslari uchun ustozlar HAQ QILGAN to‘liq oylik: o‘quvchilar to‘lagani + markaz qo‘shimchasi (qarzdor o‘quvchilar darsi ham). Naqd odatda keyingi oy chiqadi.'
        : 'Shu oy o‘quvchilar TO‘LAGAN darslar uchun ustoz haqi. Markaz qo‘shimchasi (top-up) bu oyda YO‘Q — u faqat 2026-07 dan boshlanadi.';

  const revenueLabel =
    np.revenueBasis === 'recognized'
      ? 'Dars tushumi (o‘tilgan darslar)'
      : 'Tushum (qabul qilingan to‘lovlar)';
  const revenueNote =
    np.revenueBasis === 'recognized'
      ? 'Shu oy O‘TILGAN va to‘langan darslarning to‘liq qiymati. Kech to‘lovlar o‘z darsi oyiga, oldindan to‘lovlar dars o‘tilgan oyiga yoziladi — shu oy faqat o‘z darslarini ko‘rsatadi.'
      : 'Bu davrda kassaga real tushgan to‘lovlar (COMPLETED).';

  sectionHeader(ws, 'SOF FOYDA HISOBI');
  kvRow(ws, revenueLabel, np.revenue, revenueNote);
  kvRow(ws, `−  ${teacherLabel}`, np.teacherSalary, teacherNote);
  kvRow(
    ws,
    '−  Admin oyligi',
    np.adminSalary,
    'Ustoz bo‘lmagan xodimlar (admin/kassir) oyligi — hozircha 0.',
  );
  kvRow(
    ws,
    '−  Operatsion xarajatlar (avanssiz)',
    np.operatingExpenses,
    'Ijara, kommunal, marketing va h.k. Ustoz avansi bu yerda EMAS — u oylik ichida.',
  );
  kvRow(
    ws,
    '−  Qaytarishlar (refund)',
    np.refunds,
    'O‘quvchilarga qaytarilgan real naqd pul — avval hech qayerda ayirilmasdi.',
  );

  // Bottom-line — big, bold, green/red.
  const t = ws.addRow([
    '=  SOF FOYDA',
    np.netProfit,
    'Barcha real chiqimlardan keyin markazda qolgan sof pul.',
  ]);
  t.font = {
    bold: true,
    size: 13,
    color: { argb: np.netProfit >= 0 ? GREEN : RED },
  };
  t.getCell(2).numFmt = SOM;
  t.getCell(2).font = {
    bold: true,
    size: 13,
    color: { argb: np.netProfit >= 0 ? GREEN : RED },
  };
  t.getCell(3).font = { italic: true, size: 9, color: { argb: SUBTLE } };
  t.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  const m = ws.addRow([
    'Sof marja',
    np.netMarginPercent,
    'Sof foyda ÷ Tushum — har 100 so‘m tushumdan qancha foyda qolgani.',
  ]);
  m.getCell(2).numFmt = PCT;
  m.getCell(2).font = { bold: true };
  m.getCell(3).font = { italic: true, size: 9, color: { argb: SUBTLE } };

  sectionHeader(ws, 'Ma‘lumot uchun (foydadan AYIRILMAGAN)');
  kvRow(
    ws,
    'Kechirilgan qarz (write-off)',
    np.memo.writeOffs,
    'Hisobdan chiqarilgan qarzlar — naqd emas, lekin real iqtisodiy zarar. Foydadan ayirilmadi (qaror bo‘yicha).',
  );
  kvRow(
    ws,
    'Gateway komissiyasi (Payme/Click)',
    np.memo.providerFees,
    'To‘lov tizimi ushlab qolgan komissiya. Hozir 0 (yozilmayapti). Foydadan ayirilmadi.',
  );
  kvRow(
    ws,
    'Ustoz avanslari (oylik ichida)',
    np.memo.advances,
    'Ustozlarga oldindan berilgan pul — «Ustoz oyligi (hisoblangan)» ichida allaqachon bor, shuning uchun alohida ayirilmaydi (ikki marta hisoblanmasin).',
  );

  sheetNotes(
    ws,
    [
      'Bu — savolga aniq javob: BARCHA real chiqimlardan keyin markazda qancha sof foyda qolgani.',
      'SOF FOYDA = Tushum − Ustoz oyligi (hisoblangan) − Admin oyligi − Operatsion xarajatlar (avanssiz) − Qaytarishlar.',
      'Ustoz oyligi HISOBLANGAN asosda (naqd emas): naqd oylik odatda keyingi oy chiqqani uchun «naqd» asosda bu raqam 0 ko‘rinib, foydani sun‘iy oshirardi. Markaz qo‘shimchasi (qarzdor o‘quvchilar darsi uchun) faqat 2026-07 dan qo‘shiladi — undan oldingi oylarda ustoz haqi = o‘quvchilar to‘lagani (covered), chunki o‘shanda markaz qo‘shimcha bermagan.',
      'Ustoz avansi ikki marta hisoblanmaydi: u «hisoblangan oylik» ichida bor, shuning uchun «Operatsion xarajatlar»dan chiqarilgan (avanssiz).',
      'Tushum va ustoz oyligi BIR XIL asosda — shu oy o‘tilgan darslar bo‘yicha (dars tushumi = recognized). Shuning uchun kech kelgan to‘lovlar bu oyni bo‘yamaydi (o‘z darsi oyiga ketadi) va oldindan to‘lovlar kelajak oyga qoladi. Har oy o‘zining toza foydasini ko‘rsatadi.',
      'Kechirilgan qarz va gateway komissiyasi — pastda «ma‘lumot uchun», foydadan ayirilmagan.',
    ],
    3,
  );
}

// ---- Sheet 4: Foyda va zarar ----
export function profitLossSheet(wb: Workbook, pl: any, period: string) {
  const ws = wb.addWorksheet('Foyda va zarar');
  ws.columns = [{ width: 40 }, { width: 20 }, { width: 50 }];
  sheetTitle(
    ws,
    'Foyda va zarar (naqd asosida — tushgan to‘lovlar)',
    period,
    3,
  );
  if (!pl) return;

  sectionHeader(ws, 'Daromad');
  tableHeader(ws, ['Tur', 'Soni', 'Summa']);
  (pl.revenue?.byType ?? []).forEach((r: any) => {
    const row = ws.addRow([
      REVENUE_LABELS[r.type] ?? r.type,
      r.count,
      r.amount,
    ]);
    row.getCell(3).numFmt = NUM;
  });
  totalsRow(ws, ['Jami daromad', '', pl.revenue?.total ?? 0], [3]);

  sectionHeader(ws, 'Xizmat tannarxi (ustozlar ulushi)');
  kvRow(
    ws,
    'Ustoz oyligi',
    pl.costOfServices?.teacherSalaries ?? 0,
    'Darslar uchun ustozlarga to‘langan (naqd asosidagi) oylik.',
  );
  kvRow(ws, 'Ustoz avanslari', pl.costOfServices?.teacherAdvances ?? 0);
  kvRow(ws, 'Jami tannarx', pl.costOfServices?.total ?? 0, undefined, {
    bold: true,
  });
  kvRow(ws, 'Yalpi foyda', pl.grossProfit ?? 0, 'Daromad − tannarx.', {
    bold: true,
  });
  kvRow(ws, 'Yalpi marja', pl.margins?.grossMarginPercent ?? 0, undefined, {
    percent: true,
  });

  sectionHeader(ws, 'Operatsion xarajatlar');
  tableHeader(ws, ['Kategoriya', '', 'Summa']);
  (pl.operatingExpenses?.byCategory ?? []).forEach((e: any) => {
    const row = ws.addRow([
      EXPENSE_LABELS[e.category] ?? e.category,
      '',
      e.amount,
    ]);
    row.getCell(3).numFmt = NUM;
  });
  ws
    .addRow(['Admin oyligi', '', pl.operatingExpenses?.adminSalaries ?? 0])
    .getCell(3).numFmt = NUM;
  totalsRow(
    ws,
    ['Jami operatsion xarajat', '', pl.operatingExpenses?.total ?? 0],
    [3],
  );

  sectionHeader(ws, 'Natija');
  kvRow(
    ws,
    'Sof foyda (hisobot uslubida — buxgalteriya ko‘rinishi)',
    pl.netProfit ?? 0,
    'Bu ko‘rsatkich avanslarni to‘langan sanasi bo‘yicha va ustoz/admin oyligini alohida hisoblaydi; shu sababli "Asosiy xulosa"dagi kassa asosidagi sof foyda bilan farq qilishi mumkin.',
    { bold: true },
  );
  kvRow(ws, 'Sof marja', pl.margins?.netMarginPercent ?? 0, undefined, {
    percent: true,
  });

  sheetNotes(
    ws,
    [
      'Foyda va zarar = Daromad − Xizmat tannarxi (ustozlar ulushi) − Operatsion xarajatlar = Sof foyda.',
      'Marja — foydalilik foizi. Yalpi marja = Yalpi foyda ÷ Daromad; Sof marja = Sof foyda ÷ Daromad. Masalan 38% = har 100 so‘m tushumdan 38 so‘m foyda.',
      'Diqqat: bu yerdagi "Ustoz oyligi" — NAQD asosida (shu davrda TO‘LANGAN oylik). Shu oy uchun HISOBLANGAN ustoz oyligi alohida "Oyliklar" bo‘limida (u odatda keyingi oy to‘lanadi).',
    ],
    3,
  );
}

// ---- Sheet 4: Balans ----
export function balanceSheet(wb: Workbook, bs: any) {
  const ws = wb.addWorksheet('Balans');
  ws.columns = [{ width: 40 }, { width: 20 }, { width: 50 }];
  sheetTitle(
    ws,
    'Balans hisoboti',
    `Holat sanasi: ${bs?.asOf ?? ''} (davr oxiri emas)`,
    3,
  );
  if (!bs) return;

  sectionHeader(ws, 'Aktivlar');
  kvRow(
    ws,
    'Kassa / bank',
    bs.assets?.cash ?? 0,
    'Barcha kassa va bank hisoblaridagi pul.',
  );
  kvRow(
    ws,
    `Debitorlik (${bs.assets?.debtorCount ?? 0} qarzdor)`,
    bs.assets?.accountsReceivable ?? 0,
    'O‘quvchilar qarzi — bizga qarzdor summasi.',
  );
  kvRow(ws, 'Jami aktivlar', bs.assets?.total ?? 0, undefined, { bold: true });

  sectionHeader(ws, 'Passivlar');
  kvRow(
    ws,
    'Oylik qarzi (ustozlar)',
    bs.liabilities?.salariesPayable ?? 0,
    'To‘lanmagan ustoz oyliklari (joriy holat).',
  );
  kvRow(
    ws,
    `Oldindan to‘lov (${bs.liabilities?.prepaidStudentCount ?? 0} o‘quvchi)`,
    bs.liabilities?.deferredRevenue ?? 0,
    'Kelajakdagi darslar uchun oldindan olingan pul.',
  );
  kvRow(ws, 'Jami passivlar', bs.liabilities?.total ?? 0, undefined, {
    bold: true,
  });

  sectionHeader(ws, 'Kapital');
  kvRow(
    ws,
    'Taqsimlanmagan foyda',
    bs.equity?.retainedEarnings ?? 0,
    'Aktiv − passiv (markazning sof qiymati).',
  );

  sheetNotes(
    ws,
    [
      'Balans — markazning HOZIRGI moliyaviy holati (davr oxiri emas, joriy kun).',
      'AKTIV = bizda bor: kassa/bankdagi pul + o‘quvchilar qarzi (Debitorlik).',
      'PASSIV = biz qarzdormiz: ustozlarga oylik qarzi + o‘quvchilar oldindan to‘lagan pul (kelajakda dars berishimiz kerak).',
      'KAPITAL = Aktiv − Passiv (markazning sof qiymati).',
      'Texnik "balanslashuv farqi" ko‘rsatkichi "Tekshiruv" bo‘limiga ko‘chirildi (buxgalter uchun).',
    ],
    3,
  );
}

// ---- Sheet 12: To'lov usullari ----
export function methodsSheet(
  wb: Workbook,
  overview: any,
  pl: any,
  period: string,
) {
  const ws = wb.addWorksheet("To'lov usullari");
  ws.columns = [{ width: 24 }, { width: 12 }, { width: 20 }];
  sheetTitle(ws, 'To‘lov usullari va daromad turlari', period, 3);

  sectionHeader(ws, 'To‘lov usuli bo‘yicha');
  tableHeader(ws, ['Usul', 'Soni', 'Summa']);
  (overview?.income?.byMethod ?? []).forEach((m: any) => {
    const r = ws.addRow([
      METHOD_LABELS[m.method] ?? m.method,
      m.count,
      m.amount,
    ]);
    r.getCell(3).numFmt = NUM;
  });

  sectionHeader(ws, 'Daromad turi bo‘yicha');
  tableHeader(ws, ['Tur', 'Soni', 'Summa']);
  (pl?.revenue?.byType ?? []).forEach((r: any) => {
    const row = ws.addRow([
      REVENUE_LABELS[r.type] ?? r.type,
      r.count,
      r.amount,
    ]);
    row.getCell(3).numFmt = NUM;
  });

  sheetNotes(
    ws,
    [
      'Tushgan to‘lovlarning qanday usulda (naqd/Payme/Click/Uzum/o‘tkazma) va nima uchun (o‘qish/ro‘yxat/sertifikat va h.k.) kelganini ko‘rsatadi.',
      '"Soni" — nechta to‘lov; "Summa" — jami pul.',
    ],
    3,
  );
}

// ---- Sheet 14: Izoh / Lug'at ----
export function glossarySheet(wb: Workbook) {
  const ws = wb.addWorksheet('Izoh');
  ws.columns = [{ width: 30 }, { width: 90 }];
  sheetTitle(ws, 'Izoh / Lug‘at', 'Atamalarning sodda tilda izohi', 2);
  // Plain-language terms only — the prior 21-term accounting glossary
  // (Roll-forward, Cash tie-out, LTV/CAC/ROI jargon) and the "Metodika" row
  // are gone; a reader who needs this sheet is not a bookkeeper.
  const terms: [string, string][] = [
    [
      // Named after the row «Xulosa» block 4 prints from the first monthly
      // month — `{Oy Yil} hisobi`, then «shundan to'langan» / «to'lanmagan» —
      // not after the home page's and Telegram's «Bu oy hisoblandi», which no
      // row of this workbook carries. The glossary has no month, hence «Oy».
      'Oy hisobi (oylik hisob)',
      '«Xulosa» 4-blokining birinchi qatori, masalan «Oktabr 2026 hisobi» (2026-yil sentabrdan oylik to‘lov tizimidagi oylar): shu oy uchun o‘quvchilarga yozilgan oylik hisoblar yig‘indisi. Uning ostidagi «shundan to‘langan» — shundan to‘langani (qarz kechirilgani ham shu yerda), «to‘lanmagan» — hali to‘lanmagani. To‘lov avval eng eski qarzni yopadi.',
    ],
    [
      'Oy oxiriga kutilyapti',
      'Shu oy allaqachon o‘tilgan darslar qiymati + kalendar bo‘yicha oy oxirigacha qolgan darslar qiymati. Bu kassa bashorati EMAS — pul qachon kelishi bunga kirmaydi. (2026-yil sentabrgacha bo‘lgan oylar)',
    ],
    [
      "O'tilgan darslar qiymati",
      'Bu davrda o‘quvchilarga real hisoblab yozilgan darslar puli. Tushgan to‘lov va qarz shundan kelib chiqadi.',
    ],
    [
      "Oyning o'z foydasi",
      '«Sof foyda» bo‘limidagi asosiy raqam: Tushum + Balansdan yechib olingan − Ustoz oyligi − Admin oyligi − Xarajat − Qaytarishlar. Barcha real chiqimlardan keyin qolgan sof pul.',
    ],
    [
      'O‘quvchilar to‘lagan (ustoz oyligida)',
      'Ustoz oyligining o‘quvchilar puli bilan qoplangan qismi.',
    ],
    [
      'Markaz qo‘shimchasi',
      'Ustoz oyligining o‘quvchi to‘lamagani uchun markaz o‘z hisobidan qoplagan qismi.',
    ],
    [
      'Avans',
      'Ustozga davr ichida oldindan berilgan pul. Oylik hisoblanganda hisobga olinadi.',
    ],
    [
      'Oldindan to‘lov',
      'O‘quvchi kelajakdagi darslar uchun oldindan to‘lagan, hali sarflanmagan pul.',
    ],
    [
      'Debitorlik (qarz)',
      'O‘quvchilarning bizga qarzi — manfiy balans yig‘indisi.',
    ],
    [
      'Sof marja',
      'Sof foyda ÷ Tushum × 100 — har 100 so‘m tushumdan qancha foyda qolgani.',
    ],
  ];
  tableHeader(ws, ['Atama', 'Izoh']);
  terms.forEach(([term, def]) => {
    const r = ws.addRow([term, def]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
}
