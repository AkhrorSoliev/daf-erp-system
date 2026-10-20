"use client";

import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuthUser } from "@/hooks/use-auth";
import { SalaryDueCard } from "@/components/shared/salary-due-card";
import { useT } from "@/i18n/context";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface ProfileCardProps {
  user: AuthUser;
  /** Roles with their names already in the page language. */
  roles: Array<{ id: number; name: string }>;
  /** false → no «To'lanishi kerak» block (the person has no salary). */
  showSalary: boolean;
  onEdit: () => void;
}

export function ProfileCard({ user, roles, showSalary, onEdit }: ProfileCardProps) {
  const t = useT();
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AvatarWithPreview src={user.photo} alt={fullName}>
          <Avatar className="size-20">
            {user.photo && <AvatarImage src={user.photo} alt={fullName} />}
            <AvatarFallback className="text-2xl font-semibold">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>

        <div>
          <h2 className="text-xl font-bold">{fullName}</h2>
          <p className="text-sm text-muted-foreground">(id: {user.id})</p>
        </div>

        {/* Rollar */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {roles.map((role) => (
            <Badge key={role.id} variant="secondary">
              {role.name}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      {showSalary && (
        <>
          {/* To'lanishi kerak — joriy oy uchun */}
          <SalaryDueCard userId={user.id} scope="me" />
          <Separator />
        </>
      )}

      {/* Tahrirlash tugmasi */}
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 size-4" />
              {t("Tahrirlash")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Profil ma'lumotlarini tahrirlash")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
