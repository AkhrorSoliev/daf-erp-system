"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import api from "@/lib/api";
import { getActionInfo, type HistoryRecord } from "./entity-history-utils";
import {
  ChangedFields,
  HistorySkeleton,
} from "./entity-history-changed-fields";

interface EntityHistoryTableProps {
  entityType: string;
  entityId: string | number;
}

export function EntityHistoryTable({
  entityType,
  entityId,
}: EntityHistoryTableProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const fetched = useRef(false);

  const fetchHistory = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const { data } = await api.get(
          `/entity-history/${entityType}/${entityId}`,
          { params: { page: p, pageSize } },
        );
        setRecords(data.data);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        setRecords([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId],
  );

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      fetchHistory(1);
    }
  }, [fetchHistory]);

  const totalPages = Math.ceil(total / pageSize);

  if (loading && records.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-40">Kim</TableHead>
              <TableHead className="w-44">Amal</TableHead>
              <TableHead>O&apos;zgarishlar</TableHead>
              <TableHead className="w-36">Sana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <HistorySkeleton />
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!loading && records.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">Tarix mavjud emas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-40">Kim</TableHead>
              <TableHead className="w-44">Amal</TableHead>
              <TableHead>O&apos;zgarishlar</TableHead>
              <TableHead className="w-36">Sana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record, index) => {
              const actionInfo = getActionInfo(record);
              const Icon = actionInfo.icon;

              return (
                <TableRow key={record.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * pageSize + index + 1}
                  </TableCell>

                  <TableCell>
                    {record.changedBy ? (
                      (() => {
                        const isStudent = record.changedBy!.roles?.some(
                          (r) => r.role.id === 6,
                        );
                        const content = (
                          <span className="flex items-center gap-2 text-left">
                            <Avatar className="size-6">
                              {record.changedBy!.photo && (
                                <AvatarImage src={record.changedBy!.photo} />
                              )}
                              <AvatarFallback className="text-[8px] font-medium">
                                {`${record.changedBy!.firstName?.[0] ?? ""}${record.changedBy!.lastName?.[0] ?? ""}`}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">
                              {record.changedBy!.firstName}{" "}
                              {record.changedBy!.lastName}
                              {isStudent && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  (o&apos;quvchi)
                                </span>
                              )}
                            </span>
                          </span>
                        );
                        return isStudent ? (
                          content
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/settings/employees/${record.changedBy!.id}`}
                                className="flex items-center gap-2 hover:underline text-left"
                              >
                                {content}
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Profilga o&apos;tish</TooltipContent>
                          </Tooltip>
                        );
                      })()
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Tizim
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={actionInfo.variant} className="gap-1">
                      <Icon className="size-3" />
                      {actionInfo.label}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <ChangedFields record={record} />
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(record.createdAt), "dd.MM.yyyy, HH:mm")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Jami: {total} ta yozuv</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => fetchHistory(page - 1)}
            >
              Oldingi
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => fetchHistory(page + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
