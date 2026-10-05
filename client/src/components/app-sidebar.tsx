"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SidebarUserFooter } from "@/components/sidebar-user-footer";
import { NavItemBadge } from "@/components/nav-item-badge";
import { BranchSwitcher } from "@/components/branch-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { isNavChildActive, navItems, type NavItem, type NavItemChild } from "@/lib/nav-items";
import { useAuth } from "@/hooks/use-auth";
import { usePendingTaskCount } from "@/hooks/use-pending-task-count";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isIconCollapsed = state === "collapsed" && !isMobile;
  const user = useAuth((s) => s.user);
  const userRoleIds = user?.roles.map((r) => r.id) ?? [];
  const pendingTasks = usePendingTaskCount();

  const isVisible = (roles?: number[]) =>
    !roles || roles.some((id) => userRoleIds.includes(id));

  const filteredItems = navItems.filter((item) => isVisible(item.visibleForRoles));

  const isItemActive = (item: NavItem) =>
    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);

  const isChildActive = (child: NavItemChild) => isNavChildActive(pathname, child);

  const activeParentUrl = filteredItems.find(
    (item) => item.children && item.children.length > 0 && isItemActive(item),
  )?.url ?? null;

  const [openGroupUrl, setOpenGroupUrl] = useState<string | null>(activeParentUrl);

  useEffect(() => {
    if (activeParentUrl) setOpenGroupUrl(activeParentUrl);
  }, [activeParentUrl]);

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
              {filteredItems.map((item) => {
                const visibleChildren = item.children?.filter((c) =>
                  isVisible(c.visibleForRoles)
                );

                if (visibleChildren && visibleChildren.length > 0) {
                  const parentActive = isItemActive(item);

                  if (isIconCollapsed) {
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={parentActive}
                          tooltip={item.title}
                        >
                          <Link
                            href={item.url}
                            onClick={handleNavClick}
                            title={item.title}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  const isOpen = openGroupUrl === item.url;
                  return (
                    <Collapsible
                      key={item.url}
                      asChild
                      open={isOpen}
                      onOpenChange={(next) =>
                        setOpenGroupUrl(next ? item.url : null)
                      }
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={parentActive}
                            tooltip={item.title}
                            title={item.title}
                          >
                            <item.icon />
                            <span className="flex-1 min-w-0 truncate">{item.title}</span>
                            <ChevronRight className="ml-auto shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {visibleChildren.map((child) => {
                              const grandChildren = child.children?.filter((gc) =>
                                isVisible(gc.visibleForRoles)
                              );

                              if (grandChildren && grandChildren.length > 0) {
                                const childActive = isChildActive(child);
                                return (
                                  <SidebarMenuSubItem key={child.url}>
                                    <Collapsible
                                      defaultOpen={childActive}
                                      className="group/sub-collapsible"
                                    >
                                      <CollapsibleTrigger asChild>
                                        <SidebarMenuSubButton
                                          asChild
                                          isActive={childActive}
                                        >
                                          <button type="button" title={child.title}>
                                            <child.icon />
                                            <span className="flex-1 min-w-0 truncate">{child.title}</span>
                                            <ChevronRight className="ml-auto shrink-0 transition-transform duration-200 group-data-[state=open]/sub-collapsible:rotate-90" />
                                          </button>
                                        </SidebarMenuSubButton>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <SidebarMenuSub>
                                          {grandChildren.map((gc) => (
                                            <SidebarMenuSubItem key={gc.url}>
                                              <SidebarMenuSubButton
                                                asChild
                                                isActive={isChildActive(gc)}
                                              >
                                                <Link
                                                  href={gc.url}
                                                  onClick={handleNavClick}
                                                  title={gc.title}
                                                >
                                                  <gc.icon />
                                                  <span>{gc.title}</span>
                                                </Link>
                                              </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                          ))}
                                        </SidebarMenuSub>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </SidebarMenuSubItem>
                                );
                              }

                              return (
                                <SidebarMenuSubItem key={child.url}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isChildActive(child)}
                                  >
                                    <Link
                                      href={child.url}
                                      onClick={handleNavClick}
                                      title={child.title}
                                    >
                                      <child.icon />
                                      <span>{child.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                // Tasks waiting in «Kutilmoqda» mark the row: red tint, a soft
                // wave and the count (in the corner when the sidebar is icons).
                const news = item.url === "/tasks" ? pendingTasks : 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item)}
                      tooltip={item.title}
                      className={cn(news > 0 && "sidebar-news")}
                    >
                      <Link
                        href={item.url}
                        onClick={handleNavClick}
                        title={item.title}
                      >
                        <item.icon className={cn(news > 0 && "text-red-500")} />
                        <span className="flex-1 min-w-0 truncate">{item.title}</span>
                        {news > 0 && (
                          <span
                            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:min-w-3.5 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:text-[9px]"
                          >
                            {news > 9 ? "9+" : news}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                    {item.badgeKey && <NavItemBadge badgeKey={item.badgeKey} />}
                  </SidebarMenuItem>
                );
              })}
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
