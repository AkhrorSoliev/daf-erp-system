import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { useColors } from '@/design/colors';

export function Input({ className, ...props }: TextInputProps) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.fgFaint}
      className={cn(
        'h-[54px] rounded-md border border-border bg-surface px-4 font-body text-[16px] text-fg',
        className,
      )}
      {...props}
    />
  );
}
