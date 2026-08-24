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

/**
 * `EntityHistory`/`StatusHistory` uchun bitta `where` sharti quradi.
 *
 * `executeBranchReset` va zaxira skripti (`reset-branch.ts`) IKKALASI ham
 * aynan shu shartga muhtoj: birinchisi o'chirish uchun, ikkinchisi esa
 * o'chirishdan OLDIN o'sha qatorlarni zaxiraga yozish uchun. Shart ikki joyda
 * qo'lda nusxalansa, executor'niki o'zgarganda zaxiranikisi eskirib qoladi va
 * bu sirli tarzda ma'lumot yo'qotadi — shuning uchun bitta eksport qilingan
 * funksiya, ikkala chaqiruvchi ham shuni ishlatadi.
 */
export function buildHistoryWhere(
  plan: BranchResetPlan,
): Record<string, unknown> {
  const {
    studentIds,
    enrollmentIds,
    groupIds,
    roomIds,
    courseIds,
    studentUserIds,
    staffUserIds,
  } = plan;
  const allUserIds = [...studentUserIds, ...staffUserIds];

  // `companyId` qo'shimcha himoya sifatida qo'shilgan: Student va User ID
  // lari bitta global ketma-ketlikdan kelgani uchun bugun to'qnashuv yo'q,
  // lekin bu qat'iyat emas — `companyId` filtri buni kelajakda ham ushlab
  // turadi. Ishlab chiqarishda shu filialning o'quvchi/guruh yozuvlariga
  // tegishli EntityHistory qatorlarining bir qismida `companyId` NULL —
  // bunday qator hech qanday BOSHQA kompaniyaga tegishli bo'lolmaydi, shuning
  // uchun uni ham o'chirish to'g'ri (moslik entity turi+ID orqali allaqachon
  // tor). `companyId: plan.companyId` ustiga to'g'ridan-to'g'ri ikkinchi `OR`
  // kalit qo'shib bo'lmaydi — JS obyektida bir xil kalit ikki marta yozilsa
  // ikkinchisi birinchisini bosib, kompaniya shartini entity `OR`iga
  // tekislab qo'yardi va natijada butun kompaniyaning HAR QANDAY satri mos
  // kelib qolardi. Shuning uchun ikkala shart o'z alohida `AND` a'zosi.
  return {
    AND: [
      {
        OR: [
          { entityType: 'Student', entityId: { in: studentIds.map(String) } },
          { entityType: 'Enrollment', entityId: { in: enrollmentIds } },
          { entityType: 'Group', entityId: { in: groupIds } },
          { entityType: 'Room', entityId: { in: roomIds } },
          { entityType: 'Course', entityId: { in: courseIds } },
          { entityType: 'User', entityId: { in: allUserIds.map(String) } },
        ],
      },
      { OR: [{ companyId: plan.companyId }, { companyId: null }] },
    ],
  };
}

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
  await wipe('enrollmentStateLog', enrollmentIds, {
    enrollmentId: { in: enrollmentIds },
  });
  await wipe('enrollment', enrollmentIds, { id: { in: enrollmentIds } });
  await wipe('studentBranch', studentIds, { studentId: { in: studentIds } });
  await wipe('student', studentIds, { id: { in: studentIds } });

  // O'quvchilarning login akkauntlari. `Student_userId_fkey` aslida ON DELETE
  // SET NULL — User avval o'chsa, Student qatori o'chmaydi, faqat userId NULL
  // bo'ladi. Shunday bo'lsa ham Student ATAYLAB avval ketadi: aks holda bu
  // yerda User o'chgach orqasida userId=NULL, filialsiz "etim" Student qatori
  // qolib ketardi — FK buni majburlamaydi, tartib shunchaki qasddan shunday.
  await wipe('notification', studentUserIds, {
    userId: { in: studentUserIds },
  });
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
  // Shart o'zi `buildHistoryWhere` da — bu skript va zaxira skripti bitta
  // manbadan foydalanishi uchun eksport qilingan (fayl boshidagi izohga q.).
  const historyWhere = buildHistoryWhere(plan);
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
  await wipe('dailyFinancialSnapshot', snapshotIds, {
    id: { in: snapshotIds },
  });

  return deleted;
}
