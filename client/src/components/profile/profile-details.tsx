"use client";

import { useEffect } from "react";
import { Building2, KeyRound, MapPin, Phone } from "lucide-react";
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

interface ProfileDetailsProps {
  user: AuthUser;
  onChangePassword: () => void;
}

export function ProfileDetails({ user, onChangePassword }: ProfileDetailsProps) {
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
      <h3 className="text-lg font-semibold">Ma&apos;lumotlar</h3>

      <div className="space-y-4">
        {/* Telefon */}
        <div className="flex items-center gap-3">
          <Phone className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Telefon</p>
            {user.phone ? (
              <a
                href={`tel:+998${user.phone}`}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {formatPhone(user.phone)}
              </a>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Ko&apos;rsatilmagan
              </p>
            )}
          </div>
        </div>

        {/* Kompaniya */}
        <div className="flex items-center gap-3">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Kompaniya</p>
            <p className="text-sm font-medium">{user.company.name}</p>
          </div>
        </div>

        {/* Filiallar */}
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Filiallar</p>
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
                Filial biriktirilmagan
              </p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Parol o'zgartirish */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={onChangePassword}>
            <KeyRound className="mr-1.5 size-4" />
            Parolni o&apos;zgartirish
          </Button>
        </TooltipTrigger>
        <TooltipContent>Joriy parolni yangilash</TooltipContent>
      </Tooltip>
    </div>
  );
}
