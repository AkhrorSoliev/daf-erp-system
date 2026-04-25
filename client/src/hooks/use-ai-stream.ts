import { useCallback, useRef } from "react";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (messageId: string, suggestions: string[]) => void;
  onError: (message: string) => void;
}

export function useAiStream() {
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      content: string,
      callbacks: StreamCallbacks
    ) => {
      const token = Cookies.get("token");
      if (!token) {
        callbacks.onError("Avtorizatsiya topilmadi");
        return;
      }

      // Abort any previous stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `${API_URL}/student-portal/ai-chat/${conversationId}/stream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content }),
            signal: controller.signal,
          }
        );

        if (!response.ok || !response.body) {
          callbacks.onError("AI javob berishda xatolik yuz berdi");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.type === "chunk") {
                  callbacks.onChunk(payload.content);
                } else if (payload.type === "done") {
                  callbacks.onDone(
                    payload.messageId,
                    payload.suggestions ?? []
                  );
                } else if (payload.type === "error") {
                  callbacks.onError(
                    payload.message || "AI javob berishda xatolik yuz berdi"
                  );
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        callbacks.onError("Tarmoq xatosi yuz berdi");
      }
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, abort };
}
