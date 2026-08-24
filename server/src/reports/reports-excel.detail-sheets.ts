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
  NetProfit,
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
    { width: 12 },
    { width: 8 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
    { width: 22 },
  ];
  sheetTitle(ws, 'To‘lovlar (davr bo‘yicha)', period, 8);
  const header = tableHeader(ws, [
    'Sana',
    'ID',
    'O‘quvchi',
    'Filial',
    'Summa',
    'Usul',
    'Daromad turi',
    'Qabul qildi',
  ]);
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
      p.receivedBy
        ? `${p.receivedBy.firstName ?? ''} ${p.receivedBy.lastName ?? ''}`.trim()
        : '',
    ]);
    r.getCell(5).numFmt = NUM;
  });
  const lastDataRow = ws.rowCount;
  totalsRow(ws, ['Jami', '', '', '', payments?.total ?? 0, '', '', ''], [5]);
  if (lastDataRow >= firstDataRow)
    dataBar(ws, `E${firstDataRow}:E${lastDataRow}`);
  if (payments?.truncated) {
    ws.addRow([
      'Ko‘p yozuv — faqat birinchi 10 000 tasi ko‘rsatildi. Davrni qisqartiring.',
    ]);
  }
  freezeAndFilter(ws, header.number, 8);
  sheetNotes(
    ws,
    [
      'Bu davrda kassaga real tushgan har bir to‘lov (bittalab).',
      'Summa — to‘langan pul; Usul — naqd/Payme/Click/o‘tkazma; Daromad turi — nima uchun to‘langani.',
      '"Summa" ustunidagi rangli chiziq — to‘lov kattaligini ko‘rsatadi.',
      'Jami summa — "Foyda va zarar" bo‘limidagi daromadga aynan teng (Tekshiruv bo‘limida tasdiqlangan).',
    ],
    8,
  );
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
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 10 },
    { width: 30 },
    { width: 16 },
    { width: 20 },
    { width: 20 },
  ];
  sheetTitle(ws, 'Xarajatlar (davr bo‘yicha)', period, 8);
  const header = tableHeader(ws, [
    'Sana',
    'Kategoriya',
    'Summa',
    'Usul',
    'Izoh',
    'Filial',
    'Ustoz',
    'Kim kiritdi',
  ]);
  const firstDataRow = header.number + 1;
  (expenses?.rows ?? []).forEach((e: any) => {
    const r = ws.addRow([
      fmtDate(e.date),
      EXPENSE_LABELS[e.category] ?? e.category,
      e.amount,
      EXPENSE_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
      e.description ?? '',
      e.branchId != null ? (branchNames[e.branchId] ?? `#${e.branchId}`) : '',
      e.relatedUser
        ? `${e.relatedUser.firstName ?? ''} ${e.relatedUser.lastName ?? ''}`.trim()
        : '',
      e.createdBy
        ? `${e.createdBy.firstName ?? ''} ${e.createdBy.lastName ?? ''}`.trim()
        : '',
    ]);
    r.getCell(3).numFmt = NUM;
  });
  const lastDataRow = ws.rowCount;
  totalsRow(ws, ['Jami', '', expenses?.total ?? 0, '', '', '', '', ''], [3]);
  if (lastDataRow >= firstDataRow)
    dataBar(ws, `C${firstDataRow}:C${lastDataRow}`);
  if (expenses?.truncated) {
    ws.addRow([
      'Ko‘p yozuv — faqat birinchi 10 000 tasi ko‘rsatildi. Davrni qisqartiring.',
    ]);
  }
  // An oversized "Boshqa" bucket means the month's spending cannot be read at
  // all — June 2026 hid 65 515 000 so'm (71% of operating spend) in it. The
  // report surfaces that rather than presenting the split as meaningful.
  const otherTotal = (expenses?.rows ?? [])
    .filter((e: any) => e.category === 'OTHER')
    .reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  const grand = expenses?.total ?? 0;
  if (grand > 0 && otherTotal / grand > 0.3) {
    const pct = Math.round((otherTotal / grand) * 1000) / 10;
    const w = ws.addRow([
      `DIQQAT: «Boshqa» ulushi ${pct}% (${otherTotal.toLocaleString('ru-RU')} so'm) — bu xarajatlar toifalanmagan, shuning uchun nimaga sarflangani hisobotdan bilinmaydi.`,
    ]);
    w.getCell(1).font = { bold: true, color: { argb: 'FFB06A00' } };
  }
  freezeAndFilter(ws, header.number, 8);
  sheetNotes(
    ws,
    [
      'Bu davrda qilingan har bir xarajat (ijara, kommunal, marketing va h.k.).',
      'Ustozga berilgan avans ham shu yerda — "Ustoz" ustunida ismi bilan.',
      'Jami — "Foyda va zarar" bo‘limidagi operatsion xarajat + avansga teng (Tekshiruvda tasdiqlangan).',
      'Diqqat: ustozlar oyligi bu yerda EMAS — u alohida "Oyliklar" bo‘limida.',
    ],
    8,
  );
}

// ---- Sheet 8: Oyliklar (computed monthly — the /payments/salary view) ----
export function salariesSheet(
  wb: Workbook,
  salaries: any,
  period: string,
  monthLabel: string,
) {
  const ws = wb.addWorksheet('Oyliklar');
  ws.columns = [
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
  ];
  // The sheet is a per-month view by design (`salaries` is fetched for a single
  // month, even inside a multi-month export) — the header names THAT month, so
  // a 3-month export no longer prints the whole period above one month's payroll.
  sheetTitle(
    ws,
    'Ustozlar oyligi — hisoblangan',
    `${monthLabel} darslari uchun`,
    9,
  );
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
      r.centerFunded ?? '—',
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
    [
      'Jami',
      t.covered ?? 0,
      t.carriedIn ?? 0,
      t.centerFunded ?? 0,
      t.fullDeserved ?? 0,
      t.advances ?? 0,
      t.netToPay ?? 0,
      t.carriedOut ?? 0,
      '',
    ],
    [2, 3, 4, 5, 6, 7, 8],
  );
  if (lastDataRow >= firstDataRow)
    dataBar(ws, `G${firstDataRow}:G${lastDataRow}`);
  freezeAndFilter(ws, header.number, 9);

  // Markaz qo'shimchasi lifecycle (company-level, this month) — mirrors the
  // /payments/salary summary card. Shown only when the center actually fronted
  // money (past settled top-up months; 0 for the in-progress month).
  if ((t.centerAdvanced ?? 0) > 0) {
    sectionHeader(ws, 'Markaz qo‘shimchasi — undirish holati (shu oy)', 9);
    kvRow(
      ws,
      'Jami qo‘shdi',
      t.centerAdvanced ?? 0,
      'Markaz o‘z hisobidan ustozlarga qo‘shib bergan jami summa (X).',
    );
    kvRow(
      ws,
      'Undirildi',
      t.centerRecovered ?? 0,
      'O‘quvchilar keyin to‘lab, markazga qaytgan qism — ustozga qayta yozilmaydi (Y).',
    );
    kvRow(
      ws,
      'Qolgan (markaz)',
      t.centerStillFronted ?? 0,
      'Hali qoplanmagan — markazning joriy xarajati (Z = X − Y).',
    );
  }

  // Xodimlar oyligi — non-teaching FIXED_MONTHLY staff (admin/cashier/director).
  // Additive block; the teacher rows/totals above are untouched, and this data
  // NEVER feeds the "Sof foyda" sheet (that already counts staff via
  // adminSalaries on a cash basis — double-count trap).
  const staff = salaries?.staff ?? [];
  if (staff.length > 0) {
    sectionHeader(ws, 'Xodimlar oyligi (oylik xodimlar)', 9);
    const sHeader = tableHeader(ws, [
      'Xodim',
      'Lavozim',
      'Oylik summa',
      'Avans',
      'Sof to‘lanadigan',
      'Holati',
    ]);
    const sFirst = sHeader.number + 1;
    staff.forEach((s: any) => {
      const statusLabel = s.payment
        ? (SALARY_STATUS_LABELS[s.payment.status] ?? s.payment.status)
        : 'Hisoblangan';
      const row = ws.addRow([
        `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim(),
        s.user?.position ?? '',
        s.monthly ?? 0,
        s.advances ?? 0,
        s.netToPay ?? 0,
        statusLabel,
      ]);
      [3, 4, 5].forEach((c) => {
        if (typeof row.getCell(c).value === 'number')
          row.getCell(c).numFmt = NUM;
      });
    });
    const sLast = ws.rowCount;
    const st = salaries?.staffTotals ?? {};
    totalsRow(
      ws,
      ['Jami', '', st.monthly ?? 0, st.advances ?? 0, st.netToPay ?? 0, ''],
      [3, 4, 5],
    );
    if (sLast >= sFirst) dataBar(ws, `E${sFirst}:E${sLast}`);
  }

  sheetNotes(
    ws,
    [
      'Shu oy uchun HISOBLANGAN ustoz oyligi — oylik sahifasidagi kabi (to‘lov qilinmagan bo‘lsa ham to‘la ko‘rinadi).',
      'O‘quvchilar to‘lagan = o‘quvchilar pulidan tushgan qism; Markaz qo‘shimchasi = markaz o‘z hisobidan qoplagan qism.',
      'Jami hisoblangan = O‘quvchilar to‘lagan + Markaz qo‘shimchasi. Sof to‘lanadigan = avans ayirilgach ustozga beriladigan summa.',
      '"shundan oldingi oydan" — "O‘quvchilar to‘lagan" ichida OLDINGI oy darslaridan kechikib kelib qo‘shilgan qism (uning bir bo‘lagi).',
      '"Keyingi oyga o‘tgan" — bu oy darslarining kech to‘langani KEYINGI oyga o‘tdi (bu oy summasida YO‘Q; keyingi oy oyligiga qo‘shiladi).',
      '"Sof to‘lanadigan" ustunidagi rangli chiziq — oylik kattaligini ko‘rsatadi. Diqqat: oylik odatda keyingi oy boshida to‘lanadi. Bu bo‘lim faqat USTOZLAR.',
      '"Markaz qo‘shimchasi — undirish holati" bloki (agar bo‘lsa): markaz shu oy qo‘shgan pulning qanchasi o‘quvchilar tomonidan keyin qoplangani (undirildi) va qanchasi hali markaz zimmasida qolgani.',
      '"Xodimlar oyligi" bloki (agar bo‘lsa) — dars o‘tmaydigan qat‘iy oylik xodimlar (administrator, kassir, direktor). Oy o‘rtasida ishga kirgan yoki ketgan bo‘lsa, ishlagan kunlariga mutanosib (proratsiya) hisoblanadi.',
      '"—" belgisi — o‘sha oyda dars ma‘lumoti yo‘q (masalan o‘tish oyi).',
    ],
    9,
  );
}

// ---- Sheet 9: Qarzdorlar ----
export function debtorsSheet(
  wb: Workbook,
  debtors: any,
  branchNames: Record<number, string>,
) {
  const ws = wb.addWorksheet('Qarzdorlar');
  ws.columns = [
    { width: 8 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 34 },
    { width: 16 },
  ];
  sheetTitle(
    ws,
    'Qarzdorlar',
    `Holat sanasi: ${tashkentTodayStr()} (davr oxiri emas)`,
    6,
  );
  const header = tableHeader(ws, [
    'ID',
    'O‘quvchi',
    'Filial',
    'Telefon',
    'Guruhlar',
    'Qarz',
  ]);
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
  if (lastDataRow >= firstDataRow)
    dataBar(ws, `F${firstDataRow}:F${lastDataRow}`);
  if (debtors?.truncated) {
    ws.addRow(['Ko‘p yozuv — faqat birinchi 10 000 tasi ko‘rsatildi.']);
  }
  freezeAndFilter(ws, header.number, 6);
  sheetNotes(
    ws,
    [
      'Hozir markazga qarzdor bo‘lgan FAOL o‘quvchilar (eng katta qarz yuqorida).',
      '"Qarz" ustunidagi rangli chiziq — qarz kattaligini ko‘rsatadi.',
      'Jami qarz — "Balans" bo‘limidagi "Debitorlik" bilan bir xil (Tekshiruvda tasdiqlangan).',
      'Bu joriy kundagi holat (davr oxiri emas). Ketib qolgan o‘quvchilar qarzi bu yerda yo‘q — u alohida "hisobdan chiqarish" oqimida.',
    ],
    6,
  );
}

// ---- Sheet 10: Oylik dinamika ----
export function trendSheet(wb: Workbook, trend: any) {
  const ws = wb.addWorksheet('Oylik dinamika');
  ws.columns = [
    { width: 12 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
  ];
  sheetTitle(
    ws,
    'Oylik dinamika (so‘nggi 6 oy)',
    'Tanlangan davrdan qat‘i nazar',
    5,
  );
  const rows = Array.isArray(trend) ? trend : [];
  const header = tableHeader(ws, [
    'Oy',
    'Tushum',
    'Chiqim',
    'Foyda',
    'Foyda o‘zgarishi %',
  ]);
  const firstDataRow = header.number + 1;
  rows.forEach((m: any, i: number) => {
    const prev = i > 0 ? rows[i - 1].profit : null;
    const growth =
      prev != null && prev !== 0
        ? Math.round(((m.profit - prev) / Math.abs(prev)) * 1000) / 10
        : null;
    const r = ws.addRow([
      m.month,
      m.income,
      m.expenses,
      m.profit,
      growth ?? '',
    ]);
    [2, 3, 4].forEach((c) => (r.getCell(c).numFmt = NUM));
    if (growth != null) r.getCell(5).numFmt = '#,##0.0"%"';
  });
  const lastDataRow = ws.rowCount;
  if (lastDataRow >= firstDataRow) {
    colorScale(ws, `D${firstDataRow}:D${lastDataRow}`);
    dataBar(ws, `B${firstDataRow}:B${lastDataRow}`);
  }
  sheetNotes(
    ws,
    [
      'So‘nggi 6 oyning tushum / chiqim / foyda dinamikasi.',
      '"Foyda" ustunidagi rang: qizil = past, yashil = yuqori (oylar orasida taqqoslash).',
      '"Tushum" ustunidagi rangli chiziq — oy tushumining kattaligi.',
      'Bu jadval har doim oxirgi 6 oyni ko‘rsatadi — tanlangan davrdan qat‘i nazar.',
    ],
    5,
  );
}

// ---- Sheet: Qarz harakati (roll-forward) ----
// The one debt view whose columns SUM: every so'm is attributed to the month it
// moved in and to the reason that moved it, so a «Jami» over the flow columns is
// meaningful. The balance columns (opening/closing) are deliberately left out of
// that total — adding month-end balances counts the same debt once per month.
export function debtFlowSheet(wb: Workbook, history: any) {
  const ws = wb.addWorksheet('Qarz harakati');
  ws.columns = [
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 40 },
  ];
  sheetTitle(
    ws,
    'Qarz harakati',
    'Oy boshi + yangi qarz − to‘landi − kechirildi − boshqa = oy oxiri',
    9,
  );
  const months = Array.isArray(history?.months) ? history.months : [];
  const header = tableHeader(ws, [
    'Oy',
    'Oy boshidagi qarz',
    'Yangi qarz (+)',
    'To‘landi (−)',
    'Kechirildi (−)',
    'Boshqa (−)',
    'Oy oxiridagi qarz',
    'O‘zgarish',
    'Izoh',
  ]);
  const firstDataRow = header.number + 1;
  months.forEach((m: any) => {
    const notes: string[] = [];
    if (m.isCurrent) notes.push('Oy hali tugamagan — raqamlar o‘zgaradi');
    if (m.monthKey === '2026-05')
      notes.push('Pul oqimi to‘liq emas (o‘tish davri)');
    const r = ws.addRow([
      m.label,
      m.openingDebt,
      m.debtAdded,
      m.debtPaid,
      m.debtForgiven,
      m.debtOther,
      m.closingDebt,
      m.delta,
      notes.join('; '),
    ]);
    [2, 3, 4, 5, 6, 7, 8].forEach((c) => (r.getCell(c).numFmt = NUM));
    const ic = r.getCell(9);
    ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
    ic.alignment = { wrapText: true, vertical: 'top' };
  });
  const t = history?.totals ?? {
    debtAdded: 0,
    debtPaid: 0,
    debtForgiven: 0,
    debtOther: 0,
  };
  // Opening/closing are balances, not flows — a column total there would be the
  // same double count the old «Jami qarz» row printed.
  totalsRow(
    ws,
    [
      'Jami',
      '',
      t.debtAdded,
      t.debtPaid,
      t.debtForgiven,
      t.debtOther,
      '',
      '',
      'Qoldiq ustunlari qo‘shilmaydi — oxirgi oyning oxiri = bugungi qarz',
    ],
    [3, 4, 5, 6],
  );
  freezeAndFilter(ws, header.number, 9);
  sheetNotes(ws, [
    'Har bir so‘m FAQAT bir marta va faqat o‘zi harakatlangan oyga yoziladi, shuning uchun oqim ustunlari qo‘shiladi.',
    'Oy oxiridagi qarz — muzlagan raqam: o‘tgan oy uchun keyin o‘zgarmaydi. Joriy oy bundan mustasno.',
    '«Boshqa» — tuzatish (ADJUSTMENT), boshlang‘ich balans va pul qaytarish: qarzni kamaytiradi, lekin markaz yiqqan pul emas.',
    'Qarz = Σ max(0, −balans). Balans manfiydan musbatga o‘tsa, faqat manfiy qismi hisoblanadi.',
  ]);
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
    { width: 16 },
    { width: 13 },
    { width: 42 },
  ];
  sheetTitle(
    ws,
    'Oylik qarzdorlik va undirish',
    'Har oy qancha qarz bilan yopilgani + keyingi undirish',
    9,
  );
  const months = Array.isArray(debtHistory?.months) ? debtHistory.months : [];
  const header = tableHeader(ws, [
    'Oy',
    'Oy oxiridagi qarz',
    'Qarzdorlar',
    'Undirildi',
    'Kechirilgan',
    'Qolgan qarz',
    'Qolgan qarzdorlar',
    'Undirish %',
    'Izoh',
  ]);
  const firstDataRow = header.number + 1;
  months.forEach((m: any) => {
    const izoh =
      m.monthKey === '2026-05' ? 'Pul oqimi to‘liq emas (o‘tish davri)' : '';
    const r = ws.addRow([
      m.label,
      m.closingDebt,
      m.debtorCount,
      m.recovered,
      m.writtenOff,
      m.remaining,
      m.remainingDebtorCount,
      m.recoveryRate,
      izoh,
    ]);
    [2, 3, 4, 5, 6, 7].forEach((c) => (r.getCell(c).numFmt = NUM));
    r.getCell(8).numFmt = '#,##0.0"%"';
    const ic = r.getCell(9);
    ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
    ic.alignment = { wrapText: true, vertical: 'top' };
  });
  const lastDataRow = ws.rowCount;
  // NOTHING on this sheet is summable across months. Each row is a COHORT
  // measured over a nested window: a payment made in August counts toward May's
  // recovery, June's and July's alike, and the same debtor appears in every
  // month they owed. Production check: 551 distinct debtors, 1 573 cohort
  // memberships (2.85 months each) — the old «Jami» row printed 317 mln so'm of
  // closing debt against 83.75 mln actually outstanding, and 93.6 mln recovered
  // against a 69.2 mln non-duplicated ceiling. The flow totals live on the
  // «Qarz harakati» sheet, which is the one built to be added up.
  totalsRow(
    ws,
    [
      'Jami',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Bu varaqda ustunlar qo‘shilmaydi — har oy alohida kogorta, ular bir-birini qoplaydi. Jami uchun «Qarz harakati» varag‘iga qarang.',
    ],
    [],
  );
  if (lastDataRow >= firstDataRow) {
    dataBar(ws, `B${firstDataRow}:B${lastDataRow}`);
    colorScale(ws, `H${firstDataRow}:H${lastDataRow}`);
  }
  freezeAndFilter(ws, header.number, 9);
  sheetNotes(
    ws,
    [
      '"Oy oxiridagi qarz" — o‘sha oy oxirida (Toshkent) balansi manfiy bo‘lgan BARCHA o‘quvchilar qarzi (statusdan qat‘i nazar). Bu raqam muzlagan — keyin o‘zgarmaydi.',
      '"Qarzdorlar" — o‘sha oyni qarz bilan yopgan o‘quvchilar soni (muzlagan). "Qolgan qarzdorlar" — shulardan hozir HALI qarzi qolganlar soni (to‘liq to‘lagan yoki kechirilganlar chiqib ketadi).',
      '"Undirildi" — o‘sha oy qarzdorlarining keyingi naqd to‘lovlari, har o‘quvchida o‘sha oy qarzi bilan cheklangan (tizim eng eski qarzdan yopadi). "Kechirilgan" — DEBT_WRITE_OFF (naqdsiz, alohida).',
      '"Qolgan qarz" = Oy oxiridagi qarz − Undirildi − Kechirilgan. "Undirish %" = Undirildi ÷ Oy oxiridagi qarz.',
      'Ledgerdan (Transaction) qayta hisoblangan — kompaniya bo‘yicha (filial kesimi yo‘q).',
    ],
    9,
  );
}

// ---- Dedicated "Oylik qarzdorlik" workbook: detail sheets ----
// Each row is one student in one month's cohort / one transaction; the "Oy"
// column carries the month label so all months live in one flat, filterable sheet.

export function debtorsCohortSheet(wb: Workbook, rows: any[]) {
  const ws = wb.addWorksheet('Qarzdorlar');
  ws.columns = [
    { width: 16 },
    { width: 30 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
  ];
  sheetTitle(
    ws,
    'Qarzdorlar (oy oxiri kesimida)',
    'Har oy oxirida qarzdor bo‘lgan o‘quvchilar',
    6,
  );
  const header = tableHeader(ws, [
    'Oy',
    'O‘quvchi',
    'Telefon',
    'Oy oxiridagi qarz',
    'Undirildi',
    'Qolgan',
  ]);
  let td = 0;
  let tr = 0;
  let tq = 0;
  rows.forEach((r) => {
    td += r.monthEndDebt;
    tr += r.recovered;
    tq += r.remaining;
    const row = ws.addRow([
      r.month,
      `#${r.id} ${r.firstName} ${r.lastName}`.trim(),
      r.phone ?? '',
      r.monthEndDebt,
      r.recovered,
      r.remaining,
    ]);
    [4, 5, 6].forEach((c) => (row.getCell(c).numFmt = NUM));
  });
  totalsRow(ws, ['Jami', '', '', td, tr, tq], [4, 5, 6]);
  freezeAndFilter(ws, header.number, 6);
  sheetNotes(
    ws,
    [
      'Har qator — bitta o‘quvchi bitta oy oxirida (statusdan qat‘i nazar). Bir o‘quvchi bir necha oyda ko‘rinishi mumkin — har oy alohida surat.',
      '"Undirildi" o‘sha oy qarzi bilan cheklangan (tizim eng eski qarzdan yopadi). "Qolgan" = Oy oxiridagi qarz − Undirildi − Kechirilgan.',
    ],
    6,
  );
}

export function recoveredPaymentsSheet(wb: Workbook, rows: any[]) {
  const ws = wb.addWorksheet('Undirildi');
  ws.columns = [
    { width: 16 },
    { width: 14 },
    { width: 30 },
    { width: 16 },
    { width: 12 },
    { width: 24 },
  ];
  sheetTitle(
    ws,
    'Undirildi — qarzdorlarning to‘lovlari',
    'Oy tugagach o‘sha oy qarzdorlaridan tushgan to‘lovlar',
    6,
  );
  const header = tableHeader(ws, [
    'Oy',
    'Sana',
    'O‘quvchi',
    'Summa',
    'Usul',
    'Qabul qildi',
  ]);
  let t = 0;
  rows.forEach((r) => {
    t += r.amount;
    const row = ws.addRow([
      r.month,
      fmtDate(r.createdAt),
      `#${r.studentId ?? ''} ${r.firstName} ${r.lastName}`.trim(),
      r.amount,
      r.method ? (METHOD_LABELS[r.method] ?? r.method) : '',
      r.performedBy ?? '',
    ]);
    row.getCell(4).numFmt = NUM;
  });
  totalsRow(ws, ['Jami', '', '', t, '', ''], [4]);
  freezeAndFilter(ws, header.number, 6);
  sheetNotes(
    ws,
    [
      'Bu — o‘sha oy qarzdorlarining oy tugagandan KEYINGI naqd to‘lovlari (undirish manbai).',
      'Diqqat: "Umumiy" varag‘idagi "Undirildi" jamlanmasi har o‘quvchida o‘sha oy qarzi bilan cheklangan, shuning uchun bu ro‘yxat yig‘indisidan kichikroq bo‘lishi mumkin.',
    ],
    6,
  );
}

export function writeOffsSheet(wb: Workbook, rows: any[]) {
  const ws = wb.addWorksheet('Kechirilgan');
  ws.columns = [
    { width: 16 },
    { width: 14 },
    { width: 30 },
    { width: 16 },
    { width: 40 },
    { width: 24 },
  ];
  sheetTitle(
    ws,
    'Kechirilgan — hisobdan chiqarilgan qarzlar',
    'Naqdsiz kechirilgan qarzlar (kim / nega / qachon)',
    6,
  );
  const header = tableHeader(ws, [
    'Oy',
    'Sana',
    'O‘quvchi',
    'Summa',
    'Sabab',
    'Bajardi',
  ]);
  let t = 0;
  rows.forEach((r) => {
    t += r.amount;
    const row = ws.addRow([
      r.month,
      fmtDate(r.createdAt),
      `#${r.studentId ?? ''} ${r.firstName} ${r.lastName}`.trim(),
      r.amount,
      r.reason ?? '',
      r.performedBy ?? '',
    ]);
    row.getCell(4).numFmt = NUM;
  });
  totalsRow(ws, ['Jami', '', '', t, '', ''], [4]);
  freezeAndFilter(ws, header.number, 6);
  sheetNotes(
    ws,
    [
      'Qarzi hisobdan chiqarilgan o‘quvchilar — bu NAQD emas, kechirilgan (markaz zararga yozgan).',
      '"Sabab" — hisobdan chiqarish sababi; "Bajardi" — amalni bajargan xodim.',
    ],
    6,
  );
}

// ---- Sheet 11: Filial kesimida ----
export function perBranchSheet(wb: Workbook, perBranch: any, period: string) {
  const ws = wb.addWorksheet('Filial kesimida');
  ws.columns = [
    { width: 26 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];
  sheetTitle(ws, 'Filial kesimida', period, 5);
  const rows = Array.isArray(perBranch) ? perBranch : [];
  const header = tableHeader(ws, [
    'Filial',
    'Tushum',
    'Chiqim',
    'Foyda',
    'Qarz',
  ]);
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
  if (lastDataRow >= firstDataRow)
    dataBar(ws, `B${firstDataRow}:B${lastDataRow}`);
  freezeAndFilter(ws, header.number, 5);
  sheetNotes(
    ws,
    [
      'Har bir filial bo‘yicha tushum / chiqim / foyda / qarz.',
      '"Tushum" ustunidagi rangli chiziq — filiallarni tez taqqoslash uchun.',
      'Diqqat: ustoz oyligi filialga taqsimlanmaydi — shu sababli "Chiqim" va "Foyda" oyliksiz (faqat operatsion xarajat, avanssiz).',
    ],
    5,
  );
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
  // The single "Sof foyda" figure — footed here so its arithmetic is auditable.
  np?: NetProfit,
) {
  const ws = wb.addWorksheet('Tekshiruv');
  ws.columns = [
    { width: 44 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 10 },
    { width: 40 },
  ];
  sheetTitle(ws, 'Tekshiruv (reconciliation)', period, 6);

  const opByCat = (pl?.operatingExpenses?.byCategory ?? []).reduce(
    (s: number, e: any) => s + (e.amount ?? 0),
    0,
  );

  sectionHeader(ws, 'Ties (mos kelishi)', 6);
  tableHeader(ws, [
    'Tekshiruv',
    'Kutilgan',
    'Haqiqiy',
    'Farq',
    'Holat',
    'Izoh',
  ]);
  checkRow(
    ws,
    'To‘lovlar = Foyda-zarar daromad',
    pl?.revenue?.total ?? 0,
    payments?.total ?? 0,
    'Cash tie-out.',
  );
  if (includePointInTime)
    checkRow(
      ws,
      'Qarzdorlar = Balans debitorlik',
      bs?.assets?.accountsReceivable ?? 0,
      debtors?.total ?? 0,
    );
  checkRow(
    ws,
    'Xarajatlar = P&L (operatsion + avans)',
    opByCat + (pl?.costOfServices?.teacherAdvances ?? 0),
    expenses?.total ?? 0,
  );
  checkRow(
    ws,
    'O‘quvchi balansi footing',
    (recon?.student?.opening ?? 0) + (recon?.student?.activityTotal ?? 0),
    recon?.student?.closing ?? 0,
  );
  checkRow(
    ws,
    'GL recon: Σ balans = Σ ledger (kompaniya)',
    recon?.gl?.storedBalanceSum ?? 0,
    recon?.gl?.ledgerSum ?? 0,
  );

  // Balanslashuv farqi (bir yozuvli tizim) — moved here from Balans, informational.
  if (includePointInTime) {
    const balGap =
      (bs?.assets?.total ?? 0) -
      ((bs?.liabilities?.total ?? 0) + (bs?.equity?.total ?? 0));
    sectionHeader(ws, 'Balanslashuv (bir yozuvli tizim — ma‘lumot)', 6);
    kvRow(
      ws,
      'Aktiv − (Passiv + Kapital) farqi',
      balGap,
      'Tizim ikki yozuvli GL emas — 0 ga yaqin bo‘lsa hammasi joyida.',
    );
  }

  // Oylik — computed vs cash-paid (informational, NOT a MOS/XATO tie: they are
  // offset by the payroll cycle — this month's salary is paid next month).
  const computedNet = salaries?.totals?.netToPay ?? 0;
  const cashPaid =
    (pl?.costOfServices?.teacherSalaries ?? 0) +
    (pl?.operatingExpenses?.adminSalaries ?? 0);
  sectionHeader(ws, 'Oylik: hisoblangan vs naqd to‘langan (ma‘lumot)', 6);
  kvRow(
    ws,
    'Hisoblangan oylik (sof, shu oy)',
    computedNet,
    '"Oyliklar" bo‘limi — shu oy uchun ustozlarga hisoblangan.',
  );
  kvRow(
    ws,
    'Naqd to‘langan oylik (P&L)',
    cashPaid,
    'Shu davrda haqiqatan pul chiqarilgan oylik.',
  );

  // Sof foyda (aniq) — footing so the «Sof foyda» sheet's arithmetic is auditable.
  if (np) {
    const footed =
      np.revenue -
      np.teacherSalary -
      np.adminSalary -
      np.operatingExpenses -
      np.refunds;
    sectionHeader(ws, 'Sof foyda (aniq) — footing', 6);
    kvRow(ws, 'Tushum', np.revenue);
    kvRow(ws, `− Ustoz oyligi (${np.teacherSalaryBasis})`, np.teacherSalary);
    kvRow(ws, '− Admin oyligi', np.adminSalary);
    kvRow(ws, '− Operatsion xarajat (avanssiz)', np.operatingExpenses);
    kvRow(ws, '− Qaytarishlar (refund)', np.refunds);
    checkRow(
      ws,
      '= Sof foyda (footing)',
      footed,
      np.netProfit,
      'Komponentlar yig‘indisi «Sof foyda» bo‘limidagi raqamga teng bo‘lishi kerak.',
    );
  }

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
  totalsRow(
    ws,
    ['= Davr oxiri Σ balans', recon?.student?.closing ?? 0, ''],
    [2],
  );

  sheetNotes(
    ws,
    [
      'Bu bo‘lim hisobotning har bir raqami bir-biriga MOS kelishini isbotlaydi (audit).',
      'MOS = to‘g‘ri; XATO = nomuvofiqlik (farq ko‘rsatiladi va tuzatilishi kerak).',
      'Aylanma (roll-forward): oy boshidagi qoldiq + davr harakatlari = oy oxiridagi qoldiq — to‘g‘ri qo‘shilib chiqishi ("footing") kerak.',
      'O‘quvchi balansi aylanmasidagi satrlar: Hisoblangan darslar = darslar uchun yechilgan pul; Hisobdan chiqarish = kechirilgan qarz; Boshlang‘ich balans = tizimga o‘tishda kiritilgan; Balans yechish = ortiqcha balansni daromadga o‘tkazish; Boshqa = mayda tuzatishlar.',
      'Oylik "hisoblangan" va "naqd to‘langan" farq qiladi — chunki oylik keyingi oy boshida to‘lanadi (bu XATO emas).',
    ],
    6,
  );
}
