import { describe, expect, it } from "vitest";
import type { OwnershipLogEntry } from "./archive-types";
import { ownershipLogText } from "./ownership-log-text";

const base: OwnershipLogEntry = {
  id: "1",
  kind: "CLAIM",
  from: null,
  to: null,
  actor: null,
  reason: null,
  createdAt: "2026-10-01T10:00:00Z",
};

describe("ownershipLogText", () => {
  it("says who claimed", () => {
    expect(ownershipLogText({ ...base, to: "Ali Valiyev" })).toBe(
      "Ali Valiyev band qildi",
    );
  });
  it("says who gave the lead to whom", () => {
    expect(
      ownershipLogText({
        ...base,
        kind: "ASSIGN",
        actor: "Vali Aliyev",
        to: "Ali Valiyev",
      }),
    ).toBe("Vali Aliyev lidni Ali Valiyevga berdi");
  });
  it("adds the reason of a release only when there is one", () => {
    const r = { ...base, kind: "RELEASE" as const, from: "Ali Valiyev" };
    expect(ownershipLogText(r)).toBe("Ali Valiyev bo'shatdi");
    expect(ownershipLogText({ ...r, reason: "vaqtim yo'q" })).toBe(
      "Ali Valiyev bo'shatdi — vaqtim yo'q",
    );
  });
  it("names the owner who missed the deadline", () => {
    expect(
      ownershipLogText({ ...base, kind: "EXPIRE", from: "Ali Valiyev" }),
    ).toBe("Ali Valiyev muddatida ish qilmadi, lid havzaga qaytdi");
  });
});
