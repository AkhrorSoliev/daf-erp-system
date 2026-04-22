/**
 * Reproduce the GET /gateways/events flow locally (uses the same service logic).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function resolveStudent(
  provider: string,
  externalId: string,
  payload: any,
  companyId: number,
) {
  let studentId: number | null = null;

  if (provider === 'PAYME') {
    const txn = await prisma.paymeTransaction.findFirst({
      where: { paymeId: externalId, companyId },
      select: { studentId: true },
    });
    studentId = txn?.studentId ?? null;

    if (studentId === null && payload) {
      const raw = payload?.params?.account?.student_id;
      const asNum = Number(raw);
      if (Number.isFinite(asNum)) studentId = asNum;
    }
  } else if (provider === 'CLICK') {
    const id = Number(externalId);
    if (!Number.isNaN(id)) {
      const txn = await prisma.clickTransaction.findFirst({
        where: { clickTransId: BigInt(id), companyId },
        select: { studentId: true },
      });
      studentId = txn?.studentId ?? null;
    }
    if (studentId === null && payload) {
      const raw = payload?.merchant_trans_id;
      const asNum = Number(raw);
      if (Number.isFinite(asNum)) studentId = asNum;
    }
  }

  if (studentId === null) return null;

  return prisma.student.findFirst({
    where: { id: studentId, companyId },
    select: { id: true, firstName: true, lastName: true },
  });
}

async function main() {
  const companyId = 1001;

  console.log('\n=== Testing /gateways/events (page 1, pageSize 10) ===\n');

  const events = await prisma.paymentGatewayEvent.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const e of events) {
    const student = await resolveStudent(
      e.provider,
      e.externalId,
      e.payload,
      companyId,
    );
    console.log(
      `  ${e.createdAt.toISOString()} | ${e.provider} | ${e.eventType.padEnd(25)} | externalId=${e.externalId.slice(0, 12).padEnd(12)} | student=${student ? `#${student.id} ${student.firstName}` : 'NULL'}`,
    );
  }

  console.log('\n✅ Done');
}

main().catch(console.error).finally(() => prisma.$disconnect());
