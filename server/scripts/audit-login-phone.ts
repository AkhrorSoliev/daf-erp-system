/**
 * READ-ONLY audit: feasibility of switching ALL-role login from `login` (username)
 * to phone number. Checks phone presence, duplicates, and login==phone overlap
 * among non-student staff users. Run: railway run npx ts-node scripts/audit-login-phone.ts
 */
import { PrismaClient } from '@prisma/client';
import { makePrisma } from './lib/check-cli';

const prisma = makePrisma();
const STUDENT_ROLE_ID = 6;

function norm(p: string | null | undefined): string | null {
  if (!p) return null;
  let d = p.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) d = d.slice(3);
  return d.length === 9 ? d : d || null;
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      roles: { some: { role: { id: { not: STUDENT_ROLE_ID } } } },
    },
    select: {
      id: true,
      login: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      roles: { select: { role: { select: { id: true, name: true } } } },
    },
  });

  const staff = users.filter(
    (u) => !u.roles.some((r) => r.role.id === STUDENT_ROLE_ID),
  );

  const noPhone = staff.filter((u) => !norm(u.phone));
  const noLogin = staff.filter((u) => !u.login);
  const loginEqualsPhone = staff.filter(
    (u) => u.login && norm(u.login) && norm(u.login) === norm(u.phone),
  );

  // Duplicate normalized phones among staff
  const byPhone = new Map<string, typeof staff>();
  for (const u of staff) {
    const p = norm(u.phone);
    if (!p) continue;
    if (!byPhone.has(p)) byPhone.set(p, []);
    byPhone.get(p)!.push(u);
  }
  const dupPhones = [...byPhone.entries()].filter(([, arr]) => arr.length > 1);

  // Cross-check: would a staff phone collide with a STUDENT login=phone?
  const studentLogins = await prisma.user.findMany({
    where: {
      deletedAt: null,
      roles: { some: { role: { id: STUDENT_ROLE_ID } } },
      login: { not: null },
    },
    select: { login: true },
  });
  const studentPhoneSet = new Set(
    studentLogins.map((s) => norm(s.login)).filter(Boolean) as string[],
  );
  const staffPhoneCollidesStudent = staff.filter(
    (u) => norm(u.phone) && studentPhoneSet.has(norm(u.phone)!),
  );

  console.log('=== Staff (non-student) login→phone audit ===');
  console.log('Total staff users:', staff.length);
  console.log('  no phone stored:', noPhone.length);
  console.log('  no login stored:', noLogin.length);
  console.log('  login already == phone:', loginEqualsPhone.length);
  console.log('  duplicate phone groups:', dupPhones.length);
  console.log('  staff phone collides with a student login:', staffPhoneCollidesStudent.length);

  if (noPhone.length) {
    console.log('\n-- staff WITHOUT a valid phone (would be locked out if phone-login) --');
    for (const u of noPhone.slice(0, 40))
      console.log(`  #${u.id} ${u.firstName} ${u.lastName} [${u.roles.map((r) => r.role.name).join(',')}] login=${u.login} phone=${u.phone}`);
  }
  if (dupPhones.length) {
    console.log('\n-- duplicate phones (ambiguous phone-login) --');
    for (const [p, arr] of dupPhones.slice(0, 30))
      console.log(`  ${p}: ${arr.map((u) => `#${u.id} ${u.firstName} ${u.lastName} [${u.roles.map((r) => r.role.name).join(',')}]`).join(' | ')}`);
  }
  if (staffPhoneCollidesStudent.length) {
    console.log('\n-- staff phone == a student login (login-namespace collision) --');
    for (const u of staffPhoneCollidesStudent.slice(0, 30))
      console.log(`  #${u.id} ${u.firstName} ${u.lastName} phone=${u.phone}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
