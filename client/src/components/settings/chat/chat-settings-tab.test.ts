import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CHAT_ADMIN_KEYS } from "./chat-admin-queries";
import { ChatSettingsTab } from "./chat-settings-tab";

function render(prepare: (qc: QueryClient) => void): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  prepare(qc);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(ChatSettingsTab)));
}

describe("ChatSettingsTab", () => {
  it("draws a skeleton and no form while there is no answer", () => {
    const out = render(() => {});
    expect(out).not.toContain("Chat yoqilgan");
    expect(out).toContain("animate-pulse");
  });

  it("offers a retry when the request failed", () => {
    const out = render((qc) => {
      qc.getQueryCache()
        .build(qc, { queryKey: CHAT_ADMIN_KEYS.settings })
        .setState({ status: "error", error: new Error("x"), fetchStatus: "idle" });
    });
    expect(out).toContain("Qayta urinish");
    expect(out).not.toContain("Chat yoqilgan");
  });

  it("keeps the form when a background refetch failed but data exists", () => {
    const out = render((qc) => {
      qc.setQueryData(CHAT_ADMIN_KEYS.settings, { enabled: false, weekMinutesActive: 30, weekMinutesRadio: 10 });
      qc.getQueryCache()
        .build(qc, { queryKey: CHAT_ADMIN_KEYS.settings })
        .setState({
          status: "error",
          error: new Error("x"),
          fetchStatus: "idle",
          data: { enabled: false, weekMinutesActive: 30, weekMinutesRadio: 10 },
        });
    });
    expect(out).toContain("Chat yoqilgan");
    expect(out).toContain('value="30"');
    expect(out).not.toContain("Qayta urinish");
  });

  it("shows the switch off and the two saved values", () => {
    const out = render((qc) =>
      qc.setQueryData(CHAT_ADMIN_KEYS.settings, { enabled: false, weekMinutesActive: 30, weekMinutesRadio: 10 }),
    );
    expect(out).toContain("Chat yoqilgan");
    expect(out).toContain('aria-checked="false"');
    expect(out).toContain('value="30"');
    expect(out).toContain('value="10"');
    expect(out).not.toContain("Saqlanmagan");
  });
});
