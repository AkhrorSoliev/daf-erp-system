"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LogOut, Sun, Moon, Monitor, ChevronRight } from "lucide-react";

const themeIcon = { light: Sun, dark: Moon, system: Monitor } as const;
const themeLabel = { light: "Yorug'", dark: "Qorong'i", system: "Tizim" } as const;
const themeOrder = ["light", "dark", "system"] as const;

export function StudentPortalFooter() {
  const router = useRouter();
  const logout = useAuth((s) => s.logout);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function cycleTheme() {
    const current = theme ?? "system";
    const next =
      themeOrder[
        (themeOrder.indexOf(current as (typeof themeOrder)[number]) + 1) %
          themeOrder.length
      ];
    setTheme(next);
  }

  const current = (theme ?? "system") as keyof typeof themeIcon;
  const Icon = mounted ? themeIcon[current] ?? Monitor : Monitor;
  const label = mounted ? themeLabel[current] ?? "Tizim" : "Tizim";

  return (
    <div className="space-y-2 pt-4">
      <button
        onClick={cycleTheme}
        className="w-full flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent transition-colors text-left"
      >
        <Icon className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm flex-1">Mavzu</span>
        <span className="text-xs text-muted-foreground">{label}</span>
        <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
      </button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button className="w-full flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-destructive/5 transition-colors text-left">
            <LogOut className="size-4 text-destructive shrink-0" />
            <span className="text-sm text-destructive">Chiqish</span>
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hisobdan chiqish</AlertDialogTitle>
            <AlertDialogDescription>
              Haqiqatan ham hisobingizdan chiqmoqchimisiz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Chiqish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
