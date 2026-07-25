/**
 * repoint-lead-converted-student — one-off remediation.
 * Old lead-conversion dup bug: a lead's convertedStudentId points at the
 * ARCHIVED stub account, not the real active student. Re-point it to the real
 * account so the student profile "Lid tarixi" tab resolves for real students.
 *
 * DRY-RUN by default. Pass --apply to write.
 *   railway run npx ts-node scripts/repoint-lead-converted-student.ts           (dry-run, PROD)
 *   railway run npx ts-node scripts/repoint-lead-converted-student.ts --apply   (apply, PROD)
 *
 * Mapping is verified from the 2026-07-22 forensics (same-phone pairs + Javohir
 * name-based). The 4 stubs with no real counterpart (10562/64/65/68) and the
 * test account 10733 are intentionally OUT of scope.
 */
import { PrismaClient } from '@prisma/client';
import { run, printHeader, section } from './lib/check-cli';

// stub (current convertedStudentId) → real (correct account)
const MAPPING: { stub: number; real: number; basis: string }[] = [
  { stub: 10561, real: 10593, basis: 'same phone 910410514' },
  { stub: 10563, real: 10580, basis: 'same phone 918867034' },
  { stub: 10566, real: 10583, basis: 'same phone 887597590' },
  { stub: 10567, real: 10577, basis: 'same phone 937680848' },
  { stub: 10732, real: 10713, basis: 'name-based (diff phone: lead 999190526 vs real 950410023)' },
];

async function main(prisma: PrismaClient) {
  const apply = process.argv.includes('--apply');
  printHeader(`Lid → haqiqiy o'quvchi re-point ${apply ? '(APPLY)' : '(DRY-RUN)'}`);

  section('Rejalashtirilgan o\'zgarishlar');
  let planned = 0;
  for (const m of MAPPING) {
    const leads = await prisma.lead.findMany({
      where: { convertedStudentId: m.stub },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const real = await prisma.student.findUnique({
      where: { id: m.real },
      select: { id: true, firstName: true, lastName: true, status: true, deletedAt: true },
    });
    if (!real || real.deletedAt) {
      console.log(`  ⚠ SKIP stub ${m.stub}: haqiqiy #${m.real} topilmadi/arxiv — qo'lda tekshiring`);
      continue;
    }
    if (leads.length === 0) {
      console.log(`  ⚠ SKIP stub ${m.stub}: bu stubga bog'langan lid yo'q`);
      continue;
    }
    for (const l of leads) {
      planned++;
      console.log(
        `  Lid ${l.id.slice(0, 8)} (${l.firstName} ${l.lastName}) : convertedStudentId ${m.stub} → ${m.real} ` +
        `[${real.firstName} ${real.lastName}, ${real.status}] · ${m.basis}`,
      );
      if (apply) {
        await prisma.lead.update({
          where: { id: l.id },
          data: { convertedStudentId: m.real },
        });
        await prisma.entityHistory.create({
          data: {
            entityType: 'Lead',
            entityId: l.id,
            action: 'UPDATE' as any,
            oldValues: { convertedStudentId: m.stub },
            newValues: { convertedStudentId: m.real },
            changedById: null,
            companyId: null,
          },
        });
      }
    }
  }

  section('Xulosa');
  console.log(`  ${planned} ta lid ${apply ? 'QAYTA BOG\'LANDI' : 'qayta bog\'lanadi (dry-run)'}.`);
  if (!apply) console.log('  Qo\'llash uchun: --apply qo\'shing.');
}

run(main);
