import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const COMPANY_ID = 1001;
const BRANCH_ID = 1;

async function main() {
  // 0. Bazani tozalash
  console.log('Bazani tozalash...');
  await prisma.smsMessage.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.commentAssignee.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.entityHistory.deleteMany();
  await prisma.statusHistory.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.groupTeacher.deleteMany();
  await prisma.studentBranch.deleteMany();
  await prisma.group.deleteMany();
  await prisma.room.deleteMany();
  await prisma.userBranch.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.student.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.course.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.role.deleteMany();
  await prisma.company.deleteMany();
  console.log('Baza tozalandi\n');

  // 1. Rollar
  const roles = [
    { id: 1, name: 'CEO' },
    { id: 2, name: 'Branch Director' },
    { id: 3, name: 'Administrator' },
    { id: 4, name: 'Teacher' },
    { id: 5, name: 'Cashier' },
    { id: 6, name: 'Student' },
  ];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {},
      create: role,
    });
  }
  console.log('Rollar yaratildi');

  // 2. Company
  const company = await prisma.company.create({
    data: { id: COMPANY_ID, name: 'DaF Sprachzentrum' },
  });
  console.log('Company:', company.name);

  // 3. Farg'ona filiali
  await prisma.branch.create({
    data: {
      id: BRANCH_ID,
      name: "Farg'ona filiali",
      address: "Farg'ona sh., Mustaqillik ko'chasi 15",
      phone: '912345678',
      companyId: COMPANY_ID,
      startOfWorkingDay: '08:00',
      endOfWorkingDay: '18:00',
    },
  });
  console.log("Filial: Farg'ona filiali");

  // 4. Xonalar (6 ta)
  const roomIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const room = await prisma.room.create({
      data: {
        id: `room-${i}`,
        name: `${i}-xona`,
        capacity: 15,
        branchId: BRANCH_ID,
        companyId: COMPANY_ID,
      },
    });
    roomIds.push(room.id);
  }
  console.log('Xonalar: 1-xona ... 6-xona');

  // 5. Kurslar
  const courseIntensiv = await prisma.course.create({
    data: {
      id: 'course-intensiv',
      name: 'Intensiv Deutsch',
      description: 'Kundalik intensiv nemis tili kursi',
      price: 800000,
      courseDuration: 3,
      lessonDuration: 90,
      lessonMinutes: 90,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
    },
  });
  const courseStandart = await prisma.course.create({
    data: {
      id: 'course-standart',
      name: 'Standart Deutsch',
      description: 'Standart nemis tili kursi',
      price: 500000,
      courseDuration: 4,
      lessonDuration: 60,
      lessonMinutes: 60,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
    },
  });
  console.log('Kurslar: Intensiv Deutsch, Standart Deutsch');

  // 6. CEO
  const hashedPassword = await bcrypt.hash('123456', 10);

  const ceo = await prisma.user.create({
    data: {
      firstName: 'CEO',
      lastName: 'Admin',
      login: 'ceo',
      password: hashedPassword,
      companyId: COMPANY_ID,
      roles: { create: [{ roleId: 1 }] },
      branches: { create: [{ branchId: BRANCH_ID }] },
    },
  });
  console.log(`CEO: login=ceo, parol=123456 (id: ${ceo.id})`);

  // 7. Administrator
  const admin = await prisma.user.create({
    data: {
      firstName: 'Sardor',
      lastName: 'Nurmatov',
      phone: '901001010',
      gender: 'MALE',
      login: 'admin',
      password: hashedPassword,
      companyId: COMPANY_ID,
      mainBranch: BRANCH_ID,
      roles: { create: [{ roleId: 3 }] },
      branches: { create: [{ branchId: BRANCH_ID }] },
    },
  });
  console.log(`Admin: login=admin, parol=123456 (id: ${admin.id})`);

  // 8. Ustozlar (5 ta)
  const teachersData = [
    { firstName: 'Aziz', lastName: 'Karimov', login: 'aziz', phone: '901112233' },
    { firstName: 'Dilnoza', lastName: 'Rahimova', login: 'dilnoza', phone: '902223344', gender: 'FEMALE' as const },
    { firstName: 'Jasur', lastName: 'Toshmatov', login: 'jasur', phone: '903334455' },
    { firstName: 'Madina', lastName: 'Usmonova', login: 'madina', phone: '904445566', gender: 'FEMALE' as const },
    { firstName: 'Bekzod', lastName: 'Aliyev', login: 'bekzod', phone: '905556677' },
  ];

  const teachers: { id: number; firstName: string; lastName: string; login: string }[] = [];
  for (const t of teachersData) {
    const teacher = await prisma.user.create({
      data: {
        firstName: t.firstName,
        lastName: t.lastName,
        phone: t.phone,
        gender: t.gender ?? 'MALE',
        login: t.login,
        password: hashedPassword,
        companyId: COMPANY_ID,
        mainBranch: BRANCH_ID,
        roles: { create: [{ roleId: 4 }] },
        branches: { create: [{ branchId: BRANCH_ID }] },
      },
    });
    teachers.push({ id: teacher.id, firstName: t.firstName, lastName: t.lastName, login: t.login });
  }
  console.log('\nUstozlar:');
  teachers.forEach((t) => console.log(`  ${t.firstName} ${t.lastName}: login=${t.login}, parol=123456 (id: ${t.id})`));

  // 9. Guruhlar (8 ta — har bir ustoz kamida 1 ta, bugun va ertaga darslari bor)
  // Bugun: 2026-04-03 (friday) → toq kunlar (odd: mon/wed/fri)
  // Ertaga: 2026-04-04 (saturday) → juft kunlar (even: tue/thu/sat)
  const ODD_DAYS = ['monday', 'wednesday', 'friday'];
  const EVEN_DAYS = ['tuesday', 'thursday', 'saturday'];

  const groupsData = [
    // Aziz — 2 guruh (intensiv toq + standart juft)
    { id: 'group-1', name: 'DE-101', courseId: courseIntensiv.id, roomId: roomIds[0], teacherId: teachers[0].id, days: ODD_DAYS, start: '08:00', end: '09:30' },
    { id: 'group-2', name: 'DE-102', courseId: courseStandart.id, roomId: roomIds[1], teacherId: teachers[0].id, days: EVEN_DAYS, start: '08:00', end: '09:00' },
    // Dilnoza — 2 guruh (standart toq + intensiv juft)
    { id: 'group-3', name: 'DE-103', courseId: courseStandart.id, roomId: roomIds[0], teacherId: teachers[1].id, days: ODD_DAYS, start: '10:00', end: '11:00' },
    { id: 'group-4', name: 'DE-104', courseId: courseIntensiv.id, roomId: roomIds[2], teacherId: teachers[1].id, days: EVEN_DAYS, start: '10:00', end: '11:30' },
    // Jasur — 2 guruh (intensiv toq + standart juft)
    { id: 'group-5', name: 'DE-105', courseId: courseIntensiv.id, roomId: roomIds[3], teacherId: teachers[2].id, days: ODD_DAYS, start: '14:00', end: '15:30' },
    { id: 'group-6', name: 'DE-106', courseId: courseStandart.id, roomId: roomIds[4], teacherId: teachers[2].id, days: EVEN_DAYS, start: '14:00', end: '15:00' },
    // Madina — 1 guruh (standart juft)
    { id: 'group-7', name: 'DE-107', courseId: courseStandart.id, roomId: roomIds[1], teacherId: teachers[3].id, days: EVEN_DAYS, start: '10:00', end: '11:00' },
    // Bekzod — 1 guruh (intensiv toq)
    { id: 'group-8', name: 'DE-108', courseId: courseIntensiv.id, roomId: roomIds[5], teacherId: teachers[4].id, days: ODD_DAYS, start: '16:00', end: '17:30' },
  ];

  for (const g of groupsData) {
    await prisma.group.create({
      data: {
        id: g.id,
        name: g.name,
        courseId: g.courseId,
        branchId: BRANCH_ID,
        roomId: g.roomId,
        companyId: COMPANY_ID,
        exactDays: g.days,
        days: g.days === ODD_DAYS ? 'odd' : 'even',
        lessonStartTime: g.start,
        lessonEndTime: g.end,
        statusEnum: 'ACTIVE',
        startDate: new Date('2026-03-01'),
        teachers: { create: [{ teacherId: g.teacherId }] },
      },
    });
  }
  console.log('\nGuruhlar:');
  groupsData.forEach((g) => {
    const teacher = teachers.find((t) => t.id === g.teacherId);
    const type = g.courseId === courseIntensiv.id ? 'Intensiv' : 'Standart';
    const dayLabel = g.days === ODD_DAYS ? 'Toq (Du/Chor/Ju)' : 'Juft (Se/Pay/Sha)';
    console.log(`  ${g.name} — ${type}, ${dayLabel}, ${g.start}-${g.end}, Ustoz: ${teacher?.firstName}`);
  });

  // 10. Talabalar (15 ta) va enrollment
  const studentsData = [
    { firstName: 'Asilbek', lastName: 'Qodirov', phone: '911001001' },
    { firstName: 'Barno', lastName: 'Sodiqova', phone: '911002002', gender: 'FEMALE' as const },
    { firstName: 'Davron', lastName: 'Xolmatov', phone: '911003003' },
    { firstName: 'Ezoza', lastName: 'Tursunova', phone: '911004004', gender: 'FEMALE' as const },
    { firstName: 'Farrux', lastName: 'Abdullayev', phone: '911005005' },
    { firstName: 'Gulnora', lastName: 'Kamalova', phone: '911006006', gender: 'FEMALE' as const },
    { firstName: 'Husan', lastName: 'Mirzayev', phone: '911007007' },
    { firstName: 'Iroda', lastName: 'Nazarova', phone: '911008008', gender: 'FEMALE' as const },
    { firstName: 'Javohir', lastName: 'Rahmonov', phone: '911009009' },
    { firstName: 'Kamola', lastName: 'Ergasheva', phone: '911010010', gender: 'FEMALE' as const },
    { firstName: 'Laziz', lastName: 'Sobirov', phone: '911011011' },
    { firstName: 'Mohira', lastName: 'Jumayeva', phone: '911012012', gender: 'FEMALE' as const },
    { firstName: 'Nodir', lastName: 'Temirov', phone: '911013013' },
    { firstName: 'Ozoda', lastName: 'Valiyeva', phone: '911014014', gender: 'FEMALE' as const },
    { firstName: 'Pulat', lastName: 'Ismoilov', phone: '911015015' },
  ];

  const studentIds: number[] = [];
  for (const s of studentsData) {
    const student = await prisma.student.create({
      data: {
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        gender: s.gender ?? 'MALE',
        companyId: COMPANY_ID,
        branches: { create: [{ branchId: BRANCH_ID }] },
      },
    });
    studentIds.push(student.id);
  }
  console.log(`\nTalabalar: ${studentIds.length} ta yaratildi (id: ${studentIds[0]}...${studentIds[studentIds.length - 1]})`);

  // Har bir guruhga 3-4 talaba enrollment qilish
  const enrollments = [
    // group-1: 3 talaba
    { groupId: 'group-1', studentIds: [studentIds[0], studentIds[1], studentIds[2]] },
    // group-2: 3 talaba
    { groupId: 'group-2', studentIds: [studentIds[3], studentIds[4], studentIds[5]] },
    // group-3: 3 talaba
    { groupId: 'group-3', studentIds: [studentIds[6], studentIds[7], studentIds[8]] },
    // group-4: 3 talaba
    { groupId: 'group-4', studentIds: [studentIds[9], studentIds[10], studentIds[11]] },
    // group-5: 3 talaba
    { groupId: 'group-5', studentIds: [studentIds[0], studentIds[12], studentIds[13]] },
    // group-6: 3 talaba
    { groupId: 'group-6', studentIds: [studentIds[1], studentIds[14], studentIds[6]] },
    // group-7: 3 talaba
    { groupId: 'group-7', studentIds: [studentIds[2], studentIds[3], studentIds[9]] },
    // group-8: 3 talaba
    { groupId: 'group-8', studentIds: [studentIds[4], studentIds[7], studentIds[11]] },
  ];

  for (const e of enrollments) {
    for (const sId of e.studentIds) {
      await prisma.enrollment.create({
        data: { studentId: sId, groupId: e.groupId },
      });
    }
  }
  console.log('Enrollment: har bir guruhga 3 talaba biriktirildi');

  // Sequence larni to'g'rilash (minimum 10000 — 5 xonali ID)
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), GREATEST((SELECT MAX(id) FROM "User"), 9999))`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Student"', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "Student"), 0), 9999))`,
  );

  console.log('\n✅ Tayyor! Test ma\'lumotlar yaratildi.');
  console.log('\nLogin ma\'lumotlari (parol: 123456):');
  console.log('  CEO:   login=ceo');
  console.log('  Admin: login=admin');
  teachers.forEach((t) => console.log(`  Ustoz: login=${t.login} (${t.firstName} ${t.lastName})`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
