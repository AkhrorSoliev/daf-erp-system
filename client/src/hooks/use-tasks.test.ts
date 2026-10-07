import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import { useTasks, type TaskAccess, type TaskCard, type TaskDetail, type TaskDetailPayload, type TaskEvent, type TaskStatus } from "./use-tasks";

const { get, post, toastError } = vi.hoisted(() => ({
  get: vi.fn<(url: string, config?: { params?: Record<string, unknown> }) => Promise<unknown>>(),
  post: vi.fn<(url: string) => Promise<unknown>>(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: { get, post } }));
vi.mock("react-hot-toast", () => ({ default: { error: toastError } }));

type Page = { data: { data: TaskCard[]; nextCursor: string | null } };
const page = (cards: TaskCard[], nextCursor: string | null = null): Page => ({ data: { data: cards, nextCursor } });
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const card = (id: string, over: Partial<TaskCard> = {}): TaskCard => ({
  id, kind: "MANUAL", title: id, status: "NEW", priority: "MEDIUM", dueAt: null, branchId: null,
  entityType: null, entityId: null, requiresPhoto: false, batchId: null, claimedById: null,
  returnedCount: 0, closedAt: null, createdAt: "2026-10-01T00:00:00Z", author: null,
  assignees: [], watchers: [], stepsTotal: 0, stepsDone: 0, eventsCount: 0, unmarkedLesson: null, ...over,
});
const httpError = (status?: number) =>
  new AxiosError("failed", "ERR", undefined, undefined, status ? ({ status } as AxiosResponse) : undefined);

const state = () => useTasks.getState();
const ids = (status: TaskStatus) => state().columns[status].items.map((t) => t.id);
const seed = (cards: TaskCard[]) =>
  useTasks.setState((s) => {
    const columns = { ...s.columns };
    for (const c of cards) columns[c.status] = { ...columns[c.status], items: [...columns[c.status].items, c] };
    return { columns };
  });

beforeEach(() => {
  useTasks.setState(useTasks.getInitialState(), true);
  get.mockReset();
  post.mockReset();
  toastError.mockReset();
});

describe("fetchColumn", () => {
  it("ignores an older response that resolves after a newer one", async () => {
    const older = deferred<Page>();
    const newer = deferred<Page>();
    get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const first = state().fetchColumn("NEW");
    const second = state().fetchColumn("NEW");
    newer.resolve(page([card("fresh")]));
    await second;
    older.resolve(page([card("stale")]));
    await first;

    expect(ids("NEW")).toEqual(["fresh"]);
    expect(state().columns.NEW.loading).toBe(false);
  });

  it("ignores the older response when it is the one that fails", async () => {
    const older = deferred<Page>();
    get.mockReturnValueOnce(older.promise).mockResolvedValueOnce(page([card("fresh")]));

    const first = state().fetchColumn("NEW");
    await state().fetchColumn("NEW");
    older.reject(httpError(500));
    await first;

    expect(ids("NEW")).toEqual(["fresh"]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("drops a response that was in flight when the view changed", async () => {
    const inFlight = deferred<Page>();
    get.mockReturnValueOnce(inFlight.promise);

    const request = state().fetchColumn("NEW");
    state().setView("created");
    inFlight.resolve(page([card("of-the-old-view")]));
    await request;

    expect(ids("NEW")).toEqual([]);
    expect(state().columns.NEW.loading).toBe(false);
  });

  it("sends the view, status, filters and no cursor on a fresh load", async () => {
    get.mockResolvedValueOnce(page([]));
    state().setFilters({ priority: ["HIGH", "URGENT"], q: "" });
    await state().fetchColumn("IN_REVIEW");
    expect(get).toHaveBeenCalledWith("/tasks", {
      params: expect.objectContaining({ view: "my", status: "IN_REVIEW", cursor: undefined, priority: "HIGH,URGENT", q: undefined }),
    });
  });

  it("keeps the cards and toasts when a load fails", async () => {
    get.mockResolvedValueOnce(page([card("a")])).mockRejectedValueOnce(httpError(500));
    await state().fetchColumn("NEW");
    await state().fetchColumn("NEW");
    expect(ids("NEW")).toEqual(["a"]);
    expect(state().columns.NEW.loading).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("«more» with no cursor is a no-op", async () => {
    await state().fetchColumn("NEW", { more: true });
    expect(get).not.toHaveBeenCalled();
    expect(state().columns.NEW.loading).toBe(false);
  });

  it("«more» sends the cursor, appends, and skips ids it already holds", async () => {
    get.mockResolvedValueOnce(page([card("a"), card("b")], "c1"));
    await state().fetchColumn("NEW");
    get.mockResolvedValueOnce(page([card("b"), card("c")], null));
    await state().fetchColumn("NEW", { more: true });

    expect(get).toHaveBeenLastCalledWith("/tasks", expect.objectContaining({ params: expect.objectContaining({ cursor: "c1" }) }));
    expect(ids("NEW")).toEqual(["a", "b", "c"]);
    expect(state().columns.NEW.cursor).toBeNull();
  });

  it("does not start a second «more» while one is in flight", async () => {
    get.mockResolvedValueOnce(page([card("a")], "c1"));
    await state().fetchColumn("NEW");
    const slow = deferred<Page>();
    get.mockReturnValueOnce(slow.promise);

    const first = state().fetchColumn("NEW", { more: true });
    await state().fetchColumn("NEW", { more: true });
    expect(get).toHaveBeenCalledTimes(2);

    slow.resolve(page([card("b")]));
    await first;
    expect(ids("NEW")).toEqual(["a", "b"]);
  });

  it("drops a «more» answer once a fresh load has replaced the column", async () => {
    get.mockResolvedValueOnce(page([card("a")], "c1"));
    await state().fetchColumn("NEW");
    const slowMore = deferred<Page>();
    get.mockReturnValueOnce(slowMore.promise).mockResolvedValueOnce(page([card("x")], null));

    const more = state().fetchColumn("NEW", { more: true });
    await state().fetchColumn("NEW");
    slowMore.resolve(page([card("b")]));
    await more;

    expect(ids("NEW")).toEqual(["x"]);
  });

  it("fetchBoard loads the four board columns and not «Bekor qilingan»", async () => {
    get.mockResolvedValue(page([]));
    await state().fetchBoard();
    const statuses = get.mock.calls.map(([, config]) => config?.params?.status);
    expect(statuses).toEqual(["NEW", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
  });
});

describe("setView / setFilters", () => {
  it("setView empties every column", async () => {
    get.mockResolvedValueOnce(page([card("a")], "c1"));
    await state().fetchColumn("NEW");
    seed([card("b", { status: "DONE" })]);

    state().setView("created");

    expect(state().view).toBe("created");
    for (const col of Object.values(state().columns)) {
      expect(col).toEqual({ items: [], cursor: null, loading: false, reqId: 0 });
    }
  });

  it("setFilters empties every column", async () => {
    get.mockResolvedValueOnce(page([card("a")]));
    await state().fetchColumn("NEW");
    state().setFilters({ due: "today" });
    expect(state().filters).toEqual({ due: "today" });
    expect(ids("NEW")).toEqual([]);
  });
});

describe("refreshTask", () => {
  it("keeps the card on a transient server error", async () => {
    seed([card("a")]);
    get.mockRejectedValueOnce(httpError(500));
    await state().refreshTask("a");
    expect(ids("NEW")).toEqual(["a"]);
  });

  it("keeps the card when the connection is lost", async () => {
    seed([card("a")]);
    get.mockRejectedValueOnce(httpError());
    await state().refreshTask("a");
    expect(ids("NEW")).toEqual(["a"]);
  });

  it("removes the card on 404 and on 403", async () => {
    seed([card("a"), card("b", { status: "DONE" })]);
    get.mockRejectedValueOnce(httpError(404)).mockRejectedValueOnce(httpError(403));
    await state().refreshTask("a");
    await state().refreshTask("b");
    expect(ids("NEW")).toEqual([]);
    expect(ids("DONE")).toEqual([]);
  });

  it("patches the board with the fetched task", async () => {
    seed([card("a")]);
    get.mockResolvedValueOnce({ data: { task: { ...card("a", { title: "renamed" }), description: null, lastReturnedAt: null, cancelReason: null, steps: [] } } });
    await state().refreshTask("a");
    expect(state().columns.NEW.items[0].title).toBe("renamed");
  });
});

describe("patchTask", () => {
  it("replaces a same-status card in place and keeps its batch summary", () => {
    const batch = { total: 3, done: 1, statuses: ["NEW" as const] };
    seed([card("a"), card("b", { batch }), card("c")]);

    state().patchTask(card("b", { title: "edited", stepsDone: 2 }));

    expect(ids("NEW")).toEqual(["a", "b", "c"]);
    expect(state().columns.NEW.items[1]).toMatchObject({ title: "edited", stepsDone: 2, batch });
  });

  it("takes the incoming batch summary when it has one", () => {
    seed([card("a", { batch: { total: 3, done: 1, statuses: ["NEW"] } })]);
    const fresh = { total: 3, done: 2, statuses: ["NEW" as const, "DONE" as const] };
    state().patchTask(card("a", { batch: fresh }));
    expect(state().columns.NEW.items[0].batch).toEqual(fresh);
  });

  it("moves a card whose status changed into the new column in createdAt-desc order", () => {
    seed([
      card("a"),
      card("x", { status: "IN_PROGRESS", createdAt: "2026-10-05T00:00:00Z" }),
      card("z", { status: "IN_PROGRESS", createdAt: "2026-10-01T00:00:00Z" }),
    ]);

    state().patchTask(card("a", { status: "IN_PROGRESS", createdAt: "2026-10-03T00:00:00Z" }));

    expect(ids("NEW")).toEqual([]);
    expect(ids("IN_PROGRESS")).toEqual(["x", "a", "z"]);
  });

  it("breaks a createdAt tie by id, descending, and appends the oldest", () => {
    const at = "2026-10-05T00:00:00Z";
    seed([card("c", { status: "DONE", createdAt: at }), card("a", { status: "DONE", createdAt: at }), card("m")]);

    state().patchTask(card("m", { status: "DONE", createdAt: at }));
    expect(ids("DONE")).toEqual(["m", "c", "a"]);

    state().patchTask(card("m", { status: "CANCELLED", createdAt: "2020-01-01T00:00:00Z" }));
    expect(ids("CANCELLED")).toEqual(["m"]);
  });

  it("does nothing to the board for a card it does not hold", () => {
    seed([card("a")]);
    const before = state().columns;
    state().patchTask(card("ghost"));
    expect(state().columns).toBe(before);
  });

  it("bumps version on every patch and removal so the sidebar counts refetch", () => {
    seed([card("a")]);
    const v0 = state().version;
    state().patchTask(card("a", { title: "x" }));
    state().patchTask(card("ghost"));
    state().removeTask("a");
    expect(state().version).toBe(v0 + 3);
  });
});

const detailOf = (id: string, over: Partial<TaskDetail> = {}): TaskDetail => ({
  ...card(id), description: null, lastReturnedAt: null, cancelReason: null, steps: [], ...over,
});
const ev = (id: string, createdAt: string, over: Partial<TaskEvent> = {}): TaskEvent => ({
  id, type: "COMMENT", actorId: 1, text: id, meta: null, via: "WEB", createdAt, actor: null, ...over,
});
const access: TaskAccess = { isAuthor: true, isAssignee: false, isWatcher: false, isManager: false, canView: true, canManage: true, canWork: true };
const payload = (id: string, events: TaskEvent[] = [], task: Partial<TaskDetail> = {}): { data: TaskDetailPayload } => ({
  data: { task: detailOf(id, task), events, access, batch: [] },
});

describe("openTask / loadDetail", () => {
  it("opens a task: clears the old detail, loads the new one and marks it seen", async () => {
    useTasks.setState({ detail: payload("old").data });
    post.mockResolvedValue({});
    get.mockResolvedValueOnce(payload("a", [ev("e1", "2026-10-07T10:00:00Z")]));

    state().openTask("a");
    expect(state().openTaskId).toBe("a");
    expect(state().detail).toBeNull();
    await vi.waitFor(() => expect(state().detail?.task.id).toBe("a"));

    expect(get).toHaveBeenCalledWith("/tasks/a");
    expect(post).toHaveBeenCalledWith("/tasks/a/seen");
  });

  it("drops the answer of a task that is no longer the open one", async () => {
    const first = deferred<unknown>();
    get.mockReturnValueOnce(first.promise).mockResolvedValueOnce(payload("b"));
    post.mockResolvedValue({});

    state().openTask("a");
    state().openTask("b");
    await vi.waitFor(() => expect(state().detail?.task.id).toBe("b"));
    first.resolve(payload("a"));
    await first.promise;
    await Promise.resolve();

    expect(state().detail?.task.id).toBe("b");
  });

  it("drops the answer when the drawer was closed meanwhile", async () => {
    const inFlight = deferred<unknown>();
    get.mockReturnValueOnce(inFlight.promise);

    state().openTask("a");
    state().openTask(null);
    inFlight.resolve(payload("a"));
    await inFlight.promise;
    await Promise.resolve();

    expect(state().detail).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("closes the drawer and says so when the task cannot be loaded", async () => {
    get.mockRejectedValueOnce(httpError(404));
    state().openTask("gone");
    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(state().openTaskId).toBeNull();
    expect(state().detail).toBeNull();
  });

  it("keeps the detail while closing, so the drawer does not blink", async () => {
    useTasks.setState({ openTaskId: "a", detail: payload("a").data });
    state().openTask(null);
    expect(state().openTaskId).toBeNull();
    expect(state().detail?.task.id).toBe("a");
  });
});

describe("applyDetail / reloadDetail", () => {
  const open = (events: TaskEvent[]) => useTasks.setState({ openTaskId: "a", detail: { ...payload("a", events).data } });

  it("shows the written task, patches the board and re-reads the feed", async () => {
    seed([card("a")]);
    open([ev("e1", "2026-10-07T10:00:00Z", { type: "CREATED" })]);
    get.mockResolvedValueOnce(payload("a", [
      ev("e1", "2026-10-07T10:00:00Z", { type: "CREATED" }),
      ev("e2", "2026-10-07T10:05:00Z", { type: "STATUS", meta: { to: "IN_PROGRESS" } }),
    ], { status: "IN_PROGRESS" }));

    state().applyDetail(detailOf("a", { status: "IN_PROGRESS" }));
    expect(state().detail?.task.status).toBe("IN_PROGRESS");
    expect(ids("IN_PROGRESS")).toEqual(["a"]);

    await vi.waitFor(() => expect(state().detail?.events.map((e) => e.id)).toEqual(["e1", "e2"]));
  });

  it("ignores the written task when another one is open now", () => {
    open([]);
    state().applyDetail(detailOf("other", { title: "x" }));
    expect(state().detail?.task.id).toBe("a");
    expect(state().detail?.task.title).toBe("a");
  });

  it("keeps a comment posted while the re-read was in flight", async () => {
    const inFlight = deferred<unknown>();
    open([ev("e1", "2026-10-07T10:00:00Z")]);
    get.mockReturnValueOnce(inFlight.promise);

    const reload = state().reloadDetail("a");
    state().appendEvent(ev("mine", "2026-10-07T10:09:00Z"));
    inFlight.resolve(payload("a", [ev("e1", "2026-10-07T10:00:00Z")]));
    await reload;

    expect(state().detail?.events.map((e) => e.id)).toEqual(["e1", "mine"]);
  });

  it("ignores an older re-read that lands after a newer one", async () => {
    const older = deferred<unknown>();
    open([ev("e1", "2026-10-07T10:00:00Z")]);
    get.mockReturnValueOnce(older.promise).mockResolvedValueOnce(payload("a", [ev("e1", "2026-10-07T10:00:00Z"), ev("e2", "2026-10-07T10:01:00Z")]));

    const first = state().reloadDetail("a");
    await state().reloadDetail("a");
    older.resolve(payload("a", [ev("e1", "2026-10-07T10:00:00Z")]));
    await first;

    expect(state().detail?.events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("keeps what is shown when the re-read fails", async () => {
    open([ev("e1", "2026-10-07T10:00:00Z")]);
    get.mockRejectedValueOnce(httpError(500));
    await state().reloadDetail("a");
    expect(state().detail?.events.map((e) => e.id)).toEqual(["e1"]);
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("appendEvent", () => {
  it("adds the comment once and counts it on the card", () => {
    seed([card("a", { eventsCount: 1 })]);
    useTasks.setState({ openTaskId: "a", detail: payload("a", [ev("e1", "2026-10-07T10:00:00Z")], { eventsCount: 1 }).data });

    state().appendEvent(ev("c1", "2026-10-07T10:01:00Z"));
    state().appendEvent(ev("c1", "2026-10-07T10:01:00Z"));

    expect(state().detail?.events.map((e) => e.id)).toEqual(["e1", "c1"]);
    expect(state().detail?.task.eventsCount).toBe(2);
    expect(state().columns.NEW.items[0].eventsCount).toBe(2);
  });

  it("does nothing when no task is open", () => {
    state().appendEvent(ev("c1", "2026-10-07T10:01:00Z"));
    expect(state().detail).toBeNull();
  });
});
