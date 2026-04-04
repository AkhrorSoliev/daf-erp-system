"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarUserFooter } from "@/components/sidebar-user-footer";
import { BranchSwitcher } from "@/components/branch-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { navItems } from "@/lib/nav-items";
import { useAuth } from "@/hooks/use-auth";

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const user = useAuth((s) => s.user);
  const userRoleIds = user?.roles.map((r) => r.id) ?? [];
  const filteredItems = navItems.filter((item) => {
    if (!item.visibleForRoles) return true;
    return item.visibleForRoles.some((id) => userRoleIds.includes(id));
  });

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        <Link href="/" className="flex items-center gap-1.5" onClick={handleNavClick}>
          <span className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
            DaF ERP System
          </span>
        </Link>
        {isMobile && (
          <>
            <Separator className="mt-2" />
            <div className="mt-2">
              <BranchSwitcher />
            </div>
          </>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Asosiy</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.url === "/" ? pathname === "/" : pathname.startsWith(item.url)}
                    tooltip={item.title}
                  >
                    <Link href={item.url} onClick={handleNavClick}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {isMobile && (
        <SidebarFooter className="px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mavzu</span>
            <ThemeToggle />
          </div>
          <Separator className="my-1" />
        </SidebarFooter>
      )}

      <SidebarUserFooter />
    </Sidebar>
  );
}
