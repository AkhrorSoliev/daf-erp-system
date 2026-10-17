"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Brush, Languages, LogOut, Monitor, Moon, Palette, Sun, User } from "lucide-react";
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
import { roleLabel } from "@/components/payments/salary-utils";
import { useAuth } from "@/hooks/use-auth";
import { useSignOut } from "@/hooks/use-sign-out";
import { useUiSkin } from "@/hooks/use-ui-skin";
import { useT, useLocale } from "@/i18n/context";
import { LOCALES, type UiLocale } from "@/i18n/locales";
import { msg } from "@/i18n/msg";
import { UI_SKINS, type UiSkinId } from "@/lib/ui-skins";

const THEMES = [
  { value: "light", label: msg("Yorug'"), Icon: Sun },
  { value: "dark", label: msg("Qorong'i"), Icon: Moon },
  { value: "system", label: msg("Tizim"), Icon: Monitor },
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
 * name is dropped below `lg` so a phone or tablet keeps only the picture and
 * the search box keeps its room. «Ko'rinish»
 * is where the colour mode lives now (the bar's standalone toggle is gone).
 */
export function HeaderUserMenu() {
  const user = useAuth((s) => s.user);
  const { theme, setTheme } = useTheme();
  // Inside the staff Mini App (ADR-0045) «Chiqish» waits at /tg for
  // «Qayta kirish» — a plain logout would be signed straight back in.
  const signOut = useSignOut();
  const { skin, setSkin } = useUiSkin();
  const t = useT();
  const { locale, setLocale } = useLocale();

  if (!user) return <Skeleton className="size-8 rounded-full" />;

  // The database role name is English; the screen shows the Uzbek title.
  const roleName = user.roles.length ? roleLabel(user.roles) : "";
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={fullName}
          className="flex items-center gap-2 rounded-md p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          <Avatar className="size-8 rounded-lg">
            {user.photo && <AvatarImage src={user.photo} alt={fullName} />}
            <AvatarFallback className="rounded-lg text-xs">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium lg:block">
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
            {t("Profil")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 size-4" />
            {t("Ko'rinish")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              {THEMES.map(({ value, label, Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon className="mr-2 size-4" />
                  {t(label)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Brush className="mr-2 size-4" />
            {t("Dizayn uslubi")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={skin}
              onValueChange={(value) => {
                if (value !== skin) void setSkin(value as UiSkinId);
              }}
            >
              {UI_SKINS.map(({ id, label, hint, swatch }) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  <span
                    aria-hidden
                    className="mr-2 size-3 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: swatch }}
                  />
                  <span>{label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t(hint)}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="mr-2 size-4" />
            {t("Til")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value) => {
                if (value !== locale) void setLocale(value as UiLocale);
              }}
            >
              {LOCALES.map(({ id, label }) => (
                // Each name is written in its own language: `lang` makes a
                // screen reader speak it with that voice (WCAG 3.1.2).
                <DropdownMenuRadioItem key={id} value={id} lang={id}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOut className="mr-2 size-4" />
          {t("Chiqish")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
