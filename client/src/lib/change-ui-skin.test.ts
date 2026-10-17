import { describe, expect, it, vi } from "vitest";
import { changeUiSkin, type ChangeUiSkinDeps } from "./change-ui-skin";

function deps(over: Partial<ChangeUiSkinDeps> & { initial?: string | null } = {}) {
  let skin: string | null | undefined = over.initial ?? "daftar";
  const d: ChangeUiSkinDeps = {
    current: () => skin,
    apply: vi.fn((s: string | null) => {
      skin = s;
    }),
    save: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn(),
    ...over,
  };
  return { d, read: () => skin };
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

  it("does not undo a newer choice when an older save fails late", async () => {
    let rejectFirst!: (e: Error) => void;
    const first = new Promise<void>((_, rej) => (rejectFirst = rej));
    const { d, read } = deps({ save: vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined) });
    const a = changeUiSkin("ormon", d);
    await changeUiSkin("qum", d);
    rejectFirst(new Error("late"));
    await a;
    expect(read()).toBe("qum");
  });
});
