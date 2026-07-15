/**
 * READ-ONLY: simulate the exact validateUser() where-clause against real prod
 * data to confirm the phone-login lookup is schema-valid and deterministic.
 * Run: railway run npx ts-node scripts/sim-phone-login.ts <phone> <admin|lehrer|student>
 */
import { makePrisma } from './lib/check-cli';

const prisma = makePrisma();
const PORTAL_ROLES: Record<string, number[]> = {
  admin: [1, 2, 3, 5],
  lehrer: [4],
  student: [6],
};

async function main() {
  const raw = process.argv[2] ?? '972062922';
  const portal = process.argv[3] ?? 'admin';
  const allowedRoleIds = PORTAL_ROLES[portal];

  const digits = raw.replace(/\D/g, '');
  const phone9 =
    digits.length === 12 && digits.startsWith('998')
      ? digits.slice(3)
      : digits.length === 9
        ? digits
        : null;
  const or: Array<{ login?: string; phone?: string }> = [{ login: raw }];
  if (phone9) {
    or.push({ phone: phone9 });
    if (phone9 !== raw) or.push({ login: phone9 });
  }

  const where: any = {
    OR: or,
    deletedAt: null,
    status: { in: ['ACTIVE', 'INACTIVE'] },
    ...(allowedRoleIds?.length
      ? { roles: { some: { role: { id: { in: allowedRoleIds } } } } }
      : {}),
  };

  const all = await prisma.user.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      login: true,
      phone: true,
      updatedAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  const winner = all[0];
  console.log(`phone='${raw}' portal='${portal}' roles=[${allowedRoleIds}]`);
  console.log(`matches: ${all.length}`);
  for (const u of all)
    console.log(
      `  ${u.id === winner?.id ? '➜' : ' '} #${u.id} ${u.firstName} ${u.lastName} [${u.roles
        .map((r) => r.role.name)
        .join(',')}] login=${u.login} phone=${u.phone} upd=${u.updatedAt.toISOString().slice(0, 10)}`,
    );
  console.log(
    winner
      ? `WINNER (validateUser would pick): #${winner.id} ${winner.firstName} ${winner.lastName}`
      : 'NO MATCH (would be "Login yoki parol noto`g`ri")',
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
