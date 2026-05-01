"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X, UserCog } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface RegularTeacher {
  id: number;
  firstName: string;
  lastName: string;
}

interface OverrideRow {
  id: string;
  date: string;
  teacherIds: number[];
  reason: string | null;
  createdAt: string;
  setBy: { id: number; firstName: string; lastName: string };
}

interface TeacherOption {
  id: number;
  firstName: string;
  lastName: string;
}

interface Props {
  groupId: string;
  date: string; // YYYY-MM-DD
  regularTeachers: RegularTeacher[];
  /** Visible only to CEO / BD / Admin (parent gates this prop). */
  enabled: boolean;
}

const TEACHER_ROLE_ID = 4;

/**
 * "Bu darsni kim o'tdi?" — per-(groupId, date) substitute roster editor.
 * Default: group.teachers. Saving a non-default list calls
 * PUT /lesson-teacher-overrides/:groupId/:date which atomically reverses
 * existing accruals and re-creates them for the chosen teachers.
 */
export function LessonSubstituteCard({
  groupId,
  date,
  regularTeachers,
  enabled,
}: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [pickerValue, setPickerValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Existing override for this lesson (if any)
  const overrideQuery = useQuery({
    queryKey: ["lesson-teacher-override", groupId, date],
    queryFn: () =>
      api
        .get<OverrideRow[]>(
          `/lesson-teacher-overrides?groupId=${groupId}&from=${date}&to=${date}`,
        )
        .then((r) => r.data),
    enabled,
  });

  const existing = overrideQuery.data?.[0];

  // All employees with Teacher role — for the "+ Ustoz qo'shish" picker
  const teachersQuery = useQuery({
    queryKey: ["all-teachers"],
    queryFn: () =>
      api
        .get<{ data: { id: number; firstName: string; lastName: string; roles: { id: number }[] }[] }>(
          "/users?pageSize=100&user_type=Teacher",
        )
        .then((r) => r.data.data),
    enabled,
  });

  const allTeachers: TeacherOption[] = useMemo(() => {
    return (teachersQuery.data ?? []).filter((u) =>
      u.roles.some((r) => r.id === TEACHER_ROLE_ID),
    );
  }, [teachersQuery.data]);

  // Initialize from existing override or fall back to regular teachers
  useEffect(() => {
    if (!enabled) return;
    if (existing) {
      setSelected(existing.teacherIds);
      setReason(existing.reason ?? "");
    } else {
      setSelected(regularTeachers.map((t) => t.id));
      setReason("");
    }
  }, [existing, regularTeachers, enabled]);

  if (!enabled) return null;

  const defaultIds = regularTeachers.map((t) => t.id).sort((a, b) => a - b);
  const currentSorted = [...selected].sort((a, b) => a - b);
  const isDefault =
    defaultIds.length === currentSorted.length &&
    defaultIds.every((id, i) => id === currentSorted[i]);

  const teachersById = new Map<number, { firstName: string; lastName: string }>();
  for (const t of regularTeachers) teachersById.set(t.id, t);
  for (const t of allTeachers) teachersById.set(t.id, t);

  const teacherLabel = (id: number) => {
    const t = teachersById.get(id);
    return t ? `${t.firstName} ${t.lastName}` : `#${id}`;
  };

  const addTeacher = (teacherId: number) => {
    if (!selected.includes(teacherId)) {
      setSelected([...selected, teacherId]);
    }
    setPickerValue("");
  };

  const removeTeacher = (teacherId: number) => {
    setSelected(selected.filter((id) => id !== teacherId));
  };

  const resetToDefault = () => {
    setSelected(regularTeachers.map((t) => t.id));
    setReason("");
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      toast.error("Kamida 1 ta ustoz bo'lishi kerak");
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/lesson-teacher-overrides/${groupId}/${date}`, {
        teacherIds: selected,
        reason: reason.trim() || undefined,
      });
      toast.success("Dars ustozlari saqlandi");
      await overrideQuery.refetch();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!confirm("O'rinbosar qoidasini bekor qilib, oddiy guruh ustozlariga qaytarmoqchimisiz?")) {
      return;
    }
    setSubmitting(true);
    try {
      await api.delete(`/lesson-teacher-overrides/${existing.id}`);
      toast.success("O'rinbosar bekor qilindi");
      await overrideQuery.refetch();
      resetToDefault();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const candidateTeachers = allTeachers.filter((t) => !selected.includes(t.id));

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <UserCog className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Bu darsni kim o&apos;tdi?</span>
        {existing && (
          <Badge variant="default" className="ml-auto text-xs">
            O&apos;rinbosar belgilangan
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => (
          <Badge
            key={id}
            variant="secondary"
            className="gap-1.5 pr-1 text-xs"
          >
            {teacherLabel(id)}
            <button
              type="button"
              onClick={() => removeTeacher(id)}
              className="hover:bg-destructive/20 rounded p-0.5"
              aria-label={`${teacherLabel(id)}'ni olib tashlash`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        {candidateTeachers.length > 0 && (
          <Select
            value={pickerValue}
            onValueChange={(v) => addTeacher(parseInt(v, 10))}
          >
            <SelectTrigger className="h-7 text-xs w-auto gap-1 border-dashed">
              <Plus className="size-3" />
              <SelectValue placeholder="Ustoz qo'shish" />
            </SelectTrigger>
            <SelectContent>
              {candidateTeachers.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.firstName} {t.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!isDefault && (
        <Input
          placeholder="Sabab (ixtiyoriy): masalan 'Botir kasal'"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          className="h-8 text-xs"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isDefault
            ? "Default: guruhning standart ustozlari"
            : `Default'dan farq qiladi (asl: ${defaultIds.length} ustoz)`}
        </p>
        <div className="flex gap-2">
          {existing && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={submitting || isDefault}
          >
            {submitting && <Loader2 className="size-3 animate-spin mr-1" />}
            Saqlash
          </Button>
        </div>
      </div>
    </div>
  );
}
