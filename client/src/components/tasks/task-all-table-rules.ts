import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { filterParams, type TaskCard, type TaskFilters, type TaskStatus } from "@/hooks/use-tasks";
import { dueState, tashkentDayAndTime } from "./task-due";
import { ENTITY_LABEL, KIND_LABEL, isOpenStatus } from "./task-labels";

const PAGE_SIZE = 50;
/** Closed tasks (done, cancelled) are listed for the last 30 days only; the server cuts both. */
export const CLOSED_DAYS = 30;
const OPEN_STATUSES: TaskStatus[] = ["NEW", "IN_PROGRESS", "IN_REVIEW"];
const CLOSED_STATUSES: TaskStatus[] = ["DONE", "CANCELLED"];

/** What the table asks for; replaced as a whole on every change, so its identity names one request. */
export interface AllQuery { filters: TaskFilters; statuses: TaskStatus[]; showClosed: boolean }

/** A pick in «Holat» decides; with none, every open status, plus the two closed ones while «Yopilganlar» is on. */
export function statusesToAsk(q: Pick<AllQuery, "statuses" | "showClosed">): TaskStatus[] {
  if (q.statuses.length) return q.statuses;
  return q.showClosed ? [...OPEN_STATUSES, ...CLOSED_STATUSES] : OPEN_STATUSES;
}

/** True when the query asks for closed tasks, i.e. when the `CLOSED_DAYS` window applies. */
export const closedAsked = (q: Pick<AllQuery, "statuses" | "showClosed">) => statusesToAsk(q).some((s) => !isOpenStatus(s));

/** The header switcher's pick (`null` = «Barcha filiallar») as the table's starting «Filial» filter. */
export function initialBranchFilter(selected: { id: number } | null): number[] | undefined {
  return selected ? [selected.id] : undefined;
}

export function allParams(q: AllQuery, cursor?: string) {
  const status = statusesToAsk(q);
  return {
    view: "all", limit: PAGE_SIZE, status: status.join(","), cursor,
    closedDays: closedAsked(q) ? CLOSED_DAYS : undefined,
    ...filterParams(q.filters),
  };
}

/** `?assignee=7` (or `7,9`) from the «Yuklama» row click; anything that is not a whole id is ignored. */
export function assigneeFromUrl(raw: string | null): number[] | undefined {
  const ids = (raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number).filter((n) => n > 0);
  return ids.length ? ids : undefined;
}

/** A person picked through a link may be missing from the list (no longer assignable); keep the pick visible as an option. */
export function withSelected(options: MultiSelectOption[], selected: string[]): MultiSelectOption[] {
  const missing = selected.filter((v) => !options.some((o) => o.value === v));
  return [...options, ...missing.map((value) => ({ value, label: `Xodim ${value}` }))];
}

/** `more`: another page exists, so the counts are lower bounds. */
export interface AllTiles { open: number; overdue: number; review: number; closedToday: number | null; more: boolean }

// Approximation: counts the rows loaded so far, not the whole company; «Bugun yopildi» is null («—») while no closed task is asked for.
export function allTiles(rows: TaskCard[], now: Date, closed: boolean, more: boolean): AllTiles {
  const today = tashkentDayAndTime(now.toISOString()).day.getTime();
  const open = rows.filter((t) => isOpenStatus(t.status));
  return {
    open: open.length,
    overdue: open.filter((t) => dueState(t.dueAt, now) === "overdue").length,
    review: open.filter((t) => t.status === "IN_REVIEW").length,
    closedToday: closed ? rows.filter((t) => t.closedAt && tashkentDayAndTime(t.closedAt).day.getTime() === today).length : null,
    more,
  };
}

/**
 * What the table holds. `query` names the request the rows answer (a different query means they are on their
 * way out); `tiles` are those of the last answer that worked, so a failed load does not turn them into zeros.
 */
export interface AllResult { query: AllQuery; rows: TaskCard[]; cursor: string | null; failed: boolean; tiles: AllTiles | null }

export function loadedResult(query: AllQuery, rows: TaskCard[], cursor: string | null, now: Date): AllResult {
  return { query, rows, cursor, failed: false, tiles: allTiles(rows, now, closedAsked(query), cursor !== null) };
}

/** A failed load shows no rows but keeps the tiles it had. */
export function failedResult(prev: AllResult | null, query: AllQuery): AllResult {
  return { query, rows: [], cursor: null, failed: true, tiles: prev?.tiles ?? null };
}

/** «Keyingi»: add a page to `prev` — dropping ids already held, taking the new cursor. Rows that answer another query are not ours. */
export function appendPage(prev: AllResult | null, query: AllQuery, page: TaskCard[], cursor: string | null, now: Date): AllResult | null {
  if (!prev || prev.query !== query) return prev;
  const seen = new Set(prev.rows.map((t) => t.id));
  return loadedResult(query, [...prev.rows, ...page.filter((t) => !seen.has(t.id))], cursor, now);
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** Names (two, then «+N»), or for a batch the author's own count: «5 xodim · 2/5 bajardi». */
export function assigneeLabel(t: Pick<TaskCard, "assignees" | "batch">): string {
  if (t.batch) return `${t.batch.total} xodim · ${t.batch.done}/${t.batch.total} bajardi`;
  const names = t.assignees.map(fullName);
  if (names.length === 0) return "—";
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** The line under a title: what the system task is about and what it hangs off. */
export function topicLine(t: Pick<TaskCard, "kind" | "entityType">): string {
  return [KIND_LABEL[t.kind], t.entityType ? ENTITY_LABEL[t.entityType] : ""].filter(Boolean).join(" · ");
}

export function branchLabel(branchId: number | null, branches: { id: number; name: string }[]): string {
  return branches.find((b) => b.id === branchId)?.name ?? "—";
}
