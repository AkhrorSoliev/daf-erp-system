import { create } from "zustand";
import api from "@/lib/api";

export interface AppNotification {
  id: string;
  type: "COMMENT" | "TASK_ASSIGNED" | "TASK_STATUS_CHANGED" | "SYSTEM";
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  commentId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: (page?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  addNotification: (notification: AppNotification) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async (page = 1) => {
    set({ loading: true });
    try {
      const { data } = await api.get("/notifications", {
        params: { page, pageSize: 20 },
      });
      set({ notifications: data.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      set({ unreadCount: data.count });
    } catch {
      // silent
    }
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }));
    // Notification ovozini chiqarish
    const audio = new Audio("/message-notification.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => {});
  },

  markRead: async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // silent
    }
  },

  markAllRead: async () => {
    try {
      await api.patch("/notifications/read-all");
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    } catch {
      // silent
    }
  },
}));
