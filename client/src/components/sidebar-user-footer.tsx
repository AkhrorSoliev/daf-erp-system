"use client";

import { useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";

function getInitials(name: string) {
  const parts = name.split(" ");
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

export function SidebarUserFooter() {
  const { user, logout } = useAuth();
  const { isMobile } = useSidebar();
  const router = useRouter();

  if (!user) return null;

  const roleName = user.roles[0]?.name ?? "";

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent"
              >
                <Avatar className="size-8 shrink-0 rounded-lg">
                  {user.photo && (
                    <AvatarImage src={user.photo} alt={user.name} />
                  )}
                  <AvatarFallback className="rounded-lg text-xs">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {roleName}
                  </span>
                </div>
                <MoreHorizontal className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "bottom" : "right"}
              align="end"
              className="w-48"
            >
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <User className="mr-2 size-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={logout}>
                <LogOut className="mr-2 size-4" />
                Chiqish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
