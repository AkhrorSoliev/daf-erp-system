"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  roles: { role: { id: number; name: string } }[];
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

const salaryTypeLabels: Record<string, string> = {
  PERCENTAGE: "Foiz (%)",
  FIXED_PER_STUDENT: "O'quvchi boshiga (so'm)",
  FIXED_MONTHLY: "Oylik (qattiq summa)",
};

const roleLabels: Record<number, string> = {
  1: "Direktor",
  2: "Filial direktori",
  3: "Administrator",
  4: "O'qituvchi",
  5: "Kassir",
};

const TEACHER_ROLE_ID = 4;

interface SalaryConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SalaryConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: SalaryConfigDialogProps) {
  // ─── selection ─────────────────────────────────────────────
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  // ─── new-config form ───────────────────────────────────────
  const [groupId, setGroupId] = useState<string>("__global__");
  const [salaryType, setSalaryType] = useState("FIXED_MONTHLY");
  const [value, setValue] = useState<string>("");
  const [percentValue, setPercentValue] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── data ──────────────────────────────────────────────────
  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ["salary-config-employees"],
    queryFn: () =>
      api
        .get<{ data: Employee[]; total: number }>("/users", {
          params: { pageSize: 100 },
        })
        .then((r) => r.data.data),
    enabled: open,
  });

  const {
    data: existingConfigs,
    isLoading: loadingConfigs,
    refetch: refetchConfigs,
  } = useQuery({
    queryKey: ["salary-config", selectedUserId],
    queryFn: () =>
      api
        .get<SalaryConfig[]>(`/salary/config/${selectedUserId}`)
        .then((r) => r.data),
    enabled: !!selectedUserId,
  });

  const selectedEmployee = useMemo(
    () => employees?.find((e) => e.id === parseInt(selectedUserId, 10)),
    [employees, selectedUserId],
  );
  const isTeacher =
    selectedEmployee?.roles.some((r) => r.role.id === TEACHER_ROLE_ID) ?? false;

  // Teacher's groups — for per-group config dropdown
  const { data: teacherGroups } = useQuery<GroupOption[]>({
    queryKey: ["teacher-groups", selectedUserId],
    queryFn: () =>
      api
        .get<{ data: GroupOption[] }>(`/teachers/${selectedUserId}/groups`)
        .then((r) => r.data?.data ?? r.data ?? []),
    enabled: !!selectedUserId && isTeacher,
  });

  // ─── lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setEmployeeQuery("");
      setSelectedUserId("");
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    // Reset the form whenever the user switches employees
    resetForm();
    if (!isTeacher) setSalaryType("FIXED_MONTHLY");
  }, [selectedUserId, isTeacher]);

  function resetForm() {
    setGroupId("__global__");
    setSalaryType("FIXED_MONTHLY");
    setValue("");
    setPercentValue("");
    setEffectiveFrom(undefined);
  }

  // Filter employees by search query
  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return (
        fullName.includes(q) ||
        String(e.id).includes(q) ||
        e.roles.some((r) =>
          (roleLabels[r.role.id] ?? "").toLowerCase().includes(q),
        )
      );
    });
  }, [employees, employeeQuery]);

  // Sort configs: global first, then per-group alphabetically
  const sortedConfigs = useMemo(() => {
    if (!existingConfigs) return [];
    return [...existingConfigs]
      .filter((c) => c.isActive)
      .sort((a, b) => {
        if (!a.groupId && b.groupId) return -1;
        if (a.groupId && !b.groupId) return 1;
        return (a.group?.name ?? "").localeCompare(b.group?.name ?? "");
      });
  }, [existingConfigs]);

  const numericValue = useMemo(() => {
    if (salaryType === "PERCENTAGE") {
      const n = parseFloat(percentValue);
      return Number.isFinite(n) ? n : 0;
    }
    return parseInt(value.replace(/\D/g, ""), 10) || 0;
  }, [salaryType, value, percentValue]);

  const canSubmit =
    !!selectedUserId &&
    numericValue > 0 &&
    (salaryType !== "PERCENTAGE" || numericValue <= 100);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.post("/salary/config", {
        userId: parseInt(selectedUserId, 10),
        salaryType,
        value: numericValue,
        groupId: groupId === "__global__" ? null : groupId,
        effectiveFrom: effectiveFrom
          ? format(effectiveFrom, "yyyy-MM-dd")
          : undefined,
      });
      toast.success("Oylik qoidasi saqlandi");
      resetForm();
      await refetchConfigs();
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (configId: string) => {
    if (!confirm("Bu oylik qoidasini o'chirmoqchimisiz? Eski yig'ilgan oyliklar saqlanadi, lekin keyingi darslarga ta'sir qilmaydi.")) {
      return;
    }
    setDeletingId(configId);
    try {
      await api.patch(`/salary/config/${configId}`, { isActive: false });
      toast.success("Oylik qoidasi o'chirildi");
      await refetchConfigs();
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setDeletingId(null);
    }
  };

  // ─── render ────────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Oylik belgilash</DialogTitle>
          <DialogDescription>
            Xodim tanlang, mavjud oylik qoidalarini ko&apos;ring va kerak
            bo&apos;lsa yangi qoida qo&apos;shing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ─── 1. EMPLOYEE PICKER ─────────────────────────── */}
          <section className="space-y-2">
            <Label>Xodim</Label>
            {loadingEmployees ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="relative" ref={pickerRef}>
                <Input
                  placeholder="Ism, ID yoki rol bo'yicha qidiruv..."
                  value={employeeQuery}
                  onChange={(e) => {
                    setEmployeeQuery(e.target.value);
                    setPickerOpen(true);
                    if (selectedUserId) setSelectedUserId("");
                  }}
                  onFocus={() => setPickerOpen(true)}
                />
                {pickerOpen && (
                  <div className="absolute top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto z-50">
                    {filteredEmployees.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Hech qaysi xodim topilmadi
                      </div>
                    ) : (
                      filteredEmployees.map((e) => {
                        const role = roleLabels[e.roles[0]?.role.id] ?? "—";
                        const isSelected = String(e.id) === selectedUserId;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => {
                              setSelectedUserId(String(e.id));
                              setEmployeeQuery(`#${e.id} ${e.firstName} ${e.lastName}`);
                              setPickerOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${isSelected ? "bg-accent" : ""}`}
                          >
                            {isSelected ? (
                              <Check className="size-4 text-primary shrink-0" />
                            ) : (
                              <span className="size-4 shrink-0" />
                            )}
                            <span className="flex-1 truncate">
                              #{e.id} {e.firstName} {e.lastName}{" "}
                              <span className="text-muted-foreground">({role})</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ─── 2. EXISTING CONFIGS ────────────────────────── */}
          {selectedUserId && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mavjud oylik qoidalari</Label>
                {sortedConfigs.length > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {sortedConfigs.length} ta
                  </Badge>
                )}
              </div>
              {loadingConfigs ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : sortedConfigs.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Bu xodimga hali oylik belgilanmagan. Pastdagi formadan birinchi
                  qoidani qo&apos;shing.
                </div>
              ) : (
                <ul className="space-y-2">
                  {sortedConfigs.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={c.groupId ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {c.groupId
                              ? `${c.group?.name ?? "?"} guruh`
                              : "Umumiy"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {salaryTypeLabels[c.salaryType] ?? c.salaryType}
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
          )}

          {/* ─── 3. NEW CONFIG FORM ──────────────────────────── */}
          {selectedUserId && (
            <section className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Plus className="size-4 text-muted-foreground" />
                <Label className="text-base">Yangi qoida qo&apos;shish</Label>
              </div>

              {/* Group scope (teacher only — others are always global) */}
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
                      {(teacherGroups ?? []).map((g) => (
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
                <p className="text-xs text-muted-foreground">
                  Bu sanadan boshlangan darslar yangi qoida bo&apos;yicha
                  hisoblanadi. Avvalgi davrlar avvalgi qoida bo&apos;yicha qoladi.
                </p>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full"
              >
                {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
                Qoidani qo&apos;shish
              </Button>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
