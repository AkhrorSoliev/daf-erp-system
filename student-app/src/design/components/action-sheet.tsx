import { Modal, Pressable, View } from 'react-native';
import { Text } from './text';

export type ActionSheetOption = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

/** Bottom action sheet — tap an option or the backdrop to dismiss. */
export function ActionSheet({
  visible,
  onClose,
  options,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  options: ActionSheetOption[];
  title?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        {/* absorb taps so tapping the sheet body doesn't dismiss */}
        <Pressable className="gap-2 rounded-t-card bg-bg px-4 pb-8 pt-4" onPress={() => {}}>
          {title ? (
            <Text variant="muted" className="px-1 pb-1 text-center">
              {title}
            </Text>
          ) : null}
          {options.map((o) => (
            <Pressable
              key={o.label}
              onPress={() => {
                onClose();
                o.onPress();
              }}
              className="items-center rounded-button bg-surface py-3.5 active:opacity-80"
            >
              <Text variant="label" className={o.destructive ? 'text-danger' : undefined}>
                {o.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={onClose}
            className="items-center rounded-button border border-border py-3.5 active:opacity-80"
          >
            <Text variant="muted">Bekor qilish</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
