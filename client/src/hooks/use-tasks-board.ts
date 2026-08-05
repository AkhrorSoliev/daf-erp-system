import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";

export type TaskStatus = "PENDING" | "SEEN" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskTab = "my" | "created";

export interface TaskItem {
  id: string;
  commentId: string;
  content: string;
  status: TaskStatus;
  dueDate: string | null;
  priority: TaskPriority | null;
  entityType: string;
  entityId: string;
  author: {
    id: number;
    firstName: string;
    lastName: string;
    photo: string | null;
  };
  assignees: {
    id: string;
    userId: number;
    firstName: string;
    lastName: string;
    status: string;
  }[];
  createdAt: string;
}

export const TASK_COLUMNS: {
  id: TaskStatus;
  label: string;
  color: string;
}[] = [
  { id: "PENDING", label: "Kutilmoqda", color: "bg-yellow-500" },
  { id: "SEEN", label: "Ko'rildi", color: "bg-blue-500" },
  { id: "DONE", label: "Bajarildi", color: "bg-green-500" },
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Kutilmoqda",
  SEEN: "Ko'rildi",
  DONE: "Bajarildi",
};

interface TasksBoardState {
  tasks: TaskItem[];
  loading: boolean;
  tab: TaskTab;
  fetchMyTasks: () => Promise<void>;
  fetchCreatedTasks: () => Promise<void>;
  setTab: (tab: TaskTab) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => Promise<void>;
}

export const useTasksBoard = create<TasksBoardState>((set, get) => ({
  tasks: [],
  loading: false,
  tab: "my",

  setTab: (tab) => set({ tab }),

  fetchMyTasks: async () => {
    set({ loading: true });
    try {
      const res = await api.get("/comments/my-tasks");
      const data = res.data?.data ?? res.data ?? [];
      const tasks: TaskItem[] = data.map(
        (assignee: {
          id: string;
          status: string;
          comment: {
            id: string;
            content: string;
            dueDate: string | null;
            priority: string | null;
            entityType: string;
            entityId: string;
            createdAt: string;
            author: {
              id: number;
              firstName: string;
              lastName: string;
              photo: string | null;
            };
            assignees: {
              id: string;
              userId: number;
              user: {
                firstName: string;
                lastName: string;
              };
              status: string;
            }[];
          };
        }) => ({
          id: assignee.id,
          commentId: assignee.comment.id,
          content: assignee.comment.content,
          status: assignee.status as TaskStatus,
          dueDate: assignee.comment.dueDate ?? null,
          priority: (assignee.comment.priority as TaskPriority) ?? null,
          entityType: assignee.comment.entityType,
          entityId: assignee.comment.entityId,
          author: assignee.comment.author,
          assignees: (assignee.comment.assignees ?? []).map(
            (a: {
              id: string;
              userId: number;
              user: { firstName: string; lastName: string };
              status: string;
            }) => ({
              id: a.id,
              userId: a.userId,
              firstName: a.user.firstName,
              lastName: a.user.lastName,
              status: a.status,
            })
          ),
          createdAt: assignee.comment.createdAt,
        })
      );
      set({ tasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchCreatedTasks: async () => {
    set({ loading: true });
    try {
      const res = await api.get("/comments/created-tasks");
      const data = res.data?.data ?? res.data ?? [];
      const tasks: TaskItem[] = data.map(
        (comment: {
          id: string;
          content: string;
          dueDate: string | null;
          priority: string | null;
          entityType: string;
          entityId: string;
          createdAt: string;
          author: {
            id: number;
            firstName: string;
            lastName: string;
            photo: string | null;
          };
          assignees: {
            id: string;
            userId: number;
            user: {
              firstName: string;
              lastName: string;
            };
            status: string;
          }[];
        }) => ({
          id: comment.id,
          commentId: comment.id,
          content: comment.content,
          status: deriveCommentStatus(comment.assignees),
          dueDate: comment.dueDate ?? null,
          priority: (comment.priority as TaskPriority) ?? null,
          entityType: comment.entityType,
          entityId: comment.entityId,
          author: comment.author,
          assignees: (comment.assignees ?? []).map(
            (a: {
              id: string;
              userId: number;
              user: { firstName: string; lastName: string };
              status: string;
            }) => ({
              id: a.id,
              userId: a.userId,
              firstName: a.user.firstName,
              lastName: a.user.lastName,
              status: a.status,
            })
          ),
          createdAt: comment.createdAt,
        })
      );
      set({ tasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  moveTask: async (taskId, newStatus) => {
    const { tasks } = get();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Optimistic update
    set({
      tasks: tasks.map((t) =>
        t.id === taskId ? { ...t, status: newStatus } : t
      ),
    });

    try {
      await api.patch(`/comments/${task.commentId}/assignee-status`, {
        status: newStatus,
      });
    } catch (error) {
      // Revert on error
      set({ tasks });
      const msg =
        (error as any)?.response?.data?.message ||
        "Status o'zgartirishda xatolik";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    }
  },
}));

function deriveCommentStatus(
  assignees: { status: string }[]
): TaskStatus {
  if (!assignees.length) return "PENDING";
  const allDone = assignees.every((a) => a.status === "DONE");
  if (allDone) return "DONE";
  const anySeen = assignees.some(
    (a) => a.status === "SEEN" || a.status === "DONE"
  );
  if (anySeen) return "SEEN";
  return "PENDING";
}

// Tasks hang off students, groups and leads, all of which are branch-scoped,
// so the board's contents change with the branch. See
// `lib/branch-scoped-stores.ts`.
registerBranchScopedStore(useTasksBoard);
