"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CaretRight, CaretLineLeft, CaretLineRight } from "./icon";
import {
  railNavItems,
  moreRoutes,
  settingsHelpItems,
} from "@/lib/student-nav-items";
import { useStudentProfile } from "../lib/queries";
import { useSidebar, RAIL_WIDTH } from "../lib/sidebar-store";
import { ThemeSegmented } from "./theme-segmented";
import { Avatar } from "./avatar";
import { LogoutButton } from "../student-logout-button";

// Tablet + desktop side rail (>= md). Full portal menu: profile summary, the
// nav list, and a footer with theme / logout. Replaces the mobile bottom nav on
// wide screens.
//
// Two widths, driven by `useSidebar`: 240px with labels, or 72px icons-only.
// Under the pre-hydration `auto` mode the expanded markup is rendered at the
// narrow md width for a single frame — `overflow-hidden` on the <aside> is what
// keeps that frame from showing clipped labels.
export function LumioSideRail({ className }: { className?: string }) {
  const pathname = usePathname();
  const { data: profile } = useStudentProfile();
  const mode = useSidebar((s) => s.mode);
  const toggle = useSidebar((s) => s.toggle);
  const collapsed = mode === "collapsed";

  const fullName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "Profil";

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    if (url === "/portal/more") {
      return moreRoutes.some((r) => pathname.startsWith(r));
    }
    // FAQ and Biz haqimizda have no rail row of their own — on wide screens they
    // are reached from Settings, so keep Settings lit while one of them is open.
    if (url === "/portal/settings") {
      return (
        pathname.startsWith(url) ||
        settingsHelpItems.some((i) => pathname.startsWith(i.url))
      );
    }
    return pathname.startsWith(url);
  }

  return (
    <aside
      className={cn(
        "glass fixed inset-y-0 left-0 z-40 flex-col overflow-hidden border-r border-line bg-surface/85 transition-[width] duration-200 ease-out",
        RAIL_WIDTH[mode],
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-4",
          collapsed ? "px-2" : "p-3",
        )}
      >
        {/* Profile summary */}
        <Link
          href="/portal/profile"
          title={collapsed ? fullName : undefined}
          className={cn(
            "flex items-center rounded-card border border-line bg-surface shadow-lumio-sm transition-colors hover:bg-tint",
            collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5",
            pathname.startsWith("/portal/profile") && "border-coral-500/40",
          )}
        >
          <Avatar
            src={profile?.photo}
            name={profile ? fullName : undefined}
            size={40}
          />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-bold text-ink-900">
                  {fullName}
                </span>
                <span className="block text-xs font-semibold text-ink-500">
                  Profilni ko&apos;rish
                </span>
              </span>
              <CaretRight size={16} weight="bold" className="text-ink-400" />
            </>
          )}
        </Link>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {railNavItems.map((item) => {
            const active = isActive(item.url);
            const Icon = item.icon;
            return (
              <Link
                key={item.url}
                href={item.url}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.title : undefined}
                className={cn(
                  "relative flex items-center rounded-md text-sm transition-colors",
                  collapsed
                    ? "justify-center py-3"
                    : "gap-3 px-3 py-2.5",
                  active
                    ? "bg-coral-500/10 font-bold text-coral-600"
                    : "font-semibold text-ink-600 hover:bg-tint hover:text-ink-900",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-coral-500"
                  />
                )}
                <Icon size={20} weight={active ? "fill" : "bold"} />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Width toggle — sits at the bottom of the scroll column, above the
            footer, so it never scrolls away from the rail's own controls. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? "Yon menyuni kengaytirish" : "Yon menyuni yig'ish"
          }
          title={collapsed ? "Kengaytirish" : undefined}
          className={cn(
            "mt-auto flex items-center rounded-md text-sm font-semibold text-ink-500 transition-colors hover:bg-tint hover:text-ink-900",
            collapsed ? "justify-center py-3" : "gap-3 px-3 py-2.5",
          )}
        >
          {collapsed ? (
            <CaretLineRight size={20} weight="bold" />
          ) : (
            <CaretLineLeft size={20} weight="bold" />
          )}
          {!collapsed && <span>Yig&apos;ish</span>}
        </button>
      </div>

      {/* Footer */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-t border-line",
          collapsed ? "flex-col px-2 py-3" : "p-3",
        )}
      >
        <ThemeSegmented
          variant="compact"
          orientation={collapsed ? "vertical" : "horizontal"}
          className={collapsed ? "w-full" : "min-w-0 flex-1"}
        />
        <LogoutButton variant="rail" />
      </div>
    </aside>
  );
}
