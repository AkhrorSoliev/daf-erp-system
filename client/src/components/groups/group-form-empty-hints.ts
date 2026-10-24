import type { Can } from "@/lib/permission-check";
import { msg } from "@/i18n/msg";

/**
 * When the group form's course, room or teacher list is empty — why, and
 * where to go. The link is shown only to a viewer who can actually add that
 * thing: a course needs `courses.create`, a teacher `teachers.manage`
 * (separate capabilities, ADR-0087); a room is added by an administrator too.
 */
export interface EmptyHint {
  text: string;
  action?: { href: string; label: string };
}

export function groupFormEmptyHints(
  can: Can,
  branchId: number | null,
): { course: EmptyHint; room: EmptyHint; teacher: EmptyHint } {
  return {
    course: can("courses.create")
      ? {
          text: msg("Bu filialda hali kurs yo'q."),
          action: { href: "/settings/courses", label: msg("Kurs qo'shish") },
        }
      : { text: msg("Bu filialda hali kurs yo'q. Kursni filial direktori qo'shadi.") },
    room:
      branchId !== null
        ? {
            text: msg("Hozircha xona yo'q."),
            action: { href: `/settings/rooms?branch=${branchId}`, label: msg("Xona qo'shish") },
          }
        : { text: msg("Hozircha xona yo'q.") },
    teacher: can("teachers.manage")
      ? {
          text: msg("Hozircha o'qituvchi yo'q."),
          action: { href: "/teachers", label: msg("Ustoz qo'shish") },
        }
      : { text: msg("Hozircha o'qituvchi yo'q. Ustozni filial direktori qo'shadi.") },
  };
}
