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
  // Finance (FK order: leaf → root)
  await prisma.transaction.deleteMany();
  await prisma.salaryAccrual.deleteMany();
  await prisma.salaryPayment.deleteMany();
  await prisma.employeeSalaryConfig.deleteMany();
  await prisma.paymentGatewayEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.companyTaxConfig.deleteMany();
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
      lessonPaymentCount: 20,
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
      lessonPaymentCount: 12,
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

  // Har bir guruhga 2 ta talaba enrollment qilish (har bir talaba faqat 1 guruhda)
  const enrollments = [
    { groupId: 'group-1', studentIds: [studentIds[0], studentIds[1]] },
    { groupId: 'group-2', studentIds: [studentIds[2], studentIds[3]] },
    { groupId: 'group-3', studentIds: [studentIds[4], studentIds[5]] },
    { groupId: 'group-4', studentIds: [studentIds[6], studentIds[7]] },
    { groupId: 'group-5', studentIds: [studentIds[8], studentIds[9]] },
    { groupId: 'group-6', studentIds: [studentIds[10], studentIds[11]] },
    { groupId: 'group-7', studentIds: [studentIds[12], studentIds[13]] },
    { groupId: 'group-8', studentIds: [studentIds[14]] },
  ];

  // Store enrollment ids + student/group mapping for downstream finance seeding.
  const enrollmentRows: { id: string; studentId: number; groupId: string }[] = [];
  for (const e of enrollments) {
    for (const sId of e.studentIds) {
      const en = await prisma.enrollment.create({
        data: { studentId: sId, groupId: e.groupId },
        select: { id: true, studentId: true, groupId: true },
      });
      enrollmentRows.push(en);
    }
  }
  console.log('Enrollment: har bir guruhga 2 talaba biriktirildi');

  // ============================================================
  // 11. FINANCE MOCK DATA
  // ============================================================
  // Covers: contracts, salary configs, tax config, payments (prepaid),
  // attendance with LESSON_DEDUCTION + SalaryAccruals, expenses (incl.
  // TEACHER_ADVANCE), and one settled March salary payment. Scenarios
  // exercise the audit fixes end-to-end:
  //   * Students 1–10 prepaid → teachers accrue salary
  //   * Students 11–14 unpaid (debtor) → attendance records but no
  //     accrual (prepaid model + coverage guard)
  //   * One COMPLETED refund (student 13 left before cycle half-over)
  //   * TEACHER_ADVANCE for Aziz that will net out of next salary
  //   * Rent + utilities + marketing + advance expenses in the ledger
  //   * March salary run already PAID → period-closed guard demonstrable
  // ============================================================

  console.log('\n--- Finance mock data ---');

  // 11.1 Tax config
  await prisma.companyTaxConfig.create({
    data: {
      companyId: COMPANY_ID,
      salaryTaxRate: 12.0,
      refundTaxRate: 0.0,
      isActive: true,
    },
  });
  console.log('CompanyTaxConfig: 12% ASOT');

  // 11.2 Salary configs
  // Teachers: percentage of per-lesson cost
  // Admin: fixed monthly
  const TEACHER_PERCENTAGE = 30;
  for (const t of teachers) {
    await prisma.employeeSalaryConfig.create({
      data: {
        userId: t.id,
        groupId: null,
        salaryType: 'PERCENTAGE',
        value: TEACHER_PERCENTAGE,
        isActive: true,
        companyId: COMPANY_ID,
      },
    });
  }
  await prisma.employeeSalaryConfig.create({
    data: {
      userId: admin.id,
      groupId: null,
      salaryType: 'FIXED_MONTHLY',
      value: 5_000_000,
      isActive: true,
      companyId: COMPANY_ID,
    },
  });
  console.log(`Salary configs: teachers ${TEACHER_PERCENTAGE}%, admin 5,000,000 so'm/oy`);

  // 11.3 Contracts — one per enrollment, active. Student 13's contract
  // will be reversed into REFUNDED later.
  const contractByEnrollmentId = new Map<string, { id: string; totalAmount: number; lessonPaymentCount: number }>();
  const enrollmentCourseInfo = new Map<string, { price: number; lessonPaymentCount: number }>();
  for (const en of enrollmentRows) {
    const group = groupsData.find((g) => g.id === en.groupId)!;
    const course = group.courseId === courseIntensiv.id ? courseIntensiv : courseStandart;
    enrollmentCourseInfo.set(en.id, { price: course.price, lessonPaymentCount: course.lessonPaymentCount });

    const year = new Date().getFullYear();
    const contractNumber = `DAF-${year}-${String(enrollmentRows.indexOf(en) + 1).padStart(5, '0')}`;
    const contract = await prisma.contract.create({
      data: {
        contractNumber,
        studentId: en.studentId,
        courseId: course.id,
        groupId: en.groupId,
        branchId: BRANCH_ID,
        totalAmount: course.price,
        paidAmount: 0,
        status: 'ACTIVE',
        startDate: new Date('2026-03-01'),
        signedAt: new Date('2026-02-28'),
        companyId: COMPANY_ID,
      },
    });
    contractByEnrollmentId.set(en.id, {
      id: contract.id,
      totalAmount: contract.totalAmount,
      lessonPaymentCount: course.lessonPaymentCount,
    });
  }
  console.log(`Contracts: ${contractByEnrollmentId.size} active`);

  // 11.4 Payments — first 10 students prepaid their first cycle. Students
  // 11–14 unpaid (will become debtors via prepaid model). Student 15 paid
  // but hasn't attended anything.
  const PREPAID_STUDENT_IDS = studentIds.slice(0, 10);
  const UNPAID_STUDENT_IDS = studentIds.slice(10, 14); // 11..14
  const PREPAID_NO_ATTEND_IDS = [studentIds[14]]; // 15

  // Helper: atomic payment + balance transaction (mimics PaymentsService.create)
  async function recordPaymentAndBalance(
    studentId: number,
    contractId: string,
    amount: number,
    method: 'CASH' | 'PAYME' | 'CLICK' | 'UZUM' | 'TRANSFER',
  ) {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId,
          contractId,
          amount,
          method,
          status: 'COMPLETED',
          source: 'ADMIN_MANUAL',
          receivedById: admin.id,
          branchId: BRANCH_ID,
          companyId: COMPANY_ID,
        },
      });
      const student = await tx.student.findUniqueOrThrow({
        where: { id: studentId },
        select: { balance: true },
      });
      const balanceAfter = student.balance + amount;
      await tx.transaction.create({
        data: {
          type: 'PAYMENT',
          amount,
          balanceBefore: student.balance,
          balanceAfter,
          studentId,
          paymentId: payment.id,
          contractId,
          branchId: BRANCH_ID,
          companyId: COMPANY_ID,
          performedById: admin.id,
          description: "To'lov qabul qilindi (seed)",
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: { balance: balanceAfter },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: { paidAmount: { increment: amount } },
      });
    });
  }

  const paymentMethodCycle = ['CASH', 'PAYME', 'CLICK', 'UZUM'] as const;
  let paymentCount = 0;
  for (const en of enrollmentRows) {
    const shouldPay = [...PREPAID_STUDENT_IDS, ...PREPAID_NO_ATTEND_IDS].includes(en.studentId);
    if (!shouldPay) continue;
    const contract = contractByEnrollmentId.get(en.id)!;
    const method = paymentMethodCycle[paymentCount % paymentMethodCycle.length];
    await recordPaymentAndBalance(en.studentId, contract.id, contract.totalAmount, method);
    paymentCount++;
  }
  console.log(`Payments: ${paymentCount} ta talaba 1-sikl to'lovini qildi`);
  console.log(`  Qarzdorlar (to'lamagan): ${UNPAID_STUDENT_IDS.length} ta`);

  // 11.5 Attendance + LESSON_DEDUCTION + SalaryAccrual
  // Generate attendance for each enrolled student over the last ~2 weeks.
  // Paid students get full finance wiring (deduction on cycle boundary,
  // accrual linked via deductionTransactionId). Unpaid students get
  // attendance but no deduction/accrual — demonstrates prepaid coverage
  // guard (#1, #2).
  const NOW = new Date('2026-04-14T00:00:00.000Z');
  const ODD_DATES = [
    new Date('2026-04-06'), // Mon
    new Date('2026-04-08'), // Wed
    new Date('2026-04-10'), // Fri
    new Date('2026-04-13'), // Mon
  ];
  const EVEN_DATES = [
    new Date('2026-04-07'), // Tue
    new Date('2026-04-09'), // Thu
    new Date('2026-04-11'), // Sat
  ];

  // Helper: write attendance with full finance side-effects for a paid student.
  async function writeAttendanceForPaidStudent(
    studentId: number,
    groupId: string,
    date: Date,
    enrollmentId: string,
    contractId: string,
    price: number,
    lessonPaymentCount: number,
    teacherId: number,
    branchId: number,
  ) {
    await prisma.$transaction(async (tx) => {
      // 1) Attendance row
      const att = await tx.attendance.create({
        data: {
          groupId,
          studentId,
          date,
          status: 'PRESENT',
          markedById: teacherId,
          markedMethod: 'MANUAL',
          companyId: COMPANY_ID,
        },
      });

      // 2) Cycle-boundary LESSON_DEDUCTION — only at lesson 1, lesson N+1, ...
      const totalAttended = await tx.attendance.count({
        where: { groupId, studentId, status: { in: ['PRESENT', 'LATE'] } },
      });
      const cyclesPaid = Math.floor((totalAttended - 1) / lessonPaymentCount) + 1;
      const cyclesDeducted = await tx.transaction.count({
        where: { studentId, enrollmentId, type: 'LESSON_DEDUCTION' },
      });

      let coverageTxId: string | null = null;
      if (cyclesPaid > cyclesDeducted) {
        const student = await tx.student.findUniqueOrThrow({
          where: { id: studentId },
          select: { balance: true },
        });
        if (student.balance >= price) {
          const balanceAfter = student.balance - price;
          const deduction = await tx.transaction.create({
            data: {
              type: 'LESSON_DEDUCTION',
              amount: -price,
              balanceBefore: student.balance,
              balanceAfter,
              studentId,
              attendanceId: att.id,
              enrollmentId,
              contractId,
              branchId,
              companyId: COMPANY_ID,
              description: 'Dars uchun yechildi (seed)',
            },
          });
          await tx.student.update({
            where: { id: studentId },
            data: { balance: balanceAfter },
          });
          coverageTxId = deduction.id;
        }
      }

      // Coverage lookup for accrual: latest unsettled LESSON_DEDUCTION
      const coverage =
        coverageTxId !== null
          ? { id: coverageTxId }
          : await tx.transaction.findFirst({
              where: { studentId, enrollmentId, type: 'LESSON_DEDUCTION' },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });

      if (coverage) {
        const perLessonCost = Math.round(price / lessonPaymentCount);
        const amount = Math.round((perLessonCost * TEACHER_PERCENTAGE) / 100);
        await tx.salaryAccrual.upsert({
          where: {
            userId_studentId_groupId_lessonDate: {
              userId: teacherId,
              studentId,
              groupId,
              lessonDate: date,
            },
          },
          create: {
            userId: teacherId,
            studentId,
            groupId,
            attendanceId: att.id,
            lessonDate: date,
            amount,
            companyId: COMPANY_ID,
            deductionTransactionId: coverage.id,
          },
          update: { amount, attendanceId: att.id, deductionTransactionId: coverage.id },
        });
      }
    });
  }

  // Helper: attendance only (no finance) — used for unpaid students.
  async function writeAttendanceOnly(studentId: number, groupId: string, date: Date, teacherId: number) {
    await prisma.attendance.create({
      data: {
        groupId,
        studentId,
        date,
        status: 'PRESENT',
        markedById: teacherId,
        markedMethod: 'MANUAL',
        companyId: COMPANY_ID,
      },
    });
  }

  let paidAttendanceCount = 0;
  let unpaidAttendanceCount = 0;
  for (const en of enrollmentRows) {
    const group = groupsData.find((g) => g.id === en.groupId)!;
    const dates = group.days === ODD_DAYS ? ODD_DATES : EVEN_DATES;
    const info = enrollmentCourseInfo.get(en.id)!;
    const contract = contractByEnrollmentId.get(en.id)!;
    const isPaid = PREPAID_STUDENT_IDS.includes(en.studentId);
    const isUnpaid = UNPAID_STUDENT_IDS.includes(en.studentId);
    if (!isPaid && !isUnpaid) continue;

    for (const d of dates) {
      if (d > NOW) continue;
      if (isPaid) {
        await writeAttendanceForPaidStudent(
          en.studentId,
          en.groupId,
          d,
          en.id,
          contract.id,
          info.price,
          info.lessonPaymentCount,
          group.teacherId,
          BRANCH_ID,
        );
        paidAttendanceCount++;
      } else {
        await writeAttendanceOnly(en.studentId, en.groupId, d, group.teacherId);
        unpaidAttendanceCount++;
      }
    }
  }
  console.log(`Attendance: ${paidAttendanceCount} ta to'lagan talabaga (deduction + accrual)`);
  console.log(`            ${unpaidAttendanceCount} ta qarzdorga (faqat attendance, accrual yo'q)`);

  // 11.6 Expenses — mixed categories including a TEACHER_ADVANCE to test
  // the auto-deduction on the next salary run.
  const expenseRows = [
    { category: 'RENT' as const, amount: 3_000_000, description: 'Aprel uchun ijara', date: new Date('2026-04-01'), relatedUserId: null },
    { category: 'UTILITIES' as const, amount: 450_000, description: 'Elektr + internet', date: new Date('2026-04-05'), relatedUserId: null },
    { category: 'MARKETING' as const, amount: 800_000, description: 'Instagram reklamasi', date: new Date('2026-04-08'), relatedUserId: null },
    { category: 'SUPPLIES' as const, amount: 200_000, description: 'Flipchart qog\'oz', date: new Date('2026-04-10'), relatedUserId: null },
    // Teacher advance for Aziz — will net out of next salary via applyPendingAdvances
    { category: 'TEACHER_ADVANCE' as const, amount: 500_000, description: 'Aprel avansi', date: new Date('2026-04-12'), relatedUserId: teachers[0].id },
  ];
  for (const e of expenseRows) {
    await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          category: e.category,
          amount: e.amount,
          description: e.description,
          date: e.date,
          branchId: BRANCH_ID,
          relatedUserId: e.relatedUserId ?? undefined,
          createdById: admin.id,
          companyId: COMPANY_ID,
        },
      });
      await tx.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: -e.amount,
          balanceBefore: 0,
          balanceAfter: 0,
          teacherId: e.relatedUserId ?? undefined,
          expenseId: exp.id,
          branchId: BRANCH_ID,
          companyId: COMPANY_ID,
          performedById: admin.id,
          description: e.description,
        },
      });
    });
  }
  console.log(`Expenses: ${expenseRows.length} ta (shu jumladan TEACHER_ADVANCE 500k Azizga)`);

  // 11.7 One COMPLETED refund — Gulnora (student 5) paid two cycles,
  // attended four lessons (= one full cycle consumed from the ledger),
  // then requested a refund on the untouched second cycle. Exercises
  // the real contract-level consumption formula from audit #11.
  const refundStudentId = studentIds[5]; // Gulnora
  const refundEnrollment = enrollmentRows.find((e) => e.studentId === refundStudentId);
  if (refundEnrollment) {
    const refundContract = contractByEnrollmentId.get(refundEnrollment.id)!;
    const info = enrollmentCourseInfo.get(refundEnrollment.id)!;
    const perLessonCost = Math.round(refundContract.totalAmount / info.lessonPaymentCount);

    // Top up so contract.paidAmount > consumption — gives the refund
    // something to return. Without this second cycle, the first cycle's
    // cycle-boundary deduction swallows 100% of the paid amount and
    // refundable ends up at 0 (correct, but boring for a demo).
    await recordPaymentAndBalance(
      refundStudentId,
      refundContract.id,
      refundContract.totalAmount,
      'TRANSFER',
    );

    // Read real consumption from the ledger — same source the refund
    // service uses in production (audit #11).
    const consumedLedger = await prisma.transaction.aggregate({
      where: {
        contractId: refundContract.id,
        type: 'LESSON_DEDUCTION',
        reversedTransactionId: null,
      },
      _sum: { amount: true },
    });
    const consumedAmount = Math.abs(consumedLedger._sum.amount ?? 0);

    const freshContract = await prisma.contract.findUniqueOrThrow({
      where: { id: refundContract.id },
      select: { paidAmount: true },
    });
    const refundableAmount = Math.max(0, freshContract.paidAmount - consumedAmount);

    const lessonsConsumed = await prisma.attendance.count({
      where: {
        studentId: refundStudentId,
        groupId: refundEnrollment.groupId,
        status: { in: ['PRESENT', 'LATE'] },
      },
    });

    if (refundableAmount > 0) {
      await prisma.$transaction(async (tx) => {
        const refund = await tx.refund.create({
          data: {
            studentId: refundStudentId,
            contractId: refundContract.id,
            requestedAmount: refundableAmount,
            approvedAmount: refundableAmount,
            lessonsCompleted: lessonsConsumed,
            totalLessons: info.lessonPaymentCount,
            deductions: {
              consumedFromLedger: consumedAmount,
              lessonsObserved: lessonsConsumed,
              perLessonCost,
              previousRefunds: 0,
              tax: 0,
              bankFee: 0,
            },
            status: 'COMPLETED',
            refundMethod: 'CASH',
            reason: 'Sayohat uchun ketmoqda',
            processedById: ceo.id,
            processedAt: new Date('2026-04-13'),
            dueDate: new Date('2026-05-04'),
            companyId: COMPANY_ID,
          },
        });
        const student = await tx.student.findUniqueOrThrow({
          where: { id: refundStudentId },
          select: { balance: true },
        });
        const balanceAfter = student.balance - refundableAmount;
        await tx.transaction.create({
          data: {
            type: 'REFUND',
            amount: -refundableAmount,
            balanceBefore: student.balance,
            balanceAfter,
            studentId: refundStudentId,
            refundId: refund.id,
            contractId: refundContract.id,
            companyId: COMPANY_ID,
            performedById: ceo.id,
            description: 'Pul qaytarildi (seed)',
          },
        });
        await tx.student.update({
          where: { id: refundStudentId },
          data: { balance: balanceAfter },
        });
        await tx.contract.update({
          where: { id: refundContract.id },
          data: {
            status: 'REFUNDED',
            paidAmount: { decrement: refundableAmount },
          },
        });
      });
      console.log(
        `Refund: Gulnora ${refundableAmount.toLocaleString('en-US')} so'm qaytarildi (${lessonsConsumed} dars iste'mol)`,
      );
    }
  }

  console.log('\n✅ Finance mock data tayyor.');

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
