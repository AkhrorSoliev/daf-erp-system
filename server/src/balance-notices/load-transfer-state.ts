import type { PrismaClient } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';
import { termHolidays } from '../holidays/holiday-date-set';
import { balanceNoticeText } from './balance-notice-text';
import {
  latestValidNotice,
  transferState,
  transferTerm,
  type TransferState,
} from './transfer-condition';

export type TransferDb = Pick<PrismaClient, 'balanceNotice' | 'holiday'>;

/**
 * The phone a student is told to call: the student's branch's, else the
 * company's. One lookup for the balance notice and for the refund messages
 * (spec §5.3, §5.4). Null when neither has one.
 */
export async function loadContactPhone(
  db: Pick<PrismaClient, 'branch' | 'company'>,
  branchId: number | null,
  companyId: number,
): Promise<string | null> {
  const [branch, company] = await Promise.all([
    branchId === null
      ? null
      : db.branch.findUnique({
          where: { id: branchId },
          select: { phone: true },
        }),
    db.company.findUnique({
      where: { id: companyId },
      select: { phone: true },
    }),
  ]);
  return branch?.phone || company?.phone || null;
}

/**
 * The bot text a notice given now would carry — what «Botga xabar yuborish»
 * sends and what the drawer previews. Null when neither the branch nor the
 * company has a phone (the send is then refused).
 */
export async function loadNoticeText(
  db: Pick<PrismaClient, 'branch' | 'company' | 'holiday'>,
  p: {
    firstName: string;
    balance: number;
    branchId: number | null;
    companyId: number;
  },
  now: Date,
): Promise<string | null> {
  const phone = await loadContactPhone(db, p.branchId, p.companyId);
  if (!phone) return null;
  const today = tashkentDateStr(now);
  const { allowedFrom } = transferTerm(
    today,
    await termHolidays(db, today, p.branchId),
  );
  return balanceNoticeText({
    firstName: p.firstName,
    balance: p.balance,
    allowedFrom,
    phone,
  });
}

/**
 * The transfer lock of one student, read the same way by the withdrawal
 * write, its preview and the «Qaytariladigan pul» drawer. A plain function,
 * so those modules need no import of this one.
 */
export async function loadTransferState(
  db: TransferDb,
  student: { id: number; statusChangedAt: Date | null },
  branchId: number | null,
  now: Date,
): Promise<TransferState> {
  const latest = await db.balanceNotice.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, channel: true },
  });
  const notice = latestValidNotice(latest, student.statusChangedAt);
  const holidays = notice
    ? await termHolidays(db, notice.date, branchId)
    : new Set<string>();
  return transferState(notice, holidays, tashkentDateStr(now));
}
