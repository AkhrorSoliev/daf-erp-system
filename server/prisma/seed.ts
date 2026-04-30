import 'dotenv/config';
import { PrismaClient, Prisma, EnrollmentStatus, AttendanceStatus, SalaryType, TransactionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

/**
 * Comprehensive dev-database seed (Faza 8 rebuild).
 *
 * Spec:
 *   - 1 company, 6 roles (system)
 *   - 3 branches: Toshkent / Samarqand / Farg'ona
 *   - per branch: BD + Admin + Cashier + 5-10 teachers + 6-8 rooms
 *   - 5 global courses (Standart A1/A2, Intensiv A1/A2, Goethe)
 *   - ~30 groups (10 / 10 / 8 across branches)
 *   - 320-450 students per branch (= ~1150 total) with realistic distribution:
 *       70% active enrollment, 10% frozen, 5% dropped, 15% un-enrolled
 *   - default salary period (cycleStartDay=8)
 *   - default global salary config: 30% PERCENTAGE for every teacher
 *   - mix of payments + initial balances + attendance to make the UI alive
 *
 * Cleans data via deleteMany (FK-aware order); does NOT drop the schema.
 *
 * Login: every seeded user has password "123456".
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ============================================================================
// CONFIG
// ============================================================================

const COMPANY_ID = 1001;

const BRANCHES = [
  {
    id: 1,
    name: 'Toshkent filiali',
    address: "Toshkent sh., Amir Temur shoh ko'chasi 12",
    phone: '901001001',
    teacherCount: 10,
    groupCount: 12,
    studentCount: 450,
    roomCount: 8,
  },
  {
    id: 2,
    name: 'Samarqand filiali',
    address: "Samarqand sh., Registon ko'chasi 5",
    phone: '902002002',
    teacherCount: 7,
    groupCount: 10,
    studentCount: 380,
    roomCount: 6,
  },
  {
    id: 3,
    name: "Farg'ona filiali",
    address: "Farg'ona sh., Mustaqillik ko'chasi 15",
    phone: '903003003',
    teacherCount: 6,
    groupCount: 8,
    studentCount: 320,
    roomCount: 6,
  },
] as const;

// ============================================================================
// HELPERS
// ============================================================================

const ODD_DAYS = ['monday', 'wednesday', 'friday'];
const EVEN_DAYS = ['tuesday', 'thursday', 'saturday'];
const TIME_SLOTS = [
  { start: '08:00', endStandart: '09:00', endIntensiv: '09:30' },
  { start: '10:00', endStandart: '11:00', endIntensiv: '11:30' },
  { start: '14:00', endStandart: '15:00', endIntensiv: '15:30' },
  { start: '16:00', endStandart: '17:00', endIntensiv: '17:30' },
  { start: '18:00', endStandart: '19:00', endIntensiv: '19:30' },
];

const FIRST_NAMES_M = ['Aziz', 'Jasur', 'Bekzod', 'Doniyor', 'Sardor', 'Otabek', 'Sherzod', 'Akmal', 'Bobur', 'Nodir', 'Sanjar', 'Rustam', 'Olim', 'Anvar', 'Komil', 'Hasan', 'Husan', 'Davron', 'Asror', 'Eldor'];
const FIRST_NAMES_F = ['Dilnoza', 'Madina', 'Nilufar', 'Zarina', 'Gulnora', 'Shahnoza', 'Sevara', 'Maftuna', 'Yulduz', 'Iroda', 'Kamola', 'Lola', 'Charos', 'Nigora', 'Sayyora', 'Nodira', 'Mahliyo', 'Aziza', 'Dildora', 'Feruza'];
const LAST_NAMES = ['Karimov', 'Rahimov', 'Toshmatov', 'Usmonov', 'Aliyev', 'Yusupov', 'Sharipov', 'Tursunov', 'Mirzayev', 'Sobirov', 'Qodirov', 'Saidov', 'Ergashev', 'Hasanov', 'Mamatov', 'Mansurov', 'Olimov', 'Fayzullayev', 'Xolmatov', 'Jumayev', 'Yo`ldoshev', 'Eshmatov', 'Boboyev', 'Davronov', 'Nasriddinov'];

const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length];
const pickRandom = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function randomPhone(prefix: string): string {
  // 9 digits — first 2 are operator code prefix.
  return prefix + Math.floor(1000000 + Math.random() * 9000000).toString();
}

function fakeName(gender: 'MALE' | 'FEMALE', i: number) {
  const first = gender === 'MALE' ? pick(FIRST_NAMES_M, i) : pick(FIRST_NAMES_F, i);
  const last = pick(LAST_NAMES, Math.floor(i * 1.7));
  return { first, last };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧹 Bazani tozalash...');
  await cleanDb();
  console.log('✓ Baza tozalandi\n');

  // 1. Roles + company + tax config
  console.log('🏗  Foundation (roles, company) ...');
  await seedRoles();
  await prisma.company.create({
    data: { id: COMPANY_ID, name: 'DaF Sprachzentrum' },
  });

  // Salary period setting — default 8th
  await prisma.salaryPeriodSetting.create({
    data: {
      companyId: COMPANY_ID,
      cycleStartDay: 8,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    },
  });
  console.log('✓ Roles + company + tax config + salary period\n');

  // 2. Courses (global, branchId null)
  console.log('📚 Kurslar ...');
  const courses = await seedCourses();
  console.log(`✓ ${courses.length} kurs\n`);

  // 3. Hash password once
  const hashedPassword = await bcrypt.hash('123456', 10);

  // 4. CEO (single, all branches)
  console.log('👤 CEO ...');
  const ceo = await prisma.user.create({
    data: {
      firstName: 'CEO',
      lastName: 'Admin',
      login: 'ceo',
      password: hashedPassword,
      gender: 'MALE',
      phone: '900000000',
      companyId: COMPANY_ID,
      roles: { create: [{ roleId: 1 }] },
      // CEO branches will be filled after branches are created
    },
  });
  console.log(`✓ CEO: login=ceo (id ${ceo.id})\n`);

  // 5. Per-branch setup
  const branchSummaries: BranchSummary[] = [];
  for (const branchSpec of BRANCHES) {
    const summary = await seedBranch(branchSpec, hashedPassword, courses);
    branchSummaries.push(summary);
    // Wire CEO into this branch
    await prisma.userBranch.create({
      data: { userId: ceo.id, branchId: branchSpec.id },
    });
  }

  // 6. Mock activity (payments, initial balances, some attendance)
  console.log('💰 Mock financial activity ...');
  await seedFinancialActivity(branchSummaries);
  console.log('✓ Financial activity\n');

  // 7. Summary
  printSummary(ceo, branchSummaries);
}

// ============================================================================
// CLEAN
// ============================================================================

async function cleanDb() {
  // FK order: leaf → root. Each `.catch(() => {})` swallows
  // "table doesn't exist" on older databases that haven't yet seen the
  // newest migrations.
  await prisma.salaryAccrual.deleteMany().catch(() => {});
  await prisma.salaryPayment.deleteMany().catch(() => {});
  await prisma.employeeSalaryConfigVersion.deleteMany().catch(() => {});
  await prisma.employeeSalaryConfig.deleteMany().catch(() => {});
  await prisma.salaryPeriodSetting.deleteMany().catch(() => {});
  await prisma.transaction.deleteMany().catch(() => {});
  await prisma.paymentIntent.deleteMany().catch(() => {});
  await prisma.paymentGatewayEvent.deleteMany().catch(() => {});
  await prisma.paymentGatewayConfig.deleteMany().catch(() => {});
  await prisma.paymeTransaction.deleteMany().catch(() => {});
  await prisma.clickTransaction.deleteMany().catch(() => {});
  await prisma.payment.deleteMany().catch(() => {});
  await prisma.refund.deleteMany().catch(() => {});
  await prisma.expense.deleteMany().catch(() => {});
  await prisma.contract.deleteMany().catch(() => {});
  await prisma.smsMessage.deleteMany().catch(() => {});
  await prisma.pushSubscription.deleteMany().catch(() => {});
  await prisma.notification.deleteMany().catch(() => {});
  await prisma.commentAssignee.deleteMany().catch(() => {});
  await prisma.comment.deleteMany().catch(() => {});
  await prisma.entityHistory.deleteMany().catch(() => {});
  await prisma.statusHistory.deleteMany().catch(() => {});
  await prisma.aiChatMessage.deleteMany().catch(() => {});
  await prisma.aiConversation.deleteMany().catch(() => {});
  // attendance must come before lessonCancellation (FK on attendance.cancellationId)
  await prisma.attendance.deleteMany().catch(() => {});
  await prisma.lessonCancellation.deleteMany().catch(() => {});
  await prisma.enrollmentStateLog.deleteMany().catch(() => {});
  // enrollment references StudentExitReason / EnrollmentTransferReason — delete it first
  await prisma.enrollment.deleteMany().catch(() => {});
  await prisma.groupTeacherHistory.deleteMany().catch(() => {});
  await prisma.groupTeacher.deleteMany().catch(() => {});
  await prisma.studentExitReason.deleteMany().catch(() => {});
  await prisma.enrollmentTransferReason.deleteMany().catch(() => {});
  await prisma.groupTeacherChangeReason.deleteMany().catch(() => {});
  await prisma.studentBranch.deleteMany().catch(() => {});
  await prisma.coursePriceSnapshot.deleteMany().catch(() => {});
  await prisma.groupScheduleSnapshot.deleteMany().catch(() => {});
  await prisma.roomCapacitySnapshot.deleteMany().catch(() => {});
  await prisma.lead.deleteMany().catch(() => {});
  await prisma.group.deleteMany().catch(() => {});
  await prisma.room.deleteMany().catch(() => {});
  await prisma.userBranch.deleteMany().catch(() => {});
  await prisma.userRole.deleteMany().catch(() => {});
  await prisma.student.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
  await prisma.branch.deleteMany().catch(() => {});
  await prisma.course.deleteMany().catch(() => {});
  await prisma.holiday.deleteMany().catch(() => {});
  await prisma.role.deleteMany().catch(() => {});
  await prisma.company.deleteMany().catch(() => {});
}

// ============================================================================
// ROLES
// ============================================================================

async function seedRoles() {
  const roles = [
    { id: 1, name: 'CEO' },
    { id: 2, name: 'Branch Director' },
    { id: 3, name: 'Administrator' },
    { id: 4, name: 'Teacher' },
    { id: 5, name: 'Cashier' },
    { id: 6, name: 'Student' },
  ];
  for (const r of roles) await prisma.role.create({ data: r });
}

// ============================================================================
// COURSES
// ============================================================================

interface CourseRow {
  id: string;
  name: string;
  price: number;
  lessonPaymentCount: number;
  isIntensiv: boolean;
}

async function seedCourses(): Promise<CourseRow[]> {
  const data = [
    { id: 'course-standart-a1', name: 'Standart Deutsch A1', price: 400_000, lessonPaymentCount: 12, isIntensiv: false },
    { id: 'course-standart-a2', name: 'Standart Deutsch A2', price: 450_000, lessonPaymentCount: 12, isIntensiv: false },
    { id: 'course-intensiv-a1', name: 'Intensiv Deutsch A1', price: 690_000, lessonPaymentCount: 20, isIntensiv: true },
    { id: 'course-intensiv-a2', name: 'Intensiv Deutsch A2', price: 750_000, lessonPaymentCount: 20, isIntensiv: true },
    { id: 'course-goethe', name: 'Goethe sertifikat tayyorgarlik', price: 800_000, lessonPaymentCount: 20, isIntensiv: true },
  ];
  for (const c of data) {
    await prisma.course.create({
      data: {
        id: c.id,
        name: c.name,
        price: c.price,
        lessonPaymentCount: c.lessonPaymentCount,
        courseDuration: c.isIntensiv ? 3 : 4,
        lessonDuration: c.isIntensiv ? 90 : 60,
        lessonMinutes: c.isIntensiv ? 90 : 60,
        branchId: null,
        companyId: COMPANY_ID,
      },
    });
  }
  return data;
}

// ============================================================================
// BRANCH
// ============================================================================

interface BranchSummary {
  branchId: number;
  branchName: string;
  bd: { id: number; login: string };
  admin: { id: number; login: string };
  cashier: { id: number; login: string };
  teachers: Array<{ id: number; login: string; firstName: string; lastName: string }>;
  rooms: string[];
  groups: Array<{
    id: string;
    name: string;
    courseId: string;
    perLessonCost: number;
    teacherIds: number[];
    studentIds: number[];
  }>;
  studentIds: number[];
}

async function seedBranch(
  spec: typeof BRANCHES[number],
  hashedPassword: string,
  courses: CourseRow[],
): Promise<BranchSummary> {
  console.log(`\n🏢 ${spec.name} ...`);

  // Branch
  const branch = await prisma.branch.create({
    data: {
      id: spec.id,
      name: spec.name,
      address: spec.address,
      phone: spec.phone,
      companyId: COMPANY_ID,
      startOfWorkingDay: '08:00',
      endOfWorkingDay: '20:00',
    },
  });

  // Rooms
  const rooms: string[] = [];
  for (let i = 1; i <= spec.roomCount; i++) {
    const room = await prisma.room.create({
      data: {
        id: `room-b${spec.id}-${i}`,
        name: `${i}-xona`,
        capacity: 15,
        branchId: branch.id,
        companyId: COMPANY_ID,
      },
    });
    rooms.push(room.id);
  }

  // Branch Director
  const bd = await prisma.user.create({
    data: {
      firstName: `BD${spec.id}`,
      lastName: `${spec.name.split(' ')[0]}`,
      login: `bd${spec.id}`,
      password: hashedPassword,
      gender: 'MALE',
      phone: randomPhone('91'),
      companyId: COMPANY_ID,
      mainBranch: branch.id,
      roles: { create: [{ roleId: 2 }] },
      branches: { create: [{ branchId: branch.id }] },
    },
  });

  // Administrator
  const admin = await prisma.user.create({
    data: {
      firstName: `Admin${spec.id}`,
      lastName: `${spec.name.split(' ')[0]}`,
      login: `admin${spec.id}`,
      password: hashedPassword,
      gender: 'FEMALE',
      phone: randomPhone('93'),
      companyId: COMPANY_ID,
      mainBranch: branch.id,
      roles: { create: [{ roleId: 3 }] },
      branches: { create: [{ branchId: branch.id }] },
    },
  });

  // Cashier
  const cashier = await prisma.user.create({
    data: {
      firstName: `Kassir${spec.id}`,
      lastName: `${spec.name.split(' ')[0]}`,
      login: `kassir${spec.id}`,
      password: hashedPassword,
      gender: 'FEMALE',
      phone: randomPhone('95'),
      companyId: COMPANY_ID,
      mainBranch: branch.id,
      roles: { create: [{ roleId: 5 }] },
      branches: { create: [{ branchId: branch.id }] },
    },
  });

  // Teachers
  const teachers: BranchSummary['teachers'] = [];
  for (let i = 0; i < spec.teacherCount; i++) {
    const gender: 'MALE' | 'FEMALE' = i % 2 === 0 ? 'MALE' : 'FEMALE';
    const { first, last } = fakeName(gender, i + spec.id * 100);
    const login = `t${spec.id}_${first.toLowerCase()}${i + 1}`;
    const t = await prisma.user.create({
      data: {
        firstName: first,
        lastName: last,
        login,
        password: hashedPassword,
        gender,
        phone: randomPhone('99'),
        companyId: COMPANY_ID,
        mainBranch: branch.id,
        roles: { create: [{ roleId: 4 }] },
        branches: { create: [{ branchId: branch.id }] },
      },
    });
    teachers.push({ id: t.id, login, firstName: first, lastName: last });
  }
  console.log(`  ✓ ${teachers.length} ustoz, BD, Admin, Kassir, ${rooms.length} xona`);

  // Salary config (global PERCENTAGE 30 for each teacher) + initial version row
  const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
  for (const t of teachers) {
    const cfg = await prisma.employeeSalaryConfig.create({
      data: {
        userId: t.id,
        groupId: null,
        salaryType: SalaryType.PERCENTAGE,
        value: 30,
        companyId: COMPANY_ID,
      },
    });
    await prisma.employeeSalaryConfigVersion.create({
      data: {
        configId: cfg.id,
        salaryType: SalaryType.PERCENTAGE,
        value: 30,
        effectiveFrom,
        effectiveTo: null,
        companyId: COMPANY_ID,
      },
    });
  }

  // Groups
  const groups: BranchSummary['groups'] = [];
  for (let i = 0; i < spec.groupCount; i++) {
    const course = courses[i % courses.length];
    const days = i % 2 === 0 ? ODD_DAYS : EVEN_DAYS;
    const slot = TIME_SLOTS[i % TIME_SLOTS.length];
    const teacher = teachers[i % teachers.length];
    const room = rooms[i % rooms.length];
    const id = `group-b${spec.id}-${i + 1}`;
    const name = `${spec.name.split(' ')[0].slice(0, 3).toUpperCase()}-${100 + i + 1}`;
    const group = await prisma.group.create({
      data: {
        id,
        name,
        groupNumber: i + 1,
        level: course.name.includes('A1') ? 'A1' : course.name.includes('A2') ? 'A2' : 'B1',
        courseId: course.id,
        branchId: branch.id,
        roomId: room,
        companyId: COMPANY_ID,
        days: i % 2 === 0 ? 'odd' : 'even',
        exactDays: days,
        lessonStartTime: slot.start,
        lessonEndTime: course.isIntensiv ? slot.endIntensiv : slot.endStandart,
        lessonMinutes: course.isIntensiv ? 90 : 60,
        statusEnum: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    await prisma.groupTeacher.create({
      data: { groupId: group.id, teacherId: teacher.id },
    });
    groups.push({
      id: group.id,
      name: group.name,
      courseId: course.id,
      perLessonCost: Math.round(course.price / course.lessonPaymentCount),
      teacherIds: [teacher.id],
      studentIds: [],
    });
  }
  console.log(`  ✓ ${groups.length} guruh`);

  // Students — batch create (createMany doesn't support nested, so we do
  // a single insertMany via Prisma's batched arrays)
  const students = await seedStudents(branch.id, spec.studentCount);
  console.log(`  ✓ ${students.length} o'quvchi`);

  // Enrollments — distribute ~70% across groups, ~10% frozen, 5% dropped, 15% un-enrolled
  await assignStudentsToGroups(students, groups);
  console.log(`  ✓ Enrollment'lar taqsimlandi`);

  return {
    branchId: branch.id,
    branchName: branch.name,
    bd: { id: bd.id, login: 'bd' + spec.id },
    admin: { id: admin.id, login: 'admin' + spec.id },
    cashier: { id: cashier.id, login: 'kassir' + spec.id },
    teachers,
    rooms,
    groups,
    studentIds: students.map((s) => s.id),
  };
}

// ============================================================================
// STUDENTS
// ============================================================================

async function seedStudents(branchId: number, count: number) {
  // Use createMany for raw bulk insert. Then read back IDs.
  const data: Prisma.StudentCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    const gender: 'MALE' | 'FEMALE' = Math.random() < 0.55 ? 'MALE' : 'FEMALE';
    const { first, last } = fakeName(gender, i + branchId * 1000);
    data.push({
      firstName: first,
      lastName: last,
      phone: randomPhone('90'),
      gender,
      companyId: COMPANY_ID,
      status: 'ACTIVE',
      isActive: true,
    });
  }
  await prisma.student.createMany({ data });
  // Fetch the freshly-created rows for this branch's batch.
  // We can't filter by branchId yet (no StudentBranch row), so we fetch
  // the most recent N rows by createdAt.
  const fresh = await prisma.student.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { id: 'desc' },
    take: count,
    select: { id: true, firstName: true, lastName: true },
  });
  // Wire to branch
  await prisma.studentBranch.createMany({
    data: fresh.map((s) => ({ studentId: s.id, branchId })),
  });
  return fresh;
}

// ============================================================================
// ENROLLMENTS
// ============================================================================

async function assignStudentsToGroups(
  students: Array<{ id: number; firstName: string; lastName: string }>,
  groups: BranchSummary['groups'],
) {
  // Distribution:
  //   70% → ACTIVE in some group
  //   10% → FROZEN (had been active, now paused)
  //    5% → DROPPED (left)
  //   15% → un-enrolled (registered but not yet in a group)
  const enrollmentRows: Prisma.EnrollmentCreateManyInput[] = [];
  let groupCursor = 0;
  for (let i = 0; i < students.length; i++) {
    const r = Math.random();
    if (r < 0.15) continue; // un-enrolled
    const status: EnrollmentStatus =
      r < 0.20 ? 'FROZEN' : r < 0.25 ? 'DROPPED' : 'ACTIVE';
    const group = groups[groupCursor % groups.length];
    groupCursor++;
    enrollmentRows.push({
      studentId: students[i].id,
      groupId: group.id,
      status,
      // ACTIVE rows get a small starting prepaid (simulates already paid for
      // a current cycle). 0 for FROZEN/DROPPED.
      prepaidLessonsRemaining:
        status === 'ACTIVE' && Math.random() < 0.4 ? Math.floor(Math.random() * 6) + 1 : 0,
    });
    if (status === 'ACTIVE') group.studentIds.push(students[i].id);
  }
  await prisma.enrollment.createMany({ data: enrollmentRows });
}

// ============================================================================
// FINANCIAL ACTIVITY (mock)
// ============================================================================

async function seedFinancialActivity(branchSummaries: BranchSummary[]) {
  // Assign INITIAL_BALANCE to a sample of students, and a few PAYMENTs.
  // Keep it bounded so the seed runs in seconds, not minutes.
  for (const branch of branchSummaries) {
    // 30 random students get an initial balance row
    const sample = branch.studentIds
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 30);

    for (const studentId of sample) {
      const amount = (Math.floor(Math.random() * 5) + 1) * 100_000; // 100k–500k
      // Read student balance
      const s = await prisma.student.findUnique({
        where: { id: studentId },
        select: { balance: true },
      });
      const before = s?.balance ?? 0;
      const after = before + amount;
      await prisma.transaction.create({
        data: {
          type: TransactionType.INITIAL_BALANCE,
          amount,
          balanceBefore: before,
          balanceAfter: after,
          studentId,
          branchId: branch.branchId,
          companyId: COMPANY_ID,
          description: 'Eski tizimdan o`tkazildi',
        },
      });
      await prisma.student.update({
        where: { id: studentId },
        data: { balance: after },
      });
    }

    // Another 20 random students made a manual PAYMENT recently
    const payers = branch.studentIds
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 20);

    for (const studentId of payers) {
      const amount = (Math.floor(Math.random() * 8) + 2) * 100_000; // 200k–900k
      const payment = await prisma.payment.create({
        data: {
          studentId,
          amount,
          method: pickRandom(['CASH', 'PAYME', 'CLICK', 'TRANSFER']),
          status: 'COMPLETED',
          source: 'ADMIN_MANUAL',
          companyId: COMPANY_ID,
          branchId: branch.branchId,
        },
      });
      const s = await prisma.student.findUnique({
        where: { id: studentId },
        select: { balance: true },
      });
      const before = s?.balance ?? 0;
      const after = before + amount;
      await prisma.transaction.create({
        data: {
          type: TransactionType.PAYMENT,
          amount,
          balanceBefore: before,
          balanceAfter: after,
          studentId,
          paymentId: payment.id,
          branchId: branch.branchId,
          companyId: COMPANY_ID,
          description: "To'lov qabul qilindi",
        },
      });
      await prisma.student.update({
        where: { id: studentId },
        data: { balance: after },
      });
    }
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(
  ceo: { id: number },
  branches: BranchSummary[],
) {
  console.log('\n' + '='.repeat(70));
  console.log('✅ DEV SEED COMPLETE');
  console.log('='.repeat(70));
  console.log("\nLogin ma'lumotlari (parol: 123456):\n");
  console.log(`  CEO:   login=ceo  (id ${ceo.id})\n`);
  for (const b of branches) {
    console.log(`  ${b.branchName}:`);
    console.log(`    BD:      login=${b.bd.login}  (id ${b.bd.id})`);
    console.log(`    Admin:   login=${b.admin.login}  (id ${b.admin.id})`);
    console.log(`    Kassir:  login=${b.cashier.login}  (id ${b.cashier.id})`);
    console.log(`    Ustozlar (${b.teachers.length}):`);
    for (const t of b.teachers) {
      console.log(
        `      ${t.firstName} ${t.lastName}  →  login=${t.login}  (id ${t.id})`,
      );
    }
    console.log(`    Guruhlar:   ${b.groups.length}`);
    console.log(`    O'quvchilar: ${b.studentIds.length}`);
    console.log('');
  }
  console.log('='.repeat(70));
}

// ============================================================================

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
