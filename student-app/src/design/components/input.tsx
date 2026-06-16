import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { tokens } from '@/design/tokens';

export function Input({ className, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={tokens.color.fgMuted}
      className={cn('h-12 rounded-button border border-border bg-bg px-4 text-base text-fg', className)}
      {...props}
    />
  );
}
