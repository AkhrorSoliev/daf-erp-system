import { LeadStatus } from '@prisma/client';

/**
 * What restoring an archived lead will change, in words for the restore
 * dialog. It mirrors `LeadsArchiveService.restoredStatus` (a lost lead returns
 * as NEW, lostReason cleared) and `restoreRelease` (an unconverted owned lead
 * goes back to the common pool, ADR-0093); a converted lead keeps both.
 */
export function restoreNotes(lead: {
  statusEnum: LeadStatus;
  convertedStudentId: number | null;
  ownerId: number | null;
}): string[] {
  if (lead.convertedStudentId) return [];
  const notes: string[] = [];
  if (lead.statusEnum === LeadStatus.LOST) {
    notes.push(
      "Yo'qotilgan lid «Yangi» bosqichiga qaytadi, yo'qotilish sababi o'chadi.",
    );
  }
  if (lead.ownerId !== null) {
    notes.push("Lidning mas'uli bo'shaydi: u umumiy havzaga qaytadi.");
  }
  return notes;
}
