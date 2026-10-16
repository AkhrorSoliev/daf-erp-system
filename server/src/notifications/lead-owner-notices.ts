import type { LeadOwnerChangedPayload } from '../leads/lead-events';

export interface LeadOwnerNotice {
  userId: number;
  title: string;
  message: string;
}

/**
 * Who hears about a lead's owner change (ADR-0092). Nobody is told about
 * their own action; the system's take-back goes to the former owner.
 */
export function leadOwnerNotices(
  p: LeadOwnerChangedPayload,
): LeadOwnerNotice[] {
  const out: LeadOwnerNotice[] = [];
  if (p.kind === 'EXPIRE' && p.fromUserId != null) {
    out.push({
      userId: p.fromUserId,
      title: "Lid umumiy ro'yxatga qaytdi",
      message: `${p.leadName} — muddatida harakat bo'lmadi`,
    });
  }
  if (p.kind === 'ASSIGN' && p.toUserId != null && p.toUserId !== p.actorId) {
    out.push({
      userId: p.toUserId,
      title: 'Sizga lid berildi',
      message: `${p.leadName} — muddat lid kartochkasida ko'rsatilgan`,
    });
  }
  if (
    (p.kind === 'ASSIGN' || p.kind === 'RELEASE') &&
    p.fromUserId != null &&
    p.fromUserId !== p.actorId
  ) {
    out.push({
      userId: p.fromUserId,
      title: 'Lid sizdan olindi',
      message: p.leadName,
    });
  }
  return out;
}
