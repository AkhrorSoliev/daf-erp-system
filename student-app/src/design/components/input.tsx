import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { tokens } from '@/design/tokens';

export function Input({ className, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={tokens.color.fgFaint}
      className={cn(
        'h-[54px] rounded-md border border-line bg-white px-4 font-body text-[16px] text-ink-900',
        className,
      )}
      {...props}
    />
  );
}
