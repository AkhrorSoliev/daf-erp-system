"use client";

import { FileText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SearchItem } from "@/hooks/use-global-search";
import { formatPhone, getInitials } from "./search-dropdown-utils";

export function ResultCategory({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

export function PageResultItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 ${
        isActive ? "bg-accent" : "hover:bg-accent"
      }`}
      onClick={onClick}
    >
      <FileText className="size-4 text-muted-foreground shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function EntityResultItem({
  item,
  showAvatar,
  showId,
  isStudent,
  isActive,
  onClick,
}: {
  item: SearchItem;
  showAvatar: boolean;
  showId: boolean;
  isStudent?: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const phone = formatPhone(item.phone);

  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-3 ${
        isActive ? "bg-accent" : "hover:bg-accent"
      }`}
      onClick={onClick}
    >
      {showAvatar && (
        <Avatar className="size-7 shrink-0">
          <AvatarImage src={item.photo ?? undefined} alt={item.label} />
          <AvatarFallback className="text-[10px]">
            {getInitials(item.label)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.label}</span>
          {showId && (
            <span className="text-xs text-muted-foreground shrink-0">
              ID: {item.id}
            </span>
          )}
          {isStudent && item.status && (
            <StatusBadge
              entityType="students"
              status={item.status}
              className="shrink-0 text-[10px] px-1.5 py-0"
            />
          )}
        </div>
        {(phone || item.sublabel) && (
          <div className="text-xs text-muted-foreground truncate">
            {phone || item.sublabel}
          </div>
        )}
        {isStudent && (
          <div className="text-xs truncate flex items-center gap-1">
            {item.groupName ? (
              <span className="text-muted-foreground">
                Guruh: {item.groupName}
              </span>
            ) : (
              <span className="text-orange-500">Guruhsiz</span>
            )}
            {item.teacherName && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground">
                  Ustoz: {item.teacherName}
                </span>
              </>
            )}
            <span className="text-muted-foreground/50">·</span>
            {item.balance != null && item.balance < 0 ? (
              <span className="text-destructive font-medium">
                {item.balance.toLocaleString("en-US")} so&#39;m
              </span>
            ) : (
              <span className="text-emerald-500 font-medium">
                Balans: {(item.balance ?? 0).toLocaleString("en-US")} so&#39;m
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
