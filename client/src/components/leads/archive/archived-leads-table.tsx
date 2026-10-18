"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { archiveDate } from "./archive-format";
import {
  ArchiveEmptyStates,
  RestoreMenu,
  deletedByName,
} from "./archive-table-parts";
import type { ArchivedLead, Paged } from "./archive-types";
import { ARCHIVE_PAGE_SIZES } from "./archive-url";

export function ArchivedLeadsTable({
  query,
  page,
  pageSize,
  filtered,
  canRestore,
  openId,
  onOpen,
  onRestore,
  onPage,
  onPageSize,
  onClear,
}: {
  query: UseQueryResult<Paged<ArchivedLead>>;
  page: number;
  pageSize: number;
  filtered: boolean;
  canRestore: boolean;
  /** The lead whose side panel is open. */
  openId: string;
  onOpen: (id: string) => void;
  onRestore: (lead: ArchivedLead) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onClear: () => void;
}) {
  const rows = query.data?.data ?? [];
  const span = canRestore ? 7 : 6;
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-md border",
          query.isFetching && !query.isPending && "opacity-70",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism</TableHead>
              <TableHead>Bo&apos;lim</TableHead>
              <TableHead>Yo&apos;qotilish sababi</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead>Kim tomonidan</TableHead>
              {canRestore && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            <ArchiveEmptyStates
              span={span}
              isPending={query.isPending}
              isError={query.isError && !query.data}
              isEmpty={
                !!query.data && rows.length === 0 && !query.isPlaceholderData
              }
              filtered={filtered}
              noun="lid"
              onRetry={() => query.refetch()}
              onClear={onClear}
            />
            {rows.map((lead, index) => (
              <TableRow
                key={lead.id}
                tabIndex={0}
                className={cn(
                  "cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  openId === lead.id && "bg-muted/50",
                )}
                onClick={() => onOpen(lead.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(lead.id);
                  }
                }}
              >
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(lead.id);
                    }}
                  >
                    {lead.firstName} {lead.lastName}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(lead.phone)}
                  </p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {lead.section
                    ? `${lead.section.column?.name ?? "—"} · ${lead.section.name}`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {lead.lostReason ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block max-w-[14rem] truncate">
                          {lead.lostReason}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {lead.lostReason}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {archiveDate(lead.deletedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {deletedByName(lead.deletedBy)}
                </TableCell>
                {canRestore && (
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <RestoreMenu onRestore={() => onRestore(lead)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {query.data && query.data.total > 0 && (
        <PaymentsPager
          page={page}
          pageSize={pageSize}
          total={query.data.total}
          onPage={onPage}
          onPageSize={onPageSize}
          sizes={ARCHIVE_PAGE_SIZES}
          sizeLabel="Sahifadagi qatorlar soni"
        />
      )}
    </div>
  );
}
