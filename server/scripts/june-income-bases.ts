/**
 * IYUN DAROMAD ASOSLARI — nega foyda +4,7M — READ-ONLY.
 * Uch xil "daromad"ni va har birida foydani ko'rsatadi.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';

const COMPANY_ID = 1001;

async function main(prismaClient: PrismaClient) {
  const prisma = prismaClient as unknown as PrismaService;
  const fin = new ReportsFinancialService(prisma);
  printHeader('IYUN DAROMAD ASOSLARI — nega foyda +4,7M');
  console.log(`  Baza: ${dbEnvLabel()}`);

  const startDate = '2026-06-01';
  const endDate = '2026-06-30';

  const [recognized, overview, attribution] = await Promise.all([
    fin.getRecognizedRevenue(COMPANY_ID, {
      start: new Date(Date.UTC(2026, 5, 1)),
      end: new Date(Date.UTC(2026, 6, 1)),
    }),
    fin.getFinancialOverview(COMPANY_ID, { startDate, endDate }),
    fin.getIncomeMonthAttribution(COMPANY_ID, { startDate, endDate }),
  ]);

  const salary = 66_704_430; // siz bergan jami oylik (data fix'dan keyin)
  const expenses = 92_744_000;
  const refunds = 907_000;
  const costs = salary + expenses + refunds;

  section('Uch xil DAROMAD');
  console.log(`  A) Dars tushumi (recognized — Foyda card ISHLATADI) : ${som(recognized)}`);
  console.log(`  B) Kassa tushumi (barcha COMPLETED, createdAt iyun) : ${som(overview.income.actual)}`);
  console.log(`     shundan HAQIQIY iyun (eski qarzsiz)              : ${som(attribution.currentMonth)}   ← sizning 133,6M`);
  console.log(`     shundan KECH (eski oylar qarzi iyunda to'langan) : ${som(attribution.lateTotal)}`);

  section('Xarajatlar (ikkalasi ham NAQD)');
  console.log(`  Ustoz oyligi (siz bergan) : ${som(salary)}`);
  console.log(`  Operatsion xarajat        : ${som(expenses)}`);
  console.log(`  Refund                    : ${som(refunds)}`);
  console.log(`  JAMI chiqim               : ${som(costs)}`);

  section('FOYDA — daromad asosiga qarab');
  console.log(`  A) Dars tushumi (165M)     − chiqim : ${som(recognized - costs)}   ← HOZIRGI card (+4,7M)`);
  console.log(`  B) Barcha kassa (171,5M)   − chiqim : ${som(overview.income.actual - costs)}`);
  console.log(`  C) HAQIQIY iyun (133,6M)   − chiqim : ${som(attribution.currentMonth - costs)}   ← sizning hisobingiz (zarar)`);

  section('Nega farq');
  console.log(`  Dars tushumi (165M) − Haqiqiy iyun kassa (133,6M) = ${som(recognized - attribution.currentMonth)}`);
  console.log('  Bu farq — iyun darslari boshqa oy puli bilan to\'langan:');
  console.log('   • oldindan to\'lov (may/avval to\'langan, iyunda dars o\'tilgan), yoki');
  console.log('   • kech to\'lov (iyun darsi iyulda to\'langan).');
  console.log('  "Dars tushumi" darsni O\'TILGAN oyга yozadi (naqd qachon kelganidan qat\'i nazar);');
  console.log('  "Haqiqiy kassa" esa faqat shu oyda KELGAN yangi pulni sanaydi.\n');
}

run(main);
