"use client";

import { Bell, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { BranchSwitcher } from "@/components/branch-switcher";
import { AppBreadcrumb } from "@/components/app-breadcrumb";

export function DashboardHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="flex h-14 items-center gap-4 px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />

        <BranchSwitcher />

        <div className="relative grow">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Qidirish..." className="pl-9 max-w-sm" />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Bell className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Bildirishnomalar</TooltipContent>
        </Tooltip>

        <ThemeToggle />
      </div>

      <div className="px-4 pb-2">
        <AppBreadcrumb />
      </div>
    </header>
  );
}
