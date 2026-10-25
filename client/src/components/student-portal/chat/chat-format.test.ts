import { describe, expect, it } from "vitest";
import { clockLabel, groupByDay, peerName, unreadTotal } from "./chat-format";

// Tashkent is UTC+5: the day edge is 19:00Z.
const NOW = new Date("2026-10-25T10:00:00Z"); // 15:00 Tashkent, 25.10

describe("clockLabel", () => {
  it("same Tashkent day -> HH:mm", () => {
    expect(clockLabel("2026-10-25T09:05:00Z", NOW)).toBe("14:05");
    // 19:00Z on the 24th is already 00:00 on the 25th in Tashkent
    expect(clockLabel("2026-10-24T19:00:00Z", NOW)).toBe("00:00");
  });
  it("previous Tashkent day -> Kecha", () => {
    expect(clockLabel("2026-10-24T18:59:00Z", NOW)).toBe("Kecha");
  });
  it("older -> dd.MM", () => {
    expect(clockLabel("2026-10-22T10:00:00Z", NOW)).toBe("22.10");
  });
  it("translates Kecha through t", () => {
    expect(clockLabel("2026-10-24T18:59:00Z", NOW, (s) => `T:${s}`)).toBe(
      "T:Kecha",
    );
  });
});

describe("groupByDay", () => {
  const m = (id: string, createdAt: string) => ({ id, createdAt });
  it("headers Bugun / Kecha / dd.MM.yyyy, order preserved", () => {
    const groups = groupByDay(
      [
        m("a", "2026-10-25T09:00:00Z"),
        m("b", "2026-10-24T19:00:00Z"),
        m("c", "2026-10-24T18:59:00Z"),
        m("d", "2026-10-20T10:00:00Z"),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Bugun",
      "Kecha",
      "20.10.2026",
    ]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
  });
  it("empty -> no groups", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("unreadTotal", () => {
  it("sums unread", () => {
    expect(unreadTotal([{ unread: 2 }, { unread: 0 }, { unread: 3 }])).toBe(5);
    expect(unreadTotal([])).toBe(0);
  });
});

describe("peerName", () => {
  it("joins first and last name", () => {
    expect(peerName({ firstName: "Ali", lastName: "Vali" })).toBe("Ali Vali");
    expect(peerName({ firstName: "Ali", lastName: "" })).toBe("Ali");
  });
});
