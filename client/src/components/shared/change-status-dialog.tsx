"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPrice } from "@/lib/format-utils";
import {
  getAllowedTransitions,
  ENTITY_API_PATH,
} from "@/lib/status-config";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import toast from "react-hot-toast";

// Maps Student status enum -> StudentExitReason.appliesTo enum
const STATUS_TO_EXIT_TYPE: Record<string, string> = {
  FROZEN: "FREEZE",
  EXPELLED: "EXPEL",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVE",
};

// ─── Status card configs ─────────────────────────────
interface StatusCardConfig {
  icon: LucideIcon;
  label: string;
  description: string;
  color: string; // tailwind color name
}

const STATUS_CARD_CONFIG: Record<string, StatusCardConfig> = {
  // Student
  ACTIVE: { icon: CircleCheck, label: "Faol", description: "Qayta o'qishni davom ettiradi", color: "emerald" },
  INACTIVE: { icon: PauseCircle, label: "Nofaol", description: "Aloqaga chiqmayapti", color: "amber" },
  FROZEN: { icon: Snowflake, label: "Muzlatilgan", description: "Vaqtincha to'xtadi, keyin qaytadi", color: "blue" },
  GRADUATED: { icon: GraduationCap, label: "Bitirgan", description: "Kursni muvaffaqiyatli tugatdi", color: "emerald" },
  EXPELLED: { icon: Ban, label: "Chetlatilgan", description: "O'qishni butunlay tashlab ketdi", color: "red" },
  ARCHIVED: { icon: Archive, label: "Arxivlash", description: "Faqat xato/duplikat yozuv uchun", color: "red" },
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
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Per-enrollment refund override (FROZEN students only). Key = enrollmentId,
  // value = how many lessons to refund. Empty map = use auto-suggested counts.
  const [frozenRefundOverrides, setFrozenRefundOverrides] = useState<
    Record<string, number>
  >({});

  const allowedStatuses = getAllowedTransitions(entityType, currentStatus);
  const apiPath = ENTITY_API_PATH[entityType];
  const isArchiving = selectedStatus === "ARCHIVED";
  const isReasonRequired = selectedStatus !== "GRADUATED" && selectedStatus !== "COMPLETED";

  // Only the Student status flow uses the StudentExitReason enum.
  const exitType =
    entityType === "students" ? STATUS_TO_EXIT_TYPE[selectedStatus] : undefined;

  // Cache reasons per exit type so switching between statuses is instant after
  // the first fetch — no flicker between Select and Textarea.
  const { data: reasons, isFetching: reasonsLoading } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ["student-exit-reasons", exitType],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/student-exit-reasons", {
          params: { appliesTo: exitType },
        })
        .then((r) => r.data),
    enabled: open && !!exitType,
    // Reasons rarely change during a single dialog session; reuse cached data
    // when the user toggles between statuses.
    staleTime: 60_000,
  });

  // Reset the picked reason whenever the target status (and thus the available
  // reasons list) changes — but DO NOT clear the textarea, since the admin's
  // free-text comment may still apply.
  useEffect(() => {
    setReasonId(null);
  }, [exitType]);

  // FROZEN-only: prefetch the student's active enrollments + their prepaid
  // counts so the dialog can show "X dars × Y so'm = Z so'm" preview and let
  // the admin tweak the per-enrollment refund count.
  const isFreezingStudent =
    entityType === "students" && selectedStatus === "FROZEN";

  type PrepaidEnrollment = {
    enrollmentId: string;
    groupId: string;
    groupName: string;
    prepaidLessonsRemaining: number;
    perLessonCost: number;
    consumedLessons: number;
    maxRefundable: number;
    suggestedRefundAmount: number;
  };

  const { data: prepaidEnrollments } = useQuery<PrepaidEnrollment[]>({
    queryKey: ["student-active-enrollments-prepaid", entityId],
    queryFn: () =>
      api
        .get<PrepaidEnrollment[]>(
          `/students/${entityId}/active-enrollments-prepaid`,
        )
        .then((r) => r.data),
    enabled: open && isFreezingStudent,
    staleTime: 30_000,
  });

  // Reset the override map whenever we leave the FROZEN flow so a previous
  // session's edits don't leak into the next status change.
  useEffect(() => {
    if (!isFreezingStudent) setFrozenRefundOverrides({});
  }, [isFreezingStudent]);

  const hasConfiguredReasons = (reasons?.length ?? 0) > 0;
  // While reasons for an ExitType are loading, treat the dropdown as the
  // canonical input (don't fall back to the textarea-only branch). This
  // prevents the "Select disappears, then reappears" flicker.
  const useDropdown =
    !!exitType && (reasonsLoading || hasConfiguredReasons);

  const canSubmit = (() => {
    if (!selectedStatus) return false;
    if (!isReasonRequired) return true;
    if (reasonsLoading) return false; // wait for reasons to load
    if (useDropdown && hasConfiguredReasons) return reasonId !== null;
    return reason.trim().length > 0;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      if (isArchiving) {
        await api.delete(`${apiPath}/${entityId}`, {
          data: {
            reason: reason.trim() || undefined,
            reasonId: reasonId ?? undefined,
          },
        });
        toast.success("Muvaffaqiyatli arxivlandi");
      } else {
        await api.patch(`${apiPath}/${entityId}/status`, {
          status: selectedStatus,
          reasonId: reasonId ?? undefined,
          reason: reason.trim() || undefined,
          // Only send overrides on FROZEN; backend ignores the field for
          // other statuses anyway, but sending it is wasteful and confusing.
          ...(isFreezingStudent && Object.keys(frozenRefundOverrides).length > 0
            ? { frozenRefundOverrides }
            : {}),
        });
        toast.success("Status muvaffaqiyatli o'zgartirildi");
      }
      onStatusChanged?.(selectedStatus);
      handleClose(false);
    } catch (error) {
      const fallback = isArchiving
        ? "Arxivlashda xatolik"
        : "Statusni o'zgartirishda xatolik";
      toast.error(getErrorMessage(error, fallback));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedStatus("");
      setReason("");
      setReasonId(null);
      setFrozenRefundOverrides({});
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

              {/* FROZEN refund preview (students only). Auto-suggests
                  prepaidLessonsRemaining for each enrollment; admin can edit
                  each one. Going above the prepaid count reverses
                  already-attended lessons (and the matching salary accruals)
                  — explained in the warning text below. */}
              {isFreezingStudent &&
                prepaidEnrollments &&
                prepaidEnrollments.length > 0 && (
                  <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <div className="text-xs font-medium text-blue-900 dark:text-blue-300">
                      Pul qaytarish — qolgan darslar avtomatik balansga qaytariladi
                    </div>
                    <div className="space-y-2">
                      {prepaidEnrollments.map((enr) => {
                        const override = frozenRefundOverrides[enr.enrollmentId];
                        const value =
                          override !== undefined
                            ? override
                            : enr.prepaidLessonsRemaining;
                        return (
                          <div
                            key={enr.enrollmentId}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span
                              className="flex-1 truncate"
                              title={enr.groupName}
                            >
                              {enr.groupName}
                              <span className="ml-1 text-muted-foreground">
                                · {formatPrice(enr.perLessonCost)} so&apos;m/dars
                              </span>
                            </span>
                            <Input
                              type="number"
                              min={0}
                              max={enr.maxRefundable}
                              value={value}
                              onChange={(e) =>
                                setFrozenRefundOverrides((prev) => ({
                                  ...prev,
                                  [enr.enrollmentId]: Math.max(
                                    0,
                                    Math.min(
                                      enr.maxRefundable,
                                      Number(e.target.value) || 0,
                                    ),
                                  ),
                                }))
                              }
                              className="h-7 w-16 text-xs tabular-nums"
                            />
                            <span className="text-muted-foreground">dars</span>
                            <span className="w-24 text-right font-mono tabular-nums font-medium">
                              {formatPrice(value * enr.perLessonCost)} so&apos;m
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] leading-relaxed text-blue-800/80 dark:text-blue-300/70">
                      Hozirgi prepaid&apos;dan ko&apos;proq tanlasangiz, qo&apos;shimcha
                      o&apos;tib bo&apos;lgan darslar bekor qilinadi va ustozdan
                      mos oylik chiqariladi.
                    </p>
                  </div>
                )}

              {/* Sabab */}
              {selectedStatus && isReasonRequired && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">
                    Sabab <span className="text-destructive">*</span>
                  </span>
                  {useDropdown ? (
                    <>
                      <Select
                        value={reasonId ?? undefined}
                        onValueChange={(v) => setReasonId(v)}
                        disabled={reasonsLoading || !hasConfiguredReasons}
                      >
                        <SelectTrigger className="w-full">
                          {reasonsLoading ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              Sabablar yuklanmoqda...
                            </span>
                          ) : (
                            <SelectValue placeholder="Sababni tanlang" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {reasons?.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        placeholder="Qo'shimcha izoh (ixtiyoriy)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                      />
                    </>
                  ) : (
                    <Textarea
                      placeholder={isArchiving ? "Masalan: duplikat yozuv, xato kiritilgan..." : "Sabab yozing..."}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                    />
                  )}
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
              disabled={!canSubmit || submitting}
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
