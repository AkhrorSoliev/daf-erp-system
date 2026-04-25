import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const id = Number(process.argv[2]);
  if (!id) {
    console.error('Usage: npx ts-node scripts/check-student.ts <studentId>');
    process.exit(1);
  }

  console.log(
    `DB host: ${new URL(process.env.DATABASE_URL ?? '').host}`,
  );

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      photo: true,
      telegramChatId: true,
      createdAt: true,
      companyId: true,
    },
  });

  if (!student) {
    console.log(`Student #${id} NOT FOUND in this DB.`);
    return;
  }

  console.log(JSON.stringify(student, null, 2));

  if (student.photo) {
    console.log(`\nProbing photo URL...`);
    try {
      const res = await fetch(student.photo, { method: 'HEAD' });
      console.log(`  HTTP ${res.status} ${res.statusText}`);
      console.log(`  Content-Type: ${res.headers.get('content-type')}`);
      console.log(`  Content-Length: ${res.headers.get('content-length')}`);
    } catch (e: any) {
      console.log(`  ERROR: ${e?.message ?? e}`);
    }
  } else {
    console.log(`\n→ photo field is NULL`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
