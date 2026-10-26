import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CHAT_ADMIN_KEYS } from "./chat-admin-queries";
import type { ChatBannedRow } from "./chat-admin-types";
import { ChatBannedTab } from "./chat-banned-tab";

function render(prepare: (qc: QueryClient) => void = () => {}): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  prepare(qc);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(ChatBannedTab)));
}

const row = (over: Partial<ChatBannedRow> = {}): ChatBannedRow => ({
  id: 2, name: "Vali Aliyev", username: "vali", chatBannedAt: "2026-10-25T10:00:00.000Z", ...over,
});
const key = CHAT_ADMIN_KEYS.banned;
const fail = (qc: QueryClient) =>
  qc.getQueryCache().build(qc, { queryKey: key }).setState({ status: "error", error: new Error("x"), fetchStatus: "idle" });

describe("ChatBannedTab", () => {
  it("draws skeleton rows while there is no answer", () => {
    const out = render();
    expect(out).toContain("animate-pulse");
    expect(out).not.toContain("chiqarilgan o&#x27;quvchi yo&#x27;q");
  });

  it("offers a retry when the first load failed", () => {
    expect(render(fail)).toContain("Qayta urinish");
  });

  it("keeps the table when a background refetch failed", () => {
    const out = render((qc) => {
      qc.setQueryData(key, [row()]);
      qc.getQueryCache().find({ queryKey: key })!.setState({ status: "error", error: new Error("x"), data: [row()], fetchStatus: "idle" });
    });
    expect(out).toContain("Vali Aliyev");
    expect(out).not.toContain("Qayta urinish");
  });

  it("shows the actionable empty state", () => {
    expect(render((qc) => qc.setQueryData(key, []))).toContain("shikoyatni ko&#x27;rib chiqishda");
  });

  it("draws rows with and without @nom", () => {
    const out = render((qc) => qc.setQueryData(key, [row(), row({ id: 3, name: "Ali Valiyev", username: null })]));
    expect(out).toContain("@vali");
    expect(out).toContain("Ali Valiyev");
    expect(out).toContain("—");
    expect(out).toContain("25.10.2026, 15:00");
    expect(out).toContain("border-r");
    expect(out).toContain("Amallar");
    expect(out).not.toContain("Eng yangi");
  });

  it("says the list is capped at 200 rows", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row({ id: i + 1 }));
    expect(render((qc) => qc.setQueryData(key, rows))).toContain("Eng yangi 200 tasi");
  });
});
