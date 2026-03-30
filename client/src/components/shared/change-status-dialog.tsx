"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getAllowedTransitions,
  ENTITY_API_PATH,
  ENTITY_STATUS_MAP,
  REASON_REQUIRED_STATUSES,
} from "@/lib/status-config";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface ChangeStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string | number;
  entityName: string;
  currentStatus: string;
  onStatusChanged?: (newStatus: string) => void;
}

export function ChangeStatusDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  currentStatus,
  onStatusChanged,
}: ChangeStatusDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const allowedStatuses = getAllowedTransitions(entityType, currentStatus);
  const statusMap = ENTITY_STATUS_MAP[entityType] ?? {};
  const apiPath = ENTITY_API_PATH[entityType];
  const isReasonRequired = REASON_REQUIRED_STATUSES.includes(selectedStatus);

  const handleSubmit = async () => {
    if (!selectedStatus) return;
    if (isReasonRequired && !reason.trim()) {
      toast.error("Sabab kiritish majburiy");
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`${apiPath}/${entityId}/status`, {
        status: selectedStatus,
        reason: reason.trim() || undefined,
      });
      toast.success("Status muvaffaqiyatli o'zgartirildi");
      onStatusChanged?.(selectedStatus);
      onOpenChange(false);
      setSelectedStatus("");
      setReason("");
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Statusni o'zgartirishda xatolik";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedStatus("");
      setReason("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Statusni o&apos;zgartirish</DialogTitle>
          <DialogDescription>
            <strong>{entityName}</strong> uchun yangi statusni tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Hozirgi:</span>
            <StatusBadge entityType={entityType} status={currentStatus} />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Yangi status</span>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Statusni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {allowedStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusMap[status]?.label ?? status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStatus && (
            <div className="space-y-2">
              <span className="text-sm font-medium">
                Sabab {isReasonRequired ? "(majburiy)" : "(ixtiyoriy)"}
              </span>
              <Textarea
                placeholder="Sabab yozing..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedStatus || submitting || (isReasonRequired && !reason.trim())}
          >
            {submitting ? "O'zgartirilmoqda..." : "O'zgartirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
