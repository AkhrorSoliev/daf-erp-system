"use client";

import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { ThemeProvider } from "@/components/providers/theme-provider";

type Props = ComponentProps<typeof ThemeProvider> & { children: ReactNode };

// Wraps the app theme provider and forces the light theme on the public form
// routes (`/f/*`). The form is a light-only, brand-consistent surface — it must
// never inherit a visitor's device/system dark mode. Everywhere else the theme
// behaves normally (system / stored preference).
export function RouteThemeProvider({ children, ...props }: Props) {
  const pathname = usePathname();
  const isPublicForm = pathname === "/f" || (pathname?.startsWith("/f/") ?? false);
  const forcedTheme = isPublicForm ? "light" : props.forcedTheme;

  return (
    <ThemeProvider {...props} forcedTheme={forcedTheme}>
      {children}
    </ThemeProvider>
  );
}
