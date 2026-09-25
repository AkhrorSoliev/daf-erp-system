/**
 * Oynada oldindan tanlanadigan filial: `preferred` ichidan ro'yxatda
 * bor birinchisi (masalan, imtihon filiali, keyin tepadagi tanlov), bo'lmasa
 * ro'yxatdagi birinchi filial.
 */
export function pickDefaultBranchId(
  branches: Array<{ id: number }>,
  preferred: Array<number | null | undefined>,
): number | null {
  for (const id of preferred) {
    if (id != null && branches.some((b) => b.id === id)) return id;
  }
  return branches[0]?.id ?? null;
}
