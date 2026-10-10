import type { Can } from "@/lib/permission-check";

/**
 * When the group form's course, room or teacher list is empty — why, and
 * where to go. The link is shown only to a viewer who can actually add that
 * thing: a course or a teacher is added by CEO/director, a room also by an
 * administrator.
 */
export interface EmptyHint {
  text: string;
  action?: { href: string; label: string };
}

export function groupFormEmptyHints(
  can: Can,
  branchId: number | null,
): { course: EmptyHint; room: EmptyHint; teacher: EmptyHint } {
  const managesStructure = can("courses.create");
  return {
    course: managesStructure
      ? {
          text: "Bu filialda hali kurs yo'q.",
          action: { href: "/settings/courses", label: "Kurs qo'shish" },
        }
      : { text: "Bu filialda hali kurs yo'q. Kursni filial direktori qo'shadi." },
    room:
      branchId !== null
        ? {
            text: "Hozircha xona yo'q.",
            action: { href: `/settings/rooms?branch=${branchId}`, label: "Xona qo'shish" },
          }
        : { text: "Hozircha xona yo'q." },
    teacher: managesStructure
      ? {
          text: "Hozircha o'qituvchi yo'q.",
          action: { href: "/teachers", label: "Ustoz qo'shish" },
        }
      : { text: "Hozircha o'qituvchi yo'q. Ustozni filial direktori qo'shadi." },
  };
}
