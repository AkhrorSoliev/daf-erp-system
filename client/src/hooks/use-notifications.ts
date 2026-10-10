import { create } from "zustand";
import api from "@/lib/api";
import {
  isPending,
  type AppNotification,
  type NotificationCounts,
  type NotificationGroup,
} from "@/components/notifications/notification-view";

export type { AppNotification } from "@/components/notifications/notification-view";

export interface NotificationPage {
  data: AppNotification[];
  nextCursor: string | null;
}

export interface NotificationQuery {
  filter: "pending" | "all";
  type?: NotificationGroup;
  q?: string;
  cursor?: string | null;
  pageSize?: number;
}

export async function fetchNotificationPage(query: NotificationQuery): Promise<NotificationPage> {
  const { data } = await api.get<NotificationPage>("/notifications", {
    params: {
      filter: query.filter,
      type: query.type,
      q: query.q || undefined,
      cursor: query.cursor ?? undefined,
      pageSize: query.pageSize ?? 30,
    },
  });
  return data;
}

export async function fetchNotificationCounts(): Promise<NotificationCounts> {
  return (await api.get<NotificationCounts>("/notifications/counts")).data;
}

const PANEL_SIZE = 30;

// The newest `loadPanel` call; an answer of an older one is dropped, so a slow
// response can never overwrite a newer chip or a reopened panel (like use-tasks).
let lastPanelReq = 0;

interface NotificationsState {
  /** What waits for the viewer and is unread — always the server's number. */
  badge: number;
  /** The panel's «Kutilmoqda» list. */
  pending: AppNotification[];
  /** The panel's newest rows (all kinds). */
  recent: AppNotification[];
  counts: NotificationCounts | null;
  /** The panel's type chip; null = every type. */
  chip: NotificationGroup | null;
  loading: boolean;
  /** The current chip's first answer has arrived; the lists mean something only then. */
  loaded: boolean;
  /** The last load of the panel failed (the lists, if any, are from an earlier answer). */
  failed: boolean;
  /** Bumps on every change (SSE, read); open lists refetch when it moves. */
  version: number;
  fetchBadge: () => Promise<void>;
  loadPanel: (chip: NotificationGroup | null) => Promise<void>;
  add: (n: AppNotification) => void;
  resolve: (ids: string[], resolvedAt: string) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/** An SSE row from a server older than this client may lack the newer fields. */
const fromSse = (n: AppNotification): AppNotification => ({
  ...n,
  group: n.group ?? "system",
  actionRequired: n.actionRequired ?? false,
  resolvedAt: n.resolvedAt ?? null,
  groupKey: n.groupKey ?? null,
});

const withResolved = (list: AppNotification[], ids: Set<string>, resolvedAt: string) =>
  list.map((n) => (ids.has(n.id) && n.resolvedAt === null ? { ...n, resolvedAt } : n));

export const useNotifications = create<NotificationsState>((set, get) => {
  // The panel's tab numbers follow a live change once the panel has been opened.
  const refreshCounts = async () => {
    if (get().counts === null) return;
    try {
      set({ counts: await fetchNotificationCounts() });
    } catch {
      // the numbers keep their last value
    }
  };

  return {
    badge: 0,
    pending: [],
    recent: [],
    counts: null,
    chip: null,
    loading: false,
    loaded: false,
    failed: false,
    version: 0,

    fetchBadge: async () => {
      try {
        const { data } = await api.get<{ count: number }>("/notifications/unread-count");
        set({ badge: data.count });
      } catch {
        // the badge keeps its last value
      }
    },

    loadPanel: async (chip) => {
      const reqId = ++lastPanelReq;
      // A chip change empties the lists (the old chip's rows are not this one's);
      // the same chip, already loaded, keeps its rows while it refreshes.
      set((s) =>
        s.chip === chip && s.loaded
          ? { loading: true, failed: false }
          : { chip, loading: true, failed: false, loaded: false, pending: [], recent: [] },
      );
      try {
        const type = chip ?? undefined;
        const [pending, recent, counts] = await Promise.all([
          fetchNotificationPage({ filter: "pending", type, pageSize: PANEL_SIZE }),
          fetchNotificationPage({ filter: "all", type, pageSize: PANEL_SIZE }),
          fetchNotificationCounts(),
        ]);
        if (reqId !== lastPanelReq) return;
        set({ pending: pending.data, recent: recent.data, counts, loading: false, failed: false, loaded: true });
      } catch {
        if (reqId === lastPanelReq) set({ loading: false, failed: true });
      }
    },

    add: (raw) => {
      const n = fromSse(raw);
      set((s) => {
        if (s.recent.some((r) => r.id === n.id)) return { version: s.version + 1 };
        const shown = s.chip === null || s.chip === n.group;
        return {
          recent: shown ? [n, ...s.recent].slice(0, 50) : s.recent,
          pending: shown && isPending(n) ? [n, ...s.pending] : s.pending,
          version: s.version + 1,
        };
      });
      void get().fetchBadge();
      void refreshCounts();
      const audio = new Audio("/message-notification.mp3");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    },

    resolve: (ids, resolvedAt) => {
      const closed = new Set(ids);
      // A payload without the time (older server) closes the rows as of now.
      const at = typeof resolvedAt === "string" ? resolvedAt : new Date().toISOString();
      set((s) => ({
        pending: withResolved(s.pending, closed, at),
        recent: withResolved(s.recent, closed, at),
        version: s.version + 1,
      }));
      void get().fetchBadge();
      void refreshCounts();
    },

    markRead: async (id) => {
      try {
        await api.patch(`/notifications/${id}/read`);
        const read = (list: AppNotification[]) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n));
        set((s) => ({ pending: read(s.pending), recent: read(s.recent), version: s.version + 1 }));
        await get().fetchBadge();
      } catch {
        // silent
      }
    },

    markAllRead: async () => {
      try {
        await api.patch("/notifications/read-all");
        const read = (list: AppNotification[]) => list.map((n) => ({ ...n, isRead: true }));
        set((s) => ({ pending: read(s.pending), recent: read(s.recent), badge: 0, version: s.version + 1 }));
      } catch {
        // silent
      }
    },
  };
});
