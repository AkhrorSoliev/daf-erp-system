"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { buildBotLink } from "@/lib/telegram-link";

/**
 * Asks the server for a new signed Teacher registration link for one branch.
 *
 * Every call mints a new link. A link stops working three days after it is
 * minted (ADR-0029), so anything that hands a link out — a copy, a QR code —
 * must mint one at that moment rather than reuse one minted earlier.
 *
 * Null when the bot is not configured or the request fails.
 */
export async function mintTeacherRegistrationLink(
  branchId: number,
): Promise<string | null> {
  try {
    const { data } = await api.post<{ payload: string }>(
      "/telegram/employee-link",
      { branchId, roleIds: [4] },
    );
    return buildBotLink(data.payload);
  } catch {
    return null;
  }
}

/**
 * Signed teacher registration link for one branch.
 *
 * The old link was built in the browser as `teacher_<branchId>` — an unsigned
 * payload, so anyone holding one could edit the number and register themselves
 * as a teacher of ANY branch. The bot no longer accepts it. The signed
 * `employee_..._sig_...` payload is minted server-side, where the caller's own
 * role also caps which roles they may hand out.
 *
 * `link` is minted when the page opens, for display. It dies three days later,
 * so to hand a link out call `reload`: it mints a new one, shows it, and
 * resolves to it. While a new link is being minted, `link` keeps the previous
 * one.
 *
 * `link` is null until the first link arrives, and when the branch is unknown /
 * the bot is not configured / the caller may not generate links for that branch.
 */
export function useTeacherRegistrationLink(branchId: number | null | undefined) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Page open, copy and QR open can mint at the same time. Only the latest
  // call may set `link` and clear `loading`; an earlier response arriving
  // last would otherwise replace the newer link.
  const latestCall = useRef(0);

  const load = useCallback(async (): Promise<string | null> => {
    const call = ++latestCall.current;
    if (!branchId) {
      setLink(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    let url: string | null = null;
    try {
      url = await mintTeacherRegistrationLink(branchId);
    } finally {
      if (call === latestCall.current) {
        setLink(url);
        setLoading(false);
      }
    }
    return url;
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { link, loading, reload: load };
}
