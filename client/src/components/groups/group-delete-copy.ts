/**
 * What deleting a group would do to its students, as
 * `GET /groups/:id/delete-preview` reports it: live enrollments by status.
 */
export interface GroupDeletePreview {
  active: number;
  frozen: number;
}

/**
 * The delete dialog's count line, or null for a group with nobody in it.
 *
 * Frozen students are named because the groups table counts ACTIVE students
 * only, and a deletion takes the frozen ones out too — the students left
 * behind by earlier deletions were all frozen.
 */
export function liveStudentsLine({
  active,
  frozen,
}: GroupDeletePreview): string | null {
  const total = active + frozen;
  if (total === 0) return null;
  if (active === 0) return `Guruhda hali ${frozen} ta muzlatilgan o'quvchi bor.`;
  if (frozen === 0) return `Guruhda hali ${total} ta o'quvchi bor.`;
  return `Guruhda hali ${total} ta o'quvchi bor (${frozen} tasi muzlatilgan).`;
}
