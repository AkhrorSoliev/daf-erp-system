import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="relative mb-6">
          <span className="text-[10rem] font-bold leading-none tracking-tighter text-primary/10 select-none sm:text-[14rem]">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-primary/10 p-5">
              <Search className="size-10 text-primary" />
            </div>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Sahifa topilmadi
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          Siz qidirayotgan sahifa mavjud emas, o&apos;chirilgan yoki manzil
          noto&apos;g&apos;ri kiritilgan bo&apos;lishi mumkin.
        </p>

        <Button asChild size="lg">
          <Link href="/">
            <ArrowLeft data-icon="inline-start" />
            Bosh sahifaga qaytish
          </Link>
        </Button>
      </main>
    </div>
  );
}
