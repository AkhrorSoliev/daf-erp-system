import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationPageList } from "./notification-page-list";
import type { AppNotification } from "./notification-view";

// 10.10.2026, 12:00 in Tashkent.
const NOW = new Date("2026-10-10T07:00:00.000Z");
const row = (id: string, createdAt: string, over: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: "COMMENT",
  group: "task",
  title: `Xabar ${id}`,
  message: "Matn",
  relatedEntityType: null,
  relatedEntityId: null,
  commentId: null,
  taskId: null,
  isRead: true,
  actionRequired: false,
  resolvedAt: null,
  groupKey: null,
  createdAt,
  ...over,
});

const EMPTY = "Sizdan hech narsa kutilmayapti";
const FAILED = "Ma'lumotni yuklab bo'lmadi";

/** What the viewer reads: entities turned back into characters. */
const render = (props: { items: AppNotification[] | undefined; failed?: boolean }) =>
  renderToStaticMarkup(
    createElement(NotificationPageList, {
      items: props.items,
      failed: props.failed ?? false,
      emptyText: EMPTY,
      now: NOW,
      onOpen: () => {},
      hrefOf: () => null,
      onRetry: () => {},
    }),
  ).replace(/&#x27;/g, "'");

describe("NotificationPageList", () => {
  it("shows a skeleton, never the empty text, while the first answer is on its way", () => {
    const html = render({ items: undefined });
    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain(EMPTY);
    expect(html).not.toContain(FAILED);
  });

  it("shows the retry, never the empty text, when the request failed", () => {
    const html = render({ items: undefined, failed: true });
    expect(html).toContain(FAILED);
    expect(html).toContain("Qayta urinish");
    expect(html).not.toContain(EMPTY);
  });

  it("shows the empty text only after an answer that really was empty", () => {
    const html = render({ items: [] });
    expect(html).toContain(EMPTY);
    expect(html).not.toContain('data-slot="skeleton"');
  });

  it("keeps the rows it has when a later refresh failed", () => {
    const html = render({ items: [row("a", "2026-10-10T06:00:00.000Z")], failed: true });
    expect(html).toContain("Xabar a");
    expect(html).not.toContain(FAILED);
  });

  it("heads each Tashkent day: «Bugun», «Kecha», then the date", () => {
    const html = render({
      items: [
        row("a", "2026-10-10T06:00:00.000Z"),
        // 23:30 in Tashkent on the 9th (18:30 UTC) is still «Kecha».
        row("b", "2026-10-09T18:30:00.000Z"),
        row("c", "2026-10-03T10:00:00.000Z"),
      ],
    });
    const days = [...html.matchAll(/<p class="border-b bg-muted\/30[^>]*>([^<]+)<\/p>/g)].map((m) => m[1]);
    expect(days).toEqual(["Bugun", "Kecha", "03.10.2026"]);
  });

  it("starts a new day at Tashkent midnight, not the browser's", () => {
    // 19:30 UTC on the 9th is 00:30 on the 10th in Tashkent: «Bugun».
    const html = render({ items: [row("a", "2026-10-09T19:30:00.000Z")] });
    expect(html).toContain(">Bugun</p>");
    expect(html).not.toContain(">Kecha</p>");
  });
});
