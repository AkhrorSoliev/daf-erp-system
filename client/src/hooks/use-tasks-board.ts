import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";
import { getErrorMessage } from "@/lib/get-error-message";
import type { UnmarkedStatus } from "@/lib/unmarked-lesson";

export type TaskStatus = "PENDING" | "SEEN" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskTab = "my" | "created";

/** The lesson a «Dars bo'ldimi?» system task asks about (ADR-0054). */
export interface TaskLesson {
  id: string;
  groupId: string;
  groupName: string;
  /** The group's branch: the board lists every branch's tasks. */
  branchName: string | null;
  date: string; // YYYY-MM-DD
  status: UnmarkedStatus;
  teacherPayExempt: boolean;
  lessonStartTime: string;
  lessonEndTime: string;
}

export interface TaskItem {
  id: string;
  commentId: string;
  content: string;
  status: TaskStatus;
  dueDate: string | null;
  priority: TaskPriority | null;
  entityType: string;
  entityId: string;
  /** Null for a system task (shown as «Tizim»). */
  author: {
    id: number;
    firstName: string;
    lastName: string;
    photo: string | null;
  } | null;
  isSystem: boolean;
  unmarkedLesson: TaskLesson | null;
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
            isSystem?: boolean;
            author: {
              id: number;
              firstName: string;
              lastName: string;
              photo: string | null;
            } | null;
            assignees: {
              id: string;
              userId: number;
              user: {
                firstName: string;
                lastName: string;
              };
              status: string;
            }[];
            unmarkedLesson?: {
              id: string;
              groupId: string;
              date: string;
              status: UnmarkedStatus;
              teacherPayExempt: boolean;
              lessonStartTime: string;
              lessonEndTime: string;
              group: { name: string; branch?: { name: string } | null };
            } | null;
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
          isSystem: assignee.comment.isSystem ?? false,
          unmarkedLesson: assignee.comment.unmarkedLesson
            ? {
                id: assignee.comment.unmarkedLesson.id,
                groupId: assignee.comment.unmarkedLesson.groupId,
                groupName: assignee.comment.unmarkedLesson.group.name,
                branchName:
                  assignee.comment.unmarkedLesson.group.branch?.name ?? null,
                date: assignee.comment.unmarkedLesson.date.slice(0, 10),
                status: assignee.comment.unmarkedLesson.status,
                teacherPayExempt:
                  assignee.comment.unmarkedLesson.teacherPayExempt,
                lessonStartTime: assignee.comment.unmarkedLesson.lessonStartTime,
                lessonEndTime: assignee.comment.unmarkedLesson.lessonEndTime,
              }
            : null,
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
          // A system task has no author, so it never appears among created tasks.
          isSystem: false,
          unmarkedLesson: null,
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

    // The lesson's answer closes a system task, and an answered one stays
    // closed — the server refuses both, so do not even move the card.
    if (task.isSystem && (newStatus === "DONE" || task.status === "DONE")) {
      toast.error("Bu topshiriq darsga javob berilganda o'zi yopiladi");
      return;
    }

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
      // Includes the server's 409 when another administrator took the task.
      toast.error(getErrorMessage(error, "Status o'zgartirishda xatolik"));
      // The server deleted this viewer's copy when someone else took the
      // task: reload so the card does not stay with an enabled prompt.
      if (task.isSystem) void get().fetchMyTasks();
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

// `GET /comments/my-tasks` lists the caller's tasks of EVERY branch (it is
// keyed on the assignee, not the switcher), so a card names its branch. The
// store still resets on a switch; see `lib/branch-scoped-stores.ts`.
registerBranchScopedStore(useTasksBoard);
