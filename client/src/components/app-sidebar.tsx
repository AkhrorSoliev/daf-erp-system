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
import { BranchSwitcher } from "@/components/branch-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { navItems, type NavItem, type NavItemChild } from "@/lib/nav-items";
import { useAuth } from "@/hooks/use-auth";

export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isIconCollapsed = state === "collapsed" && !isMobile;
  const user = useAuth((s) => s.user);
  const userRoleIds = user?.roles.map((r) => r.id) ?? [];

  const isVisible = (roles?: number[]) =>
    !roles || roles.some((id) => userRoleIds.includes(id));

  const filteredItems = navItems.filter((item) => isVisible(item.visibleForRoles));

  const isItemActive = (item: NavItem) =>
    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);

  const isChildActive = (child: NavItemChild) => pathname.startsWith(child.url);

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

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item)}
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
