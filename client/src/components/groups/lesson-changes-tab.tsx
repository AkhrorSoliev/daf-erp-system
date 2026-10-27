"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useCan } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { LessonDateSelect } from "./lesson-date-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import type { GroupData } from "@/hooks/use-edit-group";
import { aggregateLessonModifications } from "./lesson-modifications/aggregate";
import {
  LessonModificationsTable,
  type LessonModificationCreateKind,
} from "./lesson-modifications/lesson-modifications-table";

interface LessonCancellation {
  id: string;
  date: string;
  reason: string;
  createdAt: string;
  cancelledBy: { id: number; firstName: string; lastName: string };
}

interface LessonOverride {
  id: string;
  date: string;
  teacherIds: number[];
  reason: string | null;
  createdAt: string;
  setBy: { id: number; firstName: string; lastName: string };
}

interface LessonReschedule {
  id: string;
  originalDate: string;
  newDate: string;
  newRoomId: string | null;
  newRoom: { id: string; name: string } | null;
  newLessonStartTime: string | null;
  newLessonEndTime: string | null;
  reason: string | null;
  createdAt: string;
  scheduledBy: { id: number; firstName: string; lastName: string };
}

interface Props {
  group: GroupData;
}

const TEACHER_ROLE_ID = 4;

export function LessonChangesTab({ group }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const canCreate = useCan("lessons.change");
  const canDelete = useCan("lessons.change-delete");

  const cancellationsQuery = useQuery({
    queryKey: ["lesson-cancellations", group.id],
    queryFn: () =>
      api
        .get<LessonCancellation[]>("/lesson-cancellations", {
          params: { groupId: group.id },
        })
        .then((r) => r.data),
  });

  const overridesQuery = useQuery({
    queryKey: ["lesson-teacher-overrides", group.id],
    queryFn: () =>
      api
        .get<LessonOverride[]>("/lesson-teacher-overrides", {
          params: { groupId: group.id },
        })
        .then((r) => r.data),
  });

  const reschedulesQuery = useQuery({
    queryKey: ["lesson-reschedules", group.id],
    queryFn: () =>
      api
        .get<LessonReschedule[]>("/lesson-reschedules", {
          params: { groupId: group.id },
        })
        .then((r) => r.data),
  });

  // Effective lesson-date data for the date pickers. Reschedules add new
  // valid lesson dates (`newDate`) outside `exactDays`; both reschedules
  // (`originalDate`) and active cancellations remove dates that aren't
  // real lesson days anymore. Computed once and threaded into every
  // child dialog so they all see the same definition of "lesson day".
  const rescheduleDestinations = useMemo(
    () => (reschedulesQuery.data ?? []).map((r) => r.newDate),
    [reschedulesQuery.data],
  );
  const lessonDateExcludes = useMemo(
    () => [
      ...(reschedulesQuery.data ?? []).map((r) => r.originalDate),
      ...(cancellationsQuery.data ?? []).map((c) => c.date),
    ],
    [reschedulesQuery.data, cancellationsQuery.data],
  );

  const [createCancellationOpen, setCreateCancellationOpen] = useState(false);
  const [createOverrideOpen, setCreateOverrideOpen] = useState(false);
  const [createRescheduleOpen, setCreateRescheduleOpen] = useState(false);
  const [editingReschedule, setEditingReschedule] = useState<LessonReschedule | null>(
    null,
  );
  // The cancelled lesson being moved to another day (ADR-0135).
  const [movingCancellation, setMovingCancellation] =
    useState<LessonCancellation | null>(null);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  // Shared confirm-delete dialog. We never use native `confirm()` —
  // it's unstyled, blocks the main thread, and can't render formatted
  // warnings the way our destructive flows need.
  const [confirmDelete, setConfirmDelete] = useState<{
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["lesson-cancellations", group.id] });
    queryClient.invalidateQueries({ queryKey: ["lesson-teacher-overrides", group.id] });
    queryClient.invalidateQueries({ queryKey: ["lesson-reschedules", group.id] });
    // The Davomat / Darslar tabs also depend on lesson dates — without these,
    // a reschedule that drops `originalDate` and adds `newDate` would only
    // show on the current tab and leave the cycle dashboard / dots view stale.
    queryClient.invalidateQueries({ queryKey: ["attendance-dates", group.id] });
    queryClient.invalidateQueries({ queryKey: ["attendance-lesson-sequence", group.id] });
    // Calendar view (Davomat tab) reads per-month — prefix match invalidates
    // every cached month so any scrolled-to view also refreshes.
    queryClient.invalidateQueries({ queryKey: ["attendance-calendar", group.id] });
  };

  const performDelete = async (
    url: string,
    successMessage: string | ((data: unknown) => string),
    rowKey?: string,
  ) => {
    if (rowKey) setBusyRowKey(rowKey);
    try {
      const { data } = await api.delete(url);
      toast.success(
        typeof successMessage === "string" ? successMessage : successMessage(data),
      );
      refetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, t("O'chirishda xatolik")));
    } finally {
      setBusyRowKey(null);
    }
  };

  const findDateKeyForReschedule = (id: string): string | undefined => {
    const r = (reschedulesQuery.data ?? []).find((x) => x.id === id);
    return r ? r.newDate.slice(0, 10) : undefined;
  };
  const findDateKeyForOverride = (id: string): string | undefined => {
    const o = (overridesQuery.data ?? []).find((x) => x.id === id);
    return o ? o.date.slice(0, 10) : undefined;
  };
  const findDateKeyForCancellation = (id: string): string | undefined => {
    const c = (cancellationsQuery.data ?? []).find((x) => x.id === id);
    return c ? c.date.slice(0, 10) : undefined;
  };

  const handleDeleteCancellation = (id: string) => {
    setConfirmDelete({
      title: t("Bekor qilingan dars yozuvini o'chirmoqchimisiz?"),
      description: t(
        "Bekor qilishda o'quvchilarga qaytarilgan dars puli ulardan qayta yechiladi; shundan beri muzlatilgan yoki guruhdan chiqqan o'quvchining puli qoladi. Davomat tiklanmaydi. Agar dars vaqti o'tib ketgan bo'lsa, u yana «Dars bo'ldimi?» savoliga qaytadi.",
      ),
      onConfirm: () =>
        performDelete(
          `/lesson-cancellations/${id}`,
          (data) => {
            const r = data as {
              restoredStudents?: number;
              restoredAmount?: number;
              keptStudents?: number;
            };
            if (!r?.restoredAmount) return t("Bekor qilingan dars yozuvi o'chirildi");
            const params = {
              n: r.restoredStudents ?? 0,
              amount: formatPrice(r.restoredAmount),
              kept: r.keptStudents ?? 0,
            };
            return r.keptStudents
              ? t(
                  "Bekor qilish o'chirildi: {n} o'quvchidan {amount} so'm qayta yechildi, {kept} o'quvchida qoldi",
                  params,
                )
              : t(
                  "Bekor qilish o'chirildi: {n} o'quvchidan {amount} so'm qayta yechildi",
                  params,
                );
          },
          findDateKeyForCancellation(id),
        ),
    });
  };

  const handleDeleteOverride = (id: string) => {
    setConfirmDelete({
      title: t("O'rinbosar ustoz qoidasini bekor qilmoqchimisiz?"),
      description: t(
        "Oddiy guruh ustozlariga qaytariladi va ularning oyligi qayta hisoblanadi.",
      ),
      onConfirm: () =>
        performDelete(
          `/lesson-teacher-overrides/${id}`,
          t("O'rinbosar bekor qilindi"),
          findDateKeyForOverride(id),
        ),
    });
  };

  const handleDeleteReschedule = (id: string) => {
    setConfirmDelete({
      title: t("Ko'chirish yozuvini o'chirmoqchimisiz?"),
      description: t(
        "Diqqat: bu ikkala sanada (asl va yangi) davomatni avtomatik tiklamaydi. Agar asl dars vaqti o'tib ketgan bo'lsa, u yana «Dars bo'ldimi?» savoliga qaytadi.",
      ),
      onConfirm: () =>
        performDelete(
          `/lesson-reschedules/${id}`,
          t("Ko'chirish yozuvi o'chirildi"),
          findDateKeyForReschedule(id),
        ),
    });
  };

  const aggregatedRows = useMemo(
    () =>
      aggregateLessonModifications({
        cancellations: cancellationsQuery.data,
        overrides: overridesQuery.data,
        reschedules: reschedulesQuery.data,
      }),
    [cancellationsQuery.data, overridesQuery.data, reschedulesQuery.data],
  );

  const handleCreate = (kind: LessonModificationCreateKind) => {
    if (kind === "cancellation") setCreateCancellationOpen(true);
    if (kind === "override") setCreateOverrideOpen(true);
    if (kind === "reschedule") setCreateRescheduleOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <LessonModificationsTable
            rows={aggregatedRows}
            isLoading={
              cancellationsQuery.isLoading ||
              overridesQuery.isLoading ||
              reschedulesQuery.isLoading
            }
            canCreate={canCreate}
            canDelete={canDelete}
            onCreate={handleCreate}
            onEditReschedule={(r) =>
              setEditingReschedule(r as unknown as LessonReschedule)
            }
            onRescheduleCancellation={(c) =>
              setMovingCancellation(c as unknown as LessonCancellation)
            }
            onDeleteReschedule={handleDeleteReschedule}
            onDeleteOverride={handleDeleteOverride}
            onDeleteCancellation={handleDeleteCancellation}
            busyRowKey={busyRowKey}
          />
        </CardContent>
      </Card>

      {/* Eski 3 ta Card olib tashlandi — yagona "Dars o'zgarishlari" feed'iga
          birlashtirildi. Eski breakdown (turi bo'yicha alohida) audit yozuvlarini
          /tarix tabidan ko'rish mumkin. */}

      {/* Dialogs */}
      {canCreate && (
        <>
          <CreateCancellationDialog
            open={createCancellationOpen}
            onOpenChange={setCreateCancellationOpen}
            group={group}
            onSaved={refetchAll}
            rescheduleDestinations={rescheduleDestinations}
            excludeDates={lessonDateExcludes}
          />
          <CreateOverrideDialog
            open={createOverrideOpen}
            onOpenChange={setCreateOverrideOpen}
            group={group}
            onSaved={refetchAll}
            rescheduleDestinations={rescheduleDestinations}
            excludeDates={lessonDateExcludes}
          />
          <CreateRescheduleDialog
            open={createRescheduleOpen}
            onOpenChange={setCreateRescheduleOpen}
            group={group}
            onSaved={refetchAll}
            rescheduleDestinations={rescheduleDestinations}
            excludeDates={lessonDateExcludes}
          />
          {movingCancellation && (
            <CreateRescheduleDialog
              key={`cancelled-${movingCancellation.id}`}
              open={!!movingCancellation}
              onOpenChange={(v) => {
                if (!v) setMovingCancellation(null);
              }}
              group={group}
              onSaved={refetchAll}
              fromCancellation={movingCancellation}
              rescheduleDestinations={rescheduleDestinations}
              excludeDates={lessonDateExcludes}
            />
          )}
          {editingReschedule && (
            <CreateRescheduleDialog
              key={editingReschedule.id}
              open={!!editingReschedule}
              onOpenChange={(v) => {
                if (!v) setEditingReschedule(null);
              }}
              group={group}
              onSaved={refetchAll}
              existing={editingReschedule}
              rescheduleDestinations={rescheduleDestinations}
              excludeDates={lessonDateExcludes}
            />
          )}
        </>
      )}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDelete?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void confirmDelete?.onConfirm();
              }}
            >
              {t("O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Time helpers ──────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Some legacy/seed groups store lesson times as "9:00" (no leading zero).
// The backend validator and its lexicographic time compares both expect
// strict HH:MM, so pad before sending.
function normalizeTime(time: string): string {
  if (!time) return "";
  const parts = time.split(":");
  if (parts.length < 2) return time;
  const [h, m] = parts;
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function diffMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// ─── Cancellation dialog (existing, ko'chirilgan) ──────────────────

interface CancellationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupData;
  onSaved: () => void;
  rescheduleDestinations?: (Date | string)[];
  excludeDates?: (Date | string)[];
}

function CreateCancellationDialog({
  open,
  onOpenChange,
  group,
  onSaved,
  rescheduleDestinations,
  excludeDates,
}: CancellationProps) {
  const t = useT();
  const [date, setDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!date || !reason.trim()) {
      toast.error(t("Sana va sababni kiriting"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/lesson-cancellations", {
        groupId: group.id,
        date: format(date, "yyyy-MM-dd"),
        reason: reason.trim(),
      });
      toast.success(t("Dars bekor qilindi"));
      onSaved();
      onOpenChange(false);
      setDate(undefined);
      setReason("");
    } catch (err) {
      toast.error(getErrorMessage(err, t("Bekor qilishda xatolik")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Darsni bekor qilish")}</DialogTitle>
          <DialogDescription>
            {t(
              'Agar bu kuni davomat allaqachon olingan bo\'lsa, har bir o\'quvchining holati "uzrli sabab bilan kelmadi" ga o\'tadi va undan yechilgan pul qaytariladi (qoldiq darslar hisobi 1 ga oshadi).',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Bekor qilinadigan dars sanasi")}</Label>
            <LessonDateSelect
              exactDays={group.exactDays ?? []}
              groupStartDate={group.startDate}
              groupEndDate={group.endDate}
              value={date}
              onChange={setDate}
              disabled={submitting}
              rescheduleDestinations={rescheduleDestinations}
              excludeDates={excludeDates}
            />
            <p className="text-xs text-muted-foreground">
              {t("Faqat ushbu guruh dars qiladigan sanalar ko'rinadi")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t("Sabab")}</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Ustoz kasal, bayram, va h.k.")}
              maxLength={500}
              rows={3}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("Bekor qilish")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            {t("Saqlash")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Override dialog (yangi) ───────────────────────────────────────

interface OverrideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupData;
  onSaved: () => void;
  rescheduleDestinations?: (Date | string)[];
  excludeDates?: (Date | string)[];
}

function CreateOverrideDialog({
  open,
  onOpenChange,
  group,
  onSaved,
  rescheduleDestinations,
  excludeDates,
}: OverrideProps) {
  const t = useT();
  const [date, setDate] = useState<Date | undefined>();
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [pickerValue, setPickerValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const teachersQuery = useQuery({
    queryKey: ["all-teachers"],
    queryFn: () =>
      api
        .get<{
          data: { id: number; firstName: string; lastName: string; roles: { id: number }[] }[];
        }>("/users?pageSize=100&user_type=Teacher")
        .then((r) => r.data.data),
    enabled: open,
  });

  const allTeachers = (teachersQuery.data ?? []).filter((u) =>
    u.roles.some((r) => r.id === TEACHER_ROLE_ID),
  );

  // Initialize with group.teachers when dialog opens
  if (open && selected.length === 0 && (group.teachers ?? []).length > 0) {
    setSelected((group.teachers ?? []).map((tc) => tc.id));
  }

  const teachersById = new Map<number, { firstName: string; lastName: string }>();
  for (const tc of group.teachers ?? []) teachersById.set(tc.id, tc);
  for (const tc of allTeachers) teachersById.set(tc.id, tc);

  const teacherLabel = (id: number) => {
    const tc = teachersById.get(id);
    return tc ? `${tc.firstName} ${tc.lastName}` : `#${id}`;
  };

  const candidates = allTeachers.filter((tc) => !selected.includes(tc.id));

  const reset = () => {
    setDate(undefined);
    setSelected([]);
    setReason("");
    setPickerValue("");
  };

  const handleSubmit = async () => {
    if (!date) {
      toast.error(t("Sanani tanlang"));
      return;
    }
    if (selected.length === 0) {
      toast.error(t("Kamida 1 ta ustoz bo'lishi kerak"));
      return;
    }
    setSubmitting(true);
    try {
      await api.put(
        `/lesson-teacher-overrides/${group.id}/${format(date, "yyyy-MM-dd")}`,
        { teacherIds: selected, reason: reason.trim() || undefined },
      );
      toast.success(t("O'rinbosar saqlandi"));
      onSaved();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err, t("Saqlashda xatolik")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) {
          onOpenChange(v);
          if (!v) reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Darsga o'rinbosar ustoz tayinlash")}</DialogTitle>
          <DialogDescription>
            {t(
              "Tanlangan kungi dars uchun ustozlarni almashtiring. Agar bu kuni davomat allaqachon olingan bo'lsa, oylik avtomatik qayta hisoblanadi (eski ustozlardan olib tashlanib, yangilarga yoziladi).",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Dars sanasi")}</Label>
            <LessonDateSelect
              exactDays={group.exactDays ?? []}
              groupStartDate={group.startDate}
              groupEndDate={group.endDate}
              value={date}
              onChange={setDate}
              disabled={submitting}
              rescheduleDestinations={rescheduleDestinations}
              excludeDates={excludeDates}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Ushbu guruh dars qiladigan kunlar; ko'chirilgan sanalar ham ro'yxatda chiqadi",
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("Bu darsni o'tadigan ustozlar")}</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border p-2">
              {selected.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1.5 pr-1">
                  {teacherLabel(id)}
                  <button
                    type="button"
                    onClick={() => setSelected(selected.filter((s) => s !== id))}
                    className="hover:bg-destructive/20 rounded p-0.5"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))}
              {candidates.length > 0 && (
                <Select
                  value={pickerValue}
                  onValueChange={(v) => {
                    setSelected([...selected, parseInt(v, 10)]);
                    setPickerValue("");
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-auto gap-1 border-dashed">
                    <Plus className="size-3" />
                    <SelectValue placeholder={t("Ustoz qo'shish")} />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((tc) => (
                      <SelectItem key={tc.id} value={String(tc.id)}>
                        {tc.firstName} {tc.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Odatda: guruhning {n} ta standart ustozi. Tanlovni o'zgartirsangiz, faqat tanlanganlarga oylik yoziladi.",
                { n: group.teachers?.length ?? 0 },
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-reason">{t("Sabab (ixtiyoriy)")}</Label>
            <Input
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Masalan 'Botir kasal'")}
              maxLength={500}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("Bekor qilish")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            {t("Saqlash")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Reschedule dialog ──────────────────────────────────────────────

interface RescheduleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupData;
  onSaved: () => void;
  /** When present, the dialog runs in edit mode for this reschedule. */
  existing?: LessonReschedule | null;
  /**
   * When present, the dialog moves this CANCELLED lesson: the original day is
   * fixed, and saving takes the cancellation back and moves the lesson in one
   * server call (`POST /lesson-cancellations/:id/reschedule`, ADR-0135).
   */
  fromCancellation?: LessonCancellation | null;
  rescheduleDestinations?: (Date | string)[];
  excludeDates?: (Date | string)[];
}

function CreateRescheduleDialog({
  open,
  onOpenChange,
  group,
  onSaved,
  existing,
  fromCancellation,
  rescheduleDestinations,
  excludeDates,
}: RescheduleProps) {
  const t = useT();
  const isEdit = !!existing;
  // The original day cannot be picked in edit mode nor when moving a
  // cancelled lesson: both already name it.
  const originalFixed = isEdit || !!fromCancellation;
  const groupStartFallback = normalizeTime(group.lessonStartTime ?? "");
  const groupEndFallback = normalizeTime(group.lessonEndTime ?? "");
  const groupRoomFallback = group.room?.id ?? "";

  const [originalDate, setOriginalDate] = useState<Date | undefined>(() =>
    existing
      ? new Date(existing.originalDate)
      : fromCancellation
        ? new Date(fromCancellation.date)
        : undefined,
  );
  const [newDate, setNewDate] = useState<Date | undefined>(() =>
    existing ? new Date(existing.newDate) : undefined,
  );
  // Pre-fill room/time with the existing reschedule (edit) or the group's
  // defaults (create) so admins don't have to re-enter "the same as usual".
  const [newRoomId, setNewRoomId] = useState<string>(() =>
    existing
      ? (existing.newRoomId ?? groupRoomFallback)
      : groupRoomFallback,
  );
  const [newStartTime, setNewStartTime] = useState<string>(() =>
    existing
      ? normalizeTime(existing.newLessonStartTime ?? groupStartFallback)
      : groupStartFallback,
  );
  // Moving a cancelled lesson starts from the cancellation's own reason, so
  // the admin does not type it twice; it can still be changed or cleared.
  const [reason, setReason] = useState(
    () => existing?.reason ?? fromCancellation?.reason ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  // Lesson duration in minutes: prefer explicit `lessonMinutes`, otherwise
  // diff the group's default start/end. Falls back to 60 for legacy groups.
  // `??` would let a stored `0` or a negative diff slip through and produce
  // `end <= start`, which the backend then rejects as 400.
  const lessonMinutes = (() => {
    const direct = group.lessonMinutes;
    if (typeof direct === "number" && direct > 0) return direct;
    const diff = diffMinutes(group.lessonStartTime, group.lessonEndTime);
    if (typeof diff === "number" && diff > 0) return diff;
    return 60;
  })();
  // Clamp the end to 23:59 instead of wrapping past midnight — backend
  // compares times lexicographically, so "00:30" would test as less than
  // "23:00" and produce a false "end before start" rejection.
  const computedEnd = newStartTime ? addMinutes(newStartTime, lessonMinutes) : "";
  const newEndTime =
    computedEnd && computedEnd <= newStartTime ? "23:59" : computedEnd;

  // Available rooms — only those with no conflicting lesson on the chosen
  // date+time. Backend walks regular schedules + other reschedules so the
  // dropdown only shows bookable rooms instead of letting admins pick a
  // busy one and fail at submit.
  const newDateStr = newDate ? format(newDate, "yyyy-MM-dd") : "";
  // Guard the query so we never fire an obviously-bad payload (would
  // round-trip 4× because react-query retries on failure).
  const canQueryRooms = Boolean(
    open && newDateStr && newStartTime && newEndTime && newEndTime > newStartTime,
  );
  const availableRoomsQuery = useQuery({
    queryKey: [
      "reschedule-available-rooms",
      group.id,
      newDateStr,
      newStartTime,
      newEndTime,
    ],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>(
          `/lesson-reschedules/available-rooms`,
          {
            params: {
              groupId: group.id,
              date: newDateStr,
              startTime: newStartTime,
              endTime: newEndTime,
            },
          },
        )
        .then((r) => r.data),
    enabled: canQueryRooms,
    // 400 is a deterministic validation failure — retrying just spams the log.
    retry: false,
  });

  // If the currently-selected room becomes unavailable (e.g. the admin
  // changed the date and the group's default room is now busy), clear it
  // so they're forced to pick from the bookable set.
  const availableRooms = availableRoomsQuery.data ?? [];
  useEffect(() => {
    if (!canQueryRooms || availableRoomsQuery.isLoading) return;
    if (newRoomId && !availableRooms.some((r) => r.id === newRoomId)) {
      setNewRoomId("");
    }
  }, [
    canQueryRooms,
    availableRoomsQuery.isLoading,
    availableRooms,
    newRoomId,
  ]);

  // Surface the backend error so silent 400s become visible — easier to
  // diagnose validation/format issues on the room availability query.
  // The text is read through a ref so a language switch never re-fires the toast.
  const roomErrorText = t("Bo'sh xonalarni olishda xatolik");
  const roomErrorTextRef = useRef(roomErrorText);
  useEffect(() => {
    roomErrorTextRef.current = roomErrorText;
  }, [roomErrorText]);
  const roomQueryError = availableRoomsQuery.error;
  useEffect(() => {
    if (!roomQueryError) return;
    const msg = getErrorMessage(roomQueryError, roomErrorTextRef.current);
    toast.error(msg);
    // eslint-disable-next-line no-console
    console.error("available-rooms error:", roomQueryError);
  }, [roomQueryError]);

  const handleSubmit = async () => {
    if (!originalDate || !newDate) {
      toast.error(t("Asl va yangi sanani tanlang"));
      return;
    }
    if (newDate.getTime() <= originalDate.getTime()) {
      toast.error(t("Yangi sana asl sanadan keyin bo'lishi kerak"));
      return;
    }
    if (!newStartTime || !newEndTime) {
      toast.error(t("Dars boshlanish vaqtini kiriting"));
      return;
    }
    if (!newRoomId) {
      toast.error(t("Bo'sh xonani tanlang"));
      return;
    }
    setSubmitting(true);
    // Only persist room/time as overrides when they actually differ from
    // the group's defaults — avoids cluttering the row with redundant data.
    const roomOverride =
      newRoomId && newRoomId !== groupRoomFallback ? newRoomId : null;
    const timeChanged =
      newStartTime !== groupStartFallback || newEndTime !== groupEndFallback;
    try {
      if (isEdit && existing) {
        await api.patch(`/lesson-reschedules/${existing.id}`, {
          newDate: format(newDate, "yyyy-MM-dd"),
          newRoomId: roomOverride,
          newLessonStartTime: timeChanged ? newStartTime : null,
          newLessonEndTime: timeChanged ? newEndTime : null,
          reason: reason.trim() || null,
        });
        toast.success(t("Ko'chirilgan dars yangilandi"));
      } else if (fromCancellation) {
        const { data } = await api.post<{
          restoredStudents?: number;
          restoredAmount?: number;
        }>(`/lesson-cancellations/${fromCancellation.id}/reschedule`, {
          newDate: format(newDate, "yyyy-MM-dd"),
          newRoomId: roomOverride ?? undefined,
          newLessonStartTime: timeChanged ? newStartTime : undefined,
          newLessonEndTime: timeChanged ? newEndTime : undefined,
          reason: reason.trim() || undefined,
        });
        toast.success(
          data?.restoredAmount
            ? t("Dars ko'chirildi: {n} o'quvchidan {amount} so'm qayta yechildi", {
                n: data.restoredStudents ?? 0,
                amount: formatPrice(data.restoredAmount),
              })
            : t("Dars boshqa kunga ko'chirildi"),
        );
      } else {
        await api.post("/lesson-reschedules", {
          groupId: group.id,
          originalDate: format(originalDate, "yyyy-MM-dd"),
          newDate: format(newDate, "yyyy-MM-dd"),
          newRoomId: roomOverride ?? undefined,
          newLessonStartTime: timeChanged ? newStartTime : undefined,
          newLessonEndTime: timeChanged ? newEndTime : undefined,
          reason: reason.trim() || undefined,
        });
        toast.success(t("Dars boshqa kunga ko'chirildi"));
      }
      onSaved();
      onOpenChange(false);
      // Edit mode keeps the loaded values; create mode resets to blanks
      // so the next "yangi ko'chirish" starts clean.
      if (!isEdit) {
        setOriginalDate(undefined);
        setNewDate(undefined);
        setNewRoomId(groupRoomFallback);
        setNewStartTime(groupStartFallback);
        setReason("");
      }
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          isEdit ? t("Saqlashda xatolik") : t("Ko'chirishda xatolik"),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("Ko'chirilgan darsni tahrirlash")
              : t("Darsni boshqa kunga ko'chirish")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t(
                  "Asl sana o'zgartirib bo'lmaydi (audit yozuvi). Yangi sana, vaqt, xona va sababni o'zgartirishingiz mumkin.",
                )
              : fromCancellation
                ? t(
                    "Bekor qilish qaytarib olinadi: bekor qilishda o'quvchilarga qaytgan dars puli ulardan qayta yechiladi, dars esa yangi kunda o'tadi. Muzlatilgan yoki guruhdan chiqqan o'quvchining puli qoladi.",
                  )
                : t(
                    "Bu kungi dars yangi sanaga o'tkaziladi. Asl kunda davomat olingan bo'lsa, to'lov va oylik avtomatik qaytariladi.",
                  )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Sanalar — 2 ustun */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("Asl dars sanasi")}
              </Label>
              {originalFixed && originalDate ? (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground tabular-nums">
                  {format(originalDate, "dd.MM.yyyy")}
                </div>
              ) : (
                <LessonDateSelect
                  exactDays={group.exactDays ?? []}
                  groupStartDate={group.startDate}
                  groupEndDate={group.endDate}
                  rescheduleDestinations={rescheduleDestinations}
                  excludeDates={excludeDates}
                  value={originalDate}
                  onChange={setOriginalDate}
                  disabled={submitting}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("Yangi dars sanasi")}
              </Label>
              <DatePicker
                value={newDate}
                onChange={setNewDate}
                disabled={submitting || !originalDate}
                minDate={
                  originalDate
                    ? new Date(originalDate.getTime() + 24 * 60 * 60 * 1000)
                    : undefined
                }
                defaultMonth={originalDate ?? undefined}
                placeholder={
                  originalDate
                    ? t("Asl sanadan keyingi kun")
                    : t("Avval asl sanani tanlang")
                }
              />
            </div>
          </div>

          {/* Boshlanish vaqti — tugash avtomatik hisoblanadi */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("Dars boshlanish vaqti")}
            </Label>
            <div className="flex items-center gap-3">
              <div className="w-40">
                <TimePicker
                  value={newStartTime}
                  onChange={setNewStartTime}
                  disabled={submitting}
                />
              </div>
              {newEndTime && (
                <div className="text-sm text-muted-foreground">
                  {t("→ tugaydi")}{" "}
                  <span className="font-medium text-foreground">{newEndTime}</span>
                  <span className="ml-1 text-xs">
                    {lessonMinutes % 60
                      ? t("({h} soat {m} daqiqa)", {
                          h: Math.floor(lessonMinutes / 60),
                          m: lessonMinutes % 60,
                        })
                      : t("({n} soat)", { n: Math.floor(lessonMinutes / 60) })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Xona — faqat bo'sh xonalar ko'rsatiladi */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("Xona")}</Label>
            <Select
              value={newRoomId}
              onValueChange={setNewRoomId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !canQueryRooms
                      ? t("Avval sana va vaqtni tanlang")
                      : availableRoomsQuery.isLoading
                        ? t("Bo'sh xonalar tekshirilmoqda...")
                        : availableRooms.length === 0
                          ? t("Bu vaqtda bo'sh xona yo'q")
                          : t("Xonani tanlang")
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper">
                {!canQueryRooms ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("Avval yangi dars sanasi va vaqtini tanlang")}
                  </div>
                ) : availableRoomsQuery.isLoading ? (
                  <div className="flex items-center justify-center px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin mr-2" />
                    {t("Tekshirilmoqda...")}
                  </div>
                ) : availableRooms.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("Bu vaqtda bo'sh xona topilmadi")}
                  </div>
                ) : (
                  availableRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {canQueryRooms &&
              !availableRoomsQuery.isLoading &&
              availableRooms.length === 0 && (
                <p className="text-xs text-amber-600">
                  {t(
                    "Tanlangan sana va vaqtda bu filialda bo'sh xona yo'q. Vaqtni o'zgartiring yoki boshqa kunni tanlang.",
                  )}
                </p>
              )}
          </div>

          {/* Sabab */}
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-reason" className="text-xs text-muted-foreground">
              {t("Sabab (ixtiyoriy)")}
            </Label>
            <Input
              id="reschedule-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Masalan 'Ustoz dushanba kuni boshqa shaharda'")}
              maxLength={500}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("Bekor qilish")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            {isEdit ? t("Saqlash") : t("Ko'chirish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
