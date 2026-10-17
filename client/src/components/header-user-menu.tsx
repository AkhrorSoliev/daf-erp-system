"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Palette, Sun, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useSignOut } from "@/hooks/use-sign-out";

const THEMES = [
  { value: "light", label: "Yorug'", Icon: Sun },
  { value: "dark", label: "Qorong'i", Icon: Moon },
  { value: "system", label: "Tizim", Icon: Monitor },
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * The signed-in user, at the right end of the top bar on every width. The
 * name is dropped below `md` so a phone keeps only the picture. «Ko'rinish»
 * is where the colour mode lives now (the bar's standalone toggle is gone).
 */
export function HeaderUserMenu() {
  const user = useAuth((s) => s.user);
  const { theme, setTheme } = useTheme();
  // Inside the staff Mini App (ADR-0045) «Chiqish» waits at /tg for
  // «Qayta kirish» — a plain logout would be signed straight back in.
  const signOut = useSignOut();

  if (!user) return <Skeleton className="size-8 rounded-full" />;

  const roleName = user.roles[0]?.name ?? "";
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Foydalanuvchi menyusi"
          className="flex items-center gap-2 rounded-md p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          <Avatar className="size-8 rounded-lg">
            {user.photo && <AvatarImage src={user.photo} alt={fullName} />}
            <AvatarFallback className="rounded-lg text-xs">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium md:block">
            {fullName}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{roleName}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User className="mr-2 size-4" />
            Profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 size-4" />
            Ko&apos;rinish
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              {THEMES.map(({ value, label, Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon className="mr-2 size-4" />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-2 size-4" />
          Chiqish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
