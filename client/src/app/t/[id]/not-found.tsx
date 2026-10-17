import { XCircle } from "lucide-react";

export default function CertificateNotFound() {
  return (
    <div className="rounded-lg border bg-background p-6 text-center shadow-sm">
      <XCircle className="mx-auto mb-3 size-8 text-red-600" />
      <p className="font-semibold">Hujjat topilmadi</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Havola noto&apos;g&apos;ri yoki hujjat bizning tizimda berilmagan.
      </p>
    </div>
  );
}
