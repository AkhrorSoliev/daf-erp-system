/**
 * READ-ONLY. Builds the payment statement for every student of a company and
 * reports:
 *   - how many reconcile to the balance to the som;
 *   - months that bill more lessons than they have lesson days (a lesson
 *     counted twice).
 * Writes a CSV, and PDFs for the ids given, OUTSIDE the repo (the repo is
 * public).
 *
 *   DATABASE_URL=<url> npx ts-node scripts/statement-dry-run.ts <companyId> <outDir> [pdfId,pdfId,...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { StatementLoader } from '../src/statements/statement.loader';
import { buildStatement } from '../src/statements/build-statement';
import { presentStatement } from '../src/statements/present-statement';
import { renderStatementPdf } from '../src/statements/statement-pdf';

async function main() {
  const companyId = Number(process.argv[2]);
  const outDir = process.argv[3];
  const pdfIds = new Set(
    (process.argv[4] ?? '').split(',').filter(Boolean).map(Number),
  );
  if (!companyId || !outDir) {
    throw new Error(
      'usage: statement-dry-run.ts <companyId> <outDir> [pdfIds]',
    );
  }
  fs.mkdirSync(outDir, { recursive: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const loader = new StatementLoader(prisma as never);
    const students = await prisma.student.findMany({
      where: { companyId, transactions: { some: {} } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const lines = ['studentId,balance,unexplained,doubledMonths'];
    let reconciled = 0;
    let doubled = 0;
    const queue = [...students];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const model = buildStatement(await loader.load(s.id, companyId));
        const doubledMonths = model.months
          .filter(
            (m) => m.lessons > m.lessonDays.length && m.preSystem === null,
          )
          .map((m) => m.key);
        if (model.equation.unexplained === 0) reconciled += 1;
        if (doubledMonths.length > 0) doubled += 1;
        lines.push(
          `${s.id},${model.balance},${model.equation.unexplained},${doubledMonths.join(' ')}`,
        );
        if (pdfIds.has(s.id)) {
          const pdf = await renderStatementPdf(
            presentStatement(model, 'student'),
          );
          fs.writeFileSync(path.join(outDir, `statement-${s.id}.pdf`), pdf);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    fs.writeFileSync(
      path.join(outDir, 'statement-dry-run.csv'),
      lines.join('\n') + '\n',
    );
    console.log(
      `students=${students.length} reconciled=${reconciled} off=${students.length - reconciled} doubledMonths=${doubled}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
