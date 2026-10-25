import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/chat/settings",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CHAT_KEYS } from "./chat-queries";
import { ChatSettingsPage } from "./chat-settings-page";

async function render(
  outcome: unknown,
  { offline = false }: { offline?: boolean } = {},
): Promise<string> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
  if (outcome !== "pending") {
    await client.prefetchQuery({
      queryKey: CHAT_KEYS.me,
      queryFn: () =>
        outcome instanceof Error ? Promise.reject(outcome) : outcome,
    });
  }
  onlineManager.setOnline(!offline);
  try {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ChatSettingsPage),
      ),
    );
    return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  } finally {
    onlineManager.setOnline(true);
  }
}

describe("ChatSettingsPage", () => {
  it("shows both sections once /chat/me answered", async () => {
    const text = await render({
      username: "madina_01",
      whoCanWrite: "EVERYONE",
      whoCanFind: "NOBODY",
      whoSeesPhoto: "GROUPMATES",
    });
    expect(text).toContain("Chat sozlamalari");
    expect(text).toContain("Boshqalar sizni shu nom bilan topadi");
    expect(text).toContain("Kim menga yozishi mumkin");
    expect(text).toContain("Guruhdoshlar");
  });
  it("shows the failure, never the form, when the request failed", async () => {
    const text = await render(new Error("Network Error"));
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).not.toContain("Kim menga yozishi mumkin");
  });
  it("shows no form while the answer is pending", async () => {
    const text = await render("pending");
    expect(text).not.toContain("Kim menga yozishi mumkin");
    expect(text).not.toContain("yuklab bo'lmadi");
  });
});
