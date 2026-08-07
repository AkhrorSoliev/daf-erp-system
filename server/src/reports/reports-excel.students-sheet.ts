/**
 * «O'quvchilar» — the dedicated student-flow sheet. Four sections: Haqiqatda
 * kim o'qiyapti / Statusi bo'yicha (bugungi holat) / <Oy> harakati / Guruhdan
 * chiqqanlar keyin qayerga ketdi (<Oy>).
 *
 * Ported block-for-block from the CEO-approved prototype — a throwaway script
 * that rendered this exact sheet ("7. O'QUVCHILAR") against production data and
 * was signed off line by line before being deleted. Do not reorder sections or
 * reword labels: this layout IS the approval.
 *
 * Two things this sheet deliberately does NOT do, both load-bearing:
 *  - No share/percentage column. The previous version divided "students who
 *    attended" by every student ever in the database (expelled/graduated
 *    included), producing a meaningless 53.9%. The column is gone, not fixed.
 *  - It never reports a DROPPED enrollment as "left the centre" — most of
 *    those students simply moved to another group. The last section shows
 *    where they actually ended up, and the footer says so explicitly.
 */
import { Workbook, Row } from 'exceljs';
import { NUM, GREEN, RED, SUBTLE } from './reports-excel.helpers';
import {
  sheetHead,
  blockTitle,
  columnHeader,
  countRow,
  totalsBar,
  sheetFooter,
  uzMonthLabel,
} from './reports-excel.v2-helpers';
import { StudentFlow } from './reports-student-flow.service';

const ST_LABEL: Record<string, string> = {
  ACTIVE: 'Faol',
  FROZEN: 'Muzlatilgan',
  EXPELLED: 'Chetlatilgan',
  GRADUATED: 'Bitirgan',
  ARCHIVED: 'Arxivlangan',
};

function izohCell(row: Row, col: number): void {
  const c = row.getCell(col);
  c.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  c.alignment = { wrapText: true, vertical: 'top' };
}

/** Builds the «O'quvchilar» worksheet on `wb` from an already-loaded `StudentFlow`. */
export function studentsSheet(
  wb: Workbook,
  flow: StudentFlow,
  periodLine: string,
  scopeLine: string,
): void {
  const ws = wb.addWorksheet("O'quvchilar");
  ws.columns = [{ width: 40 }, { width: 16 }, { width: 14 }, { width: 11 }, { width: 54 }];
  sheetHead(ws, "O'QUVCHILAR", `${periodLine} · holat raqamlari bugungi kunga`, scopeLine, 5);

  const curLabel = uzMonthLabel(flow.month);

  blockTitle(ws, "Haqiqatda kim o'qiyapti", 5);
  columnHeader(ws, ["Ko'rsatkich", 'Soni', '', '', 'Izoh']);
  countRow(ws, `Darsga qatnashdi (${curLabel})`, flow.attended,
    "Shu oy kamida bir marta darsga kelgan — eng haqiqiy 'faol' raqam.", { bold: true });
  countRow(ws, "Guruhda o'qiyapti", flow.inGroup, 'Statusi faol va faol guruhi bor.');
  countRow(ws, "Guruhsiz (statusi faol, guruhi yo'q)", flow.groupless,
    "DIQQAT: 'faol' sanaladi, lekin hech qaysi guruhda yo'q.", { bad: true });

  blockTitle(ws, "Statusi bo'yicha (bugungi holat)", 5);
  columnHeader(ws, ['Holat', 'Soni', '', '', 'Izoh']);
  [...flow.byStatus].sort((a, b) => b.count - a.count).forEach((s) => {
    countRow(ws, ST_LABEL[s.status] ?? s.status, s.count);
  });
  totalsBar(ws, ['Jami', flow.totalStudents, '', '', '']);

  blockTitle(ws, `${curLabel} harakati`, 5);
  columnHeader(ws, ['Harakat', 'Soni', '', '', 'Izoh']);
  countRow(ws, 'Yangi kelgan', flow.arrived);
  countRow(ws, 'Muzlatilgan', flow.left.frozen);
  countRow(ws, 'Chetlatilgan', flow.left.expelled);
  countRow(ws, 'Bitirgan', flow.left.graduated);
  const net = ws.addRow(["Sof o'zgarish (o'quvchi soni)", flow.netChange, '', '',
    `Yangi ${flow.arrived} ta − ketgan ${flow.left.total} ta.`]);
  net.font = { bold: true };
  net.getCell(2).numFmt = NUM;
  net.getCell(2).font = { bold: true, size: 12, color: { argb: flow.netChange >= 0 ? GREEN : RED } };
  izohCell(net, 5);

  // "Guruhdan chiqarildi" is NOT "left the centre" — most move on, some are
  // simply left without a group. Show where they actually ended up.
  blockTitle(ws, `Guruhdan chiqqanlar keyin qayerga ketdi (${curLabel})`, 5);
  columnHeader(ws, ['Holati (bugunga)', 'Soni', '', '', 'Izoh']);
  countRow(ws, "Boshqa guruhda o'qishda davom etyapti", flow.dropped.stillInGroup,
    'Guruhi almashgan — markazdan ketmagan.', { good: true });
  countRow(ws, "Hech qaysi guruhda yo'q", flow.dropped.groupless, '', { bad: true });
  [...flow.dropped.grouplessByStatus].sort((a, b) => b.count - a.count).forEach(({ status, count }) => {
    const r = ws.addRow([`     ${ST_LABEL[status] ?? status}`, count, '', '',
      status === 'ACTIVE' ? "Statusi faol, lekin guruhi yo'q — yo'qotilgan o'quvchi." : '']);
    r.getCell(1).font = { size: 10, color: { argb: SUBTLE } };
    r.getCell(2).numFmt = NUM;
    izohCell(r, 5);
  });
  totalsBar(ws, ['Jami guruhdan chiqqan', flow.dropped.students, '', '',
    `${flow.dropped.records} ta yozuv, ${flow.dropped.students} ta o'quvchi`]);

  sheetFooter(ws, [
    "«Darsga qatnashdi» — hisobotdagi asosiy 'faol o'quvchi' raqami. Statusi faol bo'lgani bilan guruhi yo'q o'quvchi faol emas.",
    "«Guruhdan chiqarildi» — o'qishni tashladi degani EMAS. Bir qismi boshqa guruhga o'tgan va o'qishda davom etyapti.",
    "Statusi faol, lekin guruhi yo'q o'quvchilar — ish talab qiladigan ro'yxat: yo joylashtirilmagan, yo unutilgan.",
    "Bitta o'quvchi bir necha guruhda bo'lishi mumkin — shuning uchun yozuvlar soni o'quvchi sonidan ko'p.",
  ], 5);
}
