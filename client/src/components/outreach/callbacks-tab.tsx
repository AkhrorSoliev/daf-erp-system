"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type {
  CallbacksResponse,
  CallbackItem,
  CallbackEntityLead,
  CallbackEntityStudent,
} from "./outreach-types";
import { TablePagination } from "./table-pagination";

const PRIORITY_LABEL: Record<NonNullable<CallbackItem["priority"]>, string> = {
  LOW: "Past",
  MEDIUM: "O'rta",
  HIGH: "Yuqori",
  URGENT: "Shoshilinch",
};

const PRIORITY_CLASS: Record<NonNullable<CallbackItem["priority"]>, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-800",
  URGENT: "bg-red-100 text-red-700",
};

const STATUS_FILTERS: { value: "active" | "done"; label: string; query: string }[] = [
  { value: "active", label: "Faol", query: "PENDING,SEEN" },
  { value: "done", label: "Bajarilgan", query: "DONE" },
];

interface CallbacksTabProps {
  isActive: boolean;
}

export function CallbacksTab({ isActive }: CallbacksTabProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const currentQuery =
    STATUS_FILTERS.find((s) => s.value === filter)?.query ?? "PENDING,SEEN";

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "callbacks", filter, page, pageSize],
    queryFn: () =>
      api
        .get<CallbacksResponse>("/outreach/my-callbacks", {
          params: { status: currentQuery, page, pageSize },
        })
        .then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  const markAssignee = useMutation({
    mutationFn: (params: { commentId: string; status: "SEEN" | "DONE" }) =>
      api.patch(`/comments/${params.commentId}/assignee-status`, {
        status: params.status,
      }),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === "DONE" ? "Bajarildi deb belgilandi" : "Ko'rildi deb belgilandi",
      );
      queryClient.invalidateQueries({ queryKey: ["outreach", "callbacks"] });
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Holatni o'zgartirishda xatolik")),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as "active" | "done");
            setPage(1);
          }}
        >
          <TabsList>
            {STATUS_FILTERS.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filter === "active"
            ? "Faol qo'ng'iroq vazifalari yo'q"
            : "Bajarilgan qo'ng'iroqlar yo'q"}
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Muddat</TableHead>
                  <TableHead>Muhimlik</TableHead>
                  <TableHead>Kim bilan</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Matn</TableHead>
                  <TableHead className="w-44">Amal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.items.map((row, idx) => (
                  <Row
                    key={row.commentId}
                    row={row}
                    index={(page - 1) * pageSize + idx}
                    onMark={(status) =>
                      markAssignee.mutate({ commentId: row.commentId, status })
                    }
                    marking={markAssignee.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            total={data!.total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}
    </div>
  );
}

function Row({
  row,
  index,
  onMark,
  marking,
}: {
  row: CallbackItem;
  index: number;
  onMark: (status: "SEEN" | "DONE") => void;
  marking: boolean;
}) {
  const entityHref = entityProfileHref(row);
  const entityLabel = entityName(row);
  const entityPhone = row.entity && "phone" in row.entity ? row.entity.phone : null;

  return (
    <TableRow className={row.isOverdue ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell>
        <StatusBadge status={row.assigneeStatus} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">
            {format(new Date(row.dueDate), "dd.MM.yyyy, HH:mm")}
          </span>
          {row.isOverdue && (
            <Badge variant="destructive" className="w-fit text-[10px]">
              Muddati o&apos;tib ketdi
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {row.priority ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_CLASS[row.priority]}`}
          >
            {PRIORITY_LABEL[row.priority]}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-medium">{entityLabel}</TableCell>
      <TableCell>{formatPhone(entityPhone)}</TableCell>
      <TableCell className="max-w-[260px] text-sm">
        <span className="line-clamp-2">{row.text}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {row.assigneeStatus === "PENDING" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMark("SEEN")}
              disabled={marking}
            >
              <Eye className="mr-1 size-3.5" />
              Ko&apos;rdim
            </Button>
          )}
          {row.assigneeStatus !== "DONE" && (
            <Button
              size="sm"
              variant="default"
              onClick={() => onMark("DONE")}
              disabled={marking}
            >
              {marking ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 size-3.5" />
              )}
              Bajarildi
            </Button>
          )}
          {entityHref && (
            <Button asChild size="sm" variant="ghost">
              <Link href={entityHref}>
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: CallbackItem["assigneeStatus"] }) {
  if (status === "DONE") {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Bajarildi</Badge>;
  }
  if (status === "SEEN") {
    return <Badge variant="secondary">Ko&apos;rilgan</Badge>;
  }
  return <Badge variant="outline">Kutilmoqda</Badge>;
}

function SkeletonRows() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function entityName(row: CallbackItem) {
  if (!row.entity) return `${row.entityType} #${row.entityId}`;
  const e = row.entity as CallbackEntityLead | CallbackEntityStudent;
  return `${e.firstName} ${e.lastName}`;
}

function entityProfileHref(row: CallbackItem) {
  if (row.entityType === "Student") {
    return `/students/profile/${row.entityId}`;
  }
  if (row.entityType === "Lead") {
    return `/leads`;
  }
  return null;
}

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
}
