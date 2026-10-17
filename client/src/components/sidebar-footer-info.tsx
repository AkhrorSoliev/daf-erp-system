"use client";

import { LifeBuoy } from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { currentBuildInfo, formatBuildInfo } from "@/lib/build-info";
import { COMPANY } from "@/lib/company";

/**
 * Bottom of the admin sidebar. «Texnik yordam» is the support chat (the same
 * link as the login footer) — named so it is not mistaken for the header's
 * «Shu sahifa bo'yicha qo'llanma» button. The build line says when the running
 * site was last published; it disappears on the icon-only sidebar.
 */
export function SidebarFooterInfo() {
  const build = currentBuildInfo();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Texnik yordam">
            <a href={COMPANY.supportHref} target="_blank" rel="noopener noreferrer">
              <LifeBuoy />
              <span>Texnik yordam</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {build && (
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {formatBuildInfo(build)}
        </p>
      )}
    </SidebarFooter>
  );
}
