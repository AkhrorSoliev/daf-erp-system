"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AuthUser } from "@/hooks/use-auth";

// How long the greeting stays before the cabinet opens. The session already
// exists by then; this only delays the navigation.
const GREETING_MS = 2000;
const GREETING_REDUCED_MOTION_MS = 700;

type Greeted = Pick<AuthUser, "firstName" | "photo">;

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
 * page used to navigate after `setAuth`; it navigates once the greeting has
 * played. `replace` keeps the sign-in page out of the history, as the
 * Telegram pages always did.
 */
export function useGreeting(navigation: "push" | "replace") {
  const router = useRouter();
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
    greet: (user: Greeted, destination: string) =>
      setGreeting({ user, destination }),
  };
}
