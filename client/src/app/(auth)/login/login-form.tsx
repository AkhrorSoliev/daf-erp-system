"use client";

import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          DaF Sprachzentrum
        </h1>
        <p className="text-sm text-muted-foreground">
          Hisobingizga kiring
        </p>
      </div>

      <form className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="login" className="text-sm font-medium">
            Login
          </label>
          <input
            id="login"
            type="text"
            autoComplete="username"
            required
            placeholder="Loginingizni kiriting"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Parol
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Parolingizni kiriting"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <LogIn className="size-4" />
          Kirish
        </button>
      </form>
    </div>
  );
}
