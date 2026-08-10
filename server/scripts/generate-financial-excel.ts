/**
 * Standalone generator for the "Hisobot" Excel — produces EXACTLY the
 * same workbook the /payments/overview "Excel yuklab olish" button gives in
 * production (same ReportsExcelService, same read-only queries). Bypasses the
 * HTTP layer + full Nest bootstrap (no crons/listeners) by wiring just the
 * report services against a PrismaClient.
 *
 *   Dev:   npx ts-node --transpile-only scripts/generate-financial-excel.ts [start] [end]
 *   Prod:  railway run npx ts-node --transpile-only scripts/generate-financial-excel.ts [start] [end]
 *
 * start/end are optional YYYY-MM-DD; default = current calendar month (the
 * frontend default). Company-wide (CEO view — all branches).
 *
 * Ten sheets by default. `INCLUDE=buxgalteriya,marketing,qarzdorlar` adds the
 * same opt-in groups the download popover offers — the «Tekshiruv» ties printed
 * below only exist when `buxgalteriya` is requested.
 */
import 'dotenv/config'; // loads server/.env for dev; `railway run` env wins in prod (dotenv doesn't override)
import { Workbook } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildExcelService } from './build-report-services';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const startDate = process.argv[2];
  const endDate = process.argv[3];

  // Shared with the pre-flight script on purpose — see build-report-services.ts.
  // The hand-rolled facade that used to live here silently fell eight methods
  // behind ReportsExcelService.generate and stopped working altogether.
  const excel = buildExcelService(prisma);

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('Company topilmadi');
  const branches = await prisma.branch.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const branchNames: Record<number, string> = Object.fromEntries(
    branches.map((b) => [b.id, b.name]),
  );

  // A CEO id → getMonthly returns all teachers (company-wide, unscoped).
  const ceo = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      deletedAt: null,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { id: true },
  });

  // Optional opt-in sheet groups, same tokens the download popover offers:
  //   INCLUDE=buxgalteriya,marketing,qarzdorlar
  const include = (process.env.INCLUDE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const buffer = await excel.generate(company.id, {
    // Company-wide (CEO view) — matches the 'Barcha filiallar' label.
    branchIds: null,
    startDate,
    endDate,
    companyName: company.name,
    branchLabel: 'Barcha filiallar',
    branchNames,
    performedById: ceo?.id ?? 0,
    include,
  });

  const outDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `hisobot-${stamp}.xlsx`);
  fs.writeFileSync(outPath, buffer);

  // Re-read the produced workbook and print a summary so we can confirm the
  // reconciliation ties without opening the file.
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const cell = (sheet: string, col1: string, col: number) => {
    const ws = wb.getWorksheet(sheet);
    let out: any = null;
    ws?.eachRow((r) => {
      if (out == null && String(r.getCell(1).value ?? '') === col1) out = r.getCell(col).value;
    });
    return out;
  };
  const ties: string[] = [];
  wb.getWorksheet('Tekshiruv')?.eachRow((r) => {
    const v = String(r.getCell(5).value ?? '');
    if (v === 'MOS' || v === 'XATO') ties.push(`${v}  ${String(r.getCell(1).value)}`);
  });

  console.log('==================================================');
  console.log(`Fayl:      ${outPath}`);
  console.log(`Hajmi:     ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`Kompaniya: ${company.name} (#${company.id}), filiallar: ${branches.length}`);
  console.log(`Varaqlar:  ${wb.worksheets.map((w) => w.name).join(', ')}`);
  console.log(`Sof foyda: ${cell('Xulosa', '=  SOF FOYDA', 2)}`);
  console.log('--- Tekshiruv (ties) ---');
  ties.forEach((t) => console.log('  ' + t));
  console.log('==================================================');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
