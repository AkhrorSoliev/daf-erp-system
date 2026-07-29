"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { buildBotLink } from "@/lib/telegram-link";

/**
 * Signed teacher registration link for one branch.
 *
 * The old link was built in the browser as `teacher_<branchId>` — an unsigned
 * payload, so anyone holding one could edit the number and register themselves
 * as a teacher of ANY branch. The bot no longer accepts it. The signed
 * `employee_..._sig_...` payload is minted server-side, where the caller's own
 * role also caps which roles they may hand out.
 *
 * Returns null while loading, or when the branch is unknown / the bot is not
 * configured / the caller may not generate links for that branch.
 */
export function useTeacherRegistrationLink(branchId: number | null | undefined) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) {
      setLink(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<{ payload: string }>(
        "/telegram/employee-link",
        { branchId, roleIds: [4] },
      );
      setLink(buildBotLink(data.payload));
    } catch {
      setLink(null);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { link, loading, reload: load };
}
