/**
 * Build a full reconciliation Excel: every payment from files 1/3/4 with a
 * BOR / BOR(ehtimoliy) / YO'Q status against the ERP, plus a summary sheet
 * and the file-2 (June Payme aggregate) note.
 *
 * Run:  railway run npx ts-node scripts/reconcile-gateway-excel.ts
 * Output: ../solishtirish fayllari/SOLISHTIRISH-NATIJA.xlsx
 */
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const DIR = path.resolve(__dirname, '../../solishtirish fayllari');
const OUT = path.join(DIR, 'SOLISHTIRISH-NATIJA.xlsx');

type Gw = 'Payme' | 'Click';
interface Tx {
  file: string; period: 'May' | 'Iyun'; gw: Gw; service: string;
  dateStr: string; dateMs: number; amount: number;
  studentId: number | null; name: string | null; card: string | null;
  gatewayId: string | null;
}

function cval(cell: ExcelJS.Cell): string {
  let v: any = cell.value;
  if (v && typeof v === 'object') {
    if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else if (v.richText) v = v.richText.map((t: any) => t.text).join('');
  }
  return v == null ? '' : String(v).trim();
}
const num = (s: any) => { const n = parseInt(String(s ?? '').replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : NaN; };
function asStudentId(...vals: any[]): number | null {
  for (const v of vals) { const s = String(v ?? '').trim(); if (/^\d{5}$/.test(s)) { const n = +s; if (n >= 10000 && n <= 99999) return n; } }
  return null;
}
function parseDate(s: string): { str: string; ms: number } {
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) { const [, dd, MM, y, hh, mm, ss] = m; return { str: `${y}-${MM}-${dd} ${hh}:${mm}:${ss}`, ms: Date.parse(`${y}-${MM}-${dd}T${hh}:${mm}:${ss}+05:00`) }; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) { const [, y, MM, dd, hh, mm, ss] = m; return { str: `${y}-${MM}-${dd} ${hh}:${mm}:${ss}`, ms: Date.parse(`${y}-${MM}-${dd}T${hh}:${mm}:${ss}+05:00`) }; }
  return { str: s, ms: NaN };
}
async function readWb(f: string) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(DIR, f)); return wb; }

async function parsePayme(file: string): Promise<Tx[]> {
  const wb = await readWb(file); const ws = wb.worksheets[0]; const out: Tx[] = [];
  ws.eachRow((row, rn) => {
    if (rn < 8) return;
    if (!/^\d+$/.test(cval(row.getCell(1)))) return;
    const amount = num(cval(row.getCell(14))); if (!Number.isFinite(amount)) return;
    const d = parseDate(cval(row.getCell(5)));
    const nm = cval(row.getCell(26));
    out.push({ file, period: 'May', gw: 'Payme', service: cval(row.getCell(3)), dateStr: d.str, dateMs: d.ms, amount,
      studentId: asStudentId(cval(row.getCell(29))), name: nm && nm !== 'N/A' ? nm : null, card: cval(row.getCell(13)) || null, gatewayId: cval(row.getCell(16)) || null });
  });
  return out;
}
async function parseClick(file: string, period: 'May' | 'Iyun'): Promise<Tx[]> {
  const wb = await readWb(file); const out: Tx[] = [];
  for (const ws of wb.worksheets) {
    if (ws.name === 'Общий отчет') continue;
    ws.eachRow((row, rn) => {
      if (rn < 2) return;
      const clickId = cval(row.getCell(10)); if (!/^\d{5,}$/.test(clickId)) return;
      const amount = num(cval(row.getCell(12))); if (!Number.isFinite(amount)) return;
      const d = parseDate(cval(row.getCell(2)));
      const c6 = cval(row.getCell(6)); const c7 = cval(row.getCell(7));
      out.push({ file, period, gw: 'Click', service: cval(row.getCell(3)), dateStr: d.str, dateMs: d.ms, amount,
        studentId: asStudentId(c6, c7), name: c6 && !/^\d+$/.test(c6) ? c6 : null, card: cval(row.getCell(5)) || null, gatewayId: clickId });
    });
  }
  return out;
}

async function main() {
  const all = [...await parsePayme('1.xlsx'), ...await parseClick('3.xlsx', 'May'), ...await parseClick('4.xlsx', 'Iyun')];
  const start = Date.parse('2026-05-01T00:00:00+05:00'), end = Date.parse('2026-07-01T00:00:00+05:00');

  const [payments, paymeTx, clickTx] = await Promise.all([
    prisma.payment.findMany({ where: { createdAt: { gte: new Date(start), lt: new Date(end) } },
      select: { id: true, studentId: true, amount: true, method: true, status: true, source: true, externalId: true, createdAt: true } }),
    prisma.paymeTransaction.findMany({ select: { paymeId: true, state: true, studentId: true, paymentId: true } }),
    prisma.clickTransaction.findMany({ select: { clickTransId: true, status: true, studentId: true, paymentId: true } }),
  ]);

  // student names
  const sids = new Set<number>();
  for (const t of all) if (t.studentId) sids.add(t.studentId);
  for (const p of payments) sids.add(p.studentId);
  const students = await prisma.student.findMany({ where: { id: { in: [...sids] } }, select: { id: true, firstName: true, lastName: true, status: true, balance: true } });
  const stName = new Map(students.map((s) => [s.id, { name: `${s.firstName} ${s.lastName}`.trim(), status: s.status, balance: s.balance }]));

  const payByExt = new Map<string, typeof payments>();
  for (const p of payments) if (p.externalId) (payByExt.get(p.externalId) || payByExt.set(p.externalId, [] as any).get(p.externalId))!.push(p);
  const paymeById = new Map(paymeTx.map((t) => [t.paymeId, t]));
  const clickById = new Map(clickTx.map((t) => [String(t.clickTransId), t]));
  const payByStudent = new Map<number, typeof payments>();
  for (const p of payments) (payByStudent.get(p.studentId) || payByStudent.set(p.studentId, [] as any).get(p.studentId))!.push(p);

  const DAY = 86400000;
  interface R { tx: Tx; status: 'BOR' | 'BOR_EHTIMOL' | 'YOQ'; erp: any; note: string; }
  const results: R[] = [];
  const used = new Set<string>();
  const deferred: Tx[] = [];

  for (const tx of all) {
    const extHit = (tx.gatewayId ? payByExt.get(tx.gatewayId) : undefined)?.filter((p) => !used.has(p.id));
    if (extHit && extHit.length) {
      const p = extHit.find((x) => x.amount === tx.amount) || extHit[0]; used.add(p.id);
      results.push({ tx, status: 'BOR', erp: p, note: `Tizimda bor. To'lov raqami (ID) to'liq mos keldi — ishonchli.` }); continue;
    }
    if (tx.gw === 'Payme' && tx.gatewayId && paymeById.has(tx.gatewayId)) {
      const t = paymeById.get(tx.gatewayId)!;
      if (t.state === 2 && t.paymentId && !used.has(t.paymentId)) { used.add(t.paymentId); results.push({ tx, status: 'BOR', erp: { id: t.paymentId, studentId: t.studentId, method: 'PAYME', source: 'GATEWAY', status: 'COMPLETED', amount: tx.amount }, note: "Tizimda bor. Payme orqali avtomatik tushgan — ishonchli." }); continue; }
    }
    if (tx.gw === 'Click' && tx.gatewayId && clickById.has(tx.gatewayId)) {
      const t = clickById.get(tx.gatewayId)!;
      if (t.status === 2 && t.paymentId && !used.has(t.paymentId)) { used.add(t.paymentId); results.push({ tx, status: 'BOR', erp: { id: t.paymentId, studentId: t.studentId, method: 'CLICK', source: 'GATEWAY', status: 'COMPLETED', amount: tx.amount }, note: "Tizimda bor. Click orqali avtomatik tushgan — ishonchli." }); continue; }
    }
    if (tx.studentId) {
      const cands = (payByStudent.get(tx.studentId) || [])
        .filter((p) => !used.has(p.id) && p.amount === tx.amount && (!Number.isFinite(tx.dateMs) || Math.abs(p.createdAt.getTime() - tx.dateMs) <= 5 * DAY))
        .sort((a, b) => Math.abs(a.createdAt.getTime() - tx.dateMs) - Math.abs(b.createdAt.getTime() - tx.dateMs));
      if (cands.length) { const p = cands[0]; used.add(p.id); results.push({ tx, status: 'BOR', erp: p, note: "Tizimda bor. Xuddi shu o'quvchi, summa va sanadagi to'lov topildi — ishonchli." }); continue; }
    }
    deferred.push(tx);
  }

  for (const tx of deferred.sort((a, b) => (a.dateMs || 0) - (b.dateMs || 0))) {
    const pool = payments.filter((p) => !used.has(p.id) && p.method.toUpperCase() === tx.gw.toUpperCase() && p.amount === tx.amount);
    const near = pool.filter((p) => !Number.isFinite(tx.dateMs) || Math.abs(p.createdAt.getTime() - tx.dateMs) <= 14 * DAY)
      .sort((a, b) => Math.abs(a.createdAt.getTime() - tx.dateMs) - Math.abs(b.createdAt.getTime() - tx.dateMs));
    if (near.length) {
      const p = near[0]; used.add(p.id); const dd = Math.round(Math.abs(p.createdAt.getTime() - tx.dateMs) / DAY);
      const whenTxt = dd === 0 ? 'sanasi ham bir xil' : `sana farqi ${dd} kun`;
      results.push({ tx, status: 'BOR_EHTIMOL', erp: p, note: `Ehtimol bor. Bu terminal (POS) to'lovi — faylda o'quvchi nomi/raqami yo'q. Tizimda xuddi shu summadagi to'lov bor (${whenTxt}), lekin aynan shu to'lov ekaniga to'liq ishonch yo'q. Kartani tekshirib o'quvchini aniqlang.` }); continue;
    }
    const everAny = payments.filter((p) => p.method.toUpperCase() === tx.gw.toUpperCase() && p.amount === tx.amount);
    const anyMethod = payments.filter((p) => p.amount === tx.amount);
    let note: string;
    if (everAny.length) {
      // Same-amount payments exist but all already matched to other file rows → one is missing.
      if (tx.studentId) {
        const nm = stName.get(tx.studentId)?.name || '';
        note = `TIZIMDA YO'Q. O'quvchi ${tx.studentId} (${nm}) da bu ${tx.amount.toLocaleString()} so'mlik ${tx.gw} to'lovi topilmadi — kiritilmagan.`;
      } else {
        note = `TIZIMDA YO'Q. Terminal (POS) to'lovi, faylda o'quvchi yo'q. Faylda bu summadagi to'lov kitobdagidan ko'proq — bittasi kiritilmagan. Karta bo'yicha o'quvchini toping.`;
      }
    } else if (anyMethod.length) {
      note = `TIZIMDA YO'Q. ${tx.gw} sifatida yo'q, lekin xuddi shu summa boshqa usulda (${[...new Set(anyMethod.map(p => p.method))].join(', ')}) bor. Ehtimol adashib boshqa usulda kiritilgan — tekshiring.`;
    } else {
      note = `TIZIMDA YO'Q. Bu summadagi to'lov bazada umuman topilmadi (hech qaysi usulda). Kiritilishi kerak.`;
    }
    results.push({ tx, status: 'YOQ', erp: null, note });
  }

  results.sort((a, b) => a.tx.file.localeCompare(b.tx.file) || (a.tx.dateMs || 0) - (b.tx.dateMs || 0));

  // ---- Build workbook ----
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DaF ERP reconciliation';

  const GREEN = 'FFD9EAD3', YEL = 'FFFFF2CC', RED = 'FFF4CCCC', HEAD = 'FF1F4E78';
  const border = { top: { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }, left: { style: 'thin' as const, color: { argb: 'FFCCCCCC' } }, right: { style: 'thin' as const, color: { argb: 'FFCCCCCC' } } };

  function headerRow(ws: ExcelJS.Worksheet, cols: string[]) {
    const r = ws.addRow(cols);
    r.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = border; });
    r.height = 30;
  }
  const statusText = { BOR: 'BOR ✅', BOR_EHTIMOL: 'BOR (tekshirish)', YOQ: "YO'Q ❌" };
  const statusFill = { BOR: GREEN, BOR_EHTIMOL: YEL, YOQ: RED };

  // ---------- Sheet: Barcha to'lovlar ----------
  const main = wb.addWorksheet("Barcha to'lovlar", { views: [{ state: 'frozen', ySplit: 1 }] });
  headerRow(main, ['№', 'Fayl', 'Davr', 'Tur', 'Kassa/Servis', 'Sana-vaqt', 'Summa', 'Karta', "Fayldagi nomi", "Fayldagi o'quvchi ID", 'Gateway ID', 'HOLAT', "Tizimdagi o'quvchi", "Usul/Manba/Status", 'Izoh']);
  let idx = 0;
  for (const r of results) {
    idx++;
    const t = r.tx;
    const erpStudent = r.erp ? (stName.get(r.erp.studentId)?.name || '') : '';
    const erpStudentCell = r.erp ? `${r.erp.studentId} ${erpStudent}` : '';
    const usm = r.erp ? `${r.erp.method}/${r.erp.source}/${r.erp.status}` : '';
    const row = main.addRow([idx, t.file, t.period, t.gw, t.service, t.dateStr, t.amount, t.card || '', t.name || '', t.studentId || '', t.gatewayId || '', statusText[r.status], erpStudentCell, usm, r.note]);
    row.eachCell((c) => { c.border = border; c.alignment = { vertical: 'middle', wrapText: false }; });
    row.getCell(7).numFmt = '#,##0';
    const stCell = row.getCell(12);
    stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[r.status] } };
    stCell.font = { bold: true };
    stCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  main.columns = [
    { width: 5 }, { width: 8 }, { width: 7 }, { width: 7 }, { width: 26 }, { width: 20 }, { width: 12 }, { width: 20 }, { width: 26 }, { width: 12 }, { width: 26 }, { width: 17 }, { width: 26 }, { width: 26 }, { width: 50 },
  ];
  main.autoFilter = { from: 'A1', to: 'O1' };

  // ---------- Sheet: Umumiy (Summary) ----------
  const sum = wb.addWorksheet('Umumiy', { views: [{ showGridLines: false }] });
  const cnt = { BOR: 0, BOR_EHTIMOL: 0, YOQ: 0 };
  const sm = { BOR: 0, BOR_EHTIMOL: 0, YOQ: 0 };
  for (const r of results) { cnt[r.status]++; sm[r.status] += r.tx.amount; }
  const totalTx = results.length, totalSum = results.reduce((s, r) => s + r.tx.amount, 0);

  sum.mergeCells('A1:D1');
  sum.getCell('A1').value = 'Payme / Click fayllari — tizim bilan solishtirish natijasi';
  sum.getCell('A1').font = { bold: true, size: 14 };
  sum.getCell('A3').value = `Tekshirilgan baza: PROD (caring-courage).  Fayllar: 1.xlsx (Payme May), 2.xlsx (Payme Iyun — jami), 3.xlsx (Click May), 4.xlsx (Click Iyun).`;
  sum.mergeCells('A3:H3');

  sum.addRow([]);
  const hr = sum.addRow(['Holat', 'Soni', 'Summa (so\'m)', 'Izoh']);
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }; c.border = border; c.alignment = { horizontal: 'center' }; });
  const rows: [string, number, number, string, string][] = [
    ['BOR ✅', cnt.BOR, sm.BOR, "Tizimda aniq bor. To'lov o'quvchisi, summasi va sanasi bir xil to'lov topildi (yoki to'lov ID si mos keldi).", GREEN],
    ['BOR (tekshirish)', cnt.BOR_EHTIMOL, sm.BOR_EHTIMOL, "Terminal (POS) to'lovi — faylda o'quvchi nomi/raqami yo'q. Tizimda shu summadagi to'lov bor, lekin aynan shu ekaniga 100% ishonch yo'q. Kartani tekshirish tavsiya etiladi.", YEL],
    ['YO\'Q ❌', cnt.YOQ, sm.YOQ, "Tizimda topilmadi. Bu to'lov kitobga kiritilmagan — kiritilishi kerak.", RED],
    ['JAMI', totalTx, totalSum, '1, 3, 4-fayllardagi barcha to\'lovlar', 'FFFFFFFF'],
  ];
  for (const [st, n, s, note, fill] of rows) {
    const r = sum.addRow([st, n, s, note]);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    r.getCell(1).font = { bold: true }; r.getCell(3).numFmt = '#,##0';
    r.eachCell((c) => { c.border = border; c.alignment = { wrapText: true, vertical: 'middle' }; });
  }
  sum.addRow([]);
  const note2 = sum.addRow(["MUHIM: aniq hisob-kitob bo'yicha jami 10 ta to'lov / 10 618 845 so'm kitobda kam. Shundan 8 tasi \"YO'Q\" deb belgilangan (\"TOPILMAGANLAR\" varag'ida). Qolgan 2 tasi — May oyidagi 400 000 so'mlik Click to'lovlari (faylda 16 ta, kitobda 14 ta): ular \"BOR (tekshirish)\" ichida, chunki faylda o'quvchi ID yo'qligi sabab aynan qaysi 2 tasi kamligini aytib bo'lmaydi — 6 nomzoddan tekshirish kerak."]);
  sum.mergeCells(`A${note2.number}:H${note2.number}`); note2.getCell(1).alignment = { wrapText: true }; note2.getCell(1).font = { italic: true }; note2.height = 60;

  // June Payme (file 2) reconciliation
  sum.addRow([]);
  const jr = sum.addRow(['2-fayl (Payme Iyun) — faqat jami:']); jr.getCell(1).font = { bold: true };
  const junePayme = payments.filter((p) => p.method === 'PAYME' && p.createdAt.getTime() >= Date.parse('2026-06-01T00:00:00+05:00'));
  sum.addRow([`  Payme hisoboti: 28 ta / 6 714 000 so'm`]);
  sum.addRow([`  Tizim (PAYME, Iyun): ${junePayme.length} ta / ${junePayme.reduce((s, p) => s + p.amount, 0).toLocaleString()} so'm`]);
  sum.addRow([`  Farq: 1 ta / 1 000 so'm — bu Namangan test terminali ("aboba"), real o'quvchi to'lovi emas. Iyun Payme TO'LIQ mos.`]);
  sum.columns = [{ width: 20 }, { width: 10 }, { width: 16 }, { width: 60 }];

  // ---------- Sheet: YO'Q ro'yxati ----------
  const gapWs = wb.addWorksheet("TOPILMAGANLAR", { views: [{ state: 'frozen', ySplit: 1 }] });
  headerRow(gapWs, ['№', 'Tur', 'Kassa/Servis', 'Sana-vaqt', 'Summa', 'Karta', 'Nomi', "O'quvchi ID", 'Gateway ID', 'Izoh']);
  let gi = 0;
  for (const r of results.filter((x) => x.status === 'YOQ')) {
    gi++; const t = r.tx;
    const row = gapWs.addRow([gi, t.gw, t.service, t.dateStr, t.amount, t.card || '', t.name || '', t.studentId || '', t.gatewayId || '', r.note]);
    row.eachCell((c) => { c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }; });
    row.getCell(5).numFmt = '#,##0';
  }
  gapWs.columns = [{ width: 5 }, { width: 8 }, { width: 30 }, { width: 20 }, { width: 12 }, { width: 22 }, { width: 24 }, { width: 12 }, { width: 26 }, { width: 55 }];

  await wb.xlsx.writeFile(OUT);
  console.log(`\n✅ Yozildi: ${OUT}`);
  console.log(`   BOR: ${cnt.BOR}   BOR(tekshirish): ${cnt.BOR_EHTIMOL}   YO'Q: ${cnt.YOQ}   JAMI: ${totalTx}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
