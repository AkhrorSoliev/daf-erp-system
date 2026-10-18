"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ListChecks,
  MoreHorizontal,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MiniAppScript } from "@/components/telegram-mini-app/mini-app-script";
import { useAuth } from "@/hooks/use-auth";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTaskCounts } from "@/hooks/use-task-counts";
import { useT } from "@/i18n/context";
import { requestLeave } from "@/lib/leave-guard";
import { getTelegramWebApp } from "@/lib/telegram-mini-app";
import {
  GROUP_MAIN_TABS,
  GROUP_MORE_TABS,
  TEACHER_NAV,
  backFallback,
  groupTab,
  groupTabHref,
  showTelegramBack,
  teacherBarMode,
  teacherNavActive,
  type TeacherNavKey,
} from "@/lib/teacher-nav";
import { isTeacherOnly } from "@/lib/teacher-only";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<TeacherNavKey, LucideIcon> = {
  groups: Users,
  schedule: CalendarDays,
  tasks: ListChecks,
  salary: Wallet,
  profile: User,
};

const GROUP_ICONS = { davomat: ClipboardCheck, darslar: CalendarRange, oquvchilar: Users } as const;

/**
 * The teacher's phone chrome: a bottom bar (five sections, or the group's own
 * tabs inside a group), Telegram's «←» inside the Mini App, and the script
 * that gives the page `Telegram.WebApp`. Draws nothing for anyone else and on
 * wide screens, where the sidebar stays.
 */
export function TeacherChrome() {
  const roles = useAuth((s) => s.user?.roles);
  const isMobile = useIsMobile();
  if (!isMobile || !isTeacherOnly(roles)) return null;
  return <TeacherBars />;
}

function TeacherBars() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const t = useT();
  const mode = teacherBarMode(pathname, search ? `?${search}` : "");

  return (
    <>
      <MiniAppScript />
      <TelegramBack />
      {mode !== "hidden" && (
        <>
          {/* Keeps the page's last lines above the fixed bar. */}
          <div aria-hidden className="h-[calc(4.25rem+env(safe-area-inset-bottom))]" />
          <nav
            aria-label={t("Asosiy")}
            className="bg-background fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]"
          >
            {mode === "group" ? <GroupBar /> : <GlobalBar />}
          </nav>
        </>
      )}
    </>
  );
}

function Item({
  label,
  icon: Icon,
  active,
  badge,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: number;
}) {
  return (
    <span
      className={cn(
        "relative flex flex-col items-center gap-0.5 py-2 text-[11px]",
        active ? "text-primary font-medium" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
      {badge ? (
        <span className="bg-destructive absolute top-1 left-1/2 ml-2 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </span>
  );
}

function GlobalBar() {
  const pathname = usePathname();
  const t = useT();
  const active = teacherNavActive(pathname);
  const counts = useTaskCounts();
  return (
    <ul className="grid grid-cols-5">
      {TEACHER_NAV.map((item) => (
        <li key={item.key}>
          <Link href={item.href} aria-current={active === item.key ? "page" : undefined}>
            <Item
              label={t(item.label)}
              icon={NAV_ICONS[item.key]}
              active={active === item.key}
              badge={item.key === "tasks" ? counts.my : undefined}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GroupBar() {
  const pathname = usePathname();
  const search = `?${useSearchParams().toString()}`;
  const current = groupTab(search);
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = GROUP_MORE_TABS.some((tab) => tab.key === current);

  return (
    <>
      <ul className="grid grid-cols-5">
        <li>
          <Link href="/groups">
            <Item label={t("Guruhlar")} icon={ArrowLeft} />
          </Link>
        </li>
        {GROUP_MAIN_TABS.map((tab) => (
          <li key={tab.key}>
            <Link
              href={groupTabHref(pathname, search, tab.key)}
              replace
              scroll={false}
              aria-current={current === tab.key ? "page" : undefined}
            >
              <Item label={t(tab.label)} icon={GROUP_ICONS[tab.key]} active={current === tab.key} />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" className="w-full" onClick={() => setMoreOpen(true)}>
            <Item label={t("Yana")} icon={MoreHorizontal} active={moreActive} />
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>{t("Yana")}</SheetTitle>
          </SheetHeader>
          <ul className="divide-y px-4 pb-4">
            {GROUP_MORE_TABS.map((tab) => (
              <li key={tab.key}>
                <Link
                  href={groupTabHref(pathname, search, tab.key)}
                  replace
                  scroll={false}
                  onClick={() => setMoreOpen(false)}
                  className={cn("block py-3 text-sm", current === tab.key && "text-primary font-medium")}
                >
                  {t(tab.label)}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Telegram's own «←» (top left of the Mini App): shown on every page but the
 * five main ones, where Telegram offers «Yopish». It goes one step back, or to
 * the group / calendar when the page was opened directly (no history).
 */
function TelegramBack() {
  const inMiniApp = useIsMiniApp();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const wanted = inMiniApp && showTelegramBack(pathname);

  useEffect(() => {
    if (!inMiniApp) return;
    let cancelled = false;
    let off: (() => void) | undefined;

    const goBack = () =>
      requestLeave(() => {
        if (window.history.length > 1) router.back();
        else router.replace(backFallback(pathname, search ? `?${search}` : ""));
      });

    // The script may still be loading on a page opened directly.
    const attach = () => {
      const button = getTelegramWebApp()?.BackButton;
      if (!button) return false;
      if (wanted) {
        button.show();
        button.onClick(goBack);
        off = () => button.offClick(goBack);
      } else {
        button.hide();
      }
      return true;
    };

    if (!attach()) {
      const id = setInterval(() => {
        if (cancelled || attach()) clearInterval(id);
      }, 300);
      return () => {
        cancelled = true;
        clearInterval(id);
        off?.();
      };
    }
    return () => {
      cancelled = true;
      off?.();
    };
  }, [inMiniApp, wanted, pathname, search, router]);

  return null;
}
