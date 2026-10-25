import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/chat/c1",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CHAT_KEYS } from "./chat-queries";
import { ChatThreadPage } from "./chat-thread-page";
import type { ChatAccess, MessageView } from "./chat-types";

const FAILED = new Error("Network Error");

const access = (over: Partial<ChatAccess>): ChatAccess => ({
  enabled: true,
  canWrite: true,
  reasons: [],
  messages: [],
  warning: null,
  quota: {
    windowDays: 7,
    activeMin: 0,
    radioMin: 0,
    quota: { activeMin: 30, radioMin: 30 },
    ok: true,
    missingActiveMin: 0,
    missingRadioMin: 0,
    tomorrow: null,
  },
  ...over,
});

const msg = (id: string, text: string, mine: boolean): MessageView => ({
  id,
  senderId: mine ? 1 : 2,
  mine,
  kind: "TEXT",
  text,
  file: null,
  createdAt: new Date().toISOString(),
});

async function render(
  outcome: unknown,
  opts: { offline?: boolean; access?: ChatAccess } = {},
): Promise<string> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
  if (!opts.offline) await client.prefetchInfiniteQuery({
    queryKey: CHAT_KEYS.messages("c1"),
    initialPageParam: undefined as string | undefined,
    queryFn: () =>
      outcome instanceof Error ? Promise.reject(outcome) : outcome,
  });
  if (opts.access) client.setQueryData(CHAT_KEYS.access, opts.access);
  onlineManager.setOnline(!opts.offline);
  let html: string;
  try {
    html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ChatThreadPage, { id: "c1" }),
      ),
    );
  } finally {
    onlineManager.setOnline(true);
  }
  return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

describe("chat thread", () => {
  it("failed request says so, not that the thread is empty", async () => {
    const text = await render(FAILED);
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).not.toContain("Birinchi xabarni yozing");
  });

  it("offline with nothing cached says there is no connection", async () => {
    const text = await render(FAILED, { offline: true });
    expect(text).toContain("Internet aloqasi yo'q");
    expect(text).not.toContain("Birinchi xabarni yozing");
  });

  it("a thread that loaded empty invites the first message", async () => {
    const text = await render({ data: [], nextCursor: null });
    expect(text).toContain("Birinchi xabarni yozing");
  });

  it("draws messages as data, with a fallback title for a direct link", async () => {
    const text = await render(
      { data: [msg("m2", "Qalaysan? <b>x</b>", false), msg("m1", "Salom", true)], nextCursor: null },
      { access: access({}) },
    );
    expect(text).toContain("Suhbat");
    expect(text).toContain("Salom");
    expect(text).toContain("Qalaysan? &lt;b&gt;x&lt;/b&gt;");
    expect(text).toContain("Bugun");
  });

  it("offers older messages when there is another page", async () => {
    const text = await render({ data: [msg("m1", "Salom", true)], nextCursor: "m1" });
    expect(text).toContain("Oldingilarini ko'rsatish");
  });

  it("locked student reads the thread but gets the banner, not the composer", async () => {
    const text = await render(
      { data: [msg("m1", "Salom", false)], nextCursor: null },
      {
        access: access({
          canWrite: false,
          reasons: ["DEBT"],
          messages: ["Qarzingiz bor"],
        }),
      },
    );
    expect(text).toContain("Salom");
    expect(text).toContain("Qarzingiz bor");
    expect(text).not.toContain("Xabar yozing");
  });
});
