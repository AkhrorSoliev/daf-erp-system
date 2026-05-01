"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";

interface SimpleEmployee {
  id: number;
  firstName: string;
  lastName: string;
  branches: { id: number; name: string }[];
  roles: { id: number; name: string }[];
}

interface SalaryConfig {
  id: string;
  salaryType: string;
  value: number;
  isActive: boolean;
  groupId: string | null;
  group: { id: string; name: string } | null;
}

interface GroupOption {
  id: string;
  name: string;
}

const TEACHER_ROLE_ID = 4;

const SALARY_TYPE_LABEL: Record<string, string> = {
  PERCENTAGE: "Foiz (%)",
  FIXED_PER_STUDENT: "O'quvchi boshiga (so'm)",
  FIXED_MONTHLY: "Oylik (qattiq summa)",
};

const ROLE_LABELS: Record<string, string> = {
  CEO: "Direktor",
  "Branch Director": "Filial direktori",
  Administrator: "Administrator",
  Teacher: "O'qituvchi",
  Cashier: "Kassir",
};

interface Props {
  userId: number | null;
  employee: SimpleEmployee | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Right-side Sheet for editing one employee's salary configs. Lists every
 * active config (umumiy + per-group) with delete buttons, and exposes a
 * form to add a new rule. Mirrors the dropped Dialog but lives in a
 * dedicated panel so the parent page keeps its filter context.
 */
export function SalaryConfigRowSheet({ userId, employee, onClose, onSaved }: Props) {
  const open = !!userId && !!employee;
  const isTeacher =
    employee?.roles.some((r) => r?.id === TEACHER_ROLE_ID) ?? false;

  // Form state (resets when the row changes)
  const [groupId, setGroupId] = useState<string>("__global__");
  const [salaryType, setSalaryType] = useState("FIXED_MONTHLY");
  const [value, setValue] = useState<string>("");
  const [percentValue, setPercentValue] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGroupId("__global__");
      setSalaryType(isTeacher ? "PERCENTAGE" : "FIXED_MONTHLY");
      setValue("");
      setPercentValue("");
      setEffectiveFrom(undefined);
    }
  }, [open, userId, isTeacher]);

  const configsQuery = useQuery({
    queryKey: ["salary-config", userId],
    queryFn: () =>
      api.get<SalaryConfig[]>(`/salary/config/${userId}`).then((r) => r.data),
    enabled: open,
  });

  const groupsQuery = useQuery<GroupOption[]>({
    queryKey: ["teacher-groups", userId],
    queryFn: () =>
      api
        .get<GroupOption[] | { data: GroupOption[] }>(`/teachers/${userId}/groups`)
        .then((r) => {
          const d: unknown = r.data;
          if (Array.isArray(d)) return d as GroupOption[];
          if (d && typeof d === "object" && "data" in d) {
            return (d as { data: GroupOption[] }).data;
          }
          return [];
        }),
    enabled: open && isTeacher,
  });

  const sortedConfigs = useMemo(() => {
    const list = (configsQuery.data ?? []).filter((c) => c.isActive);
    return list.sort((a, b) => {
      if (!a.groupId && b.groupId) return -1;
      if (a.groupId && !b.groupId) return 1;
      return (a.group?.name ?? "").localeCompare(b.group?.name ?? "");
    });
  }, [configsQuery.data]);

  const numericValue = useMemo(() => {
    if (salaryType === "PERCENTAGE") {
      const n = parseFloat(percentValue);
      return Number.isFinite(n) ? n : 0;
    }
    return parseInt(value.replace(/\D/g, ""), 10) || 0;
  }, [salaryType, value, percentValue]);

  const canSubmit =
    !!userId &&
    numericValue > 0 &&
    (salaryType !== "PERCENTAGE" || numericValue <= 100);

  const handleSubmit = async () => {
    if (!canSubmit || !userId) return;
    setSubmitting(true);
    try {
      await api.post("/salary/config", {
        userId,
        salaryType,
        value: numericValue,
        groupId: groupId === "__global__" ? null : groupId,
        effectiveFrom: effectiveFrom
          ? format(effectiveFrom, "yyyy-MM-dd")
          : undefined,
      });
      toast.success("Oylik qoidasi saqlandi");
      setValue("");
      setPercentValue("");
      setEffectiveFrom(undefined);
      setGroupId("__global__");
      await configsQuery.refetch();
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (configId: string) => {
    if (
      !confirm(
        "Bu oylik qoidasini o'chirmoqchimisiz? Eski yig'ilgan oyliklar saqlanadi, lekin keyingi darslarga ta'sir qilmaydi.",
      )
    ) {
      return;
    }
    setDeletingId(configId);
    try {
      await api.patch(`/salary/config/${configId}`, { isActive: false });
      toast.success("Oylik qoidasi o'chirildi");
      await configsQuery.refetch();
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeletingId(null);
    }
  };

  const role = employee
    ? ROLE_LABELS[employee.roles[0]?.name ?? ""] ?? "—"
    : "";
  const branch = employee?.branches[0]?.name ?? "—";

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!submitting && !v) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="sm:max-w-xl flex flex-col overflow-hidden p-0"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">
            {employee ? `${employee.firstName} ${employee.lastName}` : "Oylik"}
          </SheetTitle>
          <SheetDescription>
            #{employee?.id} · {role} · {branch}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Mavjud qoidalar */}
          <section className="space-y-3 px-6 py-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Mavjud oylik qoidalari
              </h3>
              {sortedConfigs.length > 0 && (
                <Badge variant="outline" className="text-xs font-normal">
                  {sortedConfigs.length} ta
                </Badge>
              )}
            </div>
            {configsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : sortedConfigs.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Bu xodimga hali oylik belgilanmagan
              </div>
            ) : (
              <ul className="space-y-2">
                {sortedConfigs.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={c.groupId ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {c.groupId ? `${c.group?.name ?? "?"} guruh` : "Umumiy"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {SALARY_TYPE_LABEL[c.salaryType] ?? c.salaryType}
                        </Badge>
                      </div>
                      <p className="text-base font-semibold">
                        {c.salaryType === "PERCENTAGE"
                          ? `${c.value}%`
                          : `${formatPrice(c.value)} so'm`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeactivate(c.id)}
                      disabled={deletingId === c.id}
                      className="text-destructive hover:text-destructive shrink-0"
                    >
                      {deletingId === c.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Yangi qoida */}
          <section className="space-y-4 border-t px-6 py-5 bg-muted/20">
            <div className="flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Yangi qoida qo&apos;shish
              </h3>
            </div>

            {isTeacher && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Qo&apos;llaniladigan guruh
                </Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__global__">
                      Umumiy (barcha guruhlar uchun)
                    </SelectItem>
                    {(groupsQuery.data ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} guruhi uchun maxsus
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {groupId !== "__global__" && (
                  <p className="text-xs text-muted-foreground">
                    Maxsus qoida shu guruhdagi darslarga qo&apos;llanadi va
                    umumiy qoidani bekor qiladi (faqat shu guruh uchun).
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hisoblash turi</Label>
              <Select value={salaryType} onValueChange={setSalaryType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED_MONTHLY">
                    Oylik (qattiq summa)
                  </SelectItem>
                  {isTeacher && (
                    <>
                      <SelectItem value="PERCENTAGE">Foiz (%)</SelectItem>
                      <SelectItem value="FIXED_PER_STUDENT">
                        O&apos;quvchi boshiga (so&apos;m)
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {salaryType === "PERCENTAGE"
                  ? "Har dars uchun dars narxidan foiz hisoblanadi."
                  : salaryType === "FIXED_PER_STUDENT"
                    ? "Har o'quvchidan kurs bo'yicha qattiq summa (12/20 darsga taqsimlanadi)."
                    : "Oyiga qattiq summa, darslar soniga bog'liq emas."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {salaryType === "PERCENTAGE" ? "Foiz qiymati" : "Summa"}
              </Label>
              {salaryType === "PERCENTAGE" ? (
                <div className="relative">
                  <Input
                    placeholder="0"
                    value={percentValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setPercentValue(v);
                    }}
                    inputMode="decimal"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              ) : (
                <PriceInput
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Masalan 4 000 000"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Kuchga kirish sanasi (ixtiyoriy)
              </Label>
              <DatePicker
                value={effectiveFrom}
                onChange={setEffectiveFrom}
                disabled={submitting}
                placeholder="Bugundan boshlab"
              />
            </div>
          </section>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Yopish
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              Qoidani qo&apos;shish
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
