import { FileX2 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="rounded-lg border bg-background p-8 text-center shadow-sm">
      <FileX2 className="mx-auto size-10 text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">Forma topilmadi</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bu havola eskirgan yoki forma o&apos;chirilgan bo&apos;lishi mumkin.
      </p>
    </div>
  );
}
