"use client";

import { Send } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function LoginFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>
          &copy; {currentYear} DaF Sprachzentrum. Barcha huquqlar himoyalangan.
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="https://t.me/akhror_soliev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Send className="size-3.5" />
              Yordam
            </a>
          </TooltipTrigger>
          <TooltipContent>Telegram orqali yordam olish</TooltipContent>
        </Tooltip>
      </div>
    </footer>
  );
}
