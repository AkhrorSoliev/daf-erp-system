import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/chat/new",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { NewChatPage } from "./new-chat-page";

// Static render: the field is empty, so no search runs and no row is drawn.
function render(): string {
  const client = new QueryClient();
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(NewChatPage)),
  );
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

describe("NewChatPage (static)", () => {
  it("draws the title and no result or empty state before typing", () => {
    const text = render();
    expect(text).toContain("Yangi chat");
    expect(text).not.toContain("Topilmadi");
    expect(text).not.toContain("ni ochish");
  });
});
