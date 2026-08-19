import {
  House,
  CalendarBlank,
  Wallet,
  DotsThreeOutline,
  ChartLineUp,
  Gear,
  Question,
  Info,
  type Icon,
} from "@/components/student-portal/lumio/icon";
import type { LumioTone } from "@/components/student-portal/lumio/tones";

export interface StudentNavItem {
  title: string;
  url: string;
  icon: Icon;
  /** Where the item appears: bottom `tab`, `more` hub / desktop rail, or `both`. */
  slot: "tab" | "more" | "both";
  /** Accent tone for the More-hub icon tile. */
  tone?: LumioTone;
}

// Single source of truth for portal navigation. The floating bottom nav
// (mobile/tablet) renders `slot: tab | both` in array order; the desktop side
// rail renders `slot: both | more`; the More hub lists `slot: more`.
export const studentNavItems: StudentNavItem[] = [
  { title: "Asosiy", url: "/portal", icon: House, slot: "both", tone: "coral" },
  {
    title: "Jadval",
    url: "/portal/schedule",
    icon: CalendarBlank,
    slot: "both",
    tone: "sky",
  },
  {
    title: "To'lovlar",
    url: "/portal/payments",
    icon: Wallet,
    slot: "both",
    tone: "teal",
  },
  {
    title: "Ko'proq",
    url: "/portal/more",
    icon: DotsThreeOutline,
    slot: "tab",
    tone: "ink",
  },
  {
    title: "Davomat",
    url: "/portal/attendance",
    icon: ChartLineUp,
    slot: "more",
    tone: "amber",
  },
  {
    title: "Sozlamalar",
    url: "/portal/settings",
    icon: Gear,
    slot: "more",
    tone: "ink",
  },
  {
    title: "FAQ",
    url: "/portal/faq",
    icon: Question,
    slot: "more",
    tone: "sky",
  },
  {
    title: "Biz haqimizda",
    url: "/portal/about",
    icon: Info,
    slot: "more",
    tone: "grape",
  },
];

/** Bottom nav (mobile/tablet): tabs + both, in order. */
export const bottomNavItems = studentNavItems.filter(
  (i) => i.slot === "tab" || i.slot === "both",
);

/** Desktop side rail: both + more (AI shown as a feature card, not a rail row). */
export const railNavItems = studentNavItems.filter(
  (i) => i.slot === "both" || i.slot === "more",
);

/** More hub rows (attendance / settings / faq / about). */
export const moreNavItems = studentNavItems.filter((i) => i.slot === "more");

/** Routes that live under the "Ko'proq" hub — used for bottom-nav active state. */
export const moreRoutes = [
  "/portal/more",
  "/portal/profile",
  "/portal/attendance",
  "/portal/settings",
  "/portal/faq",
  "/portal/about",
];
