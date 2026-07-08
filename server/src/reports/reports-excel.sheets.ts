/**
 * Formal-statement + framing sheet builders for the "Moliyaviy hisobot"
 * workbook: Muqova / Asosiy xulosa / Foyda va zarar / Balans /
 * To'lov usullari / Izoh. The line-item + reconciliation builders live in
 * reports-excel.detail-sheets.ts. Data params are loosely typed (`any`) — the
 * shapes come straight from the ReportsService facade and are only read here.
 */
import { Workbook } from 'exceljs';
import {
  NAVY,
  SUBTLE,
  NUM,
  REVENUE_LABELS,
  EXPENSE_LABELS,
  METHOD_LABELS,
  sheetTitle,
  sectionHeader,
  tableHeader,
  totalsRow,
  kvRow,
  deltaRow,
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
    ['Asosiy xulosa', 'Sodda tilda umumiy natija va joriy-vs-o‘tgan taqqoslash'],
    ['Foyda va zarar', 'Daromad − tannarx − xarajat = foyda + marja'],
    ['Pul oqimi', 'Kassa kirim/chiqim va davr oxiri qoldig‘i'],
    ['Balans', 'Aktiv, passiv, kapital (joriy holat)'],
    ["To‘lovlar", "Davrdagi har bir qabul qilingan to‘lov"],
    ['Xarajatlar', 'Davrdagi har bir xarajat'],
    ['Oyliklar', 'Ustozlar oyligi (davrda to‘langan)'],
    ['Qarzdorlar', "Qarzdor o‘quvchilar ro‘yxati"],
    ['Oylik dinamika', "So‘nggi 6 oy: tushum/chiqim/foyda"],
    ...(companyWide
      ? [['Filial kesimida', 'Filiallar bo‘yicha tushum/chiqim/foyda/qarz']]
      : []),
    ["To‘lov usullari", "To‘lov usuli va daromad turi bo‘yicha"],
    ['Tekshiruv', 'Reconciliation (MOS/XATO) va aylanmalar'],
    ["Izoh / Lug‘at", 'Atamalarning sodda izohi'],
  ];
  toc.forEach(([name, desc], i) => {
    const r = ws.addRow([`${i + 2}. ${name}`, desc]);
    r.getCell(2).font = { color: { argb: SUBTLE } };
  });
}

// ---- Sheet 2: Asosiy xulosa ----
export function summarySheet(
  wb: Workbook,
  overview: any,
  prior: any,
  period: string,
  currentTag: string,
  priorTag: string,
  computedSalaryNet = 0,
) {
  const ws = wb.addWorksheet('Asosiy xulosa');
  ws.columns = [
    { width: 34 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 15 }, { width: 48 },
  ];
  sheetTitle(ws, 'Asosiy xulosa', period, 6);

  const o = overview ?? {};
  const p = prior ?? {};

  sectionHeader(ws, 'NATIJA, QARZDORLIK, O‘QUVCHILAR (davrlar taqqoslashi)', 6);
  tableHeader(ws, ['Ko‘rsatkich', currentTag, priorTag, 'Farq', 'O‘zgarish %', 'Izoh']);
  deltaRow(ws, 'Tushgan tushum', o.income?.actual ?? 0, p.income?.actual ?? 0, 'Davrda qabul qilingan to‘lovlar (kassa asosida).');
  deltaRow(ws, 'Umumiy chiqim (xarajat + oylik)', (o.expenses ?? 0) + (o.salary?.paid ?? 0), (p.expenses ?? 0) + (p.salary?.paid ?? 0), 'Operatsion xarajat + to‘langan oyliklar.');
  deltaRow(ws, 'Sof foyda', o.netProfit ?? 0, p.netProfit ?? 0, 'Ekrandagi dashboard bilan bir xil (kassa asosida).');
  deltaRow(ws, 'Jami qarz', o.forecast?.outstandingReceivable ?? 0, p.forecast?.outstandingReceivable ?? 0, 'Faol o‘quvchilarning umumiy qarzi (joriy holat).');
  deltaRow(ws, 'Qarzdorlar soni', o.debtorCount ?? 0, p.debtorCount ?? 0, undefined, { count: true });
  deltaRow(ws, 'Faol o‘quvchilar', o.activeStudentCount ?? 0, p.activeStudentCount ?? 0, undefined, { count: true });
  deltaRow(ws, 'Yangi o‘quvchilar', o.newStudentCount ?? 0, p.newStudentCount ?? 0, undefined, { count: true });
  deltaRow(ws, 'To‘lov qilganlar', o.ltvPayerCount ?? 0, p.ltvPayerCount ?? 0, undefined, { count: true });

  sectionHeader(ws, 'Qo‘shimcha ko‘rsatkichlar', 6);
  kvRow(ws, 'Hisoblangan daromad (darslar)', o.income?.billed ?? 0, 'Bu davrda o‘quvchilarga real hisoblab yozilgan darslar puli (accrual).');
  kvRow(ws, 'Prognoz (bashorat)', o.income?.expected ?? 0, 'Barcha faol o‘quvchi to‘liq oy o‘qisa kutiladigan summa — haqiqiy hisob emas.');
  kvRow(
    ws,
    'Sof foyda (hisoblangan oylik bilan)',
    (o.netProfit ?? 0) + (o.salary?.paid ?? 0) - computedSalaryNet,
    'Yuqoridagi "Sof foyda"dan shu oy uchun HISOBLANGAN ustoz oyligi ayirilgan — real oy natijasi (oylik keyingi oy to‘lansa ham). "Oyliklar" bo‘limiga qarang.',
  );

  sheetNotes(ws, [
    'Bu — hisobotning eng muhim, sodda tilda XULOSAsi. NATIJA = tushum − chiqim = sof foyda.',
    `"${currentTag} / ${priorTag} / Farq / O‘zgarish %" ustunlari — joriy davrni oldingi teng davr bilan taqqoslaydi (yashil = o‘sish, qizil = kamayish). "Farq" = ikki davr orasidagi ayirma, "O‘zgarish %" = shu ayirmaning foizi.`,
    'Sof foyda kassa asosida (ekrandagi ko‘rsatkich bilan bir xil). "Sof foyda (hisoblangan oylik bilan)" — ustoz oyligi hisobga olingan real natija.',
  ], 6);
}

// ---- Sheet 3: Foyda va zarar ----
export function profitLossSheet(wb: Workbook, pl: any, period: string) {
  const ws = wb.addWorksheet('Foyda va zarar');
  ws.columns = [{ width: 40 }, { width: 20 }, { width: 50 }];
  sheetTitle(ws, 'Foyda va zarar (naqd asosida — tushgan to‘lovlar)', period, 3);
  if (!pl) return;

  sectionHeader(ws, 'Daromad');
  tableHeader(ws, ['Tur', 'Soni', 'Summa']);
  (pl.revenue?.byType ?? []).forEach((r: any) => {
    const row = ws.addRow([REVENUE_LABELS[r.type] ?? r.type, r.count, r.amount]);
    row.getCell(3).numFmt = NUM;
  });
  totalsRow(ws, ['Jami daromad', '', pl.revenue?.total ?? 0], [3]);

  sectionHeader(ws, 'Xizmat tannarxi (ustozlar ulushi)');
  kvRow(ws, 'Ustoz oyligi', pl.costOfServices?.teacherSalaries ?? 0, 'Darslar uchun ustozlarga to‘langan (accrual asosidagi) oylik.');
  kvRow(ws, 'Ustoz avanslari', pl.costOfServices?.teacherAdvances ?? 0);
  kvRow(ws, 'Jami tannarx', pl.costOfServices?.total ?? 0, undefined, { bold: true });
  kvRow(ws, 'Yalpi foyda', pl.grossProfit ?? 0, 'Daromad − tannarx.', { bold: true });
  kvRow(ws, 'Yalpi marja', pl.margins?.grossMarginPercent ?? 0, undefined, { percent: true });

  sectionHeader(ws, 'Operatsion xarajatlar');
  tableHeader(ws, ['Kategoriya', '', 'Summa']);
  (pl.operatingExpenses?.byCategory ?? []).forEach((e: any) => {
    const row = ws.addRow([EXPENSE_LABELS[e.category] ?? e.category, '', e.amount]);
    row.getCell(3).numFmt = NUM;
  });
  ws.addRow(['Admin oyligi', '', pl.operatingExpenses?.adminSalaries ?? 0]).getCell(3).numFmt = NUM;
  totalsRow(ws, ['Jami operatsion xarajat', '', pl.operatingExpenses?.total ?? 0], [3]);

  sectionHeader(ws, 'Natija');
  kvRow(
    ws,
    'Sof foyda (hisobot uslubida — buxgalteriya ko‘rinishi)',
    pl.netProfit ?? 0,
    'Bu ko‘rsatkich avanslarni to‘langan sanasi bo‘yicha va ustoz/admin oyligini alohida hisoblaydi; shu sababli "Asosiy xulosa"dagi kassa asosidagi sof foyda bilan farq qilishi mumkin.',
    { bold: true },
  );
  kvRow(ws, 'Sof marja', pl.margins?.netMarginPercent ?? 0, undefined, { percent: true });

  sheetNotes(ws, [
    'Foyda va zarar = Daromad − Xizmat tannarxi (ustozlar ulushi) − Operatsion xarajatlar = Sof foyda.',
    'Marja — foydalilik foizi. Yalpi marja = Yalpi foyda ÷ Daromad; Sof marja = Sof foyda ÷ Daromad. Masalan 38% = har 100 so‘m tushumdan 38 so‘m foyda.',
    'Diqqat: bu yerdagi "Ustoz oyligi" — NAQD asosida (shu davrda TO‘LANGAN oylik). Shu oy uchun HISOBLANGAN ustoz oyligi alohida "Oyliklar" bo‘limida (u odatda keyingi oy to‘lanadi).',
  ], 3);
}

// ---- Sheet 4: Balans ----
export function balanceSheet(wb: Workbook, bs: any) {
  const ws = wb.addWorksheet('Balans');
  ws.columns = [{ width: 40 }, { width: 20 }, { width: 50 }];
  sheetTitle(ws, 'Balans hisoboti', `Holat sanasi: ${bs?.asOf ?? ''} (davr oxiri emas)`, 3);
  if (!bs) return;

  sectionHeader(ws, 'Aktivlar');
  kvRow(ws, 'Kassa / bank', bs.assets?.cash ?? 0, 'Barcha kassa va bank hisoblaridagi pul.');
  kvRow(ws, `Debitorlik (${bs.assets?.debtorCount ?? 0} qarzdor)`, bs.assets?.accountsReceivable ?? 0, 'O‘quvchilar qarzi — bizga qarzdor summasi.');
  kvRow(ws, 'Jami aktivlar', bs.assets?.total ?? 0, undefined, { bold: true });

  sectionHeader(ws, 'Passivlar');
  kvRow(ws, 'Oylik qarzi (ustozlar)', bs.liabilities?.salariesPayable ?? 0, 'To‘lanmagan ustoz oyliklari (joriy holat).');
  kvRow(ws, `Oldindan to‘lov (${bs.liabilities?.prepaidStudentCount ?? 0} o‘quvchi)`, bs.liabilities?.deferredRevenue ?? 0, 'Kelajakdagi darslar uchun oldindan olingan pul.');
  kvRow(ws, 'Jami passivlar', bs.liabilities?.total ?? 0, undefined, { bold: true });

  sectionHeader(ws, 'Kapital');
  kvRow(ws, 'Taqsimlanmagan foyda', bs.equity?.retainedEarnings ?? 0, 'Aktiv − passiv (markazning sof qiymati).');

  sheetNotes(ws, [
    'Balans — markazning HOZIRGI moliyaviy holati (davr oxiri emas, joriy kun).',
    'AKTIV = bizda bor: kassa/bankdagi pul + o‘quvchilar qarzi (Debitorlik).',
    'PASSIV = biz qarzdormiz: ustozlarga oylik qarzi + o‘quvchilar oldindan to‘lagan pul (kelajakda dars berishimiz kerak).',
    'KAPITAL = Aktiv − Passiv (markazning sof qiymati).',
    'Texnik "balanslashuv farqi" ko‘rsatkichi "Tekshiruv" bo‘limiga ko‘chirildi (buxgalter uchun).',
  ], 3);
}

// ---- Sheet 12: To'lov usullari ----
export function methodsSheet(wb: Workbook, overview: any, pl: any, period: string) {
  const ws = wb.addWorksheet("To'lov usullari");
  ws.columns = [{ width: 24 }, { width: 12 }, { width: 20 }];
  sheetTitle(ws, 'To‘lov usullari va daromad turlari', period, 3);

  sectionHeader(ws, 'To‘lov usuli bo‘yicha');
  tableHeader(ws, ['Usul', 'Soni', 'Summa']);
  (overview?.income?.byMethod ?? []).forEach((m: any) => {
    const r = ws.addRow([METHOD_LABELS[m.method] ?? m.method, m.count, m.amount]);
    r.getCell(3).numFmt = NUM;
  });

  sectionHeader(ws, 'Daromad turi bo‘yicha');
  tableHeader(ws, ['Tur', 'Soni', 'Summa']);
  (pl?.revenue?.byType ?? []).forEach((r: any) => {
    const row = ws.addRow([REVENUE_LABELS[r.type] ?? r.type, r.count, r.amount]);
    row.getCell(3).numFmt = NUM;
  });

  sheetNotes(ws, [
    'Tushgan to‘lovlarning qanday usulda (naqd/Payme/Click/Uzum/o‘tkazma) va nima uchun (o‘qish/ro‘yxat/sertifikat va h.k.) kelganini ko‘rsatadi.',
    '"Soni" — nechta to‘lov; "Summa" — jami pul.',
  ], 3);
}

// ---- Sheet 14: Izoh / Lug'at ----
export function glossarySheet(wb: Workbook) {
  const ws = wb.addWorksheet('Izoh');
  ws.columns = [{ width: 30 }, { width: 90 }];
  sheetTitle(ws, "Izoh / Lug‘at", 'Atamalarning sodda tilda izohi', 2);
  const terms: [string, string][] = [
    ['Prognoz (bashorat)', 'Barcha faol o‘quvchi to‘liq oy o‘qisa kutiladigan taxminiy summa. Haqiqiy hisob emas.'],
    ['Hisoblangan daromad', 'Bu davrda o‘quvchilarga real hisoblab yozilgan darslar puli (accrual). Tushgan to‘lov va qarz shundan kelib chiqadi.'],
    ['Tushgan tushum', 'Bu davrda kassaga real tushgan to‘lovlar (kassa asosida).'],
    ['Naqd vs Hisoblangan asos', 'Naqd (kassa) asos = real tushgan/chiqgan pul. Hisoblangan (accrual) asos = darslar bo‘yicha yozilgan qiymat.'],
    ['Ustozlar ulushi (tannarx)', 'Xizmat ko‘rsatish tannarxi — darslar uchun ustozlarga to‘lanadigan qism (COGS).'],
    ['O‘quvchilar to‘lagan (covered)', 'Ustoz oyligining o‘quvchilar puli bilan qoplangan qismi.'],
    ['Markaz qo‘shimchasi (gap)', 'Ustoz oyligining o‘quvchi to‘lamagani uchun markaz o‘z hisobidan qoplagan qismi.'],
    ['Yalpi marja', 'Yalpi foyda ÷ Daromad × 100 — tannarxdan keyingi foydalilik foizi.'],
    ['Sof marja', 'Sof foyda ÷ Daromad × 100 — barcha xarajatlardan keyingi foydalilik foizi.'],
    ['Avans', 'Ustozga davr ichida oldindan berilgan pul. Oylik hisoblanganda hisobga olinadi.'],
    ['Oldindan to‘lov', 'O‘quvchi kelajakdagi darslar uchun oldindan to‘lagan, hali sarflanmagan pul (deferred revenue).'],
    ['Debitorlik', 'O‘quvchilarning bizga qarzi — manfiy balans yig‘indisi.'],
    ['Sof foyda (ikki asos)', 'Asosiy xulosadagi sof foyda kassa asosida (ekran bilan bir xil). Foyda-zarardagi sof foyda buxgalteriya uslubida — farq qilishi mumkin.'],
    ['Roll-forward (aylanma)', 'Boshi + harakat − reversal = oxiri. Har bir qoldiq shu tarzda footlab isbotlanadi.'],
    ['Cash tie-out', 'Tushgan pul, to‘lovlar va Foyda-zarar daromadi bir-biriga mos kelishi tekshiruvi.'],
    ['LTV', 'Bir to‘lovchi o‘quvchidan davr ichida olingan o‘rtacha daromad.'],
    ['CAC', 'Bitta yangi o‘quvchini jalb qilish uchun sarflangan o‘rtacha marketing xarajati.'],
    ['Marketing ROI', 'Marketingga sarflangan mablag‘ning qaytimi (%).'],
    ['Balanslashuv farqi', 'Bir yozuvli tizimda Aktiv − (Passiv + Kapital) farqi — yashirilmaydi, oshkor ko‘rsatiladi.'],
  ];
  tableHeader(ws, ['Atama', 'Izoh']);
  terms.forEach(([term, def]) => {
    const r = ws.addRow([term, def]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  ws.addRow([]);
  const meta = ws.addRow(['Metodika', 'Davr chegaralari: sana oralig‘i bo‘yicha. Oy o‘rtasida yuklab olinsa — oy boshidan bugungacha. Balans/qarzdorlik joriy holat (davr oxiri emas). Tizim bir yozuvli ledgerdan hosil qilinadi.']);
  meta.getCell(1).font = { bold: true };
  meta.getCell(2).alignment = { wrapText: true, vertical: 'top' };
}
