import {
  WEEK_DAYS,
  type CenterFacts,
  type WeekDay,
  type WorkWindow,
} from './center-activity.types';
import {
  enrolledOn,
  isGroupOpen,
  lessonSlots,
  pointOn,
  roomExistsOn,
  toMinutes,
} from './center-points';

export interface RoomResult {
  id: string;
  name: string;
  branchId: number;
  branchName: string;
  capacity: number | null;
  groupCount: number;
  /** Distinct lesson hours in a typical week (half-hour slots, clipped to the working window). */
  lessonHours: number;
  /** Working hours in a typical week: the day's window × 6 (du–sha). */
  workHours: number;
  occupancyPct: number | null;
  window: WorkWindow;
  slots: Record<WeekDay, Set<number>>;
}

export interface GroupResult {
  id: string;
  name: string;
  courseName: string;
  branchId: number;
  roomId: string;
  days: WeekDay[];
  start: string | null;
  end: string | null;
  enrolled: number;
  capacity: number;
  free: number;
  overfull: boolean;
  monthlyPrice: number | null;
}

export interface CenterEval {
  rooms: RoomResult[];
  groups: GroupResult[];
  /** Open groups with no room, or a room with no capacity: they hold hours but no counted seat. */
  unplaced: number;
  /** Open at `at` and deleted since: the page says so under the figures. */
  deletedLater: number;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
const emptySlots = (): Record<WeekDay, Set<number>> => ({
  monday: new Set(),
  tuesday: new Set(),
  wednesday: new Set(),
  thursday: new Set(),
  friday: new Set(),
  saturday: new Set(),
});
const isWeekDay = (d: string): d is WeekDay =>
  (WEEK_DAYS as readonly string[]).includes(d);

/**
 * The centre at one instant. A pure function of the facts: every block of the
 * page is read off this one value, so the cards add up to the tables.
 * `current` is true for the month still running (rooms must be ACTIVE then).
 */
export function evaluateCenter(
  facts: CenterFacts,
  at: Date,
  current: boolean,
): CenterEval {
  const rooms = facts.rooms.filter((r) => roomExistsOn(r, at, current));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const open = facts.groups.filter((g) => isGroupOpen(g, at));

  const slotsByRoom = new Map<string, Record<WeekDay, Set<number>>>();
  const countByRoom = new Map<string, number>();
  const groups: GroupResult[] = [];
  let unplaced = 0;
  let deletedLater = 0;

  for (const g of open) {
    if (g.deletedAt) deletedLater++;
    const room = g.roomId ? roomById.get(g.roomId) : undefined;
    const sched = pointOn(g.scheduleHistory, at, g.scheduleNow);
    const days = sched.exactDays.filter(isWeekDay);
    if (room) {
      const slots = slotsByRoom.get(room.id) ?? emptySlots();
      const covered = lessonSlots(sched.start, sched.end, room.window);
      for (const day of days) for (const s of covered) slots[day].add(s);
      slotsByRoom.set(room.id, slots);
      countByRoom.set(room.id, (countByRoom.get(room.id) ?? 0) + 1);
    }
    const capacity = room
      ? pointOn(room.capacityHistory, at, room.capacityNow)
      : null;
    if (!room || !capacity || capacity <= 0) {
      unplaced++;
      continue;
    }
    const enrolled = enrolledOn(g, at);
    const course = sched.courseId
      ? facts.courses.get(sched.courseId)
      : undefined;
    const price = course?.monthly
      ? pointOn(course.priceHistory, at, course.priceNow)
      : null;
    groups.push({
      id: g.id,
      name: g.name,
      courseName: course?.name ?? '',
      branchId: g.branchId,
      roomId: room.id,
      days,
      start: sched.start,
      end: sched.end,
      enrolled,
      capacity,
      free: Math.max(0, capacity - enrolled),
      overfull: enrolled > capacity,
      monthlyPrice: price,
    });
  }

  const roomResults: RoomResult[] = rooms.map((r) => {
    const slots = slotsByRoom.get(r.id) ?? emptySlots();
    let half = 0;
    for (const day of WEEK_DAYS) half += slots[day].size;
    const lessonHours = half / 2;
    const workHours =
      ((toMinutes(r.window.end) - toMinutes(r.window.start)) / 60) *
      WEEK_DAYS.length;
    return {
      id: r.id,
      name: r.name,
      branchId: r.branchId,
      branchName: r.branchName,
      capacity: pointOn(r.capacityHistory, at, r.capacityNow),
      groupCount: countByRoom.get(r.id) ?? 0,
      lessonHours,
      workHours,
      occupancyPct:
        workHours > 0 ? round1((lessonHours / workHours) * 100) : null,
      window: r.window,
      slots,
    };
  });

  return { rooms: roomResults, groups, unplaced, deletedLater };
}
