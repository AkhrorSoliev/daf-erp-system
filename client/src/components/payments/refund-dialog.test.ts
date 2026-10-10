import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// A dialog's content renders in a portal, and only while open; draw it inline.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogFooter: Pass };
});

import { RefundDialog } from "./refund-dialog";

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("RefundDialog opens a request (spec B2b §4)", () => {
  it("is titled as a request, ends in «So'rovni ochish», and no longer asks how the money goes back", () => {
    const text = norm(renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(RefundDialog, { open: true, onOpenChange: () => {}, studentId: 10001, studentName: "Ali Valiyev" }))));
    expect(text).toContain("Pulni qaytarish — so'rov");
    expect(text).toContain("#10001 Ali Valiyev");
    expect(text).toContain("Bekor qilish So'rovni ochish");
    expect(text).not.toContain("Qaytarish usuli");
  });
});
