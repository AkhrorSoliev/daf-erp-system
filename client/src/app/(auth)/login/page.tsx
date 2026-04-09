import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { LoginFooter } from "./login-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPortalType } from "@/lib/portal";

export default async function LoginPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const portal = getPortalType(host);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center px-4">
        <LoginForm portal={portal} />
      </main>
      <LoginFooter portal={portal} />
    </div>
  );
}
