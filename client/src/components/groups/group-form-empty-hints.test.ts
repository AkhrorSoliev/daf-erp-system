import { describe, expect, it } from "vitest";
import { groupFormEmptyHints } from "./group-form-empty-hints";

describe("groupFormEmptyHints", () => {
  it("director: a link for course, room and teacher", () => {
    const h = groupFormEmptyHints([2], 7);
    expect(h.course.action).toEqual({ href: "/settings/courses", label: "Kurs qo'shish" });
    expect(h.room.action).toEqual({ href: "/settings/rooms?branch=7", label: "Xona qo'shish" });
    expect(h.teacher.action).toEqual({ href: "/teachers", label: "Ustoz qo'shish" });
  });

  it("administrator: no link for course or teacher, says who adds them", () => {
    const h = groupFormEmptyHints([3], 7);
    expect(h.course).toEqual({
      text: "Bu filialda hali kurs yo'q. Kursni filial direktori qo'shadi.",
    });
    expect(h.teacher).toEqual({
      text: "Hozircha o'qituvchi yo'q. Ustozni filial direktori qo'shadi.",
    });
    // An administrator can add a room (rooms.controller: CEO/BD/Administrator).
    expect(h.room.action?.href).toBe("/settings/rooms?branch=7");
  });

  it("no branch selected: no room link", () => {
    expect(groupFormEmptyHints([1], null).room).toEqual({ text: "Hozircha xona yo'q." });
  });
});
