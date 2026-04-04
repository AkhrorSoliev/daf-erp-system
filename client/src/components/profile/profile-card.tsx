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
import { formatBalance } from "@/lib/format-utils";

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
  onEdit: () => void;
}

export function ProfileCard({ user, onEdit }: ProfileCardProps) {
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
          {user.roles.map((role) => (
            <Badge key={role.id} variant="secondary">
              {role.name}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      {/* Balans */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Balans</p>
        <p
          className={`text-lg font-semibold ${
            user.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {formatBalance(user.balance)}
        </p>
      </div>

      <Separator />

      {/* Tahrirlash tugmasi */}
      <div className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 size-4" />
              Tahrirlash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Profil ma&apos;lumotlarini tahrirlash</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
