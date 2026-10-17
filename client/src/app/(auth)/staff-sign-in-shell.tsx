import { ThemeToggle } from "@/components/theme-toggle";
import { SignInCover } from "@/components/auth/sign-in-cover";
import { type PortalType, getPortalConfig } from "@/lib/portal";
import { LoginFooter } from "./login/login-footer";

interface StaffSignInShellProps {
  portal: PortalType;
  children: React.ReactNode;
}

/**
 * Shell of the staff sign-in pages (`/login`, the Telegram callback and the
 * staff Mini App entry on `admin.` and `lehrer.`). It draws on the staff
 * portals' own theme — the same tokens, font and logo as the cabinet behind
 * it — so it has no theme of its own; only the cover is special. The two
 * portals differ by the heading alone, as the cabinets do.
 */
export function StaffSignInShell({ portal, children }: StaffSignInShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SignInCover />
      <div className="flex flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-end px-4">
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center px-5 pt-2 pb-10 sm:px-8">
          <div className="w-full max-w-sm">
            <h1 className="mb-8 text-2xl font-semibold tracking-tight">
              {getPortalConfig(portal).title}
            </h1>
            {children}
          </div>
        </main>
        <LoginFooter />
      </div>
    </div>
  );
}
