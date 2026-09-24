"use client";

import { useId } from "react";
import { Check, Lock, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface RoleOption {
  id: number;
  label: string;
  icon: LucideIcon;
}

interface EmployeeRolePickerProps {
  /** Only the roles the caller may grant; the parent filters. */
  roles: readonly RoleOption[];
  selectedRoleIds: readonly number[];
  onToggle: (roleId: number) => void;
  error?: string;
}

/** "Tizim huquqi" as toggles, for an employee whose roles the caller may change. */
export function EmployeeRolePicker({
  roles,
  selectedRoleIds,
  onToggle,
  error,
}: EmployeeRolePickerProps) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2.5">
      <Label id={labelId}>Tizim huquqi</Label>
      <p className="text-xs text-muted-foreground">
        Rol berilmasa, xodim tizimga kira olmaydi — faqat ro'yxatda turadi
        va oylik oladi.
      </p>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
        {roles.map((role) => {
          const checked = selectedRoleIds.includes(role.id);
          const Icon = role.icon;
          return (
            <button
              key={role.id}
              type="button"
              aria-pressed={checked}
              onClick={() => onToggle(role.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                checked
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
                  : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-md",
                  checked ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {checked ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
              </div>
              <span className={cn(checked && "font-medium")}>{role.label}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * "Tizim huquqi" as a plain list, for an employee who holds a role outside the
 * caller's ceiling (a non-CEO's own record included). The backend refuses any
 * change to such a role set, so nothing here can be clicked: the form keeps
 * sending the set exactly as it came.
 */
export function EmployeeRolesReadOnly({ roles }: { roles: readonly RoleOption[] }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2.5">
      <Label id={labelId}>Tizim huquqi</Label>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" />
        Bu rollarni faqat sizdan yuqori rahbar o'zgartira oladi.
      </p>
      <ul aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <li key={role.id}>
              <Badge variant="secondary">
                <Icon data-icon="inline-start" />
                {role.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
