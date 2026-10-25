import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/chat",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CHAT_KEYS } from "./chat-queries";
import { ChatListPage } from "./chat-list-page";
import type { ConversationView } from "./chat-types";

const FAILED = new Error("Network Error");

async function render(
  outcome: unknown,
  { offline = false }: { offline?: boolean } = {},
): Promise<string> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
  await client.prefetchQuery({
    queryKey: CHAT_KEYS.list,
    queryFn: () =>
      outcome instanceof Error ? Promise.reject(outcome) : outcome,
  });
  onlineManager.setOnline(!offline);
  let html: string;
  try {
    html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(ChatListPage)),
    );
  } finally {
    onlineManager.setOnline(true);
  }
  return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

const conv = (over: Partial<ConversationView>): ConversationView => ({
  id: "c1",
  peer: { id: 2, firstName: "Madina", lastName: "Aliyeva", username: null, photo: null },
  lastMessage: { preview: "Salom, qalaysan?", at: new Date().toISOString(), mine: false },
  unread: 0,
  ...over,
});

describe("chat list", () => {
  it("failed request says so, not that there are no chats", async () => {
    const text = await render(FAILED);
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).not.toContain("Hali yozishma yo'q");
  });

  it("offline request says so, not that there are no chats", async () => {
    // paused only when there is nothing cached
    const client = new QueryClient();
    onlineManager.setOnline(false);
    let html: string;
    try {
      html = renderToStaticMarkup(
        createElement(QueryClientProvider, { client }, createElement(ChatListPage)),
      );
    } finally {
      onlineManager.setOnline(true);
    }
    expect(html).toContain("Internet aloqasi yo&#x27;q");
    expect(html).not.toContain("Hali yozishma yo&#x27;q");
  });

  it("empty list shows the empty state", async () => {
    const text = await render([]);
    expect(text).toContain("Hali yozishma yo'q");
    expect(text).toContain("Yangi chat");
  });

  it("shows names, own-message prefix and unread badge", async () => {
    const text = await render([
      conv({ unread: 3 }),
      conv({
        id: "c2",
        peer: { id: 3, firstName: "Ali", lastName: "Valiyev", username: null, photo: null },
        lastMessage: { preview: "Xo'p", at: new Date().toISOString(), mine: true },
      }),
    ]);
    expect(text).toContain("Madina Aliyeva");
    expect(text).toContain("Siz: Xo'p");
    expect(text).toMatch(/Salom, qalaysan\?\s+3/);
  });
});
