"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { currentUser } from "@/lib/mock-data";

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

export function SidebarUserFooter() {
  const { firstName, lastName, role, avatarUrl } = currentUser;

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Avatar className="size-8 shrink-0">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={`${firstName} ${lastName}`} />}
              <AvatarFallback className="text-xs">
                {getInitials(firstName, lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="grow flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium leading-tight">
                {firstName} {lastName}
              </span>
              <span className="truncate text-xs text-muted-foreground leading-tight">
                {role}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  className="shrink-0 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:hidden"
                >
                  <Settings className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Sozlamalar</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
