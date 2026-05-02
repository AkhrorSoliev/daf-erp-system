"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/use-auth";
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
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
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const canCreate =
    user?.roles?.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const canDelete = user?.roles?.some((r) => [1, 2].includes(r.id)) ?? false;

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
    successMessage: string,
    rowKey?: string,
  ) => {
    if (rowKey) setBusyRowKey(rowKey);
    try {
      await api.delete(url);
      toast.success(successMessage);
      refetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
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
      title: "Bekor qilingan dars yozuvini o'chirmoqchimisiz?",
      description:
        "Diqqat: bu davomat va to'lovni tiklamaydi. Agar dars haqiqatda o'tilgan bo'lsa, admin keyin davomatni qo'lda olishi kerak.",
      onConfirm: () =>
        performDelete(
          `/lesson-cancellations/${id}`,
          "Bekor qilingan dars yozuvi o'chirildi",
          findDateKeyForCancellation(id),
        ),
    });
  };

  const handleDeleteOverride = (id: string) => {
    setConfirmDelete({
      title: "O'rinbosar ustoz qoidasini bekor qilmoqchimisiz?",
      description:
        "Oddiy guruh ustozlariga qaytariladi va ularning oyligi qayta hisoblanadi.",
      onConfirm: () =>
        performDelete(
          `/lesson-teacher-overrides/${id}`,
          "O'rinbosar bekor qilindi",
          findDateKeyForOverride(id),
        ),
    });
  };

  const handleDeleteReschedule = (id: string) => {
    setConfirmDelete({
      title: "Ko'chirish yozuvini o'chirmoqchimisiz?",
      description:
        "Diqqat: bu ikkala sanada (asl va yangi) davomatni avtomatik tiklamaydi. Agar dars haqiqatan asl kunda o'tilgan bo'lsa, admin keyin davomatni qo'lda olishi kerak.",
      onConfirm: () =>
        performDelete(
          `/lesson-reschedules/${id}`,
          "Ko'chirish yozuvi o'chirildi",
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
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void confirmDelete?.onConfirm();
              }}
            >
              O&apos;chirish
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
  const [date, setDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!date || !reason.trim()) {
      toast.error("Sana va sababni kiriting");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/lesson-cancellations", {
        groupId: group.id,
        date: format(date, "yyyy-MM-dd"),
        reason: reason.trim(),
      });
      toast.success("Dars bekor qilindi");
      onSaved();
      onOpenChange(false);
      setDate(undefined);
      setReason("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Bekor qilishda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Darsni bekor qilish</DialogTitle>
          <DialogDescription>
            Agar bu kuni davomat allaqachon olingan bo&apos;lsa, har bir
            o&apos;quvchining holati &quot;uzrli sabab bilan kelmadi&quot;
            ga o&apos;tadi va undan yechilgan pul qaytariladi (qoldiq
            darslar hisobi 1 ga oshadi).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bekor qilinadigan dars sanasi</Label>
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
              Faqat ushbu guruh dars qiladigan sanalar ko&apos;rinadi
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Sabab</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ustoz kasal, bayram, va h.k."
              maxLength={500}
              rows={3}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
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
    setSelected((group.teachers ?? []).map((t) => t.id));
  }

  const teachersById = new Map<number, { firstName: string; lastName: string }>();
  for (const t of group.teachers ?? []) teachersById.set(t.id, t);
  for (const t of allTeachers) teachersById.set(t.id, t);

  const teacherLabel = (id: number) => {
    const t = teachersById.get(id);
    return t ? `${t.firstName} ${t.lastName}` : `#${id}`;
  };

  const candidates = allTeachers.filter((t) => !selected.includes(t.id));

  const reset = () => {
    setDate(undefined);
    setSelected([]);
    setReason("");
    setPickerValue("");
  };

  const handleSubmit = async () => {
    if (!date) {
      toast.error("Sanani tanlang");
      return;
    }
    if (selected.length === 0) {
      toast.error("Kamida 1 ta ustoz bo'lishi kerak");
      return;
    }
    setSubmitting(true);
    try {
      await api.put(
        `/lesson-teacher-overrides/${group.id}/${format(date, "yyyy-MM-dd")}`,
        { teacherIds: selected, reason: reason.trim() || undefined },
      );
      toast.success("O'rinbosar saqlandi");
      onSaved();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
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
          <DialogTitle>Darsga o&apos;rinbosar ustoz tayinlash</DialogTitle>
          <DialogDescription>
            Tanlangan kungi dars uchun ustozlarni almashtiring. Agar bu kuni
            davomat allaqachon olingan bo&apos;lsa, oylik avtomatik qayta
            hisoblanadi (eski ustozlardan olib tashlanib, yangilarga yoziladi).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Dars sanasi</Label>
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
              Ushbu guruh dars qiladigan kunlar; ko&apos;chirilgan sanalar
              ham ro&apos;yxatda chiqadi
            </p>
          </div>

          <div className="space-y-2">
            <Label>Bu darsni o&apos;tadigan ustozlar</Label>
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
                    <SelectValue placeholder="Ustoz qo'shish" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.firstName} {t.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Default: guruhning {group.teachers?.length ?? 0} ta standart ustozi.
              Tanlovni o&apos;zgartirsangiz, faqat tanlanganlarga oylik yoziladi.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-reason">Sabab (ixtiyoriy)</Label>
            <Input
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Masalan 'Botir kasal'"
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
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
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
  rescheduleDestinations?: (Date | string)[];
  excludeDates?: (Date | string)[];
}

function CreateRescheduleDialog({
  open,
  onOpenChange,
  group,
  onSaved,
  existing,
  rescheduleDestinations,
  excludeDates,
}: RescheduleProps) {
  const isEdit = !!existing;
  const groupStartFallback = normalizeTime(group.lessonStartTime ?? "");
  const groupEndFallback = normalizeTime(group.lessonEndTime ?? "");
  const groupRoomFallback = group.room?.id ?? "";

  const [originalDate, setOriginalDate] = useState<Date | undefined>(() =>
    existing ? new Date(existing.originalDate) : undefined,
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
  const [reason, setReason] = useState(() => existing?.reason ?? "");
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
  const roomQueryError = availableRoomsQuery.error;
  useEffect(() => {
    if (!roomQueryError) return;
    const msg = getErrorMessage(roomQueryError, "Bo'sh xonalarni olishda xatolik");
    toast.error(msg);
    // eslint-disable-next-line no-console
    console.error("available-rooms error:", roomQueryError);
  }, [roomQueryError]);

  const handleSubmit = async () => {
    if (!originalDate || !newDate) {
      toast.error("Asl va yangi sanani tanlang");
      return;
    }
    if (newDate.getTime() <= originalDate.getTime()) {
      toast.error("Yangi sana asl sanadan keyin bo'lishi kerak");
      return;
    }
    if (!newStartTime || !newEndTime) {
      toast.error("Dars boshlanish vaqtini kiriting");
      return;
    }
    if (!newRoomId) {
      toast.error("Bo'sh xonani tanlang");
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
        toast.success("Ko'chirilgan dars yangilandi");
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
        toast.success("Dars boshqa kunga ko'chirildi");
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
        getErrorMessage(err, isEdit ? "Saqlashda xatolik" : "Ko'chirishda xatolik"),
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
              ? "Ko'chirilgan darsni tahrirlash"
              : "Darsni boshqa kunga ko'chirish"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Asl sana o'zgartirib bo'lmaydi (audit yozuvi). Yangi sana, vaqt, xona va sababni o'zgartirishingiz mumkin."
              : "Bu kungi dars yangi sanaga o'tkaziladi. Asl kunda davomat olingan bo'lsa, to'lov va oylik avtomatik qaytariladi."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Sanalar — 2 ustun */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Asl dars sanasi</Label>
              {isEdit && originalDate ? (
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
              <Label className="text-xs text-muted-foreground">Yangi dars sanasi</Label>
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
                  originalDate ? "Asl sanadan keyingi kun" : "Avval asl sanani tanlang"
                }
              />
            </div>
          </div>

          {/* Boshlanish vaqti — tugash avtomatik hisoblanadi */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Dars boshlanish vaqti
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
                  → tugaydi <span className="font-medium text-foreground">{newEndTime}</span>
                  <span className="ml-1 text-xs">
                    ({Math.floor(lessonMinutes / 60)} soat
                    {lessonMinutes % 60 ? ` ${lessonMinutes % 60} daqiqa` : ""})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Xona — faqat bo'sh xonalar ko'rsatiladi */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Xona</Label>
            <Select
              value={newRoomId}
              onValueChange={setNewRoomId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !canQueryRooms
                      ? "Avval sana va vaqtni tanlang"
                      : availableRoomsQuery.isLoading
                        ? "Bo'sh xonalar tekshirilmoqda..."
                        : availableRooms.length === 0
                          ? "Bu vaqtda bo'sh xona yo'q"
                          : "Xonani tanlang"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper">
                {!canQueryRooms ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Avval yangi dars sanasi va vaqtini tanlang
                  </div>
                ) : availableRoomsQuery.isLoading ? (
                  <div className="flex items-center justify-center px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Tekshirilmoqda...
                  </div>
                ) : availableRooms.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Bu vaqtda bo&apos;sh xona topilmadi
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
                  Tanlangan sana va vaqtda bu filialda bo&apos;sh xona yo&apos;q.
                  Vaqtni o&apos;zgartiring yoki boshqa kunni tanlang.
                </p>
              )}
          </div>

          {/* Sabab */}
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-reason" className="text-xs text-muted-foreground">
              Sabab (ixtiyoriy)
            </Label>
            <Input
              id="reschedule-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Masalan 'Ustoz dushanba kuni boshqa shaharda'"
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
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            {isEdit ? "Saqlash" : "Ko'chirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
