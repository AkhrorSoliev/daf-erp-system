import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/context";
import ru from "@/i18n/dictionaries/ru";
import { NotificationEmpty, NotificationFailed, NotificationRowView } from "./notification-row";
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

describe("in Russian", () => {
  const inRussian = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
    render(
      createElement(
        I18nProvider,
        // `children` is the third argument (react/no-children-prop).
        { initialLocale: "ru", initialDictionary: ru } as ComponentProps<typeof I18nProvider>,
        el,
      ),
    );
  const row = (items: AppNotification[], collapsible: boolean) =>
    createElement(NotificationRowView, {
      row: groupNotifications(items)[0],
      now: NOW,
      collapsible,
      onOpen: () => {},
      hrefOf: (n: AppNotification) => `/groups/${n.id}`,
    });
  const three = [alert("a1", "A1-3"), alert("a2", "A2-1"), alert("a3", "B1-2")];

  it("translates a folded alert's words and buttons, and keeps the server's text and the data", () => {
    const text = readable(inRussian(row(three, false)));
    expect(text).toContain("Посещаемость не отмечена · групп: 3");
    expect(text).toContain("До конца занятия осталось меньше 30 минут");
    expect(text).toContain("Открыть");
    expect(text).toContain("A1-3 · 09:00–10:30 · Tursunova Sardora");
    expect(text).not.toContain("Ochish");
  });

  it("translates the page's folded line, its relative time and its toggle", () => {
    const text = readable(inRussian(row(three, true)));
    expect(text).toContain("A1-3, A2-1, B1-2 · 20 мин. назад");
    expect(text).toContain("Посмотреть");
  });

  it("keeps the title and text the server sent", () => {
    const text = readable(inRussian(row([alert("a1", "A1-3", { groupKey: null })], false)));
    expect(text).toContain("O'qituvchi hali davomat olmadi");
    expect(text).toContain("20 мин. назад");
  });

  it("translates the failure and the retry", () => {
    const html = inRussian(createElement(NotificationFailed, { onRetry: () => {} }));
    expect(html).toContain("Не удалось загрузить данные");
    expect(html).toContain("Повторить");
  });
});

describe("NotificationEmpty", () => {
  it("prints its text", () => {
    expect(render(createElement(NotificationEmpty, { text: "Sizdan hech narsa kutilmayapti" }))).toContain(
      "Sizdan hech narsa kutilmayapti",
    );
  });
});

describe("NotificationFailed", () => {
  it("says the list did not load and offers a retry, never the empty text", () => {
    const html = render(createElement(NotificationFailed, { onRetry: () => {} }));
    expect(html).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(html).toContain("Qayta urinish");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("kutilmayapti");
  });
});
