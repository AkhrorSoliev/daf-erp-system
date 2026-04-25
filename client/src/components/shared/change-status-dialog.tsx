"use client";

import { useState } from "react";
import {
  PauseCircle,
  Snowflake,
  GraduationCap,
  Ban,
  CircleCheck,
  CircleOff,
  ShieldOff,
  UserX,
  Play,
  Square,
  XCircle,
  Wrench,
  Archive,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getAllowedTransitions,
  ENTITY_API_PATH,
} from "@/lib/status-config";
import api from "@/lib/api";
import toast from "react-hot-toast";

// ─── Status card configs ─────────────────────────────
interface StatusCardConfig {
  icon: LucideIcon;
  label: string;
  description: string;
  color: string; // tailwind color name
}

const STATUS_CARD_CONFIG: Record<string, StatusCardConfig> = {
  // Student
  ACTIVE: { icon: CircleCheck, label: "Faol", description: "Qayta faollashtirish", color: "emerald" },
  INACTIVE: { icon: PauseCircle, label: "Nofaol", description: "Vaqtincha to'xtatish", color: "amber" },
  FROZEN: { icon: Snowflake, label: "Muzlatilgan", description: "O'qishni muzlatish", color: "blue" },
  GRADUATED: { icon: GraduationCap, label: "Bitirgan", description: "Kursni muvaffaqiyatli tugatdi", color: "emerald" },
  EXPELLED: { icon: Ban, label: "Chetlatilgan", description: "Sabab bilan chetlatish", color: "red" },
  ARCHIVED: { icon: Archive, label: "Arxivlash", description: "Xato/duplikat yozuvni yashirish", color: "red" },
  // User/Teacher
  SUSPENDED: { icon: ShieldOff, label: "To'xtatilgan", description: "Vaqtincha to'xtatish", color: "amber" },
  TERMINATED: { icon: UserX, label: "Ishdan bo'shatilgan", description: "Butunlay to'xtatish", color: "red" },
  // Group
  FORMING: { icon: Play, label: "Boshlanmagan", description: "Guruh shakllanmoqda", color: "blue" },
  PAUSED: { icon: PauseCircle, label: "Pauza", description: "Vaqtincha to'xtatish", color: "amber" },
  COMPLETED: { icon: CircleCheck, label: "Tugallangan", description: "Guruh tugadi", color: "emerald" },
  CANCELLED: { icon: XCircle, label: "Bekor qilingan", description: "Guruh bekor qilindi", color: "red" },
  // Course/Branch/Room
  DEPRECATED: { icon: Archive, label: "Eskirgan", description: "Endi ishlatilmaydi", color: "gray" },
  CLOSED: { icon: Square, label: "Yopilgan", description: "Filial yopildi", color: "red" },
  UNDER_MAINTENANCE: { icon: Wrench, label: "Ta'mirda", description: "Xona ta'mirda", color: "amber" },
};

const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    iconBg: "bg-red-100 dark:bg-red-900/40",
  },
  gray: {
    bg: "bg-muted/50",
    border: "border-border",
    text: "text-muted-foreground",
    iconBg: "bg-muted",
  },
};

function getCardConfig(status: string): StatusCardConfig {
  return STATUS_CARD_CONFIG[status] ?? {
    icon: CircleOff,
    label: status,
    description: "",
    color: "gray",
  };
}

// ─── Component ───────────────────────────────────────

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
  const apiPath = ENTITY_API_PATH[entityType];
  const isArchiving = selectedStatus === "ARCHIVED";
  const isReasonRequired = selectedStatus !== "GRADUATED" && selectedStatus !== "COMPLETED";

  const handleSubmit = async () => {
    if (!selectedStatus) return;
    if (isReasonRequired && !reason.trim()) {
      toast.error("Sabab kiritish majburiy");
      return;
    }

    setSubmitting(true);
    try {
      if (isArchiving) {
        await api.delete(`${apiPath}/${entityId}`, {
          data: { reason: reason.trim() },
        });
        toast.success("Muvaffaqiyatli arxivlandi");
      } else {
        await api.patch(`${apiPath}/${entityId}/status`, {
          status: selectedStatus,
          reason: reason.trim() || undefined,
        });
        toast.success("Status muvaffaqiyatli o'zgartirildi");
      }
      onStatusChanged?.(selectedStatus);
      handleClose(false);
    } catch (error: any) {
      const fallback = isArchiving
        ? "Arxivlashda xatolik"
        : "Statusni o'zgartirishda xatolik";
      const msg = error?.response?.data?.message || fallback;
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

  const isTerminal = allowedStatuses.length === 0;

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
          {/* Hozirgi status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Hozirgi:</span>
            <StatusBadge entityType={entityType} status={currentStatus} />
          </div>

          {/* Terminal status — o'zgartirish mumkin emas */}
          {isTerminal ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Bu statusdan boshqa statusga o&apos;tish mumkin emas
              </p>
            </div>
          ) : (
            <>
              {/* Status cards grid */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Yangi statusni tanlang</span>
                <div className="grid grid-cols-2 gap-2">
                  {allowedStatuses.map((status) => {
                    const config = getCardConfig(status);
                    const colors = COLOR_CLASSES[config.color] || COLOR_CLASSES.gray;
                    const Icon = config.icon;
                    const isSelected = selectedStatus === status;

                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setSelectedStatus(status)}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                          isSelected
                            ? `${colors.bg} ${colors.border} ring-2 ring-offset-1 ${colors.border.replace("border-", "ring-")}`
                            : "border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                          isSelected ? colors.iconBg : "bg-muted"
                        }`}>
                          <Icon className={`size-4 ${isSelected ? colors.text : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium leading-tight ${
                            isSelected ? colors.text : "text-foreground"
                          }`}>
                            {config.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                            {config.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Arxivlash uchun qo'shimcha ogohlantirish */}
              {isArchiving && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  Arxivlash faqat <strong>xato, duplikat yoki test yozuvlar</strong> uchun — yozuv ro&apos;yxatdan ko&apos;rinmay qoladi. Agar o&apos;quvchi real chetlatilayotgan bo&apos;lsa, <strong>&ldquo;Chetlatilgan&rdquo;</strong> holatni tanlang.
                </div>
              )}

              {/* Sabab */}
              {selectedStatus && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">
                    Sabab <span className="text-destructive">*</span>
                  </span>
                  <Textarea
                    placeholder={isArchiving ? "Masalan: duplikat yozuv, xato kiritilgan..." : "Sabab yozing..."}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            {isTerminal ? "Yopish" : "Bekor qilish"}
          </Button>
          {!isTerminal && (
            <Button
              onClick={handleSubmit}
              disabled={!selectedStatus || submitting || (isReasonRequired && !reason.trim())}
              variant={isArchiving ? "destructive" : "default"}
            >
              {submitting
                ? isArchiving ? "Arxivlanmoqda..." : "O'zgartirilmoqda..."
                : isArchiving ? "Arxivlash" : "O'zgartirish"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
