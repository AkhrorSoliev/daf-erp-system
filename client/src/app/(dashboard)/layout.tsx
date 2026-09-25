import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { BranchScopedMain } from "@/components/providers/branch-scoped-main";
import { SpotlightHost } from "@/components/spotlight/spotlight-host";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <DashboardHeader />
        {/* `<main>` lives in a client component so it can be re-keyed on a
            branch switch — that is what makes the ~47 pages fetching outside
            React Query reload. The header stays outside it, so the switcher is
            not unmounted by its own selection. */}
        <BranchScopedMain>{children}</BranchScopedMain>
        {/* The tour starts only after a page change — so it lives outside
            `<main>`: it does not remount on a branch switch, and its own
            store clears itself via `registerBranchScopedStore`. */}
        <SpotlightHost />
      </SidebarInset>
    </SidebarProvider>
  );
}
