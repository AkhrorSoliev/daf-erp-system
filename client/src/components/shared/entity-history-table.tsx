"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface HistoryRecord {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE" | "RESTORE";
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: { id: number; name: string } | null;
  createdAt: string;
}

interface HistoryResponse {
  data: HistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  CREATE: { label: "Yaratildi", variant: "default" },
  UPDATE: { label: "Yangilandi", variant: "secondary" },
  DELETE: { label: "O'chirildi", variant: "destructive" },
  STATUS_CHANGE: { label: "Status o'zgardi", variant: "outline" },
  RESTORE: { label: "Tiklandi", variant: "default" },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  return String(value);
}

function ChangedFields({ oldValues, newValues }: { oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null }) {
  if (!oldValues && !newValues) return <span className="text-muted-foreground">—</span>;

  // CREATE — show new values
  if (!oldValues && newValues) {
    const keys = Object.keys(newValues).slice(0, 3);
    return (
      <div className="space-y-0.5">
        {keys.map((key) => (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{key}:</span>{" "}
            <span className="font-medium">{formatValue(newValues[key])}</span>
          </div>
        ))}
        {Object.keys(newValues).length > 3 && (
          <div className="text-xs text-muted-foreground">+{Object.keys(newValues).length - 3} ta maydon</div>
        )}
      </div>
    );
  }

  // DELETE — show old values
  if (oldValues && !newValues) {
    return <span className="text-xs text-muted-foreground">Barcha ma&apos;lumotlar arxivlandi</span>;
  }

  // UPDATE / STATUS_CHANGE — show diff
  if (oldValues && newValues) {
    const keys = Object.keys(newValues);
    return (
      <div className="space-y-0.5">
        {keys.map((key) => (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{key}:</span>{" "}
            <span className="text-red-500 line-through">{formatValue(oldValues[key])}</span>
            {" → "}
            <span className="font-medium text-green-600">{formatValue(newValues[key])}</span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

interface EntityHistoryTableProps {
  entityType: string;
  entityId: string | number;
}

export function EntityHistoryTable({ entityType, entityId }: EntityHistoryTableProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const fetched = useRef(false);

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<HistoryResponse>(
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
  }, [entityType, entityId]);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      fetchHistory(1);
    }
  }, [fetchHistory]);

  const totalPages = Math.ceil(total / pageSize);

  if (loading && records.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
              <TableHead className="w-40">Sana</TableHead>
              <TableHead className="w-32">Kim</TableHead>
              <TableHead className="w-36">Amal</TableHead>
              <TableHead>O&apos;zgarishlar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record, index) => {
              const actionConfig = ACTION_LABELS[record.action] ?? ACTION_LABELS.UPDATE;
              return (
                <TableRow key={record.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(record.createdAt), "dd.MM.yyyy, HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {record.changedBy?.name ?? "Tizim"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionConfig.variant}>{actionConfig.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <ChangedFields oldValues={record.oldValues} newValues={record.newValues} />
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
            <span>{page} / {totalPages}</span>
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
