"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Flag, Pencil, Phone } from "lucide-react";
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
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import api from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO",
  "Branch Director": "Direktor",
  Administrator: "Administrator",
  Teacher: "O'qituvchi",
  Cashier: "Kassir",
};

function formatPhone(phone: string): string {
  if (phone.length === 9) {
    return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7)}`;
  }
  return phone;
}

interface EmployeeProfileCardProps {
  employee: EmployeeUser;
  commentKey?: number;
}

export function EmployeeProfileCard({ employee, commentKey }: EmployeeProfileCardProps) {
  const { openDrawer } = useEditEmployee();
  const [latestComment, setLatestComment] = useState<{
    content: string;
    isTask?: boolean;
    author: { firstName: string; lastName: string };
    createdAt: string;
  } | null>(null);

  useEffect(() => {
    api.get("/comments/latest", {
      params: { entityType: "User", entityId: String(employee.id) },
    })
      .then(({ data }) => setLatestComment(data || null))
      .catch(() => {});
  }, [employee.id, commentKey]);

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const initials = `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="rounded-lg border bg-card flex flex-col gap-5 p-6">
      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AvatarWithPreview src={employee.photo} alt={fullName}>
          <Avatar className="size-20">
            <AvatarImage src={employee.photo ?? undefined} alt={fullName} />
            <AvatarFallback className="text-2xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>

        <div>
          <h2 className="text-xl font-bold">{fullName}</h2>
          <p className="text-sm text-muted-foreground">(id: {employee.id})</p>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {employee.roles.map((role) => (
            <Badge
              key={role.id}
              variant="secondary"
            >
              {ROLE_LABELS[role.name] || role.name}
            </Badge>
          ))}
          {employee.status !== "ACTIVE" && (
            <Badge variant="destructive">Nofaol</Badge>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2 text-sm">
        {employee.phone && (
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Telefon:</span>
            <a
              href={`tel:+998${employee.phone}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {formatPhone(employee.phone)}
            </a>
          </div>
        )}

        {employee.gender && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Jinsi:</span>
            <span>{employee.gender === "MALE" ? "Erkak" : "Ayol"}</span>
          </div>
        )}

        {employee.login && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Login:</span>
            <span className="font-medium">{employee.login}</span>
          </div>
        )}

        {employee.branches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Filiallar:</span>
            {employee.branches.map((b) => (
              <Badge key={b.id} variant="outline" className="text-xs">
                {b.name}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Qo&apos;shilgan:</span>
          <span>{format(new Date(employee.createdAt), "dd.MM.yyyy")}</span>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={() => openDrawer(employee)}
            >
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tahrirlash</TooltipContent>
        </Tooltip>
      </div>

      <Separator />

      {/* So'nggi izoh */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">So&apos;nggi izoh</span>
        </div>
        {latestComment ? (
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
            <p className="text-sm leading-relaxed line-clamp-3">{latestComment.content}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium">{latestComment.author.firstName} {latestComment.author.lastName}</span>
              <span>&middot;</span>
              <span>{format(new Date(latestComment.createdAt), "dd.MM.yyyy, HH:mm")}</span>
              {latestComment.isTask && (
                <>
                  <span>&middot;</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Topshiriq</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Izoh mavjud emas</p>
        )}
      </div>
    </div>
  );
}
