import { formatPrice } from "@/lib/format-utils";

/** `GET /students/:id/active-enrollments-prepaid` → `pack[]` (LESSON_PACK only). */
export interface PackRefundRow {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  prepaidLessonsRemaining: number;
  perLessonCost: number;
  consumedLessons: number;
  maxRefundable: number;
  suggestedRefundAmount: number;
}

/** `monthly[]`: what the server itself releases on freeze. Read-only. */
export interface MonthlyReleaseRow {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  releaseLessons: number;
  releaseAmount: number;
}

export interface FreezeRefundPreview {
  pack: PackRefundRow[];
  monthly: MonthlyReleaseRow[];
}

/**
 * Both lists, never undefined. An old server's bare array (deploy window)
 * yields two empty lists: no refund block rather than a crash.
 */
export function freezePreviewLists(data: unknown): FreezeRefundPreview {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { pack: [], monthly: [] };
  }
  const d = data as Partial<FreezeRefundPreview>;
  return { pack: d.pack ?? [], monthly: d.monthly ?? [] };
}

/** The read-only line under a monthly enrollment in the freeze dialog. */
export function monthlyReleaseLabel(
  row: Pick<MonthlyReleaseRow, "releaseLessons" | "releaseAmount">,
): string {
  if (row.releaseLessons <= 0 || row.releaseAmount <= 0) {
    return "Bu oydan qaytadigan dars yo'q — balans o'zgarmaydi";
  }
  return `Oyning qolgan ${row.releaseLessons} darsi uchun ${formatPrice(row.releaseAmount)} so'm balansga qaytadi`;
}
