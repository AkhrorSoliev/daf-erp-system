"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRight, CalendarClock, Loader2, Plus, Trash2, UserCog, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { GroupData } from "@/hooks/use-edit-group";

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

  const [createCancellationOpen, setCreateCancellationOpen] = useState(false);
  const [createOverrideOpen, setCreateOverrideOpen] = useState(false);
  const [createRescheduleOpen, setCreateRescheduleOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["lesson-cancellations", group.id] });
    queryClient.invalidateQueries({ queryKey: ["lesson-teacher-overrides", group.id] });
    queryClient.invalidateQueries({ queryKey: ["lesson-reschedules", group.id] });
  };

  const handleDeleteCancellation = async (id: string) => {
    if (
      !confirm(
        "Bekor qilingan dars yozuvini o'chirmoqchimisiz?\n\n" +
          "Diqqat: bu davomat va to'lovni tiklamaydi. Agar dars haqiqatda " +
          "o'tilgan bo'lsa, admin keyin davomatni qo'lda olishi kerak.",
      )
    )
      return;
    setDeletingId(id);
    try {
      await api.delete(`/lesson-cancellations/${id}`);
      toast.success("Bekor qilingan dars yozuvi o'chirildi");
      refetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteOverride = async (id: string) => {
    if (
      !confirm(
        "O'rinbosar ustoz qoidasini bekor qilmoqchimisiz?\n\nOddiy guruh ustozlariga qaytariladi va ularning oyligi qayta hisoblanadi.",
      )
    )
      return;
    setDeletingId(id);
    try {
      await api.delete(`/lesson-teacher-overrides/${id}`);
      toast.success("O'rinbosar bekor qilindi");
      refetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteReschedule = async (id: string) => {
    if (
      !confirm(
        "Ko'chirish yozuvini o'chirmoqchimisiz?\n\nDiqqat: bu ikkala sanada (asl va yangi) davomatni avtomatik tiklamaydi. Agar dars haqiqatan asl kunda o'tilgan bo'lsa, admin keyin davomatni qo'lda olishi kerak.",
      )
    )
      return;
    setDeletingId(id);
    try {
      await api.delete(`/lesson-reschedules/${id}`);
      toast.success("Ko'chirish yozuvi o'chirildi");
      refetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeletingId(null);
    }
  };

  const teachersById = new Map<number, { firstName: string; lastName: string }>();
  for (const t of group.teachers ?? []) teachersById.set(t.id, t);

  return (
    <div className="space-y-4">
      {/* Bekor qilingan darslar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-red-500" />
            Bekor qilingan darslar
          </CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateCancellationOpen(true)}>
              <Plus className="size-4 mr-1" />
              Bu darsni bekor qilish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {cancellationsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !cancellationsQuery.data?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Hech qanday dars bekor qilinmagan
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Sabab</TableHead>
                  <TableHead>Bekor qilgan</TableHead>
                  <TableHead>Vaqti</TableHead>
                  {canDelete && <TableHead className="w-16">Amal</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancellationsQuery.data.map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {format(new Date(c.date), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>{c.reason}</TableCell>
                    <TableCell>
                      {c.cancelledBy.firstName} {c.cancelledBy.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(c.createdAt), "dd.MM.yyyy, HH:mm")}
                    </TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCancellation(c.id)}
                          disabled={deletingId === c.id}
                        >
                          {deletingId === c.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-red-500" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* O'rinbosar ustozlar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserCog className="size-5 text-blue-500" />
            O&apos;rinbosar ustozlar
          </CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOverrideOpen(true)}>
              <Plus className="size-4 mr-1" />
              Darsga o&apos;rinbosar qo&apos;shish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {overridesQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !overridesQuery.data?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Hech qanday o&apos;rinbosar belgilanmagan
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Ustozlar</TableHead>
                  <TableHead>Sabab</TableHead>
                  <TableHead>Belgilagan</TableHead>
                  {canDelete && <TableHead className="w-16">Amal</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {overridesQuery.data.map((o, i) => (
                  <TableRow key={o.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {format(new Date(o.date), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {o.teacherIds.map((tid) => (
                          <Badge key={tid} variant="secondary" className="text-xs">
                            <TeacherLabel teacherId={tid} fromGroup={teachersById} />
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.reason ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.setBy.firstName} {o.setBy.lastName}
                    </TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteOverride(o.id)}
                          disabled={deletingId === o.id}
                        >
                          {deletingId === o.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-red-500" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ko'chirilgan darslar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-amber-500" />
            Ko&apos;chirilgan darslar
          </CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateRescheduleOpen(true)}>
              <Plus className="size-4 mr-1" />
              Darsni boshqa kunga ko&apos;chirish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {reschedulesQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !reschedulesQuery.data?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Hech qanday dars boshqa kunga ko&apos;chirilmagan
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Asl sana</TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Yangi sana</TableHead>
                  <TableHead>Sabab</TableHead>
                  <TableHead>Belgilagan</TableHead>
                  {canDelete && <TableHead className="w-16">Amal</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reschedulesQuery.data.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {format(new Date(r.originalDate), "dd.MM.yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <ArrowRight className="size-4" />
                    </TableCell>
                    <TableCell className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
                      <div>{format(new Date(r.newDate), "dd.MM.yyyy")}</div>
                      {(r.newRoom || r.newLessonStartTime) && (
                        <div className="text-xs text-muted-foreground font-normal mt-0.5">
                          {r.newRoom?.name && (
                            <span>{r.newRoom.name}</span>
                          )}
                          {r.newRoom && r.newLessonStartTime && <span> · </span>}
                          {r.newLessonStartTime && r.newLessonEndTime && (
                            <span>
                              {r.newLessonStartTime}–{r.newLessonEndTime}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.reason ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.scheduledBy.firstName} {r.scheduledBy.lastName}
                    </TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteReschedule(r.id)}
                          disabled={deletingId === r.id}
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-red-500" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {canCreate && (
        <>
          <CreateCancellationDialog
            open={createCancellationOpen}
            onOpenChange={setCreateCancellationOpen}
            group={group}
            onSaved={refetchAll}
          />
          <CreateOverrideDialog
            open={createOverrideOpen}
            onOpenChange={setCreateOverrideOpen}
            group={group}
            onSaved={refetchAll}
          />
          <CreateRescheduleDialog
            open={createRescheduleOpen}
            onOpenChange={setCreateRescheduleOpen}
            group={group}
            onSaved={refetchAll}
          />
        </>
      )}
    </div>
  );
}

function TeacherLabel({
  teacherId,
  fromGroup,
}: {
  teacherId: number;
  fromGroup: Map<number, { firstName: string; lastName: string }>;
}) {
  const local = fromGroup.get(teacherId);
  if (local) return <>{local.firstName} {local.lastName}</>;
  return <FetchedTeacherLabel teacherId={teacherId} />;
}

function FetchedTeacherLabel({ teacherId }: { teacherId: number }) {
  const { data } = useQuery({
    queryKey: ["user-mini", teacherId],
    queryFn: () =>
      api
        .get<{ firstName: string; lastName: string }>(`/users/${teacherId}`)
        .then((r) => r.data)
        .catch(() => null),
  });
  if (!data) return <>#{teacherId}</>;
  return <>{data.firstName} {data.lastName}</>;
}

// ─── Cancellation dialog (existing, ko'chirilgan) ──────────────────

interface CancellationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupData;
  onSaved: () => void;
}

function CreateCancellationDialog({
  open,
  onOpenChange,
  group,
  onSaved,
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
}

function CreateOverrideDialog({
  open,
  onOpenChange,
  group,
  onSaved,
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
            />
            <p className="text-xs text-muted-foreground">
              Faqat ushbu guruh dars qiladigan sanalar ko&apos;rinadi
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
}

function CreateRescheduleDialog({
  open,
  onOpenChange,
  group,
  onSaved,
}: RescheduleProps) {
  const [originalDate, setOriginalDate] = useState<Date | undefined>();
  const [newDate, setNewDate] = useState<Date | undefined>();
  // Pre-fill room/time with the group's defaults so admins don't have to
  // re-enter "the same as usual" — they only adjust if it differs.
  const [newRoomId, setNewRoomId] = useState<string>(group.room?.id ?? "");
  const [newStartTime, setNewStartTime] = useState<string>(
    group.lessonStartTime ?? "",
  );
  const [newEndTime, setNewEndTime] = useState<string>(
    group.lessonEndTime ?? "",
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Rooms in the group's branch — for the optional room override.
  const roomsQuery = useQuery({
    queryKey: ["branch-rooms", group.branchId],
    queryFn: () =>
      api
        .get<{ data: { id: string; name: string }[] } | { id: string; name: string }[]>(
          `/rooms?branch_id=${group.branchId}`,
        )
        .then((r) => {
          const d = r.data as unknown;
          if (Array.isArray(d)) return d as { id: string; name: string }[];
          if (d && typeof d === "object" && "data" in d) {
            return (d as { data: { id: string; name: string }[] }).data;
          }
          return [];
        }),
    enabled: open,
  });

  const handleSubmit = async () => {
    if (!originalDate || !newDate) {
      toast.error("Asl va yangi sanani tanlang");
      return;
    }
    if (newDate.getTime() <= originalDate.getTime()) {
      toast.error("Yangi sana asl sanadan keyin bo'lishi kerak");
      return;
    }
    // Both-or-nothing for time override
    if ((newStartTime && !newEndTime) || (!newStartTime && newEndTime)) {
      toast.error("Boshlanish va tugash vaqti birga kiritilishi kerak");
      return;
    }
    if (newStartTime && newEndTime && newEndTime <= newStartTime) {
      toast.error("Tugash vaqti boshlanishidan keyin bo'lishi kerak");
      return;
    }
    setSubmitting(true);
    // Only persist room/time as overrides when they actually differ from
    // the group's defaults — avoids cluttering the row with redundant data.
    const roomOverride =
      newRoomId && newRoomId !== group.room?.id ? newRoomId : undefined;
    const startOverride =
      newStartTime && newStartTime !== group.lessonStartTime
        ? newStartTime
        : undefined;
    const endOverride =
      newEndTime && newEndTime !== group.lessonEndTime ? newEndTime : undefined;
    // Time both-or-nothing applies after diffing: if start was changed
    // but end wasn't (or vice versa), send both so the validator can
    // reason about the window.
    const timeChanged = !!(startOverride || endOverride);
    try {
      await api.post("/lesson-reschedules", {
        groupId: group.id,
        originalDate: format(originalDate, "yyyy-MM-dd"),
        newDate: format(newDate, "yyyy-MM-dd"),
        newRoomId: roomOverride,
        newLessonStartTime: timeChanged ? newStartTime : undefined,
        newLessonEndTime: timeChanged ? newEndTime : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success("Dars boshqa kunga ko'chirildi");
      onSaved();
      onOpenChange(false);
      setOriginalDate(undefined);
      setNewDate(undefined);
      setNewRoomId(group.room?.id ?? "");
      setNewStartTime(group.lessonStartTime ?? "");
      setNewEndTime(group.lessonEndTime ?? "");
      setReason("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Ko'chirishda xatolik"));
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
          <DialogTitle>Darsni boshqa kunga ko&apos;chirish</DialogTitle>
          <DialogDescription>
            Bu kungi dars yangi sanaga o&apos;tkaziladi. Asl kunda davomat
            olingan bo&apos;lsa, to&apos;lov va oylik avtomatik qaytariladi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Sanalar — 2 ustun */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Asl dars sanasi</Label>
              <LessonDateSelect
                exactDays={group.exactDays ?? []}
                groupStartDate={group.startDate}
                groupEndDate={group.endDate}
                value={originalDate}
                onChange={setOriginalDate}
                disabled={submitting}
              />
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

          {/* Vaqtlar — 2 ustun, default group vaqti bilan */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Boshlanish</Label>
              <TimePicker
                value={newStartTime}
                onChange={setNewStartTime}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tugash</Label>
              <TimePicker
                value={newEndTime}
                onChange={setNewEndTime}
                disabled={submitting}
                minTime={newStartTime || undefined}
              />
            </div>
          </div>

          {/* Xona */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Xona</Label>
            <Select
              value={newRoomId}
              onValueChange={setNewRoomId}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Xonani tanlang" />
              </SelectTrigger>
              <SelectContent>
                {(roomsQuery.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            Ko&apos;chirish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
