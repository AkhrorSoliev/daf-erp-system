"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useBranchReadiness } from "@/hooks/use-branch-readiness";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useSpotlight } from "@/hooks/use-spotlight";
import type { LaunchStation } from "./launch-stations";
import { launchFlags, NO_LAUNCH_FLAGS } from "./launch-storage";
import { resolveLaunchJourney, type JourneyStation } from "./resolve-launch-journey";
import { canSeeLaunchJourney, resolveLaunchVisibility } from "./resolve-launch-visibility";

/**
 * "Launch the branch" — the journey map on the home page
 * (docs/superpowers/specs/2026-09-24-filial-ishga-tushirish-yoli-design.md).
 *
 * Station state comes from the server, never set by hand. Who sees it and
 * when the card disappears lives in `resolveLaunchVisibility`, with tests.
 */
export function BranchLaunchCard() {
  const user = useAuth((s) => s.user);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const startSpotlight = useSpotlight((s) => s.start);
  const router = useRouter();

  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const userId = user?.id;
  const branchId = selectedBranch?.id ?? null;

  // The flags live in localStorage, per user and branch, and are read as an
  // external store: switching the user or the branch reads the new pair in
  // the same render, and every `launchFlags.write` re-renders the card.
  // Nothing here copies them into state, so no effect has to keep a copy in
  // step. The server render has no storage and sees nothing remembered.
  const flags = useSyncExternalStore(
    launchFlags.subscribe,
    () =>
      userId === undefined || branchId === null
        ? NO_LAUNCH_FLAGS
        : launchFlags.snapshot(userId, branchId),
    () => NO_LAUNCH_FLAGS,
  );

  // Once `launched` has latched, the map never needs the server's readiness
  // again — asking it would only invite a stale response to resurrect the
  // map for a branch that already launched.
  const { data } = useBranchReadiness(
    branchId,
    branchLoaded && canSeeLaunchJourney(roleIds) && !flags.launched,
  );

  const visibility = resolveLaunchVisibility({
    roleIds,
    selectedBranchId: branchId,
    readiness: data,
    flags,
  });

  // The card was rendered in map state — "seen". Later, once `launched`, the
  // celebration shows only to a user for whom this became true. Writing to
  // storage is the effect's whole job; the store re-renders the card.
  useEffect(() => {
    if (visibility !== "journey" || userId === undefined || branchId === null || flags.seen) {
      return;
    }
    launchFlags.write(userId, branchId, "seen", true);
  }, [visibility, userId, branchId, flags.seen]);

  // The server just reported the branch as launched — latch it once. From
  // then on the query above stays off and this effect is a no-op.
  useEffect(() => {
    if (userId === undefined || branchId === null || !data?.launched || flags.launched) return;
    launchFlags.write(userId, branchId, "launched", true);
  }, [data?.launched, userId, branchId, flags.launched]);

  if (visibility === "hidden" || !user || branchId === null) return null;

  if (visibility === "celebrate") {
    const close = () => launchFlags.write(user.id, branchId, "celebrated", true);
    return (
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <PartyPopper className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Filial ishga tushdi</p>
            <p className="text-sm text-muted-foreground">
              Guruh ochildi, o&apos;quvchilar yozildi va birinchi to&apos;lov qayd qilindi.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={close}>
            Yopish
          </Button>
        </div>
      </section>
    );
  }

  // `visibility` is only ever "journey" when `readiness` resolved (see
  // `resolveLaunchVisibility`) — this is for the type checker, not a real
  // runtime path.
  if (!data) return null;

  const journey = resolveLaunchJourney(data.checks);

  const go = (station: LaunchStation) => {
    const route = station.route(branchId);
    if (station.targets.length > 0) {
      startSpotlight({
        route,
        targets: station.targets,
        title: station.tourTitle,
        body: station.tourBody,
      });
    }
    router.push(route);
  };

  const toggleCollapsed = () =>
    launchFlags.write(user.id, branchId, "collapsed", !flags.collapsed);

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="launch-title">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="launch-title" className="text-sm font-semibold">
          Filialni ishga tushirish
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            {journey.doneCount} / {journey.total}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={toggleCollapsed}
            aria-expanded={!flags.collapsed}
            aria-label={flags.collapsed ? "Xaritani ochish" : "Xaritani yig'ish"}
          >
            {flags.collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
        </div>
      </div>

      {!flags.collapsed && (
        <div className="space-y-4 px-4 py-4">
          <ol className="grid gap-1 sm:grid-cols-8 sm:gap-0">
            {journey.stations.map((s, i) => (
              <StationStop
                key={s.station.key}
                item={s}
                index={i}
                isLast={i === journey.stations.length - 1}
                onClick={() => go(s.station)}
              />
            ))}
          </ol>

          {journey.current && (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p>
                  <span className="text-muted-foreground">Keyingi: </span>
                  {journey.current.hint}
                </p>
                {journey.current.details.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    {journey.current.details
                      .map((d) => (d.ceoOnly ? `${d.name} (CEO belgilaydi)` : d.name))
                      .join(", ")}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => go(journey.current!.station)}
              >
                {journey.current.station.action}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Qo&apos;shimcha:</span>
            {journey.extras.map((x) => (
              <button
                key={x.station.key}
                type="button"
                onClick={() => go(x.station)}
                title={x.hint}
                className="inline-flex items-center gap-1.5 hover:underline"
              >
                {x.ok ? (
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                )}
                {x.station.short}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StationStop({
  item,
  index,
  isLast,
  onClick,
}: {
  item: JourneyStation;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) {
  const { state, station } = item;
  return (
    <li className="relative">
      {/* The line between stations — only on the horizontal map. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-[18px] left-[calc(50%+16px)] right-[calc(-50%+16px)] hidden border-t border-dashed sm:block"
        />
      )}
      <button
        type="button"
        onClick={onClick}
        aria-current={state === "current" ? "step" : undefined}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60 sm:flex-col sm:gap-1.5 sm:text-center"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            state === "done" &&
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
            state === "current" && "bg-primary/10 text-primary ring-2 ring-primary",
            state === "todo" && "border bg-background text-muted-foreground",
          )}
        >
          {state === "done" ? <Check className="size-4" /> : index + 1}
        </span>
        <span
          className={cn(
            "text-xs",
            state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {station.short}
        </span>
      </button>
    </li>
  );
}
