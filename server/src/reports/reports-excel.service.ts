import { Injectable } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { ReportsService } from './reports.service';

export interface FinancialExcelQuery {
  branchId?: number;
  branchIds?: number[];
  startDate?: string;
  endDate?: string;
}

const REVENUE_LABELS: Record<string, string> = {
  TUITION: "O'qish to'lovi",
  REGISTRATION_FEE: "Ro'yxatdan o'tish",
  CERTIFICATE_FEE: 'Sertifikat',
  MATERIAL_SALE: 'Materiallar',
  MOCK_EXAM_FEE: 'Sinov imtihon',
  OTHER: 'Boshqa',
};

const EXPENSE_LABELS: Record<string, string> = {
  RENT: 'Ijara',
  UTILITIES: 'Kommunal',
  SUPPLIES: "Ta'minot",
  MARKETING: 'Marketing',
  EQUIPMENT: 'Jihozlar',
  MAINTENANCE: "Ta'mirlash",
  TAXES: 'Soliqlar',
  TEACHER_ADVANCE: 'Ustozga avans',
  OTHER: 'Boshqa',
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};

const CASH_TYPE_LABELS: Record<string, string> = {
  INFLOW: 'Kirim',
  OUTFLOW: 'Chiqim',
  TRANSFER_IN: "O'tkazma (kirim)",
  TRANSFER_OUT: "O'tkazma (chiqim)",
  ADJUSTMENT: 'Tuzatish',
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: 'Kassa',
  BANK: 'Bank',
  CARD: 'Karta',
};

/**
 * Builds the downloadable "Moliyaviy hisobot" Excel workbook — the single
 * deliverable the finance section needs. Reuses the existing report services
 * (overview + P&L + Cash Flow + Balance Sheet) as the data source, so there is
 * no duplicated calculation logic. Multi-sheet: Umumiy / Foyda va zarar / Pul
 * oqimi / Balans / Daromad / Xarajatlar.
 */
@Injectable()
export class ReportsExcelService {
  constructor(private reports: ReportsService) {}

  async generate(companyId: number, query: FinancialExcelQuery): Promise<Buffer> {
    const [overview, pl, cf, bs] = await Promise.all([
      this.reports.getFinancialOverview(companyId, {
        branchId: query.branchId,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
      this.reports.getProfitLoss(companyId, query),
      this.reports.getCashFlow(companyId, query),
      this.reports.getBalanceSheet(companyId, { branchId: query.branchId, branchIds: query.branchIds }),
    ]);

    const wb = new Workbook();
    wb.creator = 'DaF Sprachzentrum ERP';
    wb.created = new Date(0); // deterministic; not used for display

    const period = `${pl.period.start} — ${pl.period.end}`;

    // ---- Sheet 1: Umumiy (KPI) ----
    const s1 = wb.addWorksheet('Umumiy');
    this.sheetTitle(s1, 'Umumiy moliyaviy ko’rsatkichlar', period);
    this.kv(s1, [
      ['Daromad (qabul qilingan to’lovlar)', overview.income.actual],
      ['Hisoblangan daromad (darslar)', overview.income.billed],
      ['Xarajatlar', overview.expenses],
      ['Oylik (to’langan)', overview.salary.paid],
      ['Oylik (kutilayotgan)', overview.salary.pending],
      ['Sof foyda', overview.netProfit],
      ['Foyda marjasi (%)', pl.margins.netMarginPercent],
      ['Qarzdorlik (umumiy)', overview.forecast.outstandingReceivable],
      ['Qarzdorlar soni', overview.debtorCount],
      ['Faol o’quvchilar', overview.activeStudentCount],
      ["O’rtacha to’lov", overview.avgPayment],
      ['LTV', overview.ltv],
      ['CAC', overview.cac],
      ['Marketing ROI (%)', overview.marketingRoi],
      ['Yangi o’quvchilar', overview.newStudentCount],
    ]);

    // ---- Sheet 2: Foyda va zarar (P&L) ----
    const s2 = wb.addWorksheet('Foyda va zarar');
    this.sheetTitle(s2, 'Foyda va zarar hisoboti', period);
    this.sectionHeader(s2, 'Daromad');
    this.table(
      s2,
      ['Tur', 'Soni', 'Summa'],
      pl.revenue.byType.map((r) => [
        REVENUE_LABELS[r.type] ?? r.type,
        r.count,
        r.amount,
      ]),
      [2],
    );
    this.kv(s2, [['Jami daromad', pl.revenue.total]]);
    this.sectionHeader(s2, 'Xizmat tannarxi (COGS)');
    this.kv(s2, [
      ['Ustoz oyligi', pl.costOfServices.teacherSalaries],
      ['Ustoz avanslari', pl.costOfServices.teacherAdvances],
      ['Jami tannarx', pl.costOfServices.total],
      ['Yalpi foyda', pl.grossProfit],
      ['Yalpi marja (%)', pl.margins.grossMarginPercent],
    ]);
    this.sectionHeader(s2, 'Operatsion xarajatlar');
    this.table(
      s2,
      ['Kategoriya', 'Summa'],
      [
        ...pl.operatingExpenses.byCategory.map((e) => [
          EXPENSE_LABELS[e.category] ?? e.category,
          e.amount,
        ]),
        ['Admin oyligi', pl.operatingExpenses.adminSalaries],
      ],
      [],
    );
    this.kv(s2, [
      ['Jami operatsion xarajat', pl.operatingExpenses.total],
      ['Sof foyda', pl.netProfit],
      ['Sof marja (%)', pl.margins.netMarginPercent],
    ]);

    // ---- Sheet 3: Pul oqimi (Cash Flow) ----
    const s3 = wb.addWorksheet('Pul oqimi');
    this.sheetTitle(s3, 'Pul oqimi hisoboti', period);
    this.kv(s3, [
      ['Boshlang’ich qoldiq', cf.openingBalance],
      ['Kirim', cf.inflows.operating],
      ['Chiqim', cf.outflows.operating],
      ['Tuzatishlar', cf.adjustments],
      ['O’tkazmalar (sof)', cf.transfersNet],
      ['Sof pul oqimi', cf.netCashFlow],
      ['Yakuniy qoldiq', cf.closingBalance],
    ]);
    this.sectionHeader(s3, 'Oqim turlari bo’yicha');
    this.table(
      s3,
      ['Tur', 'Soni', 'Summa'],
      cf.byType.map((t) => [CASH_TYPE_LABELS[t.type] ?? t.type, t.count, t.amount]),
      [2],
    );
    this.sectionHeader(s3, 'Kassa hisoblari (joriy qoldiq)');
    this.table(
      s3,
      ['Hisob', 'Turi', 'Qoldiq'],
      cf.accounts.map((a) => [a.name, ACCOUNT_TYPE_LABELS[a.type] ?? a.type, a.balance]),
      [],
    );

    // ---- Sheet 4: Balans (Balance Sheet) ----
    const s4 = wb.addWorksheet('Balans');
    this.sheetTitle(s4, 'Balans hisoboti', `Holat: ${bs.asOf}`);
    this.sectionHeader(s4, 'Aktivlar');
    this.kv(s4, [
      ['Kassa / bank', bs.assets.cash],
      [`Debitorlik (${bs.assets.debtorCount} qarzdor)`, bs.assets.accountsReceivable],
      ['Jami aktivlar', bs.assets.total],
    ]);
    this.sectionHeader(s4, 'Passivlar');
    this.kv(s4, [
      ['Oylik qarzi (ustozlar)', bs.liabilities.salariesPayable],
      [
        `Oldindan to’lov (${bs.liabilities.prepaidStudentCount} o’quvchi)`,
        bs.liabilities.deferredRevenue,
      ],
      ['Jami passivlar', bs.liabilities.total],
    ]);
    this.sectionHeader(s4, 'Kapital');
    this.kv(s4, [['Taqsimlanmagan foyda', bs.equity.retainedEarnings]]);
    s4.addRow([]);
    s4.addRow([bs.note]);

    // ---- Sheet 5: Daromad tahlili ----
    const s5 = wb.addWorksheet('Daromad');
    this.sheetTitle(s5, 'Daromad tahlili', period);
    this.sectionHeader(s5, "To’lov usuli bo’yicha");
    this.table(
      s5,
      ['Usul', 'Soni', 'Summa'],
      overview.income.byMethod.map((m) => [
        METHOD_LABELS[m.method] ?? m.method,
        m.count,
        m.amount,
      ]),
      [2],
    );
    this.sectionHeader(s5, 'Tur bo’yicha');
    this.table(
      s5,
      ['Tur', 'Soni', 'Summa'],
      pl.revenue.byType.map((r) => [REVENUE_LABELS[r.type] ?? r.type, r.count, r.amount]),
      [2],
    );

    // ---- Sheet 6: Xarajat tahlili ----
    const s6 = wb.addWorksheet('Xarajatlar');
    this.sheetTitle(s6, 'Xarajat tahlili', period);
    this.table(
      s6,
      ['Kategoriya', 'Summa'],
      [
        ...pl.operatingExpenses.byCategory.map((e) => [
          EXPENSE_LABELS[e.category] ?? e.category,
          e.amount,
        ]),
        ['Ustozga avans', pl.costOfServices.teacherAdvances],
        ['Admin oyligi', pl.operatingExpenses.adminSalaries],
        ['Ustoz oyligi', pl.costOfServices.teacherSalaries],
      ],
      [],
    );

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ---- helpers ----

  private sheetTitle(ws: Worksheet, title: string, subtitle: string) {
    ws.columns = [
      { width: 38 },
      { width: 16 },
      { width: 18 },
    ];
    const t = ws.addRow([title]);
    t.font = { bold: true, size: 14 };
    const sub = ws.addRow([subtitle]);
    sub.font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);
  }

  private sectionHeader(ws: Worksheet, label: string) {
    ws.addRow([]);
    const r = ws.addRow([label]);
    r.font = { bold: true, size: 12 };
  }

  // Key/value rows; the value column is money-formatted unless the key ends with (%).
  private kv(ws: Worksheet, rows: [string, number][]) {
    for (const [label, value] of rows) {
      const r = ws.addRow([label, value]);
      const isPercent = label.includes('(%)');
      r.getCell(2).numFmt = isPercent ? '#,##0.0' : '#,##0';
    }
  }

  // A table with a bold header row. `intCols` (1-based) are formatted as plain
  // integers (counts); every other numeric column is money-formatted.
  private table(
    ws: Worksheet,
    headers: string[],
    rows: (string | number)[][],
    intCols: number[],
  ) {
    const head = ws.addRow(headers);
    head.font = { bold: true };
    head.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
    });
    for (const row of rows) {
      const r = ws.addRow(row);
      r.eachCell((cell, col) => {
        if (typeof cell.value === 'number') {
          cell.numFmt = intCols.includes(col) ? '#,##0' : '#,##0';
        }
      });
    }
  }
}
