"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCan } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ArchiveFilterBar } from "./archive/archive-filter-bar";
import { minusCounts, withoutRow } from "./archive/archive-cache";
import {
  archiveKeys,
  useArchiveSummary,
  useArchivedLeads,
  useArchivedSections,
  useBoardColumns,
} from "./archive/archive-queries";
import type {
  ArchiveSummary,
  ArchivedLead,
  ArchivedSection,
  BoardColumn,
  Paged,
} from "./archive/archive-types";
import { ArchivedLeadsTable } from "./archive/archived-leads-table";
import { ArchivedSectionsTable } from "./archive/archived-sections-table";
import { RestoreSectionDialog } from "./archive/restore-section-dialog";
import {
  LEADS_ARCHIVE_SCHEMA,
  archiveParams,
  archivePageSize,
  archiveTab,
  hasArchiveFilter,
  type ArchiveFilters,
} from "./archive/archive-url";
import { originOf } from "./archive/restore-lead-model";
import { RestoreLeadDialog, type RestoreLeadTarget } from "./restore-lead-dialog";
import { ArchivedLeadPanel } from "./archive/archived-lead-panel";
import { useArchivePanelUrl } from "./archive/archive-panel-url";

interface LeadsArchiveProps {
  /** When rendered inside /settings/archive, returns to the category grid. */
  onBack?: () => void;
}

const countLabel = (n: number | undefined) => (n === undefined ? "" : ` (${n})`);

const toRestoreTarget = (lead: ArchivedLead): RestoreLeadTarget => ({
  id: lead.id,
  firstName: lead.firstName,
  lastName: lead.lastName,
  origin: originOf(lead),
  notes: lead.notes,
});

// A stable empty list: the section dialog resets itself when `columns` changes.
const NO_COLUMNS: BoardColumn[] = [];

export function LeadsArchive({ onBack }: LeadsArchiveProps) {
  const queryClient = useQueryClient();
  const { filters, setFilters } = useUrlFilters(LEADS_ARCHIVE_SCHEMA);
  const canRestore = useCan("leads.manage");

  const tab = archiveTab(filters.tab);
  const pageSize = archivePageSize(filters.soni);
  const params = useMemo(() => archiveParams(filters), [filters]);

  const summary = useArchiveSummary();
  const leads = useArchivedLeads(params, tab === "lidlar");
  const sections = useArchivedSections(params, tab === "bolimlar");

  const [leadTarget, setLeadTarget] = useState<RestoreLeadTarget | null>(null);
  const panel = useArchivePanelUrl();
  const [sectionTarget, setSectionTarget] = useState<ArchivedSection | null>(
    null,
  );
  const board = useBoardColumns(!!leadTarget || !!sectionTarget);
  // A failed background refetch keeps the columns it already has.
  const boardFailed = board.isError && !board.data;

  // A filter change always puts the list back on page 1.
  const patch = useCallback(
    (update: Partial<ArchiveFilters>) => setFilters({ ...update, sahifa: 1 }),
    [setFilters],
  );
  const clear = () =>
    setFilters({ q: "", kim: [], dan: "", gacha: "", sahifa: 1 });
  const onPage = (sahifa: number) => setFilters({ sahifa });
  const onPageSize = (soni: number) => setFilters({ soni, sahifa: 1 });

  /** The page that just lost its last row steps back one page. */
  function stepBackIfEmpty(rowsOnPage: number) {
    if (rowsOnPage <= 1 && filters.sahifa > 1) {
      setFilters({ sahifa: filters.sahifa - 1 });
    }
  }

  function leadRestored(lead: RestoreLeadTarget) {
    // The prefix also holds single-lead details; `withoutRow` leaves those alone.
    queryClient.setQueriesData<Paged<ArchivedLead>>(
      { queryKey: archiveKeys.leads },
      (old) => withoutRow(old, lead.id),
    );
    queryClient.setQueryData<ArchiveSummary>(archiveKeys.summary, (old) =>
      minusCounts(old, { leads: 1 }),
    );
    // Other pages and filters are stale now; the open one was updated above.
    queryClient.invalidateQueries({
      queryKey: archiveKeys.leads,
      refetchType: "none",
    });
    stepBackIfEmpty(leads.data?.data.length ?? 0);
    setLeadTarget(null);
  }

  function sectionRestored(section: ArchivedSection, restoredLeadCount: number) {
    queryClient.setQueriesData<Paged<ArchivedSection>>(
      { queryKey: archiveKeys.sections },
      (old) => withoutRow(old, section.id),
    );
    queryClient.setQueryData<ArchiveSummary>(archiveKeys.summary, (old) =>
      minusCounts(old, { sections: 1, leads: restoredLeadCount }),
    );
    // Restored leads leave the leads list: refetch it when it is on screen,
    // otherwise on its next visit.
    queryClient.invalidateQueries({ queryKey: archiveKeys.leads });
    // The cached board lacks the section that just came back.
    queryClient.invalidateQueries({ queryKey: archiveKeys.board });
    stepBackIfEmpty(sections.data?.data.length ?? 0);
    setSectionTarget(null);
  }

  const filtered = hasArchiveFilter(filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {onBack ? (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="size-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" asChild>
                <Link href="/leads">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            )}
          </TooltipTrigger>
          <TooltipContent>
            {onBack ? "Arxivga qaytish" : "Lidlarga qaytish"}
          </TooltipContent>
        </Tooltip>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Lidlar arxivi</h2>
          <p className="text-xs text-muted-foreground">
            O&apos;chirilgan lidlar va bo&apos;limlar — tiklash mumkin
          </p>
        </div>
      </div>

      <ArchiveFilterBar
        filters={filters}
        archivers={summary.data?.archivers ?? []}
        onChange={patch}
        onClear={clear}
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          // Leaving the leads tab closes the panel and its tab param too.
          filters.lid
            ? panel.close({
                tab: value === "lidlar" ? null : value,
                sahifa: null,
              })
            : setFilters({ tab: value, sahifa: 1 })
        }
      >
        <TabsList>
          <TabsTrigger value="lidlar">
            Lidlar{countLabel(summary.data?.leads)}
          </TabsTrigger>
          <TabsTrigger value="bolimlar">
            Bo&apos;limlar{countLabel(summary.data?.sections)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lidlar" className="mt-3">
          <ArchivedLeadsTable
            query={leads}
            page={params.page}
            pageSize={pageSize}
            filtered={filtered}
            canRestore={canRestore}
            openId={filters.lid}
            onOpen={(id) => setFilters({ lid: id })}
            onRestore={(lead) => setLeadTarget(toRestoreTarget(lead))}
            onPage={onPage}
            onPageSize={onPageSize}
            onClear={clear}
          />
        </TabsContent>
        <TabsContent value="bolimlar" className="mt-3">
          <ArchivedSectionsTable
            query={sections}
            page={params.page}
            pageSize={pageSize}
            filtered={filtered}
            canRestore={canRestore}
            onRestore={setSectionTarget}
            onPage={onPage}
            onPageSize={onPageSize}
            onClear={clear}
          />
        </TabsContent>
      </Tabs>

      <RestoreLeadDialog
        target={leadTarget}
        columns={board.data ?? NO_COLUMNS}
        columnsLoading={board.isPending}
        columnsFailed={boardFailed}
        onClose={() => setLeadTarget(null)}
        onRestored={() => leadTarget && leadRestored(leadTarget)}
      />
      {tab === "lidlar" && filters.lid && (
        <ArchivedLeadPanel
          leadId={filters.lid}
          canRestore={canRestore}
          onClose={() => panel.close()}
          onRestore={(target) => {
            panel.close();
            setLeadTarget(target);
          }}
        />
      )}
      <RestoreSectionDialog
        target={sectionTarget}
        columns={board.data ?? NO_COLUMNS}
        columnsLoading={board.isPending}
        columnsFailed={boardFailed}
        onClose={() => setSectionTarget(null)}
        onRestored={({ restoredLeadCount }) =>
          sectionTarget && sectionRestored(sectionTarget, restoredLeadCount)
        }
      />
    </div>
  );
}
