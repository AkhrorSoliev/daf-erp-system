import { LoginForm } from "./login-form";
import { LoginFooter } from "./login-footer";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center px-4">
        <LoginForm />
      </main>
      <LoginFooter />
    </div>
  );
}
