"use client";

import { useEffect } from "react";
import { Building2, KeyRound, LogOut, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuthUser } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { formatPhone } from "@/lib/format-utils";
import { useT } from "@/i18n/context";

interface ProfileDetailsProps {
  user: AuthUser;
  onChangePassword: () => void;
  onLogoutOthers: () => void;
}

export function ProfileDetails({
  user,
  onChangePassword,
  onLogoutOthers,
}: ProfileDetailsProps) {
  const t = useT();
  const isCeo = user.roles.some((r) => r.name === "CEO");
  const { branches, fetchBranches } = useBranchSwitcher();

  useEffect(() => {
    if (isCeo) {
      fetchBranches();
    }
  }, [isCeo, fetchBranches]);

  // CEO barcha branchlarni ko'radi, boshqalar faqat o'z branchlarini
  const displayBranches = isCeo
    ? branches.map((b) => ({ id: b.id, name: b.name }))
    : user.branches;

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      <h3 className="text-lg font-semibold">{t("Ma'lumotlar")}</h3>

      <div className="space-y-4">
        {/* Telefon */}
        <div className="flex items-center gap-3">
          <Phone className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{t("Telefon")}</p>
            {user.phone ? (
              <a
                href={`tel:+998${user.phone}`}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {formatPhone(user.phone)}
              </a>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {t("Ko'rsatilmagan")}
              </p>
            )}
          </div>
        </div>

        {/* Kompaniya */}
        <div className="flex items-center gap-3">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{t("Kompaniya")}</p>
            <p className="text-sm font-medium">{user.company.name}</p>
          </div>
        </div>

        {/* Filiallar */}
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">{t("Filiallar")}</p>
            {displayBranches.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {displayBranches.map((b) => (
                  <Badge key={b.id} variant="outline">
                    {b.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {t("Filial biriktirilmagan")}
              </p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Parol va kirishlar */}
      <div className="flex flex-wrap gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onChangePassword}>
              <KeyRound className="mr-1.5 size-4" />
              {t("Parolni o'zgartirish")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Joriy parolni yangilash")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onLogoutOthers}>
              <LogOut className="mr-1.5 size-4" />
              {t("Boshqa qurilmalardan chiqish")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t("Boshqa qurilmalardagi kirishlarni tugatish")}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
