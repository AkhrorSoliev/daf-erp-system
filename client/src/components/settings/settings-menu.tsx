"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getVisibleSettingsSections } from "@/lib/settings-nav";
import { useAuth } from "@/hooks/use-auth";

export function SettingsMenu() {
  const user = useAuth((s) => s.user);

  // On a hard reload the user is read from a cookie inside a useEffect, so it
  // is not there yet on the first render. Rendering now would show only the
  // items open to everyone and then jump as the rest appear.
  if (!user) return null;

  const sections = getVisibleSettingsSections(user.roles.map((r) => r.id));

  return (
    <div className="max-w-3xl space-y-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {section.title}
          </h2>
          <div className="divide-y rounded-lg border bg-card">
            {section.items.map((item) => (
              <Link
                key={item.url}
                href={item.url}
                className="flex items-center gap-3 px-4 py-3 outline-none transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <item.icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">{item.description}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
