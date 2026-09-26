/**
 * What a portal screen draws for one query. The checks run in this order, and
 * the order is the point:
 *
 * - `ready`: there is data. It stays on screen when a later background
 *   refetch fails; an error screen would take away what the student was
 *   already reading.
 * - `offline`: no data, and the request is paused. React Query does not start
 *   a request while the browser reports no connection, and it holds a retry
 *   while the page is hidden. A paused query is neither `isLoading` nor
 *   `isError`, so a screen that checked only those two drew its empty state:
 *   offline, Jadval said "Bu hafta darslar yo'q".
 * - `failed`: no data, and the request came back with an error.
 * - `loading`: a request can still answer.
 */
export type LoadState = "ready" | "offline" | "failed" | "loading";

export function loadState(query: {
  data: unknown;
  isError: boolean;
  isPaused: boolean;
}): LoadState {
  if (query.data !== undefined) return "ready";
  if (query.isPaused) return "offline";
  if (query.isError) return "failed";
  return "loading";
}
