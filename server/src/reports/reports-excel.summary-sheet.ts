/**
 * «Xulosa» — the single sheet the director actually reads. Six blocks:
 * NATIJA (block 1) / o'z xarajatini qopladimi (2) / PUL QAYERDAN KELDI (3) /
 * DARSLARINING PULI QAYERDAN KELGAN (4) / PUL QAYERGA KETDI (5) /
 * O'QUVCHILAR (6).
 *
 * Ported block-for-block from the CEO-approved prototype
 * (server/scripts/_namuna-hisobot-v2.ts, section "1. XULOSA") onto the
 * Task 6 primitives. Do not reorder blocks or reword labels — the layout
 * was approved line by line against production data.
 */
import { Workbook, Worksheet, Row } from 'exceljs';
import { NetProfit, NUM, PCT, GREEN, RED, SUBTLE } from './reports-excel.helpers';
import {
  sheetHead,
  blockTitle,
  columnHeader,
  compareRow,
  countRow,
  headlineRow,
  totalsBar,
  sheetFooter,
  uzMonthLabel,
} from './reports-excel.v2-helpers';
import { StudentFlow } from './reports-student-flow.service';

export interface SummaryInput {
  month: string; // '2026-07'
  prevMonth: string; // '2026-06'
  periodLine: string; // 'Davr: 01.07.2026 — 31.07.2026 (Iyul 2026)'
  scopeLine: string;
  cur: { np: NetProfit; covered: number | null; centerFunded: number | null; recognized: number };
  prev: { np: NetProfit; covered: number | null; centerFunded: number | null };
  ownMoney: { cur: number; prev: number };
  ownProfit: { cur: number; prev: number };
  attribution: { total: number; currentMonth: number; late: Array<{ label: string; amount: number }> };
  paymentCount: number;
  payerCount: number;
  /**
   * Block 4's four rows plus the total they foot to. `total` is the month's
   * FULL lesson value — see buildBlock4 for why it is not `cur.recognized`.
   */
  lessonMoney: {
    paidInMonth: number;
    paidEarlier: number;
    paidNextMonth: number;
    unpaid: number;
    total: number;
  };
  nextMonthLabel: string;
  cashOut: Array<{ label: string; amount: number }>;
  students: StudentFlow;
}

/** Builds the «Xulosa» worksheet on `wb` from the already-loaded figures in `input`. */
export function summarySheetV2(wb: Workbook, input: SummaryInput): void {
  const ws = wb.addWorksheet('Xulosa');
  ws.columns = [{ width: 40 }, { width: 18 }, { width: 18 }, { width: 11 }, { width: 54 }];
  sheetHead(ws, 'HISOBOT', input.periodLine, input.scopeLine, 5);

  const curLabel = uzMonthLabel(input.month);
  const prevLabel = uzMonthLabel(input.prevMonth);

  buildBlock1(ws, input, curLabel, prevLabel);
  buildBlock2(ws, input, curLabel, prevLabel);
  buildBlock3(ws, input, curLabel);
  buildBlock4(ws, input, curLabel);
  buildBlock5(ws, input);
  buildBlock6(ws, input, curLabel);

  sheetFooter(ws, [
    "Bu varaq — butun hisobotning xulosasi. Qolgan varaqlar shu raqamlarni yoyib beradi.",
    "SOF FOYDA = Dars tushumi − Ustoz oyligi − Xodimlar oyligi − Xarajatlar − Qaytarilgan.",
    "«O'Z FOYDASI» — shu oyning o'z pulidan shu oyning xarajati ayirilgani. Manfiy bo'lsa: oy o'zini o'zi boqolmagan.",
    "«O'tilgan darslar qiymati» va «Jami tushgan pul» boshqa-boshqa: birinchisi shu oy o'tilgan darslar qiymati, ikkinchisi shu oy kassaga kirgan pul.",
    "«Farq» ustuni faqat 1 va 2-blokda — o'tgan oyga nisbatan (yashil = yaxshi, qizil = yomon tomonga).",
    "«Jamidan %» — shu qatorning jami summadagi ulushi.",
  ], 5);
}

// ── Local row helpers (blocks 3/4 need a Summa|Jamidan-% row shape that
//    doesn't exist as a Task 6 primitive — countRow has no % column and
//    compareRow's 2nd/3rd columns are a period comparison, not amount/pct). ──

function izohCellFor(row: Row): void {
  const c = row.getCell(5);
  c.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  c.alignment = { wrapText: true, vertical: 'top' };
}

/** label | amount | amount's % of `total` | (blank) | izoh. */
function pctRow(ws: Worksheet, label: string, amount: number, total: number, izoh: string): Row {
  const r = ws.addRow([label, amount, total ? Math.round((amount / total) * 1000) / 10 : 0, '', izoh]);
  r.getCell(2).numFmt = NUM;
  r.getCell(3).numFmt = PCT;
  izohCellFor(r);
  return r;
}

/** Block 1 — NATIJA: this month's earned result, teacher salary broken into who funded it. */
function buildBlock1(ws: Worksheet, input: SummaryInput, curLabel: string, prevLabel: string): void {
  const { cur, prev } = input;
  blockTitle(ws, `1.  NATIJA — ${curLabel}da qancha ishlab topdik`, 5);
  columnHeader(ws, ["Ko'rsatkich", curLabel, prevLabel, 'Farq', 'Izoh']);
  compareRow(ws, "O'tilgan darslar qiymati", cur.np.revenue, prev.np.revenue,
    "Shu oy o'tilgan darslarning qiymati. Bu kassaga tushgan pul EMAS — puli qachon kelgani muhim emas.");
  compareRow(ws, '−  Ustoz oyligi (jami hisoblangan)', cur.np.teacherSalary, prev.np.teacherSalary,
    "Shu oy darslari uchun ustozlar haq qilgan oylik. Naqd keyingi oy chiqadi.", { inverse: true });
  compareRow(ws, "o'quvchilar to'lagan qismi", cur.covered, prev.covered, '', { sub: true });
  compareRow(ws, "markaz qo'shimchasi", cur.centerFunded, prev.centerFunded,
    "Qarzdor o'quvchi darsi uchun markaz o'z hisobidan qoplagani. Yuqoridagi summa ICHIDA.", { sub: true });
  if (cur.np.adminSalary > 0 || prev.np.adminSalary > 0) {
    compareRow(ws, '−  Xodimlar oyligi', cur.np.adminSalary, prev.np.adminSalary, '', { inverse: true });
  }
  compareRow(ws, '−  Xarajatlar (ijara, marketing, kommunal…)', cur.np.operatingExpenses, prev.np.operatingExpenses,
    "Ustoz avansi bu yerda EMAS — u oylik ichida.", { inverse: true });
  compareRow(ws, "−  O'quvchilarga qaytarilgan", cur.np.refunds, prev.np.refunds, '', { inverse: true });
  headlineRow(ws, '=  SOF FOYDA', cur.np.netProfit, prev.np.netProfit,
    "Shu oyda ishlab topilgan sof natija. Sayt «Foyda» kartasi ham shu raqamni ko'rsatadi.");
}

/** Block 2 — did the month's OWN money cover the month's OWN cost. No margin %, per the customer. */
function buildBlock2(ws: Worksheet, input: SummaryInput, curLabel: string, prevLabel: string): void {
  const { cur, prev, ownMoney, ownProfit } = input;
  blockTitle(ws, `2.  ${curLabel} o'z xarajatini qopladimi`, 5);
  columnHeader(ws, ["Ko'rsatkich", curLabel, prevLabel, 'Farq', 'Izoh']);
  compareRow(ws, `${curLabel}ning o'z puli`, ownMoney.cur, ownMoney.prev,
    "Shu oyda kassaga kirgan pulning shu oy darslariga tegishli qismi (eski qarz undirish emas).");
  compareRow(ws, '−  Ustoz oyligi (jami)', cur.np.teacherSalary, prev.np.teacherSalary, '', { inverse: true });
  if (cur.np.adminSalary > 0) {
    compareRow(ws, '−  Xodimlar oyligi', cur.np.adminSalary, prev.np.adminSalary, '', { inverse: true });
  }
  compareRow(ws, '−  Xarajatlar', cur.np.operatingExpenses, prev.np.operatingExpenses, '', { inverse: true });
  compareRow(ws, '−  Qaytarilgan', cur.np.refunds, prev.np.refunds, '', { inverse: true });
  headlineRow(ws, `=  ${curLabel.toUpperCase()}NING O'Z FOYDASI`, ownProfit.cur, ownProfit.prev,
    ownProfit.cur >= 0
      ? "Musbat — oy o'z puli bilan o'z xarajatini qopladi."
      : "MANFIY — oy o'zini o'zi boqolmadi, eski qarz undirish yoki oldingi oylar puli hisobiga yopilgan.");
}

/** Block 3 — where the cash that landed this month actually came from (this month vs old debt). No comparison columns. */
function buildBlock3(ws: Worksheet, input: SummaryInput, curLabel: string): void {
  const { attribution, paymentCount, payerCount } = input;
  blockTitle(ws, "3.  PUL QAYERDAN KELDI — kassaga tushgan pul", 5);
  columnHeader(ws, ['Qaysi oyning darsi uchun', 'Summa', 'Jamidan %', '', 'Izoh']);
  const cashIn = attribution.total;
  pctRow(ws, `${curLabel} — o'z oyi`, attribution.currentMonth, cashIn, "Shu oy darslari uchun kelgan pul.");
  for (const l of attribution.late) {
    pctRow(ws, `${l.label} qarzi`, l.amount, cashIn, 'Eski qarzning undirilishi.');
  }
  totalsBar(ws, ['Jami tushgan pul', cashIn, 100, '', ''], [2]).getCell(3).numFmt = PCT;
  const info = ws.addRow([`${paymentCount} ta to'lov · ${payerCount} ta o'quvchi`, '', '', '',
    "Bitta o'quvchi oy davomida bir necha marta to'lashi mumkin. Bitta to'lov ham eski qarzni, ham shu oy darsini yopishi mumkin — shuning uchun to'lovlar SONI oylarga bo'linmaydi, faqat SUMMA bo'linadi."]);
  info.getCell(1).font = { bold: true, size: 10 };
  izohCellFor(info);
}

/** Block 4 — this month's LESSON VALUE broken down by when it was paid. No comparison columns. */
function buildBlock4(ws: Worksheet, input: SummaryInput, curLabel: string): void {
  const { lessonMoney, nextMonthLabel } = input;
  blockTitle(ws, `4.  ${curLabel} DARSLARINING PULI QAYERDAN KELGAN`, 5);
  columnHeader(ws, ["Qachon to'langan", 'Summa', 'Jamidan %', '', 'Izoh']);
  // The denominator is the month's FULL lesson value, NOT its recognized
  // revenue. Recognized counts only lessons that were held AND paid, but the
  // fourth row below is what has NOT been paid — including lessons not yet
  // held. In a closed month the two figures coincide (nothing is unpaid), so
  // this changes nothing for a finished month; in an in-progress one, footing
  // on recognized printed a total the rows above it overshot several times
  // over, and every «Jamidan %» with it.
  const total = lessonMoney.total;
  pctRow(ws, `${curLabel} ichida to'langan`, lessonMoney.paidInMonth, total, '');
  pctRow(ws, `${curLabel}dan oldin to'langan (balansdagi pul)`, lessonMoney.paidEarlier, total,
    "O'quvchi avvalroq to'lab qo'ygan, puli balansida turgan edi — dars o'tilganda o'shandan yechilgan.");
  pctRow(ws, `${nextMonthLabel}da to'langan (kechikkan)`, lessonMoney.paidNextMonth, total,
    "Oy tugagach kelgan to'lovlar.");

  // Zero here is the good news, and a bare "0" reads as a missing figure —
  // spell it out instead.
  if (lessonMoney.unpaid === 0) {
    const r = ws.addRow(["Hali to'lanmay qolgan", "Yo'q — hammasi to'langan", '', '',
      "Qarzda qolgan dars yo'q, oy to'liq yopilgan."]);
    r.getCell(2).font = { bold: true, color: { argb: GREEN } };
    izohCellFor(r);
  } else {
    const r = ws.addRow(["Hali to'lanmay qolgan", lessonMoney.unpaid,
      total ? Math.round((lessonMoney.unpaid / total) * 1000) / 10 : 0, '',
      "Bu darslar o'tilgan, lekin puli hali kelmagan."]);
    r.getCell(2).numFmt = NUM;
    r.getCell(2).font = { bold: true, color: { argb: RED } };
    r.getCell(3).numFmt = PCT;
    izohCellFor(r);
  }
  totalsBar(ws, [`${curLabel} darslari qiymati`, total, 100, '', ''], [2]).getCell(3).numFmt = PCT;
}

/** Block 5 — cash that left, largest first. Ends at «Jami chiqim» — deliberately no KASSADA QOLDI row. */
function buildBlock5(ws: Worksheet, input: SummaryInput): void {
  const { cashOut } = input;
  blockTitle(ws, "5.  PUL QAYERGA KETDI — kassadan chiqqan pul", 5);
  columnHeader(ws, ["Yo'nalish", 'Summa', 'Jamidan %', '', 'Izoh']);
  const total = cashOut.reduce((s, x) => s + x.amount, 0);
  for (const { label, amount } of [...cashOut].sort((a, b) => b.amount - a.amount)) {
    const r = ws.addRow([label, amount, total ? Math.round((amount / total) * 1000) / 10 : 0, '', '']);
    r.getCell(2).numFmt = NUM;
    r.getCell(3).numFmt = PCT;
  }
  totalsBar(ws, ['Jami chiqim', total, 100, '', ''], [2]).getCell(3).numFmt = PCT;
}

/** Block 6 — roster facts (counts) then this month's arrivals/departures. Counts only — never money. */
function buildBlock6(ws: Worksheet, input: SummaryInput, curLabel: string): void {
  const { students } = input;
  const statusCount = (status: string) => students.byStatus.find((s) => s.status === status)?.count ?? 0;

  blockTitle(ws, "6.  O'QUVCHILAR", 5);
  columnHeader(ws, ["Ko'rsatkich", 'Soni', '', '', 'Izoh']);
  countRow(ws, `Darsga qatnashdi (${curLabel})`, students.attended,
    "Shu oy kamida bir marta darsga kelgan o'quvchilar — eng haqiqiy 'faol' raqam.", { bold: true });
  countRow(ws, "Guruhda o'qiyapti", students.inGroup, 'Statusi faol va faol guruhi bor.');
  countRow(ws, "Guruhsiz (statusi faol, guruhi yo'q)", students.groupless,
    "DIQQAT: bular 'faol' sanaladi, lekin hech qaysi guruhda yo'q. Ish talab qiladi.", { bad: true });
  ws.addRow([]);
  countRow(ws, 'Muzlatilgan', statusCount('FROZEN'));
  countRow(ws, 'Chetlatilgan', statusCount('EXPELLED'));
  countRow(ws, 'Bitirgan', statusCount('GRADUATED'));
  totalsBar(ws, ["Bazadagi jami o'quvchi", students.totalStudents, '', '', '']);
  ws.addRow([]);

  columnHeader(ws, [`${curLabel} harakati`, 'Soni', '', '', 'Izoh']);
  countRow(ws, 'Yangi kelgan', students.arrived);
  countRow(ws, 'Muzlatilgan', students.left.frozen);
  countRow(ws, 'Chetlatilgan', students.left.expelled);
  countRow(ws, 'Bitirgan', students.left.graduated);
  const netRow = ws.addRow(["Sof o'zgarish (o'quvchi soni)", students.netChange, '', '',
    `Yangi ${students.arrived} ta − ketgan ${students.left.total} ta.`]);
  netRow.font = { bold: true };
  netRow.getCell(2).numFmt = NUM;
  netRow.getCell(2).font = { bold: true, size: 12, color: { argb: students.netChange >= 0 ? GREEN : RED } };
  izohCellFor(netRow);
}
