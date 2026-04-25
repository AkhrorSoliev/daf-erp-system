import { useEffect, useRef } from "react";
import Cookies from "js-cookie";
import { useNotifications } from "./use-notifications";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export function useSSE() {
  const addNotification = useNotifications((s) => s.addNotification);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const token = Cookies.get("token");
      if (!token) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_URL}/notifications/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        retryCount.current = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (mounted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.type === "notification" && payload.notification) {
                  addNotification(payload.notification);
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
      }

      // Reconnect with exponential backoff
      if (mounted) {
        const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
        retryCount.current++;
        reconnectTimeout.current = setTimeout(connect, delay);
      }
    }

    connect();

    return () => {
      mounted = false;
      abortRef.current?.abort();
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [addNotification]);
}
