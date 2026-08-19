/**
 * Tekshiruvdan o'tgan `BranchResetPlan` ni bajaradi.
 *
 * Chaqiruvchi buni `$transaction` ichida ishlatishi shart: yarim o'chgan filial
 * — RESTRICT bog'liqliklari uzilgan, lekin ota-qatorlari qolgan holat — hech
 * qanday ekranga to'g'ri ko'rinmaydi.
 *
 * Tartib FK yo'nalishiga qarab: RESTRICT bilan bog'langan bola avval, ota
 * keyin. CASCADE bilan bog'langanlar avtomatik ketardi, lekin ular ham aniq
 * yozilgan — o'chirilgan qatorlar soni chiqishda ko'rinishi uchun.
 *
 * `Branch`, `CashAccount`, `LeadColumn` va `LeadSection` ATAYLAB yo'q. Kassa
 * hisoblari va systemKey='NEW' lid ustuni faqat `branches.service.create()`
 * ichida, filial tug'ilganda quriladi — ularni UI'dan qayta yaratib bo'lmaydi.
 * Kassasiz filial umuman pul qabul qila olmaydi (`resolveAccountId` xato
 * tashlaydi), ustunsiz filialning /leads sahifasi esa boshi berk ko'cha.
 */
import { Prisma } from '@prisma/client';
import { BranchResetPlan } from './branch-reset-plan';

export async function executeBranchReset(
  tx: Prisma.TransactionClient,
  plan: BranchResetPlan,
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  const wipe = async (model: string, ids: unknown[], where: any) => {
    if (!ids.length) return;
    const result = await (tx as any)[model].deleteMany({ where });
    deleted[model] = (deleted[model] ?? 0) + result.count;
  };

  const {
    studentIds,
    studentUserIds,
    staffUserIds,
    enrollmentIds,
    groupIds,
    roomIds,
    courseIds,
    snapshotIds,
  } = plan;

  // ── 1-qadam: o'quvchi tomoni ────────────────────────────────────────────
  // SmsMessage.studentId RESTRICT — o'quvchidan oldin ketishi SHART.
  await wipe('smsMessage', studentIds, { studentId: { in: studentIds } });
  await wipe('enrollmentStateLog', enrollmentIds, { enrollmentId: { in: enrollmentIds } });
  await wipe('enrollment', enrollmentIds, { id: { in: enrollmentIds } });
  await wipe('studentBranch', studentIds, { studentId: { in: studentIds } });
  await wipe('student', studentIds, { id: { in: studentIds } });

  // O'quvchilarning login akkauntlari. Student.userId User ga ishora qiladi,
  // shuning uchun Student allaqachon ketgan bo'lishi kerak.
  await wipe('notification', studentUserIds, { userId: { in: studentUserIds } });
  await wipe('userRole', studentUserIds, { userId: { in: studentUserIds } });

  // ── 2-qadam: guruh, xona, kurs ──────────────────────────────────────────
  await wipe('groupScheduleSnapshot', groupIds, { groupId: { in: groupIds } });
  await wipe('groupHolidayExtension', groupIds, { groupId: { in: groupIds } });
  await wipe('groupTeacherHistory', groupIds, { groupId: { in: groupIds } });
  await wipe('groupTeacher', groupIds, { groupId: { in: groupIds } });
  await wipe('group', groupIds, { id: { in: groupIds } });

  // Group.roomId va Group.courseId ishora qiladi, demak guruhdan keyin.
  await wipe('roomCapacitySnapshot', roomIds, { roomId: { in: roomIds } });
  await wipe('room', roomIds, { id: { in: roomIds } });
  await wipe('coursePriceSnapshot', courseIds, { courseId: { in: courseIds } });
  await wipe('course', courseIds, { id: { in: courseIds } });

  // ── 3-qadam: xodimlar ───────────────────────────────────────────────────
  // Notification.userId RESTRICT — foydalanuvchidan oldin ketishi SHART.
  await wipe('notification', staffUserIds, { userId: { in: staffUserIds } });
  await wipe('userRole', staffUserIds, { userId: { in: staffUserIds } });
  await wipe('userBranch', staffUserIds, { userId: { in: staffUserIds } });

  const allUserIds = [...studentUserIds, ...staffUserIds];
  await wipe('user', allUserIds, { id: { in: allUserIds } });

  // ── 4-qadam: audit izlari ───────────────────────────────────────────────
  // entityId — oddiy matn ustuni, FK emas: o'chirilgan yozuvga ishora qiluvchi
  // qatorlar o'zidan-o'zi ketmaydi va yangi filial ID lari bilan aralashadi.
  const historyWhere = {
    OR: [
      { entityType: 'Student', entityId: { in: studentIds.map(String) } },
      { entityType: 'Enrollment', entityId: { in: enrollmentIds } },
      { entityType: 'Group', entityId: { in: groupIds } },
      { entityType: 'Room', entityId: { in: roomIds } },
      { entityType: 'Course', entityId: { in: courseIds } },
      { entityType: 'User', entityId: { in: allUserIds.map(String) } },
    ],
  };
  const historyIds = [
    ...studentIds,
    ...enrollmentIds,
    ...groupIds,
    ...roomIds,
    ...courseIds,
    ...allUserIds,
  ];
  await wipe('entityHistory', historyIds, historyWhere);
  await wipe('statusHistory', historyIds, historyWhere);

  // ── 5-qadam: kunlik moliyaviy suratlar ──────────────────────────────────
  await wipe('dailyFinancialSnapshot', snapshotIds, { id: { in: snapshotIds } });

  return deleted;
}
