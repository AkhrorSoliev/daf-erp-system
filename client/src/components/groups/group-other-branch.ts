export interface OtherBranch {
  id: number;
  name: string;
}

/**
 * The branch `GET /groups/:id` names when the group exists, but in another
 * branch the caller may open than the one the switcher is on
 * (`GroupsReadService.findOne`). Null for a group that is really missing.
 *
 * The page used to say «guruh mavjud emas» for such a group; on 01.10.2026 a
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
