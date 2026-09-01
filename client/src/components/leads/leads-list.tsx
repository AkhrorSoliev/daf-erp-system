"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import toast from "react-hot-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import { listParam, useUrlFilters } from "@/hooks/use-url-filters";
import {
  LEAD_STATUS_LABELS,
  useLeadsBoard,
  type LeadStatus,
} from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { LEAD_FILTER_SCHEMA, leadHolatiParams } from "./lead-filter-schema";

interface LeadListRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  statusEnum: LeadStatus;
  createdAt: string;
  source: { id: string; name: string } | null;
  section: {
    id: string;
    name: string;
    column: { id: string; name: string };
  } | null;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export function LeadsList() {
  const { filters, setFilter, setFilters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const revision = useLeadsBoard((s) => s.revision);
  const openLeadDetail = useLeadsUi((s) => s.openLeadDetail);
  const openEditLead = useLeadsUi((s) => s.openEditLead);
  const openMoveLead = useLeadsUi((s) => s.openMoveLead);
  const openDelete = useLeadsUi((s) => s.openDelete);

  const [rows, setRows] = useState<LeadListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      if (filters.search.trim()) params.search = filters.search.trim();
      params.sourceId = listParam(filters.sourceId);
      params.columnId = listParam(filters.columnId);
      // Birlashgan «Holati» filtri: bir guruh ichi YOKI, guruhlar orasi VA.
      Object.assign(params, leadHolatiParams(filters.holati));
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const { data } = await api.get("/leads", { params });
      setRows(data.data);
      setTotal(data.total);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lidlarni yuklashda xatolik"));
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.pageSize,
    filters.search,
    filters.holati,
    filters.sourceId,
    filters.columnId,
    filters.startDate,
    filters.endDate,
  ]);

  // `revision` re-runs the fetch after a lead is created / edited / moved.
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads, revision]);

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism familya</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead>Manba</TableHead>
              <TableHead>Joylashuvi</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead className="w-12 text-right">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, c) => (
                    <TableCell key={c}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  Filtrga mos lid topilmadi
                </TableCell>
              </TableRow>
            ) : (
              rows.map((lead, index) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer"
                  onClick={() => openLeadDetail(lead.id)}
                >
                  <TableCell className="border-r text-muted-foreground">
                    {(filters.page - 1) * filters.pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {lead.firstName} {lead.lastName}
                  </TableCell>
                  <TableCell>{formatPhone(lead.phone)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {LEAD_STATUS_LABELS[lead.statusEnum]}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.source?.name ?? "—"}</TableCell>
                  <TableCell>
                    {lead.section
                      ? `${lead.section.column.name} › ${lead.section.name}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(lead.createdAt), "dd.MM.yyyy")}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Amallar</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            openEditLead({
                              id: lead.id,
                              sectionId: lead.section?.id ?? "",
                              firstName: lead.firstName,
                              lastName: lead.lastName,
                              phone: lead.phone,
                              sourceId: lead.source?.id ?? "",
                            })
                          }
                        >
                          <Pencil className="mr-2 size-4" />
                          Tahrirlash
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            openMoveLead({
                              id: lead.id,
                              sectionId: lead.section?.id ?? "",
                            })
                          }
                        >
                          <ArrowRightLeft className="mr-2 size-4" />
                          Ko&apos;chirish
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() =>
                            openDelete({
                              kind: "lead",
                              id: lead.id,
                              name: `${lead.firstName} ${lead.lastName}`,
                              sectionId: lead.section?.id ?? "",
                            })
                          }
                        >
                          <Trash2 className="mr-2 size-4" />
                          O&apos;chirish
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sahifada:</span>
          <Select
            value={String(filters.pageSize)}
            onValueChange={(value) =>
              setFilters({ pageSize: Number(value), page: 1 })
            }
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Jami: {total} ta lid
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => setFilter("page", filters.page - 1)}
          >
            <ChevronLeft className="mr-1 size-4" />
            Oldingi
          </Button>
          <span className="text-sm">
            {filters.page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page >= totalPages}
            onClick={() => setFilter("page", filters.page + 1)}
          >
            Keyingi
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
