/**
 * Line-item + reconciliation sheet builders for the "Moliyaviy hisobot"
 * workbook (the drillable, self-verifying half): To'lovlar / Xarajatlar /
 * Oyliklar / Qarzdorlar / Oylik dinamika / Filial kesimida / Tekshiruv.
 * The formal-statement builders live in reports-excel.sheets.ts.
 */
import { Workbook } from 'exceljs';
import {
  SUBTLE,
  NUM,
  REVENUE_LABELS,
  EXPENSE_LABELS,
  METHOD_LABELS,
  EXPENSE_METHOD_LABELS,
  SALARY_STATUS_LABELS,
  sheetTitle,
  sectionHeader,
  tableHeader,
  totalsRow,
  kvRow,
  checkRow,
  freezeAndFilter,
  sheetNotes,
  dataBar,
  colorScale,
  fmtDate,
  tashkentTodayStr,
} from './reports-excel.helpers';

// ---- Sheet 6: To'lovlar ----
export function paymentsSheet(
  wb: Workbook,
  payments: any,
  branchNames: Record<number, string>,
  period: string,
) {
  const ws = wb.addWorksheet("To'lovlar");
  ws.columns = [
    { width: 12 }, { width: 8 }, { width: 26 }, { width: 16 },
    { width: 16 }, { width: 12 }, { width: 16 }, { width: 22 },
  ];
  sheetTitle(ws, "To‘lovlar (davr bo‘yicha)", period, 8);
  const header = tableHeader(ws, ['Sana', 'ID', 'O‘quvchi', 'Filial', 'Summa', 'Usul', 'Daromad turi', 'Qabul qildi']);
  const firstDataRow = header.number + 1;
  (payments?.rows ?? []).forEach((p: any) => {
    const r = ws.addRow([
      fmtDate(p.createdAt),
      p.student?.id ?? '',
      `${p.student?.firstName ?? ''} ${p.student?.lastName ?? ''}`.trim(),
      p.branchId != null ? (branchNames[p.branchId] ?? `#${p.branchId}`) : '',
      p.amount,
      METHOD_LABELS[p.method] ?? p.method,
      REVENUE_LABELS[p.revenueType] ?? p.revenueType ?? '',
      p.receivedBy ? `${p.receivedBy.firstName ?? ''} ${p.receivedBy.lastName ?? ''}`.trim() : '',
    ]);
    r.getCell(5).numFmt = NUM;
  });
  const lastDataRow = ws.rowCount;
  totalsRow(ws, ['Jami', '', '', '', payments?.total ?? 0, '', '', ''], [5]);
  if (lastDataRow >= firstDataRow) dataBar(ws, `E${firstDataRow}:E${lastDataRow}`);
  if (payments?.truncated) {
    ws.addRow(["Ko‘p yozuv — faqat birinchi 10 000 tasi ko‘rsatildi. Davrni qisqartiring."]);
  }
  freezeAndFilter(ws, header.number, 8);
  sheetNotes(ws, [
    'Bu davrda kassaga real tushgan har bir to‘lov (bittalab).',
    'Summa — to‘langan pul; Usul — naqd/Payme/Click/o‘tkazma; Daromad turi — nima uchun to‘langani.',
    '"Summa" ustunidagi rangli chiziq — to‘lov kattaligini ko‘rsatadi.',
    'Jami summa — "Foyda va zarar" bo‘limidagi daromadga aynan teng (Tekshiruv bo‘limida tasdiqlangan).',
  ], 8);
}

// ---- Sheet 7: Xarajatlar ----
export function expensesSheet(
  wb: Workbook,
  expenses: any,
  branchNames: Record<number, string>,
  period: string,
) {
  const ws = wb.addWorksheet('Xarajatlar');
  ws.columns = [
    { width: 12 }, { width: 16 }, { width: 16 }, { width: 10 },
    { width: 30 }, { width: 16 }, { width: 20 }, { width: 20 },
  ];
  sheetTitle(ws, 'Xarajatlar (davr bo‘yicha)', period, 8);
  const header = tableHeader(ws, ['Sana', 'Kategoriya', 'Summa', 'Usul', 'Izoh', 'Filial', 'Ustoz', 'Kim kiritdi']);
  const firstDataRow = header.number + 1;
  (expenses?.rows ?? []).forEach((e: any) => {
    const r = ws.addRow([
      fmtDate(e.date),
      EXPENSE_LABELS[e.category] ?? e.category,
      e.amount,
      EXPENSE_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      e.description ?? '',
      e.branchId != null ? (branchNames[e.branchId] ?? `#${e.branchId}`) : '',
      e.relatedUser ? `${e.relatedUser.firstName ?? ''} ${e.relatedUser.lastName ?? ''}`.trim() : '',
      e.createdBy ? `${e.createdBy.firstName ?? ''} ${e.createdBy.lastName ?? ''}`.trim() : '',
    ]);
    r.getCell(3).numFmt = NUM;
  });
  const lastDataRow = ws.rowCount;
  totalsRow(ws, ['Jami', '', expenses?.total ?? 0, '', '', '', '', ''], [3]);
  if (lastDataRow >= firstDataRow) dataBar(ws, `C${firstDataRow}:C${lastDataRow}`);
  if (expenses?.truncated) {
    ws.addRow(["Ko‘p yozuv — faqat birinchi 10 000 tasi ko‘rsatildi. Davrni qisqartiring."]);
  }
  freezeAndFilter(ws, header.number, 8);
  sheetNotes(ws, [
    'Bu davrda qilingan har bir xarajat (ijara, kommunal, marketing va h.k.).',
    'Ustozga berilgan avans ham shu yerda — "Ustoz" ustunida ismi bilan.',
    'Jami — "Foyda va zarar" bo‘limidagi operatsion xarajat + avansga teng (Tekshiruvda tasdiqlangan).',
    'Diqqat: ustozlar oyligi bu yerda EMAS — u alohida "Oyliklar" bo‘limida.',
  ], 8);
}

// ---- Sheet 8: Oyliklar (computed monthly — the /payments/salary view) ----
export function salariesSheet(wb: Workbook, salaries: any, period: string) {
  const ws = wb.addWorksheet('Oyliklar');
  ws.columns = [
    { width: 26 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 14 },
  ];
  sheetTitle(ws, 'Ustozlar oyligi — hisoblangan (shu oy uchun)', period, 9);
  const rows = salaries?.data ?? [];
  const header = tableHeader(ws, [
    'Ustoz',
    'O‘quvchilar to‘lagan',
    'shundan oldingi oydan',
    'Markaz qo‘shimchasi',
    'Jami hisoblangan',
    'Avans',
    'Sof to‘lanadigan',
    'Keyingi oyga o‘tgan',
    'Holati',
  ]);
  const firstDataRow = header.number + 1;
  rows.forEach((r: any) => {
    const statusLabel = r.payment
      ? (SALARY_STATUS_LABELS[r.payment.status] ?? r.payment.status)
      : 'Hisoblangan';
    const row = ws.addRow([
      `${r.user?.firstName ?? ''} ${r.user?.lastName ?? ''}`.trim(),
      r.covered ?? '—',
      r.carriedIn ?? 0,
      r.gap ?? '—',
      r.fullDeserved ?? '—',
      r.advances ?? 0,
      r.netToPay ?? 0,
      r.carriedOut ?? 0,
      statusLabel,
    ]);
    [2, 3, 4, 5, 6, 7, 8].forEach((c) => {
      if (typeof row.getCell(c).value === 'number') row.getCell(c).numFmt = NUM;
    });
  });
  const lastDataRow = ws.rowCount;
  const t = salaries?.totals ?? {};
  totalsRow(
    ws,
    ['Jami', t.covered ?? 0, t.carriedIn ?? 0, t.gap ?? 0, t.fullDeserved ?? 0, t.advances ?? 0, t.netToPay ?? 0, t.carriedOut ?? 0, ''],
    [2, 3, 4, 5, 6, 7, 8],
  );
  if (lastDataRow >= firstDataRow) dataBar(ws, `G${firstDataRow}:G${lastDataRow}`);
  freezeAndFilter(ws, header.number, 9);
  sheetNotes(ws, [
    'Shu oy uchun HISOBLANGAN ustoz oyligi — oylik sahifasidagi kabi (to‘lov qilinmagan bo‘lsa ham to‘la ko‘rinadi).',
    'O‘quvchilar to‘lagan = o‘quvchilar pulidan tushgan qism; Markaz qo‘shimchasi = markaz o‘z hisobidan qoplagan qism.',
    'Jami hisoblangan = O‘quvchilar to‘lagan + Markaz qo‘shimchasi. Sof to‘lanadigan = avans ayirilgach ustozga beriladigan summa.',
    '"shundan oldingi oydan" — "O‘quvchilar to‘lagan" ichida OLDINGI oy darslaridan kechikib kelib qo‘shilgan qism (uning bir bo‘lagi).',
    '"Keyingi oyga o‘tgan" — bu oy darslarining kech to‘langani KEYINGI oyga o‘tdi (bu oy summasida YO‘Q; keyingi oy oyligiga qo‘shiladi).',
    '"Sof to‘lanadigan" ustunidagi rangli chiziq — oylik kattaligini ko‘rsatadi. Diqqat: oylik odatda keyingi oy boshida to‘lanadi. Bu bo‘lim faqat USTOZLAR.',
    '"—" belgisi — o‘sha oyda dars ma‘lumoti yo‘q (masalan o‘tish oyi).',
  ], 9);
}

// ---- Sheet 9: Qarzdorlar ----
export function debtorsSheet(
  wb: Workbook,
  debtors: any,
  branchNames: Record<number, string>,
) {
  const ws = wb.addWorksheet('Qarzdorlar');
  ws.columns = [
    { width: 8 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 34 }, { width: 16 },
  ];
  sheetTitle(ws, 'Qarzdorlar', `Holat sanasi: ${tashkentTodayStr()} (davr oxiri emas)`, 6);
  const header = tableHeader(ws, ['ID', 'O‘quvchi', 'Filial', 'Telefon', 'Guruhlar', 'Qarz']);
  const firstDataRow = header.number + 1;
  (debtors?.rows ?? []).forEach((d: any) => {
    const branch =
      d.branchIds && d.branchIds.length
        ? (branchNames[d.branchIds[0]] ?? `#${d.branchIds[0]}`)
        : '';
    const r = ws.addRow([
      d.id,
      `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim(),
      branch,
      d.phone ?? '',
      (d.groups ?? []).join(', '),
      d.debtAmount ?? 0,
    ]);
    r.getCell(6).numFmt = NUM;
  });
  const lastDataRow = ws.rowCount;
  totalsRow(ws, ['Jami qarz', '', '', '', '', debtors?.total ?? 0], [6]);
  if (lastDataRow >= firstDataRow) dataBar(ws, `F${firstDataRow}:F${lastDataRow}`);
  if (debtors?.truncated) {
    ws.addRow(["Ko‘p yozuv — faqat birinchi 10 000 tasi ko‘rsatildi."]);
  }
  freezeAndFilter(ws, header.number, 6);
  sheetNotes(ws, [
    'Hozir markazga qarzdor bo‘lgan FAOL o‘quvchilar (eng katta qarz yuqorida).',
    '"Qarz" ustunidagi rangli chiziq — qarz kattaligini ko‘rsatadi.',
    'Jami qarz — "Balans" bo‘limidagi "Debitorlik" bilan bir xil (Tekshiruvda tasdiqlangan).',
    'Bu joriy kundagi holat (davr oxiri emas). Ketib qolgan o‘quvchilar qarzi bu yerda yo‘q — u alohida "hisobdan chiqarish" oqimida.',
  ], 6);
}

// ---- Sheet 10: Oylik dinamika ----
export function trendSheet(wb: Workbook, trend: any) {
  const ws = wb.addWorksheet('Oylik dinamika');
  ws.columns = [{ width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }];
  sheetTitle(ws, 'Oylik dinamika (so‘nggi 6 oy)', 'Tanlangan davrdan qat‘i nazar', 5);
  const rows = Array.isArray(trend) ? trend : [];
  const header = tableHeader(ws, ['Oy', 'Tushum', 'Chiqim', 'Foyda', 'Foyda o‘zgarishi %']);
  const firstDataRow = header.number + 1;
  rows.forEach((m: any, i: number) => {
    const prev = i > 0 ? rows[i - 1].profit : null;
    const growth =
      prev != null && prev !== 0
        ? Math.round(((m.profit - prev) / Math.abs(prev)) * 1000) / 10
        : null;
    const r = ws.addRow([m.month, m.income, m.expenses, m.profit, growth ?? '']);
    [2, 3, 4].forEach((c) => (r.getCell(c).numFmt = NUM));
    if (growth != null) r.getCell(5).numFmt = '#,##0.0"%"';
  });
  const lastDataRow = ws.rowCount;
  if (lastDataRow >= firstDataRow) {
    colorScale(ws, `D${firstDataRow}:D${lastDataRow}`);
    dataBar(ws, `B${firstDataRow}:B${lastDataRow}`);
  }
  sheetNotes(ws, [
    'So‘nggi 6 oyning tushum / chiqim / foyda dinamikasi.',
    '"Foyda" ustunidagi rang: qizil = past, yashil = yuqori (oylar orasida taqqoslash).',
    '"Tushum" ustunidagi rangli chiziq — oy tushumining kattaligi.',
    'Bu jadval har doim oxirgi 6 oyni ko‘rsatadi — tanlangan davrdan qat‘i nazar.',
  ], 5);
}

// ---- Sheet: Oylik qarzdorlik (undirish) ----
// Ledger-reconstructed month-end debt with recovery. NOT a live-state sheet, so
// it is never dropped for past-period exports (unlike Qarzdorlar/Balans).
export function monthlyDebtSheet(wb: Workbook, debtHistory: any) {
  const ws = wb.addWorksheet('Oylik qarzdorlik');
  ws.columns = [
    { width: 16 },
    { width: 20 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 13 },
    { width: 42 },
  ];
  sheetTitle(
    ws,
    'Oylik qarzdorlik va undirish',
    'Har oy qancha qarz bilan yopilgani + keyingi undirish',
    8,
  );
  const months = Array.isArray(debtHistory?.months) ? debtHistory.months : [];
  const header = tableHeader(ws, [
    'Oy',
    'Oy oxiridagi qarz',
    'Qarzdorlar',
    'Undirildi',
    'Kechirilgan',
    'Qolgan qarz',
    'Undirish %',
    'Izoh',
  ]);
  const firstDataRow = header.number + 1;
  months.forEach((m: any) => {
    const izoh =
      m.monthKey === '2026-05' ? "Pul oqimi to‘liq emas (o‘tish davri)" : '';
    const r = ws.addRow([
      m.label,
      m.closingDebt,
      m.debtorCount,
      m.recovered,
      m.writtenOff,
      m.remaining,
      m.recoveryRate,
      izoh,
    ]);
    [2, 3, 4, 5, 6].forEach((c) => (r.getCell(c).numFmt = NUM));
    r.getCell(7).numFmt = '#,##0.0"%"';
    const ic = r.getCell(8);
    ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
    ic.alignment = { wrapText: true, vertical: 'top' };
  });
  const lastDataRow = ws.rowCount;
  const t = debtHistory?.totals ?? {
    closingDebt: 0,
    recovered: 0,
    writtenOff: 0,
    remaining: 0,
  };
  // Debtor count isn't summable across months (cohorts overlap) → left blank.
  totalsRow(
    ws,
    ['Jami', t.closingDebt, '', t.recovered, t.writtenOff, t.remaining, '', ''],
    [2, 4, 5, 6],
  );
  if (lastDataRow >= firstDataRow) {
    dataBar(ws, `B${firstDataRow}:B${lastDataRow}`);
    colorScale(ws, `G${firstDataRow}:G${lastDataRow}`);
  }
  freezeAndFilter(ws, header.number, 8);
  sheetNotes(
    ws,
    [
      '"Oy oxiridagi qarz" — o‘sha oy oxirida (Toshkent) balansi manfiy bo‘lgan BARCHA o‘quvchilar qarzi (statusdan qat‘i nazar). Bu raqam muzlagan — keyin o‘zgarmaydi.',
      '"Undirildi" — o‘sha oy qarzdorlarining keyingi naqd to‘lovlari, har o‘quvchida o‘sha oy qarzi bilan cheklangan (tizim eng eski qarzdan yopadi). "Kechirilgan" — DEBT_WRITE_OFF (naqdsiz, alohida).',
      '"Qolgan qarz" = Oy oxiridagi qarz − Undirildi − Kechirilgan. "Undirish %" = Undirildi ÷ Oy oxiridagi qarz.',
      'Ledgerdan (Transaction) qayta hisoblangan — kompaniya bo‘yicha (filial kesimi yo‘q).',
    ],
    8,
  );
}

// ---- Sheet 11: Filial kesimida ----
export function perBranchSheet(wb: Workbook, perBranch: any, period: string) {
  const ws = wb.addWorksheet('Filial kesimida');
  ws.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  sheetTitle(ws, 'Filial kesimida', period, 5);
  const rows = Array.isArray(perBranch) ? perBranch : [];
  const header = tableHeader(ws, ['Filial', 'Tushum', 'Chiqim', 'Foyda', 'Qarz']);
  const firstDataRow = header.number + 1;
  let ti = 0;
  let te = 0;
  let tp = 0;
  let td = 0;
  rows.forEach((b: any) => {
    ti += b.income ?? 0;
    te += b.expense ?? 0;
    tp += b.profit ?? 0;
    td += b.debt ?? 0;
    const r = ws.addRow([b.branchName, b.income, b.expense, b.profit, b.debt]);
    [2, 3, 4, 5].forEach((c) => (r.getCell(c).numFmt = NUM));
  });
  const lastDataRow = ws.rowCount;
  totalsRow(ws, ['Jami', ti, te, tp, td], [2, 3, 4, 5]);
  if (lastDataRow >= firstDataRow) dataBar(ws, `B${firstDataRow}:B${lastDataRow}`);
  freezeAndFilter(ws, header.number, 5);
  sheetNotes(ws, [
    'Har bir filial bo‘yicha tushum / chiqim / foyda / qarz.',
    '"Tushum" ustunidagi rangli chiziq — filiallarni tez taqqoslash uchun.',
    'Diqqat: ustoz oyligi filialga taqsimlanmaydi — shu sababli "Chiqim" va "Foyda" oyliksiz (faqat operatsion xarajat, avanssiz).',
  ], 5);
}

// ---- Sheet 13: Tekshiruv (reconciliation) ----
export function reconciliationSheet(
  wb: Workbook,
  recon: any,
  pl: any,
  payments: any,
  expenses: any,
  salaries: any,
  debtors: any,
  bs: any,
  period: string,
  // When false (a past-month bot export that dropped the Balans/Qarzdorlar
  // sheets), skip the two rows that tie against live balance-sheet/debtor state
  // — they'd compare a current-state receivable to a past-period P&L.
  includePointInTime = true,
) {
  const ws = wb.addWorksheet('Tekshiruv');
  ws.columns = [
    { width: 44 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 10 }, { width: 40 },
  ];
  sheetTitle(ws, 'Tekshiruv (reconciliation)', period, 6);

  const opByCat = (pl?.operatingExpenses?.byCategory ?? []).reduce(
    (s: number, e: any) => s + (e.amount ?? 0),
    0,
  );

  sectionHeader(ws, 'Ties (mos kelishi)', 6);
  tableHeader(ws, ['Tekshiruv', 'Kutilgan', 'Haqiqiy', 'Farq', 'Holat', 'Izoh']);
  checkRow(ws, 'To‘lovlar = Foyda-zarar daromad', pl?.revenue?.total ?? 0, payments?.total ?? 0, 'Cash tie-out.');
  if (includePointInTime)
    checkRow(ws, 'Qarzdorlar = Balans debitorlik', bs?.assets?.accountsReceivable ?? 0, debtors?.total ?? 0);
  checkRow(ws, 'Xarajatlar = P&L (operatsion + avans)', opByCat + (pl?.costOfServices?.teacherAdvances ?? 0), expenses?.total ?? 0);
  checkRow(ws, 'O‘quvchi balansi footing', (recon?.student?.opening ?? 0) + (recon?.student?.activityTotal ?? 0), recon?.student?.closing ?? 0);
  checkRow(ws, 'GL recon: Σ balans = Σ ledger (kompaniya)', recon?.gl?.storedBalanceSum ?? 0, recon?.gl?.ledgerSum ?? 0);

  // Balanslashuv farqi (bir yozuvli tizim) — moved here from Balans, informational.
  if (includePointInTime) {
    const balGap = (bs?.assets?.total ?? 0) - ((bs?.liabilities?.total ?? 0) + (bs?.equity?.total ?? 0));
    sectionHeader(ws, 'Balanslashuv (bir yozuvli tizim — ma‘lumot)', 6);
    kvRow(ws, 'Aktiv − (Passiv + Kapital) farqi', balGap, 'Tizim ikki yozuvli GL emas — 0 ga yaqin bo‘lsa hammasi joyida.');
  }

  // Oylik — computed vs cash-paid (informational, NOT a MOS/XATO tie: they are
  // offset by the payroll cycle — this month's salary is paid next month).
  const computedNet = salaries?.totals?.netToPay ?? 0;
  const cashPaid = (pl?.costOfServices?.teacherSalaries ?? 0) + (pl?.operatingExpenses?.adminSalaries ?? 0);
  sectionHeader(ws, 'Oylik: hisoblangan vs naqd to‘langan (ma‘lumot)', 6);
  kvRow(ws, 'Hisoblangan oylik (sof, shu oy)', computedNet, '"Oyliklar" bo‘limi — shu oy uchun ustozlarga hisoblangan.');
  kvRow(ws, 'Naqd to‘langan oylik (P&L)', cashPaid, 'Shu davrda haqiqatan pul chiqarilgan oylik.');

  // O'quvchi balansi roll-forward
  const a = recon?.student?.activity ?? {};
  sectionHeader(ws, 'O‘quvchi balansi aylanmasi (kompaniya bo‘yicha)', 6);
  kvRow(ws, 'Davr boshi Σ balans', recon?.student?.opening ?? 0);
  kvRow(ws, '+ To‘lovlar', a.payment ?? 0);
  kvRow(ws, '+ Hisoblangan darslar', a.lessonDeduction ?? 0);
  kvRow(ws, '± Tuzatishlar', a.adjustment ?? 0);
  kvRow(ws, '− Qaytarishlar', a.refund ?? 0);
  kvRow(ws, '− Hisobdan chiqarish', a.writeOff ?? 0);
  kvRow(ws, '+ Boshlang‘ich balans', a.initialBalance ?? 0);
  kvRow(ws, '− Balans yechish', a.withdrawal ?? 0);
  kvRow(ws, '± Boshqa', a.other ?? 0);
  totalsRow(ws, ['= Davr oxiri Σ balans', recon?.student?.closing ?? 0, ''], [2]);

  sheetNotes(ws, [
    'Bu bo‘lim hisobotning har bir raqami bir-biriga MOS kelishini isbotlaydi (audit).',
    'MOS = to‘g‘ri; XATO = nomuvofiqlik (farq ko‘rsatiladi va tuzatilishi kerak).',
    'Aylanma (roll-forward): oy boshidagi qoldiq + davr harakatlari = oy oxiridagi qoldiq — to‘g‘ri qo‘shilib chiqishi ("footing") kerak.',
    'O‘quvchi balansi aylanmasidagi satrlar: Hisoblangan darslar = darslar uchun yechilgan pul; Hisobdan chiqarish = kechirilgan qarz; Boshlang‘ich balans = tizimga o‘tishda kiritilgan; Balans yechish = ortiqcha balansni daromadga o‘tkazish; Boshqa = mayda tuzatishlar.',
    'Oylik "hisoblangan" va "naqd to‘langan" farq qiladi — chunki oylik keyingi oy boshida to‘lanadi (bu XATO emas).',
  ], 6);
}
