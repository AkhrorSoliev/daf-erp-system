/**
 * Reconcile external gateway reports (Payme / Click) against ERP records.
 *
 * Reads the 4 xlsx files in "solishtirish fayllari/" and, for every
 * transaction in them, decides whether it exists in our system.
 *
 * Run with prod DB:  railway run npx ts-node scripts/reconcile-gateway-files.ts
 */
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DIR = path.resolve(__dirname, '../../solishtirish fayllari');

type Gw = 'PAYME' | 'CLICK';
interface Tx {
  file: string;
  gw: Gw;
  service: string; // kassa / service name
  dateStr: string;
  dateMs: number;
  amount: number;
  studentId: number | null;
  name: string | null;
  card: string | null; // last 4 or masked
  gatewayId: string | null; // paymeId (24hex) OR clickTransId
  providerId: string | null;
  status: string;
}

function cell(row: ExcelJS.Row, col: number): any {
  const c = row.getCell(col);
  let v: any = c.value;
  if (v && typeof v === 'object') {
    if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
    else if (v.richText) v = v.richText.map((t: any) => t.text).join('');
  }
  return v === null || v === undefined ? '' : v;
}
const S = (v: any) => String(v ?? '').trim();
const num = (v: any) => {
  const n = parseInt(S(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : NaN;
};
function asStudentId(...vals: any[]): number | null {
  for (const v of vals) {
    const s = S(v);
    if (/^\d{5}$/.test(s)) {
      const n = parseInt(s, 10);
      if (n >= 10000 && n <= 99999) return n;
    }
  }
  return null;
}
// parse "DD-MM-YYYY HH:mm:ss" or "YYYY-MM-DD HH:mm:ss" or Date
function parseDate(v: any): { str: string; ms: number } {
  if (v instanceof Date) return { str: v.toISOString(), ms: v.getTime() };
  const s = S(v);
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, dd, MM, yyyy, hh, mm, ss] = m;
    return { str: s, ms: Date.parse(`${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+05:00`) };
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, yyyy, MM, dd, hh, mm, ss] = m;
    return { str: s, ms: Date.parse(`${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+05:00`) };
  }
  return { str: s, ms: NaN };
}

async function readWb(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DIR, file));
  return wb;
}

// ---- FILE 1: Payme transaction-level (May) ----
async function parsePaymeTx(file: string): Promise<Tx[]> {
  const wb = await readWb(file);
  const ws = wb.worksheets[0];
  const out: Tx[] = [];
  ws.eachRow((row, rn) => {
    if (rn < 8) return;
    const first = S(cell(row, 1));
    if (!/^\d+$/.test(first)) return; // skip ИТОГО/ВСЕГО/blank
    const amount = num(cell(row, 14));
    if (!Number.isFinite(amount)) return;
    const d = parseDate(cell(row, 5));
    const sid = asStudentId(cell(row, 29));
    const nm = S(cell(row, 26));
    out.push({
      file,
      gw: 'PAYME',
      service: S(cell(row, 3)),
      dateStr: d.str,
      dateMs: d.ms,
      amount,
      studentId: sid,
      name: nm && nm !== 'N/A' ? nm : null,
      card: S(cell(row, 13)) || null,
      gatewayId: S(cell(row, 16)) || null, // payme system id (24hex)
      providerId: S(cell(row, 17)) || null,
      status: S(cell(row, 9)),
    });
  });
  return out;
}

// ---- FILE 3 & 4: Click transaction-level ----
// Parse the dedicated per-service sheets (clean data rows).
async function parseClickTx(file: string): Promise<Tx[]> {
  const wb = await readWb(file);
  const out: Tx[] = [];
  for (const ws of wb.worksheets) {
    if (ws.name === 'Общий отчет') continue; // has section headers; use per-service sheets
    ws.eachRow((row, rn) => {
      if (rn < 2) return;
      const clickId = S(cell(row, 10));
      if (!/^\d{5,}$/.test(clickId)) return; // data rows have a numeric Click ID
      const amount = num(cell(row, 12));
      if (!Number.isFinite(amount)) return;
      const d = parseDate(cell(row, 2));
      const c6 = cell(row, 6);
      const c7 = cell(row, 7);
      const sid = asStudentId(c6, c7);
      // name = whichever of c6 is non-numeric text
      let nm: string | null = null;
      if (S(c6) && !/^\d+$/.test(S(c6))) nm = S(c6);
      out.push({
        file,
        gw: 'CLICK',
        service: S(cell(row, 3)),
        dateStr: d.str,
        dateMs: d.ms,
        amount,
        studentId: sid,
        name: nm,
        card: S(cell(row, 5)) || null,
        gatewayId: clickId, // clickTransId
        providerId: S(cell(row, 11)) || null, // billing id
        status: S(cell(row, 13)),
      });
    });
  }
  return out;
}

async function main() {
  const payme = await parsePaymeTx('1.xlsx');
  const clickMay = await parseClickTx('3.xlsx');
  const clickJun = await parseClickTx('4.xlsx');
  const all = [...payme, ...clickMay, ...clickJun];

  // date window
  const start = Date.parse('2026-05-01T00:00:00+05:00');
  const end = Date.parse('2026-07-01T00:00:00+05:00');

  // Load ERP data
  const [payments, paymeTx, clickTx] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: new Date(start), lt: new Date(end) } },
      select: { id: true, studentId: true, amount: true, method: true, status: true, source: true, externalId: true, createdAt: true },
    }),
    prisma.paymeTransaction.findMany({
      select: { paymeId: true, amountInSom: true, state: true, studentId: true, performTime: true, paymentId: true, createTime: true },
    }),
    prisma.clickTransaction.findMany({
      select: { clickTransId: true, amountInSom: true, status: true, studentId: true, completeTime: true, paymentId: true, createdAt: true },
    }),
  ]);

  console.log(`ERP loaded: payments(May-Jun)=${payments.length}, paymeTx(all)=${paymeTx.length}, clickTx(all)=${clickTx.length}`);

  // Index ERP
  const payByExt = new Map<string, typeof payments>();
  for (const p of payments) {
    if (p.externalId) {
      const k = p.externalId;
      if (!payByExt.has(k)) payByExt.set(k, [] as any);
      payByExt.get(k)!.push(p);
    }
  }
  const paymeById = new Map(paymeTx.map((t) => [t.paymeId, t]));
  const clickById = new Map(clickTx.map((t) => [String(t.clickTransId), t]));

  const payByStudent = new Map<number, typeof payments>();
  for (const p of payments) {
    if (!payByStudent.has(p.studentId)) payByStudent.set(p.studentId, [] as any);
    payByStudent.get(p.studentId)!.push(p);
  }

  const DAY = 86400000;
  interface Res { tx: Tx; verdict: string; detail: string; }
  const results: Res[] = [];
  const used = new Set<string>(); // consumed Payment ids

  // ---- PHASE A: strong per-row matches (consume the ERP payment) ----
  const deferred: Tx[] = []; // rows needing greedy assignment (no student key)
  for (const tx of all) {
    // A1. Gateway-id match (Payment.externalId — Payme paymeId / Click clickTransId)
    const extHit = (tx.gatewayId ? payByExt.get(tx.gatewayId) : undefined)?.filter((p) => !used.has(p.id));
    if (extHit && extHit.length) {
      const p = extHit.find((x) => x.amount === tx.amount) || extHit[0];
      used.add(p.id);
      const amtOk = p.amount === tx.amount;
      results.push({ tx, verdict: p.status === 'REVERSED' ? 'FOUND_REVERSED' : 'FOUND', detail: `Payment ${p.id.slice(0, 8)} ext=${tx.gatewayId} student=${p.studentId} ${p.method}/${p.source}/${p.status} amount=${p.amount}${amtOk ? '' : ` (⚠ file=${tx.amount})`}` });
      continue;
    }
    // A2. Gateway txn table (created but not linked to a completed Payment)
    if (tx.gw === 'PAYME' && tx.gatewayId && paymeById.has(tx.gatewayId)) {
      const t = paymeById.get(tx.gatewayId)!;
      if (t.state === 2 && t.paymentId && !used.has(t.paymentId)) { used.add(t.paymentId); results.push({ tx, verdict: 'FOUND', detail: `PaymeTx state=2 paymentId=${t.paymentId.slice(0,8)} student=${t.studentId}` }); }
      else results.push({ tx, verdict: 'GATEWAY_ONLY', detail: `PaymeTx state=${t.state} paymentId=${t.paymentId ?? 'none'} student=${t.studentId}` });
      continue;
    }
    if (tx.gw === 'CLICK' && tx.gatewayId && clickById.has(tx.gatewayId)) {
      const t = clickById.get(tx.gatewayId)!;
      if (t.status === 2 && t.paymentId && !used.has(t.paymentId)) { used.add(t.paymentId); results.push({ tx, verdict: 'FOUND', detail: `ClickTx status=2 paymentId=${t.paymentId.slice(0,8)} student=${t.studentId}` }); }
      else results.push({ tx, verdict: 'GATEWAY_ONLY', detail: `ClickTx status=${t.status} paymentId=${t.paymentId ?? 'none'} student=${t.studentId}` });
      continue;
    }
    // A3. student + amount + nearest date(±5d) against any unconsumed Payment
    if (tx.studentId) {
      const cands = (payByStudent.get(tx.studentId) || [])
        .filter((p) => !used.has(p.id) && p.amount === tx.amount && (!Number.isFinite(tx.dateMs) || Math.abs(p.createdAt.getTime() - tx.dateMs) <= 5 * DAY))
        .sort((a, b) => Math.abs(a.createdAt.getTime() - tx.dateMs) - Math.abs(b.createdAt.getTime() - tx.dateMs));
      if (cands.length) {
        const p = cands[0];
        used.add(p.id);
        results.push({ tx, verdict: 'FOUND_MANUAL', detail: `Payment ${p.id.slice(0, 8)} student=${p.studentId} ${p.method}/${p.source}/${p.status} amount=${p.amount} (student+amount+date, ext=${p.externalId ?? 'none'})` });
        continue;
      }
    }
    deferred.push(tx); // resolve in phase B
  }

  // ---- PHASE B: greedy 1:1 assignment for rows with no usable student key ----
  // Match by same method + exact amount + nearest date(±14d) among still-unconsumed payments.
  // Process nearest-date candidates first so a row doesn't steal another's better match.
  const byMethodAmount = new Map<string, typeof payments>();
  for (const p of payments) {
    if (used.has(p.id)) continue;
    const k = `${p.method}|${p.amount}`;
    (byMethodAmount.get(k) || byMethodAmount.set(k, [] as any).get(k))!.push(p);
  }
  for (const tx of deferred.sort((a, b) => (a.dateMs || 0) - (b.dateMs || 0))) {
    const k = `${tx.gw}|${tx.amount}`;
    const pool = (byMethodAmount.get(k) || []).filter((p) => !used.has(p.id));
    const near = pool
      .filter((p) => !Number.isFinite(tx.dateMs) || Math.abs(p.createdAt.getTime() - tx.dateMs) <= 14 * DAY)
      .sort((a, b) => Math.abs(a.createdAt.getTime() - tx.dateMs) - Math.abs(b.createdAt.getTime() - tx.dateMs));
    if (near.length) {
      const p = near[0];
      used.add(p.id);
      const dd = Math.round(Math.abs(p.createdAt.getTime() - tx.dateMs) / DAY);
      results.push({ tx, verdict: 'FOUND_WEAK', detail: `Payment ${p.id.slice(0, 8)} student=${p.studentId} ${p.method}/${p.source}/${p.status} amount=${p.amount} (amount+method, Δ${dd}d, no student key in file)` });
    } else {
      // truly nothing left. Note if any same-amount payment exists at all (already consumed) or none ever.
      const everAny = payments.filter((p) => p.method === tx.gw && p.amount === tx.amount);
      const anyMethodEver = payments.filter((p) => p.amount === tx.amount);
      results.push({ tx, verdict: 'NOT_FOUND', detail: everAny.length ? `no unconsumed ${tx.gw} payment of ${tx.amount} left (${everAny.length} such payment(s) all matched to other rows)` : anyMethodEver.length ? `no ${tx.gw} payment of ${tx.amount}; but ${anyMethodEver.length} payment(s) of this amount via other method(s): ${[...new Set(anyMethodEver.map(p=>p.method))].join('/')}` : `NO payment of ${tx.amount} anywhere in May–Jun (any method)` });
    }
  }

  // ---- Report ----
  const groups: Record<string, Res[]> = {};
  for (const r of results) {
    const key = `${r.tx.file} | ${r.tx.gw} | ${r.tx.service}`;
    (groups[key] ||= []).push(r);
  }

  const counts: Record<string, number> = {};
  const sums: Record<string, number> = {};
  for (const r of results) {
    counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    sums[r.verdict] = (sums[r.verdict] || 0) + r.tx.amount;
  }

  console.log('\n================ DETAILED RECONCILIATION ================');
  for (const key of Object.keys(groups).sort()) {
    const rows = groups[key];
    const tot = rows.reduce((s, r) => s + r.tx.amount, 0);
    console.log(`\n### ${key}  (${rows.length} tx, ${tot.toLocaleString()} so'm)`);
    for (const r of rows.sort((a, b) => a.tx.dateStr.localeCompare(b.tx.dateStr))) {
      const t = r.tx;
      const flag = { FOUND: '✅', FOUND_MANUAL: '✅', FOUND_REVERSED: '↩️', FOUND_WEAK: '🟡', GATEWAY_ONLY: '⚠️', NOT_FOUND: '❌' }[r.verdict] || '?';
      console.log(
        `${flag} ${r.verdict.padEnd(14)} | ${t.dateStr.slice(0, 19).padEnd(19)} | ${String(t.amount).padStart(8)} | st:${t.studentId ?? '—'} ${t.name ? '(' + t.name + ')' : ''} | ${r.detail}`,
      );
    }
  }

  console.log('\n================ SUMMARY BY VERDICT ================');
  for (const v of Object.keys(counts).sort()) {
    console.log(`${v.padEnd(16)}: ${String(counts[v]).padStart(4)} tx   ${sums[v].toLocaleString().padStart(14)} so'm`);
  }
  const totalTx = results.length;
  const totalSum = results.reduce((s, r) => s + r.tx.amount, 0);
  console.log(`${'TOTAL'.padEnd(16)}: ${String(totalTx).padStart(4)} tx   ${totalSum.toLocaleString().padStart(14)} so'm`);

  // ---- AGGREGATE / MULTISET completeness check (period × method) ----
  // The decisive test: for a period+method, does ERP hold at least as many
  // payments of each exact amount as the gateway file reports? Any amount where
  // file-count > ERP-count is a genuine booking gap of that magnitude.
  console.log('\n================ MULTISET COMPLETENESS (period × method) ================');
  const juneStart = Date.parse('2026-06-01T00:00:00+05:00');
  function periodOf(ms: number): 'MAY' | 'JUNE' { return ms >= juneStart ? 'JUNE' : 'MAY'; }
  const buckets: Record<string, { file: Tx[]; erp: typeof payments }> = {};
  for (const tx of all) {
    const k = `${periodOf(tx.dateMs)}|${tx.gw}`;
    (buckets[k] ||= { file: [], erp: [] }).file.push(tx);
  }
  for (const p of payments) {
    const k = `${periodOf(p.createdAt.getTime())}|${p.method}`;
    if (buckets[k]) buckets[k].erp.push(p);
  }
  for (const k of Object.keys(buckets).sort()) {
    const { file, erp } = buckets[k];
    const fileSum = file.reduce((s, t) => s + t.amount, 0);
    const erpSum = erp.reduce((s, p) => s + p.amount, 0);
    // multiset by amount
    const fc = new Map<number, number>();
    for (const t of file) fc.set(t.amount, (fc.get(t.amount) || 0) + 1);
    const ec = new Map<number, number>();
    for (const p of erp) ec.set(p.amount, (ec.get(p.amount) || 0) + 1);
    let gapCount = 0, gapSum = 0;
    const gaps: string[] = [];
    for (const [amt, n] of [...fc.entries()].sort((a, b) => b[0] - a[0])) {
      const have = ec.get(amt) || 0;
      if (n > have) { gapCount += n - have; gapSum += (n - have) * amt; gaps.push(`${amt.toLocaleString()}×${n - have} (file ${n} / erp ${have})`); }
    }
    console.log(`\n${k}:  file ${file.length} tx / ${fileSum.toLocaleString()}    |    ERP method total ${erp.length} tx / ${erpSum.toLocaleString()}`);
    if (gapCount === 0) console.log(`   ✅ every file amount is covered by an ERP ${k.split('|')[1]} payment of the same amount (no shortfall)`);
    else { console.log(`   ⚠️ shortfall: ${gapCount} file payment(s) / ${gapSum.toLocaleString()} so'm have NO matching ERP ${k.split('|')[1]} payment of that amount:`); gaps.forEach((g) => console.log(`      - ${g}`)); }
  }

  // File 2 note (aggregate only)
  console.log('\n================ FILE 2 (Payme June aggregate) ================');
  console.log('File 2 has NO per-transaction detail — only per-kassa totals.');
  console.log('Reported by Payme: 28 payments, 6,714,000 so\'m (June).');
  const junePayme = payments.filter((p) => p.method === 'PAYME' && p.createdAt.getTime() >= Date.parse('2026-06-01T00:00:00+05:00'));
  const junePaymeSum = junePayme.reduce((s, p) => s + p.amount, 0);
  console.log(`ERP PAYME payments in June: ${junePayme.length} tx, ${junePaymeSum.toLocaleString()} so'm (method=PAYME).`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
