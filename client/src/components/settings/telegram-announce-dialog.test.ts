import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// A dialog's content renders in a portal, and only while open; draw it inline
// so the markup carries what the admin reads once the dialog is opened.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children);
  return {
    Dialog: Pass,
    DialogTrigger: Pass,
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogClose: Pass,
  };
});

import {
  TEMPLATES,
  TelegramAnnounceDialog,
  VAR_LABELS,
} from "./telegram-announce-dialog";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const html = renderToStaticMarkup(
  createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(TelegramAnnounceDialog),
  ),
);
const text = norm(html);

// The CEO reads Uzbek only (A3.6). The server keys of a template's variables
// (`title`, `body`, …) stay English; the admin never reads them.
describe("TelegramAnnounceDialog — Uzbek only", () => {
  it("titles the dialog and its preview in Uzbek", () => {
    expect(text).toContain("Yangilik e'loni yuborish");
    expect(text).toContain("Ko'rinish");
    expect(text).not.toMatch(/preview|feature/i);
  });

  it("names the default template's variables in Uzbek: label, placeholder and the unfilled marker", () => {
    // «Umumiy e'lon» is the template the dialog opens on: {{title}} and {{body}}.
    expect(html).toContain('placeholder="Sarlavha"');
    expect(html).toContain('placeholder="Matn"');
    expect(text).toContain("[?Sarlavha?]");
    expect(text).toContain("[?Matn?]");
    expect(text).not.toMatch(/\[\?(title|body)\?\]/);
  });

  it("has an Uzbek label for every variable of every template", () => {
    for (const [template, { vars }] of Object.entries(TEMPLATES)) {
      for (const v of vars) {
        expect(VAR_LABELS[v], `${template}.${v}`).toBeDefined();
      }
    }
    // A label that equals its key would be the English word again.
    for (const [key, label] of Object.entries(VAR_LABELS)) {
      expect(label, key).not.toBe(key);
    }
  });

  // A toast is not part of the markup, so the source is read, as
  // `payments-overview.test.ts` does for the tooltips a closed card hides.
  it("the dry-run toast says «Ko'rinish tayyor»", () => {
    const source = readFileSync(
      join(__dirname, "telegram-announce-dialog.tsx"),
      "utf-8",
    );

    expect(source).toContain(
      "Ko'rinish tayyor — ${data.recipientCount} ta guruhga yuboriladi",
    );
    expect(source).not.toContain("Preview tayyor");
  });
});
