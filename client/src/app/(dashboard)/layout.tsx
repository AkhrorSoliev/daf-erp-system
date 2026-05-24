import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";

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
        <main className="min-w-0 flex-1 p-3 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
