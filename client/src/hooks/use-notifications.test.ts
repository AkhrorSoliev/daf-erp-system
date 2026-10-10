import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification, NotificationCounts } from "@/components/notifications/notification-view";
import { useNotifications, type NotificationPage } from "./use-notifications";

const { get, patch } = vi.hoisted(() => ({
  get: vi.fn<(url: string, config?: { params?: Record<string, unknown> }) => Promise<unknown>>(),
  patch: vi.fn<(url: string) => Promise<unknown>>(),
}));
vi.mock("@/lib/api", () => ({ default: { get, patch } }));

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const row = (id: string, over: Partial<AppNotification> = {}): AppNotification => ({
  id,
  type: "COMMENT",
  group: "task",
  title: id,
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
const waiting = (id: string, over: Partial<AppNotification> = {}) =>
  row(id, { type: "TASK_REVIEW", actionRequired: true, ...over });

const COUNTS: NotificationCounts = { pending: 1, all: 3, groups: { task: 3, attendance: 0, payment: 0, system: 0 } };
const ok = <T>(data: T) => ({ data });
const page = (data: AppNotification[]) => ok<NotificationPage>({ data, nextCursor: null });

/** The three requests of one `loadPanel`, in the order it sends them. */
const panelAnswer = (pending: AppNotification[], recent: AppNotification[], counts = COUNTS) =>
  [page(pending), page(recent), ok(counts)] as const;

const state = () => useNotifications.getState();
const ids = (list: AppNotification[]) => list.map((n) => n.id);
const urlsAsked = () => get.mock.calls.map(([url]) => url);

beforeEach(() => {
  useNotifications.setState(useNotifications.getInitialState(), true);
  get.mockReset();
  patch.mockReset();
  // `add` rings; node has no Audio.
  vi.stubGlobal(
    "Audio",
    class {
      volume = 1;
      play = () => Promise.resolve();
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("add", () => {
  beforeEach(() => {
    get.mockResolvedValue(ok({ count: 4 }));
  });

  it("puts a new row first, waiting rows into «Kutilmoqda» too, and asks the server for the badge", async () => {
    useNotifications.setState({ recent: [row("old")], pending: [] });

    state().add(waiting("w1"));
    state().add(row("i1"));

    expect(ids(state().recent)).toEqual(["i1", "w1", "old"]);
    expect(ids(state().pending)).toEqual(["w1"]);
    expect(state().version).toBe(2);
    await vi.waitFor(() => expect(state().badge).toBe(4));
  });

  it("does not list a row twice when the panel already fetched it before its SSE arrived", () => {
    const seen = waiting("w1");
    useNotifications.setState({ recent: [seen], pending: [seen] });

    state().add(waiting("w1"));

    expect(ids(state().recent)).toEqual(["w1"]);
    expect(ids(state().pending)).toEqual(["w1"]);
    expect(state().version).toBe(1);
  });

  it("keeps a row of another type out of a filtered list", () => {
    useNotifications.setState({ chip: "attendance", recent: [], pending: [] });

    state().add(waiting("task-row", { group: "task" }));
    expect(state().recent).toEqual([]);
    expect(state().pending).toEqual([]);

    state().add(waiting("lesson-row", { group: "attendance", type: "ATTENDANCE_ADMIN_ALERT" }));
    expect(ids(state().recent)).toEqual(["lesson-row"]);
    expect(ids(state().pending)).toEqual(["lesson-row"]);
  });

  it("keeps the panel's tab numbers in step once the panel has been opened", async () => {
    useNotifications.setState({ counts: COUNTS });
    get.mockImplementation(async (url) => (url === "/notifications/counts" ? ok({ ...COUNTS, pending: 2 }) : ok({ count: 1 })));

    state().add(waiting("w1"));

    await vi.waitFor(() => expect(state().counts?.pending).toBe(2));
  });

  it("does not ask for the tab numbers before the panel was ever opened", () => {
    state().add(row("i1"));
    expect(urlsAsked()).not.toContain("/notifications/counts");
  });
});

describe("resolve", () => {
  it("marks the rows closed in both lists, leaves others and earlier closings alone, and moves the badge", async () => {
    const closedEarlier = waiting("done", { resolvedAt: "2026-10-10T04:00:00.000Z" });
    useNotifications.setState({
      badge: 3,
      pending: [waiting("a"), waiting("b"), closedEarlier],
      recent: [waiting("a"), waiting("b"), closedEarlier, row("info")],
    });
    get.mockResolvedValue(ok({ count: 1 }));

    state().resolve(["a", "done", "info"], "2026-10-10T06:00:00.000Z");

    const closedAt = (list: AppNotification[]) => list.map((n) => [n.id, n.resolvedAt]);
    expect(closedAt(state().pending)).toEqual([
      ["a", "2026-10-10T06:00:00.000Z"],
      ["b", null],
      ["done", "2026-10-10T04:00:00.000Z"],
    ]);
    expect(closedAt(state().recent)).toEqual([
      ["a", "2026-10-10T06:00:00.000Z"],
      ["b", null],
      ["done", "2026-10-10T04:00:00.000Z"],
      ["info", "2026-10-10T06:00:00.000Z"],
    ]);
    expect(state().version).toBe(1);
    // The server's number, not a local subtraction.
    await vi.waitFor(() => expect(state().badge).toBe(1));
    expect(urlsAsked()).toContain("/notifications/unread-count");
  });
});

describe("loadPanel", () => {
  it("asks for the waiting and the newest rows of the chip's type, and the counts", async () => {
    get.mockResolvedValueOnce(page([waiting("w")])).mockResolvedValueOnce(page([waiting("w"), row("i")])).mockResolvedValueOnce(ok(COUNTS));

    await state().loadPanel("task");

    expect(get.mock.calls.map(([url, cfg]) => [url, cfg?.params?.filter, cfg?.params?.type])).toEqual([
      ["/notifications", "pending", "task"],
      ["/notifications", "all", "task"],
      ["/notifications/counts", undefined, undefined],
    ]);
    expect(state().chip).toBe("task");
    expect(ids(state().pending)).toEqual(["w"]);
    expect(ids(state().recent)).toEqual(["w", "i"]);
    expect(state().counts).toEqual(COUNTS);
    expect(state().loading).toBe(false);
  });

  it("ignores an older response that resolves after a newer one", async () => {
    const older = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    get.mockReturnValueOnce(older[0].promise).mockReturnValueOnce(older[1].promise).mockReturnValueOnce(older[2].promise);
    const newer = panelAnswer([], [row("fresh")]);
    get.mockResolvedValueOnce(newer[0]).mockResolvedValueOnce(newer[1]).mockResolvedValueOnce(newer[2]);

    const first = state().loadPanel(null);
    const second = state().loadPanel(null);
    await second;
    const stale = panelAnswer([waiting("stale")], [waiting("stale")]);
    older.forEach((d, i) => d.resolve(stale[i]));
    await first;

    expect(ids(state().recent)).toEqual(["fresh"]);
    expect(state().pending).toEqual([]);
    expect(state().loading).toBe(false);
  });

  it("ignores the older response when it is the one that fails, and does not clear the newer one's loading flag", async () => {
    const older = deferred<unknown>();
    get.mockReturnValueOnce(older.promise).mockResolvedValueOnce(page([])).mockResolvedValueOnce(ok(COUNTS));
    const newer = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    get.mockReturnValueOnce(newer[0].promise).mockReturnValueOnce(newer[1].promise).mockReturnValueOnce(newer[2].promise);

    const first = state().loadPanel(null);
    const second = state().loadPanel("payment");
    older.reject(new Error("network"));
    await first;
    expect(state().loading).toBe(true);

    const fresh = panelAnswer([], [row("fresh", { group: "payment" })]);
    newer.forEach((d, i) => d.resolve(fresh[i]));
    await second;

    expect(state().chip).toBe("payment");
    expect(ids(state().recent)).toEqual(["fresh"]);
    expect(state().loading).toBe(false);
  });

  it("keeps what it showed when the request fails", async () => {
    useNotifications.setState({ recent: [row("kept")] });
    get.mockRejectedValue(new Error("network"));

    await state().loadPanel(null);

    expect(ids(state().recent)).toEqual(["kept"]);
    expect(state().loading).toBe(false);
  });
});

describe("markRead / markAllRead", () => {
  it("marks one row read in both lists, then takes the server's badge", async () => {
    useNotifications.setState({ pending: [waiting("a")], recent: [waiting("a"), row("b")] });
    patch.mockResolvedValue({});
    get.mockResolvedValue(ok({ count: 0 }));

    await state().markRead("a");

    expect(patch).toHaveBeenCalledWith("/notifications/a/read");
    expect(state().pending[0].isRead).toBe(true);
    expect(state().recent.map((n) => n.isRead)).toEqual([true, false]);
    expect(state().badge).toBe(0);
  });

  it("marks everything read and zeroes the badge", async () => {
    useNotifications.setState({ badge: 5, pending: [waiting("a")], recent: [waiting("a"), row("b")] });
    patch.mockResolvedValue({});

    await state().markAllRead();

    expect(patch).toHaveBeenCalledWith("/notifications/read-all");
    expect(state().recent.every((n) => n.isRead)).toBe(true);
    expect(state().badge).toBe(0);
  });
});
