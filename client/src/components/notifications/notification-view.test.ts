import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  actionLabel,
  dayLabel,
  groupByDay,
  groupHint,
  groupNotifications,
  groupTitle,
  lessonLine,
  lessonParts,
  panelSections,
  relativeTime,
  viewCount,
  viewParams,
  type AppNotification,
  type NotificationRow,
} from "./notification-view";

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: "n",
  type: "SYSTEM",
  group: "system",
  title: "Sarlavha",
  message: "Matn",
  relatedEntityType: null,
  relatedEntityId: null,
  commentId: null,
  taskId: null,
  isRead: false,
  actionRequired: false,
  resolvedAt: null,
  groupKey: null,
  createdAt: "2026-10-10T05:00:00.000Z",
  ...over,
});

// 10.10.2026, 12:00 in Tashkent.
const NOW = new Date("2026-10-10T07:00:00.000Z");
const DETAILS =
  "📋 Dars tugadi, davomat olinmadi\n\n👥 Guruh: A1-3\n🕐 Vaqt: 09:00–10:30\n🚪 Xona: 201\n👨‍🏫 O'qituvchi: Tursunova Sardora\n\nmatn";
const alert = (id: string, over: Partial<AppNotification> = {}) =>
  n({
    id,
    type: "ATTENDANCE_ADMIN_ALERT",
    group: "attendance",
    actionRequired: true,
    groupKey: "ATTENDANCE_ADMIN_ALERT:2026-10-10",
    message: DETAILS,
    ...over,
  });
const asGroup = (row: NotificationRow) => {
  if (row.kind !== "group") throw new Error("expected a group row");
  return row;
};

describe("NOTIFICATION_TYPES", () => {
  it("lists exactly the server's NotificationType enum", () => {
    const schema = readFileSync(
      join(__dirname, "../../../../server/prisma/schema.prisma"),
      "utf8",
    );
    const body = schema.match(/enum NotificationType \{([^}]*)\}/)![1];
    const server = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//"));
    expect([...NOTIFICATION_TYPES].sort()).toEqual(server.sort());
  });
});

describe("Tashkent clock", () => {
  it("speaks in minutes, then hours, then the clock", () => {
    expect(relativeTime("2026-10-10T06:59:30.000Z", NOW)).toBe("hozirgina");
    expect(relativeTime("2026-10-10T06:55:00.000Z", NOW)).toBe("5 daqiqa oldin");
    expect(relativeTime("2026-10-10T05:00:00.000Z", NOW)).toBe("2 soat oldin");
    expect(relativeTime("2026-10-10T00:00:00.000Z", NOW)).toBe("05:00");
    expect(relativeTime("2026-10-09T18:30:00.000Z", NOW)).toBe("Kecha, 23:30");
  });

  it("names days by the Tashkent calendar, not UTC", () => {
    // 19:30 UTC on the 9th is 00:30 on the 10th in Tashkent.
    expect(dayLabel("2026-10-09T19:30:00.000Z", NOW)).toBe("Bugun");
    expect(dayLabel("2026-10-09T18:30:00.000Z", NOW)).toBe("Kecha");
    expect(dayLabel("2026-10-07T10:00:00.000Z", NOW)).toBe("07.10.2026");
  });

  it("takes the year from the Tashkent day too", () => {
    // 20:00 UTC on 31.12 is 01:00 on 01.01 in Tashkent.
    expect(dayLabel("2025-12-31T20:00:00.000Z", NOW)).toBe("01.01.2026");
  });

  it("treats a time a little ahead of now as «hozirgina»", () => {
    expect(relativeTime("2026-10-10T07:00:30.000Z", NOW)).toBe("hozirgina");
  });
});

describe("groupNotifications", () => {
  it("folds rows sharing a groupKey into one line at the newest one's place", () => {
    const rows = groupNotifications([
      alert("a1"),
      n({ id: "s1" }),
      alert("a2"),
      alert("a3"),
      n({ id: "lone", groupKey: "LESSON_STARTED:2026-10-10" }),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["group", "single", "single"]);
    expect(asGroup(rows[0]).items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(rows[2].key).toBe("lone");
  });

  it("titles a folded line and says what it waits for, or when it closed", () => {
    const open = asGroup(
      groupNotifications([
        alert("a1"),
        alert("a2", { resolvedAt: "2026-10-10T05:05:00.000Z" }),
      ])[0],
    );
    expect(groupTitle(open)).toBe("Davomat olinmagan · 2 guruh");
    expect(groupHint(open)).toBe("Dars tugashiga 30 daqiqadan kam qoldi");

    const closed = asGroup(
      groupNotifications([
        alert("a1", { resolvedAt: "2026-10-10T04:50:00.000Z" }),
        alert("a2", { resolvedAt: "2026-10-10T05:05:00.000Z" }),
      ])[0],
    );
    expect(groupHint(closed)).toBe("O'zi yopildi · 10:05");
  });
});

describe("groupByDay and panelSections", () => {
  it("splits a newest-first list into Tashkent days", () => {
    const days = groupByDay(
      [
        n({ id: "t1", createdAt: "2026-10-10T06:00:00.000Z" }),
        n({ id: "t2", createdAt: "2026-10-09T19:30:00.000Z" }),
        n({ id: "y1", createdAt: "2026-10-09T10:00:00.000Z" }),
      ],
      NOW,
    );
    expect(days.map((d) => [d.label, d.items.map((i) => i.id)])).toEqual([
      ["Bugun", ["t1", "t2"]],
      ["Kecha", ["y1"]],
    ]);
  });

  it("puts what waits first and today's information under it", () => {
    const waiting = alert("w1");
    const closedToday = alert("c1", { resolvedAt: "2026-10-10T06:00:00.000Z" });
    const infoToday = n({ id: "i1" });
    const infoYesterday = n({ id: "i0", createdAt: "2026-10-09T10:00:00.000Z" });
    const { waiting: w, todayInfo } = panelSections(
      [waiting, closedToday],
      [waiting, closedToday, infoToday, infoYesterday],
      NOW,
    );
    expect(w.map((r) => r.key)).toEqual(["w1"]);
    expect(todayInfo.map((r) => r.key)).toEqual(["c1", "i1"]);
  });
});

describe("row text", () => {
  it("reads group, time and teacher from a lesson alert's details", () => {
    expect(lessonParts(DETAILS)).toEqual({
      group: "A1-3",
      time: "09:00–10:30",
      teacher: "Tursunova Sardora",
    });
    expect(lessonLine(alert("a1"))).toBe("A1-3 · 09:00–10:30 · Tursunova Sardora");
  });

  it("shows the first text line when the message is not in the details shape", () => {
    const message = "Dars tugadi, davomat olinmadi (A1-3, 09:00)";
    expect(lessonParts(message)).toEqual({
      group: undefined,
      time: undefined,
      teacher: undefined,
    });
    expect(lessonLine(n({ title: "Sarlavha", message }))).toBe(message);
    // The portal link line under the text is not part of it.
    expect(
      lessonLine(n({ title: "Sarlavha", message: `📋 ${message}\n\nBatafsil.\n🔗 https://admin.dafzentrum.uz/tasks` })),
    ).toBe(`📋 ${message}`);
    expect(lessonLine(n({ title: "Sarlavha", message: "\n🔗 https://admin.dafzentrum.uz" }))).toBe("Sarlavha");
    // A label with nothing after it is not a part, and does not borrow the next line.
    expect(lessonParts("👥 Guruh:\n🕐 Vaqt: 09:00–10:30")).toEqual({
      group: undefined,
      time: "09:00–10:30",
      teacher: undefined,
    });
  });

  it("falls back to the title when the message has no text", () => {
    expect(lessonLine(n({ title: "Faqat sarlavha", message: "  " }))).toBe("Faqat sarlavha");
  });

  it("labels the row button by what it opens", () => {
    expect(actionLabel("TASK_REVIEW")).toBe("Ko'rish");
    expect(actionLabel("PAYMENT_PROMISE_OVERDUE")).toBe("Ochish");
  });
});

describe("page views", () => {
  it("maps the left list onto the API filters", () => {
    expect(viewParams("pending")).toEqual({ filter: "pending" });
    expect(viewParams("all")).toEqual({ filter: "all" });
    expect(viewParams("attendance")).toEqual({ filter: "all", type: "attendance" });
    expect(viewParams("junk")).toEqual({ filter: "pending" });
  });

  it("reads each view's count", () => {
    const counts = {
      pending: 5,
      all: 142,
      groups: { task: 18, attendance: 97, payment: 21, system: 6 },
    };
    expect(viewCount("pending", counts)).toBe(5);
    expect(viewCount("all", counts)).toBe(142);
    expect(viewCount("payment", counts)).toBe(21);
    expect(viewCount("task", undefined)).toBeNull();
  });
});
