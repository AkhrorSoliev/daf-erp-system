"use client";

import { useEffect, useState } from "react";
import { Columns3, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LEAD_FILTER_SCHEMA, leadFiltersActive } from "./lead-filter-schema";
import { LeadsFilterBar } from "./leads-filter-bar";
import { LeadsBoard } from "./leads-board";
import { LeadsList } from "./leads-list";
import { AddLeadDrawer } from "./add-lead-drawer";
import { EditLeadDrawer } from "./edit-lead-drawer";
import { MoveLeadDialog } from "./move-lead-dialog";
import { ConvertLeadDialog } from "./convert-lead-dialog";
import { CreateSectionDialog } from "./create-section-dialog";
import { CreateColumnDialog } from "./create-column-dialog";
import { RenameDialog } from "./rename-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { LeadDetailDrawer } from "./lead-detail-drawer";
import { ManageSourcesDialog } from "./manage-sources-dialog";

export function LeadsBoardClient() {
  const fetchBoard = useLeadsBoard((s) => s.fetchBoard);
  const openAddLead = useLeadsUi((s) => s.openAddLead);
  const openCreateColumn = useLeadsUi((s) => s.openCreateColumn);
  const { filters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const [manageSourcesOpen, setManageSourcesOpen] = useState(false);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // With an active filter the board is replaced by the flat filtered list.
  const filtering = leadFiltersActive(filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Lidlarni ustun va bo&apos;limlar bo&apos;yicha boshqaring
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setManageSourcesOpen(true)}
          >
            <Megaphone className="size-4" />
            Manbalar
          </Button>
          <Button size="sm" variant="outline" onClick={openCreateColumn}>
            <Columns3 className="size-4" />
            Yangi ustun
          </Button>
          <Button size="sm" onClick={() => openAddLead()}>
            <Plus className="size-4" />
            Yangi lid
          </Button>
        </div>
      </div>

      <LeadsFilterBar />

      {filtering ? <LeadsList /> : <LeadsBoard />}

      <AddLeadDrawer />
      <EditLeadDrawer />
      <MoveLeadDialog />
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
