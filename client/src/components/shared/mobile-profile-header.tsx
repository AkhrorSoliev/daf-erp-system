"use client";

import { MoreVertical, Phone, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhone, formatBalance } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { SalaryDueCard } from "@/components/shared/salary-due-card";

interface ProfileAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

interface InfoItem {
  label: string;
  value: string;
}

interface MobileProfileHeaderProps {
  photo: string | null | undefined;
  fullName: string;
  id: number;
  roles: Array<{ id: number; name: string }>;
  roleVariant?: "green" | "secondary";
  isActive?: boolean;
  /** Student prepaid balance banner. Staff use `salaryDueUserId` instead. */
  balance?: number;
  /**
   * Show this employee's "To'lanishi kerak" for the current month instead of a
   * raw balance. With `salaryDueScope="admin"` (default) pass only for callers
   * allowed to see money (CEO / BD); `"me"` is the user's own profile.
   */
  salaryDueUserId?: number;
  salaryDueScope?: "admin" | "me";
  phone?: string | null;
  branches?: Array<{ id: number; name: string }>;
  infoItems?: InfoItem[];
  actions?: ProfileAction[];
  /** true bo'lsa actionlar ochiq button sifatida ko'rinadi, false bo'lsa dropdown ichida */
  showActionsInline?: boolean;
  latestComment?: {
    content: string;
    author: string;
    date: string;
    isTask?: boolean;
  } | null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function MobileProfileHeader({
  photo,
  fullName,
  id,
  roles,
  roleVariant = "secondary",
  isActive = true,
  balance,
  salaryDueUserId,
  salaryDueScope = "admin",
  phone,
  branches,
  infoItems,
  actions,
  showActionsInline = false,
  latestComment,
}: MobileProfileHeaderProps) {
  const hasDetails = phone || (infoItems && infoItems.length > 0) || (branches && branches.length > 0);

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Row: Avatar + Identity + Actions */}
      <div className="flex items-center gap-3">
        <AvatarWithPreview src={photo} alt={fullName}>
          <Avatar className="size-14 shrink-0">
            {photo && <AvatarImage src={photo} alt={fullName} />}
            <AvatarFallback className="text-lg font-semibold">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{fullName}</h2>
          <p className="text-xs text-muted-foreground">(id: {id})</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {roles.map((role) => (
              <Badge
                key={role.id}
                variant={roleVariant === "secondary" ? "secondary" : undefined}
                className={cn(
                  "text-[11px] px-1.5 py-0",
                  roleVariant === "green" &&
                    "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                )}
              >
                {role.name}
              </Badge>
            ))}
            {!isActive && (
              <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
                Nofaol
              </Badge>
            )}
          </div>
        </div>

        {actions && actions.length > 0 && !showActionsInline && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 shrink-0">
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onClick={action.onClick}
                  className={cn(
                    action.variant === "destructive" &&
                      "text-destructive focus:text-destructive"
                  )}
                >
                  {action.icon}
                  <span className="ml-2">{action.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Inline action buttons */}
      {actions && actions.length > 0 && showActionsInline && (
        <div className="mt-3 flex items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant === "destructive" ? "destructive" : "outline"}
              size="sm"
              className="flex-1"
              onClick={action.onClick}
            >
              {action.icon}
              <span className="ml-1.5">{action.label}</span>
            </Button>
          ))}
        </div>
      )}

      {/* Salary due banner (staff) */}
      {salaryDueUserId !== undefined && (
        <div className="mt-3 rounded-md bg-muted/40 px-3 py-2">
          <SalaryDueCard userId={salaryDueUserId} scope={salaryDueScope} />
        </div>
      )}

      {/* Balance banner (student prepaid) */}
      {balance !== undefined && (
        <div
          className={cn(
            "mt-3 rounded-md px-3 py-2 text-center text-sm font-bold",
            balance >= 0
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          )}
        >
          {formatBalance(balance)}
        </div>
      )}

      {/* Latest comment preview (employee) */}
      {latestComment && (
        <div className="mt-3 rounded-md bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">So&apos;nggi izoh</p>
          <p className="text-sm line-clamp-2">{latestComment.content}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <span className="font-medium">{latestComment.author}</span>
            <span>&middot;</span>
            <span>{latestComment.date}</span>
            {latestComment.isTask && (
              <>
                <span>&middot;</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">Topshiriq</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Collapsible details */}
      {hasDetails && (
        <Collapsible>
          <CollapsibleTrigger className="mt-3 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
            <span>Batafsil ma&apos;lumotlar</span>
            <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2 px-2 text-sm">
              {phone && (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                  <a
                    href={`tel:+998${phone}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {formatPhone(phone)}
                  </a>
                </div>
              )}

              {infoItems?.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-muted-foreground">{item.label}:</span>
                  <span>{item.value}</span>
                </div>
              ))}

              {branches && branches.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground">Filiallar:</span>
                  {branches.map((b) => (
                    <Badge key={b.id} variant="outline" className="text-xs">
                      {b.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
