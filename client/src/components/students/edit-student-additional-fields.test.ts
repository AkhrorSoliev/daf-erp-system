import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditStudentAdditionalFields } from "./edit-student-additional-fields";
import type { EditStudentFormValues } from "@/lib/schemas/student-schema";

function Harness({ values }: { values: Partial<EditStudentFormValues> }) {
  const form = useForm<EditStudentFormValues>({
    defaultValues: {
      firstName: "Ali",
      lastName: "Valiyev",
      phone: "901234567",
      extraPhone: "",
      parentPhone: "",
      parentName: "",
      placeOfStudy: "",
      address: "",
      passportSeries: "",
      ...values,
    },
  });
  return createElement(
    TooltipProvider,
    null,
    createElement(EditStudentAdditionalFields, { form }),
  );
}

const text = (values: Partial<EditStudentFormValues>) =>
  renderToStaticMarkup(createElement(Harness, { values }))
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// ADR-0067: the backup number is a sign-in key, so the editor must SHOW the
// one the card already has — the panel used to open with every section hidden.
describe("student edit — additional fields", () => {
  it("opens the backup-number section when the card has one, with the sign-in hint", () => {
    const t = text({ extraPhone: "935554433" });
    expect(t).toContain("Zaxira raqam");
    expect(t).toContain("O'quvchi bu raqam bilan ham tizimga kira oladi");
  });

  it("opens the parent section when the card has a parent phone", () => {
    expect(text({ parentPhone: "901112233" })).toContain("Ota-ona telefoni");
  });

  it("keeps every section closed on an empty card", () => {
    const t = text({});
    expect(t).not.toContain("Ota-ona telefoni");
    expect(t).not.toContain("O'quvchi bu raqam bilan ham tizimga kira oladi");
  });
});
