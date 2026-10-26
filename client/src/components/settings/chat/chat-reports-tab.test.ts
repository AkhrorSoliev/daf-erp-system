import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/settings/chat",
  useRouter: () => ({ replace: () => {} }),
}));

import { CHAT_ADMIN_KEYS } from "./chat-admin-queries";
import type { ChatReportDetail, ChatReportRow } from "./chat-admin-types";
import { ReportBody } from "./chat-report-drawer";
import { ClosedBlock, ResolveFooter } from "./chat-report-resolve";
import { ChatReportsTab } from "./chat-reports-tab";

function render(node: () => ReturnType<typeof createElement>, prepare: (qc: QueryClient) => void = () => {}): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  prepare(qc);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, node()));
}

const row = (over: Partial<ChatReportRow> = {}): ChatReportRow => ({
  id: "r1", status: "OPEN", reason: "Haqorat qildi", createdAt: "2026-10-26T10:00:00.000Z", conversationId: "c1",
  reporter: { id: 1, name: "Ali Valiyev", username: null, chatBannedAt: null },
  reported: { id: 2, name: "Vali Aliyev", username: "vali", chatBannedAt: "2026-10-25T10:00:00.000Z" },
  ...over,
});
const detail = (over: Partial<ChatReportDetail> = {}): ChatReportDetail => ({
  ...row(), resolvedAt: null, resolutionNote: null,
  snapshot: [
    { id: "m1", senderId: 2, kind: "TEXT", text: "<b>salom</b>", hasFile: false, deleted: true, createdAt: "2026-10-26T09:00:00.000Z" },
    { id: "m2", senderId: 1, kind: "IMAGE", text: null, hasFile: true, deleted: false, createdAt: "2026-10-26T09:01:00.000Z" },
  ],
  ...over,
});
const key = CHAT_ADMIN_KEYS.reportList("OPEN");
const seed = (qc: QueryClient, rows: ChatReportRow[]) =>
  qc.setQueryData(key, { pages: [{ data: rows, nextCursor: null }], pageParams: [null] });

describe("ChatReportsTab", () => {
  it("draws skeleton rows while there is no answer", () => {
    const out = render(() => createElement(ChatReportsTab));
    expect(out).toContain("animate-pulse");
    expect(out).not.toContain("Ochiq shikoyat yo&#x27;q");
  });

  it("offers a retry when the first load failed", () => {
    const out = render(() => createElement(ChatReportsTab), (qc) => {
      qc.getQueryCache().build(qc, { queryKey: key }).setState({ status: "error", error: new Error("x"), fetchStatus: "idle" });
    });
    expect(out).toContain("Qayta urinish");
  });

  it("shows the actionable empty state", () => {
    const out = render(() => createElement(ChatReportsTab), (qc) => seed(qc, []));
    expect(out).toContain("qo&#x27;ng&#x27;iroqchada");
  });

  it("draws rows with the banned mark and the status pill", () => {
    const out = render(() => createElement(ChatReportsTab), (qc) => seed(qc, [row()]));
    expect(out).toContain("Vali Aliyev");
    expect(out).toContain("@vali");
    expect(out).toContain("Chatdan chiqarilgan");
    expect(out).toContain("26.10.2026, 15:00");
    expect(out).toContain("Haqorat qildi");
    expect(out).toContain("border-r");
  });
});

describe("report drawer parts", () => {
  it("draws the copy as text, flags a deleted message and names a file", () => {
    const out = render(() => createElement(ReportBody, { report: detail() }));
    expect(out).toContain("&lt;b&gt;salom&lt;/b&gt;");
    expect(out).not.toContain("<b>salom");
    expect(out).toContain("o&#x27;chirilgan xabar");
    expect(out).toContain("Rasm");
    expect(out).toContain("fayl ko&#x27;rsatilmaydi");
  });

  it("OPEN footer offers the ban checkbox and both outcomes", () => {
    const out = render(() => createElement(ResolveFooter, { report: detail({ reported: { ...row().reported, chatBannedAt: null } }) }));
    expect(out).toContain("Shikoyat qilingan o&#x27;quvchini chatdan chiqarish");
    expect(out).toContain("Hal qilindi");
    expect(out).toContain("Rad etish");
  });

  it("OPEN footer hides the ban checkbox for an already banned student", () => {
    const out = render(() => createElement(ResolveFooter, { report: detail() }));
    expect(out).not.toContain("Shikoyat qilingan o&#x27;quvchini chatdan chiqarish");
  });

  it("closed block shows the note and the unban button for a banned student", () => {
    const out = render(() =>
      createElement(ClosedBlock, { report: detail({ status: "RESOLVED", resolutionNote: "Ogohlantirildi", resolvedAt: "2026-10-26T11:00:00.000Z" }) }),
    );
    expect(out).toContain("Ogohlantirildi");
    expect(out).toContain("26.10.2026, 16:00");
    expect(out).toContain("Chatga qaytarish");
  });
});
