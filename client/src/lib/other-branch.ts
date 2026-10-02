export interface OtherBranch {
  id: number;
  name: string;
}

/**
 * The branch a detail endpoint names in its 404 when the record exists in
 * another branch the caller may open than the one the switcher is on —
 * `GET /groups/:id`, `GET /students/:id` (server `common/auth/other-branch.ts`).
 * Null for a record that is really missing.
 *
 * The pages used to say «… mavjud emas» for such a record; on 01.10.2026 a
 * CEO in Farg'ona cancelled eight Namangan lessons on that answer.
 */
export function otherBranchOf(error: unknown): OtherBranch | null {
  const response = (
    error as { response?: { status?: number; data?: { branch?: unknown } } }
  )?.response;
  if (response?.status !== 404) return null;
  const branch = response.data?.branch as Partial<OtherBranch> | undefined;
  return typeof branch?.id === "number" && typeof branch.name === "string"
    ? { id: branch.id, name: branch.name }
    : null;
}
