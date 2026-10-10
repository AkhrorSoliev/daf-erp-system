import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationEmpty, NotificationRowView } from "./notification-row";
import { groupNotifications, type AppNotification } from "./notification-view";

// 10.10.2026, 12:00 in Tashkent.
const NOW = new Date("2026-10-10T07:00:00.000Z");
const details = (group: string, teacher: string) =>
  `📋 Dars tugadi, davomat olinmadi\n\n👥 Guruh: ${group}\n🕐 Vaqt: 09:00–10:30\n🚪 Xona: 201\n👨‍🏫 O'qituvchi: ${teacher}\n\nBatafsil.\n🔗 https://admin.dafzentrum.uz/tasks`;
const alert = (id: string, group: string, over: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: "ATTENDANCE_ADMIN_ALERT",
  group: "attendance",
  title: "O'qituvchi hali davomat olmadi",
  message: details(group, "Tursunova Sardora"),
  relatedEntityType: "Group",
  relatedEntityId: id,
  commentId: null,
  taskId: null,
  isRead: false,
  actionRequired: true,
  resolvedAt: null,
  groupKey: "ATTENDANCE_ADMIN_ALERT:2026-10-10",
  createdAt: "2026-10-10T06:40:00.000Z",
  ...over,
});

/** What the viewer reads: tags dropped, entities turned back into characters. */
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/&#x27;/g, "'");
const readable = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

const view = (items: AppNotification[], collapsible: boolean) => {
  const [row] = groupNotifications(items);
  return render(
    createElement(NotificationRowView, {
      row,
      now: NOW,
      collapsible,
      onOpen: () => {},
      hrefOf: (n: AppNotification) => `/groups/${n.id}`,
    }),
  );
};

describe("NotificationRowView", () => {
  const three = [alert("a1", "A1-3"), alert("a2", "A2-1"), alert("a3", "B1-2")];

  it("shows a folded alert's sub-rows in the panel, one line each, with their buttons", () => {
    const html = view(three, false);
    const text = readable(html);
    expect(text).toContain("Davomat olinmagan · 3 guruh");
    expect(text).toContain("Dars tugashiga 30 daqiqadan kam qoldi");
    for (const group of ["A1-3", "A2-1", "B1-2"]) {
      expect(text).toContain(`${group} · 09:00–10:30 · Tursunova Sardora`);
    }
    expect(html.match(/class="[^"]*\btruncate\b/g)).toHaveLength(3);
    expect(html.match(/>Ochish</g)).toHaveLength(3);
    // The portal link line of the message never reaches the screen.
    expect(html).not.toContain("https://");
    expect(html).not.toContain("Ko'rish");
  });

  it("folds the page's group until «Ko'rish», naming the groups", () => {
    const html = view(three, true);
    expect(html).toContain("Ko'rish");
    expect(readable(html)).toContain("A1-3, A2-1, B1-2 · 20 daqiqa oldin");
    expect(html).not.toContain("Tursunova");
  });

  it("greys a closed group and says when it closed itself", () => {
    const closed = ["a1", "a2"].map((id) =>
      alert(id, id, { resolvedAt: "2026-10-10T05:05:00.000Z" }),
    );
    const html = view(closed, false);
    expect(readable(html)).toContain("O'zi yopildi · 10:05");
    expect(html).toContain("opacity-60");
    expect(html).not.toContain(">Ochish<");
  });

  it("shows a lone alert as one short line and an action button", () => {
    const html = view([alert("a1", "A1-3")], false);
    expect(readable(html)).toContain("A1-3 · 09:00–10:30 · Tursunova Sardora");
    expect(readable(html)).toContain("20 daqiqa oldin");
    expect(html).toContain(">Ochish<");
    expect(html).not.toContain("https://");
  });

  it("marks a task notice for review with «Ko'rish» and a closed one with its closing time", () => {
    const review: AppNotification = {
      ...alert("t1", "x"),
      type: "TASK_REVIEW",
      group: "task",
      title: "Tekshiruvga keldi",
      message: "Rahimov A.",
      groupKey: null,
    };
    expect(view([review], false)).toContain(">Ko'rish<");
    const closed = view([{ ...review, resolvedAt: "2026-10-10T03:40:00.000Z" }], false);
    expect(readable(closed)).toContain("Eslatma o'zi yopildi · 08:40");
    expect(closed).not.toContain("<button");
  });
});

describe("NotificationEmpty", () => {
  it("prints its text", () => {
    expect(render(createElement(NotificationEmpty, { text: "Sizdan hech narsa kutilmayapti" }))).toContain(
      "Sizdan hech narsa kutilmayapti",
    );
  });
});
