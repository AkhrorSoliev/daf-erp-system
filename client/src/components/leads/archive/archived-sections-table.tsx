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
import { cn } from "@/lib/utils";
import { archiveDate } from "./archive-format";
import {
  ArchiveEmptyStates,
  RestoreMenu,
  deletedByName,
} from "./archive-table-parts";
import type { ArchivedSection, Paged } from "./archive-types";
import { ARCHIVE_PAGE_SIZES } from "./archive-url";

export function ArchivedSectionsTable({
  query,
  page,
  pageSize,
  filtered,
  canRestore,
  onRestore,
  onPage,
  onPageSize,
  onClear,
}: {
  query: UseQueryResult<Paged<ArchivedSection>>;
  page: number;
  pageSize: number;
  filtered: boolean;
  canRestore: boolean;
  onRestore: (section: ArchivedSection) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onClear: () => void;
}) {
  const rows = query.data?.data ?? [];
  const span = canRestore ? 6 : 5;
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
              <TableHead>Bo&apos;lim</TableHead>
              <TableHead>Lidlar</TableHead>
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
              isEmpty={!!query.data && rows.length === 0}
              filtered={filtered}
              noun="bo'lim"
              onRetry={() => query.refetch()}
              onClear={onClear}
            />
            {rows.map((section, index) => (
              <TableRow key={section.id}>
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{section.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {section.column?.name ?? "—"}
                  </p>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {section.leadCount}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {archiveDate(section.deletedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {deletedByName(section.deletedBy)}
                </TableCell>
                {canRestore && (
                  <TableCell>
                    <RestoreMenu onRestore={() => onRestore(section)} />
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
