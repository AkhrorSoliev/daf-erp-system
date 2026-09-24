"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface ExamBranchFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Imtihon qaysi filialda o'tadi — majburiy. Ilgari forma filial so'ramasdi:
 * imtihon (va uning mock daromadi) jimgina tepadagi filial tanlagichidagi
 * filialga yozilar, "Barcha filiallar" tanlanganda esa server rad etardi.
 */
export function ExamBranchField({
  value,
  onChange,
  disabled,
}: ExamBranchFieldProps) {
  const branches = useBranchSwitcher((s) => s.branches);
  return (
    <div className="space-y-1.5">
      <Label>
        Filial <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Filialni tanlang" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={String(branch.id)}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
