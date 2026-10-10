import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get } }));

import { usePermissions } from "./use-permissions";

/** A request the test answers by hand, whenever it likes. */
function deferred() {
  let answer!: (keys: string[]) => void;
  const promise = new Promise<{ data: { keys: string[] } }>((resolve) => {
    answer = (keys) => resolve({ data: { keys } });
  });
  return { promise, answer };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const storage = new Map<string, string>();

function held(): string[] {
  return [...(usePermissions.getState().keys ?? [])];
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
  });
  get.mockReset();
  usePermissions.getState().clear();
});

afterEach(() => {
  usePermissions.getState().clear();
  vi.unstubAllGlobals();
});

describe("usePermissions: one read", () => {
  it("keeps the answer of a lone read, in memory and in storage", async () => {
    const r = deferred();
    get.mockReturnValueOnce(r.promise);
    usePermissions.getState().start(7);
    r.answer(["groups.view", "no.such"]);
    await flush();

    expect(held()).toEqual(["groups.view"]);
    expect(usePermissions.getState().can("groups.view")).toBe(true);
    expect(usePermissions.getState().loadedAt).toBeGreaterThan(0);
    expect(JSON.parse(storage.get("daf.permissions")!)).toEqual({
      userId: 7,
      keys: ["groups.view"],
    });
  });
});

describe("usePermissions: a different user signs in while a read is out", () => {
  it("never gives user B the list asked for user A, when A's answer arrives last", async () => {
    const a = deferred();
    const b = deferred();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const s = usePermissions.getState();
    s.start(7);
    s.start(8);

    b.answer(["groups.view"]);
    await flush();
    a.answer(["salary.view", "salary.pay"]);
    await flush();

    const now = usePermissions.getState();
    expect(now.userId).toBe(8);
    expect(held()).toEqual(["groups.view"]);
    expect(now.can("salary.view")).toBe(false);
    expect(JSON.parse(storage.get("daf.permissions")!)).toEqual({
      userId: 8,
      keys: ["groups.view"],
    });
  });

  it("leaves B holding nothing, not A's list, while only A's answer is in", async () => {
    const a = deferred();
    const b = deferred();
    get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const s = usePermissions.getState();
    s.start(7);
    s.start(8);

    a.answer(["salary.view"]);
    await flush();

    expect(usePermissions.getState().keys).toBeNull();
    expect(usePermissions.getState().can("salary.view")).toBe(false);
    expect(storage.has("daf.permissions")).toBe(false);
  });

  it("drops an answer sent before a sign-out even when the same user signs back in", async () => {
    const old = deferred();
    const fresh = deferred();
    get.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const s = usePermissions.getState();
    s.start(7);
    s.clear();
    s.start(7);

    fresh.answer(["groups.view"]);
    await flush();
    old.answer(["salary.view"]);
    await flush();

    expect(held()).toEqual(["groups.view"]);
  });
});

describe("usePermissions: two reads for the same user", () => {
  it("lets the newer read win when they resolve out of order", async () => {
    const first = deferred();
    const second = deferred();
    get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const s = usePermissions.getState();
    s.start(7); // read 1
    void s.refresh(); // read 2, e.g. after a 403

    second.answer(["groups.view"]);
    await flush();
    first.answer(["salary.view"]); // older, arrives last
    await flush();

    expect(held()).toEqual(["groups.view"]);
    expect(JSON.parse(storage.get("daf.permissions")!).keys).toEqual([
      "groups.view",
    ]);
  });
});

describe("usePermissions: a failed first read tries again", () => {
  const ok = (keys: string[]) => Promise.resolve({ data: { keys } });
  const fail = () => Promise.reject(new Error("network"));

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills the list when a retry succeeds", async () => {
    get.mockImplementationOnce(fail).mockImplementationOnce(() => ok(["groups.view"]));
    usePermissions.getState().start(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(usePermissions.getState().keys).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);

    expect(held()).toEqual(["groups.view"]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("retries after about 1 s, 3 s and 8 s, then stops", async () => {
    get.mockImplementation(fail);
    usePermissions.getState().start(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(get).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2999);
    expect(get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(get).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(7999);
    expect(get).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(get).toHaveBeenCalledTimes(4);

    // Three retries are all there are.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(4);
    expect(usePermissions.getState().keys).toBeNull();
  });

  it("does not retry when a list is already known: it keeps what it has", async () => {
    get.mockImplementationOnce(() => ok(["groups.view"])).mockImplementation(fail);
    usePermissions.getState().start(7);
    await vi.advanceTimersByTimeAsync(0);
    await usePermissions.getState().refresh(); // e.g. after a 403; this one fails

    await vi.advanceTimersByTimeAsync(60_000);

    expect(get).toHaveBeenCalledTimes(2);
    expect(held()).toEqual(["groups.view"]);
  });

  it("cancels a pending retry on clear()", async () => {
    get.mockImplementation(fail);
    usePermissions.getState().start(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);

    usePermissions.getState().clear();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(get).toHaveBeenCalledTimes(1);
    expect(usePermissions.getState().userId).toBeNull();
  });

  it("cancels a pending retry of user A when user B signs in, and never gives B A's list", async () => {
    get.mockImplementationOnce(fail).mockImplementationOnce(() => ok(["groups.view"]));
    usePermissions.getState().start(7);
    await vi.advanceTimersByTimeAsync(0);

    usePermissions.getState().start(8);
    await vi.advanceTimersByTimeAsync(60_000);

    // A's read and B's read; A's retry never ran.
    expect(get).toHaveBeenCalledTimes(2);
    expect(usePermissions.getState().userId).toBe(8);
    expect(held()).toEqual(["groups.view"]);
    expect(JSON.parse(storage.get("daf.permissions")!).userId).toBe(8);
  });

  it("gives user B a fresh retry budget when A's retries were used up", async () => {
    get.mockImplementation(fail);
    usePermissions.getState().start(7);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(4);

    usePermissions.getState().start(8);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(get).toHaveBeenCalledTimes(8);
  });
});
