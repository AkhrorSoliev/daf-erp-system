import { Image, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

/** Round avatar — photo if present, otherwise coral initials. */
export function Avatar({
  uri,
  initials,
  size = 96,
  className,
}: {
  uri?: string | null;
  initials?: string;
  size?: number;
  className?: string;
}) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} className={className} />;
  }
  return (
    <View
      className={cn('items-center justify-center bg-coral-500', className)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="font-displayx text-white" style={{ fontSize: Math.round(size * 0.38) }}>
        {initials || '?'}
      </Text>
    </View>
  );
}
