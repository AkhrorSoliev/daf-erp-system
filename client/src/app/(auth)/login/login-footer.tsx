"use client";

import Link from "next/link";
import { Send } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { COMPANY, copyrightLine } from "@/lib/company";
import { StoreBadges } from "@/components/auth/store-badges";

interface LoginFooterProps {
  /**
   * Show the Google Play / App Store badges. Student portal only — the mobile
   * app is the student app, and there is no admin or teacher app to install, so
   * on those logins the badges would be an invitation to nothing.
   */
  showAppLinks?: boolean;
}

// Every portal's login footer. The copyright line names the legal entity, not
// the portal — the portal is already named in the heading above the form, and a
// copyright notice is the one line on the page that has to be legally exact.
export function LoginFooter({ showAppLinks = false }: LoginFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    // The badges share the footer's single row rather than opening one of their
    // own — a second row doubled the strip's height for something that is not
    // the point of a login page. Text left, badges anchored right.
    <footer className="border-t px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:gap-6">
        <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
          <p className="text-balance">{copyrightLine(currentYear)}</p>
          <span aria-hidden="true" className="hidden opacity-40 sm:inline">
            ·
          </span>
          <nav className="flex items-center gap-3">
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Maxfiylik siyosati
          </Link>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={COMPANY.supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <Send className="size-3.5" />
                Yordam
              </a>
            </TooltipTrigger>
            <TooltipContent>Telegram orqali yordam olish</TooltipContent>
          </Tooltip>
          </nav>
        </div>

        {showAppLinks ? <StoreBadges /> : null}
      </div>
    </footer>
  );
}
