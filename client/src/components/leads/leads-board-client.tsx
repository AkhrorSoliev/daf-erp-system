"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Columns3, FileEdit, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { useT } from "@/i18n/context";
import { LEAD_FILTER_SCHEMA, leadFiltersActive } from "./lead-filter-schema";
import { LeadsFilterBar } from "./leads-filter-bar";
import { LeadsBoard } from "./leads-board";
import { LeadsList } from "./leads-list";
import { AddLeadDrawer } from "./add-lead-drawer";
import { EditLeadDrawer } from "./edit-lead-drawer";
import { MoveLeadDialog } from "./move-lead-dialog";
import { MoveSectionDialog } from "./move-section-dialog";
import { ConvertLeadDialog } from "./convert-lead-dialog";
import { CreateSectionDialog } from "./create-section-dialog";
import { CreateColumnDialog } from "./create-column-dialog";
import { RenameDialog } from "./rename-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { LeadDetailDrawer } from "./lead-detail-drawer";
import { ManageSourcesDialog } from "./manage-sources-dialog";
import { LeadsStatsStrip } from "./leads-stats-strip";
import { LeadOwnersStrip } from "./ownership/lead-owners-strip";

export function LeadsBoardClient() {
  const t = useT();
  const fetchBoard = useLeadsBoard((s) => s.fetchBoard);
  const openAddLead = useLeadsUi((s) => s.openAddLead);
  const openCreateColumn = useLeadsUi((s) => s.openCreateColumn);
  const openLeadDetail = useLeadsUi((s) => s.openLeadDetail);
  const { filters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const [manageSourcesOpen, setManageSourcesOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const linkedLeadId = searchParams.get("lead");

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // A lead has no page of its own, so other pages link to one as
  // `/leads?lead=<id>` (a task card does). Open its drawer, then drop the
  // param: the drawer's open state is not kept in the URL.
  useEffect(() => {
    if (!linkedLeadId) return;
    openLeadDetail(linkedLeadId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lead");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [linkedLeadId, openLeadDetail, pathname, router, searchParams]);

  // With an active filter the board is replaced by the flat filtered list.
  const filtering = leadFiltersActive(filters);

  return (
    // The page itself scrolls: the stats and owners strips above can be tall
    // (they wrap on narrow screens), so a fixed-height page left the list or
    // board a sliver with its own scrollbar and no way to scroll the page.
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("Lidlarni ustun va bo'limlar bo'yicha boshqaring")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/leads/forms">
              <FileEdit className="size-4" />
              {t("Formalar")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/leads/archive">
              <Archive className="size-4" />
              {t("Arxiv")}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setManageSourcesOpen(true)}
          >
            <Megaphone className="size-4" />
            {t("Manbalar")}
          </Button>
          <Button size="sm" variant="outline" onClick={openCreateColumn}>
            <Columns3 className="size-4" />
            {t("Yangi ustun")}
          </Button>
          <Button size="sm" onClick={() => openAddLead()}>
            <Plus className="size-4" />
            {t("Yangi lid")}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <LeadsStatsStrip />
        <LeadOwnersStrip />
      </div>

      <LeadsFilterBar />

      {filtering ? (
        <LeadsList />
      ) : (
        // The board keeps a viewport-tall box: its columns scroll inside it,
        // and the page scrolls down to it past the strips.
        <div className="h-[calc(100svh-6.5rem)] min-h-[24rem] sm:h-[calc(100svh-8.5rem)]">
          <LeadsBoard />
        </div>
      )}

      <AddLeadDrawer />
      <EditLeadDrawer />
      <MoveLeadDialog />
      <MoveSectionDialog />
      <ConvertLeadDialog />
      <CreateSectionDialog />
      <CreateColumnDialog />
      <RenameDialog />
      <DeleteConfirmDialog />
      <LeadDetailDrawer />
      <ManageSourcesDialog
        open={manageSourcesOpen}
        onClose={() => setManageSourcesOpen(false)}
      />
    </div>
  );
}
