/**
 * Backfill: create a User (login = phone, password = "123456") for every
 * Student that doesn't yet have one and link it via student.userId.
 *
 * Idempotent — re-running only touches students still missing a User.
 * Uses bulk SQL (single round-trip per step) so it stays fast on remote DBs.
 *
 * Usage:
 *   npx ts-node scripts/backfill-student-users.ts --dry-run
 *   npx ts-node scripts/backfill-student-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const STUDENT_ROLE_ID = 6;
const DEFAULT_PASSWORD = '123456';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Neon serverless drops the connection during cold-starts and suspends.
// Wrap each query in a small retry so a single transient drop doesn't kill
// the whole script.
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const transient =
        msg.includes('ConnectionClosed') ||
        msg.includes('Connection terminated') ||
        msg.includes('Server has closed the connection') ||
        err?.code === 'P1017';
      if (!transient || attempt === maxAttempts) throw err;
      const wait = 1000 * attempt;
      console.warn(
        `  [${label}] urinish ${attempt}/${maxAttempts} muvaffaqiyatsiz: ${msg.split('\n')[0]} — ${wait}ms kutib qayta urinaman`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = await withRetry('count', () =>
    prisma.student.count({ where: { deletedAt: null, userId: null } }),
  );

  console.log(`Topildi: ${candidates} ta o'quvchi User yaratilmagan`);
  if (candidates === 0) {
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    const sample = await prisma.student.findMany({
      where: { deletedAt: null, userId: null },
      select: { id: true, firstName: true, lastName: true, phone: true },
      take: 5,
      orderBy: { id: 'asc' },
    });
    console.log('--dry-run rejimi: hech nima yozilmaydi');
    console.log('Birinchi 5 ta namuna:');
    for (const s of sample) {
      console.log(
        `  #${s.id} ${s.firstName} ${s.lastName} -> login=${s.phone}, parol=${DEFAULT_PASSWORD}`,
      );
    }
    await prisma.$disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Step 1: bulk-insert User rows for every student missing a user.
  // Each new user gets login = phone, password = bcrypt("123456"),
  // firstName/lastName/phone/companyId mirrored from the student.
  // Skip rows where another active User already owns that login (login is
  // a partial unique index WHERE deletedAt IS NULL), and dedupe across
  // students sharing the same phone — only one user per phone is created.
  console.log("Step 1/3: User'lar yaratilyapti...");
  const inserted: number = await withRetry('step1-insert-users', () =>
    prisma.$executeRaw`
    INSERT INTO "User" (
      "firstName", "lastName", "phone", "login", "password",
      "companyId", "isActive", "status", "balance",
      "createdAt", "updatedAt"
    )
    SELECT DISTINCT ON (s."phone")
      s."firstName", s."lastName", s."phone", s."phone", ${hashedPassword},
      s."companyId", true, 'ACTIVE', 0,
      NOW(), NOW()
    FROM "Student" s
    WHERE s."deletedAt" IS NULL
      AND s."userId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."login" = s."phone" AND u."deletedAt" IS NULL
      )
    ORDER BY s."phone", s."id"
  `,
  );
  console.log(`  ${inserted} ta User yaratildi`);

  // Step 2: assign Student role (id = 6) to the freshly-inserted users.
  // We match by login = phone — only users that don't already have the role
  // get linked, so the statement is idempotent.
  console.log("Step 2/3: Student roli berilyapti...");
  const rolesAssigned: number = await withRetry(
    'step2-insert-roles',
    () => prisma.$executeRaw`
    INSERT INTO "UserRole" ("userId", "roleId")
    SELECT DISTINCT u.id, ${STUDENT_ROLE_ID}::int
    FROM "User" u
    JOIN "Student" s ON s."phone" = u."login" AND s."companyId" = u."companyId"
    WHERE s."deletedAt" IS NULL
      AND s."userId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "UserRole" ur
        WHERE ur."userId" = u.id AND ur."roleId" = ${STUDENT_ROLE_ID}::int
      )
  `,
  );
  console.log(`  ${rolesAssigned} ta UserRole yaratildi`);

  // Step 3: link each student to the user we just created. Match by
  // (phone, companyId) and require the user to actually carry the Student role
  // so we never accidentally link to a teacher/admin who happens to share a
  // phone number. When two students share a phone, only the lowest-id one
  // gets the link (Student.userId is unique).
  console.log("Step 3/3: student.userId bog'lanyapti...");
  const linked: number = await withRetry(
    'step3-link-students',
    () => prisma.$executeRaw`
    UPDATE "Student" s
    SET "userId" = u.id, "updatedAt" = NOW()
    FROM "User" u
    JOIN "UserRole" ur ON ur."userId" = u.id AND ur."roleId" = ${STUDENT_ROLE_ID}::int
    WHERE u."login" = s."phone"
      AND u."companyId" = s."companyId"
      AND u."deletedAt" IS NULL
      AND s."deletedAt" IS NULL
      AND s."userId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Student" s3
        WHERE s3."userId" = u.id
      )
      AND s."id" = (
        SELECT MIN(s2."id")
        FROM "Student" s2
        WHERE s2."phone" = s."phone"
          AND s2."companyId" = s."companyId"
          AND s2."deletedAt" IS NULL
          AND s2."userId" IS NULL
      )
  `,
  );
  console.log(`  ${linked} ta Student bog'landi`);

  const stillMissing = await withRetry('final-count', () =>
    prisma.student.count({ where: { deletedAt: null, userId: null } }),
  );
  if (stillMissing > 0) {
    console.log(
      `\nE'tibor: ${stillMissing} ta o'quvchi User ololmadi (telefon raqam ` +
        "boshqa o'quvchi yoki xodim bilan to'qnashgan). Ularga login ber" +
        'ish uchun telefon raqamini o\'zgartirish kerak.',
    );
  }

  console.log(`\nTayyor.`);
  console.log(`Login = o'quvchining telefon raqami (9 xonali, +998 siz)`);
  console.log(`Parol = ${DEFAULT_PASSWORD}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
