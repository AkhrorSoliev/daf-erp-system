"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { StudentBottomNav } from "./student-bottom-nav";
import { StudentSidebar } from "./student-sidebar";
import { StudentMobileHeader } from "./student-mobile-header";
import { Loader2 } from "lucide-react";

export function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const router = useRouter();

  const isStudent = user?.roles?.some((r) => r.id === 6) ?? false;

  useEffect(() => {
    if (user && !isStudent) {
      router.replace("/");
    }
  }, [user, isStudent, router]);

  if (!user) {
    return (
      <div className="portal-theme flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isStudent) {
    return null;
  }

  return (
    <div className="portal-theme flex min-h-screen bg-background text-foreground antialiased">
      <StudentSidebar />
      <div className="flex flex-1 min-w-0 flex-col">
        <StudentMobileHeader />
        <main className="flex-1 pb-24 md:pb-0">{children}</main>
        <StudentBottomNav />
      </div>
    </div>
  );
}
