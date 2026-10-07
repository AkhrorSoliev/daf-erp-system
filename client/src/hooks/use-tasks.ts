import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";

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
export interface TaskFilters { due?: "overdue" | "today" | "week"; priority?: TaskPriority[]; authorId?: number[]; assigneeId?: number[]; branchId?: number[]; q?: string }

type Column = { items: TaskCard[]; cursor: string | null; loading: boolean; total?: number };
const emptyColumn = (): Column => ({ items: [], cursor: null, loading: false });
const BOARD_STATUSES: TaskStatus[] = ["NEW", "IN_PROGRESS", "IN_REVIEW", "DONE"];

interface TasksState {
  view: "my" | "created" | "all";
  layout: "board" | "list";
  filters: TaskFilters;
  columns: Record<TaskStatus, Column>;
  openTaskId: string | null;
  setView: (v: "my" | "created" | "all") => void;
  setLayout: (l: "board" | "list") => void;
  setFilters: (f: TaskFilters) => void;
  fetchColumn: (status: TaskStatus, opts?: { more?: boolean }) => Promise<void>;
  fetchBoard: () => Promise<void>;
  refreshTask: (id: string) => Promise<void>;
  patchTask: (card: TaskCard) => void;
  removeTask: (id: string) => void;
  openTask: (id: string | null) => void;
}

function filterParams(f: TaskFilters) {
  return { due: f.due, priority: f.priority?.join(","), authorId: f.authorId?.join(","), assigneeId: f.assigneeId?.join(","), branchId: f.branchId?.join(","), q: f.q || undefined };
}

export const useTasks = create<TasksState>((set, get) => ({
  view: "my", layout: "board", filters: {},
  columns: { NEW: emptyColumn(), IN_PROGRESS: emptyColumn(), IN_REVIEW: emptyColumn(), DONE: emptyColumn(), CANCELLED: emptyColumn() },
  openTaskId: null,
  setView: (view) => set({ view }),
  setLayout: (layout) => set({ layout }),
  setFilters: (filters) => set({ filters }),

  fetchColumn: async (status, opts) => {
    const { view, filters, columns } = get();
    const col = columns[status];
    if (col.loading) return;
    set((s) => ({ columns: { ...s.columns, [status]: { ...s.columns[status], loading: true } } }));
    try {
      const { data } = await api.get<{ data: TaskCard[]; nextCursor: string | null }>("/tasks", {
        params: { view, status, limit: 50, cursor: opts?.more ? col.cursor ?? undefined : undefined, ...filterParams(filters) },
      });
      set((s) => ({ columns: { ...s.columns, [status]: { items: opts?.more ? [...s.columns[status].items, ...data.data] : data.data, cursor: data.nextCursor, loading: false } } }));
    } catch (error) {
      set((s) => ({ columns: { ...s.columns, [status]: { ...s.columns[status], loading: false } } }));
      toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"));
    }
  },
  fetchBoard: async () => { await Promise.all(BOARD_STATUSES.map((s) => get().fetchColumn(s))); },

  refreshTask: async (id) => {
    try {
      const { data } = await api.get<{ task: TaskDetail }>(`/tasks/${id}`);
      get().patchTask(data.task);
    } catch { /* a task we can no longer see: drop it */ get().removeTask(id); }
  },
  patchTask: (card) => set((s) => {
    const columns = { ...s.columns };
    for (const st of Object.keys(columns) as TaskStatus[]) columns[st] = { ...columns[st], items: columns[st].items.filter((t) => t.id !== card.id) };
    if (card.status in columns) columns[card.status] = { ...columns[card.status], items: [card, ...columns[card.status].items] };
    return { columns };
  }),
  removeTask: (id) => set((s) => {
    const columns = { ...s.columns };
    for (const st of Object.keys(columns) as TaskStatus[]) columns[st] = { ...columns[st], items: columns[st].items.filter((t) => t.id !== id) };
    return { columns };
  }),
  openTask: (openTaskId) => set({ openTaskId }),
}));

// Tasks hang off branch-scoped entities and «Barchasi» is branch-filtered.
registerBranchScopedStore(useTasks);
