import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const R2_BUCKET = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC = process.env.R2_PUBLIC_URL!;

async function uploadPhoto(filePath: string): Promise<string> {
  const ext = path.extname(filePath);
  const key = `photos/${randomUUID()}${ext}`;
  const body = fs.readFileSync(filePath);
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: mime,
    }),
  );

  return `${R2_PUBLIC}/${key}`;
}

const COMPANY_ID = 1001;
const BRANCH_ID = 1;
const TEACHER_ROLE_ID = 4;

const teachers = [
  { firstName: 'Jamsher', lastName: 'Murtazoxonov', gender: 'MALE' as const, photo: 'herr-jamsher.png', phone: '901001001' },
  { firstName: 'Eldor', lastName: 'Xaydaraliyev', gender: 'MALE' as const, photo: 'herr-eldor.png', phone: '901001002' },
  { firstName: 'Ulug\'bek', lastName: 'Ahmadjonov', gender: 'MALE' as const, photo: 'herr-ulugbek.png', phone: '901001003' },
  { firstName: 'Feruza', lastName: 'Mamazulinova', gender: 'FEMALE' as const, photo: 'frau-feruza.png', phone: '901001004' },
  { firstName: 'Iroda', lastName: 'Qurbonova', gender: 'FEMALE' as const, photo: 'frau-iroda.png', phone: '901001005' },
  { firstName: 'Saida', lastName: 'Mustafoyeva', gender: 'FEMALE' as const, photo: 'frau-saida.png', phone: '901001006' },
  { firstName: 'Musinjon', lastName: 'Umarov', gender: 'MALE' as const, photo: 'herr-musinjon.png', phone: '901001007' },
  { firstName: 'Dostonjon', lastName: 'Ruzimatov', gender: 'MALE' as const, photo: 'herr-doston.jpg', phone: '901001008' },
  { firstName: 'Sakina', lastName: 'Nomozova', gender: 'FEMALE' as const, photo: 'frau-sakina.jpg', phone: '901001009' },
  { firstName: 'Yoqutxon', lastName: 'Rustamova', gender: 'FEMALE' as const, photo: 'frau-yoqutxon.png', phone: '901001010' },
];

const rooms = [
  { name: '1-xona', capacity: 20 },
  { name: '2-xona', capacity: 18 },
  { name: '3-xona', capacity: 22 },
  { name: '4-xona', capacity: 16 },
  { name: '5-xona', capacity: 20 },
  { name: '6-xona', capacity: 15 },
];

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

  // 3. CEO
  const hashedPassword = await bcrypt.hash('123456', 10);
  const ceo = await prisma.user.create({
    data: {
      firstName: 'CEO',
      lastName: 'Admin',
      login: 'ceo',
      password: hashedPassword,
      companyId: company.id,
      mainBranch: BRANCH_ID,
      roles: { create: [{ roleId: 1 }] },
    },
  });
  console.log(`CEO: login=ceo, parol=123456 (id: ${ceo.id})`);

  // 4. Branch — Farg'ona
  await prisma.branch.create({
    data: {
      id: BRANCH_ID,
      name: "Farg'ona filiali",
      address: "Farg'ona shahri, Mustaqillik ko'chasi 15",
      phone: '732001234',
      companyId: COMPANY_ID,
      startOfWorkingDay: '08:00',
      endOfWorkingDay: '20:00',
    },
  });

  // CEO ni branchga biriktirish
  await prisma.userBranch.create({
    data: { userId: ceo.id, branchId: BRANCH_ID },
  });
  console.log("Branch: Farg'ona filiali (id: 1)");

  // 5. Xonalar
  const createdRooms: { id: string; name: string }[] = [];
  for (const room of rooms) {
    const r = await prisma.room.create({
      data: {
        name: room.name,
        capacity: room.capacity,
        branchId: BRANCH_ID,
        companyId: COMPANY_ID,
      },
    });
    createdRooms.push({ id: r.id, name: r.name });
  }
  console.log(`Xonalar: ${createdRooms.map((r) => r.name).join(', ')}`);

  // 6. Kurslar
  const standartCourse = await prisma.course.create({
    data: {
      name: 'Standart kurs',
      description: 'Haftasiga 3 kun, 6 oylik nemis tili kursi',
      price: 400000,
      courseDuration: 6,
      lessonDuration: 2,
      lessonMinutes: 90,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
    },
  });

  const intensiveCourse = await prisma.course.create({
    data: {
      name: 'Intensiv kurs',
      description: 'Haftasiga 5 kun, 6 oylik intensiv nemis tili kursi',
      price: 700000,
      courseDuration: 6,
      lessonDuration: 2,
      lessonMinutes: 90,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
    },
  });
  console.log(`Kurslar: Standart (400,000), Intensiv (700,000)`);

  // 7. O'qituvchilar — rasmlarni R2 ga yuklash
  const photosDir = path.resolve(__dirname, '../../teachers');
  const createdTeachers: { id: number; name: string }[] = [];

  for (const t of teachers) {
    const photoPath = path.join(photosDir, t.photo);
    let photoUrl: string | undefined;

    if (fs.existsSync(photoPath)) {
      photoUrl = await uploadPhoto(photoPath);
      console.log(`  Rasm yuklandi: ${t.firstName} ${t.lastName}`);
    } else {
      console.log(`  Rasm topilmadi: ${photoPath}`);
    }

    const teacherPassword = await bcrypt.hash('teacher123', 10);
    const login = `${t.firstName.toLowerCase().replace(/'/g, '')}_${t.lastName.toLowerCase().replace(/'/g, '')}`.slice(0, 20);

    const user = await prisma.user.create({
      data: {
        firstName: t.firstName,
        lastName: t.lastName,
        phone: t.phone,
        photo: photoUrl,
        gender: t.gender,
        login,
        password: teacherPassword,
        companyId: COMPANY_ID,
        mainBranch: BRANCH_ID,
        roles: { create: [{ roleId: TEACHER_ROLE_ID }] },
        branches: { create: [{ branchId: BRANCH_ID }] },
      },
    });
    createdTeachers.push({ id: user.id, name: `${user.firstName} ${user.lastName}` });
  }
  console.log(`O'qituvchilar: ${createdTeachers.length} ta yaratildi`);

  // 8. Guruhlar — har bir ustozga 4-5 ta guruh
  // Vaqt slotlari
  const timeSlots = [
    { start: '08:00', end: '09:30' },
    { start: '10:00', end: '11:30' },
    { start: '14:00', end: '15:30' },
    { start: '16:00', end: '17:30' },
    { start: '18:00', end: '19:30' },
  ];

  const oddDays = ['monday', 'wednesday', 'friday'];
  const evenDays = ['tuesday', 'thursday', 'saturday'];
  const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  // Level counter — auto-naming uchun: A1-001, A1-002, ...
  const levelCounter: Record<string, number> = {};
  function nextGroupName(level: string) {
    levelCounter[level] = (levelCounter[level] ?? 0) + 1;
    return `${level}-${String(levelCounter[level]).padStart(3, '0')}`;
  }

  // Har bir ustozga 4-5 ta guruh (standart + intensiv aralash)
  const groupConfigs = [
    // Ustoz 0 — Jamsher (5 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 0, roomIdx: 0, days: 'odd', exactDays: oddDays, time: 0 },
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 0, roomIdx: 0, days: 'even', exactDays: evenDays, time: 1 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 0, roomIdx: 0, days: 'odd', exactDays: oddDays, time: 2 },
    { level: 'A1', courseId: intensiveCourse.id, teacherIdx: 0, roomIdx: 0, days: 'odd', exactDays: weekDays, time: 3 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 0, roomIdx: 0, days: 'even', exactDays: evenDays, time: 4 },

    // Ustoz 1 — Eldor (5 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 1, roomIdx: 1, days: 'odd', exactDays: oddDays, time: 0 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 1, roomIdx: 1, days: 'even', exactDays: evenDays, time: 1 },
    { level: 'A2', courseId: intensiveCourse.id, teacherIdx: 1, roomIdx: 1, days: 'odd', exactDays: weekDays, time: 2 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 1, roomIdx: 1, days: 'odd', exactDays: oddDays, time: 3 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 1, roomIdx: 1, days: 'even', exactDays: evenDays, time: 4 },

    // Ustoz 2 — Ulug'bek (4 guruh)
    { level: 'A1', courseId: intensiveCourse.id, teacherIdx: 2, roomIdx: 2, days: 'odd', exactDays: weekDays, time: 0 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 2, roomIdx: 2, days: 'even', exactDays: evenDays, time: 1 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 2, roomIdx: 2, days: 'odd', exactDays: oddDays, time: 2 },
    { level: 'B1', courseId: intensiveCourse.id, teacherIdx: 2, roomIdx: 2, days: 'odd', exactDays: weekDays, time: 3 },

    // Ustoz 3 — Feruza (5 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 3, roomIdx: 3, days: 'even', exactDays: evenDays, time: 0 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 3, roomIdx: 3, days: 'odd', exactDays: oddDays, time: 1 },
    { level: 'A2', courseId: intensiveCourse.id, teacherIdx: 3, roomIdx: 3, days: 'odd', exactDays: weekDays, time: 2 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 3, roomIdx: 3, days: 'even', exactDays: evenDays, time: 3 },
    { level: 'B2', courseId: intensiveCourse.id, teacherIdx: 3, roomIdx: 3, days: 'odd', exactDays: weekDays, time: 4 },

    // Ustoz 4 — Iroda (4 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 4, roomIdx: 4, days: 'odd', exactDays: oddDays, time: 0 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 4, roomIdx: 4, days: 'even', exactDays: evenDays, time: 1 },
    { level: 'B1', courseId: intensiveCourse.id, teacherIdx: 4, roomIdx: 4, days: 'odd', exactDays: weekDays, time: 2 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 4, roomIdx: 4, days: 'odd', exactDays: oddDays, time: 3 },

    // Ustoz 5 — Saida (5 guruh)
    { level: 'A1', courseId: intensiveCourse.id, teacherIdx: 5, roomIdx: 5, days: 'odd', exactDays: weekDays, time: 0 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 5, roomIdx: 5, days: 'odd', exactDays: oddDays, time: 1 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 5, roomIdx: 5, days: 'even', exactDays: evenDays, time: 2 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 5, roomIdx: 5, days: 'odd', exactDays: oddDays, time: 3 },
    { level: 'C1', courseId: standartCourse.id, teacherIdx: 5, roomIdx: 5, days: 'even', exactDays: evenDays, time: 4 },

    // Ustoz 6 — Musinjon (4 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 6, roomIdx: 0, days: 'even', exactDays: evenDays, time: 0 },
    { level: 'A2', courseId: intensiveCourse.id, teacherIdx: 6, roomIdx: 1, days: 'odd', exactDays: weekDays, time: 1 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 6, roomIdx: 2, days: 'odd', exactDays: oddDays, time: 2 },
    { level: 'C1', courseId: standartCourse.id, teacherIdx: 6, roomIdx: 3, days: 'even', exactDays: evenDays, time: 3 },

    // Ustoz 7 — Dostonjon (5 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 7, roomIdx: 4, days: 'odd', exactDays: oddDays, time: 0 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 7, roomIdx: 5, days: 'even', exactDays: evenDays, time: 1 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 7, roomIdx: 4, days: 'odd', exactDays: oddDays, time: 2 },
    { level: 'B2', courseId: intensiveCourse.id, teacherIdx: 7, roomIdx: 5, days: 'odd', exactDays: weekDays, time: 3 },
    { level: 'C1', courseId: intensiveCourse.id, teacherIdx: 7, roomIdx: 4, days: 'odd', exactDays: weekDays, time: 4 },

    // Ustoz 8 — Sakina (4 guruh)
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 8, roomIdx: 0, days: 'odd', exactDays: oddDays, time: 0 },
    { level: 'B1', courseId: standartCourse.id, teacherIdx: 8, roomIdx: 1, days: 'even', exactDays: evenDays, time: 1 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 8, roomIdx: 2, days: 'odd', exactDays: oddDays, time: 2 },
    { level: 'C1', courseId: standartCourse.id, teacherIdx: 8, roomIdx: 3, days: 'even', exactDays: evenDays, time: 3 },

    // Ustoz 9 — Yoqutxon (4 guruh)
    { level: 'A1', courseId: standartCourse.id, teacherIdx: 9, roomIdx: 4, days: 'even', exactDays: evenDays, time: 0 },
    { level: 'A2', courseId: standartCourse.id, teacherIdx: 9, roomIdx: 5, days: 'odd', exactDays: oddDays, time: 1 },
    { level: 'B1', courseId: intensiveCourse.id, teacherIdx: 9, roomIdx: 4, days: 'odd', exactDays: weekDays, time: 2 },
    { level: 'B2', courseId: standartCourse.id, teacherIdx: 9, roomIdx: 5, days: 'even', exactDays: evenDays, time: 3 },
  ];

  for (const g of groupConfigs) {
    const slot = timeSlots[g.time];
    await prisma.group.create({
      data: {
        name: nextGroupName(g.level),
        groupNumber: levelCounter[g.level],
        courseId: g.courseId,
        branchId: BRANCH_ID,
        companyId: COMPANY_ID,
        roomId: createdRooms[g.roomIdx].id,
        days: g.days,
        exactDays: g.exactDays,
        lessonStartTime: slot.start,
        lessonEndTime: slot.end,
        status: 2,
        statusEnum: 'ACTIVE',
        startDate: new Date('2026-04-01'),
        teachers: {
          create: [{ teacherId: createdTeachers[g.teacherIdx].id }],
        },
      },
    });
  }
  console.log(`Guruhlar: ${groupConfigs.length} ta yaratildi`);

  // Sequence larni to'g'rilash (minimum 10000 — 5 xonali ID)
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), GREATEST((SELECT MAX(id) FROM "User"), 9999))`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Student"', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "Student"), 0), 9999))`,
  );

  console.log('\nTayyor! CEO login bilan kiring: login=ceo, parol=123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
