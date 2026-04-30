"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

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

const salaryTypeLabels: Record<string, string> = {
  PERCENTAGE: "Foiz (%)",
  FIXED_PER_STUDENT: "O'quvchi boshiga (so'm)",
  FIXED_MONTHLY: "Oylik (fixed so'm)",
};

const roleLabels: Record<number, string> = {
  1: "Direktor",
  2: "Filial direktori",
  3: "Administrator",
  4: "O'qituvchi",
  5: "Kassir",
};

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
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [salaryType, setSalaryType] = useState("FIXED_MONTHLY");
  const [value, setValue] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ["salary-config-employees"],
    queryFn: () =>
      api
        .get<{ data: Employee[]; total: number }>("/users", {
          params: { pageSize: 200 },
        })
        .then((r) => r.data.data),
    enabled: open,
  });

  const { data: existingConfigs, isLoading: loadingConfigs } = useQuery({
    queryKey: ["salary-config", selectedUserId],
    queryFn: () =>
      api
        .get<SalaryConfig[]>(`/salary/config/${selectedUserId}`)
        .then((r) => r.data),
    enabled: !!selectedUserId,
  });

  useEffect(() => {
    if (!open) {
      setSelectedUserId("");
      setSalaryType("FIXED_MONTHLY");
      setValue("");
      setEffectiveFrom(undefined);
    }
  }, [open]);

  useEffect(() => {
    if (existingConfigs?.length) {
      const defaultConfig = existingConfigs.find((c) => !c.groupId);
      if (defaultConfig) {
        setSalaryType(defaultConfig.salaryType);
        setValue(defaultConfig.value.toLocaleString("en-US"));
      }
    } else {
      setValue("");
    }
  }, [existingConfigs]);

  const rawValue = parseInt(value.replace(/\D/g, ""), 10) || 0;

  const handleValueChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits) {
      setValue(parseInt(digits, 10).toLocaleString("en-US"));
    } else {
      setValue("");
    }
  };

  const handleSubmit = async () => {
    if (!selectedUserId || rawValue < 1) return;
    setSubmitting(true);
    try {
      await api.post("/salary/config", {
        userId: parseInt(selectedUserId, 10),
        salaryType,
        value: rawValue,
        effectiveFrom: effectiveFrom
          ? format(effectiveFrom, "yyyy-MM-dd")
          : undefined,
      });
      toast.success("Oylik sozlamasi saqlandi");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEmployee = employees?.find(
    (e) => e.id === parseInt(selectedUserId, 10),
  );

  const isTeacher = selectedEmployee?.roles.some((r) => r.role.id === 4);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Oylik belgilash</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Xodim</Label>
            {loadingEmployees ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Xodimni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e) => {
                    const role =
                      roleLabels[
                        e.roles[0]?.role.id
                      ] ?? "—";
                    return (
                      <SelectItem key={e.id} value={String(e.id)}>
                        #{e.id} {e.firstName} {e.lastName}{" "}
                        <span className="text-muted-foreground">({role})</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedUserId && (
            <>
              {loadingConfigs ? (
                <Skeleton className="h-8 w-full" />
              ) : existingConfigs?.length ? (
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">
                    Joriy sozlama:
                  </p>
                  {existingConfigs.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Badge variant="secondary" className="text-xs">
                        {salaryTypeLabels[c.salaryType] ?? c.salaryType}
                      </Badge>
                      <span className="font-medium">
                        {c.salaryType === "PERCENTAGE"
                          ? `${c.value}%`
                          : `${c.value.toLocaleString("en-US")} so'm`}
                      </span>
                      {c.group && (
                        <span className="text-muted-foreground text-xs">
                          ({c.group.name})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Bu xodimga hali oylik belgilanmagan
                </p>
              )}

              <div className="space-y-2">
                <Label>Oylik turi</Label>
                <Select value={salaryType} onValueChange={setSalaryType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_MONTHLY">
                      Oylik (fixed so&apos;m)
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
              </div>

              <div className="space-y-2">
                <Label>
                  {salaryType === "PERCENTAGE"
                    ? "Foiz qiymati (%)"
                    : "Summa"}
                </Label>
                <div className="relative">
                  <Input
                    placeholder="0"
                    value={value}
                    onChange={(e) => handleValueChange(e.target.value)}
                    inputMode="numeric"
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {salaryType === "PERCENTAGE" ? "%" : "so'm"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Kuchga kirish sanasi{" "}
                  <span className="text-muted-foreground text-xs">
                    (ixtiyoriy — bugundan)
                  </span>
                </Label>
                <DatePicker
                  value={effectiveFrom}
                  onChange={setEffectiveFrom}
                  disabled={submitting}
                  placeholder="Bugundan boshlab"
                />
                <p className="text-xs text-muted-foreground">
                  Yangi qoida shu sana va undan keyingi darslarga
                  qo&apos;llanadi. Avvalgi darslar eski stavkada qoladi.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedUserId || rawValue < 1 || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
