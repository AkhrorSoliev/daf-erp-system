"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2 } from "lucide-react";
import { ENTITY_API_PATH } from "@/lib/status-config";
import api from "@/lib/api";

interface StatusHistoryRecord {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedBy: { id: number; name: string } | null;
  createdAt: string;
}

interface StatusHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string | number;
  entityName: string;
}

export function StatusHistoryDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
}: StatusHistoryDialogProps) {
  const [records, setRecords] = useState<StatusHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const apiPath = ENTITY_API_PATH[entityType];
        const { data } = await api.get(`${apiPath}/${entityId}/status-history`);
        setRecords(data);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [open, entityType, entityId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Status tarixi</DialogTitle>
          <DialogDescription>
            <strong>{entityName}</strong> uchun barcha status o&apos;zgarishlar
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Status tarixi mavjud emas
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Kim</TableHead>
                  <TableHead>Oldingi</TableHead>
                  <TableHead>Yangi</TableHead>
                  <TableHead>Sabab</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record, index) => (
                  <TableRow key={record.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(record.createdAt), "dd.MM.yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {record.changedBy?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {record.fromStatus ? (
                        <StatusBadge entityType={entityType} status={record.fromStatus} />
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge entityType={entityType} status={record.toStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                      {record.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
