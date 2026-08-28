import {
  House,
  CalendarBlank,
  Wallet,
  DotsThreeOutline,
  ChartLineUp,
  Gear,
  Question,
  Info,
  Radio,
  GraduationCap,
  type Icon,
} from "@/components/student-portal/lumio/icon";
import type { LumioTone } from "@/components/student-portal/lumio/tones";

export interface StudentNavItem {
  title: string;
  url: string;
  icon: Icon;
  /**
   * Where the item appears:
   * - `tab` — bottom nav only
   * - `more` — "Ko'proq" hub + desktop rail
   * - `both` — bottom nav + desktop rail
   * - `help` — "Ko'proq" hub on mobile, but under Settings on desktop rather
   *   than as its own rail row (reference material, not a destination the
   *   student navigates to often)
   */
  slot: "tab" | "more" | "both" | "help";
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
    title: "Ta'lim",
    url: "/portal/lernen",
    icon: GraduationCap,
    slot: "more",
    tone: "grape",
  },
  {
    title: "Radio",
    url: "/portal/radio",
    icon: Radio,
    slot: "more",
    tone: "coral",
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
    slot: "help",
    tone: "sky",
  },
  {
    title: "Biz haqimizda",
    url: "/portal/about",
    icon: Info,
    slot: "help",
    tone: "grape",
  },
];

/** Bottom nav (mobile/tablet): tabs + both, in order. */
export const bottomNavItems = studentNavItems.filter(
  (i) => i.slot === "tab" || i.slot === "both",
);

/**
 * Desktop side rail: both + more.
 * `help` items are deliberately absent — on desktop they hang off Settings.
 */
export const railNavItems = studentNavItems.filter(
  (i) => i.slot === "both" || i.slot === "more",
);

/** More hub rows on mobile (attendance / settings / faq / about). */
export const moreNavItems = studentNavItems.filter(
  (i) => i.slot === "more" || i.slot === "help",
);

/**
 * Reference screens listed inside Settings on desktop, where the rail has no
 * row for them. Hidden there on mobile — the "Ko'proq" hub already lists them.
 */
export const settingsHelpItems = studentNavItems.filter(
  (i) => i.slot === "help",
);

/** Routes that live under the "Ko'proq" hub — used for bottom-nav active state. */
export const moreRoutes = [
  "/portal/more",
  "/portal/profile",
  "/portal/attendance",
  "/portal/lernen",
  "/portal/radio",
  "/portal/settings",
  "/portal/faq",
  "/portal/about",
];
