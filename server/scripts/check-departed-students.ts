import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const departedEnrollments = await prisma.enrollment.findMany({
    where: {
      status: 'DROPPED',
      deletedAt: null,
    },
    select: {
      id: true,
      statusChangedAt: true,
      statusChangeReason: true,
      departureReasonId: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          companyId: true,
        },
      },
      group: {
        select: {
          id: true,
          name: true,
          branch: { select: { name: true } },
          course: { select: { name: true } },
        },
      },
    },
    orderBy: { statusChangedAt: 'desc' },
  });

  console.log(`\n=== Departed enrollments (status=DROPPED): ${departedEnrollments.length} ===\n`);
  for (const e of departedEnrollments) {
    console.log(`Enrollment ID: ${e.id}`);
    console.log(`  Student:       ${e.student.id} — ${e.student.firstName} ${e.student.lastName} (phone: +998${e.student.phone})`);
    console.log(`  Student status: ${e.student.status}, companyId: ${e.student.companyId}`);
    console.log(`  Group:         ${e.group.name} / ${e.group.course.name} / ${e.group.branch.name}`);
    console.log(`  Enrolled:      ${e.createdAt.toISOString()}`);
    console.log(`  Departed at:   ${e.statusChangedAt?.toISOString() ?? 'n/a'}`);
    console.log(`  Reason:        "${e.statusChangeReason ?? '(none)'}"  (departureReasonId: ${e.departureReasonId ?? 'null'})`);
    console.log('');
  }

  // Also show students whose own status indicates departure
  const departedStudents = await prisma.student.findMany({
    where: {
      status: { in: ['EXPELLED', 'GRADUATED', 'FROZEN'] },
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      statusChangedAt: true,
      statusChangeReason: true,
      companyId: true,
    },
    orderBy: { statusChangedAt: 'desc' },
  });

  console.log(`\n=== Students with non-ACTIVE status: ${departedStudents.length} ===\n`);
  for (const s of departedStudents) {
    console.log(`  ${s.id} — ${s.firstName} ${s.lastName} (+998${s.phone})`);
    console.log(`    status: ${s.status}, companyId: ${s.companyId}`);
    console.log(`    changed: ${s.statusChangedAt?.toISOString() ?? 'n/a'}, reason: "${s.statusChangeReason ?? '(none)'}"`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
