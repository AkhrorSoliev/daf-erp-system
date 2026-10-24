"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupsCards } from "@/components/groups/groups-cards";
import type { GroupData } from "@/hooks/use-edit-group";
import api from "@/lib/api";
import { useT } from "@/i18n/context";

/**
 * «Boshlanmagan guruhlarim» — groups the teacher has been given that have not
 * started yet (FORMING), so a new group shows up before its first lesson.
 * The server already narrows `GET /groups` to the teacher's own groups. Draws
 * nothing while there are none, or when the request has no answer: the
 * timetable above it is the page.
 */
export function UpcomingGroups() {
  const t = useT();
  const { data, isPending } = useQuery({
    queryKey: ["groups", "forming", "mine"],
    queryFn: () =>
      api
        .get<{ data: GroupData[] }>("/groups", {
          params: { statusEnum: "FORMING", pageSize: 20 },
        })
        .then((r) => r.data.data),
  });

  if (isPending) return <Skeleton className="h-28 w-full" />;
  if (!data || data.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {t("Boshlanmagan guruhlarim")}
        <span className="text-muted-foreground text-xs font-normal">
          ({data.length})
        </span>
      </h2>
      <GroupsCards groups={data} />
    </section>
  );
}
