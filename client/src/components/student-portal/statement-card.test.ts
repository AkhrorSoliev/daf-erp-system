import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ miniApp: false }));

vi.mock("@/hooks/use-is-mini-app", () => ({
  useIsMiniApp: () => state.miniApp,
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/lib/download-file", () => ({ downloadAuthedFile: vi.fn() }));

import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { StatementCard, deliverStatement } from "./statement-card";

afterEach(() => {
  state.miniApp = false;
  vi.mocked(api.post).mockReset();
  vi.mocked(downloadAuthedFile).mockReset();
});

const render = () =>
  renderToStaticMarkup(createElement(StatementCard)).replace(/&#x27;/g, "'");

describe("StatementCard", () => {
  it("offers the statement PDF under the balance", () => {
    const html = render();
    expect(html).toContain("To'lovlar hisoboti");
    expect(html).toContain(
      "Har bir to'lovingiz qaysi darslarga ketgani, oyma-oy",
    );
    expect(html).toContain("PDF yuklab olish");
    expect(html).toContain("bg-coral-500");
  });

  it("offers to send it to Telegram inside the Mini App", () => {
    state.miniApp = true;
    const html = render();
    expect(html).toContain("Telegram'ga yuborish");
    expect(html).not.toContain("PDF yuklab olish");
  });
});

describe("deliverStatement — what a tap does", () => {
  it("has the bot send the PDF to the chat inside the Mini App", async () => {
    await deliverStatement(true);

    expect(api.post).toHaveBeenCalledExactlyOnceWith(
      "/student-portal/statement/telegram",
    );
    expect(downloadAuthedFile).not.toHaveBeenCalled();
  });

  it("downloads the PDF on the web portal", async () => {
    await deliverStatement(false);

    expect(downloadAuthedFile).toHaveBeenCalledExactlyOnceWith(
      "/student-portal/statement.pdf",
      "tolovlar-hisoboti.pdf",
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lets a failed send reach the card, which shows the server's reason", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Request failed"));
    await expect(deliverStatement(true)).rejects.toThrow("Request failed");
  });
});
