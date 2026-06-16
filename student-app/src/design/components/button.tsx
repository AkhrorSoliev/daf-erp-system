import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import { cn } from '@/lib/cn';
import { tokens } from '@/design/tokens';
import { Text } from './text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const base = 'flex-row items-center justify-center rounded-button active:opacity-90';

const container: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-surface border border-border',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};

const label: Record<ButtonVariant, string> = {
  primary: 'text-primary-fg',
  secondary: 'text-fg',
  ghost: 'text-fg',
  danger: 'text-primary-fg',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3',
  md: 'h-11 px-4',
  lg: 'h-14 px-5',
};

export function Button({
  label: text,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...props
}: Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={cn(base, container[variant], sizes[size], isDisabled && 'opacity-50', className)}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? tokens.color.fg : tokens.color.primaryFg} />
      ) : (
        <Text variant="label" className={cn('text-base', label[variant])}>
          {text}
        </Text>
      )}
    </Pressable>
  );
}
