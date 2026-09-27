export type ReportViewState = "loading" | "error" | "ready";

/**
 * Which state a report section renders. `isLoading || !data` treated a failed
 * request as "still loading", so a refused request left the page on
 * «Ma'lumotlar yuklanmoqda...» forever. Data wins when present, so a failed
 * background refetch keeps the last good figures on screen.
 */
export function reportViewState(q: {
  data: unknown;
  isError: boolean;
}): ReportViewState {
  if (q.data !== undefined && q.data !== null) return "ready";
  return q.isError ? "error" : "loading";
}

/** A 4xx is an answer, not a hiccup — retrying only delays the message. */
export function retryUnlessRefused(
  failureCount: number,
  error: unknown,
): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 3;
}
