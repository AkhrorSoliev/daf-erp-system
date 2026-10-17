import { describe, expect, it, vi } from "vitest";
import { changeUiSkin, type ChangeUiSkinDeps } from "./change-ui-skin";

function deps(over: Partial<ChangeUiSkinDeps> & { initial?: string | null } = {}) {
  let skin: string | null | undefined = "initial" in over ? over.initial : "daftar";
  const d: ChangeUiSkinDeps = {
    current: () => skin,
    apply: vi.fn((s: string | null) => {
      skin = s;
    }),
    save: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn(),
    ...over,
  };
  return { d, read: () => skin, set: (s: string | null) => (skin = s) };
}

describe("changeUiSkin", () => {
  it("applies the skin at once, then saves it", async () => {
    const { d, read } = deps();
    expect(await changeUiSkin("ormon", d)).toBe(true);
    expect(d.apply).toHaveBeenCalledWith("ormon");
    expect(d.save).toHaveBeenCalledWith("ormon");
    expect(read()).toBe("ormon");
    expect(d.fail).not.toHaveBeenCalled();
  });

  it("puts the old skin back and reports when the save fails", async () => {
    const boom = new Error("offline");
    const { d, read } = deps({ save: vi.fn().mockRejectedValue(boom) });
    expect(await changeUiSkin("gilos", d)).toBe(false);
    expect(read()).toBe("daftar");
    expect(d.fail).toHaveBeenCalledWith(boom);
  });

  it("restores a missing skin to null when the save fails", async () => {
    const { d, read } = deps({ initial: null, save: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await changeUiSkin("gilos", d)).toBe(false);
    expect(read()).toBeNull();
    expect(d.apply).toHaveBeenLastCalledWith(null);
  });

  it("does not undo a newer choice when an older save fails late", async () => {
    let rejectFirst!: (e: Error) => void;
    const first = new Promise<void>((_, rej) => (rejectFirst = rej));
    const { d, read } = deps({ save: vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined) });
    const a = changeUiSkin("ormon", d);
    await changeUiSkin("qum", d);
    const late = new Error("late");
    rejectFirst(late);
    expect(await a).toBe(false);
    expect(read()).toBe("qum");
    expect(d.fail).toHaveBeenCalledWith(late);
  });

  it("keeps the newest choice even when it equals the failed one's skin (A=ormon, B=qum, C=ormon)", async () => {
    let rejectFirst!: (e: Error) => void;
    const first = new Promise<void>((_, rej) => (rejectFirst = rej));
    const { d, read } = deps({ save: vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined) });
    const a = changeUiSkin("ormon", d);
    await changeUiSkin("qum", d);
    await changeUiSkin("ormon", d);
    rejectFirst(new Error("late"));
    await a;
    expect(read()).toBe("ormon");
    expect(d.fail).toHaveBeenCalledTimes(1);
  });

  it("applies the skin again when the store was overwritten while saving (a session refresh)", async () => {
    const { d, read, set } = deps();
    d.save = vi.fn(async () => {
      set("daftar"); // the refreshed session brings the server's older user
    });
    expect(await changeUiSkin("ormon", d)).toBe(true);
    expect(read()).toBe("ormon");
  });
});
