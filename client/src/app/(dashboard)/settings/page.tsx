"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";

export default function SettingsPage() {
  const isMobile = useIsMobile();
  const router = useRouter();

  useEffect(() => {
    // Desktopda courses ga redirect, mobileda menu ko'rinadi (LayoutShell ichida)
    if (isMobile === false) {
      router.replace("/settings/courses");
    }
  }, [isMobile, router]);

  return null;
}
