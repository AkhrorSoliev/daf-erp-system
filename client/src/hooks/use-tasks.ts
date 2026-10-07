import { create } from "zustand";
import axios from "axios";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";
// task-labels only `import type`s from this file, so there is no runtime cycle.
import { STATUS_COLUMNS } from "@/components/tasks/task-labels";

export type TaskStatus = "NEW" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskKind = "MANUAL" | "LESSON_QUESTION" | "CALLBACK" | "BROKEN_PROMISE" | "UNCALLED_LEAD";
export type TaskView = "my" | "created" | "all" | "workload";
export interface TaskPerson { id: number; firstName: string; lastName: string; photo: string | null; seenAt?: string | null }
export interface TaskLesson { id: string; groupId: string; groupName: string; branchName: string | null; date: string; status: "PENDING" | "HELD" | "NOT_HELD" | "RESCHEDULED"; teacherPayExempt: boolean; lessonStartTime: string; lessonEndTime: string; claimedById: number | null }
export interface TaskCard {
  id: string; kind: TaskKind; title: string; status: TaskStatus; priority: TaskPriority; dueAt: string | null;
  branchId: number | null; entityType: string | null; entityId: string | null; requiresPhoto: boolean;
  batchId: string | null; claimedById: number | null; returnedCount: number; closedAt: string | null; createdAt: string;
  author: TaskPerson | null; assignees: TaskPerson[]; watchers: TaskPerson[];
  stepsTotal: number; stepsDone: number; eventsCount: number; unmarkedLesson: TaskLesson | null;
  batch?: { total: number; done: number; statuses: TaskStatus[] };
}
export interface TaskStep { id: string; title: string; position: number; doneAt: string | null; doneById: number | null }
export interface TaskEvent { id: string; type: string; actorId: number | null; text: string | null; meta: Record<string, unknown> | null; via: "WEB" | "TELEGRAM" | "SYSTEM"; createdAt: string; actor: TaskPerson | null }
export interface TaskDetail extends TaskCard { description: string | null; lastReturnedAt: string | null; cancelReason: string | null; steps: TaskStep[] }
export interface TaskAccess { isAuthor: boolean; isAssignee: boolean; isWatcher: boolean; isManager: boolean; canView: boolean; canManage: boolean; canWork: boolean }
/** The answer of `GET /tasks/:id`; `events` ascending (the last 50), `batch` only for an author's separate copies. */
export interface TaskDetailPayload { task: TaskDetail; events: TaskEvent[]; access: TaskAccess; batch: TaskCard[] }
export interface TaskFilters { due?: "overdue" | "today" | "week"; priority?: TaskPriority[]; authorId?: number[]; assigneeId?: number[]; branchId?: number[]; q?: string }

// `reqId` names the request whose answer the column is waiting for; an answer
// with any other id is stale and dropped. 0 = nothing requested yet.
type Column = { items: TaskCard[]; cursor: string | null; loading: boolean; reqId: number };
const emptyColumn = (): Column => ({ items: [], cursor: null, loading: false, reqId: 0 });
const emptyColumns = (): Record<TaskStatus, Column> => ({
  NEW: emptyColumn(), IN_PROGRESS: emptyColumn(), IN_REVIEW: emptyColumn(), DONE: emptyColumn(), CANCELLED: emptyColumn(),
});
const ALL_STATUSES = Object.keys(emptyColumns()) as TaskStatus[];
const BOARD_STATUSES = STATUS_COLUMNS.map((c) => c.id);
let lastReqId = 0;
// Like `reqId`, for the drawer: a newer load / reload makes an older answer stale.
let lastLoadReq = 0;
let lastReloadReq = 0;

type StoreView = Exclude<TaskView, "workload">;

interface TasksState {
  view: StoreView;
  layout: "board" | "list";
  filters: TaskFilters;
  columns: Record<TaskStatus, Column>;
  /** Bumped whenever a card is added, changed or dropped; the sidebar counts follow it. */
  version: number;
  openTaskId: string | null;
  /** What the drawer shows for `openTaskId`; `null` while it loads. */
  detail: TaskDetailPayload | null;
  setView: (v: StoreView) => void;
  setLayout: (l: "board" | "list") => void;
  setFilters: (f: TaskFilters) => void;
  fetchColumn: (status: TaskStatus, opts?: { more?: boolean }) => Promise<void>;
  fetchBoard: () => Promise<void>;
  refreshTask: (id: string) => Promise<void>;
  patchTask: (card: TaskCard) => void;
  removeTask: (id: string) => void;
  openTask: (id: string | null) => void;
  loadDetail: (id: string) => Promise<void>;
  /** Re-reads the open task quietly: the feed and what the viewer may do after a write. */
  reloadDetail: (id: string) => Promise<void>;
  /** A write's answer: shown in the drawer, patched on the board, feed re-read. */
  applyDetail: (task: TaskDetail) => void;
  appendEvent: (taskId: string, ev: TaskEvent) => void;
}

function filterParams(f: TaskFilters) {
  return { due: f.due, priority: f.priority?.join(","), authorId: f.authorId?.join(","), assigneeId: f.assigneeId?.join(","), branchId: f.branchId?.join(","), q: f.q || undefined };
}

// Events the answer does not hold yet (a comment posted while it was in flight) stay.
function mergeEvents(server: TaskEvent[], local: TaskEvent[]): TaskEvent[] {
  const have = new Set(server.map((e) => e.id));
  const oldest = server[0]?.createdAt ?? "";
  const extra = local.filter((e) => !have.has(e.id) && e.createdAt > oldest);
  return extra.length ? [...server, ...extra].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : server;
}

// The order the server lists a column in: newest first, id as the tie-break.
const newestFirst = (a: TaskCard, b: TaskCard) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id > b.id ? -1 : a.id < b.id ? 1 : 0);

export const useTasks = create<TasksState>((set, get) => ({
  view: "my", layout: "board", filters: {}, columns: emptyColumns(), version: 0,
  openTaskId: null, detail: null,
  // A different view or filter is a different list: drop the cards, and with
  // them (reqId 0) the answer of any request still in flight.
  setView: (view) => set({ view, columns: emptyColumns() }),
  setLayout: (layout) => set({ layout }),
  setFilters: (filters) => set({ filters, columns: emptyColumns() }),

  fetchColumn: async (status, opts) => {
    const { view, filters, columns } = get();
    const col = columns[status];
    const more = opts?.more === true;
    if (more && (!col.cursor || col.loading)) return;
    // A fresh load supersedes whatever is in flight. «More» keeps the column's
    // id, so a fresh load started meanwhile makes its answer stale.
    const reqId = more ? col.reqId : ++lastReqId;
    set((s) => ({ columns: { ...s.columns, [status]: { ...s.columns[status], loading: true, reqId } } }));
    try {
      const { data } = await api.get<{ data: TaskCard[]; nextCursor: string | null }>("/tasks", {
        params: { view, status, limit: 50, cursor: more ? col.cursor ?? undefined : undefined, ...filterParams(filters) },
      });
      if (get().columns[status].reqId !== reqId) return;
      set((s) => {
        const prev = s.columns[status].items;
        const seen = new Set(prev.map((t) => t.id));
        const items = more ? [...prev, ...data.data.filter((t) => !seen.has(t.id))] : data.data;
        return { columns: { ...s.columns, [status]: { items, cursor: data.nextCursor, loading: false, reqId } }, version: s.version + 1 };
      });
    } catch (error) {
      if (get().columns[status].reqId !== reqId) return;
      set((s) => ({ columns: { ...s.columns, [status]: { ...s.columns[status], loading: false } } }));
      toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"));
    }
  },
  fetchBoard: async () => { await Promise.all(BOARD_STATUSES.map((s) => get().fetchColumn(s))); },

  refreshTask: async (id) => {
    try {
      const { data } = await api.get<{ task: TaskDetail }>(`/tasks/${id}`);
      get().patchTask(data.task);
    } catch (e) {
      // Only «no longer yours to see / gone» drops the card; a 500 or a lost
      // connection is transient, and the card is still there.
      if (axios.isAxiosError(e) && (e.response?.status === 403 || e.response?.status === 404)) get().removeTask(id);
    }
  },
  // A card that is not on the board is left out: the board is refetched when
  // the view or filters change, so an unseen card never needs inserting.
  patchTask: (card) => set((s) => {
    const from = ALL_STATUSES.find((st) => s.columns[st].items.some((t) => t.id === card.id));
    if (!from) return { version: s.version + 1 };
    const old = s.columns[from].items.find((t) => t.id === card.id)!;
    // The detail response carries no `batch` summary; keep the one the board had.
    const next = card.batch || !old.batch ? card : { ...card, batch: old.batch };
    if (card.status === from) {
      const items = s.columns[from].items.map((t) => (t.id === card.id ? next : t));
      return { columns: { ...s.columns, [from]: { ...s.columns[from], items } }, version: s.version + 1 };
    }
    const target = s.columns[card.status].items;
    const at = target.findIndex((t) => newestFirst(next, t) < 0);
    const items = at === -1 ? [...target, next] : [...target.slice(0, at), next, ...target.slice(at)];
    return {
      columns: {
        ...s.columns,
        [from]: { ...s.columns[from], items: s.columns[from].items.filter((t) => t.id !== card.id) },
        [card.status]: { ...s.columns[card.status], items },
      },
      version: s.version + 1,
    };
  }),
  removeTask: (id) => set((s) => {
    const columns = { ...s.columns };
    for (const st of ALL_STATUSES) columns[st] = { ...columns[st], items: columns[st].items.filter((t) => t.id !== id) };
    return { columns, version: s.version + 1 };
  }),
  openTask: (openTaskId) => {
    // Closing keeps `detail`, so the drawer does not turn into a skeleton while it slides out.
    set(openTaskId ? { openTaskId, detail: null } : { openTaskId });
    if (openTaskId) void get().loadDetail(openTaskId);
  },

  loadDetail: async (id) => {
    const reqId = ++lastLoadReq;
    // Another task was opened (or the drawer closed) while this one was in flight.
    const stale = () => reqId !== lastLoadReq || get().openTaskId !== id;
    try {
      const { data } = await api.get<TaskDetailPayload>(`/tasks/${id}`);
      if (stale()) return;
      set({ detail: data });
      void api.post(`/tasks/${id}/seen`).catch(() => {});
    } catch (error) {
      if (stale()) return;
      set({ detail: null, openTaskId: null });
      toast.error(getErrorMessage(error, "Topshiriq topilmadi"));
    }
  },
  reloadDetail: async (id) => {
    const reqId = ++lastReloadReq;
    try {
      const { data } = await api.get<TaskDetailPayload>(`/tasks/${id}`);
      const cur = get().detail;
      if (reqId !== lastReloadReq || cur?.task.id !== id) return;
      set({ detail: { ...data, events: mergeEvents(data.events, cur.events) } });
      // A write's own answer can predate its event (the comment count) or the
      // system's follow-up; tell the board only when this read differs.
      if (JSON.stringify(data.task) !== JSON.stringify(cur.task)) get().patchTask(data.task);
    } catch {
      // The drawer keeps what it shows; the write it follows has already answered.
    }
  },
  applyDetail: (task) => {
    // A write can answer after the drawer moved on to another copy (or closed):
    // the board still learns of it, the drawer and its feed are left alone.
    const shown = get().detail?.task.id === task.id;
    if (shown) set((s) => (s.detail ? { detail: { ...s.detail, task } } : {}));
    get().patchTask(task);
    if (shown) void get().reloadDetail(task.id);
  },
  appendEvent: (taskId, ev) => {
    const cur = get().detail;
    // A comment belongs to the task it was posted to, not to whichever is open now.
    if (!cur || cur.task.id !== taskId || cur.events.some((e) => e.id === ev.id)) return;
    const task = { ...cur.task, eventsCount: cur.task.eventsCount + 1 };
    set({ detail: { ...cur, task, events: [...cur.events, ev] } });
    get().patchTask(task);
  },
}));

// Tasks hang off branch-scoped entities and «Barchasi» is branch-filtered.
registerBranchScopedStore(useTasks);
