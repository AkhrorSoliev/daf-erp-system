"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRolePermissions, useSaveRolePermissions } from "@/hooks/use-role-permissions";
import type { PermissionKey } from "@/lib/permission-keys";
import { PermissionConfirmDialog } from "./permission-confirm-dialog";
import { confirmCopy, planCellToggle, type ConfirmPlan } from "./permissions-model";
import { PermissionsTable } from "./permissions-table";

/**
 * «Ruxsatlar» (spec §8, ADR-0086): the CEO turns each capability on or off per
 * staff role. CEO-only by identity: the settings entry is `ceoOnly` and the API
 * is `@CeoOnly()`. A toggle only opens the confirmation; the switch moves when
 * the server's answer comes back.
 */
export function PermissionsClient() {
  const { data: overview, isError, isFetching, refetch } = useRolePermissions();
  const save = useSaveRolePermissions();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [plan, setPlan] = useState<ConfirmPlan | null>(null);

  if (!overview) {
    return (
      <div>
        <Header />
        {isError ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            <p>Ruxsatlarni yuklab bo'lmadi.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Qayta urinish
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (overview.roles.length === 0) {
    return (
      <div>
        <Header />
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Sozlanadigan rol topilmadi.
        </p>
      </div>
    );
  }

  const allRoleIds: number[] = overview.roles.map((r) => r.id);
  const picked = Number(searchParams.get("rol"));
  const phoneRole = allRoleIds.includes(picked) ? picked : allRoleIds[0];
  const busy = save.isPending || isFetching;

  // The phone's role picker is a view switch, so it lives in the URL (?rol=); the first role is the default and is omitted.
  const pickRole = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (Number(value) === allRoleIds[0]) params.delete("rol");
    else params.set("rol", value);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const confirm = () => {
    // A refused plan has no confirm button; this guard keeps it from ever being sent.
    if (!plan || plan.refusal) return;
    save.mutate(
      { roleId: plan.roleId, changes: plan.changes },
      {
        onSuccess: () => {
          toast.success("Ruxsat saqlandi");
          setPlan(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <Header />
      <Legend />
      {isMobile && (
        <Select value={String(phoneRole)} onValueChange={pickRole}>
          <SelectTrigger className="w-full" aria-label="Rol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {overview.roles.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <PermissionsTable
        overview={overview}
        roleIds={isMobile ? [phoneRole] : allRoleIds}
        busy={busy}
        onToggle={(roleId: number, key: PermissionKey, on: boolean) =>
          setPlan(planCellToggle(overview, roleId, key, on))
        }
      />
      <PermissionConfirmDialog
        copy={plan ? confirmCopy(overview, plan) : null}
        refusal={plan?.refusal ?? null}
        open={plan !== null}
        pending={save.isPending}
        onConfirm={confirm}
        onOpenChange={(open) => {
          if (!open) setPlan(null);
        }}
      />
    </div>
  );
}

function Header() {
  return (
    <SettingsPageHeader
      title="Ruxsatlar"
      description="O'zgarish xodimning keyingi bosishida kuchga kiradi."
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-yellow-500" />
        boshlang'ich holatdan farq qiladi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-red-500" />
        pulni o'zgartiradi yoki qaytarib bo'lmaydi
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="size-3" />
        bu rolga berib bo'lmaydi — sababini ko'rish uchun bosing
      </span>
    </div>
  );
}
