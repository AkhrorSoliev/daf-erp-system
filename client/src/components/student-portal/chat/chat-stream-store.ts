import { create } from "zustand";

/** How long «yozmoqda…» stays after the last typing ping. */
export const TYPING_SHOW_MS = 5000;

interface ChatStreamState {
  /** The live stream is open: polling can slow down. */
  connected: boolean;
  /** conversationId -> the ping's time; removed by a timeout, so no one needs a clock in render. */
  typing: Record<string, number>;
  setConnected: (v: boolean) => void;
  markTyping: (conversationId: string) => void;
  clearTyping: (conversationId: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useChatStream = create<ChatStreamState>((set, get) => ({
  connected: false,
  typing: {},
  setConnected: (connected) => set({ connected }),
  markTyping: (id) => {
    const old = timers.get(id);
    if (old) clearTimeout(old);
    timers.set(
      id,
      setTimeout(() => get().clearTyping(id), TYPING_SHOW_MS),
    );
    set((s) => ({ typing: { ...s.typing, [id]: Date.now() } }));
  },
  clearTyping: (id) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    if (!(id in get().typing)) return;
    set((s) => {
      const rest = { ...s.typing };
      delete rest[id];
      return { typing: rest };
    });
  },
}));

export const useChatStreamConnected = () => useChatStream((s) => s.connected);
export const useChatPeerTyping = (conversationId: string) =>
  useChatStream((s) => conversationId in s.typing);
