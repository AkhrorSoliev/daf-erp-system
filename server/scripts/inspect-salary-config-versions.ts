/**
 * READ-ONLY — print the exact EmployeeSalaryConfig + version chain (raw ISO
 * timestamps) for every active config, so the May backdate script can be
 * written to abut the earliest version precisely. Mutates nothing.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const COMPANY = 1001;

async function main() {
  console.log('DB host:', new URL(process.env.DATABASE_URL ?? '').host);
  const configs = await prisma.employeeSalaryConfig.findMany({
    where: { companyId: COMPANY, isActive: true },
    select: {
      id: true,
      userId: true,
      groupId: true,
      salaryType: true,
      value: true,
      user: { select: { firstName: true, lastName: true } },
      versions: {
        select: {
          id: true,
          salaryType: true,
          value: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
        orderBy: { effectiveFrom: 'asc' },
      },
    },
    orderBy: { userId: 'asc' },
  });

  for (const c of configs) {
    const scope = c.groupId ? `group:${c.groupId}` : 'GLOBAL';
    console.log(
      `\n#${c.userId} ${c.user.firstName} ${c.user.lastName} [${scope}] parent=${c.salaryType}:${c.value} (cfg ${c.id})`,
    );
    for (const v of c.versions) {
      console.log(
        `   ${v.salaryType}:${v.value}  from=${v.effectiveFrom.toISOString()}  to=${v.effectiveTo ? v.effectiveTo.toISOString() : 'OPEN'}`,
      );
    }
    const earliest = c.versions[0];
    if (earliest) {
      const coversMay =
        earliest.effectiveFrom.getTime() <=
        new Date('2026-05-01T00:00:00.000Z').getTime();
      console.log(
        `   → earliest.effectiveFrom ${coversMay ? 'ALREADY covers' : 'does NOT cover'} 2026-05-01`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
