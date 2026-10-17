"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AuthUser } from "@/hooks/use-auth";
import { useLocale } from "@/i18n/context";
import { adoptAccountLocale } from "@/i18n/sign-in-locale";

// How long the greeting stays before the cabinet opens. The session already
// exists by then; this only delays the navigation.
const GREETING_MS = 2000;
const GREETING_REDUCED_MOTION_MS = 700;

type Greeted = Pick<AuthUser, "firstName" | "photo" | "uiLocale">;

/**
 * The staff greeting after a sign-in, in place of the form on the sign-in
 * page: the employee's photo (their initial when there is none) and their
 * name. Every way a staff member signs in shows it — the password form,
 * «Telegram orqali kirish» and the Telegram Mini App. Motion is the
 * `.sign-in-greet-*` classes in globals.css.
 */
export function Greeting({ user }: { user: Greeted }) {
  return (
    <div role="status" className="flex flex-col items-start gap-4">
      <Avatar className="sign-in-greet-photo size-20 border-2 border-primary after:hidden">
        {user.photo ? <AvatarImage src={user.photo} alt="" /> : null}
        <AvatarFallback className="bg-background text-2xl font-semibold text-primary">
          {user.firstName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="w-full">
        <p className="sign-in-greet-fade text-sm text-muted-foreground [animation-delay:0.3s]">
          Xush kelibsiz,
        </p>
        <p className="sign-in-greet-name truncate text-3xl font-semibold tracking-tight text-primary">
          {user.firstName}
        </p>
      </div>
      <p className="sign-in-greet-fade text-sm text-muted-foreground [animation-delay:1.1s]">
        Kabinet ochilmoqda…
      </p>
    </div>
  );
}

/**
 * Who is being greeted, and `greet(user, destination)` — call it where the
 * page used to navigate after `setAuth`; it first switches the page to the
 * account's language (ADR-0106), then navigates once the greeting has played.
 * `replace` keeps the sign-in page out of the history, as the Telegram pages
 * always did.
 */
export function useGreeting(navigation: "push" | "replace") {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  // The page's language when `greet` runs: the closure `greet` was made in can
  // be older, because a sign-in answers after a network round trip.
  const pageLocale = useRef(locale);
  useEffect(() => {
    pageLocale.current = locale;
  }, [locale]);
  const [greeting, setGreeting] = useState<{
    user: Greeted;
    destination: string;
  } | null>(null);

  useEffect(() => {
    if (!greeting) return;
    router.prefetch(greeting.destination);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => router[navigation](greeting.destination),
      reduced ? GREETING_REDUCED_MOTION_MS : GREETING_MS,
    );
    return () => window.clearTimeout(timer);
  }, [greeting, navigation, router]);

  return {
    greeted: greeting?.user ?? null,
    // The account's language wins over the one picked on the sign-in page
    // (ADR-0106): switch first, so the greeting and the cabinet that follows
    // open in it. A failed switch never holds the greeting back.
    greet: async (user: Greeted, destination: string) => {
      await adoptAccountLocale(user.uiLocale, { current: pageLocale.current, setLocale });
      setGreeting({ user, destination });
    },
  };
}
