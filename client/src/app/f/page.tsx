import { Link2 } from "lucide-react";

// Landing page for `form.dafzentrum.uz/` (root) — explains that public
// forms are accessed only via a unique link the admin shares.
export default function FormIndexPage() {
  return (
    <div className="rounded-lg border bg-background p-8 text-center shadow-sm">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Link2 className="size-6 text-muted-foreground" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">Bevosita kirish mumkin emas</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bu sahifa faqat sizga yuborilgan maxsus havola orqali ochiladi. Iltimos,
        formaga kirish uchun siz qabul qilgan havolani bosing.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        DaF Sprachzentrum
      </p>
    </div>
  );
}
