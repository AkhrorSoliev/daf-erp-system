"use client";

import { BookOpen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function PortalClient() {
  const user = useAuth((s) => s.user);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <BookOpen className="size-12 text-primary" />
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Xush kelibsiz, {user?.firstName}!
      </h1>
      <p className="text-muted-foreground text-center max-w-md">
        Talaba portaliga muvaffaqiyatli kirdingiz. Bu yerda tez orada dars
        jadvali, to&apos;lovlar va boshqa imkoniyatlar mavjud bo&apos;ladi.
      </p>
    </div>
  );
}
